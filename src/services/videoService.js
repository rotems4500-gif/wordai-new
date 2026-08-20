// ═══════════════════════════════════════════════════════════════
// videoService.js — יצירת וידאו עם Veo על מפתח ה-Gemini הרגיל.
// מסלול: POST :predictLongRunning → קבלת שם operation → polling קצר כל כמה שניות
// (ה-proxy של הדסקטופ מוגבל ל-300s לבקשה — אסור להחזיק חיבור פתוח) → הורדת ה-mp4
// כ-base64. בדפדפן (בלי proxy) ההורדה עלולה להיחסם ב-CORS — מחזירים אז את ה-URI
// עם downloadFailed כדי שה-UI יציג קישור חיצוני (דסקטופ-first בכוונה).
// ═══════════════════════════════════════════════════════════════

import { getProviderConfig } from './aiService';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const POLL_INTERVAL_MS = 8000;
const MAX_POLL_MS = 10 * 60 * 1000;

const hasDesktopProxy = () =>
  typeof window !== 'undefined' && window.desktopApp && typeof window.desktopApp.proxyHttpRequest === 'function';

let reqCounter = 0;
const nextRequestId = () => {
  reqCounter += 1;
  return `vid-${reqCounter}-${Date.now()}`;
};

// אותו דפוס proxy-או-fetch כמו ב-imageService (מודול נפרד בכוונה — לא גורר את aiService ל-taskpane).
const httpRequest = async ({ url, method = 'GET', headers = {}, body = null, responseEncoding = 'utf8', timeoutMs = 30000, signal }) => {
  if (hasDesktopProxy()) {
    const res = await window.desktopApp.proxyHttpRequest({
      url, method, headers, body, responseEncoding, timeoutMs, requestId: nextRequestId(),
    });
    if (!res || res.ok === false) {
      throw new Error(res?.body ? `שגיאת רשת (${res.status || 0}): ${String(res.body).slice(0, 200)}` : 'שגיאת רשת');
    }
    return { body: res.body, contentType: res.contentType || '' };
  }
  const res = await fetch(url, { method, headers, body, signal });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`שגיאת רשת (${res.status})${txt ? `: ${txt.slice(0, 200)}` : ''}`);
  }
  if (responseEncoding === 'base64') {
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return { body: btoa(binary), contentType: res.headers.get('content-type') || '' };
  }
  return { body: await res.text(), contentType: res.headers.get('content-type') || '' };
};

const wait = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  if (signal) {
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('הופסק על ידי המשתמש', 'AbortError'));
    }, { once: true });
  }
});

const resolveVideoGenKey = (cfg = {}) => {
  const direct = String(cfg?.videoGen?.key || '').trim();
  if (direct) return direct;
  // אותו מפתח כמו הטקסט — זו בדיוק הפואנטה של "יותר מודלים על אותו מפתח".
  return String(cfg?.gemini?.key || '').trim();
};

// חילוץ הגנתי של ה-URI מכל צורות התשובה המוכרות של Veo (הסכמה זזה בין גרסאות).
const extractVideoUri = (operation = {}) => {
  const response = operation?.response || {};
  const candidates = [
    response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri,
    response?.generateVideoResponse?.generatedVideos?.[0]?.video?.uri,
    response?.generatedVideos?.[0]?.video?.uri,
    response?.generatedSamples?.[0]?.video?.uri,
    response?.videos?.[0]?.uri,
  ];
  return candidates.find((value) => typeof value === 'string' && value.trim()) || '';
};

const extractSafetyBlock = (operation = {}) => {
  const response = operation?.response || {};
  const filtered = Number(response?.generateVideoResponse?.raiMediaFilteredCount || response?.raiMediaFilteredCount || 0);
  if (filtered > 0) {
    const reasons = response?.generateVideoResponse?.raiMediaFilteredReasons || response?.raiMediaFilteredReasons || [];
    return `הסרטון נחסם על ידי מסנני הבטיחות של Google${Array.isArray(reasons) && reasons.length ? ` (${String(reasons[0]).slice(0, 160)})` : ''}. נסה ניסוח אחר.`;
  }
  return '';
};

/**
 * generateVeoVideo — יוצר וידאו ומחזיר {ok, base64?, mime, uri, model, downloadFailed?}.
 * @param {string} prompt תיאור הסרטון
 * @param {object} opts { model?, key?, signal?, aspectRatio?, onProgress? }
 *   onProgress מקבל { phase: 'starting'|'generating'|'downloading', elapsedSec, attempt }.
 */
