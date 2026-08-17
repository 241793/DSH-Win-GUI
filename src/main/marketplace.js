'use strict';

const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const channels = require('./channels');
const { envWithNodePath } = require('./util');

const MARKET_URL = 'https://www.dshplugin.store';
const INSTALL_PROFILE = 'web';

/** 从 npm spec 提取包名（@scope/pkg@1.2.3 → @scope/pkg；pkg@1.2.3 → pkg）。 */
function packageNameFromSpec(spec) {
  const raw = String(spec || '').trim();
  if (raw.startsWith('@')) {
    const parts = raw.split('/');
    if (parts.length >= 2) return `${parts[0]}/${parts[1].split('@')[0]}`;
    return raw.split('@')[0];
  }
  return raw.split('@')[0];
}

/** 判断 web profile 中已安装的包是否声明了 dsh.bundle（bundle 型插件由 dsh plugin 自动进 bundles）。 */
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

/** 确保 client-only 插件在 profile 树里有入口行（dsh-client-modules 通过 loader entries 发现 dsh.client）。 */
function ensureClientPluginRow(packageName, report) {
  if (isBundlePackage(packageName)) return;
  report({ type: 'log', message: `${packageName} 是 client-only 插件，插入 profile 插件入口行…` });
  channels.insertProfilePluginRow(INSTALL_PROFILE, {
    id: packageName,
    name: packageName,
    config: {},
  }, report);
}

/** 带超时的文本请求。 */
async function fetchText(url, timeoutMs = 60000) {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'DeepSeekHarnessDesktop/0.1' },
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

