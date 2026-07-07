// geminiGrounded.js — אחזור מקורות דרך Gemini עם כלי googleSearch.
//
// מקורות = groundingChunks בלבד (metadata של החיפוש). בנוסף — בשונה מהקוד הישן —
// groundingSupports נשמרים: לכל מקור מוצמדים anchors (קטעי טקסט + confidence) שמאפשרים
// עיגון פסקאות בהמשך. URLs של chunks הם לרוב קישורי redirect של Google
// (vertexaisearch...grounding-api-redirect) — הם נפתרים ל-URL האמיתי בשלב אימות ה-URL החי.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { analyzeQuery } from '../../articleSourceValidation';
import { dedupeSources, normalizeGeminiChunkSource } from '../candidates';

// flash ולא pro: חילוץ metadata של googleSearch לא דורש מודל כבד, ו-pro גרם ל-timeouts
// של 20s+ באחזור. איכות התוצאות נקבעת ע"י החיפוש, לא ע"י המודל.
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

const buildSearchPrompt = (query = '', requestedCount = 3) => {
  const queryMeta = analyzeQuery(query);
  return [
    `חפש ברשת ${requestedCount} תוצאות עדכניות ורלוונטיות לבקשה, אם קיימות מספיק תוצאות מקורקעות אמיתיות.`,
    queryMeta.expectsNewsArticle
      ? 'אם הבקשה מבקשת כתבות, ידיעות או חדשות, העדף כתבות חדשות ספציפיות מאתרי חדשות. אל תעדיף Wikipedia, דפי מוסדות, דפי בית, דפי קטגוריה או הודעות רשמיות אם קיימות כתבות עיתונאיות מתאימות.'
      : '',
    'הקישורים שיוצגו למשתמש יילקחו רק מ-metadata של כלי החיפוש, לא מהטקסט שלך.',
    'ענה במשפט קצר בלבד שמתאר את נושא החיפוש.',
    `הבקשה: ${query}`,
  ].filter(Boolean).join('\n');
};

// groundingSupports: [{ segment: {startIndex, endIndex, text}, groundingChunkIndices: [i], confidenceScores: [f] }]
// ממופים לכל chunk index → רשימת עוגנים.
const buildAnchorsByChunkIndex = (groundingMetadata = {}) => {
  const supports = Array.isArray(groundingMetadata?.groundingSupports) ? groundingMetadata.groundingSupports : [];
  const anchorsByIndex = new Map();
  supports.forEach((support) => {
    const text = String(support?.segment?.text || '').trim();
    if (!text) return;
    const startIndex = Number(support?.segment?.startIndex);
    const chunkIndices = Array.isArray(support?.groundingChunkIndices) ? support.groundingChunkIndices : [];
    const confidences = Array.isArray(support?.confidenceScores) ? support.confidenceScores : [];
    chunkIndices.forEach((chunkIndex, position) => {
      const safeIndex = Number(chunkIndex);
      if (!Number.isInteger(safeIndex) || safeIndex < 0) return;
      const anchor = {
        text: text.slice(0, 500),
        ...(Number.isFinite(startIndex) && startIndex >= 0 ? { startIndex } : {}),
        ...(Number.isFinite(Number(confidences[position])) ? { confidence: Number(confidences[position]) } : {}),
      };
      if (!anchorsByIndex.has(safeIndex)) anchorsByIndex.set(safeIndex, []);
      anchorsByIndex.get(safeIndex).push(anchor);
    });
  });
  return anchorsByIndex;
};

export const extractGeminiGroundedSources = (response = {}, limit = 5) => {
  const groundingMetadata = response?.candidates?.[0]?.groundingMetadata;
  const chunks = Array.isArray(groundingMetadata?.groundingChunks) ? groundingMetadata.groundingChunks : [];
  const anchorsByIndex = buildAnchorsByChunkIndex(groundingMetadata);
  const sources = chunks
    .map((chunk, index) => normalizeGeminiChunkSource(chunk?.web || chunk?.retrievedContext || chunk, anchorsByIndex.get(index) || []))
    .filter(Boolean);
  return dedupeSources(sources).slice(0, Math.max(1, Math.min(10, Number(limit) || 5)));
};

export const fetchGeminiGroundedSources = async ({ query = '', apiKey = '', model = '', limit = 5 } = {}) => {
  const safeQuery = String(query || '').trim();
  const safeApiKey = String(apiKey || '').trim();
  if (!safeQuery || !safeApiKey) return [];
  const genAI = new GoogleGenerativeAI(safeApiKey);
  const generativeModel = genAI.getGenerativeModel({
    model: String(model || '').trim() || DEFAULT_GEMINI_MODEL,
    tools: [{ googleSearch: {} }],
  });
  const result = await generativeModel.generateContent(buildSearchPrompt(safeQuery, Math.max(1, Math.min(10, Number(limit) || 5))));
  return extractGeminiGroundedSources(result.response, limit);
};
