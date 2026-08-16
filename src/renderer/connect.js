'use strict';

/* global window, document */

const api = window.desktopAPI;

const channelList = document.getElementById('channel-list');
const consoleEl = document.getElementById('console');
const consoleTitle = document.getElementById('console-title');
const consoleStatus = document.getElementById('console-status');

let channels = [];
let activeChannelId = null;
let busy = false;

function stripAnsi(text) {
  return String(text)
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

function appendLine(text) {
  const line = stripAnsi(text);
  // 保留 QR 码需要的行内空格，但避免单个换行导致的大量空行
  consoleEl.textContent += line + '\n';
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function setStatus(text, running) {
  consoleStatus.textContent = text;
  consoleStatus.classList.toggle('running', Boolean(running));
}

function renderChannels() {
  channelList.innerHTML = '';
  for (const channel of channels) {
    const card = document.createElement('div');
    card.className = 'channel-card';
    card.dataset.id = channel.id;

    const head = document.createElement('div');
    head.className = 'channel-head';
    const title = document.createElement('h3');
    title.textContent = channel.name;
    const badge = document.createElement('span');
    if (channel.running) {
      badge.className = 'badge ok';
      badge.textContent = '运行中';
    } else if (channel.bundleInstalled) {
      badge.className = 'badge';
      badge.textContent = `已安装${channel.version ? ' v' + channel.version : ''}`;
    } else {
      badge.className = 'badge warn';
      badge.textContent = '未安装';
    }
    head.appendChild(title);
    head.appendChild(badge);

    const desc = document.createElement('p');
    desc.className = 'channel-desc';
    desc.textContent = channel.description;

    const cmds = document.createElement('p');
    cmds.className = 'channel-cmds';
    cmds.textContent = `安装：${channel.commands.install}\n启动：${channel.commands.start}`;

    const isCli = channel.kind === 'cli';

    const actions = document.createElement('div');
    actions.className = 'actions channel-actions';

    const btnInstall = document.createElement('button');
    btnInstall.textContent = channel.bundleInstalled ? '重新安装' : (isCli ? '安装到自管目录' : '安装到 dsh profile');
    btnInstall.className = 'primary';
    btnInstall.disabled = busy;
    btnInstall.addEventListener('click', () => installChannel(channel));

    const btnStart = document.createElement('button');
    btnStart.textContent = channel.running ? '启动中…' : (isCli ? '启动守护' : '启动并扫码绑定');
    btnStart.className = channel.running ? 'ghost' : 'primary';
    btnStart.disabled = busy || channel.running || !channel.bundleInstalled;
    btnStart.addEventListener('click', () => startChannel(channel));

    const btnStop = document.createElement('button');
    btnStop.textContent = '停止';
    btnStop.className = 'ghost';
    btnStop.disabled = busy || !channel.running;
    btnStop.addEventListener('click', () => stopChannel(channel));

    const btnAccounts = document.createElement('button');
    btnAccounts.textContent = '账号';
    btnAccounts.className = 'ghost';
    btnAccounts.disabled = busy || !channel.bundleInstalled;
    btnAccounts.addEventListener('click', () => openAccounts(channel));

    const btnSwitch = document.createElement('button');
    btnSwitch.textContent = '切换账号';
    btnSwitch.className = 'ghost';
    btnSwitch.disabled = busy || !channel.bundleInstalled;
    btnSwitch.addEventListener('click', () => switchAccount(channel));

    const btnUninstall = document.createElement('button');
    btnUninstall.textContent = '卸载';
    btnUninstall.className = 'ghost';
    btnUninstall.disabled = busy || !channel.bundleInstalled;
    btnUninstall.addEventListener('click', () => uninstallChannel(channel));

    const btnDocs = document.createElement('button');
    btnDocs.textContent = '查看官方文档';
    btnDocs.className = 'ghost';
    btnDocs.addEventListener('click', () => api.openExternal(channel.docs));

    actions.appendChild(btnInstall);
    actions.appendChild(btnStart);
    actions.appendChild(btnStop);
    actions.appendChild(btnAccounts);
    actions.appendChild(btnSwitch);
    actions.appendChild(btnUninstall);
    actions.appendChild(btnDocs);

    card.appendChild(head);
    card.appendChild(desc);
    card.appendChild(cmds);

    if (channel.botInfo && (channel.botInfo.botId || channel.botInfo.botName)) {
      const botInfo = document.createElement('p');
      botInfo.className = 'channel-botinfo';
      botInfo.textContent = `已连接机器人：${channel.botInfo.botName || '未知昵称'}` +
        (channel.botInfo.botId ? `（ID: ${channel.botInfo.botId}）` : '') +
        (channel.botInfo.appId ? `　AppID: ${channel.botInfo.appId}` : '');
      card.appendChild(botInfo);
    }

    if (isCli && channel.health && channel.health.gateway) {
      const health = document.createElement('p');
      health.className = 'channel-botinfo';
      const gw = channel.health.gateway;
      const channelsText = Array.isArray(channel.health.channels) && channel.health.channels.length > 0
        ? `　渠道：${channel.health.channels.map((item) => `${item.name || '?'}${item.ok ? '✓' : '✗'}`).join(', ')}`
        : '';
      health.textContent = `网关：${gw.healthy ? 'HEALTHY' : (gw.reachable ? 'DEGRADED' : 'UNREACHABLE')}（端口 ${gw.port || '?'}）${channelsText}`;
      card.appendChild(health);
    }

    if (Array.isArray(channel.accountInfo) && channel.accountInfo.length > 0) {
      const bound = channel.accountInfo
        .filter((item) => item.accounts && item.accounts.length > 0)
        .map((item) => `${item.channel}(${item.accounts.join(', ')})`)
        .join('、');
      if (bound) {
        const account = document.createElement('p');
        account.className = 'channel-botinfo';
        account.textContent = `已绑定账号：${bound}`;
        card.appendChild(account);
      }
    }

    card.appendChild(actions);
    channelList.appendChild(card);
  }
}

async function refresh() {
  channels = await api.connect.getChannels();
  renderChannels();
}

async function installChannel(channel) {
  busy = true;
  renderChannels();
  activateConsole(channel);
  appendLine(`===== 开始安装 ${channel.name} =====`);
  setStatus('安装中…', true);
  try {
    channels = await api.connect.install(channel.id);
    appendLine(`===== ${channel.name} 安装完成 =====`);
    setStatus('安装完成', false);
  } catch (error) {
    appendLine(`[错误] ${error && error.message ? error.message : error}`);
    setStatus('安装失败', false);
  } finally {
    busy = false;
    renderChannels();
  }
}

async function startChannel(channel) {
  busy = true;
  renderChannels();
  activateConsole(channel);
  appendLine(`===== 启动 ${channel.name} profile =====`);
  setStatus('启动中…', true);
  try {
    await api.connect.start(channel.id);
    channels = await api.connect.getChannels();
  } catch (error) {
    appendLine(`[错误] ${error && error.message ? error.message : error}`);
    setStatus('启动失败', false);
  } finally {
    busy = false;
    renderChannels();
  }
}

async function stopChannel(channel) {
  busy = true;
  renderChannels();
  activateConsole(channel);
  appendLine(`===== 停止 ${channel.name} =====`);
  try {
    await api.connect.stop(channel.id);
    channels = await api.connect.getChannels();
  } finally {
    busy = false;
    renderChannels();
  }
}

async function switchAccount(channel) {
  busy = true;
  renderChannels();
  activateConsole(channel);
  appendLine(`===== 切换 ${channel.name} 账号 =====`);
  setStatus('切换账号中…', true);
  try {
    channels = await api.connect.switchAccount(channel.id);
    appendLine(`===== ${channel.name} 账号切换流程已启动 =====`);
  } catch (error) {
    appendLine(`[错误] ${error && error.message ? error.message : error}`);
    setStatus('切换失败', false);
  } finally {
    busy = false;
    renderChannels();
  }
}

async function uninstallChannel(channel) {
  busy = true;
  renderChannels();
  activateConsole(channel);
  appendLine(`===== 卸载 ${channel.name} =====`);
  setStatus('卸载中…', true);
  try {
    channels = await api.connect.uninstall(channel.id);
    appendLine(`===== ${channel.name} 已卸载 =====`);
    setStatus('卸载完成', false);
  } catch (error) {
    appendLine(`[错误] ${error && error.message ? error.message : error}`);
    setStatus('卸载失败', false);
  } finally {
    busy = false;
    renderChannels();
  }
}

async function openAccounts(channel) {
  activateConsole(channel);
  appendLine(`===== 查看 ${channel.name} 已绑定账号 =====`);
  let accounts = [];
  try {
    accounts = await api.connect.getAccounts(channel.id);
  } catch (error) {
    appendLine(`[错误] 获取账号失败：${error && error.message ? error.message : error}`);
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const box = document.createElement('div');
  box.className = 'modal-box';
  const title = document.createElement('h3');
  title.textContent = `${channel.name} · 已绑定账号`;
  box.appendChild(title);

  if (!accounts || accounts.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'channel-desc';
    empty.textContent = '暂未检测到已绑定账号。请先启动并扫码绑定。';
    box.appendChild(empty);
  } else {
    for (const account of accounts) {
      const row = document.createElement('div');
      row.className = 'account-row';
      const info = document.createElement('span');
      info.className = 'account-info';
      info.textContent = `${account.name || '账号'}${account.detail ? '　' + account.detail : ''}`;
      const del = document.createElement('button');
      del.textContent = '删除';
      del.className = 'ghost';
      del.addEventListener('click', async () => {
        try {
          channels = await api.connect.removeAccount(channel.id);
          appendLine(`[账号] 已删除 ${account.name || account.id}`);
          overlay.remove();
        } catch (error) {
          appendLine(`[错误] 删除账号失败：${error && error.message ? error.message : error}`);
        }
      });
      const sw = document.createElement('button');
      sw.textContent = '切换';
      sw.className = 'ghost';
      sw.addEventListener('click', () => {
        overlay.remove();
        switchAccount(channel);
      });
      row.appendChild(info);
      row.appendChild(sw);
      row.appendChild(del);
      box.appendChild(row);
    }
  }

  const close = document.createElement('button');
  close.textContent = '关闭';
  close.className = 'ghost';
  close.addEventListener('click', () => overlay.remove());
  box.appendChild(close);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function activateConsole(channel) {
  activeChannelId = channel.id;
  consoleTitle.textContent = `${channel.name} · 运行输出`;
}

api.connect.onOutput((payload) => {
  if (payload.channelId && payload.channelId !== activeChannelId) return;

  if (payload.type === 'output') {
    appendLine(payload.text || '');
  } else if (payload.type === 'log') {
    appendLine(`[info] ${payload.message || ''}`);
  } else if (payload.type === 'progress') {
    if (typeof payload.percent === 'number' && payload.percent >= 0) {
      appendLine(`[进度] ${payload.stage || ''} ${payload.percent}%`);
    } else {
      appendLine(`[进度] ${payload.stage || ''}`);
    }
  } else if (payload.type === 'status') {
    const channel = channels.find((item) => item.id === payload.channelId);
    if (channel) channel.running = Boolean(payload.running);
    renderChannels();
    if (payload.running) {
      setStatus(`运行中（PID ${payload.pid || '?'}）`, true);
    } else {
      setStatus('未运行', false);
    }
  } else if (payload.type === 'bot-info') {
    const channel = channels.find((item) => item.id === payload.channelId);
    if (channel) {
      channel.botInfo = {
        appId: payload.appId || null,
        botId: payload.botId || null,
        botName: payload.botName || null,
      };
      appendLine(`[机器人信息] 已连接：${payload.botName || '未知昵称'}（ID: ${payload.botId || '未知'}，AppID: ${payload.appId || '未知'}）`);
      renderChannels();
    }
  } else if (payload.type === 'health') {
    const channel = channels.find((item) => item.id === payload.channelId);
    if (channel) {
      channel.health = payload.health || null;
      renderChannels();
    }
  } else if (payload.type === 'account-info') {
    const channel = channels.find((item) => item.id === payload.channelId);
    if (channel) {
      channel.accountInfo = payload.accounts || [];
      renderChannels();
    }
  } else if (payload.type === 'done') {
    appendLine('[完成]');
    setStatus('完成', false);
  }
});

refresh();
