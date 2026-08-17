'use strict';

/* global window, document, console */

const api = window.desktopAPI;

const views = {
  checking: document.getElementById('view-checking'),
  starting: document.getElementById('view-starting'),
  install: document.getElementById('view-install'),
  error: document.getElementById('view-error'),
};

const rows = {
  node: document.getElementById('row-node'),
  npm: document.getElementById('row-npm'),
  dsh: document.getElementById('row-dsh'),
  dist: document.getElementById('row-dist'),
};

const details = {
  node: document.getElementById('node-detail'),
  npm: document.getElementById('npm-detail'),
  dsh: document.getElementById('dsh-detail'),
  dist: document.getElementById('dist-detail'),
};

const installActions = document.getElementById('install-actions');
const installProgress = document.getElementById('install-progress');
const progressBar = document.getElementById('progress-bar');
const progressStage = document.getElementById('progress-stage');
const installLog = document.getElementById('install-log');
const errorText = document.getElementById('error-text');

let detection = null;
let installing = false;
let installLogLines = [];

function showView(name) {
  Object.values(views).forEach((el) => { el.hidden = true; });
  views[name].hidden = false;
}

function setRow(name, state, text) {
  const row = rows[name];
  row.classList.remove('ok', 'warn', 'err', 'pending');
  row.classList.add(state);
  details[name].textContent = text;
}

function logInstall(message) {
  installLogLines.push(message);
  if (installLogLines.length > 200) installLogLines = installLogLines.slice(-200);
  installLog.textContent = installLogLines.join('\n');
  installLog.scrollTop = installLog.scrollHeight;
}

function appendProgress(payload) {
  if (payload.type === 'log') {
    const message = payload.message || '';
    logInstall(message);
    if (message.includes('正在安装')) progressStage.textContent = '正在安装 DeepSeek Harness（npm install）…';
    else if (message.includes('下载')) progressStage.textContent = '正在下载 Node.js…';
    else if (message.includes('解压')) progressStage.textContent = '正在解压 Node.js…';
    else if (message.includes('安装完成') || message.includes('已存在')) progressStage.textContent = '安装完成';
  } else if (payload.type === 'progress') {
    if (typeof payload.percent === 'number' && payload.percent >= 0) {
      progressBar.style.width = `${payload.percent}%`;
      progressStage.textContent = `正在下载 Node.js… ${payload.percent}%`;
    } else if (payload.received) {
      progressStage.textContent = `正在下载 Node.js… ${(payload.received / 1024 / 1024).toFixed(1)} MB`;
    }
  } else if (payload.type === 'done') {
    progressBar.style.width = '100%';
    progressStage.textContent = '安装完成';
  }
}

function renderDetection(info) {
  detection = info;
  document.getElementById('min-node').textContent = info.minNodeVersion || '22.5.0';

  const systemNode = info.systemNode || {};
  const managedNode = info.managedNode || {};
  const node = info.node;
  const dsh = info.dsh;

  if (node && !node.tooOld) {
    setRow('node', 'ok', `v${node.version}${node.path ? '（' + node.path + '）' : ''}`);
  } else if ((systemNode.installed && systemNode.tooOld) || (managedNode.installed && managedNode.tooOld)) {
    const v = (systemNode.version || managedNode.version || '?');
    setRow('node', 'warn', `版本过低 v${v}，需要 ≥ ${info.minNodeVersion}`);
  } else {
    setRow('node', 'err', '未检测到 Node.js');
  }

  if (node && node.npm && node.npm.installed) {
    setRow('npm', 'ok', `v${node.npm.version}`);
  } else {
    setRow('npm', 'err', node && !node.tooOld ? 'npm 不可用' : '需要先安装 Node.js');
  }

  if (dsh && dsh.frontendDistOk) {
    setRow('dsh', 'ok', `v${dsh.version || '?'}（${dsh.source === 'global' ? '全局安装' : '应用自管'}）`);
  } else if (dsh) {
    setRow('dsh', 'warn', '已安装但前端资源缺失');
  } else {
    setRow('dsh', 'err', '未安装');
  }

  if (dsh && dsh.frontendDistOk) {
    setRow('dist', 'ok', '就绪');
  } else if (dsh) {
    setRow('dist', 'err', '缺失，需要重新安装');
  } else {
    setRow('dist', 'err', '需要安装 dsh');
  }
}

async function refreshAndStart() {
  installLogLines = [];
  installLog.textContent = '';
  showView('checking');
  try {
    const info = await api.detect();
    renderDetection(info);

    if (info.ready) {
      showView('starting');
      const started = await api.start();
      // 同一窗口直接跳到 Harness 界面
      window.location.href = started.url;
      return;
    }

    showView('install');
    installActions.hidden = false;
    installProgress.hidden = true;
  } catch (error) {
    showError(error);
  }
}

function showError(error) {
  const message = error && error.message ? error.message : String(error);
  errorText.textContent = message;
  showView('error');
}

async function startInstall() {
  if (installing) return;
  installing = true;
  installActions.hidden = true;
  installProgress.hidden = false;
  progressBar.style.width = '0%';
  progressStage.textContent = '准备中…';
  logInstall('开始安装…');

  try {
    await api.install();
    installing = false;
    logInstall('安装完成，正在重新检测…');
    await refreshAndStart();
  } catch (error) {
    installing = false;
    logInstall(`安装失败：${error && error.message ? error.message : error}`);
    showError(error);
  }
}

document.getElementById('btn-install').addEventListener('click', startInstall);
document.getElementById('btn-recheck').addEventListener('click', refreshAndStart);
document.getElementById('btn-retry').addEventListener('click', refreshAndStart);
document.getElementById('btn-install-from-error').addEventListener('click', () => {
  if (detection) {
    renderDetection(detection);
    showView('install');
    installActions.hidden = false;
    installProgress.hidden = true;
  } else {
    refreshAndStart();
  }
});

const btnCopyError = document.getElementById('btn-copy-error');
btnCopyError.addEventListener('click', async () => {
  const errorMessage = errorText.textContent || '';
  const logText = installLogLines.length > 0 ? installLogLines.join('\n') : '（无安装日志）';
  const fullText = `[错误信息]\n${errorMessage}\n\n[安装日志]\n${logText}\n`;
  try {
    await api.copyText(fullText);
    btnCopyError.textContent = '已复制，可粘贴提交';
    setTimeout(() => { btnCopyError.textContent = '复制报错日志'; }, 2000);
  } catch {
    btnCopyError.textContent = '复制失败';
    setTimeout(() => { btnCopyError.textContent = '复制报错日志'; }, 2000);
  }
});
document.getElementById('repo-link').addEventListener('click', (event) => {
  event.preventDefault();
  api.openExternal('https://github.com/deepseek-ai/deepseek-harness');
});
api.onInstallProgress(appendProgress);
api.onBackendProgress(() => {
  showView('starting');
});

const versionLine = document.getElementById('version-line');
try {
  const v = api.versions();
  versionLine.textContent = `桌面端 v0.1.0 · Electron ${v.electron}`;
} catch {
  versionLine.textContent = '桌面端 v0.1.0';
}

refreshAndStart();
