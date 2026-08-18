'use strict';

const { dialog } = require('electron');
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { downloadFile, runCapture } = require('./util');

/** dsh 的 skill 根目录（文件系统提供方默认根）。 */
function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

function userSkillRoot() {
  return path.join(dshHome(), 'skills');
}

function userAgentsSkillRoot() {
  return path.join(os.homedir(), '.agents', 'skills');
}

function systemSkillRoot() {
  return path.join(dshHome(), '.system', 'skills');
}

function skillRoots() {
  return [
    { label: '用户 DSH', path: userSkillRoot(), removable: true },
    { label: '用户 Agents', path: userAgentsSkillRoot(), removable: false },
    { label: 'DSH 系统', path: systemSkillRoot(), removable: false },
  ];
}

function parseFrontmatter(text) {
  const match = String(text || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    result[key] = value;
  }
  return result;
}

function readSkillMeta(skillPath) {
  try {
    const text = readFileSync(skillPath, 'utf8');
    const front = parseFrontmatter(text);
    return {
      name: front.name || path.basename(path.dirname(skillPath)) || path.basename(skillPath, '.md'),
      description: front.description || '',
      whenToUse: front.whenToUse || '',
    };
  } catch {
    return { name: '', description: '', whenToUse: '' };
  }
}

/** 扫描单个 skill 根目录，返回可展示的 skill 摘要。 */
function scanSkillRoot(rootInfo) {
  const root = rootInfo.path;
  const out = [];
  if (!existsSync(root)) return out;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    try {
      if (entry.isDirectory()) {
        const skillFile = path.join(full, 'SKILL.md');
        if (existsSync(skillFile)) {
          const meta = readSkillMeta(skillFile);
          out.push({
            name: meta.name || entry.name,
            description: meta.description || '',
            whenToUse: meta.whenToUse || '',
            source: rootInfo.label,
            root: root,
            path: skillFile,
            removable: Boolean(rootInfo.removable),
          });
        }
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        const meta = readSkillMeta(full);
        out.push({
          name: meta.name || entry.name.replace(/\.md$/i, ''),
          description: meta.description || '',
          whenToUse: meta.whenToUse || '',
          source: rootInfo.label,
          root: root,
          path: full,
          removable: Boolean(rootInfo.removable),
        });
      }
    } catch { /* 跳过损坏条目 */ }
  }
  return out;
}

/** 列出当前所有可发现的 skill。 */
function listSkills() {
  const all = [];
  for (const root of skillRoots()) {
    all.push(...scanSkillRoot(root));
  }
  // 按来源、名称排序
  all.sort((a, b) => (a.source === b.source ? a.name.localeCompare(b.name) : a.source.localeCompare(b.source)));
  return all;
}

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else {
      mkdirSync(path.dirname(d), { recursive: true });
      copyFileSync(s, d);
    }
  }
}

