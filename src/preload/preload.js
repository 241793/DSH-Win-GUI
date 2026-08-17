'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const isFile = window.location.protocol === 'file:';
const isHarnessLoopback = window.location.protocol === 'http:'
  && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');

function on(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const marketApi = {
  list: () => ipcRenderer.invoke('market:list'),
  installed: () => ipcRenderer.invoke('market:installed'),
  install: (repoPath) => ipcRenderer.invoke('market:install', repoPath),
  uninstall: (spec) => ipcRenderer.invoke('market:uninstall', spec),
  onOutput: (callback) => on('connect-output', callback),
};

const pluginInstallApi = {
  list: () => ipcRenderer.invoke('plugin-install:list'),
  importLocal: () => ipcRenderer.invoke('plugin-install:import-local'),
  inspect: (link) => ipcRenderer.invoke('plugin-install:inspect', link),
  install: (link) => ipcRenderer.invoke('plugin-install:install', link),
  remove: (name) => ipcRenderer.invoke('plugin-install:remove', name),
  onOutput: (callback) => on('connect-output', callback),
};

const ccTuiApi = {
  open: () => ipcRenderer.invoke('cc-tui:open'),
};

const connectApi = {
  getChannels: () => ipcRenderer.invoke('connect:get-channels'),
  install: (channelId) => ipcRenderer.invoke('connect:install', channelId),
  start: (channelId) => ipcRenderer.invoke('connect:start', channelId),
  stop: (channelId) => ipcRenderer.invoke('connect:stop', channelId),
  checkUpdates: () => ipcRenderer.invoke('connect:check-updates'),
  update: (channelId) => ipcRenderer.invoke('connect:update', channelId),
  setModel: (channelId, provider, model) => ipcRenderer.invoke('connect:set-model', channelId, provider, model),
  getRecentModel: (channelId) => ipcRenderer.invoke('connect:get-recent-model', channelId),
  switchAccount: (channelId) => ipcRenderer.invoke('connect:switch-account', channelId),
  uninstall: (channelId) => ipcRenderer.invoke('connect:uninstall', channelId),
  getAccounts: (channelId) => ipcRenderer.invoke('connect:get-accounts', channelId),
  removeAccount: (channelId) => ipcRenderer.invoke('connect:remove-account', channelId),
  onOutput: (callback) => on('connect-output', callback),
};

if (isFile) {
  // 启动页（file:）暴露完整桌面端 API。
  contextBridge.exposeInMainWorld('desktopAPI', {
    detect: () => ipcRenderer.invoke('detect-harness'),
    start: () => ipcRenderer.invoke('start-harness'),
    install: () => ipcRenderer.invoke('install-harness'),
    cancelInstall: () => ipcRenderer.invoke('cancel-install'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
    connect: connectApi,
    market: marketApi,
    pluginInstall: pluginInstallApi,
    ccTui: ccTuiApi,
    onInstallProgress: (callback) => on('install-progress', callback),
    onBackendProgress: (callback) => on('backend-progress', callback),
    versions: () => ({
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    }),
  });
} else if (isHarnessLoopback) {
  // Harness Web UI（http://127.0.0.1:<端口>）只暴露互联中心需要的 IPC 桥。
  contextBridge.exposeInMainWorld('desktopAPI', {
    connect: connectApi,
    market: marketApi,
    pluginInstall: pluginInstallApi,
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
  });
}
