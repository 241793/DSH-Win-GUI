'use strict';

const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } = require('node:fs');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const os = require('node:os');
const path = require('node:path');
const installer = require('./installer');
const { runCapture } = require('./util');

/** 支持的互联渠道列表（新增渠道在这里加一项即可）。 */
const CHANNELS = [
  {
    id: 'qqbot',
    kind: 'dsh-profile',
    name: 'QQ Bot',
    profile: 'qqbot',
    package: '@tencent-connect/dsh-qqbot',
    docs: 'https://www.npmjs.com/package/@tencent-connect/dsh-qqbot',
    description: '把 QQ 机器人作为 dsh 对话渠道。安装后启动 profile，首次启动在下方显示二维码，手机 QQ 扫码绑定，之后无需重复扫码。',
    commands: {
      install: 'dsh plugin --profile qqbot add @tencent-connect/dsh-qqbot',
      start: 'dsh --profile qqbot',
    },
    bind: {
      connector: '@tencent-connect/qqbot-connector',
      qrcode: 'qrcode-terminal',
      source: 'DeepSeek Harness',
    },
  },
  {
    id: 'wxclaw',
    kind: 'dsh-profile',
    name: 'WxClaw（微信）',
    profile: 'wxclaw',
    package: 'dsh-wxclaw',
    localPlugin: true,
    docs: 'https://www.npmjs.com/package/wxclaw',
    description: '把 wxclaw 微信账号接入 dsh。安装后启动 profile，首次启动打印二维码，微信扫码绑定，之后在微信里给该账号发消息即可与 dsh 对话。',
    commands: {
      install: 'dsh plugin --profile wxclaw add dsh-wxclaw',
      start: 'dsh --profile wxclaw',
    },
    env: {},
  },
];

/** channelId -> 运行中的 ChildProcess */
const running = new Map();

/** channelId -> CLI 型渠道的全部子进程（主进程 + 守护进程） */
const sidecars = new Map();

/** channelId -> 扫码绑定流程的 stop 函数（尚未 spawn dsh 时使用） */
const bindingStops = new Map();

/** channelId -> 最近一次解析到的机器人信息 */
const botInfoMap = new Map();

/** channelId -> 最近一次 wxclaw status --json 的健康结果 */
const healthMap = new Map();

/** channelId -> 最近一次解析到的已绑定账号信息（CLI 型渠道，如 OpenClaw） */
const accountMap = new Map();

function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

function profileDir(profile) {
  return path.join(dshHome(), 'profiles', profile);
}

/** Electron userData 下的 runtime 目录（无 electron 时回退到用户主目录）。 */
function appRuntimeDir() {
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'runtime');
  } catch {
    return path.join(os.homedir(), '.deepseek-harness-desktop', 'runtime');
  }
}

/** CLI 型渠道（如 wxclaw）的自管安装 prefix。 */
function cliPrefix(channelId) {
  return path.join(appRuntimeDir(), 'channels', channelId);
}

/** CLI 型渠道安装包的 node_modules 目录。 */
function cliNodeModulesDir(channel, packageName = channel.package) {
  return path.join(cliPrefix(channel.id), 'node_modules', ...packageName.split('/'));
}

/** CLI 型渠道某个包的入口 js 路径。 */
function cliBinPath(channel, packageName = channel.package, bin = channel.bin) {
  return path.join(cliNodeModulesDir(channel, packageName), bin || 'dist/index.js');
}

/** 在 node_modules 中递归查找包目录（兼容 pnpm .pnpm 隔离布局）。 */
function findPackageDir(baseDir, packageName, depth = 0) {
  if (depth > 5) return null;
  let entries;
  try {
    entries = readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(baseDir, entry.name);
    if (packageName.startsWith('@')) {
      if (entry.name === packageName && existsSync(path.join(full, 'package.json'))) return full;
      if (packageName.startsWith(`${entry.name}/`)) {
        const direct = path.join(full, packageName.slice(entry.name.length + 1));
        if (existsSync(path.join(direct, 'package.json'))) return direct;
      }
    } else if (entry.name === packageName && existsSync(path.join(full, 'package.json'))) {
      return full;
    }
    const nested = findPackageDir(full, packageName, depth + 1);
    if (nested) return nested;
  }
  return null;
}

/**
 * 从 profile node_modules 解析并 require 一个包。
 * 先走 Node 标准解析；失败后递归查找 pnpm .pnpm 隔离目录，再按包的
 * exports.require / main 入口 require 绝对路径。
 */
function resolvePackageInProfile(profileDirPath, packageName) {
  const errors = [];
  try {
    const profileRequire = createRequire(path.join(profileDirPath, 'package.json'));
    return profileRequire(packageName);
  } catch (error) {
    errors.push(error && error.message ? error.message : String(error));
  }

  const found = findPackageDir(path.join(profileDirPath, 'node_modules'), packageName);
  if (found) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(found, 'package.json'), 'utf8'));
      let entry = pkg.main || 'index.js';
      if (pkg.exports && typeof pkg.exports === 'object') {
        const root = pkg.exports['.'] || pkg.exports;
        if (typeof root === 'string') entry = root;
        else if (root && typeof root === 'object') entry = root.require || root.default || root.import || entry;
      }
      const target = path.join(found, entry);
      if (!existsSync(target)) throw new Error(`入口不存在: ${target}`);
      return require(target);
    } catch (error) {
      errors.push(error && error.message ? error.message : String(error));
    }
  }
  throw new Error(`${packageName} 解析失败：${errors.join(' | ')}`);
}

function getChannelsStatus() {
  return CHANNELS.map((channel) => {
    if (channel.kind === 'cli') {
      const binPath = cliBinPath(channel);
      const pkgFile = cliNodeModulesDir(channel) + path.sep + 'package.json';
      const prefixPkg = path.join(cliPrefix(channel.id), 'package.json');
      let bundleInstalled = false;
      let version = null;
      if (existsSync(binPath)) {
        bundleInstalled = true;
        try {
          version = JSON.parse(readFileSync(pkgFile, 'utf8')).version || null;
        } catch { /* noop */ }
      }
      return {
        ...channel,
        installed: existsSync(prefixPkg),
        bundleInstalled,
        version,
        provider: null,
        model: null,
        running: running.has(channel.id),
        botInfo: botInfoMap.get(channel.id) || null,
        health: healthMap.get(channel.id) || null,
        accountInfo: accountMap.get(channel.id) || null,
      };
    }

    const dir = profileDir(channel.profile);
    const pkgFile = path.join(dir, 'package.json');
    const installedPkgFile = path.join(dir, 'node_modules', ...channel.package.split('/'), 'package.json');
    let installed = false;
    let bundleInstalled = false;
    let version = null;
    if (existsSync(pkgFile)) installed = true;
    if (existsSync(installedPkgFile)) {
      bundleInstalled = true;
      try {
        version = JSON.parse(readFileSync(installedPkgFile, 'utf8')).version || null;
      } catch { /* noop */ }
    }
    const config = readChannelProfileConfig(channel) || {};
    return {
      ...channel,
      installed,
      bundleInstalled,
      version,
      provider: config.provider || null,
      model: config.model || null,
      running: running.has(channel.id),
      botInfo: botInfoMap.get(channel.id) || null,
      health: healthMap.get(channel.id) || null,
      accountInfo: accountMap.get(channel.id) || null,
    };
  });
}

