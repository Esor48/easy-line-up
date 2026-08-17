const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zoomAPI', {
  onSetImage: (callback) => ipcRenderer.on('set-image', (_e, url) => callback(url)),
  close: () => ipcRenderer.invoke('close-zoom-view'),
});
