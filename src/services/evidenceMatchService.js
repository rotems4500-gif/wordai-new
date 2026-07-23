// evidenceMatchService.js — משייך לכל סעיף במטלה את הראיות מחומרי העזר של המשתמש.
//
// אפס קריאות API: ה-embedding רץ מקומית (e5-small, ONNX/WASM) והדירוג הוא
// selectChunks הקיים, עם הזרקת וקטורים. זה הלב של המסלול "בלי מפתח".
//
// מה זה *לא* עושה: לא כותב טקסט. הוא מחזיר קטעים אמיתיים עם פרובננס (מאמר, עמוד,
// סעיף) כדי שהמשתמש יכתוב מולם. הרכבה, לא ייצור.
//
// סף רלוונטיות: קריטי. בלי סף, selectChunks תמיד מחזיר k קטעים — גם כשאין שום
// חומר תומך (MMR בוחר לפי גיוון כשכל הציונים 0). סעיף בלי תמיכה חייב להיות מדווח
// כ*פער* — זו אחת התובנות השימושיות ביותר למשתמש: "כאן חסר לך מקור".
//
// תלויות: materialChunkStore, styleEmbeddingService, styleRetrievalService. browser-only.

import {
  ensureMaterialStoreReady,
  getMaterialChunks,
  getUnembeddedMaterialChunks,
  putMaterialVectors,
  getMaterialVectorsBase64,
} from './materialChunkStore';
import {
  STYLE_EMBEDDING_SIGNATURE,
  embedTexts,
  embedText,
  quantizeVector,
  dequantizeVector,
  int8ToBase64,
  base64ToInt8,
  cosineSim,
  isEmbeddingUnavailable,
} from './styleEmbeddingService';
import { selectChunks, scoreChunkRelevance, tokenizeForRetrieval } from './styleRetrievalService';

// e5 מייצר דמיון "דחוס" — קטעים לא קשורים יושבים סביב 0.77 ולא סביב 0. לכן סף
// מוחלט לבדו פוסל הכל או מקבל הכל. משלבים: רצפה מוחלטת + חלון יחסי מתחת לטוב ביותר.
//
// כוילו במדידה (יולי 2026) על קורפוס עברי אקדמי מתויג — 4 מסמכים, 8 שאילתות,
// 48 זוגות שאילתה-קטע. ההתפלגויות שנמדדו:
//   רלוונטי   — חציון 0.837, min 0.797
//   לא רלוונטי — חציון 0.772, max 0.833, p10 0.746
// סריקת רשת על (floor, band) נתנה מיטב ב-0.795/0.05: P=0.84 R=0.94 F1=0.889,
// ושאילתה ללא חומר תומך (best=0.782) חזרה ריקה כנדרש.
//
// ⚠️ ההתפלגויות *חופפות* (רלוונטי min 0.797 < לא-רלוונטי max 0.833) — חיובי שגוי
// מזדמן הוא בלתי נמנע ולא באג. לכן ה-score מוצג למשתמש בפאנל.
// ⚠️ קורפוס הכיול קטן. להריץ מחדש על ספרייה אמיתית לפני שינוי הערכים.
const MIN_COSINE_FLOOR = 0.795;
const RELATIVE_BAND = 0.05;

