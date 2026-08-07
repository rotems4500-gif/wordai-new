// lecturerProfileStore.js — פרופילי מרצים: משוב שנקלט מעבודות בדוקות ולקחים שזוקקו ממנו.
//
// אותו עיקרון כמו styleTargetsStore: מה שנשמר הוא **רשומות קצרות** — הערת המרצה
// (≤400 תווים) ועוגן של עד 160 תווים מהטקסט שאליו נצמדה — לעולם לא גוף מסמך.
// לכן ה-blob קטן (עשרות KB לכל היותר) ורשאי לנסוע בסנכרון הענן.
//
// שתי שכבות: פרופיל פר-מרצה (returns/events/rules) + rules גלובליים שקודמו
// כשאותו לקח הופיע אצל כמה מרצים. לקח (rule) הוא תמיד תוצר גלוי: המשתמש רואה,
// עורך, מכבה ומוחק — ועריכת משתמש מנצחת כל זיקוק חוזר וכל סנכרון.
//
// מחיקות: מרצה נמחק ב-tombstone (deletedAt) ולקח נרשם ב-deletedRuleIds — אחרת
// סנכרון דו-כיווני היה מחיה כל מה שנמחק. sync לעולם לא מוחק מידע חי בצד השני.
//
// תלויות: styleKvStore בלבד. אין תלות ב-UI ואין קריאות מודל.

import { idbGet, idbSet, isIdbAvailable } from './styleKvStore';

export const LECTURER_PROFILES_STORAGE_KEY = 'wordai_lecturer_profiles_v1';
export const LECTURER_PROFILES_SCHEMA_VERSION = 1;
export const LECTURER_PROFILES_UPDATED_EVENT = 'wordai-lecturer-profiles-updated';

export const MAX_EVENTS_PER_LECTURER = 60;
export const ANCHOR_EXCERPT_MAX = 160;
export const FEEDBACK_TEXT_MAX = 400;

export const EVENT_KINDS = ['comment', 'deletion', 'insertion', 'replacement', 'highlight', 'manual', 'grade-note'];
export const RULE_CATEGORIES = ['citation', 'structure', 'argument', 'language', 'formatting', 'sources', 'other'];

let cache = null;
let hydrated = false;
let hydratePromise = null;
let pendingWrite = null;
let lastWriteError = null;

const nowIso = () => new Date().toISOString();

const emptyBlob = () => ({
  schemaVersion: LECTURER_PROFILES_SCHEMA_VERSION,
  lecturers: {},
  globalRules: [],
  deletedGlobalRuleIds: {},
  updatedAt: null,
});

