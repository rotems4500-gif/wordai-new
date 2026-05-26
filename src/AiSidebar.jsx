import React, { useState, useRef, useEffect, useCallback } from "react";
import { chatWithActiveProvider, getConfiguredProviderChoices, getOrderedRoleAgents, chatWithRoleAgent, getWorkspaceAutomation, getAgentDebugLogs, clearAgentDebugLogs, getSkillCatalog, getSkillsConfig, getAppMemory, saveAppMemory, getActiveProviderName, getProviderConfig, getProviderModelChoices, normalizeProviderModelName, getWorkspacesLibrary, switchToWorkspace, setWorkspaceBypassEnabled, DEFAULT_WORKSPACES_LIBRARY, parseStructuredEditBatchResponse } from "./services/aiService";
import { readInstructionFile } from "./services/workspaceLearningService";
import { AGENTS_CONFIG } from "./agentConfig";
import OneAxisAirHockeyGame from './OneAxisAirHockeyGame';

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
    prompt: 'תקן שגיאות כתיב ודקדוק', 
    sel: true,
    color: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
    hoverColor: 'linear-gradient(135deg, #F87171 0%, #EF4444 100%)',
    category: 'edit'
  },
  { 
    id: 'humanize', 
    icon: '👤', 
    label: 'הפוך לאנושי', 
    prompt: 'שכתב בסגנון אנושי וטבעי', 
    sel: true,
    color: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
    hoverColor: 'linear-gradient(135deg, #60A5FA 0%, #3B82F6 100%)',
    category: 'style'
  },
  { 
    id: 'formal', 
    icon: '🎓', 
    label: 'פורמלי', 
    prompt: 'שכתב בסגנון פורמלי ומקצועי', 
    sel: true,
    color: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
    hoverColor: 'linear-gradient(135deg, #818CF8 0%, #6366F1 100%)',
    category: 'style'
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

const CLASSIC_TASKPANE_AGENT_IDS = ['reviewFix', 'fix', 'humanize', 'sources', 'lecturer', 'continue', 'summary', 'academic'];

const LEGACY_CHAT_MEMORY_STORAGE_KEY = 'wordai_sidebar_messages';
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

const getLegacyChatMemoryStorageKey = (workspaceId = '', documentId = '') => {
  const resolvedWorkspaceId = String(workspaceId || getWorkspaceAutomation().activeWorkspaceId || 'default-content-studio').trim() || 'default-content-studio';
  const resolvedFilePathKey = getLegacyDocumentStorageKeySegment(documentId);
  return `${LEGACY_CHAT_MEMORY_STORAGE_KEY}:${resolvedWorkspaceId}${resolvedFilePathKey ? `:${resolvedFilePathKey}` : ''}`;
};

const PROMPT_HISTORY_STORAGE_KEY = 'wordai_sidebar_prompt_history';
const PROMPT_HISTORY_LIMIT = 100;
const COMPOSER_MODES = [
  { id: 'chat', label: 'צ׳אט' },
  { id: 'edit', label: 'עריכה' },
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
const documentWideEditPlanPattern = /(?:לפי\s+המיקומים\s+הנכונים|במיקומים\s+הנכונים|על\s+פי\s+המיקומים|בכל\s+המסמך|בכל\s+העבודה|במסמך|בעבודה|המסמך\s+הנוכחי|העבודה\s+הנוכחית|עכשיו\s+במסמך|עכשיו\s+לעבודה).{0,50}(?:תיקונים|הערות|המלצות|שינויים|תקן|תתקן)?|(?:תכניס|הכנס|החל|יישם|תיישם|תשלב|שלב|תטמיע|הטמע|תעדכן|עדכן|תקן|תתקן).{0,50}(?:תיקונים|הערות|המלצות|שינויים|את\s+זה|אותם|אותן|את\s+העבודה|את\s+המסמך|המסמך\s+הנוכחי|העבודה\s+הנוכחית)|(?:תיקונים|המלצות|הערות).{0,24}(?:שביצעת|שביצעתי|שהצעת|שכתבת|שציינת)|(?:תסתכל|תעבור|סקור|בדוק).{0,34}(?:על\s+)?(?:ההערות|המלצות|המסמך|העבודה).{0,38}(?:ותתקן|ותעדכן|ותיישם|במסמך|בעבודה|את\s+המסמך|את\s+העבודה)|(?:את\s+זה|אותם|אותן|כמו\s+שהצעת|כמו\s+שכתבת)/i;
const NUMBERED_REVIEW_APPLY_INTENT_PATTERN = /(?:^|\s)(?:תעשה|תעשי|עשה|עשי|בצע|בצעי|תבצע|תבצעי|החל|תחיל|החילי|יישם|יישמי|תיישם|תיישמי|תקן|תקני|תתקן|תתקני|עדכן|עדכני|תעדכן|תעדכני)\s+(?:לי\s+)?(?:את\s+)?(?:ה)?(?:המלצות|תיקונים|סעיפים|נקודות)?\s*(?:מספר(?:י)?\s*)?(?:\d+|אחד|אחת|ראשון|ראשונה|שניים|שני|שתיים|שתי|שניה|שנייה|שלוש|שלושה|שלישי|שלישית|ארבע|ארבעה|רביעי|רביעית|חמש|חמישה|חמישי|חמישית|שש|שישה|שישי|שישית)(?:\s*(?:,|،|\+|ו|עד|-)\s*(?:\d+|אחד|אחת|ראשון|ראשונה|שניים|שני|שתיים|שתי|שניה|שנייה|שלוש|שלושה|שלישי|שלישית|ארבע|ארבעה|רביעי|רביעית|חמש|חמישה|חמישי|חמישית|שש|שישה|שישי|שישית))*/iu;
const NUMBERED_REVIEW_CONTEXT_PATTERN = /(?:מרצה|המלצ|הערות|ביקורת|בדיקת|תיקונים|בעיות|ניסוח\s+מוצע|suggestions?|recommendations?)/iu;
const NUMBERED_LIST_MARKER_PATTERN = /(?:^|\n)(?:(?:#{1,6}\s*)?(?:\*\*)?\d{1,2}[.)]|[•*-])\s+/u;
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
  const normalizedMessages = (Array.isArray(messages) ? messages : [])
    .filter((entry) => entry && !(entry.role === 'assistant' && !String(entry.content || '').trim()))
    .slice(-60);
  buildDocumentPersistenceIds(...(Array.isArray(documentIds) ? documentIds : [documentIds])).forEach((documentId) => {
    localStorage.setItem(getChatMemoryStorageKey(workspaceId, documentId), JSON.stringify(normalizedMessages));
  });
};

const bbl = (isUser, compactMode = false) => ({
  maxWidth: compactMode ? '96%' : '90%',
  padding: compactMode ? '9px 11px' : '11px 14px',
  borderRadius: isUser ? '18px 6px 18px 18px' : '6px 18px 18px 18px',
  background: isUser ? 'linear-gradient(135deg,#2B579A 0%,#106EBE 100%)' : '#F8FAFC',
  border: isUser ? 'none' : '1px solid #E2E8F0',
  color: isUser ? 'white' : '#0F172A',
  fontSize: compactMode ? 12 : 13,
  lineHeight: compactMode ? 1.5 : 1.6,
  whiteSpace: 'pre-wrap',
  boxShadow: isUser ? '0 8px 18px rgba(43,87,154,0.16)' : '0 4px 12px rgba(15,23,42,0.06)',
  direction: 'rtl',
  textAlign: 'right',
});

const actBtn = { padding: '8px 6px', border: '1px solid #E1DFDD', borderRadius: 10, background: 'white', cursor: 'pointer', fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, color: '#323130', transition: 'all 0.12s' };

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

export default function AiSidebar({ onClose, documentContext, currentFilePath = '', activeDocumentSessionId = '', onInsert, onApplyEdit = null, onApplyEditBatch = null, onApplyDocumentPlan = null, onStreamStart, onStreamChunk, onStreamEnd, selectedText, currentBlockText = '', editTarget = null, getCurrentEditTarget = null, resolveEditTargetFromPrompt = null, resolveEditTargetsFromPrompt = null, mode = 'popup', reason = 'manual', compactMode = mode === 'sidebar', onToggleCompact = () => {}, wordPreferences = {}, assistantBehavior = {}, onOpenSettingsTab = () => {} }) {
  const effectiveDocId = currentFilePath || activeDocumentSessionId;
  const documentPersistenceIds = buildDocumentPersistenceIds(effectiveDocId, currentFilePath, activeDocumentSessionId);
  const documentPersistenceScopeKey = documentPersistenceIds.join('::');
  const [tab, setTab] = useState('chat');
  const [workspaceAutomation, setWorkspaceAutomation] = useState(() => getWorkspaceAutomation());
  const [roleAgents, setRoleAgents] = useState(() => getOrderedRoleAgents(getWorkspaceAutomation().workflowMode));
  const [messages, setMessages] = useState(() => getSavedMessagesForDocumentIds(getWorkspaceAutomation().activeWorkspaceId, documentPersistenceIds));
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
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
  const [composerMode, setComposerMode] = useState(() => normalizeComposerMode(getAppMemory().sidebarComposerMode || 'chat'));
  const [resolvedSkillLabel, setResolvedSkillLabel] = useState(() => getAppMemory().lastResolvedSkillLabel || '');
  const [requestSnapshot, setRequestSnapshot] = useState(null);
  const [mentionMenu, setMentionMenu] = useState(() => ({ ...EMPTY_MENTION_MENU }));
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const activeClassicAgent = activeClassicAgentId ? AGENTS_CONFIG[activeClassicAgentId] : null;
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
  const isEditComposerMode = composerMode === 'edit';
  const activeEditTarget = editTarget?.active || null;

  const rawDocumentContext = typeof documentContext === 'function' ? documentContext() : (documentContext || '');
  const documentSnapshot = React.useMemo(() => normalizeSidebarDocumentSnapshot(rawDocumentContext), [rawDocumentContext]);
  const docCtx = (isEditComposerMode ? documentSnapshot.fullPromptContext : documentSnapshot.promptContext).slice(0, isEditComposerMode ? 32000 : 16000);
  const localContext = selectedText || currentBlockText || activeEditTarget?.text || '';
  const quickPromptList = compactMode ? CONTEXT_PROMPTS.slice(0, 4) : CONTEXT_PROMPTS;
  const sidebarPreset = String(assistantBehavior?.sidebarPreset || 'word-taskpane').trim() || 'word-taskpane';
  const useClassicTaskpaneShell = sidebarPreset === 'word-taskpane';
  const visibleActions = MODERN_QUICK_ACTIONS.filter((action) => wordPreferences?.aiQuickActions?.[action.id] !== false);
  const selectionActions = visibleActions.filter((action) => action.sel);
  const generationActions = visibleActions.filter((action) => !action.sel);
  const skillCatalog = getSkillCatalog();
  const skillsConfig = getSkillsConfig();
  const providerConfig = getProviderConfig();
  const configuredProviderChoices = getConfiguredProviderChoices(providerConfig);
  const workspaceAutomationEnabled = workspaceAutomation?.enabled === true;
  const activeProviderChoice = configuredProviderChoices.find((choice) => choice.id === selectedProviderId) || null;
  const providerModelChoices = activeProviderChoice
    ? getProviderModelChoices(activeProviderChoice.id, providerConfig)
    : [];
  const normalizedSelectedProviderModel = activeProviderChoice
    ? normalizeProviderModelName(activeProviderChoice.id, String(selectedProviderModel || '').trim())
    : String(selectedProviderModel || '').trim();
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
      : 'מצב צ׳אט: שאל, התייעץ, או המשך שיחה רציפה... @ לסוכנים, / לסקילים';
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
  const shouldShowProgress = workspaceAutomation.showProgress !== false && (loading || ['running', 'retrying', 'error', 'success'].includes(activeAgentStatus.state));
  const lockedControlStyle = isSettingsLocked ? { opacity: 0.56, cursor: 'not-allowed', boxShadow: 'none' } : {};

  const clearPendingMentionSelection = useCallback(() => {
    preservePendingMentionRef.current = false;
    pendingMentionSelectionRef.current = { ...EMPTY_PENDING_MENTION_SELECTION };
  }, []);

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
        window.alert('לא הצלחתי לקרוא תוכן מתוך קובץ זה.');
        return;
      }
      setAttachedFiles((prev) => [...prev, { name: file.name, text: extractedText }]);
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 50);
    } catch (err) {
      console.error(err);
      window.alert('שגיאה בעת קריאת הקובץ.');
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
    if (!match) {
      closeMentionMenu();
      return;
    }

    const query = normalizeLookup(match.query);
    const items = (match.trigger === '@'
      ? (workspaceAutomationEnabled
          ? roleAgents.map((agent) => ({
              id: agent.id,
              label: agent.name,
              description: 'הפעלת סוכן ייעודי למשימה הזו',
              insertText: `@${agent.id} `,
              type: 'agent',
            }))
          : [])
      : skillCatalog
          .filter((skill) => (skillsConfig.skills?.[skill.id]?.mode || 'manual') !== 'off')
          .map((skill) => ({
            id: skill.id,
            label: skill.label,
            description: skill.usageHint || skill.description,
            insertText: `/${skill.id} `,
            type: 'skill',
          })))
      .filter((item) => !query || normalizeLookup(item.label).includes(query) || normalizeLookup(item.id).includes(query))
      .slice(0, 6);

    setMentionMenu({
      open: items.length > 0,
      type: match.trigger === '@' ? 'agent' : 'skill',
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
      pendingMentionSelectionRef.current = {
        ...pendingMentionSelectionRef.current,
        agentId: item.id,
      };
    } else if (item.type === 'skill') {
      pendingMentionSelectionRef.current = {
        ...pendingMentionSelectionRef.current,
        skillId: item.id,
      };
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
    if (pendingChatPersistenceLoadRef.current?.key === chatMemoryStorageKey) {
      pendingChatPersistenceLoadRef.current = { key: chatMemoryStorageKey, loadedMessages: nextMessages };
    }
    setMessages(nextMessages);
    setPromptHistory(nextPromptHistory);
  }, [chatMemoryStorageKey, documentPersistenceScopeKey, workspaceAutomation.activeWorkspaceId]);

  useEffect(() => {
    try {
      persistPromptHistoryForDocumentIds(workspaceAutomation.activeWorkspaceId, documentPersistenceIds, promptHistory);
    } catch {}
  }, [documentPersistenceScopeKey, promptHistory, workspaceAutomation.activeWorkspaceId]);

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
  }, [messages, selectedProviderId, persistedSidebarProviderModel, selectedAgentId, selectedSkillId, configuredSplitCallCount, composerMode, resolvedSkillLabel, chatMemoryStorageKey, documentPersistenceScopeKey, workspaceAutomation.activeWorkspaceId]);

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

  const clearConversation = useCallback(() => {
    beginRequestCycle();
    try {
      documentPersistenceIds.forEach((documentId) => {
        localStorage.removeItem(getChatMemoryStorageKey(workspaceAutomation.activeWorkspaceId, documentId));
      });
    } catch {}
    clearPendingMentionSelection();
    setMessages(getDefaultMessages());
    setInput('');
    setPromptHistoryIndex(-1);
    setPreNavigationDraft('');
    setAgentTaskInput('');
    setLoading(false);
    setResolvedSkillLabel('');
    setRequestSnapshot(null);
    setActiveAgentStatus({ ...IDLE_AGENT_STATUS });
    setAgentProgressMap({});
    setMentionMenu({ ...EMPTY_MENTION_MENU });
  }, [beginRequestCycle, clearPendingMentionSelection, documentPersistenceScopeKey, workspaceAutomation.activeWorkspaceId]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleReset = (event) => {
      const targetWorkspaceId = String(event?.detail?.workspaceId || '').trim();
      const shouldClearAll = event?.detail?.clearAll === true;
      const activeWorkspaceId = String(workspaceAutomation.activeWorkspaceId || '').trim();
      if (!shouldClearAll && targetWorkspaceId && targetWorkspaceId !== activeWorkspaceId) return;
      clearConversation();
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

  const snapshotEditTargetState = useCallback((targetState) => ({
    selection: snapshotEditTarget(targetState?.selection || null),
    block: snapshotEditTarget(targetState?.block || null),
    active: snapshotEditTarget(targetState?.active || null),
  }), [snapshotEditTarget]);

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
    if (unresolvedExplicitReferences.length) {
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
    if ((hasNumberedReviewContext || hasPromptNumberedReviewContext) && NUMBERED_REVIEW_APPLY_INTENT_PATTERN.test(cleanPrompt)) return true;
    if (hasPromptResolvedTarget) return false;
    if ((Array.isArray(batchTargets) ? batchTargets : []).some((target) => target?.text?.trim())) return false;
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
      if (!isCurrentRequestCycle(requestCycle)) return;
      setLoading(false);
      setRequestSnapshot(null);
      inputRef.current?.focus();
    }
  };

  const buildDocumentActionCompletionPrompt = (message = {}) => {
    const unresolved = Array.isArray(message?.documentActionUnresolved) ? message.documentActionUnresolved : [];
    const unresolvedTitles = unresolved
      .map((item, index) => String(item?.title || item?.suggestionId || `תיקון ${index + 1}`).trim())
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
      providerId: message.documentActionProviderId || selectedProviderId,
      providerModel: message.documentActionProviderModel || resolvedSelectedProviderModel,
      agentId: message.documentActionAgentId || 'reviewFix',
      agentLabel: `${message.documentActionAgentLabel || 'בדיקה + תיקון'} · השלמה`,
      skillLabel: 'קריאת השלמה',
    });
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
    let latestReviewOutput = '';

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

  const buildEditModeContext = (targetState = null, batchTargets = []) => {
    const resolvedBatchTargets = (Array.isArray(batchTargets) ? batchTargets : []).filter((target) => target?.text?.trim());
    if (resolvedBatchTargets.length > 1) {
      return [
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
    if (!resolvedActiveTarget?.text) return docCtx;
    if (resolvedActiveTarget.kind === 'selection') {
      return [
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
        resolvedActiveTarget.headingText ? `יעד עריכה: סעיף "${resolvedActiveTarget.headingText}"` : 'יעד עריכה: סעיף במסמך',
        resolvedActiveTarget.locatorLabel ? `איתור מפורש:\n"${resolvedActiveTarget.locatorLabel}"` : '',
        `מקטע להחלפה:\n"${resolvedActiveTarget.text}"`,
        docCtx,
      ].filter(Boolean).join('\n\n');
    }

    return [
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
          editModeRequest: true,
          skipAutomation: true,
          skipAutomationPrompt: true,
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
    if (isEditComposerMode) return buildEditModeContext(targetState, batchTargets);
    const followUpSourceGroundingContext = buildFollowUpSourceGroundingContext(messages, requestPrompt);
    const baseContext = selectedText
      ? `טקסט נבחר: "${selectedText}"\n\nפסקה נוכחית: "${currentBlockText}"\n\n${docCtx}`
      : currentBlockText
        ? `פסקה נוכחית: "${currentBlockText}"\n\n${docCtx}`
        : (docCtx ? `מסמך פעיל:\n${docCtx}` : '');
    return followUpSourceGroundingContext
      ? [followUpSourceGroundingContext, baseContext].filter(Boolean).join('\n\n')
      : baseContext;
  };
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
      if (!isCurrentRequestCycle(requestCycle)) return;
      setLoading(false);
      setRequestSnapshot(null);
      inputRef.current?.focus();
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
    let manualSkillId = isEditComposerMode ? '' : (selectedSkillId === 'none' ? '' : selectedSkillId);
    let finalExtraSystemPrompt = [composerModeSystemPrompt, String(extraSystemPrompt || '').trim()]
      .filter(Boolean)
      .join('\n\n');
    let finalProviderId = selectedProviderId;
    let finalProviderModel = resolvedSelectedProviderModel;
    const cAgent = activeClassicAgentId ? AGENTS_CONFIG[activeClassicAgentId] : null;
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
        pendingMentionSelectionRef.current = {
          agentId: usedDraftAgentMention && forcedAgent ? forcedAgent.id : (pendingMentionSelection.agentId || ''),
          skillId: usedDraftSkillMention && manualSkillId ? manualSkillId : (pendingMentionSelection.skillId || ''),
        };
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
      if (cAgent.systemCtx) {
        finalExtraSystemPrompt = [finalExtraSystemPrompt, cAgent.systemCtx].filter(Boolean).join('\n\n');
      }
      if (cAgent.sidebarSelection && cAgent.sidebarSelection.providerId) {
        const fallbackSelection = buildClassicTaskpaneSelection(cAgent);
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
    const runtimeStrictProviderOverride = runtimeOptions.strictProviderOverride === true;
    const hasStrictRuntimeProviderOverride = runtimeStrictProviderOverride && Boolean(runtimeProviderOverride);
    const preferredProviderId = hasStrictRuntimeProviderOverride
      ? ''
      : (runtimeProviderOverride || finalPinnedProviderId);
    const preferredProviders = preferredProviderId ? [preferredProviderId] : [];
    const directProviderId = hasStrictRuntimeProviderOverride ? runtimeProviderOverride : '';
    const hasPinnedProviderPreference = hasStrictRuntimeProviderOverride || preferredProviders.length > 0;
    const explicitProviderModel = hasStrictRuntimeProviderOverride
      ? runtimeModelOverride
      : (runtimeProviderOverride
        ? runtimeModelOverride
        : (preferredProviderId ? resolvedFinalProviderModel : ''));
    const requestProviderLabel = runtimeProviderOverride ? activeProviderLabel : finalProviderLabel;
    const requestProviderSummary = runtimeProviderOverride ? activeProviderSummary : finalProviderSummary;
    clearPendingMentionSelection();

    if (shouldUseDocumentWideEditPlan(txt, {
      hasPromptResolvedTarget,
      batchTargets: requestEditBatchTargets,
      forceDocumentWide: Boolean(cAgent?.forceDocumentWideWhenNoTarget && !requestEditTarget?.text?.trim()),
      activeTarget: requestEditTarget,
      hasNumberedReviewContext: hasRecentNumberedReviewContext(messages),
    })) {
      await executeDocumentWideEditPlan({
        userContent: originalText,
        promptText: txt,
        providerLabel: hasPinnedProviderPreference ? requestProviderSummary : activeProviderSummary,
        providerId: preferredProviderId || directProviderId,
        providerModel: explicitProviderModel,
        agentId: agentMeta.id || 'assistant-main',
        agentLabel: hasPinnedProviderPreference ? `${agentMeta.name} · ${requestProviderLabel}` : agentMeta.name,
        skillLabel: runtimeSkillLabel,
      });
      return;
    }

    if (isEditComposerMode && !requestEditTarget?.text?.trim()) {
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

    const ctx = buildContext(requestEditTargets, requestEditBatchTargets, txt);
    const directAgentName = hasPinnedProviderPreference ? `${agentMeta.name} · ${requestProviderLabel}` : agentMeta.name;
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
    updateAgentStatus(agentMeta.id, directAgentName, { state: 'running', progress: 10, message: 'מתחיל טיפול' });
    
    setMessages((prev) => [...prev, { role: 'assistant', content: '', composerMode }]);

    try {
      const invokeDirectCall = async (nextPrompt, nextContext, nextSystemPrompt, phaseMeta = {}) => await chatWithActiveProvider(nextPrompt, nextContext, nextSystemPrompt, {
        agentLabel: directAgentName,
        skillId: manualSkillId,
        autoUseDefaultSkill: disabledSkillRequested ? false : (isEditComposerMode ? false : !manualSkillId),
        directChat: true,
        conversationHistory,
        includeAppMemory: !isEditComposerMode,
        providerOverride: directProviderId,
        preferredProviders,
        modelOverride: explicitProviderModel,
        strictProviderOverride: hasStrictRuntimeProviderOverride,
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
          updateAgentStatus(agentMeta.id, directAgentName, payload);
          syncRequestSnapshotProviderFromStatus(payload);
        },
      });
      const directSystemPrompt = requestEditBatchTargets.length > 1
        ? [buildStructuredEditBatchSystemPrompt(requestEditBatchTargets), finalExtraSystemPrompt].filter(Boolean).join('\n\n')
        : finalExtraSystemPrompt;
      const directAnalysisSystemPrompt = stripComposerModeDirectiveFromSystemPrompt(directSystemPrompt);
      const reply = requestedSplitCallCount >= 2
        ? await (isEditComposerMode
          ? runEditMultiCallWorkflow({
            splitCallCount: requestedSplitCallCount,
            promptText: txt,
            context: ctx,
            finalSystemPrompt: directSystemPrompt,
            analysisSystemPrompt: directAnalysisSystemPrompt,
            structuredBatchMode: requestEditBatchTargets.length > 1,
            batchTargets: requestEditBatchTargets,
            invokeCall: invokeDirectCall,
            onProgress: (payload) => {
              if (!isCurrentRequestCycle(requestCycle)) return;
              updateAgentStatus(agentMeta.id, directAgentName, { state: 'running', ...payload });
            },
          })
          : runSplitCallWorkflow({
            splitCallCount: requestedSplitCallCount,
            promptText: txt,
            context: ctx,
            extraSystemPrompt: directSystemPrompt,
            invokeCall: invokeDirectCall,
            onProgress: (payload) => {
              if (!isCurrentRequestCycle(requestCycle)) return;
              updateAgentStatus(agentMeta.id, directAgentName, { state: 'running', ...payload });
            },
          }))
        : await invokeDirectCall(txt, ctx, directSystemPrompt, { phase: 'single', stepIndex: 1, stepCount: 1 });
      if (!isCurrentRequestCycle(requestCycle)) return;
      const applyResult = requestEditBatchTargets.length > 1
        ? await applyEditBatchReply(reply, requestEditBatchTargets.map((target) => ({ ...target, batchPrompt: txt })), agentMeta.id || 'assistant-main')
        : await applyEditReply(reply, requestEditTarget, agentMeta.id || 'assistant-main');
      const documentActionMeta = buildDocumentActionMeta(applyResult, reply);
      setMessages((prev) => {
        const newMsg = [...prev];
        newMsg[newMsg.length - 1] = {
          ...newMsg[newMsg.length - 1],
          content: String(reply || ''),
          composerMode,
          ...documentActionMeta,
        };
        return newMsg;
      });
      updateAgentStatus(agentMeta.id, directAgentName, applyResult && !applyResult.skipped && !applyResult.ok
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
      updateAgentStatus(agentMeta.id, directAgentName, { state: 'error', progress: 100, message: err.message || 'שגיאה' });
    } finally {
      if (!isCurrentRequestCycle(requestCycle)) return;
      setLoading(false);
      setRequestSnapshot(null);
      inputRef.current?.focus();
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
    const preferredProviders = preferredProviderId ? [preferredProviderId] : [];
    const explicitProviderModel = preferredProviderId ? resolvedSelectedProviderModel : '';
    await executeRoleAgentTask(agent, task, {
      skillId: isEditComposerMode ? '' : (selectedSkillId === 'none' ? '' : selectedSkillId),
      autoUseDefaultSkill: isEditComposerMode ? false : selectedSkillId === 'none',
      persistSelection: !isEditComposerMode,
      providerLabel: activeProviderSummary,
      providerOverride: '',
      preferredProviders,
      modelOverride: explicitProviderModel,
      strictProviderOverride: false,
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
          ? `בדוק את הטקסט הבא ואז תקן אותו אוטומטית מבחינת ניסוח, בהירות, זרימה, כתיב ודקדוק:\n\n"${targetText}"`
          : 'בדוק את כל המסמך הנוכחי ואז תקן אותו אוטומטית בכל המסמך מבחינת ניסוח, בהירות, זרימה, כתיב ודקדוק.';
      case 'fix':
        return targetText
          ? `תקן את הטקסט הבא מבחינת כתיב, דקדוק וניסוח:\n\n"${targetText}"`
          : 'תקן את הפסקה או המסמך הנוכחי מבחינת כתיב, דקדוק וניסוח.';
      case 'humanize':
        return targetText
          ? `שכתב את הטקסט הבא בסגנון אנושי וטבעי יותר:\n\n"${targetText}"`
          : 'שכתב את ההקשר הפעיל בסגנון אנושי וטבעי יותר.';
      case 'sources':
        return targetText
          ? `מצא מקורות, כתבות או מאמרים מאומתים עבור הטקסט הבא. אל תמציא URLs או כותרות:\n\n"${targetText}"`
          : 'מצא מקורות, כתבות או מאמרים מאומתים עבור הטענה או הנושא המרכזי במסמך. אל תמציא URLs או כותרות.';
      case 'lecturer':
        return targetText
          ? `בדוק את הטקסט הבא כמו מרצה אקדמי ותן ביקורת ישימה וקצרה:\n\n"${targetText}"`
          : 'בדוק את המסמך או הטיוטה הפעילה כמו מרצה אקדמי ותן ביקורת ישימה וקצרה.';
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

  const buildClassicTaskpaneSelection = (agentConfig) => {
    const preferredProviderId = String(agentConfig?.sidebarSelection?.providerId || agentConfig?.route || '').trim();
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
    const preferredModel = String(agentConfig?.sidebarSelection?.model || '').trim();
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
    const agentConfig = AGENTS_CONFIG[agentId];
    const prompt = buildClassicTaskpanePrompt(agentId);
    if (!agentConfig || !prompt) return;
    const providerState = buildClassicTaskpaneSelection(agentConfig);
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
    if (runtimeSelection?.providerId) {
      setSelectedProviderId(runtimeSelection.providerId);
      setSelectedProviderModel(runtimeSelection.model || '');
      setSelectedAgentId('');
    }
    
    setDraftInput(prompt, { preservePendingMention: true });
    pendingMentionSelectionRef.current = {
      agentId: agentId,
      skillId: ''
    };
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

  const classicTaskpaneAgents = CLASSIC_TASKPANE_AGENT_IDS
    .map((agentId) => {
      const config = AGENTS_CONFIG[agentId] || {};
      const providerState = buildClassicTaskpaneSelection(config);
      return {
        id: agentId,
        ...config,
        providerAvailable: providerState ? providerState.available !== false : true,
        unavailableReason: providerState?.available === false ? providerState.reason : '',
      };
    })
    .filter((agent) => agent.label);
  const canSendCurrentInput = !loading && Boolean(input.trim() || pendingMentionSelectionRef.current.agentId || pendingMentionSelectionRef.current.skillId);
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
      <div style={{ ...getShellStyle(mode, compactMode), background: '#F3F2F1', fontFamily: '"Segoe UI", Tahoma, sans-serif' }} dir="rtl">
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#F3F2F1' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 8px', background: '#0078D4', color: 'white', flexShrink: 0 }}>
            <div style={{ fontSize: '1rem', fontWeight: 600, letterSpacing: '0.3px' }}>✍️ Word AI</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => onOpenSettingsTab('personal')}
                title="סגנון אישי"
                style={{ background: 'rgba(255,255,255,0.18)', border: 'none', width: 30, height: 30, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}
              >
                🎨
              </button>
              <button
                type="button"
                onClick={() => setTab((prev) => prev === 'settings' ? 'chat' : 'settings')}
                title="הגדרות"
                style={{ background: 'rgba(255,255,255,0.18)', border: 'none', width: 30, height: 30, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}
              >
                ⚙️
              </button>
              {mode === 'sidebar' && (
                <button
                  type="button"
                  onClick={onToggleCompact}
                  title={compactMode ? 'הרחב חלונית' : 'כווץ חלונית'}
                  style={{ background: 'rgba(255,255,255,0.18)', border: 'none', width: 30, height: 30, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}
                >
                  {compactMode ? '⤢' : '⤡'}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                title="סגור"
                style={{ background: 'rgba(255,255,255,0.18)', border: 'none', width: 30, height: 30, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}
              >
                ✕
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#FFFFFF', borderBottom: '1px solid #EDEBE9', flexShrink: 0 }}>
            <span style={{ fontSize: 12 }}>📄</span>
            <div style={{ flex: 1, fontSize: 12, color: localContext ? '#242424' : '#605E5C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectionPreviewText}
            </div>
            <span style={{ fontSize: 10, background: '#E8F1FB', color: '#0F4C81', padding: '4px 8px', borderRadius: 999, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {selectionBadge}
            </span>
          </div>

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
                  disabled={isSettingsLocked}
                  style={{ padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 6, background: '#FFFFFF', fontSize: 12, color: '#323130', outline: 'none', minWidth: 0, ...lockedControlStyle }}
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
                  disabled={isSettingsLocked || !activeProviderChoice || !providerModelChoices.length}
                  style={{ padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 6, background: '#FFFFFF', fontSize: 12, color: '#323130', outline: 'none', minWidth: 0, ...lockedControlStyle }}
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
          </div>

            {tab === 'settings' ? (
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#FFFFFF', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, padding: 12, background: '#F8FAFC' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4 }}>⚙️ הגדרות השיחה בצד</div>
                  <div style={{ fontSize: 12, color: '#4B5563', lineHeight: 1.6 }}>
                    ההגדרות כאן משפיעות רק על החלונית הימנית. הן לא מחליפות את מסך ההגדרות המלא של האפליקציה, ולא פותחות את תפריט הקובץ בדרך.
                  </div>
                </div>

                <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, padding: 12, background: '#FFFFFF' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 6 }}>
                    <span>🏢 בחירת סביבת עבודה</span>
                    <span style={{ color: workspaceAutomationEnabled ? '#166534' : '#92400E', fontSize: 11, fontWeight: 600 }}>
                      {workspaceAutomationEnabled ? 'פעילה' : 'כבויה'}
                    </span>
                  </div>
                  <select
                    value={workspaceAutomationEnabled ? (workspaceAutomation?.activeWorkspaceId || '') : '__no-workspace__'}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '__no-workspace__') {
                        setWorkspaceBypassEnabled(true);
                      } else {
                        switchToWorkspace(value);
                      }
                    }}
                    disabled={isSettingsLocked}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: 6, background: '#FFFFFF', fontSize: 12, color: '#323130', outline: 'none', ...lockedControlStyle }}
                  >
                    <option value="__no-workspace__">ללא סביבה פעילה (כבויה)</option>
                    <optgroup label="סביבות מערכת מתוכננות">
                      {Object.keys(DEFAULT_WORKSPACES_LIBRARY).map((wsId) => (
                        <option key={wsId} value={wsId}>
                          {DEFAULT_WORKSPACES_LIBRARY[wsId].name || 'סביבת מערכת'}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="סביבות אישיות">
                      {Object.values(getWorkspacesLibrary()).map((ws) => {
                        // Skip if it's already in the default library to avoid duplicates
                        if (DEFAULT_WORKSPACES_LIBRARY[ws.id]) return null;
                        return (
                          <option key={ws.id} value={ws.id}>
                            {ws.name || ws.workspaceName || 'סביבה ללא שם'}
                          </option>
                        );
                      })}
                    </optgroup>
                  </select>
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

                <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, padding: 12, background: '#FFFFFF' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 6 }}>🧩 סוכן קבוע</div>
                  <select
                    value={isEditComposerMode ? '' : selectedAgentId}
                    onChange={(e) => {
                      clearPendingMentionSelection();
                      setSelectedAgentId(e.target.value);
                    }}
                    disabled={isSettingsLocked || !workspaceAutomationEnabled || isEditComposerMode}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: 6, background: '#FFFFFF', fontSize: 12, color: '#323130', outline: 'none', ...lockedControlStyle }}
                  >
                    <option value="">ללא סוכן קבוע · צ׳אט ישיר</option>
                    {roleAgents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        @{agent.id} · {agent.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div ref={messagesRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#FFFFFF', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                      {msg.documentActionMessage && (
                        <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, fontSize: 11, lineHeight: 1.5, ...documentActionTone }}>
                          {msg.documentActionMessage}
                        </div>
                      )}
                      {renderDocumentActionCompletionButton(msg, 'light')}
                      {msg.role === 'assistant' && !msg.error && !isEditMessage && onInsert && (
                        <button
                          type="button"
                          onClick={() => onInsert(msg.content)}
                          style={{ marginTop: 6, padding: '4px 10px', borderRadius: 6, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', fontSize: 11, cursor: 'pointer' }}
                        >
                          הוסף למסמך
                        </button>
                      )}
                    </div>
                  );
                })}

                {loading && (
                  <div style={{ alignSelf: 'flex-start', maxWidth: compactMode ? '98%' : '94%' }}>
                    <div style={{ ...bbl(false, compactMode), display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14 }}>⏳</span>
                      <span>{progressStatusLabel}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

          <div style={{ padding: '8px 12px 10px', background: '#FFFFFF', borderTop: '1px solid #EDEBE9', flexShrink: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {classicTaskpaneAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => toggleClassicTaskpaneAgent(agent.id)}
                  title={agent.unavailableReason || agent.label}
                  disabled={loading || agent.providerAvailable === false}
                  style={{ padding: '7px 10px', background: activeClassicAgentId === agent.id ? '#0F766E' : '#FFFFFF', border: '1px solid #D1D5DB', borderRadius: 999, fontSize: 12, fontWeight: 600, color: activeClassicAgentId === agent.id ? '#FFFFFF' : '#323130', cursor: loading || agent.providerAvailable === false ? 'not-allowed' : 'pointer', opacity: loading || agent.providerAvailable === false ? 0.55 : 1, whiteSpace: 'nowrap' }}
                >
                  {agent.label}
                </button>
              ))}
            </div>

            {activeClassicAgent && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: '#F0FDFA', border: '1px solid #0D9488', borderRadius: 8, margin: '8px 0', color: '#0F766E', fontSize: 13, fontWeight: 600 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✅ סוכן פעיל: {activeClassicAgent.label}
                </div>
                <button type="button" onClick={() => setActiveClassicAgentId(null)} style={{ background: 'transparent', border: 'none', color: '#0F766E', cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
            )}
              <div style={{ padding: '6px 12px 2px', color: '#605E5C', fontSize: '0.74rem', textAlign: 'center', borderTop: '1px solid #EDEBE9', background: '#FAF9F8', margin: '0 -12px 8px' }}>
              ⌨️ Enter לשליחה, Shift+Enter לשורה חדשה, @ לסוכנים ו-/ לסקילים
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => onOpenSettingsTab('onboarding')}
                  title="הגדרות סביבת עבודה והנחיות"
                  style={{ padding: '4px 10px', background: '#FFFFFF', border: '1px solid #C8B84A', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#7A6010', cursor: 'pointer', whiteSpace: 'nowrap', height: 26, width: '100%' }}
                >
                  ⚙️ הנחיות
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="העלאת קובץ כהקשר לצ'אט"
                  style={{ padding: '4px 10px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#4B5563', cursor: 'pointer', whiteSpace: 'nowrap', height: 26, width: '100%' }}
                >
                  📎 צירוף קובץ
                </button>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".docx,.txt,.md,.pdf,.json" onChange={handleFileUpload} />
              </div>

              <div style={{ flex: 1, position: 'relative' }}>
                {renderComposerModeToggle('classic')}
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
                  style={{ width: '100%', minHeight: 44, maxHeight: 120, resize: 'vertical', padding: '9px 12px', border: '1px solid #C8C6C4', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, background: 'white', direction: 'rtl' }}
                />

                {mentionMenu.open && (
                  <div style={{ position: 'absolute', right: 0, left: 0, bottom: 'calc(100% + 8px)', background: '#111827', border: '1px solid #334155', borderRadius: 10, overflow: 'hidden', boxShadow: '0 18px 36px rgba(15,23,42,0.22)', zIndex: 30 }}>
                    <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#E5E7EB', background: '#1F2937' }}>
                      {mentionMenu.type === 'agent' ? '🤖 סוכנים זמינים' : '⚡ סקילים זמינים'}
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
                          {mentionMenu.type === 'agent' ? '@' : '/'}{item.id}
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
                style={{ width: 42, height: 42, border: 'none', borderRadius: 8, background: canSendCurrentInput ? '#0078D4' : '#CBD5E1', color: 'white', cursor: canSendCurrentInput ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                {loading ? '…' : '➤'}
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
          ['settings', '⚙️ הגדרות'],
          ['actions', '⚡ פעולות'],
          ['agents', '🧩 סוכנים'],
          ['logs', '📋 לוגים']
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

                {msg.role === 'assistant' && !msg.error && normalizeComposerMode(msg.composerMode || '') !== 'edit' && onInsert && (
                  <button 
                    onClick={() => onInsert(msg.content)}
                    style={{
                      fontSize: 11,
                      color: '#A78BFA',
                      background: 'rgba(139, 92, 246, 0.1)',
                      border: '1px solid rgba(139, 92, 246, 0.2)',
                      borderRadius: 12,
                      padding: '4px 12px',
                      cursor: 'pointer',
                      marginTop: 6,
                      transition: 'all 0.3s ease',
                      fontWeight: 500,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(139, 92, 246, 0.2)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    הוסף למסמך
                  </button>
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
                    {mentionMenu.type === 'agent' ? '🤖 סוכנים זמינים' : '⚡ סקילים זמינים'}
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
                        {mentionMenu.type === 'agent' ? '@' : '/'}{item.id}
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
                disabled={loading || (!input.trim() && !pendingMentionSelectionRef.current.agentId && !pendingMentionSelectionRef.current.skillId)}
                style={{
                  width: 56,
                  height: 56,
                  flexShrink: 0,
                  background: !loading && (input.trim() || pendingMentionSelectionRef.current.agentId || pendingMentionSelectionRef.current.skillId)
                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    : 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 16,
                  cursor: !loading && (input.trim() || pendingMentionSelectionRef.current.agentId || pendingMentionSelectionRef.current.skillId) ? 'pointer' : 'default',
                  fontSize: 20,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: !loading && (input.trim() || pendingMentionSelectionRef.current.agentId || pendingMentionSelectionRef.current.skillId)
                    ? '0 8px 25px rgba(102, 126, 234, 0.3)'
                    : 'none',
                }}
                onMouseEnter={(e) => {
                  if (!loading && (input.trim() || pendingMentionSelectionRef.current.agentId || pendingMentionSelectionRef.current.skillId)) {
                    e.currentTarget.style.transform = 'scale(1.05) translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 12px 35px rgba(102, 126, 234, 0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1) translateY(0)';
                  e.currentTarget.style.boxShadow = !loading && (input.trim() || pendingMentionSelectionRef.current.agentId || pendingMentionSelectionRef.current.skillId)
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 12,
                padding: '10px 12px',
                borderRadius: 14,
                border: '1px solid rgba(148, 163, 184, 0.22)',
                background: workspaceAutomationEnabled ? 'rgba(59, 130, 246, 0.08)' : 'rgba(15, 23, 42, 0.12)',
              }}
            >
              <span style={{ display: 'grid', gap: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#E2E8F0' }}>🏢 סביבת עבודה</span>
                <span style={{ fontSize: 11, color: 'rgba(226, 232, 240, 0.72)', lineHeight: 1.5 }}>
                  מצב קריאה בלבד. שינוי ההפעלה של סביבת העבודה נשאר במסכי ההגדרות הכלליים.
                </span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: workspaceAutomationEnabled ? '#BFDBFE' : '#FCD34D' }}>
                {workspaceAutomationEnabled ? 'פעילה' : 'כבויה'}
              </span>
            </div>

            <div style={controlLabelStyle}>🛰️ ספק לשיחה</div>
            <div style={controlHelperStyle}>
              כאן מגדירים override מקומי ל-sidebar בלבד, גם לצ׳אט הישיר וגם להרצת סוכנים מתוך המסך הזה. בחירת ברירת מחדל נשענת על ההגדרות הכלליות שלך.
              {!workspaceAutomationEnabled ? ' סביבת העבודה כבויה כרגע, ולכן הצ׳אט ירוץ ישירות דרך ברירת המחדל.' : ''}
            </div>
            <select
              value={selectedProviderId || 'default'}
              onChange={(e) => {
                clearPendingMentionSelection();
                setSelectedProviderId(e.target.value);
                setSelectedAgentId('');
              }}
              disabled={isSettingsLocked}
              style={{ ...controlSelectStyle, ...lockedControlStyle }}
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
                  disabled={isSettingsLocked || !providerModelChoices.length}
                  style={{ ...controlSelectStyle, ...lockedControlStyle }}
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
            <div style={controlLabelStyle}>🤖 סוכן נבחר</div>
            <div style={controlHelperStyle}>
              {isEditComposerMode
                ? 'במצב עריכה אין סוכן קבוע כברירת מחדל. לזימון חד-פעמי השתמש ב-`@agent` בתחילת הבקשה.'
                : 'בחירה כאן מפנה את ההודעות הבאות לסוכן עד שמחליפים אותו. `@agent` מתוך הצ׳אט נשאר חד־פעמי לשליחה הנוכחית בלבד.'}
              {!workspaceAutomationEnabled ? ' כרגע סביבת העבודה כבויה, לכן הבחירה הזו נעולה והודעות נשלחות ישירות.' : ''}
            </div>
            <select
              value={isEditComposerMode ? '' : selectedAgentId}
              onChange={(e) => {
                clearPendingMentionSelection();
                setSelectedAgentId(e.target.value);
              }}
              disabled={isSettingsLocked || !workspaceAutomationEnabled || isEditComposerMode}
              style={{ ...controlSelectStyle, ...lockedControlStyle }}
            >
              <option value="" style={{ color: '#1F2937' }}>
                ללא סוכן קבוע · צ׳אט ישיר
              </option>
              {roleAgents.map((agent) => (
                <option key={agent.id} value={agent.id} style={{ color: '#1F2937' }}>
                  @{agent.id} · {agent.name}
                </option>
              ))}
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
              Enter לשליחה, Shift+Enter לשורה חדשה, @ לסוכנים ו-/ לסקילים בלי לפגוע בזיכרון השיחה או ב-persistence.
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


