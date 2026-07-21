// desktopShim.js — מספק את window.desktopApp מעל Tauri, כדי שהקוד הקיים
// (שקורא window.desktopApp.*) יעבוד ללא שינוי בדסקטופ ה-Tauri.
//
// עיקרון: Rust מינימלי (proxy, fs, dialogs). כל ההמרות (docx/טקסט) ולוגיקת
// ה-index.json נעשות כאן ב-JS עם הספריות שכבר ב-bundle.
//
// מה שלא מסופק כאן נשאר graceful: parseSpssSavData (יש fallback בדפדפן),
// fetchBrowserPageSnapshot (מושבת), updater (stub).

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { buildDocxBlob } from './services/browserDocxExport';
import { extractMaterialTextFromBytes } from './services/materialExtractBrowser';

const PROVIDER_CONFIG_FILE = 'ai-provider-config.json';
const APP_SETTINGS_FILE = 'app-settings.json';
const MATERIALS_DIR = 'project-materials';
const MATERIALS_INDEX = `${MATERIALS_DIR}/index.json`;

// ── base64 helpers ──────────────────────────────────────────────────────────
const base64ToUint8 = (b64 = '') => {
  const binary = atob(String(b64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const blobToBase64 = async (blob) => {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
  }
  return btoa(binary);
};

// ── path/name helpers ───────────────────────────────────────────────────────
const baseName = (p = '') => String(p || '').split(/[\\/]/).pop() || '';
const getExt = (p = '') => baseName(p).includes('.') ? baseName(p).split('.').pop().toLowerCase() : '';
const stripExt = (name = '') => name.replace(/\.[^.]+$/, '');

const sanitizeFileName = (name = 'material.bin') =>
  baseName(String(name || 'material.bin')).replace(/[^\w֐-׿ .()\-]/g, '_') || 'material.bin';

const sanitizeDocName = (title = '') =>
  String(title || '').trim().replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+|[.\s]+$/g, '').trim() || 'document';

const escapeHtml = (s = '') => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const textToHtml = (text = '') => String(text || '')
  .split(/\r?\n/).map((line) => `<p>${escapeHtml(line) || '<br>'}</p>`).join('');

const htmlToPlainText = (html = '') => String(html || '')
  .replace(/<br\s*\/?>(?=)/gi, '\n')
  .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

// styleCss מגיע מ-buildDesktopSavePayload (main.jsx) — בלעדיו הקובץ נשמר בלי פונט/גודל/
// רווח-שורות, כי המאפיינים האלה יושבים על מיכל העורך ולא בתוך ה-HTML עצמו.
const wrapHtmlDocument = (html = '', title = 'Document', styleCss = '') =>
  `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${styleCss || ''}</head><body>${html}</body></html>`;

// ── document open/save ──────────────────────────────────────────────────────
const DOC_FILTERS = [{ name: 'מסמכים', extensions: ['docx', 'txt', 'md', 'markdown', 'html', 'htm'] }];

const readDocumentFromPath = async (filePath) => {
  const ext = getExt(filePath);
  const title = stripExt(baseName(filePath));
  try {
    if (ext === 'docx') {
      const r = await invoke('read_file_base64', { path: filePath });
      if (!r.ok || !r.data) return { ok: false, error: r.error || 'קריאה נכשלה', filePath, title };
      const bytes = base64ToUint8(r.data);
      const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const mammoth = await import('mammoth');
      const html = (await mammoth.convertToHtml({ arrayBuffer })).value || '';
      const text = (await mammoth.extractRawText({ arrayBuffer })).value || '';
      return { ok: true, canceled: false, filePath, title, html, text };
    }
    const r = await invoke('read_file_text', { path: filePath });
    if (!r.ok) return { ok: false, error: r.error || 'קריאה נכשלה', filePath, title };
    const raw = r.data || '';
    const isHtml = ext === 'html' || ext === 'htm';
    return {
      ok: true,
      canceled: false,
      filePath,
      title,
      html: isHtml ? raw : textToHtml(raw),
      text: isHtml ? htmlToPlainText(raw) : raw,
    };
  } catch (err) {
    return { ok: false, error: err?.message || 'קריאה נכשלה', filePath, title };
  }
};

const openDocumentDialog = async () => {
  const filePath = await invoke('pick_open_file', { filters: DOC_FILTERS, title: 'פתח קובץ' });
  if (!filePath) return { canceled: true };
  return readDocumentFromPath(filePath);
};

const openDocumentByPath = async (filePath) => {
  if (!filePath) return { ok: false, error: 'נתיב חסר' };
  return readDocumentFromPath(filePath);
};

const saveDialogFilters = (ext) => {
  const map = {
    docx: { name: 'Word', extensions: ['docx'] },
    pptx: { name: 'PowerPoint', extensions: ['pptx'] },
    html: { name: 'HTML', extensions: ['html', 'htm'] },
    txt: { name: 'טקסט', extensions: ['txt'] },
  };
  const primary = map[ext] || map.docx;
  const rest = Object.values(map).filter((f) => f !== primary);
  return [primary, ...rest];
};

const saveDocumentDialog = async (payload = {}) => {
  const { title = 'document', preferredExtension = 'docx', html = '', text = '', exportOptions = {}, base64 = '' } = payload;
  let filePath = payload.filePath;

  if (!filePath) {
    const ext = preferredExtension || 'docx';
    filePath = await invoke('pick_save_file', {
      defaultName: `${sanitizeDocName(title)}.${ext}`,
      filters: saveDialogFilters(ext),
      title: 'שמור בשם',
    });
    if (!filePath) return { canceled: true };
  }

  const ext = getExt(filePath) || preferredExtension || 'docx';
  try {
    if (ext === 'pptx') {
      const r = await invoke('write_file_base64', { path: filePath, dataBase64: base64 });
      if (!r.ok) return { ok: false, error: r.error };
    } else if (ext === 'txt') {
      const r = await invoke('write_file_text', { path: filePath, contents: text || htmlToPlainText(html) });
      if (!r.ok) return { ok: false, error: r.error };
    } else if (ext === 'html' || ext === 'htm') {
      const r = await invoke('write_file_text', { path: filePath, contents: wrapHtmlDocument(html, title, exportOptions?.styleCss) });
      if (!r.ok) return { ok: false, error: r.error };
    } else {
      const blob = await buildDocxBlob({ html, text, exportOptions });
      const b64 = await blobToBase64(blob);
      const r = await invoke('write_file_base64', { path: filePath, dataBase64: b64 });
      if (!r.ok) return { ok: false, error: r.error };
    }
    return { ok: true, canceled: false, filePath };
  } catch (err) {
    return { ok: false, error: err?.message || 'שמירה נכשלה' };
  }
};

// ── provider config / app settings — מוצפנים ב-DPAPI (מקביל ל-safeStorage) ──
const readSecureJson = async (rel) => {
  const r = await invoke('read_secure_file', { rel });
  if (r.ok && r.data) {
    try { return JSON.parse(r.data); } catch { return {}; }
  }
  return {};
};

const writeSecureJson = async (rel, value) => {
  const r = await invoke('save_secure_file', { rel, contents: JSON.stringify(value ?? {}, null, 2) });
  return { ok: Boolean(r.ok), filePath: r.data, error: r.error };
};

// ── local materials ─────────────────────────────────────────────────────────
const readMaterialsIndex = async () => {
  const r = await invoke('read_app_file', { rel: MATERIALS_INDEX });
  if (r.ok && r.data) {
    try { const parsed = JSON.parse(r.data); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
};

const writeMaterialsIndex = async (entries) =>
  invoke('write_app_file', { rel: MATERIALS_INDEX, contents: JSON.stringify(entries, null, 2) });

const saveLocalMaterial = async (payload = {}) => {
  const safeName = sanitizeFileName(payload.name);
  const write = await invoke('write_app_file_base64', {
    rel: `${MATERIALS_DIR}/${safeName}`,
    dataBase64: payload.dataBase64 || '',
  });
  if (!write.ok) return { ok: false, error: write.error || 'שמירת חומר נכשלה' };

  const entry = {
    id: safeName,
    title: String(payload.title || safeName),
    file: safeName,
    type: getExt(safeName),
    source: 'materials-local',
    uploadKind: String(payload.uploadKind || 'general'),
    label: String(payload.label || 'קובץ עזר כללי'),
    category: String(payload.category || 'general'),
    templateId: String(payload.templateId || 'blank'),
    learningHint: String(payload.learningHint || ''),
    previewText: String(payload.previewText || '').trim(),
    contentText: String(payload.contentText || payload.previewText || '').trim(),
    previewChars: Math.max(0, Number(payload.previewChars) || 0),
    previewStatus: String(payload.previewStatus || '').trim(),
    previewSource: String(payload.previewSource || '').trim(),
    previewError: String(payload.previewError || '').trim(),
    extractedChars: Math.max(0, Number(payload.extractedChars) || 0),
    extractionStatus: String(payload.extractionStatus || '').trim(),
    extractionMessage: String(payload.extractionMessage || '').trim(),
    extractionTruncated: payload.extractionTruncated === true,
    // שיוך לתיקיית פרויקט (אופציונלי) — חומר בלי projectId נשאר גלובלי.
    projectId: String(payload.projectId || '').trim(),
    uploadedAt: new Date().toISOString(),
  };

  const index = await readMaterialsIndex();
  const merged = [...index.filter((it) => it.file !== safeName), entry];
  await writeMaterialsIndex(merged);
  return { ok: true, file: safeName, entry };
};

const listLocalMaterials = async () => readMaterialsIndex();

const readLocalMaterial = async (fileName) => {
  const safeName = sanitizeFileName(fileName);
  const r = await invoke('read_app_file_base64', { rel: `${MATERIALS_DIR}/${safeName}` });
  if (!r.ok || r.data == null) return { ok: false, error: r.error || 'הקובץ לא נמצא' };

  let extractedText = '';
  let extractedTextError = '';
  try {
    // 48k תווים ≈ 12k טוקנים — תוכן מלא לחומר עזר (ולא רק תצוגה מקדימה) להזרמה ל-AI.
    const extraction = await extractMaterialTextFromBytes(safeName, base64ToUint8(r.data), 48000);
    if (extraction.ok) extractedText = extraction.text || '';
    else extractedTextError = extraction.error || '';
  } catch (err) {
    extractedTextError = err?.message || 'חילוץ נכשל';
  }
  return { ok: true, file: safeName, dataBase64: r.data, extractedText, extractedTextError };
};

const deleteLocalMaterial = async (fileName) => {
  const safeName = sanitizeFileName(fileName);
  const r = await invoke('delete_app_file', { rel: `${MATERIALS_DIR}/${safeName}` });
  if (!r.ok) return { ok: false, error: r.error || 'מחיקה נכשלה' };
  const index = await readMaterialsIndex();
  await writeMaterialsIndex(index.filter((it) => it.file !== safeName && it.id !== safeName));
  return { ok: true, file: safeName };
};

const extractMaterialText = async (payload = {}) => {
  const { fileName = '', dataBase64 = '', maxLength = 12000 } = payload;
  try {
    return await extractMaterialTextFromBytes(fileName, base64ToUint8(dataBase64), maxLength);
  } catch (err) {
    return { ok: false, error: err?.message || 'חילוץ נכשל' };
  }
};

// ── Google OAuth (loopback) — signInWithPopup לא עובד ב-WebView ─────────────
const GOOGLE_DESKTOP_CLIENT_ID = import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_ID || '';
const GOOGLE_DESKTOP_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_SECRET || '';
const googleOAuth = async () => {
  if (!GOOGLE_DESKTOP_CLIENT_ID) {
    return { ok: false, error: 'חסר VITE_GOOGLE_DESKTOP_CLIENT_ID בהגדרות הבנייה.' };
  }
  return invoke('google_oauth', {
    clientId: GOOGLE_DESKTOP_CLIENT_ID,
    clientSecret: GOOGLE_DESKTOP_CLIENT_SECRET,
  });
};

// ── proxy ───────────────────────────────────────────────────────────────────
const proxyHttpRequest = async (request = {}) => invoke('proxy_http_request', { request });
const abortProxyHttpRequest = async (requestId = '') => invoke('abort_proxy_http_request', { requestId });
// בדיקת חיות URL של מקור (דומיין שרירותי, https בלבד) — ראה proxy.rs::verify_url.
const verifyUrl = async (request = {}) => invoke('verify_url', { request });
// קריאת תוכן טקסטואלי של עמוד מקור (התאמת טענה-מקור) — ראה proxy.rs::fetch_page_text.
const fetchPageText = async (request = {}) => invoke('fetch_page_text', { request });

// ── updater (tauri-plugin-updater דרך פקודות Rust) ──────────────────────────
const decorateUpdateResult = (result = {}) => ({
  percent: result.status === 'up-to-date' ? 100 : 0,
  checkedAt: new Date().toISOString(),
  isPackaged: true,
  currentVersion: (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''),
  availableVersion: '',
  ...result,
});

const checkForAppUpdates = async () => {
  try {
    return decorateUpdateResult(await invoke('check_for_update'));
  } catch (err) {
    return decorateUpdateResult({ ok: false, status: 'error', message: err?.message || 'בדיקת עדכון נכשלה' });
  }
};

const installAppUpdate = async () => {
  try {
    return decorateUpdateResult(await invoke('install_update'));
  } catch (err) {
    return decorateUpdateResult({ ok: false, status: 'error', message: err?.message || 'התקנת עדכון נכשלה' });
  }
};

// ── install bridge ──────────────────────────────────────────────────────────
export function installDesktopShim() {
  if (typeof window === 'undefined') return;
  // רץ רק תחת Tauri, ולא דורסים גשר Electron אם במקרה קיים.
  if (!window.__TAURI_INTERNALS__ || window.desktopApp) return;

  window.desktopApp = {
    isDesktop: true,
    runtime: 'tauri',
    platform: 'win32',
    windowContext: {
      isolatedDocumentSession: false,
      documentStorageScopeId: 'primary',
      hasPendingOpenDocument: false,
    },
    versions: {
      app: (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''),
      tauri: true,
    },

    proxyHttpRequest,
    abortProxyHttpRequest,
    verifyUrl,
    fetchPageText,
    googleOAuth,

    openDocumentDialog,
    openDocumentByPath,
    saveDocumentDialog,
    consumePendingOpenDocument: async () => {
      try {
        const filePath = await invoke('take_pending_open_file');
        if (!filePath) return { canceled: true };
        const doc = await readDocumentFromPath(filePath);
        return doc.ok ? doc : { canceled: true };
      } catch {
        return { canceled: true };
      }
    },
    consumePendingOpenSettings: async () => null,
    createAppWindow: async () => ({ ok: false, windowId: null }),

    loadProviderConfig: async () => readSecureJson(PROVIDER_CONFIG_FILE),
    saveProviderConfig: async (config) => writeSecureJson(PROVIDER_CONFIG_FILE, config),
    // גישה גנרית לקובץ מוצפן DPAPI לפי נתיב יחסי (משמש את "זכור במכשיר הזה")
    readSecureValue: async (rel) => readSecureJson(rel),
    saveSecureValue: async (rel, value) => writeSecureJson(rel, value),
    loadAppSettings: async () => readSecureJson(APP_SETTINGS_FILE),
    saveAppSettings: async (settings) => writeSecureJson(APP_SETTINGS_FILE, settings),

    saveLocalMaterial,
    listLocalMaterials,
    readLocalMaterial,
    deleteLocalMaterial,
    extractMaterialText,

    getAppUpdateInfo: async () => decorateUpdateResult({ ok: true, status: 'idle', message: '' }),
    checkForAppUpdates,
    installAppUpdate,

    onAppUpdateStatus: () => () => {},
    onOpenExternalDocument: (callback) => {
      // single-instance: פתיחת קובץ כשהאפליקציה כבר רצה → אירוע מ-Rust
      let unlisten = () => {};
      listen('open-external-document', (event) => callback(event.payload)).then((fn) => { unlisten = fn; });
      return () => unlisten();
    },
    onOpenSettings: () => () => {},
  };

  console.info('[desktopShim] window.desktopApp installed over Tauri');
}

// התקנה אוטומטית בייבוא — מבטיח שהגשר קיים לפני שקוד אחר ניגש ל-window.desktopApp.
installDesktopShim();
