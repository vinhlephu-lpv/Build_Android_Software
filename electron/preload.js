const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
  showItemInFolder: (path) => ipcRenderer.invoke('shell:showItemInFolder', path),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close')
});
