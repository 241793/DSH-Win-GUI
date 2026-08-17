'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ccTuiProgress', {
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('cc-tui-progress', listener);
    return () => ipcRenderer.removeListener('cc-tui-progress', listener);
  },
});