// ---------- כיול v2 (יולי 2026, קורפוס אמיתי של 584 קטעים) ----------
// הקוסינוס האבסולוטי של e5 חסר משמעות: נמדד שסעיף-בקרה על תזונה קיבל 0.852 מול
// המניפסט הקומוניסטי, בעוד התאמות אמת קיבלו 0.81. שתי פתולוגיות:
//  1. hubness — קטע "ממוצע" (חוק יסוד הממשלה) קרוב לצנטרואיד הקורפוס ולכן קרוב
//     לכל שאילתה; ניצח כמעט בכל eval, כולל בבקרות השליליות.
//  2. דחיסה — כל הציונים ב-0.75–0.90, סף קבוע יושב בתוך הרעש.
// התיקון: adjusted = cos(q,c) − HUB_BETA·cos(centroid,c), ואז סף יחסי רובסטי:
// קטע נשמר רק אם ה-adjusted שלו חורג מהתפלגות הקורפוס (median + Z_KEEP·MAD).
const HUB_BETA = 1.0;
// נמדד על קורפוס נקי (944 קטעים אחרי OCR+ניקוי): התאמות אמת יושבות ב-3.35–7.0,
// אבל רעש OCR הגיע עד z=4.63 (שאילתת אסטרונומיה ↔ קטע "צלחות חרס" של אדם סמית) —
// סף לבדו לא מפריד. המבחין: לקטע אמיתי יש כמעט תמיד גם *עוגן לקסיקלי* (מונח
// מהשאילתה מופיע בטקסט), ולרעש סמנטי אין. לכן: z ≥ Z_KEEP וגם עוגן, או z ≥ Z_STRONG
// (סמנטיקה מוחצת — נחוץ להתאמה חוצת-שפה, שאילתה בעברית ↔ מקור באנגלית).
const Z_KEEP = 3.4;
const Z_STRONG = 6.0;
const Z_WEAK = 3.0;   // רף שכבת ה"ראיה חלשה" — רק עם מונח-חובה מילולי בטקסט
const MAD_SCALE = 1.4826; // MAD → אומדן σ תחת נורמליות
const MAX_PER_SOURCE = 2; // גיוון: לא יותר מ-2 קטעים מאותו מקור ב-top-k
// במסלול הגיבוי (בלי embeddings) הציון הוא TF-IDF מנורמל — סקאלה אחרת לגמרי.
const MIN_LEXICAL_SHARE = 0.18;

const EMBED_BATCH_LIMIT = 400; // כמה chunks מוטמעים בהרצה אחת, כדי לא לתקוע את ה-UI

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * טקסט השאילתה לסעיף. הכותרת לבדה דלילה מדי (לפעמים מילה אחת), וההנחיה לבדה
 * רועשת — צירוף של שניהם + מונחי המפתח נותן את הריקול הטוב ביותר.
 */
export function buildSectionQuery(section) {
  if (!isPlainObject(section)) return '';
  const parts = [
    section.title,
    Array.isArray(section.keywords) ? section.keywords.join(' ') : '',
    String(section.instructions || '').slice(0, 600),
  ];
  return parts.filter(Boolean).join('\n').trim();
}

/**
 * גשושי השאילתה של הסעיף. הנחיה אקדמית ארוכה מדללת את ההטמעה: "מהם החידושים...
 * הבלימה ההופכית... 400 מילים... הערות שוליים" — הווקטור יוצא ממוצע של הכל
 * ולא דומה לשום קטע. לכן בנוסף לשאילתה המלאה נשלח גשוש ממוקד (כותרת+מונחים),
 * וה-z הסופי של קטע הוא המקסימום בין הגשושים.
 * @returns {string[]} 1–2 שאילתות
 */
export function buildSectionProbes(section) {
  const full = buildSectionQuery(section);
  if (!full) return [];
  const probes = [full];
  const focused = [
    section.title,
    Array.isArray(section.keywords) ? section.keywords.join(' ') : '',
  ].filter(Boolean).join(' ').trim();
  // הגשוש הממוקד נשלח רק אם הוא באמת שונה (הנחיה ארוכה) ויש בו תוכן.
  if (focused && focused.length >= 10 && full.length > focused.length + 80) {
    probes.push(focused);
  }
  // מונחי החובה של המרצה הם הגשוש החד ביותר: "חובה להזכיר את מושגי X ו-Y" מצביע
  // בדיוק על הקטעים במקור שדנים ב-X/Y. נמדד: השאילתה המלאה של סעיף "החידושים
  // האמריקניים" נעצרה ב-z=3.35 על קולקה; המושגים לבדם ממוקדים בהרבה.
  const must = Array.isArray(section.mustMention) ? section.mustMention.filter(Boolean) : [];
  if (must.length) probes.push(must.join(' '));
  return probes;
}

