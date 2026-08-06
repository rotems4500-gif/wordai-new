// clipWriter.js — כתיבת קליפים ל-Firestore/Storage
// סכימת מסמך: users/{uid}/clips/{clipId}

import { getDb, getStorageInstance } from './firebaseClient.js';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { getSettings } from './settings.js';

const MAX_TEXT_CHARS = 900000;

function makeClipId() {
  const rand = Math.random().toString(36).slice(2, 6);
  return `clip-${Date.now().toString(36)}-${rand}`;
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * כותב קליפ טקסטואלי (עמוד שלם / בחירה).
 * @param {{uid:string, title:string, text:string, sourceUrl:string, captureMode:string}} params
 */
export async function writeTextClip({ uid, title, text, sourceUrl, captureMode }) {
  const settings = await getSettings();
  const clipId = makeClipId();
  const truncated = text.length > MAX_TEXT_CHARS;
  const finalText = truncated ? text.slice(0, MAX_TEXT_CHARS) : text;

  const db = getDb();
  const clipRef = doc(db, 'users', uid, 'clips', clipId);
  await setDoc(clipRef, {
    kind: 'text',
    status: 'pending',
    captureMode,
    title: title || '(ללא כותרת)',
    text: finalText,
    sourceUrl: sourceUrl || null,
    domain: domainFromUrl(sourceUrl),
    createdAt: serverTimestamp(),
    destination: settings.defaultDestination,
    projectId: settings.lastProjectId || null,
    storagePath: null,
    truncated,
    errorMessage: null,
    processedAt: null,
  });

  return clipId;
}

/**
 * כותב קליפ תמונה: מעלה קודם ל-Storage, ואז כותב את מסמך ה-Firestore עם הנתיב.
 * @param {{uid:string, title:string, bytes:Uint8Array|ArrayBuffer, sourceUrl:string, captureMode:string, contentType?:string}} params
 */
export async function writeImageClip({ uid, title, bytes, sourceUrl, captureMode, contentType = 'image/png' }) {
  const settings = await getSettings();
  const clipId = makeClipId();
  const storagePath = `users/${uid}/clips/${clipId}/image.png`;

  const storage = getStorageInstance();
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, bytes, { contentType });

  const db = getDb();
  const clipRef = doc(db, 'users', uid, 'clips', clipId);
  await setDoc(clipRef, {
    kind: 'image',
    status: 'pending',
    captureMode,
    title: title || '(תמונה ללא כותרת)',
    text: null,
    sourceUrl: sourceUrl || null,
    domain: domainFromUrl(sourceUrl),
    createdAt: serverTimestamp(),
    destination: settings.defaultDestination,
    projectId: settings.lastProjectId || null,
    storagePath,
    truncated: false,
    errorMessage: null,
    processedAt: null,
  });

  return clipId;
}
