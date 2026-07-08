// synonymsService — מנוע מילים נרדפות מקומי לעברית (ללא AI).
// בהינתן מילה + המשפט שבו היא מופיעה, מחזיר הצעות נרדפות מדורגות.
// מטפל במורפולוגיה עברית (תחיליות/נטיות) גם בשלב החיפוש וגם בשלב ההרכבה מחדש.
//
// חוזה הנתונים (synonymsLexicon.data.js):
//   SYNONYMS_LEXICON = { "<lemma>": [ [ ["syn1","syn2"], ["ctx1","ctx2"] ], ... ] }
//   lemma -> מערך של sense-ים ; sense = [synonyms[], contextKeywords[]]

// ---------------------------------------------------------------------------
// טעינה עצלה של הלקסיקון (promise יחיד ב-module state, ניתן לעקיפה בבדיקות)
// ---------------------------------------------------------------------------
let _lexiconPromise = null;
let _lexiconOverride = null;

// עקיפת הלקסיקון בבדיקות — מזריק fixture במקום קובץ הנתונים.
export function __setLexiconForTests(obj) {
  _lexiconOverride = obj || null;
  _lexiconPromise = null; // איפוס cache כדי שהעקיפה תיתפס
}

async function loadLexicon() {
  if (_lexiconOverride) return _lexiconOverride;
  if (!_lexiconPromise) {
    _lexiconPromise = import('./synonymsLexicon.data.js')
      .then((mod) => mod.SYNONYMS_LEXICON || {})
      .catch(() => ({})); // defensive: קובץ חסר/שבור → לקסיקון ריק
  }
  return _lexiconPromise;
}

// ---------------------------------------------------------------------------
// stopwords — הועתקו מ-styleAuthenticityService.js (לא מייבאים, כדי לא לגרור תלות)
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set(['של', 'על', 'עם', 'זה', 'זאת', 'היא', 'הוא', 'הם', 'הן', 'אני', 'אתה', 'את', 'אנחנו', 'גם', 'אבל', 'או', 'אם', 'כי', 'כל', 'לא', 'כן', 'כך', 'מאוד', 'עוד', 'רק', 'כדי', 'היה', 'היו', 'יש', 'אין', 'אל', 'מן', 'אלו', 'אלה', 'אשר', 'כאשר', 'בין', 'לפי', 'תוך', 'אצל', 'מתוך', 'בו', 'בה', 'בהם']);

// ---------------------------------------------------------------------------
// קבועים מורפולוגיים
// ---------------------------------------------------------------------------

// תחיליות (clitics) — longest-match-first, ייתכן שרשור עד 2.
// כולל שילובים דו-אותיים לפני חד-אותיים כדי לתפוס את הארוך ביותר קודם.
const CLITIC_PREFIXES = [
  'וכש', // 3 אותיות
  'וה', 'וב', 'וכ', 'ול', 'ומ', 'וש', 'שה', 'כש', 'מה', 'בה', 'לכ',
  'ו', 'ה', 'ב', 'כ', 'ל', 'מ', 'ש',
];
const MAX_PREFIX_DEPTH = 2;

// סיומות נטייה נפוצות. הסדר משפיע על עדיפות המועמדים.
// רבים (ים/ות) לפני נטיות אחרות; סיומות ארוכות לפני קצרות.
const INFLECTION_SUFFIXES = [
  'יים', 'נו', 'כם', 'כן', 'ים', 'ות',
  'ה', 'ת', 'י', 'ך', 'ו', 'ם', 'ן',
];

// מיפוי אות סופית → אות רגילה (לצורך הוספת סיומת רבים/נקבה).
const FINAL_TO_REGULAR = { 'ם': 'מ', 'ן': 'נ', 'ץ': 'צ', 'ף': 'פ', 'ך': 'כ' };

