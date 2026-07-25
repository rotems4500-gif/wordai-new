// nlg-bench/invariants.mjs — שכבת היכולת: תכונות שחייבות להתקיים על *כל* קלט.
//
// זה הלב של ההגנה מפני קיבוע (overfitting): לא בודקים "האם יצאה התשובה X"
// אלא "האם כל משפט מעוגן", "האם אין ג'יבריש", "האם חסום נשאר חסום" — תכונות
// שאי אפשר לספק בזיוף בלי באמת לקיים אותן, על כל וריאציה של הקלט.
//
// כל בדיקה מקבלת {draftText, metrics} ומחזירה {id, pass, detail}.

const STOP_FOR_GROUNDING = new Set(['של', 'על', 'את', 'עם', 'כי', 'גם', 'אך', 'או', 'הוא', 'היא', 'הם', 'זו', 'זה', 'בין', 'לא', 'יש', 'אין', 'כך', 'מן', 'אל', 'כל']);

export function groundingOverlap(sentence, chunkText) {
  const words = String(sentence).split(/\s+/)
    .map((w) => w.replace(/^[ולבכשמה]{1,2}(?=[א-ת]{3,})/, '').replace(/[^א-תa-zA-Z0-9]/g, ''))
    .filter((w) => w.length >= 3 && !STOP_FOR_GROUNDING.has(w.toLowerCase()));
  if (!words.length) return 1;
  const hay = String(chunkText).toLowerCase();
  const hit = words.filter((w) => hay.includes(w.toLowerCase()) || hay.includes(w)).length;
  return hit / words.length;
}