/** djb2 → base36. אותו רעיון כמו createReviewFindingId ב-AiSidebar. */
function hash36(str) {
  let h = 5381;
  const s = String(str || '');
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * נרמול שם מרצה להשוואה: הסרת ניקוד, תארים (ד"ר/פרופ'/מר/גב'), גרשיים ורווחים
 * כפולים. ⚠️ בלי \b — לא עובד סביב אותיות עבריות.
 */
export function normalizeLecturerName(name) {
  let s = String(name || '').trim();
  if (!s) return '';
  s = s.replace(/[֑-ׇ]/g, ''); // ניקוד וטעמים
  s = s.replace(/(?:^|\s)(?:ד"ר|דר'|פרופ'|פרופסור|מר|גב'|עו"ד)(?=\s)/g, ' ');
  s = s.replace(/["'״׳]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function lecturerIdForName(name) {
  const norm = normalizeLecturerName(name);
  return norm ? `l_${hash36(norm)}` : '';
}

const clip = (text, max) => {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

function normalizeRule(raw) {
  if (!raw || typeof raw !== 'object' || !raw.text) return null;
  const text = clip(raw.text, 300);
  const evidenceEventIds = Array.isArray(raw.evidenceEventIds) ? raw.evidenceEventIds.filter(Boolean).map(String) : [];
  const evidenceCount = Math.max(Number(raw.evidenceCount) || 0, evidenceEventIds.length, 1);
  return {
    id: raw.id ? String(raw.id) : `r_${hash36(text)}`,
    text,
    scope: ['global', 'lecturer', 'course'].includes(raw.scope) ? raw.scope : 'lecturer',
    courseName: String(raw.courseName || ''),
    category: RULE_CATEGORIES.includes(raw.category) ? raw.category : 'other',
    source: ['distilled', 'manual', 'diff'].includes(raw.source) ? raw.source : 'distilled',
    evidenceCount,
    evidenceEventIds,
    confidence: evidenceCount >= 3 ? 'high' : evidenceCount === 2 ? 'medium' : 'low',
    status: raw.status === 'disabled' ? 'disabled' : 'active',
    userEdited: !!raw.userEdited,
    createdAt: raw.createdAt || nowIso(),
    updatedAt: raw.updatedAt || raw.createdAt || nowIso(),
  };
}

function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const anchorExcerpt = clip(raw.anchorExcerpt, ANCHOR_EXCERPT_MAX);
  const feedbackText = clip(raw.feedbackText, FEEDBACK_TEXT_MAX);
  if (!anchorExcerpt && !feedbackText) return null;
  return {
    id: raw.id ? String(raw.id) : `e_${hash36(`${anchorExcerpt}|${feedbackText}`)}`,
    returnId: String(raw.returnId || ''),
    kind: EVENT_KINDS.includes(raw.kind) ? raw.kind : 'comment',
    anchorExcerpt,
    feedbackText,
    sectionHint: String(raw.sectionHint || ''),
    category: RULE_CATEGORIES.includes(raw.category) ? raw.category : 'other',
    createdAt: raw.createdAt || nowIso(),
  };
}

function normalizeReturn(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: raw.id ? String(raw.id) : `ret_${hash36(`${raw.assignmentTitle || ''}|${raw.date || nowIso()}`)}`,
    date: raw.date || nowIso(),
    courseName: String(raw.courseName || ''),
    assignmentTitle: clip(raw.assignmentTitle, 120),
    grade: raw.grade === 0 || raw.grade ? raw.grade : null,
    source: ['docx-comments', 'pdf-annots', 'manual', 'diff'].includes(raw.source) ? raw.source : 'manual',
    eventCount: Number(raw.eventCount) || 0,
    docId: String(raw.docId || ''),
  };
}

function normalizeLecturer(raw) {
  if (!raw || typeof raw !== 'object' || !raw.name) return null;
  const id = raw.id ? String(raw.id) : lecturerIdForName(raw.name);
  if (!id) return null;
  return {
    id,
    name: String(raw.name).trim(),
    aliases: Array.isArray(raw.aliases) ? [...new Set(raw.aliases.map((a) => String(a).trim()).filter(Boolean))] : [],
    courses: Array.isArray(raw.courses) ? [...new Set(raw.courses.map((c) => String(c).trim()).filter(Boolean))] : [],
    createdAt: raw.createdAt || nowIso(),
    updatedAt: raw.updatedAt || nowIso(),
    deletedAt: raw.deletedAt || null,
    returns: (Array.isArray(raw.returns) ? raw.returns : []).map(normalizeReturn).filter(Boolean),
    events: (Array.isArray(raw.events) ? raw.events : []).map(normalizeEvent).filter(Boolean),
    rules: (Array.isArray(raw.rules) ? raw.rules : []).map(normalizeRule).filter(Boolean),
    deletedRuleIds: raw.deletedRuleIds && typeof raw.deletedRuleIds === 'object' ? { ...raw.deletedRuleIds } : {},
  };
}

function normalizeBlob(blob) {
  if (!blob || typeof blob !== 'object') return emptyBlob();
  if (blob.schemaVersion !== LECTURER_PROFILES_SCHEMA_VERSION) return emptyBlob();
  const lecturers = {};
  if (blob.lecturers && typeof blob.lecturers === 'object') {
    for (const raw of Object.values(blob.lecturers)) {
      const lecturer = normalizeLecturer(raw);
      if (lecturer) lecturers[lecturer.id] = lecturer;
    }
  }
  return {
    schemaVersion: LECTURER_PROFILES_SCHEMA_VERSION,
    lecturers,
    globalRules: (Array.isArray(blob.globalRules) ? blob.globalRules : []).map(normalizeRule).filter(Boolean),
    deletedGlobalRuleIds: blob.deletedGlobalRuleIds && typeof blob.deletedGlobalRuleIds === 'object' ? { ...blob.deletedGlobalRuleIds } : {},
    updatedAt: blob.updatedAt || null,
  };
}

function emitUpdated() {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent(LECTURER_PROFILES_UPDATED_EVENT)); } catch {}
}

function persist() {
  const snapshot = cache;
  if (typeof window === 'undefined' || !snapshot) return Promise.resolve();
  pendingWrite = (async () => {
    if (isIdbAvailable()) {
      try {
        await idbSet(LECTURER_PROFILES_STORAGE_KEY, snapshot);
        lastWriteError = null;
        return;
      } catch (err) {
        lastWriteError = `IndexedDB: ${String(err?.message || err)}`;
      }
    }
    try {
      localStorage.setItem(LECTURER_PROFILES_STORAGE_KEY, JSON.stringify(snapshot));
      lastWriteError = null;
    } catch (err) {
      lastWriteError = String(err?.message || err);
    }
  })();
  return pendingWrite;
}

async function touchAndPersist() {
  cache = { ...cache, updatedAt: nowIso() };
  await persist();
  emitUpdated();
}

/** טוען פעם אחת. @returns {Promise<object>} ה-blob */
export function ensureLecturerProfilesReady() {
  if (hydrated) return Promise.resolve(cache);
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    let loaded = null;
    if (isIdbAvailable()) {
      try {
        const stored = await idbGet(LECTURER_PROFILES_STORAGE_KEY);
        if (stored) loaded = normalizeBlob(stored);
      } catch (err) {
        lastWriteError = `IndexedDB: ${String(err?.message || err)}`;
      }
    }
    if (!loaded && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(LECTURER_PROFILES_STORAGE_KEY);
        if (raw) loaded = normalizeBlob(JSON.parse(raw));
      } catch {}
    }
    cache = loaded || emptyBlob();
    hydrated = true;
    emitUpdated();
    return cache;
  })();
  return hydratePromise;
}