/**
 * מטמיע chunks של חומרי עזר שאין להם עדיין וקטור. אידמפוטנטי — בטוח לקרוא בכל
 * פתיחה של המסך; אם הכל מוטמע, חוזר מיד.
 *
 * @param {{limit?:number, onProgress?:function}} opts
 * @returns {Promise<{embedded:number, remaining:number, unavailable:(string|null)}>}
 */
export async function ensureMaterialsEmbedded({ limit = EMBED_BATCH_LIMIT, onProgress = null } = {}) {
  await ensureMaterialStoreReady();

  const unavailable = isEmbeddingUnavailable();
  if (unavailable) return { embedded: 0, remaining: 0, unavailable };

  const pending = getUnembeddedMaterialChunks(STYLE_EMBEDDING_SIGNATURE, { limit });
  if (!pending.length) {
    return { embedded: 0, remaining: 0, unavailable: null };
  }

  const vectors = await embedTexts(pending.map((c) => c.text), { kind: 'passage', onProgress });
  // null = השכבה נפלה (WASM/רשת). לא זורקים — המסלול הלקסיקלי עדיין עובד.
  if (!vectors) {
    return { embedded: 0, remaining: pending.length, unavailable: isEmbeddingUnavailable() || 'embed-failed' };
  }

  const entries = [];
  vectors.forEach((vec, i) => {
    if (!vec) return;
    entries.push({ chunkId: pending[i].id, vec: int8ToBase64(quantizeVector(vec)) });
  });
  const saved = putMaterialVectors(entries, STYLE_EMBEDDING_SIGNATURE);

  const remaining = getUnembeddedMaterialChunks(STYLE_EMBEDDING_SIGNATURE, { limit: 1 }).length;
  return { embedded: saved, remaining, unavailable: null };
}

// מפת chunkId → Float32Array. selectChunks מצפה ל-Map של וקטורים מפוענחים.
function buildVectorMap() {
  const base64Map = getMaterialVectorsBase64(STYLE_EMBEDDING_SIGNATURE);
  const map = new Map();
  for (const [chunkId, b64] of Object.entries(base64Map)) {
    try {
      map.set(chunkId, dequantizeVector(base64ToInt8(b64)));
    } catch {
      // וקטור פגום — מדלגים. ה-chunk עדיין ידורג לקסיקלית.
    }
  }
  return map;
}

/**
 * מוצא ראיות תומכות לסעיף בודד.
 *
 * @param {object} section סעיף מ-parseAssignmentSpec
 * @param {{k?:number, materialIds?:string[]|null, projectId?:string|null,
 *          vectorMap?:Map|null, minCosine?:number}} opts
 * @returns {Promise<{sectionId:string, evidence:Array<object>, gap:boolean, mode:string}>}
 */
