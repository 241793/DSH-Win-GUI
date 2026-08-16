'use strict';

const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const {
  MIN_NODE_VERSION,
  runCapture,
  resolveNpmCli,
  versionAtLeast,
  findNodeExe,
  findDshPrefixesInPath,
} = require('./util');

const DSH_PACKAGE_JSON = 'package.json';
const COMMON_NODE_PATHS = [
  path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'nodejs', 'node.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
  path.join(process.env['LOCALAPPDATA'] || '', 'Programs', 'nodejs', 'node.exe'),
].filter((p) => p.includes('nodejs'));
const DSH_BIN_REL = path.join('node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
const FRONTEND_REL_NESTED = path.join(
  'node_modules', '@deepseek-ai', 'dsh', 'node_modules',
  '@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html',
);
const FRONTEND_REL_HOISTED = path.join(
  'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html',
);

/**
 * 探测某个 node 可执行文件是否可用。
 * @param {string|null} nodePath node 可执行文件路径；传 null 表示从 PATH 找 node
 */
async function probeNode(nodePath) {
  const cmd = nodePath || 'node';
  const versionCapture = await runCapture(cmd, ['-v'], { timeout: 20000 });
  if (versionCapture.error || versionCapture.code !== 0) {
    return { installed: false, version: null, path: nodePath, tooOld: false, npm: { installed: false, version: null, cliPath: null } };
  }
  const version = versionCapture.stdout.trim();
  const tooOld = !versionAtLeast(version, MIN_NODE_VERSION);
  let resolvedPath = nodePath;
  if (!resolvedPath) {
    const pathCapture = await runCapture('node', ['-e', 'process.stdout.write(process.execPath)'], { timeout: 20000 });
    if (pathCapture.code === 0) resolvedPath = pathCapture.stdout.trim();
  }
  const npmCliPath = resolveNpmCli(resolvedPath);
  let npmVersion = null;
  if (npmCliPath && !tooOld) {
    const npmCapture = await runCapture(resolvedPath, [npmCliPath, '-v'], { timeout: 60000 });
    if (npmCapture.code === 0) npmVersion = npmCapture.stdout.trim();
  }
  return {
    installed: true,
    version,
    path: resolvedPath,
    tooOld,
    npm: { installed: Boolean(npmVersion), version: npmVersion, cliPath: npmCliPath },
  };
}

/** 从用户/全局 .npmrc 中读取可能配置的 prefix（不需要 spawn npm）。 */
function readNpmrcPrefixes() {
  const candidates = [];
  const files = [
    path.join(process.env.USERPROFILE || '', '.npmrc'),
    path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'npm', 'etc', 'npmrc'),
  ];
  for (const file of files) {
    try {
      const text = readFileSync(file, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*prefix\s*=\s*(.+?)\s*$/);
        if (match) candidates.push(match[1].replace(/^["']|["']$/g, ''));
      }
    } catch { /* noop */ }
  }
  return candidates;
}

/**
 * 探测某个 prefix 下是否安装了 dsh。
 * @param {string} prefix npm prefix（node_modules 所在目录）
 * @returns {object|null}
 */
function probeDshPrefix(prefix) {
  const binPath = path.join(prefix, DSH_BIN_REL);
  if (!existsSync(binPath)) return null;
  const pkgPath = path.join(prefix, 'node_modules', '@deepseek-ai', 'dsh', DSH_PACKAGE_JSON);
  let version = null;
  try {
    version = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
  } catch { /* noop */ }
  const frontendDistOk = existsSync(path.join(prefix, FRONTEND_REL_NESTED))
    || existsSync(path.join(prefix, FRONTEND_REL_HOISTED));
  return { prefix, binPath, version, frontendDistOk };
}

/**
 * 全局检测：Node、npm、dsh（全局 npm 前缀与桌面端自管 prefix 二选一）。
 * @param {{nodePath: string, prefix: string}} managedDirs 桌面端自管目录
 */
async function detectAll(managedDirs) {
  let systemNode = await probeNode(null);
  if (!systemNode.installed) {
    for (const nodePath of COMMON_NODE_PATHS) {
      const candidate = await probeNode(nodePath);
      if (candidate.installed) { systemNode = candidate; break; }
    }
  }
  const managedNodePath = findNodeExe(managedDirs.nodeDir) || managedDirs.nodePath;
  const managedNode = await probeNode(managedNodePath);

  // 选一个能用的 node：优先系统 node，其次自管 node。
  let node = null;
  if (systemNode.installed && !systemNode.tooOld && systemNode.npm.installed) node = systemNode;
  else if (managedNode.installed && !managedNode.tooOld && managedNode.npm.installed) node = managedNode;
  else if (systemNode.installed) node = systemNode;
  else if (managedNode.installed) node = managedNode;

  // 从 dsh 的安装位置找：npm 全局 prefix、PATH 扫描、常见全局目录、自管 prefix。
  let dsh = null;
  const dshPrefixes = [];
  const addPrefix = (prefix, source) => {
    if (prefix && !dshPrefixes.some((item) => item.prefix === prefix)) {
      dshPrefixes.push({ prefix, source });
    }
  };

  if (node && node.npm.installed) {
    // 注意：npm prefix -g 返回的是 prefix（如 D:\...\npm），不是 node_modules 目录。
    const prefixCapture = await runCapture(node.path, [node.npm.cliPath, 'prefix', '-g'], { timeout: 60000 });
    if (prefixCapture.code === 0) addPrefix(prefixCapture.stdout.trim(), 'global');
  }
  for (const prefix of findDshPrefixesInPath()) addPrefix(prefix, 'global');
  for (const prefix of readNpmrcPrefixes()) addPrefix(prefix, 'global');
  addPrefix(path.join(process.env.APPDATA || '', 'npm'), 'global');
  addPrefix(managedDirs.prefix, 'managed');

  for (const candidate of dshPrefixes) {
    const found = probeDshPrefix(candidate.prefix);
    if (found) {
      dsh = { ...found, source: candidate.source, nodePath: node ? node.path : null };
      break;
    }
  }

  // 明确缺失项，用于安装页展示。
  const missing = {
    node: !(systemNode.installed || managedNode.installed),
    nodeTooOld: Boolean(
      (systemNode.installed && systemNode.tooOld)
      || (managedNode.installed && managedNode.tooOld)
    ) && !(node && !node.tooOld),
    npm: !(node && node.npm.installed),
    dsh: !dsh,
    frontendDist: Boolean(dsh) && !dsh.frontendDistOk,
  };

  const ready = Boolean(
    node
    && !node.tooOld
    && node.npm.installed
    && dsh
    && dsh.frontendDistOk
    && dsh.nodePath,
  );

  return {
    ready,
    minNodeVersion: MIN_NODE_VERSION,
    node,
    systemNode,
    managedNode,
    dsh,
    missing,
  };
}

module.exports = { detectAll, probeNode, probeDshPrefix, readNpmrcPrefixes, MIN_NODE_VERSION };
