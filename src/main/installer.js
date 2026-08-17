'use strict';

const { existsSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const {
  downloadFile,
  extractZip,
  runNpm,
  runCapture,
  resolveDshInstall,
  findNodeExe,
  findDshPrefixesInPath,
} = require('./util');
const { probeNode, probeDshPrefix, readNpmrcPrefixes } = require('./detector');

const DSH_PACKAGE = '@deepseek-ai/dsh';
const DSH_VERSION = 'latest';
const NODE_VERSION = '24.19.0';
const NPMMIRROR = 'https://registry.npmmirror.com';

/** 当前安装任务是否被取消。 */
let cancelled = false;

function cancelInstall() {
  cancelled = true;
}

/**
 * 确保自管运行时可用：缺 Node 就下载便携版 Node，缺 dsh 就 npm 安装。
 * @param {{runtimeDir: string, nodeDir: string, nodePath: string, prefix: string}} managedDirs
 * @param {object} detection detectAll 的结果
 * @param {(payload: object) => void} report 进度回报（转发到渲染层）
 */
async function ensureHarness(managedDirs, detection, report) {
  cancelled = false;
  report({ type: 'log', message: '开始检查运行环境…' });

  // 1. 选一个能跑 npm 的 node（系统可用则用系统，否则自管；都没有则下载便携版）。
  let nodePath = null;
  let npmCliPath = null;
  const usableNode = detection && detection.node && !detection.node.tooOld && detection.node.npm.installed
    ? detection.node
    : null;

  if (usableNode) {
    nodePath = usableNode.path;
    npmCliPath = usableNode.npm.cliPath;
    report({ type: 'log', message: `使用现有 Node.js ${usableNode.version}（${nodePath}）` });
  } else if (detection && detection.systemNode.installed && !detection.systemNode.tooOld && detection.systemNode.npm.installed) {
    nodePath = detection.systemNode.path;
    npmCliPath = detection.systemNode.npm.cliPath;
    report({ type: 'log', message: `使用系统 Node.js ${detection.systemNode.version}` });
  } else {
    report({ type: 'log', message: '未找到可用的 Node.js，开始下载便携版 Node.js…' });
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const fileName = `node-v${NODE_VERSION}-win-${arch}.zip`;
    const url = `${NPMMIRROR}/-/binary/node/v${NODE_VERSION}/${fileName}`;
    const zipPath = path.join(managedDirs.runtimeDir, fileName);
    mkdirSync(managedDirs.runtimeDir, { recursive: true });
    await downloadFile(url, zipPath, (p) => {
      report({ type: 'progress', stage: 'node', ...p });
    });
    report({ type: 'log', message: `下载完成（${fileName}），正在解压…` });
    await extractZip(zipPath, managedDirs.nodeDir);
    rmSync(zipPath, { force: true });
    const extractedNode = findNodeExe(managedDirs.nodeDir) || path.join(managedDirs.nodeDir, 'node.exe');
    const probe = await probeNode(extractedNode);
    if (!probe.installed || probe.tooOld || !probe.npm.installed) {
      throw new Error(`便携版 Node.js 不可用：${probe.version || probe.path}`);
    }
    nodePath = probe.path;
    npmCliPath = probe.npm.cliPath;
    report({ type: 'log', message: `便携版 Node.js ${probe.version} 就绪` });
  }

  // 2. 优先复用系统全局已有的 dsh；没有再看自管 prefix；再没有才 npm install。
  let dsh = null;
  const globalCandidates = [];
  const addCandidate = (prefix) => {
    if (prefix && !globalCandidates.includes(prefix)) globalCandidates.push(prefix);
  };
  const prefixCapture = await runCapture(nodePath, [npmCliPath, 'prefix', '-g'], { timeout: 60000 });
  if (prefixCapture.code === 0) addCandidate(prefixCapture.stdout.trim());
  for (const prefix of findDshPrefixesInPath()) addCandidate(prefix);
  for (const prefix of readNpmrcPrefixes()) addCandidate(prefix);
  addCandidate(path.join(process.env.APPDATA || '', 'npm'));

  for (const prefix of globalCandidates) {
    const globalDsh = probeDshPrefix(prefix);
    if (globalDsh && globalDsh.frontendDistOk) {
      dsh = { ...globalDsh, source: 'global', nodePath };
      report({ type: 'log', message: `复用全局安装的 DeepSeek Harness ${globalDsh.version || ''}` });
      break;
    }
  }

  if (!dsh) {
    const existing = resolveDshInstall(managedDirs.prefix);
    dsh = existing.installed ? probeDshPrefix(managedDirs.prefix) : null;
  }

  if (!dsh || !dsh.frontendDistOk) {
    report({ type: 'log', message: `正在安装 ${DSH_PACKAGE}（通过 npmmirror），首次安装需要几分钟…` });
    mkdirSync(managedDirs.prefix, { recursive: true });
    const prefixPkg = path.join(managedDirs.prefix, 'package.json');
    if (!existsSync(prefixPkg)) {
      writeFileSync(prefixPkg, JSON.stringify({ name: 'deepseek-harness-runtime', private: true, version: '0.0.0' }, null, 2));
    }
    let installError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await runNpmInstall(nodePath, npmCliPath, managedDirs.prefix, report);
        installError = null;
        break;
      } catch (error) {
        installError = error;
        // npm 可能因缓存/脚本告警返回非 0，但包实际已可用；以落盘结果为准。
        const fallback = probeDshPrefix(managedDirs.prefix);
        if (fallback && fallback.frontendDistOk) {
          report({ type: 'log', message: `npm 返回异常（${error && error.message ? error.message : error}），但 dsh 已成功安装，继续。` });
          installError = null;
          break;
        }
        if (attempt < 2) {
          report({ type: 'log', message: `第 ${attempt} 次安装失败，清理不完整文件后重试…` });
          rmSync(path.join(managedDirs.prefix, 'node_modules'), { recursive: true, force: true });
          rmSync(path.join(managedDirs.prefix, 'package-lock.json'), { force: true });
        }
      }
    }
    if (installError) throw installError;
    dsh = probeDshPrefix(managedDirs.prefix);
    if (!dsh || !dsh.frontendDistOk) {
      throw new Error('安装完成但未找到 dsh 或前端资源，请查看日志。');
    }
    report({ type: 'log', message: `DeepSeek Harness ${dsh.version || ''} 安装完成` });
  } else {
    report({ type: 'log', message: `DeepSeek Harness 已存在（${dsh.version || '未知版本'}）` });
  }

  report({ type: 'done' });
  return {
    nodePath,
    npmCliPath,
    dsh: { ...dsh, nodePath },
  };
}