/** מרצים חיים (בלי tombstones), ממוינים לפי עדכון אחרון. */
export function listLecturerProfiles() {
  if (!cache) return [];
  return Object.values(cache.lecturers)
    .filter((l) => !l.deletedAt)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function getLecturerProfile(idOrName) {
  if (!cache || !idOrName) return null;
  const direct = cache.lecturers[idOrName];
  if (direct && !direct.deletedAt) return direct;
  return resolveLecturerByName(idOrName);
}

/** פותר שם לפרופיל — כולל aliases, אחרי נרמול עברית. */
export function resolveLecturerByName(name) {
  if (!cache) return null;
  const norm = normalizeLecturerName(name);
  if (!norm) return null;
  for (const lecturer of Object.values(cache.lecturers)) {
    if (lecturer.deletedAt) continue;
    if (normalizeLecturerName(lecturer.name) === norm) return lecturer;
    if (lecturer.aliases.some((a) => normalizeLecturerName(a) === norm)) return lecturer;
  }
  return null;
}

function getOrCreateLecturer(nameOrId) {
  const existing = getLecturerProfile(nameOrId);
  if (existing) return existing;
  const name = String(nameOrId || '').trim();
  const id = lecturerIdForName(name);
  if (!id) return null;
  const revived = cache.lecturers[id];
  const lecturer = revived
    ? { ...revived, deletedAt: null, updatedAt: nowIso() }
    : normalizeLecturer({ id, name });
  cache = { ...cache, lecturers: { ...cache.lecturers, [id]: lecturer } };
  return lecturer;
}

/**
 * הדחת אירועים מעבר לתקרה: קודם הישנים שכבר זוקקו (מופיעים ב-evidenceEventIds
 * של לקח כלשהו — תרומתם שמורה ב-evidenceCount), ורק אחר כך ישנים שטרם זוקקו.
 */
function evictEvents(lecturer) {
  if (lecturer.events.length <= MAX_EVENTS_PER_LECTURER) return lecturer.events;
  const distilledIds = new Set();
  for (const rule of [...lecturer.rules, ...(cache?.globalRules || [])]) {
    for (const id of rule.evidenceEventIds) distilledIds.add(id);
  }
  const byAge = [...lecturer.events].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const toDrop = new Set();
  let excess = lecturer.events.length - MAX_EVENTS_PER_LECTURER;
  for (const ev of byAge) {
    if (excess <= 0) break;
    if (distilledIds.has(ev.id)) { toDrop.add(ev.id); excess -= 1; }
  }
  for (const ev of byAge) {
    if (excess <= 0) break;
    if (!toDrop.has(ev.id)) { toDrop.add(ev.id); excess -= 1; }
  }
  return lecturer.events.filter((ev) => !toDrop.has(ev.id));
}

function putLecturer(lecturer) {
  cache = {
    ...cache,
    lecturers: { ...cache.lecturers, [lecturer.id]: { ...lecturer, updatedAt: nowIso() } },
  };
}

/**
 * קליטת עבודה בדוקה: רשומת return + האירועים שחולצו ממנה.
 * @param {string} lecturerRef שם או id
 * @param {object} returnMeta {date, courseName, assignmentTitle, grade, source, docId}
 * @param {object[]} events אירועי משוב גולמיים
 * @returns {Promise<{lecturer:object, returnRecord:object, addedEvents:object[]}|null>}
 */
export async function recordGradedReturn(lecturerRef, returnMeta, events = []) {
  await ensureLecturerProfilesReady();
  const lecturer = getOrCreateLecturer(lecturerRef);
  if (!lecturer) return null;

  const returnRecord = normalizeReturn({ ...returnMeta, eventCount: events.length });
  const existingIds = new Set(lecturer.events.map((e) => e.id));
  const addedEvents = events
    .map((ev) => normalizeEvent({ ...ev, returnId: returnRecord.id }))
    .filter((ev) => ev && !existingIds.has(ev.id));
  returnRecord.eventCount = addedEvents.length;

  const next = {
    ...lecturer,
    courses: returnRecord.courseName
      ? [...new Set([...lecturer.courses, returnRecord.courseName])]
      : lecturer.courses,
    returns: [...lecturer.returns.filter((r) => r.id !== returnRecord.id), returnRecord],
    events: [...lecturer.events, ...addedEvents],
  };
  next.events = evictEvents(next);
  putLecturer(next);
  await touchAndPersist();
  return { lecturer: cache.lecturers[next.id], returnRecord, addedEvents };
}

/** הזנה ידנית: פסקאות משוב חופשי → אירועי manual תחת return אחד. */
export async function addManualFeedback({ lecturerName, courseName = '', assignmentTitle = '', grade = null, feedbackText = '' }) {
  const paragraphs = String(feedbackText || '')
    .split(/\n+/)
    .map((p) => p.replace(/^[\s•·\-*\d.)\]]+/, '').trim())
    .filter((p) => p.length >= 4);
  const events = paragraphs.map((p) => ({ kind: 'manual', anchorExcerpt: '', feedbackText: p }));
  if (grade !== null && grade !== '' && !events.length) {
    events.push({ kind: 'grade-note', anchorExcerpt: '', feedbackText: `ציון: ${grade}` });
  }
  return recordGradedReturn(lecturerName, { courseName, assignmentTitle, grade, source: 'manual' }, events);
}

