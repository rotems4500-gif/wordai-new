import React, { useState, useRef, useEffect, useCallback } from "react";
import { chatWithActiveProvider, getConfiguredProviderChoices, getOrderedRoleAgents, chatWithRoleAgent, getWorkspaceAutomation, getAgentDebugLogs, clearAgentDebugLogs, getSkillCatalog, getSkillsConfig, getAppMemory, saveAppMemory, getActiveProviderName, getProviderConfig, getProviderModelChoices, normalizeProviderModelName, getWorkspacesLibrary, switchToWorkspace, setWorkspaceBypassEnabled, DEFAULT_WORKSPACES_LIBRARY, DEFAULT_SIDEBAR_MODE_IDS, normalizeSidebarModeSettings, parseStructuredEditBatchResponse, getHumanizerPreferences, saveHumanizerPreferences, getPersonalStyleProfile } from "./services/aiService";
import { readInstructionFile } from "./services/workspaceLearningService";
import { getProjectForDocument, buildProjectContextBlock, summarizeConversationForMemory, appendProjectMemory, isSupportedExternalChatShareUrl, PROJECTS_UPDATED_EVENT } from "./services/projectService";
import { scoreTextAuthenticity, formatAuthenticityResultText } from "./services/styleAuthenticityService";
import { runHumanizerLoop, STEALTH_HUMANIZE_GUIDE } from "./services/humanizerLoopService";
import { showToast } from "./services/uiFeedback";
import { AGENTS_CONFIG } from "./agentConfig";
import { buildSourcesQueryOverride as buildSourcesQueryOverridePure, isSourcesNewsRequest as isSourcesNewsRequestPure, buildHoleFillSourceQueryOverride as buildHoleFillSourceQueryOverridePure } from "./services/sourceQueryBuilder";
import { startRunScope, getActiveRunScope, endRunScope, setScopeTopic } from "./v3/orchestration/runScope";
import { detectSourceCheckRequest, runChatSourceCheck, formatSourceCheckContext } from "./services/chatSourceCheck";
import { classifyChatScope } from "./services/chatScope";
import { resolveStrongGeneralModelForProvider, parseAiAppendixResponse, buildPersonalStyleVoiceBlock } from "./services/aiService";
import { isV3FlagEnabled } from "./v3/flags";
import OneAxisAirHockeyGame from './OneAxisAirHockeyGame';
import { toggleTheme, getTheme, onThemeChange } from './theme';

const CONTEXT_PROMPTS = [
  '🤔 נראה ארוך אה?',
  '📚 יש מקור למה שאמרתי?', 
  '💡 תחדד לי את זה',
  '🎓 תן ניסוח אקדמי',
  '✂️ תקצר בלי לפגוע בטיעון',
  '🚀 איך ממשיכים מכאן?',
];

// Enhanced action categories with better organization and visual identity
const ACTION_CATEGORIES = {
  edit: { 
    title: '✂️ עריכה מדויקת', 
    subtitle: 'תיקון ושיפור הטקסט הנבחר',
    gradient: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 127, 0.1) 100%)',
    borderColor: 'rgba(239, 68, 68, 0.3)'
  },
  style: { 
    title: '🎨 עיצוב סגנון', 
    subtitle: 'שינוי טון וסגנון הכתיבה',
    gradient: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(99, 102, 241, 0.1) 100%)',
    borderColor: 'rgba(59, 130, 246, 0.3)'
  },
  transform: { 
    title: '🔄 טרנספורמציה', 
    subtitle: 'שינוי מבנה ואורך התוכן',
    gradient: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(16, 185, 129, 0.1) 100%)',
    borderColor: 'rgba(34, 197, 94, 0.3)'
  },
  language: { 
    title: '🌐 שפה ותרגום', 
    subtitle: 'תרגום ועיבוד לשוני',
    gradient: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(168, 85, 247, 0.1) 100%)',
    borderColor: 'rgba(139, 92, 246, 0.3)'
  },
  generate: {
    title: '✨ יצירה חדשה',
    subtitle: 'יצירת תוכן חדש מהיסוד',
    gradient: 'linear-gradient(135deg, rgba(251, 146, 60, 0.15) 0%, rgba(245, 158, 11, 0.1) 100%)',
    borderColor: 'rgba(251, 146, 60, 0.3)'
  }
};

const MODERN_QUICK_ACTIONS = [
  { 
    id: 'fix', 
    icon: '✨', 
    label: 'תקן שגיאות', 
    prompt: 'תקן שגיאות כתיב, דקדוק וניסוח בטקסט',
    sel: true,
    color: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
    hoverColor: 'linear-gradient(135deg, #60A5FA 0%, #3B82F6 100%)',
    category: 'transform'
  },
  { 
    id: 'summary', 
    icon: '📝', 
    label: 'סכם', 
    prompt: 'סכם בנקודות עיקריות קצרות', 
    sel: true,
    color: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
    hoverColor: 'linear-gradient(135deg, #4ADE80 0%, #22C55E 100%)',
    category: 'transform'
  },
  { 
    id: 'expand', 
    icon: '📖', 
    label: 'הרחב', 
    prompt: 'הרחב עם פרטים ודוגמאות נוספות', 
    sel: true,
    color: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    hoverColor: 'linear-gradient(135deg, #34D399 0%, #10B981 100%)',
    category: 'transform'
  },
  {
    id: 'hebrew-flow',
    icon: '🌿',
    label: 'עברית טבעית',
    prompt: 'שכתב לעברית טבעית, זורמת וברורה תוך שמירה על המשמעות המקורית',
    sel: true,
    color: 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)',
    hoverColor: 'linear-gradient(135deg, #38BDF8 0%, #0EA5E9 100%)',
    category: 'style'
  },
  {
    id: 'sentence-rhythm',
    icon: '🎼',
    label: 'איזון קצב',
    prompt: 'איזן את קצב המשפטים: שלב משפטים קצרים, בינוניים וארוכים לקריאות טובה יותר',
    sel: true,
    color: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
    hoverColor: 'linear-gradient(135deg, #60A5FA 0%, #2563EB 100%)',
    category: 'style'
  },
  {
    id: 'remove-cliches',
    icon: '🧹',
    label: 'ניקוי קלישאות',
    prompt: 'נקה ניסוחים כלליים ושחוקים והחלף אותם בביטויים מדויקים וקונקרטיים',
    sel: true,
    color: 'linear-gradient(135deg, #14B8A6 0%, #0F766E 100%)',
    hoverColor: 'linear-gradient(135deg, #2DD4BF 0%, #14B8A6 100%)',
    category: 'edit'
  },
  {
    id: 'sharpen-argument',
    icon: '🎯',
    label: 'חידוד טיעון',
    prompt: 'חדד את העמדה והטיעון המרכזי עם נימוק ברור ומבנה לוגי עקבי',
    sel: true,
    color: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
    hoverColor: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)',
    category: 'edit'
  },
  { 
    id: 'translate', 
    icon: '🌐', 
    label: 'תרגם לאנגלית', 
    prompt: 'תרגם לאנגלית בצורה טבעית', 
    sel: true,
    color: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
    hoverColor: 'linear-gradient(135deg, #A78BFA 0%, #8B5CF6 100%)',
    category: 'language'
  },
];

const QUICK_PROMPTS = [
  { text: '🚀 המשך לכתוב את הטקסט הבא', icon: '➡️', category: 'generate', 
    color: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)' },
  { text: '🎯 כתוב מבוא מתאים למסמך', icon: '🚀', category: 'generate',
    color: 'linear-gradient(135deg, #FB923C 0%, #EA580C 100%)' },
  { text: '🏁 כתוב מסקנה מתאימה למסמך', icon: '🏁', category: 'generate',
    color: 'linear-gradient(135deg, #F97316 0%, #C2410C 100%)' },
  { text: '📚 הצע מקורות מחקריים רלוונטיים', icon: '📚', category: 'generate',
    color: 'linear-gradient(135deg, #A855F7 0%, #9333EA 100%)' },
  { text: '💡 תן רעיונות להמשך', icon: '💡', category: 'generate',
    color: 'linear-gradient(135deg, #FBBF24 0%, #F59E0B 100%)' },
  { text: '🔍 בדוק עובדות ונתונים', icon: '🔍', category: 'generate',
    color: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)' },
  { text: '🌿 שכתב לעברית טבעית וזורמת', icon: '🌿', category: 'generate',
    color: 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)' },
  { text: '🎼 איזן קצב משפטים (קצר/בינוני/ארוך)', icon: '🎼', category: 'generate',
    color: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' },
  { text: '🎯 חדד עמדה וטיעון מרכזי', icon: '🎯', category: 'generate',
    color: 'linear-gradient(135deg, #14B8A6 0%, #0F766E 100%)' },
];

const CLASSIC_TASKPANE_AGENT_IDS = DEFAULT_SIDEBAR_MODE_IDS;

const LEGACY_CHAT_MEMORY_STORAGE_KEY = 'wordai_sidebar_messages';
const CHAT_SESSION_ARCHIVE_LIMIT = 30;
const getDocumentStorageKeySegment = (documentId = '') => {
  const resolvedDocumentId = String(documentId || '').trim();
  return resolvedDocumentId ? encodeURIComponent(resolvedDocumentId) : '';
};

const getLegacyDocumentStorageKeySegment = (documentId = '') => String(documentId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');

const getChatMemoryStorageKey = (workspaceId = '', documentId = '') => {
  const resolvedWorkspaceId = String(workspaceId || getWorkspaceAutomation().activeWorkspaceId || 'default-content-studio').trim() || 'default-content-studio';
  const resolvedFilePathKey = getDocumentStorageKeySegment(documentId);
  return `${LEGACY_CHAT_MEMORY_STORAGE_KEY}:${resolvedWorkspaceId}${resolvedFilePathKey ? `:${resolvedFilePathKey}` : ''}`;
};

const getChatSessionArchiveStorageKey = (workspaceId = '', documentId = '') => `${getChatMemoryStorageKey(workspaceId, documentId)}:sessions`;
const getActiveChatSessionIdStorageKey = (workspaceId = '', documentId = '') => `${getChatMemoryStorageKey(workspaceId, documentId)}:activeSessionId`;

const getLegacyChatMemoryStorageKey = (workspaceId = '', documentId = '') => {
  const resolvedWorkspaceId = String(workspaceId || getWorkspaceAutomation().activeWorkspaceId || 'default-content-studio').trim() || 'default-content-studio';
  const resolvedFilePathKey = getLegacyDocumentStorageKeySegment(documentId);
  return `${LEGACY_CHAT_MEMORY_STORAGE_KEY}:${resolvedWorkspaceId}${resolvedFilePathKey ? `:${resolvedFilePathKey}` : ''}`;
};

const PROMPT_HISTORY_STORAGE_KEY = 'wordai_sidebar_prompt_history';
const PROMPT_HISTORY_LIMIT = 100;
const COMPOSER_MODES = [
  { id: 'chat', label: 'צ׳אט', icon: '💬' },
  { id: 'edit', label: 'עריכה מובנית', icon: '🧩' },
];

const normalizeComposerMode = (value = '') => (String(value || '').trim() === 'edit' ? 'edit' : 'chat');

const buildSidebarConversationHistory = (entries = []) => (Array.isArray(entries) ? entries : [])
  .filter((entry) => entry && (entry.role === 'user' || entry.role === 'assistant'))
  .map((entry) => ({
    role: entry.role,
    content: String(entry.content || '').trim(),
  }))
  .filter((entry) => entry.content);
const formatSidebarConversationHistory = (entries = []) => buildSidebarConversationHistory(entries)
  .slice(-12)
  .map((entry) => `${entry.role === 'assistant' ? 'assistant' : 'user'}: ${entry.content}`)
  .join('\n\n');
const documentWideEditPlanPattern = /(?:לפי\s+המיקומים\s+הנכונים|במיקומים\s+הנכונים|על\s+פי\s+המיקומים|בכל\s+המסמך|בכל\s+העבודה|במסמך|בעבודה|המסמך\s+הנוכחי|העבודה\s+הנוכחית|עכשיו\s+במסמך|עכשיו\s+לעבודה).{0,50}(?:תיקונים|הערות|המלצות|שינויים|תקן|תתקן)?|(?:תכניס|הכנס|החל|תחיל|תתחיל|יישם|תיישם|תשלב|שלב|תטמיע|הטמע|תעדכן|עדכן|תקן|תתקן).{0,50}(?:תיקונים|הערות|המלצות|שינויים|את\s+זה|אותם|אותן|את\s+העבודה|את\s+המסמך|המסמך\s+הנוכחי|העבודה\s+הנוכחית)|(?:תיקונים|המלצות|הערות).{0,24}(?:שביצעת|שביצעתי|שהצעת|שכתבת|שציינת)|(?:תסתכל|תעבור|סקור|בדוק).{0,34}(?:על\s+)?(?:ההערות|המלצות|המסמך|העבודה).{0,38}(?:ותתקן|ותעדכן|ותיישם|ותתחיל|במסמך|בעבודה|את\s+המסמך|את\s+העבודה)|(?:את\s+זה|אותם|אותן|כמו\s+שהצעת|כמו\s+שכתבת)/i;
const TASKPANE_FIX_ANALYSIS_QUESTION_PATTERN = /(?:מה\s+(?:צריך|כדאי|אפשר|יש)\s+ל(?:תקן|שפר|עדכן|יישם)|איך\s+ל(?:תקן|שפר|עדכן|יישם)|איזה\s+(?:תיקונים|שינויים|הערות)|מה\s+(?:ה)?(?:תיקונים|שינויים|הערות))/iu;
const TASKPANE_FIX_APPLY_INTENT_PATTERN = /(?:^|[\s"'“”])(?:תתחיל|תחיל|התחל|תתחילי|תתקן|תקן|יישם|תיישם|החל|תעדכן|עדכן|תכניס|הכנס)(?:\s+(?:את|עם|לי))?.{0,60}(?:תיקונים|הערות|המלצות|שינויים|את\s+זה|אותם|אותן|מסמך|עבודה)|(?:^|[\s"'“”])(?:תסתכל|תעבור|סקור|בדוק).{0,40}(?:הערות|המלצות|מרצה).{0,50}(?:תתחיל|תתקן|תיישם|תעדכן|תכניס)/iu;
const NUMBERED_REVIEW_APPLY_INTENT_PATTERN = /(?:^|\s)(?:תעשה|תעשי|עשה|עשי|בצע|בצעי|תבצע|תבצעי|החל|תחיל|החילי|יישם|יישמי|תיישם|תיישמי|תקן|תקני|תתקן|תתקני|עדכן|עדכני|תעדכן|תעדכני)\s+(?:לי\s+)?(?:את\s+)?(?:ה)?(?:המלצות|תיקונים|סעיפים|נקודות)?\s*(?:מספר(?:י)?\s*)?(?:\d+|אחד|אחת|ראשון|ראשונה|שניים|שני|שתיים|שתי|שניה|שנייה|שלוש|שלושה|שלישי|שלישית|ארבע|ארבעה|רביעי|רביעית|חמש|חמישה|חמישי|חמישית|שש|שישה|שישי|שישית)(?:\s*(?:,|،|\+|ו|עד|-)\s*(?:\d+|אחד|אחת|ראשון|ראשונה|שניים|שני|שתיים|שתי|שניה|שנייה|שלוש|שלושה|שלישי|שלישית|ארבע|ארבעה|רביעי|רביעית|חמש|חמישה|חמישי|חמישית|שש|שישה|שישי|שישית))*/iu;
const NUMBERED_REVIEW_CONTEXT_PATTERN = /(?:מרצה|המלצ|הערות|ביקורת|בדיקת|תיקונים|בעיות|ניסוח\s+מוצע|suggestions?|recommendations?)/iu;
const NUMBERED_LIST_MARKER_PATTERN = /(?:^|\n)(?:(?:#{1,6}\s*)?(?:\*\*)?(?:\d{1,2}[.)]|(?:המלצה|תיקון|סעיף|נקודה|suggestion|recommendation)\s+\d{1,2}[:.)-])|[•*-])\s+/iu;
const SOURCE_INTEGRATION_PLAN_PATTERN = /(?:איפה\s+להוסיף|ניסוח\s+קיים|הצעה\s+לשילוב|שילוב\s+(?:הכתבה|עמדת|הסרט|המקור)|טבלה\s+מסכמת|מקורות\s+חדשים|ציטוט|APA|Ynet|mako|מעריב|האגודה\s+לזכויות\s+האזרח|סעיף\s+\d+)/iu;
const hasRecentNumberedReviewContext = (entries = []) => buildSidebarConversationHistory(entries)
  .slice(-8)
  .some((entry) => {
    if (entry.role !== 'assistant') return false;
    const content = String(entry.content || '');
    return NUMBERED_REVIEW_CONTEXT_PATTERN.test(content);
  });

const buildDocumentPersistenceIds = (...documentIds) => {
  const uniqueIds = [...new Set(documentIds.map((value) => String(value || '').trim()).filter(Boolean))];
  return uniqueIds.length ? uniqueIds : [''];
};

const normalizeSidebarDocumentSnapshot = (value = '') => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const excerptText = String(value.excerptText || value.excerpt || value.text || value.fullText || '');
    const fullText = String(value.text || value.fullText || excerptText || '');
    const outlineText = String(value.outlineText || value.outline || '').trim();
    const html = String(value.html || value.documentHtml || '').trim();
    const compactHtmlContext = html ? `HTML מסמך קיים לשימור מבנה ועוגנים:\n${html.slice(0, 4000)}` : '';
    const fullHtmlContext = html ? `HTML מסמך קיים לשימור מבנה ועוגנים:\n${html.slice(0, 12000)}` : '';
    const promptContext = [outlineText, excerptText, compactHtmlContext].filter(Boolean).join('\n\n');
    const fullPromptContext = [outlineText, fullText, fullHtmlContext].filter(Boolean).join('\n\n');

    return {
      excerptText,
      fullText,
      html,
      outlineText,
      promptContext,
      fullPromptContext,
    };
  }

  const text = String(value || '');
  return {
    excerptText: text,
    fullText: text,
    html: '',
    outlineText: '',
    promptContext: text,
    fullPromptContext: text,
  };
};

const FOLLOW_UP_DOCUMENT_CREATION_PATTERN = /(?:^|\b)(?:כתוב|כתבי|תכתוב|תכתבי|צור|צרי|תיצור|תיצרי|נסח|נסחי|תנסח|תנסחי|generate|create|write|draft|continue)(?:\s+[^\n]{0,60})?(?:מסמך|טיוטה|מאמר|עבודה|תשובה|טקסט|מסה|essay|paper|document|draft|article)|(?:עכשיו|כעת)\s+(?:כתוב|כתבי|נסח|נסחי|צור|צרי)|(?:המשך|תמשיך|תמשיכי)(?:\s+[^\n]{0,40})?(?:לכתוב|את המסמך|את הטיוטה|עם המסמך|עם הטיוטה)/iu;
const FOLLOW_UP_SOURCE_GROUNDING_PATTERN = /(?:כתבה|כתבות|ידיעה|ידיעות|article|articles|source|sources|שאלות|שאלה|questions?|הנחיות|brief|בריף|מקור|מקורות)/iu;
const FOLLOW_UP_SOURCE_CONTEXT_MAX_CHARS = 3600;
const EXPLICIT_DOCUMENT_WIDE_INTENT_PATTERN = /(?:בכל\s+המסמך|בכל\s+העבודה|לאורך\s+המסמך|המסמך\s+הנוכחי|העבודה\s+הנוכחית|לפי\s+המיקומים\s+הנכונים|במיקומים\s+הנכונים|על\s+פי\s+המיקומים|החל\s+את\s+כל\s+ה(?:תיקונים|ההערות)|יישם\s+את\s+כל\s+ה(?:תיקונים|ההערות)|תסתכל\s+על\s+ההערות\s+ותתקן\s+את\s+ה(?:עבודה|המסמך)|תעבור\s+על\s+ההערות\s+ותעדכן\s+את\s+ה(?:עבודה|המסמך)|בדוק.{0,36}(?:המסמך|העבודה).{0,36}(?:תקן|תתקן))/iu;
const MAX_SPLIT_CALL_COUNT = 6;
const SPLIT_CALL_DIRECTIVE_PATTERN = /(?:תחלק|חלק|תפצל|פצל|פרק|תפרק|split|divide|break)\b(?:[^\n]{0,28}?)(?:ל|ל-|ב|ב-|into|to)?\s*(2|3|4|5|6|שתי|שתיים|שני|שניים|שלוש|שלושה|ארבע|ארבעה|חמש|חמישה|שש|שישה|two|three|four|five|six)\s*(?:קריאות|פניות|קריאה|calls?|requests?)(?:\s+(?:רצופות|sequential(?:ly)?))?/iu;
const SPLIT_CALL_PLANNER_CONTEXT_MAX_CHARS = 5000;
const SPLIT_CALL_STEP_CONTEXT_MAX_CHARS = 7000;
const SPLIT_CALL_OUTPUT_CONTEXT_MAX_CHARS = 2200;
const SPLIT_CALL_OUTPUT_TOTAL_CONTEXT_BUDGET = 5200;

const clampSplitCallCount = (value = 0) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  const normalized = Math.round(numericValue);
  if (normalized < 2) return 0;
  return Math.max(2, Math.min(MAX_SPLIT_CALL_COUNT, normalized));
};

const normalizeRequestedSplitCallCount = (value = '') => {
  const normalizedValue = String(value || '').trim().toLowerCase();
  if (['6', 'שש', 'שישה', 'six'].includes(normalizedValue)) return 6;
  if (['5', 'חמש', 'חמישה', 'five'].includes(normalizedValue)) return 5;
  if (['4', 'ארבע', 'ארבעה', 'four'].includes(normalizedValue)) return 4;
  if (['3', 'שלוש', 'שלושה', 'three'].includes(normalizedValue)) return 3;
  if (['2', 'שתי', 'שתיים', 'שני', 'שניים', 'two'].includes(normalizedValue)) return 2;
  return 0;
};

const extractSplitCallDirective = (promptText = '') => {
  const sourceText = String(promptText || '').trim();
  if (!sourceText) return { count: 0, cleanedPrompt: '' };

  const directiveMatch = sourceText.match(SPLIT_CALL_DIRECTIVE_PATTERN);
  const count = clampSplitCallCount(normalizeRequestedSplitCallCount(directiveMatch?.[1] || ''));
  if (!count || !directiveMatch) {
    return { count: 0, cleanedPrompt: sourceText };
  }

  const matchText = String(directiveMatch[0] || '').trim();
  const matchIndex = Math.max(0, directiveMatch.index || 0);
  const matchEnd = matchIndex + matchText.length;
  const lineStart = sourceText.lastIndexOf('\n', matchIndex - 1) + 1;
  const nextLineBreak = sourceText.indexOf('\n', matchEnd);
  const lineEnd = nextLineBreak === -1 ? sourceText.length : nextLineBreak;
  const matchedLine = sourceText.slice(lineStart, lineEnd).trim();
  const nearPromptEdge = matchIndex <= 48 || matchEnd >= sourceText.length - 48;
  const standaloneDirectiveLine = matchedLine === matchText || matchedLine.replace(/[.!?]+$/u, '').trim() === matchText;
  if (!nearPromptEdge && !standaloneDirectiveLine) {
    return { count: 0, cleanedPrompt: sourceText };
  }

  const beforeMatch = sourceText.slice(0, matchIndex).replace(/[ \t]+$/u, '');
  const afterMatch = sourceText.slice(matchEnd).replace(/^[ \t]+/u, '');
  const shouldInsertSpace = beforeMatch && afterMatch && !beforeMatch.endsWith('\n') && !afterMatch.startsWith('\n');
  const cleanedPrompt = `${beforeMatch}${shouldInsertSpace ? ' ' : ''}${afterMatch}`.trim();

  return {
    count,
    cleanedPrompt,
  };
};

const tryParseJsonPayload = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return null;

  const candidates = [
    text,
    text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim(),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {}

    const objectStart = candidate.indexOf('{');
    const objectEnd = candidate.lastIndexOf('}');
    if (objectStart !== -1 && objectEnd > objectStart) {
      try {
        return JSON.parse(candidate.slice(objectStart, objectEnd + 1));
      } catch {}
    }

    const arrayStart = candidate.indexOf('[');
    const arrayEnd = candidate.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(candidate.slice(arrayStart, arrayEnd + 1));
      } catch {}
    }
  }

  return null;
};

const normalizeSplitCallPlan = (payload = null, stepCount = 0) => {
  const normalizedStepCount = Math.max(0, Math.min(MAX_SPLIT_CALL_COUNT, Number(stepCount) || 0));
  const rawSteps = Array.isArray(payload?.steps)
    ? payload.steps
    : Array.isArray(payload?.calls)
      ? payload.calls
      : Array.isArray(payload)
        ? payload
        : [];

  const steps = rawSteps
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const title = String(item.title || item.name || item.label || `חלק ${index + 1}`).trim();
      const instruction = String(item.instruction || item.prompt || item.goal || item.focus || '').trim();
      if (!instruction) return null;
      return {
        title: title || `חלק ${index + 1}`,
        instruction,
      };
    })
    .filter(Boolean)
    .slice(0, normalizedStepCount);

  return steps;
};

const truncateSplitCallOutput = (value = '', maxChars = SPLIT_CALL_OUTPUT_CONTEXT_MAX_CHARS, enforceMinimum = true) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const normalizedMaxChars = Number(maxChars) || SPLIT_CALL_OUTPUT_CONTEXT_MAX_CHARS;
  const limit = enforceMinimum ? Math.max(200, normalizedMaxChars) : Math.max(1, normalizedMaxChars);
  return text.length <= limit ? text : `${text.slice(0, limit).trim()}…`;
};

const buildSplitCallOutputsContext = (outputs = [], totalBudget = SPLIT_CALL_OUTPUT_TOTAL_CONTEXT_BUDGET) => {
  const normalizedOutputs = Array.isArray(outputs) ? outputs : [];
  let consumed = 0;
  return normalizedOutputs.map((item, index) => {
    const rawContent = String(item?.content || '').trim();
    const fallbackContent = String(item?.contextExcerpt || '').trim();
    const preferredContent = rawContent || fallbackContent;
    const budgetLimit = Number(totalBudget) || SPLIT_CALL_OUTPUT_TOTAL_CONTEXT_BUDGET;
    const remainingBudget = Math.max(0, budgetLimit - consumed);
    const remainingItems = Math.max(1, normalizedOutputs.length - index);
    if (!remainingBudget) return '';
    const header = `חלק ${index + 1} - ${String(item?.title || `חלק ${index + 1}`).trim()}:\n`;
    const contentBudget = Math.max(0, Math.floor(remainingBudget / remainingItems) - header.length);
    if (!contentBudget) return '';
    const content = preferredContent.length <= contentBudget
      ? preferredContent
      : truncateSplitCallOutput(preferredContent, contentBudget, false);
    const block = `${header}${content}`;
    consumed += block.length;
    return block;
  }).filter(Boolean);
};

const buildFollowUpSourceGroundingContext = (entries = [], currentPrompt = '') => {
  if (!FOLLOW_UP_DOCUMENT_CREATION_PATTERN.test(String(currentPrompt || '').trim())) return '';

  const userMessages = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.role === 'user')
    .map((entry) => String(entry.content || '').trim())
    .filter(Boolean);

  if (!userMessages.length) return '';

  const candidateMessages = [];
  for (let index = userMessages.length - 1; index >= 0 && candidateMessages.length < 3; index -= 1) {
    const content = userMessages[index];
    if (content.length < 80) continue;
    if (!FOLLOW_UP_SOURCE_GROUNDING_PATTERN.test(content) && content.length < 260) continue;
    candidateMessages.unshift(content);
  }

  if (!candidateMessages.length) return '';

  let consumed = 0;
  const limitedMessages = [];
  for (const content of candidateMessages) {
    if (consumed >= FOLLOW_UP_SOURCE_CONTEXT_MAX_CHARS) break;
    const remaining = FOLLOW_UP_SOURCE_CONTEXT_MAX_CHARS - consumed;
    const nextContent = content.slice(0, remaining);
    if (!nextContent.trim()) continue;
    limitedMessages.push(nextContent);
    consumed += nextContent.length;
  }

  if (!limitedMessages.length) return '';

  return [
    'הקשר מקור מהודעות משתמש קודמות. בבקשת הכתיבה הנוכחית יש להישען עליו במדויק ולא להחליף אותו בהכללה או סיכום חופשי:',
    ...limitedMessages.map((content, index) => `מקור ${index + 1}:\n${content}`),
  ].join('\n\n');
};

const getPromptHistoryStorageKey = (workspaceId = '', filePath = '') => {
  const resolvedWorkspaceId = String(workspaceId || getWorkspaceAutomation().activeWorkspaceId || 'default-content-studio').trim() || 'default-content-studio';
  const resolvedFilePathKey = getDocumentStorageKeySegment(filePath);
  return `${PROMPT_HISTORY_STORAGE_KEY}:${resolvedWorkspaceId}${resolvedFilePathKey ? `:${resolvedFilePathKey}` : ''}`;
};

const getLegacyPromptHistoryStorageKey = (workspaceId = '', filePath = '') => {
  const resolvedWorkspaceId = String(workspaceId || getWorkspaceAutomation().activeWorkspaceId || 'default-content-studio').trim() || 'default-content-studio';
  const resolvedFilePathKey = getLegacyDocumentStorageKeySegment(filePath);
  return `${PROMPT_HISTORY_STORAGE_KEY}:${resolvedWorkspaceId}${resolvedFilePathKey ? `:${resolvedFilePathKey}` : ''}`;
};

const readPromptHistoryFromStorage = (storageKey) => {
  const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .slice(-PROMPT_HISTORY_LIMIT);
};

const readMessagesFromStorage = (storageKey) => {
  const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
  return Array.isArray(parsed)
    ? parsed
        .filter((entry) => entry && !(entry.role === 'assistant' && !String(entry.content || '').trim()))
        .slice(-60)
    : [];
};

const getSavedPromptHistory = (workspaceId = '', filePath = '') => {
  const storageKey = getPromptHistoryStorageKey(workspaceId, filePath);
  const legacyStorageKey = getLegacyPromptHistoryStorageKey(workspaceId, filePath);
  try {
    const savedHistory = readPromptHistoryFromStorage(storageKey);
    if (savedHistory.length) return savedHistory;
    if (legacyStorageKey !== storageKey) return readPromptHistoryFromStorage(legacyStorageKey);
    return [];
  } catch {
    return [];
  }
};

const getSavedPromptHistoryForDocumentIds = (workspaceId = '', documentIds = []) => {
  const resolvedDocumentIds = buildDocumentPersistenceIds(...(Array.isArray(documentIds) ? documentIds : [documentIds]));
  try {
    for (const documentId of resolvedDocumentIds) {
      const storageKey = getPromptHistoryStorageKey(workspaceId, documentId);
      const legacyStorageKey = getLegacyPromptHistoryStorageKey(workspaceId, documentId);
      const savedHistory = readPromptHistoryFromStorage(storageKey);
      if (savedHistory.length) return savedHistory;
      if (legacyStorageKey !== storageKey) {
        const legacyHistory = readPromptHistoryFromStorage(legacyStorageKey);
        if (legacyHistory.length) return legacyHistory;
      }
    }
    return [];
  } catch {
    return [];
  }
};

const getDefaultMessages = () => ([
  { 
    role: 'assistant', 
    content: `שלום! אני כאן בצ'אט ישיר עם ספק ה-AI שלך 🤖\n\nאני רואה את ההקשר של המסמך, אז אפשר לשאול גם בקצרה:\n• "נראה ארוך אה?" 🤔\n• "יש מקור לזה?" 📚\n• "תחדד לי את זה" 💡\n\nמה נכתוב היום?`,
    timestamp: Date.now()
  }
]);

const getSavedMessages = (workspaceId = '', filePath = '') => {
  const storageKey = getChatMemoryStorageKey(workspaceId, filePath);
  const legacyStorageKey = getLegacyChatMemoryStorageKey(workspaceId, filePath);
  try {
    const savedMessages = readMessagesFromStorage(storageKey);
    if (savedMessages.length) return savedMessages;

    if (legacyStorageKey !== storageKey) {
      const legacyMessages = readMessagesFromStorage(legacyStorageKey);
      if (legacyMessages.length) return legacyMessages;
    }

    const legacyParsed = JSON.parse(localStorage.getItem(LEGACY_CHAT_MEMORY_STORAGE_KEY) || '[]');
    if (Array.isArray(legacyParsed) && legacyParsed.length) {
      const migratedMessages = legacyParsed
        .filter((entry) => entry && !(entry.role === 'assistant' && !String(entry.content || '').trim()))
        .slice(-60);
      localStorage.setItem(storageKey, JSON.stringify(migratedMessages));
      localStorage.removeItem(LEGACY_CHAT_MEMORY_STORAGE_KEY);
      return migratedMessages;
    }

    return getDefaultMessages();
  } catch {
    return getDefaultMessages();
  }
};

const getSavedMessagesForDocumentIds = (workspaceId = '', documentIds = []) => {
  const resolvedDocumentIds = buildDocumentPersistenceIds(...(Array.isArray(documentIds) ? documentIds : [documentIds]));
  try {
    for (const documentId of resolvedDocumentIds) {
      const storageKey = getChatMemoryStorageKey(workspaceId, documentId);
      const legacyStorageKey = getLegacyChatMemoryStorageKey(workspaceId, documentId);
      const savedMessages = readMessagesFromStorage(storageKey);
      if (savedMessages.length) return savedMessages;
      if (legacyStorageKey !== storageKey) {
        const legacyMessages = readMessagesFromStorage(legacyStorageKey);
        if (legacyMessages.length) return legacyMessages;
      }
    }

    const legacyParsed = JSON.parse(localStorage.getItem(LEGACY_CHAT_MEMORY_STORAGE_KEY) || '[]');
    if (Array.isArray(legacyParsed) && legacyParsed.length) {
      const migratedMessages = legacyParsed
        .filter((entry) => entry && !(entry.role === 'assistant' && !String(entry.content || '').trim()))
        .slice(-60);
      localStorage.setItem(getChatMemoryStorageKey(workspaceId, resolvedDocumentIds[0] || ''), JSON.stringify(migratedMessages));
      localStorage.removeItem(LEGACY_CHAT_MEMORY_STORAGE_KEY);
      return migratedMessages;
    }

    return getDefaultMessages();
  } catch {
    return getDefaultMessages();
  }
};

const normalizeMessagesForPersistence = (messages = []) => (Array.isArray(messages) ? messages : [])
  .filter((entry) => entry && !(entry.role === 'assistant' && !String(entry.content || '').trim()))
  .slice(-60);

const hasMeaningfulChatMessages = (messages = []) => normalizeMessagesForPersistence(messages)
  .some((entry) => entry.role === 'user' && String(entry.content || '').trim());

const createChatSessionId = () => `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildChatSessionTitle = (messages = []) => {
  const meaningfulMessages = normalizeMessagesForPersistence(messages);
  const source = meaningfulMessages.find((entry) => entry.role === 'user' && String(entry.content || '').trim())
    || meaningfulMessages.find((entry) => String(entry.content || '').trim())
    || null;
  const text = String(source?.content || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (text ? text.slice(0, 64) : 'שיחה ללא כותרת') || 'שיחה ללא כותרת';
};

const readChatSessionArchive = (storageKey = '') => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((session) => ({
        id: String(session?.id || '').trim(),
        title: String(session?.title || '').trim() || 'שיחה ללא כותרת',
        updatedAt: Number(session?.updatedAt || 0) || Date.now(),
        messageCount: Number(session?.messageCount || 0) || 0,
        messages: normalizeMessagesForPersistence(session?.messages || []),
      }))
      .filter((session) => session.id && session.messages.length)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, CHAT_SESSION_ARCHIVE_LIMIT);
  } catch {
    return [];
  }
};

const getSavedChatSessionsForDocumentIds = (workspaceId = '', documentIds = []) => {
  const resolvedDocumentIds = buildDocumentPersistenceIds(...(Array.isArray(documentIds) ? documentIds : [documentIds]));
  try {
    for (const documentId of resolvedDocumentIds) {
      const sessions = readChatSessionArchive(getChatSessionArchiveStorageKey(workspaceId, documentId));
      if (sessions.length) return sessions;
    }
    return [];
  } catch {
    return [];
  }
};

const getSavedActiveChatSessionIdForDocumentIds = (workspaceId = '', documentIds = []) => {
  const resolvedDocumentIds = buildDocumentPersistenceIds(...(Array.isArray(documentIds) ? documentIds : [documentIds]));
  try {
    for (const documentId of resolvedDocumentIds) {
      const sessionId = String(localStorage.getItem(getActiveChatSessionIdStorageKey(workspaceId, documentId)) || '').trim();
      if (sessionId) return sessionId;
    }
  } catch {}
  return '';
};

const saveActiveChatSessionIdForDocumentIds = (workspaceId = '', documentIds = [], sessionId = '') => {
  const safeSessionId = String(sessionId || '').trim();
  buildDocumentPersistenceIds(...(Array.isArray(documentIds) ? documentIds : [documentIds])).forEach((documentId) => {
    localStorage.setItem(getActiveChatSessionIdStorageKey(workspaceId, documentId), safeSessionId);
  });
};

const upsertChatSessionForDocumentIds = (workspaceId = '', documentIds = [], sessionId = '', messages = []) => {
  const normalizedMessages = normalizeMessagesForPersistence(messages);
  const safeSessionId = String(sessionId || '').trim() || createChatSessionId();
  if (!hasMeaningfulChatMessages(normalizedMessages)) return getSavedChatSessionsForDocumentIds(workspaceId, documentIds);
  const now = Date.now();
  buildDocumentPersistenceIds(...(Array.isArray(documentIds) ? documentIds : [documentIds])).forEach((documentId) => {
    const storageKey = getChatSessionArchiveStorageKey(workspaceId, documentId);
    const sessions = readChatSessionArchive(storageKey).filter((session) => session.id !== safeSessionId);
    const nextSessions = [{
      id: safeSessionId,
      title: buildChatSessionTitle(normalizedMessages),
      updatedAt: now,
      messageCount: normalizedMessages.filter((entry) => String(entry.content || '').trim()).length,
      messages: normalizedMessages,
    }, ...sessions].slice(0, CHAT_SESSION_ARCHIVE_LIMIT);
    localStorage.setItem(storageKey, JSON.stringify(nextSessions));
  });
  return getSavedChatSessionsForDocumentIds(workspaceId, documentIds);
};

const deleteChatSessionForDocumentIds = (workspaceId = '', documentIds = [], sessionId = '') => {
  const safeSessionId = String(sessionId || '').trim();
  if (!safeSessionId) return getSavedChatSessionsForDocumentIds(workspaceId, documentIds);
  buildDocumentPersistenceIds(...(Array.isArray(documentIds) ? documentIds : [documentIds])).forEach((documentId) => {
    const storageKey = getChatSessionArchiveStorageKey(workspaceId, documentId);
    const nextSessions = readChatSessionArchive(storageKey).filter((session) => session.id !== safeSessionId);
    localStorage.setItem(storageKey, JSON.stringify(nextSessions));
  });
  return getSavedChatSessionsForDocumentIds(workspaceId, documentIds);
};

// ── Review ledger ("חבר ביקורתי") — זיכרון ממצאי בדיקת מרצה, per-document + per-session ──
// מונע לופ אינסופי: ממצא שנדחה/טופל נשלח חזרה למודל כ-digest ואסור לו לחזור.
// היסטוריית הצ'אט חתוכה ל-12 הודעות ולכן ה-ledger הוא מקור האמת, לא ההיסטוריה.
const REVIEW_LEDGER_SESSION_LIMIT = 20;
const REVIEW_FINDING_LINE_PATTERN = /^(🔴|🟡|⚪)\s*(?:קריטי|חשוב|קוסמטי)?\s*(?:\[(F-[\w-]{1,24})\])?\s*[:：]?\s*(.+)$/u;
const REVIEW_VERDICT_READY_PATTERN = /פסק\s*דין\s*[:：].{0,24}מוכן\s+להגשה/u;
const REVIEW_VERDICT_NOT_READY_PATTERN = /פסק\s*דין\s*[:：].{0,24}(?:עדיין\s+לא|לא\s+מוכן)/u;
const REVIEW_SEVERITY_BY_EMOJI = { '🔴': 'critical', '🟡': 'important', '⚪': 'cosmetic' };
const REVIEW_SEVERITY_LABELS = { critical: 'קריטי', important: 'חשוב', cosmetic: 'קוסמטי' };
const REVIEW_STATUS_LABELS = { open: 'פתוח', dismissed: 'נדחה על ידי המשתמש', fixed: 'טופל' };

const getReviewLedgerStorageKey = (workspaceId = '', documentId = '') => `${getChatMemoryStorageKey(workspaceId, documentId)}:reviewLedger`;

const createReviewFindingId = (title = '') => {
  const input = String(title || '').replace(/\s+/g, ' ').trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  return `F-${Math.abs(hash).toString(36).slice(0, 6) || '0'}`;
};

// פירסור פלט המרצה: שורות ממצא בפורמט "🔴 קריטי [F-xxx]: כותרת — הסבר" + שורת "פסק דין".
// דעיכה בחן: תוכן שלא תואם ⇒ אפס ממצאים, הבועה מוצגת כרגיל.
const parseReviewFindings = (content = '') => {
  const findings = [];
  let verdict = '';
  String(content || '').split('\n').forEach((rawLine) => {
    const line = rawLine.replace(/^[\s>*#-]+/, '').replace(/\*\*/g, '').trim();
    if (!line) return;
    if (REVIEW_VERDICT_READY_PATTERN.test(line)) { verdict = 'ready'; return; }
    if (REVIEW_VERDICT_NOT_READY_PATTERN.test(line)) { verdict = 'not-ready'; return; }
    const match = line.match(REVIEW_FINDING_LINE_PATTERN);
    if (!match) return;
    const body = String(match[3] || '').trim();
    if (!body) return;
    const title = (body.split(/\s+[—–-]\s+/)[0] || body).slice(0, 120).trim();
    findings.push({
      severity: REVIEW_SEVERITY_BY_EMOJI[match[1]] || 'important',
      findingId: String(match[2] || '').trim() || createReviewFindingId(title),
      title,
      text: body,
    });
  });
  return { findings, verdict };
};

const readReviewLedgerForDocumentIds = (workspaceId = '', documentIds = []) => {
  const resolvedDocumentIds = buildDocumentPersistenceIds(...(Array.isArray(documentIds) ? documentIds : [documentIds]));
  for (const documentId of resolvedDocumentIds) {
    try {
      const parsed = JSON.parse(localStorage.getItem(getReviewLedgerStorageKey(workspaceId, documentId)) || 'null');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length) return parsed;
    } catch {}
  }
  return {};
};

const saveReviewLedgerForDocumentIds = (workspaceId = '', documentIds = [], ledger = {}) => {
  const entries = Object.entries(ledger && typeof ledger === 'object' ? ledger : {})
    .sort((a, b) => (Number(b[1]?.updatedAt) || 0) - (Number(a[1]?.updatedAt) || 0))
    .slice(0, REVIEW_LEDGER_SESSION_LIMIT);
  const payload = JSON.stringify(Object.fromEntries(entries));
  buildDocumentPersistenceIds(...(Array.isArray(documentIds) ? documentIds : [documentIds])).forEach((documentId) => {
    try { localStorage.setItem(getReviewLedgerStorageKey(workspaceId, documentId), payload); } catch {}
  });
};

const removeReviewLedgerForDocumentIds = (workspaceId = '', documentIds = []) => {
  buildDocumentPersistenceIds(...(Array.isArray(documentIds) ? documentIds : [documentIds])).forEach((documentId) => {
    try { localStorage.removeItem(getReviewLedgerStorageKey(workspaceId, documentId)); } catch {}
  });
};

// מיזוג ממצאים מסבב חדש לתוך רשומת ה-session: דחייה של המשתמש גוברת ונשמרת,
// ממצא חדש נפתח כ-open, פסק הדין המפורש של המודל גובר על היסק מקומי.
const mergeParsedFindingsIntoSessionLedger = (sessionLedger = null, parsed = { findings: [], verdict: '' }) => {
  const prev = sessionLedger && typeof sessionLedger === 'object' ? sessionLedger : { findings: [], verdict: '', round: 0 };
  const prevFindings = Array.isArray(prev.findings) ? prev.findings : [];
  const round = (Number(prev.round) || 0) + 1;
  const byId = new Map(prevFindings.map((finding) => [finding.findingId, { ...finding }]));
  (parsed.findings || []).forEach((finding) => {
    const existing = byId.get(finding.findingId);
    if (existing) {
      byId.set(finding.findingId, { ...existing, title: finding.title, text: finding.text, severity: finding.severity, round });
    } else {
      byId.set(finding.findingId, { ...finding, status: 'open', round, raisedAt: Date.now() });
    }
  });
  const findings = [...byId.values()];
  const hasOpenBlocking = findings.some((finding) => finding.status === 'open' && (finding.severity === 'critical' || finding.severity === 'important'));
  const verdict = parsed.verdict || (hasOpenBlocking ? 'not-ready' : prev.verdict || '');
  return { ...prev, findings, verdict, round, updatedAt: Date.now() };
};

const buildReviewLedgerDigest = (sessionLedger = null) => {
  const findings = Array.isArray(sessionLedger?.findings) ? sessionLedger.findings : [];
  if (!findings.length) return '';
  const lines = findings.map((finding) => `[${finding.findingId}] ${REVIEW_SEVERITY_LABELS[finding.severity] || 'חשוב'} · ${REVIEW_STATUS_LABELS[finding.status] || 'פתוח'} — ${finding.title}`);
  const digest = `ממצאים קודמים (זיכרון סבבים — חובה לכבד סטטוסים; "נדחה על ידי המשתמש" אסור להעלות שוב):\n${lines.join('\n')}`;
  return digest.length > 2000 ? `${digest.slice(0, 2000)}…` : digest;
};

const persistPromptHistoryForDocumentIds = (workspaceId = '', documentIds = [], promptHistory = []) => {
  const normalizedHistory = (Array.isArray(promptHistory) ? promptHistory : [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .slice(-PROMPT_HISTORY_LIMIT);
  buildDocumentPersistenceIds(...(Array.isArray(documentIds) ? documentIds : [documentIds])).forEach((documentId) => {
    localStorage.setItem(getPromptHistoryStorageKey(workspaceId, documentId), JSON.stringify(normalizedHistory));
  });
};

const persistMessagesForDocumentIds = (workspaceId = '', documentIds = [], messages = []) => {
  const normalizedMessages = normalizeMessagesForPersistence(messages);
  buildDocumentPersistenceIds(...(Array.isArray(documentIds) ? documentIds : [documentIds])).forEach((documentId) => {
    localStorage.setItem(getChatMemoryStorageKey(workspaceId, documentId), JSON.stringify(normalizedMessages));
  });
};

const bbl = (isUser, compactMode = false) => ({
  maxWidth: compactMode ? '96%' : '90%',
  padding: compactMode ? '9px 11px' : '11px 14px',
  borderRadius: isUser ? '15px 15px 15px 5px' : '15px 15px 5px 15px',
  background: isUser ? 'color-mix(in srgb, var(--chat-accent) 16%, transparent)' : 'var(--chat-bubble-ai)',
  border: isUser ? '1px solid color-mix(in srgb, var(--chat-accent) 28%, transparent)' : '1px solid var(--chat-border)',
  color: isUser ? 'var(--chat-ink)' : 'var(--chat-ink2, var(--chat-ink))',
  fontSize: compactMode ? 12 : 13,
  lineHeight: compactMode ? 1.5 : 1.65,
  whiteSpace: 'pre-wrap',
  boxShadow: isUser ? 'none' : '0 4px 12px rgba(15,23,42,0.06)',
  direction: 'rtl',
  textAlign: 'right',
});

const actBtn = { padding: '8px 6px', border: '1px solid var(--chat-border)', borderRadius: 10, background: 'var(--chat-bubble-ai)', cursor: 'pointer', fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, color: 'var(--chat-ink)', transition: 'all 0.12s' };

const CLOSING_LINK_DELIMITERS = {
  ')': '(',
  ']': '[',
  '}': '{',
};

const TRAILING_LINK_WRAPPER_PATTERN = /[>"'“”‘’«»]+$/;

const countCharacter = (value = '', character = '') => Array.from(String(value || '')).reduce(
  (count, currentCharacter) => (currentCharacter === character ? count + 1 : count),
  0,
);

const splitTrailingLinkPunctuation = (value = '') => {
  let linkText = String(value || '');
  let trailingPunctuation = '';

  while (linkText) {
    const alwaysStripMatch = linkText.match(/[.,;:!?]+$/);
    if (alwaysStripMatch) {
      trailingPunctuation = `${alwaysStripMatch[0]}${trailingPunctuation}`;
      linkText = linkText.slice(0, -alwaysStripMatch[0].length);
      continue;
    }

    const wrapperMatch = linkText.match(TRAILING_LINK_WRAPPER_PATTERN);
    if (wrapperMatch) {
      trailingPunctuation = `${wrapperMatch[0]}${trailingPunctuation}`;
      linkText = linkText.slice(0, -wrapperMatch[0].length);
      continue;
    }

    const trailingCharacter = linkText[linkText.length - 1];
    const openingCharacter = CLOSING_LINK_DELIMITERS[trailingCharacter];
    if (!openingCharacter) break;

    const openingCount = countCharacter(linkText, openingCharacter);
    const closingCount = countCharacter(linkText, trailingCharacter);
    if (closingCount <= openingCount) break;

    trailingPunctuation = `${trailingCharacter}${trailingPunctuation}`;
    linkText = linkText.slice(0, -1);
  }

  return { linkText, trailingPunctuation };
};

const normalizeAutoLinkHref = (value = '') => {
  const normalizedValue = String(value || '').trim();
  if (!/^(?:https?:\/\/|www\.)/i.test(normalizedValue)) return '';

  const candidateHref = /^https?:\/\//i.test(normalizedValue) ? normalizedValue : `https://${normalizedValue}`;

  try {
    const parsedUrl = new URL(candidateHref);
    const hostname = String(parsedUrl.hostname || '').trim();
    if (!/^https?:$/i.test(parsedUrl.protocol)) return '';
    if (!hostname || hostname === 'www' || hostname === 'www.' || /(^\.|\.$|\.\.)/.test(hostname)) return '';
    return parsedUrl.toString();
  } catch {
    return '';
  }
};

const renderChatMessageContent = (text = '') => {
  const value = String(text || '');
  const parts = value.split(/((?:https?:\/\/|www\.)[^\s]+)/gi);

  return parts.map((part, index) => {
    const rawPart = String(part || '');
    if (!rawPart.trim()) return <React.Fragment key={index}>{part}</React.Fragment>;
    if (!/^(?:https?:\/\/|www\.)/i.test(rawPart)) return <React.Fragment key={index}>{part}</React.Fragment>;

    const { linkText, trailingPunctuation } = splitTrailingLinkPunctuation(rawPart);
    if (!linkText) return <React.Fragment key={index}>{part}</React.Fragment>;

    const href = normalizeAutoLinkHref(linkText);
    if (!href) return <React.Fragment key={index}>{part}</React.Fragment>;

    return (
      <React.Fragment key={index}>
        <a href={href} target="_blank" rel="noreferrer"
          style={{ color: 'inherit', textDecoration: 'underline', wordBreak: 'break-all' }}>
          {linkText}
        </a>
        {trailingPunctuation}
      </React.Fragment>
    );
  });
};

const getShellStyle = (mode, compactMode = false) => ({
  width: mode === 'sidebar' ? '100%' : (compactMode ? 390 : 430),
  background: mode === 'sidebar' ? '#F8FAFC' : 'linear-gradient(180deg,#FFFFFF 0%,#FBFDFF 100%)',
  border: mode === 'sidebar' ? 'none' : '1px solid #E5E7EB',
  display: 'flex',
  flexDirection: 'column',
  flex: mode === 'sidebar' ? '1 1 0' : '0 0 auto',
  flexShrink: 0,
  height: mode === 'sidebar' ? 'auto' : 'auto',
  minHeight: 0,
  maxHeight: mode === 'popup' ? '74vh' : '100%',
  margin: mode === 'popup' ? '8px 8px 8px 0' : '0',
  borderRadius: mode === 'popup' ? 24 : 0,
  overflow: 'hidden',
  boxShadow: mode === 'popup' ? '0 18px 40px rgba(15,23,42,0.16)' : 'none',
});

const normalizeLookup = (value = '') => String(value || '').trim().toLowerCase();

const resolveMentionMatch = (text = '', cursor = String(text || '').length) => {
  const uptoCursor = String(text || '').slice(0, cursor);
  const match = uptoCursor.match(/(^|\s)([@/])([^\s@/]*)$/);
  if (!match) return null;
  const token = `${match[2]}${match[3] || ''}`;
  const start = uptoCursor.lastIndexOf(token);
  return start >= 0 ? { trigger: match[2], query: match[3] || '', start, end: cursor } : null;
};

const findMentionedAgent = (agents = [], token = '') => {
  const cleanToken = normalizeLookup(token).replace(/\s+/g, '-');
  return agents.find((agent) => {
    const byId = normalizeLookup(agent.id);
    const byName = normalizeLookup(agent.name);
    const bySlug = byName.replace(/\s+/g, '-');
    return cleanToken === byId || cleanToken === bySlug || byName.includes(cleanToken);
  });
};

const findMentionedSkill = (skills = [], token = '') => {
  const cleanToken = normalizeLookup(token).replace(/\s+/g, '-');
  return skills.find((skill) => {
    const byId = normalizeLookup(skill.id);
    const byLabel = normalizeLookup(skill.label);
    return cleanToken === byId || byLabel.includes(cleanToken);
  });
};

const shouldAllowEditModeRoutingOverride = ({ runtimeOverride = false } = {}) => runtimeOverride === true;

const EMPTY_MENTION_MENU = { open: false, type: '', query: '', start: 0, end: 0, items: [], activeIndex: 0 };
const EMPTY_PENDING_MENTION_SELECTION = { agentId: '', skillId: '' };
const IDLE_AGENT_STATUS = {
  agentLabel: '',
  progress: 0,
  message: 'מוכן',
  state: 'idle',
  attempt: 1,
  provider: '',
  model: '',
  runId: '',
};

export default function AiSidebar({ onClose, documentContext, currentFilePath = '', activeDocumentSessionId = '', assignmentBrief = null, onInsert, onAppendAiAppendix = null, onApplyEdit = null, onApplyEditBatch = null, onApplyDocumentPlan = null, onStreamStart, onStreamChunk, onStreamEnd, selectedText, currentBlockText = '', editTarget = null, getCurrentEditTarget = null, resolveEditTargetFromPrompt = null, resolveEditTargetsFromPrompt = null, mode = 'popup', reason = 'manual', compactMode = mode === 'sidebar', onToggleCompact = () => {}, wordPreferences = {}, assistantBehavior = {}, onOpenSettingsTab = () => {}, onOpenHelp = null, launchPreset = null }) {
  const effectiveDocId = currentFilePath || activeDocumentSessionId;
  const documentPersistenceIds = buildDocumentPersistenceIds(effectiveDocId, currentFilePath, activeDocumentSessionId);
  const documentPersistenceScopeKey = documentPersistenceIds.join('::');
  const [tab, setTab] = useState('chat');
  const [isDarkTheme, setIsDarkTheme] = useState(() => getTheme() === 'dark');
  useEffect(() => onThemeChange((t) => setIsDarkTheme(t === 'dark')), []);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [workspaceAutomation, setWorkspaceAutomation] = useState(() => getWorkspaceAutomation());
  const [roleAgents, setRoleAgents] = useState(() => getOrderedRoleAgents(getWorkspaceAutomation().workflowMode));
  const [messages, setMessages] = useState(() => getSavedMessagesForDocumentIds(getWorkspaceAutomation().activeWorkspaceId, documentPersistenceIds));
  const [activeChatSessionId, setActiveChatSessionId] = useState(() => getSavedActiveChatSessionIdForDocumentIds(getWorkspaceAutomation().activeWorkspaceId, documentPersistenceIds) || createChatSessionId());
  const [chatSessions, setChatSessions] = useState(() => getSavedChatSessionsForDocumentIds(getWorkspaceAutomation().activeWorkspaceId, documentPersistenceIds));
  const [reviewLedger, setReviewLedger] = useState(() => readReviewLedgerForDocumentIds(getWorkspaceAutomation().activeWorkspaceId, documentPersistenceIds));
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  // הפרויקט שהמסמך הפתוח שייך אליו — הקונטקסט שלו מוזרק לכל בקשה בסיידבר.
  const [activeProject, setActiveProject] = useState(() => getProjectForDocument({ filePath: currentFilePath }));
  const [savingProjectMemory, setSavingProjectMemory] = useState(false);
  const [externalChatDialogOpen, setExternalChatDialogOpen] = useState(false);
  const [externalChatUrl, setExternalChatUrl] = useState('');
  const [externalChatText, setExternalChatText] = useState('');
  useEffect(() => {
    const refreshActiveProject = () => setActiveProject(getProjectForDocument({ filePath: currentFilePath }));
    refreshActiveProject();
    window.addEventListener(PROJECTS_UPDATED_EVENT, refreshActiveProject);
    return () => window.removeEventListener(PROJECTS_UPDATED_EVENT, refreshActiveProject);
  }, [currentFilePath]);

  // שמירת מסקנות שיחת התכנון הנוכחית לזיכרון הפרויקט (סיכום במודל + הוספה לרשומות).
  const saveBrainstormConclusionsToProject = async () => {
    if (!activeProject || savingProjectMemory) return;
    setSavingProjectMemory(true);
    try {
      const transcript = messages
        .filter((m) => m?.role === 'user' || m?.role === 'assistant')
        .slice(-24)
        .map((m) => ({ role: m.role, content: String(m.content || '') }));
      const entry = await summarizeConversationForMemory({ transcript, source: 'brainstorm-sidebar' });
      appendProjectMemory(activeProject.id, entry);
      showToast(`המסקנות נשמרו לזיכרון הפרויקט "${activeProject.name}" ✅`, { tone: 'success' });
    } catch (err) {
      showToast(err?.message || 'שמירת המסקנות נכשלה', { tone: 'error' });
    } finally {
      setSavingProjectMemory(false);
    }
  };

  // צירוף שיחה חיצונית (ChatGPT/Gemini/Claude): הדבקת תוכן ידנית — דפי share נטענים
  // ב-JavaScript ולא ניתנים לאחזור אוטומטי. הקישור נשמר כתווית מקור בלבד.
  const attachExternalChat = async ({ alsoSaveToProject = false } = {}) => {
    const cleanUrl = externalChatUrl.trim();
    const cleanText = externalChatText.trim();
    if (cleanText.length < 40) {
      showToast('הדבק את תוכן השיחה (לפחות כמה שורות) כדי לצרף אותה.', { tone: 'warning' });
      return;
    }
    const label = cleanUrl ? `שיחת AI חיצונית (${cleanUrl})` : 'שיחת AI חיצונית';
    setAttachedFiles((prev) => [...prev, { name: label, text: cleanUrl ? `מקור: ${cleanUrl}\n\n${cleanText}` : cleanText }]);
    setExternalChatDialogOpen(false);
    setExternalChatUrl('');
    setExternalChatText('');
    if (alsoSaveToProject && activeProject) {
      setSavingProjectMemory(true);
      try {
        const entry = await summarizeConversationForMemory({ transcript: cleanText, source: 'external-link', sourceUrl: cleanUrl });
        appendProjectMemory(activeProject.id, entry);
        showToast(`השיחה סוכמה ונשמרה לזיכרון הפרויקט "${activeProject.name}" ✅`, { tone: 'success' });
      } catch (err) {
        showToast(err?.message || 'שמירת השיחה לפרויקט נכשלה', { tone: 'error' });
      } finally {
        setSavingProjectMemory(false);
      }
    }
  };
  const [promptHistory, setPromptHistory] = useState(() => getSavedPromptHistoryForDocumentIds(getWorkspaceAutomation().activeWorkspaceId, documentPersistenceIds));
  const [promptHistoryIndex, setPromptHistoryIndex] = useState(-1);
  const [preNavigationDraft, setPreNavigationDraft] = useState('');
  const [agentTaskInput, setAgentTaskInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeAgentStatus, setActiveAgentStatus] = useState(() => ({ ...IDLE_AGENT_STATUS }));
  const [agentProgressMap, setAgentProgressMap] = useState({});
    const [activeClassicAgentId, setActiveClassicAgentId] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  const [debugLogs, setDebugLogs] = useState(() => {
    const initialAutomation = getWorkspaceAutomation();
    return getAgentDebugLogs({ workspaceId: initialAutomation.activeWorkspaceId, includeUnscoped: false }).slice(-60).reverse();
  });
  const [selectedProviderId, setSelectedProviderId] = useState(() => getAppMemory().sidebarProviderId || 'default');
  const [selectedProviderModel, setSelectedProviderModel] = useState(() => String(getAppMemory().sidebarProviderModel || '').trim());
  const [selectedAgentId, setSelectedAgentId] = useState(() => getAppMemory().lastSelectedAgentId || '');
  const [selectedSkillId, setSelectedSkillId] = useState(() => getAppMemory().lastSelectedSkillId || 'none');
  const [configuredSplitCallCount, setConfiguredSplitCallCount] = useState(() => clampSplitCallCount(getAppMemory().sidebarSplitCallCount || 0));
  const [humanizerPrefs, setHumanizerPrefs] = useState(() => getHumanizerPreferences());
  const updateHumanizerPrefs = useCallback((patch) => {
    setHumanizerPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveHumanizerPreferences(next);
      return next;
    });
  }, []);
  const [composerMode, setComposerMode] = useState(() => normalizeComposerMode(getAppMemory().sidebarComposerMode || 'chat'));
  const [resolvedSkillLabel, setResolvedSkillLabel] = useState(() => getAppMemory().lastResolvedSkillLabel || '');
  const [requestSnapshot, setRequestSnapshot] = useState(null);
  const [mentionMenu, setMentionMenu] = useState(() => ({ ...EMPTY_MENTION_MENU }));
  const [pendingMentionSelectionState, setPendingMentionSelectionState] = useState(() => ({ ...EMPTY_PENDING_MENTION_SELECTION }));
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const rawActiveClassicAgent = activeClassicAgentId ? AGENTS_CONFIG[activeClassicAgentId] : null;
  const launchPresetNonce = Number(launchPreset?.nonce) || 0;
  const messagesRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const activeWorkspaceIdRef = useRef(String(getWorkspaceAutomation().activeWorkspaceId || ''));
  const pendingMentionSelectionRef = useRef({ ...EMPTY_PENDING_MENTION_SELECTION });
  const preservePendingMentionRef = useRef(false);
  const requestCycleRef = useRef(0);
  const effectiveDocIdRef = useRef(effectiveDocId);
  const chatPersistenceKeyRef = useRef(getChatMemoryStorageKey(workspaceAutomation.activeWorkspaceId, effectiveDocId));
  const pendingChatPersistenceLoadRef = useRef(null);
  // מגן כתיבה ל-review ledger: בהחלפת מסמך/סביבה אסור לכתוב את ה-ledger הישן על המפתח החדש
  // לפני שאפקט הטעינה רץ (אותו דפוס כמו pendingChatPersistenceLoadRef להודעות).
  const reviewLedgerLoadedScopeRef = useRef(`${getWorkspaceAutomation().activeWorkspaceId}::${documentPersistenceScopeKey}`);
  const isEditComposerMode = composerMode === 'edit';
  const activeEditTarget = editTarget?.active || null;

  const rawDocumentContext = typeof documentContext === 'function' ? documentContext() : (documentContext || '');
  const documentSnapshot = React.useMemo(() => normalizeSidebarDocumentSnapshot(rawDocumentContext), [rawDocumentContext]);
  const docCtx = (isEditComposerMode ? documentSnapshot.fullPromptContext : documentSnapshot.promptContext).slice(0, isEditComposerMode ? 32000 : 16000);
  const assignmentBriefText = String(assignmentBrief?.text || '').trim();
  const assignmentBriefFileName = String(assignmentBrief?.fileName || '').trim();
  const assignmentBriefContext = assignmentBriefText
    ? `הוראות מטלה למסמך הפעיל${assignmentBriefFileName ? ` (${assignmentBriefFileName})` : ''}:\n${assignmentBriefText.slice(0, 12000)}`
    : '';
  const shouldUseAssignmentBriefForPrompt = useCallback((promptText = '') => {
    if (!assignmentBriefContext) return false;
    const normalizedPrompt = String(promptText || '').trim();
    if (!normalizedPrompt) return false;
    return /(?:הוראות\s+המטלה|הנחיות\s+המטלה|מסמך\s+ההוראות|קובץ\s+ההוראות|לפי\s+ההוראות|לפי\s+המטלה|בדוק\s+מול\s+ההוראות|תסתכל\s+על\s+ההוראות|תעבור\s+על\s+ההוראות|use\s+the\s+assignment\s+instructions|check\s+against\s+the\s+assignment|look\s+at\s+the\s+instructions)/iu.test(normalizedPrompt);
  }, [assignmentBriefContext]);
  const localContext = selectedText || currentBlockText || activeEditTarget?.text || '';
  const quickPromptList = compactMode ? CONTEXT_PROMPTS.slice(0, 4) : CONTEXT_PROMPTS;
  const sidebarPreset = String(assistantBehavior?.sidebarPreset || 'word-taskpane').trim() || 'word-taskpane';
  const sidebarModeSettings = normalizeSidebarModeSettings(assistantBehavior?.sidebarModeSettings);
  const forceGlobalSidebarProvider = sidebarModeSettings.forceGlobalProvider === true;
  const useClassicTaskpaneShell = sidebarPreset === 'word-taskpane';
  const visibleActions = MODERN_QUICK_ACTIONS.filter((action) => wordPreferences?.aiQuickActions?.[action.id] !== false);
  const selectionActions = visibleActions.filter((action) => action.sel);
  const generationActions = visibleActions.filter((action) => !action.sel);
  const skillCatalog = getSkillCatalog();
  const skillsConfig = getSkillsConfig();
  const providerConfig = getProviderConfig();
  const configuredProviderChoices = getConfiguredProviderChoices(providerConfig);

  useEffect(() => {
    if (tab === 'agents' || tab === 'logs') {
      setTab('chat');
    }
  }, [tab]);
  const workspaceAutomationEnabled = workspaceAutomation?.enabled === true;
  const globalSidebarProviderChoice = configuredProviderChoices.find((choice) => choice.isDefault) || configuredProviderChoices[0] || null;
  const effectiveSidebarProviderId = forceGlobalSidebarProvider ? (globalSidebarProviderChoice?.id || 'default') : selectedProviderId;
  const activeProviderChoice = configuredProviderChoices.find((choice) => choice.id === effectiveSidebarProviderId) || null;
  // בחירה מפורשת של ספק בדרופדאון (לא 'default', לא נעילה גלובלית) מנצחת תמיד:
  // מפעילה pin קשיח לאותה ריצה כדי שהאוטו-ראוטינג/מולטי-מודל לא ידרוס את הבחירה.
  const userExplicitSidebarProvider = !forceGlobalSidebarProvider
    && Boolean(selectedProviderId)
    && selectedProviderId !== 'default'
    && Boolean(activeProviderChoice);
  const providerModelChoices = activeProviderChoice
    ? getProviderModelChoices(activeProviderChoice.id, providerConfig)
    : [];
  const rawSelectedProviderModel = forceGlobalSidebarProvider
    ? String(providerConfig?.[activeProviderChoice?.id || '']?.model || '').trim()
    : String(selectedProviderModel || '').trim();
  const normalizedSelectedProviderModel = activeProviderChoice
    ? normalizeProviderModelName(activeProviderChoice.id, rawSelectedProviderModel)
    : rawSelectedProviderModel;
  const resolvedSelectedProviderModel = activeProviderChoice
    ? (providerModelChoices.includes(normalizedSelectedProviderModel)
      ? normalizedSelectedProviderModel
      : (providerModelChoices[0] || ''))
    : '';
  const activeProviderLabel = activeProviderChoice?.label || getActiveProviderName();
  const persistedSidebarProviderModel = activeProviderChoice ? resolvedSelectedProviderModel : String(selectedProviderModel || '').trim();
  const chatMemoryStorageKey = getChatMemoryStorageKey(workspaceAutomation.activeWorkspaceId, effectiveDocId);
  const activeProviderSummary = activeProviderChoice
    ? [activeProviderLabel, resolvedSelectedProviderModel].filter(Boolean).join(' · ')
    : (configuredProviderChoices.length ? `${activeProviderLabel} · ברירת מחדל` : activeProviderLabel);
  const effectiveSelectedAgentId = isEditComposerMode ? '' : selectedAgentId;
  const effectiveSelectedSkillId = isEditComposerMode ? 'none' : selectedSkillId;
  const inactiveSkillSummaryLabel = isEditComposerMode ? 'ללא סקיל' : 'אוטומטי';
  const activeAgent = workspaceAutomationEnabled
    ? roleAgents.find((agent) => agent.id === effectiveSelectedAgentId) || null
    : null;
  const activeSkill = effectiveSelectedSkillId !== 'none'
    ? skillCatalog.find((skill) => skill.id === effectiveSelectedSkillId) || null
    : null;
  const pendingSkill = pendingMentionSelectionState.skillId
    ? skillCatalog.find((skill) => skill.id === pendingMentionSelectionState.skillId) || null
    : null;
  const pendingAgent = pendingMentionSelectionState.agentId
    ? roleAgents.find((agent) => agent.id === pendingMentionSelectionState.agentId) || null
    : null;

  useEffect(() => {
    if (mode !== 'popup') return undefined;

    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (mentionMenu.open) {
        event.preventDefault();
        closeMentionMenu();
        return;
      }
      event.preventDefault();
      onClose?.();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mode, mentionMenu.open, onClose]);

  const getSidebarModeSetting = useCallback((agentId = '') => sidebarModeSettings.modes.find((mode) => mode.id === agentId) || null, [sidebarModeSettings]);
  const buildEffectiveClassicAgentConfig = useCallback((agentId = '') => {
    const base = AGENTS_CONFIG[agentId] || null;
    if (!base) return null;
    const modeSetting = getSidebarModeSetting(agentId);
    const hasModeSetting = Boolean(modeSetting);
    const modeProviderId = hasModeSetting ? modeSetting.providerId : (base.sidebarSelection?.providerId || base.route || '');
    const modeModel = hasModeSetting ? modeSetting.model : (base.sidebarSelection?.model || '');
    const providerId = forceGlobalSidebarProvider
      ? ''
      : String(modeProviderId || '').trim();
    const modelChoices = providerId ? getProviderModelChoices(providerId, providerConfig) : [];
    const normalizedModeModel = providerId ? normalizeProviderModelName(providerId, String(modeModel || '').trim()) : '';
    const model = forceGlobalSidebarProvider
      ? ''
      : (modelChoices.includes(normalizedModeModel) ? normalizedModeModel : (modelChoices[0] || ''));
    return {
      ...base,
      route: providerId ? base.route : '',
      label: String(modeSetting?.label || base.label || agentId).trim() || agentId,
      sidebarSelection: providerId ? { providerId, model } : null,
    };
  }, [forceGlobalSidebarProvider, getSidebarModeSetting, providerConfig]);
  const activeClassicModeEnabled = activeClassicAgentId
    ? sidebarModeSettings.modes.some((mode) => mode.id === activeClassicAgentId && mode.enabled !== false)
    : false;
  const activeClassicAgent = activeClassicAgentId
    ? (activeClassicModeEnabled ? buildEffectiveClassicAgentConfig(activeClassicAgentId) : null)
    : rawActiveClassicAgent;
  useEffect(() => {
    if (!launchPresetNonce) return;
    const presetAgentId = String(launchPreset?.classicAgentId || '').trim();
    const presetComposerMode = normalizeComposerMode(launchPreset?.composerMode || '');
    const presetPrompt = String(launchPreset?.prompt || '').trim();
    if (presetAgentId && AGENTS_CONFIG[presetAgentId]) {
      setActiveClassicAgentId(presetAgentId);
      setTab('chat');
    }
    setComposerMode(presetComposerMode);
    if (presetPrompt) {
      setInput(presetPrompt);
    }
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      if (presetPrompt && inputRef.current?.setSelectionRange) {
        const cursorPos = presetPrompt.length;
        inputRef.current.setSelectionRange(cursorPos, cursorPos);
      }
    });
  }, [launchPresetNonce]);
    const contextScopeLabel = isEditComposerMode
      ? (activeEditTarget?.kind === 'section'
        ? (activeEditTarget.headingText ? `סעיף: ${activeEditTarget.headingText}` : 'סעיף במסמך')
        : selectedText
          ? 'טקסט נבחר'
          : currentBlockText
            ? 'פסקה פעילה'
            : documentSnapshot.excerptText
              ? 'המסמך המלא'
              : 'יעד עריכה לא נבחר')
      : (selectedText ? 'טקסט נבחר' : currentBlockText ? 'הפסקה הנוכחית' : 'המסמך כולו');
  const contextSourceText = localContext || '';
  const contextPreview = contextSourceText
    ? `${contextSourceText.replace(/\s+/g, ' ').slice(0, 96)}${contextSourceText.length > 96 ? '…' : ''}`
    : '';
  const effectiveProviderSummary = loading && requestSnapshot?.providerLabel ? requestSnapshot.providerLabel : activeProviderSummary;
  const effectiveAgentSummary = loading && requestSnapshot?.agentLabel ? requestSnapshot.agentLabel : (activeAgent ? activeAgent.name : 'צ׳אט ישיר');
  const effectiveSkillSummary = loading && requestSnapshot?.skillLabel ? requestSnapshot.skillLabel : (activeSkill ? activeSkill.label : inactiveSkillSummaryLabel);
  const chatHeaderButtons = [
    ...(onOpenHelp ? [{ key: 'help', icon: '❓', title: 'מדריך למשתמש', onClick: () => onOpenHelp('guideUser') }] : []),
    { key: 'theme', icon: isDarkTheme ? '☀️' : '🌙', title: 'מצב תצוגה (בהיר/כהה)', onClick: () => toggleTheme() },
    { key: 'style', icon: '🎨', title: 'סגנון אישי', onClick: () => onOpenSettingsTab('personal') },
    { key: 'settings', icon: '⚙️', title: 'הגדרות', onClick: () => setTab((prev) => prev === 'settings' ? 'chat' : 'settings') },
    ...(mode === 'sidebar' ? [{ key: 'compact', icon: compactMode ? '⤢' : '⤡', title: compactMode ? 'הרחב חלונית' : 'כווץ חלונית', onClick: onToggleCompact }] : []),
    { key: 'close', icon: '✕', title: 'סגור', onClick: onClose },
  ];
  const composerModeLabel = isEditComposerMode ? 'מצב עריכה' : 'מצב צ׳אט';
  const composerModeHelpText = isEditComposerMode
      ? 'עבודה ישירה על הטקסט הנבחר, הפסקה הפעילה או סעיף שמוזכר במפורש בבקשה. בברירת מחדל אין כאן סוכן או סקיל קבועים; לזימון מפורש השתמש ב-@agent או /skill בתחילת הבקשה.'
    : 'שיחה רציפה עם הקשר קצר מההודעות האחרונות ומהמסמך הפעיל.';
  const shouldPreserveFullDocumentContext = Boolean(documentSnapshot.fullPromptContext || documentSnapshot.html);
  const missingEditTargetMessage = 'לא זוהה יעד עריכה זמין. בחר טקסט, מקם את הסמן בפסקה שברצונך לערוך, או הפנה לסעיף בבקשה.';
  const getPromptResolutionTargets = (resolution) => (
    Array.isArray(resolution)
      ? resolution
      : Array.isArray(resolution?.targets)
        ? resolution.targets
        : []
  );
  const getPromptResolutionUnresolvedReferences = (resolution) => (
    Array.isArray(resolution?.unresolvedExplicitReferences)
      ? resolution.unresolvedExplicitReferences
      : []
  );
  const buildUnresolvedExplicitReferenceMessage = (references = []) => {
    const referenceLabel = String(
      references[0]?.locatorLabel
      || references[0]?.text
      || references[0]?.locatorText
      || ''
    ).trim();
    const referencePrefix = referenceLabel ? `ההפניה ${referenceLabel}` : 'ההפניה המפורשת';
    return `${referencePrefix} לא נפתרה באופן יחיד, ולכן עצרתי באופן שמרני לפני עריכה. ציין יעד ייחודי יותר או בחר את האזור ידנית ונסה שוב.`;
  };
  const shouldRouteUnresolvedReferenceToDocumentPlan = (promptText = '') => {
    const cleanPrompt = String(promptText || '').trim();
    if (!cleanPrompt || typeof onApplyDocumentPlan !== 'function') return false;
    if (NUMBERED_REVIEW_CONTEXT_PATTERN.test(cleanPrompt) && (NUMBERED_LIST_MARKER_PATTERN.test(cleanPrompt) || SOURCE_INTEGRATION_PLAN_PATTERN.test(cleanPrompt))) return true;
    return documentWideEditPlanPattern.test(cleanPrompt) || TASKPANE_FIX_APPLY_INTENT_PATTERN.test(cleanPrompt);
  };
  const composerModeSystemPrompt = isEditComposerMode
    ? 'מצב עריכה ישיר: החזר רק את התוכן החלופי המדויק עבור יעד העריכה שסופק. אם היעד דורש יותר מפסקה אחת, מותר להחזיר כמה פסקאות רצופות או HTML בלוקי בטוח בלבד כמו <p>, <ul>, <ol>, <li>, <h1>, <h2>, <h3>, <h4>, <h5>, <h6>, <blockquote> ו-<br>. אל תחזיר מסמך מלא, תגיות <html> או <body>, Markdown, פתיח, הסבר, מרכאות, כותרות מסבירות או הערות מחוץ לתוכן שאמור להיכנס למסמך. אם המשתמש נתן רשימת תיקונים מסודרת וביקש "לפי הסדר" או להתחיל מהראשון, בצע קודם את הסעיף הביצועי הראשון ואל תשאל מאיפה להתחיל.'
    : '';
  const buildStructuredEditBatchSystemPrompt = (targets = []) => [
    composerModeSystemPrompt,
    'יש כמה יעדי עריכה נפרדים בבקשה אחת. החזר JSON בלבד, ללא Markdown וללא הסברים.',
    'המבנה המחייב: {"edits":[{"targetId":"...","replacement":"..."}]}',
    'חובה להחזיר בדיוק ערך אחד לכל targetId שסופק. אסור להמציא targetId, להשמיט יעד, או לאחד יעדים.',
    'כל replacement הוא התוכן החלופי המדויק לאותו יעד בלבד. מותר להשתמש ב-HTML בלוקי בטוח כמו במצב עריכה רגיל.',
    `targetIds: ${(Array.isArray(targets) ? targets : []).map((target) => target?.targetId).filter(Boolean).join(', ')}`,
  ].filter(Boolean).join('\n\n');
  const composerPlaceholder = activeClassicAgent
    ? `${activeClassicAgent.placeholder} (${composerModeLabel})`
    : isEditComposerMode
      ? 'מצב עריכה: כתוב מה לשכתב, לקצר, לתקן או לחדד בטקסט הנבחר, בפסקה הפעילה או בסעיף שתפנה אליו'
      : 'מצב צ׳אט: שאל, התייעץ, או המשך שיחה רציפה... / לסקילים';
  const conversationHistory = buildSidebarConversationHistory(messages);
  const effectiveScopeSummary = loading && requestSnapshot?.scopeLabel ? requestSnapshot.scopeLabel : contextScopeLabel;
  const effectiveContextPreview = loading && requestSnapshot?.contextPreview ? requestSnapshot.contextPreview : contextPreview;
  const isSettingsLocked = loading;
  const progressPercent = Math.min(100, Math.max(Math.round(activeAgentStatus.progress || 0), loading ? 8 : 0));
  const progressTone = activeAgentStatus.state === 'error'
    ? {
        background: 'rgba(248, 113, 113, 0.18)',
        border: 'rgba(252, 165, 165, 0.34)',
        color: '#FECACA',
        rail: 'linear-gradient(180deg, #F97316 0%, #EF4444 100%)',
        glow: 'rgba(248, 113, 113, 0.45)',
      }
    : activeAgentStatus.state === 'success'
      ? {
          background: 'rgba(16, 185, 129, 0.2)',
          border: 'rgba(110, 231, 183, 0.34)',
          color: '#D1FAE5',
          rail: 'linear-gradient(180deg, #34D399 0%, #059669 100%)',
          glow: 'rgba(52, 211, 153, 0.42)',
        }
      : {
          background: 'rgba(96, 165, 250, 0.2)',
          border: 'rgba(147, 197, 253, 0.34)',
          color: '#DBEAFE',
          rail: 'linear-gradient(180deg, #60A5FA 0%, #8B5CF6 100%)',
          glow: 'rgba(129, 140, 248, 0.42)',
        };
  const progressStatusLabel = loading
    ? activeAgentStatus.message || 'הבקשה הנוכחית רצה'
    : activeAgentStatus.state === 'error'
      ? activeAgentStatus.message || 'הבקשה האחרונה הסתיימה עם שגיאה'
      : activeAgentStatus.state === 'success'
        ? 'הבקשה האחרונה הושלמה'
        : 'מוכן לכתיבה';
  const chatStatusPills = [
    {
      id: 'provider',
      label: 'ספק',
      value: effectiveProviderSummary,
      background: 'rgba(59, 130, 246, 0.16)',
      border: 'rgba(96, 165, 250, 0.3)',
      color: '#BFDBFE',
    },
    {
      id: 'agent',
      label: 'סוכן',
      value: effectiveAgentSummary,
      background: 'rgba(129, 140, 248, 0.16)',
      border: 'rgba(165, 180, 252, 0.3)',
      color: '#C7D2FE',
    },
    {
      id: 'skill',
      label: 'סקיל',
      value: effectiveSkillSummary,
      background: 'rgba(16, 185, 129, 0.16)',
      border: 'rgba(52, 211, 153, 0.3)',
      color: '#A7F3D0',
    },
    {
      id: 'scope',
      label: 'הקשר',
      value: effectiveScopeSummary,
      background: 'rgba(251, 191, 36, 0.16)',
      border: 'rgba(253, 224, 71, 0.3)',
      color: '#FDE68A',
    },
  ];
  const renderPendingMentionPill = (variant = 'classic') => {
    if (!pendingSkill && !pendingAgent) return null;
    const isDark = variant === 'dark';
    const label = pendingSkill
      ? `סקיל לשליחה הבאה: ${pendingSkill.label}`
      : `סוכן לשליחה הבאה: ${pendingAgent.name}`;
    const hint = pendingSkill
      ? (pendingSkill.description || pendingSkill.usageHint || 'ישנה את אופן הטיפול בבקשה הבאה בלבד.')
      : 'יטפל בבקשה הבאה בלבד.';
    return (
      <div style={{
        marginBottom: 8,
        padding: '8px 10px',
        borderRadius: variant === 'dark' ? 14 : 8,
        border: isDark ? '1px solid rgba(52, 211, 153, 0.36)' : '1px solid #A7F3D0',
        background: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5',
        color: isDark ? '#D1FAE5' : '#065F46',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        direction: 'rtl',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label}
          </div>
          <div style={{ fontSize: 11, opacity: 0.82, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
            {hint}
          </div>
        </div>
        <button
          type="button"
          onClick={clearPendingMentionSelection}
          title="בטל בחירה זמנית"
          style={{
            width: 26,
            height: 26,
            borderRadius: variant === 'dark' ? 13 : 6,
            border: isDark ? '1px solid rgba(209, 250, 229, 0.32)' : '1px solid #A7F3D0',
            background: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
            color: isDark ? '#D1FAE5' : '#047857',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
    );
  };
  const shouldShowProgress = workspaceAutomation.showProgress !== false && (loading || ['running', 'retrying', 'error', 'success'].includes(activeAgentStatus.state));
  const lockedControlStyle = isSettingsLocked ? { opacity: 0.56, cursor: 'not-allowed', boxShadow: 'none' } : {};

  const setPendingMentionSelection = useCallback((nextSelection = {}) => {
    const next = {
      agentId: String(nextSelection.agentId || '').trim(),
      skillId: String(nextSelection.skillId || '').trim(),
    };
    pendingMentionSelectionRef.current = next;
    setPendingMentionSelectionState(next);
  }, []);

  const clearPendingMentionSelection = useCallback(() => {
    preservePendingMentionRef.current = false;
    setPendingMentionSelection({ ...EMPTY_PENDING_MENTION_SELECTION });
  }, [setPendingMentionSelection]);

  const setDraftInput = useCallback((nextValue, { preservePendingMention = false } = {}) => {
    if (!preservePendingMention && !preservePendingMentionRef.current) clearPendingMentionSelection();
    setInput(nextValue);
  }, [clearPendingMentionSelection]);

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    
    try {
      const extractedText = await readInstructionFile(file);
      if (!String(extractedText).trim()) {
        showToast('לא הצלחתי לקרוא תוכן מתוך קובץ זה.', { tone: 'warning' });
        return;
      }
      setAttachedFiles((prev) => [...prev, { name: file.name, text: extractedText }]);
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 50);
    } catch (err) {
      console.error(err);
      showToast('שגיאה בעת קריאת הקובץ.', { tone: 'error' });
    }
  };

  const navigatePromptHistory = useCallback((direction) => {
    if (!promptHistory.length) return false;

    if (direction === 'up') {
      let moved = false;
      setPromptHistoryIndex((prevIndex) => {
        if (prevIndex === -1) {
          setPreNavigationDraft(input);
          const nextIndex = promptHistory.length - 1;
          setDraftInput(promptHistory[nextIndex]);
          moved = true;
          return nextIndex;
        }
        const nextIndex = Math.max(prevIndex - 1, 0);
        if (nextIndex === prevIndex) return prevIndex;
        setDraftInput(promptHistory[nextIndex]);
        moved = true;
        return nextIndex;
      });
      return moved;
    }

    if (direction === 'down') {
      let moved = false;
      setPromptHistoryIndex((prevIndex) => {
        if (prevIndex === -1) return -1;
        const nextIndex = prevIndex + 1;
        if (nextIndex >= promptHistory.length) {
          setDraftInput(preNavigationDraft);
          setPreNavigationDraft('');
          moved = true;
          return -1;
        }
        setDraftInput(promptHistory[nextIndex]);
        moved = true;
        return nextIndex;
      });
      return moved;
    }

    return false;
  }, [input, preNavigationDraft, promptHistory, setDraftInput]);

  const appendPromptHistory = useCallback((value) => {
    const normalizedPrompt = String(value || '').trim();
    if (!normalizedPrompt) return;
    setPromptHistory((prev) => {
      if (prev[prev.length - 1] === normalizedPrompt) return prev;
      return [...prev, normalizedPrompt].slice(-PROMPT_HISTORY_LIMIT);
    });
    setPromptHistoryIndex(-1);
    setPreNavigationDraft('');
  }, []);

  const beginRequestCycle = useCallback(() => {
    requestCycleRef.current += 1;
    return requestCycleRef.current;
  }, []);

  const isCurrentRequestCycle = useCallback((cycleId) => requestCycleRef.current === cycleId, []);

  const closeMentionMenu = () => setMentionMenu((prev) => (prev.open ? { ...prev, open: false, items: [], activeIndex: 0 } : prev));

  const updateMentionMenu = (value, cursor = String(value || '').length) => {
    const match = resolveMentionMatch(value, cursor);
    if (!match || match.trigger === '@') {
      closeMentionMenu();
      return;
    }

    const query = normalizeLookup(match.query);
    const items = skillCatalog
          .filter((skill) => (skillsConfig.skills?.[skill.id]?.mode || 'manual') !== 'off')
          .map((skill) => ({
            id: skill.id,
            label: skill.label,
            description: skill.description || skill.usageHint,
            insertText: `/${skill.id} `,
            type: 'skill',
          }))
      .filter((item) => !query || normalizeLookup(item.label).includes(query) || normalizeLookup(item.id).includes(query))
      .slice(0, 6);

    setMentionMenu({
      open: items.length > 0,
      type: 'skill',
      query: match.query,
      start: match.start,
      end: match.end,
      items,
      activeIndex: 0,
    });
  };

  const applyMentionChoice = (item) => {
    const textarea = inputRef.current;
    const currentValue = textarea?.value ?? input;
    const before = currentValue.slice(0, mentionMenu.start);
    const after = currentValue.slice(mentionMenu.end);
    const nextValue = `${before}${after}`;
    if (item.type === 'agent') {
      setPendingMentionSelection({
        ...pendingMentionSelectionRef.current,
        agentId: item.id,
      });
    } else if (item.type === 'skill') {
      setPendingMentionSelection({
        ...pendingMentionSelectionRef.current,
        skillId: item.id,
      });
    }
    preservePendingMentionRef.current = true;
    setDraftInput(nextValue, { preservePendingMention: true });
    closeMentionMenu();
    requestAnimationFrame(() => {
      textarea?.focus();
      const nextCursor = before.length;
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    const syncWorkspace = (event) => {
      const nextAutomation = getWorkspaceAutomation();
      const nextWorkspaceId = String(nextAutomation.activeWorkspaceId || '');
      const shouldResetWorkspaceState = activeWorkspaceIdRef.current !== nextWorkspaceId
        || event?.detail?.reason === 'workspace-switched';
      activeWorkspaceIdRef.current = nextWorkspaceId;
      setWorkspaceAutomation(nextAutomation);
      setRoleAgents(getOrderedRoleAgents(nextAutomation.workflowMode));
      setMessages(getSavedMessagesForDocumentIds(nextAutomation.activeWorkspaceId, documentPersistenceIds));
      setActiveChatSessionId(getSavedActiveChatSessionIdForDocumentIds(nextAutomation.activeWorkspaceId, documentPersistenceIds) || createChatSessionId());
      setChatSessions(getSavedChatSessionsForDocumentIds(nextAutomation.activeWorkspaceId, documentPersistenceIds));
      setPromptHistory(getSavedPromptHistoryForDocumentIds(nextAutomation.activeWorkspaceId, documentPersistenceIds));
      setDebugLogs(getAgentDebugLogs({ workspaceId: nextAutomation.activeWorkspaceId, includeUnscoped: false }).slice(-60).reverse());
      if (shouldResetWorkspaceState) {
        beginRequestCycle();
        setLoading(false);
        setRequestSnapshot(null);
        setActiveAgentStatus({ ...IDLE_AGENT_STATUS });
        setAgentProgressMap({});
        setSelectedAgentId('');
        setPromptHistoryIndex(-1);
        setPreNavigationDraft('');
        clearPendingMentionSelection();
        setMentionMenu({ ...EMPTY_MENTION_MENU });
      }
    };

    syncWorkspace();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('wordai-workspace-changed', syncWorkspace);
    return () => window.removeEventListener('wordai-workspace-changed', syncWorkspace);
  }, [beginRequestCycle, clearPendingMentionSelection, documentPersistenceScopeKey]);

  useEffect(() => {
    if (effectiveDocIdRef.current === effectiveDocId) return;
    effectiveDocIdRef.current = effectiveDocId;
    beginRequestCycle();
    setLoading(false);
    setRequestSnapshot(null);
    setActiveAgentStatus({ ...IDLE_AGENT_STATUS });
    setAgentProgressMap({});
  }, [beginRequestCycle, effectiveDocId]);

  useEffect(() => {
    if (chatPersistenceKeyRef.current === chatMemoryStorageKey) return;
    chatPersistenceKeyRef.current = chatMemoryStorageKey;
    pendingChatPersistenceLoadRef.current = { key: chatMemoryStorageKey, loadedMessages: null };
  }, [chatMemoryStorageKey]);

  useEffect(() => {
    const nextMessages = getSavedMessagesForDocumentIds(workspaceAutomation.activeWorkspaceId, documentPersistenceIds);
    const nextPromptHistory = getSavedPromptHistoryForDocumentIds(workspaceAutomation.activeWorkspaceId, documentPersistenceIds);
    const nextActiveSessionId = getSavedActiveChatSessionIdForDocumentIds(workspaceAutomation.activeWorkspaceId, documentPersistenceIds) || createChatSessionId();
    if (pendingChatPersistenceLoadRef.current?.key === chatMemoryStorageKey) {
      pendingChatPersistenceLoadRef.current = { key: chatMemoryStorageKey, loadedMessages: nextMessages };
    }
    setMessages(nextMessages);
    setActiveChatSessionId(nextActiveSessionId);
    setChatSessions(getSavedChatSessionsForDocumentIds(workspaceAutomation.activeWorkspaceId, documentPersistenceIds));
    setPromptHistory(nextPromptHistory);
    setReviewLedger(readReviewLedgerForDocumentIds(workspaceAutomation.activeWorkspaceId, documentPersistenceIds));
    reviewLedgerLoadedScopeRef.current = `${workspaceAutomation.activeWorkspaceId}::${documentPersistenceScopeKey}`;
  }, [chatMemoryStorageKey, documentPersistenceScopeKey, workspaceAutomation.activeWorkspaceId]);

  useEffect(() => {
    try {
      persistPromptHistoryForDocumentIds(workspaceAutomation.activeWorkspaceId, documentPersistenceIds, promptHistory);
    } catch {}
  }, [documentPersistenceScopeKey, promptHistory, workspaceAutomation.activeWorkspaceId]);

  useEffect(() => {
    if (reviewLedgerLoadedScopeRef.current !== `${workspaceAutomation.activeWorkspaceId}::${documentPersistenceScopeKey}`) return;
    try {
      saveReviewLedgerForDocumentIds(workspaceAutomation.activeWorkspaceId, documentPersistenceIds, reviewLedger);
    } catch {}
  }, [documentPersistenceScopeKey, reviewLedger, workspaceAutomation.activeWorkspaceId]);

  useEffect(() => {
    setAgentProgressMap((prev) => {
      let changed = false;
      const next = { ...prev };
      roleAgents.forEach((agent) => {
        if (!next[agent.id]) {
          next[agent.id] = { state: 'idle', progress: 0, message: 'מוכן' };
          changed = true;
        }
      });
      Object.keys(next).forEach((id) => {
        if (!roleAgents.some((agent) => agent.id === id)) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [roleAgents]);

  useEffect(() => {
    const syncLogs = () => setDebugLogs(getAgentDebugLogs({ workspaceId: workspaceAutomation.activeWorkspaceId, includeUnscoped: false }).slice(-60).reverse());
    syncLogs();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('wordai-agent-logs-updated', syncLogs);
    return () => window.removeEventListener('wordai-agent-logs-updated', syncLogs);
  }, [workspaceAutomation.activeWorkspaceId]);

  useEffect(() => {
    if (selectedSkillId !== 'none' && (skillsConfig.skills?.[selectedSkillId]?.mode || 'manual') === 'off') {
      setSelectedSkillId('none');
    }
    if ((!workspaceAutomationEnabled && selectedAgentId) || (selectedAgentId && !roleAgents.some((agent) => agent.id === selectedAgentId))) {
      setSelectedAgentId('');
      clearPendingMentionSelection();
    }
    if (selectedProviderId !== 'default' && !configuredProviderChoices.some((choice) => choice.id === selectedProviderId)) {
      setSelectedProviderId('default');
    }
  }, [selectedSkillId, selectedAgentId, selectedProviderId, skillsConfig, roleAgents, configuredProviderChoices, workspaceAutomationEnabled, clearPendingMentionSelection]);

  useEffect(() => {
    if (!activeClassicAgentId) return;
    const stillEnabled = sidebarModeSettings.modes.some((mode) => mode.id === activeClassicAgentId && mode.enabled !== false);
    if (!stillEnabled) setActiveClassicAgentId(null);
  }, [activeClassicAgentId, sidebarModeSettings]);

  useEffect(() => {
    if (!activeProviderChoice) return;
    if (selectedProviderModel !== resolvedSelectedProviderModel) {
      setSelectedProviderModel(resolvedSelectedProviderModel);
    }
  }, [activeProviderChoice, resolvedSelectedProviderModel, selectedProviderModel]);

  useEffect(() => {
    const pendingChatPersistenceLoad = pendingChatPersistenceLoadRef.current;
    if (pendingChatPersistenceLoad?.key === chatMemoryStorageKey) {
      if (messages !== pendingChatPersistenceLoad.loadedMessages) return;
      pendingChatPersistenceLoadRef.current = null;
    }
    try {
      persistMessagesForDocumentIds(workspaceAutomation.activeWorkspaceId, documentPersistenceIds, messages);
      saveActiveChatSessionIdForDocumentIds(workspaceAutomation.activeWorkspaceId, documentPersistenceIds, activeChatSessionId);
      setChatSessions(upsertChatSessionForDocumentIds(workspaceAutomation.activeWorkspaceId, documentPersistenceIds, activeChatSessionId, messages));
      saveAppMemory({
        ...getAppMemory(),
        sidebarProviderId: selectedProviderId || 'default',
        sidebarProviderModel: persistedSidebarProviderModel || '',
        lastSelectedAgentId: selectedAgentId || '',
        lastSelectedSkillId: selectedSkillId || 'none',
        sidebarSplitCallCount: configuredSplitCallCount,
        sidebarComposerMode: composerMode,
        lastResolvedSkillLabel: resolvedSkillLabel || '',
      });
    } catch {}
  }, [messages, activeChatSessionId, selectedProviderId, persistedSidebarProviderModel, selectedAgentId, selectedSkillId, configuredSplitCallCount, composerMode, resolvedSkillLabel, chatMemoryStorageKey, documentPersistenceScopeKey, workspaceAutomation.activeWorkspaceId]);

  useEffect(() => {
    if (tab !== 'agents' && showLogs) setShowLogs(false);
  }, [tab, showLogs]);

  const updateAgentStatus = (agentId, agentLabel, payload = {}) => {
    setActiveAgentStatus({
      agentLabel: agentLabel || payload.agentLabel || '',
      progress: payload.progress ?? 0,
      message: payload.message || 'מוכן',
      state: payload.state || 'idle',
      attempt: payload.attempt || 1,
      provider: payload.provider || '',
      model: payload.model || '',
      runId: payload.runId || '',
    });

    if (!agentId) return;
    setAgentProgressMap((prev) => ({
      ...prev,
      [agentId]: {
        state: payload.state || 'idle',
        progress: payload.progress ?? 0,
        message: payload.message || 'מוכן',
        attempt: payload.attempt || 1,
      },
    }));
  };

  const formatLogTime = (ts) => {
    try {
      return new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  };

  const buildProviderStatusSummary = useCallback((providerId = '', modelName = '') => {
    const normalizedProviderId = String(providerId || '').trim();
    if (!normalizedProviderId) return '';
    const configuredChoice = configuredProviderChoices.find((choice) => choice.id === normalizedProviderId) || null;
    const providerLabel = configuredChoice?.label || normalizedProviderId;
    const normalizedModel = modelName
      ? normalizeProviderModelName(normalizedProviderId, String(modelName || '').trim())
      : '';
    return [providerLabel, normalizedModel].filter(Boolean).join(' · ') || providerLabel;
  }, [configuredProviderChoices]);

  const syncRequestSnapshotProviderFromStatus = useCallback((payload = {}) => {
    const providerSummary = buildProviderStatusSummary(payload.provider, payload.model);
    if (!providerSummary) return;
    setRequestSnapshot((prev) => (prev
      ? {
          ...prev,
          providerLabel: providerSummary,
        }
      : prev
    ));
  }, [buildProviderStatusSummary]);

  const getLogAgentTitle = (log = {}) => {
    const primary = String(log.agentName || log.agentLabel || '').trim() || 'מערכת';
    const secondary = String(log.agentLabel || '').trim();
    if (secondary && secondary !== primary) return `${primary} · ${secondary}`;
    return primary;
  };

  const copyLogsToClipboard = async () => {
    try {
      const text = getAgentDebugLogs({ workspaceId: workspaceAutomation.activeWorkspaceId, includeUnscoped: false }).map((log) => {
        const parts = [
          formatLogTime(log.ts),
          getLogAgentTitle(log),
          log.message || '',
          log.workspaceName ? `סביבה: ${log.workspaceName}` : '',
          log.provider ? `מנוע: ${log.provider}` : '',
          log.model ? `מודל: ${log.model}` : '',
          log.attempt ? `ניסיון: ${log.attempt}` : '',
          log.errorMessage ? `שגיאה: ${log.errorMessage}` : '',
        ].filter(Boolean);
        return parts.join(' | ');
      }).join('\n');
      await navigator.clipboard.writeText(text || 'אין לוגים זמינים כרגע.');
    } catch {}
  };

  const clearLogs = () => {
    clearAgentDebugLogs(workspaceAutomation.activeWorkspaceId);
    setDebugLogs([]);
  };

  const clearConversation = useCallback((options = {}) => {
    const clearArchive = options?.clearArchive === true;
    beginRequestCycle();
    // V3: ניקוי שיחה = גבול נושא — ה-scope הישן נסגר, אין ירושת מקורות/שאילתות.
    endRunScope('sidebar');
    const nextSessionId = createChatSessionId();
    try {
      documentPersistenceIds.forEach((documentId) => {
        localStorage.removeItem(getChatMemoryStorageKey(workspaceAutomation.activeWorkspaceId, documentId));
        if (clearArchive) {
          localStorage.removeItem(getChatSessionArchiveStorageKey(workspaceAutomation.activeWorkspaceId, documentId));
          localStorage.removeItem(getActiveChatSessionIdStorageKey(workspaceAutomation.activeWorkspaceId, documentId));
          localStorage.removeItem(getReviewLedgerStorageKey(workspaceAutomation.activeWorkspaceId, documentId));
        }
      });
      saveActiveChatSessionIdForDocumentIds(workspaceAutomation.activeWorkspaceId, documentPersistenceIds, nextSessionId);
    } catch {}
    clearPendingMentionSelection();
    setActiveChatSessionId(nextSessionId);
    setMessages(getDefaultMessages());
    setInput('');
    setTab('chat');
    setPromptHistoryIndex(-1);
    setPreNavigationDraft('');
    setAgentTaskInput('');
    setLoading(false);
    setResolvedSkillLabel('');
    setRequestSnapshot(null);
    setActiveAgentStatus({ ...IDLE_AGENT_STATUS });
    setAgentProgressMap({});
    if (clearArchive) setChatSessions([]);
    if (clearArchive) setReviewLedger({});
    setMentionMenu({ ...EMPTY_MENTION_MENU });
  }, [beginRequestCycle, clearPendingMentionSelection, documentPersistenceScopeKey, workspaceAutomation.activeWorkspaceId]);

  const loadChatSession = useCallback((session = {}) => {
    const sessionId = String(session?.id || '').trim();
    const sessionMessages = normalizeMessagesForPersistence(session?.messages || []);
    if (!sessionId || !sessionMessages.length || loading) return;
    beginRequestCycle();
    // V3: מעבר לשיחה אחרת = גבול נושא.
    endRunScope('sidebar');
    try {
      saveActiveChatSessionIdForDocumentIds(workspaceAutomation.activeWorkspaceId, documentPersistenceIds, sessionId);
      persistMessagesForDocumentIds(workspaceAutomation.activeWorkspaceId, documentPersistenceIds, sessionMessages);
    } catch {}
    clearPendingMentionSelection();
    setActiveChatSessionId(sessionId);
    setMessages(sessionMessages);
    setInput('');
    setPromptHistoryIndex(-1);
    setPreNavigationDraft('');
    setAgentTaskInput('');
    setLoading(false);
    setRequestSnapshot(null);
    setActiveAgentStatus({ ...IDLE_AGENT_STATUS });
    setAgentProgressMap({});
    setMentionMenu({ ...EMPTY_MENTION_MENU });
    setTab('chat');
  }, [beginRequestCycle, clearPendingMentionSelection, documentPersistenceScopeKey, loading, workspaceAutomation.activeWorkspaceId]);

  const deleteArchivedChatSession = useCallback((sessionId = '') => {
    const safeSessionId = String(sessionId || '').trim();
    if (!safeSessionId || loading) return;
    const nextSessions = deleteChatSessionForDocumentIds(workspaceAutomation.activeWorkspaceId, documentPersistenceIds, safeSessionId);
    setChatSessions(nextSessions);
    setReviewLedger((prev) => {
      if (!prev[safeSessionId]) return prev;
      const next = { ...prev };
      delete next[safeSessionId];
      return next;
    });
    if (safeSessionId === activeChatSessionId) {
      clearConversation();
      setChatSessions(nextSessions);
    }
  }, [activeChatSessionId, clearConversation, documentPersistenceScopeKey, loading, workspaceAutomation.activeWorkspaceId]);

  const dismissReviewFinding = useCallback((findingId = '') => {
    const safeFindingId = String(findingId || '').trim();
    if (!safeFindingId) return;
    setReviewLedger((prev) => {
      const session = prev[activeChatSessionId];
      if (!session) return prev;
      const findings = (Array.isArray(session.findings) ? session.findings : []).map((finding) => (
        finding.findingId === safeFindingId ? { ...finding, status: 'dismissed' } : finding
      ));
      const hasOpenBlocking = findings.some((finding) => finding.status === 'open' && (finding.severity === 'critical' || finding.severity === 'important'));
      // דחיית הממצא החוסם האחרון לא מכריזה "מוכן" בשם המודל — רק מנקה את "לא מוכן".
      const verdict = !hasOpenBlocking && session.verdict === 'not-ready' ? '' : session.verdict;
      return { ...prev, [activeChatSessionId]: { ...session, findings, verdict, updatedAt: Date.now() } };
    });
  }, [activeChatSessionId]);

  const activeReviewSession = reviewLedger[activeChatSessionId] || null;

  // שורות ממצאים מתחת לבועת תשובה של סוכן המרצה: נקודת חומרה + כותרת + "לא רלוונטי".
  const renderReviewFindingRows = (msg, variant = 'dark') => {
    if (msg?.role !== 'assistant' || msg?.reviewAgentId !== 'lecturer' || msg?.error) return null;
    const parsed = parseReviewFindings(msg.content);
    if (!parsed.findings.length) return null;
    const dark = variant === 'dark';
    const sessionFindings = Array.isArray(activeReviewSession?.findings) ? activeReviewSession.findings : [];
    const textColor = dark ? '#CBD5E1' : '#334155';
    const mutedColor = dark ? '#94A3B8' : '#64748B';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, width: '100%' }}>
        {parsed.findings.map((finding) => {
          const ledgerEntry = sessionFindings.find((entry) => entry.findingId === finding.findingId) || null;
          const status = ledgerEntry?.status || 'open';
          const dotColor = finding.severity === 'critical' ? '#F87171' : finding.severity === 'important' ? '#FBBF24' : (dark ? '#94A3B8' : '#CBD5E1');
          return (
            <div key={finding.findingId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: textColor, opacity: status === 'dismissed' ? 0.55 : 1 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: status === 'dismissed' ? 'line-through' : 'none' }}>{finding.title}</span>
              {status === 'open' && (
                <button
                  type="button"
                  onClick={() => dismissReviewFinding(finding.findingId)}
                  title="הממצא לא רלוונטי — אל תעלה אותו שוב"
                  style={{ fontSize: 10, color: mutedColor, background: dark ? 'rgba(148, 163, 184, 0.1)' : '#F1F5F9', border: dark ? '1px solid rgba(148, 163, 184, 0.22)' : '1px solid #E2E8F0', borderRadius: 10, padding: '2px 8px', cursor: 'pointer', fontWeight: 500, flexShrink: 0 }}
                >
                  לא רלוונטי
                </button>
              )}
              {status === 'dismissed' && <span style={{ fontSize: 10, color: mutedColor, flexShrink: 0 }}>נדחה</span>}
              {status === 'fixed' && <span style={{ fontSize: 10, color: '#34D399', flexShrink: 0 }}>טופל</span>}
            </div>
          );
        })}
      </div>
    );
  };

  // chip "מוכן להגשה" מעל אזור הכתיבה — רק כשפסק הדין האחרון של המרצה הוא ready.
  const renderReviewVerdictChip = (variant = 'dark') => {
    if (activeReviewSession?.verdict !== 'ready') return null;
    const dark = variant === 'dark';
    return (
      <div style={{
        margin: '0 0 8px',
        padding: '6px 12px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 700,
        textAlign: 'center',
        color: dark ? '#BBF7D0' : '#047857',
        background: dark ? 'rgba(6, 78, 59, 0.24)' : '#ECFDF5',
        border: dark ? '1px solid rgba(52, 211, 153, 0.22)' : '1px solid #A7F3D0',
      }}>
        ✅ מוכן להגשה — אין ממצאים קריטיים או חשובים פתוחים
      </div>
    );
  };

  // בורר מודל קומפקטי בשורת הכתיבה — גישה מהירה לספק/מודל בלי להיכנס להגדרות.
  // ברירת מחדל 'default' = לפי ההגדרות + שדרוג אוטומטי למודל חזק בצ'אט כללי.
  const renderComposerModelQuickPick = (variant = 'dark') => {
    if (forceGlobalSidebarProvider || !configuredProviderChoices.length) return null;
    const dark = variant === 'dark';
    const selectStyle = {
      fontSize: 11,
      fontWeight: 600,
      color: dark ? '#E2E8F0' : '#334155',
      background: dark ? 'rgba(148,163,184,0.12)' : '#F1F5F9',
      border: dark ? '1px solid rgba(148,163,184,0.24)' : '1px solid #E2E8F0',
      borderRadius: 9,
      padding: '3px 8px',
      cursor: 'pointer',
      outline: 'none',
      maxWidth: 150,
    };
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: dark ? 'rgba(226,232,240,0.6)' : '#64748B', fontWeight: 600 }}>🧠 מודל:</span>
        <select
          value={selectedProviderId || 'default'}
          onChange={(e) => { clearPendingMentionSelection(); setSelectedProviderId(e.target.value); setSelectedAgentId(''); }}
          disabled={isSettingsLocked}
          style={selectStyle}
          title="ספק לשיחה במסך הזה"
        >
          <option value="default" style={{ color: '#1F2937' }}>אוטומטי (חזק לצ'אט כללי)</option>
          {configuredProviderChoices.map((provider) => (
            <option key={provider.id} value={provider.id} style={{ color: '#1F2937' }}>{provider.label}</option>
          ))}
        </select>
        {activeProviderChoice && providerModelChoices.length > 1 && (
          <select
            value={resolvedSelectedProviderModel}
            onChange={(e) => { clearPendingMentionSelection(); setSelectedProviderModel(e.target.value); }}
            disabled={isSettingsLocked}
            style={selectStyle}
            title="מודל למסך הזה"
          >
            {providerModelChoices.map((modelId) => (
              <option key={modelId} value={modelId} style={{ color: '#1F2937' }}>{modelId}</option>
            ))}
          </select>
        )}
      </div>
    );
  };

  const renderChatHistoryPanel = (variant = 'light') => {
    const dark = variant === 'dark';
    const panelBackground = dark ? 'rgba(15, 23, 42, 0.34)' : '#FFFFFF';
    const textColor = dark ? '#F8FAFC' : '#111827';
    const mutedColor = dark ? 'rgba(226,232,240,0.72)' : '#64748B';
    const borderColor = dark ? 'rgba(148, 163, 184, 0.2)' : '#E2E8F0';
    const itemBackground = dark ? 'rgba(255,255,255,0.06)' : '#F8FAFC';

    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, background: panelBackground, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: textColor }}>שיחות קודמות</div>
            <div style={{ fontSize: 12, color: mutedColor, marginTop: 3 }}>נשמרות לפי המסמך וסביבת העבודה הפעילים.</div>
          </div>
          <button
            type="button"
            onClick={clearConversation}
            disabled={loading}
            style={{ padding: '7px 12px', borderRadius: 999, border: `1px solid ${dark ? 'rgba(94, 234, 212, 0.28)' : '#99F6E4'}`, background: dark ? 'rgba(20, 184, 166, 0.14)' : '#F0FDFA', color: dark ? '#99F6E4' : '#0F766E', fontSize: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.55 : 1 }}
          >
            + שיחה חדשה
          </button>
        </div>

        {!chatSessions.length ? (
          <div style={{ border: `1px dashed ${borderColor}`, borderRadius: 10, padding: 16, color: mutedColor, fontSize: 13, lineHeight: 1.6, textAlign: 'center' }}>
            עדיין אין שיחות קודמות למסמך הזה. אחרי שתשלח הודעה, השיחה תופיע כאן אוטומטית.
          </div>
        ) : chatSessions.map((session) => {
          const isActive = session.id === activeChatSessionId;
          const updatedAt = session.updatedAt ? new Date(session.updatedAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '';
          return (
            <div key={session.id} style={{ border: `1px solid ${isActive ? (dark ? 'rgba(45, 212, 191, 0.45)' : '#5EEAD4') : borderColor}`, borderRadius: 10, padding: 10, background: isActive ? (dark ? 'rgba(20, 184, 166, 0.13)' : '#F0FDFA') : itemBackground }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: textColor, fontSize: 13, fontWeight: 800, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {session.title}
                  </div>
                  <div style={{ color: mutedColor, fontSize: 11, marginTop: 4 }}>
                    {updatedAt}{updatedAt ? ' · ' : ''}{session.messageCount || session.messages?.length || 0} הודעות{isActive ? ' · פתוחה עכשיו' : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => loadChatSession(session)}
                    disabled={loading || isActive}
                    style={{ padding: '5px 9px', borderRadius: 7, border: `1px solid ${dark ? 'rgba(191, 219, 254, 0.24)' : '#BFDBFE'}`, background: dark ? 'rgba(59, 130, 246, 0.14)' : '#EFF6FF', color: dark ? '#BFDBFE' : '#1D4ED8', fontSize: 11, fontWeight: 700, cursor: loading || isActive ? 'default' : 'pointer', opacity: loading || isActive ? 0.55 : 1 }}
                  >
                    פתח
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteArchivedChatSession(session.id)}
                    disabled={loading}
                    style={{ padding: '5px 9px', borderRadius: 7, border: `1px solid ${dark ? 'rgba(248, 113, 113, 0.24)' : '#FECACA'}`, background: dark ? 'rgba(127, 29, 29, 0.18)' : '#FEF2F2', color: dark ? '#FCA5A5' : '#B91C1C', fontSize: 11, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.55 : 1 }}
                  >
                    מחק
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleReset = (event) => {
      const targetWorkspaceId = String(event?.detail?.workspaceId || '').trim();
      const shouldClearAll = event?.detail?.clearAll === true;
      const activeWorkspaceId = String(workspaceAutomation.activeWorkspaceId || '').trim();
      if (!shouldClearAll && targetWorkspaceId && targetWorkspaceId !== activeWorkspaceId) return;
      clearConversation({ clearArchive: shouldClearAll });
    };
    window.addEventListener('wordai-chat-history-cleared', handleReset);
    return () => window.removeEventListener('wordai-chat-history-cleared', handleReset);
  }, [clearConversation, workspaceAutomation.activeWorkspaceId]);

  const snapshotEditTarget = useCallback((target) => (
    target
      ? {
          kind: target.kind,
          from: target.from,
          to: target.to,
          text: target.text,
          before: target.before,
          after: target.after,
          targetId: target.targetId,
          sliceJson: target.sliceJson,
          normalizedHtml: target.normalizedHtml,
          headingText: target.headingText,
          headingLevel: target.headingLevel,
          sectionIndex: target.sectionIndex,
          matchKind: target.matchKind,
          locatorText: target.locatorText,
          locatorLabel: target.locatorLabel,
        }
      : null
  ), []);

  const snapshotEditTargetState = useCallback((targetState) => {
    const selectionTarget = snapshotEditTarget(targetState?.selection || null);
    const blockTarget = snapshotEditTarget(targetState?.block || null);
    const activeTarget = snapshotEditTarget(targetState?.active || null) || selectionTarget || blockTarget;
    return {
      selection: selectionTarget,
      block: blockTarget,
      active: activeTarget,
    };
  }, [snapshotEditTarget]);

  const hasUsableEditTargetState = useCallback((targetState) => Boolean(
    targetState?.active?.text?.trim()
    || targetState?.selection?.text?.trim()
    || targetState?.block?.text?.trim()
  ), []);

  const getResolvedEditTargets = useCallback(() => {
    const liveTargets = typeof getCurrentEditTarget === 'function' ? getCurrentEditTarget() : null;
    const preferredTargetState = liveTargets && typeof liveTargets === 'object' && hasUsableEditTargetState(liveTargets)
      ? liveTargets
      : editTarget;
    return snapshotEditTargetState(preferredTargetState);
  }, [getCurrentEditTarget, editTarget, hasUsableEditTargetState, snapshotEditTargetState]);

  const describeEditTargetScope = useCallback((target) => {
    if (!target?.text?.trim()) return contextScopeLabel;
    if (target.kind === 'selection') return 'טקסט נבחר';
    if (target.kind === 'block') return 'פסקה פעילה';
    if (target.kind === 'section') {
      return target.headingText ? `סעיף: ${target.headingText}` : 'סעיף במסמך';
    }
    return contextScopeLabel;
  }, [contextScopeLabel]);

  const resolvePromptEditTargetState = useCallback((promptText = '') => {
    const liveTargets = getResolvedEditTargets();
    const liveActiveTarget = liveTargets?.active || null;
    const cleanPrompt = String(promptText || '').trim();
    if (!isEditComposerMode || !cleanPrompt || typeof resolveEditTargetFromPrompt !== 'function') {
      return {
        targetState: liveTargets,
        activeTarget: liveActiveTarget,
        scopeLabel: describeEditTargetScope(liveActiveTarget),
      };
    }

    const resolvedTarget = snapshotEditTarget(resolveEditTargetFromPrompt(cleanPrompt));
    const promptResolution = typeof resolveEditTargetsFromPrompt === 'function'
      ? resolveEditTargetsFromPrompt(cleanPrompt)
      : null;
    const unresolvedExplicitReferences = getPromptResolutionUnresolvedReferences(promptResolution);
    if (unresolvedExplicitReferences.length && !shouldRouteUnresolvedReferenceToDocumentPlan(cleanPrompt)) {
      return {
        targetState: liveTargets,
        activeTarget: liveActiveTarget,
        batchTargets: [],
        hasPromptResolvedTarget: true,
        scopeLabel: describeEditTargetScope(liveActiveTarget),
        blockedMessage: buildUnresolvedExplicitReferenceMessage(unresolvedExplicitReferences),
      };
    }
    const resolvedBatchTargets = getPromptResolutionTargets(promptResolution)
      .map(snapshotEditTarget)
      .filter((target) => target?.text?.trim());
    const shouldUseBatchTargets = resolvedBatchTargets.length > 1;

    if (shouldUseBatchTargets) {
      return {
        targetState: {
          ...(liveTargets || { selection: null, block: null, active: null }),
          active: resolvedBatchTargets[0],
        },
        activeTarget: resolvedBatchTargets[0],
        batchTargets: resolvedBatchTargets,
        hasPromptResolvedTarget: true,
        scopeLabel: `${resolvedBatchTargets.length} אזורי עריכה`,
      };
    }
    const shouldUseResolvedTarget = Boolean(
      resolvedTarget?.text?.trim() && (
        !liveActiveTarget?.text?.trim()
        || liveActiveTarget.from !== resolvedTarget.from
        || liveActiveTarget.to !== resolvedTarget.to
      )
    );

    if (!shouldUseResolvedTarget) {
      return {
        targetState: liveTargets,
        activeTarget: liveActiveTarget,
        hasPromptResolvedTarget: false,
        scopeLabel: describeEditTargetScope(liveActiveTarget),
      };
    }

    return {
      targetState: {
        ...(liveTargets || { selection: null, block: null, active: null }),
        active: resolvedTarget,
      },
      activeTarget: resolvedTarget,
      batchTargets: [],
      hasPromptResolvedTarget: true,
      scopeLabel: describeEditTargetScope(resolvedTarget),
    };
  }, [describeEditTargetScope, getResolvedEditTargets, isEditComposerMode, resolveEditTargetFromPrompt, resolveEditTargetsFromPrompt, snapshotEditTarget]);

  const shouldUseDocumentWideEditPlan = useCallback((promptText = '', { hasPromptResolvedTarget = false, batchTargets = [], forceDocumentWide = false, activeTarget = null, hasNumberedReviewContext = false } = {}) => {
    const cleanPrompt = String(promptText || '').trim();
    if (!isEditComposerMode || !cleanPrompt || typeof onApplyDocumentPlan !== 'function') return false;
    const hasPromptNumberedReviewContext = NUMBERED_REVIEW_CONTEXT_PATTERN.test(cleanPrompt) && NUMBERED_LIST_MARKER_PATTERN.test(cleanPrompt);
    if (SOURCE_INTEGRATION_PLAN_PATTERN.test(cleanPrompt) && /(?:החל|תחיל|יישם|תיישם|תשלב|שלב|הכנס|תכניס|עדכן|תעדכן|תקן|תתקן|בצע|תבצע|תעשה|עשה|תעשי|עשי|שילוב|הוספה)/iu.test(cleanPrompt)) return true;
    if ((hasNumberedReviewContext || hasPromptNumberedReviewContext) && NUMBERED_REVIEW_APPLY_INTENT_PATTERN.test(cleanPrompt)) return true;
    if (hasPromptResolvedTarget) return false;
    if ((Array.isArray(batchTargets) ? batchTargets : []).some((target) => target?.text?.trim())) return false;
    if (forceDocumentWide && !activeTarget?.text?.trim() && TASKPANE_FIX_APPLY_INTENT_PATTERN.test(cleanPrompt)) return true;
    if (!forceDocumentWide && !EXPLICIT_DOCUMENT_WIDE_INTENT_PATTERN.test(cleanPrompt)) return false;
    return documentWideEditPlanPattern.test(cleanPrompt);
  }, [isEditComposerMode, onApplyDocumentPlan]);

  const executeDocumentWideEditPlan = async ({
    userContent = '',
    promptText = '',
    providerLabel = activeProviderSummary,
    providerId = '',
    providerModel = '',
    agentId = 'assistant-main',
    agentLabel = 'צ׳אט ישיר',
    skillLabel = 'ללא סקיל',
    fallbackInsertText = '',
  } = {}) => {
    if (typeof onApplyDocumentPlan !== 'function' || loading) return;
    const requestCycle = beginRequestCycle();
    const safeUserContent = String(userContent || promptText || '').trim();
    const safePromptText = String(promptText || '').trim();
    const safeAgentLabel = String(agentLabel || 'צ׳אט ישיר').trim() || 'צ׳אט ישיר';
    const requestScopeLabel = 'עריכה מרובת מיקומים במסמך';

    setTab('chat');
    setRequestSnapshot({
      providerLabel,
      agentLabel: safeAgentLabel,
      skillLabel,
      scopeLabel: requestScopeLabel,
      contextPreview,
    });
    setMessages((prev) => [...prev, { role: 'user', content: safeUserContent, composerMode }, { role: 'assistant', content: '', composerMode }]);
    setLoading(true);
    updateAgentStatus(agentId, safeAgentLabel, { state: 'running', progress: 12, message: 'ממפה את התיקונים למיקומים הנכונים במסמך' });

    try {
      const applyResult = await onApplyDocumentPlan({
        promptText: safePromptText,
        conversationHistoryText: formatSidebarConversationHistory(messages),
        selectedProviderId: providerId,
        selectedProviderModel: providerModel,
        agentType: agentId || 'assistant-main',
        fallbackInsertText,
      });
      if (!isCurrentRequestCycle(requestCycle)) return;
      const assistantContent = String(applyResult?.message || '').trim() || 'לא התקבלה תשובת החלה מהמסמך.';
      const documentActionMeta = buildDocumentActionMeta(applyResult, assistantContent, {
        promptText: safePromptText,
        providerId,
        providerModel,
        agentId,
        agentLabel: safeAgentLabel,
      });
      setMessages((prev) => {
        const nextMessages = [...prev];
        nextMessages[nextMessages.length - 1] = {
          ...nextMessages[nextMessages.length - 1],
          content: assistantContent,
          composerMode,
          ...documentActionMeta,
        };
        return nextMessages;
      });
      updateAgentStatus(agentId, safeAgentLabel, (applyResult?.ok || applyResult?.partial)
        ? { state: 'success', progress: 100, message: assistantContent }
        : { state: 'error', progress: 100, message: assistantContent || 'העריכה לא הוחלה במסמך' });
    } catch (error) {
      if (!isCurrentRequestCycle(requestCycle)) return;
      const errorMessage = error?.message || 'לא הצלחתי למפות את התיקונים למסמך.';
      setMessages((prev) => {
        const nextMessages = [...prev];
        nextMessages[nextMessages.length - 1] = {
          ...nextMessages[nextMessages.length - 1],
          content: errorMessage,
          error: true,
          composerMode,
        };
        return nextMessages;
      });
      updateAgentStatus(agentId, safeAgentLabel, { state: 'error', progress: 100, message: errorMessage });
    } finally {
      // ניקוי loading/snapshot תמיד — גם אם מחזור הבקשה התחלף בינתיים (מעבר מסמך/workspace/reset),
      // כדי שלא להישאר תקועים ב-loading. רק החזרת הפוקוס מותנית בכך שזו עדיין הבקשה הנוכחית.
      setLoading(false);
      setRequestSnapshot(null);
      if (isCurrentRequestCycle(requestCycle)) inputRef.current?.focus();
    }
  };

  const buildDocumentActionCompletionPrompt = (message = {}) => {
    const unresolved = Array.isArray(message?.documentActionUnresolved) ? message.documentActionUnresolved : [];
    const unresolvedTitles = unresolved
      .map((item, index) => [
        item?.title || item?.suggestionId || `תיקון ${index + 1}`,
        item?.description || item?.reason || item?.instruction || item?.replacementText || item?.text || '',
      ].map((part) => String(part || '').trim()).filter(Boolean).join(': '))
      .filter(Boolean);
    const originalPrompt = String(message?.documentActionPromptText || '').trim();

    return [
      'קריאת השלמה לתיקוני בדיקה + תיקון.',
      'בקריאה הקודמת חלק מהתיקונים הוחלו וחלק נשארו מחוץ למסמך כי לא נמצא להם מיקום ייחודי או כי תקציב הקריאה לא הספיק.',
      unresolvedTitles.length
        ? `התמקד רק בתיקונים הבאים שנשארו להשלמה:\n${unresolvedTitles.map((title, index) => `${index + 1}. ${title}`).join('\n')}`
        : 'התמקד רק בתיקונים שנשארו מחוץ למסמך בקריאה הקודמת.',
      'בדוק את המסמך הנוכחי אחרי התיקונים שכבר הוחלו. אל תחזור על תיקונים שכבר קיימים במסמך או מסומנים כהצעות AI.',
      'מותר להחליף טקסט קיים, לאחד כפילויות, למחוק כפילות רעיונית, או להוסיף תוכן חדש לפני/אחרי אזור קיים לפי הצורך.',
      originalPrompt ? `הבקשה המקורית:\n${originalPrompt}` : '',
    ].filter(Boolean).join('\n\n');
  };

  const continueDocumentActionCompletion = async (message = {}) => {
    if (loading || !message?.documentActionCanContinue) return;
    const promptText = buildDocumentActionCompletionPrompt(message);
    if (!promptText.trim()) return;

    await executeDocumentWideEditPlan({
      userContent: 'השלם את התיקונים שנשארו מחוץ למסמך',
      promptText,
      providerLabel: activeProviderSummary,
      providerId: forceGlobalSidebarProvider ? normalizeProviderOverrideId(effectiveSidebarProviderId) : normalizeProviderOverrideId(message.documentActionProviderId || effectiveSidebarProviderId),
      providerModel: forceGlobalSidebarProvider ? resolvedSelectedProviderModel : (message.documentActionProviderModel || resolvedSelectedProviderModel),
      agentId: message.documentActionAgentId || 'reviewFix',
      agentLabel: `${message.documentActionAgentLabel || 'בדיקה + תיקון'} · השלמה`,
      skillLabel: 'קריאת השלמה',
    });
  };

  const copyMessageToClipboard = async (content = '') => {
    try {
      await navigator.clipboard.writeText(String(content || '').trim());
    } catch {}
  };

  const normalizeProviderOverrideId = (providerId = '') => {
    const normalized = String(providerId || '').trim();
    return normalized && normalized !== 'default' ? normalized : '';
  };

  const applyChatMessageToDocument = async (message = {}) => {
    const outputText = String(message?.content || '').trim();
    if (loading || !outputText || typeof onApplyDocumentPlan !== 'function') return;
    const promptText = [
      'החל את פלט הצ׳אט הבא במסמך לפי המיקומים המתאימים. אם צריך, בצע קריאה נוספת כדי למפות את התוכן לפסקאות, סעיפים או מקומות קיימים במסמך.',
      'מותר להחליף טקסט קיים, להוסיף תוכן חדש לפני/אחרי אזור מתאים, או לפצל את ההחלה לכמה מיקומים. אל תדביק את כל הפלט במקום אחד אם יש מיקומים מדויקים יותר.',
      `פלט הצ׳אט להחלה:\n${outputText}`,
    ].join('\n\n');

    await executeDocumentWideEditPlan({
      userContent: 'החל את התשובה במסמך לפי המיקומים המתאימים',
      promptText,
      providerLabel: activeProviderSummary,
      providerId: forceGlobalSidebarProvider ? normalizeProviderOverrideId(effectiveSidebarProviderId) : normalizeProviderOverrideId(message.documentActionProviderId || effectiveSidebarProviderId),
      providerModel: forceGlobalSidebarProvider ? resolvedSelectedProviderModel : (message.documentActionProviderModel || resolvedSelectedProviderModel),
      agentId: message.documentActionAgentId || 'chat-retrofit-apply',
      agentLabel: 'החלה בדיעבד',
      skillLabel: 'מיפוי מיקומים',
      fallbackInsertText: outputText,
    });

    // חבר ביקורתי: החלת תשובת מרצה במסמך מסמנת את הממצאים שבה כ"טופלו" (best-effort) —
    // כך הם לא יעלו שוב בסבב הבא אלא אם הבעיה חזרה בטקסט.
    if (message?.reviewAgentId === 'lecturer') {
      const appliedFindingIds = new Set(parseReviewFindings(outputText).findings.map((finding) => finding.findingId));
      if (appliedFindingIds.size) {
        setReviewLedger((prev) => {
          const session = prev[activeChatSessionId];
          if (!session) return prev;
          const findings = (Array.isArray(session.findings) ? session.findings : []).map((finding) => (
            appliedFindingIds.has(finding.findingId) && finding.status === 'open'
              ? { ...finding, status: 'fixed' }
              : finding
          ));
          return { ...prev, [activeChatSessionId]: { ...session, findings, updatedAt: Date.now() } };
        });
      }
    }
  };

  const stripComposerModeDirectiveFromSystemPrompt = useCallback((systemPrompt = '') => {
    const fullPrompt = String(systemPrompt || '').trim();
    const modePrompt = String(composerModeSystemPrompt || '').trim();
    if (!fullPrompt || !modePrompt) return fullPrompt;
    const sanitized = fullPrompt.split(modePrompt).join('').replace(/\n{3,}/g, '\n\n').trim();
    return sanitized;
  }, [composerModeSystemPrompt]);

  const runSplitCallWorkflow = async ({
    splitCallCount = 0,
    promptText = '',
    context = '',
    extraSystemPrompt = '',
    invokeCall = null,
    onProgress = () => {},
  } = {}) => {
    const normalizedCount = clampSplitCallCount(splitCallCount);
    const normalizedPrompt = String(promptText || '').trim();
    if (normalizedCount < 2 || !normalizedPrompt || typeof invokeCall !== 'function') {
      return invokeCall ? await invokeCall(normalizedPrompt, context, extraSystemPrompt, { phase: 'single', stepIndex: 1, stepCount: 1 }) : '';
    }

    const baseContext = String(context || '').trim();
    const plannerContext = baseContext.slice(0, SPLIT_CALL_PLANNER_CONTEXT_MAX_CHARS);
    const stepBaseContext = baseContext.slice(0, SPLIT_CALL_STEP_CONTEXT_MAX_CHARS);
    const fallbackSingleCall = () => invokeCall(normalizedPrompt, baseContext, extraSystemPrompt, {
      phase: 'fallback-single',
      stepIndex: 1,
      stepCount: 1,
    });

    onProgress({ progress: 12, message: `מחלק את הבקשה ל-${normalizedCount} קריאות` });
    const plannerPrompt = [
      `חלק את הבקשה הבאה ל-${normalizedCount} קריאות מודל רצופות.`,
      'החזר JSON בלבד עם מערך steps, וכל step חייב לכלול title ו-instruction.',
      'אסור להחזיר markdown או הסבר מחוץ ל-JSON.',
      `בקשה:\n${normalizedPrompt}`,
    ].join('\n\n');
    const plannerSystemPrompt = [
      'אתה מתכנן רצף עבודה רב-שלבי לבקשה עמוסה.',
      `חובה להחזיר בדיוק ${normalizedCount} steps לא חופפים, בסדר ביצוע הגיוני.`,
      'כל instruction צריך להיות קצר, מעשי, ולהנחות מה לעשות באותה קריאה בלי לחזור על כל המשימה מחדש.',
    ].join('\n\n');

    let plannerReply = '';
    try {
      plannerReply = await invokeCall(plannerPrompt, plannerContext, plannerSystemPrompt, {
        phase: 'planner',
        stepIndex: 0,
        stepCount: normalizedCount,
      });
    } catch {
      onProgress({ progress: 18, message: 'תכנון הפיצול נכשל, חוזר לקריאה אחת' });
      return await fallbackSingleCall();
    }
    let planSteps = normalizeSplitCallPlan(tryParseJsonPayload(plannerReply), normalizedCount);
    if (planSteps.length !== normalizedCount) {
      onProgress({ progress: 16, message: 'מנסה לייצב את תכנית הפיצול' });
      try {
        plannerReply = await invokeCall(plannerPrompt, plannerContext, plannerSystemPrompt, {
          phase: 'planner-retry',
          stepIndex: 0,
          stepCount: normalizedCount,
        });
      } catch {
        onProgress({ progress: 18, message: 'תכנון הפיצול לא התייצב, חוזר לקריאה אחת' });
        return await fallbackSingleCall();
      }
      planSteps = normalizeSplitCallPlan(tryParseJsonPayload(plannerReply), normalizedCount);
    }
    if (planSteps.length !== normalizedCount) {
      onProgress({ progress: 18, message: 'תכנית הפיצול לא התייצבה, חוזר לקריאה אחת' });
      return await fallbackSingleCall();
    }
    const stepOutputs = [];

    for (let index = 0; index < planSteps.length; index += 1) {
      const step = planSteps[index];
      onProgress({
        progress: Math.min(82, 18 + Math.round(((index + 1) / Math.max(1, normalizedCount + 1)) * 56)),
        message: `מבצע חלק ${index + 1} מתוך ${normalizedCount}: ${step.title}`,
      });

      const previousOutputsContext = stepOutputs.length
        ? [
          'תוצרי החלקים שכבר הושלמו:',
          ...buildSplitCallOutputsContext(stepOutputs),
        ].join('\n\n')
        : '';
      const stepContext = [
        stepBaseContext,
        `הבקשה המקורית:\n${normalizedPrompt}`,
        previousOutputsContext,
      ].filter(Boolean).join('\n\n');
      const stepPrompt = [
        `בצע עכשיו רק את חלק ${index + 1} מתוך ${normalizedCount}.`,
        `שם החלק: ${step.title}`,
        `הנחיית החלק: ${step.instruction}`,
        'החזר את הפלט של החלק הזה בלבד.',
      ].join('\n\n');
      let stepReply = '';
      try {
        stepReply = await invokeCall(stepPrompt, stepContext, extraSystemPrompt, {
          phase: 'step',
          stepIndex: index + 1,
          stepCount: normalizedCount,
        });
        if (!String(stepReply || '').trim()) {
          throw new Error('empty-step-reply');
        }
      } catch {
        const reducedStepContext = stepBaseContext
          ? stepBaseContext.slice(0, Math.max(1200, Math.floor(SPLIT_CALL_STEP_CONTEXT_MAX_CHARS / 2)))
          : '';
        const fallbackStepContext = [
          reducedStepContext,
          `הבקשה המקורית:\n${normalizedPrompt}`,
          previousOutputsContext,
        ].filter(Boolean).join('\n\n');
        try {
          stepReply = await invokeCall(stepPrompt, fallbackStepContext, extraSystemPrompt, {
            phase: 'step-retry',
            stepIndex: index + 1,
            stepCount: normalizedCount,
          });
        } catch {
          onProgress({ progress: 20, message: 'חלק אחד נכשל, חוזר לקריאה אחת מלאה' });
          return await fallbackSingleCall();
        }
        if (!String(stepReply || '').trim()) {
          onProgress({ progress: 20, message: 'שלב אחד חזר ריק, חוזר לקריאה אחת מלאה' });
          return await fallbackSingleCall();
        }
      }
      stepOutputs.push({
        title: step.title,
        content: String(stepReply || '').trim(),
        contextExcerpt: truncateSplitCallOutput(stepReply),
      });
    }

    onProgress({ progress: 92, message: 'מאחד את תוצרי הקריאות לתשובה סופית' });
    const mergeContext = [
      stepBaseContext,
      `הבקשה המקורית:\n${normalizedPrompt}`,
      'תוצרי הקריאות שהושלמו:',
      ...buildSplitCallOutputsContext(stepOutputs),
    ].filter(Boolean).join('\n\n');
    const mergePrompt = [
      `אחד עכשיו את ${normalizedCount} הקריאות לתשובה סופית אחת למשתמש.`,
      'שמור על כל המסקנות החשובות בלי לחזור על עצמך.',
      'אל תזכיר למשתמש את שלבי הפיצול אלא אם זה נחוץ להבנת התשובה.',
    ].join('\n\n');

    try {
      const mergeReply = await invokeCall(mergePrompt, mergeContext, extraSystemPrompt, {
        phase: 'merge',
        stepIndex: normalizedCount + 1,
        stepCount: normalizedCount,
      });
      if (!String(mergeReply || '').trim()) {
        throw new Error('empty-merge-reply');
      }
      return mergeReply;
    } catch {
      onProgress({ progress: 94, message: 'מיזוג הפיצול נכשל, מנסה מיזוג מצומצם יותר' });
      const reducedMergeContext = [
        `הבקשה המקורית:\n${normalizedPrompt}`,
        'תוצרי הקריאות שהושלמו:',
        ...buildSplitCallOutputsContext(stepOutputs, Math.min(SPLIT_CALL_OUTPUT_TOTAL_CONTEXT_BUDGET, 2600)),
      ].filter(Boolean).join('\n\n');
      try {
        const reducedMergeReply = await invokeCall(mergePrompt, reducedMergeContext, extraSystemPrompt, {
          phase: 'merge-retry',
          stepIndex: normalizedCount + 1,
          stepCount: normalizedCount,
        });
        if (!String(reducedMergeReply || '').trim()) {
          throw new Error('empty-merge-retry-reply');
        }
        return reducedMergeReply;
      } catch {
        return stepOutputs.map((item) => item.content).filter(Boolean).join('\n\n');
      }
    }
  };

  const runEditMultiCallWorkflow = async ({
    splitCallCount = 0,
    promptText = '',
    context = '',
    finalSystemPrompt = '',
    analysisSystemPrompt = '',
    workflowKind = '',
    structuredBatchMode = false,
    batchTargets = [],
    invokeCall = null,
    onProgress = () => {},
  } = {}) => {
    const normalizedCount = clampSplitCallCount(splitCallCount);
    const normalizedPrompt = String(promptText || '').trim();
    if (normalizedCount < 2 || !normalizedPrompt || typeof invokeCall !== 'function') {
      return invokeCall ? await invokeCall(normalizedPrompt, context, finalSystemPrompt, { phase: 'single', stepIndex: 1, stepCount: 1 }) : '';
    }

    const baseContext = String(context || '').trim();
    const boundedBaseContext = baseContext.slice(0, SPLIT_CALL_STEP_CONTEXT_MAX_CHARS);
    const reviewSystemPrompt = String(analysisSystemPrompt || '').trim();
    const normalizedWorkflowKind = String(workflowKind || '').trim();
    let latestReviewOutput = '';

    if (normalizedWorkflowKind === 'humanize' && normalizedCount >= 3) {
      onProgress({ progress: 12, message: 'מנתח קודם את הסגנון האישי והקשר המסמך' });
      let styleProfile = '';
      let documentProfile = '';
      try {
        styleProfile = String(await invokeCall(
          'זהה בקצרה את מאפייני הקול האישי, הקצב, אוצר המילים והטון שרצוי לשמר או לחקות. החזר נקודות קצרות בלבד.',
          boundedBaseContext,
          reviewSystemPrompt,
          { phase: 'humanize-style', stepIndex: 1, stepCount: normalizedCount },
        ) || '').trim();
      } catch {}
      onProgress({ progress: 36, message: 'מזקק את מבנה המסמך והכוונה שלו' });
      try {
        documentProfile = String(await invokeCall(
          `זהה בקצרה את מטרת הקטע, המבנה, הטיעון המרכזי ומה אסור לאבד בשכתוב.\n\nבקשת המשתמש:\n${normalizedPrompt}`,
          boundedBaseContext,
          reviewSystemPrompt,
          { phase: 'humanize-document', stepIndex: 2, stepCount: normalizedCount },
        ) || '').trim();
      } catch {}
      onProgress({ progress: 60, message: 'מבצע האנשה מלאה לפי הסגנון והמסמך' });
      const firstHumanized = await invokeCall(
        [
          'בצע עכשיו האנשה מלאה ומורגשת לטקסט.',
          `בקשת המשתמש:\n${normalizedPrompt}`,
          styleProfile ? `מאפייני סגנון אישיים:\n${truncateSplitCallOutput(styleProfile, 2200, false)}` : '',
          documentProfile ? `מאפייני מסמך לשימור:\n${truncateSplitCallOutput(documentProfile, 2200, false)}` : '',
          'החזר רק את הנוסח החדש שאמור להיכנס למסמך, בלי הערות ובלי הסברים.',
        ].filter(Boolean).join('\n\n'),
        boundedBaseContext,
        finalSystemPrompt,
        { phase: 'humanize-final', stepIndex: normalizedCount, stepCount: normalizedCount },
      );

      // לולאת האנשה יריבה: מזקקים את הפלט מול הגלאי המקומי עד שהציון יורד מתחת ליעד.
      const humanizerPrefs = getHumanizerPreferences();
      if (humanizerPrefs.enabled && humanizerPrefs.maxPasses > 0 && String(firstHumanized || '').trim()) {
        try {
          const loop = await runHumanizerLoop({
            text: firstHumanized,
            context: boundedBaseContext,
            target: humanizerPrefs.target,
            maxPasses: humanizerPrefs.maxPasses,
            profile: getPersonalStyleProfile(),
            onProgress: ({ pass, maxPasses, score, target }) => onProgress({
              progress: Math.min(94, 68 + Math.round((pass / Math.max(1, maxPasses)) * 26)),
              message: `מזקק מול הגלאי — סבב ${pass}/${maxPasses} (ציון ${score}, יעד <${target})`,
            }),
            invokeModel: (prompt, ctx) => invokeCall(
              prompt,
              ctx,
              [finalSystemPrompt, STEALTH_HUMANIZE_GUIDE].filter(Boolean).join('\n\n'),
              { phase: 'humanize-repair', stepIndex: normalizedCount, stepCount: normalizedCount },
            ),
          });
          if (loop?.text) return loop.text;
        } catch {}
      }
      return firstHumanized;
    }

    onProgress({ progress: 12, message: `מפעיל ${normalizedCount} קריאות במצב בדיקה ואז עריכה` });
    for (let passIndex = 0; passIndex < normalizedCount - 1; passIndex += 1) {
      const stepNumber = passIndex + 1;
      const progress = Math.min(84, 16 + Math.round((stepNumber / Math.max(1, normalizedCount - 1)) * 56));
      onProgress({ progress, message: `קריאת בדיקה ${stepNumber} מתוך ${normalizedCount - 1}` });

      const reviewPrompt = passIndex === 0
        ? [
          `זו קריאת בדיקה ${stepNumber} מתוך ${normalizedCount - 1} לפני עריכה אוטומטית במסמך.`,
          `בקשת המשתמש:\n${normalizedPrompt}`,
          'החזר תכנית תיקון ממוקדת ליעד העריכה בלבד, עם סעיפים ישימים וקצרים. אין צורך בטקסט חלופי מלא בשלב הזה.',
        ].join('\n\n')
        : [
          `זו קריאת בדיקה ${stepNumber} מתוך ${normalizedCount - 1} (איטרציית שיפור).`,
          `בקשת המשתמש:\n${normalizedPrompt}`,
          `תכנית הבדיקה הקודמת:\n${truncateSplitCallOutput(latestReviewOutput, 3200, false)}`,
          'חדד את התכנית, הסר כפילויות, והדגש רק שינויים שצריך ליישם בפועל.',
        ].join('\n\n');
      const reviewContext = passIndex === 0
        ? boundedBaseContext
        : [
          boundedBaseContext,
          `תכנית קודמת (לשיפור):\n${truncateSplitCallOutput(latestReviewOutput, 3200, false)}`,
        ].filter(Boolean).join('\n\n');

      try {
        const reviewReply = await invokeCall(reviewPrompt, reviewContext, reviewSystemPrompt, {
          phase: 'edit-review',
          stepIndex: stepNumber,
          stepCount: normalizedCount,
        });
        if (String(reviewReply || '').trim()) {
          latestReviewOutput = String(reviewReply || '').trim();
        }
      } catch {
        // ממשיכים לעריכה הסופית גם אם שלב בדיקה בודד נכשל.
      }
    }

    onProgress({ progress: 90, message: 'קריאה אחרונה: מיישם תיקון אוטומטי במסמך' });
    const finalContext = [
      boundedBaseContext,
      latestReviewOutput ? `ממצאי בדיקה פנימית ליישום:\n${truncateSplitCallOutput(latestReviewOutput, 3400, false)}` : '',
      `בקשת המשתמש המקורית:\n${normalizedPrompt}`,
    ].filter(Boolean).join('\n\n');
    const finalPrompt = structuredBatchMode
      ? [
        `זו קריאת העריכה המסכמת (${normalizedCount}/${normalizedCount}) ליעדים מרובים.`,
        'החזר JSON בלבד במבנה: {"edits":[{"targetId":"...","replacement":"..."}]}.',
        'חובה להחזיר בדיוק replacement אחד לכל targetId שסופק, ללא השמטות וללא יעדים מומצאים.',
        `targetIds: ${(Array.isArray(batchTargets) ? batchTargets : []).map((target) => target?.targetId).filter(Boolean).join(', ')}`,
        `בקשת המשתמש:\n${normalizedPrompt}`,
      ].join('\n\n')
      : [
        `זו קריאת העריכה המסכמת (${normalizedCount}/${normalizedCount}).`,
        'החזר עכשיו רק טקסט חלופי לעריכה עבור יעד העריכה שסופק. בלי הסברים, בלי שאלות הבהרה, ובלי מעטפת JSON.',
        `בקשת המשתמש:\n${normalizedPrompt}`,
      ].join('\n\n');

    return await invokeCall(finalPrompt, finalContext, finalSystemPrompt, {
      phase: 'edit-final',
      stepIndex: normalizedCount,
      stepCount: normalizedCount,
    });
  };

  const buildEditModeContext = (targetState = null, batchTargets = [], requestPrompt = '') => {
    const contextualAssignmentBrief = shouldUseAssignmentBriefForPrompt(requestPrompt) ? assignmentBriefContext : '';
    const resolvedBatchTargets = (Array.isArray(batchTargets) ? batchTargets : []).filter((target) => target?.text?.trim());
    if (resolvedBatchTargets.length > 1) {
      return [
        contextualAssignmentBrief,
        'יעדי עריכה מרובים באותה בקשה. החזר replacements לכל targetId בלבד.',
        ...resolvedBatchTargets.map((target, index) => [
          `יעד ${index + 1}:`,
          `targetId: ${target.targetId}`,
          target.headingText ? `כותרת: ${target.headingText}` : '',
          target.locatorLabel ? `איתור מפורש: ${target.locatorLabel}` : '',
          `טקסט להחלפה:\n"${target.text}"`,
          target.before ? `לפני:\n"${target.before}"` : '',
          target.after ? `אחרי:\n"${target.after}"` : '',
        ].filter(Boolean).join('\n')),
        docCtx,
      ].filter(Boolean).join('\n\n');
    }

    const resolvedTargetState = targetState || { block: editTarget?.block || null, active: activeEditTarget };
    const resolvedActiveTarget = resolvedTargetState?.active || null;
    const resolvedBlockText = resolvedTargetState?.block?.text || currentBlockText;
    if (!resolvedActiveTarget?.text) return [contextualAssignmentBrief, docCtx].filter(Boolean).join('\n\n');
    if (resolvedActiveTarget.kind === 'selection') {
      return [
        contextualAssignmentBrief,
        'יעד עריכה: טקסט נבחר',
        `טקסט להחלפה:\n"${resolvedActiveTarget.text}"`,
        resolvedActiveTarget.before ? `לפני:\n"${resolvedActiveTarget.before}"` : '',
        resolvedActiveTarget.after ? `אחרי:\n"${resolvedActiveTarget.after}"` : '',
        resolvedBlockText ? `פסקה פעילה:\n"${resolvedBlockText}"` : '',
        docCtx,
      ].filter(Boolean).join('\n\n');
    }

    if (resolvedActiveTarget.kind === 'section') {
      return [
        contextualAssignmentBrief,
        resolvedActiveTarget.headingText ? `יעד עריכה: סעיף "${resolvedActiveTarget.headingText}"` : 'יעד עריכה: סעיף במסמך',
        resolvedActiveTarget.locatorLabel ? `איתור מפורש:\n"${resolvedActiveTarget.locatorLabel}"` : '',
        `מקטע להחלפה:\n"${resolvedActiveTarget.text}"`,
        docCtx,
      ].filter(Boolean).join('\n\n');
    }

    return [
      contextualAssignmentBrief,
      'יעד עריכה: פסקה פעילה',
      `פסקה להחלפה:\n"${resolvedActiveTarget.text}"`,
      docCtx,
    ].filter(Boolean).join('\n\n');
  };

  const applyEditReply = async (replyText, targetSnapshot, agentType = 'assistant-sidebar-edit') => {
    if (!isEditComposerMode) return { ok: true, skipped: true, message: '' };
    if (!targetSnapshot?.text || !String(targetSnapshot.text).trim()) {
      return { ok: false, message: missingEditTargetMessage };
    }
    if (!onApplyEdit) {
      return { ok: false, message: 'מסלול העריכה למסמך לא זמין כרגע.' };
    }
    const metaReplyReason = getNonEditReplyReason(replyText, targetSnapshot);
    if (metaReplyReason) {
      return {
        ok: false,
        message: `${metaReplyReason} השארתי את התשובה בצ׳אט בלבד ולא החלפתי טקסט במסמך.`,
      };
    }
    return await onApplyEdit({ replacementText: normalizeEditReplacementForApply(replyText, targetSnapshot), target: targetSnapshot, agentType });
  };

  const normalizeEditReplyText = (value = '') => String(value || '').replace(/\u00A0/g, ' ').trim();
  const editReplyReplacementKeys = ['replacement', 'replacementText', 'updatedText', 'rewrittenText'];
  const editReplyOriginalKeys = ['originalText', 'originalHtml'];
  const editReplyProtocolKeys = [...new Set([...editReplyReplacementKeys, ...editReplyOriginalKeys, 'targetId', 'replacementFrom', 'replacementTo', 'edits', 'replacements'])];
  const escapeRegExp = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const editReplyProtocolKeyPatternSource = editReplyProtocolKeys.map((key) => escapeRegExp(key)).join('|');
  const editReplyWrapperKeyPattern = new RegExp(`"(?:${editReplyProtocolKeyPatternSource})"\\s*:`);
  const editReplyLooseWrapperKeyPattern = new RegExp(`(?:^|[\\[{,]\\s*)(?:"(?:${editReplyProtocolKeyPatternSource})"|'(?:${editReplyProtocolKeyPatternSource})'|(?:${editReplyProtocolKeyPatternSource}))\\s*:`, 'i');
  const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const hasOwn = (value, key) => isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, key);
  const hasAnyOwn = (value, keys) => keys.some((key) => hasOwn(value, key));
  const hasQuotedJsonLikeKey = (value = '') => /"[^"\n]+"\s*:/.test(String(value || ''));
  const hasSimpleObjectLiteralKey = (value = '') => /(?:^|[{,\n]\s*)(?:[A-Za-z_$][\w$-]*)\s*:/.test(String(value || ''));
  const hasStructuredArrayLiteralSignal = (value = '') => /\[[^\]]*(?:\{|\[|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|\b(?:true|false|null|undefined)\b|[A-Za-z_$][\w$]*\s*,)[^\]]*\]/i.test(String(value || ''));
  const isJsonContainerText = (value = '') => {
    const text = String(value || '').trim();
    return (text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'));
  };
  const looksLikeStructuredObjectLiteral = (value = '') => {
    const text = String(value || '').trim();
    if (!(text.startsWith('{') && text.endsWith('}'))) return false;
    const inner = text.slice(1, -1).trim();
    if (!inner) return true;
    return hasQuotedJsonLikeKey(text) || hasSimpleObjectLiteralKey(text);
  };
  const looksLikeStructuredArrayLiteral = (value = '') => {
    const text = String(value || '').trim();
    if (!(text.startsWith('[') && text.endsWith(']'))) return false;
    const inner = text.slice(1, -1).trim();
    if (!inner) return true;
    if (hasQuotedJsonLikeKey(inner) || hasSimpleObjectLiteralKey(inner)) return true;
    if (/[{}\[\]]/.test(inner)) return true;
    if (/(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/.test(inner)) return true;
    if (/\b(?:true|false|null|undefined)\b/.test(inner)) return true;
    if (/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(inner)) return true;
    if (/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)+$/i.test(inner)) return true;
    if (/^[A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)*$/.test(inner)) return true;
    return false;
  };
  const looksLikeCodeOrJsonContext = (value = '') => {
    const text = String(value || '').trim();
    if (!text) return false;
    if (/^```[\s\S]*```$/.test(text)) return true;
    if (looksLikeStructuredObjectLiteral(text) || looksLikeStructuredArrayLiteral(text)) {
      return true;
    }
    let signalCount = 0;
    if (hasQuotedJsonLikeKey(text)) signalCount += 2;
    if (hasSimpleObjectLiteralKey(text)) signalCount += 2;
    if (hasStructuredArrayLiteralSignal(text)) signalCount += 2;
    if (/\b(?:const|let|var|function|return|if|else|for|while|switch|case|class|import|export|try|catch|async|await)\b/.test(text)) signalCount += 1;
    if (/=>/.test(text)) signalCount += 1;
    if (/[{}\[\];]/.test(text)) signalCount += 1;
    return signalCount >= 3;
  };
  const isSimpleReplacementCarrierObject = (value) => {
    if (!isPlainObject(value)) return false;
    const keys = Object.keys(value);
    return keys.length > 0
      && hasAnyOwn(value, editReplyReplacementKeys)
      && keys.every((key) => editReplyReplacementKeys.includes(key));
  };
  const getSimpleReplacementCarrierPayload = (value) => {
    if (!isSimpleReplacementCarrierObject(value)) return undefined;
    const payloadKey = editReplyReplacementKeys.find((key) => hasOwn(value, key));
    return payloadKey ? value[payloadKey] : undefined;
  };
  const getRootReplacementCarrierPayload = (value) => {
    const directPayload = getSimpleReplacementCarrierPayload(value);
    if (typeof directPayload !== 'undefined') return directPayload;
    if (Array.isArray(value) && value.length === 1) {
      return getSimpleReplacementCarrierPayload(value[0]);
    }
    return undefined;
  };
  const isClearEditDescriptor = (value) => {
    if (!isPlainObject(value)) return false;
    const hasTargetId = hasOwn(value, 'targetId');
    const hasReplacementValue = hasAnyOwn(value, editReplyReplacementKeys);
    const hasDiffPair = hasOwn(value, 'replacementFrom') && hasOwn(value, 'replacementTo');
    const hasOriginalAndReplacement = hasAnyOwn(value, editReplyOriginalKeys) && hasReplacementValue;
    return (hasTargetId && hasReplacementValue)
      || hasDiffPair
      || hasOriginalAndReplacement;
  };
  const isClearEditWrapperCollection = (value) => {
    if (Array.isArray(value)) return value.length > 0 && value.every((item) => isClearEditDescriptor(item));
    return isClearEditDescriptor(value);
  };
  const isExplicitEditWrapperObject = (value) => {
    if (!isPlainObject(value)) return false;
    return isClearEditDescriptor(value)
      || (hasOwn(value, 'edits') && isClearEditWrapperCollection(value.edits))
      || (hasOwn(value, 'replacements') && isClearEditWrapperCollection(value.replacements));
  };
  const getClearEditDescriptorReplacementPayload = (value) => {
    if (!isClearEditDescriptor(value)) return undefined;
    const payloadKey = editReplyReplacementKeys.find((key) => hasOwn(value, key));
    return payloadKey ? value[payloadKey] : undefined;
  };
  const getMatchingTargetEditDescriptorPayload = (value, targetSnapshot = null) => {
    const normalizedTargetId = String(targetSnapshot?.targetId || '').trim();
    if (!normalizedTargetId || !isClearEditWrapperCollection(value)) return undefined;
    const descriptors = Array.isArray(value) ? value : [value];
    const matchingDescriptors = descriptors.filter((item) => String(item?.targetId || '').trim() === normalizedTargetId);
    if (matchingDescriptors.length !== 1) return undefined;
    return getClearEditDescriptorReplacementPayload(matchingDescriptors[0]);
  };
  const getExplicitEditWrapperDescriptors = (value) => {
    if (!isPlainObject(value)) return [];
    if (hasOwn(value, 'edits') && isClearEditWrapperCollection(value.edits)) {
      return Array.isArray(value.edits) ? value.edits : [value.edits];
    }
    if (hasOwn(value, 'replacements') && isClearEditWrapperCollection(value.replacements)) {
      return Array.isArray(value.replacements) ? value.replacements : [value.replacements];
    }
    return [];
  };
  const getAllowedExplicitEditWrapperPayload = (value, targetSnapshot = null) => {
    const descriptors = getExplicitEditWrapperDescriptors(value);
    if (!descriptors.length) return undefined;

    const normalizedTargetId = String(targetSnapshot?.targetId || '').trim();
    if (normalizedTargetId) {
      const matchingDescriptors = descriptors.filter((item) => String(item?.targetId || '').trim() === normalizedTargetId);
      if (matchingDescriptors.length === 1) {
        return getClearEditDescriptorReplacementPayload(matchingDescriptors[0]);
      }
      if (matchingDescriptors.length > 1) return undefined;
      if (descriptors.length !== 1) return undefined;
    } else if (descriptors.length !== 1) {
      return undefined;
    }

    const [descriptor] = descriptors;
    const descriptorTargetId = String(descriptor?.targetId || '').trim();
    if (normalizedTargetId && descriptorTargetId && descriptorTargetId !== normalizedTargetId) {
      return undefined;
    }

    return getClearEditDescriptorReplacementPayload(descriptor);
  };
  const getAllowedRootReplacementCarrierPayload = (value, targetSnapshot = null) => {
    const directPayload = getRootReplacementCarrierPayload(value);
    const targetLooksLikeCodeOrJson = looksLikeCodeOrJsonContext(targetSnapshot?.text || '');
    if (!targetLooksLikeCodeOrJson) return directPayload;
    if (typeof directPayload !== 'undefined') return undefined;
    const matchingTargetPayload = getMatchingTargetEditDescriptorPayload(value, targetSnapshot);
    if (typeof matchingTargetPayload !== 'undefined') return matchingTargetPayload;
    return getAllowedExplicitEditWrapperPayload(value, targetSnapshot);
  };
  const hasHtmlOrTagLikeNoise = (value = '') => /<\/?[A-Za-z][^>\n]{0,80}>|<!--|-->|<!DOCTYPE|<\?xml/i.test(String(value || ''));
  const isConservativeEmbeddedJsonNoise = (prefix = '', suffix = '') => {
    const trimmedPrefix = String(prefix || '').trim();
    const trimmedSuffix = String(suffix || '').trim();
    if (!trimmedPrefix && !trimmedSuffix) return false;
    if (trimmedPrefix.length > 120 || trimmedSuffix.length > 120) return false;
    if ((trimmedPrefix.length + trimmedSuffix.length) > 180) return false;
    const noiseParts = [trimmedPrefix, trimmedSuffix].filter(Boolean);
    if (noiseParts.some((part) => /[{}\[\]`]/.test(part))) return false;
    if (noiseParts.some((part) => hasHtmlOrTagLikeNoise(part))) return false;
    if (noiseParts.some((part) => part.split(/\n+/).filter(Boolean).length > 2)) return false;
    return true;
  };
  const readBalancedJsonContainerAt = (value = '', startIndex = -1) => {
    const text = String(value || '');
    if (startIndex < 0 || startIndex >= text.length) return null;
    const opener = text[startIndex];
    if (opener !== '{' && opener !== '[') return null;
    const closingStack = [opener === '{' ? '}' : ']'];
    let inString = false;
    let escaped = false;

    for (let index = startIndex + 1; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '{') {
        closingStack.push('}');
        continue;
      }
      if (char === '[') {
        closingStack.push(']');
        continue;
      }
      if (char === '}' || char === ']') {
        if (!closingStack.length || char !== closingStack[closingStack.length - 1]) {
          return null;
        }
        closingStack.pop();
        if (!closingStack.length) {
          return {
            candidate: text.slice(startIndex, index + 1),
            endIndex: index,
          };
        }
      }
    }

    return null;
  };
  const getEmbeddedFencedJsonCandidate = (value = '') => {
    const text = String(value || '').trim();
    const fenceMatch = text.match(/^([\s\S]*?)```(?:json|javascript|js)?\s*([\s\S]*?)```([\s\S]*)$/i);
    if (!fenceMatch) return null;
    const prefix = String(fenceMatch[1] || '');
    const suffix = String(fenceMatch[3] || '');
    if (!isConservativeEmbeddedJsonNoise(prefix, suffix)) return null;
    if (/```/.test(prefix) || /```/.test(suffix)) return null;
    const candidate = String(fenceMatch[2] || '').trim();
    return candidate ? { candidate } : null;
  };
  const getConservativeEmbeddedJsonCandidate = (value = '') => {
    const text = String(value || '').trim();
    const startMatches = [...text.matchAll(/[\[{]/g)];
    for (const match of startMatches) {
      const startIndex = typeof match.index === 'number' ? match.index : -1;
      if (startIndex < 0) continue;
      const balancedCandidate = readBalancedJsonContainerAt(text, startIndex);
      if (!balancedCandidate?.candidate) continue;
      const prefix = text.slice(0, startIndex);
      const suffix = text.slice(balancedCandidate.endIndex + 1);
      if (!isConservativeEmbeddedJsonNoise(prefix, suffix)) continue;
      return { candidate: balancedCandidate.candidate.trim() };
    }
    return null;
  };
  const hasLooseEditReplyLiteralKey = (value = '', keys = []) => {
    if (!keys.length) return false;
    const keyPatternSource = keys.map((key) => escapeRegExp(key)).join('|');
    return new RegExp(`(?:^|[\\[{,]\\s*)(?:"(?:${keyPatternSource})"|'(?:${keyPatternSource})'|(?:${keyPatternSource}))\\s*:`, 'i').test(String(value || ''));
  };
  const hasLooseEditWrapperLiteralHint = (value = '') => {
    const text = String(value || '').trim();
    if (!text || !editReplyLooseWrapperKeyPattern.test(text)) return false;
    if (hasLooseEditReplyLiteralKey(text, ['edits', 'replacements'])) return true;
    if (hasLooseEditReplyLiteralKey(text, editReplyReplacementKeys)) return true;
    return hasLooseEditReplyLiteralKey(text, ['replacementFrom']) && hasLooseEditReplyLiteralKey(text, ['replacementTo']);
  };
  const parseJsonContainerCandidate = (normalizedReply = '', candidate = '', extractedFromMixedText = false, wrappedInFence = false) => {
    const normalizedCandidate = String(candidate || '').trim();
    const looksLikeJsonContainer = isJsonContainerText(normalizedCandidate);
    const hasWrapperHint = looksLikeJsonContainer && editReplyWrapperKeyPattern.test(normalizedCandidate);
    const hasLooseWrapperHint = looksLikeJsonContainer && hasLooseEditWrapperLiteralHint(normalizedCandidate);
    if (!looksLikeJsonContainer) {
      return {
        normalizedReply,
        looksLikeJsonContainer: false,
        parsed: null,
        parsedOk: false,
        hasWrapperHint: false,
        hasLooseWrapperHint: false,
        extractedFromMixedText,
        wrappedInFence,
      };
    }

    try {
      return {
        normalizedReply,
        looksLikeJsonContainer: true,
        parsed: JSON.parse(normalizedCandidate),
        parsedOk: true,
        hasWrapperHint,
        hasLooseWrapperHint,
        extractedFromMixedText,
        wrappedInFence,
      };
    } catch {
      return {
        normalizedReply,
        looksLikeJsonContainer: true,
        parsed: null,
        parsedOk: false,
        hasWrapperHint,
        hasLooseWrapperHint,
        extractedFromMixedText,
        wrappedInFence,
      };
    }
  };
  const parseJsonEditReplyEnvelope = (replyText = '') => {
    const normalizedReply = normalizeEditReplyText(replyText);
    if (!normalizedReply) {
      return {
        normalizedReply,
        looksLikeJsonContainer: false,
        parsed: null,
        parsedOk: false,
        hasWrapperHint: false,
        hasLooseWrapperHint: false,
        extractedFromMixedText: false,
        wrappedInFence: false,
      };
    }

    const fenceMatch = normalizedReply.match(/^```(?:json|javascript|js)?\s*([\s\S]*?)```$/i);
    const directCandidate = String(fenceMatch ? fenceMatch[1] : normalizedReply).trim();
    if (isJsonContainerText(directCandidate)) {
      return parseJsonContainerCandidate(normalizedReply, directCandidate, false, Boolean(fenceMatch));
    }

    const embeddedFenceCandidate = getEmbeddedFencedJsonCandidate(normalizedReply);
    if (embeddedFenceCandidate?.candidate) {
      return parseJsonContainerCandidate(normalizedReply, embeddedFenceCandidate.candidate, true, true);
    }

    const embeddedCandidate = getConservativeEmbeddedJsonCandidate(normalizedReply);
    if (embeddedCandidate?.candidate) {
      return parseJsonContainerCandidate(normalizedReply, embeddedCandidate.candidate, true);
    }

    return {
      normalizedReply,
      looksLikeJsonContainer: false,
      parsed: null,
      parsedOk: false,
      hasWrapperHint: false,
        hasLooseWrapperHint: false,
      extractedFromMixedText: false,
        wrappedInFence: false,
    };
  };
  const serializeEditReplacementPayload = (value) => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) || isPlainObject(value)) {
      try {
        const serialized = JSON.stringify(value, null, 2);
        return typeof serialized === 'string' ? serialized : '';
      } catch {
        return '';
      }
    }
    if (value == null) return '';
    return String(value);
  };
  const shouldUnwrapRootReplacementCarrier = (parsedReply, targetSnapshot = null) => {
    if (!parsedReply?.parsedOk) return false;
    return typeof getAllowedRootReplacementCarrierPayload(parsedReply.parsed, targetSnapshot) !== 'undefined';
  };
  const normalizeEditReplacementForApply = (replyText = '', targetSnapshot = null) => {
    const parsedReply = parseJsonEditReplyEnvelope(replyText);
    if (!parsedReply.parsedOk) return String(replyText ?? '');
    if (!shouldUnwrapRootReplacementCarrier(parsedReply, targetSnapshot)) return String(replyText ?? '');
    const payload = getAllowedRootReplacementCarrierPayload(parsedReply.parsed, targetSnapshot);
    return serializeEditReplacementPayload(payload);
  };

  const stripEditReplyMarkup = (value = '') => normalizeEditReplyText(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|blockquote|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  const getJsonWrappedEditReplyReason = (replyText = '', targetSnapshot = null) => {
    const targetLooksLikeCodeOrJson = looksLikeCodeOrJsonContext(targetSnapshot?.text || '');
    const parsedReply = parseJsonEditReplyEnvelope(replyText);
    if (!parsedReply.normalizedReply || (!parsedReply.looksLikeJsonContainer && !parsedReply.hasWrapperHint && !parsedReply.hasLooseWrapperHint)) return '';
    if (parsedReply.hasWrapperHint && !parsedReply.parsedOk) {
      return 'זוהתה מעטפת JSON במקום טקסט חלופי לעריכה.';
    }
    if (!targetLooksLikeCodeOrJson && parsedReply.hasLooseWrapperHint && !parsedReply.parsedOk) {
      return 'זוהתה מעטפת JSON במקום טקסט חלופי לעריכה.';
    }
    if (!parsedReply.looksLikeJsonContainer || !parsedReply.parsedOk) return '';

    const { parsed } = parsedReply;
    if (targetLooksLikeCodeOrJson) {
      if (typeof getAllowedRootReplacementCarrierPayload(parsed, targetSnapshot) !== 'undefined') return '';
      if (isClearEditWrapperCollection(parsed)) {
        return 'זוהתה מעטפת JSON במקום טקסט חלופי לעריכה.';
      }
      if (getExplicitEditWrapperDescriptors(parsed).length > 0) {
        return 'זוהתה מעטפת JSON במקום טקסט חלופי לעריכה.';
      }
      return '';
    }
    if (isExplicitEditWrapperObject(parsed)) {
      return 'זוהתה מעטפת JSON במקום טקסט חלופי לעריכה.';
    }
    if (Array.isArray(parsed) && isClearEditWrapperCollection(parsed)) {
      return 'זוהתה מעטפת JSON במקום טקסט חלופי לעריכה.';
    }
    if (typeof getRootReplacementCarrierPayload(parsed) !== 'undefined') {
      return 'זוהתה מעטפת JSON במקום טקסט חלופי לעריכה.';
    }

    return '';
  };

  const getOverscopedEditReplyReason = (replyText = '', targetSnapshot = null) => {
    if (!isEditComposerMode || !targetSnapshot?.text?.trim()) return '';

    const plainReply = stripEditReplyMarkup(replyText);
    const compactReply = plainReply.replace(/\s+/g, ' ').trim();
    const plainTarget = stripEditReplyMarkup(targetSnapshot.text);
    const compactTarget = plainTarget.replace(/\s+/g, ' ').trim();
    const compactDocContext = stripEditReplyMarkup(docCtx).replace(/\s+/g, ' ').trim();
    const targetLength = compactTarget.length;
    if (!compactReply || !targetLength) return '';

    const replyParagraphs = plainReply.split(/\n\s*\n+/).map((part) => part.trim()).filter(Boolean).length || 1;
    const targetParagraphs = plainTarget.split(/\n\s*\n+/).map((part) => part.trim()).filter(Boolean).length || 1;
    const replyLines = plainReply.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const headingLikeLines = replyLines.filter((line) => /^(?:#{1,6}\s+\S|(?:[0-9]{1,2}(?:\.[0-9]{1,2}){0,2}|[A-Za-zא-ת])[.)]\s+\S|(?:סעיף|פרק|Section|Chapter)\s+\S+)/i.test(line)).length;
    const broadReplyPhrase = /(?:להלן\s+(?:המסמך|הטקסט)\s+המלא|הנה\s+(?:המסמך|הטקסט|הנוסח)\s+המלא|נוסח\s+מלא|מסמך\s+מלא|שכתוב\s+מלא|full\s+document|entire\s+document|complete\s+rewrite|full\s+rewrite|updated\s+document|rewritten\s+document)/i.test(compactReply);
    const scopeMultiplier = targetSnapshot.kind === 'section' ? 5 : 3.5;
    const minBroadLength = targetSnapshot.kind === 'section' ? 2600 : 1400;
    const overlapSize = compactReply.length >= 480 ? 180 : 120;
    const echoesDocumentStart = compactReply.length >= overlapSize && compactDocContext.includes(compactReply.slice(0, overlapSize));
    const echoesDocumentEnd = compactReply.length >= overlapSize && compactDocContext.includes(compactReply.slice(-overlapSize));
    const wholeDocumentEcho = compactDocContext.length >= 900
      && compactReply.length >= Math.max(900, Math.floor(targetLength * 2.2))
      && echoesDocumentStart
      && echoesDocumentEnd;
    const clearlyTooBroad = compactReply.length >= Math.max(minBroadLength, Math.floor(targetLength * scopeMultiplier))
      && (
        broadReplyPhrase
        || headingLikeLines >= 2
        || (replyParagraphs >= Math.max(targetParagraphs + 6, 8) && compactReply.length >= Math.max(2200, Math.floor(targetLength * 4)))
      );

    if (wholeDocumentEcho) {
      return 'זוהתה החזרה רחבה מדי של תוכן המסמך במקום החלפה מקומית ליעד העריכה.';
    }

    return clearlyTooBroad
      ? 'זוהתה תשובה רחבה מדי ביחס ליעד העריכה המקומי.'
      : '';
  };

  const getNonEditReplyReason = (replyText, targetSnapshot = null) => {
    if (!isEditComposerMode) return '';
    const normalizedReply = normalizeEditReplyText(replyText);
    if (!normalizedReply) {
      return 'לא הוחל שינוי כי המודל לא החזיר טקסט חלופי לעריכה.';
    }

    const plainReply = stripEditReplyMarkup(normalizedReply);
    if (!plainReply) {
      return 'לא הוחל שינוי כי המודל לא החזיר טקסט חלופי לעריכה.';
    }

    const lines = plainReply.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const compactReply = lines.join(' ').replace(/\s+/g, ' ').trim();
    const targetLength = String(targetSnapshot?.text || '').trim().length;
    let metaScore = 0;

    if (/[?؟]/.test(compactReply)) metaScore += 2;
    if (/^(?:באיזו|מאיזו|איזה|אילו|האם|כיצד|איפה|מתי|מי|what\b|which\b|where\b|when\b|could you\b|can you\b|would you\b|please\b)/i.test(compactReply)) metaScore += 2;
    if (/(?:באיזו נקודה תרצה להתחיל|מאיפה תרצה להתחיל|היכן תרצה להתחיל|איזה סעיף תרצה קודם|what would you like me to start with|where should i start|which point should i start with)/i.test(compactReply)) metaScore += 3;
    if (/(?:חסרים לי|חסר לי|צריך עוד|נדרשים פרטים|אנא פרט|אנא ציין|אנא שלח|אשמח אם תשלח|כדי שאוכל|כדי שאבצע|צריך את הטקסט|please specify|need more details|missing details|share the text|send the text|provide the text)/i.test(compactReply)) metaScore += 2;

    const numberedMetaLines = lines.filter((line) => /^\d+[.)]\s/.test(line) && /(?:\?|אנא|ציין|פרט|הבהר|שלח|need|specify|provide|share)/i.test(line)).length;
    if (numberedMetaLines >= 2) metaScore += 2;
    if (lines.length <= 4 && /(?:אנא|אשמח|כדי שאוכל|please|could you|can you|would you)/i.test(compactReply)) metaScore += 1;
    if (targetLength > 800 && compactReply.length < Math.max(120, Math.min(280, Math.floor(targetLength * 0.2))) && (/[?؟]/.test(compactReply) || /(?:באיזו|כדי שאוכל|אנא|please specify|need more details)/i.test(compactReply))) {
      metaScore += 2;
    }

    if (metaScore >= 3) {
      return 'זוהתה תשובת הבהרה או מטא במקום טקסט חלופי לעריכה.';
    }

    const jsonReplyReason = getJsonWrappedEditReplyReason(normalizedReply, targetSnapshot);
    if (jsonReplyReason) return jsonReplyReason;

    const overscopedReplyReason = getOverscopedEditReplyReason(normalizedReply, targetSnapshot);
    if (overscopedReplyReason) return overscopedReplyReason;

    return '';
  };

  const validateStructuredBatchEdits = (replyText, batchTargets = []) => {
    const targets = (Array.isArray(batchTargets) ? batchTargets : []).filter((target) => target?.targetId && target?.text?.trim());
    const expectedIds = new Set(targets.map((target) => String(target.targetId || '').trim()));
    const parsedEdits = parseStructuredEditBatchResponse(replyText);
    const seen = new Set();
    const validEdits = [];
    const duplicateIds = [];
    const metaReplyTargets = [];

    parsedEdits.forEach((edit) => {
      if (!expectedIds.has(edit.targetId)) return;
      if (seen.has(edit.targetId)) {
        duplicateIds.push(edit.targetId);
        return;
      }
      seen.add(edit.targetId);
      const target = targets.find((item) => item.targetId === edit.targetId) || null;
      const metaReplyReason = getNonEditReplyReason(edit.replacement, target);
      if (metaReplyReason) {
        metaReplyTargets.push({ targetId: edit.targetId, target, reason: metaReplyReason });
        return;
      }
      validEdits.push({
        targetId: edit.targetId,
        target,
        replacementText: normalizeEditReplacementForApply(edit.replacement, target),
      });
    });

    const missingTargets = targets.filter((target) => !seen.has(target.targetId));
    return {
      validEdits,
      missingTargets,
      duplicateIds,
      metaReplyTargets,
      complete: targets.length > 0 && validEdits.length === targets.length && duplicateIds.length === 0 && metaReplyTargets.length === 0,
    };
  };

  const applyEditBatchReply = async (replyText, batchTargets = [], agentType = 'assistant-sidebar-edit') => {
    if (!isEditComposerMode) return { ok: true, skipped: true, message: '' };
    const targets = (Array.isArray(batchTargets) ? batchTargets : []).filter((target) => target?.targetId && target?.text?.trim());
    if (targets.length <= 1) {
      return applyEditReply(replyText, targets[0] || null, agentType);
    }

    if (!onApplyEditBatch) {
      return { ok: false, message: 'מסלול העריכה המרובה למסמך לא זמין כרגע.' };
    }

    const batchValidation = validateStructuredBatchEdits(replyText, targets);
    if (batchValidation.duplicateIds.length) {
      return { ok: false, message: 'המודל החזיר יעד עריכה כפול. לא החלתִי את הבאץ׳ כדי למנוע החלפה שגויה.' };
    }

    const fallbackEdits = [];
    const fallbackErrors = [];
    const fallbackTargets = [
      ...batchValidation.missingTargets,
      ...batchValidation.metaReplyTargets.map((item) => item.target).filter(Boolean),
    ].filter((target, index, list) => list.findIndex((item) => item?.targetId === target?.targetId) === index);

    for (const target of fallbackTargets) {
      try {
        const fallbackPrompt = [
          'בצע רק את יעד העריכה הבא מתוך בקשת המשתמש המקורית.',
          `בקשת המשתמש:\n${target.batchPrompt || ''}`,
          `targetId: ${target.targetId}`,
          target.headingText ? `כותרת: ${target.headingText}` : '',
          `טקסט להחלפה:\n"${target.text}"`,
        ].filter(Boolean).join('\n\n');
        const fallbackReply = await chatWithActiveProvider(fallbackPrompt, buildEditModeContext({ active: target }, []), composerModeSystemPrompt, {
          agentLabel: 'Fallback edit target',
          autoUseDefaultSkill: false,
          directChat: true,
          includeAppMemory: false,
          providerOverride: forceGlobalSidebarProvider ? (activeProviderChoice?.id || '') : '',
          modelOverride: forceGlobalSidebarProvider ? resolvedSelectedProviderModel : '',
          strictProviderOverride: forceGlobalSidebarProvider,
          editModeRequest: true,
          skipAutomation: true,
          skipAutomationPrompt: true,
          skipMultiModel: forceGlobalSidebarProvider,
        });
        const metaReplyReason = getNonEditReplyReason(fallbackReply, target);
        if (metaReplyReason) {
          fallbackErrors.push(`${target.targetId}: ${metaReplyReason}`);
          continue;
        }
        const normalizedFallbackReplacement = normalizeEditReplacementForApply(fallbackReply, target);
        if (String(normalizedFallbackReplacement || '').trim()) {
          fallbackEdits.push({ targetId: target.targetId, target, replacementText: normalizedFallbackReplacement });
        }
      } catch (error) {
        fallbackErrors.push(error?.message || 'שגיאת fallback');
      }
    }

    const edits = [...batchValidation.validEdits, ...fallbackEdits];
    const appliedIds = new Set(edits.map((edit) => edit.targetId));
    const unresolvedCount = targets.filter((target) => !appliedIds.has(target.targetId)).length;
    if (unresolvedCount > 0) {
      return {
        ok: false,
        message: fallbackErrors.length
          ? `לא הצלחתי להשלים ${unresolvedCount} יעדי עריכה בבאץ׳. ${fallbackErrors[0]}`
          : `המודל לא החזיר עריכה תקינה עבור ${unresolvedCount} יעדים, ולכן לא החלתִי את הבאץ׳.`
      };
    }

    return await onApplyEditBatch({ edits, agentType });
  };

  const buildDocumentActionMeta = (applyResult, assistantContent = '', requestMeta = {}) => {
    if (!applyResult || applyResult.skipped) {
      return { documentActionStatus: '', documentActionMessage: '' };
    }

    const documentActionMessage = applyResult.message || (applyResult.ok ? 'העריכה הוחלה במסמך כהצעת AI.' : 'העריכה לא הוחלה במסמך.');
    const unresolved = Array.isArray(applyResult?.unresolved) ? applyResult.unresolved : [];

    return {
      documentActionStatus: applyResult.partial ? 'partial' : (applyResult.ok ? 'applied' : 'failed'),
      documentActionMessage: isSameAssistantMessageText(documentActionMessage, assistantContent)
        ? ''
        : documentActionMessage,
      documentActionUnresolved: unresolved,
      documentActionCanContinue: Boolean(applyResult.partial && unresolved.length),
      documentActionPromptText: String(requestMeta?.promptText || '').trim(),
      documentActionProviderId: String(requestMeta?.providerId || '').trim(),
      documentActionProviderModel: String(requestMeta?.providerModel || '').trim(),
      documentActionAgentId: String(requestMeta?.agentId || '').trim(),
      documentActionAgentLabel: String(requestMeta?.agentLabel || '').trim(),
    };
  };

  const renderDocumentActionCompletionButton = (msg, variant = 'light') => {
    if (!msg?.documentActionCanContinue) return null;
    const dark = variant === 'dark';
    return (
      <button
        type="button"
        onClick={() => continueDocumentActionCompletion(msg)}
        disabled={loading}
        style={{
          marginTop: 6,
          padding: '6px 10px',
          borderRadius: 999,
          border: dark ? '1px solid rgba(251, 191, 36, 0.36)' : '1px solid #FBBF24',
          background: dark ? 'rgba(251, 191, 36, 0.14)' : '#FFFBEB',
          color: dark ? '#FDE68A' : '#92400E',
          fontSize: 11,
          fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.55 : 1,
        }}
      >
        השלם את התיקונים שנשארו
      </button>
    );
  };

  const buildContext = (targetState = null, batchTargets = [], requestPrompt = '') => {
    if (isEditComposerMode) return buildEditModeContext(targetState, batchTargets, requestPrompt);
    const isAiAppendixRequest = activeClassicAgentId === 'aiAppendix';
    // נספח AI תמיד מקבל את הוראות המטלה (אם קיימות) + היסטוריית פרומפטים אמיתית של המסמך.
    const contextualAssignmentBrief = (isAiAppendixRequest && assignmentBriefContext)
      ? assignmentBriefContext
      : (shouldUseAssignmentBriefForPrompt(requestPrompt) ? assignmentBriefContext : '');
    const aiAppendixHistoryContext = isAiAppendixRequest
      ? (promptHistory.length
        ? `היסטוריית פרומפטים אמיתית (פרומפטים שנשלחו בפועל במהלך העבודה על מסמך זה, מהישן לחדש):\n${promptHistory.slice(-40).map((p, i) => `${i + 1}. ${String(p).slice(0, 500)}`).join('\n')}`
        : 'היסטוריית פרומפטים אמיתית: לא קיימת היסטוריה שמורה למסמך זה — שחזר פרומפטים סבירים מתוכן המסמך בלבד, ואל תציג אותם כהיסטוריה אמיתית.')
      : '';
    // הזרקת הקול האישי של המשתמש כך שהפרומטים בנספח יישמעו כמו שהוא כותב.
    const aiAppendixVoiceContext = isAiAppendixRequest
      ? (() => {
        const voiceBlock = buildPersonalStyleVoiceBlock();
        return voiceBlock ? `קול אישי של המשתמש (נסח את הפרומפטים והרפלקציה בקול הזה, מותאם למשלב צ'אט):\n${voiceBlock}` : '';
      })()
      : '';
    const followUpSourceGroundingContext = buildFollowUpSourceGroundingContext(messages, requestPrompt);
    const baseContext = selectedText
      ? `טקסט נבחר: "${selectedText}"\n\nפסקה נוכחית: "${currentBlockText}"\n\n${docCtx ? `תצלום מסמך:\n${docCtx}` : ''}`
      : currentBlockText
        ? `פסקה נוכחית: "${currentBlockText}"\n\n${docCtx ? `תצלום מסמך:\n${docCtx}` : ''}`
        : (docCtx ? `מסמך פעיל:\n${docCtx}` : '');
    const finalContext = [contextualAssignmentBrief, aiAppendixVoiceContext, aiAppendixHistoryContext, followUpSourceGroundingContext, baseContext].filter(Boolean).join('\n\n');
    return finalContext;
  };

  // עטיפות דקות מעל המודול המשותף src/services/sourceQueryBuilder.js. הלוגיקה עצמה חיה
  // שם כמקור-אמת יחיד, כדי שקובץ הבדיקה יריץ בדיוק את אותו קוד. כאן רק מזריקים מצב רכיב.
  // V3 (runScope): בלי סריקת הודעות צ'אט — זה בדיוק ערוץ הזיהום שנושא ישן דולף דרכו.
  // הנושא מגיע מה-prompt הנוכחי/הבחירה בלבד; המשכים עוברים דרך scope.topic.
  const buildHoleFillSourceQueryOverride = (promptText = '') =>
    buildHoleFillSourceQueryOverridePure(promptText, {
      messages: isV3FlagEnabled('runScope') ? [] : messages,
      selectedText,
      currentBlockText,
    });

  const buildSourcesQueryOverride = (promptText = '') =>
    buildSourcesQueryOverridePure(promptText, { selectedText, currentBlockText });

  const isSourcesNewsRequest = (promptText = '', queryOverride = '') =>
    isSourcesNewsRequestPure(promptText, queryOverride, { selectedText, currentBlockText });
  const normalizeAssistantMessageText = (value) => String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();

  const isSameAssistantMessageText = (left, right) => {
    const normalizedLeft = normalizeAssistantMessageText(left);
    const normalizedRight = normalizeAssistantMessageText(right);
    return Boolean(normalizedLeft) && normalizedLeft === normalizedRight;
  };

  const appendAssistantMessage = (content, extra = {}, options = {}) => {
    const nextMessage = {
      role: 'assistant',
      content: String(content ?? ''),
      ...extra,
    };

    setMessages((prev) => {
      if (options.dedupeConsecutive !== false) {
        const lastMessage = prev[prev.length - 1];
        if (
          lastMessage?.role === 'assistant' &&
          isSameAssistantMessageText(lastMessage.content, nextMessage.content) &&
          Boolean(lastMessage.error) === Boolean(nextMessage.error) &&
          String(lastMessage.composerMode || '') === String(nextMessage.composerMode || '')
        ) {
          return prev;
        }
      }

      return [...prev, nextMessage];
    });
  };

  const appendBlockedEditExchange = (userContent, assistantContent, userExtra = {}, assistantExtra = {}) => {
    const normalizedUserContent = String(userContent ?? '').trim();
    const nextAssistantMessage = {
      role: 'assistant',
      content: String(assistantContent ?? ''),
      ...assistantExtra,
    };

    setMessages((prev) => {
      const nextMessages = normalizedUserContent
        ? [...prev, { role: 'user', content: normalizedUserContent, ...userExtra }]
        : [...prev];
      nextMessages.push(nextAssistantMessage);
      return nextMessages;
    });
  };

  const executeRoleAgentTask = async (agent, task, runtimeOptions = {}) => {
    if (!agent?.prompt || loading) return;
    const requestedSplitCallCount = clampSplitCallCount(runtimeOptions.splitCallCount);
    const effectiveTask = requestedSplitCallCount >= 2
      ? String(runtimeOptions.splitCallPrompt || task || '').trim()
      : task;
    const resolvedEditRequest = isEditComposerMode ? resolvePromptEditTargetState(effectiveTask) : null;
    const requestEditTargets = resolvedEditRequest?.targetState || null;
    const requestEditTarget = resolvedEditRequest?.activeTarget || null;
    const requestEditBatchTargets = resolvedEditRequest?.batchTargets || [];
    const hasPromptResolvedTarget = resolvedEditRequest?.hasPromptResolvedTarget === true;
    const requestScopeLabel = isEditComposerMode
      ? (resolvedEditRequest?.scopeLabel || contextScopeLabel)
      : (runtimeOptions.scopeLabel || contextScopeLabel);
    if (isEditComposerMode && resolvedEditRequest?.blockedMessage) {
      setTab('chat');
      appendBlockedEditExchange(`🧩 ${agent.name}: ${task}`, resolvedEditRequest.blockedMessage, {
        composerMode,
      }, {
        error: true,
        composerMode,
      });
      return;
    }
    const requestedSkill = runtimeOptions.skillId
      ? skillCatalog.find((skill) => skill.id === runtimeOptions.skillId) || null
      : null;
    const runtimeSkillLabel = runtimeOptions.skillLabel || (requestedSkill ? requestedSkill.label : (runtimeOptions.autoUseDefaultSkill === false || isEditComposerMode) ? 'ללא סקיל' : 'אוטומטי');
    const safeAgentLabel = typeof agent.name === 'string' ? agent.name : (agent.name?.label || agent.name?.he || agent.id || 'סוכן');
    if (shouldUseDocumentWideEditPlan(effectiveTask, {
      hasPromptResolvedTarget,
      batchTargets: requestEditBatchTargets,
      activeTarget: requestEditTarget,
      hasNumberedReviewContext: hasRecentNumberedReviewContext(messages),
    })) {
      await executeDocumentWideEditPlan({
        userContent: `🧩 ${agent.name}: ${task}`,
        promptText: task,
        providerLabel: runtimeOptions.providerLabel || activeProviderSummary,
        providerId: runtimeOptions.providerOverride || '',
        providerModel: runtimeOptions.modelOverride || '',
        agentId: agent.id || 'assistant-role',
        agentLabel: safeAgentLabel,
        skillLabel: runtimeSkillLabel,
      });
      return;
    }
    if (isEditComposerMode && !requestEditTarget?.text?.trim()) {
      setTab('chat');
      appendBlockedEditExchange(`🧩 ${agent.name}: ${task}`, missingEditTargetMessage, {
        composerMode,
      }, {
        error: true,
        composerMode,
      });
      return;
    }
    const requestCycle = beginRequestCycle();
    const ctx = buildContext(requestEditTargets, requestEditBatchTargets, effectiveTask);
    const requestExtraSystemPrompt = [requestEditBatchTargets.length > 1 ? buildStructuredEditBatchSystemPrompt(requestEditBatchTargets) : composerModeSystemPrompt, String(runtimeOptions.extraSystemPrompt || '').trim()]
      .filter(Boolean)
      .join('\n\n');
    const requestAnalysisSystemPrompt = stripComposerModeDirectiveFromSystemPrompt(requestExtraSystemPrompt);
    setTab('chat');
    if (runtimeOptions.persistSelection !== false) setSelectedAgentId(agent.id);
    setRequestSnapshot({
      providerLabel: runtimeOptions.providerLabel || activeProviderSummary,
      agentLabel: safeAgentLabel,
      skillLabel: runtimeSkillLabel,
      scopeLabel: requestScopeLabel,
      contextPreview: runtimeOptions.contextPreview || contextPreview,
    });
    setMessages((prev) => [...prev, { role: 'user', content: `🧩 ${agent.name}: ${task}`, composerMode }]);
    setLoading(true);
    updateAgentStatus(agent.id, safeAgentLabel, { state: 'running', progress: 10, message: 'הסוכן התחיל לעבוד' });
    try {
      const invokeRoleAgentCall = async (nextPrompt, nextContext, nextSystemPrompt, phaseMeta = {}) => await chatWithRoleAgent(agent, nextPrompt, nextContext, {
        onStatus: (payload) => {
          if (!isCurrentRequestCycle(requestCycle)) return;
          updateAgentStatus(agent.id, safeAgentLabel, payload);
          syncRequestSnapshotProviderFromStatus(payload);
        },
        skillId: runtimeOptions.skillId || '',
        autoUseDefaultSkill: runtimeOptions.autoUseDefaultSkill !== false,
        providerOverride: runtimeOptions.providerOverride || '',
        preferredProviders: runtimeOptions.preferredProviders || [],
        modelOverride: runtimeOptions.modelOverride || '',
        strictProviderOverride: runtimeOptions.strictProviderOverride === true,
        extraSystemPrompt: nextSystemPrompt,
        conversationHistory,
        includeAppMemory: !isEditComposerMode,
        editModeRequest: isEditComposerMode,
        allowEditModeRoutingOverride: runtimeOptions.editModeExplicitRouting === true,
        editModeExplicitSkillInvocation: runtimeOptions.editModeExplicitSkillInvocation === true,
        preserveFullDocumentContext: shouldPreserveFullDocumentContext,
        documentFallbackHtml: documentSnapshot.html,
        ...phaseMeta,
      });
      const reply = requestedSplitCallCount >= 2
        ? await (isEditComposerMode
          ? runEditMultiCallWorkflow({
            splitCallCount: requestedSplitCallCount,
            promptText: effectiveTask,
            context: ctx,
            finalSystemPrompt: requestExtraSystemPrompt,
            analysisSystemPrompt: requestAnalysisSystemPrompt,
            structuredBatchMode: requestEditBatchTargets.length > 1,
            batchTargets: requestEditBatchTargets,
            invokeCall: invokeRoleAgentCall,
            onProgress: (payload) => {
              if (!isCurrentRequestCycle(requestCycle)) return;
              updateAgentStatus(agent.id, safeAgentLabel, { state: 'running', ...payload });
            },
          })
          : runSplitCallWorkflow({
            splitCallCount: requestedSplitCallCount,
            promptText: effectiveTask,
            context: ctx,
            extraSystemPrompt: requestExtraSystemPrompt,
            invokeCall: invokeRoleAgentCall,
            onProgress: (payload) => {
              if (!isCurrentRequestCycle(requestCycle)) return;
              updateAgentStatus(agent.id, safeAgentLabel, { state: 'running', ...payload });
            },
          }))
        : await invokeRoleAgentCall(effectiveTask, ctx, requestExtraSystemPrompt, { phase: 'single', stepIndex: 1, stepCount: 1 });
      if (!isCurrentRequestCycle(requestCycle)) return;
      const applyResult = requestEditBatchTargets.length > 1
        ? await applyEditBatchReply(reply, requestEditBatchTargets.map((target) => ({ ...target, batchPrompt: task })), agent.id || 'assistant-role')
        : await applyEditReply(reply, requestEditTarget, agent.id || 'assistant-role');
      const documentActionMeta = buildDocumentActionMeta(applyResult, reply);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: reply,
        composerMode,
        ...documentActionMeta,
      }]);
      setDraftInput('');
      setAgentTaskInput('');
      updateAgentStatus(agent.id, safeAgentLabel, applyResult && !applyResult.skipped && !applyResult.ok
        ? { state: 'error', progress: 100, message: documentActionMeta.documentActionMessage || 'העריכה לא הוחלה במסמך' }
        : { state: 'success', progress: 100, message: 'סיים בהצלחה' });
    } catch (err) {
      if (!isCurrentRequestCycle(requestCycle)) return;
      appendAssistantMessage(`❌ ${err.message}`, { error: true, composerMode });
      updateAgentStatus(agent.id, safeAgentLabel, { state: 'error', progress: 100, message: err.message || 'שגיאה' });
    } finally {
      // ניקוי loading/snapshot תמיד — גם אם מחזור הבקשה התחלף בינתיים (מעבר מסמך/workspace/reset),
      // כדי שלא להישאר תקועים ב-loading. רק החזרת הפוקוס מותנית בכך שזו עדיין הבקשה הנוכחית.
      setLoading(false);
      setRequestSnapshot(null);
      if (isCurrentRequestCycle(requestCycle)) inputRef.current?.focus();
    }
  };

  const send = async (customPrompt, extraSystemPrompt = '', agentMeta = { id: 'assistant-main', name: 'צ׳אט ישיר' }, runtimeOptions = {}) => {
    const pendingMentionSelection = pendingMentionSelectionRef.current;
    const hasPendingMentionSelection = Boolean(pendingMentionSelection.agentId || pendingMentionSelection.skillId);
    let originalText = (customPrompt || input).trim();
    if ((!originalText && !hasPendingMentionSelection && attachedFiles.length === 0) || loading) return;
    
    if (attachedFiles.length > 0) {
      const attachmentsText = attachedFiles.map(f => `[קובץ מצורף: ${f.name}]\n${f.text}`).join('\n\n');
      originalText = `${attachmentsText}\n\n${originalText}`.trim();
      if (!customPrompt) setAttachedFiles([]);
    }
    
    if (!customPrompt) setInput('');
    closeMentionMenu();

    let txt = originalText;

    // זיהוי בקשת "בדיקת סגנון / נשמע כמו AI" → ניקוד מקומי במקום קריאת LLM.
    const wantsStyleCheck = (
      /(בדוק|תבדוק|בדיקת|לבדוק|תנתח|נתח)\b[^]{0,40}?(סגנון|גנרי|מלאכותי|אותנטי|כמו\s*ai|בינה\s*מלאכותית|נשמע)/i.test(txt)
      || /נשמע\s+(כמו\s+)?(ai|מכונה|מלאכותי|רובוט|בינה)/i.test(txt)
      || /(האם|אם)\s+(זה|הטקסט|הטיוטה|המסמך)\b[^]{0,40}?(ai|מלאכותי|גנרי|נכתב\s+על\s+ידי)/i.test(txt)
      || /\b(ai\s*detector|sound[s]?\s+like\s+ai|written\s+by\s+ai|check\s+(my\s+)?style|does\s+this\s+sound\s+like\s+me)\b/i.test(txt)
    );
    if (wantsStyleCheck) {
      const targetText = String(selectedText || currentBlockText || documentSnapshot.fullText || '').trim();
      setTab('chat');
      setMessages((prev) => [...prev, { role: 'user', content: originalText }]);
      if (!targetText || targetText.length < 25) {
        appendAssistantMessage('אין מספיק טקסט לבדיקת סגנון. בחר טקסט או פתח מסמך עם תוכן (לפחות ~25 מילים), ונסה שוב.');
      } else {
        try {
          appendAssistantMessage(formatAuthenticityResultText(scoreTextAuthenticity(targetText)));
        } catch (err) {
          appendAssistantMessage('❌ ' + (err?.message || 'שגיאה בבדיקת הסגנון'));
        }
      }
      return;
    }
    let manualSkillId = isEditComposerMode ? '' : (selectedSkillId === 'none' ? '' : selectedSkillId);
    // קונטקסט הפרויקט (הוראות + חומרים + זיכרון שיחות) מוזרק ראשון לכל בקשה בסיידבר.
    let projectContextBlock = '';
    if (activeProject) {
      try { projectContextBlock = await buildProjectContextBlock(activeProject.id); } catch {}
    }
    let finalExtraSystemPrompt = [projectContextBlock, composerModeSystemPrompt, String(extraSystemPrompt || '').trim()]
      .filter(Boolean)
      .join('\n\n');
    let finalProviderId = effectiveSidebarProviderId;
    let finalProviderModel = resolvedSelectedProviderModel;
    const cAgent = activeClassicAgentId && activeClassicModeEnabled ? buildEffectiveClassicAgentConfig(activeClassicAgentId) : null;
    const bypassFixedAgentSelection = runtimeOptions.bypassFixedAgentSelection === true;
    let forcedAgent = workspaceAutomationEnabled && !bypassFixedAgentSelection && !isEditComposerMode ? activeAgent : null;
    let disabledSkillRequested = false;
    let ignoredAgentRouting = false;
    let usedDraftAgentMention = false;
    let usedDraftSkillMention = false;
    let usedQueuedAgentMention = false;
    let usedQueuedSkillMention = false;

    while (txt.startsWith('@') || txt.startsWith('/')) {
      const agentStartMatch = txt.match(/^@([^\s@/]+)\s*/);
      if (agentStartMatch) {
        const matchedAgent = findMentionedAgent(roleAgents, agentStartMatch[1]);
        if (!matchedAgent) break;
        txt = txt.slice(agentStartMatch[0].length).trimStart();
        if (!workspaceAutomationEnabled) {
          ignoredAgentRouting = true;
          continue;
        }
        forcedAgent = matchedAgent;
        usedDraftAgentMention = true;
        continue;
      }

      const skillStartMatch = txt.match(/^\/([^\s@/]+)\s*/);
      if (skillStartMatch) {
        const matchedSkill = findMentionedSkill(skillCatalog, skillStartMatch[1]);
        if (!matchedSkill) break;
        txt = txt.slice(skillStartMatch[0].length).trimStart();
        const mode = skillsConfig.skills?.[matchedSkill.id]?.mode || 'manual';
        if (mode === 'off') {
          disabledSkillRequested = true;
          manualSkillId = '';
        } else {
          manualSkillId = matchedSkill.id;
          usedDraftSkillMention = true;
        }
        continue;
      }

      break;
    }

    const splitCallDirective = extractSplitCallDirective(txt);
    const classicDefaultSplitCallCount = clampSplitCallCount(cAgent?.defaultSplitCallCount || 0);
    const lecturerDirectAgentRequest = activeClassicAgentId === 'lecturer';
    const requestedSplitCallCount = splitCallDirective.count >= 2
      ? splitCallDirective.count
      : (classicDefaultSplitCallCount || configuredSplitCallCount);
    txt = splitCallDirective.cleanedPrompt;

    if (workspaceAutomationEnabled && !bypassFixedAgentSelection && !usedDraftAgentMention && pendingMentionSelection.agentId) {
      const queuedAgent = roleAgents.find((agent) => agent.id === pendingMentionSelection.agentId) || null;
      if (queuedAgent) {
        forcedAgent = queuedAgent;
        usedQueuedAgentMention = true;
      }
    }

    if (cAgent && !usedDraftAgentMention && !usedQueuedAgentMention) {
      forcedAgent = null;
    }

    if (!usedDraftSkillMention && pendingMentionSelection.skillId) {
      const queuedSkill = findMentionedSkill(skillCatalog, pendingMentionSelection.skillId);
      if (queuedSkill) {
        const mode = skillsConfig.skills?.[queuedSkill.id]?.mode || 'manual';
        if (mode === 'off') {
          disabledSkillRequested = true;
          manualSkillId = '';
        } else {
          manualSkillId = queuedSkill.id;
          usedQueuedSkillMention = true;
        }
      }
    }

    const editModeExplicitRouting = isEditComposerMode && shouldAllowEditModeRoutingOverride({
      runtimeOverride: runtimeOptions.editModeExplicitRouting === true,
    });
    const editModeExplicitSkillInvocation = isEditComposerMode && Boolean(
      runtimeOptions.editModeExplicitSkillInvocation === true
      || usedDraftSkillMention
      || usedQueuedSkillMention
    );

    const requestedSkill = manualSkillId
      ? skillCatalog.find((skill) => skill.id === manualSkillId) || null
      : null;
    const runtimeSkillLabel = requestedSkill
      ? requestedSkill.label
      : disabledSkillRequested || (isEditComposerMode && !editModeExplicitSkillInvocation)
        ? 'ללא סקיל'
        : 'אוטומטי';

    if (disabledSkillRequested) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'הסקיל שביקשת כבוי כרגע בהגדרות, לכן דילגתי עליו.' }]);
    }
    if (ignoredAgentRouting) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'סביבת העבודה כבויה כרגע, לכן דילגתי על זימון הסוכן והרצתי את הבקשה בצ׳אט ישיר.' }]);
    }

    if (!txt) {
      if (!customPrompt) {
        setPendingMentionSelection({
          agentId: usedDraftAgentMention && forcedAgent ? forcedAgent.id : (pendingMentionSelection.agentId || ''),
          skillId: usedDraftSkillMention && manualSkillId ? manualSkillId : (pendingMentionSelection.skillId || ''),
        });
        preservePendingMentionRef.current = Boolean(
          pendingMentionSelectionRef.current.agentId || pendingMentionSelectionRef.current.skillId
        );
      }
      const helperText = forcedAgent
        ? `הסוכן ${forcedAgent.name} נבחר. עכשיו כתוב מה לבצע.`
        : manualSkillId
          ? 'הסקיל נבחר. עכשיו כתוב גם מה לבצע.'
          : 'בחרתי את הסוכן או הסקיל. עכשיו כתוב גם מה לבצע.';
      setMessages((prev) => [...prev, { role: 'assistant', content: helperText }]);
      inputRef.current?.focus();
      return;
    }

    const resolvedEditRequest = isEditComposerMode ? resolvePromptEditTargetState(txt) : null;
    const requestEditTargets = resolvedEditRequest?.targetState || null;
    const requestEditTarget = resolvedEditRequest?.activeTarget || null;
    const requestEditBatchTargets = resolvedEditRequest?.batchTargets || [];
    const hasPromptResolvedTarget = resolvedEditRequest?.hasPromptResolvedTarget === true;
    const requestScopeLabel = isEditComposerMode
      ? (resolvedEditRequest?.scopeLabel || contextScopeLabel)
      : contextScopeLabel;
    if (isEditComposerMode && resolvedEditRequest?.blockedMessage) {
      appendPromptHistory(originalText);
      clearPendingMentionSelection();
      appendBlockedEditExchange(originalText, resolvedEditRequest.blockedMessage, {
        composerMode,
      }, {
        error: true,
        composerMode,
      });
      inputRef.current?.focus();
      return;
    }
    if (cAgent && !forcedAgent) {
      const classicTaskpaneSystemCtx = String(cAgent.taskpaneSystemCtx || cAgent.systemCtx || '').trim();
      if (classicTaskpaneSystemCtx) {
        finalExtraSystemPrompt = [finalExtraSystemPrompt, classicTaskpaneSystemCtx].filter(Boolean).join('\n\n');
      }
      // זיכרון סבבים: תקציר ממצאים קודמים של ה-session נוסע ב-system prompt (לא בהיסטוריה,
      // שנחתכת ל-12 הודעות) — כך ממצא שנדחה לא חוזר גם בשיחה ארוכה.
      if (lecturerDirectAgentRequest) {
        const reviewLedgerDigest = buildReviewLedgerDigest(reviewLedger[activeChatSessionId]);
        if (reviewLedgerDigest) {
          finalExtraSystemPrompt = [finalExtraSystemPrompt, reviewLedgerDigest].filter(Boolean).join('\n\n');
        }
      }
      if (cAgent.sidebarSelection && cAgent.sidebarSelection.providerId) {
        const fallbackSelection = buildClassicTaskpaneSelection(activeClassicAgentId);
        if (fallbackSelection && fallbackSelection.selection) {
          finalProviderId = fallbackSelection.selection.providerId || finalProviderId;
          finalProviderModel = fallbackSelection.selection.model || finalProviderModel;
        }
      }
    }

    const finalPinnedProviderId = finalProviderId && finalProviderId !== 'default' ? finalProviderId : '';
    const finalProviderChoice = finalPinnedProviderId
      ? configuredProviderChoices.find((choice) => choice.id === finalPinnedProviderId) || null
      : null;
    const finalProviderModelChoices = finalProviderChoice
      ? getProviderModelChoices(finalProviderChoice.id, providerConfig)
      : [];
    const normalizedFinalProviderModel = finalProviderChoice
      ? normalizeProviderModelName(finalProviderChoice.id, String(finalProviderModel || '').trim())
      : String(finalProviderModel || '').trim();
    const resolvedFinalProviderModel = finalProviderChoice
      ? (finalProviderModelChoices.includes(normalizedFinalProviderModel)
        ? normalizedFinalProviderModel
        : (finalProviderModelChoices[0] || ''))
      : '';
    const finalProviderLabel = finalProviderChoice?.label || activeProviderLabel;
    const finalProviderSummary = finalProviderChoice
      ? [finalProviderLabel, resolvedFinalProviderModel].filter(Boolean).join(' · ')
      : activeProviderSummary;

    appendPromptHistory(originalText);

    const runtimeProviderOverride = String(runtimeOptions.providerOverride || '').trim();
    const runtimeModelOverride = String(runtimeOptions.modelOverride || '').trim();
    const pinExplicitProvider = forceGlobalSidebarProvider || userExplicitSidebarProvider;
    const globalLockProviderOverride = pinExplicitProvider ? finalPinnedProviderId : '';
    const globalLockModelOverride = pinExplicitProvider ? resolvedFinalProviderModel : '';
    const strictProviderId = runtimeProviderOverride || globalLockProviderOverride;
    const runtimeStrictProviderOverride = runtimeOptions.strictProviderOverride === true || pinExplicitProvider;
    const hasStrictRuntimeProviderOverride = runtimeStrictProviderOverride && Boolean(strictProviderId);
    const preferredProviderId = hasStrictRuntimeProviderOverride
      ? ''
      : (runtimeProviderOverride || finalPinnedProviderId);
    const preferredProviders = preferredProviderId ? [preferredProviderId] : [];
    const directProviderId = hasStrictRuntimeProviderOverride ? strictProviderId : '';
    const hasPinnedProviderPreference = hasStrictRuntimeProviderOverride || preferredProviders.length > 0;
    const explicitProviderModel = hasStrictRuntimeProviderOverride
      ? (runtimeModelOverride || globalLockModelOverride)
      : (runtimeProviderOverride
        ? runtimeModelOverride
        : (preferredProviderId ? resolvedFinalProviderModel : ''));
    const requestProviderLabel = runtimeProviderOverride ? activeProviderLabel : finalProviderLabel;
    const requestProviderSummary = runtimeProviderOverride ? activeProviderSummary : finalProviderSummary;
    clearPendingMentionSelection();

    const effectiveDirectAgentMeta = (!forcedAgent && cAgent)
      ? {
          ...agentMeta,
          id: String(activeClassicAgentId || agentMeta?.id || 'assistant-main').trim() || 'assistant-main',
          name: String(cAgent?.label || agentMeta?.name || 'צ׳אט ישיר').trim() || 'צ׳אט ישיר',
        }
      : agentMeta;
    const taskpaneFixApplyIntent = activeClassicAgentId === 'fix'
      && TASKPANE_FIX_APPLY_INTENT_PATTERN.test(txt)
      && !TASKPANE_FIX_ANALYSIS_QUESTION_PATTERN.test(txt);
    const shouldSkipTaskpaneApply = Boolean(cAgent && !forcedAgent && cAgent.taskpaneSkipApply === true && !taskpaneFixApplyIntent);

    if (!shouldSkipTaskpaneApply && shouldUseDocumentWideEditPlan(txt, {
      hasPromptResolvedTarget,
      batchTargets: requestEditBatchTargets,
      forceDocumentWide: Boolean((taskpaneFixApplyIntent || cAgent?.forceDocumentWideWhenNoTarget) && !requestEditTarget?.text?.trim()),
      activeTarget: requestEditTarget,
      hasNumberedReviewContext: hasRecentNumberedReviewContext(messages),
    })) {
      await executeDocumentWideEditPlan({
        userContent: originalText,
        promptText: txt,
        providerLabel: hasPinnedProviderPreference ? requestProviderSummary : activeProviderSummary,
        providerId: preferredProviderId || directProviderId,
        providerModel: explicitProviderModel,
        agentId: effectiveDirectAgentMeta.id || 'assistant-main',
        agentLabel: hasPinnedProviderPreference ? `${effectiveDirectAgentMeta.name} · ${requestProviderLabel}` : effectiveDirectAgentMeta.name,
        skillLabel: runtimeSkillLabel,
      });
      return;
    }

    if (isEditComposerMode && !shouldSkipTaskpaneApply && !requestEditTarget?.text?.trim()) {
      appendBlockedEditExchange(originalText, missingEditTargetMessage, {
        composerMode,
      }, {
        error: true,
        composerMode,
      });
      inputRef.current?.focus();
      return;
    }

    if (forcedAgent) {
      await executeRoleAgentTask(forcedAgent, txt, {
        skillId: manualSkillId,
        skillLabel: runtimeSkillLabel,
        autoUseDefaultSkill: disabledSkillRequested ? false : (isEditComposerMode ? false : !manualSkillId),
        persistSelection: !usedDraftAgentMention && !usedQueuedAgentMention,
        providerLabel: requestProviderSummary,
        providerOverride: directProviderId,
        preferredProviders,
        modelOverride: explicitProviderModel,
        strictProviderOverride: hasStrictRuntimeProviderOverride,
        extraSystemPrompt: finalExtraSystemPrompt,
        scopeLabel: contextScopeLabel,
        contextPreview,
        editModeExplicitRouting,
        editModeExplicitSkillInvocation,
        splitCallCount: requestedSplitCallCount,
        splitCallPrompt: txt,
      });
      return;
    }

    let ctx = buildContext(requestEditTargets, requestEditBatchTargets, txt);
    // ── סיווג מסלול צ'אט: מסמך / ידע כללי / כתיבה כללית (תחליף ג'ימיני) ──
    // רק לצ'אט ישיר בלי סוכן מפורש; סוכן קלאסי/עריכה נשארים 'document'.
    const chatScopeResult = classifyChatScope(txt, {
      hasSelection: Boolean(selectedText),
      hasCurrentBlock: Boolean(currentBlockText),
      hasDocument: Boolean(documentSnapshot.fullText || documentSnapshot.excerptText),
      activeAgentId: activeClassicAgentId || '',
      isEditComposerMode,
    });
    const isGeneralChatScope = chatScopeResult.scope === 'general-knowledge' || chatScopeResult.scope === 'general-writing';
    // מודל חזק כברירת מחדל לצ'אט כללי כשהמשתמש לא נעל מודל (שדרוג בתוך אותו ספק בלבד).
    const generalScopeModelOverride = (isGeneralChatScope && !explicitProviderModel && !hasPinnedProviderPreference)
      ? resolveStrongGeneralModelForProvider(activeProviderChoice?.id || providerConfig?.active || 'gemini', providerConfig)
      : '';
    const holeFillSourceQueryOverride = effectiveDirectAgentMeta.id === 'holeFill'
      ? buildHoleFillSourceQueryOverride(txt)
      : '';
    const sourcesQueryOverride = effectiveDirectAgentMeta.id === 'sources'
      ? buildSourcesQueryOverride(txt)
      : '';
    const sourcesNewsRequest = effectiveDirectAgentMeta.id === 'sources'
      ? isSourcesNewsRequest(txt, sourcesQueryOverride)
      : false;
    const directAgentName = hasPinnedProviderPreference ? `${effectiveDirectAgentMeta.name} · ${requestProviderLabel}` : effectiveDirectAgentMeta.name;
    // ── V3 (שלב 3): RunScope לצ'אט הסיידבר ──
    // scope חדש כשאין scope פעיל, כשזו שיחה חדשה (אין היסטוריה) או כשה-workspace התחלף.
    // נושא מפורש מהבקשה הנוכחית מעדכן את ה-scope (ומאפס נעילת מקורות ישנה) — כך
    // "מקורות על לבנון" אחרי שיחה על מוגבלויות מקבל שאילתה נקייה, לא ירושה.
    const requestExplicitTopic = sourcesQueryOverride || holeFillSourceQueryOverride || '';
    const scopeWorkspaceId = String(workspaceAutomation?.activeWorkspaceId || '').trim();
    let sidebarRunScope = getActiveRunScope('sidebar');
    if (!sidebarRunScope || !conversationHistory.length || sidebarRunScope.workspaceId !== scopeWorkspaceId) {
      sidebarRunScope = startRunScope('sidebar', {
        origin: effectiveDirectAgentMeta.id === 'sources' ? 'sources-agent'
          : effectiveDirectAgentMeta.id === 'holeFill' ? 'hole-fill'
            : 'sidebar-chat',
        workspaceId: scopeWorkspaceId,
        topic: requestExplicitTopic,
      });
    } else if (requestExplicitTopic) {
      setScopeTopic(sidebarRunScope, requestExplicitTopic);
    }
    setMessages((prev) => [...prev, { role: 'user', content: originalText, composerMode }]);
    setRequestSnapshot({
      providerLabel: hasPinnedProviderPreference ? requestProviderSummary : activeProviderSummary,
      agentLabel: directAgentName,
      skillLabel: runtimeSkillLabel,
      scopeLabel: requestScopeLabel,
      contextPreview,
    });
    const requestCycle = beginRequestCycle();
    setLoading(true);
    updateAgentStatus(effectiveDirectAgentMeta.id, directAgentName, { state: 'running', progress: 10, message: 'מתחיל טיפול' });
    
    setMessages((prev) => [...prev, { role: 'assistant', content: '', composerMode }]);

    try {
      // אימות מקורות חי ("חבר ביקורתי"): כשנשאל על מקור/קישור קיים — בודקים את ה-URLs
      // בבדיקה חיה ומצרפים תוצאות להקשר של אותה קריאה. מדולג לסוכני sources/holeFill
      // (יש להם pipeline אחזור משלהם) ולמצב עריכה.
      if (!isEditComposerMode && !['sources', 'holeFill'].includes(effectiveDirectAgentMeta.id || '')) {
        const sourceCheckRequest = detectSourceCheckRequest(txt, {
          selectedText,
          currentBlockText,
          documentSnapshotText: documentSnapshot.fullText || documentSnapshot.excerptText || '',
          hasSourceLock: Boolean(sidebarRunScope?.sourceLock),
        });
        if (sourceCheckRequest.shouldCheck) {
          updateAgentStatus(effectiveDirectAgentMeta.id, directAgentName, { state: 'running', progress: 20, message: 'מאמת מקורות…' });
          try {
            const sourceCheckOutcome = await runChatSourceCheck({
              urls: sourceCheckRequest.urls,
              signal: sidebarRunScope?.abortController?.signal,
              allowAll: sourceCheckRequest.scanAllDocument === true,
              claimText: sourceCheckRequest.claimText,
            });
            const sourceCheckContext = formatSourceCheckContext({ ...sourceCheckOutcome, claimText: sourceCheckRequest.claimText });
            if (sourceCheckContext) ctx = [ctx, sourceCheckContext].filter(Boolean).join('\n\n');
          } catch {
            // כשל באימות עצמו לא מפיל את הצ'אט — המודל פשוט לא יקבל בלוק אימות.
          }
          if (!isCurrentRequestCycle(requestCycle)) return;
        }
      }
      const invokeDirectCall = async (nextPrompt, nextContext, nextSystemPrompt, phaseMeta = {}) => await chatWithActiveProvider(nextPrompt, nextContext, nextSystemPrompt, {
        agentId: effectiveDirectAgentMeta.id || '',
        agentLabel: directAgentName,
        agentName: effectiveDirectAgentMeta.name || directAgentName,
        skillId: manualSkillId,
        autoUseDefaultSkill: lecturerDirectAgentRequest ? false : (disabledSkillRequested ? false : (isEditComposerMode ? false : !manualSkillId)),
        skipSkillSelection: lecturerDirectAgentRequest,
        forceSuppressResearchRouting: lecturerDirectAgentRequest,
        directChat: true,
        conversationHistory,
        includeAppMemory: !isEditComposerMode,
        providerOverride: directProviderId,
        preferredProviders,
        modelOverride: explicitProviderModel || generalScopeModelOverride,
        strictProviderOverride: hasStrictRuntimeProviderOverride,
        chatScope: chatScopeResult.scope,
        forceInternetInfo: isGeneralChatScope && chatScopeResult.isTimeSensitive,
        runScope: sidebarRunScope,
        sourceQueryOverride: sourcesQueryOverride || holeFillSourceQueryOverride,
        sourceQuerySource: sourcesQueryOverride ? 'taskpaneSourcesContext' : (holeFillSourceQueryOverride ? 'holeFillContext' : ''),
        isAcademicTask: effectiveDirectAgentMeta.id === 'sources' && !sourcesNewsRequest,
        editModeRequest: isEditComposerMode,
        allowEditModeRoutingOverride: editModeExplicitRouting,
        editModeExplicitSkillInvocation,
        skipAutomation: true,
        skipAutomationPrompt: true,
        skipMultiModel: hasPinnedProviderPreference || requestedSplitCallCount >= 2,
        preserveFullDocumentContext: shouldPreserveFullDocumentContext,
        documentFallbackHtml: documentSnapshot.html,
        ...phaseMeta,
        onSkillResolved: (payload) => {
          if (!isCurrentRequestCycle(requestCycle)) return;
          const skill = payload?.skill;
          const reasonLabel = payload?.reason === 'auto' ? 'אוטומטי' : payload?.reason === 'default' ? 'ברירת מחדל' : 'ידני';
          setResolvedSkillLabel(skill?.label ? `${skill.label} · ${reasonLabel}` : 'ללא סקיל פעיל');
          setRequestSnapshot((prev) => (prev
            ? {
                ...prev,
                skillLabel: skill?.label || runtimeSkillLabel,
              }
            : prev
          ));
        },
        onStatus: (payload) => {
          if (!isCurrentRequestCycle(requestCycle)) return;
          updateAgentStatus(effectiveDirectAgentMeta.id, directAgentName, payload);
          syncRequestSnapshotProviderFromStatus(payload);
        },
      });
      const directSystemPrompt = requestEditBatchTargets.length > 1
        ? [buildStructuredEditBatchSystemPrompt(requestEditBatchTargets), finalExtraSystemPrompt].filter(Boolean).join('\n\n')
        : finalExtraSystemPrompt;
      const directAnalysisSystemPrompt = stripComposerModeDirectiveFromSystemPrompt(directSystemPrompt);
      const effectiveRequestedSplitCallCount = lecturerDirectAgentRequest && !isEditComposerMode ? 0 : requestedSplitCallCount;
      let reply = effectiveRequestedSplitCallCount >= 2
        ? await (isEditComposerMode
          ? runEditMultiCallWorkflow({
            splitCallCount: effectiveRequestedSplitCallCount,
            promptText: txt,
            context: ctx,
            finalSystemPrompt: directSystemPrompt,
            analysisSystemPrompt: directAnalysisSystemPrompt,
            workflowKind: effectiveDirectAgentMeta.id || '',
            structuredBatchMode: requestEditBatchTargets.length > 1,
            batchTargets: requestEditBatchTargets,
            invokeCall: invokeDirectCall,
            onProgress: (payload) => {
              if (!isCurrentRequestCycle(requestCycle)) return;
              updateAgentStatus(effectiveDirectAgentMeta.id, directAgentName, { state: 'running', ...payload });
            },
          })
          : runSplitCallWorkflow({
            splitCallCount: effectiveRequestedSplitCallCount,
            promptText: txt,
            context: ctx,
            extraSystemPrompt: directSystemPrompt,
            invokeCall: invokeDirectCall,
            onProgress: (payload) => {
              if (!isCurrentRequestCycle(requestCycle)) return;
              updateAgentStatus(effectiveDirectAgentMeta.id, directAgentName, { state: 'running', ...payload });
            },
          }))
        : await invokeDirectCall(txt, ctx, directSystemPrompt, { phase: 'single', stepIndex: 1, stepCount: 1 });
      if (!isCurrentRequestCycle(requestCycle)) return;
      // לולאת סגנון אישי בבקשה מפורשת ("תכתוב שיישמע כמוני"): מזקקים את תוצר הכתיבה
      // מול הגלאי המקומי עד שנשמע כמו המשתמש. רק בכתיבה כללית, לא בשאלת ידע.
      if (chatScopeResult.explicitStyleLoop && chatScopeResult.scope === 'general-writing' && String(reply || '').trim()) {
        try {
          const styleProfile = getPersonalStyleProfile();
          updateAgentStatus(effectiveDirectAgentMeta.id, directAgentName, { state: 'running', progress: 80, message: 'מזקק לקול האישי שלך…' });
          const styleLoop = await runHumanizerLoop({
            text: reply,
            context: ctx,
            target: 32,
            maxPasses: 3,
            profile: styleProfile,
            onProgress: ({ pass, maxPasses, score, target }) => {
              if (!isCurrentRequestCycle(requestCycle)) return;
              updateAgentStatus(effectiveDirectAgentMeta.id, directAgentName, { state: 'running', progress: Math.min(94, 80 + pass * 4), message: `מכוונן לקול שלך — סבב ${pass}/${maxPasses} (ציון ${score}, יעד <${target})` });
            },
            invokeModel: (prompt, loopCtx) => invokeDirectCall(prompt, loopCtx, [directSystemPrompt, STEALTH_HUMANIZE_GUIDE].filter(Boolean).join('\n\n'), { phase: 'style-repair', stepIndex: 1, stepCount: 1 }),
          });
          if (styleLoop?.text && isCurrentRequestCycle(requestCycle)) reply = styleLoop.text;
        } catch {
          // כשל בלולאה לא מפיל את התשובה — נשארים עם הנוסח המקורי.
        }
      }
      const applyResult = shouldSkipTaskpaneApply
        ? { ok: true, skipped: true, reason: 'taskpane-analysis-only' }
        : requestEditBatchTargets.length > 1
          ? await applyEditBatchReply(reply, requestEditBatchTargets.map((target) => ({ ...target, batchPrompt: txt })), effectiveDirectAgentMeta.id || 'assistant-main')
          : await applyEditReply(reply, requestEditTarget, effectiveDirectAgentMeta.id || 'assistant-main');
      const documentActionMeta = buildDocumentActionMeta(applyResult, reply);
      const isLecturerReviewReply = lecturerDirectAgentRequest && !isEditComposerMode;
      // נספח AI: מפרקים את התשובה — בצ'אט מציגים רק את ההדרכה, ה-HTML של הנספח נשמר במטא
      // של ההודעה ומוכנס למסמך רק בלחיצת כפתור מפורשת.
      const isAiAppendixReply = activeClassicAgentId === 'aiAppendix' && !isEditComposerMode;
      const aiAppendixParsed = isAiAppendixReply ? parseAiAppendixResponse(String(reply || '')) : null;
      setMessages((prev) => {
        const newMsg = [...prev];
        newMsg[newMsg.length - 1] = {
          ...newMsg[newMsg.length - 1],
          content: aiAppendixParsed ? aiAppendixParsed.guidanceText : String(reply || ''),
          composerMode,
          ...(isLecturerReviewReply ? { reviewAgentId: 'lecturer' } : {}),
          ...(aiAppendixParsed?.ok ? { aiAppendixHtml: aiAppendixParsed.appendixHtml } : {}),
          ...documentActionMeta,
        };
        return newMsg;
      });
      if (isLecturerReviewReply) {
        const parsedReview = parseReviewFindings(String(reply || ''));
        if (parsedReview.findings.length || parsedReview.verdict) {
          setReviewLedger((prev) => ({
            ...prev,
            [activeChatSessionId]: mergeParsedFindingsIntoSessionLedger(prev[activeChatSessionId], parsedReview),
          }));
        }
      }
      updateAgentStatus(effectiveDirectAgentMeta.id, directAgentName, applyResult && !applyResult.skipped && !applyResult.ok
        ? { state: 'error', progress: 100, message: documentActionMeta.documentActionMessage || 'העריכה לא הוחלה במסמך' }
        : { state: 'success', progress: 100, message: 'הושלם' });
    } catch (err) {
      if (!isCurrentRequestCycle(requestCycle)) return;
      setMessages((prev) => {
        const newMsg = [...prev];
        newMsg[newMsg.length - 1] = {
          ...newMsg[newMsg.length - 1],
          content: `❌ ${err.message}`,
          error: true,
          composerMode,
        };
        return newMsg;
      });
      updateAgentStatus(effectiveDirectAgentMeta.id, directAgentName, { state: 'error', progress: 100, message: err.message || 'שגיאה' });
    } finally {
      // ניקוי loading/snapshot תמיד — גם אם מחזור הבקשה התחלף בינתיים (מעבר מסמך/workspace/reset),
      // כדי שלא להישאר תקועים ב-loading. רק החזרת הפוקוס מותנית בכך שזו עדיין הבקשה הנוכחית.
      setLoading(false);
      setRequestSnapshot(null);
      if (isCurrentRequestCycle(requestCycle)) inputRef.current?.focus();
    }
  };

  const runRoleAgent = async (agent) => {
    if (!workspaceAutomationEnabled) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'סביבת העבודה כבויה כרגע. כדי להריץ סוכן ייעודי, הפעל אותה מחדש מהצ׳קבוקס למעלה.' }]);
      setTab('chat');
      return;
    }
    const customTask = String(agentTaskInput || '').trim();
    const rawRoleAgentPrompt = customTask || String(input || '').trim();
    const splitDirective = extractSplitCallDirective(rawRoleAgentPrompt);
    const effectiveSplitCallCount = splitDirective.count >= 2 ? splitDirective.count : configuredSplitCallCount;
    const effectiveCustomTask = customTask
      ? (effectiveSplitCallCount >= 2 ? splitDirective.cleanedPrompt.trim() : customTask)
      : '';
    const task = effectiveCustomTask
      ? `${effectiveCustomTask}${selectedText ? `\n\nטקסט רלוונטי:\n"${selectedText}"` : ''}${currentBlockText && !selectedText ? `\n\nפסקה רלוונטית:\n"${currentBlockText}"` : ''}`
      : selectedText
        ? `עבוד על הטקסט הבא לפי התפקיד שלך:\n\n"${selectedText}"`
        : currentBlockText
          ? `עבוד על הפסקה הנוכחית לפי התפקיד שלך:\n\n"${currentBlockText}"`
          : (input.trim() || 'סייע לי עם המסמך הנוכחי לפי התפקיד שלך.');
    const preferredProviderId = activeProviderChoice?.id || '';
    const preferredProviders = !forceGlobalSidebarProvider && preferredProviderId ? [preferredProviderId] : [];
    const explicitProviderModel = preferredProviderId ? resolvedSelectedProviderModel : '';
    const pinExplicitProvider = forceGlobalSidebarProvider || userExplicitSidebarProvider;
    await executeRoleAgentTask(agent, task, {
      skillId: isEditComposerMode ? '' : (selectedSkillId === 'none' ? '' : selectedSkillId),
      autoUseDefaultSkill: isEditComposerMode ? false : selectedSkillId === 'none',
      persistSelection: !isEditComposerMode,
      providerLabel: activeProviderSummary,
      providerOverride: pinExplicitProvider ? preferredProviderId : '',
      preferredProviders,
      modelOverride: explicitProviderModel,
      strictProviderOverride: pinExplicitProvider,
      scopeLabel: contextScopeLabel,
      contextPreview,
      editModeExplicitRouting: false,
      editModeExplicitSkillInvocation: false,
      splitCallCount: effectiveSplitCallCount,
      splitCallPrompt: effectiveSplitCallCount >= 2 ? (splitDirective.cleanedPrompt.trim() || task) : task,
    });
  };

  const runAction = (action) => {
    if (action.sel && !localContext) {
      setTab('chat');
      setMessages(prev => [...prev,
        { role: 'user', content: `${action.icon} ${action.label}` },
        { role: 'assistant', content: '⚠️ מקם את הסמן בפסקה הרלוונטית או בחר טקסט לפני הפעולה הזו.' }
      ]);
      return;
    }
    setTab('chat');
    const promptText = `${action.prompt}${selectedText ? `:\n\n"${selectedText}"` : ''}`;
    setInput(promptText);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(promptText.length, promptText.length);
      }
    }, 50);
  };

  const buildClassicTaskpanePrompt = (agentId) => {
    const targetText = selectedText || currentBlockText;
    switch (agentId) {
      case 'reviewFix':
        return targetText
          ? `בדוק את הטקסט הבא כמו בודק אקדמי קפדן ואז תקן אותו אוטומטית מבחינת ניסוח, בהירות, זרימה, כתיב, דקדוק ועמידה בדרישות:\n\n"${targetText}"`
          : 'בדוק את כל המסמך הנוכחי כמו בודק אקדמי קפדן ואז תקן אותו אוטומטית בכל המסמך מבחינת ניסוח, בהירות, זרימה, כתיב, דקדוק ועמידה בדרישות.';
      case 'fix':
        return targetText
          ? `עבור על הטקסט הבא, ציין תיקונים מיידיים, וכתוב במפורש אילו חורים צריך למלא בהמשך ממסמכים או מהרשת:\n\n"${targetText}"`
          : 'עבור על הפסקה או המסמך הנוכחי, ציין תיקונים מיידיים, וכתוב במפורש אילו חורים צריך למלא בהמשך ממסמכים או מהרשת.';
      case 'holeFill':
        return targetText
          ? `עבור על הטקסט הבא, זהה מה חסר בו, השלם רק את החורים שדורשים מידע מאומת מהרשת, ואם נשארו חורים פתוחים כתוב במפורש אילו ציטוטים, מקורות, כתבות או נתונים עדיין חסרים:\n\n"${targetText}"`
          : 'עבור על המסמך הנוכחי ועל היסטוריית השיחה, זהה מה חסר בו, השלם רק את החורים שדורשים מידע מאומת מהרשת, ואם נשארו חורים פתוחים כתוב במפורש אילו ציטוטים, מקורות, כתבות או נתונים עדיין חסרים.';
      case 'humanize':
        return targetText
          ? `שכתב את הטקסט הבא כך שיישמע אנושי, אישי וטבעי יותר. שנה את הניסוח בצורה מורגשת, אך שמור על המשמעות והדיוק:\n\n"${targetText}"`
          : 'שכתב את ההקשר הפעיל כך שיישמע אנושי, אישי וטבעי יותר, עם שינוי מורגש בניסוח ולא רק ליטוש קל.';
      case 'sources':
        return targetText
          ? `מצא מקורות מאומתים עבור הטקסט הבא. אם הבקשה או הטקסט עוסקים בכתבות/חדשות - החזר כתבות חדשות מאומתות. אחרת העדף מקורות אקדמיים, מאמרים אקדמיים או מחקרים רלוונטיים. אל תמציא URLs או כותרות:\n\n"${targetText}"`
          : 'מצא מקורות מאומתים עבור הטענה או הנושא המרכזי במסמך. אם נדרש מקור חדשותי - החזר כתבות חדשות מאומתות; אחרת העדף מקורות אקדמיים, מאמרים אקדמיים או מחקרים רלוונטיים. אל תמציא URLs או כותרות.';
      case 'lecturer':
        return targetText
          ? `בדוק את הקטע הממוקד הבא כמו מרצה אקדמי לפני הגשה. דרג כל ממצא לפי חומרה (🔴 קריטי / 🟡 חשוב / ⚪ קוסמטי) וסיים בשורת "פסק דין". אם הקטע תקין — אמור זאת בפשטות:\n\n"${targetText}"`
          : 'בדוק את המסמך או הטיוטה הפעילה כמו מרצה אקדמי לפני הגשה. דרג כל ממצא לפי חומרה (🔴 קריטי / 🟡 חשוב / ⚪ קוסמטי) וסיים בשורת "פסק דין". אם העבודה תקינה — אמור זאת בפשטות.';
      case 'continue':
        return targetText
          ? `המשך לכתוב מהנקודה שבה הטקסט הבא נעצר:\n\n"${targetText}"`
          : 'המשך לכתוב מהנקודה שבה המסמך הנוכחי נעצר.';
      case 'summary':
        return targetText
          ? `סכם את הטקסט הבא:\n\n"${targetText}"`
          : 'סכם את ההקשר הפעיל בקצרה.';
      case 'academic':
        return targetText
          ? `שכתב את הטקסט הבא בסגנון אקדמי:\n\n"${targetText}"`
          : 'שכתב את ההקשר הפעיל בסגנון אקדמי.';
      default:
        return '';
    }
  };

  const buildClassicTaskpaneSelection = (agentId) => {
    const agentConfig = buildEffectiveClassicAgentConfig(agentId);
    if (forceGlobalSidebarProvider) return null;
    // בחירה מפורשת של המשתמש בדרופדאון מנצחת את הראוט הקשיח של הסוכן.
    // 'default' פירושו "השתמש בראוט המומלץ של הסוכן".
    const explicitProviderId = selectedProviderId && selectedProviderId !== 'default'
      ? String(selectedProviderId).trim()
      : '';
    const preferredProviderId = explicitProviderId
      || String(agentConfig?.sidebarSelection?.providerId || agentConfig?.route || '').trim();
    if (!preferredProviderId) return null;
    const configuredChoice = configuredProviderChoices.find((choice) => choice.id === preferredProviderId) || null;
    if (!configuredChoice) {
      return {
        available: false,
        selection: null,
        providerId: preferredProviderId,
        providerLabel: preferredProviderId,
        reason: `הפעולה הזו דורשת את ${preferredProviderId}, אבל הספק הזה לא מוגדר כרגע.`,
      };
    }
    const preferredModel = explicitProviderId
      ? String(resolvedSelectedProviderModel || '').trim()
      : String(agentConfig?.sidebarSelection?.model || '').trim();
    const nextModelChoices = getProviderModelChoices(preferredProviderId, providerConfig, preferredModel ? [preferredModel] : []);
    const resolvedModel = preferredModel
      ? normalizeProviderModelName(preferredProviderId, preferredModel)
      : (nextModelChoices[0] || '');
    return {
      available: true,
      selection: {
        providerId: preferredProviderId,
        model: resolvedModel,
      },
      providerId: preferredProviderId,
      providerLabel: configuredChoice.label || preferredProviderId,
      reason: '',
    };
  };

  const runClassicTaskpaneAgent = (agentId) => {
    const agentConfig = buildEffectiveClassicAgentConfig(agentId);
    const prompt = buildClassicTaskpanePrompt(agentId);
    if (!agentConfig || !prompt) return;
    const providerState = buildClassicTaskpaneSelection(agentId);
    if (providerState && providerState.available === false) {
      clearPendingMentionSelection();
      setTab('chat');
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `לא ניתן להריץ את ${agentConfig.label || 'הפעולה'} כרגע. ${providerState.reason}`,
        error: true,
      }]);
      return;
    }
    const runtimeSelection = providerState?.selection || null;
    clearPendingMentionSelection();
    setTab('chat');
    if (!forceGlobalSidebarProvider && runtimeSelection?.providerId) {
      setSelectedProviderId(runtimeSelection.providerId);
      setSelectedProviderModel(runtimeSelection.model || '');
      setSelectedAgentId('');
    }
    
    setDraftInput(prompt, { preservePendingMention: true });
    setPendingMentionSelection({
      agentId: agentId,
      skillId: ''
    });
    preservePendingMentionRef.current = true;

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(prompt.length, prompt.length);
      }
    }, 50);
  };

  const toggleClassicTaskpaneAgent = (agentId) => {
    setActiveClassicAgentId((currentAgentId) => (currentAgentId === agentId ? null : agentId));
  };

  // מפעיל את סוכן "נספח AI" ישירות מהסיידבר, בלי צורך בבחירת טקסט בתפריט הבועה.
  const launchAiAppendixAgent = () => {
    setActiveClassicAgentId('aiAppendix');
    setTab('chat');
    setInput('צור נספח תיעוד שימוש ב-AI למסמך הפעיל: רשימת פרומפטים לפי שלבי העבודה, פסקת רפלקציה, והדרכה איך להריץ ולצלם. התבסס על היסטוריית הפרומפטים האמיתית אם קיימת.');
  };

  const classicTaskpaneAgents = sidebarModeSettings.modes
    .filter((modeSetting) => modeSetting.enabled !== false)
    .map((modeSetting) => {
      const agentId = modeSetting.id;
      const config = buildEffectiveClassicAgentConfig(agentId) || {};
      const providerState = buildClassicTaskpaneSelection(agentId);
      return {
        id: agentId,
        ...config,
        providerAvailable: providerState ? providerState.available !== false : true,
        unavailableReason: providerState?.available === false ? providerState.reason : '',
      };
    })
    .filter((agent) => agent.label);
  const hasPendingMentionSelectionState = Boolean(pendingMentionSelectionState.agentId || pendingMentionSelectionState.skillId);
  const canSendCurrentInput = !loading && Boolean(input.trim() || hasPendingMentionSelectionState);
  const selectionPreviewText = localContext
    ? (contextPreview || contextSourceText.replace(/\s+/g, ' ').slice(0, 96))
    : 'לא נבחר טקסט — ה-AI קורא את כל המסמך';
  const selectionBadge = selectedText ? 'טקסט נבחר' : currentBlockText ? 'פסקה פעילה' : 'מסמך מלא';

  const renderComposerModeToggle = (variant = 'classic') => {
    const isModern = variant === 'modern';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: isModern ? 12 : 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: isModern ? 'rgba(255,255,255,0.82)' : '#4B5563' }}>
            מצב כתיבה
          </span>
          {COMPOSER_MODES.map((modeOption) => {
            const active = composerMode === modeOption.id;
            return (
              <button
                key={modeOption.id}
                type="button"
                onClick={() => setComposerMode(modeOption.id)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: active
                    ? (isModern ? '1px solid rgba(96, 165, 250, 0.62)' : '1px solid #38BDF8')
                    : (isModern ? '1px solid rgba(255,255,255,0.14)' : '1px solid #D1D5DB'),
                  background: active
                    ? (isModern ? 'rgba(59, 130, 246, 0.26)' : '#E0F2FE')
                    : (isModern ? 'rgba(255,255,255,0.08)' : '#FFFFFF'),
                  color: active
                    ? (isModern ? '#FFFFFF' : '#0F172A')
                    : (isModern ? 'rgba(255,255,255,0.78)' : '#4B5563'),
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: loading ? 'default' : 'pointer',
                  opacity: loading ? 0.72 : 1,
                }}
                disabled={loading}
              >
                {modeOption.label}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: isModern ? 'rgba(255,255,255,0.66)' : '#6B7280' }}>
          {composerModeHelpText}
        </div>
      </div>
    );
  };

  // Modern styling functions
  const modernMessageBubble = (isUser, message) => ({
    maxWidth: isUser ? '85%' : '95%',
    padding: isUser ? '12px 16px' : '14px 18px',
    borderRadius: isUser ? '20px 8px 20px 20px' : '8px 20px 20px 20px',
    background: isUser 
      ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      : 'rgba(15, 23, 42, 0.05)',
    backdropFilter: isUser ? 'none' : 'blur(10px)',
    border: isUser ? 'none' : '1px solid rgba(148, 163, 184, 0.2)',
    color: isUser ? 'white' : '#0F172A',
    fontSize: 14,
    lineHeight: 1.6,
    textShadow: isUser ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
    boxShadow: isUser 
      ? '0 8px 25px rgba(102, 126, 234, 0.25)' 
      : '0 4px 15px rgba(15, 23, 42, 0.05)',
    transition: 'all 0.3s ease',
    position: 'relative',
    overflow: 'hidden',
  });

  const modernTabButton = (tabId, label, isActive) => ({
    flex: 1,
    padding: '8px 4px',
    fontSize: 12,
    fontWeight: isActive ? 700 : 500,
    border: 'none',
    cursor: 'pointer',
    background: isActive 
      ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 69, 19, 0.08) 100%)'
      : 'transparent',
    color: isActive ? '#4F46E5' : '#64748B',
    borderBottom: isActive ? '2px solid #4F46E5' : '2px solid transparent',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative',
    overflow: 'hidden',
  });

  const modernActionButton = (action, category = 'default') => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '16px 12px',
    border: 'none',
    borderRadius: 16,
    cursor: 'pointer',
    background: `linear-gradient(135deg, ${action.color || 'rgba(99, 102, 241, 0.1)'} 0%, rgba(139, 69, 19, 0.05) 100%)`,
    backdropFilter: 'blur(10px)',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    fontSize: 13,
    fontWeight: 600,
    color: '#1E293B',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.05)',
    transform: 'scale(1)',
  });

  const controlCardStyle = {
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: 20,
    padding: '14px 16px',
    backdropFilter: 'blur(18px)',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
  };

  const controlLabelStyle = {
    fontSize: 13,
    fontWeight: 700,
    color: 'white',
    marginBottom: 6,
  };

  const controlHelperStyle = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.68)',
    lineHeight: 1.6,
    marginBottom: 10,
  };

  const controlSelectStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    borderRadius: 14,
    fontSize: 12,
    background: 'rgba(15, 23, 42, 0.18)',
    backdropFilter: 'blur(10px)',
    color: 'white',
    outline: 'none',
  };

  if (useClassicTaskpaneShell) {
    return (
      <div style={{ ...getShellStyle(mode, compactMode), background: 'var(--chat-bg)', fontFamily: '"Segoe UI", Tahoma, sans-serif' }} dir="rtl">
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--chat-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '13px 15px 11px', background: 'var(--chat-header)', color: 'var(--chat-ink)', flexShrink: 0, borderBottom: '1px solid var(--chat-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, var(--chat-accent), var(--chat-accent-strong))', display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: '0 6px 16px var(--chat-accent-soft)' }}>
                <div style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--chat-accent-ink)' }} />
              </div>
              <div style={{ minWidth: 0, lineHeight: 1.2 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--chat-ink)' }}>עוזר הכתיבה</div>
                <div style={{ fontSize: 11, color: 'var(--chat-ink-soft)', display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--chat-accent)', flexShrink: 0 }} />{activeProviderSummary || 'מחובר'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              {chatHeaderButtons.map((btn) => (
                <button
                  key={btn.key}
                  type="button"
                  onClick={btn.onClick}
                  title={btn.title}
                  style={{ background: 'var(--chat-bubble-ai)', border: '1px solid var(--chat-border)', width: 30, height: 30, borderRadius: 8, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--chat-ink-soft)' }}
                >
                  {btn.icon}
                </button>
              ))}
            </div>
          </div>

          {tab === 'chat' && (
            <div style={{ display: 'flex', gap: 4, margin: '10px 12px 2px', background: 'var(--chat-bubble-ai)', border: '1px solid var(--chat-border)', borderRadius: 11, padding: 3, flexShrink: 0 }}>
              {COMPOSER_MODES.map((m) => {
                const active = composerMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setComposerMode(m.id)}
                    title={m.label}
                    style={{ flex: 1, border: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: active ? 800 : 700, padding: 7, borderRadius: 8, background: active ? 'var(--chat-accent)' : 'transparent', color: active ? 'var(--chat-accent-ink)' : 'var(--chat-ink-soft)', boxShadow: active ? '0 2px 7px var(--chat-accent-soft)' : 'none', transition: 'background .15s, color .15s' }}
                  >
                    {m.icon} {m.label}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--chat-surface)', borderBottom: '1px solid var(--chat-border)', flexShrink: 0 }}>
            <span style={{ fontSize: 12 }}>📄</span>
            <div style={{ flex: 1, fontSize: 12, color: localContext ? 'var(--chat-ink)' : 'var(--chat-ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectionPreviewText}
            </div>
            <span style={{ fontSize: 10, background: '#E8F1FB', color: '#0F4C81', padding: '4px 8px', borderRadius: 999, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {selectionBadge}
            </span>
          </div>

          {assignmentBriefText && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#FFF7ED', borderBottom: '1px solid #FDE7C7', flexShrink: 0 }}>
              <span style={{ fontSize: 12 }}>📝</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9A3412' }}>
                  הוראות מטלה זמינות לפי בקשה{assignmentBriefFileName ? ` · ${assignmentBriefFileName}` : ''}
                </div>
                <div style={{ fontSize: 11, color: '#7C2D12', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  כתוב למשל: "בדוק גם מול הוראות המטלה" או "תעבוד לפי קובץ ההוראות".
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: '#FAF9F8', borderBottom: '1px solid #EDEBE9', flexShrink: 0, alignItems: 'stretch' }}>
            <div style={{ flex: 1, display: 'grid', gap: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.95fr) minmax(0, 1.05fr)', gap: 6 }}>
                <select
                  value={selectedProviderId || 'default'}
                  onChange={(e) => {
                    clearPendingMentionSelection();
                    setSelectedProviderId(e.target.value);
                    setSelectedAgentId('');
                  }}
                  disabled={isSettingsLocked || forceGlobalSidebarProvider}
                  style={{ padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 6, background: forceGlobalSidebarProvider ? '#F8FAFC' : '#FFFFFF', fontSize: 12, color: '#323130', outline: 'none', minWidth: 0, ...(isSettingsLocked || forceGlobalSidebarProvider ? { opacity: 0.56, cursor: 'not-allowed', boxShadow: 'none' } : {}) }}
                >
                  <option value="default">ברירת מחדל</option>
                  {configuredProviderChoices.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
                <select
                  value={activeProviderChoice ? resolvedSelectedProviderModel : ''}
                  onChange={(e) => {
                    clearPendingMentionSelection();
                    setSelectedProviderModel(e.target.value);
                  }}
                  disabled={isSettingsLocked || forceGlobalSidebarProvider || !activeProviderChoice || !providerModelChoices.length}
                  style={{ padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 6, background: forceGlobalSidebarProvider ? '#F8FAFC' : '#FFFFFF', fontSize: 12, color: '#323130', outline: 'none', minWidth: 0, ...(isSettingsLocked || forceGlobalSidebarProvider ? { opacity: 0.56, cursor: 'not-allowed', boxShadow: 'none' } : {}) }}
                >
                  {activeProviderChoice ? providerModelChoices.map((modelId) => (
                    <option key={modelId} value={modelId}>
                      {modelId}
                    </option>
                  )) : <option value="">מודל מההגדרות</option>}
                </select>
              </div>
              <div style={{ padding: '0 2px', fontSize: 11, color: '#605E5C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {`סוכן פעיל: ${effectiveAgentSummary} • ${effectiveProviderSummary}`}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (tab === 'settings') {
                  setTab('chat');
                  return;
                }
                clearConversation();
              }}
              disabled={loading}
              style={{ background: 'transparent', border: '1px solid #D1D5DB', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: loading ? 'not-allowed' : 'pointer', color: '#323130', opacity: loading ? 0.6 : 1, whiteSpace: 'nowrap' }}
            >
              {tab === 'settings' ? 'חזרה לצ׳אט' : '+ שיחה חדשה'}
            </button>
            <button
              type="button"
              onClick={() => setTab((prev) => prev === 'history' ? 'chat' : 'history')}
              disabled={loading}
              style={{ background: tab === 'history' ? '#EFF6FF' : 'transparent', border: '1px solid #D1D5DB', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: loading ? 'not-allowed' : 'pointer', color: tab === 'history' ? '#1D4ED8' : '#323130', opacity: loading ? 0.6 : 1, whiteSpace: 'nowrap' }}
            >
              שיחות קודמות
            </button>
          </div>

            {tab === 'settings' ? (
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--chat-surface)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, padding: 12, background: '#F8FAFC' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4 }}>⚙️ הגדרות השיחה בצד</div>
                  <div style={{ fontSize: 12, color: '#4B5563', lineHeight: 1.6 }}>
                    ההגדרות כאן משפיעות רק על החלונית הימנית. הן לא מחליפות את מסך ההגדרות המלא של האפליקציה, ולא פותחות את תפריט הקובץ בדרך.
                  </div>
                </div>

                <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, padding: 12, background: '#FFFFFF' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 6 }}>⚙️ סקיל פעיל</div>
                  <select
                    value={isEditComposerMode ? 'none' : selectedSkillId}
                    onChange={(e) => {
                      clearPendingMentionSelection();
                      setSelectedSkillId(e.target.value);
                    }}
                    disabled={isSettingsLocked || isEditComposerMode}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: 6, background: '#FFFFFF', fontSize: 12, color: '#323130', outline: 'none', ...lockedControlStyle }}
                  >
                    <option value="none">בחירה אוטומטית</option>
                    {skillCatalog.map((skill) => {
                      const mode = skillsConfig.skills?.[skill.id]?.mode || 'manual';
                      return (
                        <option key={skill.id} value={skill.id} disabled={mode === 'off'}>
                          {skill.label}{mode === 'auto' ? ' · אוטומטי' : mode === 'off' ? ' · כבוי' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

              </div>
            ) : tab === 'history' ? (
              renderChatHistoryPanel('light')
            ) : (
              <div ref={messagesRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--chat-surface)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.map((msg, index) => {
                  const isEditMessage = normalizeComposerMode(msg.composerMode || '') === 'edit';
                  const documentActionTone = msg.documentActionStatus === 'failed'
                    ? { background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C' }
                    : msg.documentActionStatus === 'partial'
                      ? { background: '#FFFBEB', border: '1px solid #FDE68A', color: '#B45309' }
                      : { background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857' };

                  return (
                    <div key={`${msg.role}-${index}`} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: compactMode ? '98%' : '94%' }}>
                      <div style={{ ...bbl(msg.role === 'user', compactMode), ...(msg.error ? { background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C' } : {}) }}>
                        {renderChatMessageContent(msg.content)}
                      </div>
                      {renderReviewFindingRows(msg, 'light')}
                      {msg.documentActionMessage && (
                        <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, fontSize: 11, lineHeight: 1.5, ...documentActionTone }}>
                          {msg.documentActionMessage}
                        </div>
                      )}
                      {renderDocumentActionCompletionButton(msg, 'light')}
                      {(msg.content || '').trim() && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 7 }}>
                          {msg.role === 'assistant' && !msg.error && !isEditMessage && onApplyDocumentPlan && (
                            <button
                              type="button"
                              onClick={() => applyChatMessageToDocument(msg)}
                              disabled={loading}
                              style={{ padding: '7px 13px', borderRadius: 9, border: 0, background: 'var(--chat-accent)', color: 'var(--chat-accent-ink)', fontSize: 12, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.55 : 1 }}
                            >
                              ↪ החל במיקומים
                            </button>
                          )}
                          {msg.role === 'assistant' && !msg.error && !isEditMessage && onInsert && (
                            <button
                              type="button"
                              onClick={() => onInsert(msg.content)}
                              style={{ padding: '7px 13px', borderRadius: 9, border: '1px solid color-mix(in srgb, var(--chat-accent) 30%, transparent)', background: 'color-mix(in srgb, var(--chat-accent) 11%, transparent)', color: 'var(--chat-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                              ＋ הוסף למסמך
                            </button>
                          )}
                          {msg.role === 'assistant' && !msg.error && msg.aiAppendixHtml && onAppendAiAppendix && (
                            <button
                              type="button"
                              onClick={() => onAppendAiAppendix(msg.aiAppendixHtml)}
                              style={{ padding: '7px 13px', borderRadius: 9, border: 0, background: '#F59E0B', color: '#78350F', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                            >
                              📎 הוסף נספח לסוף המסמך
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => copyMessageToClipboard(msg.content)}
                            title="העתק"
                            style={{ padding: '7px 11px', borderRadius: 9, border: '1px solid var(--chat-border)', background: 'var(--chat-bubble-ai)', color: 'var(--chat-ink-soft)', fontSize: 13, cursor: 'pointer' }}
                          >
                            ⧉
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {loading && (
                  <div style={{ alignSelf: 'flex-start', maxWidth: compactMode ? '98%' : '94%' }}>
                    <div style={{ ...bbl(false, compactMode) }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 800, color: 'var(--chat-accent)', background: 'var(--chat-accent-soft)', padding: '3px 9px', borderRadius: 999 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--chat-accent)', animation: 'wf-glowDot 1.3s ease-in-out infinite' }} />
                        {progressStatusLabel}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

          <div style={{ padding: '8px 12px 10px', background: 'var(--chat-surface)', borderTop: '1px solid var(--chat-border)', flexShrink: 0 }}>
            {renderReviewVerdictChip('light')}
            {renderComposerModelQuickPick('light')}
            {activeClassicAgent && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: '#F0FDFA', border: '1px solid #0D9488', borderRadius: 8, margin: '8px 0', color: '#0F766E', fontSize: 13, fontWeight: 600 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✅ סוכן פעיל: {activeClassicAgent.label}
                </div>
                <button type="button" onClick={() => setActiveClassicAgentId(null)} style={{ background: 'transparent', border: 'none', color: '#0F766E', cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
            )}
            {/* שורת צ'יפי פעולה (פריסת המוקאפ) — תקן / סכם / הרחב / חידוד… + "עוד" שפותח גריד כל הפעולות */}
            {visibleActions.length > 0 && (
              <>
                {moreActionsOpen && (
                  <div style={{ marginBottom: 9, padding: 11, borderRadius: 14, background: 'var(--chat-bubble-ai)', border: '1px solid var(--chat-border)' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--chat-muted2, var(--chat-ink-soft))', letterSpacing: '.03em', margin: '0 2px 8px' }}>כל הפעולות</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
                      {visibleActions.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => { runAction(action); setMoreActionsOpen(false); }}
                          disabled={loading}
                          title={action.label}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '9px 4px', borderRadius: 11, background: 'var(--chat-surface)', border: '1px solid var(--chat-border)', color: 'var(--chat-ink3, var(--chat-ink))', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
                        >
                          <span style={{ fontSize: 16 }}>{action.icon}</span>
                          <span style={{ fontSize: 10.5, fontWeight: 700, textAlign: 'center', lineHeight: 1.2 }}>{action.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="nicebar" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '4px 0 9px' }}>
                  <button
                    type="button"
                    onClick={launchAiAppendixAgent}
                    disabled={loading}
                    title="צור נספח תיעוד שימוש ב-AI עם הדרכה"
                    style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 999, border: '1px solid rgba(245, 158, 11, 0.4)', background: 'rgba(245, 158, 11, 0.12)', color: '#B45309', fontSize: 12, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, whiteSpace: 'nowrap' }}
                  >
                    📎 נספח AI
                  </button>
                  {visibleActions.slice(0, 4).map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => runAction(action)}
                      disabled={loading}
                      title={action.label}
                      style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 999, border: '1px solid var(--chat-border)', background: 'var(--chat-bubble-ai)', color: 'var(--chat-ink)', fontSize: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, whiteSpace: 'nowrap' }}
                    >
                      <span>{action.icon}</span>{action.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setMoreActionsOpen((v) => !v)}
                    title="כל הפעולות"
                    style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 13px', borderRadius: 999, border: '1px solid color-mix(in srgb, var(--chat-accent) 30%, transparent)', background: 'color-mix(in srgb, var(--chat-accent) 11%, transparent)', color: 'var(--chat-accent)', fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    ⊕ {moreActionsOpen ? 'פחות' : 'עוד'}
                  </button>
                </div>
              </>
            )}

            {activeClassicAgentId === 'brainstorm' && activeProject && messages.length >= 2 && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 6 }}>
                <button
                  type="button"
                  onClick={saveBrainstormConclusionsToProject}
                  disabled={savingProjectMemory}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 999, border: '1px solid color-mix(in srgb, var(--chat-accent) 35%, transparent)', background: 'color-mix(in srgb, var(--chat-accent) 12%, transparent)', color: 'var(--chat-accent)', fontSize: 12, fontWeight: 800, cursor: savingProjectMemory ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}
                >
                  {savingProjectMemory ? '⏳ מסכם ושומר…' : `🧭 שמור מסקנות לפרויקט "${activeProject.name}"`}
                </button>
              </div>
            )}
            {externalChatDialogOpen && (
              <div style={{ marginBottom: 8, padding: 12, borderRadius: 13, border: '1px solid var(--chat-border)', background: 'var(--chat-bubble-ai)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--chat-ink)' }}>🔗 צירוף שיחת AI חיצונית</div>
                <input
                  type="text"
                  dir="ltr"
                  value={externalChatUrl}
                  onChange={(e) => setExternalChatUrl(e.target.value)}
                  placeholder="https://chatgpt.com/share/… (לא חובה — לתיעוד המקור)"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 9, border: '1px solid var(--chat-border)', background: 'var(--chat-bg, transparent)', color: 'var(--chat-ink)', fontSize: 12, boxSizing: 'border-box' }}
                />
                {externalChatUrl.trim() && !isSupportedExternalChatShareUrl(externalChatUrl) && (
                  <div style={{ fontSize: 11, color: 'var(--chat-ink-soft)' }}>הקישור לא נראה כמו קישור שיתוף מוכר (ChatGPT/Gemini/Claude) — יצורף כתווית מקור בלבד.</div>
                )}
                <textarea
                  value={externalChatText}
                  onChange={(e) => setExternalChatText(e.target.value)}
                  placeholder="הדבק כאן את תוכן השיחה (העתק מהדף המשותף). דפי שיתוף נטענים ב-JavaScript ולכן אי אפשר למשוך אותם אוטומטית."
                  rows={5}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--chat-border)', background: 'var(--chat-bg, transparent)', color: 'var(--chat-ink)', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => attachExternalChat()} style={{ padding: '6px 13px', borderRadius: 999, border: 'none', background: 'var(--chat-accent)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>צרף לשיחה</button>
                  {activeProject && (
                    <button type="button" onClick={() => attachExternalChat({ alsoSaveToProject: true })} disabled={savingProjectMemory} style={{ padding: '6px 13px', borderRadius: 999, border: '1px solid var(--chat-accent)', background: 'transparent', color: 'var(--chat-accent)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>צרף + שמור לזיכרון הפרויקט</button>
                  )}
                  <button type="button" onClick={() => setExternalChatDialogOpen(false)} style={{ padding: '6px 13px', borderRadius: 999, border: '1px solid var(--chat-border)', background: 'transparent', color: 'var(--chat-ink-soft)', fontSize: 12, cursor: 'pointer' }}>ביטול</button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="העלאת קובץ כהקשר לצ'אט"
                  style={{ width: 40, height: 44, background: 'var(--chat-bubble-ai)', border: '1px solid var(--chat-border)', borderRadius: 13, fontSize: 16, color: 'var(--chat-ink-soft)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  📎
                </button>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".docx,.txt,.md,.pdf,.json" onChange={handleFileUpload} />
                <button
                  type="button"
                  onClick={() => setExternalChatDialogOpen((v) => !v)}
                  title="צירוף קישור לשיחת AI חיצונית (ChatGPT/Gemini/Claude)"
                  style={{ width: 40, height: 44, background: externalChatDialogOpen ? 'color-mix(in srgb, var(--chat-accent) 15%, transparent)' : 'var(--chat-bubble-ai)', border: '1px solid var(--chat-border)', borderRadius: 13, fontSize: 16, color: 'var(--chat-ink-soft)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  🔗
                </button>
              </div>

              <div style={{ flex: 1, position: 'relative' }}>
                {attachedFiles.map((file, idx) => (
                  <div key={idx} style={{
                    marginBottom: 8,
                    padding: '6px 12px',
                    fontSize: 12,
                    color: '#065F46',
                    background: '#ECFDF5',
                    border: '1px solid #10B981',
                    borderRadius: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span>✅ מסמך צורף: {file.name}</span>
                    <button 
                      onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                      style={{ background: 'none', border: 'none', color: '#065F46', cursor: 'pointer', fontSize: 14 }}
                    >✕</button>
                  </div>
                ))}
                {renderPendingMentionPill('classic')}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    if (promptHistoryIndex !== -1) {
                      setPromptHistoryIndex(-1);
                      setPreNavigationDraft('');
                    }
                    setDraftInput(e.target.value);
                    updateMentionMenu(e.target.value, e.target.selectionStart ?? e.target.value.length);
                  }}
                  onClick={(e) => updateMentionMenu(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
                  onBlur={() => setTimeout(() => closeMentionMenu(), 120)}
                  onKeyDown={(e) => {
                    if (mentionMenu.open && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
                      e.preventDefault();
                      if (e.key === 'Escape') {
                        closeMentionMenu();
                        return;
                      }
                      if (e.key === 'ArrowDown') {
                        setMentionMenu((prev) => ({ ...prev, activeIndex: Math.min(prev.activeIndex + 1, prev.items.length - 1) }));
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        setMentionMenu((prev) => ({ ...prev, activeIndex: Math.max(prev.activeIndex - 1, 0) }));
                        return;
                      }
                      const choice = mentionMenu.items[mentionMenu.activeIndex] || mentionMenu.items[0];
                      if (choice) applyMentionChoice(choice);
                      return;
                    }
                    const selectionStart = e.currentTarget.selectionStart ?? 0;
                    const selectionEnd = e.currentTarget.selectionEnd ?? selectionStart;
                    const hasSelection = selectionStart !== selectionEnd;
                    const caretAtStart = selectionStart === 0 && selectionEnd === 0;
                    const caretAtEnd = selectionStart === e.currentTarget.value.length && selectionEnd === e.currentTarget.value.length;

                    if (e.key === 'ArrowUp' && !hasSelection && caretAtStart) {
                      const moved = navigatePromptHistory('up');
                      if (moved) {
                        e.preventDefault();
                        return;
                      }
                    }

                    if (e.key === 'ArrowDown') {
                      const canNavigateDown = !hasSelection && (promptHistoryIndex !== -1 || caretAtEnd);
                      if (canNavigateDown) {
                        const moved = navigatePromptHistory('down');
                        if (moved) {
                          e.preventDefault();
                          return;
                        }
                      }
                    }

                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={composerPlaceholder}
                  rows={2}
                  style={{ width: '100%', minHeight: 44, maxHeight: 120, resize: 'vertical', padding: '9px 12px', border: '1px solid var(--chat-border)', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, background: 'var(--chat-input-bg)', color: 'var(--chat-ink)', direction: 'rtl' }}
                />

                {mentionMenu.open && (
                  <div style={{ position: 'absolute', right: 0, left: 0, bottom: 'calc(100% + 8px)', background: '#111827', border: '1px solid #334155', borderRadius: 10, overflow: 'hidden', boxShadow: '0 18px 36px rgba(15,23,42,0.22)', zIndex: 30 }}>
                    <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#E5E7EB', background: '#1F2937' }}>
                      ⚡ סקילים זמינים
                    </div>
                    {mentionMenu.items.map((item, index) => (
                      <button
                        key={`${item.type}-${item.id}`}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          applyMentionChoice(item);
                        }}
                        style={{ width: '100%', textAlign: 'right', border: 'none', borderTop: index === 0 ? 'none' : '1px solid #334155', background: index === mentionMenu.activeIndex ? '#1E3A8A' : 'transparent', padding: '10px 12px', cursor: 'pointer' }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'white' }}>
                          /{item.id}
                        </div>
                        <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 2 }}>{item.label}</div>
                        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{item.description}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => send()}
                disabled={!canSendCurrentInput}
                title="שלח"
                style={{ width: 44, height: 44, border: 'none', borderRadius: 13, background: canSendCurrentInput ? 'linear-gradient(135deg, var(--chat-accent), var(--chat-accent-strong))' : 'var(--chat-bubble-ai)', color: canSendCurrentInput ? 'var(--chat-accent-ink)' : 'var(--chat-ink-soft)', fontSize: 18, fontWeight: 800, cursor: canSendCurrentInput ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: canSendCurrentInput ? '0 8px 20px var(--chat-accent-soft)' : 'none' }}
              >
                {loading ? '…' : '↑'}
              </button>
            </div>

            <div style={{ marginTop: 8, fontSize: 11, color: '#605E5C' }}>
              {loading ? progressStatusLabel : `מוכן • ${effectiveAgentSummary} • ${composerModeLabel}`}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* CSS Animations */}
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          33% {
            transform: translateY(-10px) rotate(1deg);
          }
          66% {
            transform: translateY(-5px) rotate(-0.5deg);
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.05);
          }
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          50% {
            transform: translateX(100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes messageSlide {
          from {
            opacity: 0;
            transform: translateX(30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes glow {
          0%, 100% {
            box-shadow: 0 0 5px rgba(139, 92, 246, 0.4);
          }
          50% {
            box-shadow: 0 0 20px rgba(139, 92, 246, 0.8);
          }
        }

        @keyframes railSweep {
          0% {
            transform: translateY(120%);
          }
          100% {
            transform: translateY(-120%);
          }
        }

        @keyframes railPulse {
          0%, 100% {
            opacity: 0.85;
            filter: saturate(1);
          }
          50% {
            opacity: 1;
            filter: saturate(1.25);
          }
        }
      `}</style>
      
      <div 
        style={{
          width: '100%',
          height: mode === 'sidebar' ? 'auto' : '100%',
          display: 'flex',
          flexDirection: 'column',
          flex: mode === 'sidebar' ? '1 1 0' : '0 0 auto',
          minHeight: 0,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
        dir="rtl"
      >
        {/* Enhanced Animated Background */}
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `
              radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.4) 0%, transparent 60%),
              radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.3) 0%, transparent 60%),
              radial-gradient(circle at 40% 40%, rgba(120, 219, 255, 0.25) 0%, transparent 60%),
              radial-gradient(circle at 60% 70%, rgba(168, 85, 247, 0.2) 0%, transparent 50%)
            `,
            animation: 'float 25s ease-in-out infinite',
            opacity: 0.6,
          }}
        />
        
        {/* Floating particles */}
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: `${4 + (i % 3) * 2}px`,
              height: `${4 + (i % 3) * 2}px`,
              background: `rgba(255, 255, 255, ${0.1 + (i % 4) * 0.05})`,
              borderRadius: '50%',
              top: `${10 + (i * 15)}%`,
              left: `${5 + (i * 12)}%`,
              animation: `float ${8 + (i % 3) * 2}s ease-in-out ${i * 0.5}s infinite`,
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* Header קומפקטי עם מצב שיחה פעיל */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.12)',
          backdropFilter: 'blur(25px)',
          padding: '10px 14px 9px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
          position: 'relative',
          zIndex: 10,
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0, flex: 1 }}>
            <div style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #FF6B6B, #4ECDC4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
              animation: 'pulse 2s ease-in-out infinite',
              boxShadow: '0 4px 15px rgba(255, 107, 107, 0.28)',
              flexShrink: 0,
            }}>
              🤖
            </div>
            <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{
                  color: 'white',
                  fontWeight: 800,
                  fontSize: 15,
                  textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                  background: 'linear-gradient(45deg, #ffffff, #f0f0f0)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>
                  WordFlow AI ✨
                </div>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: progressTone.background,
                  border: `1px solid ${progressTone.border}`,
                  color: progressTone.color,
                  whiteSpace: 'nowrap',
                }}>
                  {progressStatusLabel}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {chatStatusPills.map((pill) => (
                  <span
                    key={pill.id}
                    style={{
                      fontSize: 10,
                      background: pill.background,
                      color: pill.color,
                      padding: '4px 9px',
                      borderRadius: 999,
                      fontWeight: 700,
                      border: `1px solid ${pill.border}`,
                      whiteSpace: 'nowrap',
                      maxWidth: compactMode ? '46%' : 'unset',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={`${pill.label}: ${pill.value}`}
                  >
                    {pill.label} · {pill.value}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {mode === 'sidebar' && (
              <button
                style={{
                  color: 'rgba(255,255,255,0.9)',
                  background: 'rgba(255,255,255,0.18)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: 16,
                  padding: '10px 16px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                }}
                onClick={onToggleCompact}
                title={compactMode ? 'הרחב חלונית' : 'כווץ חלונית'}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                  e.currentTarget.style.transform = 'scale(1.08) translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.18)';
                  e.currentTarget.style.transform = 'scale(1) translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                }}
              >
                {compactMode ? '⤢' : '⤡'}
              </button>
            )}
            <button 
              style={{
                color: 'rgba(255,255,255,0.9)',
                background: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 16,
                padding: '10px 14px',
                cursor: 'pointer',
                fontSize: 18,
                fontWeight: 700,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              }}
              onClick={onClose}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 68, 68, 0.25)';
                e.currentTarget.style.borderColor = 'rgba(255, 68, 68, 0.4)';
                e.currentTarget.style.transform = 'scale(1.1) rotate(90deg)';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(255, 68, 68, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
              }}
            >
              ×
            </button>
          </div>
        </div>

      {/* Modern Navigation Tabs */}
      <div style={{
        display: 'flex',
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(15px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        position: 'relative',
        zIndex: 5,
      }}>
        {[
          ['chat', "💬 צ'אט"],
          ['history', '🕘 שיחות'],
          ['settings', '⚙️ הגדרות'],
          ['actions', '⚡ פעולות']
        ].map(([id, label]) => (
          <button 
            key={id} 
            onClick={() => setTab(id)}
            style={modernTabButton(id, label, tab === id)}
            onMouseEnter={(e) => {
              if (tab !== id) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }
            }}
            onMouseLeave={(e) => {
              if (tab !== id) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {shouldShowProgress && (
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 18,
          zIndex: 9,
          pointerEvents: 'none',
          display: 'flex',
          justifyContent: 'center',
        }}>
          <div style={{
            width: 4,
            margin: '10px 0',
            borderRadius: 999,
            background: 'rgba(255, 255, 255, 0.15)',
            overflow: 'hidden',
            position: 'relative',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.08)',
          }}>
            <div style={{
              position: 'absolute',
              insetInlineStart: 0,
              insetInlineEnd: 0,
              bottom: 0,
              minHeight: activeAgentStatus.state === 'idle' ? 0 : 12,
              height: `${progressPercent}%`,
              borderRadius: 999,
              background: progressTone.rail,
              transition: 'height 0.45s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s ease',
              boxShadow: `0 0 18px ${progressTone.glow}`,
              animation: loading || activeAgentStatus.state === 'retrying' ? 'railPulse 1.4s ease-in-out infinite' : 'none',
              overflow: 'hidden',
            }}>
              {(loading || activeAgentStatus.state === 'retrying') && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.72) 50%, rgba(255,255,255,0) 100%)',
                  animation: 'railSweep 1.2s linear infinite',
                }} />
              )}
            </div>
          </div>

          <div style={{
            position: 'absolute',
            top: 14,
            left: 8,
            background: 'rgba(15, 23, 42, 0.5)',
            border: `1px solid ${progressTone.border}`,
            color: 'white',
            borderRadius: 999,
            padding: '2px 7px',
            fontSize: 10,
            fontWeight: 700,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 20px rgba(15,23,42,0.14)',
          }}>
            {activeAgentStatus.state === 'error' ? '!' : activeAgentStatus.state === 'success' ? '100%' : `${progressPercent}%`}
          </div>
        </div>
      )}

      {/* Modern Chat Interface */}
        {loading && <OneAxisAirHockeyGame title="הוקי בזמן המתנה" compact allowPopup />}

        {/* Modern Chat Interface */}
      {tab === 'chat' && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(255, 255, 255, 0.02)',
          backdropFilter: 'blur(20px)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          
          <div style={{
            padding: '6px 12px',
            background: 'rgba(255, 255, 255, 0.04)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}>
            <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {(loading || localContext) && (
                <span style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.78)',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  whiteSpace: 'nowrap',
                  maxWidth: compactMode ? '58%' : 'unset',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {loading ? (activeAgentStatus.message || progressStatusLabel) : `${effectiveScopeSummary} פעיל`}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => setTab('settings')}
                style={{
                  background: 'rgba(139, 92, 246, 0.16)',
                  border: '1px solid rgba(167, 139, 250, 0.3)',
                  borderRadius: 999,
                  padding: '6px 11px',
                  cursor: 'pointer',
                  fontSize: 11,
                  color: '#DDD6FE',
                  fontWeight: 700,
                }}
              >
                ⚙️ הגדרות
              </button>
              <button
                onClick={clearConversation}
                disabled={loading}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 999,
                  padding: '6px 11px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: 11,
                  color: '#FCA5A5',
                  fontWeight: 700,
                  opacity: loading ? 0.5 : 1,
                }}
              >
                נקה
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div 
            ref={messagesRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: `
                radial-gradient(circle at 10% 90%, rgba(255, 255, 255, 0.03) 0%, transparent 50%),
                radial-gradient(circle at 90% 10%, rgba(139, 92, 246, 0.05) 0%, transparent 50%)
              `,
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255,255,255,0.2) transparent',
            }}
          >
            {reason === 'idle' && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(251, 146, 60, 0.15) 0%, rgba(251, 146, 60, 0.05) 100%)',
                border: '1px solid rgba(251, 146, 60, 0.3)',
                borderRadius: 16,
                padding: '12px 16px',
                color: '#FED7AA',
                fontSize: 13,
                fontWeight: 600,
                textAlign: 'center',
                backdropFilter: 'blur(10px)',
                animation: 'pulse 2s ease-in-out infinite',
              }}>
                💭 נראה שנתקעת רגע — אני כאן לעזור בלי להוציא אותך מקו המחשבה
              </div>
            )}

            {messages.map((msg, i) => (
              <div 
                key={i} 
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  animation: `messageSlide 0.4s ease ${i * 0.1}s both`
                }}
              >
                <div 
                  style={modernMessageBubble(msg.role === 'user', msg)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.02)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  {renderChatMessageContent(msg.content)}
                  
                  {/* Floating particles effect for user messages */}
                  {msg.role === 'user' && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      pointerEvents: 'none',
                      overflow: 'hidden',
                      borderRadius: 'inherit',
                    }}>
                      {[...Array(3)].map((_, idx) => (
                        <div
                          key={idx}
                          style={{
                            position: 'absolute',
                            width: '4px',
                            height: '4px',
                            background: 'rgba(255, 255, 255, 0.4)',
                            borderRadius: '50%',
                            top: `${20 + idx * 20}%`,
                            right: `${10 + idx * 15}%`,
                            animation: `float 3s ease-in-out ${idx * 0.5}s infinite`,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
                
                {renderReviewFindingRows(msg, 'dark')}
                {msg.documentActionMessage && (
                  <div
                    style={{
                      fontSize: 11,
                      lineHeight: 1.5,
                      marginTop: 6,
                      padding: '6px 12px',
                      borderRadius: 12,
                      color: msg.documentActionStatus === 'failed' ? '#FCA5A5' : '#BBF7D0',
                      color: msg.documentActionStatus === 'failed'
                        ? '#FCA5A5'
                        : msg.documentActionStatus === 'partial'
                          ? '#FCD34D'
                          : '#BBF7D0',
                      background: msg.documentActionStatus === 'failed'
                        ? 'rgba(127, 29, 29, 0.32)'
                        : msg.documentActionStatus === 'partial'
                          ? 'rgba(120, 53, 15, 0.28)'
                          : 'rgba(6, 78, 59, 0.24)',
                      border: msg.documentActionStatus === 'failed'
                        ? '1px solid rgba(248, 113, 113, 0.22)'
                        : msg.documentActionStatus === 'partial'
                          ? '1px solid rgba(251, 191, 36, 0.24)'
                          : '1px solid rgba(52, 211, 153, 0.22)',
                    }}
                  >
                    {msg.documentActionMessage}
                  </div>
                )}
                {renderDocumentActionCompletionButton(msg, 'dark')}

                {(msg.content || '').trim() && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => copyMessageToClipboard(msg.content)}
                      style={{ fontSize: 11, color: '#CBD5E1', background: 'rgba(148, 163, 184, 0.1)', border: '1px solid rgba(148, 163, 184, 0.22)', borderRadius: 12, padding: '4px 12px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      העתק
                    </button>
                    {msg.role === 'assistant' && !msg.error && normalizeComposerMode(msg.composerMode || '') !== 'edit' && onApplyDocumentPlan && (
                      <button
                        type="button"
                        onClick={() => applyChatMessageToDocument(msg)}
                        disabled={loading}
                        style={{ fontSize: 11, color: '#6EE7B7', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.22)', borderRadius: 12, padding: '4px 12px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.55 : 1, fontWeight: 500 }}
                      >
                        החל במיקומים
                      </button>
                    )}
                    {msg.role === 'assistant' && !msg.error && normalizeComposerMode(msg.composerMode || '') !== 'edit' && onInsert && (
                      <button
                        type="button"
                        onClick={() => onInsert(msg.content)}
                        style={{ fontSize: 11, color: '#A78BFA', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: 12, padding: '4px 12px', cursor: 'pointer', transition: 'all 0.3s ease', fontWeight: 500 }}
                      >
                        הוסף למסמך
                      </button>
                    )}
                    {msg.role === 'assistant' && !msg.error && msg.aiAppendixHtml && onAppendAiAppendix && (
                      <button
                        type="button"
                        onClick={() => onAppendAiAppendix(msg.aiAppendixHtml)}
                        style={{ fontSize: 11, color: '#FCD34D', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 12, padding: '4px 12px', cursor: 'pointer', fontWeight: 600 }}
                      >
                        📎 הוסף נספח לסוף המסמך
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', animation: 'fadeIn 0.5s ease' }}>
                <div style={{
                  ...modernMessageBubble(false),
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  width: '80%',
                  padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(15,23,42,0.6)', fontStyle: 'italic', fontSize: 13, fontWeight: 500 }}>
                    <div style={{
                      width: '18px', height: '18px', border: '2px solid rgba(139, 92, 246, 0.3)', borderTop: '2px solid #8B5CF6', borderRadius: '50%', animation: 'spin 1s linear infinite',
                    }} />
                    מסייע מחשב תשובה...
                  </div>
                  <div style={{ width: '100%', height: '10px', background: 'rgba(15,23,42,0.1)', borderRadius: '4px', animation: 'pulse 1.5s infinite 0.1s' }}></div>
                  <div style={{ width: '85%', height: '10px', background: 'rgba(15,23,42,0.1)', borderRadius: '4px', animation: 'pulse 1.5s infinite 0.3s' }}></div>
                  <div style={{ width: '65%', height: '10px', background: 'rgba(15,23,42,0.1)', borderRadius: '4px', animation: 'pulse 1.5s infinite 0.5s' }}></div>
                </div>
              </div>
            )}
          </div>

          {/* Modern Input Area */}
          <div style={{
            padding: '10px 14px',
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(20px)',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            position: 'relative',
            zIndex: 10,
          }}>
            {renderReviewVerdictChip('dark')}
            {renderComposerModelQuickPick('dark')}

            {/* חיווי הקשר */}
            {localContext && (
              <div style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.86)',
                marginBottom: 10,
                padding: '8px 12px',
                background: 'rgba(59, 130, 246, 0.12)',
                border: '1px solid rgba(59, 130, 246, 0.24)',
                borderRadius: 12,
                backdropFilter: 'blur(10px)',
              }}>
                📌 {contextScopeLabel}: "{contextPreview}"
              </div>
            )}

            {renderComposerModeToggle('modern')}
            {renderPendingMentionPill('dark')}

            {/* Input Container */}
            <div style={{ 
              display: 'flex', 
              gap: 12, 
              position: 'relative',
              alignItems: 'flex-end',
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  if (promptHistoryIndex !== -1) {
                    setPromptHistoryIndex(-1);
                    setPreNavigationDraft('');
                  }
                  setDraftInput(e.target.value);
                  updateMentionMenu(e.target.value, e.target.selectionStart ?? e.target.value.length);
                }}
                onClick={(e) => updateMentionMenu(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
                onBlur={() => setTimeout(() => closeMentionMenu(), 120)}
                onKeyDown={(e) => {
                  if (mentionMenu.open && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
                    e.preventDefault();
                    if (e.key === 'Escape') {
                      closeMentionMenu();
                      return;
                    }
                    if (e.key === 'ArrowDown') {
                      setMentionMenu((prev) => ({ ...prev, activeIndex: Math.min(prev.activeIndex + 1, prev.items.length - 1) }));
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      setMentionMenu((prev) => ({ ...prev, activeIndex: Math.max(prev.activeIndex - 1, 0) }));
                      return;
                    }
                    const choice = mentionMenu.items[mentionMenu.activeIndex] || mentionMenu.items[0];
                    if (choice) applyMentionChoice(choice);
                    return;
                  }
                  const selectionStart = e.currentTarget.selectionStart ?? 0;
                  const selectionEnd = e.currentTarget.selectionEnd ?? selectionStart;
                  const hasSelection = selectionStart !== selectionEnd;
                  const caretAtStart = selectionStart === 0 && selectionEnd === 0;
                  const caretAtEnd = selectionStart === e.currentTarget.value.length && selectionEnd === e.currentTarget.value.length;

                  if (e.key === 'ArrowUp') {
                    if (!hasSelection && caretAtStart) {
                      const moved = navigatePromptHistory('up');
                      if (moved) {
                        e.preventDefault();
                        return;
                      }
                    }
                  }
                  if (e.key === 'ArrowDown') {
                    const canNavigateDown = !hasSelection && (promptHistoryIndex !== -1 || caretAtEnd);
                    if (canNavigateDown) {
                      const moved = navigatePromptHistory('down');
                      if (moved) {
                        e.preventDefault();
                        return;
                      }
                    }
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={composerPlaceholder}
                style={{
                  flex: 1,
                  resize: 'none',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 16,
                  padding: '14px 18px',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  outline: 'none',
                  minHeight: 56,
                  maxHeight: 120,
                  direction: 'rtl',
                  background: 'rgba(255, 255, 255, 0.08)',
                  backdropFilter: 'blur(15px)',
                  color: 'white',
                  transition: 'all 0.3s ease',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)';
                }}
                onBlur={(e) => {
                  const inputEl = e.currentTarget;
                  setTimeout(() => {
                    if (inputEl?.isConnected) {
                      inputEl.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                      inputEl.style.boxShadow = 'none';
                    }
                    closeMentionMenu();
                  }, 120);
                }}
              />

              {/* Mention Menu */}
              {mentionMenu.open && (
                <div style={{
                  position: 'absolute',
                  right: 0,
                  left: 72,
                  bottom: 72,
                  background: 'rgba(15, 23, 42, 0.95)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 16,
                  boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                  overflow: 'hidden',
                  zIndex: 50,
                  animation: 'slideUp 0.2s ease',
                }}>
                  <div style={{
                    padding: '12px 16px',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.8)',
                    background: 'rgba(139, 92, 246, 0.2)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                  }}>
                    ⚡ סקילים זמינים
                  </div>
                  {mentionMenu.items.map((item, index) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyMentionChoice(item);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'right',
                        border: 'none',
                        borderTop: index === 0 ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: index === mentionMenu.activeIndex 
                          ? 'rgba(139, 92, 246, 0.2)' 
                          : 'transparent',
                        padding: '12px 16px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (index !== mentionMenu.activeIndex) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (index !== mentionMenu.activeIndex) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      <div style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'white',
                        marginBottom: 4,
                      }}>
                        /{item.id}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                        {item.description}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Send Button */}
              <button 
                onClick={() => send()} 
                disabled={!canSendCurrentInput}
                style={{
                  width: 56,
                  height: 56,
                  flexShrink: 0,
                  background: canSendCurrentInput
                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    : 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 16,
                  cursor: canSendCurrentInput ? 'pointer' : 'default',
                  fontSize: 20,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: canSendCurrentInput
                    ? '0 8px 25px rgba(102, 126, 234, 0.3)'
                    : 'none',
                }}
                onMouseEnter={(e) => {
                  if (canSendCurrentInput) {
                    e.currentTarget.style.transform = 'scale(1.05) translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 12px 35px rgba(102, 126, 234, 0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1) translateY(0)';
                  e.currentTarget.style.boxShadow = canSendCurrentInput
                    ? '0 8px 25px rgba(102, 126, 234, 0.3)'
                    : 'none';
                }}
              >
                {loading ? (
                  <div style={{
                    width: '20px',
                    height: '20px',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderTop: '2px solid white',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
                ) : (
                  '🚀'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'history' && renderChatHistoryPanel('dark')}

      {/* לשונית הגדרות לשיחה */}
      {tab === 'settings' && (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          background: `
            radial-gradient(circle at 15% 15%, rgba(99, 102, 241, 0.08) 0%, transparent 45%),
            radial-gradient(circle at 85% 10%, rgba(16, 185, 129, 0.07) 0%, transparent 40%),
            rgba(255, 255, 255, 0.02)
          `,
          backdropFilter: 'blur(20px)',
        }}>
          <div style={controlCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginBottom: 4 }}>
                  ⚙️ הגדרות שיחה
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.6 }}>
                  כל בחירות ההפעלה מרוכזות כאן כדי שהצ׳אט עצמו יישאר כמו כלי כתיבה: קל, שקט, ועם פחות כרום מעל הטקסט.
                </div>
                <div style={{ fontSize: 11, color: isSettingsLocked ? '#FDE68A' : 'rgba(255,255,255,0.58)', lineHeight: 1.6, marginTop: 8 }}>
                  {isSettingsLocked ? 'ההגדרות נעולות בזמן שהבקשה רצה כדי למנוע drift בין הבחירה שעל המסך לבקשה הפעילה.' : 'הבחירות כאן נשמרות בין שליחות. @agent ו-/skill נשארים זמניים רק לטיוטה או לשליחה הנוכחית.'}
                </div>
              </div>
              <button
                onClick={() => setTab('chat')}
                style={{
                  background: 'rgba(139, 92, 246, 0.16)',
                  border: '1px solid rgba(167, 139, 250, 0.3)',
                  borderRadius: 999,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: '#E9D5FF',
                  fontWeight: 600,
                }}
              >
                💬 חזרה לצ׳אט
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              {chatStatusPills.map((pill) => (
                <span
                  key={pill.id}
                  style={{
                    fontSize: 11,
                    background: pill.background,
                    color: pill.color,
                    padding: '5px 10px',
                    borderRadius: 999,
                    fontWeight: 600,
                    border: `1px solid ${pill.border}`,
                  }}
                >
                  {pill.label} · {pill.value}
                </span>
              ))}
            </div>

            {resolvedSkillLabel && (
              <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.62)', lineHeight: 1.5 }}>
                סקיל אחרון שנפתר בזמן ריצה: {resolvedSkillLabel}
              </div>
            )}
          </div>

          <div style={controlCardStyle}>
            <div style={controlLabelStyle}>🛰️ ספק לשיחה</div>
            <div style={controlHelperStyle}>
              כאן מגדירים override מקומי ל-sidebar בלבד. בחירת ברירת מחדל נשענת על ההגדרות הכלליות שלך.
            </div>
            <select
              value={selectedProviderId || 'default'}
              onChange={(e) => {
                clearPendingMentionSelection();
                setSelectedProviderId(e.target.value);
                setSelectedAgentId('');
              }}
              disabled={isSettingsLocked || forceGlobalSidebarProvider}
              style={{ ...controlSelectStyle, ...(isSettingsLocked || forceGlobalSidebarProvider ? { opacity: 0.56, cursor: 'not-allowed', boxShadow: 'none' } : {}) }}
            >
              <option value="default" style={{ color: '#1F2937' }}>
                ברירת המחדל מההגדרות
              </option>
              {configuredProviderChoices.map((provider) => (
                <option key={provider.id} value={provider.id} style={{ color: '#1F2937' }}>
                  {provider.label}{provider.isDefault ? ' · ברירת מחדל' : ''}
                </option>
              ))}
            </select>
            {activeProviderChoice ? (
              <>
                <div style={{ ...controlLabelStyle, marginTop: 12 }}>🧠 מודל למסך הזה</div>
                <div style={controlHelperStyle}>
                  המודל הזה גובר רק בתוך ה-sidebar. אם חוזרים ל-`ברירת המחדל`, גם המודל יחזור להילקח מההגדרות הכלליות בלי override.
                </div>
                <select
                  value={resolvedSelectedProviderModel}
                  onChange={(e) => {
                    clearPendingMentionSelection();
                    setSelectedProviderModel(e.target.value);
                  }}
                  disabled={isSettingsLocked || forceGlobalSidebarProvider || !providerModelChoices.length}
                  style={{ ...controlSelectStyle, ...(isSettingsLocked || forceGlobalSidebarProvider ? { opacity: 0.56, cursor: 'not-allowed', boxShadow: 'none' } : {}) }}
                >
                  {providerModelChoices.map((modelId) => (
                    <option key={modelId} value={modelId} style={{ color: '#1F2937' }}>
                      {modelId}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <div style={{ ...controlHelperStyle, marginTop: 10 }}>
                במצב `ברירת המחדל` לא נשלח override של מודל, והמסך משתמש במודל שהוגדר לספק הפעיל בהגדרות.
              </div>
            )}
          </div>

          <div style={controlCardStyle}>
            <div style={controlLabelStyle}>🔁 מספר קריאות רצופות</div>
            <div style={controlHelperStyle}>
              אפשר להגדיר כמה קריאות מודל יישלחו לכל בקשה במסך הזה (2-6). במצב עריכה הקריאות הראשונות משמשות לבדיקה פנימית, והקריאה האחרונה מבצעת עריכה אוטומטית במסמך.
            </div>
            <select
              value={configuredSplitCallCount || 0}
              onChange={(e) => {
                const nextValue = clampSplitCallCount(Number(e.target.value) || 0);
                setConfiguredSplitCallCount(nextValue);
              }}
              disabled={isSettingsLocked}
              style={{ ...controlSelectStyle, ...lockedControlStyle }}
            >
              <option value={0} style={{ color: '#1F2937' }}>
                קריאה אחת (ללא פיצול)
              </option>
              {Array.from({ length: MAX_SPLIT_CALL_COUNT - 1 }, (_, index) => index + 2).map((count) => (
                <option key={count} value={count} style={{ color: '#1F2937' }}>
                  {count} קריאות רצופות
                </option>
              ))}
            </select>
            <div style={{ ...controlHelperStyle, marginTop: 8 }}>
              טיפ: אפשר לעקוף זמנית מהקלט עצמו עם נוסח כמו "פצל ל-3 קריאות".
            </div>
          </div>

          <div style={controlCardStyle}>
            <div style={controlLabelStyle}>🧬 לולאת האנשה (anti-AI)</div>
            <div style={controlHelperStyle}>
              אחרי האנשה, הטקסט נמדד מול הגלאי המקומי ומשוכתב שוב ושוב עד שהציון ("נשמע גנרי/מכונה") יורד מתחת ליעד. ככל שהיעד נמוך — אנושי יותר, אך יותר קריאות מודל.
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, ...controlHelperStyle, marginTop: 4, cursor: isSettingsLocked ? 'not-allowed' : 'pointer' }}>
              <input
                type="checkbox"
                checked={humanizerPrefs.enabled}
                disabled={isSettingsLocked}
                onChange={(e) => updateHumanizerPrefs({ enabled: e.target.checked })}
              />
              הפעל לולאת האנשה יריבה
            </label>
            <div style={{ ...controlHelperStyle, marginTop: 10, display: 'flex', justifyContent: 'space-between' }}>
              <span>יעד ציון: {humanizerPrefs.target}</span>
              <span>{humanizerPrefs.target <= 25 ? 'אגרסיבי' : humanizerPrefs.target <= 40 ? 'מאוזן' : 'עדין'}</span>
            </div>
            <input
              type="range"
              min={10}
              max={60}
              step={5}
              value={humanizerPrefs.target}
              disabled={isSettingsLocked || !humanizerPrefs.enabled}
              onChange={(e) => updateHumanizerPrefs({ target: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
            <div style={{ ...controlHelperStyle, marginTop: 10 }}>מקס' סבבי שכתוב</div>
            <select
              value={humanizerPrefs.maxPasses}
              disabled={isSettingsLocked || !humanizerPrefs.enabled}
              onChange={(e) => updateHumanizerPrefs({ maxPasses: Number(e.target.value) })}
              style={{ ...controlSelectStyle, ...lockedControlStyle }}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n} style={{ color: '#1F2937' }}>{n} סבבים</option>
              ))}
            </select>
          </div>

          <div style={controlCardStyle}>
            <div style={controlLabelStyle}>⚙️ סקיל פעיל</div>
            <div style={controlHelperStyle}>
              {isEditComposerMode
                ? 'במצב עריכה אין סקיל קבוע כברירת מחדל. רק `/skill` מפורש בתחילת הבקשה יופעל לשליחה הנוכחית.'
                : 'אפשר להשאיר בחירה אוטומטית, לקבע סקיל ידני, או לזמן זמנית מתוך הקלט עם `/skill`.'}
            </div>
            <select
              value={isEditComposerMode ? 'none' : selectedSkillId}
              onChange={(e) => {
                clearPendingMentionSelection();
                setSelectedSkillId(e.target.value);
              }}
              disabled={isSettingsLocked || isEditComposerMode}
              style={{ ...controlSelectStyle, ...lockedControlStyle }}
            >
              <option value="none" style={{ color: '#1F2937' }}>
                בחירה אוטומטית לפי ההגדרות
              </option>
              {skillCatalog.map((skill) => {
                const mode = skillsConfig.skills?.[skill.id]?.mode || 'manual';
                return (
                  <option key={skill.id} value={skill.id} disabled={mode === 'off'} style={{ color: '#1F2937' }}>
                    {skill.label}{mode === 'auto' ? ' · אוטומטי' : mode === 'off' ? ' · כבוי' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div style={controlCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: showQuickPrompts ? 10 : 0 }}>
              <div>
                <div style={controlLabelStyle}>✨ הצעות מהירות</div>
                <div style={{ ...controlHelperStyle, marginBottom: 0 }}>
                  נשארות מחוץ לשדה ההקלדה עד שצריך אותן, כדי לשמור על זרימת כתיבה נקייה.
                </div>
              </div>
              <button
                onClick={() => setShowQuickPrompts((prev) => !prev)}
                disabled={isSettingsLocked}
                style={{
                  background: showQuickPrompts ? 'rgba(139, 92, 246, 0.18)' : 'rgba(255, 255, 255, 0.08)',
                  border: showQuickPrompts ? '1px solid rgba(167, 139, 250, 0.32)' : '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 999,
                  padding: '8px 14px',
                  cursor: isSettingsLocked ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  color: showQuickPrompts ? '#E9D5FF' : 'rgba(255,255,255,0.86)',
                  fontWeight: 600,
                  opacity: isSettingsLocked ? 0.56 : 1,
                }}
              >
                {showQuickPrompts ? 'הסתר הצעות' : 'הצג הצעות'}
              </button>
            </div>

            {showQuickPrompts && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {quickPromptList.map((prompt, index) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      setDraftInput(prompt);
                      setTab('chat');
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                    disabled={isSettingsLocked}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: 16,
                      padding: '9px 12px',
                      cursor: isSettingsLocked ? 'not-allowed' : 'pointer',
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.9)',
                      fontWeight: 500,
                      transition: 'all 0.3s ease',
                      animation: `slideIn 0.25s ease ${index * 0.05}s both`,
                      opacity: isSettingsLocked ? 0.56 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (isSettingsLocked) return;
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.14)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      if (isSettingsLocked) return;
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.56)', lineHeight: 1.6 }}>
              Enter לשליחה, Shift+Enter לשורה חדשה, ו-/ לסקילים בלי לפגוע בזיכרון השיחה או ב-persistence.
            </div>
          </div>
        </div>
      )}

      {/* Modern Actions Tab with Enhanced Categories */}
      {tab === 'actions' && (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          background: `
            radial-gradient(circle at 20% 80%, rgba(139, 92, 246, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(59, 130, 246, 0.06) 0%, transparent 50%),
            rgba(255, 255, 255, 0.02)
          `,
          backdropFilter: 'blur(20px)',
        }}>
          
          {/* Context Status with Enhanced Design */}
          <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(15px)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '12px 16px',
          }}>
            {localContext ? (
              <div style={{
                fontSize: 12,
                color: '#86EFAC',
                padding: '10px 16px',
                background: 'rgba(34, 197, 94, 0.15)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: 16,
                backdropFilter: 'blur(10px)',
                textAlign: 'center',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}>
                <div style={{
                  width: 8,
                  height: 8,
                  background: '#22C55E',
                  borderRadius: '50%',
                  animation: 'pulse 2s ease-in-out infinite',
                }} />
                ✨ הסוכן מחובר להקשר הכתיבה הנוכחי שלך
              </div>
            ) : (
              <div style={{
                fontSize: 12,
                color: '#FDE047',
                padding: '10px 16px',
                background: 'rgba(234, 179, 8, 0.15)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderRadius: 16,
                backdropFilter: 'blur(10px)',
                textAlign: 'center',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}>
                <div style={{
                  width: 8,
                  height: 8,
                  background: '#FBBF24',
                  borderRadius: '50%',
                  animation: 'pulse 2s ease-in-out infinite',
                }} />
                💡 מקם את הסמן בפסקה או בחר טקסט לעזרה מדויקת יותר
              </div>
            )}
          </div>

          <div style={{ padding: '16px' }}>
            {/* Grouped Actions by Category */}
            {Object.entries(
              MODERN_QUICK_ACTIONS.reduce((groups, action) => {
                const category = action.category || 'other';
                if (!groups[category]) groups[category] = [];
                groups[category].push(action);
                return groups;
              }, {})
            ).map(([categoryKey, actions], categoryIndex) => {
              const categoryConfig = ACTION_CATEGORIES[categoryKey];
              if (!categoryConfig || !actions.length) return null;
              
              return (
                <div key={categoryKey} style={{
                  marginBottom: 32,
                  animation: `slideIn 0.6s ease ${categoryIndex * 0.2}s both`,
                }}>
                  {/* Category Header */}
                  <div style={{
                    marginBottom: 16,
                    padding: '16px 20px',
                    background: categoryConfig.gradient,
                    border: `1px solid ${categoryConfig.borderColor}`,
                    borderRadius: 20,
                    backdropFilter: 'blur(15px)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}>
                    {/* Animated background pattern */}
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: `
                        radial-gradient(circle at 10% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
                        radial-gradient(circle at 90% 80%, rgba(255, 255, 255, 0.05) 0%, transparent 50%)
                      `,
                      animation: 'float 8s ease-in-out infinite',
                      pointerEvents: 'none',
                    }} />
                    
                    <div style={{
                      position: 'relative',
                      zIndex: 2,
                    }}>
                      <h3 style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: 'white',
                        marginBottom: 4,
                        textShadow: '0 2px 4px rgba(0,0,0,0.2)',
                      }}>
                        {categoryConfig.title}
                      </h3>
                      <p style={{
                        fontSize: 13,
                        color: 'rgba(255, 255, 255, 0.9)',
                        margin: 0,
                        fontWeight: 500,
                      }}>
                        {categoryConfig.subtitle}
                      </p>
                    </div>
                  </div>
                  
                  {/* Actions Grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 16,
                  }}>
                    {actions.map((action, index) => (
                      <button 
                        key={action.id}
                        onClick={() => runAction(action)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 12,
                          padding: '20px 16px',
                          border: 'none',
                          borderRadius: 20,
                          cursor: 'pointer',
                          background: action.color,
                          backdropFilter: 'blur(15px)',
                          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'white',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          animation: `slideIn 0.5s ease ${(categoryIndex * 0.3) + (index * 0.1)}s both`,
                          position: 'relative',
                          overflow: 'hidden',
                          textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                          boxShadow: '0 8px 25px rgba(0, 0, 0, 0.1)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.05) translateY(-6px) rotateY(5deg)';
                          e.currentTarget.style.background = action.hoverColor || action.color;
                          e.currentTarget.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.2)';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1) translateY(0) rotateY(0deg)';
                          e.currentTarget.style.background = action.color;
                          e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.1)';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                        }}
                      >
                        {/* Shimmer effect */}
                        <div style={{
                          position: 'absolute',
                          top: '-50%',
                          left: '-50%',
                          width: '200%',
                          height: '200%',
                          background: 'linear-gradient(45deg, transparent, rgba(255, 255, 255, 0.1), transparent)',
                          transform: 'translateX(-100%)',
                          transition: 'transform 0.6s ease',
                          animation: 'shimmer 3s ease-in-out infinite',
                          pointerEvents: 'none',
                        }} />
                        
                        <div style={{
                          fontSize: 28,
                          marginBottom: 4,
                          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
                        }}>
                          {action.icon}
                        </div>
                        <span style={{
                          textAlign: 'center',
                          lineHeight: 1.3,
                          fontWeight: 700,
                          fontSize: 14,
                        }}>
                          {action.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Content Generation Section */}
            <div style={{
              marginTop: 32,
              animation: 'slideIn 0.6s ease 1.2s both',
            }}>
              <div style={{
                marginBottom: 16,
                padding: '16px 20px',
                background: ACTION_CATEGORIES.generate.gradient,
                border: `1px solid ${ACTION_CATEGORIES.generate.borderColor}`,
                borderRadius: 20,
                backdropFilter: 'blur(15px)',
                position: 'relative',
                overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: `
                    radial-gradient(circle at 15% 25%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
                    radial-gradient(circle at 85% 75%, rgba(255, 255, 255, 0.05) 0%, transparent 50%)
                  `,
                  animation: 'float 10s ease-in-out infinite',
                  pointerEvents: 'none',
                }} />
                
                <div style={{ position: 'relative', zIndex: 2 }}>
                  <h3 style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'white',
                    marginBottom: 4,
                    textShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  }}>
                    {ACTION_CATEGORIES.generate.title}
                  </h3>
                  <p style={{
                    fontSize: 13,
                    color: 'rgba(255, 255, 255, 0.9)',
                    margin: 0,
                    fontWeight: 500,
                  }}>
                    {ACTION_CATEGORIES.generate.subtitle}
                  </p>
                </div>
              </div>
              
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 16,
              }}>
                {QUICK_PROMPTS.map((prompt, index) => (
                  <button 
                    key={index}
                    onClick={() => {
                      setTab('chat');
                      setInput(prompt.text);
                      setTimeout(() => {
                        if (inputRef.current) {
                          inputRef.current.focus();
                          inputRef.current.setSelectionRange(prompt.text.length, prompt.text.length);
                        }
                      }, 50);
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 12,
                      padding: '20px 16px',
                      border: 'none',
                      borderRadius: 20,
                      cursor: 'pointer',
                      background: prompt.color,
                      backdropFilter: 'blur(15px)',
                      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'white',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      animation: `slideIn 0.5s ease ${1.4 + (index * 0.1)}s both`,
                      position: 'relative',
                      overflow: 'hidden',
                      textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                      boxShadow: '0 8px 25px rgba(0, 0, 0, 0.1)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05) translateY(-6px)';
                      e.currentTarget.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.2)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1) translateY(0)';
                      e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                    }}
                  >
                    <div style={{
                      fontSize: 24,
                      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
                    }}>
                      {prompt.icon}
                    </div>
                    <span style={{
                      textAlign: 'center',
                      lineHeight: 1.3,
                      fontWeight: 700,
                    }}>
                      {prompt.text.replace(/🚀|🎯|🏁|📚|💡|🔍/g, '')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modern Agents Tab */}
      {tab === 'agents' && (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          background: `
            radial-gradient(circle at 30% 70%, rgba(99, 102, 241, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 70% 30%, rgba(139, 92, 246, 0.06) 0%, transparent 50%),
            rgba(255, 255, 255, 0.02)
          `,
          backdropFilter: 'blur(20px)',
        }}>
          
          {/* Header */}
          <div style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.8)',
            marginBottom: 16,
            textAlign: 'center',
            padding: '12px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: 12,
            backdropFilter: 'blur(10px)',
          }}>
            🤖 סוכנים מותאמים אישית לפי תפקידים שהוגדרו במסך ההגדרות
          </div>

          {/* Task Input */}
          <div style={{
            marginBottom: 20,
            padding: '16px',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: 16,
            backdropFilter: 'blur(15px)',
          }}>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#93C5FD',
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              🎯 מה תרצה שהסוכן יבצע?
            </div>
            <div style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.8)',
              marginBottom: 12,
              lineHeight: 1.5,
            }}>
              {workspaceAutomationEnabled
                ? 'כתוב משימה חופשית, ואז לחץ על אחד הסוכנים למטה כדי שיבצע אותה בהקשר של המסמך.'
                : 'סביבת העבודה כבויה כרגע. כדי להריץ סוכן ייעודי, הפעל אותה מחדש מהצ׳קבוקס במסך הצ׳אט.'}
            </div>
            <textarea
              value={agentTaskInput}
              onChange={(e) => setAgentTaskInput(e.target.value)}
              placeholder="💬 למשל: תעבור על הטקסט ותבנה לי גרסה מקצועית וקצרה יותר..."
              disabled={!workspaceAutomationEnabled}
              style={{
                width: '100%',
                minHeight: 80,
                resize: 'vertical',
                border: '1px solid rgba(147, 197, 253, 0.3)',
                borderRadius: 12,
                padding: '12px 16px',
                fontSize: 13,
                fontFamily: 'inherit',
                direction: 'rtl',
                outline: 'none',
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(10px)',
                color: 'white',
                boxSizing: 'border-box',
                transition: 'all 0.3s ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(147, 197, 253, 0.3)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* Agents Grid */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            {roleAgents.map((agent, index) => (
              <button
                key={agent.id}
                onClick={() => runRoleAgent(agent)}
                disabled={!workspaceAutomationEnabled}
                style={{
                  textAlign: 'right',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  backdropFilter: 'blur(15px)',
                  borderRadius: 16,
                  padding: '16px',
                  cursor: 'pointer',
                  boxShadow: '0 8px 25px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  animation: `slideIn 0.4s ease ${index * 0.1}s both`,
                  position: 'relative',
                  overflow: 'hidden',
                  opacity: workspaceAutomationEnabled ? 1 : 0.55,
                  cursor: workspaceAutomationEnabled ? 'pointer' : 'not-allowed',
                }}
                onMouseEnter={(e) => {
                  if (!workspaceAutomationEnabled) return;
                  e.currentTarget.style.transform = 'scale(1.02) translateY(-4px)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                  e.currentTarget.style.boxShadow = '0 15px 35px rgba(0, 0, 0, 0.2)';
                }}
                onMouseLeave={(e) => {
                  if (!workspaceAutomationEnabled) return;
                  e.currentTarget.style.transform = 'scale(1) translateY(0)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                  e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.1)';
                }}
              >
                {/* Agent Header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 8,
                }}>
                  <div style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}>
                    🤖 {agent.name}
                  </div>
                  
                  <span style={{
                    fontSize: 11,
                    borderRadius: 20,
                    padding: '4px 12px',
                    fontWeight: 600,
                    background: 
                      agentProgressMap[agent.id]?.state === 'error' ? 'rgba(239, 68, 68, 0.2)' :
                      agentProgressMap[agent.id]?.state === 'success' ? 'rgba(34, 197, 94, 0.2)' :
                      agentProgressMap[agent.id]?.state === 'running' || agentProgressMap[agent.id]?.state === 'retrying' ? 'rgba(59, 130, 246, 0.2)' :
                      'rgba(255, 255, 255, 0.1)',
                    color:
                      agentProgressMap[agent.id]?.state === 'error' ? '#FCA5A5' :
                      agentProgressMap[agent.id]?.state === 'success' ? '#86EFAC' :
                      agentProgressMap[agent.id]?.state === 'running' || agentProgressMap[agent.id]?.state === 'retrying' ? '#93C5FD' :
                      'rgba(255,255,255,0.8)',
                    border: '1px solid ' + (
                      agentProgressMap[agent.id]?.state === 'error' ? 'rgba(239, 68, 68, 0.3)' :
                      agentProgressMap[agent.id]?.state === 'success' ? 'rgba(34, 197, 94, 0.3)' :
                      agentProgressMap[agent.id]?.state === 'running' || agentProgressMap[agent.id]?.state === 'retrying' ? 'rgba(59, 130, 246, 0.3)' :
                      'rgba(255, 255, 255, 0.2)'
                    )
                  }}>
                    {agentProgressMap[agent.id]?.state === 'running' ? '⚡ עובד' :
                     agentProgressMap[agent.id]?.state === 'retrying' ? '🔄 מנסה שוב' :
                     agentProgressMap[agent.id]?.state === 'success' ? '✅ הושלם' :
                     agentProgressMap[agent.id]?.state === 'error' ? '❌ שגיאה' :
                     '💤 מוכן'}
                  </span>
                </div>

                {/* Agent Description */}
                <div style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.8)',
                  lineHeight: 1.6,
                  marginBottom: agentTaskInput.trim() ? 12 : 0,
                }}>
                  {agent.prompt.slice(0, 120)}{agent.prompt.length > 120 ? '...' : ''}
                </div>

                {/* Task Preview */}
                {agentTaskInput.trim() && (
                  <div style={{
                    marginTop: 12,
                    fontSize: 11,
                    color: '#93C5FD',
                    background: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: 12,
                    padding: '8px 12px',
                    backdropFilter: 'blur(10px)',
                    lineHeight: 1.4,
                  }}>
                    🎯 {agentTaskInput.slice(0, 60)}{agentTaskInput.length > 60 ? '...' : ''}
                  </div>
                )}

                {/* Progress Bar for Running Agent */}
                {agentProgressMap[agent.id]?.state === 'running' && (
                  <div style={{
                    marginTop: 8,
                    height: 4,
                    background: 'rgba(59, 130, 246, 0.2)',
                    borderRadius: 20,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${agentProgressMap[agent.id]?.progress || 0}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #3B82F6, #93C5FD)',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* No Agents Message */}
          {!roleAgents.length && (
            <div style={{
              textAlign: 'center',
              color: 'rgba(255,255,255,0.6)',
              fontSize: 13,
              padding: '24px',
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: 16,
              border: '1px dashed rgba(255, 255, 255, 0.2)',
            }}>
              🤖 אין סוכנים מוגדרים כרגע<br/>
              <span style={{ fontSize: 12 }}>
                עבור למסך ההגדרות כדי להוסיף סוכנים חדשים
              </span>
            </div>
          )}

          {/* Debug Log Panel */}
          {tab === 'agents' && (
            <div style={{
              marginTop: 24,
              background: 'rgba(15, 23, 42, 0.6)',
              backdropFilter: 'blur(15px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 16,
              overflow: 'hidden',
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              }}>
                <button
                  onClick={() => setShowLogs(!showLogs)}
                  style={{ 
                    border: 'none', 
                    background: 'none', 
                    padding: 0, 
                    cursor: 'pointer', 
                    color: 'white', 
                    fontSize: 13, 
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  🪵 יומן פעילות סוכנים 
                  <span style={{
                    transform: showLogs ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.3s ease',
                    fontSize: 16,
                  }}>
                    ▾
                  </span>
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button 
                    onClick={copyLogsToClipboard} 
                    style={{ 
                      border: '1px solid rgba(59, 130, 246, 0.5)', 
                      background: 'rgba(59, 130, 246, 0.1)', 
                      borderRadius: 20, 
                      padding: '6px 12px', 
                      cursor: 'pointer', 
                      fontSize: 11,
                      color: '#93C5FD',
                      fontWeight: 600,
                      transition: 'all 0.3s ease',
                    }}
                  >
                    📋 העתק
                  </button>
                  <button 
                    onClick={clearLogs} 
                    style={{ 
                      border: '1px solid rgba(239, 68, 68, 0.5)', 
                      background: 'rgba(239, 68, 68, 0.1)', 
                      borderRadius: 20, 
                      padding: '6px 12px', 
                      cursor: 'pointer', 
                      fontSize: 11,
                      color: '#FCA5A5',
                      fontWeight: 600,
                      transition: 'all 0.3s ease',
                    }}
                  >
                    🗑️ נקה
                  </button>
                </div>
              </div>

              {showLogs && (
                <div style={{ 
                  padding: '16px', 
                  maxHeight: 200, 
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}>
                  {debugLogs.length ? debugLogs.map((log) => (
                    <div 
                      key={log.id} 
                      style={{ 
                        border: '1px solid rgba(255, 255, 255, 0.1)', 
                        borderRadius: 12, 
                        padding: '12px', 
                        background: log.state === 'error' 
                          ? 'rgba(239, 68, 68, 0.1)' 
                          : log.state === 'success' 
                          ? 'rgba(34, 197, 94, 0.1)' 
                          : 'rgba(255, 255, 255, 0.02)',
                        fontSize: 12,
                        lineHeight: 1.4,
                      }}
                    >
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        marginBottom: 6,
                        fontSize: 11,
                      }}>
                        <span style={{ fontWeight: 700, color: 'white' }}>{getLogAgentTitle(log)}</span>
                        <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                          {formatLogTime(log.ts)}
                        </span>
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.9)', marginBottom: 6 }}>
                        {log.message || 'ללא הודעה'}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>
                        {[
                          log.provider ? `מנוע: ${log.provider}` : '',
                          log.model ? `מודל: ${log.model}` : '',
                          log.workspaceName ? `סביבה: ${log.workspaceName}` : '',
                          log.attempt ? `ניסיון ${log.attempt}` : '',
                          log.errorMessage ? `שגיאה: ${log.errorMessage}` : '',
                          log.runId ? `הרצה ${String(log.runId).slice(0, 8)}` : '',
                        ].filter(Boolean).join(' • ')}
                      </div>
                    </div>
                  )) : (
                    <div style={{ 
                      fontSize: 12, 
                      color: 'rgba(255,255,255,0.6)', 
                      textAlign: 'center',
                      padding: '16px',
                    }}>
                      📝 עדיין אין אירועים ביומן הפעילות
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Logs Tab */}
      {tab === 'logs' && (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          background: 'linear-gradient(160deg, #f8fbff 0%, #eef4ff 100%)',
        }}>
          {/* Logs Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            paddingBottom: '12px',
            borderBottom: '1px solid #dbe7ff',
          }}>
            <div>
              <div style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#0f172a',
                marginBottom: '4px',
              }}>
                📊 יומן פעילות סוכנים
              </div>
              <div style={{
                fontSize: '11px',
                color: '#475569',
              }}>
                {debugLogs.length} אירועים
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={copyLogsToClipboard} 
                style={{ 
                  border: '1px solid #c7d2fe', 
                  background: '#eef2ff', 
                  borderRadius: '20px', 
                  padding: '8px 14px', 
                  cursor: 'pointer', 
                  fontSize: '12px',
                  color: '#3730a3',
                  fontWeight: 600,
                  transition: 'all 0.3s ease',
                  boxShadow: '0 2px 8px rgba(55, 48, 163, 0.12)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#e0e7ff';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#eef2ff';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                📋 העתק הכל
              </button>
              <button 
                onClick={clearLogs} 
                style={{ 
                  border: '1px solid #fecdd3', 
                  background: '#fff1f2', 
                  borderRadius: '20px', 
                  padding: '8px 14px', 
                  cursor: 'pointer', 
                  fontSize: '12px',
                  color: '#9f1239',
                  fontWeight: 600,
                  transition: 'all 0.3s ease',
                  boxShadow: '0 2px 8px rgba(159, 18, 57, 0.08)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#ffe4e6';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#fff1f2';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                🗑️ נקה הכל
              </button>
            </div>
          </div>

          {/* Logs List with Premium Styling */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {debugLogs.length ? debugLogs.map((log) => (
              <div 
                key={log.id} 
                style={{ 
                  border: '1px solid #dbe4ff', 
                  borderRadius: '16px', 
                  padding: '14px 16px', 
                  background: log.state === 'error' 
                    ? '#fff1f2' 
                    : log.state === 'success' 
                    ? '#f0fdf4' 
                    : log.state === 'running'
                    ? '#eff6ff'
                    : '#f8fafc',
                  fontSize: '12px',
                  lineHeight: '1.6',
                  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = log.state === 'error' 
                    ? '#ffe4e6' 
                    : log.state === 'success' 
                    ? '#dcfce7' 
                    : log.state === 'running'
                    ? '#dbeafe'
                    : '#f1f5f9';
                  e.currentTarget.style.transform = 'translateX(-4px)';
                  e.currentTarget.style.borderColor = '#c7d2fe';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = log.state === 'error' 
                    ? '#fff1f2' 
                    : log.state === 'success' 
                    ? '#f0fdf4' 
                    : log.state === 'running'
                    ? '#eff6ff'
                    : '#f8fafc';
                  e.currentTarget.style.transform = 'translateX(0)';
                  e.currentTarget.style.borderColor = '#dbe4ff';
                }}
              >
                {/* Log Status Icon and Label */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontSize: '20px',
                      filter: log.state === 'error' ? 'brightness(1.3)' : 'brightness(1)',
                    }}>
                      {log.state === 'error' ? '❌' : log.state === 'success' ? '✅' : log.state === 'running' ? '⏳' : '📌'}
                    </span>
                    <div>
                      <div style={{ 
                        fontWeight: 700, 
                        color: '#0f172a',
                        fontSize: '13px',
                      }}>
                        {getLogAgentTitle(log)}
                      </div>
                      <div style={{ 
                        fontSize: '10px',
                        color: '#64748b',
                      }}>
                        {formatLogTime(log.ts)}
                      </div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '11px',
                    background: log.state === 'error' 
                      ? '#ffe4e6' 
                      : log.state === 'success' 
                      ? '#dcfce7' 
                      : log.state === 'running'
                      ? '#dbeafe'
                      : '#e2e8f0',
                    color: log.state === 'error' 
                      ? '#9f1239' 
                      : log.state === 'success' 
                      ? '#166534' 
                      : log.state === 'running'
                      ? '#1d4ed8'
                      : '#334155',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                  }}>
                    {log.state === 'error' ? 'שגיאה' : log.state === 'success' ? 'הצלחה' : log.state === 'running' ? 'בעדכון' : 'לא ידוע'}
                  </span>
                </div>

                {/* Log Message */}
                <div style={{ 
                  color: '#1e293b',
                  marginBottom: '8px',
                  paddingRight: '28px',
                  fontSize: '12px',
                  lineHeight: '1.5',
                }}>
                  {log.message || 'ללא הודעה'}
                </div>

                {/* Log Details */}
                {(log.provider || log.model || log.attempt || log.errorMessage || log.runId) && (
                  <div style={{ 
                    fontSize: '10px', 
                    color: '#475569',
                    paddingTop: '8px',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}>
                    {log.provider && <span>🔌 <strong>{log.provider}</strong></span>}
                    {log.model && <span>🤖 <strong>{log.model}</strong></span>}
                    {log.workspaceName && <span>🏢 {log.workspaceName}</span>}
                    {log.attempt && <span>🔄 ניסיון <strong>{log.attempt}</strong></span>}
                    {log.errorMessage && <span>⚠️ {log.errorMessage}</span>}
                    {log.runId && <span>📌 {String(log.runId).slice(0, 8)}</span>}
                  </div>
                )}
              </div>
            )) : (
              <div style={{ 
                fontSize: '13px', 
                color: '#475569', 
                textAlign: 'center',
                padding: '40px 16px',
                background: '#f8fafc',
                borderRadius: '16px',
                border: '1px dashed #c7d2fe',
              }}>
                📝 עדיין אין אירועים ביומן הפעילות
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}