function normalizeSkillName(name) {
  return String(name || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

/** 本地导入 skill：选择包含 SKILL.md 的文件夹，或单个 .md 文件。 */
async function importLocalSkill(report) {
  const result = await dialog.showOpenDialog({
    title: '选择 skill（SKILL.md 所在文件夹，或单个 .md 文件）',
    properties: ['openFile', 'openDirectory'],
    filters: [{ name: 'Skill', extensions: ['md'] }],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    report({ type: 'log', message: '已取消选择。' });
    return listSkills();
  }

  const target = result.filePaths[0];
  const stat = statSync(target);
  const destRoot = userSkillRoot();
  mkdirSync(destRoot, { recursive: true });

  if (stat.isFile()) {
    if (!target.toLowerCase().endsWith('.md')) {
      throw new Error('请选择 .md 格式的 skill 文件。');
    }
    const name = normalizeSkillName(path.basename(target, '.md'));
    const dest = path.join(destRoot, `${name || 'skill'}.md`);
    report({ type: 'log', message: `导入 skill 文件：${target} → ${dest}` });
    copyFileSync(target, dest);
    report({ type: 'log', message: '导入完成。' });
    return listSkills();
  }

  if (stat.isDirectory()) {
    if (existsSync(path.join(target, 'SKILL.md'))) {
      const name = normalizeSkillName(path.basename(target));
      const dest = path.join(destRoot, name || 'skill');
      report({ type: 'log', message: `导入 skill 目录：${target} → ${dest}` });
      rmSync(dest, { recursive: true, force: true });
      copyDir(target, dest);
      report({ type: 'log', message: '导入完成。' });
      return listSkills();
    }

    // 如果选中的目录里直接包含多个 skill 子目录，则逐个导入。
    let imported = 0;
    for (const entry of readdirSync(target, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(target, entry.name, 'SKILL.md');
      if (!existsSync(skillFile)) continue;
      const name = normalizeSkillName(entry.name);
      const dest = path.join(destRoot, name || entry.name);
      report({ type: 'log', message: `导入 skill：${target}\\${entry.name} → ${dest}` });
      rmSync(dest, { recursive: true, force: true });
      copyDir(path.join(target, entry.name), dest);
      imported += 1;
    }
    if (imported === 0) {
      throw new Error('所选目录不是有效 skill（缺少 SKILL.md 或没有包含 skill 子目录）。');
    }
    report({ type: 'log', message: `共导入 ${imported} 个 skill。` });
    return listSkills();
  }

  throw new Error('未知的选择类型。');
}

/** 解析 GitHub 链接 → {owner, repo, source}。 */
function parseGitLink(link) {
  const raw = String(link || '').trim();
  const m = raw.match(/github\.com[:/]([^/]+)\/([^/?#]+?)(?:\.git)?(?:[/?#]|$)/i);
  if (!m) return null;
  return {
    owner: m[1],
    repo: m[2].replace(/\.git$/, ''),
    source: raw,
  };
}

async function fetchRawText(url) {
  const resp = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.text();
}

/** 查看 skill 链接信息：优先读取 GitHub 仓库根目录的 SKILL.md。 */
async function inspectSkillLink(link) {
  const git = parseGitLink(link);
  if (!git) {
    return {
      name: String(link || '').split('/').filter(Boolean).pop() || '未知 skill',
      description: '无法解析为 GitHub 仓库链接，安装时可能失败。',
      owner: '',
      repo: '',
      source: link,
    };
  }
  const candidates = [
    `https://raw.githubusercontent.com/${git.owner}/${git.repo}/HEAD/SKILL.md`,
    `https://raw.githubusercontent.com/${git.owner}/${git.repo}/HEAD/skills/SKILL.md`,
    `https://raw.githubusercontent.com/${git.owner}/${git.repo}/HEAD/skills/${git.repo}/SKILL.md`,
  ];
  for (const url of candidates) {
    try {
      const text = await fetchRawText(url);
      const meta = parseFrontmatter(text);
      return {
        name: meta.name || git.repo,
        description: meta.description || 'GitHub 仓库中的 skill。',
        owner: git.owner,
        repo: git.repo,
        source: git.source,
      };
    } catch { /* 继续尝试下一个路径 */ }
  }
  return {
    name: git.repo,
    description: `GitHub 仓库 ${git.owner}/${git.repo}（未在常见位置找到 SKILL.md，安装时会自动扫描仓库内容）。`,
    owner: git.owner,
    repo: git.repo,
    source: git.source,
  };
}

/** 从 GitHub tarball 安装 skill。 */
async function installSkillLink(link, report) {
  const git = parseGitLink(link);
  if (!git) throw new Error('仅支持 GitHub 仓库链接。');

  const tarballDir = path.join(dshHome(), 'skill-tarballs');
  const extractDir = path.join(tarballDir, `extract-${Date.now()}`);
  mkdirSync(tarballDir, { recursive: true });
  const tarballFile = path.join(tarballDir, `${git.owner}-${git.repo}-${Date.now()}.tgz`);

  report({ type: 'log', message: `下载 GitHub 仓库：${git.owner}/${git.repo}` });
  await downloadFile(`https://api.github.com/repos/${git.owner}/${git.repo}/tarball`, tarballFile, (p) => {
    report({ type: 'progress', stage: 'skill', ...p });
  });
  report({ type: 'log', message: '下载完成，正在解压…' });

  mkdirSync(extractDir, { recursive: true });
  const extract = await runCapture('tar', ['-xzf', tarballFile, '-C', extractDir], { timeout: 180000 });
  if (extract.code !== 0) {
    rmSync(extractDir, { recursive: true, force: true });
    rmSync(tarballFile, { force: true });
    throw new Error(`解压失败：${extract.stderr || extract.code}`);
  }

  // GitHub tarball 顶层一般是 <repo>-<commit>/
  const topEntries = readdirSync(extractDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  const rootDir = topEntries.length > 0 ? path.join(extractDir, topEntries[0].name) : extractDir;

  const destRoot = userSkillRoot();
  mkdirSync(destRoot, { recursive: true });
  const installed = [];

  const installOne = (src, preferredName) => {
    const name = normalizeSkillName(preferredName || path.basename(src));
    const dest = path.join(destRoot, name || 'skill');
    report({ type: 'log', message: `安装 skill：${name || path.basename(src)}` });
    rmSync(dest, { recursive: true, force: true });
    copyDir(src, dest);
    installed.push(name || path.basename(src));
  };

  const hasSkill = (dir) => existsSync(path.join(dir, 'SKILL.md'));

  if (hasSkill(rootDir)) {
    installOne(rootDir, git.repo);
  } else {
    const skillsDir = path.join(rootDir, 'skills');
    if (existsSync(skillsDir)) {
      for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
        const full = path.join(skillsDir, entry.name);
        if (entry.isDirectory() && hasSkill(full)) installOne(full, entry.name);
        else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
          const name = normalizeSkillName(path.basename(entry.name, '.md'));
          const dest = path.join(destRoot, `${name || 'skill'}.md`);
          report({ type: 'log', message: `安装 skill 文件：${entry.name}` });
          copyFileSync(full, dest);
          installed.push(name || path.basename(entry.name, '.md'));
        }
      }
    } else {
      for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const full = path.join(rootDir, entry.name);
        if (hasSkill(full)) installOne(full, entry.name);
      }
    }
  }

  rmSync(extractDir, { recursive: true, force: true });
  rmSync(tarballFile, { force: true });

  if (installed.length === 0) {
    throw new Error('仓库中未找到可安装的 skill（需要 SKILL.md）。');
  }
  report({ type: 'log', message: `安装完成：${installed.join(', ')}` });
  return listSkills();
}

/** 删除用户 DSH 根目录下的 skill。 */
function removeSkill(name, report) {
  const root = userSkillRoot();
  const dir = path.join(root, name);
  const file = path.join(root, `${name}.md`);
  if (existsSync(dir)) {
    report({ type: 'log', message: `删除 skill：${name}` });
    rmSync(dir, { recursive: true, force: true });
  } else if (existsSync(file)) {
    report({ type: 'log', message: `删除 skill：${name}` });
    rmSync(file, { force: true });
  } else {
    throw new Error(`未找到 skill：${name}`);
  }
  return listSkills();
}

/** 技能市场：保存用户自定义市场源。 */
function marketSourceFile() {
  return path.join(dshHome(), 'skill-market-source.json');
}

function getMarketSource() {
  try {
    const raw = readFileSync(marketSourceFile(), 'utf8');
    const data = JSON.parse(raw);
    return data && data.source ? data.source : 'https://github.com/anbeime/skill/tree/main/skills';
  } catch {
    return 'https://github.com/anbeime/skill/tree/main/skills';
  }
}

function setMarketSource(link) {
  const source = String(link || '').trim();
  if (!source) throw new Error('市场源不能为空');
  mkdirSync(path.dirname(marketSourceFile()), { recursive: true });
  writeFileSync(marketSourceFile(), JSON.stringify({ source }, null, 2));
  return source;
}

/** 解析市场源链接：支持 https://github.com/owner/repo/tree/ref/path */
function parseMarketLink(link) {
  const raw = String(link || '').trim();
  const m = raw.match(/^https?:\/\/github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?(?:\/tree\/([^/?#]+)(?:\/(.*))?)?(?:[?#].*)?$/i);
  if (!m) throw new Error('仅支持 GitHub 仓库链接作为技能市场源。');
  const owner = m[1];
  const repo = m[2].replace(/\.git$/, '');
  const ref = m[3] || 'HEAD';
  const pathPart = (m[4] || '').replace(/^\/+|\/+$/g, '');
  return {
    owner,
    repo,
    ref,
    path: pathPart || 'skills',
    source: raw,
  };
}

async function fetchJson(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'DeepSeekHarnessDesktop/0.1.0', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`GitHub API 请求失败：HTTP ${resp.status}`);
  return await resp.json();
}

async function fetchRepoTree(info) {
  const url = `https://api.github.com/repos/${info.owner}/${info.repo}/git/trees/${encodeURIComponent(info.ref)}?recursive=1`;
  const data = await fetchJson(url);
  if (data.truncated) throw new Error('仓库目录过大，GitHub API 返回截断，请使用更具体的 skills 子目录作为市场源。');
  return Array.isArray(data.tree) ? data.tree : [];
}

function rawSkillUrl(info, filePath) {
  return `https://raw.githubusercontent.com/${info.owner}/${info.repo}/${info.ref}/${filePath}`;
}

/** 列出市场源下的 skill。 */
async function listMarketSkills(link) {
  const info = parseMarketLink(link);
  const tree = await fetchRepoTree(info);
  const base = info.path.replace(/^\/+|\/+$/g, '');
  const prefix = base ? `${base}/` : '';
  const candidates = tree.filter((entry) => entry.type === 'blob' && entry.path.startsWith(prefix));
  const map = new Map();

  for (const entry of candidates) {
    const rel = entry.path.slice(prefix.length);
    const parts = rel.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    if (parts.length === 1) {
      if (parts[0].toLowerCase().endsWith('.md')) {
        const name = parts[0].replace(/\.md$/i, '');
        if (!map.has(name)) map.set(name, { name, kind: 'file', main: entry.path, files: [] });
        map.get(name).files.push(entry.path);
      }
    } else if (parts[parts.length - 1].toLowerCase() === 'skill.md') {
      const name = parts[0];
      if (!map.has(name)) map.set(name, { name, kind: 'dir', main: entry.path, files: [] });
      map.get(name).files.push(entry.path);
    } else {
      const name = parts[0];
      if (map.has(name)) map.get(name).files.push(entry.path);
    }
  }

  const result = [];
  for (const skill of map.values()) {
    const text = await fetchRawText(rawSkillUrl(info, skill.main));
    const meta = parseFrontmatter(text);
    result.push({
      name: meta.name || skill.name,
      description: meta.description || '',
      whenToUse: meta.whenToUse || '',
      metadata: meta.metadata || '',
      kind: skill.kind,
      main: skill.main,
      files: skill.files,
      source: link,
      owner: info.owner,
      repo: info.repo,
      ref: info.ref,
      path: info.path,
    });
  }

  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

/** 查看市场 skill 详情（含正文前 10000 字符）。 */
async function viewMarketSkill(link, name) {
  const list = await listMarketSkills(link);
  const item = list.find((skill) => skill.name === name);
  if (!item) throw new Error(`未在市场源中找到 skill：${name}`);
  const info = parseMarketLink(link);
  const text = await fetchRawText(rawSkillUrl(info, item.main));
  return { ...item, content: text.slice(0, 10000) };
}

/** 从市场源下载指定 skill 到 ~/.dsh/skills。 */
async function installMarketSkill(link, name, report) {
  const list = await listMarketSkills(link);
  const item = list.find((skill) => skill.name === name);
  if (!item) throw new Error(`未在市场源中找到 skill：${name}`);
  const info = parseMarketLink(link);

  const destRoot = userSkillRoot();
  mkdirSync(destRoot, { recursive: true });
  const destName = normalizeSkillName(name) || 'skill';

  if (item.kind === 'file') {
    const text = await fetchRawText(rawSkillUrl(info, item.main));
    const dest = path.join(destRoot, `${destName}.md`);
    report({ type: 'log', message: `下载市场 skill：${name}` });
    writeFileSync(dest, text);
    report({ type: 'log', message: `已安装到 ${dest}` });
    return listSkills();
  }

  const skillDir = path.posix.dirname(item.main);
  const dest = path.join(destRoot, destName);
  report({ type: 'log', message: `下载市场 skill：${name}` });
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  for (const filePath of item.files) {
    const rel = path.posix.relative(skillDir, filePath);
    if (!rel || rel.startsWith('..') || path.posix.isAbsolute(rel)) continue;
    const text = await fetchRawText(rawSkillUrl(info, filePath));
    const destFile = path.join(dest, rel);
    mkdirSync(path.dirname(destFile), { recursive: true });
    writeFileSync(destFile, text);
  }
  report({ type: 'log', message: `已安装 ${name}（${item.files.length} 个文件）` });
  return listSkills();
}

module.exports = {
  listSkills,
  importLocalSkill,
  inspectSkillLink,
  installSkillLink,
  removeSkill,
  userSkillRoot,
  getMarketSource,
  setMarketSource,
  listMarketSkills,
  viewMarketSkill,
  installMarketSkill,
};
