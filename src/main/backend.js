'use strict';

const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sleep } = require('./util');
const channels = require('./channels');

const URL_PATTERN = /dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)/;
const CONNECT_PLUGIN_NAME = 'dsh-connect-center';
const WEB_PROFILE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'];

async function probeUrl(url, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok || response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 把互联中心 UI 插件装进 dsh web profile：
 * 1. 确保 ~/.dsh/profiles/web 存在（缺省按官方模板初始化）；
 * 2. 把打包在 app 里的 dsh-connect-center 插件复制到
 *    ~/.dsh/profiles/web/node_modules/dsh-connect-center；
 * 3. 在 profile manifest 的 dsh.profile.bundles 里加入 dsh-connect-center。
 * 这样 `dsh web` 启动后，设置页就会出现「互联」section。
 */
function ensureConnectCenterPlugin() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const profileDir = path.join(home, 'profiles', 'web');
  const manifestPath = path.join(profileDir, 'package.json');
  const pluginSource = path.join(__dirname, '..', 'connect-plugin');
  const pluginTarget = path.join(profileDir, 'node_modules', CONNECT_PLUGIN_NAME);

  mkdirSync(path.join(profileDir, 'node_modules'), { recursive: true });

  if (!existsSync(manifestPath)) {
    writeFileSync(manifestPath, JSON.stringify({
      name: 'web',
      private: true,
      version: '0.0.0',
      dsh: { profile: { bundles: [...WEB_PROFILE_BUNDLES] } },
    }, null, 2) + '\n');
    writeFileSync(path.join(profileDir, 'cordis.patch.yml'), '[]\n');
  }

  // 递归复制插件包。不用 cpSync：cpSync 从 app.asar 复制在打包版可能失败；
  // 这里用 readdirSync/statSync/readFileSync 逐个文件读写（Electron 对 asar 只读访问已打补丁）。
  const copyDir = (src, dest) => {
    mkdirSync(dest, { recursive: true });
    for (const name of readdirSync(src)) {
      const srcPath = path.join(src, name);
      const destPath = path.join(dest, name);
      if (statSync(srcPath).isDirectory()) copyDir(srcPath, destPath);
      else writeFileSync(destPath, readFileSync(srcPath));
    }
  };

  let copied = false;
  try {
    rmSync(pluginTarget, { recursive: true, force: true });
    copyDir(pluginSource, pluginTarget);
    copied = existsSync(path.join(pluginTarget, 'package.json'));
  } catch (error) {
    console.error('dsh-desktop: 复制互联中心插件失败：', error && error.message ? error.message : error);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const bundles = manifest.dsh?.profile?.bundles ?? [];

  if (copied) {
    if (!bundles.includes(CONNECT_PLUGIN_NAME)) {
      manifest.dsh = manifest.dsh || {};
      manifest.dsh.profile = manifest.dsh.profile || {};
      manifest.dsh.profile.bundles = [...bundles, CONNECT_PLUGIN_NAME];
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    }
  } else if (bundles.includes(CONNECT_PLUGIN_NAME)) {
    // 插件没装上，必须把 bundle 从 manifest 移除，否则 dsh web 启动会直接失败。
    manifest.dsh.profile.bundles = bundles.filter((name) => name !== CONNECT_PLUGIN_NAME);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.error('dsh-desktop: 互联中心插件未装上，已从 web profile bundles 中移除，Harness 本体仍可启动。');
  }

  // 关闭会话日志 chunk 打包，减少强杀进程导致的 seq 回退损坏。
  try {
    channels.ensurePackChunksOff('web', (payload) => {
      if (payload && payload.type === 'log') console.log(`dsh-desktop: ${payload.message}`);
    });
  } catch (error) {
    console.error('dsh-desktop: 设置 packChunks=false 失败：', error && error.message ? error.message : error);
  }
}

/**
 * 启动 dsh web 后端，解析 stdout 中打印的本地 URL 并探活。
 * @param {{nodePath: string, binPath: string}} dsh 检测到的 dsh 安装信息
 * @param {{cwd?: string, env?: object, timeout?: number}} options
 * @returns {Promise<{child: import('node:child_process').ChildProcess, url: string}>}
 */
async function startBackend(dsh, options = {}) {
  const { nodePath, binPath } = dsh;
  const cwd = options.cwd || os.homedir();
  const env = { ...process.env, ...(options.env || {}) };
  const timeout = options.timeout || 60000;

  // 先确保互联中心设置页插件已装入 web profile，再启动 dsh web。
  try {
    ensureConnectCenterPlugin();
  } catch (error) {
    // 插件装入失败不应阻止 Harness 本体启动，只记录到 stderr。
    console.error('dsh-desktop: 互联中心插件装入失败：', error && error.message ? error.message : error);
  }

  const child = spawn(nodePath, [binPath, 'web', '--port', '0'], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let stdout = '';
  let stderr = '';
  let url = null;
  let spawnError = null;

  child.on('error', (error) => { spawnError = error; });
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
    if (!url) {
      const match = stdout.match(URL_PATTERN);
      if (match) url = match[1];
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (spawnError || child.exitCode !== null) break;
    if (url) {
      if (await probeUrl(url, 5000)) return { child, url };
    }
    await sleep(250);
  }

  if (url && await probeUrl(url, 3000)) return { child, url };

  const code = child.exitCode;
  try { child.kill('SIGKILL'); } catch { /* noop */ }
  const detail = spawnError ? spawnError.message : (stderr.trim() || stdout.trim());
  throw new Error(`DeepSeek Harness 启动失败（退出码 ${code ?? '未知'}）\n${detail.slice(-4000)}`);
}

/** 停止后端进程树（Windows 下用 taskkill /T 连带子进程）。 */
function stopBackend(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else {
      child.kill('SIGTERM');
    }
  } catch { /* noop */ }
}

module.exports = { startBackend, stopBackend, probeUrl };
