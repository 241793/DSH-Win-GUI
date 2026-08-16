'use strict';

const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { compareVersions } = require('./util');

const detector = require('./detector');
const installer = require('./installer');
const backend = require('./backend');
const channels = require('./channels');
const marketplace = require('./marketplace');
const pluginInstall = require('./plugin-install');

let mainWindow = null;
let backendChild = null;
let backendUrl = null;

const APP_ICON = path.join(__dirname, '..', '..', 'assets', 'icon.png');

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.deepseek.harness.desktop');
    createWindow();
    registerIpc();
  });
}

function managedDirs() {
  const userData = app.getPath('userData');
  const runtimeDir = path.join(userData, 'runtime');
  return {
    userData,
    runtimeDir,
    nodeDir: path.join(runtimeDir, 'node'),
    nodePath: path.join(runtimeDir, 'node', 'node.exe'),
    prefix: path.join(runtimeDir, 'prefix'),
  };
}

function createWindow() {
  Menu.setApplicationMenu(buildMenu());
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 840,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0f14',
    title: 'DeepSeek Harness',
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const target = parseUrl(url);
    const currentBackend = parseUrl(backendUrl);
    const isFile = target && target.protocol === 'file:';
    const isBackend = target && currentBackend && target.origin === currentBackend.origin;
    if (isFile || isBackend) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

function parseUrl(value) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: '检查DSH更新',
      click: () => {
        checkDshUpdate().catch((error) => {
          console.error('dsh-desktop: 检查更新失败：', error && error.message ? error.message : error);
        });
      },
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '官方文档（deepseek-harness）',
          click: () => shell.openExternal('https://github.com/deepseek-ai/deepseek-harness'),
        },
        {
          label: 'QQ Bot 插件文档',
          click: () => shell.openExternal('https://www.npmjs.com/package/@tencent-connect/dsh-qqbot'),
        },
        {
          label: '关于',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('show-about');
            }
          },
        },
      ],
    },
  ]);
}

/** 检查 dsh 更新：有新版弹窗询问是否更新。 */
async function checkDshUpdate() {
  const detection = await detector.detectAll(managedDirs());
  if (!detection.ready || !detection.dsh || !detection.dsh.version) {
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '检查DSH更新',
      message: '未检测到 dsh 安装，无法检查更新。',
      buttons: ['确定'],
    });
    return;
  }
  const installedVersion = String(detection.dsh.version);
  let latestVersion = null;
  try {
    const resp = await fetch('https://registry.npmmirror.com/@deepseek-ai/dsh');
    const json = await resp.json();
    latestVersion = json && json['dist-tags'] && json['dist-tags'].latest;
  } catch { /* 网络失败 */ }
  if (!latestVersion) {
    await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '检查DSH更新',
      message: '无法连接 npm 镜像获取最新版本，请稍后重试。',
      buttons: ['确定'],
    });
    return;
  }

  if (compareVersions(latestVersion, installedVersion) > 0) {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '检查DSH更新',
      message: `发现新版本 v${latestVersion}`,
      detail: `当前版本：v${installedVersion}\n是否立即更新？更新完成后会自动重启 dsh web。`,
      buttons: ['立即更新', '稍后'],
      defaultId: 0,
      cancelId: 1,
    });
    if (result.response === 0) {
      await runDshUpdate(detection, latestVersion);
    }
  } else {
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '检查DSH更新',
      message: '已是最新版本',
      detail: `当前版本：v${installedVersion}，最新版本：v${latestVersion}`,
      buttons: ['确定'],
    });
  }
}

/** 执行 dsh 全局更新并重启后端。 */
async function runDshUpdate(detection, latestVersion) {
  const { nodePath, npmCliPath } = detection.node || {};
  if (!nodePath || !npmCliPath) throw new Error('未找到可用的 Node/npm，无法更新 dsh。');
  const args = [npmCliPath, 'install', '-g', `@deepseek-ai/dsh@${latestVersion}`, '--registry', 'https://registry.npmmirror.com'];
  const { spawn } = require('node:child_process');
  await new Promise((resolve, reject) => {
    const child = spawn(nodePath, args, { windowsHide: true, stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`dsh 更新失败（退出码 ${code}）`));
    });
  });
  await restartHarnessBackend();
  await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: '检查DSH更新',
    message: `dsh 已更新到 v${latestVersion}`,
    buttons: ['确定'],
  });
}

