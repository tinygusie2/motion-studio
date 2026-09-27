// Bridge between the editor page and Electron: native folder/file pickers and menu commands.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studio', {
  pickFolder: opts => ipcRenderer.invoke('pick-folder', opts),
  pickFile: opts => ipcRenderer.invoke('pick-file', opts),
  onMenu: cb => ipcRenderer.on('menu', (_e, cmd) => cb(cmd)),
  window: action => ipcRenderer.invoke('window', action)
});
