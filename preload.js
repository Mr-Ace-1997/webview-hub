const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: ()       => ipcRenderer.invoke('config:get'),
  setConfig: (data)   => ipcRenderer.invoke('config:set', data),
})
