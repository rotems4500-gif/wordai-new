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
  quantizeVector,
  dequantizeVector,
  int8ToBase64,
  base64ToInt8,
  cosineSim,
} from './styleEmbeddingService';
// מנוע ה-embeddings של האחזור נבחר בזמן ריצה (e5-WASM או bge-m3 דרך Ollama).
// החתימה כבר אינה קבוע — היא נגזרת מהמנוע הפעיל, ולכן חייבים ensure לפני שקוראים
// לה. ראה retrievalEmbeddingService להסבר על הקפאת החתימה.
import {
  ensureRetrievalBackend,
  getRetrievalSignature,
  embedForRetrieval,
  isRetrievalEmbeddingUnavailable,
} from './retrievalEmbeddingService';
import { selectChunks, scoreChunkRelevance, tokenizeForRetrieval } from './styleRetrievalService';
import { extractDoctrineAnchor, extractDoctrineScope, isGenericInstructionHeading } from './assignmentSpecService';

/**
 * כמה ראיות לאחזר לכל סעיף. **ערך אחד לכל הקוראים.**
 *
 * ⚠️ עד 27.7 היו שלושה ערכים שונים: האפליקציה שלחה 5, ההרנס 6, וברירת המחדל
 * בשירות 5 — כלומר הבנצ' מדד תצורה שאינה זו שנשלחת למשתמש. אותה משפחת תקלה
 * שכבר הפילה את מדידת שכבת הניסוח ביולי, בקנה מידה קטן יותר.
 *
 * 10 נמדד (27.7, מסלול הכללים) מול 6 על אותה מטלה:
 *   מילים 852→1042 · ישויות מהשאלה 44%→56% · פיגום גרוע 35%→29% ·
 *   דטקטור 76→75 · עיגון נשאר 100%.
 * במסלול הכללים כל ראיה מניבה **משפט אחד בדיוק**, ולכן k הוא התקרה הישירה על
 * נפח הסעיף — וזו הסיבה שהערך שכויל כשהניסוח הפיק שני משפטים לראיה נמוך מדי כאן.
 */
export const DEFAULT_EVIDENCE_K = 10;

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
// בוסט z לקטע שמכיל מונח-מסגרת/חובה דוקטרינרי מילולית (hybrid dense+lexical).
// 1.2: מרים near-miss עברי (z≈3.4–4.5) מעל zFloor=4.5 של proseComposeService,
// בלי להזיז את הסף עצמו. מוחל רק על z≥Z_KEEP עם עוגן מבחין — ראה doctrineAnchorTerms.
const LEX_BOOST = 1.2;
const MAD_SCALE = 1.4826; // MAD → אומדן σ תחת נורמליות
const MAX_PER_SOURCE = 2; // גיוון: לא יותר מ-2 קטעים מאותו מקור במעבר הראשון
// תקרת המילוי-החוזר כשהגיוון לא הספיק (ר' ההסבר ליד takeWithCap למטה).
const MAX_PER_SOURCE_BACKFILL = 4;
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
  // גשוש המסגרת (framework) — התיקון של round-1. תת-סעיף יורש את המסגרת האנליטית
  // של האב: הכותרת שלו היא עובדות-המקרה ("קבוצת המיעוט דורשת... צייד לווייתנים"),
  // אך המקור הנכון הוא המסגרת שאיתה עונים ("הגותו של ג'ון סטיוארט מיל"). הטמעת
  // 600 תווי עובדות-מקרה מוחצת את זו של המסגרת, ולכן תת-סעיפי מיל אחזרו את מארקס
  // (nlg-loop round-1: sec_1_1..4 כולם החזירו מניפסט/סמית). גשוש חד ונפרד למסגרת
  // + מונחי החובה נותן לקטעי המקור הדוקטרינרי z גבוה (z=max על-פני הגשושים), בלי
  // להיתלות בעובדות-המקרה. פועל רק כשיש framework — כלומר במסלול ה-spec, לא
  // בבקרות השליליות השטוחות של ה-e2e.
  const framework = String(section.framework || '').trim();
  if (framework) probes.push(must.length ? `${framework} ${must.join(' ')}` : framework);
  return probes;
}

/**
 * מונחי-עוגן דוקטרינריים לבוסט הלקסיקלי-היברידי: שם ההוגה/framework (טוקנים ≥5
 * תווים — "מיל" בן 3 קצר מדי ומעגן רעש כמו "מילים") + ביטויי mustMention השלמים.
 * אלה מונחים *מבחינים* (שמות עצם פרטיים, מושגי-מפתח של המרצה) ולא מילות-שאילתה
 * נפוצות — ולכן בטוחים לבוסט: בקרה שלילית לעולם אינה נושאת אותם בקורפוס.
 */