/** 从市场首页 HTML 解析插件卡片。 */
function parseHomepage(html) {
  const plugins = [];
  const articleRe = /<article[\s\S]*?<\/article>/g;
  let match;
  while ((match = articleRe.exec(html)) !== null) {
    const card = match[0];
    const href = card.match(/href="\/plugin\/([^"#?]+)"/);
    if (!href) continue;
    const repoPath = href[1].trim();
    const name = card.match(/<h2[^>]*>([^<]+)<\/h2>/);
    const owner = repoPath.split('/')[0] || '';
    const repo = repoPath.split('/')[1] || repoPath;
    const stars = card.match(/>([\d.]+[km]?)<!-- -->/i);
    const ps = [...card.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
    const categories = [...card.matchAll(/href="\/category\/([^"]+)"/g)].map((m) => m[1]);
    plugins.push({
      name: (name ? name[1] : repo).trim(),
      owner,
      repo,
      repoPath,
      description: ps[1] || ps[0] || '',
      stars: stars ? stars[1] : '',
      categories,
      href: `${MARKET_URL}/plugin/${repoPath}`,
    });
  }
  return plugins;
}

/** 从 sitemap 兜底解析插件 URL。 */
function parseSitemap(xml) {
  const plugins = [];
  const re = /<loc>https:\/\/dshplugin\.store\/plugin\/([^<]+)<\/loc>/g;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const repoPath = match[1].trim();
    const owner = repoPath.split('/')[0] || '';
    const repo = repoPath.split('/')[1] || repoPath;
    plugins.push({
      name: repo,
      owner,
      repo,
      repoPath,
      description: '来自 dshplugin.store',
      stars: '',
      categories: [],
      href: `${MARKET_URL}/plugin/${repoPath}`,
    });
  }
  return plugins;
}

/** 获取市场插件列表（首页 HTML 优先，sitemap 兜底）。 */
async function fetchMarketplacePlugins() {
  const html = await fetchText(`${MARKET_URL}/`, 90000);
  if (html) {
    const parsed = parseHomepage(html);
    if (parsed.length > 0) return parsed;
  }
  const sitemap = await fetchText(`${MARKET_URL}/sitemap.xml`, 60000);
  if (sitemap) {
    const parsed = parseSitemap(sitemap);
    if (parsed.length > 0) return parsed;
  }
  throw new Error('无法连接插件市场（dshplugin.store），请检查网络后重试。');
}

/** 从插件详情页解析安装/卸载命令。 */
function parseInstallCommands(html) {
  const install = html.match(/dsh plugin --profile\s+(\S+)\s+add\s+(\S+)/);
  const remove = html.match(/dsh plugin --profile\s+(\S+)\s+remove\s+(\S+)/);
  if (!install) return null;
  return {
    profile: install[1],
    spec: install[2],
    removeSpec: remove ? remove[2] : install[2],
  };
}

/** 已安装插件（web profile dependencies）。 */
function getInstalledMarketplacePlugins() {
  const pkgFile = path.join(channels.dshHome(), 'profiles', INSTALL_PROFILE, 'package.json');
  try {
    const manifest = JSON.parse(readFileSync(pkgFile, 'utf8'));
    const deps = manifest.dependencies || {};
    return Object.entries(deps).map(([name, version]) => ({ name, version: String(version || '') }));
  } catch {
    return [];
  }
}

/** 安装市场插件。 */
async function installMarketplacePlugin(managedDirs, detection, repoPath, report) {
  report({ type: 'log', message: `获取插件详情：${MARKET_URL}/plugin/${repoPath}` });
  const html = await fetchText(`${MARKET_URL}/plugin/${repoPath}`, 90000);
  if (!html) throw new Error('无法获取插件详情页。');
  const commands = parseInstallCommands(html);
  if (!commands) throw new Error('详情页未找到安装命令（dsh plugin --profile ... add ...）。');

  const dsh = await channels.ensureDsh(managedDirs, detection, report);
  const pnpm = await channels.ensurePnpm(managedDirs, { nodePath: dsh.nodePath, npmCliPath: dsh.npmCliPath }, report);

  report({ type: 'log', message: `执行：dsh plugin --profile ${commands.profile} add ${commands.spec}` });
  const code = await channels.runWithOutput(dsh.nodePath, [
    dsh.dsh.binPath,
    'plugin',
    '--profile', commands.profile,
    'add', commands.spec,
  ], {
    cwd: os.homedir(),
    env: envWithNodePath(dsh.nodePath, { PATH: pnpm.pathEnv, npm_config_dangerously_allow_all_builds: 'true' }),
  }, report);

  if (code !== 0) throw new Error(`插件安装失败（退出码 ${code}）`);

  const packageName = packageNameFromSpec(commands.spec);
  if (packageName) ensureClientPluginRow(packageName, report);

  report({ type: 'log', message: '插件安装完成，重启 dsh web 后生效。' });
  return getInstalledMarketplacePlugins();
}

/** 卸载市场插件。 */
async function uninstallMarketplacePlugin(managedDirs, detection, spec, report) {
  const dsh = await channels.ensureDsh(managedDirs, detection, report);
  const pnpm = await channels.ensurePnpm(managedDirs, { nodePath: dsh.nodePath, npmCliPath: dsh.npmCliPath }, report);

  report({ type: 'log', message: `执行：dsh plugin --profile ${INSTALL_PROFILE} remove ${spec}` });
  const code = await channels.runWithOutput(dsh.nodePath, [
    dsh.dsh.binPath,
    'plugin',
    '--profile', INSTALL_PROFILE,
    'remove', spec,
  ], {
    cwd: os.homedir(),
    env: envWithNodePath(dsh.nodePath, { PATH: pnpm.pathEnv, npm_config_dangerously_allow_all_builds: 'true' }),
  }, report);

  if (code !== 0) throw new Error(`插件卸载失败（退出码 ${code}）`);

  const packageName = packageNameFromSpec(spec);
  if (packageName) {
    channels.removeProfilePatchEntry(INSTALL_PROFILE, packageName, report);
  }

  report({ type: 'log', message: '插件已卸载，重启 dsh web 后生效。' });
  return getInstalledMarketplacePlugins();
}

module.exports = {
  MARKET_URL,
  fetchMarketplacePlugins,
  getInstalledMarketplacePlugins,
  installMarketplacePlugin,
  uninstallMarketplacePlugin,
};