export const generateVeoVideo = async (prompt, { model = '', key = '', signal = null, aspectRatio = '16:9', onProgress = null } = {}) => {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) throw new Error('חסר תיאור ליצירת הסרטון.');
  const cfg = getProviderConfig();
  const apiKey = String(key || '').trim() || resolveVideoGenKey(cfg);
  if (!apiKey) throw new Error('לא הוגדר מפתח Gemini ליצירת וידאו — עבור להגדרות AI.');
  const cleanModel = String(model || cfg?.videoGen?.model || 'veo-3.1-fast-generate-preview').trim();
  const report = (phase, extra = {}) => { try { onProgress?.({ phase, ...extra }); } catch { /* noop */ } };

  // 1) התנעה — מחזירה שם operation מיד (long-running).
  report('starting', { elapsedSec: 0, attempt: 0 });
  const startUrl = `${GEMINI_API_BASE}/models/${encodeURIComponent(cleanModel)}:predictLongRunning?key=${encodeURIComponent(apiKey)}`;
  const startBody = JSON.stringify({
    instances: [{ prompt: cleanPrompt }],
    parameters: { aspectRatio: aspectRatio || '16:9' },
  });
  const { body: startRes } = await httpRequest({
    url: startUrl, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: startBody, timeoutMs: 30000, signal,
  });
  const startData = JSON.parse(startRes || '{}');
  const operationName = String(startData?.name || '').trim();
  if (!operationName) {
    throw new Error(`Veo לא החזיר operation — ייתכן שהמודל "${cleanModel}" לא זמין למפתח הזה. ${String(startRes || '').slice(0, 160)}`);
  }

  // 2) polling — בקשות GET קצרות; בין בקשות בודקים abort.
  const startedAt = Date.now();
  let attempt = 0;
  let operation = null;
  for (;;) {
    if (signal?.aborted) throw new DOMException('הופסק על ידי המשתמש', 'AbortError');
    if (Date.now() - startedAt > MAX_POLL_MS) {
      throw new Error('יצירת הסרטון לא הסתיימה תוך 10 דקות — נסה שוב מאוחר יותר.');
    }
    await wait(POLL_INTERVAL_MS, signal);
    attempt += 1;
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    report('generating', { elapsedSec, attempt });
    const pollUrl = `${GEMINI_API_BASE}/${operationName.replace(/^\//, '')}?key=${encodeURIComponent(apiKey)}`;
    const { body: pollRes } = await httpRequest({ url: pollUrl, method: 'GET', timeoutMs: 15000, signal });
    operation = JSON.parse(pollRes || '{}');
    if (operation?.error) {
      throw new Error(`Veo נכשל: ${String(operation.error?.message || JSON.stringify(operation.error)).slice(0, 200)}`);
    }
    if (operation?.done) break;
  }

  const safetyMessage = extractSafetyBlock(operation);
  if (safetyMessage) throw new Error(safetyMessage);
  const videoUri = extractVideoUri(operation);
  if (!videoUri) {
    throw new Error(`Veo סיים בלי וידאו בתשובה — צורת תשובה לא מוכרת. ${JSON.stringify(operation?.response || {}).slice(0, 200)}`);
  }

  // 3) הורדה. ה-URI הוא בדרך כלל files/...:download?alt=media על אותו host (ה-proxy מרשה).
  report('downloading', { elapsedSec: Math.round((Date.now() - startedAt) / 1000), attempt });
  const downloadUrl = `${videoUri}${videoUri.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`;
  try {
    const { body: base64, contentType } = await httpRequest({
      url: downloadUrl, method: 'GET', responseEncoding: 'base64', timeoutMs: 300000, signal,
    });
    return {
      ok: true,
      base64,
      mime: contentType && contentType.startsWith('video/') ? contentType : 'video/mp4',
      uri: videoUri,
      model: cleanModel,
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    // דפדפן/CORS: הסרטון קיים אצל Google — מחזירים קישור במקום להפיל את הזרימה.
    return { ok: true, base64: '', mime: 'video/mp4', uri: downloadUrl, model: cleanModel, downloadFailed: true };
  }
};

/** זמינות ל-UI: האם יש מפתח שמאפשר יצירת וידאו. */
export const getVideoGenAvailability = (cfg = null) => {
  const config = cfg || getProviderConfig();
  return {
    available: Boolean(resolveVideoGenKey(config)),
    provider: config?.videoGen?.provider || 'gemini',
    model: String(config?.videoGen?.model || 'veo-3.1-fast-generate-preview').trim(),
  };
};