/** 从 npmmirror 查询渠道插件的最新版本。 */
async function fetchLatestVersion(packageName) {
  try {
    const response = await fetch(`https://registry.npmmirror.com/${packageName}`);
    const json = await response.json();
    return (json && json['dist-tags'] && json['dist-tags'].latest) || null;
  } catch {
    return null;
  }
}

/** 检查所有渠道的已安装版本与最新版本。 */
async function checkChannelUpdates() {
  const statuses = getChannelsStatus();
  const results = [];
  for (const channel of CHANNELS) {
    const status = statuses.find((item) => item.id === channel.id);
    const latestVersion = await fetchLatestVersion(channel.package);
    const installedVersion = status && status.version ? String(status.version) : null;
    results.push({
      id: channel.id,
      installedVersion,
      latestVersion,
      hasUpdate: Boolean(installedVersion && latestVersion && installedVersion !== latestVersion),
    });
  }
  return results;
}

/** 更新渠道插件（dsh plugin --profile <profile> update <package>）。 */
async function updateChannel(managedDirs, detection, channel, report) {
  if (channel.kind === 'cli') {
    report({ type: 'log', message: `更新 CLI 渠道：${channel.name}` });
    return installCliChannel(managedDirs, detection, channel, report);
  }
  if (channel.localPlugin) {
    report({ type: 'log', message: `更新本地插件渠道：${channel.name}` });
    return installLocalPluginChannel(managedDirs, detection, channel, report);
  }
  const dsh = await ensureDsh(managedDirs, detection, report);
  const pnpm = await ensurePnpm(managedDirs, { nodePath: dsh.nodePath, npmCliPath: dsh.npmCliPath }, report);

  // 用显式版本号 add 而不是 @latest：pnpm 11 的 minimumReleaseAge 策略可能
  // 让 @latest 继续解析到旧版（例如 0.2.0），显式版本号能确保真正安装目标版本。
  const latestVersion = await fetchLatestVersion(channel.package);
  const spec = latestVersion ? `${channel.package}@${latestVersion}` : `${channel.package}@latest`;
  report({ type: 'log', message: `执行：dsh plugin --profile ${channel.profile} add ${spec}` });
  const code = await runWithOutput(dsh.nodePath, [
    dsh.dsh.binPath,
    'plugin',
    '--profile', channel.profile,
    'add', spec,
  ], {
    cwd: os.homedir(),
    env: { ...process.env, PATH: pnpm.pathEnv },
  }, report);

  if (code !== 0) throw new Error(`渠道更新失败（退出码 ${code}）`);
  patchQqbotReadyLog(channel, report);
  report({ type: 'log', message: '渠道更新完成' });
  return getChannelsStatus();
}

/**
 * 运行命令并把 stdout/stderr 按行回传（保留行内空格，QR 码由 Unicode 方块组成，不能 trim）。
 */
function runWithOutput(cmd, args, options, report) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });

    const attach = (stream) => {
      let buffer = '';
      if (!child[stream]) return () => {};
      child[stream].on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop();
        for (const line of lines) report({ type: 'output', stream, text: line });
      });
      return () => {
        if (buffer.length > 0) report({ type: 'output', stream, text: buffer });
      };
    };
    const flushStdout = attach('stdout');
    const flushStderr = attach('stderr');

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      flushStdout();
      flushStderr();
      resolve(code);
    });
  });
}

/** 确保 dsh 可用；不可用则走一键安装流程。 */
async function ensureDsh(managedDirs, detection, report) {
  if (detection && detection.ready) {
    report({ type: 'log', message: '运行环境就绪' });
    return {
      dsh: detection.dsh,
      nodePath: detection.node.path,
      npmCliPath: detection.node.npm.cliPath,
    };
  }
  report({ type: 'log', message: '运行环境未就绪，先安装缺失组件…' });
  const ensured = await installer.ensureHarness(managedDirs, detection, report);
  return {
    dsh: ensured.dsh,
    nodePath: ensured.nodePath,
    npmCliPath: ensured.npmCliPath,
  };
}

/** 检测系统 PATH 上是否已有 pnpm。 */
async function detectPnpm() {
  const capture = await runCapture('pnpm', ['-v'], {
    timeout: 20000,
    shell: process.platform === 'win32',
  });
  if (capture.code === 0 && capture.stdout.trim()) {
    return { source: 'path', version: capture.stdout.trim(), pathEnv: process.env.PATH || '' };
  }
  return null;
}

/** 确保 pnpm 可用：优先系统 PATH，否则 npm 安装到应用自管目录。 */
async function ensurePnpm(managedDirs, nodeInfo, report) {
  const onPath = await detectPnpm();
  if (onPath) {
    report({ type: 'log', message: `使用系统 pnpm ${onPath.version}` });
    return onPath;
  }

  report({ type: 'log', message: '未检测到 pnpm，正在安装到应用自管目录（npmmirror）…' });
  const prefix = path.join(managedDirs.runtimeDir, 'pnpm');
  mkdirSync(prefix, { recursive: true });
  const prefixPkg = path.join(prefix, 'package.json');
  if (!existsSync(prefixPkg)) {
    writeFileSync(prefixPkg, JSON.stringify({
      name: 'deepseek-harness-pnpm-runtime',
      private: true,
      version: '0.0.0',
    }, null, 2));
  }

  const code = await runWithOutput(nodeInfo.nodePath, [
    nodeInfo.npmCliPath,
    'install',
    '--prefix', prefix,
    '--registry', installer.NPMMIRROR,
    '--no-audit',
    '--no-fund',
    'pnpm@latest',
  ], {}, report);
  if (code !== 0) throw new Error(`pnpm 安装失败（退出码 ${code}）`);

  const binDir = path.join(prefix, 'node_modules', '.bin');
  const pathEnv = `${binDir};${process.env.PATH || ''}`;
  report({ type: 'log', message: 'pnpm 安装完成' });
  return { source: 'managed', version: null, pathEnv };
}

