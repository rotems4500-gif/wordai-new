const { contextBridge, ipcRenderer } = require('electron');

const WINDOW_CONTEXT_ARGUMENT_PREFIX = '--wordflow-window-context=';

function normalizeWindowContext(rawWindowContext = {}) {
  return {
    isolatedDocumentSession: rawWindowContext?.isolatedDocumentSession === true,
    documentStorageScopeId: String(rawWindowContext?.documentStorageScopeId || 'primary'),
    hasPendingOpenDocument: rawWindowContext?.hasPendingOpenDocument === true,
  };
}

const DEFAULT_WINDOW_CONTEXT = normalizeWindowContext();

function readInjectedWindowContext() {
  const encodedWindowContext = process.argv.find((value) => String(value || '').startsWith(WINDOW_CONTEXT_ARGUMENT_PREFIX));
  if (!encodedWindowContext) return null;

  const serializedWindowContext = String(encodedWindowContext).slice(WINDOW_CONTEXT_ARGUMENT_PREFIX.length);
  if (!serializedWindowContext) return null;

  try {
    return normalizeWindowContext(JSON.parse(Buffer.from(serializedWindowContext, 'base64').toString('utf8')));
  } catch {
    return null;
  }
}

const windowContext = (() => {
  const injectedWindowContext = readInjectedWindowContext();
  if (injectedWindowContext) return injectedWindowContext;

  try {
    return normalizeWindowContext(ipcRenderer.sendSync('get-window-context') || DEFAULT_WINDOW_CONTEXT);
  } catch {
    return DEFAULT_WINDOW_CONTEXT;
  }
})();

contextBridge.exposeInMainWorld('desktopApp', {
  isDesktop: true,
  platform: process.platform,
  windowContext,
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  saveLocalMaterial: (payload) => ipcRenderer.invoke('save-local-material', payload),
  listLocalMaterials: () => ipcRenderer.invoke('list-local-materials'),
  readLocalMaterial: (fileName) => ipcRenderer.invoke('read-local-material', fileName),
  extractMaterialText: (payload) => ipcRenderer.invoke('extract-material-text', payload),
  createAppWindow: () => ipcRenderer.invoke('create-app-window'),
  openDocumentDialog: () => ipcRenderer.invoke('open-document-dialog'),
  // פתיחת מסמך לפי נתיב מוחלט - משמש את "מסמכים אחרונים" במסך הבית
  openDocumentByPath: (filePath) => ipcRenderer.invoke('open-document-by-path', filePath),
  consumePendingOpenDocument: () => ipcRenderer.invoke('consume-pending-open-document'),
  consumePendingOpenSettings: () => ipcRenderer.invoke('consume-pending-open-settings'),
  saveDocumentDialog: (payload) => ipcRenderer.invoke('save-document-dialog', payload),
  loadProviderConfig: () => ipcRenderer.invoke('load-provider-config'),
  saveProviderConfig: (payload) => ipcRenderer.invoke('save-provider-config', payload),
  loadAppSettings: () => ipcRenderer.invoke('load-app-settings'),
  saveAppSettings: (payload) => ipcRenderer.invoke('save-app-settings', payload),
  getAppUpdateInfo: () => ipcRenderer.invoke('get-app-update-info'),
  checkForAppUpdates: () => ipcRenderer.invoke('check-for-app-updates'),
  installAppUpdate: () => ipcRenderer.invoke('install-app-update'),
  proxyHttpRequest: (payload) => ipcRenderer.invoke('proxy-http-request', payload),
  abortProxyHttpRequest: (requestId) => ipcRenderer.invoke('abort-proxy-http-request', requestId),
  fetchBrowserPageSnapshot: (payload) => ipcRenderer.invoke('fetch-browser-page-snapshot', payload),
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
  onOpenSettings: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('open-settings', listener);
    return () => ipcRenderer.removeListener('open-settings', listener);
  },
});
