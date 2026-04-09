const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsBridge', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  pickSoundFile: () => ipcRenderer.invoke('pick-sound-file'),
});
