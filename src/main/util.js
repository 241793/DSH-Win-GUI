'use strict';

const { spawn } = require('node:child_process');
const { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');

/** 最小可用 Node 版本（dsh 依赖 node:sqlite，需 >= 22.5.0） */
const MIN_NODE_VERSION = '22.5.0';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseVersion(text) {
  const match = String(text).trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-.](\S+))?/);
  if (!match) return null;
  const prerelease = match[4] || '';
  return [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0), prerelease];
}

function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  // 主版本号相同时，比较 pre-release 后缀（如 rc.7 > rc.6）。
  const preA = pa[3] || '';
  const preB = pb[3] || '';
  if (preA === preB) return 0;
  // 没有 pre-release 的版本更高（正式版 > rc 版）
  if (!preA && preB) return 1;
  if (preA && !preB) return -1;
  // 都有 pre-release，提取最后的数字比较
  const numA = parseInt(String(preA).match(/(\d+)\s*$/)?.[1] || '0', 10);
  const numB = parseInt(String(preB).match(/(\d+)\s*$/)?.[1] || '0', 10);
  if (numA !== numB) return numA < numB ? -1 : 1;
  return String(preA) < String(preB) ? -1 : 1;
}

function versionAtLeast(version, minVersion) {
  return compareVersions(version, minVersion) >= 0;
}

/**
 * 运行命令并捕获输出，永不抛错。
 * @returns {Promise<{code: number|null, stdout: string, stderr: string, error?: Error}>}
 */
function runCapture(cmd, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      windowsHide: true,
      shell: options.shell === true,
      ...options,
    });
    let stdout = '';
    let stderr = '';
    child.stdout && child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr && child.stderr.on('data', (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* noop */ }
    }, options.timeout || 30000);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr, error });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/** 扫描 PATH 中的目录，找出装了 @deepseek-ai/dsh 的 npm 全局前缀。 */
function findDshPrefixesInPath() {
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const prefixes = [];
  for (const dir of pathDirs) {
    const bin = path.join(dir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
    if (existsSync(bin)) prefixes.push(dir);
  }
  return prefixes;
}

/** 在目录下递归查找 node 可执行文件（便携版 zip 解压后带版本子目录）。 */
function findNodeExe(dir, maxDepth = 4) {
  const { readdirSync } = require('node:fs');
  if (!existsSync(dir)) return null;
  const candidates = [];
  const walk = (current, depth) => {
    if (depth > maxDepth || candidates.length > 0) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (candidates.length > 0) return;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.name.toLowerCase() === 'node.exe' || entry.name === 'node') {
        candidates.push(full);
      }
    }
  };
  walk(dir, 0);
  return candidates[0] || null;
}