// גזע עברי גס לעיגון סיבולת-מורפולוגיה: מסיר תחילית אחת (הובלכמש) וסיומת נטייה
// נפוצה (ים/ות/ית/יים/יות/ה/י), ומחזיר את השורש אם נותרו ≥4 תווים. נחוץ כי
// "התעשייתית" (מהכותרת) ל-includes לעולם לא יתאים ל"התעשייתיים"/"התעשייה" שבטקסט —
// אבל הגזע "תעשיי" כן. הגזע חייב להישאר מבחין (≥4) כדי לא לעגן רעש.
function coarseStem(token) {
  let s = String(token || '');
  if (s.length >= 6 && /^[הובלכמש]/.test(s)) s = s.slice(1);
  s = s.replace(/(?:יים|יות|ים|ות|ית|יה)$/, '').replace(/[הי]$/, '');
  return s.length >= 4 ? s : null;
}

function doctrineAnchorTerms(section) {
  const out = new Set();
  const fw = String(section?.framework || '').trim();
  if (fw) {
    for (const t of tokenizeForRetrieval(fw)) {
      const s = String(t);
      if (s.length < 5) continue; // "מיל" בן 3 מעגן "מילים"/"מיליון" — קצר מדי
      out.add(s);
      const stem = coarseStem(s);
      if (stem) out.add(stem);
    }
  }
  const must = Array.isArray(section?.mustMention) ? section.mustMention.filter(Boolean) : [];
  for (const m of must) {
    const s = String(m).trim().toLowerCase();
    if (s.length >= 4) out.add(s);
  }
  return [...out];
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
  await ensureRetrievalBackend();
  const signature = getRetrievalSignature();

  const unavailable = isRetrievalEmbeddingUnavailable();
  if (unavailable) return { embedded: 0, remaining: 0, unavailable };

  const pending = getUnembeddedMaterialChunks(signature, { limit });
  if (!pending.length) {
    return { embedded: 0, remaining: 0, unavailable: null };
  }

  const vectors = await embedForRetrieval(pending.map((c) => c.text), { kind: 'passage', onProgress });
  // null = השכבה נפלה (WASM/Ollama/רשת). לא זורקים — המסלול הלקסיקלי עדיין עובד.
  if (!vectors) {
    return { embedded: 0, remaining: pending.length, unavailable: isRetrievalEmbeddingUnavailable() || 'embed-failed' };
  }

  const entries = [];
  vectors.forEach((vec, i) => {
    if (!vec) return;
    entries.push({ chunkId: pending[i].id, vec: int8ToBase64(quantizeVector(vec)) });
  });
  const saved = putMaterialVectors(entries, signature);

  const remaining = getUnembeddedMaterialChunks(signature, { limit: 1 }).length;
  return { embedded: saved, remaining, unavailable: null };
}