/** 给已安装的 qqbot 插件打机器人信息日志补丁（Bot ready 时输出 botId/botName）。 */
function patchQqbotReadyLog(channel, report) {
  if (channel.id !== 'qqbot') return;
  try {
    const file = path.join(
      profileDir(channel.profile),
      'node_modules', '@tencent-connect', 'dsh-qqbot', 'dist', 'gateway', 'bootstrap.js',
    );
    if (!existsSync(file)) return;
    const raw = readFileSync(file, 'utf8');
    const old = "    bot.on('ready', () => {\n        console.log(`[im-qqbot] Bot ready! appId=${config.appId}`);\n    });";
    const updated = "    bot.on('ready', (data) => {\n        const user = (data && data.user) || {};\n        console.log(`[im-qqbot] Bot ready! appId=${config.appId} botId=${user.id || ''} botName=${user.username || ''}`);\n    });";
    if (raw.includes(updated)) return;
    if (raw.includes(old)) {
      writeFileSync(file, raw.replace(old, updated));
      report({ type: 'log', message: 'qqbot 插件已打机器人信息日志补丁（Bot ready 时输出 botId/botName）' });
    } else {
      report({ type: 'log', message: 'qqbot 插件 ready 日志不是预期格式，跳过补丁。' });
    }
  } catch (error) {
    report({ type: 'log', message: `qqbot 补丁写入失败：${error && error.message ? error.message : error}` });
  }
}

/** 本地插件目录（开发态在项目 plugins/ 下；打包态在 app.asar/plugins/ 下）。 */
function localPluginDir(channel) {
  return path.join(__dirname, '..', '..', 'plugins', channel.package);
}

/** 安装本地 dsh 插件渠道（dsh-wxclaw）：复制插件到 profile node_modules 并写入 profile。 */
async function installLocalPluginChannel(managedDirs, detection, channel, report) {
  await ensureDsh(managedDirs, detection, report);
  const dir = profileDir(channel.profile);
  const pluginDir = localPluginDir(channel);
  if (!existsSync(path.join(pluginDir, 'package.json'))) {
    throw new Error(`本地插件不存在：${pluginDir}`);
  }

  report({ type: 'log', message: `创建 profile：${dir}` });
  mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
  const destDir = path.join(dir, 'node_modules', channel.package);
  rmSync(destDir, { recursive: true, force: true });
  copyLocalPlugin(pluginDir, destDir);

  // qrcode-terminal 用于在终端/日志里渲染二维码（从 qqbot profile 复用，若存在）。
  const qrSrc = path.join(profileDir('qqbot'), 'node_modules', 'qrcode-terminal');
  const qrDest = path.join(dir, 'node_modules', 'qrcode-terminal');
  if (existsSync(qrSrc)) {
    rmSync(qrDest, { recursive: true, force: true });
    copyLocalPlugin(qrSrc, qrDest);
  } else {
    report({ type: 'log', message: '未找到 qrcode-terminal，扫码二维码将以链接形式显示。' });
  }

  // 写 profile package.json（bundle 声明 + 依赖）。
  const profilePkg = {
    name: `dsh-profile-${channel.profile}`,
    private: true,
    dependencies: { [channel.package]: 'file:./node_modules/' + channel.package },
    dsh: {
      profile: {
        bundles: ['@deepseek-ai/dsh-base', channel.package],
      },
    },
  };
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(profilePkg, null, 2));

  // 初始化 cordis.patch.yml（保留已有条目）。
  updateProfilePatchEntry(channel.profile, {
    id: 'im-wxclaw',
    config: {
      apiUrl: process.env.WXCLAW_API_URL || 'https://ilinkai.weixin.qq.com',
      token: process.env.WXCLAW_TOKEN || '',
      xWechatUin: process.env.WXCLAW_UIN || '',
      pollIntervalSec: 2,
      textChunkLimit: 4000,
      sessionIdleTimeout: 1800000,
      streaming: true,
      showToolResults: false,
      adminIds: [],
      debug: false,
    },
  }, report);
  ensurePackChunksOff(channel.profile, report);

  report({ type: 'log', message: 'dsh-wxclaw 插件安装完成。若尚未配置 apiUrl，请设置环境变量 WXCLAW_API_URL 或手动编辑 cordis.patch.yml。' });
  return getChannelsStatus();
}

/** 递归复制目录（逐文件 readFileSync/writeFileSync，兼容从 app.asar 内读取）。 */
function copyLocalPlugin(src, dest) {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src);
  for (const name of entries) {
    const source = path.join(src, name);
    const target = path.join(dest, name);
    const stat = statSync(source);
    if (stat.isDirectory()) {
      copyLocalPlugin(source, target);
    } else {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(source));
    }
  }
}

/** 安装 CLI 型渠道（wxclaw 等）：npm 安装到应用自管目录。 */
async function installCliChannel(managedDirs, detection, channel, report) {
  report({ type: 'log', message: `开始安装频道：${channel.name}（${channel.package}）` });
  const { nodePath, npmCliPath } = await ensureDsh(managedDirs, detection, report);

  const prefix = cliPrefix(channel.id);
  mkdirSync(prefix, { recursive: true });
  const prefixPkg = path.join(prefix, 'package.json');
  if (!existsSync(prefixPkg)) {
    writeFileSync(prefixPkg, JSON.stringify({
      name: `deepseek-harness-channel-${channel.id}`,
      private: true,
      version: '0.0.0',
    }, null, 2));
  }

  const packages = channel.packages && channel.packages.length > 0 ? channel.packages : [channel.package];
  for (const packageName of packages) {
    const latestVersion = await fetchLatestVersion(packageName);
    const spec = latestVersion ? `${packageName}@${latestVersion}` : `${packageName}@latest`;
    report({ type: 'log', message: `执行：npm install --prefix ${prefix} ${spec}` });
    const code = await runWithOutput(nodePath, [
      npmCliPath,
      'install',
      '--prefix', prefix,
      '--registry', installer.NPMMIRROR,
      '--no-audit',
      '--no-fund',
      spec,
    ], {}, report);

    if (code !== 0) throw new Error(`频道安装失败（${packageName} 退出码 ${code}）`);
  }
  report({ type: 'log', message: '频道安装完成' });
  return getChannelsStatus();
}

/** 安装频道插件到 dsh profile。 */
async function installChannel(managedDirs, detection, channel, report) {
  if (channel.kind === 'cli') {
    return installCliChannel(managedDirs, detection, channel, report);
  }
  if (channel.localPlugin) {
    return installLocalPluginChannel(managedDirs, detection, channel, report);
  }
  report({ type: 'log', message: `开始安装频道：${channel.name}（${channel.package}）` });
  const dsh = await ensureDsh(managedDirs, detection, report);
  const pnpm = await ensurePnpm(managedDirs, { nodePath: dsh.nodePath, npmCliPath: dsh.npmCliPath }, report);

  report({ type: 'log', message: `执行：dsh plugin --profile ${channel.profile} add ${channel.package}` });
  const code = await runWithOutput(dsh.nodePath, [
    dsh.dsh.binPath,
    'plugin',
    '--profile', channel.profile,
    'add', channel.package,
  ], {
    cwd: os.homedir(),
    env: { ...process.env, PATH: pnpm.pathEnv },
  }, report);

  if (code !== 0) throw new Error(`频道插件安装失败（退出码 ${code}）`);
  patchQqbotReadyLog(channel, report);
  report({ type: 'log', message: '频道插件安装完成' });
  return getChannelsStatus();
}