/** 重启 dsh web 后端，让 profile 插件变更立即生效。 */
async function restartHarnessBackend() {
  const detection = await detector.detectAll(managedDirs());
  if (!detection.ready) throw new Error('运行环境未就绪');
  backend.stopBackend(backendChild);
  backendChild = null;
  backendUrl = null;
  const started = await backend.startBackend(detection.dsh, { cwd: app.getPath('home') });
  backendChild = started.child;
  backendUrl = started.url;
  if (mainWindow && !mainWindow.isDestroyed()) {
    await mainWindow.loadURL(started.url);
  }
  return { url: started.url };
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function registerIpc() {
  ipcMain.handle('detect-harness', async () => {
    return detector.detectAll(managedDirs());
  });

  ipcMain.handle('start-harness', async () => {
    const detection = await detector.detectAll(managedDirs());
    if (!detection.ready) {
      throw new Error('运行环境未就绪，请先安装缺失组件。');
    }
    sendToRenderer('backend-progress', { stage: 'starting' });
    const started = await backend.startBackend(detection.dsh, {
      cwd: app.getPath('home'),
    });
    backendChild = started.child;
    backendUrl = started.url;

    // 稍后自动启动已绑定凭据的渠道（如 QQBot），日志可在设置页「互联」查看。
    setTimeout(() => {
      channels.autoStartChannels(managedDirs(), detection, (channelId, payload) => {
        sendToConnect(channelId, payload);
      }).catch((error) => {
        console.error('dsh-desktop: 自动启动渠道失败：', error && error.message ? error.message : error);
      });
    }, 1500);

    return { url: started.url };
  });

  ipcMain.handle('install-harness', async () => {
    const detection = await detector.detectAll(managedDirs());
    const result = await installer.ensureHarness(managedDirs(), detection, (payload) => {
      sendToRenderer('install-progress', payload);
    });
    return result;
  });

  ipcMain.handle('cancel-install', () => {
    installer.cancelInstall();
    return true;
  });

  ipcMain.handle('open-external', (_event, url) => {
    if (typeof url === 'string' && /^https?:/i.test(url)) shell.openExternal(url);
    return true;
  });

  ipcMain.handle('connect:get-channels', () => {
    return channels.getChannelsStatus();
  });

  ipcMain.handle('connect:install', async (_event, channelId) => {
    const channel = channels.CHANNELS.find((item) => item.id === channelId);
    if (!channel) throw new Error('未知频道');
    const detection = await detector.detectAll(managedDirs());
    return channels.installChannel(managedDirs(), detection, channel, (payload) => {
      sendToConnect(channelId, payload);
    });
  });

  ipcMain.handle('connect:start', async (_event, channelId) => {
    const channel = channels.CHANNELS.find((item) => item.id === channelId);
    if (!channel) throw new Error('未知频道');
    const detection = await detector.detectAll(managedDirs());
    return channels.startChannel(managedDirs(), detection, channel, (payload) => {
      sendToConnect(channelId, payload);
    });
  });

  ipcMain.handle('connect:stop', (_event, channelId) => {
    return channels.stopChannel(channelId, (payload) => {
      sendToConnect(channelId, payload);
    });
  });

  ipcMain.handle('connect:check-updates', async () => {
    return channels.checkChannelUpdates();
  });

  ipcMain.handle('connect:update', async (_event, channelId) => {
    const channel = channels.CHANNELS.find((item) => item.id === channelId);
    if (!channel) throw new Error('未知频道');
    const detection = await detector.detectAll(managedDirs());
    return channels.updateChannel(managedDirs(), detection, channel, (payload) => {
      sendToConnect(channelId, payload);
    });
  });

  ipcMain.handle('connect:switch-account', async (_event, channelId) => {
    const channel = channels.CHANNELS.find((item) => item.id === channelId);
    if (!channel) throw new Error('未知频道');
    const detection = await detector.detectAll(managedDirs());
    return channels.switchChannelAccount(managedDirs(), detection, channel, (payload) => {
      sendToConnect(channelId, payload);
    });
  });

  ipcMain.handle('connect:uninstall', async (_event, channelId) => {
    const channel = channels.CHANNELS.find((item) => item.id === channelId);
    if (!channel) throw new Error('未知频道');
    const detection = await detector.detectAll(managedDirs());
    return channels.uninstallChannel(managedDirs(), detection, channel, (payload) => {
      sendToConnect(channelId, payload);
    });
  });

  ipcMain.handle('market:list', async () => {
    return marketplace.fetchMarketplacePlugins();
  });

  ipcMain.handle('market:installed', () => {
    return marketplace.getInstalledMarketplacePlugins();
  });

  ipcMain.handle('market:install', async (_event, repoPath) => {
    if (typeof repoPath !== 'string' || !repoPath.includes('/')) throw new Error('插件路径无效');
    const detection = await detector.detectAll(managedDirs());
    const result = await marketplace.installMarketplacePlugin(managedDirs(), detection, repoPath, (payload) => {
      sendToConnect('market', payload);
    });
    sendToConnect('market', { type: 'log', message: '安装完成，正在重启 dsh web 使插件生效…' });
    setTimeout(() => {
      restartHarnessBackend().catch((error) => {
        console.error('dsh-desktop: 重启后端失败：', error && error.message ? error.message : error);
      });
    }, 1200);
    return result;
  });

  ipcMain.handle('market:uninstall', async (_event, spec) => {
    if (typeof spec !== 'string' || !spec.trim()) throw new Error('插件包名无效');
    const detection = await detector.detectAll(managedDirs());
    const result = await marketplace.uninstallMarketplacePlugin(managedDirs(), detection, spec.trim(), (payload) => {
      sendToConnect('market', payload);
    });
    sendToConnect('market', { type: 'log', message: '卸载完成，正在重启 dsh web 使变更生效…' });
    setTimeout(() => {
      restartHarnessBackend().catch((error) => {
        console.error('dsh-desktop: 重启后端失败：', error && error.message ? error.message : error);
      });
    }, 1200);
    return result;
  });

  ipcMain.handle('plugin-install:list', () => {
    return pluginInstall.readHistory();
  });

  ipcMain.handle('plugin-install:import-local', async () => {
    const detection = await detector.detectAll(managedDirs());
    const result = await pluginInstall.importLocalPlugin(managedDirs(), detection, (payload) => {
      sendToConnect('plugin-install', payload);
    });
    sendToConnect('plugin-install', { type: 'log', message: '本地插件安装完成，正在重启 dsh web 使插件生效…' });
    setTimeout(() => {
      restartHarnessBackend().catch((error) => {
        console.error('dsh-desktop: 重启后端失败：', error && error.message ? error.message : error);
      });
    }, 1200);
    return result;
  });

  ipcMain.handle('plugin-install:inspect', async (_event, link) => {
    if (typeof link !== 'string' || !link.trim()) throw new Error('链接无效');
    return pluginInstall.inspectPluginLink(link.trim());
  });

  ipcMain.handle('plugin-install:install', async (_event, link) => {
    if (typeof link !== 'string' || !link.trim()) throw new Error('链接无效');
    const detection = await detector.detectAll(managedDirs());
    const result = await pluginInstall.installPluginLink(managedDirs(), detection, link.trim(), (payload) => {
      sendToConnect('plugin-install', payload);
    });
    sendToConnect('plugin-install', { type: 'log', message: '插件安装完成，正在重启 dsh web 使插件生效…' });
    setTimeout(() => {
      restartHarnessBackend().catch((error) => {
        console.error('dsh-desktop: 重启后端失败：', error && error.message ? error.message : error);
      });
    }, 1200);
    return result;
  });

  ipcMain.handle('plugin-install:remove', async (_event, name) => {
    if (typeof name !== 'string' || !name.trim()) throw new Error('插件名无效');
    const detection = await detector.detectAll(managedDirs());
    const result = await pluginInstall.removeInstalledPlugin(managedDirs(), detection, name.trim(), (payload) => {
      sendToConnect('plugin-install', payload);
    });
    sendToConnect('plugin-install', { type: 'log', message: '插件已删除，正在重启 dsh web 使变更生效…' });
    setTimeout(() => {
      restartHarnessBackend().catch((error) => {
        console.error('dsh-desktop: 重启后端失败：', error && error.message ? error.message : error);
      });
    }, 1200);
    return result;
  });

  ipcMain.handle('connect:get-accounts', (_event, channelId) => {
    return channels.getChannelAccounts(channelId);
  });

  ipcMain.handle('connect:remove-account', async (_event, channelId) => {
    const channel = channels.CHANNELS.find((item) => item.id === channelId);
    if (!channel) throw new Error('未知频道');
    return channels.removeChannelAccount(channel, (payload) => {
      sendToConnect(channelId, payload);
    });
  });

  ipcMain.handle('connect:set-model', (_event, channelId, provider, model) => {
    const channel = channels.CHANNELS.find((item) => item.id === channelId);
    if (!channel) throw new Error('未知频道');
    channels.setChannelDefaultModel(channel, provider, model, (payload) => {
      sendToConnect(channelId, payload);
    });
    return channels.getChannelsStatus();
  });

  ipcMain.handle('connect:get-recent-model', (_event, channelId) => {
    const channel = channels.CHANNELS.find((item) => item.id === channelId);
    if (!channel) throw new Error('未知频道');
    return channels.getRecentDefaultModel(channel);
  });
}

function sendToConnect(channelId, payload) {
  const message = { channelId, ...payload };
  for (const win of [mainWindow, connectWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('connect-output', message);
    }
  }
}

app.on('before-quit', () => {
  backend.stopBackend(backendChild);
  backendChild = null;
  channels.stopAllChannels();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
