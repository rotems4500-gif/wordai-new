// synonymsValidationService — אימות AI של תרומות מילים נרדפות קהילתיות.
// הכלל: כשמצטברות 100 תרומות בהמתנה (pending), סוכן AI עובר עליהן,
// מאשר/דוחה כל אחת, ומעדכן את Firestore. אין שרת — האימות רץ בצד הלקוח
// אצל המשתמש הראשון שחצה את הסף ויש לו מפתח AI מוגדר.
//
// בטיחות מקבילות: נעילה (validationLock) על synonymsMeta/global בתוך
// transaction — זוכה אחד בלבד; נעילה תקועה משתחררת אחרי 15 דקות.

const PENDING_THRESHOLD = 100;
const LOCK_STALE_MS = 15 * 60 * 1000;
const CHUNK_SIZE = 25;

// ---------------------------------------------------------------------------
// עזרי טעינה עצלה — אסור להפיל את האפליקציה אם Firebase/aiService לא זמינים
// ---------------------------------------------------------------------------
async function loadFirestoreBits() {
  try {
    const [{ getAuth }, firestore, config] = await Promise.all([
      import('firebase/auth'),
      import('firebase/firestore'),
      import('../firebase/config'),
    ]);
    if (!config.hasFirebaseConfig()) return null;
    const app = config.getFirebaseApp();
    let db;
    try {
      db = firestore.initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
    } catch {
      db = firestore.getFirestore(app);
    }
    const auth = getAuth(app);
    return { db, auth, firestore };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// runValidationChunk — טהור-יחסית, ניתן לבדיקה עם providerCall מזויף.
// entries: [{id, lemma, synonym}] ; providerCall: async (prompt) => string
// מחזיר Map<id, {verdict: 'approve'|'reject', note}> (רשומות שלא פוענחו — חסרות).
// ---------------------------------------------------------------------------
export async function runValidationChunk(entries, providerCall) {
  const list = (entries || []).filter((e) => e && e.id && e.lemma && e.synonym);
  if (!list.length) return new Map();
  const numbered = list
    .map((e) => `{"id": ${JSON.stringify(e.id)}, "מילה": ${JSON.stringify(e.lemma)}, "נרדפת_מוצעת": ${JSON.stringify(e.synonym)}}`)
    .join('\n');
  const prompt = `להלן רשימת הצעות למילים נרדפות בעברית שנוספו על ידי משתמשים.
לכל זוג, קבע אם ההצעה היא מילה נרדפת תקינה ושימושית (אותה משמעות בסיסית, אותו משלב בערך, אותו חלק דיבר, כתיב תקין, לא מילת גנאי ולא ספאם).
${numbered}
החזר אך ורק JSON תקין (בלי טקסט נוסף, בלי גדרות קוד): מערך של אובייקטים במבנה
[{"id": "...", "verdict": "approve" | "reject", "note": "נימוק קצר בעברית"}]
חובה לכלול את כל ה-id-ים מהרשימה.`;

  const raw = await providerCall(prompt);
  const text = typeof raw === 'string' ? raw : String(raw?.text || raw?.reply || '');
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```\s*$/, '')
    .trim();
  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // ניסיון חילוץ מערך מתוך טקסט עוטף
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start !== -1 && end > start) {
      try { parsed = JSON.parse(cleaned.slice(start, end + 1)); } catch { parsed = null; }
    }
  }
  const out = new Map();
  if (!Array.isArray(parsed)) return out;
  const validIds = new Set(list.map((e) => e.id));
  for (const item of parsed) {
    const id = String(item?.id || '');
    const verdict = item?.verdict === 'approve' || item?.verdict === 'reject' ? item.verdict : null;
    if (!id || !verdict || !validIds.has(id)) continue;
    out.set(id, { verdict, note: String(item?.note || '').slice(0, 200) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// maybeRunValidation — הטריגר. שקט לחלוטין בכל כשל.
// ---------------------------------------------------------------------------
let _running = false;

export async function maybeRunValidation() {
  if (_running) return { ran: false, reason: 'already-running' };
  _running = true;
  try {
    return await runValidationPass();
  } catch (e) {
    return { ran: false, reason: String(e?.message || e) };
  } finally {
    _running = false;
  }
}

async function runValidationPass() {
  // תנאי זול 1: ספירת pending מה-cache המקומי
  let cachedPending = 0;
  try {
    const community = await import('./communitySynonymsService.js');
    cachedPending = community.getCachedPendingCount?.() || 0;
  } catch {
    return { ran: false, reason: 'no-community-module' };
  }
  if (cachedPending < PENDING_THRESHOLD) return { ran: false, reason: 'below-threshold' };

  // תנאי זול 2: יש ספק AI מוגדר
  let aiService = null;
  try {
    aiService = await import('./aiService.js');
    const choices = aiService.getConfiguredProviderChoices?.() || [];
    if (!choices.length) return { ran: false, reason: 'no-ai-provider' };
  } catch {
    return { ran: false, reason: 'no-ai-service' };
  }

  const bits = await loadFirestoreBits();
  if (!bits) return { ran: false, reason: 'no-firebase' };
  const { db, auth, firestore } = bits;
  const uid = auth.currentUser?.uid;
  if (!uid) return { ran: false, reason: 'not-signed-in' };

  const {
    doc, collection, query, where, orderBy, limit, getDocs,
    runTransaction, writeBatch, serverTimestamp,
  } = firestore;
  const metaRef = doc(db, 'synonymsMeta', 'global');

  // --- רכישת נעילה (transaction = זוכה אחד) ---
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(metaRef);
      const data = snap.exists() ? snap.data() : {};
      if ((data.pendingCount || 0) < PENDING_THRESHOLD) {
        throw new Error('below-threshold');
      }
      const lock = data.validationLock;
      const lockAge = lock?.acquiredAt?.toMillis
        ? Date.now() - lock.acquiredAt.toMillis()
        : Infinity;
      if (lock && lock.holder && lockAge < LOCK_STALE_MS) {
        throw new Error('locked');
      }
      tx.set(metaRef, { validationLock: { holder: uid, acquiredAt: serverTimestamp() } }, { merge: true });
    });
  } catch (e) {
    return { ran: false, reason: String(e?.message || e) };
  }

  // --- מכאן: תמיד לשחרר את הנעילה ב-finally ---
  let processedCount = 0;
  try {
    const pendingQuery = query(
      collection(db, 'synonymContributions'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'asc'),
      limit(PENDING_THRESHOLD),
    );
    const snap = await getDocs(pendingQuery);
    const entries = snap.docs.map((d) => {
      const data = d.data() || {};
      return { id: d.id, lemma: String(data.lemma || ''), synonym: String(data.synonym || '') };
    }).filter((e) => e.lemma && e.synonym);

    const providerCall = (prompt) => aiService.chatWithActiveProvider(prompt, '', '', {
      directChat: true,
      skipSkillSelection: true,
      skipAutomationPrompt: true,
      skipMultiModel: true,
      chatScope: 'general-knowledge',
    });

    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE);
      let verdicts;
      try {
        verdicts = await runValidationChunk(chunk, providerCall);
      } catch {
        continue; // כשל בצ'אנק — הרשומות נשארות pending לסבב הבא
      }
      if (!verdicts.size) continue;
      const batch = writeBatch(db);
      for (const [id, { verdict, note }] of verdicts) {
        batch.update(doc(db, 'synonymContributions', id), {
          status: verdict === 'approve' ? 'approved' : 'rejected',
          validatedAt: serverTimestamp(),
          validationNote: note,
        });
      }
      await batch.commit();
      processedCount += verdicts.size;
    }
    return { ran: true, processed: processedCount };
  } finally {
    // עדכון מונה + שחרור נעילה — גם בכשל (רשומות שלא טופלו נשארות pending)
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(metaRef);
        const data = snap.exists() ? snap.data() : {};
        tx.set(metaRef, {
          pendingCount: Math.max(0, (data.pendingCount || 0) - processedCount),
          lastUpdatedAt: serverTimestamp(),
          validationLock: null,
        }, { merge: true });
      });
    } catch { /* נעילה תקועה תשוחרר ע"י ה-stale timeout */ }
    if (processedCount > 0) {
      // רענון cache מקומי כדי שדחויים ייעלמו מיד אצל המריץ
      try {
        const community = await import('./communitySynonymsService.js');
        await community.ensureCommunityCache?.({ force: true });
      } catch { /* לא קריטי */ }
    }
  }
}
