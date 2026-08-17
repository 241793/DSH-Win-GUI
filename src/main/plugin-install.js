'use strict';

const { existsSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const channels = require('./channels');
const { envWithNodePath } = require('./util');

const INSTALL_PROFILE = 'web';

function historyFile() {
  return path.join(channels.dshHome(), 'plugin-install-history.json');
}

function readHistory() {
  try {
    return JSON.parse(readFileSync(historyFile(), 'utf8'));
  } catch {
    return [];
  }
}

function writeHistory(entries) {
  try {
    mkdirSync(path.dirname(historyFile()), { recursive: true });
    writeFileSync(historyFile(), JSON.stringify(entries, null, 2));
  } catch { /* ignore */ }
}

function addHistory(entry) {
  const entries = readHistory().filter((item) => item.name !== entry.name);
  entries.unshift(entry);
  writeHistory(entries);
  return entries;
}

function removeHistory(name) {
  const entries = readHistory().filter((item) => item.name !== name);
  writeHistory(entries);
  return entries;
}

/** 解析 GitHub 链接 → {owner, repo, spec}。spec 使用 GitHub 官方 tarball（无需安装 git）。 */
function parseGitLink(link) {
  const raw = String(link || '').trim();
  const m = raw.match(/github\.com[:/]([^/]+)\/([^/?#]+?)(?:\.git)?(?:[/?#]|$)/i);
  if (m) {
    const owner = m[1];
    const repo = m[2].replace(/\.git$/, '');
    return {
      owner,
      repo,
      spec: `https://api.github.com/repos/${owner}/${repo}/tarball`,
      source: raw,
    };
  }
  return null;
}

/** 查看插件链接信息（GitHub 拉取 package.json）。 */
async function inspectPluginLink(link) {
  const git = parseGitLink(link);
  if (!git) {
    return {
      name: String(link || '').split('/').filter(Boolean).pop() || '未知插件',
      version: '',
      description: '无法解析该链接为 GitHub 仓库，安装时将作为 git 地址直接使用。',
      owner: '',
      repo: '',
      spec: `git+${link}`,
      source: link,
    };
  }
  const rawUrl = `https://raw.githubusercontent.com/${git.owner}/${git.repo}/HEAD/package.json`;
  try {
    const resp = await fetch(rawUrl, { signal: AbortSignal.timeout(30000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const pkg = await resp.json();
    return {
      name: pkg.name || git.repo,
      version: pkg.version || '',
      description: pkg.description || '',
      owner: git.owner,
      repo: git.repo,
      spec: git.spec,
      source: git.source,
      dsh: pkg.dsh ? Boolean(pkg.dsh.bundle || pkg.dsh.client) : false,
    };
  } catch (error) {
    return {
      name: git.repo,
      version: '',
      description: `GitHub 仓库 ${git.owner}/${git.repo}（无法读取 package.json：${error && error.message ? error.message : error}）`,
      owner: git.owner,
      repo: git.repo,
      spec: git.spec,
      source: git.source,
    };
  }
}

/** 执行 dsh plugin add。 */
async function runDshPluginAdd(managedDirs, detection, spec, report) {
  const dsh = await channels.ensureDsh(managedDirs, detection, report);
  const pnpm = await channels.ensurePnpm(managedDirs, { nodePath: dsh.nodePath, npmCliPath: dsh.npmCliPath }, report);
  report({ type: 'log', message: `执行：dsh plugin --profile ${INSTALL_PROFILE} add ${spec} --dangerously-allow-all-builds` });
  const code = await channels.runWithOutput(dsh.nodePath, [
    dsh.dsh.binPath,
    'plugin',
    '--profile', INSTALL_PROFILE,
    'add', spec,
    '--dangerously-allow-all-builds',
  ], {
    cwd: os.homedir(),
    env: envWithNodePath(dsh.nodePath, { PATH: pnpm.pathEnv, npm_config_dangerously_allow_all_builds: 'true' }),
  }, report);
  if (code !== 0) throw new Error(`插件安装失败（退出码 ${code}）`);
  return true;
}

/** 判断 web profile 中已安装的包是否声明了 dsh.bundle。 */
function isBundlePackage(packageName) {
  try {
    const pkgFile = path.join(channels.dshHome(), 'profiles', INSTALL_PROFILE, 'node_modules', ...packageName.split('/'), 'package.json');
    if (!existsSync(pkgFile)) return false;
    const manifest = JSON.parse(readFileSync(pkgFile, 'utf8'));
    return Boolean(manifest && manifest.dsh && manifest.dsh.bundle && manifest.dsh.bundle.patch);
  } catch {
    return false;
  }
}

/** client-only 插件写入 profile 入口行（参考插件市场逻辑）。 */
function ensureClientPluginRow(packageName, report) {
  if (isBundlePackage(packageName)) {
    report({ type: 'log', message: `${packageName} 是 bundle 型插件，dsh plugin 已自动加入 bundles。` });
    return;
  }
  report({ type: 'log', message: `${packageName} 是 client-only 插件，插入 profile 入口行…` });
  channels.insertProfilePluginRow(INSTALL_PROFILE, {
    id: packageName,
    name: packageName,
    config: {},
  }, report);
}

/** 本地导入：选择文件夹/package.json 并安装到 web profile。 */
async function importLocalPlugin(managedDirs, detection, report) {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    title: '选择 dsh 插件文件夹（或 package.json）',
    properties: ['openFile', 'openDirectory'],
    filters: [{ name: 'package.json', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    report({ type: 'log', message: '已取消选择。' });
    return readHistory();
  }
  let target = result.filePaths[0];
  let stat = null;
  try { stat = require('node:fs').statSync(target); } catch { /* noop */ }
  if (stat && stat.isFile()) target = path.dirname(target);
  if (!existsSync(path.join(target, 'package.json'))) {
    throw new Error('所选目录不是有效的插件包（缺少 package.json）。');
  }
  report({ type: 'log', message: `本地插件目录：${target}` });
  await runDshPluginAdd(managedDirs, detection, target, report);
  const pkg = JSON.parse(readFileSync(path.join(target, 'package.json'), 'utf8'));
  const name = pkg.name || path.basename(target);
  ensureClientPluginRow(name, report);
  return addHistory({
    name,
    source: 'local',
    path: target,
    installedAt: new Date().toISOString(),
  });
}

/** 下载文件到本地（带进度日志）。 */
async function downloadFile(url, dest, report) {
  const { createWriteStream } = require('node:fs');
  const resp = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180000) });
  if (!resp.ok) throw new Error(`下载失败：HTTP ${resp.status}`);
  const total = Number(resp.headers.get('content-length')) || 0;
  let received = 0;
  const ws = createWriteStream(dest);
  for await (const chunk of resp.body) {
    received += chunk.length;
    ws.write(chunk);
  }
  await new Promise((resolve, reject) => {
    ws.end(resolve);
    ws.on('error', reject);
  });
  report({ type: 'log', message: `下载完成：${(received / 1024 / 1024).toFixed(1)} MB` });
  return dest;
}

/** 从链接安装。GitHub 仓库先下载 tarball 到本地再安装，避免依赖 git。 */
async function installPluginLink(managedDirs, detection, link, report) {
  const info = await inspectPluginLink(link);
  const git = parseGitLink(link);
  let spec = info.spec;
  let tarballFile = null;
  if (git) {
    const dir = path.join(channels.dshHome(), 'plugin-tarballs');
    mkdirSync(dir, { recursive: true });
    tarballFile = path.join(dir, `${git.owner}-${git.repo}-${Date.now()}.tgz`);
    report({ type: 'log', message: `下载 GitHub 仓库 tarball：${git.owner}/${git.repo}` });
    await downloadFile(`https://api.github.com/repos/${git.owner}/${git.repo}/tarball`, tarballFile, report);
    spec = tarballFile;
  }
  await runDshPluginAdd(managedDirs, detection, spec, report);
  ensureClientPluginRow(info.name, report);
  return addHistory({
    name: info.name,
    source: 'git',
    path: info.source || link,
    spec: info.spec,
    tarball: tarballFile,
    installedAt: new Date().toISOString(),
  });
}

/** 卸载本界面安装的插件。 */
async function removeInstalledPlugin(managedDirs, detection, name, report) {
  const dsh = await channels.ensureDsh(managedDirs, detection, report);
  const pnpm = await channels.ensurePnpm(managedDirs, { nodePath: dsh.nodePath, npmCliPath: dsh.npmCliPath }, report);
  report({ type: 'log', message: `执行：dsh plugin --profile ${INSTALL_PROFILE} remove ${name}` });
  const code = await channels.runWithOutput(dsh.nodePath, [
    dsh.dsh.binPath,
    'plugin',
    '--profile', INSTALL_PROFILE,
    'remove', name,
  ], {
    cwd: os.homedir(),
    env: envWithNodePath(dsh.nodePath, { PATH: pnpm.pathEnv, npm_config_dangerously_allow_all_builds: 'true' }),
  }, report);
  if (code !== 0) throw new Error(`插件卸载失败（退出码 ${code}）`);
  channels.removeProfilePatchEntry(INSTALL_PROFILE, name, report);
  return removeHistory(name);
}

module.exports = {
  readHistory,
  importLocalPlugin,
  inspectPluginLink,
  installPluginLink,
  removeInstalledPlugin,
};
