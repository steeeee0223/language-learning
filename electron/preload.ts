import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('languageLearningDesktop', {
  getSettings: () => ipcRenderer.invoke('desktop:get-settings'),
  chooseDataRoot: () => ipcRenderer.invoke('desktop:choose-data-root'),
  openDataRoot: () => ipcRenderer.invoke('desktop:open-data-root'),
});
