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
  const queryVector = vectors.size ? await embedText(query, { kind: 'query' }) : null;
  const useVectors = Boolean(queryVector) && vectors.size > 0;

  // מבקשים יותר מ-k כדי שיישאר מרווח אחרי הסינון בסף.
  const candidates = await selectChunks(query, {
    k: Math.min(corpus.length, Math.max(k * 3, 12)),
    chunks: corpus,
    queryVector: useVectors ? queryVector : null,
    vectorById: useVectors ? vectors : null,
  });
  if (!candidates.length) return base;

  // selectChunks מחזיר chunks בלי ציונים, ולכן מדרגים כאן שוב — גם כדי לחשוף
  // score למשתמש וגם כי הסף חייב לפעול על ציון גולמי, לא על דירוג יחסי.
  let scored;
  if (useVectors) {
    scored = candidates.map((chunk) => {
      const vec = vectors.get(chunk.id);
      return { chunk, score: vec ? cosineSim(queryVector, vec) : 0, scale: 'cosine' };
    });
  } else {
    const terms = new Set(tokenizeForRetrieval(query));
    const raw = candidates.map((chunk) => scoreChunkRelevance(chunk, terms));
    const max = Math.max(...raw, 0);
    scored = candidates.map((chunk, i) => ({
      chunk,
      score: max > 0 ? raw[i] / max : 0,
      scale: 'lexical',
    }));
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.score || 0;
  const floor = useVectors
    ? Math.max(minCosine, best - RELATIVE_BAND)
    : Math.max(MIN_LEXICAL_SHARE, best - 0.35);

  const kept = scored.filter((s) => s.score >= floor).slice(0, k);

  return {
    sectionId: section?.id || null,
    mode: useVectors ? 'semantic' : 'lexical',
    gap: kept.length === 0,
    evidence: kept.map((s) => ({
      chunkId: s.chunk.id,
      materialId: s.chunk.materialId,
      sourceTitle: s.chunk.sourceTitle,
      pageHint: s.chunk.pageHint,
      sectionHint: s.chunk.sectionHint,
      text: s.chunk.text,
      score: Number(s.score.toFixed(3)),
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

  for (const section of sections) {
    // סדרתי בכוונה: embedText טוען מודל WASM יחיד, ובקשות מקבילות רק מתחרות עליו.
    const result = await findEvidenceForSection(section, { ...opts, vectorMap });
    bySection[section.id] = result;
    if (result.gap) gaps.push(section.id);
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
