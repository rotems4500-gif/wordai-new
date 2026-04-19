const { app, BrowserWindow, Menu, dialog, shell, ipcMain, globalShortcut, safeStorage } = require('electron');
const { autoUpdater } = require('electron-updater');
const mammoth = require('mammoth');
const path = require('path');
const fs = require('fs');

if (!app.isPackaged) {
  app.commandLine.appendSwitch('ignore-certificate-errors');
}

const MANUAL_RELEASES_URL = 'https://github.com/rotems4500-gif/wordai-new/releases';

let mainWindow;
let pendingFilePayload = null;
let loadRendererInProgress = false;
let latestUpdateState = {
  status: 'idle',
  message: 'מוכן לבדיקת עדכונים',
  currentVersion: app.getVersion(),
  availableVersion: '',
  percent: 0,
  checkedAt: '',
};

function sendUpdateStatus(nextPatch = {}) {
  latestUpdateState = {
    ...latestUpdateState,
    ...nextPatch,
    currentVersion: app.getVersion(),
    checkedAt: new Date().toISOString(),
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-update-status', latestUpdateState);
  }

  return latestUpdateState;
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeFileName(name = 'document') {
  return String(name || 'document').replace(/[\\/:*?"<>|]/g, '_').trim() || 'document';
}

function plainTextToHtml(text = '') {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '<p></p>';
  return normalized
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

function wrapHtmlDocument(html = '', title = 'Word AI Document') {
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title><style>body{direction:rtl;font-family:Arial,sans-serif;padding:40px;line-height:1.7}[data-type="page-break"]{display:block;height:0;page-break-after:always;break-after:page}</style></head><body>${html}</body></html>`;
}

async function readDocumentPayload(filePath) {
  const resolvedPath = path.resolve(filePath);
  const ext = path.extname(resolvedPath).toLowerCase();

  try {
    let rawText = '';
    let html = '';

    if (ext === '.docx') {
      const result = await mammoth.convertToHtml({ path: resolvedPath });
      html = result.value || '<p></p>';
      rawText = String(result.value || '').replace(/<[^>]+>/g, ' ');
    } else if (ext === '.doc') {
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      rawText = raw;
      if (/<(html|body|p|h1|h2|h3|div|span|br|ul|ol|li)\b/i.test(raw)) {
        html = raw;
      } else {
        html = `<h1>${escapeHtml(path.basename(resolvedPath))}</h1><p>קובץ DOC ישן לא נתמך ישירות. מומלץ לשמור אותו כ-DOCX או HTML ואז לפתוח כאן.</p>`;
      }
    } else {
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      rawText = raw;
      html = /<(html|body|p|h1|h2|h3|div|span|br|ul|ol|li)\b/i.test(raw)
        ? raw
        : plainTextToHtml(raw);
    }

    return {
      ok: true,
      canceled: false,
      filePath: resolvedPath,
      title: path.basename(resolvedPath, path.extname(resolvedPath)),
      html: html || '<p></p>',
      text: String(rawText || '').trim(),
    };
  } catch (error) {
    return {
      ok: false,
      canceled: false,
      filePath: resolvedPath,
      title: path.basename(resolvedPath, path.extname(resolvedPath)),
      error: error?.message || 'לא ניתן לקרוא את הקובץ הזה ישירות. מומלץ להשתמש בקבצי DOCX, TXT, MD או HTML.',
    };
  }
}

function getLaunchFilePath(argv = []) {
  return (argv || []).find((arg) => {
    try {
      return fs.existsSync(arg) && /\.(docx|txt|md|markdown|html|htm)$/i.test(arg);
    } catch {
      return false;
    }
  }) || null;
}

function getWritableMaterialsDir() {
  const dir = path.join(app.getPath('userData'), 'project-materials');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getPersistedProviderConfigPath() {
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'ai-provider-config.json');
}

function readPersistedProviderConfig() {
  try {
    const filePath = getPersistedProviderConfigPath();
    if (!fs.existsSync(filePath)) return {};
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8') || '{}');

    if (raw && typeof raw === 'object' && !raw.data) {
      return raw;
    }

    if (!raw?.data) return {};
    const payload = Buffer.from(String(raw.data || ''), 'base64');
    const text = raw.encrypted && safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(payload)
      : payload.toString('utf8');

    return JSON.parse(text || '{}');
  } catch (error) {
    console.error('Failed to read provider config from disk:', error?.message || error);
    return {};
  }
}

function writePersistedProviderConfig(config = {}) {
  const filePath = getPersistedProviderConfigPath();
  const jsonText = JSON.stringify(config || {}, null, 2);
  const encrypted = safeStorage.isEncryptionAvailable();
  const payload = encrypted
    ? safeStorage.encryptString(jsonText)
    : Buffer.from(jsonText, 'utf8');

  fs.writeFileSync(filePath, JSON.stringify({
    version: 1,
    encrypted,
    data: payload.toString('base64'),
    updatedAt: new Date().toISOString(),
  }, null, 2) + '\n', 'utf8');

  return { ok: true, filePath };
}

function sendDocumentToRenderer(payload) {
  if (!payload) return;
  pendingFilePayload = payload;
  if (!mainWindow) return;
  const send = () => {
    mainWindow?.webContents?.send('open-external-document', payload);
  };
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    sendUpdateStatus({ status: 'dev-mode', message: 'בדיקת עדכונים זמינה רק בגרסה מותקנת' });
    return;
  }

  let manualDownloadShown = false;
  const handleUpdaterFailure = async (err, fallbackMessage = 'שגיאה בבדיקת העדכונים') => {
    const rawMessage = String(err?.message || fallbackMessage);
    const isReleaseFeedIssue = /Cannot parse releases feed|Unable to find latest version on GitHub|HttpError:\s*406/i.test(rawMessage);

    if (isReleaseFeedIssue) {
      sendUpdateStatus({
        status: 'manual-download',
        message: 'העדכון האוטומטי לא זמין כרגע. אפשר להוריד ידנית מעמוד ההורדות.',
      });

      if (!manualDownloadShown && mainWindow && !mainWindow.isDestroyed()) {
        manualDownloadShown = true;
        const result = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          buttons: ['פתח הורדות', 'סגור'],
          defaultId: 0,
          cancelId: 1,
          title: 'עדכון אוטומטי לא זמין',
          message: 'GitHub לא החזיר מסלול עדכון תקין.',
          detail: 'אפשר להוריד את הגרסה העדכנית ידנית מעמוד ה-Releases.',
        });
        if (result.response === 0) shell.openExternal(MANUAL_RELEASES_URL);
      }

      console.error('Auto update error:', rawMessage);
      return;
    }

    sendUpdateStatus({ status: 'error', message: rawMessage });
    console.error('Auto update error:', rawMessage);
  };

  const updateConfigPath = path.join(process.resourcesPath || '', 'app-update.yml');
  if (!fs.existsSync(updateConfigPath)) {
    console.warn('Skipping auto update: app-update.yml not found');
    sendUpdateStatus({ status: 'unavailable', message: 'קובץ הגדרות העדכון חסר בגרסה הזו' });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus({ status: 'checking', message: 'בודק אם קיימים עדכונים…', percent: 0 });
  });

  autoUpdater.on('update-available', (info = {}) => {
    sendUpdateStatus({
      status: 'downloading',
      message: `נמצא עדכון לגרסה ${info.version || ''}. מתחיל להוריד…`,
      availableVersion: info.version || '',
      percent: 0,
    });

    dialog.showMessageBox({
      type: 'info',
      title: 'עדכון זמין',
      message: 'נמצאה גרסה חדשה של Word AI Assistant.',
      detail: 'העדכון יורד כעת ברקע.',
    });
  });

  autoUpdater.on('download-progress', (progress = {}) => {
    sendUpdateStatus({
      status: 'downloading',
      message: `מוריד עדכון… ${Math.round(Number(progress.percent || 0))}%`,
      percent: Number(progress.percent || 0),
    });
  });

  autoUpdater.on('update-not-available', (info = {}) => {
    sendUpdateStatus({
      status: 'up-to-date',
      message: 'אין עדכון חדש כרגע. האפליקציה מעודכנת.',
      availableVersion: info.version || app.getVersion(),
      percent: 100,
    });
  });

  autoUpdater.on('update-downloaded', async (info = {}) => {
    sendUpdateStatus({
      status: 'downloaded',
      message: `העדכון לגרסה ${info.version || ''} ירד ומוכן להתקנה`,
      availableVersion: info.version || '',
      percent: 100,
    });

    const result = await dialog.showMessageBox({
      type: 'question',
      buttons: ['התקן עכשיו', 'מאוחר יותר'],
      defaultId: 0,
      cancelId: 1,
      title: 'העדכון מוכן',
      message: 'העדכון ירד בהצלחה ומוכן להתקנה.',
      detail: 'לחיצה על "התקן עכשיו" תסגור את האפליקציה ותתקין את הגרסה החדשה.',
    });
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', (err) => {
    handleUpdaterFailure(err, 'שגיאה בבדיקת העדכונים').catch((nestedError) => {
      console.error('Auto update error:', nestedError?.message || nestedError);
    });
  });

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    handleUpdaterFailure(err, 'שגיאת פתיחה במסלול העדכונים').catch((nestedError) => {
      console.error('Auto update startup error:', nestedError?.message || nestedError);
    });
  });
}

async function showLoadErrorPage(win, message = '') {
  const safeMessage = escapeHtml(message || 'טעינת הממשק נכשלה.');
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8" /><title>שגיאת טעינה</title><style>body{font-family:Arial,sans-serif;direction:rtl;padding:32px;background:#f3f2f1;color:#222} .card{max-width:720px;margin:40px auto;background:#fff;padding:24px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.08)} h1{margin-top:0}</style></head><body><div class="card"><h1>הממשק לא נטען</h1><p>בוצע מעבר למסך חירום במקום מסך ריק.</p><p>${safeMessage}</p></div></body></html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  if (!win.isDestroyed()) {
    win.show();
    win.focus();
  }
}

async function loadRenderer(win) {
  const distPath = path.join(__dirname, '..', 'dist', 'index.html');
  const envUrl = String(process.env.VITE_DEV_SERVER_URL || '').trim();

  // שרת פיתוח נטען רק אם הוגדר במפורש דרך environment variable.
  // כך הגרסה הארוזה וגם הרצה מקומית רגילה אינן תלויות ב-VS Code או ב-localhost.
  if (!app.isPackaged && envUrl) {
    try {
      loadRendererInProgress = true;
      await win.loadURL(envUrl);
      loadRendererInProgress = false;
      return true;
    } catch (error) {
      loadRendererInProgress = false;
      console.error('[Main] Failed to load Vite dev server, falling back to dist:', error?.message || error);
    }
  }

  try {
    await win.loadFile(distPath);
    return false;
  } catch (error) {
    await showLoadErrorPage(win, error?.message || 'קובץ הממשק המקומי לא נטען.');
    return false;
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: '#f3f2f1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const revealWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  };

  mainWindow.once('ready-to-show', revealWindow);
  mainWindow.webContents.once('did-finish-load', revealWindow);
  mainWindow.on('unresponsive', revealWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch {
      // מתעלמים מכתובות לא תקינות
    }
    return { action: 'deny' };
  });

  // לכידת שגיאות ה-renderer לצורך אבחון ומניעת מסך ריק
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) { // 2=warning, 3=error
      console.error(`[Renderer ${level === 3 ? 'ERROR' : 'WARN'}] ${message} (${sourceId}:${line})`);
    }
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Main] Renderer process gone:', details.reason, details.exitCode);
    if (!mainWindow.isDestroyed()) {
      showLoadErrorPage(mainWindow, `הרנדרר קרס: ${details.reason} (exit code ${details.exitCode})`);
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return; // התעלם מכשלון טעינת משאבים משניים (CDN, iframes)
    if (errorCode === -3) return; // ERR_ABORTED — טעינה בוטלה בכוונה, מתעלמים
    console.error(`[Main] did-fail-load: ${errorCode} ${errorDescription} (${validatedURL})`);
    // לא טוענים דף שגיאה בזמן ש-loadRenderer מנסה כתובות — מונע race condition
    if (loadRendererInProgress) return;
    if (!mainWindow.isDestroyed()) {
      showLoadErrorPage(mainWindow, `${errorDescription} (${errorCode})`);
    }
  });

  // DevTools רק בפיתוח
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.toggleDevTools();
      }
    });
  }

  loadRenderer(mainWindow).then(() => {
    if (pendingFilePayload) sendDocumentToRenderer(pendingFilePayload);
  });
}

ipcMain.handle('consume-pending-open-document', async () => {
  const payload = pendingFilePayload;
  pendingFilePayload = null;
  return payload || { canceled: true };
});

ipcMain.handle('open-document-dialog', async () => {
  if (!mainWindow) return { canceled: true };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'פתח קובץ',
    properties: ['openFile'],
    filters: [
      { name: 'מסמכים נתמכים', extensions: ['docx', 'txt', 'md', 'markdown', 'html', 'htm'] },
      { name: 'כל הקבצים', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
  return readDocumentPayload(result.filePaths[0]);
});

ipcMain.handle('save-document-dialog', async (_event, payload = {}) => {
  if (!mainWindow) return { canceled: true };
  const baseName = sanitizeFileName(payload?.title || 'document');
  let targetPath = payload?.filePath || '';
  const directWriteSupported = ['.txt', '.html', '.htm'];

  if (targetPath && !directWriteSupported.includes(path.extname(targetPath).toLowerCase())) {
    targetPath = '';
  }

  if (!targetPath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'שמור בשם',
      defaultPath: `${baseName}.html`,
      filters: [
        { name: 'HTML', extensions: ['html'] },
        { name: 'Text', extensions: ['txt'] },
      ],
    });

    if (result.canceled || !result.filePath) return { canceled: true };
    targetPath = result.filePath;
  }

  let ext = path.extname(targetPath).toLowerCase();
  if (!['.txt', '.html', '.htm'].includes(ext)) {
    targetPath = `${targetPath.replace(/\.[^.]+$/, '') || targetPath}.html`;
    ext = '.html';
  }

  if (ext === '.txt') {
    fs.writeFileSync(targetPath, String(payload?.text || ''), 'utf8');
  } else {
    fs.writeFileSync(targetPath, wrapHtmlDocument(String(payload?.html || ''), baseName), 'utf8');
  }

  return { ok: true, canceled: false, filePath: targetPath };
});

ipcMain.handle('save-local-material', async (_event, payload) => {
  let safeName = path.basename(String(payload?.name || 'material.bin')).replace(/[^\w\u0590-\u05FF .()\-]/g, '_');
  if (safeName.toLowerCase() === 'index.json') {
    safeName = `uploaded-${Date.now()}.json`;
  }
  const parsedName = path.parse(safeName);
  safeName = `${parsedName.name}-${Date.now()}${parsedName.ext || ''}`;
  const dataBase64 = String(payload?.dataBase64 || '');
  if (!safeName || !dataBase64) {
    throw new Error('Missing upload payload');
  }

  const materialsDir = getWritableMaterialsDir();
  const filePath = path.join(materialsDir, safeName);
  fs.writeFileSync(filePath, Buffer.from(dataBase64, 'base64'));

  const indexPath = path.join(materialsDir, 'index.json');
  let existing = [];
  try { existing = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch {}
  const nextEntry = {
    id: safeName,
    title: String(payload?.title || safeName),
    file: safeName,
    type: path.extname(safeName).replace(/^\./, ''),
    source: 'materials-local',
    uploadKind: String(payload?.uploadKind || 'general'),
    label: String(payload?.label || 'קובץ עזר כללי'),
    category: String(payload?.category || 'general'),
    templateId: String(payload?.templateId || 'blank'),
    learningHint: String(payload?.learningHint || ''),
    uploadedAt: new Date().toISOString(),
  };
  const merged = [...(Array.isArray(existing) ? existing.filter((item) => item.file !== safeName) : []), nextEntry];
  fs.writeFileSync(indexPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');

  return { ok: true, file: safeName, entry: nextEntry };
});

ipcMain.handle('list-local-materials', async () => {
  try {
    const indexPath = path.join(getWritableMaterialsDir(), 'index.json');
    const items = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
});

ipcMain.handle('read-local-material', async (_event, fileName = '') => {
  const safeName = path.basename(String(fileName || '')).replace(/[^\w\u0590-\u05FF .()\-]/g, '_');
  if (!safeName) return { ok: false, error: 'Missing file name' };

  try {
    const filePath = path.join(getWritableMaterialsDir(), safeName);
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(safeName).toLowerCase();
    let extractedText = '';

    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      extractedText = String(result?.value || '').trim();
    } else if (['.txt', '.md', '.markdown', '.html', '.htm', '.json'].includes(ext)) {
      extractedText = fs.readFileSync(filePath, 'utf8');
    }

    return {
      ok: true,
      file: safeName,
      dataBase64: buffer.toString('base64'),
      extractedText,
    };
  } catch (error) {
    return { ok: false, error: error?.message || 'Read failed' };
  }
});

ipcMain.handle('load-provider-config', async () => {
  try {
    return readPersistedProviderConfig();
  } catch (error) {
    return { ok: false, error: error?.message || 'Load failed' };
  }
});

ipcMain.handle('save-provider-config', async (_event, config = {}) => {
  try {
    return writePersistedProviderConfig(config);
  } catch (error) {
    return { ok: false, error: error?.message || 'Save failed' };
  }
});

ipcMain.handle('get-app-update-info', async () => ({
  ok: true,
  ...latestUpdateState,
  isPackaged: app.isPackaged,
  currentVersion: app.getVersion(),
}));

async function triggerUpdateCheck() {
  if (!app.isPackaged) {
    return {
      ok: false,
      ...sendUpdateStatus({ status: 'dev-mode', message: 'בדיקת עדכונים זמינה רק באפליקציה המותקנת' }),
    };
  }

  try {
    await autoUpdater.checkForUpdates();
    return { ok: true, ...latestUpdateState };
  } catch (error) {
    return {
      ok: false,
      ...sendUpdateStatus({ status: 'error', message: error?.message || 'בדיקת העדכונים נכשלה' }),
    };
  }
}

ipcMain.handle('check-for-app-updates', async () => triggerUpdateCheck());

ipcMain.handle('install-app-update', async () => {
  if (latestUpdateState.status !== 'downloaded') {
    return { ok: false, ...latestUpdateState, message: 'עדיין אין עדכון מוכן להתקנה' };
  }

  setImmediate(() => autoUpdater.quitAndInstall());
  return { ok: true, ...latestUpdateState, message: 'ההתקנה מתחילה כעת' };
});

function createAppMenu() {
  const template = [
    {
      label: 'קובץ',
      submenu: [
        { label: 'טען מחדש', role: 'reload' },
        { label: 'כפה טעינה מחדש', role: 'forceReload' },
        { type: 'separator' },
        { label: 'יציאה', role: 'quit' },
      ],
    },
    {
      label: 'עריכה',
      submenu: [
        { label: 'בטל', role: 'undo' },
        { label: 'בצע שוב', role: 'redo' },
        { type: 'separator' },
        { label: 'גזור', role: 'cut' },
        { label: 'העתק', role: 'copy' },
        { label: 'הדבק', role: 'paste' },
        { label: 'בחר הכל', role: 'selectAll' },
      ],
    },
    {
      label: 'תצוגה',
      submenu: [
        { label: 'זום פנימה', role: 'zoomIn' },
        { label: 'זום החוצה', role: 'zoomOut' },
        { label: 'איפוס זום', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'מסך מלא', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'עזרה',
      submenu: [
        {
          label: 'בדוק עדכונים',
          click: async () => {
            const result = await triggerUpdateCheck();
            if (result?.ok === false) {
              await dialog.showMessageBox({
                type: result.status === 'error' ? 'error' : 'info',
                title: 'עדכונים',
                message: result.message || 'לא ניתן לבדוק עדכונים כרגע.',
              });
            }
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', async (_event, argv) => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const launchFilePath = getLaunchFilePath(argv);
    if (launchFilePath) {
      const payload = await readDocumentPayload(launchFilePath);
      sendDocumentToRenderer(payload);
    }
  });

  app.whenReady().then(async () => {
    createAppMenu();
    createMainWindow();
    setupAutoUpdater();

    const launchFilePath = getLaunchFilePath(process.argv.slice(1));
    if (launchFilePath) {
      const payload = await readDocumentPayload(launchFilePath);
      sendDocumentToRenderer(payload);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