function findRuleHome(ruleId, lecturerId) {
  if (lecturerId && cache.lecturers[lecturerId]) {
    const idx = cache.lecturers[lecturerId].rules.findIndex((r) => r.id === ruleId);
    if (idx >= 0) return { kind: 'lecturer', lecturerId, idx };
  }
  const gIdx = cache.globalRules.findIndex((r) => r.id === ruleId);
  if (gIdx >= 0) return { kind: 'global', idx: gIdx };
  for (const lecturer of Object.values(cache.lecturers)) {
    const idx = lecturer.rules.findIndex((r) => r.id === ruleId);
    if (idx >= 0) return { kind: 'lecturer', lecturerId: lecturer.id, idx };
  }
  return null;
}

/** הוספה/עדכון לקח. lecturerId ריק ⇒ לקח גלובלי. */
export async function upsertRule(rule, { lecturerId = '' } = {}) {
  await ensureLecturerProfilesReady();
  const normalized = normalizeRule(rule);
  if (!normalized) return null;
  if (lecturerId) {
    const lecturer = cache.lecturers[lecturerId];
    if (!lecturer) return null;
    if (lecturer.deletedRuleIds[normalized.id]) return null; // נמחק ע"י המשתמש — לא מחיה
    const rules = [...lecturer.rules.filter((r) => r.id !== normalized.id), normalized];
    putLecturer({ ...lecturer, rules });
  } else {
    if (cache.deletedGlobalRuleIds[normalized.id]) return null;
    normalized.scope = 'global';
    cache = { ...cache, globalRules: [...cache.globalRules.filter((r) => r.id !== normalized.id), normalized] };
  }
  await touchAndPersist();
  return normalized;
}