export async function findEvidenceForSection(section, {
  k = 5,
  materialIds = null,
  projectId = null,
  vectorMap = null,
  minCosine = MIN_COSINE_FLOOR,
} = {}) {
  await ensureMaterialStoreReady();

  const query = buildSectionQuery(section);
  const corpus = getMaterialChunks({ materialIds, projectId });
  const base = { sectionId: section?.id || null, evidence: [], gap: true, mode: 'none' };
  if (!query || !corpus.length) return base;

  const vectors = vectorMap || buildVectorMap();
  const probes = buildSectionProbes(section);
  let probeVectors = [];
  if (vectors.size && probes.length) {
    const embedded = await embedTexts(probes, { kind: 'query' });
    probeVectors = (embedded || []).filter(Boolean);
  }
  const useVectors = probeVectors.length > 0 && vectors.size > 0;

  let scored;
  let partial = false;
  let diag = null;

  if (useVectors) {
    // ניקוד v2 — על *כל* הקורפוס, לא רק על מועמדי selectChunks: הסטטיסטיקה
    // (median/MAD) חייבת את ההתפלגות המלאה, וגם המועמדים עצמם היו מוטי-hub.
    const embedded = corpus.filter((c) => vectors.has(c.id));
    partial = embedded.length < corpus.length;

    // צנטרואיד הקורפוס — ממוצע וקטורי היחידה, מנורמל.
    const dim = probeVectors[0].length;
    const centroid = new Float32Array(dim);
    for (const c of embedded) {
      const v = vectors.get(c.id);
      for (let i = 0; i < dim; i += 1) centroid[i] += v[i];
    }
    let norm = 0;
    for (let i = 0; i < dim; i += 1) norm += centroid[i] * centroid[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i += 1) centroid[i] /= norm;

    // לכל גשוש: adjusted + z בתוך ההתפלגות שלו; לקטע נשמר המקסימום בין הגשושים.
    const best = new Map(); // chunkId → {z, cos}
    for (const qv of probeVectors) {
      const rows = embedded.map((chunk) => {
        const v = vectors.get(chunk.id);
        const cos = cosineSim(qv, v);
        return { id: chunk.id, cos, adjusted: cos - HUB_BETA * cosineSim(centroid, v) };
      });
      const adj = rows.map((r) => r.adjusted).sort((a, b) => a - b);
      const median = adj[Math.floor(adj.length / 2)] || 0;
      const absDev = adj.map((x) => Math.abs(x - median)).sort((a, b) => a - b);
      const mad = (absDev[Math.floor(absDev.length / 2)] || 1e-6) * MAD_SCALE;
      for (const r of rows) {
        const z = (r.adjusted - median) / mad;
        const cur = best.get(r.id);
        if (!cur || z > cur.z) best.set(r.id, { z, cos: r.cos });
      }
      if (!diag) diag = { median: +median.toFixed(4), mad: +mad.toFixed(4), corpus: embedded.length, probes: probeVectors.length };
    }

    scored = embedded.map((chunk) => {
      const b = best.get(chunk.id);
      return {
        chunk,
        score: b.cos,   // מוצג למשתמש — סקאלת קוסינוס מוכרת
        z: b.z,         // ההחלטה מתקבלת על זה
        scale: 'cosine',
      };
    });

    // אינדקס חלקי: קטעים בלי וקטור מדורגים לקסיקלית ונכנסים רק אם עברו את
    // אותו רף יחסי (z שאול מהציון הלקסיקלי המנורמל — שמרני בכוונה).
    if (partial) {
      const missing = corpus.filter((c) => !vectors.has(c.id));
      const terms = new Set(tokenizeForRetrieval(query));
      const raw = missing.map((chunk) => scoreChunkRelevance(chunk, terms));
      const max = Math.max(...raw, 0);
      missing.forEach((chunk, i) => {
        const share = max > 0 ? raw[i] / max : 0;
        if (share >= MIN_LEXICAL_SHARE) {
          scored.push({ chunk, score: share, z: share >= 0.6 ? Z_KEEP : 0, scale: 'lexical-scaled' });
        }
      });
    }

    scored.sort((a, b) => b.z - a.z);
    // diag.top — שלושת המועמדים העליונים לפני הסף. חיוני לאבחון gap: רואים מה
    // כמעט עבר ובאיזה מרחק, בלי להוריד את הסף.
    if (diag) {
      diag.top = scored.slice(0, 3).map((s) => ({
        src: String(s.chunk.sourceTitle || '').slice(0, 28),
        z: +s.z.toFixed(2),
        head: String(s.chunk.text || '').slice(0, 50),
      }));
    }
  } else {
    const candidates = await selectChunks(query, {
      k: Math.min(corpus.length, Math.max(k * 3, 12)),
      chunks: corpus,
    });
    if (!candidates.length) return base;
    const terms = new Set(tokenizeForRetrieval(query));
    const raw = candidates.map((chunk) => scoreChunkRelevance(chunk, terms));
    const max = Math.max(...raw, 0);
    scored = candidates.map((chunk, i) => ({
      chunk,
      score: max > 0 ? raw[i] / max : 0,
      z: null,
      scale: 'lexical',
    }));
    scored.sort((a, b) => b.score - a.score);
  }

  // הסף: סמנטי — חריגה סטטיסטית (z) + עוגן לקסיקלי; לקסיקלי — יחסי לטוב ביותר.
  let kept;
  if (useVectors) {
    // עוגן: מונח תוכן מהשאילתה (≥4 תווים) מופיע בטקסט הקטע. includes ולא \b —
    // תחיליות עברית ("לכבידה"/"כבידה"), ו-\b ממילא לא עובד בעברית. לכל מונח נבדק
    // גם וריאנט בלי תחילית (ה/ו/ב/ל/כ/מ/ש) — "הבלימה" בשאילתה מול "בלימה" בטקסט.
    // סף 4 תווים: מונחי 3 תווים ("מבנה" אחרי חיתוך? לא—) קצרים מדי והם שעיגנו
    // רעש ("מבנה", "מערכת") לקטעים זרים.
    const anchorTerms = new Set();
    for (const t of tokenizeForRetrieval(query)) {
      const s = String(t);
      if (s.length >= 4) anchorTerms.add(s);
      if (s.length >= 5 && /^[הובלכמש]/.test(s)) anchorTerms.add(s.slice(1));
    }
    const anchors = [...anchorTerms];
    // ⚠️ lowercase על הטקסט: ה-tokenizer מוריד לאותיות קטנות ("Nye"→"nye"), ובלי
    // הנמכה מקבילה של הטקסט שם לועזי בשאילתה לעולם לא יעגן מקור באנגלית.
    const hasAnchor = (chunk) => {
      const text = String(chunk.text || '').toLowerCase();
      return anchors.some((t) => text.includes(t));
    };
    kept = scored.filter((s) => s.z >= Z_STRONG
      || (s.z >= Z_KEEP && (s.scale === 'lexical-scaled' || hasAnchor(s.chunk))));

    // שכבת "ראיה חלשה": כשאין אף ראיה מלאה אבל מונח-חובה של המרצה מופיע
    // *מילולית* בקטע עם z גבולי — עדיף להראות אותו מסומן כחלש מאשר לשתוק.
    // נמדד: תקציר קולקה (14 עמ' מספר של 125) נותן z=3.33 — נכון אך מתחת לסף,
    // ו"בלימה" כן מופיעה בו. הרף המילולי של mustMention הוא המבחין: בקרה שלילית
    // בלי מונחי-חובה לעולם לא תגיע לכאן.
    if (!kept.length) {
      const must = Array.isArray(section?.mustMention) ? section.mustMention.filter(Boolean) : [];
      if (must.length) {
        const mustVariants = must.flatMap((m) => String(m).split(/\s+/))
          .filter((w) => w.length >= 4)
          .flatMap((w) => (w.length >= 5 && /^[הובלכמש]/.test(w) ? [w, w.slice(1)] : [w]));
        kept = scored
          .filter((s) => s.z >= Z_WEAK && mustVariants.some((w) => String(s.chunk.text || '').includes(w)))
          .slice(0, 2)
          .map((s) => ({ ...s, weak: true }));
      }
    }
  } else {
    const best = scored[0]?.score || 0;
    const floor = Math.max(MIN_LEXICAL_SHARE, best - 0.35);
    kept = scored.filter((s) => s.score >= floor);
  }

  // גיוון מקורות: kept ממויין יורד, סופרים כמה כבר נלקחו מכל מקור.
  const perSource = new Map();
  kept = kept.filter((s) => {
    const key = s.chunk.materialId;
    const n = perSource.get(key) || 0;
    if (n >= MAX_PER_SOURCE) return false;
    perSource.set(key, n + 1);
    return true;
  }).slice(0, k);

  return {
    sectionId: section?.id || null,
    mode: useVectors ? (partial ? 'hybrid' : 'semantic') : 'lexical',
    gap: kept.length === 0,
    diag,
    evidence: kept.map((s) => ({
      chunkId: s.chunk.id,
      materialId: s.chunk.materialId,
      sourceTitle: s.chunk.sourceTitle,
      pageHint: s.chunk.pageHint,
      sectionHint: s.chunk.sectionHint,
      sourceUrl: s.chunk.sourceUrl || null,
      strength: s.weak ? 'weak' : (s.chunk.strength || 'full'),
      text: s.chunk.text,
      score: Number(s.score.toFixed(3)),
      z: s.z === null ? null : Number(s.z.toFixed(2)),
      scale: s.scale,
    })),
  };
}

