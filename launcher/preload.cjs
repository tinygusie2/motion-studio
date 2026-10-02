// Bridge between the launcher page and its main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  state: () => ipcRenderer.invoke('state'),
  check: () => ipcRenderer.invoke('check'),
  install: id => ipcRenderer.invoke('install', id),
  launch: id => ipcRenderer.invoke('launch', id),
  settings: patch => ipcRenderer.invoke('settings', patch),
  open: (what, id) => ipcRenderer.invoke('open', what, id),
  onState: cb => ipcRenderer.on('state', (_e, s) => cb(s))
});