// סמני ג'יבריש OCR מובהקים — *אותו חוק* כמו ocrCorruptScore ב-proseComposeService:
// ברמת טוקן, וגרשיים נפסלים רק במילה ארוכה (≥6 אחרי הסרתם). בלי תנאי האורך
// הבדיקה פוסלת עברית תקינה — 'ל"בעיה', 'ש"גם' (תחילית + פתיחת ציטוט).
export function garbleHit(sentence) {
  for (const t of String(sentence || '').split(/\s+/).filter(Boolean)) {
    const q = t.search(/["״׳“”]/);
    if (q >= 2 && /[א-ת]["״׳“”][א-ת]/.test(t) && t.replace(/["'״׳“”]/g, '').length >= 6) return t;
    if (/[א-ת][*][א-ת]/.test(t)) return t;
    if (/\d[א-ת]|[א-ת]\d/.test(t)) return t;
  }
  return null;
}

/**
 * מריץ את כל האינווריאנטות על תוצר ריצה אחת.
 * @param {{draftText:string, metrics:object}} run
 *   metrics: הפורמט של nlg-loop-round — units[] עם {id, status, words, quota,
 *   sentences?:[{text, evidenceId}], evidenceUsed?:[{id,text}], notes?}
 * @returns {Array<{id:string, pass:boolean, detail:string}>}
 */
export function checkInvariants(run) {
  const out = [];
  const text = String(run.draftText || '');
  const units = Array.isArray(run.metrics?.units) ? run.metrics.units : [];

  // 1. אפס ג'יבריש בתוצר
  {
    const hits = [];
    for (const line of text.split('\n')) {
      const h = garbleHit(line);
      if (h) hits.push(h);
    }
    out.push({ id: 'no-garble', pass: !hits.length, detail: hits.slice(0, 3).join(' · ') || 'נקי' });
  }

  // 2. עיגון: כל משפט תוכן עם evidenceId — ≥40% חפיפת מילות-תוכן מול ה-chunk שלו.
  //    שתי צורות קלט: sentences[] מפורט (חישוב ישיר) או anchoredPct מצרפי
  //    (הפורמט של nlg-loop-round — ההרנס כבר חישב את אותה חפיפה בדיוק).
  {
    let checked = 0; let weak = 0; const examples = [];
    for (const u of units) {
      if (Array.isArray(u.sentences)) {
        const evMap = new Map((u.evidenceUsed || []).map((e) => [e.id, e.text]));
        for (const s of u.sentences) {
          if (!s.evidenceId) continue;
          const chunk = evMap.get(s.evidenceId);
          if (!chunk) continue;
          checked += 1;
          const ov = groundingOverlap(s.text, chunk);
          if (ov < 0.4) { weak += 1; if (examples.length < 2) examples.push(`${(ov * 100).toFixed(0)}%: ${s.text.slice(0, 40)}…`); }
        }
      } else if (u.status !== 'blocked' && typeof u.anchoredPct === 'number') {
        checked += 1;
        if (u.anchoredPct < 100) { weak += 1; if (examples.length < 2) examples.push(`${u.id}: ${u.anchoredPct}%`); }
      }
    }
    out.push({ id: 'grounding-40', pass: weak === 0, detail: checked ? `${checked - weak}/${checked} מעוגנים${examples.length ? ' | ' + examples.join(' | ') : ''}` : 'אין משפטי תוכן' });
  }

  // 3. כנות-חסימה: יחידה בסטטוס blocked אסור שיהיו לה מילות-פרוזה, וחובה סיבה
  {
    const bad = units.filter((u) => u.status === 'blocked' && ((u.words || 0) > 0 || !(u.blockReason || u.reason)));
    out.push({ id: 'blocked-honesty', pass: !bad.length, detail: bad.length ? bad.map((u) => u.id).join(',') : `${units.filter((u) => u.status === 'blocked').length} חסומים כנים` });
  }

  // 4. כנות-מכסה: יחידה שנכתבה עם <60% מהמכסה חייבת הערת [דרוש מקור נוסף]
  {
    const bad = units.filter((u) => u.status !== 'blocked' && (u.quota || 0) > 0
      && (u.words || 0) < u.quota * 0.6
      && !(Array.isArray(u.notes) ? u.notes.join(' ') : String(u.notes || '')).includes('דרוש מקור'));
    out.push({ id: 'quota-honesty', pass: !bad.length, detail: bad.length ? bad.map((u) => u.id).join(',') : 'תקין' });
  }

  // 5. אי-כפילות חוצת-עבודה: אין משפט תוכן זהה בשתי יחידות.
  //    בלי מערכי משפטים — נופל לסריקת draftText: משפט ≥6 מילים שחוזר פעמיים.
  {
    const dups = [];
    const hasSentenceArrays = units.some((u) => Array.isArray(u.sentences));
    if (hasSentenceArrays) {
      const seen = new Map();
      for (const u of units) {
        for (const s of u.sentences || []) {
          if (!s.evidenceId) continue;
          const key = String(s.text).replace(/\s+/g, ' ').trim();
          if (seen.has(key) && seen.get(key) !== u.id) dups.push(key.slice(0, 40));
          else seen.set(key, u.id);
        }
      }
    } else {
      const seen = new Set();
      const sents = text.split(/(?<=[.!?])\s+|\n/).map((s) => s.replace(/\s+/g, ' ').trim())
        .filter((s) => s.split(' ').length >= 6 && !s.startsWith('#') && !s.startsWith('['));
      for (const s of sents) {
        if (seen.has(s)) dups.push(s.slice(0, 40));
        else seen.add(s);
      }
    }
    out.push({ id: 'no-cross-dup', pass: !dups.length, detail: dups[0] || 'תקין' });
  }

  // 6. אין undefined/שברי-תבנית בתוצר
  {
    const bad = /undefined|\[object |NaN מילים/.test(text);
    out.push({ id: 'no-template-leak', pass: !bad, detail: bad ? 'נמצא שבר תבנית' : 'תקין' });
  }

  return out;
}

/** ציון יכולת מצרפי: אינווריאנטות (שער) + תפוקה (מידה). */
export function capabilityScore(run, invariants) {
  const units = Array.isArray(run.metrics?.units) ? run.metrics.units : [];
  const invPass = invariants.filter((i) => i.pass).length / Math.max(invariants.length, 1);
  const written = units.filter((u) => u.status !== 'blocked');
  const quotaFill = written.length
    ? written.reduce((a, u) => a + Math.min(1, (u.words || 0) / Math.max(u.quota || 150, 1)), 0) / written.length
    : 0;
  const coverage = units.length ? written.length / units.length : 0;
  // אינווריאנטות = 60% מהציון (כנות לפני תפוקה), כיסוי 25%, מילוי מכסה 15%.
  return Math.round((invPass * 0.6 + coverage * 0.25 + quotaFill * 0.15) * 100);
}