/**
 * מריץ את השיוך על כל הסעיפים ב-spec. בונה את מפת הווקטורים פעם אחת.
 *
 * @returns {Promise<{bySection:Object<string,object>, gaps:Array<string>, mode:string}>}
 */
export async function findEvidenceForSpec(spec, opts = {}) {
  await ensureMaterialStoreReady();
  const sections = Array.isArray(spec?.sections) ? spec.sections.filter((s) => s?.enabled !== false) : [];
  const vectorMap = buildVectorMap();

  const bySection = {};
  const gaps = [];
  let mode = 'none';

  // היחידות: סעיפים וגם תתי-סעיפים ("א. ... ב. ...") — לכל שאלה ההפניות שלה.
  // ⚠️ תת-סעיף יורש את *המסגרת* של האב, לא רק את ה-intent: הטקסט שלו הוא תיאור
  // מקרה ("צייד לווייתנים"), והמקור הנכון הוא המסגרת האנליטית של האב ("עקרונות
  // מיל"). נמדד: בלי הירושה, שאלות מיל קיבלו הפניות למארקס — התאמה לסיפור
  // במקום לתיאוריה שאיתה עונים עליו.
  const units = [];
  for (const section of sections) {
    units.push(section);
    for (const sub of (Array.isArray(section.subSections) ? section.subSections : [])) {
      units.push({
        ...sub,
        intent: sub.intent || section.intent,
        title: [section.title, sub.title].filter(Boolean).join(' — '),
        keywords: Array.isArray(section.keywords) ? section.keywords : [],
        mustMention: (sub.mustMention?.length ? sub.mustMention : section.mustMention) || [],
      });
    }
  }

  for (const unit of units) {
    // סדרתי בכוונה: embedText טוען מודל WASM יחיד, ובקשות מקבילות רק מתחרות עליו.
    const result = await findEvidenceForSection(unit, { ...opts, vectorMap });
    bySection[unit.id] = result;
    if (result.gap) gaps.push(unit.id);
    if (result.mode !== 'none') mode = result.mode;
  }

  return { bySection, gaps, mode };
}

