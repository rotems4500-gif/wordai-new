const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  saveLocalMaterial: (payload) => ipcRenderer.invoke('save-local-material', payload),
  listLocalMaterials: () => ipcRenderer.invoke('list-local-materials'),
  readLocalMaterial: (fileName) => ipcRenderer.invoke('read-local-material', fileName),
  openDocumentDialog: () => ipcRenderer.invoke('open-document-dialog'),
  consumePendingOpenDocument: () => ipcRenderer.invoke('consume-pending-open-document'),
  saveDocumentDialog: (payload) => ipcRenderer.invoke('save-document-dialog', payload),
  loadProviderConfig: () => ipcRenderer.invoke('load-provider-config'),
  saveProviderConfig: (payload) => ipcRenderer.invoke('save-provider-config', payload),
  loadAppSettings: () => ipcRenderer.invoke('load-app-settings'),
  saveAppSettings: (payload) => ipcRenderer.invoke('save-app-settings', payload),
  getAppUpdateInfo: () => ipcRenderer.invoke('get-app-update-info'),
  checkForAppUpdates: () => ipcRenderer.invoke('check-for-app-updates'),
  installAppUpdate: () => ipcRenderer.invoke('install-app-update'),
  proxyHttpRequest: (payload) => ipcRenderer.invoke('proxy-http-request', payload),
  onAppUpdateStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('app-update-status', listener);
    return () => ipcRenderer.removeListener('app-update-status', listener);
  },
  onOpenExternalDocument: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('open-external-document', listener);
    return () => ipcRenderer.removeListener('open-external-document', listener);
  },
});