/** 根据 node 可执行文件定位 npm-cli.js，避免在 Windows 上 spawn npm.cmd。 */
function resolveNpmCli(nodePath) {
  if (!nodePath) return null;
  const candidates = [
    path.join(path.dirname(nodePath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(path.dirname(nodePath), '..', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * 构造子进程环境变量：把 node 所在目录放到 PATH 最前面。
 * Windows 下环境变量名大小写不敏感，先删除 Path/PATH/path 再写入单一 PATH，
 * 避免 env 对象里出现大小写不同的重复键，导致 npm 生命周期脚本（koffi/node-pty）
 * 通过 cmd 调用 `node` 时找不到 node。
 * @param {string} nodePath node 可执行文件绝对路径
 * @param {object} [extraEnv] 需要覆盖/追加的环境变量
 */
function envWithNodePath(nodePath, extraEnv = {}) {
  const env = { ...process.env };
  const nodeDir = path.dirname(nodePath);
  const currentPath = process.env.PATH || process.env.Path || process.env.path || '';
  const extraPath = extraEnv.PATH !== undefined ? extraEnv.PATH
    : (extraEnv.Path !== undefined ? extraEnv.Path : extraEnv.path);
  delete env.PATH;
  delete env.Path;
  delete env.path;
  Object.assign(env, extraEnv);
  delete env.PATH;
  delete env.Path;
  delete env.path;
  env.PATH = extraPath !== undefined ? extraPath : `${nodeDir}${path.delimiter}${currentPath}`;
  return env;
}

/** 使用 node + npm-cli.js 运行 npm，避免 shell/.cmd 的转义问题；env 默认注入 node 目录到 PATH。 */
function runNpm(nodePath, npmCliPath, args = [], options = {}) {
  return spawn(nodePath, [npmCliPath, ...args], {
    windowsHide: true,
    ...options,
    env: envWithNodePath(nodePath, options.env),
  });
}

/**
 * 下载文件到 dest，支持 https 重定向与进度回调。
 * @param {string} url
 * @param {string} dest
 * @param {(p: {percent: number, received: number, total: number}) => void} onProgress
 */
function downloadFile(url, dest, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.part`;
    rmSync(tmp, { force: true });
    let redirects = 0;

    const attempt = (target) => {
      const lib = target.startsWith('https:') ? https : http;
      const request = lib.get(target, {
        headers: { 'User-Agent': 'DeepSeekHarnessDesktop/0.1.0' },
      }, (response) => {
        const status = response.statusCode || 0;
        const location = response.headers.location;
        if (status >= 300 && status < 400 && location) {
          response.resume();
          redirects += 1;
          if (redirects > 8) {
            reject(new Error('下载失败：重定向次数过多'));
            return;
          }
          attempt(new URL(location, target).toString());
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(new Error(`下载失败：HTTP ${status}（${target}）`));
          return;
        }

        const total = Number(response.headers['content-length']) || 0;
        let received = 0;
        const output = createWriteStream(tmp);
        response.on('data', (chunk) => {
          received += chunk.length;
          onProgress(total > 0
            ? { percent: Math.min(100, Math.round((received / total) * 100)), received, total }
            : { percent: -1, received, total: 0 });
        });
        response.pipe(output);

        output.on('finish', () => {
          output.close(() => {
            try { renameSync(tmp, dest); } catch (error) {
              reject(error);
              return;
            }
            resolve(dest);
          });
        });
        output.on('error', (error) => {
          rmSync(tmp, { force: true });
          reject(error);
        });
      });

      request.on('error', (error) => {
        rmSync(tmp, { force: true });
        reject(error);
      });
      request.setTimeout(30000, () => {
        request.destroy(new Error('下载超时'));
      });
    };

    attempt(url);
  });
}

/** 解压 zip（Windows 用系统 tar/Expand-Archive）。 */
async function extractZip(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    const tar = await runCapture('tar', ['-xf', zipPath, '-C', destDir], { timeout: 180000 });
    if (tar.code === 0) return destDir;
    const ps = await runCapture('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ], { timeout: 300000 });
    if (ps.code === 0) return destDir;
    throw new Error(`解压失败：${tar.stderr || ps.stderr}`.slice(0, 2000));
  }
  const unzip = await runCapture('unzip', ['-o', zipPath, '-d', destDir], { timeout: 180000 });
  if (unzip.code === 0) return destDir;
  throw new Error(`解压失败：${unzip.stderr}`.slice(0, 2000));
}

/** 判断指定 prefix 下是否已有可用的 dsh 安装。 */
function resolveDshInstall(prefix) {
  const binPath = path.join(prefix, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  const pkgPath = path.join(prefix, 'node_modules', '@deepseek-ai', 'dsh', 'package.json');
  return { binPath, pkgPath, installed: existsSync(binPath) };
}

module.exports = {
  MIN_NODE_VERSION,
  sleep,
  parseVersion,
  compareVersions,
  versionAtLeast,
  runCapture,
  resolveNpmCli,
  runNpm,
  envWithNodePath,
  downloadFile,
  extractZip,
  resolveDshInstall,
  findNodeExe,
  findDshPrefixesInPath,
};