/** 从 profile 的 cordis.patch.yml 或环境变量读取已保存的 QQBot 凭据。 */
function readProfileCredentials(channel) {
  const patchPath = path.join(profileDir(channel.profile), 'cordis.patch.yml');
  try {
    const raw = readFileSync(patchPath, 'utf8');
    // 允许文件里带 # 注释：先把注释行去掉再按 JSON 解析。
    const stripped = raw.replace(/^\s*#.*$/gm, '').trim();
    try {
      const parsed = JSON.parse(stripped || raw);
      const entry = (Array.isArray(parsed) ? parsed : []).find((item) => item && item.id === 'im-qqbot');
      const config = entry && entry.config;
      if (config && config.appId && config.appSecret) {
        return { appId: String(config.appId), appSecret: String(config.appSecret) };
      }
    } catch {
      // 官方插件可能写入 YAML；用正则兜底提取（键名后可能带引号）。
      const appId = raw.match(/appId["']?\s*:\s*["']?(\d+)/);
      const appSecret = raw.match(/appSecret["']?\s*:\s*["']?([^"'\s]+)/);
      if (appId && appSecret) return { appId: appId[1], appSecret: appSecret[1] };
    }
  } catch { /* 文件不存在 */ }
  if (process.env.QQBOT_APPID && process.env.QQBOT_SECRET) {
    return { appId: process.env.QQBOT_APPID, appSecret: process.env.QQBOT_SECRET };
  }
  return null;
}

/** 从 profile 的 cordis.patch.yml 或环境变量读取已保存的 wxclaw 账号。 */
function readWxclawAccount(channel) {
  const patchPath = path.join(profileDir(channel.profile), 'cordis.patch.yml');
  try {
    const raw = readFileSync(patchPath, 'utf8');
    const stripped = raw.replace(/^\s*#.*$/gm, '').trim();
    try {
      const parsed = JSON.parse(stripped || raw);
      const entry = (Array.isArray(parsed) ? parsed : []).find((item) => item && item.id === 'im-wxclaw');
      const config = entry && entry.config;
      if (config && config.token) {
        return {
          token: String(config.token),
          botId: config.botId ? String(config.botId) : null,
          apiUrl: config.apiUrl ? String(config.apiUrl) : 'https://ilinkai.weixin.qq.com',
        };
      }
    } catch {
      const token = raw.match(/token["']?\s*:\s*["']?([^"'\s]+)/);
      if (token) return { token: token[1], botId: null, apiUrl: 'https://ilinkai.weixin.qq.com' };
    }
  } catch { /* 文件不存在 */ }
  if (process.env.WXCLAW_TOKEN) {
    return {
      token: process.env.WXCLAW_TOKEN,
      botId: process.env.WXCLAW_BOT_ID || null,
      apiUrl: process.env.WXCLAW_API_URL || 'https://ilinkai.weixin.qq.com',
    };
  }
  return null;
}

/** 判断 patch 内容是否等价为空（默认模板：注释 + []）。 */
function isEffectivelyEmptyPatch(raw) {
  const stripped = raw
    .replace(/^\s*#.*$/gm, '')
    .replace(/^\s*$/gm, '')
    .trim();
  return stripped === '' || stripped === '[]';
}

/** 读取渠道在 profile cordis.patch.yml 里的完整配置（im-qqbot 条目）。 */
function readChannelProfileConfig(channel) {
  const patchPath = path.join(profileDir(channel.profile), 'cordis.patch.yml');
  try {
    const raw = readFileSync(patchPath, 'utf8');
    const stripped = raw.replace(/^\s*#.*$/gm, '').trim();
    let parsed = null;
    try {
      parsed = JSON.parse(stripped || raw);
    } catch {
      try {
        parsed = resolvePackageInProfile(path.dirname(patchPath), 'js-yaml').load(raw);
      } catch { /* ignore */ }
    }
    const entry = (Array.isArray(parsed) ? parsed : []).find((item) => item && item.id === 'im-qqbot');
    return (entry && entry.config) || null;
  } catch {
    return null;
  }
}

/** 把任意 row 条目合并进指定 profile 的 cordis.patch.yml。 */
function updateProfilePatchEntry(profileName, entry, report) {
  try {
    const patchPath = path.join(profileDir(profileName), 'cordis.patch.yml');
    const profileDirPath = path.dirname(patchPath);
    let entries = [];
    let raw = '';
    try {
      raw = readFileSync(patchPath, 'utf8');
    } catch { /* 文件不存在 */ }

    if (!isEffectivelyEmptyPatch(raw)) {
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch { /* 不是 JSON，再试 YAML */ }
      if (!Array.isArray(parsed)) {
        try {
          const yaml = resolvePackageInProfile(profileDirPath, 'js-yaml');
          parsed = yaml.load(raw);
        } catch { /* YAML 也不可用 */ }
      }
      if (Array.isArray(parsed)) {
        entries = parsed.filter((item) => item && (item.id || item.insert));
      } else {
        report({ type: 'log', message: `现有 ${patchPath} 无法解析，跳过自动写入。` });
        return false;
      }
    }

    const existing = entries.find((item) => item && item.id === entry.id);
    if (existing) {
      existing.config = { ...(existing.config || {}), ...entry.config };
      if (entry.name) existing.name = entry.name;
    } else {
      const row = { id: entry.id, config: { ...entry.config } };
      if (entry.name) row.name = entry.name;
      entries.push(row);
    }
    writeFileSync(patchPath, `# dsh profile patch（桌面端自动生成）\n${JSON.stringify(entries, null, 2)}\n`);
    report({ type: 'log', message: `配置已写入 ${patchPath}` });
    return true;
  } catch (error) {
    report({ type: 'log', message: `配置写入失败：${error && error.message ? error.message : error}` });
    return false;
  }
}

/** 往 profile patch 里插入一个新的插件入口行（用于 client-only 插件）。 */
function insertProfilePluginRow(profileName, entry, report) {
  try {
    const patchPath = path.join(profileDir(profileName), 'cordis.patch.yml');
    const profileDirPath = path.dirname(patchPath);
    let ops = [];
    let raw = '';
    try {
      raw = readFileSync(patchPath, 'utf8');
    } catch { /* 文件不存在 */ }

    if (!isEffectivelyEmptyPatch(raw)) {
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch { /* 不是 JSON，再试 YAML */ }
      if (!Array.isArray(parsed)) {
        try {
          const yaml = resolvePackageInProfile(profileDirPath, 'js-yaml');
          parsed = yaml.load(raw);
        } catch { /* YAML 也不可用 */ }
      }
      if (Array.isArray(parsed)) {
        ops = parsed.filter((item) => item && (item.id || item.insert));
      } else {
        report({ type: 'log', message: `现有 ${patchPath} 无法解析，跳过自动插入。` });
        return false;
      }
    }

    let insertOp = ops.find((item) => item && item.insert && Array.isArray(item.insert));
    if (!insertOp) {
      insertOp = { insert: [] };
      ops.push(insertOp);
    }
    if (!insertOp.insert.some((row) => row && row.id === entry.id)) {
      insertOp.insert.push({ id: entry.id, name: entry.name, config: { ...(entry.config || {}) } });
    }
    writeFileSync(patchPath, `# dsh profile patch（桌面端自动生成）\n${JSON.stringify(ops, null, 2)}\n`);
    report({ type: 'log', message: `插件入口行已插入 ${patchPath}` });
    return true;
  } catch (error) {
    report({ type: 'log', message: `插件入口插入失败：${error && error.message ? error.message : error}` });
    return false;
  }
}

/** 把任意配置项合并进渠道的 profile cordis.patch.yml。 */
function updateChannelProfileConfig(channel, patch, report) {
  return updateProfilePatchEntry(channel.profile, { id: 'im-qqbot', config: patch }, report);
}

/** 从 profile 的 cordis.patch.yml 中移除指定 id 的条目。 */
function removeProfilePatchEntry(profileName, entryId, report) {
  try {
    const patchPath = path.join(profileDir(profileName), 'cordis.patch.yml');
    if (!existsSync(patchPath)) return false;
    const raw = readFileSync(patchPath, 'utf8');
    const stripped = raw.replace(/^\s*#.*$/gm, '').trim();
    let entries = [];
    try {
      const parsed = JSON.parse(stripped || '[]');
      if (Array.isArray(parsed)) entries = parsed.filter((item) => item && (item.id || item.insert));
    } catch {
      report({ type: 'log', message: `现有 ${patchPath} 不是 JSON 风格，跳过自动移除。` });
      return false;
    }
    const next = entries
      .filter((item) => item && item.id !== entryId)
      .map((item) => {
        if (item && item.insert && Array.isArray(item.insert)) {
          return { ...item, insert: item.insert.filter((row) => row && row.id !== entryId) };
        }
        return item;
      })
      .filter((item) => !(item && item.insert && Array.isArray(item.insert) && item.insert.length === 0));
    writeFileSync(patchPath, `# dsh profile patch（桌面端自动生成）\n${JSON.stringify(next, null, 2)}\n`);
    report({ type: 'log', message: `已从 ${patchPath} 移除 ${entryId}` });
    return true;
  } catch (error) {
    report({ type: 'log', message: `移除配置失败：${error && error.message ? error.message : error}` });
    return false;
  }
}

/** 关闭会话日志的 chunk 打包，降低强杀导致的 seq 回退损坏概率。 */
function ensurePackChunksOff(profileName, report) {
  return updateProfilePatchEntry(profileName, {
    id: 'session-persistence-jsonl',
    config: {
      root: path.join(dshHome(), 'sessions'),
      packChunks: false,
    },
  }, report);
}

/** 把扫码凭据写入 profile。 */
function writeCredentialsToProfile(channel, credentials, report) {
  return updateChannelProfileConfig(channel, {
    appId: credentials.appId,
    appSecret: credentials.appSecret,
  }, report);
}

/** 设置渠道默认模型（provider + model），写入 profile 配置。 */
function setChannelDefaultModel(channel, provider, model, report) {
  const patch = {};
  if (provider) patch.provider = provider;
  if (model) patch.model = model;
  return updateChannelProfileConfig(channel, patch, report);
}

/** 读取 dsh 最近使用的默认模型（settings.yaml 的 agent-default-model）。 */
function getRecentDefaultModel(channel) {
  try {
    const settingsPath = path.join(dshHome(), 'settings.yaml');
    const raw = readFileSync(settingsPath, 'utf8');
    const yaml = resolvePackageInProfile(profileDir(channel.profile), 'js-yaml');
    const settings = yaml.load(raw);
    const def = settings && settings['agent-default-model'];
    if (def && def.provider && def.model) {
      return { provider: String(def.provider), model: String(def.model) };
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * 加载 qqbot-connector。官方 1.2.0 的 CJS 入口在 type:module 包里以
 * .js 结尾，require 会报 "exports is not defined"。先尝试 require，
 * 失败后改用动态 import() 加载 ESM 入口。
 */
async function loadConnector(profileDirPath, packageName) {
  const errors = [];
  try {
    return resolvePackageInProfile(profileDirPath, packageName);
  } catch (error) {
    errors.push(error && error.message ? error.message : String(error));
  }

  const found = findPackageDir(path.join(profileDirPath, 'node_modules'), packageName);
  if (!found) throw new Error(`${packageName} 未找到：${errors.join(' | ')}`);

  try {
    const pkg = JSON.parse(readFileSync(path.join(found, 'package.json'), 'utf8'));
    let entry = null;
    if (pkg.exports && typeof pkg.exports === 'object') {
      const root = pkg.exports['.'] || pkg.exports;
      if (typeof root === 'string') entry = root;
      else if (root && typeof root === 'object') entry = root.import || root.default;
    }
    if (!entry) entry = pkg.module || pkg.main || 'index.js';
    const target = path.join(found, entry);
    if (!existsSync(target)) throw new Error(`入口不存在: ${target}`);
    return await import(pathToFileURL(target).href);
  } catch (error) {
    errors.push(error && error.message ? error.message : String(error));
  }
  throw new Error(`${packageName} 加载失败：${errors.join(' | ')}`);
}

/**
 * 由 Electron 主进程直接执行 QQBot 扫码绑定。
 * 使用 profile node_modules 里的 qqbot-connector + qrcode-terminal，
 * 二维码通过 IPC 显示到设置页，成功后返回凭据。
 * @returns {Promise<{appId:string, appSecret:string}|null>} 成功返回凭据；连接器不可用时返回 null 以便回退。
 */
async function runChannelBinding(channel, dir, report) {
  let connector;
  let qrcode;
  try {
    connector = await loadConnector(dir, channel.bind.connector);
    qrcode = resolvePackageInProfile(dir, channel.bind.qrcode);
  } catch (error) {
    report({ type: 'log', message: `主进程扫码绑定不可用（${error && error.message ? error.message : error}），回退到插件终端二维码。` });
    return null;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      bindingStops.delete(channel.id);
      fn(arg);
    };

    let stop;
    try {
      stop = connector.startQrConnect({
        onQrDisplayed: (url) => {
          report({ type: 'log', message: '请使用手机 QQ 扫描下方二维码完成绑定...' });
          try {
            qrcode.generate(url, { small: true }, (qr) => {
              report({ type: 'output', stream: 'stdout', text: qr });
              report({ type: 'log', message: '请使用手机 QQ 扫描上方二维码，完成机器人绑定。' });
            });
          } catch (error) {
            report({ type: 'output', stream: 'stdout', text: `二维码链接: ${url}` });
          }
        },
        onQrExpired: () => {
          report({ type: 'log', message: '二维码已过期，正在刷新…' });
        },
        onSuccess: (list) => {
          const cred = Array.isArray(list) && list[0] ? list[0] : null;
          if (!cred || !cred.appId || !cred.appSecret) {
            finish(reject, new Error('扫码未返回有效凭据'));
            return;
          }
          report({ type: 'log', message: `✔ 绑定成功！AppID: ${cred.appId}` });
          writeCredentialsToProfile(channel, cred, report);
          finish(resolve, { appId: String(cred.appId), appSecret: String(cred.appSecret) });
        },
        onFailure: (error) => {
          report({ type: 'log', message: `绑定失败：${error && error.message ? error.message : error}` });
          finish(reject, error || new Error('绑定失败'));
        },
      }, {
        displayQrCodeToConsole: false,
        source: channel.bind.source || 'DeepSeek Harness',
      });
      bindingStops.set(channel.id, stop);
    } catch (error) {
      report({ type: 'log', message: `主进程扫码绑定启动失败（${error && error.message ? error.message : error}）` });
      finish(reject, error);
    }
  });
}

/** 启动 CLI 型渠道（wxclaw/OpenClaw 等）：主进程 + 守护进程，输出日志并轮询状态。 */
async function startCliChannel(managedDirs, detection, channel, report) {
  if (running.has(channel.id)) throw new Error('该渠道已在运行中');
  const { nodePath } = await ensureDsh(managedDirs, detection, report);

  const binPath = cliBinPath(channel);
  if (!existsSync(binPath)) {
    throw new Error(`${channel.name} 尚未安装，请先点击「安装」。`);
  }

  const children = new Set();
  sidecars.set(channel.id, children);

  const spawnChild = (label, args) => {
    const child = spawn(nodePath, args, {
      cwd: os.homedir(),
      env: { ...process.env, ...(channel.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    children.add(child);
    report({ type: 'log', message: `启动 ${label}（PID ${child.pid}）` });

    const attach = (stream) => {
      let buffer = '';
      if (!child[stream]) return () => {};
      child[stream].on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop();
        for (const line of lines) {
          report({ type: 'output', stream, text: line });
        }
      });
      return () => {
        if (buffer.length > 0) report({ type: 'output', stream, text: buffer });
      };
    };
    const flushStdout = attach('stdout');
    const flushStderr = attach('stderr');

    child.on('error', (error) => {
      children.delete(child);
      report({ type: 'output', stream: 'stderr', text: `${label} 启动失败：${error.message || error}` });
      if (children.size === 0) {
        running.delete(channel.id);
        sidecars.delete(channel.id);
        report({ type: 'status', running: false });
      }
    });
    child.on('close', (code) => {
      flushStdout();
      flushStderr();
      children.delete(child);
      report({ type: 'log', message: `${label} 已退出（退出码 ${code ?? '未知'}）` });
      if (children.size === 0) {
        running.delete(channel.id);
        sidecars.delete(channel.id);
        report({ type: 'status', running: false, code });
      }
    });
    return child;
  };

  const mainChild = spawnChild('OpenClaw 网关', [binPath, ...(channel.startArgs || [])]);
  running.set(channel.id, mainChild);

  // 守护进程：wxclaw watch --dashboard（自动拉起故障网关 + 本地监控面板）。
  const watchBin = cliBinPath(channel, 'wxclaw', channel.watchBin);
  if (existsSync(watchBin)) {
    spawnChild('wxclaw 守护', [watchBin, ...(channel.watchArgs || [])]);
  } else {
    report({ type: 'log', message: '未找到 wxclaw，仅启动 OpenClaw 网关。' });
  }

  // 轮询 1：wxclaw status --json → 网关健康状态。
  const healthPoll = setInterval(async () => {
    if (children.size === 0) { clearInterval(healthPoll); return; }
    try {
      const statusBin = cliBinPath(channel, 'wxclaw', channel.watchBin);
      const capture = await runCapture(nodePath, [statusBin, 'status', '--json'], { timeout: 30000 });
      if (capture.code === 0 && capture.stdout.trim()) {
        const health = JSON.parse(capture.stdout.trim());
        healthMap.set(channel.id, health);
        report({ type: 'health', health });
      }
    } catch { /* 状态轮询失败不打扰 */ }
  }, 20000);
  healthPoll.unref && healthPoll.unref();

  // 轮询 2：openclaw channels list --json → 已绑定账号。
  const accountPoll = setInterval(async () => {
    if (children.size === 0) { clearInterval(accountPoll); return; }
    try {
      const capture = await runCapture(nodePath, [binPath, 'channels', 'list', '--json'], { timeout: 60000 });
      if (capture.code === 0 && capture.stdout.trim()) {
        const parsed = JSON.parse(capture.stdout.trim());
        const chat = parsed && parsed.chat ? parsed.chat : {};
        const accounts = Object.entries(chat).map(([channelId, info]) => ({
          channel: channelId,
          accounts: (info && info.accounts) || [],
          installed: Boolean(info && info.installed),
          origin: (info && info.origin) || null,
        }));
        accountMap.set(channel.id, accounts);
        report({ type: 'account-info', accounts });
      }
    } catch { /* 账号轮询失败不打扰 */ }
  }, 30000);
  accountPoll.unref && accountPoll.unref();

  report({ type: 'status', running: true, pid: mainChild.pid });
  report({ type: 'log', message: '监控面板：http://localhost:9090' });
  report({ type: 'log', message: `绑定账号命令：${channel.commands.bind || 'openclaw channels login --channel wechat'}` });
  return { ok: true };
}

/** 启动频道 profile（首次启动会打印二维码；扫码绑定成功后若网关未就绪会自动重启）。 */
async function startChannel(managedDirs, detection, channel, report) {
  if (running.has(channel.id)) throw new Error('该频道已在运行中');
  if (channel.kind === 'cli') {
    return startCliChannel(managedDirs, detection, channel, report);
  }
  const dsh = await ensureDsh(managedDirs, detection, report);

  const dir = profileDir(channel.profile);
  if (!existsSync(path.join(dir, 'package.json'))) {
    throw new Error('该频道尚未安装，请先点击「安装到 dsh profile」。');
  }

  patchQqbotReadyLog(channel, report);
  report({ type: 'log', message: `启动：dsh --profile ${channel.profile}` });

  // 渠道 profile 也关闭 chunk 打包，降低会话日志损坏概率。
  ensurePackChunksOff(channel.profile, report);

  let credentials = readProfileCredentials(channel) || { appId: null, appSecret: null };

  // 优先由 Electron 主进程直接完成扫码绑定：通过 qqbot-connector 的
  // onQrDisplayed 拿 URL → qrcode-terminal 生成二维码发给设置页 →
  // onSuccess 拿到 AppID/AppSecret → 写入 profile。这样彻底绕开
  // dsh-qqbot 0.3.0 在 Windows 上 getProfileDir() 失效导致凭据写不进的问题。
  if (!credentials.appSecret && channel.bind) {
    const bound = await runChannelBinding(channel, dir, report);
    if (bound) credentials = bound;
  }

  let botReady = false;
  let restartRequested = false;
  let restartTimer = null;

  const persistCredentials = () => {
    if (!credentials.appId || !credentials.appSecret) return false;
    return writeCredentialsToProfile(channel, credentials, report);
  };

  const killChild = (child) => {
    if (!child || child.exitCode !== null || !child.pid) return;
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      } else {
        child.kill('SIGTERM');
      }
    } catch { /* noop */ }
  };

  const spawnOnce = () => {
    if (restartRequested === true) restartRequested = false;

    const spawnEnv = credentials.appId && credentials.appSecret
      ? { ...process.env, QQBOT_APPID: credentials.appId, QQBOT_SECRET: credentials.appSecret }
      : process.env;

    const child = spawn(dsh.nodePath, [dsh.dsh.binPath, '--profile', channel.profile], {
      cwd: os.homedir(),
      env: spawnEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    running.set(channel.id, child);

    const attach = (stream) => {
      let buffer = '';
      if (!child[stream]) return () => {};
      child[stream].on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop();
        for (const line of lines) {
          report({ type: 'output', stream, text: line });

          // 绑定成功只代表凭据已拿到；Bot ready 才代表 WebSocket 网关真正上线。
          if (/Bot ready/i.test(line)) botReady = true;

          const botInfoMatch = line.match(/\[im-qqbot\] Bot ready!.*?appId=(\S+?)(?:\s+botId=(\S+?))?(?:\s+botName=(.*))?$/i);
          if (botInfoMatch) {
            const botInfo = {
              appId: botInfoMatch[1] || credentials.appId || null,
              botId: botInfoMatch[2] || null,
              botName: botInfoMatch[3] ? botInfoMatch[3].trim() : null,
            };
            if (botInfo.appId && botInfo.appId !== credentials.appId) credentials.appId = botInfo.appId;
            botInfoMap.set(channel.id, botInfo);
            report({ type: 'bot-info', ...botInfo });
          }

          // wxclaw 插件日志：绑定成功 / 启动成功时提取账号信息。
          const wxBound = line.match(/\[im-wxclaw\]\s*✔?\s*绑定成功！token=(\S+)/i) || line.match(/✔\s*绑定成功！token=(\S+)/i);
          if (wxBound) {
            const accounts = [{ channel: 'wxclaw', accounts: [wxBound[1]], installed: true, origin: 'configured' }];
            accountMap.set(channel.id, accounts);
            report({ type: 'account-info', accounts });
          }
          const wxStarted = line.match(/\[im-wxclaw\] started: apiUrl=(\S+)\s+token=(\S+)/i);
          if (wxStarted) {
            const accounts = [{ channel: 'wxclaw', accounts: [wxStarted[2]], installed: true, origin: 'configured' }];
            accountMap.set(channel.id, accounts);
            report({ type: 'account-info', accounts });
          }

          const appIdFromLog = line.match(/AppID[：:]\s*(\d+)/);
          if (appIdFromLog && !credentials.appId) credentials.appId = appIdFromLog[1];
          const appIdFromEnv = line.match(/QQBOT_APPID\s*=\s*["']?([^"'\s]+)/);
          if (appIdFromEnv) credentials.appId = appIdFromEnv[1];
          const secretFromEnv = line.match(/QQBOT_SECRET\s*=\s*["']?([^"'\s]+)/);
          if (secretFromEnv) credentials.appSecret = secretFromEnv[1];

          if (channel.id === 'qqbot' && !restartTimer && !botReady && /绑定成功/.test(line)) {
            restartTimer = setTimeout(() => {
              restartTimer = null;
              const current = running.get(channel.id);
              if (!botReady && current) {
                report({ type: 'log', message: '扫码绑定成功但 Bot 网关未就绪，正在自动重启渠道…' });
                persistCredentials();
                restartRequested = true;
                killChild(current);
              }
            }, 6000);
          }
        }
      });
      return () => {
        if (buffer.length > 0) {
          const line = buffer;
          report({ type: 'output', stream, text: line });
          if (/Bot ready/i.test(line)) botReady = true;
          const botInfoMatch = line.match(/\[im-qqbot\] Bot ready!.*?appId=(\S+?)(?:\s+botId=(\S+?))?(?:\s+botName=(.*))?$/i);
          if (botInfoMatch) {
            const botInfo = {
              appId: botInfoMatch[1] || credentials.appId || null,
              botId: botInfoMatch[2] || null,
              botName: botInfoMatch[3] ? botInfoMatch[3].trim() : null,
            };
            botInfoMap.set(channel.id, botInfo);
            report({ type: 'bot-info', ...botInfo });
          }
        }
      };
    };
    const flushStdout = attach('stdout');
    const flushStderr = attach('stderr');

    child.on('error', (error) => {
      if (running.get(channel.id) === child) running.delete(channel.id);
      report({ type: 'output', stream: 'stderr', text: String(error.message || error) });
      report({ type: 'status', running: false });
    });
    child.on('close', (code) => {
      flushStdout();
      flushStderr();
      const isCurrent = running.get(channel.id) === child;
      if (isCurrent) running.delete(channel.id);
      report({ type: 'status', running: false, code });
      report({ type: 'log', message: `频道进程已退出（退出码 ${code ?? '未知'}）` });

      // 自动重启：扫码绑定成功后网关没就绪，杀掉旧进程后在这里拉起新进程。
      if (isCurrent && restartRequested) {
        report({ type: 'log', message: '正在以已保存的凭据重新启动渠道…' });
        spawnOnce();
      }
    });

    report({ type: 'status', running: true, pid: child.pid });
  };

  spawnOnce();
  if (channel.id === 'qqbot') {
    report({ type: 'log', message: '首次启动如需扫码，二维码会显示在绑定弹窗中，请用手机 QQ 扫码。' });
  } else {
    report({ type: 'log', message: '首次启动如需绑定 wxclaw，请查看上方日志中的二维码或链接，用微信扫码。' });
  }
  return { ok: true };
}

/** 停止频道进程树。 */
function stopChannel(channelId, report) {
  const stopBinding = bindingStops.get(channelId);
  if (stopBinding) {
    bindingStops.delete(channelId);
    try { stopBinding(); } catch { /* noop */ }
    if (report) {
      report({ type: 'status', running: false });
      report({ type: 'log', message: '已取消扫码绑定' });
    }
    return true;
  }

  const children = sidecars.get(channelId);
  const child = running.get(channelId);
  if (!child && !(children && children.size > 0)) {
    if (report) report({ type: 'status', running: false });
    return false;
  }
  running.delete(channelId);
  const targets = new Set(children ? [...children] : []);
  if (child) targets.add(child);
  for (const target of targets) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(target.pid), '/T', '/F'], { windowsHide: true });
      } else {
        target.kill('SIGTERM');
      }
    } catch { /* noop */ }
  }
  sidecars.delete(channelId);
  if (report) {
    report({ type: 'status', running: false });
    report({ type: 'log', message: '已请求停止频道进程' });
  }
  return true;
}

/** 切换账号：停掉渠道 → 清除已保存凭据/账号 → 重新启动（触发扫码绑定）。 */
async function switchChannelAccount(managedDirs, detection, channel, report) {
  if (running.has(channel.id)) {
    report({ type: 'log', message: '停止当前渠道，准备切换账号…' });
    stopChannel(channel.id, report);
  }

  if (channel.kind === 'dsh-profile') {
    updateChannelProfileConfig(channel, { appId: '', appSecret: '' }, report);
    report({ type: 'log', message: '已清除已保存的 QQ Bot 凭据，重新启动后可扫码绑定新账号。' });
  } else if (channel.kind === 'cli') {
    const { nodePath } = await ensureDsh(managedDirs, detection, report);
    const binPath = cliBinPath(channel);
    if (existsSync(binPath) && channel.bindChannel) {
      const bindArgs = [binPath, 'channels', 'login', '--channel', channel.bindChannel];
      report({ type: 'log', message: `执行绑定命令：openclaw channels login --channel ${channel.bindChannel}` });
      const code = await runWithOutput(nodePath, bindArgs, {
        cwd: os.homedir(),
        env: { ...process.env, ...(channel.env || {}) },
      }, report);
      if (code !== 0) {
        report({ type: 'log', message: `绑定命令退出码 ${code}，请查看上方日志中的二维码/提示。` });
      }
    } else {
      report({ type: 'log', message: '未找到 openclaw 或未配置 bindChannel，请在日志中手动执行 channels login。' });
    }
  }

  report({ type: 'log', message: '重新启动渠道…' });
  return startChannel(managedDirs, detection, channel, report);
}

/** 卸载渠道：停止进程并移除插件/自管目录。 */
async function uninstallChannel(managedDirs, detection, channel, report) {
  if (running.has(channel.id)) {
    report({ type: 'log', message: '停止渠道进程…' });
    stopChannel(channel.id, report);
  }

  if (channel.localPlugin) {
    const dir = profileDir(channel.profile);
    const pluginDir = path.join(dir, 'node_modules', channel.package);
    rmSync(pluginDir, { recursive: true, force: true });
    removeProfilePatchEntry(channel.profile, 'im-wxclaw', report);
    report({ type: 'log', message: 'dsh-wxclaw 插件已从 profile 卸载' });
    accountMap.delete(channel.id);
    botInfoMap.delete(channel.id);
    healthMap.delete(channel.id);
    return getChannelsStatus();
  }

  if (channel.kind === 'dsh-profile') {
    const dsh = await ensureDsh(managedDirs, detection, report);
    const pnpm = await ensurePnpm(managedDirs, { nodePath: dsh.nodePath, npmCliPath: dsh.npmCliPath }, report);
    report({ type: 'log', message: `执行：dsh plugin --profile ${channel.profile} remove ${channel.package}` });
    const code = await runWithOutput(dsh.nodePath, [
      dsh.dsh.binPath,
      'plugin',
      '--profile', channel.profile,
      'remove', channel.package,
    ], {
      cwd: os.homedir(),
      env: { ...process.env, PATH: pnpm.pathEnv },
    }, report);
    if (code !== 0) throw new Error(`频道卸载失败（退出码 ${code}）`);
    report({ type: 'log', message: '频道插件已卸载' });
  } else if (channel.kind === 'cli') {
    const prefix = cliPrefix(channel.id);
    report({ type: 'log', message: `删除自管目录：${prefix}` });
    rmSync(prefix, { recursive: true, force: true });
    report({ type: 'log', message: '频道已卸载' });
  }

  accountMap.delete(channel.id);
  botInfoMap.delete(channel.id);
  healthMap.delete(channel.id);
  return getChannelsStatus();
}

/** 汇总渠道已绑定账号（供界面「查看账号」弹窗展示）。 */
function getChannelAccounts(channelId) {
  const channel = CHANNELS.find((item) => item.id === channelId);
  if (!channel) return [];
  if (channel.id === 'qqbot') {
    const info = botInfoMap.get(channelId);
    if (!info || (!info.botId && !info.botName && !info.appId)) return [];
    return [{
      id: info.botId || info.appId || 'qqbot',
      name: info.botName || 'QQ Bot',
      detail: info.appId ? `AppID: ${info.appId}` : '',
      removable: true,
    }];
  }
  const accounts = accountMap.get(channelId) || [];
  const flat = [];
  for (const entry of accounts) {
    for (const account of (entry.accounts || [])) {
      flat.push({
        id: String(account),
        name: entry.channel || channelId,
        detail: `已绑定 token: ${String(account).slice(0, 10)}…`,
        removable: true,
      });
    }
  }
  return flat;
}

/** 删除渠道账号：停止渠道并清空已保存凭据。 */
async function removeChannelAccount(channel, report) {
  if (running.has(channel.id)) {
    report({ type: 'log', message: '停止渠道进程…' });
    stopChannel(channel.id, report);
  }
  if (channel.id === 'qqbot') {
    updateChannelProfileConfig(channel, { appId: '', appSecret: '' }, report);
    botInfoMap.delete(channel.id);
    report({ type: 'log', message: 'QQ Bot 凭据已清除' });
  } else if (channel.id === 'wxclaw') {
    updateProfilePatchEntry(channel.profile, {
      id: 'im-wxclaw',
      config: { token: '', xWechatUin: '' },
    }, report);
    accountMap.delete(channel.id);
    report({ type: 'log', message: 'wxclaw 账号已清除' });
  }
  return getChannelsStatus();
}

/** 自动启动已绑定凭据的渠道（应用启动后调用）。 */
async function autoStartChannels(managedDirs, detection, send) {
  for (const channel of CHANNELS) {
    if (channel.kind === 'cli') continue;
    if (running.has(channel.id)) continue;
    const dir = profileDir(channel.profile);
    if (!existsSync(path.join(dir, 'package.json'))) continue;

    let bound = false;
    if (channel.id === 'wxclaw') {
      const account = readWxclawAccount(channel);
      bound = Boolean(account && account.token);
    } else {
      const creds = readProfileCredentials(channel);
      bound = Boolean(creds && creds.appId && creds.appSecret);
    }
    if (!bound) continue;

    const report = (payload) => send(channel.id, payload);
    report({ type: 'log', message: `检测到 ${channel.name} 已绑定，自动启动…` });
    try {
      await startChannel(managedDirs, detection, channel, report);
    } catch (error) {
      report({ type: 'log', message: `自动启动失败：${error && error.message ? error.message : error}` });
    }
  }
}

/** 应用退出时停止所有频道进程。 */
function stopAllChannels() {
  for (const channelId of running.keys()) {
    stopChannel(channelId);
  }
}

module.exports = {
  CHANNELS,
  getChannelsStatus,
  installChannel,
  startChannel,
  stopChannel,
  stopAllChannels,
  autoStartChannels,
  checkChannelUpdates,
  updateChannel,
  setChannelDefaultModel,
  getRecentDefaultModel,
  ensurePackChunksOff,
  switchChannelAccount,
  uninstallChannel,
  getChannelAccounts,
  removeChannelAccount,
  ensureDsh,
  ensurePnpm,
  runWithOutput,
  dshHome,
  profileDir,
  updateProfilePatchEntry,
  removeProfilePatchEntry,
  insertProfilePluginRow,
};