/** עריכת משתמש: מסמנת userEdited ⇒ הטקסט מנצח זיקוק חוזר וסנכרון. */
export async function updateRule(ruleId, patch, { lecturerId = '' } = {}) {
  await ensureLecturerProfilesReady();
  const home = findRuleHome(ruleId, lecturerId);
  if (!home) return null;
  const apply = (rule) => normalizeRule({ ...rule, ...patch, id: rule.id, userEdited: true, updatedAt: nowIso() });
  if (home.kind === 'global') {
    const globalRules = [...cache.globalRules];
    globalRules[home.idx] = apply(globalRules[home.idx]);
    cache = { ...cache, globalRules };
  } else {
    const lecturer = cache.lecturers[home.lecturerId];
    const rules = [...lecturer.rules];
    rules[home.idx] = apply(rules[home.idx]);
    putLecturer({ ...lecturer, rules });
  }
  await touchAndPersist();
  return findRuleHome(ruleId, lecturerId) && (home.kind === 'global' ? cache.globalRules[home.idx] : cache.lecturers[home.lecturerId].rules[home.idx]);
}

export async function setRuleStatus(ruleId, status, opts = {}) {
  return updateRule(ruleId, { status: status === 'disabled' ? 'disabled' : 'active' }, opts);
}

/** מחיקת לקח — נרשמת ב-deletedRuleIds כדי שסנכרון/זיקוק לא יחיו אותו. */
export async function deleteRule(ruleId, { lecturerId = '' } = {}) {
  await ensureLecturerProfilesReady();
  const home = findRuleHome(ruleId, lecturerId);
  if (!home) return false;
  if (home.kind === 'global') {
    cache = {
      ...cache,
      globalRules: cache.globalRules.filter((r) => r.id !== ruleId),
      deletedGlobalRuleIds: { ...cache.deletedGlobalRuleIds, [ruleId]: nowIso() },
    };
  } else {
    const lecturer = cache.lecturers[home.lecturerId];
    putLecturer({
      ...lecturer,
      rules: lecturer.rules.filter((r) => r.id !== ruleId),
      deletedRuleIds: { ...lecturer.deletedRuleIds, [ruleId]: nowIso() },
    });
  }
  await touchAndPersist();
  return true;
}

