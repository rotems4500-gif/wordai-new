import {
  chatWithActiveProvider,
  getPersonalStyleProfile,
  savePersonalStyleProfile,
  logAgentDebugEvent,
  getOrderedRoleAgents,
  getWorkspaceAutomation,
  syncPersistedAppSettings,
} from './aiService';

const HISTORY_KEY = 'wordai_saved_docs_history';
const HOME_INSTRUCTIONS_KEY = 'wordai_home_instructions';
const HOME_INSTRUCTION_FILE_TEXT_KEY = 'wordai_home_instruction_file_text';
const HOME_INSTRUCTION_FILE_NAME_KEY = 'wordai_home_instruction_file_name';
const PAST_DOCS_INDEX_URL = 'PAST-DOC/index.json';
const PROJECT_MATERIALS_INDEX_URL = 'project-materials/index.json';
const MAX_HISTORY_ITEMS = 24;
const AUTO_CONTEXT_SOURCE_LIMIT = 3;
const CONTEXT_MATCH_MIN_TERM_LENGTH = 3;
const MATERIAL_PREVIEW_MAX_LENGTH = 5000;
const MATERIAL_EXTRACTION_AUDIT_LIMIT = 180000;
const FEEDBACK_CONTEXT_TOTAL_LIMIT = 7200;
const FEEDBACK_CONTEXT_TOPIC_LIMIT = 320;
const FEEDBACK_CONTEXT_SUPPORTING_LIMIT = 1100;
const FEEDBACK_CONTEXT_MATERIALS_LIMIT = 1600;
const FEEDBACK_CONTEXT_HTML_MIN_LIMIT = 3600;
const FEEDBACK_CONTEXT_HTML_MAX_LIMIT = 5200;
const FEEDBACK_CONTEXT_HTML_GAP = '\n\n[... קוצר אמצע ה-HTML כדי לשמור גם את ההתחלה וגם את הסוף ...]\n\n';
const GENERATED_HTML_CONTINUATION_CONTEXT_LIMIT = 2200;
const GENERATED_HTML_CONTINUATION_PARTIAL_LIMIT = 3200;
const GENERATED_HTML_CONTINUATION_GAP = '\n\n[... קוצר אמצע ההקשר לצורך continuation ...]\n\n';
const TRUNCATED_RESPONSE_MARKER_PATTERN = /\[\.\.\.\s*(?:הושמט|קוצר)[^\]]*\]/i;
const HTML_TAG_TOKEN_PATTERN = /<!--[\s\S]*?-->|<\/?([a-z0-9-]+)\b[^>]*?>/gi;
const HTML_VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

const textLikeExtensions = new Set(['txt', 'md', 'markdown', 'html', 'htm', 'json', 'csv', 'tsv', 'rtf', 'xml', 'yml', 'yaml', 'log', 'svg', 'docx']);
const DESKTOP_EXTRACTION_EXTENSIONS = new Set(['pptx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'webp']);
const MATERIAL_PARTIAL_EXTRACTION_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'xls', 'xlsx']);
const HELPER_MATERIAL_ACCEPT_LIST = '.pdf,.doc,.docx,.txt,.md,.markdown,.html,.htm,.json,.csv,.tsv,.rtf,.xml,.yml,.yaml,.log,.svg';
const HELPER_MATERIAL_DESKTOP_ACCEPT_SUFFIX = ',.pptx,.png,.jpg,.jpeg,.webp,.xls,.xlsx';
const INSTRUCTION_FILE_ACCEPT_LIST = '.docx,.txt,.md,.markdown,.html,.htm,.json,.pdf,.csv,.tsv,.rtf,.xml,.yml,.yaml,.log,.svg';
const INSTRUCTION_FILE_DESKTOP_ACCEPT_SUFFIX = ',.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.webp';
const SYLLABUS_ACCEPT_LIST = '.docx,.txt,.md,.markdown,.html,.htm,.pdf,.csv,.tsv,.rtf,.xml';
const SYLLABUS_DESKTOP_ACCEPT_SUFFIX = ',.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.webp';
const ACADEMIC_REQUEST_SIGNAL_PATTERN = /(אקדמ|סמינר|סילבוס|ביבליוגרפ|apa|mla|ציטוט|references?|citation|journal|doi|peer[-\s]?reviewed|קורס|מרצה|מנחה|מטלה|סטודנט|assignment|syllabus|course)/i;
const HEBREW_STOP_WORDS = new Set(['של', 'על', 'עם', 'זה', 'זאת', 'היא', 'הוא', 'הם', 'הן', 'אני', 'אתה', 'את', 'אנחנו', 'גם', 'אבל', 'או', 'אם', 'כי', 'כל', 'לא', 'כן', 'כך', 'מאוד', 'עוד', 'רק', 'כדי', 'היה', 'היו', 'יש', 'אין', 'אל', 'מן', 'אלו', 'אלה']);
export const MATERIAL_UPLOAD_PRESETS = {
  general: { id: 'general', label: 'קובץ עזר כללי', category: 'general', templateId: 'blank', learningHint: 'השתמש בקובץ הזה כהקשר כללי להעדפות המשתמש.' },
  'cover-page': { id: 'cover-page', label: 'דף שער לדוגמה', category: 'office', templateId: 'blank', learningHint: 'למד איך המשתמש אוהב לעצב דפי שער, כותרות ראשיות, שדות וזיהוי מוסד.' },
  'template-example': { id: 'template-example', label: 'תבנית מסמך לדוגמה', category: 'office', templateId: 'report', learningHint: 'למד את המבנה, סדר הפרקים והעיצוב שהמשתמש מעדיף למסמכים.' },
  'writing-sample': { id: 'writing-sample', label: 'דוגמת כתיבה אישית', category: 'academic', templateId: 'academic', learningHint: 'למד את הטון, אוצר המילים והניסוח האישי של המשתמש.' },
  'course-material': { id: 'course-material', label: 'חומר קורס או רקע', category: 'academic', templateId: 'summary', learningHint: 'השתמש בקובץ כדי להבין את עולם התוכן, המושגים והדרישות האקדמיות.' },
};

export function getMaterialUploadMeta(kind = 'general') {
  return MATERIAL_UPLOAD_PRESETS[String(kind || 'general')] || MATERIAL_UPLOAD_PRESETS.general;
}

export function hasDesktopMaterialTextExtraction() {
  return Boolean(typeof window !== 'undefined' && window.desktopApp?.extractMaterialText);
}

export function getHelperMaterialAcceptList() {
  return hasDesktopMaterialTextExtraction()
    ? `${HELPER_MATERIAL_ACCEPT_LIST}${HELPER_MATERIAL_DESKTOP_ACCEPT_SUFFIX}`
    : HELPER_MATERIAL_ACCEPT_LIST;
}

export function getInstructionFileAcceptList() {
  return hasDesktopMaterialTextExtraction()
    ? `${INSTRUCTION_FILE_ACCEPT_LIST}${INSTRUCTION_FILE_DESKTOP_ACCEPT_SUFFIX}`
    : INSTRUCTION_FILE_ACCEPT_LIST;
}

export function getSyllabusFileAcceptList() {
  return hasDesktopMaterialTextExtraction()
    ? `${SYLLABUS_ACCEPT_LIST}${SYLLABUS_DESKTOP_ACCEPT_SUFFIX}`
    : SYLLABUS_ACCEPT_LIST;
}

function sanitizeMaterialPreviewText(value = '', maxLength = MATERIAL_PREVIEW_MAX_LENGTH) {
  const normalized = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized.slice(0, maxLength);
}

function normalizeMaterialPreviewStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return ['ready', 'empty', 'unsupported', 'error'].includes(normalized) ? normalized : '';
}

function isLikelyAcademicDocumentRequest({ prompt = '', instructions = '', templateId = 'blank' } = {}) {
  if (String(templateId || '').trim().toLowerCase() === 'academic') return true;
  return ACADEMIC_REQUEST_SIGNAL_PATTERN.test([prompt, instructions].filter(Boolean).join('\n'));
}

function normalizeMaterialExtractionStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return ['success', 'partial', 'failed', 'unsupported'].includes(normalized) ? normalized : '';
}

function getMaterialFileExtension(fileName = '') {
  const normalized = String(fileName || '').trim().toLowerCase();
  const lastDotIndex = normalized.lastIndexOf('.');
  return lastDotIndex === -1 ? normalized : normalized.slice(lastDotIndex + 1);
}

function resolveMaterialExtractionFailureMessage(errorCode = '') {
  const normalizedCode = String(errorCode || '').trim();
  if (!normalizedCode) return 'לא נמצא טקסט קריא בקובץ.';
  if (normalizedCode === 'unsupported-binary-file') return 'סוג הקובץ עדיין לא נתמך לחילוץ טקסט אוטומטי.';
  if (normalizedCode === 'empty-pdf-text') return 'לא הצלחתי לחלץ טקסט קריא מתוך ה-PDF.';
  if (normalizedCode === 'empty-docx-text') return 'לא הצלחתי לחלץ טקסט קריא מתוך ה-DOCX.';
  if (normalizedCode === 'empty-pptx-text' || normalizedCode === 'pptx-read-failed') return 'לא הצלחתי לחלץ את כל הטקסט מהמצגת.';
  if (normalizedCode === 'empty-spreadsheet-text' || normalizedCode === 'spreadsheet-read-failed') return 'לא הצלחתי לחלץ טקסט שימושי מהגיליון.';
  if (normalizedCode === 'empty-image-text' || normalizedCode === 'image-ocr-failed') return 'ה-OCR לא הצליח לחלץ טקסט קריא מהתמונה.';
  if (normalizedCode === 'empty-file-text') return 'לא נמצא טקסט קריא בתוך הקובץ.';
  return 'חילוץ הטקסט נכשל עבור הקובץ הזה.';
}

function resolveMaterialExtractionState({ fileName = '', text = '', error = '', extractionTruncated = false } = {}) {
  const normalizedText = sanitizeMaterialPreviewText(text, MATERIAL_EXTRACTION_AUDIT_LIMIT);
  const normalizedError = String(error || '').trim();
  const extension = getMaterialFileExtension(fileName);

  if (normalizedText) {
    if (MATERIAL_PARTIAL_EXTRACTION_EXTENSIONS.has(extension)) {
      return {
        extractionStatus: 'partial',
        extractionMessage: ['png', 'jpg', 'jpeg', 'webp'].includes(extension)
          ? 'חולץ טקסט בעזרת OCR, אבל אי אפשר לוודא שהוא מלא ב-100%.'
          : 'חולץ טקסט שימושי, אבל בגיליונות החילוץ הוא חלקי לצורך בטיחות וביצועים.',
      };
    }

    if (extractionTruncated) {
      return {
        extractionStatus: 'partial',
        extractionMessage: 'חולץ טקסט, אבל הקובץ גדול מדי ולכן נקרא רק חלק ממנו בשלב ההעלאה.',
      };
    }

    return {
      extractionStatus: 'success',
      extractionMessage: 'הטקסט חולץ במלואו והקובץ מוכן לשימוש.',
    };
  }

  if (normalizedError === 'unsupported-binary-file') {
    return {
      extractionStatus: 'unsupported',
      extractionMessage: resolveMaterialExtractionFailureMessage(normalizedError),
    };
  }

  return {
    extractionStatus: 'failed',
    extractionMessage: resolveMaterialExtractionFailureMessage(normalizedError),
  };
}

function buildMaterialPreviewMeta({ text = '', source = '', error = '', fileName = '', previewMaxLength = MATERIAL_PREVIEW_MAX_LENGTH } = {}) {
  const extractedText = sanitizeMaterialPreviewText(text, MATERIAL_EXTRACTION_AUDIT_LIMIT);
  const previewText = sanitizeMaterialPreviewText(extractedText, previewMaxLength);
  const cleanError = String(error || '').trim();
  const extractionTruncated = Boolean(extractedText) && extractedText.length >= MATERIAL_EXTRACTION_AUDIT_LIMIT;
  const previewStatus = previewText
    ? 'ready'
    : cleanError === 'unsupported-binary-file'
      ? 'unsupported'
      : cleanError
        ? 'error'
        : 'empty';
  const extractionState = resolveMaterialExtractionState({
    fileName,
    text: extractedText,
    error: cleanError,
    extractionTruncated,
  });

  return {
    previewText,
    previewChars: previewText.length,
    previewStatus,
    previewSource: previewText ? String(source || '').trim() : '',
    previewError: previewText ? '' : cleanError,
    extractedChars: extractedText.length,
    extractionStatus: extractionState.extractionStatus,
    extractionMessage: extractionState.extractionMessage,
    extractionTruncated,
  };
}

function getStoredMaterialPreviewText(material = {}, maxLength = MATERIAL_PREVIEW_MAX_LENGTH) {
  return sanitizeMaterialPreviewText(
    material?.previewText
      || material?.excerptText
      || material?.preview
      || material?.extractedText
      || '',
    maxLength,
  );
}

function cacheMaterialPreviewOnItem(material, { text = '', source = '' } = {}) {
  if (!material || typeof material !== 'object') {
    return sanitizeMaterialPreviewText(text, MATERIAL_PREVIEW_MAX_LENGTH);
  }

  const previewMeta = buildMaterialPreviewMeta({
    text,
    source,
    fileName: material?.file || material?.title || `${material?.id || 'material'}.${material?.type || ''}`,
  });
  Object.assign(material, previewMeta, {
    canPreviewText: canPreviewMaterialText(material?.type) || Boolean(previewMeta.previewText),
  });
  return previewMeta.previewText;
}

async function extractHelperMaterialPreview(file, maxLength = MATERIAL_PREVIEW_MAX_LENGTH) {
  try {
    const extractedText = await readInstructionFile(file, MATERIAL_EXTRACTION_AUDIT_LIMIT);
    return buildMaterialPreviewMeta({
      text: extractedText,
      source: 'readInstructionFile',
      fileName: file?.name,
      previewMaxLength: maxLength,
    });
  } catch (error) {
    return buildMaterialPreviewMeta({
      source: 'readInstructionFile',
      error: error?.message || 'material-preview-extraction-failed',
      fileName: file?.name,
      previewMaxLength: maxLength,
    });
  }
}

function canPreviewMaterialText(type = '') {
  const normalizedType = String(type || '').toLowerCase();
  return textLikeExtensions.has(normalizedType)
    || normalizedType === 'pdf'
    || (hasDesktopMaterialTextExtraction() && DESKTOP_EXTRACTION_EXTENSIONS.has(normalizedType));
}

async function extractDesktopMaterialTextFromArrayBuffer(buffer, fileName = '', maxLength = 6000) {
  if (!hasDesktopMaterialTextExtraction()) return '';
  const result = await window.desktopApp.extractMaterialText({
    dataBase64: arrayBufferToBase64(buffer),
    fileName,
    maxLength,
  });
  if (!result?.ok) {
    throw new Error(String(result?.error || 'material-extraction-failed').trim() || 'material-extraction-failed');
  }
  return String(result.text || '').trim();
}
const COMMON_CONNECTORS = ['לכן', 'בנוסף', 'עם זאת', 'עם-זאת', 'כמו כן', 'לעומת זאת', 'עם-כן', 'כלומר', 'למעשה', 'בהתאם לכך', 'בסופו של דבר'];
const MANUAL_HISTORY_SOURCES = new Set(['manual', 'opened-file', 'save-local', 'save-as']);
const DOCUMENT_RUN_PROVIDER_LABELS = {
  gemini: 'Gemini',
  claude: 'Claude',
  perplexity: 'Perplexity',
  openai: 'ChatGPT',
  groq: 'Groq',
  ollama: 'Ollama',
  custom: 'Custom API',
  scholar: 'Google Scholar',
};

function resolveRequestedProviderSelection({ selectedModel = '', selectedProviderId = '', selectedProviderModel = '' } = {}) {
  const providerId = String(selectedProviderId || selectedModel || '').trim();
  const providerModel = String(selectedProviderModel || '').trim();
  return { providerId, providerModel };
}

function mergeCountMaps(base = {}, incoming = {}) {
  const next = { ...base };
  Object.entries(incoming || {}).forEach(([key, count]) => {
    if (!key) return;
    next[key] = (next[key] || 0) + Number(count || 0);
  });
  return next;
}

function subtractCountMaps(base = {}, incoming = {}) {
  const next = { ...base };
  Object.entries(incoming || {}).forEach(([key, count]) => {
    if (!key || !next[key]) return;
    const updated = Number(next[key] || 0) - Number(count || 0);
    if (updated > 0) next[key] = updated;
    else delete next[key];
  });
  return next;
}