function runNpmInstall(nodePath, npmCliPath, prefix, report) {
  return new Promise((resolve, reject) => {
    const args = [
      'install',
      '--prefix', prefix,
      '--registry', NPMMIRROR,
      '--no-audit',
      '--no-fund',
      '--loglevel', 'info',
      '--fetch-retries', '3',
      '--fetch-timeout', '120000',
      `${DSH_PACKAGE}@${DSH_VERSION}`,
    ];
    const child = runNpm(nodePath, npmCliPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      // runNpm 会自动把 node 所在目录注入 PATH，确保 koffi/node-pty 的
      // install 脚本通过 cmd 调用 `node` 时能找到 node。
    });
    let settled = false;
    const finish = (fn, arg) => {
      if (!settled) { settled = true; fn(arg); }
    };

    const handleLine = (line) => {
      const text = line.trim();
      if (text) report({ type: 'log', message: text });
    };
    let stdoutBuf = '';
    let stderrBuf = '';
    child.stdout && child.stdout.on('data', (d) => {
      stdoutBuf += d.toString();
      const lines = stdoutBuf.split(/\r?\n/);
      stdoutBuf = lines.pop();
      lines.forEach(handleLine);
    });
    child.stderr && child.stderr.on('data', (d) => {
      stderrBuf += d.toString();
      const lines = stderrBuf.split(/\r?\n/);
      stderrBuf = lines.pop();
      lines.forEach(handleLine);
    });
    // npm 拉包阶段可能长时间没有完整一行输出，心跳保证界面能看到“还在动”。
    const heartbeat = setInterval(() => {
      if (!settled) report({ type: 'log', message: '正在安装依赖，请耐心等待…' });
    }, 8000);
    child.on('error', (error) => { clearInterval(heartbeat); finish(reject, error); });
    child.on('close', (code) => {
      clearInterval(heartbeat);
      if (stdoutBuf.trim()) handleLine(stdoutBuf);
      if (stderrBuf.trim()) handleLine(stderrBuf);
      if (cancelled) {
        finish(reject, new Error('安装已取消'));
        return;
      }
      if (code === 0) finish(resolve);
      else {
        const lastLines = stderrBuf.trim().split(/\r?\n/).slice(-6).join(' | ');
        finish(reject, new Error(`npm install 退出码 ${code}${lastLines ? `：${lastLines}` : ''}`));
      }
    });
  });
}

module.exports = { ensureHarness, cancelInstall, NODE_VERSION, DSH_PACKAGE, DSH_VERSION, NPMMIRROR };