/** מחיקת מרצה (tombstone — שורד סנכרון). */
export async function deleteLecturer(lecturerId) {
  await ensureLecturerProfilesReady();
  const lecturer = cache.lecturers[lecturerId];
  if (!lecturer) return false;
  putLecturer({ ...lecturer, deletedAt: nowIso() });
  await touchAndPersist();
  return true;
}

/** מיזוג מרצה B לתוך A (איות חלופי): שם B הופך alias, הנתונים מאוחדים. */
export async function mergeLecturers(targetId, sourceId) {
  await ensureLecturerProfilesReady();
  const target = cache.lecturers[targetId];
  const source = cache.lecturers[sourceId];
  if (!target || !source || targetId === sourceId) return null;
  const ruleIds = new Set(target.rules.map((r) => r.id));
  const merged = {
    ...target,
    aliases: [...new Set([...target.aliases, source.name, ...source.aliases])],
    courses: [...new Set([...target.courses, ...source.courses])],
    returns: [...target.returns, ...source.returns.filter((r) => !target.returns.some((t) => t.id === r.id))],
    events: [...target.events, ...source.events.filter((e) => !target.events.some((t) => t.id === e.id))],
    rules: [...target.rules, ...source.rules.filter((r) => !ruleIds.has(r.id) && !target.deletedRuleIds[r.id])],
    deletedRuleIds: { ...source.deletedRuleIds, ...target.deletedRuleIds },
  };
  merged.events = evictEvents(merged);
  putLecturer(merged);
  putLecturer({ ...source, deletedAt: nowIso() });
  await touchAndPersist();
  return cache.lecturers[targetId];
}

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };

/**
 * הלקחים הפעילים לכתיבה הנוכחית: לקחי קורס + לקחי מרצה + גלובליים, dedup לפי
 * id, ממוינים ביטחון ואז ראיות. null-safe — בלי מרצה מחזיר גלובליים בלבד.
 */
export function getActiveRulesFor({ lecturerName = '', courseName = '' } = {}) {
  if (!cache) return { lecturer: null, rules: [] };
  const lecturer = lecturerName ? resolveLecturerByName(lecturerName) : null;
  const seen = new Set();
  const rules = [];
  const push = (rule) => {
    if (rule.status !== 'active' || seen.has(rule.id)) return;
    seen.add(rule.id);
    rules.push(rule);
  };
  if (lecturer) {
    const courseNorm = String(courseName || '').trim();
    for (const rule of lecturer.rules) {
      if (rule.scope === 'course' && courseNorm && rule.courseName === courseNorm) push(rule);
    }
    for (const rule of lecturer.rules) {
      if (rule.scope !== 'course') push(rule);
    }
  }
  for (const rule of cache.globalRules) push(rule);
  rules.sort((a, b) =>
    (CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence]) || (b.evidenceCount - a.evidenceCount));
  return { lecturer, rules };
}

/** סטטוס לתצוגה (כרטיס PersonalTrainer). */
export function getLecturerProfilesStatus() {
  const lecturers = listLecturerProfiles();
  return {
    lecturerCount: lecturers.length,
    ruleCount: lecturers.reduce((n, l) => n + l.rules.length, 0) + (cache?.globalRules?.length || 0),
    returnCount: lecturers.reduce((n, l) => n + l.returns.length, 0),
    updatedAt: cache?.updatedAt || null,
    writeError: lastWriteError,
  };
}

/** ה-blob לסנכרון ענן — רשומות קצרות בלבד, בלי גוף מסמך. */
export function exportLecturerProfiles() {
  return cache ? { ...cache } : emptyBlob();
}