// ---------- בניית בלוק ראיות ----------

const CITE_WORDS = 60;

function truncateWords(text, maxWords) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}…`;
}

/** מחרוזת פרובננס קריאה: "כהן 2019, עמ' 14 · שיטת המחקר". */
export function formatProvenance(item) {
  const parts = [String(item?.sourceTitle || '').trim()];
  if (item?.pageHint) parts[0] = `${parts[0]}, עמ' ${item.pageHint}`;
  if (item?.sectionHint) parts.push(item.sectionHint);
  // ראיה שנפלה לתקציר מסומנת גם בפאנל וגם בבלוק שנשלח למודל — כדי שלא תיקרא
  // כאילו היא הטקסט המלא של המאמר.
  if (item?.strength === 'abstract') parts.push('תקציר בלבד');
  return parts.filter(Boolean).join(' · ');
}

/**
 * בלוק ראיות עברי לסעיף. *לא* buildChunkInjectionText — הכותרת שלו אומרת
 * "דוגמאות לכתיבה שלך, אל תעתיק תוכן", וזה בדיוק ההפך ממה שנדרש מחומר מקור.
 *
 * @param {Array<object>} evidence
 * @param {{sectionTitle?:string}} opts
 * @returns {string}
 */
export function buildEvidenceBlock(evidence, { sectionTitle = '' } = {}) {
  const list = Array.isArray(evidence) ? evidence.filter(isPlainObject) : [];
  if (!list.length) return '';
  const head = sectionTitle
    ? `מקורות תומכים לסעיף "${sectionTitle}" (מתוך החומרים שהעלית):`
    : 'מקורות תומכים (מתוך החומרים שהעלית):';
  const lines = [head];
  list.forEach((item) => {
    lines.push(`▸ ${formatProvenance(item)}`);
    lines.push(`  "${truncateWords(item.text, CITE_WORDS)}"`);
  });
  return lines.join('\n');
}