const HEBREW_LETTER = /[א-ת]/;
const NIKUD_RANGE = /[֑-ׇ]/g;
// תווי ציטוט להסרה: גרש/גרשיים עבריים + ASCII
const QUOTE_CHARS = /['"׳״‘’“”]/g;

// ---------------------------------------------------------------------------
// עזרי נורמליזציה (טהורים)
// ---------------------------------------------------------------------------

// נורמליזציה: trim, הסרת ניקוד, הסרת ציטוטים, הסרת פיסוק שאינו עברי/אנגלי.
function normalizeWord(input = '') {
  return String(input || '')
    .replace(NIKUD_RANGE, '')
    .replace(QUOTE_CHARS, '')
    // הסרת פיסוק ותווים שאינם אותיות (משאיר עברית ואנגלית)
    .replace(/[^א-תa-zA-Z]+/g, '')
    .trim();
}

// המרת אות סופית לרגילה (לפני הדבקת סיומת).
function definalize(word = '') {
  if (!word) return word;
  const last = word.slice(-1);
  if (FINAL_TO_REGULAR[last]) {
    return word.slice(0, -1) + FINAL_TO_REGULAR[last];
  }
  return word;
}

// האם מחרוזת מסתיימת ברבים/נקבה (כדי לא לכפול סיומת).
function endsWithPluralOrFem(word = '') {
  return /(?:ים|ות|ה)$/.test(word);
}

// ---------------------------------------------------------------------------
// analyzeHebrewWord — ניתוח מורפולוגי, מיוצא לבדיקות
// ---------------------------------------------------------------------------
// מחזיר: { core, prefix, suffix, candidates: [ {lemma, prefix, suffix} ... ] }
//   core   = המילה אחרי נורמליזציה (בלי הפשטה)
//   prefix = התחילית שנפשטה במועמד ה"עמוק" ביותר (לתאימות אחורה)
//   suffix = הסיומת שנפשטה במועמד ה"עמוק" ביותר
//   candidates = כל צירופי {lemma, prefix, suffix} לפי סדר עדיפות:
//                exact > prefix-stripped > suffix-stripped > both
export function analyzeHebrewWord(word) {
  const core = normalizeWord(word);
  const candidates = [];
  const seen = new Set();

  const add = (lemma, prefix, suffix) => {
    if (!lemma) return;
    const key = `${lemma}|${prefix}|${suffix}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ lemma, prefix, suffix });
  };

  if (!core) {
    return { core: '', prefix: '', suffix: '', candidates: [] };
  }

  // רשימת (stem, prefix) — המילה המלאה + כל הפשטה מצטברת של תחיליות.
  const prefixForms = stripPrefixes(core); // [{ stem, prefix }...]

  // --- Tier 1: exact (בלי הפשטת סיומת) ---
  for (const { stem, prefix } of prefixForms) {
    add(stem, prefix, '');
  }

  // --- Tier 2/3: suffix-stripped, לכל צורת תחילית ---
  // הפרדה לוגית של tier נעשית בשלב ה-lookup (exact-first), אבל אנחנו
  // דואגים שכל המועמדים קיימים ברשימה בסדר עדיפות טוב.
  for (const { stem, prefix } of prefixForms) {
    for (const { lemma, suffix } of stripSuffixes(stem)) {
      add(lemma, prefix, suffix);
    }
  }

  // ה-prefix/suffix ה"מייצג" = של המועמד הראשון שאינו exact-plain (לתאימות).
  const first = candidates[0] || { prefix: '', suffix: '' };
  return {
    core,
    prefix: first.prefix || '',
    suffix: first.suffix || '',
    candidates,
  };
}

// הפשטת תחיליות — BFS מסתעף עד MAX_PREFIX_DEPTH.
// בכל רמה מנסים להסיר כל clitic מתאים (חד/דו-אותי), וכך מייצרים את *כל*
// הצורות הישיגות. לדוגמה 'והסכם' → 'הסכם' (הסרת ו) וגם 'סכם' (הסרת וה / ו+ה).
// מחזיר מערך {stem, prefix} החל מהמילה המלאה (prefix=''), ממויין לפי אורך
// התחילית (קצר קודם = קרוב יותר למילה המקורית = עדיפות גבוהה יותר).
function stripPrefixes(core) {
  const seen = new Map(); // stem -> shortest prefix that reaches it
  seen.set(core, '');
  let frontier = [{ stem: core, prefix: '' }];

  for (let depth = 0; depth < MAX_PREFIX_DEPTH; depth++) {
    const next = [];
    for (const { stem, prefix } of frontier) {
      for (const p of CLITIC_PREFIXES) {
        if (stem.length > p.length + 1 && stem.startsWith(p)) {
          const newStem = stem.slice(p.length);
          const newPrefix = prefix + p;
          const existing = seen.get(newStem);
          if (existing === undefined || newPrefix.length < existing.length) {
            seen.set(newStem, newPrefix);
          }
          next.push({ stem: newStem, prefix: newPrefix });
        }
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }

  return [...seen.entries()]
    .map(([stem, prefix]) => ({ stem, prefix }))
    .sort((a, b) => a.prefix.length - b.prefix.length);
}

// הפשטת סיומות נטייה — מחזיר מועמדי {lemma, suffix}.
function stripSuffixes(stem) {
  const out = [];
  const seen = new Set();
  const push = (lemma, suf) => {
    if (!lemma) return;
    const key = lemma + '|' + suf;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ lemma, suffix: suf });
  };
  for (const suf of INFLECTION_SUFFIXES) {
    if (stem.length > suf.length + 1 && stem.endsWith(suf)) {
      const bare = stem.slice(0, -suf.length);
      push(bare, suf);
      // וריאנט עם de-finalize של האות האחרונה (עוזר למקרי ם→מ).
      push(definalize(bare), suf);
      // לרבים ים/ות: בסיס עם ה' סופית (חוזים→חוזה, טבלאות→טבלה),
      // כי lemma-ים בלקסיקון הם צורות בסיס נקביות/סגוליות.
      if (suf === 'ים' || suf === 'ות') {
        push(bare + 'ה', suf);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// זיהוי מילה עברית — ה-UI מחליט לפי זה אם להראות את המנוע המקומי
// ---------------------------------------------------------------------------
export function isHebrewWord(word) {
  const w = normalizeWord(word);
  if (!w || w.length < 2) return false;
  const hebrew = (w.match(/[א-ת]/g) || []).length;
  if (hebrew < 2) return false;
  // "רובו עברי" — לפחות מחצית האותיות עבריות
  return hebrew >= Math.ceil(w.length / 2);
}

// ---------------------------------------------------------------------------
// טוקניזציה של המשפט להקשר
// ---------------------------------------------------------------------------
function tokenizeSentence(sentence = '') {
  const raw = String(sentence || '')
    .replace(NIKUD_RANGE, '')
    .replace(QUOTE_CHARS, ' ')
    .split(/[^א-תa-zA-Z]+/);
  const tokens = [];
  for (const piece of raw) {
    const norm = normalizeWord(piece);
    if (!norm || norm.length < 2) continue;
    // הפשטת תחילית קליטית אחת מהטוקן להקשר (משאירים את הבסיס הראשי)
    const stripped = stripPrefixes(norm);
    const base = stripped.length > 1 ? stripped[stripped.length - 1].stem : norm;
    if (STOP_WORDS.has(norm) || STOP_WORDS.has(base)) continue;
    tokens.push(base);
    if (base !== norm) tokens.push(norm); // גם הצורה המלאה, ליתר ביטחון
  }
  return new Set(tokens);
}

// ---------------------------------------------------------------------------
// ניקוד sense לפי חפיפת הקשר
// ---------------------------------------------------------------------------
function scoreSenseContext(contextKeywords, sentenceTokens) {
  if (!sentenceTokens || sentenceTokens.size === 0) return 0;
  let score = 0;
  for (const kw of contextKeywords || []) {
    const nk = normalizeWord(kw);
    if (!nk) continue;
    if (sentenceTokens.has(nk)) {
      score += 1; // חפיפה מלאה
      continue;
    }
    // חפיפה חלקית: אחד מכיל את השני, אורך >= 3
    if (nk.length >= 3) {
      for (const tok of sentenceTokens) {
        if (tok.length >= 3 && (tok.includes(nk) || nk.includes(tok))) {
          score += 0.5;
          break;
        }
      }
    }
  }
  return score;
}

// ---------------------------------------------------------------------------
// הרכבה מחדש של מורפולוגיה על הצעה נרדפת
// ---------------------------------------------------------------------------
// prefix: מודבק verbatim, עם כלל אנטי-כפילות ל-ה'.
// suffix: רק ים/ות/ה מוחזרים; נטיות שייכות (י,ך,ו,נו,כם...) לא מוחזרות.
function reapplyMorphology(synonym, prefix, suffix) {
  let out = synonym;

  // --- סיומת ---
  if (suffix === 'ות') {
    if (!endsWithPluralOrFem(out)) {
      out = definalize(out) + 'ות';
    }
  } else if (suffix === 'ים' || suffix === 'יים') {
    if (!endsWithPluralOrFem(out)) {
      out = definalize(out) + 'ים';
    }
  } else if (suffix === 'ה') {
    // סיומת נקבה — מוסיפים ה' אם אין כבר סיומת רבים/נקבה
    if (!endsWithPluralOrFem(out)) {
      out = definalize(out) + 'ה';
    }
  }
  // כל שאר הסיומות (נטיות שייכות/ת/י...) — לא מוחזרות, נשאר הבסיס.

  // --- תחילית ---
  if (prefix) {
    // אנטי-כפילות: אם התחילית מסתיימת ב-ה' וההצעה מתחילה ב-ה' → מורידים אחת
    if (prefix.slice(-1) === 'ה' && out.slice(0, 1) === 'ה') {
      out = prefix + out.slice(1);
    } else {
      out = prefix + out;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// getSynonymSuggestions — ה-API הראשי
// ---------------------------------------------------------------------------
export async function getSynonymSuggestions({ word, sentence = '', limit = 6 } = {}) {
  const lexicon = await loadLexicon();
  if (!lexicon || typeof lexicon !== 'object') return [];

  const core = normalizeWord(word);
  if (!core) return [];

  const { candidates } = analyzeHebrewWord(word);
  if (!candidates.length) return [];

  // --- Lookup לפי tiers: exact-plain > prefix-only > suffix > both ---
  // מקבצים מועמדים לפי "עומק" (יש prefix? יש suffix?) כדי לעצור ב-tier הראשון
  // שהניב פגיעות, ולשמור את ה-prefix/suffix של אותו tier.
  const tiers = [
    candidates.filter((c) => !c.prefix && !c.suffix), // exact
    candidates.filter((c) => c.prefix && !c.suffix),  // prefix-stripped
    candidates.filter((c) => !c.prefix && c.suffix),  // suffix-stripped
    candidates.filter((c) => c.prefix && c.suffix),   // both
  ];

  let hitCandidate = null;
  let senses = null;
  for (const tier of tiers) {
    for (const cand of tier) {
      const found = lexicon[cand.lemma];
      if (Array.isArray(found) && found.length) {
        hitCandidate = cand;
        senses = found;
        break;
      }
    }
    if (senses) break; // עוצרים ב-tier הראשון שהניב פגיעה
  }

  if (!senses) return [];

  // --- ניקוד sense-ים לפי הקשר ---
  const sentenceTokens = tokenizeSentence(sentence);
  const scoredSenses = senses.map((sense, idx) => {
    const synList = Array.isArray(sense?.[0]) ? sense[0] : [];
    const ctxList = Array.isArray(sense?.[1]) ? sense[1] : [];
    const ctxScore = scoreSenseContext(ctxList, sentenceTokens);
    // אם אין הקשר / כל הציונים 0 → שמירת סדר הלקסיקון (מוקדם = מעט גבוה)
    const fallbackScore = (senses.length - idx) * 0.001;
    return { synList, senseScore: ctxScore + fallbackScore, idx };
  });

  scoredSenses.sort((a, b) => b.senseScore - a.senseScore);

  // --- שיטוח + דירוג נרדפות ---
  const results = [];
  const usedTexts = new Set();
  // dedupe מול המילה המקורית והבסיס שנפגע
  const blockList = new Set([core, hitCandidate.lemma]);

  for (const { synList, senseScore } of scoredSenses) {
    for (let i = 0; i < synList.length; i++) {
      const rawSyn = normalizeWord(synList[i]);
      if (!rawSyn) continue;
      if (blockList.has(rawSyn)) continue; // זהה למקור/lemma

      const positionBonus = (synList.length - i) * 0.01;
      const finalText = reapplyMorphology(rawSyn, hitCandidate.prefix, hitCandidate.suffix);

      // dedupe מול המילה המקורית (אחרי הרכבה) ומול תוצאות קודמות
      if (finalText === core || usedTexts.has(finalText)) continue;
      usedTexts.add(finalText);

      results.push({ text: finalText, score: senseScore + positionBonus });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, Math.max(0, limit));
}