function mergeRuleLists(localRules, remoteRules, deletedIds) {
  const byId = new Map();
  for (const rule of localRules) byId.set(rule.id, rule);
  for (const remote of remoteRules) {
    if (deletedIds[remote.id]) continue;
    const local = byId.get(remote.id);
    if (!local) { byId.set(remote.id, remote); continue; }
    // עריכת משתמש מנצחת; אחרת המעודכן יותר.
    if (local.userEdited && !remote.userEdited) continue;
    if (remote.userEdited && !local.userEdited) { byId.set(remote.id, remote); continue; }
    if (String(remote.updatedAt).localeCompare(String(local.updatedAt)) > 0) byId.set(remote.id, remote);
  }
  return [...byId.values()];
}

function mergeLecturerRecords(local, remote) {
  const deletedRuleIds = { ...local.deletedRuleIds, ...remote.deletedRuleIds };
  // tombstone: מחיקה מאוחרת מהעדכון של הצד השני ⇒ נשארת מחוקה.
  const localDel = local.deletedAt ? String(local.deletedAt) : '';
  const remoteDel = remote.deletedAt ? String(remote.deletedAt) : '';
  let deletedAt = null;
  if (localDel && localDel.localeCompare(String(remote.updatedAt)) > 0) deletedAt = local.deletedAt;
  if (remoteDel && remoteDel.localeCompare(String(local.updatedAt)) > 0) deletedAt = remote.deletedAt;

  const base = String(remote.updatedAt).localeCompare(String(local.updatedAt)) > 0 ? remote : local;
  const merged = {
    ...base,
    aliases: [...new Set([...local.aliases, ...remote.aliases])],
    courses: [...new Set([...local.courses, ...remote.courses])],
    returns: [...local.returns, ...remote.returns.filter((r) => !local.returns.some((t) => t.id === r.id))],
    events: [...local.events, ...remote.events.filter((e) => !local.events.some((t) => t.id === e.id))],
    rules: mergeRuleLists(local.rules, remote.rules, deletedRuleIds),
    deletedRuleIds,
    deletedAt,
  };
  merged.events = merged.events.length > MAX_EVENTS_PER_LECTURER
    ? merged.events.slice(merged.events.length - MAX_EVENTS_PER_LECTURER)
    : merged.events;
  return merged;
}

/**
 * קליטת blob מסנכרון ענן. מיזוג פר-מרצה: איחוד רשומות לפי id, updatedAt-wins
 * לשדות, tombstones נשמרים, עריכת משתמש מנצחת. סנכרון לעולם לא מוחק מידע חי.
 */
export async function importLecturerProfiles(blob) {
  await ensureLecturerProfilesReady();
  const incoming = normalizeBlob(blob);
  if (!incoming.updatedAt && !Object.keys(incoming.lecturers).length && !incoming.globalRules.length) return cache;

  const lecturers = { ...cache.lecturers };
  for (const [id, remote] of Object.entries(incoming.lecturers)) {
    lecturers[id] = lecturers[id] ? mergeLecturerRecords(lecturers[id], remote) : remote;
  }
  const deletedGlobalRuleIds = { ...cache.deletedGlobalRuleIds, ...incoming.deletedGlobalRuleIds };
  cache = {
    ...cache,
    lecturers,
    globalRules: mergeRuleLists(cache.globalRules, incoming.globalRules, deletedGlobalRuleIds)
      .filter((r) => !deletedGlobalRuleIds[r.id]),
    deletedGlobalRuleIds,
    updatedAt: nowIso(),
  };
  await persist();
  emitUpdated();
  return cache;
}

/** ממתין לסיום הכתיבה האחרונה. */
export function flushLecturerProfiles() {
  return Promise.resolve(pendingWrite);
}

/** לבדיקות בלבד — איפוס מצב הזיכרון. */
export function __resetLecturerProfilesForTests() {
  cache = emptyBlob();
  hydrated = true;
  hydratePromise = Promise.resolve(cache);
  pendingWrite = null;
  lastWriteError = null;
}
