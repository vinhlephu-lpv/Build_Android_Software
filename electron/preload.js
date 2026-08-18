const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
  showItemInFolder: (path) => ipcRenderer.invoke('shell:showItemInFolder', path),
  captureRect: (bounds) => ipcRenderer.invoke('screen:captureRect', bounds),
  writeImageToClipboard: (dataUrl) => ipcRenderer.invoke('clipboard:writeImage', dataUrl),
  getNetworkInfo: () => ipcRenderer.invoke('network:getInfo'),
  connectWifi: (data) => ipcRenderer.invoke('device:connectWifi', data),
  pairWifi: (data) => ipcRenderer.invoke('device:pairWifi', data),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close')
});