function topMapKeys(map = {}, limit = 8) {
  return Object.entries(map || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

function shouldUseDocumentWorkflowAutomation({ automation = {}, directStructureLock = false } = {}) {
  if (directStructureLock) return false;
  const activeWorkflowAgents = getOrderedRoleAgents(automation?.workflowMode);
  const hasActiveWorkflowAgents = Array.isArray(activeWorkflowAgents) && activeWorkflowAgents.length > 0;
  return automation?.enabled === true
    && automation?.autoDispatch !== false
    && hasActiveWorkflowAgents;
}

function getDocumentRunLabel({ automation = {}, selectedModel = '', selectedProviderId = '', selectedProviderModel = '', directStructureLock = false, shouldUseWorkflowAutomation = null } = {}) {
  const requestedSelection = resolveRequestedProviderSelection({ selectedModel, selectedProviderId, selectedProviderModel });
  const providerLabel = DOCUMENT_RUN_PROVIDER_LABELS[String(requestedSelection.providerId || '').trim().toLowerCase()] || String(requestedSelection.providerId || '').trim();
  const directLabel = requestedSelection.providerModel ? `${providerLabel || 'יצירה ישירה'} · ${requestedSelection.providerModel}` : (providerLabel || 'יצירה ישירה');
  const useWorkflowAutomation = typeof shouldUseWorkflowAutomation === 'boolean'
    ? shouldUseWorkflowAutomation
    : shouldUseDocumentWorkflowAutomation({ automation, directStructureLock });
  if (!useWorkflowAutomation) return directLabel;
  if (automation?.workflowMode === 'manager-auto' && automation?.autopilotEnabled !== false) return 'AUTOPILOT';
  return String(automation?.workspaceName || '').trim() || 'צוות העבודה';
}

function classifySentenceLength(avg = 0) {
  if (avg >= 18) return 'משפטים ארוכים ומפורטים';
  if (avg >= 11) return 'משפטים באורך בינוני';
  return 'משפטים קצרים וישירים';
}

function classifyParagraphLength(avg = 0) {
  if (avg >= 90) return 'פסקאות ארוכות ומעמיקות';
  if (avg >= 45) return 'פסקאות באורך בינוני';
  return 'פסקאות קצרות ותמציתיות';
}

function analyzeTextSample(text = '') {
  const clean = String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\r\t]+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const paragraphs = clean.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const sentences = clean.split(/[.!?…]+\s+/).map((item) => item.trim()).filter(Boolean);
  const words = clean.match(/[\u0590-\u05FFA-Za-z][\u0590-\u05FFA-Za-z'"׳״-]*/g) || [];

  const vocabularyCounts = {};
  const phraseCounts = {};
  const openerCounts = {};
  const connectorCounts = {};

  const filteredWords = words
    .map((word) => word.replace(/^["'׳״-]+|["'׳״-]+$/g, '').toLowerCase())
    .filter((word) => word.length >= 3 && !HEBREW_STOP_WORDS.has(word));

  filteredWords.forEach((word) => {
    vocabularyCounts[word] = (vocabularyCounts[word] || 0) + 1;
  });

  for (let i = 0; i < filteredWords.length - 1; i += 1) {
    const phrase = `${filteredWords[i]} ${filteredWords[i + 1]}`;
    if (phrase.length >= 7) phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
  }

  sentences.forEach((sentence) => {
    const sentenceWords = sentence.match(/[\u0590-\u05FFA-Za-z][\u0590-\u05FFA-Za-z'"׳״-]*/g) || [];
    if (sentenceWords.length) {
      const opener = sentenceWords.slice(0, Math.min(2, sentenceWords.length)).join(' ');
      if (opener.length >= 3) openerCounts[opener] = (openerCounts[opener] || 0) + 1;
    }
    COMMON_CONNECTORS.forEach((connector) => {
      if (sentence.includes(connector)) connectorCounts[connector] = (connectorCounts[connector] || 0) + 1;
    });
  });

  const avgSentenceWords = sentences.length
    ? Math.round((words.length / sentences.length) * 10) / 10
    : 0;

  const avgParagraphWords = paragraphs.length
    ? Math.round((words.length / paragraphs.length) * 10) / 10
    : 0;

  return {
    vocabularyCounts,
    phraseCounts,
    openerCounts,
    connectorCounts,
    avgSentenceWords,
    avgParagraphWords,
    sentencesCount: sentences.length,
    paragraphCount: paragraphs.length,
    wordCount: words.length,
  };
}

export function learnFromDocumentDraft({ html = '', title = 'מסמך פעיל', minChars = 280 } = {}) {
  const profile = getPersonalStyleProfile();
  if (profile.learningConsent === false) return { updated: false, reason: 'disabled' };

  const cleanText = String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanText.length < minChars) return { updated: false, reason: 'too-short' };

  const stats = analyzeTextSample(cleanText);
  if (stats.wordCount < 80 || stats.sentencesCount < 3) return { updated: false, reason: 'insufficient-sample' };

  const signature = [
    String(title || '').trim(),
    stats.wordCount,
    stats.avgSentenceWords,
    stats.avgParagraphWords,
    topMapKeys(stats.openerCounts, 3).join('|'),
    topMapKeys(stats.connectorCounts, 3).join('|'),
  ].join('::');

  if (signature === profile.lastAutoLearnedSignature) return { updated: false, reason: 'duplicate' };

  const baseVocabularyCounts = subtractCountMaps(profile.learnedVocabularyCounts || {}, profile.autoLearnedVocabularyCounts || {});
  const basePhraseCounts = subtractCountMaps(profile.learnedPhraseCounts || {}, profile.autoLearnedPhraseCounts || {});
  const nextVocabularyCounts = mergeCountMaps(baseVocabularyCounts, stats.vocabularyCounts);
  const nextPhraseCounts = mergeCountMaps(basePhraseCounts, stats.phraseCounts);
  const nextSentenceLength = classifySentenceLength(stats.avgSentenceWords);
  const nextParagraphLength = classifyParagraphLength(stats.avgParagraphWords);
  const toneDescriptors = Array.from(new Set([
    ...(profile.toneDescriptors || []),
    nextSentenceLength,
    nextParagraphLength,
    Object.keys(stats.connectorCounts || {}).length >= 3 ? 'שימוש עשיר במילות קישור' : 'ניסוח ישיר יחסית',
  ].filter(Boolean))).slice(0, 8);

  const learnedNotes = Array.from(new Set([
    ...(profile.learnedNotes || []),
    `עודכן אוטומטית מהמסמך הפעיל: ${nextSentenceLength}, ${nextParagraphLength}.`,
  ])).slice(-8);

  const nextProfile = {
    ...profile,
    learnedVocabularyCounts: nextVocabularyCounts,
    learnedPhraseCounts: nextPhraseCounts,
    learnedVocabulary: topMapKeys(nextVocabularyCounts, 20),
    learnedPhrases: topMapKeys(nextPhraseCounts, 12),
    preferredConnectors: Array.from(new Set([...(profile.preferredConnectors || []), ...topMapKeys(stats.connectorCounts, 8)])).slice(0, 8),
    preferredSentenceOpeners: Array.from(new Set([...(profile.preferredSentenceOpeners || []), ...topMapKeys(stats.openerCounts, 8)])).slice(0, 8),
    toneDescriptors,
    learnedSentencePatterns: toneDescriptors,
    sentenceLengthPreference: profile.sentenceLengthPreference || nextSentenceLength,
    paragraphLengthPreference: profile.paragraphLengthPreference || nextParagraphLength,
    styleFingerprint: {
      ...(profile.styleFingerprint || {}),
      avgSentenceWords: stats.avgSentenceWords,
      avgParagraphWords: stats.avgParagraphWords,
      sentenceCount: stats.sentencesCount,
      paragraphCount: stats.paragraphCount,
    },
    autoLearnedFromEditorAt: new Date().toISOString(),
    lastAutoLearnedSignature: signature,
    autoLearnedVocabularyCounts: stats.vocabularyCounts,
    autoLearnedPhraseCounts: stats.phraseCounts,
    learnedNotes,
  };

  savePersonalStyleProfile(nextProfile);
  try {
    window.dispatchEvent(new CustomEvent('wordai-personal-style-updated', { detail: { source: 'auto-learning' } }));
  } catch {}
  return { updated: true, reason: 'learned', profile: nextProfile };
}

const TEMPLATE_GUIDES = {
  blank: 'צור מסמך חופשי, ברור ונקי.',
  academic: 'ענה על המטלה האקדמית בדיוק לפי הוראות המטלה והנחיות המשתמש, בלי לכפות מבנה קבוע שלא התבקש.',
  legal: 'ענה על המטלה המשפטית או הפורמלית לפי הוראות המטלה והחומר הקיים, בלי להמציא פרטים חסרים.',
  report: 'ענה על המטלה בפורמט של דוח רק לפי המטרה וההוראות שהתבקשו, עם כותרות רק כשיש להן הצדקה ברורה, ואל תוסיף מבוא, סיכום או פרקים קבועים שלא התבקשו.',
  summary: 'ענה על המטלה בפורמט של סיכום רק לפי ההיקף והמבנה שהתבקשו, ואל תמציא תוכן חסר.',
  office: 'ענה על המטלה כמסמך מקצועי למשרד או לארגון, ענייני וברור, ורק לפי המבנה שהתבקש.',
  letter: 'צור מכתב רשמי לפי פרטי הבקשה, בלי להשלים נתונים שלא נמסרו ובלי להוסיף חלקים שלא התבקשו.',
  proposal: 'ענה על המטלה בפורמט של הצעה רק לפי מטרת המשתמש וההוראות שניתנו, בלי לכפות סעיפים קבועים אם לא התבקשו.',
};

const WORKSPACE_TEMPLATE_LIBRARY = [
  { id: 'blank', title: 'מסמך ריק', subtitle: '' },
  { id: 'academic', title: 'עבודה אקדמית', subtitle: 'מבוסס על מטלות ועבודות קודמות' },
  { id: 'legal', title: 'מסמך משפטי', subtitle: 'מבוסס על מסמכים פורמליים קודמים' },
  { id: 'report', title: 'דוח מסודר', subtitle: 'מבנה ממצאים והמלצות' },
  { id: 'summary', title: 'סיכום נושא', subtitle: 'לנקודות מפתח ותמצות' },
  { id: 'office', title: 'מסמך משרדי', subtitle: 'פנייה, מזכר או מסמך עבודה' },
  { id: 'proposal', title: 'הצעה', subtitle: 'מטרות, מהלך ותוצרים' },
  { id: 'letter', title: 'מכתב רשמי', subtitle: 'פתיחה, גוף וסיום' },
];

function readJsonFromStorage(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeName(name = '') {
  return String(name || '').trim().toLowerCase();
}

function resolveAppUrl(resourcePath = '') {
  const cleanPath = String(resourcePath || '').replace(/^\/+/, '');
  try {
    return new URL(cleanPath, window.location.href).toString();
  } catch {
    return `./${cleanPath}`;
  }
}

export function classifyDocName(name = '') {
  const value = normalizeName(name);
  if (!value) return { category: 'general', label: 'כללי', templateId: 'blank' };

  if (/(פרקליטות|משפט|חוק|עתירה|תביעה|כתב|פסק|הסכם)/i.test(value)) {
    return { category: 'legal', label: 'משפטי', templateId: 'legal' };
  }
  if (/(עבודה|מטלה|סמינר|מחקר|אקדמ|אוריינות|יסודות|תקשורת|הונגריה|קוסובו)/i.test(value)) {
    return { category: 'academic', label: 'אקדמי', templateId: 'academic' };
  }
  if (/(סיכום|תמצית|נקודות|סיכומי)/i.test(value)) {
    return { category: 'summary', label: 'סיכום', templateId: 'summary' };
  }
  if (/(משרד|דו"ח|דוח|מזכר|memo|report)/i.test(value)) {
    return { category: 'office', label: 'משרדי', templateId: 'office' };
  }
  if (/(מכתב|פניה|פנייה|letter)/i.test(value)) {
    return { category: 'letter', label: 'מכתב', templateId: 'letter' };
  }
  return { category: 'general', label: 'כללי', templateId: 'blank' };
}

async function safeFetchJson(url, fallback) {
  try {
    const response = await fetch(resolveAppUrl(url), { cache: 'no-store' });
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

export async function loadPastDocsIndex() {
  const payload = await safeFetchJson(PAST_DOCS_INDEX_URL, { files: [] });
  const files = Array.isArray(payload?.files) ? payload.files : [];
  return files.map((file) => ({
    ...file,
    ...classifyDocName(file.name),
    source: 'past-docs',
  }));
}

export async function getWorkspaceTemplateCards() {
  const [pastDocs, history] = await Promise.all([loadPastDocsIndex(), Promise.resolve(getSavedDocsHistory())]);
  const combined = [...pastDocs, ...history];

  const cards = WORKSPACE_TEMPLATE_LIBRARY.map((card) => {
    const matches = combined.filter((item) => {
      if (card.id === 'blank') return (item.templateId || 'blank') === 'blank';
      if (card.id === 'report') return ['office', 'report'].includes(item.templateId) || item.category === 'office';
      if (card.id === 'proposal') return ['proposal', 'office'].includes(item.templateId) || item.category === 'office';
      return item.templateId === card.id || item.category === card.id;
    });

    return {
      ...card,
      count: matches.length,
      example: matches[0]?.title || matches[0]?.name || '',
      examples: matches.slice(0, 3).map((item) => item.title || item.name).filter(Boolean),
      subtitle: matches.length ? card.subtitle : '',
    };
  });

  const [blankCard, ...rest] = cards;
  return [blankCard, ...rest.sort((a, b) => b.count - a.count)];
}

export async function loadProjectMaterials() {
  const [bundledPayload, localPayload] = await Promise.all([
    safeFetchJson(PROJECT_MATERIALS_INDEX_URL, []),
    window.desktopApp?.listLocalMaterials ? window.desktopApp.listLocalMaterials().catch(() => []) : Promise.resolve([]),
  ]);

  const bundledList = Array.isArray(bundledPayload) ? bundledPayload : [];
  const localList = Array.isArray(localPayload) ? localPayload : [];
  const mergedList = [...bundledList, ...localList].filter(Boolean);
  const seen = new Set();

  return mergedList
    .filter((item) => {
      const key = String(item.id || item.file || item.title || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item, index) => {
      const name = item.title || item.file || `material-${index + 1}`;
      const type = String(item.type || '').toLowerCase();
      const inferred = classifyDocName(name);
      const previewText = getStoredMaterialPreviewText(item, MATERIAL_PREVIEW_MAX_LENGTH);
      const extractedCharsRaw = Number(item?.extractedChars);
      const extractedChars = Number.isFinite(extractedCharsRaw) && extractedCharsRaw >= 0
        ? extractedCharsRaw
        : previewText.length;
      const rawPreviewChars = Number(item?.previewChars);
      const previewChars = Number.isFinite(rawPreviewChars) && rawPreviewChars >= 0
        ? rawPreviewChars
        : previewText.length;
      const extractedState = resolveMaterialExtractionState({
        fileName: item.file || name,
        text: previewText,
        error: item.previewError || '',
        extractionTruncated: item?.extractionTruncated === true,
      });
      return {
        id: item.id || item.file || `material-${index + 1}`,
        title: name,
        file: item.file || '',
        type,
        source: item.source || 'materials',
        uploadKind: item.uploadKind || 'general',
        label: item.label || inferred.label,
        category: item.category || inferred.category,
        templateId: item.templateId || inferred.templateId,
        learningHint: item.learningHint || '',
        previewText,
        previewChars,
        previewStatus: normalizeMaterialPreviewStatus(item.previewStatus || (previewText ? 'ready' : '')),
        previewSource: String(item.previewSource || '').trim(),
        previewError: String(item.previewError || '').trim(),
        extractedChars,
        extractionStatus: normalizeMaterialExtractionStatus(item.extractionStatus) || extractedState.extractionStatus,
        extractionMessage: String(item.extractionMessage || '').trim() || extractedState.extractionMessage,
        extractionTruncated: item?.extractionTruncated === true,
        canPreviewText: canPreviewMaterialText(type) || Boolean(previewText),
      };
    });
}

export function getMaterialExtractionStatusInfo(material = {}) {
  const previewText = getStoredMaterialPreviewText(material, MATERIAL_PREVIEW_MAX_LENGTH);
  const extractedCharsRaw = Number(material?.extractedChars);
  const extractedChars = Number.isFinite(extractedCharsRaw) && extractedCharsRaw >= 0
    ? extractedCharsRaw
    : previewText.length;
  const fallbackState = resolveMaterialExtractionState({
    fileName: material?.file || material?.title || `${material?.id || 'material'}.${material?.type || ''}`,
    text: previewText,
    error: material?.previewError || '',
    extractionTruncated: material?.extractionTruncated === true,
  });
  const extractionStatus = normalizeMaterialExtractionStatus(material?.extractionStatus) || fallbackState.extractionStatus;
  const extractionMessage = String(material?.extractionMessage || '').trim() || fallbackState.extractionMessage;

  if (extractionStatus === 'success') {
    return {
      status: 'success',
      tone: 'success',
      label: 'נקרא במלואו',
      message: extractedChars > 0
        ? `${extractionMessage} חולצו ${extractedChars.toLocaleString('he-IL')} תווים.`
        : extractionMessage,
    };
  }

  if (extractionStatus === 'unsupported') {
    return {
      status: 'unsupported',
      tone: 'error',
      label: 'לא נתמך',
      message: extractionMessage,
    };
  }

  if (extractionStatus === 'partial') {
    return {
      status: 'partial',
      tone: 'error',
      label: 'נקרא חלקית',
      message: extractionMessage,
    };
  }

  return {
    status: 'failed',
    tone: 'error',
    label: 'חילוץ נכשל',
    message: extractionMessage,
  };
}

export function getSavedDocsHistory() {
  return readJsonFromStorage(HISTORY_KEY, []);
}

export function saveDocumentHistory({ title = '', content = '', templateId = 'blank', source = 'manual' }) {
  const plainText = String(content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!plainText) return [];

  const current = getSavedDocsHistory();
  const entryTitle = String(title || plainText.slice(0, 60) || 'מסמך חדש').trim();
  const entry = {
    id: `${Date.now()}`,
    title: entryTitle,
    summary: plainText.slice(0, 400),
    templateId,
    source,
    category: classifyDocName(entryTitle).category,
    savedAt: new Date().toISOString(),
  };

  const next = [entry, ...current].slice(0, MAX_HISTORY_ITEMS);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    syncPersistedAppSettings();
  } catch {
    return current;
  }
  return next;
}

export function getHomeInstructions() {
  return String(localStorage.getItem(HOME_INSTRUCTIONS_KEY) || '');
}

export function saveHomeInstructions(value = '') {
  const clean = String(value || '').trim();
  localStorage.setItem(HOME_INSTRUCTIONS_KEY, clean);
  syncPersistedAppSettings();
}

export function getHomeInstructionFileText() {
  return String(localStorage.getItem(HOME_INSTRUCTION_FILE_TEXT_KEY) || '');
}

export function saveHomeInstructionFileText(value = '') {
  const clean = String(value || '').trim();
  if (!clean) {
    localStorage.removeItem(HOME_INSTRUCTION_FILE_TEXT_KEY);
  } else {
    localStorage.setItem(HOME_INSTRUCTION_FILE_TEXT_KEY, clean);
  }
}

export function getHomeInstructionFileName() {
  return String(localStorage.getItem(HOME_INSTRUCTION_FILE_NAME_KEY) || '');
}

export function saveHomeInstructionFileName(value = '') {
  const clean = String(value || '').trim();
  if (!clean) {
    localStorage.removeItem(HOME_INSTRUCTION_FILE_NAME_KEY);
  } else {
    localStorage.setItem(HOME_INSTRUCTION_FILE_NAME_KEY, clean);
  }
}

function dominantCategoryFromItems(items = []) {
  const counts = items.reduce((acc, item) => {
    const key = item.category || 'general';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'general';
}

export async function syncLearnedStyleFromWorkspace() {
  const [pastDocs, history, projectMaterials] = await Promise.all([
    loadPastDocsIndex(),
    Promise.resolve(getSavedDocsHistory()),
    loadProjectMaterials(),
  ]);

  const learnableHistory = history.filter((item) => MANUAL_HISTORY_SOURCES.has(String(item?.source || 'manual')));
  const combined = [...pastDocs, ...learnableHistory, ...projectMaterials];
  const dominantCategory = dominantCategoryFromItems(combined);
  const profile = getPersonalStyleProfile();
  const alreadyScanned = new Set(profile.scannedSourceIds || []);

  const sourceItems = [
    ...learnableHistory.map((item) => ({
      id: `history:${item.id}`,
      title: item.title || 'טיוטה שמורה',
      text: `${item.title || ''}\n${item.summary || ''}`.trim(),
    })),
    ...projectMaterials.map((item) => ({
      id: `material:${item.id}`,
      title: item.title || item.file || 'material',
      material: item,
    })),
  ];

  const preparedSources = [];
  for (const source of sourceItems) {
    if (source.material) {
      const preview = await loadMaterialPreview(source.material);
      preparedSources.push({
        id: source.id,
        title: source.title,
        text: preview || [
          source.title,
          source.material.label || '',
          source.material.learningHint || '',
        ].filter(Boolean).join('\n'),
      });
      continue;
    }
    preparedSources.push(source);
  }

  if (profile.learningConsent === false) {
    const nextProfile = {
      ...profile,
      learnedNotes: Array.from(new Set([
        ...(profile.learnedNotes || []),
        'הלמידה האוטומטית כבויה כרגע, ולכן המערכת נשענת רק על ההעדפות שבחרת ידנית.',
      ])).slice(0, 8),
      scanStats: {
        ...(profile.scanStats || {}),
        totalKnown: preparedSources.length,
        totalScanned: profile.scanStats?.totalScanned || 0,
        newlyScanned: 0,
        pendingCount: preparedSources.length,
        lastScanAt: new Date().toISOString(),
      },
    };
    savePersonalStyleProfile(nextProfile);
    return { pastDocs, history, projectMaterials, dominantCategory, notes: nextProfile.learnedNotes, scanStats: nextProfile.scanStats, profile: nextProfile };
  }

  const newlyDiscoveredSources = preparedSources.filter((source) => !alreadyScanned.has(source.id));
  let vocabularyCounts = { ...(profile.learnedVocabularyCounts || {}) };
  let phraseCounts = { ...(profile.learnedPhraseCounts || {}) };

  newlyDiscoveredSources.forEach((source) => {
    const stats = analyzeTextSample(source.text);
    vocabularyCounts = mergeCountMaps(vocabularyCounts, stats.vocabularyCounts);
    phraseCounts = mergeCountMaps(phraseCounts, stats.phraseCounts);
  });

  const overallStats = analyzeTextSample(preparedSources.map((source) => source.text).join('\n\n'));
  const toneDescriptors = Array.from(new Set([
    ...(profile.toneDescriptors || []),
    classifySentenceLength(overallStats.avgSentenceWords),
    classifyParagraphLength(overallStats.avgParagraphWords),
    Object.keys(overallStats.connectorCounts || {}).length >= 3 ? 'שימוש עשיר במילות קישור' : 'ניסוח ישיר יחסית',
  ].filter(Boolean)));

  const notes = [];
  if (dominantCategory === 'academic') notes.push('רוב המסמכים הקודמים הם אקדמיים: השתמש בשפה מדויקת ובטיעון מסודר, אך אל תוסיף מבנה פרקים קבוע אלא אם התבקשת.');
  if (combined.some((item) => item.category === 'legal')) notes.push('נמצאו גם מסמכים משפטיים או פורמליים, ולכן בפניות רשמיות יש להעדיף ניסוח זהיר, מדויק ומאופק.');
  if (combined.some((item) => item.category === 'office')) notes.push('נמצאו גם מסמכים משרדיים, לכן כשנושא העבודה מקצועי יש להעדיף תכליתיות, סעיפים קצרים והמלצות מעשיות.');
  if (combined.some((item) => item.category === 'summary')) notes.push('נמצאו מסמכי סיכום, ולכן אפשר להעדיף ניסוח תמציתי ומדויק כשזה מתאים לבקשה, בלי לכפות נקודות מפתח או סיכומי ביניים אם לא התבקשו.');
  if (topMapKeys(overallStats.connectorCounts, 4).length) notes.push(`מילות קישור בולטות: ${topMapKeys(overallStats.connectorCounts, 4).join(', ')}.`);
  if (topMapKeys(overallStats.openerCounts, 4).length) notes.push(`פתיחות משפט אופייניות: ${topMapKeys(overallStats.openerCounts, 4).join(', ')}.`);
  if (newlyDiscoveredSources.length) notes.push(`נסרקו ${newlyDiscoveredSources.length} מקורות חדשים ונוספו מאפייני סגנון.`);

  const nextScannedIds = Array.from(new Set([...(profile.scannedSourceIds || []), ...newlyDiscoveredSources.map((source) => source.id)]));
  const nextProfile = {
    ...profile,
    academic_level: dominantCategory === 'academic' ? (profile.academic_level || 'undergraduate') : profile.academic_level,
    learnedNotes: Array.from(new Set([...(profile.learnedNotes || []), ...notes])).slice(-8),
    examples: Array.from(new Set([...(profile.examples || []), ...combined.slice(0, 8).map((item) => item.title || item.name).filter(Boolean)])).slice(0, 8),
    learnedVocabularyCounts: vocabularyCounts,
    learnedPhraseCounts: phraseCounts,
    learnedVocabulary: topMapKeys(vocabularyCounts, 20),
    learnedPhrases: topMapKeys(phraseCounts, 12),
    learnedSentencePatterns: Array.from(new Set([...(profile.learnedSentencePatterns || []), ...toneDescriptors])).slice(0, 8),
    preferredConnectors: Array.from(new Set([...(profile.preferredConnectors || []), ...topMapKeys(overallStats.connectorCounts, 8)])).slice(0, 8),
    preferredSentenceOpeners: Array.from(new Set([...(profile.preferredSentenceOpeners || []), ...topMapKeys(overallStats.openerCounts, 8)])).slice(0, 8),
    toneDescriptors,
    sentenceLengthPreference: profile.sentenceLengthPreference || classifySentenceLength(overallStats.avgSentenceWords),
    paragraphLengthPreference: profile.paragraphLengthPreference || classifyParagraphLength(overallStats.avgParagraphWords),
    styleFingerprint: {
      ...(profile.styleFingerprint || {}),
      avgSentenceWords: overallStats.avgSentenceWords,
      avgParagraphWords: overallStats.avgParagraphWords,
      sentenceCount: overallStats.sentencesCount,
      paragraphCount: overallStats.paragraphCount,
    },
    scannedSourceIds: nextScannedIds,
    scanStats: {
      totalKnown: preparedSources.length,
      totalScanned: nextScannedIds.length,
      newlyScanned: newlyDiscoveredSources.length,
      pendingCount: Math.max(0, preparedSources.length - nextScannedIds.length),
      lastScanAt: new Date().toISOString(),
    },
  };

  savePersonalStyleProfile(nextProfile);
  try {
    window.dispatchEvent(new CustomEvent('wordai-personal-style-updated', { detail: { source: 'workspace-sync' } }));
  } catch {}
  return { pastDocs, history, projectMaterials, dominantCategory, notes, scanStats: nextProfile.scanStats, profile: nextProfile };
}

async function extractPdfTextFromBuffer(buffer) {
  const pdfjs = window?.pdfjsLib;
  if (!pdfjs?.getDocument) return '';
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const maxLength = MATERIAL_EXTRACTION_AUDIT_LIMIT;
  const pages = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const pageText = (content.items || []).map((item) => item.str || '').join(' ');
    if (pageText.trim()) pages.push(pageText.trim());
    if (pages.join('\n').length >= maxLength) break;
  }
  return pages.join('\n').slice(0, maxLength);
}

async function extractDocxTextFromBuffer(buffer) {
  const mammothModule = await import('mammoth/mammoth.browser');
  const extractRawText = mammothModule?.extractRawText || mammothModule?.default?.extractRawText;
  if (typeof extractRawText !== 'function') throw new Error('docx-reader-unavailable');

  const result = await extractRawText({ arrayBuffer: buffer });
  return String(result?.value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeTextBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  const tryDecode = (encoding) => {
    try {
      return new TextDecoder(encoding, { fatal: false }).decode(bytes);
    } catch {
      return '';
    }
  };

  const utf8Text = tryDecode('utf-8');
  const replacementCount = (utf8Text.match(/�/g) || []).length;
  const badRatio = utf8Text ? replacementCount / utf8Text.length : 0;

  if (badRatio > 0.02 || /PK\u0003\u0004/.test(utf8Text)) {
    const win1255 = tryDecode('windows-1255');
    if (win1255 && (win1255.match(/[א-ת]/g) || []).length >= (utf8Text.match(/[א-ת]/g) || []).length) {
      return win1255;
    }
    const iso88598 = tryDecode('iso-8859-8');
    if (iso88598 && (iso88598.match(/[א-ת]/g) || []).length > 0) {
      return iso88598;
    }
  }

  return utf8Text;
}

export async function readInstructionFile(file, maxLength = 6000) {
  if (!file) return '';
  const resolvedMaxLength = Number.isFinite(maxLength) && maxLength > 0 ? maxLength : 6000;
  const ext = String(file.name || '').toLowerCase().split('.').pop();
  const unsupportedBinary = new Set(['doc', 'ppt', 'zip', 'rar', '7z']);
  if (unsupportedBinary.has(ext)) {
    throw new Error('unsupported-binary-file');
  }

  const buffer = await file.arrayBuffer();

  if (DESKTOP_EXTRACTION_EXTENSIONS.has(ext)) {
    if (!hasDesktopMaterialTextExtraction()) throw new Error('unsupported-binary-file');
    return extractDesktopMaterialTextFromArrayBuffer(buffer, file.name, resolvedMaxLength);
  }

  if (ext === 'pdf') {
    const pdfText = await extractPdfTextFromBuffer(buffer);
    if (!pdfText.trim()) throw new Error('empty-pdf-text');
    return pdfText.trim().slice(0, resolvedMaxLength);
  }

  if (ext === 'docx') {
    const docxText = await extractDocxTextFromBuffer(buffer);
    if (!docxText.trim()) throw new Error('empty-docx-text');
    return docxText.trim().slice(0, resolvedMaxLength);
  }

  const rawText = decodeTextBuffer(buffer);
  if (ext === 'html' || ext === 'htm') {
    const parsed = new DOMParser().parseFromString(rawText, 'text/html');
    parsed.querySelectorAll('script, style, noscript, template').forEach((node) => node.remove());
    const bodyText = String(parsed.body?.textContent || parsed.body?.innerText || '').trim();
    const fallbackText = String(parsed.documentElement?.textContent || parsed.documentElement?.innerText || '').trim();
    return (bodyText || fallbackText).slice(0, resolvedMaxLength);
  }

  return String(rawText || '').trim().slice(0, resolvedMaxLength);
}

async function loadMaterialPreview(material) {
  const cachedPreview = getStoredMaterialPreviewText(material, MATERIAL_PREVIEW_MAX_LENGTH);
  if (cachedPreview) return cachedPreview;

  const previewStatus = normalizeMaterialPreviewStatus(material?.previewStatus);
  const canPreviewNow = canPreviewMaterialText(material?.type);
  const hasPreviewPath = Boolean(material?.canPreviewText || canPreviewNow);
  if (previewStatus === 'unsupported' && !canPreviewNow) return '';
  if (!material?.file || !hasPreviewPath) return '';

  const storePreview = (text, source) => cacheMaterialPreviewOnItem(material, { text, source });

  try {
    if (material.source === 'materials-local' && window.desktopApp?.readLocalMaterial) {
      const payload = await window.desktopApp.readLocalMaterial(material.file);
      if (!payload?.ok || !payload?.dataBase64) return '';
      if (payload?.extractedText) {
        return storePreview(payload.extractedText, 'desktop-readLocalMaterial');
      }
      const binary = atob(payload.dataBase64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const buffer = bytes.buffer;

      if (material.type === 'pdf') {
        return storePreview(await extractPdfTextFromBuffer(buffer), 'extractPdfTextFromBuffer');
      }

      if (material.type === 'docx') {
        return storePreview(await extractDocxTextFromBuffer(buffer), 'extractDocxTextFromBuffer');
      }

      if (DESKTOP_EXTRACTION_EXTENSIONS.has(material.type) && hasDesktopMaterialTextExtraction()) {
        return storePreview(
          await extractDesktopMaterialTextFromArrayBuffer(buffer, material.file || material.title || `material.${material.type}`, MATERIAL_PREVIEW_MAX_LENGTH),
          'extractDesktopMaterialTextFromArrayBuffer',
        );
      }

      const text = decodeTextBuffer(buffer);
      return storePreview(text, 'decodeTextBuffer');
    }

    const response = await fetch(resolveAppUrl(`project-materials/${encodeURIComponent(material.file)}`), { cache: 'no-store' });
    if (!response.ok) return '';

    const buffer = await response.arrayBuffer();

    if (material.type === 'pdf') {
      return storePreview(await extractPdfTextFromBuffer(buffer), 'extractPdfTextFromBuffer');
    }

    if (material.type === 'docx') {
      return storePreview(await extractDocxTextFromBuffer(buffer), 'extractDocxTextFromBuffer');
    }

    if (DESKTOP_EXTRACTION_EXTENSIONS.has(material.type) && hasDesktopMaterialTextExtraction()) {
      return storePreview(
        await extractDesktopMaterialTextFromArrayBuffer(buffer, material.file || material.title || `material.${material.type}`, MATERIAL_PREVIEW_MAX_LENGTH),
        'extractDesktopMaterialTextFromArrayBuffer',
      );
    }
    const text = decodeTextBuffer(buffer);
    return storePreview(text, 'decodeTextBuffer');
  } catch {
    return '';
  }
}

async function buildSelectedMaterialsContext(selectedMaterials = []) {
  if (!Array.isArray(selectedMaterials) || !selectedMaterials.length) return '';

  const materialPreviews = await Promise.all(selectedMaterials.map(async (item) => ({
    ...item,
    preview: await loadMaterialPreview(item),
  })));

  return materialPreviews.map((item) => {
    const preview = item.preview ? `\nתוכן עזר:\n${item.preview}` : '';
    return `- ${item.title} (${item.label || 'כללי'})${preview}`;
  }).join('\n');
}

function extractContextMatchTerms(text = '') {
  const terms = String(text || '').toLowerCase().match(/[\u0590-\u05ffa-z0-9][\u0590-\u05ffa-z0-9'"׳״-]*/g) || [];
  return Array.from(new Set(
    terms
      .map((term) => term.replace(/^["'׳״-]+|["'׳״-]+$/g, ''))
      .filter((term) => term.length >= CONTEXT_MATCH_MIN_TERM_LENGTH && !HEBREW_STOP_WORDS.has(term)),
  ));
}

function countContextTermOverlap(text = '', requestTermsSet = new Set()) {
  if (!requestTermsSet.size) return 0;
  return extractContextMatchTerms(text).reduce((count, term) => count + (requestTermsSet.has(term) ? 1 : 0), 0);
}

function scoreAutoContextCandidate({ title = '', summary = '', label = '', learningHint = '' } = {}, requestTermsSet = new Set()) {
  if (!requestTermsSet.size) return 0;
  const titleOverlap = countContextTermOverlap(title, requestTermsSet);
  const labelOverlap = countContextTermOverlap(label, requestTermsSet);
  const hintOverlap = countContextTermOverlap(learningHint, requestTermsSet);
  const summaryOverlap = countContextTermOverlap(summary, requestTermsSet);
  return (titleOverlap * 4) + (labelOverlap * 3) + (hintOverlap * 2) + summaryOverlap;
}

function formatAutoContextEntry({ title = '', label = '', preview = '' } = {}) {
  const cleanTitle = String(title || '').trim() || 'חומר עזר';
  const cleanLabel = String(label || '').trim() || 'כללי';
  const cleanPreview = String(preview || '').trim();
  return `- ${cleanTitle} (${cleanLabel})${cleanPreview ? `\nתוכן עזר:\n${cleanPreview}` : ''}`;
}

async function buildAutoSelectedMaterialsContext(requestText = '') {
  const requestTerms = extractContextMatchTerms(requestText);
  if (!requestTerms.length) return '';

  try {
    const requestTermsSet = new Set(requestTerms);
    const [history, projectMaterials] = await Promise.all([
      Promise.resolve(getSavedDocsHistory()),
      loadProjectMaterials(),
    ]);

    const historyCandidates = (Array.isArray(history) ? history : []).map((item, index) => {
      const score = scoreAutoContextCandidate({
        title: item?.title,
        summary: item?.summary,
      }, requestTermsSet);

      if (!score) return null;
      return {
        id: `history:${item?.id || index}`,
        score,
        rankHint: Number(new Date(item?.savedAt || 0)) || 0,
        title: item?.title || 'מסמך שמור',
        label: 'מסמך קודם',
        preview: [item?.title || '', item?.summary || ''].filter(Boolean).join('\n'),
      };
    }).filter(Boolean);

    const materialCandidates = (Array.isArray(projectMaterials) ? projectMaterials : []).map((item, index) => {
      const score = scoreAutoContextCandidate({
        title: item?.title,
        label: item?.label,
        learningHint: item?.learningHint,
      }, requestTermsSet);

      if (!score) return null;
      return {
        id: `material:${item?.id || index}`,
        score,
        rankHint: 0,
        title: item?.title || item?.file || `material-${index + 1}`,
        label: item?.label || 'כללי',
        material: item,
      };
    }).filter(Boolean);

    const topCandidates = [...historyCandidates, ...materialCandidates]
      .sort((left, right) => right.score - left.score || right.rankHint - left.rankHint || String(left.title || '').localeCompare(String(right.title || ''), 'he'))
      .slice(0, AUTO_CONTEXT_SOURCE_LIMIT);

    if (!topCandidates.length) return '';

    const preparedCandidates = await Promise.all(topCandidates.map(async (candidate) => {
      if (!candidate.material) return candidate;

      const preview = await loadMaterialPreview(candidate.material);
      return {
        ...candidate,
        preview: preview || [candidate.material?.title || candidate.title, candidate.material?.label || candidate.label, candidate.material?.learningHint || ''].filter(Boolean).join('\n'),
      };
    }));

    return preparedCandidates.map((item) => formatAutoContextEntry(item)).join('\n');
  } catch {
    return '';
  }
}

async function buildEffectiveMaterialsContext({ selectedMaterials = [], requestText = '', allowAutoSelection = false } = {}) {
  if (Array.isArray(selectedMaterials) && selectedMaterials.length) {
    return buildSelectedMaterialsContext(selectedMaterials);
  }

  if (!allowAutoSelection) {
    return '';
  }

  return buildAutoSelectedMaterialsContext(requestText);
}

function truncateContextSectionText(value = '', maxChars = 0) {
  const text = String(value || '').trim();
  const safeLimit = Number.isFinite(maxChars) ? Math.max(0, Math.floor(maxChars)) : 0;
  if (!safeLimit) return '';
  if (text.length <= safeLimit) return text;
  if (safeLimit === 1) return '…';
  return `${text.slice(0, safeLimit - 1).trimEnd()}…`;
}

function truncateContextSectionHeadTail(value = '', maxChars = 0, gapText = FEEDBACK_CONTEXT_HTML_GAP) {
  const text = String(value || '').trim();
  const safeLimit = Number.isFinite(maxChars) ? Math.max(0, Math.floor(maxChars)) : 0;
  if (!safeLimit) return '';
  if (text.length <= safeLimit) return text;
  if (gapText.length >= safeLimit) return text.slice(0, safeLimit);

  const remainingChars = safeLimit - gapText.length;
  const headChars = Math.max(1, Math.ceil(remainingChars * 0.55));
  const tailChars = Math.max(1, remainingChars - headChars);
  return `${text.slice(0, headChars).trimEnd()}${gapText}${text.slice(-tailChars).trimStart()}`;
}

function buildFeedbackDrivenRequestContext({
  originalPrompt = '',
  supportingText = '',
  supportingLabel = 'משוב המשתמש',
  materialsText = '',
  existingHtml = '',
  htmlLabel = 'המסמך הקיים ב-HTML',
  truncateHtml = true,
} = {}) {
  const topicSection = truncateContextSectionText(originalPrompt || 'לא צוין', FEEDBACK_CONTEXT_TOPIC_LIMIT);
  const supportingSection = truncateContextSectionText(supportingText, FEEDBACK_CONTEXT_SUPPORTING_LIMIT);
  const materialsSection = truncateContextSectionText(materialsText, FEEDBACK_CONTEXT_MATERIALS_LIMIT);
  const normalizedHtml = String(existingHtml || '').trim();
  const baseSections = [
    `נושא המסמך: ${topicSection || 'לא צוין'}`,
    supportingSection ? `${supportingLabel}:\n${supportingSection}` : '',
    materialsSection ? `חומרי עזר נלווים:\n${materialsSection}` : '',
  ].filter(Boolean);

  const reservedBaseContext = baseSections.join('\n\n');
  const availableHtmlBudget = Math.max(
    0,
    FEEDBACK_CONTEXT_TOTAL_LIMIT - reservedBaseContext.length - htmlLabel.length - 4,
  );
  const availableHtmlChars = Math.min(FEEDBACK_CONTEXT_HTML_MAX_LIMIT, availableHtmlBudget);
  const htmlSection = truncateHtml
    ? truncateContextSectionHeadTail(normalizedHtml, availableHtmlChars, FEEDBACK_CONTEXT_HTML_GAP)
    : normalizedHtml;

  return [
    ...baseSections,
    `${htmlLabel}:\n${htmlSection}`,
  ].join('\n\n');
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function blankLine(count = 1) {
  return Array.from({ length: count }, () => '<p>&nbsp;</p>').join('');
}

function buildTemplateHeader({ label = '', heading = '', detailLines = [] } = {}) {
  return [
    label ? `<p>${label}</p>` : '',
    `<h1>${heading}</h1>`,
    ...detailLines.filter(Boolean).map((line) => `<p>${line}</p>`),
    '<hr />',
  ].join('');
}

export function buildTemplateSkeleton(templateId = 'blank', title = '', examples = []) {
  const safeTitle = escapeHtml(title || '');
  const defaultHeadings = {
    blank: 'מסמך חדש',
    academic: 'כותרת העבודה',
    legal: 'כותרת המסמך המשפטי',
    report: 'כותרת הדוח',
    summary: 'כותרת הסיכום',
    office: 'כותרת המסמך המשרדי',
    proposal: 'כותרת ההצעה',
    letter: 'נושא המכתב',
  };
  const heading = safeTitle || defaultHeadings[templateId] || defaultHeadings.blank;

  void examples;

  const templates = {
    blank: `<h1>${heading}</h1><p>נושא / מטרה: ____________</p>${blankLine(3)}`,
    academic: `${buildTemplateHeader({
      label: 'עבודה אקדמית',
      heading,
      detailLines: ['מסלול / קורס: ____________', 'מגיש/ה: ____________', 'תאריך: ____________'],
    })}<h2>מסגרת העבודה</h2>${blankLine(1)}<h2>גוף הטקסט</h2>${blankLine(3)}`,
    legal: `${buildTemplateHeader({
      label: 'מסמך משפטי',
      heading,
      detailLines: ['לכבוד: ____________', 'הנדון: ____________', 'תאריך: ____________'],
    })}<h2>נוסח המסמך</h2>${blankLine(3)}<p>בכבוד רב,</p>${blankLine(2)}`,
    report: `${buildTemplateHeader({
      label: 'דוח מסודר',
      heading,
      detailLines: ['נערך עבור: ____________', 'תאריך: ____________'],
    })}<h2>מטרת הדוח</h2>${blankLine(1)}<h2>ממצאים</h2>${blankLine(2)}<h2>המשך טיפול</h2>${blankLine(1)}`,
    summary: `${buildTemplateHeader({
      label: 'סיכום נושא',
      heading,
      detailLines: ['נושא: ____________'],
    })}<h2>עיקרי הדברים</h2><ul><li>&nbsp;</li><li>&nbsp;</li><li>&nbsp;</li></ul><h2>השלמות</h2>${blankLine(1)}`,
    office: `${buildTemplateHeader({
      label: 'מסמך משרדי',
      heading,
      detailLines: ['אל: ____________', 'מאת: ____________', 'תאריך: ____________'],
    })}<h2>פרטי המסמך</h2>${blankLine(1)}<h2>לביצוע / טיפול</h2>${blankLine(2)}`,
    proposal: `${buildTemplateHeader({
      label: 'הצעה',
      heading,
      detailLines: ['מוגש ל: ____________', 'תאריך: ____________'],
    })}<h2>מה מוצע</h2>${blankLine(1)}<h2>פירוט</h2>${blankLine(2)}<h2>תיאום והשלמות</h2>${blankLine(1)}`,
    letter: `${buildTemplateHeader({
      label: 'מכתב רשמי',
      heading,
      detailLines: ['לכבוד: ____________', 'הנדון: ____________', 'תאריך: ____________'],
    })}<p>שלום רב,</p>${blankLine(2)}<p>בברכה,</p>${blankLine(2)}`,
  };

  return templates[templateId] || templates.blank;
}

function buildFallbackTemplateShell(templateId = 'blank', title = '') {
  const safeTitle = escapeHtml(title || '');
  const heading = safeTitle ? safeTitle : 'כותרת המסמך';
  const fallbackLabel = {
    academic: 'עבודה אקדמית',
    legal: 'מסמך משפטי',
    report: 'דוח מסודר',
    summary: 'סיכום נושא',
    office: 'מסמך משרדי',
    proposal: 'הצעה',
    letter: 'מכתב רשמי',
  };

  if (templateId === 'blank') {
    return `<h1>${heading}</h1>${blankLine(4)}`;
  }

  const label = fallbackLabel[templateId] || 'מסמך';

  return `<p>${label}</p><h1>${heading}</h1>${blankLine(4)}`;
}

function extractInstructionTitleCandidate(instructions = '') {
  const lines = String(instructions || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const preferredLine = lines.find((line, index) => index > 0 || !/^קובץ\s+הנחיות\s*:/i.test(line)) || lines[0] || '';

  return preferredLine
    .replace(/^(?:[-*]+|\d+[.)])\s+/, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:!?-]+|[\s,;:!?-]+$/g, '')
    .trim();
}

function resolveGenerationRequestContext({ prompt = '', instructions = '', templateId = 'blank' } = {}) {
  const cleanPrompt = String(prompt || '').trim();
  const cleanInstructions = String(instructions || '').trim();
  const title = cleanPrompt
    || extractInstructionTitleCandidate(cleanInstructions)
    || ({
      blank: 'מסמך חדש',
      academic: 'עבודה אקדמית',
      legal: 'מסמך משפטי',
      report: 'דוח מסודר',
      summary: 'סיכום נושא',
      office: 'מסמך משרדי',
      proposal: 'הצעה',
      letter: 'מכתב רשמי',
    }[templateId] || 'מסמך חדש');

  return { cleanPrompt, cleanInstructions, title };
}

function buildLocalDraft(prompt, templateId, instructions, selectedMaterials) {
  const structurePolicy = detectDocumentStructurePolicy({ prompt, instructions });
  const { title } = resolveGenerationRequestContext({ prompt, instructions, templateId });
  const preferPlainFallback = structurePolicy.noStructure || structurePolicy.flowingText || structurePolicy.followAssignmentSections;
  const promptContext = escapeHtml(
    String(prompt || '')
      .replace(LOCAL_STRUCTURE_DIRECTIVE_PATTERN, ' ')
      .replace(LOCAL_NO_INTRO_PATTERN, ' ')
      .replace(LOCAL_NO_SUMMARY_PATTERN, ' ')
      .replace(LOCAL_NO_HEADINGS_PATTERN, ' ')
      .replace(LOCAL_FLOWING_WRITING_PATTERN, ' ')
      .replace(LOCAL_ASSIGNMENT_SECTION_PATTERN, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s,;:!?-]+|[\s,;:!?-]+$/g, '')
      .trim()
  );
  const fallbackContext = promptContext || escapeHtml(title);
  const statusBlock = `
    <div style="border:1px solid #fecaca;background:#fff7f7;padding:12px 14px;border-radius:10px;margin:10px 0;">
      <p><strong>שים לב:</strong> ה-AI לא החזיר מסמך מלא בהרצה הזאת.</p>
      <p>נוצר שלד מקומי לעריכה, וניתן לבדוק את הסיבה במסך ההגדרות תחת יומן הלוגים.</p>
      ${instructions ? '<p>הנחיות המשתמש נשמרו למערכת, אך אינן מודבקות למסמך עצמו.</p>' : ''}
    </div>
  `;
    const refsList = selectedMaterials.length
      ? `<ul>${selectedMaterials.map((item) => `<li>${escapeHtml(item.title)}</li>`).join('')}</ul>`
      : '';
  const refs = selectedMaterials.length
      ? `<h2>חומרי עזר שנבחרו</h2>${refsList}`
    : '';
  const renderedRefs = structurePolicy.noHeadings ? refsList : refs;
  const fallbackShell = repairGeneratedHtmlForStructurePolicy(buildFallbackTemplateShell(templateId, title), structurePolicy);

  return preferPlainFallback
    ? `${statusBlock}${fallbackContext ? `<p>${fallbackContext}</p>` : ''}${blankLine(4)}${refsList}`
    : `${statusBlock}${fallbackShell}${renderedRefs}`;
}

function normalizeGeneratedHtmlResponse(response = '') {
    const stripped = stripGeneratedHtmlResponseCodeFences(response).trim();
    const parsedJson = tryParseJsonObjectResponse(stripped);
    const extractedHtml = parsedJson && typeof parsedJson.html === 'string'
      ? parsedJson.html.trim()
      : '';
    const normalized = extractedHtml || stripped;
  const convertedPlainText = convertMeaningfulPlainTextToBasicHtml(normalized);
  return convertedPlainText || normalized;
}

function convertMeaningfulPlainTextToBasicHtml(response = '') {
  const source = String(response || '').trim();
  if (!source) return '';
  if (isJsonOnlyGeneratedHtmlFallbackCandidate(source)) return '';
    if (/<\/?[a-z][^>]*>/i.test(source)) return '';
  if (/<\/?[a-z!][^>\n]*$/im.test(source) || /<!--[^>\n]*$/im.test(source)) return '';

  const visibleText = source.replace(/\s+/g, ' ').trim();
  if (!hasMeaningfulVisibleText(visibleText)) return '';

  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraphLines = [];
  let listType = '';
  let listItems = [];

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    blocks.push(`<p>${paragraphLines.map((line) => escapeHtml(line)).join('<br />')}</p>`);
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listItems.length || !listType) return;
    blocks.push(`<${listType}>${listItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</${listType}>`);
    listType = '';
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${escapeHtml(headingMatch[2].trim())}</h${level}>`);
      continue;
    }

    const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(bulletMatch[1].trim());
      continue;
    }

    const orderedMatch = line.match(/^\d+[\.)]\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(orderedMatch[1].trim());
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks.join('\n');
}

function isJsonOnlyGeneratedHtmlFallbackCandidate(response = '') {
  const source = String(response || '').trim();
  if (!source || !/^[\[{]/.test(source)) return false;

  const looksJsonLike = /^[\[{]/.test(source) && (
    /^\{[\s\S]*["'][^"'\n]+["']\s*:/m.test(source)
    || /^\[[\s\S]*\{/m.test(source)
    || /^\[[\s\S]*(?:"|true\b|false\b|null\b|-?\d)/m.test(source)
  );
  if (!looksJsonLike) return false;

  try {
    const parsed = JSON.parse(source);
    return Array.isArray(parsed) || Boolean(parsed && typeof parsed === 'object');
  } catch {
    return true;
  }
}

function stripGeneratedHtmlResponseCodeFences(response = '') {
  return String(response || '')
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '');
}

const HTML_OPTIONAL_END_TAGS = new Set(['dd', 'dt', 'li', 'option', 'p', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr']);
const HTML_OPTIONAL_END_TAG_PARENT_CLOSERS = new Map([
  ['dd', new Set(['dl'])],
  ['dt', new Set(['dl'])],
  ['li', new Set(['menu', 'ol', 'ul'])],
  ['option', new Set(['datalist', 'optgroup', 'select'])],
  ['p', new Set([
    'address',
    'article',
    'aside',
    'blockquote',
    'body',
    'caption',
    'dd',
    'details',
    'dialog',
    'div',
    'dl',
    'dt',
    'fieldset',
    'figcaption',
    'figure',
    'footer',
    'form',
    'header',
    'hgroup',
    'html',
    'li',
    'main',
    'menu',
    'nav',
    'ol',
    'p',
    'pre',
    'search',
    'section',
    'table',
    'tbody',
    'td',
    'tfoot',
    'th',
    'thead',
    'tr',
    'ul',
  ])],
  ['tbody', new Set(['table', 'tbody', 'tfoot'])],
  ['td', new Set(['table', 'tbody', 'tfoot', 'thead', 'tr'])],
  ['tfoot', new Set(['table'])],
  ['th', new Set(['table', 'tbody', 'tfoot', 'thead', 'tr'])],
  ['thead', new Set(['table', 'tbody', 'tfoot'])],
  ['tr', new Set(['table', 'tbody', 'tfoot', 'thead'])],
]);

function closeImplicitOptionalTagsForClosingTag(stack = [], closingTagName = '') {
  while (stack.length) {
    const openTagName = stack[stack.length - 1];
    if (!HTML_OPTIONAL_END_TAGS.has(openTagName)) break;

    const supportedClosers = HTML_OPTIONAL_END_TAG_PARENT_CLOSERS.get(openTagName);
    if (!supportedClosers || !supportedClosers.has(closingTagName)) break;

    stack.pop();
  }
}

function discardImplicitTrailingOptionalTags(stack = []) {
  while (stack.length && HTML_OPTIONAL_END_TAGS.has(stack[stack.length - 1])) {
    stack.pop();
  }
}

function findGeneratedHtmlIntegrityIssue(html = '') {
  const source = String(html || '').trim();
  if (!source) return 'התקבלה תשובה ריקה';
  if (TRUNCATED_RESPONSE_MARKER_PATTERN.test(source)) {
    return 'התקבל placeholder של קיצור context או תשובה חלקית';
  }
  if (isJsonOnlyGeneratedHtmlFallbackCandidate(source)) {
    return 'התקבלה מעטפת JSON או pseudo-JSON במקום HTML';
  }
  if (!/<\/?[a-z][^>]*>/i.test(source)) {
    return 'התקבל פלט שאינו HTML';
  }
  if (/<[^>]*$/.test(source)) {
    return 'ה-HTML נחתך באמצע תגית';
  }
  if (/&(?:#\d+|#x[a-f0-9]+|[a-z]+)?$/i.test(source)) {
    return 'ה-HTML נחתך באמצע entity';
  }

  const stack = [];
  for (const match of source.matchAll(HTML_TAG_TOKEN_PATTERN)) {
    const raw = match[0] || '';
    const tagName = String(match[1] || '').toLowerCase();
    if (!tagName || raw.startsWith('<!--')) continue;

    const isClosingTag = raw.startsWith('</');
    const isSelfClosing = raw.endsWith('/>') || HTML_VOID_TAGS.has(tagName);
    if (isClosingTag) {
      closeImplicitOptionalTagsForClosingTag(stack, tagName);
      const expectedTag = stack.pop();
      if (!expectedTag) {
        // תגית סגירה ייתומית של אלמנט optional — בדפדפן מתעלמים ממנה
        if (HTML_OPTIONAL_END_TAGS.has(tagName)) continue;
        return `ה-HTML ממשיך מתגית סגירה לא תואמת: </${tagName}>`;
      }
      if (expectedTag !== tagName) {
        // תגית סגירה optional שלא מתאימה לפתוח — מחזירים לסטק ומתעלמים
        if (HTML_OPTIONAL_END_TAGS.has(tagName)) {
          stack.push(expectedTag);
          continue;
        }
        return `סגירת תגיות לא תואמת: ציפיתי ל-</${expectedTag}> אבל התקבלה </${tagName}>`;
      }
      continue;
    }

    if (!isSelfClosing) {
      stack.push(tagName);
    }
  }

  discardImplicitTrailingOptionalTags(stack);
  if (stack.length) {
    const trailingTags = stack.slice(-2).map((tagName) => `<${tagName}>`).join(', ');
    return `חסרות תגיות סגירה לסוף המסמך (${trailingTags})`;
  }

  const strippedMarkup = source.replace(HTML_TAG_TOKEN_PATTERN, '');
  if (strippedMarkup.includes('<')) {
    return 'ה-HTML נחתך באמצע תגית';
  }

  return '';
}

function ensureCompleteGeneratedHtmlResponse(response = '', operationLabel = 'המסמך') {
  const normalized = normalizeGeneratedHtmlResponse(response);
  const visibleText = stripHtmlTags(normalized);
  if (!hasMeaningfulVisibleText(visibleText)) {
    throw new Error(`התקבלה תשובת ${operationLabel} ריקה או לא שמישה`);
  }

  const integrityIssue = findGeneratedHtmlIntegrityIssue(normalized);
  if (integrityIssue) {
    throw new Error(`התקבלה תשובת ${operationLabel} חלקית או עם HTML שבור: ${integrityIssue}`);
  }

  return normalized;
}

function normalizeDocumentVisibleText(html = '') {
  return stripHtmlTags(normalizeGeneratedHtmlResponse(html)).replace(/\s+/g, ' ').trim();
}

function normalizeDocumentSignature(value = '') {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[^\u0590-\u05FFA-Za-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractDocumentHeadingSignatures(html = '', limit = 3) {
  return Array.from(String(html || '').matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi))
    .map((match) => normalizeDocumentSignature(match[2]))
    .filter(Boolean)
    .slice(0, Math.max(0, limit));
}

function feedbackAllowsWideDocumentRewrite(feedback = '') {
  const normalizedFeedback = String(feedback || '').replace(/\s+/g, ' ').trim();
  if (!normalizedFeedback) return false;

  const negatedWholeDocumentRewritePattern = /(אל|לא|בלי|don't|do not|dont)\s+(?:להפוך|תהפוך|לקצר|תקצר|לתמצת|תמצת|לסכם|סכם|לשכתב|שכתב|rewrite|shorten|summari[sz]e|condense|convert)/i;
  if (negatedWholeDocumentRewritePattern.test(normalizedFeedback)) return false;

  const explicitWholeDocumentPattern = /((?:לקצר|תקצר|לתמצת|תמצת|לסכם|סכם|שכתב|לשכתב|כתב\s+מחדש|לכתוב\s+מחדש|תכתוב\s+מחדש|כתוב\s+מחדש|ארגן\s+מחדש|סדר\s+מחדש|שנה\s+מבנה|הפוך|הפכי|תהפוך|להפוך)\s+(?:את\s+)?(?:כל\s+)?(?:המסמך|העבודה|הטקסט))(?:\s|$)|(?:המסמך|העבודה|הטקסט)\s+(?:כולו|כולה)\s+(?:בקיצור|בתמצות|בקצרה)|(?:rewrite|summari[sz]e|shorten|condense|restructure|reorganize)\s+(?:the\s+)?(?:entire|whole)\s+(?:document|text|draft)|(?:remove|delete)\s+(?:entire|whole)\s+(?:sections?|paragraphs?|document)/i;
  if (explicitWholeDocumentPattern.test(normalizedFeedback)) return true;

  const localTargetPattern = /(מבוא|פתיח|פרק|סעיף|פסקה|כותרת|chapter|section|paragraph|intro|heading|conclusion|summary)/i;
  const globalCondenseVerbPattern = /(לקצר|תקצר|לתמצת|תמצת|לסכם|סכם|shorten|summari[sz]e|condense|reduce)/i;
  const pageBudgetPattern = /(עמוד\s+אחד|חצי\s+עמוד|one\s+page|half\s+page)/i;
  if (!localTargetPattern.test(normalizedFeedback) && globalCondenseVerbPattern.test(normalizedFeedback) && pageBudgetPattern.test(normalizedFeedback)) {
    return true;
  }

  const convertToShortFormPattern = /(הפוך|הפכי|להפוך|תהפוך|convert|transform).{0,24}(?:את\s+)?(?:כל\s+)?(?:המסמך|העבודה|הטקסט)?(?:\s+)?(?:ל|into\s+)?(?:מייל|אימייל|מכתב\s+קצר|email|short\s+letter|brief)/i;
  if (!localTargetPattern.test(normalizedFeedback) && convertToShortFormPattern.test(normalizedFeedback)) {
    return true;
  }

  return false;
}

function feedbackAllowsUltraShortDocumentForm(feedback = '') {
  return /(מייל|אימייל|email|תקציר\s+קצר|סיכום\s+קצר|brief|short\s+letter|message\s+short)/i.test(String(feedback || '').trim());
}

function feedbackRequestsGlobalCondense(feedback = '') {
  return /(לקצר|תקצר|לתמצת|תמצת|לסכם|סכם|shorten|summari[sz]e|condense|reduce)/i.test(String(feedback || '').trim());
}

function extractDocumentBoundarySignatures(html = '', maxChars = 120) {
  const visibleText = normalizeDocumentVisibleText(html);
  if (!visibleText) {
    return {
      start: '',
      end: '',
    };
  }

  return {
    start: normalizeDocumentSignature(visibleText.slice(0, maxChars)),
    end: normalizeDocumentSignature(visibleText.slice(-maxChars)),
  };
}

function countDocumentContentBlocks(html = '') {
  return (String(html || '').match(/<(?:h[1-6]|p|li|blockquote|table|tr|td|th)\b/gi) || []).length;
}

function findSuspiciousRevisionOutputIssue({ existingHtml = '', revisedHtml = '', feedback = '' } = {}) {
  const previousVisible = normalizeDocumentVisibleText(existingHtml);
  const revisedVisible = normalizeDocumentVisibleText(revisedHtml);
  if (!previousVisible || !revisedVisible) return '';

  const previousLength = previousVisible.length;
  const revisedLength = revisedVisible.length;
  const wideRewriteAllowed = feedbackAllowsWideDocumentRewrite(feedback);
  const ultraShortRewriteAllowed = feedbackAllowsUltraShortDocumentForm(feedback);
  const globalCondenseRequested = feedbackRequestsGlobalCondense(feedback);
  const previousBoundaries = extractDocumentBoundarySignatures(existingHtml);
  const revisedSignature = normalizeDocumentSignature(revisedHtml);
  const preservesStartBoundary = previousBoundaries.start && revisedSignature.includes(previousBoundaries.start);
  const preservesEndBoundary = previousBoundaries.end && revisedSignature.includes(previousBoundaries.end);
  const previousBlockCount = countDocumentContentBlocks(existingHtml);
  const revisedBlockCount = countDocumentContentBlocks(revisedHtml);

  if (wideRewriteAllowed) {
    if (!ultraShortRewriteAllowed && previousLength >= 160 && revisedLength < 80) {
      return 'תשובת השכתוב המלא קצרה מדי ונראית כמו fragment במקום מסמך מלא';
    }

    if (!ultraShortRewriteAllowed && !globalCondenseRequested && previousBlockCount >= 3 && revisedBlockCount <= 1 && revisedLength < Math.max(220, Math.floor(previousLength * 0.35))) {
      return 'תשובת השכתוב המלא נראית כמו פסקה בודדת במקום מסמך מלא';
    }
  }

  if (!wideRewriteAllowed && previousLength >= 40 && revisedLength < (previousLength < 80
    ? Math.max(20, Math.floor(previousLength * 0.38))
    : Math.max(80, Math.floor(previousLength * 0.38)))) {
    return 'תשובת התיקון נראית כמו fragment חלקי או קיצור לא מבוקש של המסמך כולו';
  }

  if (!wideRewriteAllowed && previousLength >= 40 && !preservesStartBoundary && !preservesEndBoundary && revisedLength < Math.max(120, Math.floor(previousLength * 0.72))) {
    return 'תשובת התיקון לא שומרת על תחילת או סוף המסמך ונראית כמו החלפה חלקית במקום מסמך מלא';
  }

  if (!wideRewriteAllowed && previousLength >= 40 && (!preservesStartBoundary || !preservesEndBoundary) && revisedLength < Math.max(120, Math.floor(previousLength * 0.9))) {
    return 'תשובת התיקון איבדה אחד מקצוות המסמך לצד קיטון מהותי ונראית כמו החלפה חלקית';
  }

  const previousHeadings = extractDocumentHeadingSignatures(existingHtml);
  if (!wideRewriteAllowed && previousHeadings.length) {
    const preservedHeadingCount = previousHeadings.filter((heading) => heading && revisedSignature.includes(heading)).length;
    if (previousLength >= 1800 && preservedHeadingCount === 0 && revisedLength < Math.max(900, Math.floor(previousLength * 0.55))) {
      return 'תשובת התיקון איבדה את שלד המסמך הקיים ונראית כמו החלפה חלקית במקום מסמך מלא';
    }
  }

  return '';
}

function isRecoverableGeneratedHtmlContinuationIssue(issue = '') {
  const normalizedIssue = String(issue || '').trim();
  if (!normalizedIssue) return false;
  return /placeholder של קיצור context או תשובה חלקית|נחתך באמצע|חסרות תגיות סגירה לסוף המסמך/i.test(normalizedIssue);
}

function buildGeneratedHtmlContinuationContext({ context = '', partialHtml = '', integrityIssue = '' }) {
  const trimmedContext = truncateContextSectionHeadTail(
    String(context || '').trim(),
    GENERATED_HTML_CONTINUATION_CONTEXT_LIMIT,
    GENERATED_HTML_CONTINUATION_GAP,
  );
  const partialWindow = truncateContextSectionHeadTail(
    String(partialHtml || '').trim(),
    GENERATED_HTML_CONTINUATION_PARTIAL_LIMIT,
    GENERATED_HTML_CONTINUATION_GAP,
  );
  return [
    trimmedContext ? `הקשר מקוצר מהבקשה המקורית:\n${trimmedContext}` : '',
    `ה-HTML החלקי שכבר התקבל ואסור לחזור עליו:\n${partialWindow}`,
    integrityIssue ? `סיבת ההשלמה: ${integrityIssue}` : '',
  ].filter(Boolean).join('\n\n');
}

function getGeneratedHtmlProviderResponseText(response = '') {
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    return String(response.text || '');
  }
  return String(response || '');
}

function getGeneratedHtmlProviderCompletion(response = '') {
  if (!response || typeof response !== 'object' || Array.isArray(response) || !response.completion || typeof response.completion !== 'object') {
    return null;
  }
  const reason = String(response.completion.reason || response.completion.finishReason || response.completion.stopReason || '').trim();
  const finishReason = String(response.completion.finishReason || '').trim();
  const stopReason = String(response.completion.stopReason || '').trim();
  const provider = String(response.completion.provider || '').trim();
  const model = String(response.completion.model || '').trim();
  const normalized = {
    ...(reason ? { reason } : {}),
    ...(finishReason ? { finishReason } : {}),
    ...(stopReason ? { stopReason } : {}),
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
  };
  return Object.keys(normalized).length ? normalized : null;
}

function didGeneratedHtmlResponseHitLengthCap(completion = null) {
  if (!completion || typeof completion !== 'object') return false;
  return [completion.reason, completion.finishReason, completion.stopReason]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .some((value) => /(^length$|max[_ -]?tokens?|max[_ -]?output|length cap|token cap)/i.test(value));
}

function buildGeneratedHtmlCompletionContinuationIssue(completion = null) {
  if (!completion || typeof completion !== 'object') return '';
  const provider = String(completion.provider || '').trim();
  const reason = String(completion.reason || completion.finishReason || completion.stopReason || '').trim() || 'מגבלת אורך או טוקנים';
  return provider
    ? `${provider} עצר את הפלט בגלל ${reason} לפני סוף התשובה`
    : `הפלט נעצר בגלל ${reason} לפני סוף התשובה`;
}

function isGeneratedHtmlContinuationWordChar(char = '') {
  return Boolean(char) && /[\p{L}\p{N}_]/u.test(char);
}

function isGeneratedHtmlContinuationOverlapSafe(addition = '', overlap = 0) {
  if (overlap < 1) return false;

  const overlapText = addition.slice(0, overlap);
  if (!/\S/.test(overlapText)) return false;
  if (overlap >= 3) return true;
  if (overlap === 1) return !isGeneratedHtmlContinuationWordChar(overlapText);
  return /[^\p{L}\p{N}_]/u.test(overlapText);
}

function mergeGeneratedHtmlContinuation(partialHtml = '', continuationHtml = '') {
  const base = String(partialHtml || '');
  const addition = String(continuationHtml || '');
  if (!base) return addition;
  if (!addition) return base;
  if (base.endsWith(addition)) return base;
  if (addition.startsWith(base)) return addition;

  const maxOverlap = Math.min(base.length, addition.length);
  for (let overlap = maxOverlap; overlap >= 1; overlap -= 1) {
    if (
      base.slice(-overlap) === addition.slice(0, overlap)
      && isGeneratedHtmlContinuationOverlapSafe(addition, overlap)
    ) {
      return `${base}${addition.slice(overlap)}`;
    }
  }

  return `${base}${addition}`;
}

async function requestGeneratedHtmlResponseWithSingleContinuation({
  userPrompt = '',
  context = '',
  systemPrompt = '',
  requestOptions = {},
  operationLabel = 'המסמך',
  continuationPrompt = 'המשך רק את ה-HTML החסר של אותה תשובה.',
  runId = '',
  agentLabel = '',
  requestLogContext = {},
}) {
  const maxContinuationPassesRaw = Number(requestOptions?.maxContinuationPasses);
  const maxContinuationPasses = Number.isFinite(maxContinuationPassesRaw)
    ? Math.max(1, Math.min(4, Math.floor(maxContinuationPassesRaw)))
    : 2;
  const response = await chatWithActiveProvider(userPrompt, context, systemPrompt, {
    ...requestOptions,
    includeCompletionMetadata: true,
  });
  let completion = getGeneratedHtmlProviderCompletion(response);
  let partialHtml = stripGeneratedHtmlResponseCodeFences(getGeneratedHtmlProviderResponseText(response));
  let normalizedResponse = partialHtml.trim();
  let integrityIssue = findGeneratedHtmlIntegrityIssue(normalizedResponse);
  let validationError = null;
  let validatedResponse = '';

  try {
    validatedResponse = ensureCompleteGeneratedHtmlResponse(normalizedResponse, operationLabel);
  } catch (error) {
    validationError = error;
  }

  for (let continuationAttempt = 0; continuationAttempt < maxContinuationPasses; continuationAttempt += 1) {
    const shouldContinueFromIntegrity = Boolean(validationError) && isRecoverableGeneratedHtmlContinuationIssue(integrityIssue);
    const shouldContinueFromCompletion = Boolean(validationError) && didGeneratedHtmlResponseHitLengthCap(completion);
    const continuationIssue = shouldContinueFromCompletion
      ? buildGeneratedHtmlCompletionContinuationIssue(completion)
      : integrityIssue;

    if (!shouldContinueFromIntegrity && !shouldContinueFromCompletion) {
      if (validationError) throw validationError;
      return validatedResponse;
    }

    logAgentDebugEvent({
      type: 'doc-html-continuation-attempt',
      state: 'running',
      runId,
      agentLabel,
      message: shouldContinueFromIntegrity
        ? `מנסה continuation ${continuationAttempt + 1} מתוך ${maxContinuationPasses} ל-${operationLabel} אחרי זיהוי HTML חלקי`
        : `מנסה continuation ${continuationAttempt + 1} מתוך ${maxContinuationPasses} ל-${operationLabel} אחרי זיהוי עצירה ב-limit של הספק`,
      integrityIssue: continuationIssue,
      completionReason: completion?.reason || '',
      partialChars: partialHtml.length,
      ...requestLogContext,
    });

    try {
      const continuationProvider = String(completion?.provider || requestOptions.providerOverride || '').trim();
      const continuationModel = String(completion?.model || requestOptions.modelOverride || '').trim();
      const continuationResponse = await chatWithActiveProvider(
        continuationPrompt,
        buildGeneratedHtmlContinuationContext({ context, partialHtml, integrityIssue: continuationIssue }),
        `${systemPrompt}\n\nהמשך רק את ה-HTML החסר של אותה תשובה. אל תחזור על ההתחלה שכבר התקבלה, אל תכתוב markdown או סימוני קוד, ואל תוסיף הסברים. החזר רק את ההמשך הדרוש כדי שהמסמך יהיה HTML שלם ותקין.`,
        {
          ...requestOptions,
          includeCompletionMetadata: true,
          expectDocumentOutput: true,
          appendAgentNotesToOutput: requestOptions.appendAgentNotesToOutput === true,
          agentNotesInstruction: requestOptions.appendAgentNotesToOutput === true
            ? String(requestOptions.agentNotesInstruction || '').trim()
            : '',
          skipAutomation: true,
          skipAutomationPrompt: true,
          skipSkillSelection: true,
          skipMultiModel: true,
          preserveFullDocumentContext: false,
          ...(continuationProvider ? {
            providerOverride: continuationProvider,
            strictProviderOverride: true,
          } : {}),
          ...(continuationModel ? { modelOverride: continuationModel } : {}),
        },
      );

      const continuationCompletion = getGeneratedHtmlProviderCompletion(continuationResponse);
      const continuationHtml = stripGeneratedHtmlResponseCodeFences(getGeneratedHtmlProviderResponseText(continuationResponse));
      const mergedResponse = mergeGeneratedHtmlContinuation(partialHtml, continuationHtml);

      partialHtml = mergedResponse;
      completion = continuationCompletion;
      normalizedResponse = mergedResponse.trim();
      integrityIssue = findGeneratedHtmlIntegrityIssue(normalizedResponse);

      try {
        const mergedValidatedResponse = ensureCompleteGeneratedHtmlResponse(mergedResponse, operationLabel);

        logAgentDebugEvent({
          type: 'doc-html-continuation-success',
          state: 'success',
          runId,
          agentLabel,
          message: `continuation ${continuationAttempt + 1} השלים בהצלחה את ${operationLabel}`,
          integrityIssue: continuationIssue,
          completionReason: completion?.reason || '',
          continuationCompletionReason: continuationCompletion?.reason || '',
          partialChars: partialHtml.length,
          continuationChars: continuationHtml.length,
          outputChars: mergedValidatedResponse.length,
          ...requestLogContext,
        });

        return mergedValidatedResponse;
      } catch (retryValidationError) {
        validationError = retryValidationError;
        if (continuationAttempt >= maxContinuationPasses - 1) {
          throw retryValidationError;
        }
      }
    } catch (continuationError) {
      logAgentDebugEvent({
        type: 'doc-html-continuation-failure',
        state: 'error',
        runId,
        agentLabel,
        message: `continuation ${continuationAttempt + 1} ל-${operationLabel} נכשל`,
        integrityIssue: continuationIssue,
        completionReason: completion?.reason || '',
        errorMessage: continuationError?.message || validationError?.message || 'שגיאה לא ידועה',
        partialChars: partialHtml.length,
        ...requestLogContext,
      });
      if (shouldContinueFromCompletion) {
        const continuationFailureMessage = continuationError?.message || validationError?.message || 'שגיאה לא ידועה';
        throw new Error(`הפלט עבור ${operationLabel} נעצר במגבלת הספק ו-continuation נכשל: ${continuationFailureMessage}`);
      }
      throw continuationError;
    }
  }

  if (validationError) throw validationError;
  return validatedResponse;
}

function normalizeJsonOnlyResponse(response = '') {
  return String(response || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function tryParseJsonObjectResponse(response = '') {
  const text = String(response || '').trim();
  if (!text) return null;

  const candidates = [];
  const addCandidate = (value = '') => {
    const candidate = String(value || '').trim();
    if (!candidate || candidates.includes(candidate)) return;
    candidates.push(candidate);
  };

  addCandidate(text);
  addCandidate(normalizeJsonOnlyResponse(text));

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) addCandidate(fencedMatch[1]);

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) addCandidate(text.slice(firstBrace, lastBrace + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {}
  }

  return null;
}

function normalizeReviewSuggestionText(value = '', fallback = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function normalizeReviewSuggestionsPayload(payload = null) {
  if (!payload || typeof payload !== 'object') return null;

  const rawSuggestions = Array.isArray(payload.suggestions)
    ? payload.suggestions
    : Array.isArray(payload.recommendations)
      ? payload.recommendations
      : [];

  const suggestions = rawSuggestions
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;

      const title = normalizeReviewSuggestionText(item.title || item.heading || item.name, `המלצה ${index + 1}`);
      const reason = normalizeReviewSuggestionText(item.reason || item.why || item.rationale);
      const suggestedChange = normalizeReviewSuggestionText(item.suggestedChange || item.change || item.recommendedEdit || item.suggestion);
      if (!reason && !suggestedChange) return null;

      return {
        title,
        reason: reason || 'כדאי לחדד את הנקודה הזאת כדי לשפר את הקריאות והדיוק.',
        suggestedChange: suggestedChange || reason,
      };
    })
    .filter(Boolean)
    .slice(0, 6);

  const summary = normalizeReviewSuggestionText(
    payload.summary || payload.overview || payload.message || payload.shortSummary,
    suggestions.length ? 'נמצאו כמה המלצות קצרות לשיפור הטיוטה.' : '',
  );

  if (!summary && !suggestions.length) return null;
  return { summary, suggestions };
}

function buildDocumentReviewFallback({ focusText = '', errorMessage = '' } = {}) {
  return {
    summary: focusText
      ? 'לא הצלחתי להכין כרגע המלצות עריכה למוקד שביקשת. אפשר לנסות שוב או לשלוח עדכון ישיר.'
      : 'לא הצלחתי להכין כרגע המלצות עריכה לטיוטה. אפשר לנסות שוב או לשלוח עדכון ישיר.',
    suggestions: [],
    usedFallback: true,
    errorMessage: String(errorMessage || '').trim(),
  };
}

const LOCAL_STRUCTURE_DIRECTIVE_PATTERN = /(?:^|[\s,;:!?])(?:בלי\s+מבנה(?:\s+בכלל)?|ללא\s+מבנה(?:\s+בכלל)?|אין\s+צורך\s+במבנה(?:\s+בכלל)?|בלי\s+שלד(?:\s+בכלל)?|ללא\s+שלד(?:\s+בכלל)?|בלי\s+שלד\s+אקדמי|ללא\s+שלד\s+אקדמי|בלי\s+outline(?:\s+בכלל)?|ללא\s+outline(?:\s+בכלל)?|בלי\s+כותרות\s+בכלל|ללא\s+כותרות\s+בכלל|בלי\s+פרקים\s+בכלל|ללא\s+פרקים\s+בכלל|no\s+structure(?:\s+at\s+all)?|without\s+structure|no\s+outline|without\s+outline|without\s+an?\s+outline|no\s+headings\s+at\s+all|without\s+headings(?:\s+entirely)?|no\s+sections\s+at\s+all|without\s+sections(?:\s+entirely)?)/i;
const LOCAL_NO_INTRO_PATTERN = /(?:בלי|ללא)\s+מבוא|(?:בלי|ללא)\s+פתיח|לא\s+צריך\s+מבוא|ללא\s+פתיחה|בלי\s+פתיחה|no\s+intro(?:duction)?|without\s+an?\s+intro(?:duction)?/i;
const LOCAL_NO_SUMMARY_PATTERN = /(?:בלי|ללא)\s+סיכום|(?:בלי|ללא)\s+מסקנות|לא\s+צריך\s+סיכום|לא\s+צריך\s+מסקנות|no\s+summary|without\s+summary|no\s+conclusion|without\s+conclusion/i;
const LOCAL_NO_HEADINGS_PATTERN = /(?:בלי|ללא)\s+כותר(?:ת|ות)|(?:בלי|ללא)\s+ראשי\s+פרקים|(?:בלי|ללא)\s+כותרות\s+ביניים|no\s+headings|without\s+headings/i;
const LOCAL_FLOWING_WRITING_PATTERN = /(?:כתיבה|ניסוח|טקסט)\s+זור(?:ם|מת)|(?:בלי|ללא)\s+ראשי\s+פרקים\s+אלא\s+כתיבה\s+זורמת|flowing\s+writing|continuous\s+prose|running\s+text/i;
const LOCAL_ASSIGNMENT_SECTION_PATTERN = /לפי\s+סעיפי\s+המטלה|לפי\s+סעיפי\s+המשימה|רק\s+לפי\s+סעיפי\s+המטלה|סעיפי\s+המטלה\s+בלבד|follow\s+the\s+assignment\s+sections|according\s+to\s+the\s+assignment\s+sections/i;
const LEADING_GENERIC_INTRO_HEADING_PATTERN = /^(?:מבוא|פתיחה|פתח\s+דבר|רקע(?:\s+כללי)?)$/i;
const TRAILING_GENERIC_SUMMARY_HEADING_PATTERN = /^(?:סיכום(?:\s+כללי)?(?:\s+ומסקנות)?|סיכום\s+והמלצות|סיכום\s+דברים|דברי\s+סיכום|מסקנ(?:ה|ות)(?:\s+כלליות)?(?:\s+והמלצות)?|סיום|דברי\s+סיום|summary(?:\s+and\s+(?:conclusions?|recommendations?))?|conclusion(?:s)?(?:\s+and\s+recommendations?)?|concluding\s+remarks|closing\s+remarks|final\s+remarks|final\s+thoughts)$/i;
const TRAILING_SUMMARY_LIKE_BLOCK_PATTERN = /^(?:לסיכום|בסיכומו\s+של\s+דבר|בסופו\s+של\s+דבר|מן\s+האמור(?:\s+לעיל)?|לאור\s+האמור(?:\s+לעיל)?|ניתן\s+לסכם|נוכל\s+לסכם|סיכום(?:\s+והמלצות)?(?:\s*:)?|מסקנ(?:ה|ות)(?:\s+(?:כלליות|והמלצות))?(?:\s*:)?|המסקנ(?:ה|ות)(?:\s+העיקרי(?:ת|ות))?(?:\s+ה(?:יא|ן))?|in\s+summary|to\s+summari[sz]e|to\s+sum\s+up|summary(?:\s+and\s+recommendations?)?\b|in\s+conclusion|conclusion(?:s)?(?:\s+and\s+recommendations?)?\b|concluding\s+remarks|closing\s+remarks|final\s+remarks|final\s+thoughts)/i;
const TRAILING_AMBIGUOUS_SUMMARY_CUE_PATTERN = /^(?:לסיום(?:(?=\s*$)|(?=\s*[:;,.!?-])|(?:\s+(?:נציין|נאמר|נסכם|נדגיש|יודגש|נזכיר|ראוי\s+לציין|חשוב\s+לציין)\b))|to\s+conclude(?:(?=\s*$)|(?=\s*[:;,.!?-])|(?:\s+(?:we\s+(?:note|can\s+say|see|emphasize|recap)|it\s+is\s+clear|the\s+(?:main\s+point|conclusion)\s+is)\b)))/i;
const TRAILING_OPERATIONAL_AMBIGUOUS_SUMMARY_CONTINUATION_PATTERN = /^(?:לסיום|to\s+conclude)\s*[:;,.!?-]?\s*(?:(?:יש|על(?:יך|יכם|ינו|יהם|יהן)?|נדרש(?:ת|ים|ות)?|נא|אנא)\s+(?:לצרף|להגיש|לשלוח|להעביר|למלא|להשלים|לוודא|לעדכן|להוסיף|לכלול|לבצע|לפנות|להמציא)(?=$|[\s,;:.!?-])|please\s+(?:attach|include|submit|send|provide|complete|fill|ensure|update)\b|you\s+(?:should|must|need\s+to)\s+(?:attach|include|submit|send|provide|complete|fill|ensure|update)\b)/i;
const TRAILING_EXPLICIT_NON_SUMMARY_BLOCK_PATTERN = /^(?:בברכה|בכבוד(?:\s+רב)?|בברכת\s+הצלחה|לשאלות(?:\s+נוספות)?|לפרטים(?:\s+נוספים)?|למידע(?:\s+נוסף)?|ליצירת\s+קשר|מוזמנים\s+לפנות|ניתן\s+לפנות|צרו\s+קשר|נשמח\s+(?:לסייע|לעמוד\s+לרשותכם)|for\s+(?:more\s+information|questions)|feel\s+free\s+to\s+contact|contact\s+us|reach\s+out)/i;
const TRAILING_OPERATIONAL_FOLLOW_UP_BLOCK_PATTERN = /^(?:next\s+steps?|action\s+items?|implementation\s+steps?|follow-?up\s+steps?|צעדים\s+הבאים|צעדי\s+המשך|שלבי\s+המשך|פעולות\s+המשך)\b/i;
const TRAILING_CONTACT_DETAILS_PATTERN = /(?:@|https?:\/\/|www\.|(?:טלפון|טל:|נייד|דוא"ל|אימייל|email|e-mail|phone|mobile|contact))/i;
const TRAILING_SUFFIX_FOLLOW_UP_PATTERN = /(?:^|\s)(?:מנהל(?:ת)?|רכז(?:ת)?|אגף|מחלקה|יחידה|חוג|משרד|פקולטה|תוכנית|התוכנית|המחלקה|director|manager|coordinator|department|office|program|programme|faculty|team)\b/i;
const SUMMARY_OWNED_RECOMMENDATIONS_HEADING_PATTERN = /^(?:המלצות(?:\s+(?:מעשיות|להמשך|לביצוע))?|צעדים\s+הבאים|צעדי\s+המשך|שלבי\s+המשך|recommendations?|recommended\s+actions?|next\s+steps?|action\s+items?)$/i;
const TRAILING_REPAIR_TOKEN_PATTERN = /<!--[\s\S]*?-->|<h([1-6])\b[^>]*>[\s\S]*?<\/h\1>|<p\b[^>]*>[\s\S]*?<\/p>|<ul\b[^>]*>[\s\S]*?<\/ul>|<ol\b[^>]*>[\s\S]*?<\/ol>|<blockquote\b[^>]*>[\s\S]*?<\/blockquote>|<div\b[^>]*>[\s\S]*?<\/div>/gi;
const FIXED_SCAFFOLD_HEADING_PATTERN = /^(?:מבוא|פתיחה|פתח\s+דבר|רקע(?:\s+כללי)?|רקע\s+תיאורטי|דיון|גוף\s+העבודה|סיכום(?:\s+ומסקנות)?|מסקנות)$/i;

function detectDocumentStructurePolicy({ prompt = '', instructions = '' } = {}) {
  const combinedText = [String(prompt || '').trim(), String(instructions || '').trim()].filter(Boolean).join('\n');
  const noStructure = LOCAL_STRUCTURE_DIRECTIVE_PATTERN.test(combinedText);
  const noIntro = noStructure || LOCAL_NO_INTRO_PATTERN.test(combinedText);
  const flowingText = LOCAL_FLOWING_WRITING_PATTERN.test(combinedText);
  const noSummary = LOCAL_NO_SUMMARY_PATTERN.test(combinedText);
  const noHeadings = noStructure || flowingText || LOCAL_NO_HEADINGS_PATTERN.test(combinedText);
  const followAssignmentSections = LOCAL_ASSIGNMENT_SECTION_PATTERN.test(combinedText);
  const hasExplicitConstraints = noStructure || noIntro || noSummary || noHeadings || flowingText || followAssignmentSections;
  const directStructureLock = noStructure || noHeadings || flowingText || followAssignmentSections;
  return {
    combinedText,
    noStructure,
    noIntro,
    noSummary,
    noHeadings,
    flowingText,
    followAssignmentSections,
    hasExplicitConstraints,
    directStructureLock,
    structureLock: directStructureLock,
  };
}

function buildStructureLockInstructions(policy = null) {
  if (!policy?.hasExplicitConstraints) return '';
  const lines = [
    'הוראות המבנה המפורשות של המשתמש גוברות על כל סקיל, workflow, template, personal style או ברירת מחדל אחרת.',
  ];
  if (policy.followAssignmentSections) {
    lines.push('ארגן את התוכן רק לפי סעיפי המטלה שסופקו. אל תוסיף מבוא, סיכום או שלד אקדמי קבוע על דעת עצמך.');
  }
  if (policy.flowingText || policy.noHeadings) {
    lines.push('העדף כתיבה זורמת. אל תכפה כותרות ביניים, ראשי פרקים או outline שלא התבקשו במפורש.');
  }
  if (policy.noIntro) {
    lines.push('אל תוסיף מבוא, פתיח, פתיחה, פתח דבר או רקע כללי אלא אם הם נדרשו מפורשות.');
  }
  if (policy.noSummary) {
    lines.push('אל תוסיף סיכום, מסקנות או פסקת סיום מסכמת אלא אם הן נדרשו מפורשות.');
  }
  if (policy.noStructure && !policy.followAssignmentSections) {
    lines.push('אל תוסיף שלד קשיח, חלוקה אקדמית קבועה או כותרות ברירת מחדל שלא הופיעו בבקשת המשתמש.');
  }
  return lines.join('\n');
}

function stripHtmlTags(value = '') {
  return String(value || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isIgnorableStructuralTailFragment(fragmentHtml = '', visibleText = '') {
  const fragment = String(fragmentHtml || '').trim();
  if (!fragment) return true;
  if (/^<!--[\s\S]*?-->$/i.test(fragment)) return true;
  if (!/^<div\b/i.test(fragment)) return false;
  if (/\bdata-type\s*=\s*["']page-break["']/i.test(fragment)) return true;
  return !visibleText;
}

function tokenizeTrailingRepairFragments(html = '') {
  const source = String(html || '');
  return Array.from(source.matchAll(TRAILING_REPAIR_TOKEN_PATTERN)).map((match) => {
    const raw = match[0] || '';
    const start = match.index || 0;
    const end = start + raw.length;
    const headingLevelMatch = raw.match(/^<h([1-6])\b/i);
    const tagMatch = raw.match(/^<([a-z0-9-]+)/i);
    const tagName = headingLevelMatch
      ? `h${headingLevelMatch[1]}`
      : (tagMatch ? String(tagMatch[1] || '').toLowerCase() : (raw.trim().startsWith('<!--') ? 'comment' : ''));
    const visibleText = stripHtmlTags(raw);
    return {
      raw,
      start,
      end,
      tagName,
      headingLevel: headingLevelMatch ? Number(headingLevelMatch[1]) : null,
      visibleText,
      isStructural: isIgnorableStructuralTailFragment(raw, visibleText),
    };
  });
}

function isTrailingRepairContentToken(token = null) {
  return Boolean(token && !token.isStructural && token.raw);
}

function hasMeaningfulVisibleText(visibleText = '') {
  const normalizedText = String(visibleText || '').trim();
  if (!normalizedText) return false;
  const substantiveText = normalizedText.replace(/[^\u0590-\u05FFA-Za-z0-9]+/g, '');
  const wordCount = (normalizedText.match(/[\u0590-\u05FFA-Za-z0-9][\u0590-\u05FFA-Za-z0-9'"׳״.-]*/g) || []).length;
  return substantiveText.length >= 4 || wordCount >= 2;
}

function isMeaningfulTrailingRepairToken(token = null) {
  if (!isTrailingRepairContentToken(token)) return false;
  return hasMeaningfulVisibleText(token.visibleText);
}

function findLastNonStructuralTokenIndex(tokens = [], endIndex = tokens.length) {
  const limit = Math.max(0, Math.min(typeof endIndex === 'number' ? endIndex : tokens.length, tokens.length));
  for (let index = limit - 1; index >= 0; index -= 1) {
    if (!tokens[index]?.isStructural) return index;
  }
  return -1;
}

function extractTokenRangeHtml(source = '', tokens = [], startIndex = -1, endIndex = -1) {
  if (startIndex < 0 || endIndex <= startIndex || !tokens[startIndex] || !tokens[endIndex - 1]) return '';
  return String(source || '').slice(tokens[startIndex].start, tokens[endIndex - 1].end).trim();
}

function normalizeJoinedHtmlFragments(fragments = []) {
  return fragments.filter(Boolean).join('\n').replace(/(?:\s*\n){3,}/g, '\n\n').trim();
}

function isSummaryHeadingToken(token = null) {
  return Boolean(token?.headingLevel) && TRAILING_GENERIC_SUMMARY_HEADING_PATTERN.test(String(token.visibleText || '').trim());
}

function isSummaryAnchorToken(token = null) {
  return isTrailingRepairContentToken(token)
    && !token.headingLevel
    && isClearlySummaryLikeTrailingBlock(token.raw);
}

function isSummaryClusterAnchorToken(token = null) {
  return isSummaryHeadingToken(token) || isSummaryAnchorToken(token);
}

function isOperationalAmbiguousSummaryContinuation(visibleText = '') {
  const normalizedText = String(visibleText || '').trim();
  return Boolean(normalizedText) && TRAILING_OPERATIONAL_AMBIGUOUS_SUMMARY_CONTINUATION_PATTERN.test(normalizedText);
}

function isSummaryOwnedRecommendationsHeadingToken(token = null) {
  return Boolean(token?.headingLevel)
    && SUMMARY_OWNED_RECOMMENDATIONS_HEADING_PATTERN.test(String(token.visibleText || '').trim());
}

function isClearlySummaryLikeTrailingBlock(blockHtml = '', headingText = '') {
  const visibleText = stripHtmlTags(blockHtml);
  if (!visibleText) return false;
  if (TRAILING_SUMMARY_LIKE_BLOCK_PATTERN.test(visibleText)) return true;
  if (isOperationalAmbiguousSummaryContinuation(visibleText)) return false;
  if (TRAILING_AMBIGUOUS_SUMMARY_CUE_PATTERN.test(visibleText)) return true;
  return /<(?:ul|ol)\b/i.test(String(blockHtml || ''))
    && /(?:סיכום|מסקנות|המלצות|סיום)/i.test(String(headingText || '').trim());
}

function isExplicitNonSummaryTrailingBlock(blockHtml = '', headingText = '') {
  const visibleText = stripHtmlTags(blockHtml);
  if (!visibleText) return false;
  if (isOperationalAmbiguousSummaryContinuation(visibleText)) return true;
  if (isClearlySummaryLikeTrailingBlock(blockHtml, headingText)) return false;
  return TRAILING_EXPLICIT_NON_SUMMARY_BLOCK_PATTERN.test(visibleText)
    || TRAILING_OPERATIONAL_FOLLOW_UP_BLOCK_PATTERN.test(visibleText)
    || TRAILING_CONTACT_DETAILS_PATTERN.test(visibleText);
}

function findSummaryLikeClusterAfterHeading(tokens = [], headingIndex = -1, endIndex = tokens.length) {
  if (headingIndex < 0 || !tokens[headingIndex]?.headingLevel) return null;

  const limit = Math.max(headingIndex + 1, Math.min(typeof endIndex === 'number' ? endIndex : tokens.length, tokens.length));
  const headingText = String(tokens[headingIndex].visibleText || '').trim();
  let clusterStart = -1;
  let clusterEnd = -1;
  let usedHeadingOwnedFallback = false;
  let adoptedRecommendationsSubheading = false;

  for (let index = headingIndex + 1; index < limit; index += 1) {
    const token = tokens[index];
    if (!token) break;
    if (token.isStructural) continue;
    if (token.headingLevel) {
      if (clusterStart === -1 && isSummaryOwnedRecommendationsHeadingToken(token)) {
        clusterStart = index;
        clusterEnd = index + 1;
        usedHeadingOwnedFallback = true;
        adoptedRecommendationsSubheading = true;
        continue;
      }
      break;
    }
    if (adoptedRecommendationsSubheading) {
      clusterEnd = index + 1;
      continue;
    }
    if (isExplicitNonSummaryTrailingBlock(token.raw, headingText)) break;

    const clearlySummaryLike = isClearlySummaryLikeTrailingBlock(token.raw, headingText);
    const canUseHeadingOwnedFallback = !usedHeadingOwnedFallback && clusterStart === -1 && isMeaningfulTrailingRepairToken(token);
    if (!clearlySummaryLike && !canUseHeadingOwnedFallback) break;

    if (clusterStart === -1) clusterStart = index;
    clusterEnd = index + 1;
    if (!clearlySummaryLike) usedHeadingOwnedFallback = true;
  }

  return clusterStart === -1
    ? null
    : { startIndex: clusterStart, endIndex: clusterEnd };
}

function hasMeaningfulRepairedContent(html = '') {
  const source = String(html || '').trim();
  if (!source) return false;
  const tokens = tokenizeTrailingRepairFragments(source);
  const suffixRange = tokens.length ? findTrailingExplicitNonSummarySuffixRange(tokens) : null;
  const preSuffixVisibleText = stripHtmlTags(suffixRange ? source.slice(0, tokens[suffixRange.startIndex].start) : source);
  if (hasMeaningfulVisibleText(preSuffixVisibleText)) return true;
  return hasMeaningfulVisibleText(stripHtmlTags(source));
}

function isTrailingExplicitNonSummaryFollowUpToken(token = null) {
  if (!isTrailingRepairContentToken(token)) return false;
  if (!/^(?:p|div|blockquote)$/i.test(String(token.tagName || ''))) return false;
  const visibleText = String(token.visibleText || '').trim();
  if (!visibleText || isClearlySummaryLikeTrailingBlock(token.raw)) return false;
  const wordCount = visibleText.split(/\s+/).filter(Boolean).length;
  return TRAILING_CONTACT_DETAILS_PATTERN.test(visibleText)
    || TRAILING_SUFFIX_FOLLOW_UP_PATTERN.test(visibleText)
    || (wordCount <= 6 && visibleText.length <= 80 && !/[.!?](?:\s|$)/.test(visibleText));
}

function findTrailingExplicitNonSummarySuffixRange(tokens = [], endIndex = tokens.length) {
  const limit = Math.max(0, Math.min(typeof endIndex === 'number' ? endIndex : tokens.length, tokens.length));
  const lastContentIndex = findLastNonStructuralTokenIndex(tokens, limit);
  if (lastContentIndex === -1) return null;

  let anchorIndex = -1;
  for (let index = lastContentIndex; index >= 0; index -= 1) {
    const token = tokens[index];
    if (!token) break;
    if (token.isStructural) continue;
    if (isExplicitNonSummaryTrailingBlock(token.raw)) {
      anchorIndex = index;
      continue;
    }
    if (!isTrailingExplicitNonSummaryFollowUpToken(token)) break;
  }

  return anchorIndex === -1
    ? null
    : { startIndex: anchorIndex, endIndex: lastContentIndex + 1 };
}

function findTrailingSummaryLikeClusterRange(tokens = [], endIndex = tokens.length, stopIndex = -1) {
  const limit = Math.max(0, Math.min(typeof endIndex === 'number' ? endIndex : tokens.length, tokens.length));
  const lastContentIndex = findLastNonStructuralTokenIndex(tokens, limit);
  if (lastContentIndex === -1) return null;

  let anchorIndex = -1;
  for (let index = lastContentIndex; index > stopIndex; index -= 1) {
    const token = tokens[index];
    if (!token) break;
    if (token.isStructural) continue;
    if (isSummaryClusterAnchorToken(token)) {
      anchorIndex = index;
      continue;
    }
    if (token.headingLevel) break;
    if (anchorIndex !== -1 && isMeaningfulTrailingRepairToken(token)) break;
  }

  return anchorIndex === -1
    ? null
    : { startIndex: anchorIndex, endIndex: lastContentIndex + 1 };
}

function findSummaryLikeClusterImmediatelyBeforeBoundary(tokens = [], boundaryIndex = -1, stopIndex = -1) {
  if (boundaryIndex <= 0 || !tokens[boundaryIndex]?.raw) return null;
  const range = findTrailingSummaryLikeClusterRange(tokens, boundaryIndex, stopIndex);
  return range ? { startIndex: range.startIndex, endIndex: boundaryIndex } : null;
}

function stripLeadingGenericIntroSection(html = '') {
  const source = String(html || '').trim();
  if (!source) return source;
  const headingMatches = Array.from(source.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi));
  if (!headingMatches.length) return source;

  const introIndex = headingMatches.findIndex((match, index) => {
    if (index > 1) return false;
    return LEADING_GENERIC_INTRO_HEADING_PATTERN.test(stripHtmlTags(match[2]));
  });
  if (introIndex === -1) return source;

  const introMatch = headingMatches[introIndex];
  const introStart = introMatch.index || 0;
  const introEnd = introStart + introMatch[0].length;
  const nextHeading = headingMatches[introIndex + 1];
  if (!nextHeading) {
    const introParagraphsMatch = source.slice(introEnd).match(/^(?:\s*<p\b[^>]*>[\s\S]*?<\/p>){1,2}/i);
    const trimmedEnd = introEnd + (introParagraphsMatch?.[0]?.length || 0);
    return `${source.slice(0, introStart)}${source.slice(trimmedEnd)}`.trim();
  }

  return `${source.slice(0, introStart).trimEnd()}\n${source.slice(nextHeading.index || 0).trimStart()}`.trim();
}

function stripLeadingHeadingOnly(html = '', pattern = null) {
  const source = String(html || '').trim();
  if (!source || !(pattern instanceof RegExp)) return source;

  const headingMatches = Array.from(source.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi));
  const targetMatch = headingMatches.find((match, index) => index <= 1 && pattern.test(stripHtmlTags(match[2])));
  if (!targetMatch) return source;

  const matchStart = targetMatch.index || 0;
  const matchEnd = matchStart + targetMatch[0].length;
  return `${source.slice(0, matchStart)}${source.slice(matchEnd)}`.trim();
}

function unwrapSimpleTrailingRepairContainer(html = '') {
  const source = String(html || '').trim();
  if (!source || !/^<div\b/i.test(source) || !/<\/div>\s*$/i.test(source)) return null;

  const openTagMatch = source.match(/^<div\b[^>]*>/i);
  const closeTagMatch = source.match(/<\/div>\s*$/i);
  if (!openTagMatch || !closeTagMatch) return null;

  const openTag = openTagMatch[0];
  const closeTag = closeTagMatch[0].trim();
  const innerHtml = source.slice(openTag.length, source.length - closeTagMatch[0].length).trim();
  if (!innerHtml) return null;

  const innerTokenPattern = new RegExp(TRAILING_REPAIR_TOKEN_PATTERN.source, TRAILING_REPAIR_TOKEN_PATTERN.flags);
  const remainder = innerHtml.replace(innerTokenPattern, '').trim();
  if (remainder) return null;

  return { openTag, closeTag, innerHtml };
}

function rewrapSimpleTrailingRepairContainer(wrapper = null, innerHtml = '') {
  const body = String(innerHtml || '').trim();
  if (!wrapper?.openTag || !wrapper?.closeTag) return body;
  return body ? `${wrapper.openTag}${body}${wrapper.closeTag}`.trim() : '';
}

function stripTrailingGenericSummarySection(html = '') {
  const source = String(html || '').trim();
  if (!source) return source;

  const wrapper = unwrapSimpleTrailingRepairContainer(source);
  if (wrapper) {
    return rewrapSimpleTrailingRepairContainer(wrapper, stripTrailingGenericSummarySection(wrapper.innerHtml));
  }

  const tokens = tokenizeTrailingRepairFragments(source);
  if (!tokens.length) return source;

  const suffixRange = findTrailingExplicitNonSummarySuffixRange(tokens);
  const suffixStartSource = suffixRange ? tokens[suffixRange.startIndex].start : source.length;
  const contentLimit = suffixRange ? suffixRange.startIndex : tokens.length;

  let targetIndex = -1;
  for (let index = contentLimit - 1; index >= 0; index -= 1) {
    if (isSummaryHeadingToken(tokens[index])) {
      targetIndex = index;
      break;
    }
  }
  if (targetIndex === -1) return source;

  const targetToken = tokens[targetIndex];
  let immediateFollowerIndex = -1;
  for (let index = targetIndex + 1; index < contentLimit; index += 1) {
    if (!tokens[index] || tokens[index].isStructural) continue;
    immediateFollowerIndex = index;
    break;
  }
  const hasImmediateSummaryOwnedRecommendationsSubheading = immediateFollowerIndex !== -1
    && isSummaryOwnedRecommendationsHeadingToken(tokens[immediateFollowerIndex]);
  let nextHeadingIndex = -1;
  for (let index = targetIndex + 1; index < contentLimit; index += 1) {
    const token = tokens[index];
    if (!token?.headingLevel) continue;
    if (hasImmediateSummaryOwnedRecommendationsSubheading && index === immediateFollowerIndex) continue;
    if (!isSummaryHeadingToken(token)) {
      nextHeadingIndex = index;
      break;
    }
  }

  const localSummaryRange = (nextHeadingIndex === -1 || hasImmediateSummaryOwnedRecommendationsSubheading)
    ? findSummaryLikeClusterAfterHeading(tokens, targetIndex, contentLimit)
    : null;
  const middleStartSource = nextHeadingIndex === -1
    ? (localSummaryRange ? tokens[localSummaryRange.endIndex - 1].end : targetToken.end)
    : tokens[nextHeadingIndex].start;
  const preservedMiddle = source.slice(middleStartSource, suffixStartSource).trim();
  const preservedSuffix = suffixRange ? extractTokenRangeHtml(source, tokens, suffixRange.startIndex, suffixRange.endIndex) : '';

  return normalizeJoinedHtmlFragments([
    source.slice(0, targetToken.start).trimEnd(),
    preservedMiddle,
    preservedSuffix,
  ]);
}

function stripTrailingSummaryLikeBlocksWithoutHeading(html = '') {
  const source = String(html || '').trim();
  if (!source) return source;

  const wrapper = unwrapSimpleTrailingRepairContainer(source);
  if (wrapper) {
    return rewrapSimpleTrailingRepairContainer(wrapper, stripTrailingSummaryLikeBlocksWithoutHeading(wrapper.innerHtml));
  }

  const tokens = tokenizeTrailingRepairFragments(source);
  if (!tokens.length) return source;

  const suffixRange = findTrailingExplicitNonSummarySuffixRange(tokens);
  const contentLimit = suffixRange ? suffixRange.startIndex : tokens.length;
  const lastContentIndex = findLastNonStructuralTokenIndex(tokens, contentLimit);
  if (lastContentIndex === -1) return source;

  let lastHeadingIndex = -1;
  for (let index = lastContentIndex; index >= 0; index -= 1) {
    if (tokens[index]?.headingLevel) {
      lastHeadingIndex = index;
      break;
    }
  }

  const removalRanges = [];
  if (lastHeadingIndex !== -1 && lastHeadingIndex < lastContentIndex && !isSummaryHeadingToken(tokens[lastHeadingIndex])) {
    const preTailHeadingRange = findSummaryLikeClusterImmediatelyBeforeBoundary(tokens, lastHeadingIndex);
    if (preTailHeadingRange) removalRanges.push(preTailHeadingRange);
  }

  const trailingSummaryRange = findTrailingSummaryLikeClusterRange(tokens, contentLimit, lastHeadingIndex);
  if (trailingSummaryRange) removalRanges.push(trailingSummaryRange);
  if (!removalRanges.length) return source;

  removalRanges.sort((left, right) => left.startIndex - right.startIndex);
  const suffixStartSource = suffixRange ? tokens[suffixRange.startIndex].start : source.length;
  const preservedSuffix = suffixRange ? extractTokenRangeHtml(source, tokens, suffixRange.startIndex, suffixRange.endIndex) : '';
  const fragments = [];
  let cursor = 0;

  removalRanges.forEach((range) => {
    const startToken = tokens[range.startIndex];
    const endToken = tokens[range.endIndex - 1];
    if (!startToken || !endToken) return;
    fragments.push(source.slice(cursor, startToken.start).trimEnd());
    cursor = endToken.end;
  });

  fragments.push(source.slice(cursor, suffixStartSource).trimEnd());
  fragments.push(preservedSuffix);
  return normalizeJoinedHtmlFragments(fragments);
}

function repairGeneratedHtmlForStructurePolicy(html = '', policy = null) {
  if (!policy?.hasExplicitConstraints) return String(html || '').trim();

  let next = String(html || '').trim();
  if (!next) return next;

  if (policy.noIntro) {
    next = stripLeadingGenericIntroSection(next);
    next = stripLeadingHeadingOnly(next, LEADING_GENERIC_INTRO_HEADING_PATTERN);
  }

  if (policy.noSummary) {
    next = stripTrailingGenericSummarySection(next);
    next = stripTrailingSummaryLikeBlocksWithoutHeading(next);
  }

  if (!policy.noHeadings) {
    return next.replace(/(?:\s*\n){3,}/g, '\n\n').trim();
  }

  if (policy.noHeadings) {
    next = next.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, '<p>$2</p>');
    next = next.replace(/<p>\s*([^<]+?)\s*<\/p>/gi, (match, headingText) => (
      FIXED_SCAFFOLD_HEADING_PATTERN.test(String(headingText || '').trim()) ? '' : match
    ));
  }

  return next.replace(/(?:\s*\n){3,}/g, '\n\n').trim();
}

export async function generateDocumentFromPrompt({ prompt, templateId = 'blank', instructions = '', selectedMaterials = [], selectedModel, selectedProviderId = '', selectedProviderModel = '', additionalReviewRounds = 0, runId: providedRunId = '', returnMeta = false }) {
  const { cleanPrompt, cleanInstructions, title } = resolveGenerationRequestContext({ prompt, instructions, templateId });
  if (!cleanPrompt && !cleanInstructions) throw new Error('צריך לכתוב נושא קצר או הנחיות למסמך');
  const runId = String(providedRunId || `doc-${Date.now()}`).trim();
  const normalizedAdditionalReviewRounds = Math.max(0, Math.min(2, Number(additionalReviewRounds) || 0));
  const isAcademicTask = isLikelyAcademicDocumentRequest({ prompt: cleanPrompt, instructions: cleanInstructions, templateId });
  const structurePolicy = detectDocumentStructurePolicy({ prompt: cleanPrompt, instructions: cleanInstructions });
  const structureLockInstructions = buildStructureLockInstructions(structurePolicy);
  const automation = getWorkspaceAutomation();
  const requestedProviderSelection = resolveRequestedProviderSelection({ selectedModel, selectedProviderId, selectedProviderModel });
  const activeWorkflowAgents = getOrderedRoleAgents(automation?.workflowMode);
  const hasActiveWorkflowAgents = Array.isArray(activeWorkflowAgents) && activeWorkflowAgents.length > 0;
  const noActiveWorkflowAutomation = automation?.enabled === true
    && automation?.autoDispatch !== false
    && !hasActiveWorkflowAgents;
  const shouldUseWorkflowAutomation = shouldUseDocumentWorkflowAutomation({
    automation,
    directStructureLock: structurePolicy.directStructureLock,
  });
  const documentRunLabel = getDocumentRunLabel({
    automation,
    selectedModel,
    selectedProviderId: requestedProviderSelection.providerId,
    selectedProviderModel: requestedProviderSelection.providerModel,
    directStructureLock: structurePolicy.directStructureLock,
    shouldUseWorkflowAutomation,
  });
  const requestWorkspaceId = String(automation?.activeWorkspaceId || '').trim();
  const requestWorkspaceName = String(automation?.workspaceName || '').trim();
  const requestLogContext = {
    activeWorkspaceId: requestWorkspaceId,
    workspaceName: requestWorkspaceName,
  };

  let templateGuide = TEMPLATE_GUIDES[templateId] || TEMPLATE_GUIDES.blank;
  let notes = '';
  let materialsText = '';

  try {
    const learning = await syncLearnedStyleFromWorkspace();

    templateGuide = TEMPLATE_GUIDES[templateId] || TEMPLATE_GUIDES.blank;
    notes = learning.notes?.join('\n') || '';
    materialsText = await buildEffectiveMaterialsContext({
      selectedMaterials,
      requestText: [cleanPrompt, cleanInstructions].filter(Boolean).join('\n'),
      allowAutoSelection: false,
    });
  } catch (error) {
    logAgentDebugEvent({
      type: 'doc-generation-preparation-error',
      state: 'error',
      runId,
      agentLabel: documentRunLabel,
      message: 'שגיאה מפורשת בשלב הכנת העבודה לפני קריאת API',
      errorMessage: error?.message || 'שגיאה לא ידועה',
      ...requestLogContext,
    });
    const fallbackHtml = buildLocalDraft(cleanPrompt, templateId, cleanInstructions, selectedMaterials);
    return returnMeta
      ? { html: fallbackHtml, usedFallback: true, runId, errorMessage: error?.message || 'שגיאה לא ידועה', title }
      : fallbackHtml;
  }

  try {
    logAgentDebugEvent({
      type: 'doc-generation-start',
      state: 'running',
      runId,
      agentLabel: documentRunLabel,
      message: 'התחילה יצירת מסמך חדש',
      templateId,
      selectedMaterialsCount: selectedMaterials.length,
      ...requestLogContext,
    });

    const suppressVisibleAgentNotes = structurePolicy.noSummary || structurePolicy.directStructureLock;
    const requestOptions = {
      runId,
      agentLabel: documentRunLabel,
      activeWorkspaceId: requestWorkspaceId,
      workspaceName: requestWorkspaceName,
      structureConstraintText: [cleanInstructions, cleanPrompt].filter(Boolean).join('\n').trim(),
      expectDocumentOutput: true,
      templateId,
      isAcademicTask,
      additionalReviewRounds: normalizedAdditionalReviewRounds,
      maxContinuationPasses: Math.max(2, Math.min(4, 2 + normalizedAdditionalReviewRounds)),
      appendAgentNotesToOutput: suppressVisibleAgentNotes ? false : automation?.appendAgentNotesToOutput === true,
      agentNotesInstruction: !suppressVisibleAgentNotes && automation?.appendAgentNotesToOutput === true
        ? String(automation?.agentNotesInstruction || '').trim()
        : '',
    };
    if (structurePolicy.directStructureLock) {
      requestOptions.strictFormatting = true;
      requestOptions.skipAutomation = true;
      requestOptions.skipAutomationPrompt = true;
      requestOptions.skipSkillSelection = true;
      requestOptions.skipMultiModel = true;
      requestOptions.omitPersonalStyleStructureHints = true;
    }
    if (noActiveWorkflowAutomation) {
      requestOptions.automationSkipReason = 'noActiveAgents';
    }
    if (requestedProviderSelection.providerId && shouldUseWorkflowAutomation === false) {
      requestOptions.providerOverride = requestedProviderSelection.providerId;
      requestOptions.strictProviderOverride = true;
      if (requestedProviderSelection.providerModel) requestOptions.modelOverride = requestedProviderSelection.providerModel;
    }

    const userRequestSections = [];
    if (cleanInstructions) {
      userRequestSections.push(`הוראות המשתמש המחייבות למסמך:\n${cleanInstructions}`);
      if (cleanPrompt) userRequestSections.push(`נושא קצר או הקשר משלים:\n${cleanPrompt}`);
    } else {
      userRequestSections.push(`בקשת המשתמש למסמך:\n${cleanPrompt}`);
    }

    const userPrompt = userRequestSections.join('\n\n');
    const systemPrompt = `תפקידך לבנות מסמך שלם מוכן לעריכה בתוך WordFlow AI. החזר HTML בלבד עם תגיות כמו h1, h2, p, ul, li.\nכאשר צריך מעבר עמוד, הדפס בדיוק: <div data-type="page-break"></div>\nסוג תבנית מועדף: ${templateGuide}.${cleanInstructions ? `\nהנחיות מחייבות של המשתמש:\n${cleanInstructions}` : ''}\nאל תחזיר למשתמש את קובץ ההנחיות או חומרי העזר כפי שהם. השתמש בהם רק כהכוונה לבניית המסמך.\nאם חסר מידע עובדתי או מבני, אל תמציא — השאר כותרת בלבד או מקום ריק.\nכלל עליון: עקוב בדיוק אחרי הוראות המשתמש והמבנה שהתבקש.\nאם המשתמש ביקש מבוא - כתוב מבוא.\nאם המשתמש לא ביקש מבוא - אל תוסיף מבוא.\nאם המשתמש ביקש פרקים - כתוב פרקים לפי הבקשה.\nאם המשתמש לא ביקש פרקים - אל תוסיף פרקים קבועים על דעת עצמך.\nאם המשתמש ביקש היקף מסוים, מספר שאלות מסוים, או מבנה מדויק - שמור עליהם במדויק.\nאל תכפה מבנה אקדמי ברירת מחדל כמו "מבוא / דיון / סיכום" אלא אם המשתמש ביקש אותו במפורש.${structureLockInstructions ? `\nנעילת מבנה מפורשת:\n${structureLockInstructions}` : ''}${notes ? `\nלמידה מעבודות קודמות:\nנא לשים לב: ההערות הבאות הן תצפיות על סגנון כתיבה קודם בלבד, לא הנחיות מבנה. כללי המבנה שלעיל גוברים עליהן.\n${notes}` : ''}`;

    const cleanedResponse = await requestGeneratedHtmlResponseWithSingleContinuation({
      userPrompt,
      context: materialsText,
      systemPrompt,
      requestOptions,
      operationLabel: 'יצירת המסמך',
      continuationPrompt: 'השלם רק את המשך ה-HTML החסר של המסמך שכבר התחלת, בלי לחזור על ההתחלה ובלי markdown.',
      runId,
      agentLabel: documentRunLabel,
      requestLogContext,
    });
    const repairedResponse = repairGeneratedHtmlForStructurePolicy(cleanedResponse, structurePolicy);
    const usedStructurePolicyRepair = (structurePolicy.noIntro || structurePolicy.noSummary || structurePolicy.noHeadings) && repairedResponse !== cleanedResponse;
    const repairedResponseHasMeaningfulContent = hasMeaningfulRepairedContent(repairedResponse);
    const finalResponse = usedStructurePolicyRepair
      ? repairedResponse
      : repairedResponse.replace(/<[^>]+>/g, '').trim().length >= 10
        ? repairedResponse
        : cleanedResponse;

    if (!finalResponse || (usedStructurePolicyRepair ? !repairedResponseHasMeaningfulContent : stripHtmlTags(finalResponse).length < 10)) {
      throw new Error('התקבלה תשובה ריקה או לא שמישה מהמודל');
    }

    ensureCompleteGeneratedHtmlResponse(finalResponse, 'יצירת המסמך');

    if (finalResponse !== cleanedResponse) {
      logAgentDebugEvent({
        type: 'doc-generation-structure-repair',
        state: 'success',
        runId,
        agentLabel: documentRunLabel,
        message: 'בוצע תיקון ממוקד למסמך כדי לכבד נעילת מבנה מפורשת של המשתמש',
        outputChars: finalResponse.length,
        ...requestLogContext,
      });
    }

    logAgentDebugEvent({
      type: 'doc-generation-success',
      state: 'success',
      runId,
      agentLabel: documentRunLabel,
      message: 'המסמך נוצר בהצלחה דרך ה-API',
      outputChars: finalResponse.length,
      ...requestLogContext,
    });

    return returnMeta
      ? { html: finalResponse, usedFallback: false, runId, errorMessage: '', title }
      : finalResponse;
  } catch (error) {
    logAgentDebugEvent({
      type: 'doc-generation-api-error',
      state: 'error',
      runId,
      agentLabel: documentRunLabel,
      message: 'שגיאה מפורשת בבקשת API במהלך יצירת המסמך',
      errorMessage: error?.message || 'שגיאה לא ידועה',
      ...requestLogContext,
    });
    logAgentDebugEvent({
      type: 'doc-generation-fallback',
      state: 'error',
      runId,
      agentLabel: documentRunLabel,
      message: 'יצירת המסמך עברה לשלד מקומי במקום תשובת AI',
      errorMessage: error?.message || 'שגיאה לא ידועה',
      ...requestLogContext,
    });
    const fallbackHtml = buildLocalDraft(cleanPrompt, templateId, cleanInstructions, selectedMaterials);
    return returnMeta
      ? { html: fallbackHtml, usedFallback: true, runId, errorMessage: error?.message || 'שגיאה לא ידועה', title }
      : fallbackHtml;
  }
}

async function prepareFeedbackDrivenDocumentContext({
  originalPrompt = '',
  supportingText = '',
  templateId = 'blank',
  selectedMaterials = [],
  allowAutoSelectedMaterials = true,
  includeLearnedNotes = true,
  forceDirectMode = false,
  providedRunId = '',
  runIdPrefix = 'doc-feedback',
  automatedLabel = 'עדכון מסמך ב-workflow',
  directLabel = 'עדכון ישיר',
  preparationErrorType = 'doc-feedback-preparation-error',
  preparationErrorMessage = 'שגיאה מפורשת בשלב הכנת עדכון המסמך לפני קריאת API',
}) {
  const automation = getWorkspaceAutomation();
  const activeWorkflowAgents = getOrderedRoleAgents(automation?.workflowMode);
  const hasActiveWorkflowAgents = Array.isArray(activeWorkflowAgents) && activeWorkflowAgents.length > 0;
  const noActiveWorkflowAutomation = automation?.enabled === true
    && automation?.autoDispatch !== false
    && !hasActiveWorkflowAgents;
  const shouldUseWorkflowAutomation = !forceDirectMode
    && automation?.enabled === true
    && automation?.autoDispatch !== false
    && hasActiveWorkflowAgents;
  const requestWorkspaceId = String(automation?.activeWorkspaceId || '').trim();
  const requestWorkspaceName = String(automation?.workspaceName || '').trim();
  const requestLogContext = {
    activeWorkspaceId: requestWorkspaceId,
    workspaceName: requestWorkspaceName,
  };
  const templateGuide = TEMPLATE_GUIDES[templateId] || TEMPLATE_GUIDES.blank;
  const runId = String(providedRunId || `${runIdPrefix}-${Date.now()}`).trim();
  const agentLabel = shouldUseWorkflowAutomation ? automatedLabel : directLabel;
  let notes = '';
  let materialsText = '';

  try {
    if (includeLearnedNotes) {
      const learning = await syncLearnedStyleFromWorkspace();
      notes = learning.notes?.join('\n') || '';
    }
    materialsText = await buildEffectiveMaterialsContext({
      selectedMaterials,
      requestText: [originalPrompt, supportingText].filter(Boolean).join('\n'),
      allowAutoSelection: allowAutoSelectedMaterials,
    });
  } catch (error) {
    logAgentDebugEvent({
      type: preparationErrorType,
      state: 'error',
      runId,
      agentLabel,
      message: preparationErrorMessage,
      errorMessage: error?.message || 'שגיאה לא ידועה',
      ...requestLogContext,
    });

    return {
      shouldUseWorkflowAutomation,
      noActiveWorkflowAutomation,
      requestWorkspaceId,
      requestWorkspaceName,
      requestLogContext,
      templateGuide,
      runId,
      agentLabel,
      notes: '',
      materialsText: '',
      preparationError: error,
    };
  }

  return {
    shouldUseWorkflowAutomation,
    noActiveWorkflowAutomation,
    requestWorkspaceId,
    requestWorkspaceName,
    requestLogContext,
    templateGuide,
    runId,
    agentLabel,
    notes,
    materialsText,
    preparationError: null,
  };
}

export async function reviseDocumentWithFeedback({ existingHtml = '', feedback = '', originalPrompt = '', templateId = 'blank', selectedMaterials = [], selectedModel = '', selectedProviderId = '', selectedProviderModel = '', additionalReviewRounds = 0, runId: providedRunId = '', returnMeta = false, forceDirectMode = true }) {
  const cleanHtml = String(existingHtml || '').trim();
  const cleanFeedback = String(feedback || '').trim();
  const requestedProviderSelection = resolveRequestedProviderSelection({ selectedModel, selectedProviderId, selectedProviderModel });
  const normalizedAdditionalReviewRounds = Math.max(0, Math.min(2, Number(additionalReviewRounds) || 0));
  const isAcademicTask = isLikelyAcademicDocumentRequest({ prompt: originalPrompt, instructions: cleanFeedback, templateId });
  if (!cleanHtml) throw new Error('אין מסמך פתוח לעדכון');
  if (!cleanFeedback) throw new Error('צריך לבחור משוב או לכתוב הערה חופשית');

  const {
    shouldUseWorkflowAutomation,
    noActiveWorkflowAutomation,
    requestWorkspaceId,
    requestWorkspaceName,
    requestLogContext,
    templateGuide,
    runId,
    agentLabel: documentUpdateLabel,
    notes,
    materialsText,
    preparationError,
  } = await prepareFeedbackDrivenDocumentContext({
    originalPrompt,
    supportingText: cleanFeedback,
    templateId,
    selectedMaterials,
    allowAutoSelectedMaterials: false,
    forceDirectMode,
    providedRunId,
    runIdPrefix: 'doc-feedback',
    automatedLabel: 'עדכון מסמך ב-workflow',
    directLabel: 'עדכון ישיר',
    preparationErrorType: 'doc-feedback-preparation-error',
    preparationErrorMessage: 'שגיאה מפורשת בשלב הכנת עדכון המסמך לפני קריאת API',
  });

  if (preparationError) {
    return returnMeta
      ? { html: cleanHtml, usedFallback: true, runId, errorMessage: preparationError?.message || 'שגיאה לא ידועה' }
      : cleanHtml;
  }

  const revisionPreservationContract = 'חוזה מחייב לעדכון: החזר תמיד את המסמך המלא מתחילתו ועד סופו, גם אם התיקון נוגע רק בפסקה אחת. אסור להחזיר רק fragment, רק קטע מתוקן, או רק את ההמשך החסר. ברירת המחדל היא שימור: כל חלק שלא התבקש להשתנות צריך להישאר באותה משמעות, באותו סדר ובאותו מבנה; אם אין סיבה חזקה לשנות ניסוח קיים, השאר אותו כפי שהוא.';
  const systemPrompt = shouldUseWorkflowAutomation
    ? `עדכן את המסמך הקיים בהתאם למשוב המשתמש. החזר HTML בלבד עם תגיות כמו h1, h2, p, ul, li. שמור על כל מידע טוב שכבר קיים, ותקן רק מה שנדרש לפי המשוב. אם חסר מידע עובדתי, אל תמציא — השאר כותרות או ניסוח זהיר. אל תוסיף מבוא, סיכום, כותרות קבועות או חלקים חדשים שלא קיימים במסמך המקורי אם המשתמש לא ביקש זאת. ${revisionPreservationContract} סוג תבנית מועדף: ${templateGuide}.${materialsText ? '\nאם סופקו חומרי עזר, השתמש בהם רק כהקשר משלים לעדכון המסמך.' : ''}${notes ? `\nסגנון שנלמד מעבודות קודמות:\nנא לשים לב: ההערות הבאות הן תצפיות על סגנון כתיבה קודם בלבד, לא הנחיות מבנה. כללי המבנה של המסמך הקיים והמשוב גוברים עליהן.\n${notes}` : ''}`
    : `פעל כעורך ישיר של WordFlow AI. קרא את המשוב, ועדכן בעצמך את המסמך הקיים בהתאם בלי לתאם עם צוות ובלי לפרק את המשימה לשלבים. החזר HTML בלבד עם תגיות כמו h1, h2, p, ul, li. שמור על כל מידע טוב שכבר קיים, ותקן רק מה שנדרש לפי המשוב. אם חסר מידע עובדתי, אל תמציא — השאר כותרות או ניסוח זהיר. אל תוסיף מבוא, סיכום, כותרות קבועות או חלקים חדשים שלא קיימים במסמך המקורי אם המשתמש לא ביקש זאת. ${revisionPreservationContract} סוג תבנית מועדף: ${templateGuide}.${materialsText ? '\nאם סופקו חומרי עזר, השתמש בהם רק כהקשר משלים לעדכון המסמך.' : ''}${notes ? `\nסגנון שנלמד מעבודות קודמות:\nנא לשים לב: ההערות הבאות הן תצפיות על סגנון כתיבה קודם בלבד, לא הנחיות מבנה. כללי המבנה של המסמך הקיים והמשוב גוברים עליהן.\n${notes}` : ''}`;

  try {
    logAgentDebugEvent({
      type: 'doc-feedback-start',
      state: 'running',
      runId,
      agentLabel: documentUpdateLabel,
      message: shouldUseWorkflowAutomation ? 'התחיל עדכון המסמך לפי המשוב דרך workflow' : 'התחיל עדכון ישיר של המסמך לפי המשוב',
      templateId,
      selectedMaterialsCount: selectedMaterials.length,
      ...requestLogContext,
    });

    const fullRevisionContext = buildFeedbackDrivenRequestContext({
      originalPrompt,
      supportingText: cleanFeedback,
      supportingLabel: 'משוב המשתמש',
      materialsText,
      existingHtml: cleanHtml,
      htmlLabel: 'המסמך הקיים ב-HTML',
      truncateHtml: false,
    });
    const shouldPreserveFullRevisionContext = fullRevisionContext.length <= FEEDBACK_CONTEXT_TOTAL_LIMIT;
    const revisionContext = shouldPreserveFullRevisionContext
      ? fullRevisionContext
      : buildFeedbackDrivenRequestContext({
        originalPrompt,
        supportingText: cleanFeedback,
        supportingLabel: 'משוב המשתמש',
        materialsText,
        existingHtml: cleanHtml,
        htmlLabel: 'המסמך הקיים ב-HTML',
        truncateHtml: true,
      });

    const requestOptions = {
      runId,
      agentLabel: documentUpdateLabel,
      activeWorkspaceId: requestWorkspaceId,
      workspaceName: requestWorkspaceName,
      expectDocumentOutput: true,
      documentFallbackHtml: cleanHtml,
      structureConstraintText: cleanFeedback,
      preserveFullDocumentContext: shouldPreserveFullRevisionContext,
      templateId,
      isAcademicTask,
      additionalReviewRounds: normalizedAdditionalReviewRounds,
      maxContinuationPasses: Math.max(2, Math.min(4, 2 + normalizedAdditionalReviewRounds)),
    };
    if (!shouldUseWorkflowAutomation) {
      requestOptions.skipAutomation = true;
      requestOptions.skipAutomationPrompt = true;
      requestOptions.skipSkillSelection = true;
      requestOptions.skipMultiModel = true;
    }
    if (noActiveWorkflowAutomation) {
      requestOptions.automationSkipReason = 'noActiveAgents';
    }
    if (requestedProviderSelection.providerId && !shouldUseWorkflowAutomation) {
      requestOptions.providerOverride = requestedProviderSelection.providerId;
      requestOptions.strictProviderOverride = true;
      if (requestedProviderSelection.providerModel) requestOptions.modelOverride = requestedProviderSelection.providerModel;
    }

    const cleanedResponse = await requestGeneratedHtmlResponseWithSingleContinuation({
      userPrompt: 'שפר את המסמך הקיים בהתאם למשוב המשתמש',
      context: revisionContext,
      systemPrompt,
      requestOptions,
      operationLabel: 'עדכון המסמך',
      continuationPrompt: 'השלם רק את המשך ה-HTML החסר של המסמך המעודכן, בלי לחזור על ההתחלה ובלי markdown.',
      runId,
      agentLabel: documentUpdateLabel,
      requestLogContext,
    });

    const validatedResponse = ensureCompleteGeneratedHtmlResponse(cleanedResponse, 'עדכון המסמך');
    const suspiciousRevisionIssue = findSuspiciousRevisionOutputIssue({
      existingHtml: cleanHtml,
      revisedHtml: validatedResponse,
      feedback: cleanFeedback,
    });
    if (suspiciousRevisionIssue) {
      throw new Error(`${suspiciousRevisionIssue}. עצרתי כדי לא לדרוס את המסמך המלא הקיים.`);
    }

    logAgentDebugEvent({
      type: 'doc-feedback-success',
      state: 'success',
      runId,
      agentLabel: documentUpdateLabel,
      message: shouldUseWorkflowAutomation ? 'המסמך עודכן לפי המשוב דרך workflow' : 'המסמך עודכן ישירות לפי המשוב',
      outputChars: validatedResponse.length,
      ...requestLogContext,
    });

    return returnMeta
      ? { html: validatedResponse, usedFallback: false, runId, errorMessage: '' }
      : validatedResponse;
  } catch (error) {
    logAgentDebugEvent({
      type: 'doc-feedback-fallback',
      state: 'error',
      runId,
      agentLabel: documentUpdateLabel,
      message: shouldUseWorkflowAutomation ? 'עדכון המסמך דרך workflow לא הושלם' : 'העדכון הישיר של המסמך לא הושלם',
      errorMessage: error?.message || 'שגיאה לא ידועה',
      ...requestLogContext,
    });

    return returnMeta
      ? { html: cleanHtml, usedFallback: true, runId, errorMessage: error?.message || 'שגיאה לא ידועה' }
      : cleanHtml;
  }
}

export async function reviewDocumentRecommendations({ existingHtml = '', originalPrompt = '', templateId = 'blank', selectedMaterials = [], selectedModel = '', selectedProviderId = '', selectedProviderModel = '', runId: providedRunId = '', returnMeta = false, feedback = '', focus = '' }) {
  const cleanHtml = String(existingHtml || '').trim();
  const cleanFocus = [String(focus || '').trim(), String(feedback || '').trim()].filter(Boolean).join('\n\n');
  const requestedProviderSelection = resolveRequestedProviderSelection({ selectedModel, selectedProviderId, selectedProviderModel });
  if (!cleanHtml) throw new Error('אין מסמך פתוח לבדיקה');

  const {
    shouldUseWorkflowAutomation,
    requestWorkspaceId,
    requestWorkspaceName,
    requestLogContext,
    templateGuide,
    runId,
    agentLabel: documentReviewLabel,
    notes,
    materialsText,
    preparationError,
  } = await prepareFeedbackDrivenDocumentContext({
    originalPrompt,
    supportingText: cleanFocus,
    templateId,
    selectedMaterials,
    allowAutoSelectedMaterials: false,
    includeLearnedNotes: false,
    forceDirectMode: true,
    providedRunId,
    runIdPrefix: 'doc-review',
    automatedLabel: 'סקירת טיוטה',
    directLabel: 'סקירת טיוטה',
    preparationErrorType: 'doc-review-preparation-error',
    preparationErrorMessage: 'שגיאה מפורשת בשלב הכנת סקירת הטיוטה לפני קריאת API',
  });

  if (preparationError) {
    const fallback = buildDocumentReviewFallback({
      focusText: cleanFocus,
      errorMessage: preparationError?.message || 'שגיאה לא ידועה',
    });
    return returnMeta
      ? { ...fallback, runId }
      : { summary: fallback.summary, suggestions: fallback.suggestions };
  }

  const systemPrompt = `פעל כמבקר טיוטות ישיר של WordFlow AI. החזר המלצות עריכה בלבד, בלי לשכתב את המסמך, בלי להחזיר HTML ובלי לבצע שינוי בפועל. החזר JSON בלבד במבנה הזה: {"summary":"...","suggestions":[{"title":"...","reason":"...","suggestedChange":"..."}]}. summary חייב להיות קצר. suggestions חייבת להכיל בין 3 ל-6 פריטים קצרים, מעשיים ולא חופפים. כל suggestion חייב לכלול title, reason, suggestedChange. אל תחזיר Markdown, הסברים מחוץ ל-JSON או code fences. אם המשתמש נתן מיקוד, תעדף אותו; אחרת בצע סקירה כללית לטיוטה. סוג תבנית מועדף: ${templateGuide}.${materialsText ? '\nאם סופקו חומרי עזר מפורשים, השתמש בהם רק כהקשר משלים לבדיקה.' : ''}${notes ? `\nסגנון שנלמד מעבודות קודמות:\nנא לשים לב: ההערות הבאות הן תצפיות על סגנון כתיבה קודם בלבד. הן יכולות לכוון את ההמלצות, אך תוכן הטיוטה והמיקוד של המשתמש גוברים עליהן.\n${notes}` : ''}`;

  try {
    logAgentDebugEvent({
      type: 'doc-review-start',
      state: 'running',
      runId,
      agentLabel: documentReviewLabel,
      message: 'התחילה סקירת טיוטה עם המלצות עריכה',
      templateId,
      selectedMaterialsCount: selectedMaterials.length,
      ...requestLogContext,
    });

    const requestOptions = {
      runId,
      agentLabel: documentReviewLabel,
      activeWorkspaceId: requestWorkspaceId,
      workspaceName: requestWorkspaceName,
      structureConstraintText: cleanFocus || 'סקירת טיוטה עם המלצות עריכה בלבד',
      strictFormatting: true,
    };
    if (!shouldUseWorkflowAutomation) {
      requestOptions.skipAutomation = true;
      requestOptions.skipAutomationPrompt = true;
      requestOptions.skipSkillSelection = true;
      requestOptions.skipMultiModel = true;
    }
    if (requestedProviderSelection.providerId) {
      requestOptions.providerOverride = requestedProviderSelection.providerId;
      requestOptions.strictProviderOverride = true;
      if (requestedProviderSelection.providerModel) requestOptions.modelOverride = requestedProviderSelection.providerModel;
    }

    const reviewContext = buildFeedbackDrivenRequestContext({
      originalPrompt,
      supportingText: cleanFocus || 'בצע סקירה כללית למסמך והצע שיפורים לא מחייבים.',
      supportingLabel: 'מיקוד מהמשתמש לבדיקה',
      materialsText,
      existingHtml: cleanHtml,
      htmlLabel: 'המסמך הקיים ב-HTML',
      truncateHtml: true,
    });

    const response = await chatWithActiveProvider(
      'הכן המלצות עריכה לא מחייבות לטיוטה הקיימת',
      reviewContext,
      systemPrompt,
      requestOptions,
    );

    if (TRUNCATED_RESPONSE_MARKER_PATTERN.test(String(response || ''))) {
      throw new Error('התקבלו המלצות חלקיות או קטועות מהמודל');
    }

    const parsedResponse = normalizeReviewSuggestionsPayload(tryParseJsonObjectResponse(response));
    if (!parsedResponse) {
      throw new Error('התקבלה תשובת המלצות ריקה או לא שמישה');
    }

    logAgentDebugEvent({
      type: 'doc-review-success',
      state: 'success',
      runId,
      agentLabel: documentReviewLabel,
      message: 'סקירת הטיוטה הושלמה בהצלחה',
      outputChars: JSON.stringify(parsedResponse).length,
      ...requestLogContext,
    });

    return returnMeta
      ? { ...parsedResponse, usedFallback: false, runId, errorMessage: '' }
      : parsedResponse;
  } catch (error) {
    logAgentDebugEvent({
      type: 'doc-review-fallback',
      state: 'error',
      runId,
      agentLabel: documentReviewLabel,
      message: 'סקירת הטיוטה לא הושלמה',
      errorMessage: error?.message || 'שגיאה לא ידועה',
      ...requestLogContext,
    });

    const fallback = buildDocumentReviewFallback({
      focusText: cleanFocus,
      errorMessage: error?.message || 'שגיאה לא ידועה',
    });
    return returnMeta
      ? { ...fallback, runId }
      : { summary: fallback.summary, suggestions: fallback.suggestions };
  }
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function saveHelperMaterial(file, options = {}) {
  if (!file) throw new Error('לא נבחר קובץ');
  const meta = getMaterialUploadMeta(options.uploadKind || options.id || 'general');
  const previewMeta = await extractHelperMaterialPreview(file, MATERIAL_PREVIEW_MAX_LENGTH);
  const arrayBuffer = await file.arrayBuffer();
  const payload = {
    name: file.name,
    title: file.name,
    dataBase64: arrayBufferToBase64(arrayBuffer),
    uploadKind: meta.id,
    label: meta.label,
    category: meta.category,
    templateId: meta.templateId,
    learningHint: meta.learningHint,
    previewText: previewMeta.previewText,
    previewChars: previewMeta.previewChars,
    previewStatus: previewMeta.previewStatus,
    previewSource: previewMeta.previewSource,
    previewError: previewMeta.previewError,
    extractedChars: previewMeta.extractedChars,
    extractionStatus: previewMeta.extractionStatus,
    extractionMessage: previewMeta.extractionMessage,
    extractionTruncated: previewMeta.extractionTruncated,
  };

  if (window.desktopApp?.saveLocalMaterial) {
    return window.desktopApp.saveLocalMaterial(payload);
  }

  const response = await fetch('/api/materials/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'upload failed');
    throw new Error(errorText || 'upload failed');
  }

  return response.json();
}