// מפת chunkId → Float32Array. selectChunks מצפה ל-Map של וקטורים מפוענחים.
function buildVectorMap() {
  const base64Map = getMaterialVectorsBase64(getRetrievalSignature());
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
  k = DEFAULT_EVIDENCE_K,
  materialIds = null,
  projectId = null,
  vectorMap = null,
  minCosine = MIN_COSINE_FLOOR,
  domainVector = null,
} = {}) {
  await ensureMaterialStoreReady();
  await ensureRetrievalBackend();

  const query = buildSectionQuery(section);
  const corpus = getMaterialChunks({ materialIds, projectId });
  const base = { sectionId: section?.id || null, evidence: [], gap: true, mode: 'none' };
  if (!query || !corpus.length) return base;

  const vectors = vectorMap || buildVectorMap();
  const probes = buildSectionProbes(section);
  let probeVectors = [];
  if (vectors.size && probes.length) {
    const embedded = await embedForRetrieval(probes, { kind: 'query' });
    probeVectors = (embedded || []).filter(Boolean);
  }
  const useVectors = probeVectors.length > 0 && vectors.size > 0;

  let scored;
  let partial = false;
  let diag = null;
  let corpusSize = 0;   // כמה קטעים מוטמעים השתתפו בדירוג — קובע אם הקורפוס "ממוקד"
  // מוגדרת כאן ולא בתוך ענף ה-vectors: היא נצרכת גם בבניית הפלט שמחוצה לו.
  let matchedAnchors = () => [];

  if (useVectors) {
    // ניקוד v2 — על *כל* הקורפוס, לא רק על מועמדי selectChunks: הסטטיסטיקה
    // (median/MAD) חייבת את ההתפלגות המלאה, וגם המועמדים עצמם היו מוטי-hub.
    // ⚠️ קטעי OCR משובשים (garbled) מוחרגים מכאן: הם הזינו את ה-median/MAD ברעש
    // ומחצו את ה-z של ההתאמות האמיתיות (round-1). ניקוי הקורפוס מעלה את z של
    // המקור הנכון בלי לגעת ב-zFloor — עיקרון הכנות נשמר.
    const usableCorpus = corpus.filter((c) => !c.garbled);
    const embedded = usableCorpus.filter((c) => vectors.has(c.id));
    partial = embedded.length < usableCorpus.length;
    corpusSize = embedded.length;

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

    // בוסט לקסיקלי-היברידי: קטע שמכיל מונח-מסגרת/חובה דוקטרינרי *מילולית* הוא
    // ראיה חזקה גם כשה-z הסמנטי גבולי — אות ה-BM25 שחסר ל-e5 בעברית. הבוסט מוחל
    // רק על near-miss (z≥Z_KEEP) עם עוגן דוקטרינרי מבחין, ולכן מרים התאמת-אמת מעל
    // ה-zFloor בלי לגעת בסף ובלי להחיות רעש. בקרות שליליות חסרות framework/
    // mustMention בקורפוס ⇒ anchors ריק ⇒ אפס בוסט.
    const boostTerms = doctrineAnchorTerms(section);
    const boostFor = (chunk, z) => {
      if (!boostTerms.length || z < Z_KEEP) return 0;
      const text = String(chunk.text || '').toLowerCase();
      return boostTerms.some((t) => text.includes(t)) ? LEX_BOOST : 0;
    };

    scored = embedded.map((chunk) => {
      const b = best.get(chunk.id);
      const boost = boostFor(chunk, b.z);
      return {
        chunk,
        score: b.cos,       // מוצג למשתמש — סקאלת קוסינוס מוכרת
        z: b.z + boost,     // ההחלטה מתקבלת על זה (כולל האות הלקסיקלי)
        boosted: boost > 0,
        scale: 'cosine',
      };
    });

    // אינדקס חלקי: קטעים בלי וקטור מדורגים לקסיקלית ונכנסים רק אם עברו את
    // אותו רף יחסי (z שאול מהציון הלקסיקלי המנורמל — שמרני בכוונה).
    if (partial) {
      const missing = usableCorpus.filter((c) => !vectors.has(c.id));
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
    // ⚠️ העוגנים נבנים מ-query **וגם מהמסגרת** (framework/mustMention). בגרסה
    // קודמת הם נגזרו מ-buildSectionQuery בלבד — כותרת+מילות מפתח+הנחיה — בעוד
    // העוגן הדוקטרינרי נכנס ל-framework, שמזין רק את הגשושים הסמנטיים.
    // התוצאה נמדדה על מטלת קייס אמיתית: מילון העוגנים הורכב משמות הדמויות
    // ("דניאל", "יקיר", "טענות"), וקטע על חופש הביטוי לא מכיל אף אחד מהם —
    // ולכן נדחה למרות שהוא בדיוק המקור הנכון.
    const anchorSource = [
      query,
      String(section?.framework || ''),
      ...(Array.isArray(section?.mustMention) ? section.mustMention : []),
    ].filter(Boolean).join(' ');
    const anchorTerms = new Set();
    for (const t of tokenizeForRetrieval(anchorSource)) {
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

    // ---------- מגבלה ידועה: שם דמות כעוגן ----------
    //
    // נמדד ומתועד: השאלה על "יצחק" אחזרה **תרגיל פיזיקה** מקובץ הנחיות-הגשה
    // (z=3.46, המקור הראשון בסעיף) רק משום שהשם "יצחק" מופיע בשני המסמכים.
    // בלי שכבת ניסוח זה מייצר טקסט מגושם שקורא תופס; **עם** שכבת ניסוח זה מייצר
    // טיעון משפטי רהוט שקיבל עיגון 69% — הציון הגבוה בריצה — כי הוא נאמן למקור
    // השגוי. שער העיגון אינו יכול לתפוס זאת מהגדרתו.
    //
    // שלושה תיקונים נוסו ונפסלו במדידה:
    //   1. עוגני-דוקטרינה מ-framework      → framework מכיל את הכותרת ולכן גם
    //                                        את שם הדמות. ללא שינוי.
    //   2. הפרדת doctrineTerms + טוקנים    → 5/6 סעיפים, אך "תקשורת"/"אחריות"
    //                                        (מילים גנריות במחלקה לתקשורת)
    //                                        המשיכו להכשיר את אותו קובץ.
    //   3. התאמת ביטוי מלא                 → הפיזיקה נפסלה, אבל **1/6 סעיפים,
    //                                        29 מילים** — סיכום שיעור אינו מכיל
    //                                        "חופש הביטוי" כלשונו.
    //   4. סינון לפי תדירות-מסמכים         → **רגרסיה בבנצ'**: אחזור 4/5 ופרוזה
    //                                        2/2 במקום 5/5 ו-3/3.
    //
    // הוחזר למצב הידוע-כתקין (5/6 · 5/5 · 3/3). doctrineAnchors נשאר בשימוש
    // בשכבת הנפילה בלבד, שם הוא כן מועיל ואינו פוגע.
    //
    // ⚠️ לפני שמחברים שכבת ניסוח לייצור — חייבים לפתור את זה. הכיוון הסביר אינו
    // עוד ניסוי בעוגנים אלא **שער רלוונטיות-מקור נפרד**: לבדוק שהקטע עוסק בתחום
    // של המטלה, לא רק שהוא חולק איתה מילה.
    const doctrineAnchors = (() => {
      const set = new Set();
      const src = [
        String(section?.doctrineTerms || ''),
        ...(Array.isArray(section?.mustMention) ? section.mustMention : []),
        ...(Array.isArray(section?.keywords) ? section.keywords : []),
      ].filter(Boolean).join(' ');
      for (const t of tokenizeForRetrieval(src)) {
        const s = String(t);
        if (s.length >= 4) set.add(s);
        if (s.length >= 5 && /^[הובלכמש]/.test(s)) set.add(s.slice(1));
      }
      return [...set];
    })();

    matchedAnchors = (chunk) => {
      const text = String(chunk.text || '');
      return doctrineAnchors.filter((t) => text.includes(t));
    };

    // ---------- שער רלוונטיות-תחום ----------
    // ⚠️ ההגנה שחסרה כשמוסיפים שכבת ניסוח. כל התיקונים הקודמים ניסו לחדד את
    // העוגן הלקסיקלי *של השאלה*, ולכן נגררו לעובדות המקרה. כאן נשאלת שאלה אחרת
    // לגמרי, בלתי תלויה בשאלה הספציפית: **האם הקטע בכלל עוסק בתחום של המטלה?**
    //
    // המדד: קרבה סמנטית של הקטע לדוקטרינה המוצהרת בפתיח ("חופש הביטוי, פרטיות,
    // לשון הרע…"). הסף יחסי — חציון הקורפוס — ולכן מסנן רק קטעים **מתחת לממוצע**
    // הרלוונטיות לתחום. תרגיל פיזיקה בקורפוס של דיני תקשורת נופל שם בבירור,
    // וסיכום שיעור רלוונטי אינו נפגע.
    //
    // כשאין דוקטרינה מוצהרת (בקרות שטוחות ב-e2e) — השער כבוי לחלוטין.
    let domainOk = () => true;
    if (domainVector && scored.length) {
      const sims = new Map();
      for (const s of scored) {
        const v = vectors.get(s.chunk.id);
        if (v) sims.set(s.chunk.id, cosineSim(domainVector, v));
      }
      // ⚠️ הסף הוא **רבעון תחתון ולא חציון**. חציון פוסל מחצית מהמועמדים בהגדרה,
      // גם כשכל הקורפוס על-הנושא — וזה בדיוק תרחיש השימוש (חומרי קורס אחד).
      // נמדד: סעיף 6 קיבל ראיה אחת בלבד ונעצר על 42 מילים מתוך 180. מה שהשער
      // נועד לתפוס (תרגיל פיזיקה בקורפוס דיני תקשורת) יושב הרחק מתחת ל-p25,
      // ולכן ההרפיה אינה מחזירה אותו.
      const sorted = [...sims.values()].sort((a, b) => a - b);
      const cut = sorted[Math.floor(sorted.length * 0.25)] || 0;
      domainOk = (chunk) => (sims.get(chunk.id) ?? 1) >= cut;
      if (diag) diag.domainCut = +cut.toFixed(4);
    }

    // ⚠️ המסלול הרגיל נשאר על hasAnchor (עוגני השאילתה). שלושה ניסיונות להחמיר
    // אותו לעוגני-דוקטרינה נמדדו ונפסלו — ר' הבלוק "מגבלה ידועה" למעלה.
    kept = scored.filter((s) => domainOk(s.chunk) && (s.z >= Z_STRONG
      || (s.z >= Z_KEEP && (s.scale === 'lexical-scaled' || hasAnchor(s.chunk)))));

    // ---------- שכבת נפילה: קורפוס ממוקד ----------
    // ⚠️ הסף היחסי (z) מודד חריגה מהתפלגות הקורפוס, ולכן הוא מניח בשקט שרוב
    // הקורפוס **אינו** רלוונטי לשאילתה. ההנחה נכונה לספרייה מגוונת (עליה כויל:
    // 584 ואז 944 קטעים) ומתהפכת בדיוק בתרחיש השימוש המרכזי — משתמש מעלה את
    // חומרי הקורס שלו וכותב עליהם. אז *הכל* על-הנושא, החציון עולה, ואף קטע
    // אינו חריג.
    //
    // נמדד: 5 סיכומי הרצאה במינהל ציבורי (32 קטעים), שאילתה על המעבר לניהול
    // ציבורי חדש. הקטע המוביל היה "מנהל ציבורי חדש = NPM (New Public
    // Management)" — התשובה המדויקת — ב-z=3.27 מול סף 3.4. אפס ראיות הוחזרו.
    //
    // הנפילה דורשת **עוגן לקסיקלי** מהשאילתה בטקסט, ולכן היא אינה מרפה את
    // הסינון: בקרה שלילית לא נושאת את מונחי השאילתה ולעולם לא תגיע לכאן.
    // מסומן weak — הצרכן יודע שזו ראיה מדורגת ולא ראיה שחצתה סף.
    // ⚠️ הגרסה הראשונה הגבילה את הנפילה לקורפוס קטן (≤200 קטעים). זו הייתה טעות:
    // הבעיה אינה **גודל** אלא **הומוגניות**. נמדד על המטלה האמיתית בדיני תקשורת —
    // 564 קטעים, כולם חומרי אותו קורס — **כל ששת הסעיפים חזרו ריקים**, בדיוק
    // כמו 32 הקטעים של מינהל ציבורי. גודל הקורפוס אינו מנבא כלום; מה שקובע הוא
    // שכשהכל על-הנושא, אין חריגים.
    //
    // מה שמחליף את מגבלת הגודל כשומר-סף: **שני עוגנים מבחינים** במקום אחד.
    // המסלול הרגיל מסתפק בעוגן אחד כי הוא ממילא דורש z≥3.4; כאן הסף נמוך, ולכן
    // הדרישה הלקסיקלית מחמירה — כדי ששאילתה עברית זרה לא תיכנס על סמך מילה
    // אחת שהופיעה במקרה.
    // 1.6 ולא 2.0: נמדד שכל הראיות במטלה האמיתית מגיעות דרך השכבה הזו בטווח
    // z 2.0–3.2, כלומר הסף עצמו הוא הכובל — סעיף שלם נעצר על ראיה אחת ועל 46
    // מילים מתוך 180. שלוש שכבות הגנה נשארות מעליו: שער התחום, דרישת שני
    // העוגנים כאן, ושער העיגון בשכבת הניסוח.
    const FOCUSED_MIN_Z = Number(globalThis.__WORDAI_FOCUSED_MIN_Z || 1.6);
    const FOCUSED_MIN_ANCHORS = 2;

    // אותם עוגני דוקטרינה של המסלול הרגיל (ר' hasDoctrineAnchor למעלה) — כאן
    // נספרים, כי שכבת הנפילה דורשת שניים ולא אחד.
    //
    // ⚠️ נספרים **מושגים ולא טוקנים**. הרחבת התחיליות מייצרת שני מונחים לאותה
    // מילה ("העבודה" + "עבודה"), ושניהם נמצאים באותו קטע — כך שקטע שנגע במושג
    // אחד בלבד נראה כאילו עמד בדרישת "שני עוגנים מבחינים". זה מה שהכשיל את
    // הבקרה השלילית neg-ai-labor: הררי/מרקס/סמית נכנסו על "עבודה" בלבד, בזמן
    // שהמושג הראשי של השאלה (בינה מלאכותית) אינו בקורפוס כלל.
    // ר' docs/bench-neg-ai-labor.md.
    const conceptGroups = (() => {
      const raw = doctrineAnchors.length
        ? [
          ...(Array.isArray(section?.keywords) ? section.keywords : []),
          ...(Array.isArray(section?.mustMention) ? section.mustMention : []),
          String(section?.doctrineTerms || ''),
        ]
        : [String(section?.framework || ''), ...(Array.isArray(section?.mustMention) ? section.mustMention : []), query];
      const pool = doctrineAnchors.length ? doctrineAnchors : anchors;
      const groups = [];
      const claimed = new Set();
      for (const g of raw.map((x) => String(x || '').trim()).filter(Boolean)) {
        const terms = tokenizeForRetrieval(g).map(String)
          .flatMap((t) => (t.length >= 5 && /^[הובלכמש]/.test(t) ? [t, t.slice(1)] : [t]))
          .filter((t) => t.length >= 4 && pool.includes(t));
        if (!terms.length) continue;
        groups.push(terms);
        terms.forEach((t) => claimed.add(t));
      }
      // מונחים שלא שויכו לאף קבוצה (הגיעו מהשאילתה החופשית) — כל אחד קבוצה בפני עצמה,
      // אחרי איחוד וריאנטים של אותה מילה.
      const leftovers = pool.filter((t) => !claimed.has(t)).sort((a, b) => a.length - b.length);
      for (const t of leftovers) {
        const host = groups.find((grp) => grp.some((x) => t.includes(x) || x.includes(t)));
        if (host) host.push(t);
        else groups.push([t]);
      }
      return groups;
    })();

    const anchorCount = (chunk) => {
      const text = String(chunk.text || '');
      const lower = text.toLowerCase();
      let n = 0;
      for (const grp of conceptGroups) {
        if (grp.some((t) => text.includes(t) || lower.includes(t))) n += 1;
      }
      return n;
    };
    // ⚠️ זהו **תגבור**, לא רק נפילה. הגרסה הקודמת פעלה רק כש-kept ריק לגמרי,
    // ולכן סעיף שקיבל בדיוק ראיה אחת דרך המסלול הרגיל לא תוגבר — וכשמשפטה
    // היחיד כבר נוצל בסעיף אחר (sharedUsedSentences מונע כפילות חוצת-עבודה)
    // הוא נחסם. נמדד: sec_5 ו-sec_6 נחסמו כך למרות שהיו להם ראיות.
    //
    // שתי דרגות, ושתיהן דורשות עוגן לקסיקלי — זו תכונת הבטיחות שנמדדה
    // (בקרות שליליות אינן נושאות את מונחי השאילתה):
    //   א. z נמוך אך תמיכה לקסיקלית חזקה (2 עוגנים)
    //   ב. z בינוני עם עוגן אחד
    const FOCUSED_MIN_Z_STRONG = 3.0;
    const THIN_KEPT = 3;
    kept = kept.map((s) => ({ ...s, via: 'normal' }));
    // ---------- תנאי־מקדים לשכבת הנפילה: הקורפוס בכלל מכסה את השאלה? ----------
    // הנפילה נועדה לקורפוס הומוגני שכולו על-הנושא. הסימן לכך שהקורפוס אכן עוסק
    // בשאלה הוא **צירוף** מושגים: לפחות קטע אחד שנוגע בשני מושגים שונים מהשאלה.
    // בקרה שלילית אמיתית (AI ושוק העבודה מול קורפוס תרבות המערב) לא מייצרת אף
    // קטע כזה — כל ההתאמות נשענות על מושג גנרי יחיד ("עבודה"). ⚠️ נמדד: בסעיפים
    // האמיתיים של הבנצ' תמיד קיים קטע דו-מושגי, ולכן התנאי אינו חוסם אותם.
    const corpusCoversQuestion = scored.some((s) => domainOk(s.chunk) && anchorCount(s.chunk) >= FOCUSED_MIN_ANCHORS);
    if (diag) diag.corpusCovers = corpusCoversQuestion;
    if (kept.length < THIN_KEPT && corpusCoversQuestion) {
      const already = new Set(kept.map((s) => s.chunk.id));
      const extra = scored.filter((s) => {
        if (already.has(s.chunk.id)) return false;
        if (!domainOk(s.chunk)) return false;   // שער התחום חל גם על התגבור
        const n = anchorCount(s.chunk);
        return (s.z >= FOCUSED_MIN_Z && n >= FOCUSED_MIN_ANCHORS)
          || (s.z >= FOCUSED_MIN_Z_STRONG && n >= 1);
      }).map((s) => ({ ...s, weak: true, focused: true, via: 'focused' }));
      kept = [...kept, ...extra].slice(0, Math.max(6, k));
    }

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
          .map((s) => ({ ...s, weak: true, via: 'must-weak' }));
      }
    }
  } else {
    const best = scored[0]?.score || 0;
    const floor = Math.max(MIN_LEXICAL_SHARE, best - 0.35);
    kept = scored.filter((s) => s.score >= floor);
  }

  // גיוון מקורות — *העדפה*, לא הרעבה.
  //
  // מעבר ראשון: לכל היותר MAX_PER_SOURCE מכל מקור, כדי שסעיף לא ייבנה כולו על
  // מאמר אחד כשיש חלופות. מעבר שני: אם אחרי הגיוון נשארו פחות מ-k ראיות, ממלאים
  // מהשאריות עד תקרה גבוהה יותר.
  //
  // למה: נמדד שסעיפים שהתשובה שלהם יושבת במקור *אחד* (הטיפולוגיה של גונדל,
  // עקרון ה-PMP של וולפספלד) קיבלו בדיוק 2 קטעים — ואז targetWords
  // (=workList.length·45 ב-proseComposeService) נחתך ל-90 מילים והפרוזה יצאה
  // עם הערת "דרוש מקור נוסף" למרות שבמקור יש עוד חומר תקף. הכלל שנועד לגוון
  // הפך לתקרת תפוקה.
  //
  // ⚠️ אין כאן ריכוך של הסינון: הראיות שמתווספות כבר עברו את *אותו* שער z+עוגן.
  // רק ההיוריסטיקה של הגיוון ויתרה, ולכן שום ראיה חלשה יותר לא נכנסת.
  const takeWithCap = (items, cap, counts) => items.filter((s) => {
    const key = s.chunk.materialId;
    const n = counts.get(key) || 0;
    if (n >= cap) return false;
    counts.set(key, n + 1);
    return true;
  });

  const perSource = new Map();
  const diverse = takeWithCap(kept, MAX_PER_SOURCE, perSource);
  if (diverse.length < k) {
    const chosen = new Set(diverse.map((s) => s.chunk.id));
    const backfill = takeWithCap(
      kept.filter((s) => !chosen.has(s.chunk.id)),
      MAX_PER_SOURCE_BACKFILL,
      perSource,
    );
    kept = [...diverse, ...backfill].sort((a, b) => b.z - a.z).slice(0, k);
  } else {
    kept = diverse.slice(0, k);
  }

  if (diag) {
    // דרך הכניסה של כל ראיה (normal / focused / must-weak) והעוגנים שהכשירו אותה.
    // בלי זה אי אפשר לאבחן כשל כמו neg-ai-labor: הראיות נראות סבירות עד שמתברר
    // שכולן נכנסו דרך שכבת הנפילה ועל מושג יחיד.
    diag.via = kept.map((s) => s.via || 'normal');
    diag.anchors = kept.map((s) => matchedAnchors(s.chunk).slice(0, 6));
  }

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
      // אילו ביטויי דוקטרינה הכשירו את הקטע — לאבחון "למה נבחר המקור הזה".
      anchors: useVectors ? matchedAnchors(s.chunk).slice(0, 4) : [],
      text: s.chunk.text,
      score: Number(s.score.toFixed(3)),
      z: s.z === null ? null : Number(s.z.toFixed(2)),
      scale: s.scale,
      // round-4: מקור דיגיטלי-נקי (לא עבר OCR) מקבל רצפה מקלה ב-proseComposeService;
      // מקור-שקפים מוגבל שם למהלך ציטוט בלבד. שני השדות אופציונליים — chunk ישן
      // בלעדיהם מתנהג כמו קודם (לא נקי, לא שקפים).
      cleanDigital: Boolean(s.chunk.cleanDigital),
      sourceKind: s.chunk.sourceKind || null,
      // נבחרה בשכבת הנפילה של קורפוס ממוקד — כלומר עברה עוגן לקסיקלי ודירוג,
      // ולא סף z. proseComposeService חייב לדעת זאת: הסף המוחלט שלו (zFloor)
      // אינו בר-השגה בקורפוס ממוקד מעצם הגדרתו.
      focused: Boolean(s.focused),
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
  await ensureRetrievalBackend();
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
  // עוגן דוקטרינרי ברמת המסמך — נסרק מכל טקסט המטלה. במטלת קייס כותרת כל שאלה
  // היא עובדות המקרה ("אילו טענות עשויה דליה להעלות"), והמסגרת האנליטית מוצהרת
  // פעם אחת בפתיח ("סוגיות של חופש הביטוי, פרטיות, לשון הרע, אתיקה עיתונאית").
  // בלי זה כל שאילתה מחפשת לפי שמות הדמויות ואינה פוגשת את הדוקטרינה.
  // ⚠️ המקור הראשי הוא spec.doctrineScope, שנחלץ בפרסר מהטקסט **המלא**. הסריקה
  // מהסעיפים היא רק נפילה: הפתיח יושב לפני השאלות ואינו נכלל בגוף אף סעיף, ולכן
  // גרסה שסרקה רק את הסעיפים לא מצאה דבר ולא שינתה כלום בתוצאה.
  const docScope = spec?.doctrineScope || extractDoctrineScope(
    sections.map((s) => `${s?.title || ''} ${String(s?.instructions || '').slice(0, 800)}`).join('\n'),
  );

  // וקטור התחום — מוטמע **פעם אחת** לכל העבודה ומוזרם לכל הסעיפים. הוא מייצג
  // את הדוקטרינה המוצהרת בפתיח, בלי עובדות המקרה ובלי השאלה הספציפית, ולכן
  // הוא המדד היחיד כאן שאי אפשר להרעיל בשם של דמות. ר' "שער רלוונטיות-תחום".
  let domainVector = null;
  if (docScope) {
    const dv = await embedForRetrieval([docScope], { kind: 'query' });
    domainVector = (dv && dv[0]) || null;
  }

  const units = [];
  for (const section of sections) {
    // round-4: הגנה כפולה מעבר לתיקון ב-assignmentSpecService (שם הכותרת
    // עצמה כבר לא אמורה לצאת גנרית). אם בכל זאת section.title הוא כותרת-הוראה
    // גנרית ("ניתוח הסעיפים הבאים" — כותרת חסרת-תוכן, לא נושא), גוזרים עוגן
    // דוקטרינרי ישירות מ-instructions ("לפי העקרונות של מיל אשר למדנו בקורס")
    // באותו regex — כך שהגשוש/הבוסט לא ניזונים מכותרת ריקה. נמדד: sec_1 (מיל)
    // ב-round-2/3 קיבל framework="ניתוח הסעיפים הבאים" בלי עוגן לקסיקלי מבחין.
    const ownTitle = String(section.title || '').trim();
    let ownFramework = isGenericInstructionHeading(ownTitle)
      ? (extractDoctrineAnchor(section.instructions) || ownTitle)
      : ownTitle;
    // כותרת שהיא עובדות-מקרה אינה "גנרית" לפי isGenericInstructionHeading (יש בה
    // תוכן), אבל היא מסגרת אנליטית גרועה. כשקיים עוגן ברמת המסמך, מצרפים אותו —
    // הגשוש מקבל גם את המקרה וגם את הדוקטרינה, ו-z הוא המקסימום ביניהם.
    if (docScope && ownFramework && !ownFramework.includes(docScope)) {
      ownFramework = `${ownFramework} ${docScope}`;
    } else if (docScope && !ownFramework) {
      ownFramework = docScope;
    }
    // סעיף ראשי: המסגרת שלו היא כותרתו הדוקטרינרית ("עקרונות המרקסיזם") — עובדות
    // המקרה יושבות ב-instructions ולא בכותרת, ולכן הכותרת היא עוגן נקי. מזין את
    // גשוש-המסגרת ואת הבוסט הלקסיקלי גם לסעיפים בלי תת-סעיפים (sec_2/sec_3).
    // doctrineTerms נשמר **בנפרד** מ-framework: framework מזין את גשוש-האחזור
    // (ושם שילוב עובדות-המקרה מועיל), ואילו doctrineTerms מזין את **העוגן
    // הלקסיקלי** — ושם עובדות המקרה הן רעל, כי שם דמות מכשיר מסמכים זרים.
    units.push({ ...(section.framework ? section : { ...section, framework: ownFramework }), doctrineTerms: docScope || '' });
    for (const sub of (Array.isArray(section.subSections) ? section.subSections : [])) {
      units.push({
        ...sub,
        intent: sub.intent || section.intent,
        title: [section.title, sub.title].filter(Boolean).join(' — '),
        // המסגרת האנליטית שהתת-סעיף נשען עליה = כותרת האב ("הגותו של מיל"), או
        // העוגן הדוקטרינרי מתוך הנחיית האב כשהכותרת עצמה גנרית (round-4, ראו למעלה).
        // מזינה את גשוש-המסגרת ואת העוגן הלקסיקלי ב-buildSectionProbes/
        // doctrineAnchorTerms — התיקון המרכזי של round-1.
        framework: ownFramework,
        doctrineTerms: docScope || '',
        keywords: Array.isArray(section.keywords) ? section.keywords : [],
        mustMention: (sub.mustMention?.length ? sub.mustMention : section.mustMention) || [],
      });
    }
  }

  for (const unit of units) {
    // סדרתי בכוונה: embedText טוען מודל WASM יחיד, ובקשות מקבילות רק מתחרות עליו.
    const result = await findEvidenceForSection(unit, { ...opts, vectorMap, domainVector });
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
