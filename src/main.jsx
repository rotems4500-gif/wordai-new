import './desktopShim'; // מתקין window.desktopApp מעל Tauri (חייב לרוץ ראשון)

// גרסה חדשה עלתה לאוויר → chunks ישנים נמחקו → lazy import נכשל בטאבים פתוחים.
// טעינה מחדש אוטומטית (פעם אחת) מביאה את ה-index העדכני עם ה-hashes הנכונים.
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    const lastReload = Number(sessionStorage.getItem('wordflow:chunk-reload') || 0);
    if (Date.now() - lastReload < 30000) return; // מניעת לולאת reload אם הבעיה אחרת
    sessionStorage.setItem('wordflow:chunk-reload', String(Date.now()));
    event.preventDefault();
    window.location.reload();
  });
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import { DOMSerializer } from '@tiptap/pm/model';
import '../tailwind.css';
import DocumentEditor from './DocumentEditor';
import Ribbon from './Ribbon';
import MobileToolbar from './MobileToolbar';
import AiSidebar from './AiSidebar';
import TopBar from './TopBar';
import FindReplace from './FindReplace';
import SourceManager from './SourceManager';
import CommentsPanel from './CommentsPanel';
import { removeCommentById } from './extensions/CommentMark';
import { acceptInsertions, rejectInsertions, collectTrackedChanges, acceptTrackedChange, rejectTrackedChange } from './extensions/TrackChange';
import TrackChangesPanel from './TrackChangesPanel';
import FileMenu from './FileMenu';
import CloudUnlockGate from './CloudUnlockGate';
import WelcomeGate from './WelcomeGate';
import MagicWand from './MagicWand';
import AuthenticityModal from './components/AuthenticityModal';
import StartScreen from './StartScreen';
import HelpModal from './HelpModal';
import SpssSyntaxStudio from './SpssSyntaxStudio';
import SpssProjectStudio from './SpssProjectStudio';
import ProjectHubStudio from './components/projectHub/ProjectHubStudio';
import AssignmentScaffoldStudio from './components/assignmentScaffold/AssignmentScaffoldStudio';
import EvidencePanel from './components/assignmentScaffold/EvidencePanel';
import { readScaffold, ensureScaffoldReady, SCAFFOLD_UPDATED_EVENT } from './services/assignmentScaffoldStore';
import { collectScaffoldBibliographyEntries, mergeBibliographyEntries, formatBibliographyEntry } from './services/localBibliographyService';
import { findSectionAtCursor } from './services/assignmentScaffoldDoc';
import { buildScaffoldContextBlock } from './services/assignmentAiService';
import { assignDocumentToProject, linkDocToMilestone } from './services/projectService';
import PresentationStudio from './PresentationStudio';
import PptxDraftStudio from './PptxDraftStudio';
import DocumentDraftStudio from './DocumentDraftStudio';
import { generateDeck } from './services/presentationService';
import { createSlide } from './presentation/deckModel';
import { importPptxDraft } from './services/pptxDraftService';
import { importDocumentDraft } from './services/documentDraftService';
import { mergeSpssFindingsIntoDraftHtml } from './services/spssFindingsMerge';
import OneAxisAirHockeyGame from './OneAxisAirHockeyGame';
import { AppStartupSplash, ConfettiCelebration, LiveGenerationMood } from './WordFlowAnimations';
import { getShortcutsConfig, getAssistantBehavior, getWordPreferences, saveWordPreferences, matchShortcut, getAgentDebugLogs, isAiRequestTimeoutError, getLatestAgentRunSummary, getWorkspaceAutomation, getProviderConfig, getToolLinksConfig, buildExternalToolUrl, hydrateAppSettingsFromDisk, hydrateProviderConfigFromDisk, syncPersistedAppSettings, getPersonalStyleProfile, savePersonalStyleProfile, fillCoverTemplateTokens, hasMeaningfulPersonalProfileData, getConfiguredProviderChoices, getOrderedRoleAgents, getRoleAgents, getProviderModelChoices, updateCurrentWorkspace, applyAiSuggestionBatchToRanges, applyAiSuggestionToRange, chatWithActiveProvider, parseAiAppendixResponse, buildPersonalStyleVoiceBlock } from './services/aiService';
import { AGENTS_CONFIG } from './agentConfig';
import { isDesktopApp } from './platform';
import { buildTemplateSkeleton, buildDocumentReviewActionPlan, generateDocumentFromPrompt, reviseDocumentWithFeedback, reviewDocumentRecommendations, saveDocumentHistory, learnFromDocumentDraft, saveHomeInstructions, readInstructionFile, getInstructionFileAcceptList } from './services/workspaceLearningService';
import { downloadBrowserDocx, saveBlobInBrowser } from './services/browserDocxExport';
import { loadPersistedDocumentLayout, persistDocumentLayout } from './services/documentLayout';
import { getCustomStyles, saveCustomStyles, buildStyleFromEditor, applyStyleToEditor } from './services/stylesRegistry';
import { snapshotGeneration as snapshotStyleGeneration, diffAfterEdit as diffStyleAfterEdit, shouldAutoSynthesize as shouldAutoSynthesizeStyle, synthesizeProfileUpdate as synthesizeStyleProfileUpdate } from './services/styleDeltaService';
import { readBrowserDocumentFile, BROWSER_DOC_ACCEPT } from './services/documentUpload';
import { showToast, showConfirm } from './services/uiFeedback';
import { Modal, Button, Input, TextArea } from './components/ui';
import { COPYLEAKS_CLASSIFICATION_AI, COPYLEAKS_CLASSIFICATION_HUMAN, COPYLEAKS_HELP_LINES, COPYLEAKS_TEXT_MAX_CHARS, COPYLEAKS_TEXT_MIN_CHARS, detectCopyleaksText, getCopyleaksTextStats, getCopyleaksValidationMessage, normalizeCopyleaksConfig } from './services/copyleaksService';
import { cloudSignInWithGooglePopup, cloudSignOut, ensureCloudUserProfile, isCloudAvailable, onCloudAuthChange, saveCloudDocument, handleCloudRedirectResult } from './firebase/services';
import { handleCloudAuthSuccess, initCloudSyncListeners, triggerCloudSync, pullFromCloud } from './services/cloudSyncManager';

// תוויות מצבי תצוגה לשורת הסטטוס (open-items #56) — תואם ל-setViewMode מה-Ribbon.
const VIEW_MODE_LABELS = {
  print: 'מצב הדפסה',
  read: 'מצב קריאה',
  web: 'פריסת אינטרנט',
  outline: 'מתאר',
  draft: 'טיוטה',
};

const DOCUMENT_STYLE_PRESETS = {
  academic: { label: 'אקדמי', fontFamily: "'Frank Ruhl Libre', 'Times New Roman', serif", fontSize: '12.5pt', lineHeight: '1.72', padding: '2.54cm', maxWidth: '21cm', background: '#ffffff', textAlign: 'right' },
  legal: { label: 'משפטי', fontFamily: "'Times New Roman', 'Miriam Libre', serif", fontSize: '12.5pt', lineHeight: '1.85', padding: '2.54cm 2.75cm', maxWidth: '21cm', background: '#ffffff', textAlign: 'justify' },
  business: { label: 'עסקי', fontFamily: "'Segoe UI', 'Assistant', sans-serif", fontSize: '12pt', lineHeight: '1.62', padding: '2.45cm 2.54cm', maxWidth: '21cm', background: '#ffffff', textAlign: 'right' },
  presentation: { label: 'מצגת', fontFamily: "'Heebo', 'Segoe UI', sans-serif", fontSize: '14pt', lineHeight: '1.48', padding: '2.15cm', maxWidth: '21cm', background: '#ffffff', textAlign: 'center' },
};

const GENERATION_LABEL_FALLBACKS = {
  blank: 'מסמך חדש',
  academic: 'עבודה אקדמית',
  legal: 'מסמך משפטי',
  report: 'דוח מסודר',
  summary: 'סיכום נושא',
  office: 'מסמך משרדי',
  proposal: 'הצעה',
  letter: 'מכתב רשמי',
};

const MAGIC_WAND_SELECTION_CONTEXT_SIDE = 420;
const STRUCTURAL_EDIT_CUE_PATTERN = /\b(?:section|heading|chapter|part|anchor)\b|(?:פרק|סעיף|כותרת|חלק|עוגן)/iu;
const STRUCTURAL_EDIT_HASH_ANCHOR_PATTERN = /(^|[\s(])#([^\s#"“”״'`.,:;!?()\[\]{}]{3,80})/u;
const STRUCTURAL_EDIT_QUOTED_TEXT_PATTERN = /["“״]([^"\n“”״]{3,160})["”״]/gu;
const BLOCK_EDIT_QUOTED_REFERENCE_PATTERN = /(?:^|[\s(,])(?:the\s+)?(?:paragraph|part|segment|פסקה|הפסקה|קטע|הקטע)\s*["“״]([^"\n“”״]{3,160})["”״]/gu;
const BLOCK_EDIT_STARTS_WITH_REFERENCE_PATTERN = /(?:^|[\s(,])(?:the\s+)?(?:paragraph|part|segment|פסקה|הפסקה|קטע|הקטע)\s+(?:that\s+starts?\s+with|starting\s+with|שמתחיל(?:ה)?\s+ב)\s*["“״]([^"\n“”״]{3,160})["”״]/gu;
const QUOTED_REFERENCE_CONTEXT_SIDE = 36;
const LOCAL_QUOTED_STRUCTURAL_CUE_PATTERN = /\b(?:section|heading|chapter|part|anchor)\b|(?:פרק|סעיף|כותרת|חלק|עוגן)/iu;
const LOCAL_QUOTED_BLOCK_CUE_PATTERN = /\b(?:paragraph|part|segment|sentence|text|line|wording|phrase)\b|(?:פסקה|קטע|משפט|טקסט|שורה|ניסוח|ביטוי|מילים)/iu;
const LOCAL_QUOTED_EDIT_VERB_PATTERN = /\b(?:fix|edit|rewrite|improve|replace|shorten|expand|update|revise)\b|(?:תקן|תתקן|שפר|תשפר|שכתב|תשכתב|החלף|תחליף|קצר|תקצר|הרחב|תרחיב|עדכן|תעדכן|מחק|תמחק|חדד|תחדד|שנה|תשנה)/iu;
const MIN_PROMPT_BLOCK_LOCATOR_LENGTH = 8;
const MIN_IMPLICIT_HEADING_MATCH_LENGTH = 4;
const MIN_CANDIDATE_BLOCK_TEXT_LENGTH = 12;
const REVIEW_ACTION_PLAN_EDIT_LIMIT = 24;
const ENGLISH_STRUCTURAL_ORDINALS = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

const HEBREW_STRUCTURAL_ORDINALS = {
  ראשון: 1,
  ראשונה: 1,
  שני: 2,
  שנייה: 2,
  שלישי: 3,
  שלישית: 3,
  רביעי: 4,
  רביעית: 4,
  חמישי: 5,
  חמישית: 5,
  שישי: 6,
  שישית: 6,
  שביעי: 7,
  שביעית: 7,
  שמיני: 8,
  שמינית: 8,
  תשיעי: 9,
  תשיעית: 9,
  עשירי: 10,
  עשירית: 10,
};

const EMPTY_EDIT_TARGET = {
  selection: null,
  block: null,
  active: null,
};

const UNRESOLVED_EXPLICIT_QUOTED_BLOCK_MATCH_KIND = 'unresolved-explicit-quoted-block';
const BLOCKING_QUOTED_BLOCK_REFERENCE_KINDS = new Set(['quoted-block', 'block-starts-with']);

const isBlockingQuotedBlockReference = (matchKind = '') => BLOCKING_QUOTED_BLOCK_REFERENCE_KINDS.has(String(matchKind || '').trim());

const buildStableEditTargetId = ({
  kind = 'target',
  from = 0,
  to = 0,
  sectionIndex = '',
  headingText = '',
  locatorText = '',
} = {}) => {
  const normalizedLabel = normalizeStructuralEditText(headingText || locatorText)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return [kind || 'target', Number(from) || 0, Number(to) || 0, sectionIndex || '', normalizedLabel || 'region']
    .filter((part) => part !== '')
    .join(':');
};

const buildCanonicalEditRegionKey = ({ kind = '', from = null, to = null } = {}) => {
  const normalizedKind = String(kind || '').trim();
  const normalizedFrom = Number(from);
  const normalizedTo = Number(to);
  if (!normalizedKind || !Number.isInteger(normalizedFrom) || !Number.isInteger(normalizedTo) || normalizedFrom >= normalizedTo) {
    return '';
  }
  return `${normalizedKind}:${normalizedFrom}:${normalizedTo}`;
};

const resolveNumericEditRange = ({ from = null, to = null } = {}) => {
  const normalizedFrom = Number(from);
  const normalizedTo = Number(to);
  if (!Number.isInteger(normalizedFrom) || !Number.isInteger(normalizedTo) || normalizedFrom >= normalizedTo) {
    return null;
  }
  return { from: normalizedFrom, to: normalizedTo };
};

class FileMenuErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[FileMenuErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const message = String(this.state.error?.message || 'File menu failed to render.').trim();
    return (
      <div className="fixed inset-0 z-[999] bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-[560px] rounded-[24px] border border-rose-200 bg-white shadow-2xl p-6 text-right">
          <div className="text-[11px] font-bold tracking-[0.24em] text-rose-500">FILE MENU ERROR</div>
          <h2 className="mt-2 text-2xl font-extrabold text-slate-900">תפריט הקובץ לא נטען</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            שאר האפליקציה נשארה פעילה. אפשר לסגור את החלון הזה ולהמשיך לעבוד, או לנסות שוב אחרי פתיחה מחדש.
          </p>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 break-words">
            {message}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={this.props.onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold hover:border-slate-400 hover:text-slate-900 transition-colors"
            >
              סגור
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const normalizeStructuralEditText = (value = '') => String(value || '')
  .normalize('NFKC')
  .replace(/[“”״]/g, '"')
  .replace(/[‘’׳]/g, "'")
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase();

const getReviewActionSuggestionId = (suggestion = {}, index = 0) => String(
  suggestion?.suggestionId
  || suggestion?.id
  || suggestion?.sourceSuggestionId
  || `suggestion-${index + 1}`,
).trim();

const getReviewActionSuggestionTitle = (suggestion = {}, index = 0) => String(
  suggestion?.title
  || suggestion?.heading
  || suggestion?.name
  || suggestion?.suggestedChange
  || suggestion?.suggestion
  || `המלצה ${index + 1}`,
).trim();

const collectMissingReviewActionSuggestions = (suggestions = [], edits = []) => {
  const editSuggestionIds = new Set((Array.isArray(edits) ? edits : [])
    .map((edit) => normalizeStructuralEditText(edit?.suggestionId || edit?.id || edit?.sourceSuggestionId || ''))
    .filter(Boolean));
  const editTitles = new Set((Array.isArray(edits) ? edits : [])
    .map((edit) => normalizeStructuralEditText(edit?.title || edit?.heading || edit?.name || ''))
    .filter(Boolean));

  return (Array.isArray(suggestions) ? suggestions : []).filter((suggestion, index) => {
    const suggestionId = normalizeStructuralEditText(getReviewActionSuggestionId(suggestion, index));
    if (suggestionId && editSuggestionIds.has(suggestionId)) return false;
    const suggestionTitle = normalizeStructuralEditText(getReviewActionSuggestionTitle(suggestion, index));
    return !(suggestionTitle && editTitles.has(suggestionTitle));
  });
};

const mergeReviewActionPlanEdits = (...editGroups) => {
  const merged = [];
  const seen = new Set();
  editGroups.flat().forEach((edit) => {
    if (!edit || typeof edit !== 'object') return;
    const key = [
      normalizeStructuralEditText(edit.suggestionId || edit.id || edit.sourceSuggestionId || ''),
      normalizeStructuralEditText(edit.title || edit.heading || edit.name || ''),
      normalizeStructuralEditText(edit.targetType || edit.targetKind || edit.scope || edit.kind || ''),
      normalizeStructuralEditText(edit.locator || edit.targetHint || edit.headingText || edit.heading || edit.section || edit.target || ''),
      normalizeStructuralEditText(edit.originalText || edit.currentText || edit.excerpt || edit.quote || ''),
    ].join('||');
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(edit);
  });
  return merged;
};

const hasQuotedReferenceCue = (sourceText = '', matchIndex = 0, matchLength = 0, { requireStructuralCue = false } = {}) => {
  const safeSource = String(sourceText || '');
  const start = Math.max(0, Number(matchIndex) - QUOTED_REFERENCE_CONTEXT_SIDE);
  const end = Math.min(safeSource.length, Number(matchIndex) + Math.max(0, Number(matchLength)) + QUOTED_REFERENCE_CONTEXT_SIDE);
  const localWindow = safeSource.slice(start, end);

  if (requireStructuralCue) {
    return LOCAL_QUOTED_STRUCTURAL_CUE_PATTERN.test(localWindow);
  }

  return LOCAL_QUOTED_BLOCK_CUE_PATTERN.test(localWindow) || LOCAL_QUOTED_EDIT_VERB_PATTERN.test(localWindow);
};

const escapeStructuralEditRegex = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeEditTargetHtml = (value = '') => String(value || '')
  .replace(/>\s+</g, '><')
  .replace(/\s+/g, ' ')
  .trim();

const collectQuotedStructuralAnchors = (promptText = '', { requireLocalStructuralCue = false, requireLocalEditCue = false } = {}) => {
  const matches = [];
  const seen = new Set();
  const sourceText = String(promptText || '');

  STRUCTURAL_EDIT_QUOTED_TEXT_PATTERN.lastIndex = 0;
  let match = STRUCTURAL_EDIT_QUOTED_TEXT_PATTERN.exec(sourceText);
  while (match) {
    const text = String(match[1] || '').trim();
    const normalized = normalizeStructuralEditText(text);
    const matchIndex = typeof match.index === 'number' ? match.index : 0;
    const matchLength = String(match[0] || '').length;
    const hasRequiredCue = requireLocalStructuralCue
      ? hasQuotedReferenceCue(sourceText, matchIndex, matchLength, { requireStructuralCue: true })
      : requireLocalEditCue
        ? hasQuotedReferenceCue(sourceText, matchIndex, matchLength)
        : true;
    if (normalized && hasRequiredCue && !seen.has(normalized)) {
      seen.add(normalized);
      matches.push({ text, normalized, index: matchIndex });
    }
    match = STRUCTURAL_EDIT_QUOTED_TEXT_PATTERN.exec(sourceText);
  }

  return matches;
};

const collectHashStructuralAnchors = (promptText = '') => {
  const matches = [];
  const seen = new Set();
  const sourceText = String(promptText || '');
  const pattern = new RegExp(STRUCTURAL_EDIT_HASH_ANCHOR_PATTERN.source, 'gu');

  let match = pattern.exec(sourceText);
  while (match) {
    const text = String(match[2] || '').trim();
    const normalized = normalizeStructuralEditText(text);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      matches.push({ text, normalized, index: match.index || 0 });
    }
    match = pattern.exec(sourceText);
  }

  return matches;
};

const collectStructuralOrdinalReferences = (promptText = '') => {
  const references = [];
  const seen = new Set();
  const sourceText = String(promptText || '');
  const numericPattern = /\b(?:section|chapter|part|heading|פרק|סעיף|כותרת)\s+(\d{1,3})(?!\d)/giu;
  const englishPattern = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:section|chapter|part|heading)\b/giu;
  const hebrewPattern = /(?:פרק|סעיף|כותרת)\s+(ה?ראשון|ה?ראשונה|ה?שני|ה?שנייה|ה?שלישי|ה?שלישית|ה?רביעי|ה?רביעית|ה?חמישי|ה?חמישית|ה?שישי|ה?שישית|ה?שביעי|ה?שביעית|ה?שמיני|ה?שמינית|ה?תשיעי|ה?תשיעית|ה?עשירי|ה?עשירית)/gu;

  let match = numericPattern.exec(sourceText);
  while (match) {
    const value = Number(match[1]);
    if (Number.isInteger(value) && value > 0) {
      const key = `ordinal:${value}`;
      if (!seen.has(key)) {
        seen.add(key);
        references.push({ index: value, position: match.index || 0, label: `סעיף ${value}` });
      }
    }
    match = numericPattern.exec(sourceText);
  }

  match = englishPattern.exec(sourceText);
  while (match) {
    const value = ENGLISH_STRUCTURAL_ORDINALS[String(match[1] || '').toLowerCase()] || null;
    if (value) {
      const key = `ordinal:${value}`;
      if (!seen.has(key)) {
        seen.add(key);
        references.push({ index: value, position: match.index || 0, label: `section ${match[1]}` });
      }
    }
    match = englishPattern.exec(sourceText);
  }

  match = hebrewPattern.exec(sourceText);
  while (match) {
    const normalizedOrdinal = String(match[1] || '').replace(/^ה/, '');
    const value = HEBREW_STRUCTURAL_ORDINALS[normalizedOrdinal] || null;
    if (value) {
      const key = `ordinal:${value}`;
      if (!seen.has(key)) {
        seen.add(key);
        references.push({ index: value, position: match.index || 0, label: `סעיף ${match[1]}` });
      }
    }
    match = hebrewPattern.exec(sourceText);
  }

  return references.sort((left, right) => left.position - right.position);
};

const parseStructuralOrdinalIndex = (promptText = '') => {
  const sourceText = String(promptText || '');
  const numericMatch = sourceText.match(/\b(?:section|chapter|part|heading)\s+(\d{1,3})(?!\d)/iu)
    || sourceText.match(/(?:פרק|סעיף|כותרת)\s+(\d{1,3})(?!\d)/u);
  if (numericMatch) {
    const value = Number(numericMatch[1]);
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  const englishMatch = sourceText.toLowerCase().match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:section|chapter|part|heading)\b/);
  if (englishMatch) {
    return ENGLISH_STRUCTURAL_ORDINALS[englishMatch[1]] || null;
  }

  const hebrewMatch = sourceText.match(/(?:פרק|סעיף|כותרת)\s+(ה?ראשון|ה?ראשונה|ה?שני|ה?שנייה|ה?שלישי|ה?שלישית|ה?רביעי|ה?רביעית|ה?חמישי|ה?חמישית|ה?שישי|ה?שישית|ה?שביעי|ה?שביעית|ה?שמיני|ה?שמינית|ה?תשיעי|ה?תשיעית|ה?עשירי|ה?עשירית)/u);
  if (!hebrewMatch) return null;

  const normalizedOrdinal = String(hebrewMatch[1] || '').replace(/^ה/, '');
  return HEBREW_STRUCTURAL_ORDINALS[normalizedOrdinal] || null;
};

const collectHeadingSections = (doc) => {
  if (!doc?.descendants) return [];

  const headings = [];
  doc.descendants((node, pos) => {
    if (node.type?.name !== 'heading') return;
    const headingText = String(node.textContent || '').replace(/\s+/g, ' ').trim();
    if (!headingText) return;

    headings.push({
      index: headings.length + 1,
      pos,
      level: Number(node.attrs?.level) || 1,
      headingText,
      normalizedHeadingText: normalizeStructuralEditText(headingText),
    });
  });

  if (!headings.length) return [];

  const primaryLevel = headings.reduce((lowest, heading) => Math.min(lowest, heading.level), headings[0].level);
  return headings
    .map((heading, headingIndex) => {
      let to = doc.content.size;
      for (let cursor = headingIndex + 1; cursor < headings.length; cursor += 1) {
        if ((headings[cursor].level || 1) <= heading.level) {
          to = headings[cursor].pos;
          break;
        }
      }

      if (!Number.isInteger(heading.pos) || !Number.isInteger(to) || heading.pos >= to) return null;

      const sectionText = doc.textBetween(heading.pos, to, ' ');
      return {
        ...heading,
        from: heading.pos,
        to,
        sectionText,
        normalizedSectionText: normalizeStructuralEditText(sectionText),
        isPrimaryLevel: heading.level === primaryLevel,
      };
    })
    .filter(Boolean);
};

const SIDEBAR_DOCUMENT_EXCERPT_LIMIT = 16000;
const SIDEBAR_DOCUMENT_FULL_TEXT_LIMIT = 32000;
const SIDEBAR_DOCUMENT_HEADING_LIMIT = 24;

const buildSidebarDocumentOutlineText = (sections = []) => {
  const limitedSections = (Array.isArray(sections) ? sections : []).slice(0, SIDEBAR_DOCUMENT_HEADING_LIMIT);
  if (!limitedSections.length) return '';

  return [
    'מפת מסמך:',
    ...limitedSections.map((section) => `${'  '.repeat(Math.max(0, (Number(section.level) || 1) - 1))}- ${section.headingText}`),
  ].join('\n');
};

const buildSidebarDocumentSnapshot = (editorInstance, {
  excerptLimit = SIDEBAR_DOCUMENT_EXCERPT_LIMIT,
  fullTextLimit = SIDEBAR_DOCUMENT_FULL_TEXT_LIMIT,
} = {}) => {
  if (!editorInstance?.state?.doc) {
    return {
      excerptText: '',
      text: '',
      html: '',
      outlineText: '',
      headings: [],
      charCount: 0,
    };
  }

  const doc = editorInstance.state.doc;
  const fullText = String(editorInstance.getText?.() || '');
  const headings = collectHeadingSections(doc)
    .slice(0, SIDEBAR_DOCUMENT_HEADING_LIMIT)
    .map((section) => ({
      index: section.index,
      level: section.level,
      headingText: section.headingText,
    }));

  return {
    excerptText: fullText.slice(0, Math.max(0, Number(excerptLimit) || SIDEBAR_DOCUMENT_EXCERPT_LIMIT)),
    text: fullText.slice(0, Math.max(0, Number(fullTextLimit) || SIDEBAR_DOCUMENT_FULL_TEXT_LIMIT)),
    html: String(editorInstance.getHTML?.() || ''),
    outlineText: buildSidebarDocumentOutlineText(headings),
    headings,
    charCount: fullText.length,
  };
};

// ממיר את ה-HTML של נספח ה-AI (hr/h3/ol/p) לרצף שקופיות בסוף דק המצגת.
const buildAiAppendixSlidesFromHtml = (appendixHtml = '') => {
  const html = String(appendixHtml || '').trim();
  if (!html || typeof DOMParser === 'undefined') return [];
  let root;
  try {
    root = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body.firstChild;
  } catch {
    return [];
  }
  if (!root) return [];
  const nodes = [...root.children];
  const slides = [createSlide({ layout: 'section', title: 'נספח: תיעוד השימוש ב-AI', subtitle: '⚠️ שקופיות זמניות — למחוק לפני הגשה' })];
  let i = 0;
  while (i < nodes.length) {
    const el = nodes[i];
    if (el.tagName.toLowerCase() !== 'h3') { i += 1; continue; }
    const heading = el.textContent.trim();
    const bullets = [];
    let bodyText = '';
    let j = i + 1;
    while (j < nodes.length && !['h3', 'h2'].includes(nodes[j].tagName.toLowerCase())) {
      const n = nodes[j];
      const nt = n.tagName.toLowerCase();
      if (nt === 'ol' || nt === 'ul') {
        bullets.push(...[...n.querySelectorAll('li')].map((li) => li.textContent.trim()).filter(Boolean));
      } else if (nt === 'p') {
        bodyText += (bodyText ? '\n' : '') + n.textContent.trim();
      }
      j += 1;
    }
    if (/רפלקציה/.test(heading)) {
      slides.push(createSlide({ layout: 'quote', subtitle: 'רפלקציה', body: bodyText || bullets.join(' ') }));
    } else {
      const slideBullets = bullets.length ? bullets : (bodyText ? bodyText.split('\n').filter(Boolean) : []);
      slides.push(createSlide({ layout: 'title-bullets', title: heading, bullets: slideBullets }));
    }
    i = j;
  }
  return slides;
};

const hasMeaningfulPromptBlockLocator = (value = '') => normalizeStructuralEditText(value).length >= MIN_PROMPT_BLOCK_LOCATOR_LENGTH;

const collectPromptBlockReferences = (promptText = '', pattern, matchKind) => {
  const matches = [];
  const seen = new Set();
  const sourceText = String(promptText || '');
  if (!(pattern instanceof RegExp) || !sourceText) return matches;

  pattern.lastIndex = 0;
  let match = pattern.exec(sourceText);
  while (match) {
    const text = String(match[1] || '').trim();
    const normalized = normalizeStructuralEditText(text);
    if (hasMeaningfulPromptBlockLocator(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      matches.push({ text, normalized, matchKind });
    }
    match = pattern.exec(sourceText);
  }

  return matches;
};

const collectQuotedBlockReferences = (promptText = '', { includeFreeQuoted = false } = {}) => {
  const references = [
    ...collectPromptBlockReferences(promptText, BLOCK_EDIT_QUOTED_REFERENCE_PATTERN, 'quoted-block'),
    ...collectPromptBlockReferences(promptText, BLOCK_EDIT_STARTS_WITH_REFERENCE_PATTERN, 'block-starts-with'),
  ];
  const hasExplicitBlockReference = references.some((reference) => isBlockingQuotedBlockReference(reference.matchKind));

  if (!includeFreeQuoted || hasExplicitBlockReference) {
    return references;
  }

  const seen = new Set(references.map((reference) => reference.normalized));
  collectQuotedStructuralAnchors(promptText, { requireLocalEditCue: true }).forEach((anchor) => {
    if (!hasMeaningfulPromptBlockLocator(anchor.normalized) || seen.has(anchor.normalized)) return;
    seen.add(anchor.normalized);
    references.push({
      text: anchor.text,
      normalized: anchor.normalized,
      matchKind: 'quoted-block-snippet',
    });
  });

  return references;
};

const collectCandidateTextBlocks = (doc, { minTextLength = MIN_CANDIDATE_BLOCK_TEXT_LENGTH } = {}) => {
  if (!doc?.descendants) return [];

  const blocks = [];
  doc.descendants((node, pos, parent, index) => {
    if (!node?.isTextblock || node.type?.name === 'heading') return;

    const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
    const normalizedText = normalizeStructuralEditText(text);
    if (!normalizedText || normalizedText.length < Math.max(1, Number(minTextLength) || 1)) return;

    const from = pos + 1;
    const to = pos + node.nodeSize - 1;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from >= to) return;

    blocks.push({
      index: blocks.length + 1,
      from,
      to,
      text,
      normalizedText,
      nodeType: node.type?.name || 'textblock',
      parentNode: parent || null,
      parentChildIndex: Number.isInteger(index) ? index : -1,
    });
  });

  return blocks;
};

const hasMergeableCandidateBlockGap = (doc, leftBlock, rightBlock) => {
  if (!doc || !leftBlock || !rightBlock) return false;
  if (leftBlock.parentNode !== rightBlock.parentNode) return false;
  if (!Number.isInteger(leftBlock.parentChildIndex) || !Number.isInteger(rightBlock.parentChildIndex)) return false;
  if (rightBlock.parentChildIndex !== leftBlock.parentChildIndex + 1) return false;
  if (rightBlock.from <= leftBlock.to) return true;
  const gapText = doc.textBetween(leftBlock.to, rightBlock.from, '\n', '\n');
  return !String(gapText || '').trim();
};

const collectCandidateBlockPassages = (doc, blocks = [], { maxBlocks = 3 } = {}) => {
  const sourceBlocks = Array.isArray(blocks) ? blocks.filter(Boolean) : [];
  if (!doc || !sourceBlocks.length) return [];

  const passages = [...sourceBlocks];
  const seen = new Set(sourceBlocks.map((block) => `${block.from}:${block.to}`));
  const safeMaxBlocks = Math.max(2, Math.min(12, Number(maxBlocks) || 3));

  for (let startIndex = 0; startIndex < sourceBlocks.length; startIndex += 1) {
    let endIndex = startIndex;
    while (endIndex + 1 < sourceBlocks.length && hasMergeableCandidateBlockGap(doc, sourceBlocks[endIndex], sourceBlocks[endIndex + 1])) {
      endIndex += 1;
      const blockCount = endIndex - startIndex + 1;
      if (blockCount > safeMaxBlocks) break;

      const from = sourceBlocks[startIndex].from;
      const to = sourceBlocks[endIndex].to;
      const key = `${from}:${to}`;
      if (seen.has(key)) continue;

      const text = doc.textBetween(from, to, ' ');
      const normalizedText = normalizeStructuralEditText(text);
      if (!normalizedText) continue;

      passages.push({
        index: sourceBlocks[startIndex].index,
        from,
        to,
        text,
        normalizedText,
        nodeType: 'block-passage',
        blockCount,
      });
      seen.add(key);
    }
  }

  return passages;
};

const resolveUniqueDocumentMatch = (items = [], predicates = []) => {
  for (const predicate of predicates) {
    if (typeof predicate !== 'function') continue;
    const matches = items.filter(predicate);
    if (matches.length === 1) return matches[0];
  }
  return null;
};

const buildSectionEditTarget = (doc, section, { includeFingerprint = false, matchKind = '', locatorText = '', locatorLabel = '' } = {}) => {
  if (!doc || !section) return null;

  const { from, to, sectionText, headingText, level, index } = section;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from >= to || !String(sectionText || '').trim()) {
    return null;
  }

  const docEnd = doc.content.size;
  const target = {
    kind: 'section',
    from,
    to,
    targetId: buildStableEditTargetId({ kind: 'section', from, to, sectionIndex: index, headingText, locatorText }),
    text: sectionText,
    before: doc.textBetween(Math.max(0, from - MAGIC_WAND_SELECTION_CONTEXT_SIDE), from, ' ').trim(),
    after: doc.textBetween(to, Math.min(docEnd, to + MAGIC_WAND_SELECTION_CONTEXT_SIDE), ' ').trim(),
    headingText,
    headingLevel: level,
    sectionIndex: index,
    matchKind,
    locatorText,
    locatorLabel,
  };

  return includeFingerprint ? { ...target, ...buildEditTargetFingerprint(doc, from, to) } : target;
};

const dedupeResolvedEditTargets = (targets = []) => {
  const seen = new Set();
  return (Array.isArray(targets) ? targets : []).filter((target) => {
    const regionKey = buildCanonicalEditRegionKey(target);
    const dedupeKey = regionKey || String(target?.targetId || '').trim();
    if (!dedupeKey || seen.has(dedupeKey)) return false;
    seen.add(dedupeKey);
    return true;
  });
};

const hasExplicitStructuralEditReference = (promptText = '') => {
  const sourceText = String(promptText || '').trim();
  if (!sourceText) return false;

  return STRUCTURAL_EDIT_CUE_PATTERN.test(sourceText)
    || collectHashStructuralAnchors(sourceText).length > 0;
};

const resolveExplicitStructuralEditReferences = (doc, promptText = '') => {
  const sourceText = String(promptText || '').trim();
  if (!sourceText) {
    return { targets: [], unresolvedReferences: [] };
  }

  const sections = collectHeadingSections(doc);
  const primarySections = sections.filter((section) => section.isPrimaryLevel);
  const hasStructuralCue = STRUCTURAL_EDIT_CUE_PATTERN.test(sourceText);
  const hashAnchors = collectHashStructuralAnchors(sourceText);
  const ordinalReferences = collectStructuralOrdinalReferences(sourceText);
  const quotedAnchors = hasStructuralCue
    ? collectQuotedStructuralAnchors(sourceText, { requireLocalStructuralCue: true })
    : [];

  if (!hashAnchors.length && !ordinalReferences.length && !quotedAnchors.length) {
    return { targets: [], unresolvedReferences: [] };
  }

  const resolveUniqueSection = (matchers = []) => {
    for (const matcher of matchers) {
      const matches = sections.filter(matcher);
      if (matches.length === 1) {
        return matches[0];
      }
    }
    return null;
  };
  const buildResolvedTarget = (section, metadata = {}) => buildSectionEditTarget(doc, section, {
    includeFingerprint: true,
    matchKind: metadata.matchKind || '',
    locatorText: metadata.locatorText || '',
    locatorLabel: metadata.locatorLabel || metadata.locatorText || '',
  });
  const resolvedTargets = [];
  const unresolvedReferences = [];

  hashAnchors.forEach((anchor) => {
    const section = resolveUniqueSection([
      (item) => item.normalizedHeadingText === anchor.normalized,
      (item) => item.normalizedHeadingText.includes(anchor.normalized),
      (item) => item.normalizedSectionText.includes(anchor.normalized),
    ]);
    if (!section) {
      unresolvedReferences.push({
        matchKind: 'anchor',
        text: `#${anchor.text}`,
        locatorText: `#${anchor.text}`,
        locatorLabel: `עוגן #${anchor.text}`,
      });
      return;
    }
    resolvedTargets.push(buildResolvedTarget(section, {
      matchKind: 'anchor',
      locatorText: `#${anchor.text}`,
      locatorLabel: `עוגן #${anchor.text}`,
    }));
  });

  ordinalReferences.forEach((reference) => {
    const sectionPool = primarySections.length ? primarySections : sections;
    const section = sectionPool[reference.index - 1] || null;
    if (!section) {
      unresolvedReferences.push({
        matchKind: 'ordinal',
        text: reference.label,
        locatorText: String(reference.index),
        locatorLabel: reference.label,
      });
      return;
    }
    resolvedTargets.push(buildResolvedTarget(section, {
      matchKind: 'ordinal',
      locatorText: String(reference.index),
      locatorLabel: reference.label,
    }));
  });

  quotedAnchors.forEach((anchor) => {
    const section = resolveUniqueSection([
      (item) => item.normalizedHeadingText === anchor.normalized,
      (item) => item.normalizedSectionText.includes(anchor.normalized),
    ]);
    if (!section) {
      unresolvedReferences.push({
        matchKind: 'quoted-anchor',
        text: anchor.text,
        locatorText: anchor.text,
        locatorLabel: `"${anchor.text}"`,
      });
      return;
    }
    resolvedTargets.push(buildResolvedTarget(section, {
      matchKind: 'quoted-anchor',
      locatorText: anchor.text,
      locatorLabel: `"${anchor.text}"`,
    }));
  });

  return {
    targets: dedupeResolvedEditTargets(resolvedTargets),
    unresolvedReferences,
  };
};

const resolveStructuralEditTargets = (doc, promptText = '') => {
  const sourceText = String(promptText || '').trim();
  if (!doc || !sourceText) return [];

  return resolveExplicitStructuralEditReferences(doc, sourceText).targets;
};

const resolveStructuralEditTarget = (doc, promptText = '') => {
  const sourceText = String(promptText || '').trim();
  if (!doc || !sourceText) return null;

  const multiTargets = resolveStructuralEditTargets(doc, sourceText);
  if (multiTargets.length === 1) {
    return multiTargets[0];
  }

  const sections = collectHeadingSections(doc);
  if (!sections.length) return null;

  const primarySections = sections.filter((section) => section.isPrimaryLevel);
  const promptNormalized = normalizeStructuralEditText(sourceText);
  const hasStructuralCue = STRUCTURAL_EDIT_CUE_PATTERN.test(sourceText);
  const matchUniqueSection = (predicate) => {
    const matches = sections.filter(predicate);
    return matches.length === 1 ? matches[0] : null;
  };
  const buildResolvedTarget = (section, metadata = {}) => buildSectionEditTarget(doc, section, {
    includeFingerprint: true,
    matchKind: metadata.matchKind || '',
    locatorText: metadata.locatorText || '',
    locatorLabel: metadata.locatorLabel || metadata.locatorText || '',
  });

  const hashAnchorMatch = sourceText.match(STRUCTURAL_EDIT_HASH_ANCHOR_PATTERN);
  if (hashAnchorMatch) {
    const anchorText = String(hashAnchorMatch[2] || '').trim();
    const normalizedAnchor = normalizeStructuralEditText(anchorText);
    const section = matchUniqueSection((item) => item.normalizedHeadingText === normalizedAnchor)
      || matchUniqueSection((item) => item.normalizedHeadingText.includes(normalizedAnchor))
      || matchUniqueSection((item) => item.normalizedSectionText.includes(normalizedAnchor));
    if (section) {
      return buildResolvedTarget(section, {
        matchKind: 'anchor',
        locatorText: `#${anchorText}`,
        locatorLabel: `עוגן #${anchorText}`,
      });
    }
  }

  const ordinalIndex = parseStructuralOrdinalIndex(sourceText);
  if (ordinalIndex) {
    const sectionPool = primarySections.length ? primarySections : sections;
    const section = sectionPool[ordinalIndex - 1] || null;
    if (section) {
      return buildResolvedTarget(section, {
        matchKind: 'ordinal',
        locatorText: String(ordinalIndex),
        locatorLabel: `סעיף ${ordinalIndex}`,
      });
    }
  }

  const implicitHeadingMatches = sections.filter((section) => {
    const normalizedHeading = String(section.normalizedHeadingText || '').trim();
    if (!normalizedHeading || normalizedHeading.length < MIN_IMPLICIT_HEADING_MATCH_LENGTH) return false;
    return promptNormalized.includes(normalizedHeading);
  });
  if (!hasStructuralCue && implicitHeadingMatches.length === 1) {
    return buildResolvedTarget(implicitHeadingMatches[0], {
      matchKind: 'implicit-heading',
      locatorText: implicitHeadingMatches[0].headingText,
      locatorLabel: implicitHeadingMatches[0].headingText,
    });
  }

  if (!hasStructuralCue) return null;

  const quotedAnchors = collectQuotedStructuralAnchors(sourceText, { requireLocalStructuralCue: true });
  for (const anchor of quotedAnchors) {
    const section = matchUniqueSection((item) => item.normalizedHeadingText === anchor.normalized)
      || matchUniqueSection((item) => item.normalizedSectionText.includes(anchor.normalized));
    if (section) {
      return buildResolvedTarget(section, {
        matchKind: 'quoted-anchor',
        locatorText: anchor.text,
        locatorLabel: `"${anchor.text}"`,
      });
    }
  }

  const headingMatches = sections.filter((section) => {
    if (!section.normalizedHeadingText) return false;
    const escapedHeading = escapeStructuralEditRegex(section.normalizedHeadingText);
    const explicitHeadingPattern = new RegExp(
      `(?:^|\\s)(?:section|heading|chapter|part|פרק|סעיף|כותרת|חלק)(?:\\s+|\\s*[:\\-]\\s*|\\s*"\\s*)${escapedHeading}(?:"|\\s|$)`,
      'iu'
    );
    return explicitHeadingPattern.test(promptNormalized);
  });
  if (headingMatches.length === 1) {
    return buildResolvedTarget(headingMatches[0], {
      matchKind: 'heading-text',
      locatorText: headingMatches[0].headingText,
      locatorLabel: headingMatches[0].headingText,
    });
  }

  return null;
};

const buildEditTargetFingerprint = (doc, from, to) => {
  if (!doc || !Number.isInteger(from) || !Number.isInteger(to) || from >= to) {
    return { sliceJson: '', normalizedHtml: '' };
  }

  const sliceContent = doc.slice(from, to).content;
  const sliceJson = JSON.stringify(sliceContent.toJSON());
  if (typeof document === 'undefined') {
    return { sliceJson, normalizedHtml: '' };
  }

  const serializer = DOMSerializer.fromSchema(doc.type.schema);
  const fragment = serializer.serializeFragment(sliceContent);
  const container = document.createElement('div');
  container.appendChild(fragment);
  return {
    sliceJson,
    normalizedHtml: normalizeEditTargetHtml(container.innerHTML),
  };
};

const buildSelectionEditTarget = (doc, selection, { includeFingerprint = false } = {}) => {
  if (!doc || !selection || selection.empty) return null;
  const { from, to } = selection;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from >= to) return null;

  const docEnd = doc.content.size;
  const target = {
    kind: 'selection',
    from,
    to,
    targetId: buildStableEditTargetId({ kind: 'selection', from, to }),
    text: doc.textBetween(from, to, ' '),
    before: doc.textBetween(Math.max(0, from - MAGIC_WAND_SELECTION_CONTEXT_SIDE), from, ' ').trim(),
    after: doc.textBetween(to, Math.min(docEnd, to + MAGIC_WAND_SELECTION_CONTEXT_SIDE), ' ').trim(),
  };

  return includeFingerprint ? { ...target, ...buildEditTargetFingerprint(doc, from, to) } : target;
};

const buildBlockEditTarget = (doc, selectionOrRange, { includeFingerprint = false, matchKind = '', locatorText = '', locatorLabel = '' } = {}) => {
  if (!doc || !selectionOrRange) return null;

  let from = Number(selectionOrRange?.from);
  let to = Number(selectionOrRange?.to);

  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    const $from = selectionOrRange?.$from;
    if (!$from?.parent) return null;
    from = $from.start();
    to = $from.end();
  }

  if (!Number.isInteger(from) || !Number.isInteger(to) || from >= to) return null;

  const target = {
    kind: 'block',
    from,
    to,
    targetId: buildStableEditTargetId({ kind: 'block', from, to, locatorText }),
    text: doc.textBetween(from, to, ' '),
    matchKind,
    locatorText,
    locatorLabel,
  };

  return includeFingerprint ? { ...target, ...buildEditTargetFingerprint(doc, from, to) } : target;
};

const resolveReviewPlanSectionTarget = (doc, { locator = '', originalText = '', title = '' } = {}) => {
  if (!doc) return null;
  const sections = collectHeadingSections(doc);
  if (!sections.length) return null;

  const normalizedLocator = normalizeStructuralEditText(locator);
  const normalizedOriginalText = normalizeStructuralEditText(originalText);
  const directSection = normalizedLocator
    ? resolveUniqueDocumentMatch(sections, [
      (item) => item.normalizedHeadingText === normalizedLocator,
      (item) => item.normalizedHeadingText.includes(normalizedLocator),
      (item) => normalizedLocator.includes(item.normalizedHeadingText),
    ])
    : null;
  const fallbackSection = !directSection && normalizedOriginalText
    ? resolveUniqueDocumentMatch(sections, [
      (item) => item.normalizedSectionText.includes(normalizedOriginalText),
    ])
    : null;
  const resolvedSection = directSection || fallbackSection;
  if (!resolvedSection) return null;

  return buildSectionEditTarget(doc, resolvedSection, {
    includeFingerprint: true,
    matchKind: 'review-plan-section',
    locatorText: locator || title,
    locatorLabel: locator || title,
  });
};

const buildReviewPlanTextMatchVariants = (value = '') => {
  const normalized = normalizeStructuralEditText(value);
  if (!normalized) return [];
  const variants = new Set([normalized]);
  const withoutOuterEllipsis = normalized
    .replace(/^(?:\.{2,}|…)+\s*/u, '')
    .replace(/\s*(?:\.{2,}|…)+$/u, '')
    .trim();
  if (withoutOuterEllipsis) variants.add(withoutOuterEllipsis);
  normalized
    .split(/(?:\.{2,}|…)/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 24)
    .forEach((part) => variants.add(part));
  return [...variants].sort((left, right) => right.length - left.length);
};

const resolveReviewPlanBlockTarget = (doc, { locator = '', originalText = '', matchStrategy = 'contains', title = '' } = {}, sectionTarget = null) => {
  if (!doc) return null;
  const normalizedLocator = normalizeStructuralEditText(locator);
  const normalizedOriginalText = normalizeStructuralEditText(originalText);
  const locatorVariants = buildReviewPlanTextMatchVariants(locator);
  const originalTextVariants = buildReviewPlanTextMatchVariants(originalText);
  const matchesAnyVariant = (item, variants, mode = 'contains') => {
    const text = String(item?.normalizedText || '');
    if (!text || !Array.isArray(variants) || !variants.length) return false;
    return variants.some((variant) => (mode === 'startsWith' ? text.startsWith(variant) : text.includes(variant)));
  };
  const candidateBlocks = collectCandidateTextBlocks(doc, {
    minTextLength: normalizedOriginalText ? 1 : MIN_CANDIDATE_BLOCK_TEXT_LENGTH,
  }).filter((block) => {
    if (!sectionTarget) return true;
    return block.from >= sectionTarget.from && block.to <= sectionTarget.to;
  });
  if (!candidateBlocks.length) return null;

  const candidatePassageMaxBlocks = normalizedOriginalText
    ? Math.max(4, Math.min(12, Math.ceil(normalizedOriginalText.length / 220)))
    : 3;
  const candidatePassages = collectCandidateBlockPassages(doc, candidateBlocks, {
    maxBlocks: candidatePassageMaxBlocks,
  });
  if (!candidatePassages.length) return null;
  const isSingleBlockCandidate = (item) => !Number.isInteger(item?.blockCount) || Number(item.blockCount) <= 1;
  const multiBlockCandidates = candidatePassages.filter((item) => !isSingleBlockCandidate(item));

  const orderedMatchers = matchStrategy === 'startsWith'
    ? [
      normalizedOriginalText ? (item) => item.normalizedText === normalizedOriginalText : null,
      originalTextVariants.length ? (item) => isSingleBlockCandidate(item) && matchesAnyVariant(item, originalTextVariants, 'startsWith') : null,
      locatorVariants.length ? (item) => isSingleBlockCandidate(item) && matchesAnyVariant(item, locatorVariants, 'startsWith') : null,
      originalTextVariants.length ? (item) => isSingleBlockCandidate(item) && matchesAnyVariant(item, originalTextVariants, 'contains') : null,
      locatorVariants.length ? (item) => isSingleBlockCandidate(item) && matchesAnyVariant(item, locatorVariants, 'contains') : null,
    ]
    : [
      normalizedOriginalText ? (item) => item.normalizedText === normalizedOriginalText : null,
      originalTextVariants.length ? (item) => isSingleBlockCandidate(item) && matchesAnyVariant(item, originalTextVariants, 'contains') : null,
      originalTextVariants.length ? (item) => isSingleBlockCandidate(item) && matchesAnyVariant(item, originalTextVariants, 'startsWith') : null,
      locatorVariants.length ? (item) => isSingleBlockCandidate(item) && matchesAnyVariant(item, locatorVariants, 'contains') : null,
      locatorVariants.length ? (item) => isSingleBlockCandidate(item) && matchesAnyVariant(item, locatorVariants, 'startsWith') : null,
    ];
  let block = resolveUniqueDocumentMatch(candidatePassages, orderedMatchers.filter(Boolean));
  if (!block && multiBlockCandidates.length) {
    const allowMultiBlockFallback = sectionTarget
      || normalizedOriginalText.length >= 80
      || normalizedLocator.length >= MIN_PROMPT_BLOCK_LOCATOR_LENGTH;
    if (allowMultiBlockFallback) {
    const passageFallbackMatchers = matchStrategy === 'startsWith'
      ? [
        originalTextVariants.length ? (item) => matchesAnyVariant(item, originalTextVariants, 'startsWith') : null,
        locatorVariants.length ? (item) => matchesAnyVariant(item, locatorVariants, 'contains') : null,
      ]
      : [
        originalTextVariants.length ? (item) => matchesAnyVariant(item, originalTextVariants, 'contains') : null,
        locatorVariants.length ? (item) => matchesAnyVariant(item, locatorVariants, 'contains') : null,
      ];
      block = resolveUniqueDocumentMatch(multiBlockCandidates, passageFallbackMatchers.filter(Boolean));
    }
  }
  if (!block) return null;

  return buildBlockEditTarget(doc, block, {
    includeFingerprint: true,
    matchKind: 'review-plan-block',
    locatorText: locator || originalText || title,
    locatorLabel: locator || title || originalText,
  });
};

const normalizeReviewPlanEditOperation = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['insert_before', 'before', 'prepend'].includes(normalized)) return 'insert_before';
  if (['insert_after', 'after', 'append', 'add_after', 'add'].includes(normalized)) return 'insert_after';
  if (['needs_review', 'review', 'manual_review', 'manual'].includes(normalized)) return 'needs_review';
  return 'replace';
};

const normalizeReviewPlanTargetConfidence = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) return '';
  if (['high', 'גבוה', 'גבוהה', 'strong', 'certain', 'exact'].includes(normalized)) return 'high';
  if (['low', 'נמוך', 'נמוכה', 'weak', 'uncertain', 'ambiguous'].includes(normalized)) return 'low';
  return 'medium';
};

const escapeReviewPlanHtmlText = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizeReviewPlanInsertionHtml = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/<\/?[a-z][^>]*>/i.test(text)) return text;
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeReviewPlanHtmlText(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
};

const serializeReviewPlanTargetHtml = (doc, target = null) => {
  if (!doc || !target || typeof document === 'undefined') return '';
  const from = Number(target.from);
  const to = Number(target.to);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from >= to || from < 0 || to > doc.content.size) return '';

  const serializer = DOMSerializer.fromSchema(doc.type.schema);
  const fragment = serializer.serializeFragment(doc.slice(from, to).content);
  const container = document.createElement('div');
  container.appendChild(fragment);
  return container.innerHTML;
};

const buildReviewPlanReplacementText = (descriptor = {}, target = null, doc = null) => {
  const rawReplacement = String(descriptor?.replacement || descriptor?.replacementText || '').trim();
  if (!rawReplacement || !target?.text) return rawReplacement;

  const operation = normalizeReviewPlanEditOperation(descriptor?.operation || descriptor?.action || descriptor?.placement);
  const originalHtml = operation === 'replace' ? '' : serializeReviewPlanTargetHtml(doc, target);
  const insertionHtml = operation === 'replace' ? '' : normalizeReviewPlanInsertionHtml(rawReplacement);
  if (originalHtml && insertionHtml) {
    return operation === 'insert_before'
      ? `${insertionHtml}${originalHtml}`
      : `${originalHtml}${insertionHtml}`;
  }

  if (operation === 'insert_before') {
    return `${rawReplacement}\n\n${String(target.text || '').trimStart()}`.trim();
  }
  if (operation === 'insert_after') {
    return `${String(target.text || '').trimEnd()}\n\n${rawReplacement}`.trim();
  }
  return rawReplacement;
};

const scoreReviewPlanEditForSameTarget = (entry = {}) => {
  const replacementLength = String(entry?.replacementText || '').trim().length;
  const reasonLength = String(entry?.reason || '').trim().length;
  const operationBonus = normalizeReviewPlanEditOperation(entry?.operation) === 'replace' ? 16 : 0;
  return replacementLength + Math.min(reasonLength, 240) + operationBonus;
};

const doEditRangesOverlap = (left = null, right = null) => Boolean(
  left && right && left.from < right.to && right.from < left.to,
);

const isEditRangeContainedBy = (inner = null, outer = null) => Boolean(
  inner && outer && inner.from >= outer.from && inner.to <= outer.to,
);

const scoreReviewPlanEditForOverlap = (entry = {}) => {
  return scoreReviewPlanEditForSameTarget(entry);
};

const choosePreferredOverlappingReviewPlanEdit = (left = {}, right = {}) => {
  const leftRange = resolveNumericEditRange(left?.target);
  const rightRange = resolveNumericEditRange(right?.target);
  if (isEditRangeContainedBy(leftRange, rightRange)) return left;
  if (isEditRangeContainedBy(rightRange, leftRange)) return right;
  return scoreReviewPlanEditForOverlap(left) >= scoreReviewPlanEditForOverlap(right) ? left : right;
};

const normalizeReviewPlanVisibleText = (value = '') => String(value || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const REVIEW_PLAN_COMMON_TERMS = new Set([
  'של', 'על', 'עם', 'את', 'זה', 'זאת', 'הוא', 'היא', 'הם', 'הן', 'כל', 'לא', 'גם', 'או', 'אם', 'כי', 'כדי', 'בין', 'אשר', 'the', 'and', 'that', 'with', 'from', 'this', 'there', 'were', 'have', 'into', 'their',
]);

const extractReviewPlanContentTerms = (value = '') => Array.from(new Set(
  normalizeReviewPlanVisibleText(value)
    .toLowerCase()
    .match(/[\p{L}\p{N}]{3,}/gu) || [],
)).filter((term) => term.length >= 4 && !REVIEW_PLAN_COMMON_TERMS.has(term));

const getReviewPlanReplacementAffinity = (targetText = '', replacementText = '') => {
  const targetTerms = extractReviewPlanContentTerms(targetText);
  const replacementTerms = extractReviewPlanContentTerms(replacementText);
  if (!targetTerms.length || !replacementTerms.length) {
    return { replacementCoverage: 0, targetCoverage: 0, sharedCount: 0 };
  }

  const targetSet = new Set(targetTerms);
  const sharedCount = replacementTerms.filter((term) => targetSet.has(term)).length;
  return {
    replacementCoverage: sharedCount / replacementTerms.length,
    targetCoverage: sharedCount / targetTerms.length,
    sharedCount,
  };
};

const isSuspiciousBroadReviewPlanReplacement = (entry = {}) => {
  const operation = normalizeReviewPlanEditOperation(entry?.operation);
  if (operation !== 'replace') return false;

  const targetText = normalizeReviewPlanVisibleText(entry?.target?.text || '');
  const replacementText = normalizeReviewPlanVisibleText(entry?.replacementText || '');
  if (targetText.length < 1200) return false;
  const affinity = getReviewPlanReplacementAffinity(targetText, replacementText);
  const lowAffinity = affinity.sharedCount < 4 || (affinity.replacementCoverage < 0.22 && affinity.targetCoverage < 0.08);
  const heavyShrink = replacementText.length < Math.floor(targetText.length * 0.55);
  const tinyReplacement = replacementText.length < 260;
  return lowAffinity || ((tinyReplacement || heavyShrink) && (affinity.replacementCoverage < 0.35 || affinity.targetCoverage < 0.12));
};

const isMediumConfidenceReviewPlanEditTooBroad = (entry = {}) => {
  if (normalizeReviewPlanTargetConfidence(entry?.targetConfidence) !== 'medium') return false;

  const range = resolveNumericEditRange(entry?.target);
  const span = range ? range.to - range.from : 0;
  const targetText = normalizeReviewPlanVisibleText(entry?.target?.text || '');
  const replacementText = normalizeReviewPlanVisibleText(entry?.replacementText || '');
  const operation = normalizeReviewPlanEditOperation(entry?.operation);
  if (operation === 'insert_before' || operation === 'insert_after') {
    return replacementText.length > 900;
  }

  return String(entry?.target?.kind || '') === 'section'
    || span > 1700
    || targetText.length > 900
    || replacementText.length > 1100;
};

const mergeOverlappingReviewPlanEdits = (edits = []) => {
  const resolved = [];
  const overlapped = [];
  (Array.isArray(edits) ? edits : []).forEach((entry) => {
    const entryRange = resolveNumericEditRange(entry?.target);
    if (!entryRange) return;
    const overlappingIndexes = resolved
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => doEditRangesOverlap(entryRange, resolveNumericEditRange(item?.target)));

    if (!overlappingIndexes.length) {
      resolved.push(entry);
      return;
    }

    const candidateLoses = overlappingIndexes.some(({ item }) => choosePreferredOverlappingReviewPlanEdit(item, entry) === item);
    if (candidateLoses) {
      overlapped.push({
        suggestionId: String(entry?.suggestionId || '').trim(),
        title: String(entry?.title || entry?.target?.locatorLabel || 'תיקון חופף').trim(),
        overlap: true,
      });
      return;
    }

    let candidate = entry;
    overlappingIndexes.forEach(({ item }) => {
      candidate = {
        ...candidate,
        title: [candidate.title, item.title].filter(Boolean).join(' + '),
        reason: [candidate.reason, item.reason].filter(Boolean).join('\n'),
        mergedOverlapCount: Math.max(1, Number(candidate.mergedOverlapCount || 1)) + Math.max(1, Number(item.mergedOverlapCount || 1)),
      };
      overlapped.push({
        suggestionId: String(item?.suggestionId || '').trim(),
        title: String(item?.title || item?.target?.locatorLabel || 'תיקון חופף').trim(),
        overlap: true,
      });
    });
    const indexesToRemove = new Set(overlappingIndexes.map(({ index }) => index));
    for (let index = resolved.length - 1; index >= 0; index -= 1) {
      if (indexesToRemove.has(index)) resolved.splice(index, 1);
    }
    resolved.push(candidate);
  });
  return { resolved, overlapped };
};

const mergeDuplicateReviewPlanEdits = (edits = []) => {
  const merged = new Map();
  (Array.isArray(edits) ? edits : []).forEach((entry) => {
    const key = buildCanonicalEditRegionKey(entry?.target) || String(entry?.targetId || '').trim();
    if (!key) return;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, entry);
      return;
    }

    const preferred = scoreReviewPlanEditForSameTarget(entry) >= scoreReviewPlanEditForSameTarget(existing) ? entry : existing;
    const secondary = preferred === entry ? existing : entry;
    merged.set(key, {
      ...preferred,
      title: [preferred.title, secondary.title].filter(Boolean).join(' + '),
      reason: [preferred.reason, secondary.reason].filter(Boolean).join('\n'),
      mergedDuplicateCount: Math.max(1, Number(preferred.mergedDuplicateCount || 1)) + Math.max(1, Number(secondary.mergedDuplicateCount || 1)),
    });
  });
  return [...merged.values()];
};

const resolveReviewActionPlanEdits = (doc, descriptors = []) => {
  const resolved = [];
  const unresolved = [];

  (Array.isArray(descriptors) ? descriptors : []).slice(0, REVIEW_ACTION_PLAN_EDIT_LIMIT).forEach((descriptor, index) => {
    const descriptorTitle = String(descriptor?.title || descriptor?.locator || descriptor?.originalText || `תיקון ${index + 1}`).trim();
    const suggestionId = String(descriptor?.suggestionId || descriptor?.id || '').trim();
    const operation = normalizeReviewPlanEditOperation(descriptor?.operation || descriptor?.action || descriptor?.placement);
    const targetConfidence = normalizeReviewPlanTargetConfidence(descriptor?.targetConfidence || descriptor?.confidence || descriptor?.locationConfidence || descriptor?.mappingConfidence);
    const rawReplacementText = String(descriptor?.replacement || descriptor?.replacementText || '').trim();
    if (!rawReplacementText && operation !== 'needs_review' && targetConfidence !== 'low') return;

    const prefersSection = String(descriptor?.targetType || '').trim() === 'section';
    const sectionTarget = resolveReviewPlanSectionTarget(doc, descriptor || {});
    const target = prefersSection
      ? sectionTarget
      : resolveReviewPlanBlockTarget(doc, descriptor || {}, sectionTarget);

    if (!target?.text?.trim()) {
      unresolved.push({ suggestionId, title: descriptorTitle });
      return;
    }

    if (operation === 'needs_review' || targetConfidence === 'low') {
      unresolved.push({ suggestionId, title: descriptorTitle, targetConfidence, needsReview: true });
      return;
    }

    const replacementText = buildReviewPlanReplacementText({ ...descriptor, replacement: rawReplacementText, operation }, target, doc);
    if (!replacementText.trim()) return;

    const resolvedEntry = {
      target,
      targetId: target.targetId,
      replacementText,
      operation,
      targetConfidence,
      suggestionId,
      title: descriptorTitle,
      reason: String(descriptor?.reason || '').trim(),
    };

    if (isMediumConfidenceReviewPlanEditTooBroad(resolvedEntry)) {
      unresolved.push({ suggestionId, title: descriptorTitle, targetConfidence, mediumConfidenceTooBroad: true });
      return;
    }

    if (isSuspiciousBroadReviewPlanReplacement(resolvedEntry)) {
      unresolved.push({ suggestionId, title: descriptorTitle, broadReplacementBlocked: true });
      return;
    }

    resolved.push(resolvedEntry);
  });

  const dedupedResolved = mergeDuplicateReviewPlanEdits(resolved);
  const overlapMerge = mergeOverlappingReviewPlanEdits(dedupedResolved);
  const resolvedSuggestionIds = new Set(
    overlapMerge.resolved.map((item) => String(item?.suggestionId || '').trim()).filter(Boolean),
  );
  const resolvedTitles = new Set(
    overlapMerge.resolved.map((item) => normalizeStructuralEditText(item?.title || '')).filter(Boolean),
  );
  const unresolvedOnly = [...unresolved, ...overlapMerge.overlapped].filter((item) => {
    const suggestionId = String(item?.suggestionId || '').trim();
    if (suggestionId) return !resolvedSuggestionIds.has(suggestionId);
    const title = normalizeStructuralEditText(item?.title || '');
    return !(title && resolvedTitles.has(title));
  });
  return { resolved: overlapMerge.resolved, unresolved: unresolvedOnly };
};

const buildBlockedQuotedBlockEditTarget = (referenceText = '') => ({
  kind: 'blocked-quoted-block',
  from: 0,
  to: 0,
  targetId: 'blocked-quoted-block',
  text: '__blocked_quoted_block_reference__',
  before: '',
  after: '',
  matchKind: UNRESOLVED_EXPLICIT_QUOTED_BLOCK_MATCH_KIND,
  locatorText: referenceText,
  locatorLabel: referenceText ? `"${referenceText}"` : 'הפניה מצוטטת',
});

const resolveQuotedBlockReferences = (doc, promptText = '', { includeFreeQuoted = false } = {}) => {
  const sourceText = String(promptText || '').trim();
  if (!doc || !sourceText) {
    return { targets: [], unresolvedReferences: [] };
  }

  const blocks = collectCandidateTextBlocks(doc);
  if (!blocks.length) {
    return { targets: [], unresolvedReferences: [] };
  }

  const references = collectQuotedBlockReferences(sourceText, { includeFreeQuoted });
  if (!references.length) {
    return { targets: [], unresolvedReferences: [] };
  }

  const matchUniqueBlock = (predicate) => {
    const matches = blocks.filter(predicate);
    return matches.length === 1 ? matches[0] : null;
  };
  const buildResolvedTarget = (block, metadata = {}) => buildBlockEditTarget(doc, block, {
    includeFingerprint: true,
    matchKind: metadata.matchKind || '',
    locatorText: metadata.locatorText || '',
    locatorLabel: metadata.locatorLabel || metadata.locatorText || '',
  });
  const resolvedTargets = [];
  const unresolvedReferences = [];

  references.forEach((reference) => {
    const block = reference.matchKind === 'block-starts-with'
      ? matchUniqueBlock((candidate) => candidate.normalizedText.startsWith(reference.normalized))
      : matchUniqueBlock((candidate) => candidate.normalizedText.includes(reference.normalized));
    if (!block) {
      if (isBlockingQuotedBlockReference(reference.matchKind)) {
        unresolvedReferences.push(reference);
      }
      return;
    }
    resolvedTargets.push(buildResolvedTarget(block, {
      matchKind: reference.matchKind,
      locatorText: reference.text,
      locatorLabel: reference.matchKind === 'block-starts-with'
        ? `מתחיל ב־"${reference.text}"`
        : `"${reference.text}"`,
    }));
  });

  return {
    targets: dedupeResolvedEditTargets(resolvedTargets),
    unresolvedReferences,
  };
};

const resolveBlockEditTargets = (doc, promptText = '') => {
  const sourceText = String(promptText || '').trim();
  if (!doc || !sourceText) return [];

  return resolveQuotedBlockReferences(doc, sourceText, {
    includeFreeQuoted: !hasExplicitStructuralEditReference(sourceText),
  }).targets;
};

const resolveBlockEditTarget = (doc, promptText = '') => {
  const sourceText = String(promptText || '').trim();
  const { targets, unresolvedReferences } = resolveQuotedBlockReferences(doc, sourceText, {
    includeFreeQuoted: !hasExplicitStructuralEditReference(sourceText),
  });
  if (unresolvedReferences.length) {
    return buildBlockedQuotedBlockEditTarget(unresolvedReferences[0]?.text || '');
  }
  return targets.length === 1 ? targets[0] : null;
};

const buildEditTargetFromState = (editorState, options = {}) => {
  if (!editorState?.doc || !editorState?.selection) return { ...EMPTY_EDIT_TARGET };

  const selection = buildSelectionEditTarget(editorState.doc, editorState.selection, options);
  const block = buildBlockEditTarget(editorState.doc, editorState.selection, options);

  return {
    selection,
    block,
    active: selection || block,
  };
};

const isEditTargetStillSafe = (editorState, target) => {
  if (!editorState?.doc || !target) return false;

  const { doc } = editorState;
  const from = Number(target.from);
  const to = Number(target.to);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from >= to || from < 0 || to > doc.content.size) {
    return false;
  }

  if (doc.textBetween(from, to, ' ') !== String(target.text || '')) {
    return false;
  }

  const expectedSliceJson = typeof target.sliceJson === 'string' ? target.sliceJson : '';
  const expectedNormalizedHtml = typeof target.normalizedHtml === 'string' ? target.normalizedHtml : '';
  if (expectedSliceJson || expectedNormalizedHtml) {
    const fingerprint = buildEditTargetFingerprint(doc, from, to);
    if (expectedSliceJson && fingerprint.sliceJson !== expectedSliceJson) {
      return false;
    }
    if (expectedNormalizedHtml && fingerprint.normalizedHtml !== expectedNormalizedHtml) {
      return false;
    }
  }

  if (target.kind === 'selection') {
    const docEnd = doc.content.size;
    const before = doc.textBetween(Math.max(0, from - MAGIC_WAND_SELECTION_CONTEXT_SIDE), from, ' ').trim();
    const after = doc.textBetween(to, Math.min(docEnd, to + MAGIC_WAND_SELECTION_CONTEXT_SIDE), ' ').trim();
    if (before !== String(target.before || '')) return false;
    if (after !== String(target.after || '')) return false;
  }

  return true;
};

const LIVE_GENERATION_SHELL_MARKER = 'data-wordai-live-generation-shell="true"';
const LIVE_GENERATION_ERROR_PLACEHOLDER_MARKER = 'data-wordai-live-generation-error-placeholder="true"';
const DOCUMENT_ARRIVAL_PULSE_DURATION_MS = 950;
const START_SCREEN_TRANSITION_DURATION_MS = 1800;
const START_SCREEN_TRANSITION_APPROACH_START = 76;
const START_SCREEN_TRANSITION_IMPACT_START = 82;
const START_SCREEN_TRANSITION_IMPACT_CENTER_X = '51%';
const START_SCREEN_TRANSITION_IMPACT_CENTER_Y = '52%';
const START_SCREEN_TRANSITION_IMPACT_START_MS = Math.round(
  START_SCREEN_TRANSITION_DURATION_MS * (START_SCREEN_TRANSITION_IMPACT_START / 100)
);
const START_SCREEN_TRANSITION_ROCKET_SCENE_WIDTH_PX = 240;
const START_SCREEN_TRANSITION_ROCKET_SCENE_HEIGHT_PX = 96;
const START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_X_PX = 228;
const START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_Y_PX = 44;
const START_SCREEN_TRANSITION_ROCKET_START_LEFT = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_X} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_X_PX}px - 75%)`;
const START_SCREEN_TRANSITION_ROCKET_START_TOP = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_Y} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_Y_PX}px + 6%)`;
const START_SCREEN_TRANSITION_ROCKET_MID_LEFT = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_X} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_X_PX}px - 47%)`;
const START_SCREEN_TRANSITION_ROCKET_MID_TOP = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_Y} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_Y_PX}px - 2%)`;
const START_SCREEN_TRANSITION_ROCKET_CRUISE_LEFT = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_X} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_X_PX}px - 23%)`;
const START_SCREEN_TRANSITION_ROCKET_CRUISE_TOP = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_Y} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_Y_PX}px - 12%)`;
const START_SCREEN_TRANSITION_ROCKET_IMPACT_LEFT = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_X} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_X_PX}px)`;
const START_SCREEN_TRANSITION_ROCKET_IMPACT_TOP = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_Y} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_Y_PX}px)`;
const START_SCREEN_TRANSITION_ROCKET_APPROACH_LEFT = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_X} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_X_PX + 76}px)`;
const START_SCREEN_TRANSITION_ROCKET_APPROACH_TOP = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_Y} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_Y_PX + 72}px)`;
const getStartScreenTransitionDelayMs = (offsetMs = 0) => `${START_SCREEN_TRANSITION_IMPACT_START_MS + offsetMs}ms`;

const getPrefersReducedMotion = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const START_SCREEN_TRANSITION_PARTICLES = [
  { id: 'a', size: 14, left: '50%', top: '50%', angle: '-84deg', distance: '236px', delay: getStartScreenTransitionDelayMs(-22), color: '#FFFFFF' },
  { id: 'b', size: 12, left: '50%', top: '50%', angle: '-52deg', distance: '284px', delay: getStartScreenTransitionDelayMs(-6), color: '#FDE68A' },
  { id: 'c', size: 16, left: '50%', top: '50%', angle: '-18deg', distance: '328px', delay: getStartScreenTransitionDelayMs(6), color: '#FB7185' },
  { id: 'd', size: 13, left: '50%', top: '50%', angle: '18deg', distance: '344px', delay: getStartScreenTransitionDelayMs(18), color: '#FDBA74' },
  { id: 'e', size: 15, left: '50%', top: '50%', angle: '54deg', distance: '286px', delay: getStartScreenTransitionDelayMs(10), color: '#FFFFFF' },
  { id: 'f', size: 14, left: '50%', top: '50%', angle: '92deg', distance: '250px', delay: getStartScreenTransitionDelayMs(-2), color: '#FDBA74' },
  { id: 'g', size: 16, left: '50%', top: '50%', angle: '132deg', distance: '318px', delay: getStartScreenTransitionDelayMs(24), color: '#FDE68A' },
  { id: 'h', size: 13, left: '50%', top: '50%', angle: '174deg', distance: '360px', delay: getStartScreenTransitionDelayMs(32), color: '#F8FAFC' },
  { id: 'i', size: 12, left: '50%', top: '50%', angle: '214deg', distance: '274px', delay: getStartScreenTransitionDelayMs(4), color: '#FB7185' },
  { id: 'j', size: 11, left: '50%', top: '50%', angle: '248deg', distance: '312px', delay: getStartScreenTransitionDelayMs(40), color: '#FDBA74' },
  { id: 'k', size: 13, left: '50%', top: '50%', angle: '286deg', distance: '294px', delay: getStartScreenTransitionDelayMs(16), color: '#FFFFFF' },
  { id: 'l', size: 15, left: '50%', top: '50%', angle: '324deg', distance: '332px', delay: getStartScreenTransitionDelayMs(28), color: '#FDE68A' },
];

const isCanceledImportedDocumentPayload = (payload = null) => (
  payload?.canceled === true || payload?.cancelled === true
);

const createDocumentSessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

function StartScreenTransitionOverlay() {
  return (
    <div
      aria-hidden="true"
      className="wordai-start-transition"
      style={{
        '--wordai-start-transition-duration': `${START_SCREEN_TRANSITION_DURATION_MS}ms`,
        position: 'absolute',
        inset: 0,
        zIndex: 35,
        pointerEvents: 'none',
        overflow: 'hidden',
        isolation: 'isolate',
      }}
    >
      <style>{`
        @keyframes wordai-start-transition-backdrop {
          0% { opacity: 0; transform: scale(1.08); }
          8% { opacity: 1; }
          72% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.98); }
        }
        @keyframes wordai-start-transition-flight {
          0% { opacity: 0; left: ${START_SCREEN_TRANSITION_ROCKET_START_LEFT}; top: ${START_SCREEN_TRANSITION_ROCKET_START_TOP}; transform: rotate(-12deg) scale(0.72); }
          8% { opacity: 1; }
          34% { left: ${START_SCREEN_TRANSITION_ROCKET_MID_LEFT}; top: ${START_SCREEN_TRANSITION_ROCKET_MID_TOP}; transform: rotate(-15deg) scale(0.8); }
          58% { left: ${START_SCREEN_TRANSITION_ROCKET_CRUISE_LEFT}; top: ${START_SCREEN_TRANSITION_ROCKET_CRUISE_TOP}; transform: rotate(-10deg) scale(0.88); }
          ${START_SCREEN_TRANSITION_APPROACH_START}% { opacity: 1; left: ${START_SCREEN_TRANSITION_ROCKET_APPROACH_LEFT}; top: ${START_SCREEN_TRANSITION_ROCKET_APPROACH_TOP}; transform: rotate(8deg) scale(0.96); }
          ${START_SCREEN_TRANSITION_IMPACT_START}% { opacity: 0; left: ${START_SCREEN_TRANSITION_ROCKET_IMPACT_LEFT}; top: ${START_SCREEN_TRANSITION_ROCKET_IMPACT_TOP}; transform: rotate(12deg) scale(0.99); }
          100% { opacity: 0; left: ${START_SCREEN_TRANSITION_ROCKET_IMPACT_LEFT}; top: ${START_SCREEN_TRANSITION_ROCKET_IMPACT_TOP}; transform: rotate(12deg) scale(0.99); }
        }
        @keyframes wordai-start-transition-trail {
          0% { opacity: 0.3; transform: scaleX(0.72); }
          100% { opacity: 0.95; transform: scaleX(1); }
        }
        @keyframes wordai-start-transition-smoke {
          0% { opacity: 0.18; transform: translate(0, 0) scale(0.6); }
          100% { opacity: 0.62; transform: translate(-42px, 4px) scale(1.15); }
        }
        @keyframes wordai-start-transition-flash {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.18); }
          12% { opacity: 1; transform: translate(-50%, -50%) scale(0.8); }
          34% { opacity: 1; transform: translate(-50%, -50%) scale(1.52); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(3.8); }
        }
        @keyframes wordai-start-transition-burst {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.08); }
          18% { opacity: 1; }
          55% { opacity: 0.92; }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(2.55); }
        }
        @keyframes wordai-start-transition-ring {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.12); }
          10% { opacity: 0.98; }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(2.75); }
        }
        @keyframes wordai-start-transition-particle {
          0% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--particle-angle)) translateX(0px) scale(0.25); }
          14% { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--particle-angle)) translateX(var(--particle-distance)) scale(1.18); }
        }
        @keyframes wordai-start-transition-glow {
          0%, 54% { opacity: 0; transform: scale(0.84); }
          74% { opacity: 0.7; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.35); }
        }
        @keyframes wordai-start-transition-screen-flash {
          0% { opacity: 0; transform: scale(0.94); }
          24% { opacity: 0.88; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.04); }
        }
        @keyframes wordai-start-transition-heatwave {
          0% { opacity: 0; transform: scale(0.82); }
          28% { opacity: 0.7; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.18); }
        }
        @keyframes wordai-start-transition-shake {
          0% { transform: translate3d(0, 0, 0); }
          16% { transform: translate3d(-16px, 10px, 0) rotate(-0.5deg); }
          34% { transform: translate3d(14px, -10px, 0) rotate(0.45deg); }
          52% { transform: translate3d(-10px, 8px, 0) rotate(-0.3deg); }
          70% { transform: translate3d(8px, -6px, 0) rotate(0.2deg); }
          100% { transform: translate3d(0, 0, 0); }
        }
      `}</style>

      <div
        className="wordai-start-transition__backdrop"
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at ${START_SCREEN_TRANSITION_IMPACT_CENTER_X} ${START_SCREEN_TRANSITION_IMPACT_CENTER_Y}, rgba(255, 244, 214, 0.36) 0%, rgba(253, 186, 116, 0.26) 9%, rgba(251, 146, 60, 0.14) 18%, rgba(15, 23, 42, 0) 36%), linear-gradient(180deg, rgba(2, 6, 23, 0.08) 0%, rgba(2, 6, 23, 0.62) 100%)`,
          animation: 'wordai-start-transition-backdrop var(--wordai-start-transition-duration) cubic-bezier(0.22, 1, 0.36, 1) both',
        }}
      />

      <div
        className="wordai-start-transition__glow"
        style={{
          position: 'absolute',
          inset: '-24%',
          background: `radial-gradient(circle at ${START_SCREEN_TRANSITION_IMPACT_CENTER_X} ${START_SCREEN_TRANSITION_IMPACT_CENTER_Y}, rgba(255, 255, 255, 0.96) 0%, rgba(255, 244, 214, 0.9) 6%, rgba(253, 186, 116, 0.78) 12%, rgba(251, 146, 60, 0.3) 22%, rgba(255, 255, 255, 0) 40%)`,
          mixBlendMode: 'screen',
          animation: 'wordai-start-transition-glow var(--wordai-start-transition-duration) ease-out both',
        }}
      />

      <div
        className="wordai-start-transition__screen-flash"
        style={{
          position: 'absolute',
          inset: '-18%',
          background: `radial-gradient(circle at ${START_SCREEN_TRANSITION_IMPACT_CENTER_X} ${START_SCREEN_TRANSITION_IMPACT_CENTER_Y}, rgba(255,255,255,0.98) 0%, rgba(255,248,220,0.98) 8%, rgba(253,186,116,0.5) 18%, rgba(255,255,255,0) 40%), linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,248,220,0.08) 28%, rgba(255,255,255,0) 58%)`,
          mixBlendMode: 'screen',
          filter: 'blur(12px)',
          animation: `wordai-start-transition-screen-flash 320ms cubic-bezier(0.22, 1, 0.36, 1) ${getStartScreenTransitionDelayMs(-44)} both`,
        }}
      />

      <div
        className="wordai-start-transition__heatwave"
        style={{
          position: 'absolute',
          inset: '-24%',
          background: `radial-gradient(circle at ${START_SCREEN_TRANSITION_IMPACT_CENTER_X} ${START_SCREEN_TRANSITION_IMPACT_CENTER_Y}, rgba(255,255,255,0.82) 0%, rgba(253,186,116,0.56) 12%, rgba(251,146,60,0.26) 24%, rgba(255,255,255,0) 46%)`,
          mixBlendMode: 'screen',
          filter: 'blur(26px)',
          animation: `wordai-start-transition-heatwave 560ms cubic-bezier(0.16, 1, 0.3, 1) ${getStartScreenTransitionDelayMs(-4)} both`,
        }}
      />

      <div
        className="wordai-start-transition__rocket-wrap"
        style={{
          position: 'absolute',
          left: START_SCREEN_TRANSITION_ROCKET_START_LEFT,
          top: START_SCREEN_TRANSITION_ROCKET_START_TOP,
          width: `${START_SCREEN_TRANSITION_ROCKET_SCENE_WIDTH_PX}px`,
          height: `${START_SCREEN_TRANSITION_ROCKET_SCENE_HEIGHT_PX}px`,
          animation: 'wordai-start-transition-flight var(--wordai-start-transition-duration) cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        <div
          className="wordai-start-transition__rocket-scene"
          style={{
            position: 'relative',
            width: `${START_SCREEN_TRANSITION_ROCKET_SCENE_WIDTH_PX}px`,
            height: `${START_SCREEN_TRANSITION_ROCKET_SCENE_HEIGHT_PX}px`,
          }}
        >
          <div
            className="wordai-start-transition__trail"
            style={{
              position: 'absolute',
              right: '72px',
              top: '42px',
              width: '180px',
              height: '14px',
              borderRadius: '999px',
              background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.12), rgba(251,146,60,0.76), rgba(254,240,138,0.98))',
              filter: 'blur(7px)',
              transformOrigin: 'right center',
              animation: 'wordai-start-transition-trail 150ms ease-in-out infinite alternate',
            }}
          />
          <div
            className="wordai-start-transition__trail-hot"
            style={{
              position: 'absolute',
              right: '86px',
              top: '45px',
              width: '132px',
              height: '8px',
              borderRadius: '999px',
              background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.14), rgba(254,240,138,0.92), rgba(255,255,255,1))',
              filter: 'blur(4px)',
              transformOrigin: 'right center',
              animation: 'wordai-start-transition-trail 120ms ease-in-out infinite alternate-reverse',
            }}
          />
          <span
            style={{
              position: 'absolute',
              right: '182px',
              top: '32px',
              width: '36px',
              height: '36px',
              borderRadius: '999px',
              background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.32) 30%, rgba(255,255,255,0) 72%)',
              filter: 'blur(2px)',
              animation: 'wordai-start-transition-smoke 460ms ease-out infinite alternate',
            }}
          />
          <span
            style={{
              position: 'absolute',
              right: '208px',
              top: '40px',
              width: '52px',
              height: '52px',
              borderRadius: '999px',
              background: 'radial-gradient(circle, rgba(255,255,255,0.62) 0%, rgba(226,232,240,0.22) 40%, rgba(255,255,255,0) 76%)',
              filter: 'blur(4px)',
              animation: 'wordai-start-transition-smoke 620ms ease-out infinite alternate-reverse',
            }}
          />

          <svg
            viewBox="0 0 140 76"
            style={{
              position: 'absolute',
              right: '0',
              top: '6px',
              width: '140px',
              height: '76px',
              overflow: 'visible',
              filter: 'drop-shadow(0 10px 26px rgba(15, 23, 42, 0.34))',
            }}
          >
            <defs>
              <linearGradient id="wordai-start-transition-rocket-body" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#F8FAFC" />
                <stop offset="52%" stopColor="#E2E8F0" />
                <stop offset="100%" stopColor="#CBD5E1" />
              </linearGradient>
              <linearGradient id="wordai-start-transition-rocket-nose" x1="0%" y1="50%" x2="100%" y2="50%">
                <stop offset="0%" stopColor="#F97316" />
                <stop offset="100%" stopColor="#FB7185" />
              </linearGradient>
              <linearGradient id="wordai-start-transition-wing-top" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FB7185" />
                <stop offset="100%" stopColor="#F97316" />
              </linearGradient>
            </defs>
            <ellipse cx="56" cy="38" rx="36" ry="20" fill="url(#wordai-start-transition-rocket-body)" />
            <path d="M82 19 L128 38 L82 57 Z" fill="url(#wordai-start-transition-rocket-nose)" />
            <path d="M28 22 L8 12 L18 32 Z" fill="url(#wordai-start-transition-wing-top)" />
            <path d="M28 54 L8 64 L18 44 Z" fill="#F97316" />
            <path d="M18 30 L0 38 L18 46 Z" fill="#F8FAFC" opacity="0.9" />
            <circle cx="56" cy="38" r="8" fill="#0F172A" opacity="0.86" />
            <circle cx="56" cy="38" r="4" fill="#60A5FA" opacity="0.88" />
            <path d="M66 21 Q82 38 66 55" fill="none" stroke="#94A3B8" strokeWidth="3.5" strokeLinecap="round" opacity="0.7" />
          </svg>
        </div>
      </div>

      <div
        className="wordai-start-transition__impact"
        style={{
          position: 'absolute',
          left: START_SCREEN_TRANSITION_IMPACT_CENTER_X,
          top: START_SCREEN_TRANSITION_IMPACT_CENTER_Y,
          width: 'min(88vw, 820px)',
          height: 'min(88vw, 820px)',
          transform: 'translate(-50%, -50%)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '240px',
            height: '240px',
            borderRadius: '999px',
            background: 'radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,250,240,0.98) 16%, rgba(255,227,168,0.96) 28%, rgba(253,186,116,0.92) 44%, rgba(251,146,60,0.22) 72%, rgba(255,255,255,0) 100%)',
            filter: 'blur(2px)',
            mixBlendMode: 'screen',
            animation: `wordai-start-transition-flash 620ms ease-out ${getStartScreenTransitionDelayMs(-34)} both`,
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '430px',
            height: '430px',
            borderRadius: '999px',
            background: 'radial-gradient(circle, rgba(254,240,138,0.98) 0%, rgba(255,210,118,0.94) 18%, rgba(251,146,60,0.82) 36%, rgba(249,115,22,0.24) 58%, rgba(255,255,255,0) 100%)',
            filter: 'blur(8px)',
            animation: `wordai-start-transition-burst 720ms cubic-bezier(0.22, 1, 0.36, 1) ${getStartScreenTransitionDelayMs(-14)} both`,
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '620px',
            height: '620px',
            borderRadius: '999px',
            background: 'radial-gradient(circle, rgba(255,244,214,0.48) 0%, rgba(253,186,116,0.3) 24%, rgba(251,146,60,0.14) 40%, rgba(255,255,255,0) 72%)',
            filter: 'blur(18px)',
            mixBlendMode: 'screen',
            animation: `wordai-start-transition-burst 820ms cubic-bezier(0.22, 1, 0.36, 1) ${getStartScreenTransitionDelayMs(21)} both`,
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '240px',
            height: '240px',
            borderRadius: '999px',
            border: '3px solid rgba(255,255,255,0.96)',
            boxShadow: '0 0 30px rgba(255,255,255,0.34)',
            animation: `wordai-start-transition-ring 760ms ease-out ${getStartScreenTransitionDelayMs(6)} both`,
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '420px',
            height: '420px',
            borderRadius: '999px',
            border: '3px solid rgba(253,186,116,0.82)',
            boxShadow: '0 0 42px rgba(251,146,60,0.24)',
            animation: `wordai-start-transition-ring 900ms ease-out ${getStartScreenTransitionDelayMs(31)} both`,
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '620px',
            height: '620px',
            borderRadius: '999px',
            border: '2px solid rgba(255,255,255,0.52)',
            animation: `wordai-start-transition-ring 1120ms ease-out ${getStartScreenTransitionDelayMs(61)} both`,
          }}
        />
        {START_SCREEN_TRANSITION_PARTICLES.map((particle) => (
          <span
            key={particle.id}
            style={{
              '--particle-angle': particle.angle,
              '--particle-distance': particle.distance,
              position: 'absolute',
              left: particle.left,
              top: particle.top,
              width: particle.size,
              height: particle.size,
              borderRadius: '999px',
              background: particle.color,
              boxShadow: `0 0 24px ${particle.color}`,
              filter: 'blur(0.35px)',
              animation: `wordai-start-transition-particle 780ms cubic-bezier(0.22, 1, 0.36, 1) ${particle.delay} both`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

const escHtml = (txt) => String(txt ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const normalizeTrackedEditorHtml = (html = '') => String(html || '')
  .replace(/\r\n?/g, '\n')
  .replace(/>\s+</g, '><')
  .trim();

const LIVE_GENERATION_TIMEOUT_STATE = 'timeout';

const isLiveGenerationFailureState = (state = '') => (
  state === 'error' || state === LIVE_GENERATION_TIMEOUT_STATE
);

const classifyLiveGenerationTerminalState = (error, {
  errorPrompt = 'אירעה שגיאה בתהליך',
  timeoutPrompt = 'הבקשה ארכה יותר מדי זמן וההרצה הופסקה',
  fallbackAlertMessage = '',
  fallbackTimeoutAlertMessage = '',
} = {}) => {
  const isTimeout = isAiRequestTimeoutError(error);
  const errorMessage = String(error?.message || '').trim();

  return {
    state: isTimeout ? LIVE_GENERATION_TIMEOUT_STATE : 'error',
    prompt: isTimeout ? timeoutPrompt : errorPrompt,
    errorMessage,
    alertMessage: errorMessage || (isTimeout
      ? (fallbackTimeoutAlertMessage || timeoutPrompt)
      : (fallbackAlertMessage || errorPrompt)),
  };
};

const getLiveGenerationStateMeta = (state = 'running') => {
  if (state === 'success') {
    return {
      label: 'הושלם',
      title: 'המסמך מוכן',
      description: 'התוכן המלא נטען לעורך.',
      tone: '#047857',
      background: '#ECFDF5',
      border: '#A7F3D0',
    };
  }
  if (state === 'warning') {
    return {
      label: 'ממתין לאישור',
      title: 'המסמך מוכן לבדיקה',
      description: 'נוצרה טיוטה בטוחה שממתינה לעדכון או אישור.',
      tone: '#B45309',
      background: '#FFFBEB',
      border: '#FCD34D',
    };
  }
  if (state === LIVE_GENERATION_TIMEOUT_STATE) {
    return {
      label: 'פג זמן ההמתנה',
      title: 'זמן ההמתנה פג',
      description: 'הספק לא החזיר תשובה בזמן. אפשר לנסות שוב או להפעיל מחדש מהשלב שנכשל.',
      tone: '#C2410C',
      background: '#FFF7ED',
      border: '#FDBA74',
    };
  }
  if (state === 'error') {
    return {
      label: 'שגיאה',
      title: 'אירעה שגיאה בתהליך',
      description: 'ההרצה נעצרה לפני שהמסמך הושלם.',
      tone: '#B91C1C',
      background: '#FEF2F2',
      border: '#FCA5A5',
    };
  }
  return {
    label: 'בתהליך',
    title: 'בונה את המסמך בלייב',
    description: 'העורך מתעדכן כאן בכל פעם שמתקבל שלב או אירוע חדש מההרצה.',
    tone: '#1D4ED8',
    background: '#EFF6FF',
    border: '#BFDBFE',
  };
};

const formatLiveGenerationTime = (value) => {
  if (!value) return '--:--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const buildLiveGenerationStageMarkup = (stages = []) => {
  const recentStages = Array.isArray(stages) ? stages.slice(0, 5) : [];
  if (!recentStages.length) {
    return '<li style="padding:8px 10px;border:1px solid #DBEAFE;border-radius:10px;background:#FFFFFF;">מאתחל שלבי ריצה...</li>';
  }
  return recentStages.map((stage) => {
    const stateLabel = stage?.state === 'success'
      ? 'הושלם'
      : stage?.state === 'error'
        ? 'שגיאה'
        : stage?.state === 'running'
          ? 'רץ עכשיו'
          : 'ממתין';
    const stateColor = stage?.state === 'success'
      ? '#047857'
      : stage?.state === 'error'
        ? '#B91C1C'
        : stage?.state === 'running'
          ? '#1D4ED8'
          : '#64748B';
    return `<li style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:8px 10px;border:1px solid #DBEAFE;border-radius:10px;background:#FFFFFF;"><span style="font-weight:600;color:#0F172A;">${escHtml(stage?.label || 'שלב לא מזוהה')}</span><span style="font-size:12px;font-weight:700;color:${stateColor};white-space:nowrap;">${stateLabel}</span></li>`;
  }).join('');
};

const buildLiveGenerationLogMarkup = (logs = []) => {
  const recentLogs = Array.isArray(logs) ? logs.slice(0, 6) : [];
  if (!recentLogs.length) {
    return '<li style="padding:8px 10px;border:1px solid #E2E8F0;border-radius:10px;background:#FFFFFF;">ממתין לאירועים הראשונים של ההרצה...</li>';
  }
  return recentLogs.map((log, index) => {
    const logTime = formatLiveGenerationTime(log?.timestamp || log?.time || log?.ts);
    const logAgent = escHtml(log?.agentLabel || log?.agentId || 'מערכת');
    const logMessage = escHtml(log?.message || log?.type || 'עודכן סטטוס תהליך');
    return `<li style="padding:8px 10px;border:1px solid #E2E8F0;border-radius:10px;background:#FFFFFF;"><div style="display:flex;justify-content:space-between;gap:12px;font-size:11px;color:#64748B;margin-bottom:4px;"><span style="font-weight:700;color:#334155;">${logAgent}</span><span>${logTime}</span></div><div style="color:#0F172A;line-height:1.55;">${logMessage}</div></li>`;
  }).join('');
};

// ── עמוד שער ברירת-מחדל ─────────────────────────────────────────────────────
// אם המשתמש סימן "הוסף אוטומטית לכל מסמך חדש", מזריקים את תבנית עמוד השער האישית
// לפני התוכן, עם מילוי אוטומטי של השדות הידועים (קורס/מרצה/סוג מטלה/תאריך...).
const COVER_BLOCK_STRIP_RE = /<div data-cover-page="true">[\s\S]*?<\/div>\s*(<div data-type="page-break"><\/div>)?/i;
const TEMPLATE_ASSIGNMENT_LABELS = {
  academic: 'עבודה אקדמית',
  legal: 'מסמך משפטי',
  report: 'דוח',
  summary: 'סיכום',
  proposal: 'הצעה',
  letter: 'מכתב',
  office: 'מסמך',
};
const applyDefaultCoverPage = (html, overrides = {}) => {
  try {
    const profile = getPersonalStyleProfile();
    if (!profile?.coverTemplateAutoInsert) return html;
    const templateHtml = String(profile.coverTemplateHtml || '').trim();
    if (!templateHtml) return html;
    const body = String(html || '').replace(COVER_BLOCK_STRIP_RE, '').trim();
    let bodyTitle = '';
    try {
      const holder = document.createElement('div');
      holder.innerHTML = body;
      bodyTitle = (holder.textContent || '').split('\n').map((s) => s.trim()).find(Boolean) || '';
    } catch { bodyTitle = ''; }
    const filled = fillCoverTemplateTokens(templateHtml, profile, { title: bodyTitle, ...overrides });
    const coverBlock = /data-cover-page="true"/i.test(filled) ? filled : `<div data-cover-page="true">${filled}</div>`;
    return `${coverBlock}<div data-type="page-break"></div>${body || '<h1>כותרת פרק</h1><p></p>'}`;
  } catch { return html; }
};

const buildLiveGenerationShell = ({ titleText = 'מסמך חדש', state = 'running', stages = [], logs = [], runId = '' } = {}) => {
  const stateMeta = getLiveGenerationStateMeta(state);
  const safeRunId = escHtml(runId);
  return `
  <div ${LIVE_GENERATION_SHELL_MARKER} data-wordai-live-generation-run-id="${safeRunId}" data-wordai-live-generation-state="${escHtml(state)}" style="border:1px solid ${stateMeta.border};background:${stateMeta.background};padding:18px;border-radius:16px;margin-bottom:18px;">
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px;">
      <div>
        <p style="margin:0 0 6px 0;font-size:18px;font-weight:700;color:#0F172A;">${stateMeta.title}</p>
        <p style="margin:0;color:#334155;line-height:1.6;">${stateMeta.description}</p>
      </div>
      <div style="padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;color:${stateMeta.tone};background:#FFFFFF;border:1px solid ${stateMeta.border};white-space:nowrap;">${stateMeta.label}</div>
    </div>
    <h1 style="margin:0 0 10px 0;color:#0F172A;">${escHtml(titleText || 'מסמך חדש')}</h1>
    <p style="margin:0 0 14px 0;color:#334155;"><strong>סטטוס:</strong> ${stateMeta.label}</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;align-items:start;">
      <div>
        <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#0F172A;">שלבי הריצה האחרונים</p>
        <ul style="margin:0;padding:0;list-style:none;display:grid;gap:8px;">${buildLiveGenerationStageMarkup(stages)}</ul>
      </div>
      <div>
        <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#0F172A;">אירועים אחרונים</p>
        <ul style="margin:0;padding:0;list-style:none;display:grid;gap:8px;">${buildLiveGenerationLogMarkup(logs)}</ul>
      </div>
    </div>
  </div>
  <p style="margin:0;color:#475569;">התוכן המלא יחליף את ה־shell הזה אוטומטית כשההרצה תסתיים.</p>
`;
};

const isLiveGenerationShellHtml = (html = '', runId = '') => {
  const markup = String(html || '');
  if (!markup.includes(LIVE_GENERATION_SHELL_MARKER)) return false;
  if (!runId) return true;
  return markup.includes(`data-wordai-live-generation-run-id="${escHtml(runId)}"`);
};

const buildLiveGenerationErrorPlaceholder = ({ titleText = 'מסמך חדש', runId = '', state = 'error' } = {}) => {
  const safeRunId = escHtml(runId);
  const placeholderMessage = state === LIVE_GENERATION_TIMEOUT_STATE
    ? 'הבקשה ארכה יותר מדי זמן וההרצה הופסקה. אפשר לנסות שוב.'
    : 'אירעה שגיאה בזמן יצירת המסמך. אפשר לנסות שוב.';
  return `
  <div ${LIVE_GENERATION_ERROR_PLACEHOLDER_MARKER} data-wordai-live-generation-run-id="${safeRunId}">
    <h1>${escHtml(titleText || 'מסמך חדש')}</h1>
    <p>${escHtml(placeholderMessage)}</p>
  </div>
`;
};

const isLiveGenerationErrorPlaceholderHtml = (html = '', runId = '') => {
  const markup = String(html || '');
  if (!markup.includes(LIVE_GENERATION_ERROR_PLACEHOLDER_MARKER)) return false;
  if (!runId) return true;
  return markup.includes(`data-wordai-live-generation-run-id="${escHtml(runId)}"`);
};

const ASSIGNMENT_BRIEF_TITLE_PATTERN = /^(?:שם\s+הקורס|מטלה|עבודה|assignment|task)\b/i;
const ASSIGNMENT_BRIEF_BULLET_PATTERN = /^([•●▪◦▪■◆★\-\*])\s+(.*)$/u;
const ASSIGNMENT_BRIEF_NUMBERED_PATTERN = /^(\d{1,2})[.)]\s+(.*)$/u;
const ASSIGNMENT_BRIEF_HEBREW_ALPHA_PATTERN = /^([א-ת]{1,2})[.)]\s+(.*)$/u;
const ASSIGNMENT_BRIEF_SUBITEM_PATTERN = /^(?:[oO○◦▪▫■□\-*]|(?:[א-ת]{1,2}|\d{1,2})[.)])\s+(.*)$/u;

const parseAssignmentBriefBlocks = (value = '') => {
  const lines = String(value || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const blocks = [];

  lines.forEach((line, index) => {
    const bulletMatch = line.match(ASSIGNMENT_BRIEF_BULLET_PATTERN);
    const numberedMatch = line.match(ASSIGNMENT_BRIEF_NUMBERED_PATTERN);
    const hebrewAlphaMatch = line.match(ASSIGNMENT_BRIEF_HEBREW_ALPHA_PATTERN);
    const previous = blocks[blocks.length - 1] || null;

    if (index === 0 && !bulletMatch && !numberedMatch && (ASSIGNMENT_BRIEF_TITLE_PATTERN.test(line) || line.length <= 140)) {
      blocks.push({ type: 'title', text: line });
      return;
    }

    if (bulletMatch) {
      blocks.push({ type: 'bullet', marker: bulletMatch[1], text: bulletMatch[2].trim() });
      return;
    }

    if (numberedMatch) {
      blocks.push({ type: 'numbered', marker: numberedMatch[1], text: numberedMatch[2].trim() });
      return;
    }

    if (hebrewAlphaMatch) {
      const isSubitem = previous && (previous.type === 'numbered' || previous.type === 'hebrew-alpha' || previous.type === 'bullet');
      blocks.push({
        type: isSubitem ? 'subitem' : 'hebrew-alpha',
        marker: hebrewAlphaMatch[1],
        text: hebrewAlphaMatch[2].trim(),
      });
      return;
    }

    if (previous && previous.type === 'numbered' && ASSIGNMENT_BRIEF_SUBITEM_PATTERN.test(line)) {
      blocks.push({ type: 'subitem', marker: '•', text: line.replace(ASSIGNMENT_BRIEF_SUBITEM_PATTERN, '$1').trim() });
      return;
    }

    if (previous && ['bullet', 'numbered', 'hebrew-alpha', 'subitem', 'paragraph'].includes(previous.type)) {
      previous.text = `${previous.text} ${line}`.replace(/\s+/g, ' ').trim();
      return;
    }

    blocks.push({ type: 'paragraph', text: line });
  });

  return blocks;
};

const renderAssignmentBriefPreview = (blocks = []) => {
  if (!Array.isArray(blocks) || !blocks.length) {
    return (
      <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/85 px-5 py-8 text-center text-sm text-slate-500">
        עדיין לא הוזנו הוראות. אפשר לטעון קובץ או לעבור לעריכה ולהדביק טקסט ידנית.
      </div>
    );
  }

  return (
    <div className="rounded-[24px] border border-amber-200/80 bg-[linear-gradient(180deg,#fffdfa_0%,#ffffff_22%,#fffaf2_100%)] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
      <div className="space-y-3">
        {blocks.map((block, index) => {
          if (block.type === 'title') {
            return (
              <div key={`assignment-brief-title-${index}`} className="border-b border-amber-100 pb-3 text-[1.05rem] font-semibold leading-8 text-slate-900">
                {block.text}
              </div>
            );
          }

          if (block.type === 'numbered') {
            return (
              <div key={`assignment-brief-numbered-${index}`} className="flex items-start gap-3 rounded-[18px] bg-white/88 px-4 py-3 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-800">
                  {block.marker}
                </div>
                <div className="text-[15px] leading-8 text-slate-700">{block.text}</div>
              </div>
            );
          }

          if (block.type === 'hebrew-alpha') {
            return (
              <div key={`assignment-brief-hebrew-alpha-${index}`} className="flex items-start gap-3 rounded-[18px] bg-white/72 px-4 py-3">
                <div className="mt-0.5 flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-2 text-sm font-bold text-amber-800">
                  {block.marker}
                </div>
                <div className="text-[15px] leading-8 text-slate-700">{block.text}</div>
              </div>
            );
          }

          if (block.type === 'bullet') {
            return (
              <div key={`assignment-brief-bullet-${index}`} className="flex items-start gap-3 px-1">
                <div className="mt-3 h-2.5 w-2.5 shrink-0 rounded-full bg-slate-800" />
                <div className="text-[15px] leading-8 text-slate-700">{block.text}</div>
              </div>
            );
          }

          if (block.type === 'subitem') {
            return (
              <div key={`assignment-brief-subitem-${index}`} className="mr-7 flex items-start gap-3 px-1">
                <div className="mt-3 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                <div className="text-[15px] leading-8 text-slate-700">{block.text}</div>
              </div>
            );
          }

          return (
            <div key={`assignment-brief-paragraph-${index}`} className="text-[15px] leading-8 text-slate-700">
              {block.text}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const buildGenerationLabel = ({ promptText = '', instructionsText = '', templateId = 'blank' } = {}) => {
  const cleanPrompt = String(promptText || '').trim();
  if (cleanPrompt) return cleanPrompt;

  const lines = String(instructionsText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const preferredLine = lines.find((line, index) => index > 0 || !/^קובץ\s+הנחיות\s*:/i.test(line)) || lines[0] || '';
  const normalizedLine = preferredLine
    .replace(/^(?:[-*]+|\d+[.)])\s+/, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:!?-]+|[\s,;:!?-]+$/g, '')
    .trim();

  return normalizedLine || GENERATION_LABEL_FALLBACKS[templateId] || GENERATION_LABEL_FALLBACKS.blank;
};

const summarizeInspectorMaterialSelection = (selectedMaterials = []) => (
  (Array.isArray(selectedMaterials) ? selectedMaterials : []).map((item, index) => {
    const previewText = String(item?.previewText || '').trim();
    const rawPreviewChars = Number(item?.previewChars);
    return {
      id: item?.id || item?.file || `material-${index + 1}`,
      title: String(item?.title || item?.file || `material-${index + 1}`).trim(),
      label: String(item?.label || '').trim(),
      hasPreview: Boolean(previewText),
      previewChars: Number.isFinite(rawPreviewChars) && rawPreviewChars >= 0 ? rawPreviewChars : previewText.length,
      previewStatus: String(item?.previewStatus || (previewText ? 'ready' : '')).trim(),
      previewError: String(item?.previewError || '').trim(),
    };
  })
);

const buildStartScreenGenerationInspector = ({
  runId = '',
  actionType = '',
  prompt = '',
  instructions = '',
  selectedMaterials = [],
  templateId = 'blank',
  baseDraft = null,
  selectedProviderId = '',
  selectedProviderModel = '',
  route = 'generateDocumentFromPrompt',
  routeMode = '',
  routeModeReason = '',
} = {}) => {
  const cleanBaseDraftHtml = String(baseDraft?.html || '').trim();
  const cleanBaseDraftText = String(baseDraft?.text || '').trim();
  const hasBaseDraft = Boolean(cleanBaseDraftHtml);

  return {
    actionType: String(actionType || (hasBaseDraft ? 'revise' : 'generate')).trim() || 'generate',
    routeRequested: String(route || 'generateDocumentFromPrompt').trim(),
    routeResolved: String(route || 'generateDocumentFromPrompt').trim(),
    routeMode: String(routeMode || '').trim(),
    routeModeReason: String(routeModeReason || '').trim(),
    runId: String(runId || '').trim(),
    templateId: String(templateId || 'blank').trim() || 'blank',
    promptChars: String(prompt || '').trim().length,
    instructionsChars: String(instructions || '').trim().length,
    requestedProviderId: String(selectedProviderId || '').trim(),
    requestedProviderModel: String(selectedProviderModel || '').trim(),
    selectedMaterials: summarizeInspectorMaterialSelection(selectedMaterials),
    baseDraft: hasBaseDraft ? {
      title: String(baseDraft?.title || baseDraft?.name || '').trim() || 'טיוטת בסיס',
      htmlChars: cleanBaseDraftHtml.length,
      textChars: cleanBaseDraftText.length,
    } : null,
    usedFallback: false,
    errorMessage: '',
    liveState: 'running',
  };
};

const resolveStartScreenGenerationInspectorMeta = ({ summary = null, logs = [] } = {}) => {
  const latestLogs = Array.isArray(logs) ? logs : [];
  const latestStages = Array.isArray(summary?.stages) ? summary.stages : [];
  const requestStartLog = latestLogs.find((log) => log?.type === 'request-start');
  const lastLogMeta = latestLogs.find(
    (log) => String(log?.provider || '').trim() || String(log?.model || '').trim(),
  );
  const lastStageMeta = [...latestStages].reverse().find(
    (stage) => String(stage?.provider || '').trim() || String(stage?.model || '').trim(),
  );
  const resolvedProviderMeta = lastLogMeta || lastStageMeta || {};

  return {
    requestedProviderId: String(resolvedProviderMeta?.provider || '').trim(),
    requestedProviderModel: String(resolvedProviderMeta?.model || '').trim(),
    routeMode: requestStartLog
      ? (requestStartLog.automationSkipped === true ? 'direct' : 'workspace-automation')
      : '',
    routeModeReason: String(requestStartLog?.automationSkipReason || '').trim(),
  };
};

const DEFAULT_BASE_DRAFT_REFINEMENT_REQUEST = 'המשתמש בחר לעדכן את טיוטת הבסיס הקיימת. הטיוטה היא מקור האמת: שמור את התוכן, המבנה, הטענות והמידע שכבר קיימים, ולטש או הרחב אותם במקום רק כשיש צורך. אל תכתוב מסמך חדש מאפס ואל תמחק חלקים קיימים בלי בקשה מפורשת.';

const buildBaseDraftRevisionRequest = ({ promptText = '', instructionsText = '', baseDraftTitle = '', templateId = 'blank' } = {}) => {
  const cleanPrompt = String(promptText || '').trim();
  const cleanInstructions = String(instructionsText || '').trim();
  const resolvedDraftTitle = String(baseDraftTitle || '').trim();

  if (!cleanPrompt && !cleanInstructions) {
    return {
      feedback: DEFAULT_BASE_DRAFT_REFINEMENT_REQUEST,
      title: resolvedDraftTitle ? `${resolvedDraftTitle} · ליטוש טיוטה` : 'ליטוש טיוטה',
      originalPrompt: resolvedDraftTitle || 'טיוטת בסיס',
    };
  }

  const sections = [DEFAULT_BASE_DRAFT_REFINEMENT_REQUEST];
  if (resolvedDraftTitle) sections.push(`שם הטיוטה לעדכון:\n${resolvedDraftTitle}`);
  if (cleanInstructions) sections.push(`הנחיות לעדכון:\n${cleanInstructions}`);
  if (cleanPrompt) sections.push(`מטרה או הקשר:\n${cleanPrompt}`);

  return {
    feedback: sections.join('\n\n'),
    title: buildGenerationLabel({ promptText: cleanPrompt, instructionsText: cleanInstructions, templateId }),
    originalPrompt: cleanPrompt || resolvedDraftTitle || 'טיוטת בסיס',
  };
};

const normalizeDeferredReviewOfferText = (value = '', limit = 220) => {
  const normalizedValue = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalizedValue) return '';
  return normalizedValue.length > limit
    ? `${normalizedValue.slice(0, Math.max(0, limit - 3)).trim()}...`
    : normalizedValue;
};

const buildDeferredReviewOffer = ({ logs = [], additionalReviewRounds = 0, usedFallback = false } = {}) => {
  if (usedFallback || Number(additionalReviewRounds) > 0) return null;

  const revisitLog = (Array.isArray(logs) ? logs : []).find((log) => String(log?.type || '').trim() === 'stage-revisit-required');
  if (!revisitLog) return null;

  const noteText = normalizeDeferredReviewOfferText(revisitLog.message || revisitLog.type || '');
  const decisionText = normalizeDeferredReviewOfferText(revisitLog.decision || '');
  const missingText = normalizeDeferredReviewOfferText(revisitLog.missing || '', 260);
  const confirmSections = [
    'בסוף הסבב מנהל העבודה ביקש סבב בקרת איכות נוסף.',
    noteText ? `הערת הסיום: ${noteText}` : '',
    missingText ? `פערים שזוהו: ${missingText}` : '',
    'להריץ עכשיו סבב נוסף על הטיוטה שכבר נוצרה?',
  ].filter(Boolean);
  const feedbackSections = [
    'מנהל העבודה ביקש עכשיו סבב בקרת איכות נוסף על הטיוטה הקיימת לפני מסירה.',
    'הטיוטה הקיימת היא בסיס העבודה. שמור על המבנה, המידע והחלקים הטובים שכבר קיימים, ותקן רק את הפערים שעלו בסיום הסבב.',
    noteText ? `הערת הסיום של מנהל העבודה:\n${noteText}` : '',
    decisionText ? `החלטת מנהל:\n${decisionText}` : '',
    missingText ? `פערים לטיפול:\n${missingText}` : '',
    'בצע תיקונים ממוקדים, השלם רק מה שחסר, ואל תוסיף מבנה חדש או חלקים שלא נתבקשו.',
  ].filter(Boolean);

  return {
    confirmMessage: confirmSections.join('\n\n'),
    feedback: feedbackSections.join('\n\n'),
  };
};

const shouldAutoOpenOnboarding = (profile = {}) => {
  if (String(profile?.onboardingCompletedAt || '').trim()) return false;
  if (String(profile?.onboardingDismissedAt || '').trim()) return false;
  const snoozedUntil = String(profile?.onboardingSnoozedUntil || '').trim();
  if (snoozedUntil) {
    const snoozeDate = new Date(snoozedUntil);
    if (Number.isNaN(snoozeDate.getTime())) return true;
    return snoozeDate.getTime() <= Date.now();
  }

  return !hasMeaningfulPersonalProfileData(profile);
};

const normalizeStoredDefaultFont = (value = '') => {
  const firstFamily = String(value || '').split(',')[0] || '';
  return firstFamily.replace(/^['"]+|['"]+$/g, '').trim() || 'Alef';
};

const getActiveWorkspaceId = () => String(getWorkspaceAutomation().activeWorkspaceId || '').trim();

const FEEDBACK_OPTION_GROUPS = [
  {
    title: 'לאקדמיה',
    options: [
      'לחדד שפה אקדמית ורשמית יותר',
      'לשפר את מבנה הפרקים והכותרות',
      'לחזק נימוקים, דיון ומסקנות',
      'להוסיף מקום למקורות, אסמכתאות וציטוטים',
    ],
  },
  {
    title: 'לשימוש חופשי',
    options: [
      'לקצר ולתמצת את המסמך',
      'להרחיב ולהעמיק את התוכן',
      'להפוך את הסגנון לברור ופשוט יותר',
      'לתקן ניסוח, שגיאות וזרימה',
    ],
  },
];

const normalizeFeedbackExecutionMode = (value = '') => (String(value || '').trim() === 'workspace' ? 'workspace' : 'direct');

const normalizeFeedbackRoundIndex = (value = 1) => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return 1;
  return Math.max(1, Math.floor(parsedValue));
};

const isFeedbackWorkflowAvailable = () => {
  const automation = getWorkspaceAutomation();
  const activeWorkflowAgents = getOrderedRoleAgents(automation?.workflowMode);
  return automation?.enabled === true
    && automation?.autoDispatch !== false
    && Array.isArray(activeWorkflowAgents)
    && activeWorkflowAgents.length > 0;
};

const DEFAULT_FEEDBACK_SURVEY = {
  open: false,
  phase: 'question',
  prompt: '',
  templateId: 'blank',
  selectedMaterials: [],
  selectedModel: '',
  selectedProviderId: '',
  selectedProviderModel: '',
  useWorkspaceV2: false,
  workspaceV2TemplateId: '',
  selectedOptions: [],
  freeText: '',
  executionMode: 'direct',
  roundIndex: 1,
  usedFallback: false,
  submitting: false,
  submissionRequestId: null,
  applyingRecommendations: false,
  reviewResult: null,
  reviewFocus: '',
  reviewApplySelection: '',
  reviewErrorMessage: '',
};

const REVIEW_SUGGESTION_NUMBER_WORDS = new Map([
  ['אחד', 1], ['אחת', 1], ['ראשון', 1], ['ראשונה', 1],
  ['שניים', 2], ['שתיים', 2], ['שני', 2], ['שנייה', 2],
  ['שלוש', 3], ['שלישי', 3], ['שלישית', 3],
  ['ארבע', 4], ['רביעי', 4], ['רביעית', 4],
  ['חמש', 5], ['חמישה', 5], ['חמישי', 5], ['חמישית', 5],
  ['שש', 6], ['שישה', 6], ['שישי', 6], ['שישית', 6],
  ['שבע', 7], ['שבעה', 7], ['שביעי', 7], ['שביעית', 7],
  ['שמונה', 8], ['שמיני', 8], ['שמינית', 8],
  ['תשע', 9], ['תשעה', 9], ['תשיעי', 9], ['תשיעית', 9],
  ['עשר', 10], ['עשרה', 10], ['עשירי', 10], ['עשירית', 10],
]);

const collectReviewSuggestionNumbers = (value = '', max = 0) => {
  const numbers = new Set();
  let invalid = false;
  const text = String(value || '').trim();
  if (!text || max <= 0) return { numbers, invalid };
  if (/(?:^|[^\p{L}\p{N}])[-+]?\d+(?:\.\d+)+(?:$|[^\p{L}\p{N}])|(?:^|[^\p{L}\p{N}])[-+]\d+(?:$|[^\p{L}\p{N}])/u.test(text)) {
    invalid = true;
  }

  for (const match of text.matchAll(/\b(\d+)\s*(?:-|–|עד|to)\s*(\d+)\b/giu)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
    if (start < 1 || start > max || end < 1 || end > max) {
      invalid = true;
      continue;
    }
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    for (let index = from; index <= to; index += 1) numbers.add(index);
  }

  for (const match of text.matchAll(/(?<![-+.\p{L}\p{N}])\d+(?!\.\d)(?![\p{L}\p{N}])/gu)) {
    const number = Number(match[0]);
    if (!Number.isInteger(number)) continue;
    if (number < 1 || number > max) {
      invalid = true;
      continue;
    }
    numbers.add(number);
  }

  text.split(/[\s,.;:]+/u).forEach((token) => {
    const normalizedToken = token.replace(/^ו/u, '').trim();
    const number = REVIEW_SUGGESTION_NUMBER_WORDS.get(normalizedToken);
    if (number && number <= max) numbers.add(number);
  });

  return { numbers, invalid };
};

const resolveReviewSuggestionSelection = (selectionText = '', suggestions = []) => {
  const normalizedSelection = String(selectionText || '').trim();
  const total = Array.isArray(suggestions) ? suggestions.length : 0;
  if (!normalizedSelection || !total) {
    return { suggestions: Array.isArray(suggestions) ? suggestions : [], selectedIndexes: [], excludedIndexes: [], hasExplicitSelection: false, invalid: false };
  }

  const excludeSplit = normalizedSelection.split(/(?:\b(?:skip|except|without)\b|(?:דלג(?:י)?\s+על|תדלג(?:י)?\s+על|חוץ\s+מ|בלי|ללא))/iu);
  const includeText = excludeSplit[0] || '';
  const excludeText = excludeSplit.slice(1).join(' ');
  const includeResult = collectReviewSuggestionNumbers(includeText, total);
  const excludeResult = collectReviewSuggestionNumbers(excludeText, total);
  const includeNumbers = includeResult.numbers;
  const excludeNumbers = excludeResult.numbers;
  if (includeResult.invalid || excludeResult.invalid) {
    return { suggestions: [], selectedIndexes: [], excludedIndexes: [], hasExplicitSelection: true, invalid: true };
  }
  if (!includeNumbers.size && !excludeNumbers.size) {
    return { suggestions: [], selectedIndexes: [], excludedIndexes: [], hasExplicitSelection: true, invalid: true };
  }
  const selectedNumbers = includeNumbers.size
    ? includeNumbers
    : new Set(Array.from({ length: total }, (_, index) => index + 1));
  excludeNumbers.forEach((number) => selectedNumbers.delete(number));
  const selectedIndexes = [...selectedNumbers].sort((left, right) => left - right);

  return {
    suggestions: selectedIndexes.map((number) => suggestions[number - 1]).filter(Boolean),
    selectedIndexes,
    excludedIndexes: [...excludeNumbers].sort((left, right) => left - right),
    hasExplicitSelection: true,
    invalid: selectedIndexes.length === 0,
  };
};

const SIDEBAR_HISTORY_ENTRY_PATTERN = /(^|\n)(assistant|user):\s*/g;
const SIDEBAR_NUMBERED_SUGGESTION_LINE_PATTERN = /^(?:#{1,6}\s*)?(?:\*\*)?(?:(\d{1,2})[.)]|(?:המלצה|תיקון|סעיף|נקודה|suggestion|recommendation)\s+(\d{1,2})[:.)-])\s*(.+?)\s*(?:\*\*)?$/iu;
const SIDEBAR_BULLET_SUGGESTION_LINE_PATTERN = /^[•*-]\s+(.+)$/u;
const SIDEBAR_REVIEW_CONTEXT_PATTERN = /(?:מרצה|המלצ|הערות|ביקורת|תיקונים|ניסוח\s+מוצע|suggestions?|recommendations?)/iu;
const SIDEBAR_REVIEW_SELECTION_INTENT_PATTERN = /(?:תעשה|תעשי|עשה|עשי|בצע|בצעי|תבצע|תבצעי|החל|תחיל|החילי|יישם|יישמי|תיישם|תיישמי|תקן|תקני|תתקן|תתקני|עדכן|עדכני|תעדכן|תעדכני).{0,42}(?:\d+|אחד|אחת|ראשון|ראשונה|שניים|שני|שתיים|שתי|שניה|שנייה|שלוש|שלושה|שלישי|שלישית|ארבע|ארבעה|רביעי|רביעית|חמש|חמישה|חמישי|חמישית|שש|שישה|שישי|שישית)/iu;
const SIDEBAR_REVIEW_APPLY_ALL_INTENT_PATTERN = /(?:תתחיל|תחיל|התחל|תתקן|תקן|תיישם|יישם|תעדכן|עדכן|תטמיע|הטמע|תשלב|שלב|תעבור.{0,30}(?:ותתחיל|ותתקן|ותיישם|ותעדכן)|בהתאם\s+ל(?:הערות|המלצות|תיקונים|הנחיות)(?:\s+המרצה)?|על\s+פי\s+(?:הערות|המלצות|תיקונים|הנחיות)(?:\s+המרצה)?|לפי\s+(?:הערות|המלצות|תיקונים|הנחיות)(?:\s+המרצה)?|כמו\s+ש(?:הצעת|כתבת|ציינת)|את\s+(?:כל\s+)?(?:ההמלצות|התיקונים|ההערות)(?:\s+ש(?:הצעת|כתבת|ציינת))?)/iu;

const cleanSidebarSuggestionText = (value = '') => String(value || '')
  .replace(/^\*+|\*+$/g, '')
  .replace(/^#+\s*/u, '')
  .trim();

const parseSidebarConversationEntries = (conversationHistoryText = '') => {
  const text = String(conversationHistoryText || '');
  if (!text.trim()) return [];
  const matches = [...text.matchAll(SIDEBAR_HISTORY_ENTRY_PATTERN)];
  if (!matches.length) return [];

  return matches.map((match, index) => {
    const role = String(match[2] || '').trim();
    const markerStart = match.index + (match[1] ? match[1].length : 0);
    const contentStart = markerStart + `${role}: `.length;
    const nextMarker = index + 1 < matches.length
      ? matches[index + 1].index + (matches[index + 1][1] ? matches[index + 1][1].length : 0)
      : text.length;
    return {
      role,
      content: text.slice(contentStart, nextMarker).trim(),
    };
  }).filter((entry) => entry.role && entry.content);
};

const extractSidebarReviewSuggestionsFromText = (content = '') => {
  const hasSidebarSuggestionList = (content = '') => String(content || '')
    .split(/\r?\n/u)
    .some((line) => SIDEBAR_NUMBERED_SUGGESTION_LINE_PATTERN.test(line) || SIDEBAR_BULLET_SUGGESTION_LINE_PATTERN.test(line));
  if (!SIDEBAR_REVIEW_CONTEXT_PATTERN.test(content) || !hasSidebarSuggestionList(content)) return [];

  const suggestions = [];
  const hasNumberedList = String(content || '').split(/\r?\n/u).some((line) => SIDEBAR_NUMBERED_SUGGESTION_LINE_PATTERN.test(line));

  [content].forEach((entryContent) => {
    const lines = String(entryContent || '').split(/\r?\n/u);
    let current = null;
    let bulletNumber = 0;
    let blockItems = [];
    let pendingBulletBlockBreak = false;
    const commitCurrent = () => {
      if (!current) return;
      blockItems.push(current);
      current = null;
    };
    const commitBlock = () => {
      commitCurrent();
      if (blockItems.length) {
        suggestions.splice(0, suggestions.length, ...blockItems);
        blockItems = [];
      }
    };

    lines.forEach((rawLine) => {
      const originalLine = String(rawLine || '');
      const line = originalLine.trim();
      if (!line) {
        if (current) {
          if (!hasNumberedList) {
            commitCurrent();
            pendingBulletBlockBreak = true;
          } else {
            current.body.push('');
          }
        }
        return;
      }

      const markerMatch = originalLine.match(SIDEBAR_NUMBERED_SUGGESTION_LINE_PATTERN);
      if (markerMatch) {
        const nextNumber = Number(markerMatch[1] || markerMatch[2]);
        if (nextNumber === 1 && (current || blockItems.length)) commitBlock();
        commitCurrent();
        pendingBulletBlockBreak = false;
        bulletNumber = Math.max(bulletNumber, nextNumber);
        current = {
          number: nextNumber,
          title: cleanSidebarSuggestionText(markerMatch[3] || ''),
          body: [],
        };
        return;
      }

      const bulletMatch = !hasNumberedList && originalLine.match(SIDEBAR_BULLET_SUGGESTION_LINE_PATTERN);
      if (bulletMatch) {
        if (pendingBulletBlockBreak && blockItems.length) {
          commitBlock();
          bulletNumber = 0;
        }
        commitCurrent();
        pendingBulletBlockBreak = false;
        bulletNumber += 1;
        current = {
          number: bulletNumber,
          title: cleanSidebarSuggestionText(bulletMatch[1] || ''),
          body: [],
        };
        return;
      }

      pendingBulletBlockBreak = false;
      if (current) current.body.push(line);
    });

    commitBlock();
  });

  const uniqueByNumber = new Map();
  suggestions
    .filter((item) => Number.isInteger(item.number) && item.number > 0)
    .forEach((item) => {
      if (!uniqueByNumber.has(item.number)) uniqueByNumber.set(item.number, item);
    });

  return [...uniqueByNumber.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([number, item]) => {
      const normalizedBody = item.body.join('\n').trim();
      return {
        suggestionId: `sidebar-suggestion-${number}`,
        title: item.title || `המלצה ${number}`,
        reason: normalizedBody,
        suggestedChange: normalizedBody || item.title || `המלצה ${number}`,
      };
    });
};

const extractSidebarReviewSuggestionsFromConversation = (conversationHistoryText = '') => {
  const entries = parseSidebarConversationEntries(conversationHistoryText);
  const assistantEntries = entries.filter((entry) => entry.role === 'assistant');
  const hasSidebarSuggestionList = (content = '') => String(content || '')
    .split(/\r?\n/u)
    .some((line) => SIDEBAR_NUMBERED_SUGGESTION_LINE_PATTERN.test(line) || SIDEBAR_BULLET_SUGGESTION_LINE_PATTERN.test(line));
  const latestReviewEntry = [...assistantEntries]
    .reverse()
    .find((entry) => SIDEBAR_REVIEW_CONTEXT_PATTERN.test(entry.content) && hasSidebarSuggestionList(entry.content));
  if (!latestReviewEntry) return [];
  return extractSidebarReviewSuggestionsFromText(latestReviewEntry.content);
};

const extractSidebarReviewContextFromConversation = (conversationHistoryText = '') => {
  const entries = parseSidebarConversationEntries(conversationHistoryText);
  const assistantEntries = entries.filter((entry) => entry.role === 'assistant');
  const hasSidebarSuggestionList = (content = '') => String(content || '')
    .split(/\r?\n/u)
    .some((line) => SIDEBAR_NUMBERED_SUGGESTION_LINE_PATTERN.test(line) || SIDEBAR_BULLET_SUGGESTION_LINE_PATTERN.test(line));
  const latestReviewEntry = [...assistantEntries]
    .reverse()
    .find((entry) => SIDEBAR_REVIEW_CONTEXT_PATTERN.test(entry.content) && hasSidebarSuggestionList(entry.content))
    || [...assistantEntries]
      .reverse()
      .find((entry) => SIDEBAR_REVIEW_CONTEXT_PATTERN.test(entry.content));
  return latestReviewEntry?.content ? String(latestReviewEntry.content).trim() : '';
};

const getSidebarReviewSelectionText = (promptText = '') => {
  const lines = String(promptText || '').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const selectionLine = [...lines].reverse().find((line) => SIDEBAR_REVIEW_SELECTION_INTENT_PATTERN.test(line));
  return selectionLine || String(promptText || '').trim();
};

const DEFAULT_INPUT_DIALOG = {
  open: false,
  title: '',
  description: '',
  fields: [],
  values: {},
  confirmLabel: 'אישור',
  closeOnEscape: true,
  closeOnBackdrop: false,
  submitOnEnter: true,
  submitOnCtrlEnterForTextarea: true,
  resolve: null,
};

const COPYLEAKS_SOURCE_LABELS = {
  selection: 'טקסט מסומן',
  currentBlock: 'פסקה פעילה',
  document: 'כל המסמך',
};

const DEFAULT_COPYLEAKS_DETECTOR = {
  open: false,
  source: 'selection',
  sourceLabel: COPYLEAKS_SOURCE_LABELS.selection,
  text: '',
  submitting: false,
  result: null,
  error: '',
  scoreFlash: null,
};

const formatCopyleaksPercent = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : '—';
};

const getFeedbackSurveyGenerationContext = (survey = {}, fallback = {}) => {
  const surveyPrompt = String(survey.prompt || '').trim();
  const fallbackPrompt = String(fallback.prompt || '').trim();
  const surveyTemplateId = String(survey.templateId || '').trim();
  const fallbackTemplateId = String(fallback.templateId || '').trim();
  const surveySelectedMaterials = Array.isArray(survey.selectedMaterials) ? survey.selectedMaterials.filter(Boolean) : [];
  const fallbackSelectedMaterials = Array.isArray(fallback.selectedMaterials) ? fallback.selectedMaterials.filter(Boolean) : [];
  const surveySelectedProviderId = String(survey.selectedProviderId || survey.selectedModel || '').trim();
  const fallbackSelectedProviderId = String(fallback.selectedProviderId || fallback.selectedModel || '').trim();
  const surveySelectedProviderModel = String(survey.selectedProviderModel || '').trim();
  const fallbackSelectedProviderModel = String(fallback.selectedProviderModel || '').trim();
  const hasSurveyGenerationContext = Boolean(
    surveyPrompt
    || survey.usedFallback
    || surveySelectedMaterials.length
    || surveySelectedProviderId
    || surveySelectedProviderModel
  );

  return {
    prompt: surveyPrompt || fallbackPrompt,
    templateId: (hasSurveyGenerationContext
      ? (surveyTemplateId || fallbackTemplateId || 'blank')
      : (fallbackTemplateId || surveyTemplateId || 'blank')),
    executionMode: normalizeFeedbackExecutionMode(survey.executionMode || fallback.executionMode || 'direct'),
    roundIndex: normalizeFeedbackRoundIndex(survey.roundIndex || fallback.roundIndex || 1),
    usedFallback: Boolean(survey.usedFallback || fallback.usedFallback),
    selectedMaterials: surveySelectedMaterials.length ? [...surveySelectedMaterials] : [...fallbackSelectedMaterials],
    selectedModel: surveySelectedProviderId || fallbackSelectedProviderId,
    selectedProviderId: surveySelectedProviderId || fallbackSelectedProviderId,
    selectedProviderModel: surveySelectedProviderModel || fallbackSelectedProviderModel,
  };
};

const buildFeedbackSurveyStateWithGenerationContext = (survey = {}, fallback = {}) => ({
  ...DEFAULT_FEEDBACK_SURVEY,
  ...getFeedbackSurveyGenerationContext(survey, fallback),
});

const buildFeedbackSurveyRequestText = ({ selectedOptions = [], freeText = '', includeIntro = true } = {}) => {
  const normalizedOptions = Array.isArray(selectedOptions)
    ? selectedOptions.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const cleanFreeText = String(freeText || '').trim();
  const sections = [];

  if (normalizedOptions.length) sections.push(`נקודות לתיקון:\n- ${normalizedOptions.join('\n- ')}`);
  if (cleanFreeText) sections.push(`בקשה חופשית:\n${cleanFreeText}`);
  if (!sections.length) return '';

  return includeIntro
    ? ['המשתמש ביקש לעדכן את המסמך לפי המשוב הבא:', ...sections].join('\n\n')
    : sections.join('\n\n');
};

const getDraftTitleFromFilePath = (filePath = '') => {
  const filename = String(filePath || '').split(/[\\/]/).filter(Boolean).pop() || '';
  return filename.replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim();
};

const getDraftTitleFromText = (text = '', templateId = 'blank') => {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const normalized = String(lines[0] || '')
      .replace(/^(?:#{1,6}\s+|[-*]\s+|\d+[.)]\s+)/, '')
    .trim();

  if (!normalized) {
    return GENERATION_LABEL_FALLBACKS[templateId] || GENERATION_LABEL_FALLBACKS.blank;
  }

  return normalized.length > 72 ? `${normalized.slice(0, 72).trim()}...` : normalized;
};

const resolveDocumentHistoryTitle = ({ text = '', filePath = '', templateId = 'blank', fallbackTitle = '' } = {}) => {
  return getDraftTitleFromFilePath(filePath)
    || getDraftTitleFromText(text, templateId)
    || String(fallbackTitle || '').trim()
    || GENERATION_LABEL_FALLBACKS[templateId]
    || GENERATION_LABEL_FALLBACKS.blank;
};

const EXPORT_DOC_STYLES = `<style>
    body { direction: rtl; font-family: Arial, sans-serif; padding: 40px; line-height: 1.7; }
    [data-type="page-break"] { display: block; height: 0; page-break-after: always; break-after: page; }
    body > p:first-child { text-align: center; font-size: 11pt; font-weight: 700; color: #64748B; letter-spacing: 1px; margin-top: 20px; }
    body > h1:nth-child(2) { text-align: center; font-size: 28pt; color: #2B579A; margin: 0 0 10pt; }
    body > h2:nth-child(3) { text-align: center; font-size: 15pt; color: #475569; margin: 0 0 14pt; }
    body > hr:nth-child(4) { width: 96px; margin: 14px auto; border: none; border-top: 4px solid #93C5FD; }
    body > p:nth-child(5), body > p:nth-child(6) { text-align: center; color: #475569; }
  </style>`;

// CSS לייצוא HTML — בונה מהפונט/גודל/רווח-שורות שנבחרו בפועל, במקום Arial קשיח.
// חשוב: המאפיינים האלה יושבים על מיכל העורך (applyDocumentStyleToEditor) ולא ב-getHTML(),
// ולכן בלי זה קובץ HTML שנשמר יוצא בלי שום עיצוב עמוד.
const buildExportStyleCss = ({ fontStack = '', fontSize = '', lineHeight = '' } = {}) => `<style>
    body {
      direction: rtl;
      font-family: ${fontStack || 'Arial, sans-serif'};
      font-size: ${fontSize || '12pt'};
      line-height: ${lineHeight || '1.7'};
      padding: 40px;
    }
    [data-type="page-break"] { display: block; height: 0; page-break-after: always; break-after: page; }
    [data-cover-page="true"] { page-break-after: always; break-after: page; }
    table { border-collapse: collapse; }
    table td, table th { border: 1px solid #C8C6C4; padding: 6px 8px; }
    body > p:first-child { text-align: center; font-weight: 700; color: #64748B; letter-spacing: 1px; margin-top: 20px; }
    body > h1:nth-child(2) { text-align: center; font-size: 28pt; color: #2B579A; margin: 0 0 10pt; }
    body > h2:nth-child(3) { text-align: center; font-size: 15pt; color: #475569; margin: 0 0 14pt; }
    body > hr:nth-child(4) { width: 96px; margin: 14px auto; border: none; border-top: 4px solid #93C5FD; }
    body > p:nth-child(5), body > p:nth-child(6) { text-align: center; color: #475569; }
  </style>`;

const EXPORT_TEXTUAL_BLOCK_SELECTOR = [
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'li', 'td', 'th', 'table', 'div',
].join(',');

const MAX_IMPORTED_DOCUMENT_HTML_CHARS = 400000;
const MAX_IMPORTED_DOCUMENT_TEXT_CHARS = 220000;

const getDocumentStyleDefaultTextAlign = (documentStyle = '') => {
  const normalizedStyle = String(documentStyle || '').trim().toLowerCase();
  if (normalizedStyle === 'legal') return 'justify';
  if (normalizedStyle === 'presentation') return 'center';
  return 'right';
};

const getClassTextAlign = (element) => {
  const classes = String(element?.getAttribute?.('class') || '').split(/\s+/).filter(Boolean);
  if (classes.includes('text-center')) return 'center';
  if (classes.includes('text-left')) return 'left';
  if (classes.includes('text-right')) return 'right';
  if (classes.includes('text-justify')) return 'justify';
  return '';
};

const getExplicitTextAlign = (element) => {
  const styleTextAlign = String(element?.style?.textAlign || '').trim();
  if (styleTextAlign) return styleTextAlign;

  const alignTextAlign = String(element?.getAttribute?.('align') || '').trim().toLowerCase();
  if (alignTextAlign) return alignTextAlign;

  return getClassTextAlign(element);
};

const getListItemChildTextAlign = (element) => {
  if (!element?.matches?.('li')) return '';
  const childBlock = element.querySelector(':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > div');
  return getExplicitTextAlign(childBlock);
};

const RTL_STRONG_CHARACTER_RE = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LTR_STRONG_CHARACTER_RE = /[A-Za-z\u00C0-\u024F]/;

const getTextDirection = (text = '') => {
  const value = String(text || '');
  let rtlCount = 0;
  let ltrCount = 0;

  for (const character of value) {
    if (RTL_STRONG_CHARACTER_RE.test(character)) {
      rtlCount += 1;
      continue;
    }
    if (LTR_STRONG_CHARACTER_RE.test(character)) {
      ltrCount += 1;
    }
  }

  if (!rtlCount && !ltrCount) return 'rtl';
  return rtlCount >= ltrCount ? 'rtl' : 'ltr';
};

const getExportTextDirection = (dir = '', text = '') => {
  const normalizedDir = String(dir || '').trim().toLowerCase();
  if (normalizedDir === 'rtl' || normalizedDir === 'ltr') return normalizedDir;
  if (normalizedDir === 'auto') return getTextDirection(text);
  return '';
};

const normalizeDocumentExportHtml = (html = '', { documentStyle = 'academic' } = {}) => {
  const source = String(html || '');
  if (!source.trim() || typeof document === 'undefined') return source;

  const container = document.createElement('div');
  container.innerHTML = source;
  const defaultTextAlign = getDocumentStyleDefaultTextAlign(documentStyle);

  container.querySelectorAll(EXPORT_TEXTUAL_BLOCK_SELECTOR).forEach((element) => {
    if (element.matches('[data-type="page-break"], [data-page-break="true"]')) return;

    const textContent = element.textContent || '';
    const rawDirection = element.getAttribute('dir');
    const direction = element.hasAttribute('dir')
      ? getExportTextDirection(rawDirection, textContent) || 'rtl'
      : 'rtl';

    if (!element.hasAttribute('dir') || String(rawDirection || '').trim().toLowerCase() === 'auto') {
      element.setAttribute('dir', direction);
    }

    const explicitTextAlign = getExplicitTextAlign(element);
    if (!element.style.textAlign && !element.getAttribute('align')) {
      const childTextAlign = getListItemChildTextAlign(element);
      const inferredTextAlign = direction === 'ltr' ? 'left' : defaultTextAlign;
      element.style.textAlign = explicitTextAlign || childTextAlign || inferredTextAlign;
    }
  });

  return container.innerHTML;
};

const isLegacyHomeEnabled = () => {
  try {
    return localStorage.getItem('wordai_legacy_home_enabled') !== 'false';
  } catch {
    return true;
  }
};

const PRIMARY_DOCUMENT_STORAGE_SCOPE_ID = 'primary';
const DOCUMENT_STORAGE_KEYS = Object.freeze({
  draft: 'wordai_document',
  autosave: 'wordai_document_autosave',
  autosaveAt: 'wordai_document_autosave_at',
  activeTemplate: 'wordai_active_template',
  assignmentBrief: 'wordai_document_assignment_brief',
});

const DESKTOP_WINDOW_CONTEXT = (() => {
  if (typeof window === 'undefined') {
    return {
      isolatedDocumentSession: false,
      documentStorageScopeId: PRIMARY_DOCUMENT_STORAGE_SCOPE_ID,
      hasPendingOpenDocument: false,
    };
  }
  const rawContext = window.desktopApp?.windowContext;
  if (!rawContext || typeof rawContext !== 'object') {
    return {
      isolatedDocumentSession: false,
      documentStorageScopeId: PRIMARY_DOCUMENT_STORAGE_SCOPE_ID,
      hasPendingOpenDocument: false,
    };
  }

  const scopedId = typeof rawContext.documentStorageScopeId === 'string'
    ? rawContext.documentStorageScopeId.trim()
    : '';

  return {
    isolatedDocumentSession: rawContext.isolatedDocumentSession === true,
    documentStorageScopeId: scopedId || PRIMARY_DOCUMENT_STORAGE_SCOPE_ID,
    hasPendingOpenDocument: rawContext.hasPendingOpenDocument === true,
  };
})();

const DOCUMENT_STORAGE_SCOPE_ID = String(
  DESKTOP_WINDOW_CONTEXT.documentStorageScopeId || PRIMARY_DOCUMENT_STORAGE_SCOPE_ID
).trim() || PRIMARY_DOCUMENT_STORAGE_SCOPE_ID;
const HAS_PENDING_STARTUP_DOCUMENT = DESKTOP_WINDOW_CONTEXT.hasPendingOpenDocument === true;
const SHOULD_FALLBACK_TO_LEGACY_DOCUMENT_STORAGE = DOCUMENT_STORAGE_SCOPE_ID === PRIMARY_DOCUMENT_STORAGE_SCOPE_ID;

const buildScopedDocumentStorageKey = (storageKey) => `wordai_window_scope:${DOCUMENT_STORAGE_SCOPE_ID}:${storageKey}`;

const readDocumentStorageValue = (storageKey, { fallbackToLegacy = false } = {}) => {
  try {
    const scopedValue = localStorage.getItem(buildScopedDocumentStorageKey(storageKey));
    if (scopedValue !== null) return scopedValue;
    if (fallbackToLegacy && SHOULD_FALLBACK_TO_LEGACY_DOCUMENT_STORAGE) {
      return localStorage.getItem(storageKey);
    }
  } catch {}
  return null;
};

const writeDocumentStorageValue = (storageKey, value, { mirrorLegacy = SHOULD_FALLBACK_TO_LEGACY_DOCUMENT_STORAGE } = {}) => {
  try {
    const normalizedValue = String(value ?? '');
    localStorage.setItem(buildScopedDocumentStorageKey(storageKey), normalizedValue);
    if (mirrorLegacy && SHOULD_FALLBACK_TO_LEGACY_DOCUMENT_STORAGE) {
      localStorage.setItem(storageKey, normalizedValue);
    }
  } catch {}
};

const removeDocumentStorageValue = (storageKey, { removeLegacy = SHOULD_FALLBACK_TO_LEGACY_DOCUMENT_STORAGE } = {}) => {
  try {
    localStorage.removeItem(buildScopedDocumentStorageKey(storageKey));
    if (removeLegacy && SHOULD_FALLBACK_TO_LEGACY_DOCUMENT_STORAGE) {
      localStorage.removeItem(storageKey);
    }
  } catch {}
};

const getPersistedDraftHtml = () => {
  const autosaveHtml = readDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosave, { fallbackToLegacy: true });
  if (autosaveHtml) return autosaveHtml;
  return readDocumentStorageValue(DOCUMENT_STORAGE_KEYS.draft, { fallbackToLegacy: true }) || null;
};

const getPersistedDraftSavedAt = () => {
  return readDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosaveAt, { fallbackToLegacy: true }) || '';
};

const clearPersistedAutosaveCache = () => {
  removeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosave);
  removeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosaveAt);
};

const persistAutosaveSnapshot = (html) => {
  writeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosave, html);
  writeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosaveAt, new Date().toISOString());
};

const persistLocalDraftCache = (html) => {
  writeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.draft, html);
  writeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosave, html);
  writeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosaveAt, new Date().toISOString());
};

const clearPersistedDraftCacheStorage = () => {
  removeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.draft);
  removeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosave);
  removeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosaveAt);
};

const getPersistedActiveTemplateId = () => {
  return readDocumentStorageValue(DOCUMENT_STORAGE_KEYS.activeTemplate, { fallbackToLegacy: true }) || 'blank';
};

const persistActiveTemplateId = (templateId = 'blank') => {
  writeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.activeTemplate, templateId || 'blank');
};

const normalizeAssignmentBrief = (value = {}) => {
  if (!value || typeof value !== 'object') {
    return { text: '', fileName: '', sourceLabel: '' };
  }
  const text = String(value.text || '').trim();
  const fileName = String(value.fileName || '').trim();
  const sourceLabel = String(value.sourceLabel || '').trim();
  return { text, fileName, sourceLabel };
};

const getPersistedDocumentAssignmentBrief = () => {
  const rawValue = readDocumentStorageValue(DOCUMENT_STORAGE_KEYS.assignmentBrief, { fallbackToLegacy: true });
  if (!rawValue) return normalizeAssignmentBrief();
  try {
    return normalizeAssignmentBrief(JSON.parse(rawValue));
  } catch {
    return normalizeAssignmentBrief();
  }
};

const persistDocumentAssignmentBrief = (value = {}) => {
  const normalized = normalizeAssignmentBrief(value);
  if (!normalized.text) {
    removeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.assignmentBrief);
    return normalizeAssignmentBrief();
  }
  writeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.assignmentBrief, JSON.stringify(normalized));
  return normalized;
};

const clearPersistedDocumentAssignmentBrief = () => {
  removeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.assignmentBrief);
  return normalizeAssignmentBrief();
};

const getRecentAgentLogs = (limit = 18, filters = {}) => {
  const automation = getWorkspaceAutomation();
  const workspaceId = String(filters.workspaceId || automation?.activeWorkspaceId || 'default-content-studio').trim();
  const runId = String(filters.runId || '').trim();
  return getAgentDebugLogs({ workspaceId, runId, includeUnscoped: false }).slice(-limit).reverse();
};

function App() {
  // ביטול טיימר הפולבק לאחר שReact עשה commit ראשון לDOM
  const applyHydratedSettingsState = React.useCallback(() => {
    setShortcuts(getShortcutsConfig());
    setAssistantBehavior(getAssistantBehavior());
    setWordPreferences(getWordPreferences());
    setDocumentStyle(localStorage.getItem('wordai_document_style') || 'academic');
    setActiveTemplateId(getPersistedActiveTemplateId());
  }, []);

  React.useEffect(() => {
    if (window.__mountTimer) clearTimeout(window.__mountTimer);

    let isMounted = true;

    (async () => {
      try {
        await hydrateAppSettingsFromDisk().catch(() => {});
        await hydrateProviderConfigFromDisk().catch(() => {});
        if (!isMounted) return;
        applyHydratedSettingsState();
      } finally {
        if (isMounted) setSettingsHydrated(true);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [applyHydratedSettingsState]);

  React.useEffect(() => {
    const refreshSettingsFromDisk = () => {
      hydrateAppSettingsFromDisk()
        .catch(() => {})
        .then(() => hydrateProviderConfigFromDisk().catch(() => {}))
        .then(() => {
          applyHydratedSettingsState();
        })
        .catch(() => {});
    };

    const handleWindowFocus = () => {
      refreshSettingsFromDisk();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSettingsFromDisk();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [applyHydratedSettingsState]);

  const cloudAvailable = isCloudAvailable();
  const [editor, setEditor] = React.useState(null);
  const [appMode, setAppMode] = React.useState('word');
  // זוכר מאיפה נכנסנו לסטודיו (start screen או העורך) כדי שהיציאה תחזור לאותו מקום.
  const studioEntryOriginRef = React.useRef('editor');
  // קורא דרך ref כי handlers עטופים ב-useCallback([]) סוגרים על העותק הראשון של הפונקציה.
  const enterStudioMode = (mode) => {
    studioEntryOriginRef.current = showStartScreenRef.current ? 'start' : 'editor';
    setAppMode(mode);
  };
  const exitStudioMode = () => {
    setAppMode('word');
    if (studioEntryOriginRef.current === 'start') setShowStartScreen(true);
  };
  // Project Hub: הפרויקט הפתוח במסך-מלא + seed של "צור מסמך לשלב" שמוזרם ל-StartScreen.
  const [projectHubProjectId, setProjectHubProjectId] = React.useState(null);
  const [projectHubDocSeed, setProjectHubDocSeed] = React.useState(null);
  // שלד מטלה: הפאנל הצדדי נפתח כשקיים שלד פעיל בחנות (שורד רענון דף).
  const [scaffoldActive, setScaffoldActive] = React.useState(false);
  const [scaffoldTitle, setScaffoldTitle] = React.useState('');
  const [evidencePanelOpen, setEvidencePanelOpen] = React.useState(true);
  React.useEffect(() => {
    const sync = () => {
      const blob = readScaffold();
      setScaffoldActive(Boolean(blob?.active));
      setScaffoldTitle(String(blob?.title || ''));
    };
    ensureScaffoldReady().then(sync).catch(() => {});
    window.addEventListener(SCAFFOLD_UPDATED_EVENT, sync);
    return () => window.removeEventListener(SCAFFOLD_UPDATED_EVENT, sync);
  }, []);
  const [presentationDeck, setPresentationDeck] = React.useState(null);
  const [presentationBusy, setPresentationBusy] = React.useState(false);
  const [pptxDraft, setPptxDraft] = React.useState(null);
  const [docDraft, setDocDraft] = React.useState(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [authenticityOpen, setAuthenticityOpen] = React.useState(false);
  const [isMobileViewport, setIsMobileViewport] = React.useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 900 : false
  ));
  // טלפון (≤640px): פריסה מצומצמת — MobileToolbar במקום Ribbon, TopBar מקוצר.
  const [isPhoneViewport, setIsPhoneViewport] = React.useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 640 : false
  ));
  const [helpModalOpen, setHelpModalOpen] = React.useState(false);
  const [helpModalTopic, setHelpModalTopic] = React.useState('guideUser');
  const openHelpTopic = React.useCallback((topic = 'guideUser') => {
    setHelpModalTopic(topic);
    setHelpModalOpen(true);
  }, []);
  const [findReplace, setFindReplace] = React.useState({ open: false, mode: 'find' });
  const [sourceManagerOpen, setSourceManagerOpen] = React.useState(false);
  const [comments, setComments] = React.useState([]);
  const [commentsPanelOpen, setCommentsPanelOpen] = React.useState(false);
  const [activeCommentId, setActiveCommentId] = React.useState(null);
  const [wordCount, setWordCount] = React.useState(0);
  const [pageCount, setPageCount] = React.useState(1);
  const [zoom, setZoom] = React.useState(100);
  const [viewMode, setViewMode] = React.useState('print');
  const [fileMenuOpen, setFileMenuOpen] = React.useState(false);
  const [fileMenuTargetTab, setFileMenuTargetTab] = React.useState(null);
  const [updateCheckToken, setUpdateCheckToken] = React.useState(0);
  const [formatPainterActive, setFormatPainterActive] = React.useState(false);
  const [selectedText, setSelectedText] = React.useState('');
  const [selectionContext, setSelectionContext] = React.useState(null);
  const [assistantAutoPopupBlockedUntil, setAssistantAutoPopupBlockedUntil] = React.useState(0);
  const [currentBlockText, setCurrentBlockText] = React.useState('');
  const [editTarget, setEditTarget] = React.useState(() => ({ ...EMPTY_EDIT_TARGET }));
  const [trackChanges, setTrackChanges] = React.useState(false);
  const [trackPanelOpen, setTrackPanelOpen] = React.useState(false);
  const [trackedChanges, setTrackedChanges] = React.useState([]);
  const [shortcuts, setShortcuts] = React.useState(getShortcutsConfig());
  const [assistantBehavior, setAssistantBehavior] = React.useState(getAssistantBehavior());
  const [wordPreferences, setWordPreferences] = React.useState(getWordPreferences());
  const [documentStyle, setDocumentStyle] = React.useState(() => localStorage.getItem('wordai_document_style') || 'academic');
  // layout ברמת מסמך (שוליים/כיוון/גודל/כותרות/סימן מים/גבולות) — מקור אמת לייצוא DOCX
  const [documentLayout, setDocumentLayout] = React.useState(() => loadPersistedDocumentLayout());
  React.useEffect(() => { persistDocumentLayout(documentLayout); }, [documentLayout]);
  // pageCount חי ממנוע העימוד (extensions/Pagination.js)
  const paginationDrivenRef = React.useRef(false);
  React.useEffect(() => {
    const onPagination = (event) => {
      const count = Number(event?.detail?.pageCount);
      if (!Number.isFinite(count) || count < 1) return;
      paginationDrivenRef.current = true;
      setPageCount(count);
    };
    window.addEventListener('wordflow:pagination', onPagination);
    return () => window.removeEventListener('wordflow:pagination', onPagination);
  }, []);

  // שחזור ערכת צבעים שנשמרה
  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('wordai_theme_colors') || 'null');
      if (saved?.primary) {
        document.documentElement.style.setProperty('--word-blue', saved.primary);
        document.documentElement.style.setProperty('--word-accent', saved.accent || saved.primary);
      }
    } catch {}
  }, []);
  const [activeTemplateId, setActiveTemplateId] = React.useState(() => getPersistedActiveTemplateId());
  const [pendingStartupDocument, setPendingStartupDocument] = React.useState(HAS_PENDING_STARTUP_DOCUMENT);
  const [isAiStreaming, setIsAiStreaming] = React.useState(false);
  const [showStartScreen, setShowStartScreen] = React.useState(() => {
    if (HAS_PENDING_STARTUP_DOCUMENT) return false;
    if (isLegacyHomeEnabled()) return true;
    return getWordPreferences().showStartExperience !== false;
  });
  const showStartScreenRef = React.useRef(showStartScreen);
  showStartScreenRef.current = showStartScreen;
  const [showSplash, setShowSplash] = React.useState(() => isLegacyHomeEnabled() ? true : getWordPreferences().showStartExperience !== false);
  const [startScreenInstructionsResetToken, setStartScreenInstructionsResetToken] = React.useState(0);
  const [showWelcome, setShowWelcome] = React.useState(false);
  const [assignmentBrief, setAssignmentBrief] = React.useState(() => getPersistedDocumentAssignmentBrief());
  const [assignmentBriefOpen, setAssignmentBriefOpen] = React.useState(false);
  const [assignmentBriefDraft, setAssignmentBriefDraft] = React.useState(() => getPersistedDocumentAssignmentBrief().text || '');
  const [assignmentBriefPanelMode, setAssignmentBriefPanelMode] = React.useState(() => (getPersistedDocumentAssignmentBrief().text ? 'preview' : 'edit'));
  const [startTransitionPhase, setStartTransitionPhase] = React.useState('idle');
  const [currentFilePath, setCurrentFilePath] = React.useState('');
  const currentFilePathRef = React.useRef('');
  const [cloudUser, setCloudUser] = React.useState(null);
  const [cloudAuthReady, setCloudAuthReady] = React.useState(() => !cloudAvailable);
  const [currentCloudDocumentId, setCurrentCloudDocumentId] = React.useState('');
  const currentCloudDocumentIdRef = React.useRef('');
  const lastCloudSavedHtmlRef = React.useRef('');
  const deferredInstallPromptRef = React.useRef(null);
  const [pwaInstallState, setPwaInstallState] = React.useState(() => {
    const standalone = typeof window !== 'undefined'
      && (
        window.matchMedia?.('(display-mode: standalone)')?.matches
        || window.navigator?.standalone === true
      );
    const isDesktopShell = typeof window !== 'undefined' && Boolean(window.desktopApp);
    return {
      supported: typeof window !== 'undefined' && !isDesktopShell,
      installed: standalone || isDesktopShell,
      canInstall: false,
      platform: typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '',
      statusLabel: standalone || isDesktopShell ? 'כבר מותקן' : 'אפשר להתקין מהדפדפן',
      instructions: '',
    };
  });
  const [cloudSyncState, setCloudSyncState] = React.useState(() => ({
    status: 'idle',
    message: cloudAvailable ? 'לא מחובר לענן' : 'Firebase לא מוגדר',
    lastSavedAt: '',
    documentId: '',
    autosaveEnabled: false,
  }));
  const [activeDocumentSessionId, setActiveDocumentSessionId] = React.useState(() => createDocumentSessionId());
  // ref מסונכרן לזהות המסמך הפעיל — מתעדכן סינכרונית (state async) כדי ש-snapshot ה-delta
  // וה-diff ישתמשו באותו docId גם בתוך אותו callback (Personal Style Engine, Phase 5).
  const activeDocumentSessionIdRef = React.useRef(activeDocumentSessionId);

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const updateViewportMode = () => setIsMobileViewport(mediaQuery.matches);
    updateViewportMode();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateViewportMode);
      return () => mediaQuery.removeEventListener('change', updateViewportMode);
    }
    mediaQuery.addListener(updateViewportMode);
    return () => mediaQuery.removeListener(updateViewportMode);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia('(max-width: 640px)');
    const updatePhoneMode = () => setIsPhoneViewport(mediaQuery.matches);
    updatePhoneMode();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updatePhoneMode);
      return () => mediaQuery.removeEventListener('change', updatePhoneMode);
    }
    mediaQuery.addListener(updatePhoneMode);
    return () => mediaQuery.removeListener(updatePhoneMode);
  }, []);

  const requestPwaInstall = React.useCallback(async () => {
    const promptEvent = deferredInstallPromptRef.current;
    if (!promptEvent) {
      const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone === true;
      setPwaInstallState((prev) => ({
        ...prev,
        installed: standalone || prev.installed,
        canInstall: false,
        statusLabel: standalone ? 'כבר מותקן' : 'ההתקנה זמינה כרגע רק מתוך דפדפן נתמך',
      }));
      return { ok: standalone, reason: standalone ? 'already-installed' : 'not-available' };
    }

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      deferredInstallPromptRef.current = null;
      const accepted = choice?.outcome === 'accepted';
      setPwaInstallState((prev) => ({
        ...prev,
        canInstall: false,
        installed: accepted ? true : prev.installed,
        statusLabel: accepted ? 'ההתקנה אושרה' : 'אפשר לנסות שוב מתוך הדפדפן',
      }));
      return { ok: accepted, reason: accepted ? 'accepted' : 'dismissed' };
    } catch (error) {
      setPwaInstallState((prev) => ({
        ...prev,
        statusLabel: 'לא הצלחתי לפתוח את חלון ההתקנה',
      }));
      return { ok: false, reason: error?.message || 'prompt-failed' };
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (window.desktopApp) {
      setPwaInstallState((prev) => ({
        ...prev,
        supported: false,
        installed: true,
        canInstall: false,
        statusLabel: 'בתוך אפליקציית הדסקטופ אין צורך בהתקנה נוספת',
        instructions: 'כדי להתקין לטלפון, פתח את האתר בדפדפן במובייל.',
      }));
      return undefined;
    }

    const ua = String(navigator.userAgent || '');
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isAndroid = /android/i.test(ua);
    const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone === true;
    const installInstructions = standalone
      ? 'האפליקציה כבר רצה כיישום מותקן.'
      : isIos
        ? 'ב־Safari לחץ על Share ואז על Add to Home Screen.'
        : isAndroid
          ? 'ב־Chrome חפש Add to Home Screen או Install App בתפריט הדפדפן.'
          : 'בדפדפן תומך אפשר להתקין דרך כפתור Install או דרך תפריט הדפדפן.';

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      deferredInstallPromptRef.current = event;
      setPwaInstallState((prev) => ({
        ...prev,
        supported: true,
        installed: false,
        canInstall: true,
        platform: ua,
        statusLabel: 'אפשר להתקין עכשיו למסך הבית',
        instructions: installInstructions,
      }));
    };

    const handleInstalled = () => {
      deferredInstallPromptRef.current = null;
      setPwaInstallState((prev) => ({
        ...prev,
        supported: true,
        installed: true,
        canInstall: false,
        platform: ua,
        statusLabel: 'האתר הותקן בהצלחה',
        instructions: 'אפשר לפתוח אותו עכשיו כמו אפליקציה רגילה ממסך הבית.',
      }));
    };

    setPwaInstallState((prev) => ({
      ...prev,
      supported: true,
      installed: standalone,
      canInstall: false,
      platform: ua,
      statusLabel: standalone ? 'כבר מותקן' : 'אפשר להתקין מהדפדפן',
      instructions: installInstructions,
    }));

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [requestPwaInstall]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!('serviceWorker' in navigator) || window.desktopApp) return undefined;
    const registerServiceWorker = () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
    };
    if (document.readyState === 'complete') {
      registerServiceWorker();
      return undefined;
    }
    window.addEventListener('load', registerServiceWorker, { once: true });
    return () => window.removeEventListener('load', registerServiceWorker);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const payload = {
      ...pwaInstallState,
      install: requestPwaInstall,
    };
    window.__wordflowPwaInstall = payload;
    window.dispatchEvent(new CustomEvent('wordflow:pwa-install-state', { detail: payload }));
    return undefined;
  }, [pwaInstallState, requestPwaInstall]);
  const resetDocumentInteractionState = React.useCallback(() => {
    setSelectedText('');
    setSelectionContext(null);
    setCurrentBlockText('');
    setEditTarget({ ...EMPTY_EDIT_TARGET });
  }, []);
  const beginDocumentIdentity = React.useCallback((payload = {}) => {
    setCurrentFilePath(String(payload?.filePath || ''));
    setCurrentCloudDocumentId(String(payload?.cloudDocumentId || ''));
    currentCloudDocumentIdRef.current = String(payload?.cloudDocumentId || '');
    lastCloudSavedHtmlRef.current = '';
    const nextSessionId = createDocumentSessionId();
    activeDocumentSessionIdRef.current = nextSessionId;
    setActiveDocumentSessionId(nextSessionId);
    resetDocumentInteractionState();
  }, [resetDocumentInteractionState]);
  const [lastEditorActivityAt, setLastEditorActivityAt] = React.useState(Date.now());
  const [lastEditorContentActivityAt, setLastEditorContentActivityAt] = React.useState(0);
  const [lastManualStyleLearningAt, setLastManualStyleLearningAt] = React.useState(0);
  const [liveGeneration, setLiveGeneration] = React.useState({
    active: false,
    state: 'idle',
    prompt: '',
    summary: getLatestAgentRunSummary(getWorkspaceAutomation()),
    logs: getRecentAgentLogs(),
    runId: '',
    workspaceId: getWorkspaceAutomation().activeWorkspaceId || '',
  });
  const liveGenerationStateRef = React.useRef(null);
  liveGenerationStateRef.current = liveGeneration;
  const [documentArrival, setDocumentArrival] = React.useState({ active: false, tone: 'success' });
  const [lastGenerationAction, setLastGenerationAction] = React.useState(null);
  const [generationRecovery, setGenerationRecovery] = React.useState({
    runId: '',
    agentId: '',
    provider: '',
    model: '',
    pending: false,
    error: '',
  });
  const [feedbackSurvey, setFeedbackSurvey] = React.useState({ ...DEFAULT_FEEDBACK_SURVEY });
  const [inputDialog, setInputDialog] = React.useState({ ...DEFAULT_INPUT_DIALOG });
  const inputDialogFirstFieldRef = React.useRef(null);
  const [copyleaksDetector, setCopyleaksDetector] = React.useState({ ...DEFAULT_COPYLEAKS_DETECTOR });
  const [assistantLaunchPreset, setAssistantLaunchPreset] = React.useState({ nonce: 0, classicAgentId: '', composerMode: '', prompt: '' });
  const [assistantTrigger, setAssistantTrigger] = React.useState('manual');
  const [settingsHydrated, setSettingsHydrated] = React.useState(false);
  const [sidebarCompact, setSidebarCompact] = React.useState(() => (typeof window !== 'undefined' ? window.innerWidth < 1180 : false));
  const activeWorkspaceIdRef = React.useRef(getActiveWorkspaceId());
  const workspaceEpochRef = React.useRef(0);
  const activeGenerationRequestIdRef = React.useRef(0);
  const streamingPos = React.useRef(null);
  const lastLiveGenerationShellRef = React.useRef({ runId: '', html: '' });
  const lastLiveGenerationPlaceholderRef = React.useRef({ runId: '', html: '' });
  const preLiveGenerationSnapshotRef = React.useRef({ runId: '', html: '' });
  const pendingImportRef = React.useRef(null);
  const pendingImportOriginModeRef = React.useRef(null);
  const assignmentBriefFileInputRef = React.useRef(null);
  const startTransitionTimerRef = React.useRef(null);
  const startTransitionRunIdRef = React.useRef(0);
  const pendingStartTransitionFocusRef = React.useRef('start');
  const documentArrivalTimerRef = React.useRef(null);
  const documentArrivalFrameRef = React.useRef(null);
  const saveOperationInFlightRef = React.useRef(false);
  const clearDocumentArrival = React.useCallback(() => {
    if (documentArrivalFrameRef.current) {
      window.cancelAnimationFrame(documentArrivalFrameRef.current);
      documentArrivalFrameRef.current = null;
    }
    if (documentArrivalTimerRef.current) {
      window.clearTimeout(documentArrivalTimerRef.current);
      documentArrivalTimerRef.current = null;
    }
    setDocumentArrival((prev) => (prev.active ? { ...prev, active: false } : prev));
  }, []);
  React.useEffect(() => {
    if (!copyleaksDetector?.scoreFlash) return undefined;
    const timer = window.setTimeout(() => {
      setCopyleaksDetector((prev) => (
        prev?.scoreFlash
          ? { ...prev, scoreFlash: null }
          : prev
      ));
    }, 1300);
    return () => window.clearTimeout(timer);
  }, [copyleaksDetector?.scoreFlash]);
  React.useEffect(() => {
    currentFilePathRef.current = currentFilePath;
  }, [currentFilePath]);
  React.useEffect(() => {
    currentCloudDocumentIdRef.current = currentCloudDocumentId;
  }, [currentCloudDocumentId]);
  React.useEffect(() => {
    if (!cloudAvailable) {
      setCloudAuthReady(true);
      return undefined;
    }

    handleCloudRedirectResult().catch(e => console.error("Redirect recovery error:", e));

    return onCloudAuthChange((nextUser) => {
      setCloudUser(nextUser || null);
      setCloudAuthReady(true);
      setCloudSyncState((prev) => ({
        ...prev,
        status: 'idle',
        message: nextUser
          ? `מחובר: ${nextUser.displayName || nextUser.email || 'Google'}`
          : 'לא מחובר לענן',
        lastSavedAt: nextUser ? prev.lastSavedAt : '',
        documentId: nextUser ? prev.documentId : '',
        autosaveEnabled: nextUser ? prev.autosaveEnabled : false,
      }));
      if (nextUser) {
        ensureCloudUserProfile(nextUser).catch((error) => {
          console.error('Cloud profile sync failed:', error);
        });
        handleCloudAuthSuccess(nextUser).catch(e => {
          console.error('Cloud settings sync failed:', e);
        });
      }
    });
  }, [cloudAvailable]);

  React.useEffect(() => {
    if (cloudUser) {
      return initCloudSyncListeners(cloudUser);
    }
  }, [cloudUser]);
  const refreshAssignmentBrief = React.useCallback(() => {
    setAssignmentBrief(getPersistedDocumentAssignmentBrief());
  }, []);
  const storeAssignmentBrief = React.useCallback((value = {}) => {
    setAssignmentBrief(persistDocumentAssignmentBrief(value));
  }, []);
  const clearAssignmentBrief = React.useCallback(() => {
    setAssignmentBrief(clearPersistedDocumentAssignmentBrief());
  }, []);
  React.useEffect(() => {
    refreshAssignmentBrief();
    window.addEventListener('focus', refreshAssignmentBrief);
    return () => {
      window.removeEventListener('focus', refreshAssignmentBrief);
    };
  }, [refreshAssignmentBrief]);
  React.useEffect(() => {
    setAssignmentBriefDraft(assignmentBrief.text || '');
  }, [assignmentBrief.text]);
  React.useEffect(() => {
    setAssignmentBriefPanelMode(assignmentBrief.text ? 'preview' : 'edit');
  }, [assignmentBrief.text]);
  React.useEffect(() => {
    if (appMode === 'word') return;
    setAssignmentBriefOpen(false);
  }, [appMode]);
  const saveAssignmentBriefDraft = React.useCallback(() => {
    const nextText = String(assignmentBriefDraft || '').trim();
    if (nextText) {
      storeAssignmentBrief({
        text: nextText,
        fileName: assignmentBrief.fileName,
        sourceLabel: assignmentBrief.fileName ? 'קובץ הנחיות' : 'הנחיות ידניות',
      });
    } else {
      clearAssignmentBrief();
    }
  }, [assignmentBrief.fileName, assignmentBriefDraft, clearAssignmentBrief, storeAssignmentBrief]);
  const handleAssignmentBriefFileSelected = React.useCallback(async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
      const extractedText = await readInstructionFile(file, 18000);
      const nextText = String(extractedText || '').trim();
      if (!nextText) {
        showToast('לא נמצא טקסט קריא בקובץ ההוראות.', { tone: 'warning' });
        return;
      }
      setAssignmentBriefDraft(nextText);
      setAssignmentBriefPanelMode('preview');
      storeAssignmentBrief({
        text: nextText,
        fileName: String(file.name || '').trim(),
        sourceLabel: 'קובץ הנחיות',
      });
    } catch (error) {
      showToast(error?.message || 'לא הצלחתי לקרוא את קובץ ההוראות.', { tone: 'error' });
    } finally {
      if (event?.target) event.target.value = '';
    }
  }, [storeAssignmentBrief]);
  const assignmentBriefPreviewBlocks = React.useMemo(() => parseAssignmentBriefBlocks(assignmentBriefDraft), [assignmentBriefDraft]);
  const triggerDocumentArrival = React.useCallback((tone = 'success') => {
    clearDocumentArrival();
    documentArrivalFrameRef.current = window.requestAnimationFrame(() => {
      documentArrivalFrameRef.current = null;
      setDocumentArrival({ active: true, tone: tone === 'warning' ? 'warning' : 'success' });
      documentArrivalTimerRef.current = window.setTimeout(() => {
        documentArrivalTimerRef.current = null;
        setDocumentArrival((prev) => (prev.active ? { ...prev, active: false } : prev));
      }, DOCUMENT_ARRIVAL_PULSE_DURATION_MS);
    });
  }, [clearDocumentArrival]);
  React.useEffect(() => () => {
    if (documentArrivalFrameRef.current) {
      window.cancelAnimationFrame(documentArrivalFrameRef.current);
    }
    if (documentArrivalTimerRef.current) {
      window.clearTimeout(documentArrivalTimerRef.current);
    }
  }, []);
  const cancelStartTransition = React.useCallback(() => {
    if (startTransitionTimerRef.current) {
      window.clearTimeout(startTransitionTimerRef.current);
      startTransitionTimerRef.current = null;
    }
    startTransitionRunIdRef.current += 1;
    setStartTransitionPhase('idle');
  }, []);
  React.useEffect(() => () => {
    if (startTransitionTimerRef.current) {
      window.clearTimeout(startTransitionTimerRef.current);
      startTransitionTimerRef.current = null;
    }
  }, []);
  const clearDraftReviewState = React.useCallback(() => {
    const currentLiveGeneration = liveGenerationStateRef.current || {};
    const cancelledRunId = String(
      currentLiveGeneration.runId
      || preLiveGenerationSnapshotRef.current.runId
      || lastLiveGenerationShellRef.current.runId
      || ''
    ).trim();
    const currentHtml = normalizeTrackedEditorHtml(String(editor?.getHTML?.() || ''));
    const preGenerationSnapshot = preLiveGenerationSnapshotRef.current;
    const lastShell = lastLiveGenerationShellRef.current;
    const lastPlaceholder = lastLiveGenerationPlaceholderRef.current;
    const matchesTrackedShell = Boolean(
      cancelledRunId
      && lastShell.runId === cancelledRunId
      && currentHtml === lastShell.html
      && isLiveGenerationShellHtml(currentHtml, cancelledRunId)
    );
    const matchesTrackedPlaceholder = Boolean(
      cancelledRunId
      && lastPlaceholder.runId === cancelledRunId
      && currentHtml === lastPlaceholder.html
      && isLiveGenerationErrorPlaceholderHtml(currentHtml, cancelledRunId)
    );
    const shouldRestorePreGenerationSnapshot = Boolean(
      editor
      && cancelledRunId
      && preGenerationSnapshot.runId === cancelledRunId
      && (matchesTrackedShell || matchesTrackedPlaceholder)
    );

    activeGenerationRequestIdRef.current += 1;
    if (shouldRestorePreGenerationSnapshot) {
      editor.commands.setContent(preGenerationSnapshot.html, false);
    }

    preLiveGenerationSnapshotRef.current = { runId: '', html: '' };
    lastLiveGenerationShellRef.current = { runId: '', html: '' };
    lastLiveGenerationPlaceholderRef.current = { runId: '', html: '' };
    clearDocumentArrival();
    setFeedbackSurvey({ ...DEFAULT_FEEDBACK_SURVEY });
    setLastGenerationAction((prev) => {
      const latestLiveGeneration = liveGenerationStateRef.current || {};
      const latestLiveState = String(latestLiveGeneration.state || '').trim();
      const latestLiveRunId = String(latestLiveGeneration.runId || '').trim();

      if (
        latestLiveState !== 'running'
        || !cancelledRunId
        || (latestLiveRunId && latestLiveRunId !== cancelledRunId)
        || !prev
        || typeof prev !== 'object'
      ) {
        return prev;
      }

      const prevInspector = prev.inspector && typeof prev.inspector === 'object'
        ? prev.inspector
        : null;
      const actionRunId = String(prev.runId || '').trim();
      const inspectorRunId = String(prevInspector?.runId || '').trim();

      if (actionRunId !== cancelledRunId && inspectorRunId !== cancelledRunId) {
        return prev;
      }

      return {
        ...prev,
        inspector: {
          ...(prevInspector || {}),
          runId: inspectorRunId || actionRunId,
          liveState: 'cancelled',
        },
      };
    });
    setLiveGeneration((prev) => ({
      ...prev,
      active: false,
      state: 'idle',
      prompt: '',
      runId: '',
    }));
  }, [clearDocumentArrival, editor]);
  const beginGenerationRequest = (runIdPrefix = 'doc') => {
    const requestId = activeGenerationRequestIdRef.current + 1;
    activeGenerationRequestIdRef.current = requestId;
    return {
      requestId,
      runId: `${runIdPrefix}-${Date.now()}-${requestId}`,
      workspaceEpoch: workspaceEpochRef.current,
      workspaceId: getActiveWorkspaceId(),
    };
  };
  const isGenerationRequestCurrent = (request) => (
    activeGenerationRequestIdRef.current === request.requestId
    && workspaceEpochRef.current === request.workspaceEpoch
    && getActiveWorkspaceId() === request.workspaceId
  );

  const handleStreamStart = React.useCallback(() => {
    if (!editor) return;
    setIsAiStreaming(true);
    editor.setEditable(false);
    streamingPos.current = editor.state.selection.to;
  }, [editor]);

  const handleStreamChunk = React.useCallback((chunk) => {
    if (!editor || streamingPos.current === null) return;
    editor.view.dispatch(editor.state.tr.insertText(chunk, streamingPos.current));
    streamingPos.current += chunk.length;
  }, [editor]);

  const handleStreamEnd = React.useCallback(() => {
    if (editor) {
      editor.setEditable(true);
    }
    setIsAiStreaming(false);
    streamingPos.current = null;
  }, [editor]);

  const [activeFormats, setActiveFormats] = React.useState({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    bulletList: false,
    orderedList: false,
    alignRight: true,
    alignCenter: false,
    alignLeft: false,
    alignJustify: false,
    dir: 'rtl',
    fontFamily: 'Alef',
    fontSize: '12',
  });
  // פונקציות מברשת עיצוב מה-DocumentEditor
  const formatPainterRef = React.useRef({ copyFormat: null, applyFormat: null });

  const normalizeFontSizeValue = React.useCallback((rawValue) => {
    const raw = String(rawValue || '').trim().toLowerCase();
    const numeric = parseFloat(raw) || 12;
    if (raw.endsWith('px')) return String(Math.max(8, Math.round(numeric * 0.75)));
    return String(Math.max(8, Math.round(numeric)));
  }, []);

  const applyDocumentStyleToEditor = React.useCallback((styleId, currentEditor = editor) => {
    if (!currentEditor?.view?.dom) return;
    const preset = DOCUMENT_STYLE_PRESETS[styleId] || DOCUMENT_STYLE_PRESETS.academic;
    const dom = currentEditor.view.dom;
    let styleOverrides = {};
    try {
      styleOverrides = JSON.parse(localStorage.getItem('wordflow_style_overrides') || '{}');
    } catch {
      styleOverrides = {};
    }
    const currentOverride = styleOverrides?.[styleId] || {};
    const savedFont = String(wordPreferences.defaultFontStack || localStorage.getItem('default-font-stack') || wordPreferences.defaultFontFamily || localStorage.getItem('default-font') || '').trim();
    const savedSizeRaw = String(wordPreferences.defaultFontSize || localStorage.getItem('default-size') || '').trim();
    const savedSize = savedSizeRaw && /px|pt|em|rem$/i.test(savedSizeRaw) ? savedSizeRaw : (savedSizeRaw ? `${savedSizeRaw}pt` : '');
    const pageWidth = dom.dataset.customWidth || preset.maxWidth || '21cm';
    const pagePadding = dom.dataset.customPadding || preset.padding;
    const pageFontSize = currentOverride.fontSize || savedSize || preset.fontSize;
    dom.setAttribute('data-doc-style', styleId);
    dom.style.fontFamily = currentOverride.fontFamily || savedFont || preset.fontFamily;
    dom.style.setProperty('--wordai-page-width', pageWidth);
    dom.style.setProperty('--wordai-page-padding', pagePadding);
    dom.style.setProperty('--wordai-page-font-size', pageFontSize);
    dom.style.setProperty('--wordai-page-line-height', currentOverride.lineHeight || preset.lineHeight);
    dom.style.fontSize = dom.dataset.viewMode === 'print' ? 'var(--wordai-page-font-size)' : pageFontSize;
    dom.style.lineHeight = currentOverride.lineHeight || preset.lineHeight;
    dom.style.padding = dom.dataset.viewMode === 'print' ? 'var(--wordai-page-padding)' : pagePadding;
    dom.style.width = dom.dataset.viewMode === 'print' ? 'var(--wordai-page-width)' : dom.style.width;
    dom.style.maxWidth = dom.dataset.viewMode === 'print' ? 'calc(100vw - 32px)' : dom.style.maxWidth;
    dom.style.background = dom.dataset.customBackground || preset.background;
    dom.style.textAlign = preset.textAlign;
    dom.style.border = dom.dataset.customBorder || dom.style.border;
  }, [editor, wordPreferences]);

  const hasMeaningfulEditorContent = React.useCallback((currentEditor = editor) => {
    if (!currentEditor) return false;
    const html = String(currentEditor.getHTML?.() || '');
    const plain = String(currentEditor.getText?.() || '').trim();
    if (plain.length > 0) return true;
    return /<(img|table|hr|ul|ol|li|blockquote)\b|data-type="page-break"/i.test(html);
  }, [editor]);

  const resolveCurrentDraftFeedbackMeta = React.useCallback(() => {
    const templateId = activeTemplateId || 'blank';
    const editorText = String(editor?.getText?.() || '').trim();
    const prompt = getDraftTitleFromFilePath(currentFilePath)
      || getDraftTitleFromText(editorText, templateId)
      || GENERATION_LABEL_FALLBACKS[templateId]
      || GENERATION_LABEL_FALLBACKS.blank;
    const surveyPrompt = String(feedbackSurvey.prompt || '').trim();
    const surveyTemplateId = String(feedbackSurvey.templateId || '').trim() || 'blank';
    const matchesActiveDraft = Boolean(surveyPrompt)
      && surveyPrompt === prompt
      && surveyTemplateId === templateId;

    return {
      matchesActiveDraft,
      prompt,
      templateId,
      selectedMaterials: matchesActiveDraft && Array.isArray(feedbackSurvey.selectedMaterials)
        ? feedbackSurvey.selectedMaterials.filter(Boolean)
        : [],
      selectedModel: matchesActiveDraft ? String(feedbackSurvey.selectedModel || '').trim() : '',
      selectedProviderId: matchesActiveDraft ? String(feedbackSurvey.selectedProviderId || '').trim() : '',
      selectedProviderModel: matchesActiveDraft ? String(feedbackSurvey.selectedProviderModel || '').trim() : '',
    };
  }, [editor, currentFilePath, feedbackSurvey.prompt, feedbackSurvey.templateId, feedbackSurvey.selectedMaterials, feedbackSurvey.selectedModel, feedbackSurvey.selectedProviderId, feedbackSurvey.selectedProviderModel, activeTemplateId]);

  const openDraftRecommendations = React.useCallback(() => {
    if (feedbackSurvey.submitting || liveGeneration.state === 'running' || !hasMeaningfulEditorContent(editor)) {
      return;
    }

    const currentDraftContext = resolveCurrentDraftFeedbackMeta();
    if (showStartScreen) {
      setShowStartScreen(false);
    }
    setFeedbackSurvey((prev) => ({
      ...buildFeedbackSurveyStateWithGenerationContext(currentDraftContext, currentDraftContext.matchesActiveDraft ? prev : {}),
      open: true,
      phase: 'details',
    }));
  }, [editor, feedbackSurvey.submitting, hasMeaningfulEditorContent, liveGeneration.state, resolveCurrentDraftFeedbackMeta, showStartScreen]);

  const changeDocumentStyle = React.useCallback((styleId) => {
    const nextStyle = DOCUMENT_STYLE_PRESETS[styleId] ? styleId : 'academic';
    setDocumentStyle(nextStyle);
    localStorage.setItem('wordai_document_style', nextStyle);
    syncPersistedAppSettings();
    applyDocumentStyleToEditor(nextStyle);
  }, [applyDocumentStyleToEditor]);

  React.useEffect(() => {
    applyDocumentStyleToEditor(documentStyle);
  }, [documentStyle, wordPreferences.defaultFontFamily, wordPreferences.defaultFontSize, applyDocumentStyleToEditor]);

  const focusEditorSoon = React.useCallback((position = 'end') => {
    window.requestAnimationFrame(() => {
      try {
        editor?.chain().focus(position).run();
      } catch {}
    });
  }, [editor]);

  const completeStartTransition = React.useCallback((runId = startTransitionRunIdRef.current) => {
    if (runId !== startTransitionRunIdRef.current) return;
    if (startTransitionTimerRef.current) {
      window.clearTimeout(startTransitionTimerRef.current);
      startTransitionTimerRef.current = null;
    }
    setStartTransitionPhase('idle');
    setShowStartScreen(false);
    focusEditorSoon(pendingStartTransitionFocusRef.current || 'start');
  }, [focusEditorSoon]);

  const runStartTransition = React.useCallback((applyChange, focusPosition = 'start') => {
    if (!editor) {
      showToast('העורך עדיין נטען. נסה שוב בעוד רגע.', { tone: 'warning' });
      return false;
    }
    applyChange(editor);
    pendingStartTransitionFocusRef.current = focusPosition;

    const runId = startTransitionRunIdRef.current + 1;
    startTransitionRunIdRef.current = runId;

    if (getPrefersReducedMotion() || !showStartScreen) {
      completeStartTransition(runId);
      return true;
    }

    if (startTransitionTimerRef.current) {
      window.clearTimeout(startTransitionTimerRef.current);
      startTransitionTimerRef.current = null;
    }
    setStartTransitionPhase('running');
    startTransitionTimerRef.current = window.setTimeout(() => {
      completeStartTransition(runId);
    }, START_SCREEN_TRANSITION_DURATION_MS);
    return true;
  }, [completeStartTransition, editor, showStartScreen]);

  const openExternalLink = React.useCallback((url) => {
    if (!url) return;
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      window.location.href = url;
    }
  }, []);

  const sanitizeLinkUrl = React.useCallback((rawUrl = '') => {
    const value = String(rawUrl || '').trim();
    if (!value) return '';
    if (/^mailto:/i.test(value)) return value;
    if (/^https?:\/\//i.test(value)) return value;
    return '';
  }, []);

  const requestInputDialog = React.useCallback((config = {}) => new Promise((resolve) => {
    const fields = Array.isArray(config.fields) ? config.fields : [];
    const nextValues = fields.reduce((acc, field) => {
      acc[field.id] = String(field.value ?? '');
      return acc;
    }, {});

    setInputDialog({
      open: true,
      title: config.title || 'השלם פרטים',
      description: config.description || '',
      fields,
      values: nextValues,
      confirmLabel: config.confirmLabel || 'אישור',
      closeOnEscape: config.closeOnEscape !== false,
      closeOnBackdrop: config.closeOnBackdrop === true,
      submitOnEnter: config.submitOnEnter !== false,
      submitOnCtrlEnterForTextarea: config.submitOnCtrlEnterForTextarea !== false,
      resolve,
    });
  }), []);

  // רענון רשימת השינויים המסומנים כשהחלונית פתוחה
  React.useEffect(() => {
    if (!editor || !trackPanelOpen) return undefined;
    const refresh = () => setTrackedChanges(collectTrackedChanges(editor));
    refresh();
    editor.on('update', refresh);
    return () => editor.off('update', refresh);
  }, [editor, trackPanelOpen]);

  // עריכת משוואה קיימת (dblclick על MathNode שולח אירוע עם pos + latex)
  React.useEffect(() => {
    const onEditMath = async (event) => {
      if (!editor) return;
      const { pos, latex } = event.detail || {};
      if (typeof pos !== 'number') return;
      const result = await requestInputDialog({
        title: 'עריכת משוואה',
        description: 'תחביר LaTeX',
        fields: [{ id: 'latex', label: 'נוסחה (LaTeX)', type: 'textarea', value: latex || '' }],
        confirmLabel: 'עדכן',
      });
      const nextLatex = String(result?.latex || '').trim();
      if (!nextLatex) return;
      editor.chain().focus().updateMathNodeAt(pos, nextLatex).run();
    };
    window.addEventListener('wordflow:edit-math', onEditMath);
    return () => window.removeEventListener('wordflow:edit-math', onEditMath);
  }, [editor, requestInputDialog]);

  const closeInputDialog = React.useCallback((result = null) => {
    setInputDialog((prev) => {
      try {
        prev.resolve?.(result);
      } catch {}
      return { ...DEFAULT_INPUT_DIALOG };
    });
  }, []);

  const submitInputDialog = React.useCallback(() => {
    closeInputDialog(inputDialog.values || {});
  }, [closeInputDialog, inputDialog.values]);

  const closeCopyleaksDetector = React.useCallback(() => {
    setCopyleaksDetector((prev) => (prev.open ? { ...DEFAULT_COPYLEAKS_DETECTOR } : prev));
  }, []);

  const copyPlainTextToClipboard = React.useCallback(async (text = '') => {
    const value = String(text || '');
    if (!value.trim()) return false;

    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        return copied;
      } catch {
        return false;
      }
    }
  }, []);

  const openCopyleaksDetector = React.useCallback((source = 'selection') => {
    const normalizedSource = COPYLEAKS_SOURCE_LABELS[source] ? source : 'selection';
    const nextText = normalizedSource === 'document'
      ? String(editor?.getText?.() || '')
      : normalizedSource === 'currentBlock'
        ? String(currentBlockText || '')
        : String(selectedText || '');

    if (normalizedSource === 'selection' && !nextText.trim()) {
      showToast('אין כרגע טקסט מסומן לבדיקה.', { tone: 'warning' });
      return;
    }
    if (normalizedSource === 'currentBlock' && !nextText.trim()) {
      showToast('לא זוהתה פסקה פעילה לבדיקה.', { tone: 'warning' });
      return;
    }
    if (normalizedSource === 'document' && !nextText.trim()) {
      showToast('המסמך ריק כרגע.', { tone: 'warning' });
      return;
    }

    setCopyleaksDetector({
      ...DEFAULT_COPYLEAKS_DETECTOR,
      open: true,
      source: normalizedSource,
      sourceLabel: COPYLEAKS_SOURCE_LABELS[normalizedSource],
      text: nextText,
    });
  }, [currentBlockText, editor, selectedText]);

  const openCopyleaksSettingsPanel = React.useCallback(() => {
    closeCopyleaksDetector();
    setFileMenuTargetTab('ai');
    setFileMenuOpen(true);
  }, [closeCopyleaksDetector]);

  const submitCopyleaksDetector = React.useCallback(async () => {
    const stats = getCopyleaksTextStats(copyleaksDetector.text);
    const validationMessage = getCopyleaksValidationMessage(copyleaksDetector.text);
    const copyleaksConfig = normalizeCopyleaksConfig(getProviderConfig().copyleaks);

    if (!copyleaksConfig.email || !copyleaksConfig.key) {
      setCopyleaksDetector((prev) => ({
        ...prev,
        submitting: false,
        result: null,
        error: 'לפני שמריצים בדיקה, מלאו בהגדרות את האימייל והמפתח הסודי של Copyleaks.',
      }));
      return;
    }

    if (!stats.isValid) {
      setCopyleaksDetector((prev) => ({
        ...prev,
        submitting: false,
        result: null,
        error: validationMessage || 'הטקסט לא עומד במגבלות Copyleaks.',
      }));
      return;
    }

    setCopyleaksDetector((prev) => ({
      ...prev,
      submitting: true,
      error: '',
      result: null,
      scoreFlash: null,
    }));

    try {
      const result = await detectCopyleaksText(copyleaksConfig, copyleaksDetector.text);
      const aiScore = Number(result?.summary?.ai);
      const normalizedAiScore = Number.isFinite(aiScore) ? Math.max(0, Math.min(100, aiScore)) : null;
      const scoreFlash = normalizedAiScore == null
        ? null
        : {
            value: normalizedAiScore,
            emoji: normalizedAiScore <= 15 ? '😎' : normalizedAiScore <= 45 ? '🙂' : normalizedAiScore <= 70 ? '😬' : '🚨',
            tone: normalizedAiScore <= 15 ? 'success' : normalizedAiScore <= 45 ? 'balanced' : normalizedAiScore <= 70 ? 'warning' : 'danger',
            label: normalizedAiScore <= 15 ? 'כמעט לא זוהה כ-AI' : normalizedAiScore <= 45 ? 'זיהוי בינוני' : normalizedAiScore <= 70 ? 'זיהוי גבוה' : 'זיהוי AI גבוה',
          };
      setCopyleaksDetector((prev) => ({
        ...prev,
        submitting: false,
        error: '',
        result,
        scoreFlash,
      }));
    } catch (error) {
      setCopyleaksDetector((prev) => ({
        ...prev,
        submitting: false,
        result: null,
        error: error?.message || 'Copyleaks לא הצליח להשלים את הבדיקה.',
        scoreFlash: null,
      }));
    }
  }, [copyleaksDetector.text]);

  const toggleFeedbackOption = React.useCallback((option) => {
    setFeedbackSurvey((prev) => ({
      ...prev,
      selectedOptions: prev.selectedOptions.includes(option)
        ? prev.selectedOptions.filter((item) => item !== option)
        : [...prev.selectedOptions, option],
    }));
  }, []);

  const submitDocumentFeedback = React.useCallback(async () => {
    const selectedOptions = feedbackSurvey.selectedOptions || [];
    const freeText = String(feedbackSurvey.freeText || '').trim();
    const requestedExecutionMode = normalizeFeedbackExecutionMode(feedbackSurvey.executionMode);
    const workflowAvailable = isFeedbackWorkflowAvailable();
    const executionMode = requestedExecutionMode === 'workspace' && workflowAvailable ? 'workspace' : 'direct';
    const roundIndex = normalizeFeedbackRoundIndex(feedbackSurvey.roundIndex);
    const surveySnapshot = {
      ...feedbackSurvey,
      selectedOptions: [...selectedOptions],
      freeText,
      executionMode,
      roundIndex,
      phase: 'details',
      reviewResult: null,
      reviewFocus: '',
      reviewErrorMessage: '',
    };

    if (!selectedOptions.length && !freeText) {
      showToast('בחר לפחות אפשרות אחת או כתוב הערה חופשית.', { tone: 'warning' });
      return;
    }

    const feedbackText = buildFeedbackSurveyRequestText({
      selectedOptions,
      freeText,
      includeIntro: true,
    });

    await runDocumentFeedbackRevision({
      kind: 'feedback-revision',
      workspaceId: getActiveWorkspaceId(),
      payload: {
        existingHtml: editor?.getHTML?.() || '',
        originalPrompt: feedbackSurvey.prompt,
        templateId: feedbackSurvey.templateId || activeTemplateId || 'blank',
        feedback: feedbackText,
        selectedMaterials: Array.isArray(feedbackSurvey.selectedMaterials) ? feedbackSurvey.selectedMaterials.filter(Boolean) : [],
        selectedModel: String(feedbackSurvey.selectedModel || '').trim(),
        selectedProviderId: String(feedbackSurvey.selectedProviderId || '').trim(),
        selectedProviderModel: String(feedbackSurvey.selectedProviderModel || '').trim(),
        useWorkspaceV2: feedbackSurvey.useWorkspaceV2 === true,
        workspaceV2TemplateId: String(feedbackSurvey.workspaceV2TemplateId || '').trim(),
        executionMode,
        roundIndex,
        surveySnapshot,
      },
    });
  }, [activeTemplateId, editor, feedbackSurvey]);

  const requestDocumentRecommendations = React.useCallback(async () => {
    const selectedOptions = feedbackSurvey.selectedOptions || [];
    const freeText = String(feedbackSurvey.freeText || '').trim();
    const reviewFocus = buildFeedbackSurveyRequestText({
      selectedOptions,
      freeText,
      includeIntro: false,
    });
    const surveySnapshot = {
      ...feedbackSurvey,
      selectedOptions: [...selectedOptions],
      freeText,
      phase: 'details',
      reviewResult: null,
      reviewFocus,
      reviewApplySelection: '',
      reviewErrorMessage: '',
    };

    await runDocumentRecommendationsReview({
      kind: 'review-recommendations',
      workspaceId: getActiveWorkspaceId(),
      payload: {
        existingHtml: editor?.getHTML?.() || '',
        originalPrompt: feedbackSurvey.prompt,
        templateId: feedbackSurvey.templateId || activeTemplateId || 'blank',
        selectedMaterials: Array.isArray(feedbackSurvey.selectedMaterials) ? feedbackSurvey.selectedMaterials.filter(Boolean) : [],
        selectedModel: String(feedbackSurvey.selectedModel || '').trim(),
        selectedProviderId: String(feedbackSurvey.selectedProviderId || '').trim(),
        selectedProviderModel: String(feedbackSurvey.selectedProviderModel || '').trim(),
        focus: reviewFocus,
        surveySnapshot,
      },
    });
  }, [activeTemplateId, editor, feedbackSurvey]);

  const closeFeedbackSurvey = React.useCallback(() => {
    setFeedbackSurvey((prev) => {
      if (prev.submitting) {
        return prev;
      }

      return {
        ...buildFeedbackSurveyStateWithGenerationContext(prev),
        open: false,
        phase: 'details',
      };
    });
  }, []);

  React.useEffect(() => {
    if (appMode !== 'spss') return;
    closeInputDialog(null);
    setCopyleaksDetector((prev) => (prev.open ? { ...prev, open: false } : prev));
    setFeedbackSurvey((prev) => (prev.open ? { ...prev, open: false } : prev));
  }, [appMode, closeInputDialog]);

  const openHomeSafely = React.useCallback(() => {
    cancelStartTransition();

    if (typeof document !== 'undefined') {
      const wrapper = document.getElementById('editor-wrapper');
      const activeElement = document.activeElement;

      if (wrapper instanceof HTMLElement && activeElement instanceof HTMLElement && wrapper.contains(activeElement)) {
        activeElement.blur();
      }
    }

    closeInputDialog(null);
    setFeedbackSurvey((prev) => (prev.open ? { ...prev, open: false } : prev));
    if (appMode !== 'word') {
      setAppMode('word');
    }
    setShowStartScreen(true);
  }, [appMode, cancelStartTransition, closeInputDialog]);

  const approveFeedbackSurvey = React.useCallback(() => {
    setFeedbackSurvey((prev) => ({
      ...buildFeedbackSurveyStateWithGenerationContext(prev),
      open: false,
      phase: 'details',
    }));
    setLiveGeneration((prev) => ({ ...prev, active: false }));
  }, []);

  const currentWorkspaceId = getActiveWorkspaceId();
  const currentProviderConfig = getProviderConfig();
  const configuredProviderChoices = getConfiguredProviderChoices(currentProviderConfig);
  const feedbackWorkflowAvailable = isFeedbackWorkflowAvailable();
  const feedbackExecutionMode = normalizeFeedbackExecutionMode(feedbackSurvey.executionMode);
  const effectiveFeedbackExecutionMode = feedbackExecutionMode === 'workspace' && feedbackWorkflowAvailable ? 'workspace' : 'direct';
  const feedbackRoundIndex = normalizeFeedbackRoundIndex(feedbackSurvey.roundIndex);
  const feedbackRevisionPending = feedbackSurvey.submitting && String(liveGeneration.runId || '').startsWith('doc-feedback');
  const feedbackSubmitLabel = feedbackRevisionPending ? 'מעדכן...' : 'שלח לעדכון ישיר';
  const liveGenerationStages = Array.isArray(liveGeneration.summary?.stages) ? liveGeneration.summary.stages : [];
  const failedGenerationStage = isLiveGenerationFailureState(liveGeneration.state)
    ? [...liveGenerationStages].reverse().find((stage) => stage?.state === 'error' && stage?.id) || null
    : null;
  const activeWorkspaceAgents = lastGenerationAction?.workspaceId === currentWorkspaceId && liveGeneration.workspaceId === currentWorkspaceId
    ? getRoleAgents()
    : [];
  const failedStageAgentRecord = failedGenerationStage
    ? activeWorkspaceAgents.find((agent) => agent.id === failedGenerationStage.id) || null
    : null;
  const failedStageCurrentProvider = failedStageAgentRecord?.provider || failedGenerationStage?.provider || '';
  const failedStageCurrentModel = failedStageAgentRecord?.model || failedGenerationStage?.model || '';
  const recoveryModelChoices = getProviderModelChoices(
    generationRecovery.provider || failedStageCurrentProvider,
    currentProviderConfig,
    [failedGenerationStage?.model, failedStageAgentRecord?.model].filter(Boolean),
  );
  const canRetryFailedGeneration = Boolean(
    isLiveGenerationFailureState(liveGeneration.state)
    && failedGenerationStage?.id
    && failedStageAgentRecord
    && lastGenerationAction?.payload
    && lastGenerationAction.workspaceId === currentWorkspaceId
    && liveGeneration.workspaceId === currentWorkspaceId
    && configuredProviderChoices.length
  );
  const failedStageProviderLabel = configuredProviderChoices.find((item) => item.id === failedStageCurrentProvider)?.label || failedStageCurrentProvider || 'לא הוגדר';
  const failedStageModelLabel = failedStageCurrentModel || 'לא הוגדר';

  React.useEffect(() => {
    if (!canRetryFailedGeneration) {
      setGenerationRecovery((prev) => (
        prev.runId || prev.agentId || prev.provider || prev.model || prev.error || prev.pending
          ? { runId: '', agentId: '', provider: '', model: '', pending: false, error: '' }
          : prev
      ));
      return;
    }

    const initialProvider = configuredProviderChoices.some((item) => item.id === failedStageCurrentProvider)
      ? failedStageCurrentProvider
      : (configuredProviderChoices[0]?.id || '');
    const initialModels = getProviderModelChoices(initialProvider, currentProviderConfig, [failedGenerationStage?.model, failedStageAgentRecord?.model].filter(Boolean));
    const preferredModel = failedStageCurrentModel && initialModels.includes(failedStageCurrentModel)
      ? failedStageCurrentModel
      : (initialModels[0] || '');

    setGenerationRecovery((prev) => {
      if (prev.runId === liveGeneration.runId && prev.agentId === failedGenerationStage.id) {
        return prev;
      }
      return {
        runId: liveGeneration.runId,
        agentId: failedGenerationStage.id,
        provider: initialProvider,
        model: preferredModel,
        pending: false,
        error: '',
      };
    });
  }, [canRetryFailedGeneration, configuredProviderChoices, currentProviderConfig, failedGenerationStage, failedStageAgentRecord, failedStageCurrentModel, failedStageCurrentProvider, liveGeneration.runId]);

  const handleRecoveryProviderChange = React.useCallback((event) => {
    const nextProvider = String(event.target.value || '').trim();
    const nextModels = getProviderModelChoices(nextProvider, getProviderConfig(), [failedGenerationStage?.model, failedStageAgentRecord?.model].filter(Boolean));
    setGenerationRecovery((prev) => ({
      ...prev,
      provider: nextProvider,
      model: nextModels[0] || '',
      error: '',
    }));
  }, [failedGenerationStage, failedStageAgentRecord]);

  const handleRecoveryModelChange = React.useCallback((event) => {
    const nextModel = String(event.target.value || '').trim();
    setGenerationRecovery((prev) => ({
      ...prev,
      model: nextModel,
      error: '',
    }));
  }, []);

  const retryFailedGenerationWithUpdatedAgent = React.useCallback(async () => {
    if (!canRetryFailedGeneration || generationRecovery.pending) return;

    const nextProvider = String(generationRecovery.provider || '').trim();
    const nextModel = String(generationRecovery.model || '').trim();
    if (!nextProvider || !nextModel) {
      setGenerationRecovery((prev) => ({ ...prev, error: 'בחר provider ומודל תקפים לפני ההרצה מחדש.' }));
      return;
    }

    const latestEditorHtml = editor?.getHTML?.() || '';
    const agents = getRoleAgents();
    const targetAgent = agents.find((agent) => agent.id === failedGenerationStage.id);
    if (!targetAgent) {
      setGenerationRecovery((prev) => ({ ...prev, error: 'לא מצאתי את הסוכן שנכשל בסביבת העבודה הפעילה.' }));
      return;
    }

    const updated = updateCurrentWorkspace({
      agents: agents.map((agent) => (agent.id === targetAgent.id ? { ...agent, provider: nextProvider, model: nextModel } : agent)),
    });
    if (!updated) {
      setGenerationRecovery((prev) => ({ ...prev, error: 'לא הצלחתי לעדכן את הסוכן בסביבת העבודה הפעילה.' }));
      return;
    }

    setGenerationRecovery((prev) => ({ ...prev, pending: true, error: '' }));
    try {
      const started = await runStoredGenerationAction({
        ...lastGenerationAction,
        workspaceId: currentWorkspaceId,
        payload: {
          ...(lastGenerationAction?.payload || {}),
          ...((lastGenerationAction?.kind === 'feedback-revision' || lastGenerationAction?.kind === 'review-recommendations')
            ? { existingHtml: latestEditorHtml }
            : {}),
        },
      }, { skipConfirmReplace: true });
      if (!started) {
        setGenerationRecovery((prev) => ({ ...prev, error: 'לא הצלחתי להפעיל מחדש את הפעולה האחרונה.' }));
      }
    } finally {
      setGenerationRecovery((prev) => ({ ...prev, pending: false }));
    }
  }, [canRetryFailedGeneration, currentWorkspaceId, editor, failedGenerationStage, generationRecovery.model, generationRecovery.pending, generationRecovery.provider, lastGenerationAction]);

  const updateActiveFormats = React.useCallback((currentEditor) => {
    if (!currentEditor) return;
    const textStyleAttrs = currentEditor.getAttributes('textStyle') || {};
    const rawFontFamily = String(textStyleAttrs.fontFamily || window.getComputedStyle(currentEditor.view.dom).fontFamily || 'Alef');
    const fontFamily = rawFontFamily.split(',')[0].replace(/["']/g, '').trim() || 'Alef';
    const rawFontSize = String(textStyleAttrs.fontSize || window.getComputedStyle(currentEditor.view.dom).fontSize || '12pt');
    const fontSize = normalizeFontSizeValue(rawFontSize);

    setActiveFormats({
      bold: currentEditor.isActive('bold'),
      italic: currentEditor.isActive('italic'),
      underline: currentEditor.isActive('underline'),
      strike: currentEditor.isActive('strike'),
      bulletList: currentEditor.isActive('bulletList'),
      orderedList: currentEditor.isActive('orderedList'),
      alignRight: currentEditor.isActive({ textAlign: 'right' }),
      alignCenter: currentEditor.isActive({ textAlign: 'center' }),
      alignLeft: currentEditor.isActive({ textAlign: 'left' }),
      alignJustify: currentEditor.isActive({ textAlign: 'justify' }),
      dir: currentEditor.getAttributes('paragraph')?.dir || 'rtl',
      headingLevel: [1, 2, 3, 4, 5, 6].find((level) => currentEditor.isActive('heading', { level })) || 0,
      isBlockquote: currentEditor.isActive('blockquote'),
      isParagraph: currentEditor.isActive('paragraph'),
      fontFamily,
      fontSize,
    });
  }, []);

  React.useEffect(() => {
    const syncLiveGeneration = (event) => {
      const nextAutomation = getWorkspaceAutomation();
      const nextWorkspaceId = getActiveWorkspaceId();
      const previousWorkspaceId = activeWorkspaceIdRef.current;
      const isWorkspaceChange = event?.type === 'wordai-workspace-changed';
      const hasWorkspaceSwitched = isWorkspaceChange && previousWorkspaceId !== nextWorkspaceId;
      if (hasWorkspaceSwitched) {
        workspaceEpochRef.current += 1;
        setFeedbackSurvey({ ...DEFAULT_FEEDBACK_SURVEY });
      }
      setLiveGeneration((prev) => {
        const scopedRunId = hasWorkspaceSwitched ? '' : String(prev.runId || '').trim();
        const scopedWorkspaceId = nextWorkspaceId || previousWorkspaceId;
        return {
          ...(hasWorkspaceSwitched
            ? { active: false, state: 'idle', prompt: '', runId: '' }
            : prev),
          summary: getLatestAgentRunSummary(nextAutomation, scopedRunId),
          logs: getRecentAgentLogs(18, { workspaceId: scopedWorkspaceId, runId: scopedRunId }),
          runId: scopedRunId,
          workspaceId: scopedWorkspaceId,
        };
      });
      activeWorkspaceIdRef.current = nextWorkspaceId || previousWorkspaceId;
    };

    syncLiveGeneration();
    window.addEventListener('wordai-agent-logs-updated', syncLiveGeneration);
    window.addEventListener('wordai-workspace-changed', syncLiveGeneration);
    return () => {
      window.removeEventListener('wordai-agent-logs-updated', syncLiveGeneration);
      window.removeEventListener('wordai-workspace-changed', syncLiveGeneration);
    };
  }, []);

  React.useEffect(() => {
    if (!editor) return;
    if (liveGeneration.state !== 'running') {
      lastLiveGenerationShellRef.current = { runId: '', html: '' };
      return;
    }

    const currentHtml = normalizeTrackedEditorHtml(String(editor.getHTML?.() || ''));
    const lastShell = lastLiveGenerationShellRef.current;
    if (!lastShell.html || lastShell.runId !== liveGeneration.runId || currentHtml !== lastShell.html) {
      lastLiveGenerationShellRef.current = { runId: '', html: '' };
      return;
    }
    if (!isLiveGenerationShellHtml(currentHtml, liveGeneration.runId)) {
      lastLiveGenerationShellRef.current = { runId: '', html: '' };
      return;
    }

    const nextShell = buildLiveGenerationShell({
      titleText: liveGeneration.prompt || 'מסמך חדש',
      state: liveGeneration.state,
      stages: liveGeneration.summary?.stages || [],
      logs: liveGeneration.logs || [],
      runId: liveGeneration.runId,
    });

    if (currentHtml === nextShell) return;
    editor.commands.setContent(nextShell, false);
    lastLiveGenerationShellRef.current = {
      runId: liveGeneration.runId,
      html: normalizeTrackedEditorHtml(String(editor.getHTML?.() || nextShell)),
    };
  }, [editor, liveGeneration.state, liveGeneration.prompt, liveGeneration.summary, liveGeneration.logs, liveGeneration.runId]);

  // Ref allows the keyboard shortcut effect to call handleCommand without
  // adding it to the dependency array (which would cause a TDZ error since
  // handleCommand is defined later in the component body).
  const handleCommandRef = React.useRef(null);
  const runGuardedSaveCommand = React.useCallback(async (runner) => {
    if (saveOperationInFlightRef.current) return { skipped: true };
    saveOperationInFlightRef.current = true;
    try {
      return await runner();
    } finally {
      saveOperationInFlightRef.current = false;
    }
  }, []);

  React.useEffect(() => {
    const handler = (e) => {
      if (appMode === 'spss') {
        return;
      }

      if (matchShortcut(e, shortcuts.toggleAssistant)) {
        e.preventDefault();
        setAssistantTrigger('manual');
        if (Date.now() >= assistantAutoPopupBlockedUntil) {
          setLastEditorActivityAt(Date.now());
        }
        setSidebarOpen(v => !v);
        return;
      }

      if (matchShortcut(e, shortcuts.openFileMenu)) {
        e.preventDefault();
        setFileMenuTargetTab(null);
        setFileMenuOpen(true);
        return;
      }

      if (matchShortcut(e, shortcuts.saveLocal)) {
        e.preventDefault();
        if (e.repeat) return;
        Promise.resolve(handleCommandRef.current?.('saveLocal')).catch((error) => {
          console.error('Keyboard save shortcut failed:', error);
          showToast(error?.message || 'השמירה נכשלה.', { tone: 'error' });
        });
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [shortcuts, editor, appMode]);

  React.useEffect(() => {
    if (appMode === 'word') return;
    setFileMenuOpen(false);
    setFileMenuTargetTab(null);
  }, [appMode]);

  React.useEffect(() => {
    const isInputDialogVisible = inputDialog.open;
    const isCopyleaksDetectorVisible = copyleaksDetector.open && !showStartScreen;
    const isFeedbackSurveyVisible = feedbackSurvey.open && !showStartScreen;
    const topmostOverlay = helpModalOpen
      ? 'help-modal'
      : fileMenuOpen
      ? ''
      : assignmentBriefOpen && !showStartScreen
        ? 'assignment-brief'
        : isInputDialogVisible && inputDialog.closeOnEscape !== false
        ? 'input-dialog'
        : isCopyleaksDetectorVisible
          ? 'copyleaks-detector'
        : isFeedbackSurveyVisible
          ? 'feedback-survey'
          : sidebarOpen && !showStartScreen
            ? 'ai-sidebar'
            : '';
    if (!topmostOverlay) return;

    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;

      if (topmostOverlay === 'help-modal') {
        event.preventDefault();
        setHelpModalOpen(false);
        return;
      }

      if (topmostOverlay === 'input-dialog') {
        event.preventDefault();
        closeInputDialog(null);
        return;
      }

      if (topmostOverlay === 'assignment-brief') {
        event.preventDefault();
        setAssignmentBriefOpen(false);
        return;
      }

      if (topmostOverlay === 'copyleaks-detector') {
        event.preventDefault();
        closeCopyleaksDetector();
        return;
      }

      if (topmostOverlay === 'feedback-survey') {
        event.preventDefault();
        closeFeedbackSurvey();
        return;
      }

      event.preventDefault();
      closeAssistantPopup();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [
    inputDialog.open,
    inputDialog.closeOnEscape,
    copyleaksDetector.open,
    feedbackSurvey.open,
    helpModalOpen,
    assignmentBriefOpen,
    sidebarOpen,
    fileMenuOpen,
    showStartScreen,
    closeInputDialog,
    closeCopyleaksDetector,
    closeFeedbackSurvey,
  ]);

  const initializedDocRef = React.useRef(false);

  const openUpdatesPanel = React.useCallback(() => {
    setFileMenuTargetTab('updates');
    setFileMenuOpen(true);
    setUpdateCheckToken((prev) => prev + 1);
  }, []);

  const handleEditorReady = React.useCallback((ed, helpers) => {
    setEditor(ed);
    updateActiveFormats(ed);
    if (helpers) {
      formatPainterRef.current = helpers;
      setFormatPainterActive(helpers.formatPainterActive);
    }
  }, [updateActiveFormats]);

  // קיצורי Word לחיפוש והחלפה: Ctrl/⌘+F לחיפוש, Ctrl/⌘+H להחלפה.
  React.useEffect(() => {
    if (appMode !== 'word' || showStartScreen) return undefined;
    const onKeyDown = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = String(event.key || '').toLowerCase();
      if (key === 'f') {
        event.preventDefault();
        setFindReplace({ open: true, mode: 'find' });
      } else if (key === 'h') {
        event.preventDefault();
        setFindReplace({ open: true, mode: 'replace' });
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [appMode, showStartScreen]);

  // מעקב אחר בחירת טקסט + מצב עיצוב פעיל
  React.useEffect(() => {
    if (!editor) return;
    let frameId = null;

    const syncState = (includePages = false, markEditorActivity = false) => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const { doc, selection } = editor.state;
        const nextEditTarget = buildEditTargetFromState(editor.state);
        setSelectedText(nextEditTarget.selection?.text || '');
        setSelectionContext(nextEditTarget.selection ? {
          before: nextEditTarget.selection.before,
          selection: nextEditTarget.selection.text,
          after: nextEditTarget.selection.after,
        } : null);
        setCurrentBlockText(nextEditTarget.block?.text || '');
        setEditTarget(nextEditTarget);
        if (markEditorActivity) {
          setLastEditorActivityAt(Date.now());
          setLastEditorContentActivityAt(Date.now());
        }
        if (includePages && !paginationDrivenRef.current) {
          // fallback בלבד — כשמנוע העימוד פעיל, pageCount מגיע מאירוע wordflow:pagination
          let markers = 0;
          editor.state.doc.descendants((node) => {
            if (node.type?.name === 'pageBreak') markers += 1;
          });
          setPageCount(markers + 1);
        }
        updateActiveFormats(editor);
      });
    };

    const handleSelection = () => syncState(false, false);
    const handleUpdate = () => syncState(true, true);
    const markManualEdit = () => setLastManualStyleLearningAt(Date.now());
    const dom = editor.view?.dom;

    syncState(true, false);
    editor.on('selectionUpdate', handleSelection);
    editor.on('update', handleUpdate);
    dom?.addEventListener('input', markManualEdit);
    dom?.addEventListener('paste', markManualEdit);
    dom?.addEventListener('drop', markManualEdit);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      editor.off('selectionUpdate', handleSelection);
      editor.off('update', handleUpdate);
      dom?.removeEventListener('input', markManualEdit);
      dom?.removeEventListener('paste', markManualEdit);
      dom?.removeEventListener('drop', markManualEdit);
    };
  }, [editor, updateActiveFormats]);

  const getCurrentEditTarget = React.useCallback(() => {
    if (!editor) return { ...EMPTY_EDIT_TARGET };
    return buildEditTargetFromState(editor.state, { includeFingerprint: true });
  }, [editor]);

  const resolveEditTargetFromPrompt = React.useCallback((promptText = '') => {
    if (!editor?.state?.doc) return null;
    return resolveStructuralEditTarget(editor.state.doc, promptText)
      || resolveBlockEditTarget(editor.state.doc, promptText);
  }, [editor]);

  const resolveEditTargetsFromPrompt = React.useCallback((promptText = '') => {
    if (!editor?.state?.doc) {
      return { targets: [], unresolvedExplicitReferences: [] };
    }
    const hasExplicitStructuralReference = hasExplicitStructuralEditReference(promptText);
    const structuralResolution = resolveExplicitStructuralEditReferences(editor.state.doc, promptText);
    const quotedBlockResolution = resolveQuotedBlockReferences(editor.state.doc, promptText, {
      includeFreeQuoted: !hasExplicitStructuralReference,
    });
    const explicitBlockTargets = hasExplicitStructuralReference
      ? quotedBlockResolution.targets.filter((target) => isBlockingQuotedBlockReference(target?.matchKind))
      : quotedBlockResolution.targets;

    return {
      targets: dedupeResolvedEditTargets([...structuralResolution.targets, ...explicitBlockTargets]),
      unresolvedExplicitReferences: [
        ...structuralResolution.unresolvedReferences,
        ...quotedBlockResolution.unresolvedReferences,
      ],
    };
  }, [editor]);

  const handleApplyAssistantEdit = React.useCallback(({ replacementText, target, agentType = 'assistant-sidebar-edit' } = {}) => {
    if (!editor) {
      return { ok: false, message: 'העורך לא זמין כרגע לעריכה.' };
    }

    const activeTarget = target || getCurrentEditTarget().active;
    if (!activeTarget?.text || !String(activeTarget.text).trim()) {
      return { ok: false, message: 'לא זוהה יעד עריכה פעיל. בחר טקסט או מקם את הסמן בפסקה הרלוונטית ונסה שוב.' };
    }

    if (activeTarget.matchKind === UNRESOLVED_EXPLICIT_QUOTED_BLOCK_MATCH_KIND) {
      return {
        ok: false,
        message: 'זוהתה הפניה מצוטטת שלא נפתרה באופן יחיד, ולכן לא החלתי עריכה על פסקה פעילה. ציין ציטוט ייחודי יותר או בחר את הפסקה ידנית ונסה שוב.',
      };
    }

    if (!isEditTargetStillSafe(editor.state, activeTarget)) {
      return { ok: false, message: 'לא החלתִי את העריכה כי היעד השתנה מאז הבקשה. בחר שוב את הטקסט או הפסקה והרץ את העריכה מחדש.' };
    }

    let result = null;
    try {
      result = applyAiSuggestionToRange(editor, {
        from: activeTarget.from,
        to: activeTarget.to,
        replacementText,
        agentType,
      });
    } catch (error) {
      return { ok: false, message: error?.message || 'העריכה לא הוחלה במסמך.' };
    }

    if (!result) {
      return { ok: false, message: 'המודל לא החזיר טקסט חלופי שניתן להחיל במסמך.' };
    }

    return { ok: true, message: 'העריכה הוחלה במסמך כהצעת AI. אפשר לאשר או לדחות מתוך המסמך.' };
  }, [editor]);

  const consolidateAssistantEditBatchEntries = React.useCallback((entries = []) => {
    const merged = new Map();
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const regionKey = buildCanonicalEditRegionKey(entry?.target)
        || String(entry?.targetId || '').trim()
        || `${Number(entry?.target?.from)}:${Number(entry?.target?.to)}`;
      if (!regionKey) return;

      const existing = merged.get(regionKey);
      if (!existing) {
        merged.set(regionKey, entry);
        return;
      }

      const existingText = String(existing.replacementText || '').trim();
      const nextText = String(entry.replacementText || '').trim();
      merged.set(regionKey, nextText.length >= existingText.length ? entry : existing);
    });
    return [...merged.values()];
  }, []);

  const handleApplyAssistantEditBatch = React.useCallback(({ edits = [], agentType = 'assistant-sidebar-edit' } = {}) => {
    if (!editor) {
      return { ok: false, message: 'העורך לא זמין כרגע לעריכה.' };
    }

    const normalizedEdits = consolidateAssistantEditBatchEntries((Array.isArray(edits) ? edits : [])
      .map((entry) => ({
        target: entry?.target || null,
        replacementText: String(entry?.replacementText || ''),
        targetId: String(entry?.targetId || entry?.target?.targetId || '').trim(),
      }))
      .filter((entry) => entry.target?.text && entry.replacementText.trim() && entry.targetId));

    if (!normalizedEdits.length) {
      return { ok: false, message: 'לא התקבלו עריכות מרובות תקינות להחלה.' };
    }

    const targetIds = new Set();
    const regionKeys = new Set();
    const numericRanges = [];
    for (const entry of normalizedEdits) {
      if (entry.target?.matchKind === UNRESOLVED_EXPLICIT_QUOTED_BLOCK_MATCH_KIND) {
        return {
          ok: false,
          message: 'זוהתה הפניה מצוטטת שלא נפתרה באופן יחיד, ולכן עצרתי לפני החלת העריכות. ציין ציטוט ייחודי יותר או בחר את האזור ידנית.',
        };
      }

      const regionKey = buildCanonicalEditRegionKey(entry.target);
      if (regionKey) {
        if (regionKeys.has(regionKey)) {
          return { ok: false, message: 'זוהו יעדי עריכה כפולים לאותו אזור במסמך, ולכן עצרתי לפני שינוי במסמך.' };
        }
        regionKeys.add(regionKey);
      }

      const numericRange = resolveNumericEditRange(entry.target);
      if (!numericRange) {
        return { ok: false, message: 'זוהה יעד עריכה עם טווח מספרי לא תקין, ולכן עצרתי לפני שינוי במסמך.' };
      }
      const hasOverlappingRange = numericRanges.some((range) => numericRange.from < range.to && range.from < numericRange.to);
      if (hasOverlappingRange) {
        return { ok: false, message: 'זוהו יעדי עריכה חופפים או כפולים לפי הטווח המספרי במסמך, ולכן עצרתי לפני שינוי במסמך.' };
      }
      numericRanges.push(numericRange);

      if (targetIds.has(entry.targetId)) {
        return { ok: false, message: 'זוהו יעדי עריכה כפולים בבקשת ההחלה, לכן עצרתי לפני שינוי במסמך.' };
      }
      targetIds.add(entry.targetId);
      if (!isEditTargetStillSafe(editor.state, entry.target)) {
        return { ok: false, message: 'לא החלתִי את העריכות כי לפחות אחד היעדים השתנה מאז הבקשה. בחר מחדש את האזורים ונסה שוב.' };
      }
    }

    const sortedEdits = [...normalizedEdits].sort((left, right) => {
      if (right.target.from !== left.target.from) return right.target.from - left.target.from;
      return right.target.to - left.target.to;
    });

    let applied = [];
    try {
      applied = applyAiSuggestionBatchToRanges(editor, sortedEdits, { agentType });
      if (!applied) {
        throw new Error('אחת העריכות לא החזירה טקסט חלופי שניתן להחיל במסמך.');
      }
    } catch (error) {
      return { ok: false, message: error?.message || 'העריכות לא הוחלו במסמך.' };
    }

    return {
      ok: true,
      message: applied.length === 1
        ? 'העריכה הוחלה במסמך כהצעת AI. אפשר לאשר או לדחות מתוך המסמך.'
        : `הוחלו ${applied.length} עריכות במסמך כהצעות AI נפרדות. אפשר לאשר או לדחות כל אזור מתוך המסמך.`,
      appliedCount: applied.length,
      applied,
    };
  }, [consolidateAssistantEditBatchEntries, editor]);

  const insertAssistantTextAtActivePosition = React.useCallback((text = '', agentType = 'assistant-sidebar-insert') => {
    if (!editor) {
      return { ok: false, message: 'העורך לא זמין כרגע להכנסת הטקסט.' };
    }

    const normalizedText = String(text || '').trim();
    if (!normalizedText) {
      return { ok: false, message: 'לא התקבל טקסט שאפשר להכניס למסמך.' };
    }

    const { selection, doc } = editor.state;
    if (selection && !selection.empty) {
      const result = applyAiSuggestionToRange(editor, {
        from: selection.from,
        to: selection.to,
        replacementText: normalizedText,
        agentType,
      });
      if (result) {
        triggerDocumentArrival('warning');
        return { ok: true, fallbackInserted: true, message: 'לא נמצא מיפוי ייחודי, אז החלפתי את הטקסט המסומן כהצעת AI.' };
      }
    }

    const activeTarget = getCurrentEditTarget().active;
    const insertPos = Number.isInteger(activeTarget?.to)
      ? activeTarget.to
      : Number.isInteger(selection?.to)
        ? selection.to
        : doc.content.size;
    const insertionHtml = normalizedText
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => `<p>${escHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
      .join('');

    if (!insertionHtml) {
      return { ok: false, message: 'לא התקבל טקסט שאפשר להכניס למסמך.' };
    }

    editor.chain().focus().insertContentAt(Math.max(1, Math.min(insertPos, doc.content.size)), insertionHtml).run();
    triggerDocumentArrival('warning');
    return {
      ok: true,
      fallbackInserted: true,
      message: activeTarget?.text?.trim()
        ? 'לא נמצא מיפוי ייחודי, אז הכנסתי את התשובה ליד הפסקה הפעילה.'
        : 'לא נמצא מיפוי ייחודי, אז הכנסתי את התשובה במיקום הסמן או בסוף המסמך.',
    };
  }, [editor, getCurrentEditTarget, triggerDocumentArrival]);

  // Helper משותף לכל הזרימות: מריץ את סוכן נספח ה-AI על טקסט נתון ומחזיר {ok, appendixHtml, guidanceText}.
  const generateAiAppendixHtml = React.useCallback(async ({ contextText = '', providerId = '', providerModel = '' } = {}) => {
    const appendixConfig = AGENTS_CONFIG.aiAppendix || {};
    const appendixPrompt = 'צור נספח תיעוד שימוש ב-AI לעבודה: רשימת פרומפטים לפי שלבי העבודה, פסקת רפלקציה, והדרכה איך להריץ ולצלם. אין היסטוריית פרומפטים שמורה — שחזר פרומפטים סבירים מתוכן העבודה.';
    const voiceBlock = buildPersonalStyleVoiceBlock();
    const appendixContext = [
      voiceBlock ? `קול אישי של המשתמש (נסח את הפרומפטים והרפלקציה בקול הזה, מותאם למשלב צ'אט):\n${voiceBlock}` : '',
      `מסמך פעיל:\n${String(contextText || '').slice(0, 16000)}`,
    ].filter(Boolean).join('\n\n');
    const raw = await chatWithActiveProvider(appendixPrompt, appendixContext, String(appendixConfig.systemCtx || ''), {
      agentId: 'aiAppendix',
      agentLabel: appendixConfig.label || 'נספח AI',
      directChat: true,
      includeAppMemory: false,
      providerOverride: providerId && providerId !== 'default' ? providerId : '',
      modelOverride: providerModel || '',
      skipAutomation: true,
      skipAutomationPrompt: true,
      skipMultiModel: true,
    });
    return parseAiAppendixResponse(String(raw || ''));
  }, []);

  const handleAppendAiAppendix = React.useCallback((html = '') => {
    if (!editor) {
      showToast('העורך לא זמין כרגע להוספת הנספח.', { tone: 'warning' });
      return;
    }
    const appendixHtml = String(html || '').trim();
    if (!appendixHtml) {
      showToast('לא התקבל תוכן נספח להוספה.', { tone: 'warning' });
      return;
    }
    // תמיד בסוף המסמך האמיתי — מתעלמים מסמן/יעד עריכה.
    editor.chain().focus().insertContentAt(editor.state.doc.content.size, appendixHtml).run();
    triggerDocumentArrival('warning');
    showToast('נספח ה-AI נוסף לסוף המסמך. זכור למחוק את קופסת ההוראות הצהובה לפני הגשה.');
  }, [editor, triggerDocumentArrival]);

  const applyFeedbackReviewSuggestions = React.useCallback(async () => {
    if (!editor) {
      showToast('העורך לא זמין כרגע לעריכה.', { tone: 'warning' });
      return;
    }
    if (feedbackSurvey.submitting || feedbackSurvey.applyingRecommendations) return;

    const reviewSuggestions = Array.isArray(feedbackSurvey.reviewResult?.suggestions)
      ? feedbackSurvey.reviewResult.suggestions
      : [];
    if (!reviewSuggestions.length) {
      showToast('אין כרגע המלצות ישימות להחלה על המסמך.', { tone: 'warning' });
      return;
    }

    const selectionResult = resolveReviewSuggestionSelection(feedbackSurvey.reviewApplySelection, reviewSuggestions);
    const effectiveSelectionResult = (selectionResult.invalid || !selectionResult.suggestions.length)
      ? {
        suggestions: reviewSuggestions,
        selectedIndexes: reviewSuggestions.map((_, index) => index + 1),
        excludedIndexes: [],
        hasExplicitSelection: false,
        invalid: false,
        usedSelectionFallback: true,
      }
      : selectionResult;

    setFeedbackSurvey((prev) => ({
      ...prev,
      applyingRecommendations: true,
      reviewErrorMessage: '',
    }));

    try {
      const generationRequest = beginGenerationRequest('doc-review-apply');
      const sourceHtmlSnapshot = editor.getHTML?.() || '';
      const sourceFilePathSnapshot = currentFilePathRef.current;
      let planResult = await buildDocumentReviewActionPlan({
        existingHtml: sourceHtmlSnapshot,
        originalPrompt: feedbackSurvey.prompt,
        templateId: feedbackSurvey.templateId || activeTemplateId || 'blank',
        selectedMaterials: Array.isArray(feedbackSurvey.selectedMaterials) ? feedbackSurvey.selectedMaterials.filter(Boolean) : [],
        selectedModel: String(feedbackSurvey.selectedModel || '').trim(),
        selectedProviderId: String(feedbackSurvey.selectedProviderId || '').trim(),
        selectedProviderModel: String(feedbackSurvey.selectedProviderModel || '').trim(),
        focus: [
          feedbackSurvey.reviewFocus,
          effectiveSelectionResult.usedSelectionFallback
            ? `המשתמש כתב בחירת המלצות שלא פורקה באופן יציב: "${String(feedbackSurvey.reviewApplySelection || '').trim()}". אל תעצור ואל תבקש ניסוח מחדש; נסה למפות בזהירות את ההמלצות הזמינות מתוך הרשימה, והחזר needs_review לכל המלצה שלא ניתן למקם בבטחה.`
            : '',
          effectiveSelectionResult.hasExplicitSelection
            ? `החל רק את המלצות מספר ${effectiveSelectionResult.selectedIndexes.join(', ')}.${effectiveSelectionResult.excludedIndexes.length ? ` דלג על ${effectiveSelectionResult.excludedIndexes.join(', ')}.` : ''}`
            : '',
        ].filter(Boolean).join('\n'),
        suggestions: effectiveSelectionResult.suggestions,
        returnMeta: true,
      });
      let planEdits = Array.isArray(planResult?.edits) ? planResult.edits : [];
      let missingPlanSuggestions = collectMissingReviewActionSuggestions(effectiveSelectionResult.suggestions, planEdits);
      for (let attemptIndex = 0; missingPlanSuggestions.length && attemptIndex < 2; attemptIndex += 1) {
        const completionResult = await buildDocumentReviewActionPlan({
          existingHtml: sourceHtmlSnapshot,
          originalPrompt: feedbackSurvey.prompt,
          templateId: feedbackSurvey.templateId || activeTemplateId || 'blank',
          selectedMaterials: Array.isArray(feedbackSurvey.selectedMaterials) ? feedbackSurvey.selectedMaterials.filter(Boolean) : [],
          selectedModel: String(feedbackSurvey.selectedModel || '').trim(),
          selectedProviderId: String(feedbackSurvey.selectedProviderId || '').trim(),
          selectedProviderModel: String(feedbackSurvey.selectedProviderModel || '').trim(),
          focus: [
            feedbackSurvey.reviewFocus,
            `קריאת השלמה ${attemptIndex + 1}: בקריאה הקודמת לא הוחזרה תכנית עבור ${missingPlanSuggestions.length} המלצות. חובה למפות רק את ההמלצות החסרות הבאות, לפי suggestionId, או להחזיר needs_review לכל המלצה שלא ניתן למקם בבטחה.`,
          ].filter(Boolean).join('\n'),
          suggestions: missingPlanSuggestions,
          returnMeta: true,
        });
        const completionEdits = Array.isArray(completionResult?.edits) ? completionResult.edits : [];
        if (!completionEdits.length) break;
        planEdits = mergeReviewActionPlanEdits(planEdits, completionEdits);
        planResult = {
          ...planResult,
          partial: Boolean(planResult?.partial || completionResult?.partial),
          errorMessage: [planResult?.errorMessage, completionResult?.errorMessage].map((value) => String(value || '').trim()).filter(Boolean).join(' | '),
          edits: planEdits,
        };
        const nextMissingPlanSuggestions = collectMissingReviewActionSuggestions(effectiveSelectionResult.suggestions, planEdits);
        if (nextMissingPlanSuggestions.length >= missingPlanSuggestions.length) break;
        missingPlanSuggestions = nextMissingPlanSuggestions;
      }

      const currentHtmlSnapshot = editor.getHTML?.() || '';
      const currentFilePathSnapshot = currentFilePathRef.current;
      if (!isGenerationRequestCurrent(generationRequest) || sourceHtmlSnapshot !== currentHtmlSnapshot || sourceFilePathSnapshot !== currentFilePathSnapshot) {
        throw new Error('המסמך השתנה בזמן הכנת התיקונים. רענן את ההמלצות ונסה שוב.');
      }

      const coverageUnresolved = missingPlanSuggestions.map((suggestion, index) => ({
        suggestionId: getReviewActionSuggestionId(suggestion, index),
        title: getReviewActionSuggestionTitle(suggestion, index),
        missingFromPlan: true,
      }));
      const { resolved, unresolved } = resolveReviewActionPlanEdits(editor.state.doc, planEdits);
      const combinedUnresolved = [...unresolved, ...coverageUnresolved];
      if (!resolved.length) {
        throw new Error(planResult?.errorMessage || 'לא הצלחתי לזהות יעדי עריכה ייחודיים מתוך ההערות או ההמלצות.');
      }

      const applyResult = handleApplyAssistantEditBatch({
        edits: resolved,
        agentType: 'lecturer-review-apply',
      });
      if (!applyResult?.ok) {
        throw new Error(applyResult?.message || 'לא הצלחתי להחיל את התיקונים על המסמך.');
      }

      triggerDocumentArrival(combinedUnresolved.length ? 'warning' : 'success');
      setLiveGeneration((prev) => (prev.active ? { ...prev, active: false } : prev));
      setFeedbackSurvey((prev) => {
        if (combinedUnresolved.length) {
          const unresolvedSuggestionIdSet = new Set(combinedUnresolved.map((item) => String(item?.suggestionId || '').trim()).filter(Boolean));
          const unresolvedTitleSet = new Set(combinedUnresolved.map((item) => normalizeStructuralEditText(item?.title || '')).filter(Boolean));
          const remainingSuggestions = (Array.isArray(prev.reviewResult?.suggestions) ? prev.reviewResult.suggestions : []).filter((suggestion, index) => {
            const suggestionId = String(suggestion?.suggestionId || suggestion?.id || '').trim();
            if (suggestionId && unresolvedSuggestionIdSet.size) {
              return unresolvedSuggestionIdSet.has(suggestionId);
            }
            const suggestionTitle = normalizeStructuralEditText(
              suggestion?.title || suggestion?.heading || suggestion?.name || `המלצה ${index + 1}`,
            );
            return suggestionTitle && unresolvedTitleSet.has(suggestionTitle);
          });
          return {
            ...prev,
            applyingRecommendations: false,
            reviewResult: prev.reviewResult
              ? {
                ...prev.reviewResult,
                summary: remainingSuggestions.length
                  ? `הוחלו חלק מההמלצות. נשארו ${remainingSuggestions.length} המלצות שדורשות רענון או מיפוי ידני.`
                  : 'הוחלו חלק מההמלצות. כדי להמשיך עם השאר צריך לרענן את ההמלצות.',
                suggestions: remainingSuggestions,
              }
              : prev.reviewResult,
            reviewErrorMessage: `לא הצלחתי למקם אוטומטית את ההמלצות הבאות: ${combinedUnresolved.map((item) => item?.title || '').filter(Boolean).join(' | ')}`,
          };
        }

        return {
          ...buildFeedbackSurveyStateWithGenerationContext(prev),
          open: false,
          phase: 'details',
          roundIndex: normalizeFeedbackRoundIndex(prev.roundIndex + 1),
        };
      });

      const unresolvedMessage = combinedUnresolved.length
        ? ` הוחלו ${resolved.length} תיקונים, אבל ${combinedUnresolved.length} המלצות נשארו ללא מיקום ייחודי במסמך.`
        : '';
      showToast(`${applyResult.message}${unresolvedMessage}`, { tone: 'info', duration: 6000 });
    } catch (error) {
      setFeedbackSurvey((prev) => ({
        ...prev,
        applyingRecommendations: false,
        reviewErrorMessage: error?.message || 'לא הצלחתי להחיל את המלצות המרצה על המסמך.',
      }));
    }
  }, [activeTemplateId, beginGenerationRequest, editor, feedbackSurvey, handleApplyAssistantEditBatch, isGenerationRequestCurrent]);

  const handleApplyDocumentActionPlan = React.useCallback(async ({
    promptText = '',
    conversationHistoryText = '',
    selectedProviderId = '',
    selectedProviderModel = '',
    agentType = 'assistant-sidebar-plan',
    fallbackInsertText = '',
  } = {}) => {
    if (!editor) {
      return { ok: false, message: 'העורך לא זמין כרגע לעריכה.' };
    }

    const normalizedPrompt = String(promptText || '').trim();
    const normalizedConversation = String(conversationHistoryText || '').trim();
    if (!normalizedPrompt && !normalizedConversation) {
      return { ok: false, message: 'לא קיבלתי מספיק הקשר כדי למפות את התיקונים למסמך.' };
    }

    const hasSidebarReviewSelectionIntent = SIDEBAR_REVIEW_SELECTION_INTENT_PATTERN.test(normalizedPrompt);
    const pastedReviewSuggestions = extractSidebarReviewSuggestionsFromText(normalizedPrompt);
    const sidebarReviewSuggestions = extractSidebarReviewSuggestionsFromConversation(normalizedConversation);
    const sidebarReviewContext = pastedReviewSuggestions.length
      ? normalizedPrompt
      : extractSidebarReviewContextFromConversation(normalizedConversation);
    const availableReviewSuggestions = pastedReviewSuggestions.length ? pastedReviewSuggestions : sidebarReviewSuggestions;
    const shouldFallbackToGeneralReviewMapping = hasSidebarReviewSelectionIntent && !availableReviewSuggestions.length;
    const sidebarReviewSelectionText = getSidebarReviewSelectionText(normalizedPrompt);
    const sidebarReviewSelection = availableReviewSuggestions.length && hasSidebarReviewSelectionIntent
      ? resolveReviewSuggestionSelection(sidebarReviewSelectionText, availableReviewSuggestions)
      : null;
    const shouldFallbackInvalidSidebarSelection = Boolean(sidebarReviewSelection?.invalid || (sidebarReviewSelection?.hasExplicitSelection && !sidebarReviewSelection.suggestions.length));
    const shouldApplyAllAvailableReviewSuggestions = availableReviewSuggestions.length > 0
      && !sidebarReviewSelection?.hasExplicitSelection
      && !shouldFallbackInvalidSidebarSelection
      && SIDEBAR_REVIEW_APPLY_ALL_INTENT_PATTERN.test(normalizedPrompt);
    const selectedSidebarSuggestions = sidebarReviewSelection?.hasExplicitSelection && !shouldFallbackInvalidSidebarSelection
      ? sidebarReviewSelection.suggestions
      : shouldApplyAllAvailableReviewSuggestions
        ? availableReviewSuggestions
        : [];
    const selectedSidebarIndexes = sidebarReviewSelection?.hasExplicitSelection && !shouldFallbackInvalidSidebarSelection
      ? sidebarReviewSelection.selectedIndexes
      : shouldApplyAllAvailableReviewSuggestions
        ? selectedSidebarSuggestions.map((_, index) => index + 1)
        : [];
    const scopedSidebarFeedback = selectedSidebarSuggestions.length
      ? (sidebarReviewContext
          ? `ההערות וההמלצות המלאות למיפוי:
${sidebarReviewContext}`
          : '')
      : (shouldFallbackInvalidSidebarSelection ? [
          `המשתמש ביקש להחיל המלצות לפי מספרים, אך בחירת המספרים לא פורקה באופן יציב: "${sidebarReviewSelectionText}". אל תעצור ואל תבקש ניסוח מחדש; נסה להבין מתוך ההקשר אילו המלצות התבקשו, ומפה רק תיקונים שניתן לזהות בבטחה.`,
          sidebarReviewContext || normalizedConversation,
        ].filter(Boolean).join('\n\n') : (availableReviewSuggestions.length > 0 ? '' : [
          shouldFallbackToGeneralReviewMapping
            ? 'המשתמש ביקש להחיל המלצות לפי מספרים, אך ההמלצות לא חולצו כרשימה ממוספרת יציבה. אל תעצור ואל תבקש ניסוח מחדש; מפה בזהירות רק תיקונים שניתן לזהות מתוך ההקשר המצורף.'
            : '',
          normalizedConversation,
        ].filter(Boolean).join('\n\n')));

    try {
      const generationRequest = beginGenerationRequest('sidebar-edit-plan');
      const sourceHtmlSnapshot = editor.getHTML?.() || '';
      const sourceFilePathSnapshot = currentFilePathRef.current;
      let planResult = await buildDocumentReviewActionPlan({
        existingHtml: sourceHtmlSnapshot,
        originalPrompt: selectedSidebarSuggestions.length ? sidebarReviewSelectionText : normalizedPrompt,
        templateId: activeTemplateId || 'blank',
        selectedProviderId: String(selectedProviderId || '').trim(),
        selectedProviderModel: String(selectedProviderModel || '').trim(),
        focus: [
          selectedSidebarSuggestions.length ? sidebarReviewSelectionText : normalizedPrompt,
          selectedSidebarIndexes.length
            ? (sidebarReviewSelection?.hasExplicitSelection
                ? `המשתמש ביקש להחיל רק את המלצות מספר ${selectedSidebarIndexes.join(', ')} מתוך רשימת ההמלצות האחרונה. אסור להוסיף תיקונים אחרים.`
                : `המשתמש ביקש להחיל את כל ${selectedSidebarIndexes.length} ההמלצות שחולצו מהשיחה/מהטקסט. אסור להוסיף תיקונים אחרים.`)
            : '',
        ].filter(Boolean).join('\n'),
        feedback: selectedSidebarSuggestions.length
          ? ''
          : scopedSidebarFeedback ? `הקשר מהשיחה הקודמת וההמלצות שכבר ניתנו:\n${scopedSidebarFeedback}` : '',
        suggestions: selectedSidebarSuggestions,
        returnMeta: true,
      });
      let planEdits = Array.isArray(planResult?.edits) ? planResult.edits : [];
      let missingPlanSuggestions = collectMissingReviewActionSuggestions(selectedSidebarSuggestions, planEdits);
      const maxCoverageAttempts = selectedSidebarSuggestions.length ? 2 : 0;
      for (let attemptIndex = 0; missingPlanSuggestions.length && attemptIndex < maxCoverageAttempts; attemptIndex += 1) {
        const completionResult = await buildDocumentReviewActionPlan({
          existingHtml: sourceHtmlSnapshot,
          originalPrompt: selectedSidebarSuggestions.length ? sidebarReviewSelectionText : normalizedPrompt,
          templateId: activeTemplateId || 'blank',
          selectedProviderId: String(selectedProviderId || '').trim(),
          selectedProviderModel: String(selectedProviderModel || '').trim(),
          focus: [
            selectedSidebarSuggestions.length ? sidebarReviewSelectionText : normalizedPrompt,
            `קריאת השלמה ${attemptIndex + 1}: בקריאה הקודמת לא הוחזרה תכנית עבור ${missingPlanSuggestions.length} המלצות. חובה למפות רק את ההמלצות החסרות הבאות, לפי suggestionId, או להחזיר needs_review לכל המלצה שלא ניתן למקם בבטחה.`,
          ].filter(Boolean).join('\n'),
          feedback: scopedSidebarFeedback ? `ההערות וההמלצות המלאות למיפוי:\n${scopedSidebarFeedback}` : '',
          suggestions: missingPlanSuggestions,
          returnMeta: true,
        });
        const completionEdits = Array.isArray(completionResult?.edits) ? completionResult.edits : [];
        if (!completionEdits.length) break;
        planEdits = mergeReviewActionPlanEdits(planEdits, completionEdits);
        planResult = {
          ...planResult,
          partial: Boolean(planResult?.partial || completionResult?.partial),
          errorMessage: [planResult?.errorMessage, completionResult?.errorMessage].map((value) => String(value || '').trim()).filter(Boolean).join(' | '),
          edits: planEdits,
        };
        const nextMissingPlanSuggestions = collectMissingReviewActionSuggestions(selectedSidebarSuggestions, planEdits);
        if (nextMissingPlanSuggestions.length >= missingPlanSuggestions.length) break;
        missingPlanSuggestions = nextMissingPlanSuggestions;
      }

      const currentHtmlSnapshot = editor.getHTML?.() || '';
      const currentFilePathSnapshot = currentFilePathRef.current;
      if (!isGenerationRequestCurrent(generationRequest) || sourceHtmlSnapshot !== currentHtmlSnapshot || sourceFilePathSnapshot !== currentFilePathSnapshot) {
        throw new Error('המסמך השתנה בזמן שמיפיתי את התיקונים. נסה שוב על הגרסה הנוכחית.');
      }

      const coverageUnresolved = missingPlanSuggestions.map((suggestion, index) => ({
        suggestionId: getReviewActionSuggestionId(suggestion, index),
        title: getReviewActionSuggestionTitle(suggestion, index),
        missingFromPlan: true,
      }));
      const { resolved, unresolved } = resolveReviewActionPlanEdits(editor.state.doc, planEdits);
      const combinedUnresolved = [...unresolved, ...coverageUnresolved];
      if (!resolved.length) {
        const fallbackResult = insertAssistantTextAtActivePosition(fallbackInsertText, agentType);
        if (fallbackResult?.ok) {
          return {
            ...fallbackResult,
            ok: true,
            partial: true,
            unresolved: combinedUnresolved,
          };
        }
        throw new Error(planResult?.errorMessage || 'לא הצלחתי לזהות מיקומים ייחודיים לתיקונים שביקשת להחיל.');
      }

      const applyResult = handleApplyAssistantEditBatch({
        edits: resolved,
        agentType,
      });
      if (!applyResult?.ok) {
        throw new Error(applyResult?.message || 'לא הצלחתי להחיל את התיקונים על המסמך.');
      }

      triggerDocumentArrival(combinedUnresolved.length ? 'warning' : 'success');
      const unresolvedTitles = combinedUnresolved.map((item) => item?.title || '').filter(Boolean);
      return {
        ...applyResult,
        ok: unresolvedTitles.length === 0,
        partial: unresolvedTitles.length > 0,
        unresolved: combinedUnresolved,
        message: unresolvedTitles.length
          ? `${applyResult.message} נשארו ${unresolvedTitles.length} תיקונים שלא מופו אוטומטית: ${unresolvedTitles.join(' | ')}`
          : applyResult.message,
      };
    } catch (error) {
      return {
        ok: false,
        message: error?.message || 'לא הצלחתי למפות את התיקונים למיקומים הנכונים במסמך.',
      };
    }
  }, [activeTemplateId, beginGenerationRequest, editor, feedbackSurvey.prompt, handleApplyAssistantEditBatch, insertAssistantTextAtActivePosition, isGenerationRequestCurrent, liveGeneration.prompt, triggerDocumentArrival]);

  React.useEffect(() => {
    if (editor) applyDocumentStyleToEditor(documentStyle, editor);
  }, [editor, documentStyle, applyDocumentStyleToEditor]);

  React.useEffect(() => {
    if (!editor || initializedDocRef.current || !settingsHydrated || pendingStartupDocument) return;

    const shouldShowHome = isLegacyHomeEnabled() ? true : wordPreferences.showStartExperience !== false;
    const savedDraft = wordPreferences.keepLastAutosavedVersion === false
      ? null
      : getPersistedDraftHtml();
    const profile = getPersonalStyleProfile();

    if (shouldShowHome) {
      setShowStartScreen(true);
    } else if (savedDraft && editor.isEmpty) {
      editor.commands.setContent(savedDraft);
      focusEditorSoon('end');
    } else {
      setShowStartScreen(false);
      focusEditorSoon('start');
    }

    if (shouldAutoOpenOnboarding(profile)) {
      // הפעלה ראשונה: אם הענן זמין וטרם הוצג מסך הפתיחה — להציג אותו במקום לפתוח
      // onboarding ישירות. WelcomeGate מנהל את הסדר (התחברות Google → הצפנה → onboarding).
      const welcomeSeen = (typeof localStorage !== 'undefined') && localStorage.getItem('wordai_welcome_seen') === '1';
      if (cloudAvailable && !welcomeSeen) {
        setShowWelcome(true);
      } else {
        setFileMenuTargetTab('onboarding');
        setFileMenuOpen(true);
      }
    }

    initializedDocRef.current = true;
  }, [editor, settingsHydrated, wordPreferences, focusEditorSoon, pendingStartupDocument]);

  React.useEffect(() => {
    if (!editor) return;
    const page = document.querySelector('.ProseMirror');
    if (!page) return;
    page.setAttribute('spellcheck', wordPreferences.checkSpellingAsYouType === false ? 'false' : 'true');
    page.setAttribute('autocorrect', 'on');
    page.setAttribute('autocomplete', 'on');
  }, [editor, wordPreferences]);

  React.useEffect(() => {
    if (wordPreferences.keepLastAutosavedVersion === false) {
      clearPersistedAutosaveCache();
    }
  }, [wordPreferences.keepLastAutosavedVersion]);

  React.useEffect(() => {
    if (!editor || !lastManualStyleLearningAt) return;

    const timer = window.setTimeout(() => {
      // E4: כשמנוע הסגנון האישי פעיל, ה-delta tracker (diffAfterEdit, ~:6913) הוא
      // שאחראי על הלמידה — מדלגים על הלומד הישן כדי למנוע כפילות/סתירה בין שני נתיבי למידה.
      const engineOn = (() => {
        try { return getPersonalStyleProfile()?.styleEngine?.enabled === true; } catch { return false; }
      })();
      if (engineOn) return;
      try {
        const html = String(editor.getHTML?.() || '');
        learnFromDocumentDraft({
          html,
          title: currentFilePath || 'המסמך הפעיל',
        });
      } catch {}
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [editor, lastManualStyleLearningAt, currentFilePath]);

  React.useEffect(() => {
    if (!editor || wordPreferences.autoSave === false) return;

    const saveSnapshot = () => {
      if (wordPreferences.keepLastAutosavedVersion === false) return;
      if (!hasMeaningfulEditorContent(editor)) return;
      const html = editor.getHTML();
      persistAutosaveSnapshot(html);
    };

    const interval = window.setInterval(
      saveSnapshot,
      Math.max(1, Number(wordPreferences.autoSaveMinutes || 10)) * 60 * 1000,
    );

    window.addEventListener('beforeunload', saveSnapshot);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('beforeunload', saveSnapshot);
    };
  }, [editor, wordPreferences]);

  // הפתיחה האוטומטית של הסיידבר אחרי הפסקת הקלדה (trigger 'idle') הוסרה לפי
  // בקשת המשתמש. הסיידבר נפתח רק ידנית או ע"י זרימות autopilot/manual.
  React.useEffect(() => {
    if (!editor || sidebarOpen) return;
    if (assistantBehavior.autoPopup !== 'legacy-idle') return; // כבוי; ערך נסתר להחזרה עתידית
    if (Date.now() < assistantAutoPopupBlockedUntil) return;
    if (!lastEditorContentActivityAt) return;
    if (Date.now() - lastEditorContentActivityAt > 1000) return;
    const hasText = editor.getText().trim().length > 0;
    if (!hasText) return;

    const scheduledFromContentActivityAt = lastEditorContentActivityAt;
    const timer = window.setTimeout(() => {
      if (scheduledFromContentActivityAt !== lastEditorContentActivityAt) return;
      if (Date.now() < assistantAutoPopupBlockedUntil) return;
      if (!editor.state.selection.empty) return;
      const activeInEditor = document.activeElement?.closest?.('.ProseMirror');
      if (activeInEditor && !sidebarOpen) {
        setAssistantTrigger('idle');
        setSidebarCompact(false);
        setSidebarOpen(true);
      }
    }, Math.max(3, Number(assistantBehavior.idleSeconds || 5)) * 1000);

    return () => window.clearTimeout(timer);
  }, [assistantAutoPopupBlockedUntil, editor, lastEditorContentActivityAt, sidebarOpen, assistantBehavior]);

  React.useEffect(() => {
    if (!sidebarOpen) return;
    if (Date.now() >= assistantAutoPopupBlockedUntil) return;
    if (assistantTrigger === 'autopilot') return;
    setSidebarOpen(false);
  }, [assistantAutoPopupBlockedUntil, assistantTrigger, sidebarOpen]);

  const closeAssistantPopup = React.useCallback(() => {
    setSidebarOpen(false);
    setAssistantTrigger('manual');
    setLastEditorActivityAt(Date.now());
  }, []);

  const hasMeaningfulContent = React.useCallback(() => {
    return hasMeaningfulEditorContent(editor);
  }, [editor, hasMeaningfulEditorContent]);

  // הערה: נשאר window.confirm סינכרוני בכוונה — זהו gate לזרימת בקרה ב-6 callers
  // (כולל deps של useCallback ו-handlers של StartScreen). המרה ל-showConfirm async
  // דורשת ריפקטור רחב של כל ה-callers; מתוכנן כ-follow-up. ראה open-items #57.
  const confirmReplaceCurrentDocument = React.useCallback(() => {
    if (!hasMeaningfulContent()) return true;
    return window.confirm('יש במסמך תוכן קיים. להחליף אותו?');
  }, [hasMeaningfulContent]);

  const downloadFile = async (content, filename, type) => {
    const blob = new Blob([content], { type });
    return saveBlobInBrowser(blob, filename);
  };

  const persistLocalCache = React.useCallback((html) => {
    persistLocalDraftCache(html);
  }, []);

  const executeStartScreenGeneration = React.useCallback(async (action, options = {}) => {
    const payload = action?.payload || {};
    if (!editor) {
      showToast('העורך עדיין נטען. נסה שוב בעוד רגע.', { tone: 'warning' });
      return false;
    }
    if (!options.skipConfirmReplace && !confirmReplaceCurrentDocument()) return false;

    const resolvedAction = {
      ...action,
      kind: 'start-screen-generate',
      workspaceId: action?.workspaceId || getActiveWorkspaceId(),
    };

    const prompt = String(payload.prompt || '').trim();
    const templateId = String(payload.templateId || 'blank').trim() || 'blank';
    const instructions = String(payload.instructions || '').trim();
    const selectedMaterials = Array.isArray(payload.selectedMaterials) ? payload.selectedMaterials.filter(Boolean) : [];
    const selectedProviderId = String(payload.selectedProviderId || payload.selectedModel || '').trim();
    const selectedProviderModel = String(payload.selectedProviderModel || '').trim();
    const selectedModel = selectedProviderId;
    const requestedStyle = String(payload.documentStyle || '').trim();
    const instructionFileName = String(payload.instructionFileName || '').trim();
    const baseDraft = payload.baseDraft && typeof payload.baseDraft === 'object' ? { ...payload.baseDraft } : null;
    const additionalReviewRounds = Math.max(0, Math.min(2, Number(payload.additionalReviewRounds) || 0));
    const humanizeLoop = payload.humanizeLoop && typeof payload.humanizeLoop === 'object' ? payload.humanizeLoop : null;
    const wantsAiAppendix = payload.aiAppendix === true;
    const suppressDeferredReviewOffer = payload.suppressDeferredReviewOffer === true;
    const forceDirectMode = payload.forceDirectMode === true;
    const skipWorkflowAutomation = payload.skipWorkflowAutomation === true;
    const directModeReason = String(payload.directModeReason || '').trim();
    const useWorkspaceV2 = payload.useWorkspaceV2 === true;
    const workspaceV2TemplateId = String(payload.workspaceV2TemplateId || '').trim();
    const includeSources = typeof payload.includeSources === 'boolean' ? payload.includeSources : null;
    const sourceRoute = String(payload.sourceRoute || '').trim();
    const temperature = Number.isFinite(payload.temperature) ? payload.temperature : null;
    const styleDepth = payload.styleDepth || 'normal';
    const preserveCurrentDocumentOnError = payload.preserveCurrentDocumentOnError === true;
    const workspaceBypassActive = payload.workspaceBypassActive === true;
    // seed מ-Project Hub: שיוך המסמך שייווצר לפרויקט ולשלב במתווה.
    const projectSeed = payload.projectSeed && typeof payload.projectSeed === 'object' ? payload.projectSeed : null;

    if (!options.skipConfirmReplace) {
      beginDocumentIdentity({ filePath: '' });
      if (instructions) {
        storeAssignmentBrief({
          text: instructions,
          fileName: instructionFileName,
          sourceLabel: instructionFileName ? 'קובץ הנחיות' : 'הנחיות מטלה',
        });
      } else {
        clearAssignmentBrief();
      }
    } else {
      resetDocumentInteractionState();
    }
  persistActiveTemplateId(templateId);
    syncPersistedAppSettings();
    setActiveTemplateId(templateId);
    setFeedbackSurvey({ ...DEFAULT_FEEDBACK_SURVEY });
    changeDocumentStyle(requestedStyle || documentStyle);
    setAssistantTrigger('autopilot');
    setSidebarCompact(false);
    setSidebarOpen(true);

    const generationRequest = beginGenerationRequest('doc');
    const originWorkspaceId = generationRequest.workspaceId;
    const generationLogsWorkspaceId = useWorkspaceV2 && workspaceV2TemplateId ? workspaceV2TemplateId : originWorkspaceId;
    const hasBaseDraft = Boolean(String(baseDraft?.html || '').trim());
    // טיוטת בסיס היא תמיד מקור אמת לעדכון — גם כשהבקשה הגיעה ממצב שף (chef-final-compose).
    // ה-brief של השף משמש כ-feedback לליטוש/הרחבה, והטיוטה נשמרת במקום להיכתב מאפס.
    const shouldReviseBaseDraft = hasBaseDraft;
    const baseDraftTitle = String(baseDraft?.title || baseDraft?.name || '').trim();
    const generationRoute = shouldReviseBaseDraft ? 'reviseDocumentWithFeedback' : 'generateDocumentFromPrompt';
    const revisionRequest = shouldReviseBaseDraft
      ? buildBaseDraftRevisionRequest({
          promptText: prompt,
          instructionsText: instructions,
          baseDraftTitle,
          templateId,
        })
      : null;
    const inspectorPrompt = shouldReviseBaseDraft
      ? String(revisionRequest?.originalPrompt || baseDraftTitle || 'טיוטת בסיס').trim()
      : prompt;
    const inspectorInstructions = shouldReviseBaseDraft
      ? String(revisionRequest?.feedback || DEFAULT_BASE_DRAFT_REFINEMENT_REQUEST).trim()
      : instructions;
    const isKnownDirectStartScreenRoute = (workspaceBypassActive || String(resolvedAction.workspaceId || '').trim() === '__no-workspace__')
      && Boolean(selectedProviderId);
    const generationLabel = shouldReviseBaseDraft
      ? String(revisionRequest?.title || baseDraftTitle || 'טיוטת בסיס').trim() || 'טיוטת בסיס'
      : buildGenerationLabel({ promptText: prompt, instructionsText: instructions, templateId });
    setLastGenerationAction({
      ...resolvedAction,
      runId: generationRequest.runId,
      inspector: buildStartScreenGenerationInspector({
        runId: generationRequest.runId,
        prompt: inspectorPrompt,
        instructions: inspectorInstructions,
        selectedMaterials,
        templateId,
        baseDraft,
        selectedProviderId,
        selectedProviderModel,
        route: generationRoute,
        routeMode: useWorkspaceV2 ? 'workspace-v2' : ((isKnownDirectStartScreenRoute || forceDirectMode || skipWorkflowAutomation) ? 'direct' : ''),
        routeModeReason: useWorkspaceV2 ? workspaceV2TemplateId : (directModeReason || (forceDirectMode ? 'forceDirectMode' : (skipWorkflowAutomation ? 'skipWorkflowAutomation' : (isKnownDirectStartScreenRoute ? 'providerOverride' : '')))),
      }),
    });
    const initialSummary = getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId);
    const initialLogs = getRecentAgentLogs(18, { workspaceId: generationLogsWorkspaceId, runId: generationRequest.runId });

    setLiveGeneration({
      active: true,
      state: 'running',
      prompt: generationLabel,
      summary: initialSummary,
      logs: initialLogs,
      runId: generationRequest.runId,
      workspaceId: generationLogsWorkspaceId,
    });

    const initialShell = buildLiveGenerationShell({
      titleText: generationLabel,
      state: 'running',
      stages: initialSummary?.stages || [],
      logs: initialLogs,
      runId: generationRequest.runId,
    });
    preLiveGenerationSnapshotRef.current = {
      runId: generationRequest.runId,
      html: normalizeTrackedEditorHtml(String(editor.getHTML?.() || '')),
    };
    const didStartTransition = await runStartTransition(async (activeEditor) => {
      activeEditor.commands.setContent(initialShell);
      lastLiveGenerationShellRef.current = {
        runId: generationRequest.runId,
        html: normalizeTrackedEditorHtml(String(activeEditor.getHTML?.() || initialShell)),
      };
    }, 'start');
    if (!didStartTransition) return false;

    try {
      const result = shouldReviseBaseDraft
        ? await reviseDocumentWithFeedback({
            existingHtml: baseDraft.html,
            originalPrompt: revisionRequest?.originalPrompt || baseDraftTitle || 'טיוטת בסיס',
            templateId,
            feedback: revisionRequest?.feedback || DEFAULT_BASE_DRAFT_REFINEMENT_REQUEST,
            selectedMaterials,
            selectedModel,
            selectedProviderId,
            selectedProviderModel,
            additionalReviewRounds,
            humanizeLoop,
            forceDirectMode,
            includeSources,
            sourceRoute,
            ...(Number.isFinite(temperature) ? { temperature } : {}),
            runId: generationRequest.runId,
            returnMeta: true,
          })
        : await generateDocumentFromPrompt({ prompt, templateId, instructions, selectedMaterials, selectedModel, selectedProviderId, selectedProviderModel, additionalReviewRounds, humanizeLoop, forceDirectMode, skipWorkflowAutomation, directModeReason, useWorkspaceV2, workspaceV2TemplateId, includeSources, sourceRoute, ...(Number.isFinite(temperature) ? { temperature } : {}), styleDepth, runId: generationRequest.runId, returnMeta: true });
      const resolvedTitle = shouldReviseBaseDraft
        ? String(generationLabel || baseDraftTitle || 'טיוטת בסיס').trim()
        : String(result?.title || generationLabel || 'מסמך חדש').trim();
      const generated = result?.html || (shouldReviseBaseDraft
        ? String(baseDraft?.html || '').trim() || `<h1>${escHtml(resolvedTitle)}</h1><p>לא נוצר תוכן.</p>`
        : `<h1>${escHtml(resolvedTitle)}</h1><p>לא נוצר תוכן.</p>`);
      const usedFallback = Boolean(result?.usedFallback);
      if (!isGenerationRequestCurrent(generationRequest)) return true;
      const latestSummary = getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId);
      const latestLogs = getRecentAgentLogs(18, { workspaceId: generationLogsWorkspaceId, runId: generationRequest.runId });
      const resolvedInspectorMeta = resolveStartScreenGenerationInspectorMeta({ summary: latestSummary, logs: latestLogs });
      const resolvedFeedbackProviderId = resolvedInspectorMeta.requestedProviderId || selectedProviderId;
      const resolvedFeedbackProviderModel = resolvedInspectorMeta.requestedProviderModel || selectedProviderModel;

      lastLiveGenerationShellRef.current = { runId: '', html: '' };
      lastLiveGenerationPlaceholderRef.current = { runId: '', html: '' };
      // עמוד שער אישי כברירת מחדל (אם הופעל בהגדרות) — עם כותרת המסמך שנוצרה.
      const generatedWithCover = applyDefaultCoverPage(generated, {
        title: resolvedTitle,
        assignmentType: TEMPLATE_ASSIGNMENT_LABELS[templateId] || '',
      });
      editor.commands.setContent(generatedWithCover);
      // Personal Style Engine (Phase 5): snapshot של הטקסט שנוצר, כדי לזהות בהמשך את
      // העריכות שהמשתמש עושה עליו (delta tracking). plain text מתוך העורך אחרי setContent.
      try {
        snapshotStyleGeneration({
          docId: activeDocumentSessionIdRef.current,
          generatedText: String(editor.getText?.() || ''),
        });
      } catch {}
      triggerDocumentArrival(usedFallback ? 'warning' : 'success');
      const historyAfterSave = saveDocumentHistory({
        title: resolvedTitle,
        content: generatedWithCover,
        templateId,
        source: 'start-screen',
        projectId: String(projectSeed?.projectId || ''),
      });
      // שיוך לשלב במתווה של ה-Project Hub (הרשומה החדשה נכנסת ראשונה להיסטוריה).
      if (projectSeed?.projectId && projectSeed?.milestoneId && Array.isArray(historyAfterSave) && historyAfterSave[0]?.id) {
        try {
          assignDocumentToProject(historyAfterSave[0].id, projectSeed.projectId);
          linkDocToMilestone(projectSeed.projectId, projectSeed.milestoneId, historyAfterSave[0].id);
        } catch {}
      }
      persistLocalCache(generated);
      // נספח AI אופציונלי מהמסך הבית: קריאת API נוספת שמייצרת פרק תיעוד שימוש ומוסיפה לסוף המסמך.
      if (wantsAiAppendix && !usedFallback) {
        try {
          showToast('מייצר נספח AI (תיעוד שימוש) — קריאת API נוספת…');
          const snapshot = buildSidebarDocumentSnapshot(editor);
          const appendixParsed = await generateAiAppendixHtml({
            contextText: String(snapshot?.text || ''),
            providerId: selectedProviderId,
            providerModel: selectedProviderModel,
          });
          if (appendixParsed.ok && appendixParsed.appendixHtml) {
            editor.chain().focus().insertContentAt(editor.state.doc.content.size, appendixParsed.appendixHtml).run();
            persistLocalCache(editor.getHTML());
            showToast('נספח ה-AI נוסף לסוף המסמך. זכור למחוק את בלוק ההוראות "למחוק לפני הגשה" לפני ההגשה.');
          } else {
            showToast('נספח ה-AI לא הוחזר בפורמט צפוי — דלגתי עליו. אפשר לנסות שוב מסרגל ה-AI.', { tone: 'warning' });
          }
        } catch (appendixError) {
          showToast('יצירת נספח ה-AI נכשלה: ' + (appendixError?.message || 'שגיאה'), { tone: 'warning' });
        }
      }
      setLiveGeneration((prev) => ({ ...prev, active: true, state: usedFallback ? 'warning' : 'success', prompt: usedFallback ? 'נוצרה טיוטה בטוחה לבדיקה ושיפור' : resolvedTitle, summary: latestSummary, logs: latestLogs, runId: generationRequest.runId, workspaceId: generationLogsWorkspaceId }));
      setLastGenerationAction((prev) => (prev?.runId !== generationRequest.runId ? prev : {
        ...prev,
        inspector: {
          ...(prev?.inspector || {}),
          requestedProviderId: resolvedInspectorMeta.requestedProviderId || String(prev?.inspector?.requestedProviderId || '').trim(),
          requestedProviderModel: resolvedInspectorMeta.requestedProviderModel || String(prev?.inspector?.requestedProviderModel || '').trim(),
          routeMode: resolvedInspectorMeta.routeMode || String(prev?.inspector?.routeMode || '').trim(),
          routeModeReason: resolvedInspectorMeta.routeModeReason || String(prev?.inspector?.routeModeReason || '').trim(),
          usedFallback,
          errorMessage: String(result?.errorMessage || '').trim(),
          liveState: usedFallback ? 'warning' : 'success',
          routeResolved: generationRoute,
        },
      }));
      setFeedbackSurvey({
        ...buildFeedbackSurveyStateWithGenerationContext({}, {
          prompt: resolvedTitle,
          templateId,
          usedFallback,
          selectedMaterials,
          selectedModel,
          selectedProviderId: resolvedFeedbackProviderId,
          selectedProviderModel: resolvedFeedbackProviderModel,
          useWorkspaceV2: Boolean(result?.workspaceV2?.templateId || workspaceV2TemplateId),
          workspaceV2TemplateId: String(result?.workspaceV2?.templateId || workspaceV2TemplateId || '').trim(),
        }),
        open: false,
        phase: 'details',
      });

      const deferredReviewOffer = suppressDeferredReviewOffer
        ? null
        : buildDeferredReviewOffer({
            logs: latestLogs,
            additionalReviewRounds,
            usedFallback,
          });

      if (deferredReviewOffer && await showConfirm(deferredReviewOffer.confirmMessage, { title: 'סבב סקירה נוסף', confirmLabel: 'כן, המשך' })) {
        const followUpInstructions = [
          String(instructions || '').trim(),
          deferredReviewOffer.feedback,
        ].filter(Boolean).join('\n\n');

        return executeStartScreenGeneration({
          ...resolvedAction,
          payload: {
            prompt,
            templateId,
            instructions: followUpInstructions,
            selectedMaterials,
            selectedModel,
            selectedProviderId: resolvedFeedbackProviderId,
            selectedProviderModel: resolvedFeedbackProviderModel,
            instructionFileName,
            baseDraft: {
              html: generated,
              title: resolvedTitle,
            },
            additionalReviewRounds: 1,
            suppressDeferredReviewOffer: true,
            forceDirectMode: resolvedInspectorMeta.routeMode === 'direct',
            preserveCurrentDocumentOnError: true,
          },
        }, {
          ...options,
          skipConfirmReplace: true,
        });
      }
    } catch (error) {
      if (!isGenerationRequestCurrent(generationRequest)) return true;
      const latestSummary = getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId);
      const latestLogs = getRecentAgentLogs(18, { workspaceId: generationLogsWorkspaceId, runId: generationRequest.runId });
      const resolvedInspectorMeta = resolveStartScreenGenerationInspectorMeta({ summary: latestSummary, logs: latestLogs });
      const terminalState = classifyLiveGenerationTerminalState(error, {
        errorPrompt: hasBaseDraft ? 'עדכון טיוטת הבסיס נכשל' : 'יצירת המסמך נכשלה',
        timeoutPrompt: hasBaseDraft ? 'עדכון טיוטת הבסיס הופסק כי הבקשה ארכה יותר מדי זמן' : 'יצירת המסמך הופסקה כי הבקשה ארכה יותר מדי זמן',
      });
      setLiveGeneration((prev) => ({ ...prev, active: true, state: terminalState.state, prompt: terminalState.prompt, summary: latestSummary, logs: latestLogs, runId: generationRequest.runId, workspaceId: generationLogsWorkspaceId }));
      setLastGenerationAction((prev) => (prev?.runId !== generationRequest.runId ? prev : {
        ...prev,
        inspector: {
          ...(prev?.inspector || {}),
          requestedProviderId: resolvedInspectorMeta.requestedProviderId || String(prev?.inspector?.requestedProviderId || '').trim(),
          requestedProviderModel: resolvedInspectorMeta.requestedProviderModel || String(prev?.inspector?.requestedProviderModel || '').trim(),
          routeMode: resolvedInspectorMeta.routeMode || String(prev?.inspector?.routeMode || '').trim(),
          routeModeReason: resolvedInspectorMeta.routeModeReason || String(prev?.inspector?.routeModeReason || '').trim(),
          usedFallback: false,
          errorMessage: terminalState.errorMessage || String(latestSummary?.lastError || '').trim(),
          liveState: terminalState.state,
          routeResolved: generationRoute,
        },
      }));
      lastLiveGenerationShellRef.current = { runId: '', html: '' };
      const fallbackDraftHtml = preserveCurrentDocumentOnError ? String(baseDraft?.html || '').trim() : '';
      if (fallbackDraftHtml) {
        editor.commands.setContent(fallbackDraftHtml);
        lastLiveGenerationPlaceholderRef.current = { runId: '', html: '' };
      } else {
        const errorPlaceholder = buildLiveGenerationErrorPlaceholder({
          titleText: generationLabel,
          runId: generationRequest.runId,
          state: terminalState.state,
        });
        editor.commands.setContent(errorPlaceholder);
        lastLiveGenerationPlaceholderRef.current = {
          runId: generationRequest.runId,
          html: normalizeTrackedEditorHtml(String(editor.getHTML?.() || errorPlaceholder)),
        };
      }
    }

    return true;
  }, [beginDocumentIdentity, beginGenerationRequest, changeDocumentStyle, clearAssignmentBrief, clearDocumentArrival, confirmReplaceCurrentDocument, documentStyle, editor, isGenerationRequestCurrent, persistLocalCache, resetDocumentInteractionState, runStartTransition, storeAssignmentBrief, triggerDocumentArrival]);

  // פותח את סטודיו המצגות (עם או בלי deck קיים)
  const openPresentationStudio = React.useCallback(() => {
    enterStudioMode('presentation');
    setShowStartScreen(false);
  }, []);

  // מייצר deck JSON אמיתי (לא HTML) ומציג אותו בסטודיו המצגות
  const generatePresentationDeck = React.useCallback(async ({
    source = 'topic',
    topic = '',
    audience = '',
    goal = '',
    slideCount = 10,
    theme = 'premium',
    themeId = '',
    imageIntensity = 'high',
    density = 'balanced',
    documentText: providedDocumentText = '',
    aiAppendix = false,
  } = {}) => {
    const cleanTopic = String(topic || '').trim();
    const fromDocument = source === 'document';

    let documentText = '';
    if (fromDocument) {
      documentText = String(providedDocumentText || '').trim() || String(editor?.getText?.() || '').trim();
      if (!documentText) {
        showToast('אין תוכן מקור כדי להפוך אותו למצגת.', { tone: 'warning' });
        return false;
      }
    } else if (!cleanTopic) {
      return false;
    }

    enterStudioMode('presentation');
    setShowStartScreen(false);
    setPresentationBusy(true);
    try {
      const deck = await generateDeck({
        source,
        topic: cleanTopic,
        audience: String(audience || '').trim(),
        goal: String(goal || '').trim(),
        documentText,
        slideCount,
        themeId: themeId || theme || 'premium',
        density,
        imageIntensity,
      });
      let finalDeck = deck;
      // נספח AI כשקופיות בסוף הדק (קריאת API נוספת) — לפי בקשה ממסך הפתיחה.
      if (aiAppendix && deck && Array.isArray(deck.slides)) {
        try {
          showToast('מייצר נספח AI למצגת — קריאת API נוספת…');
          const deckText = deck.slides
            .map((s) => [s.title, s.subtitle, s.body, ...(Array.isArray(s.bullets) ? s.bullets : [])].filter(Boolean).join(' '))
            .filter(Boolean)
            .join('\n');
          const contextText = deckText || documentText || cleanTopic;
          const appendixParsed = await generateAiAppendixHtml({ contextText, providerId: '', providerModel: '' });
          if (appendixParsed.ok && appendixParsed.appendixHtml) {
            const appendixSlides = buildAiAppendixSlidesFromHtml(appendixParsed.appendixHtml);
            if (appendixSlides.length) {
              finalDeck = { ...deck, slides: [...deck.slides, ...appendixSlides] };
              showToast('נספח ה-AI נוסף כשקופיות בסוף הדק. זכור למחוק אותן לפני הגשה.');
            }
          } else {
            showToast('נספח ה-AI לא נוצר בפורמט צפוי — דלגתי עליו.', { tone: 'warning' });
          }
        } catch (appendixError) {
          showToast('יצירת נספח ה-AI למצגת נכשלה: ' + (appendixError?.message || 'שגיאה'), { tone: 'warning' });
        }
      }
      setPresentationDeck(finalDeck);
      return true;
    } catch (error) {
      showToast(error?.message || 'יצירת המצגת נכשלה', { tone: 'error' });
      return false;
    } finally {
      setPresentationBusy(false);
    }
  }, [editor, generateAiAppendixHtml]);

  const runDocumentFeedbackRevision = React.useCallback(async (action) => {
    const payload = action?.payload || {};
    const resolvedAction = {
      ...action,
      kind: 'feedback-revision',
      workspaceId: action?.workspaceId || getActiveWorkspaceId(),
    };

    const surveySnapshot = payload.surveySnapshot && typeof payload.surveySnapshot === 'object'
      ? { ...payload.surveySnapshot }
      : { ...DEFAULT_FEEDBACK_SURVEY };
    const workflowAvailable = isFeedbackWorkflowAvailable();
    const requestedExecutionMode = normalizeFeedbackExecutionMode(payload.executionMode || surveySnapshot.executionMode);
    const executionMode = requestedExecutionMode === 'workspace' && workflowAvailable ? 'workspace' : 'direct';
    const roundIndex = normalizeFeedbackRoundIndex(payload.roundIndex || surveySnapshot.roundIndex);
    const templateId = String(payload.templateId || activeTemplateId || 'blank').trim() || 'blank';
    const selectedMaterials = Array.isArray(payload.selectedMaterials) ? payload.selectedMaterials.filter(Boolean) : [];
    const selectedProviderId = String(payload.selectedProviderId || payload.selectedModel || '').trim();
    const selectedProviderModel = String(payload.selectedProviderModel || '').trim();
    const selectedModel = selectedProviderId;
    const existingHtml = payload.existingHtml || editor?.getHTML?.() || '';
    const generationRequest = beginGenerationRequest('doc-feedback');
    const originWorkspaceId = generationRequest.workspaceId;
    setLastGenerationAction({
      ...resolvedAction,
      runId: generationRequest.runId,
      inspector: buildStartScreenGenerationInspector({
        runId: generationRequest.runId,
        actionType: 'revise',
        prompt: String(payload.originalPrompt || '').trim(),
        instructions: String(payload.feedback || '').trim(),
        selectedMaterials,
        templateId,
        selectedProviderId,
        selectedProviderModel,
        route: 'reviseDocumentWithFeedback',
        routeMode: executionMode === 'workspace' ? 'workspace-automation' : 'direct',
        routeModeReason: executionMode === 'workspace' ? '' : 'feedback-direct',
      }),
    });
    clearDocumentArrival();
    setFeedbackSurvey((prev) => ({
      ...prev,
      open: false,
      phase: 'details',
      submitting: true,
      submissionRequestId: generationRequest.requestId,
    }));
    setAssistantTrigger('manual');
    setSidebarOpen(true);
    setLiveGeneration({
      active: true,
      state: 'running',
      prompt: executionMode === 'workspace' ? 'מעדכן את המסמך עם צוות הסוכנים הפעיל' : 'מעדכן את המסמך לפי המשוב שלך',
      summary: getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId),
      logs: getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId }),
      runId: generationRequest.runId,
      workspaceId: originWorkspaceId,
    });

    const clearHiddenFeedbackSubmittingAfterStale = () => {
      setFeedbackSurvey((prev) => {
        if (prev.submissionRequestId !== generationRequest.requestId || prev.open || !prev.submitting) {
          return prev;
        }

        return {
          ...prev,
          submitting: false,
          submissionRequestId: null,
        };
      });
    };

    try {
      const result = await reviseDocumentWithFeedback({
        existingHtml,
        originalPrompt: payload.originalPrompt,
        templateId,
        feedback: payload.feedback || '',
        selectedMaterials,
        selectedModel,
        selectedProviderId,
        selectedProviderModel,
        useWorkspaceV2: payload.useWorkspaceV2 === true,
        workspaceV2TemplateId: String(payload.workspaceV2TemplateId || '').trim(),
        forceDirectMode: payload.useWorkspaceV2 === true ? false : executionMode !== 'workspace',
        runId: generationRequest.runId,
        returnMeta: true,
      });

      const revisedHtml = result?.html || existingHtml;
      const usedFallback = Boolean(result?.usedFallback);
      const consumedRevisionRound = !usedFallback || String(revisedHtml || '').trim() !== String(existingHtml || '').trim();
      if (!isGenerationRequestCurrent(generationRequest)) {
        clearHiddenFeedbackSubmittingAfterStale();
        return true;
      }

      if (editor && revisedHtml) {
        lastLiveGenerationShellRef.current = { runId: '', html: '' };
        editor.commands.setContent(revisedHtml);
        triggerDocumentArrival(usedFallback ? 'warning' : 'success');
      }

      persistLocalCache(revisedHtml);
      saveDocumentHistory({
        title: `${payload.originalPrompt || 'מסמך'} · תיקון לפי משוב`,
        content: revisedHtml,
        templateId,
        source: 'feedback-revision',
      });

      setLiveGeneration({
        active: true,
        state: usedFallback ? 'warning' : 'success',
        prompt: usedFallback ? 'נשמרה הגרסה הקודמת כי העדכון לא הושלם במלואו' : 'המסמך עודכן לפי המשוב שלך',
        summary: getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId),
        logs: getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId }),
        runId: generationRequest.runId,
        workspaceId: originWorkspaceId,
      });
      const latestSummary = getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId);
      const latestLogs = getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId });
      const resolvedInspectorMeta = resolveStartScreenGenerationInspectorMeta({ summary: latestSummary, logs: latestLogs });
      const resolvedFeedbackProviderId = resolvedInspectorMeta.requestedProviderId || selectedProviderId;
      const resolvedFeedbackProviderModel = resolvedInspectorMeta.requestedProviderModel || selectedProviderModel;
      setLastGenerationAction((prev) => (prev?.runId !== generationRequest.runId ? prev : {
        ...prev,
        inspector: {
          ...(prev?.inspector || {}),
          requestedProviderId: resolvedInspectorMeta.requestedProviderId || String(prev?.inspector?.requestedProviderId || '').trim(),
          requestedProviderModel: resolvedInspectorMeta.requestedProviderModel || String(prev?.inspector?.requestedProviderModel || '').trim(),
          routeMode: resolvedInspectorMeta.routeMode || String(prev?.inspector?.routeMode || '').trim(),
          routeModeReason: resolvedInspectorMeta.routeModeReason || String(prev?.inspector?.routeModeReason || '').trim(),
          usedFallback,
          errorMessage: String(result?.errorMessage || '').trim(),
          liveState: usedFallback ? 'warning' : 'success',
          routeResolved: 'reviseDocumentWithFeedback',
        },
      }));

      setFeedbackSurvey({
        ...buildFeedbackSurveyStateWithGenerationContext(surveySnapshot, {
          prompt: payload.originalPrompt,
          templateId,
          usedFallback,
          selectedMaterials,
          selectedModel,
          selectedProviderId: resolvedFeedbackProviderId,
          selectedProviderModel: resolvedFeedbackProviderModel,
        }),
        open: false,
        phase: 'details',
        executionMode,
        roundIndex: consumedRevisionRound ? normalizeFeedbackRoundIndex(roundIndex + 1) : roundIndex,
        usedFallback,
      });

      if (usedFallback && result?.errorMessage) {
        showToast(`לא הצלחתי ליישם את כל ההערות: ${result.errorMessage}`, { tone: 'error' });
      }
    } catch (error) {
      if (!isGenerationRequestCurrent(generationRequest)) {
        clearHiddenFeedbackSubmittingAfterStale();
        return true;
      }
      setFeedbackSurvey({
        ...surveySnapshot,
        open: true,
        phase: 'details',
        submitting: false,
      });
      const latestSummary = getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId);
      const latestLogs = getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId });
      const resolvedInspectorMeta = resolveStartScreenGenerationInspectorMeta({ summary: latestSummary, logs: latestLogs });
      const terminalState = classifyLiveGenerationTerminalState(error, {
        errorPrompt: 'עדכון המסמך נכשל',
        timeoutPrompt: 'עדכון המסמך הופסק כי הבקשה ארכה יותר מדי זמן',
        fallbackAlertMessage: 'לא הצלחתי לעדכן את המסמך לפי המשוב.',
        fallbackTimeoutAlertMessage: 'עדכון המסמך נעצר כי הבקשה ארכה יותר מדי זמן.',
      });
      setLiveGeneration({
        active: true,
        state: terminalState.state,
        prompt: terminalState.prompt,
        summary: latestSummary,
        logs: latestLogs,
        runId: generationRequest.runId,
        workspaceId: originWorkspaceId,
      });
      setLastGenerationAction((prev) => (prev?.runId !== generationRequest.runId ? prev : {
        ...prev,
        inspector: {
          ...(prev?.inspector || {}),
          requestedProviderId: resolvedInspectorMeta.requestedProviderId || String(prev?.inspector?.requestedProviderId || '').trim(),
          requestedProviderModel: resolvedInspectorMeta.requestedProviderModel || String(prev?.inspector?.requestedProviderModel || '').trim(),
          routeMode: resolvedInspectorMeta.routeMode || String(prev?.inspector?.routeMode || '').trim(),
          routeModeReason: resolvedInspectorMeta.routeModeReason || String(prev?.inspector?.routeModeReason || '').trim(),
          usedFallback: false,
          errorMessage: terminalState.errorMessage,
          liveState: terminalState.state,
          routeResolved: 'reviseDocumentWithFeedback',
        },
      }));
      showToast(terminalState.alertMessage, { tone: terminalState.state === 'error' ? 'error' : 'success', duration: 6000 });
    }

    return true;
  }, [activeTemplateId, beginGenerationRequest, clearDocumentArrival, editor, isGenerationRequestCurrent, persistLocalCache, triggerDocumentArrival]);

  const runDocumentRecommendationsReview = React.useCallback(async (action) => {
    const payload = action?.payload || {};
    const resolvedAction = {
      ...action,
      kind: 'review-recommendations',
      workspaceId: action?.workspaceId || getActiveWorkspaceId(),
    };

    const surveySnapshot = payload.surveySnapshot && typeof payload.surveySnapshot === 'object'
      ? { ...payload.surveySnapshot }
      : { ...DEFAULT_FEEDBACK_SURVEY };
    const templateId = String(payload.templateId || activeTemplateId || 'blank').trim() || 'blank';
    const selectedMaterials = Array.isArray(payload.selectedMaterials) ? payload.selectedMaterials.filter(Boolean) : [];
    const selectedProviderId = String(payload.selectedProviderId || payload.selectedModel || '').trim();
    const selectedProviderModel = String(payload.selectedProviderModel || '').trim();
    const selectedModel = selectedProviderId;
    const reviewFocus = String(payload.focus || '').trim();
    const generationRequest = beginGenerationRequest('doc-review');
    const originWorkspaceId = generationRequest.workspaceId;
    setLastGenerationAction({
      ...resolvedAction,
      runId: generationRequest.runId,
      inspector: buildStartScreenGenerationInspector({
        runId: generationRequest.runId,
        actionType: 'review',
        prompt: String(payload.originalPrompt || '').trim(),
        instructions: reviewFocus,
        selectedMaterials,
        templateId,
        selectedProviderId,
        selectedProviderModel,
        route: 'reviewDocumentRecommendations',
        routeMode: 'direct',
        routeModeReason: 'review-direct',
      }),
    });
    setFeedbackSurvey((prev) => ({
      ...prev,
      open: true,
      phase: 'review',
      submitting: true,
      submissionRequestId: generationRequest.requestId,
      reviewResult: null,
      reviewFocus,
      reviewErrorMessage: '',
    }));
    setAssistantTrigger('manual');
    setSidebarOpen(true);
    setLiveGeneration({
      active: true,
      state: 'running',
      prompt: 'מכין המלצות עריכה למסמך',
      summary: getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId),
      logs: getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId }),
      runId: generationRequest.runId,
      workspaceId: originWorkspaceId,
    });

    const clearHiddenReviewSubmittingAfterStale = () => {
      setFeedbackSurvey((prev) => {
        if (prev.submissionRequestId !== generationRequest.requestId || !prev.submitting) {
          return prev;
        }

        return {
          ...prev,
          submitting: false,
          submissionRequestId: null,
        };
      });
    };

    try {
      const result = await reviewDocumentRecommendations({
        existingHtml: payload.existingHtml || editor?.getHTML?.() || '',
        originalPrompt: payload.originalPrompt,
        templateId,
        selectedMaterials,
        selectedModel,
        selectedProviderId,
        selectedProviderModel,
        focus: reviewFocus,
        runId: generationRequest.runId,
        returnMeta: true,
      });

      if (!isGenerationRequestCurrent(generationRequest)) {
        clearHiddenReviewSubmittingAfterStale();
        return true;
      }

      setFeedbackSurvey((prev) => {
        if (prev.submissionRequestId !== generationRequest.requestId) return prev;

        return {
          ...prev,
          phase: 'review',
          submitting: false,
          submissionRequestId: null,
          reviewFocus,
          reviewApplySelection: '',
          reviewErrorMessage: String(result?.errorMessage || '').trim(),
          reviewResult: {
            summary: String(result?.summary || '').trim(),
            suggestions: Array.isArray(result?.suggestions) ? result.suggestions : [],
            usedFallback: Boolean(result?.usedFallback),
          },
        };
      });

      const latestSummary = getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId);
      const latestLogs = getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId });
      const latestStages = Array.isArray(latestSummary?.stages) ? latestSummary.stages : [];
      const requestStartLog = latestLogs.find((log) => log?.type === 'request-start');
      const lastLogMeta = [...latestLogs].reverse().find(
        (log) => String(log?.provider || '').trim() || String(log?.model || '').trim(),
      );
      const lastStageMeta = [...latestStages].reverse().find(
        (stage) => String(stage?.provider || '').trim() || String(stage?.model || '').trim(),
      );
      const resolvedProviderMeta = lastLogMeta || lastStageMeta || {};
      const resolvedProviderId = String(resolvedProviderMeta?.provider || '').trim();
      const resolvedProviderModel = String(resolvedProviderMeta?.model || '').trim();
      const resolvedRouteMode = requestStartLog
        ? (requestStartLog.automationSkipped === true ? 'direct' : 'workspace-automation')
        : '';
      const resolvedRouteModeReason = String(requestStartLog?.automationSkipReason || '').trim();

      setLastGenerationAction((prev) => (prev?.runId !== generationRequest.runId ? prev : {
        ...prev,
        inspector: {
          ...(prev?.inspector || {}),
          requestedProviderId: resolvedProviderId || String(prev?.inspector?.requestedProviderId || '').trim(),
          requestedProviderModel: resolvedProviderModel || String(prev?.inspector?.requestedProviderModel || '').trim(),
          routeMode: resolvedRouteMode || String(prev?.inspector?.routeMode || '').trim(),
          routeModeReason: resolvedRouteModeReason || String(prev?.inspector?.routeModeReason || '').trim(),
          usedFallback: Boolean(result?.usedFallback),
          errorMessage: String(result?.errorMessage || '').trim(),
          liveState: Boolean(result?.usedFallback) ? 'warning' : 'success',
          routeResolved: 'reviewDocumentRecommendations',
        },
      }));
      setLiveGeneration((prev) => (prev.runId !== generationRequest.runId ? prev : {
        ...prev,
        active: false,
        state: 'idle',
        prompt: '',
        summary: latestSummary,
        logs: latestLogs,
        runId: '',
        workspaceId: originWorkspaceId,
      }));
    } catch (error) {
      if (!isGenerationRequestCurrent(generationRequest)) {
        clearHiddenReviewSubmittingAfterStale();
        return true;
      }

      const terminalState = classifyLiveGenerationTerminalState(error, {
        errorPrompt: 'הכנת המלצות העריכה נכשלה',
        timeoutPrompt: 'הכנת המלצות העריכה הופסקה כי הבקשה ארכה יותר מדי זמן',
        fallbackAlertMessage: 'לא הצלחתי להכין המלצות עריכה למסמך.',
        fallbackTimeoutAlertMessage: 'הכנת המלצות העריכה נעצרה כי הבקשה ארכה יותר מדי זמן.',
      });
      setFeedbackSurvey({
        ...surveySnapshot,
        open: true,
        phase: 'details',
        submitting: false,
        submissionRequestId: null,
        reviewResult: null,
        reviewErrorMessage: '',
      });
      setLiveGeneration({
        active: true,
        state: terminalState.state,
        prompt: terminalState.prompt,
        summary: getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId),
        logs: getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId }),
        runId: generationRequest.runId,
        workspaceId: originWorkspaceId,
      });
      setLastGenerationAction((prev) => (prev?.runId !== generationRequest.runId ? prev : {
        ...prev,
        inspector: {
          ...(prev?.inspector || {}),
          usedFallback: false,
          errorMessage: terminalState.errorMessage,
          liveState: terminalState.state,
          routeResolved: 'reviewDocumentRecommendations',
        },
      }));
      showToast(terminalState.alertMessage, { tone: terminalState.state === 'error' ? 'error' : 'success', duration: 6000 });
    }

    return true;
  }, [activeTemplateId, beginGenerationRequest, editor, isGenerationRequestCurrent]);

  const runStoredGenerationAction = React.useCallback(async (action, options = {}) => {
    if (!action?.kind) return false;
    if (action.kind === 'start-screen-generate') return executeStartScreenGeneration(action, options);
    if (action.kind === 'feedback-revision') return runDocumentFeedbackRevision(action);
    if (action.kind === 'review-recommendations') return runDocumentRecommendationsReview(action);
    return false;
  }, [executeStartScreenGeneration, runDocumentFeedbackRevision, runDocumentRecommendationsReview]);

  const clearPersistedDraftCache = React.useCallback(() => {
    clearPersistedDraftCacheStorage();
  }, []);

  const getCurrentBlockElement = React.useCallback(() => {
    const selection = window.getSelection?.();
    const anchorNode = selection?.anchorNode;
    const baseElement = anchorNode?.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode;
    return baseElement?.closest?.('p, h1, h2, h3, h4, h5, h6, blockquote, li, ul, ol') || null;
  }, []);

  const finalizePendingImportedDocument = React.useCallback(({ rollbackToSpss = false } = {}) => {
    pendingImportRef.current = null;
    setPendingStartupDocument(false);
    const startedFromSpss = pendingImportOriginModeRef.current === 'spss';
    pendingImportOriginModeRef.current = null;
    if (rollbackToSpss && startedFromSpss) {
      setAppMode('spss');
    }
  }, []);

  const queuePendingImportedDocument = React.useCallback((payload = {}) => {
    if (isCanceledImportedDocumentPayload(payload)) {
      return;
    }
    pendingImportRef.current = payload;
    setPendingStartupDocument(true);
    if (appMode === 'spss') {
      pendingImportOriginModeRef.current = 'spss';
      setAppMode('word');
    }
  }, [appMode]);

  const applyImportedDocument = React.useCallback((payload = {}) => {
    if (isCanceledImportedDocumentPayload(payload)) {
      finalizePendingImportedDocument({ rollbackToSpss: true });
      return;
    }
    if (appMode === 'spss') {
      queuePendingImportedDocument(payload);
      return;
    }
    if (!editor) return;
    if (payload?.ok === false || payload?.error) {
      finalizePendingImportedDocument({ rollbackToSpss: true });
      showToast(payload?.error || 'לא ניתן לפתוח את הקובץ שנבחר.', { tone: 'error' });
      return;
    }
    const importedHtml = String(payload.html || '').trim() || '<p></p>';
    const importedText = String(payload.text || '').trim()
      || importedHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (importedHtml.length > MAX_IMPORTED_DOCUMENT_HTML_CHARS || importedText.length > MAX_IMPORTED_DOCUMENT_TEXT_CHARS) {
      finalizePendingImportedDocument({ rollbackToSpss: true });
      showToast('המסמך גדול מדי לפתיחה ישירה בתוך העורך כרגע. נסה גרסה קצרה יותר או פצל את הקובץ.', { tone: 'warning', duration: 6000 });
      return;
    }
    const fallbackTitle = String(payload.title || 'מסמך שנפתח מהמחשב').trim();
    if (!confirmReplaceCurrentDocument()) {
      finalizePendingImportedDocument({ rollbackToSpss: true });
      return;
    }

    clearDraftReviewState();
    try {
      editor.commands.setContent(importedHtml);
    } catch (error) {
      finalizePendingImportedDocument({ rollbackToSpss: true });
      showToast(error?.message || 'לא הצלחתי לטעון את תוכן הקובץ לעורך.', { tone: 'error' });
      return;
    }
    editor.setEditable(true);
    setViewMode('print');
    if (editor.view?.dom) {
      editor.view.dom.contentEditable = 'true';
      editor.view.dom.dataset.viewMode = 'print';
    }
    applyDocumentStyleToEditor(documentStyle, editor);
    beginDocumentIdentity({ filePath: payload.filePath });
    clearAssignmentBrief();
    persistActiveTemplateId('blank');
    syncPersistedAppSettings();
    setActiveTemplateId('blank');
    saveDocumentHistory({
      title: resolveDocumentHistoryTitle({
        text: importedText,
        filePath: payload.filePath,
        templateId: activeTemplateId || 'blank',
        fallbackTitle,
      }),
      content: importedHtml,
      templateId: 'blank',
      source: 'opened-file',
      filePath: String(payload.filePath || ''),
    });
    persistLocalCache(importedHtml);
    finalizePendingImportedDocument();
    initializedDocRef.current = true;
    setLastEditorActivityAt(Date.now());
    setShowStartScreen(false);
    focusEditorSoon('start');
  }, [editor, appMode, activeTemplateId, queuePendingImportedDocument, confirmReplaceCurrentDocument, clearDraftReviewState, focusEditorSoon, persistLocalCache, applyDocumentStyleToEditor, documentStyle, finalizePendingImportedDocument, beginDocumentIdentity, clearAssignmentBrief]);

  React.useEffect(() => {
    if (!window.desktopApp?.onOpenExternalDocument) return;
    return window.desktopApp.onOpenExternalDocument((payload) => {
      if (window.desktopApp?.consumePendingOpenDocument) {
        Promise.resolve(window.desktopApp.consumePendingOpenDocument()).catch(() => {});
      }
      if (isCanceledImportedDocumentPayload(payload)) {
        finalizePendingImportedDocument({ rollbackToSpss: true });
        return;
      }
      if (appMode === 'spss') {
        queuePendingImportedDocument(payload);
        return;
      }
      if (!editor) {
        queuePendingImportedDocument(payload);
        return;
      }
      applyImportedDocument(payload);
    });
  }, [editor, applyImportedDocument, appMode, queuePendingImportedDocument, finalizePendingImportedDocument]);

  React.useEffect(() => {
    if (!window.desktopApp?.onOpenSettings) return;
    return window.desktopApp.onOpenSettings((payload) => {
      if (appMode === 'spss') {
        return;
      }
      if (window.desktopApp?.consumePendingOpenSettings) {
        Promise.resolve(window.desktopApp.consumePendingOpenSettings()).catch(() => {});
      }
      const tab = payload?.tab || 'ai';
      setFileMenuTargetTab(tab);
      setFileMenuOpen(true);
    });
  }, [appMode]);

  React.useEffect(() => {
    if (!editor) return;

    const applyPending = async () => {
      if (appMode === 'spss') {
        if (pendingImportRef.current || pendingStartupDocument) {
          setPendingStartupDocument(true);
        }
        return;
      } else if (pendingImportRef.current) {
        const payload = pendingImportRef.current;
        pendingImportRef.current = null;
        applyImportedDocument(payload);
      } else if (window.desktopApp?.consumePendingOpenDocument) {
        const payload = await window.desktopApp.consumePendingOpenDocument();
        if (payload && !isCanceledImportedDocumentPayload(payload)) {
          applyImportedDocument(payload);
        } else {
          finalizePendingImportedDocument({ rollbackToSpss: true });
        }
      } else {
        finalizePendingImportedDocument({ rollbackToSpss: true });
      }

      if (appMode !== 'spss' && window.desktopApp?.consumePendingOpenSettings) {
        const payload = await window.desktopApp.consumePendingOpenSettings();
        if (payload?.tab) {
          setFileMenuTargetTab(payload.tab);
          setFileMenuOpen(true);
        }
      }
    };

    applyPending();
  }, [editor, applyImportedDocument, appMode, pendingStartupDocument, finalizePendingImportedDocument]);

  React.useEffect(() => {
    if (!fileMenuOpen) return;
    setCopyleaksDetector((prev) => (prev.open ? { ...DEFAULT_COPYLEAKS_DETECTOR } : prev));
  }, [fileMenuOpen]);

  const inferCurrentDocumentTitle = React.useCallback((text = '') => {
    return getDraftTitleFromText(text, activeTemplateId || 'blank');
  }, [activeTemplateId]);

  const persistDocumentToCloud = React.useCallback(async ({ reason = 'manual', silent = false } = {}) => {
    if (!cloudAvailable) {
      showToast('Firebase עדיין לא מוגדר בפרויקט הזה.', { tone: 'warning' });
      return null;
    }
    if (!cloudUser) {
      showToast('צריך קודם להתחבר עם Google.', { tone: 'warning' });
      return null;
    }
    if (!editor) {
      showToast('העורך עדיין נטען. נסה שוב בעוד רגע.', { tone: 'warning' });
      return null;
    }

    const isAutosave = reason === 'autosave';
    setCloudSyncState((prev) => ({
      ...prev,
      status: 'saving',
      message: isAutosave ? 'שומר אוטומטית לענן...' : 'שומר לענן...',
    }));

    try {
      const html = editor.getHTML();
      const text = editor.getText();
      const fallbackTitle = inferCurrentDocumentTitle(text);
      const title = resolveDocumentHistoryTitle({
        text,
        filePath: currentFilePathRef.current,
        templateId: activeTemplateId || 'blank',
        fallbackTitle,
      });
      const savedDocument = await saveCloudDocument({
        user: cloudUser,
        documentId: currentCloudDocumentIdRef.current || activeDocumentSessionId,
        title,
        html,
        text,
        templateId: activeTemplateId || 'blank',
        documentStyle,
        filePath: currentFilePathRef.current,
        sessionId: activeDocumentSessionId,
      });

      const savedAt = new Date().toISOString();
      setCurrentCloudDocumentId(savedDocument.id);
      currentCloudDocumentIdRef.current = savedDocument.id;
      lastCloudSavedHtmlRef.current = html;
      setCloudSyncState((prev) => ({
        ...prev,
        status: 'idle',
        message: isAutosave ? 'סונכרן אוטומטית ל-Firebase' : 'נשמר ל-Firebase',
        lastSavedAt: savedAt,
        documentId: savedDocument.id,
        autosaveEnabled: true,
      }));

      if (!silent && !isAutosave) {
        showToast('המסמך נשמר בהצלחה ל-Firebase.', { tone: 'success' });
      }

      return savedDocument;
    } catch (error) {
      console.error('Cloud save failed:', error);
      setCloudSyncState((prev) => ({
        ...prev,
        status: 'error',
        message: error?.message || 'השמירה לענן נכשלה',
      }));
      if (!silent) {
        showToast(error?.message || 'השמירה לענן נכשלה.', { tone: 'error' });
      }
      return null;
    }
  }, [activeDocumentSessionId, activeTemplateId, cloudAvailable, cloudUser, documentStyle, editor, inferCurrentDocumentTitle]);

  const handleCloudGoogleSignIn = React.useCallback(async () => {
    if (!cloudAvailable) {
      showToast('Firebase עדיין לא מוגדר בפרויקט הזה.', { tone: 'warning' });
      return;
    }
    setCloudSyncState((prev) => ({
      ...prev,
      status: 'saving',
      message: 'פותח התחברות עם Google...',
    }));
    try {
      await cloudSignInWithGooglePopup();
    } catch (error) {
      console.error('Google sign-in failed:', error);
      setCloudSyncState((prev) => ({
        ...prev,
        status: 'error',
        message: error?.message || 'ההתחברות עם Google נכשלה',
      }));
      showToast(error?.message || 'ההתחברות עם Google נכשלה.', { tone: 'error' });
    }
  }, [cloudAvailable]);

  const handleCloudSignOut = React.useCallback(async () => {
    try {
      await cloudSignOut();
      setCloudSyncState({
        status: 'idle',
        message: 'לא מחובר לענן',
        lastSavedAt: '',
        documentId: '',
        autosaveEnabled: false,
      });
    } catch (error) {
      console.error('Cloud sign-out failed:', error);
      showToast(error?.message || 'ההתנתקות מהענן נכשלה.', { tone: 'error' });
    }
  }, []);

  const handleManualCloudSync = React.useCallback(async () => {
    if (!cloudAvailable) {
      showToast('Firebase עדיין לא מוגדר בפרויקט הזה.', { tone: 'warning' });
      return;
    }
    if (!cloudUser) {
      showToast('צריך קודם להתחבר עם Google.', { tone: 'warning' });
      return;
    }

    setCloudSyncState((prev) => ({
      ...prev,
      status: 'saving',
      message: 'מסנכרן פרופיל ומסמך לענן...',
    }));

    try {
      const profilePayload = await triggerCloudSync(cloudUser, { immediate: true, force: true, throwOnError: true });
      const savedDocument = await persistDocumentToCloud({ reason: 'manual-profile-sync', silent: true });
      const savedAt = new Date().toISOString();
      const syncedSettingsCount = Object.keys(profilePayload?.appSettings || {}).length;

      setCloudSyncState((prev) => ({
        ...prev,
        status: 'idle',
        message: savedDocument
          ? `הפרופיל והמסמך סונכרנו לענן (${syncedSettingsCount} הגדרות)`
          : `הפרופיל סונכרן לענן (${syncedSettingsCount} הגדרות)`,
        lastSavedAt: savedAt,
        documentId: savedDocument?.id || prev.documentId,
        autosaveEnabled: prev.autosaveEnabled || Boolean(savedDocument),
      }));

      showToast(savedDocument
        ? `הפרופיל והמסמך סונכרנו לענן (${syncedSettingsCount} הגדרות).`
        : `הפרופיל סונכרן לענן (${syncedSettingsCount} הגדרות).`, { tone: 'success' });
    } catch (error) {
      console.error('Manual cloud sync failed:', error);
      setCloudSyncState((prev) => ({
        ...prev,
        status: 'error',
        message: error?.message || 'הסנכרון לענן נכשל',
      }));
      showToast(error?.message || 'הסנכרון לענן נכשל.', { tone: 'error' });
    }
  }, [cloudAvailable, cloudUser, persistDocumentToCloud]);

  const handlePullFromCloud = React.useCallback(async () => {
    if (!cloudAvailable) {
      showToast('Firebase עדיין לא מוגדר בפרויקט הזה.', { tone: 'warning' });
      return;
    }
    if (!cloudUser) {
      showToast('צריך קודם להתחבר עם Google.', { tone: 'warning' });
      return;
    }

    setCloudSyncState((prev) => ({ ...prev, status: 'saving', message: 'מושך נתונים מהענן...' }));
    try {
      const result = await pullFromCloud(cloudUser, { force: true });
      if (!result.ok) {
        throw new Error(result.error || 'משיכה מהענן נכשלה');
      }
      if (result.applied) {
        setCloudSyncState((prev) => ({ ...prev, status: 'idle', message: 'הנתונים נמשכו מהענן' }));
        showToast(result.hadProviderConfig
          ? 'הגדרות ומפתחות API נמשכו מהענן. ייתכן שצריך לרענן.'
          : 'ההגדרות נמשכו מהענן. ייתכן שצריך לרענן.', { tone: 'success' });
      } else {
        setCloudSyncState((prev) => ({ ...prev, status: 'idle', message: result.reason || 'אין מה למשוך' }));
        showToast(result.reason || 'אין נתונים חדשים בענן.', { tone: 'info' });
      }
    } catch (error) {
      console.error('Pull from cloud failed:', error);
      setCloudSyncState((prev) => ({ ...prev, status: 'error', message: error?.message || 'משיכה מהענן נכשלה' }));
      showToast(error?.message || 'משיכה מהענן נכשלה.', { tone: 'error' });
    }
  }, [cloudAvailable, cloudUser]);

  React.useEffect(() => {
    if (!cloudUser || !editor || !cloudSyncState.autosaveEnabled || !lastEditorContentActivityAt) return undefined;

    const scheduledActivityAt = lastEditorContentActivityAt;
    const timer = window.setTimeout(() => {
      if (scheduledActivityAt !== lastEditorContentActivityAt) return;
      const latestHtml = editor.getHTML();
      if (!latestHtml || latestHtml === lastCloudSavedHtmlRef.current) return;
      persistDocumentToCloud({ reason: 'autosave', silent: true }).catch((error) => {
        console.error('Cloud autosave failed:', error);
      });
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [cloudSyncState.autosaveEnabled, cloudUser, editor, lastEditorContentActivityAt, persistDocumentToCloud]);

  // Personal Style Engine (Phase 5): delta diff trigger — מחובר ל-debounce המקומי
  // (בלי גייט cloudUser/autosave), כדי שהלמידה מהעריכות עובדת גם offline וללא חשבון.
  // רץ רק כשמנוע הסגנון מופעל; diffAfterEdit מזהה בעצמו אם אין snapshot / הטקסט זהה.
  React.useEffect(() => {
    if (!editor || !lastEditorContentActivityAt) return undefined;
    let enabled = false;
    try { enabled = getPersonalStyleProfile()?.styleEngine?.enabled === true; } catch { enabled = false; }
    if (!enabled) return undefined;

    const scheduledActivityAt = lastEditorContentActivityAt;
    const timer = window.setTimeout(() => {
      if (scheduledActivityAt !== lastEditorContentActivityAt) return;
      try {
        const diffResult = diffStyleAfterEdit({
          docId: activeDocumentSessionIdRef.current,
          currentText: String(editor.getText?.() || ''),
        });
        // Phase 6: אחרי diff מוצלח — אם נצברו מספיק עריכות (editsSinceSynthesis>=15),
        // סינתזה אוטומטית של הפרופיל מהעריכות. fire-and-forget (לא חוסם את ה-effect).
        if (diffResult && shouldAutoSynthesizeStyle()) {
          const invokeModel = (prompt) => chatWithActiveProvider(prompt, '', '', {
            skipAutomation: true,
            skipMultiModel: true,
            suppressStyleEngine: true,
            suppressPersonalStyle: true,
            agentLabel: 'Style Synthesis',
            runId: `style-synth-${Date.now()}`,
          });
          synthesizeStyleProfileUpdate({ invokeModel }).catch(() => {});
        }
      } catch {}
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [editor, lastEditorContentActivityAt]);

  const cloudStatusLabel = React.useMemo(() => {
    if (!cloudAvailable) return 'Firebase לא מוגדר';
    if (!cloudAuthReady) return 'בודק התחברות לענן...';
    const baseLabel = cloudSyncState.message || (cloudUser ? 'מחובר לענן' : 'לא מחובר לענן');
    if (!cloudSyncState.lastSavedAt) return baseLabel;
    const timeLabel = new Date(cloudSyncState.lastSavedAt).toLocaleTimeString('he-IL', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${baseLabel} · ${timeLabel}`;
  }, [cloudAuthReady, cloudAvailable, cloudSyncState.lastSavedAt, cloudSyncState.message, cloudUser]);

  const buildDesktopSavePayload = React.useCallback((preferredExtension = 'docx') => {
    const currentPreset = DOCUMENT_STYLE_PRESETS[documentStyle] || DOCUMENT_STYLE_PRESETS.academic;
    const html = normalizeDocumentExportHtml(editor?.getHTML?.() || '', { documentStyle });
    const text = editor?.getText?.() || '';
    const fontStack = String(
      wordPreferences.defaultFontStack
      || localStorage.getItem('default-font-stack')
      || wordPreferences.defaultFontFamily
      || localStorage.getItem('default-font')
      || currentPreset.fontFamily
      || ''
    ).trim();
    const fontSize = String(
      wordPreferences.defaultFontSize
      || localStorage.getItem('default-size')
      || currentPreset.fontSize
      || '12pt'
    ).trim();
    // רווח השורות של הפריסט נשמר על מיכל העורך (applyDocumentStyleToEditor) ולכן
    // לא קיים ב-getHTML() — מעבירים אותו במפורש כדי שלא יאבד בייצוא.
    const lineHeight = String(
      editor?.view?.dom?.style?.lineHeight
      || currentPreset.lineHeight
      || ''
    ).trim();

    return {
      title: inferCurrentDocumentTitle(text),
      html,
      text,
      preferredExtension,
      exportOptions: {
        documentStyle,
        fontStack,
        fontSize,
        lineHeight,
        styleCss: buildExportStyleCss({ fontStack, fontSize, lineHeight }),
        language: 'he-IL',
        disableProofing: false,
        layout: documentLayout,
      },
    };
  }, [documentLayout, documentStyle, editor, inferCurrentDocumentTitle, wordPreferences.defaultFontFamily, wordPreferences.defaultFontSize, wordPreferences.defaultFontStack]);

  const downloadBrowserDocxOrAlert = React.useCallback(async (preferredExtension = 'docx') => {
    try {
      return await downloadBrowserDocx(buildDesktopSavePayload(preferredExtension));
    } catch (error) {
      console.error('Browser DOCX export failed:', error);
      showToast(error?.message || 'לא הצלחתי לשמור את קובץ ה-Word בדפדפן.', { tone: 'error' });
      return { handled: false, canceled: false, error };
    }
  }, [buildDesktopSavePayload]);

  const buildDesktopSaveSuccessMessage = React.useCallback((result = {}, fallbackMessage = 'המסמך נשמר בהצלחה במחשב.') => {
    const savedPath = String(result?.filePath || '').trim();
    const requestedPath = String(result?.requestedFilePath || savedPath).trim();
    if (savedPath && requestedPath && savedPath !== requestedPath) {
      return `הקובץ המקורי היה פתוח או נעול, אז שמרתי עותק חדש ב:\n${savedPath}`;
    }
    return savedPath ? `המסמך נשמר בהצלחה ב:\n${savedPath}` : fallbackMessage;
  }, []);



  const handleCommand = async (cmd, value) => {
    const safeCommands = ['zoom','exportHTML','exportText','focusMode','toggleWatermark',
      'setPageColor','togglePageBorders','toggleRuler','toggleGrid','formatPainter','openFile','openCopyleaksSettings','openHelp'];
    if (!editor && !safeCommands.includes(cmd)) return;

    switch (cmd) {
      case 'openHelp':
        if (value === 'checkUpdates') {
          if (window.desktopApp?.checkForAppUpdates) {
             window.desktopApp.checkForAppUpdates();
          } else {
             // Fallback
             setFileMenuTargetTab('updates');
             setFileMenuOpen(true);
          }
        } else {
          setHelpModalTopic(value);
          setHelpModalOpen(true);
        }
        break;
      case 'openFindReplace':
        setFindReplace({ open: true, mode: value === 'replace' ? 'replace' : 'find' });
        break;
      case 'bold': editor.chain().focus().toggleBold().run(); break;
      case 'italic': editor.chain().focus().toggleItalic().run(); break;
      case 'underline': editor.chain().focus().toggleUnderline?.().run(); break;
      case 'strike': editor.chain().focus().toggleStrike().run(); break;
      case 'subscript': editor.chain().focus().toggleSubscript().run(); break;
      case 'superscript': editor.chain().focus().toggleSuperscript().run(); break;
      case 'clearFormatting': editor.chain().focus().unsetAllMarks().unsetTextAlign().run(); break;
      case 'bulletList': editor.chain().focus().toggleBulletList().run(); break;
      case 'orderedList': editor.chain().focus().toggleOrderedList().run(); break;
      case 'alignRight': editor.chain().focus().setTextAlign('right').run(); break;
      case 'alignLeft': editor.chain().focus().setTextAlign('left').run(); break;
      case 'alignCenter': editor.chain().focus().setTextAlign('center').run(); break;
      case 'alignJustify': editor.chain().focus().setTextAlign('justify').run(); break;
      case 'indent': editor.chain().focus().sinkListItem('listItem').run(); break;
      case 'outdent': editor.chain().focus().liftListItem('listItem').run(); break;
      case 'heading': editor.chain().focus().toggleHeading({ level: value }).run(); updateActiveFormats(editor); break;
      case 'paragraph': editor.chain().focus().setParagraph().run(); updateActiveFormats(editor); break;
      case 'blockquote': editor.chain().focus().toggleBlockquote().run(); updateActiveFormats(editor); break;
      case 'codeBlock': editor.chain().focus().toggleCodeBlock().run(); break;
      case 'insertHR': editor.chain().focus().setHorizontalRule().run(); break;
      case 'fontFamily': {
        editor.chain().focus().setFontFamily(value).run();
        updateActiveFormats(editor);
        break;
      }
      case 'fontSize': {
        editor.chain().focus().setFontSize(value).run();
        updateActiveFormats(editor);
        break;
      }
      case 'fontSizeInc': {
        const rawSize = String(editor.getAttributes('textStyle').fontSize || window.getComputedStyle(editor.view.dom).fontSize || '12pt');
        const next = Number(normalizeFontSizeValue(rawSize) || 12) + 1;
        editor.chain().focus().setFontSize(`${next}pt`).run();
        updateActiveFormats(editor);
        break;
      }
      case 'fontSizeDec': {
        const rawSize = String(editor.getAttributes('textStyle').fontSize || window.getComputedStyle(editor.view.dom).fontSize || '12pt');
        const next = Math.max(8, Number(normalizeFontSizeValue(rawSize) || 12) - 1);
        editor.chain().focus().setFontSize(`${next}pt`).run();
        updateActiveFormats(editor);
        break;
      }
      case 'lineHeight': editor.chain().focus().setLineHeight(value).run(); break;
      case 'applyParagraphSpacing': {
        const spacing = value || {};
        const block = getCurrentBlockElement();
        if (spacing.lineHeight) editor.chain().focus().setLineHeight(spacing.lineHeight).run();
        if (block) {
          if (spacing.before != null) block.style.marginTop = `${Math.max(0, Number(spacing.before) || 0)}pt`;
          if (spacing.after != null) block.style.marginBottom = `${Math.max(0, Number(spacing.after) || 0)}pt`;
        }
        break;
      }
      case 'applyThemeColors': {
        // ערכת צבעים אמיתית: משתני CSS + התמדה — כותרות/הדגשות במסמך צבועות דרך var(--word-blue)
        const themePrimary = String(value?.primary || '#2B579A');
        const themeAccent = String(value?.accent || '#106EBE');
        document.documentElement.style.setProperty('--word-blue', themePrimary);
        document.documentElement.style.setProperty('--word-accent', themeAccent);
        try { localStorage.setItem('wordai_theme_colors', JSON.stringify({ primary: themePrimary, accent: themeAccent, name: value?.name || '' })); } catch {}
        showToast(`ערכת הצבעים "${value?.name || ''}" הוחלה על המסמך`, { tone: 'success' });
        break;
      }
      case 'applyThemeFonts': {
        // ערכת גופנים ברמת מסמך: ברירת המחדל של העורך + התמדה (לא רק על הבחירה)
        const themeFont = String(value?.body || 'Alef');
        localStorage.setItem('default-font', themeFont);
        localStorage.setItem('default-font-stack', themeFont);
        saveWordPreferences({ ...wordPreferences, defaultFontFamily: themeFont, defaultFontStack: themeFont });
        setWordPreferences((prev) => ({ ...prev, defaultFontFamily: themeFont, defaultFontStack: themeFont }));
        applyDocumentStyleToEditor(documentStyle);
        showToast(`ערכת הגופנים "${value?.name || themeFont}" הוחלה על המסמך`, { tone: 'success' });
        break;
      }
      case 'saveDefaultTypography': {
        const currentFontStack = String(editor.getAttributes('textStyle')?.fontFamily || window.getComputedStyle(editor.view.dom).fontFamily || 'Alef').trim();
        const currentFont = normalizeStoredDefaultFont(currentFontStack);
        const currentSize = editor.getAttributes('textStyle')?.fontSize || window.getComputedStyle(editor.view.dom).fontSize || '12pt';
        localStorage.setItem('default-font', currentFont);
        localStorage.setItem('default-font-stack', currentFontStack || currentFont);
        localStorage.setItem('default-size', currentSize);
        saveWordPreferences({
          ...wordPreferences,
          defaultFontFamily: currentFont,
          defaultFontStack: currentFontStack || currentFont,
          defaultFontSize: currentSize,
        });
        setWordPreferences((prev) => ({
          ...prev,
          defaultFontFamily: currentFont,
          defaultFontStack: currentFontStack || currentFont,
          defaultFontSize: currentSize,
        }));
        applyDocumentStyleToEditor(documentStyle);
        showToast(`ברירת המחדל נשמרה: ${currentFont} · ${currentSize}`, { tone: 'success' });
        break;
      }
      case 'applyDocumentStyle':
        changeDocumentStyle(value || 'academic');
        break;

      // --- סגנונות מהירים מוגדרים ע"י המשתמש (Quick Styles) ---
      case 'applyNamedStyle': {
        const styleId = String(value || '');
        const style = getCustomStyles().find((s) => s.id === styleId);
        if (!style) break;
        applyStyleToEditor(editor, style);
        showToast(`הסגנון "${style.name}" הוחל`, { tone: 'success' });
        break;
      }
      case 'createNamedStyle': {
        const result = await requestInputDialog({
          title: 'צור סגנון מהבחירה',
          fields: [
            { id: 'name', label: 'שם הסגנון', placeholder: 'למשל: כותרת משנה' },
          ],
          confirmLabel: 'צור סגנון',
        });
        const styleName = String(result?.name || '').trim();
        if (!styleName) break;
        const built = buildStyleFromEditor(editor);
        const existingList = getCustomStyles();
        const existing = existingList.find((s) => s.name === styleName);
        const newStyle = { id: existing?.id || `style_${Date.now()}`, name: styleName, ...built };
        const nextList = existing
          ? existingList.map((s) => (s.id === existing.id ? newStyle : s))
          : [...existingList, newStyle];
        saveCustomStyles(nextList);
        window.dispatchEvent(new Event('wordflow:styles-changed'));
        showToast(`הסגנון "${styleName}" נשמר`, { tone: 'success' });
        break;
      }
      case 'deleteNamedStyle': {
        const delId = String(value || '');
        const list = getCustomStyles();
        const target = list.find((s) => s.id === delId);
        saveCustomStyles(list.filter((s) => s.id !== delId));
        window.dispatchEvent(new Event('wordflow:styles-changed'));
        if (target) showToast(`הסגנון "${target.name}" נמחק`, { tone: 'info' });
        break;
      }

      // --- כיווניות RTL / LTR ברמת הבלוק ---
      case 'setDirRTL': {
        editor.chain().focus().updateAttributes('paragraph', { dir: 'rtl' }).run();
        editor.chain().focus().updateAttributes('heading', { dir: 'rtl' }).run();
        break;
      }
      case 'setDirLTR': {
        editor.chain().focus().updateAttributes('paragraph', { dir: 'ltr' }).run();
        editor.chain().focus().updateAttributes('heading', { dir: 'ltr' }).run();
        break;
      }

      // --- מברשת עיצוב ---
      case 'formatPainter': {
        if (!formatPainterRef.current.copyFormat) return;
        if (formatPainterActive) {
          formatPainterRef.current.applyFormat?.();
          setFormatPainterActive(false);
        } else {
          formatPainterRef.current.copyFormat?.();
          setFormatPainterActive(true);
        }
        break;
      }

      case 'insertTable':
        editor.chain().focus().insertTable({ rows: value?.rows ?? 3, cols: value?.cols ?? 3, withHeaderRow: true }).run();
        break;
      case 'insertImage': editor.chain().focus().setImage({ src: value }).run(); break;
      case 'insertImageUrl': {
        const result = await requestInputDialog({
          title: 'הוספת תמונה מקישור',
          description: 'הדבק כתובת תמונה מלאה.',
          fields: [
            { id: 'url', label: 'כתובת תמונה', placeholder: 'https://example.com/image.png' },
          ],
          confirmLabel: 'הוסף תמונה',
        });
        if (result?.url) editor.chain().focus().setImage({ src: String(result.url).trim() }).run();
        break;
      }
      case 'insertLink': {
        const href = sanitizeLinkUrl(value);
        if (href) editor.chain().focus().setLink({ href }).run();
        break;
      }
      case 'insertLinkDialog': {
        const result = await requestInputDialog({
          title: 'הוספת קישור מהיר',
          description: 'הדבק כתובת. אפשר להגדיר גם טקסט להצגה במקום הכתובת.',
          fields: [
            { id: 'url', label: 'כתובת URL', placeholder: 'https://...' },
            { id: 'text', label: 'טקסט להצגה (אופציונלי)', placeholder: 'למשל: מקור אקדמי מלא' },
          ],
          confirmLabel: 'הוסף קישור',
        });
        const href = sanitizeLinkUrl(result?.url || '');
        const text = String(result?.text || '').trim();
        if (!href) break;
        if (!editor.state.selection.empty) {
          editor.chain().focus().setLink({ href }).run();
          break;
        }
        const content = text || href;
        editor.chain().focus().insertContent(`<a href="${escHtml(href)}" target="_blank" rel="noopener noreferrer">${escHtml(content)}</a>`).run();
        break;
      }
      case 'insertBookmarkDialog': {
        const result = await requestInputDialog({
          title: 'יצירת סימניה',
          fields: [
            { id: 'name', label: 'שם הסימניה', placeholder: 'למשל: מבוא או מקורות' },
          ],
          confirmLabel: 'צור סימניה',
        });
        if (result?.name) editor.chain().focus().insertContent(`<a id="${escHtml(String(result.name).trim())}" name="${escHtml(String(result.name).trim())}" style="color:inherit;text-decoration:none;">⚓ ${escHtml(String(result.name).trim())}</a>`).run();
        break;
      }
      case 'openGoogleSearch': {
        const config = getProviderConfig();
        const googleUrlTemplate = String(getToolLinksConfig(config)?.googleSearch?.url || '');
        if (googleUrlTemplate && !googleUrlTemplate.includes('{query}')) {
          const url = buildExternalToolUrl('googleSearch', '', config);
          if (url) openExternalLink(url);
          break;
        }

        const initial = String(selectedText || currentBlockText || '').trim();
        const result = await requestInputDialog({
          title: 'חיפוש בגוגל',
          fields: [
            { id: 'query', label: 'מה לחפש?', placeholder: 'נושא, מושג או שאלה', value: initial },
          ],
          confirmLabel: 'פתח חיפוש',
        });
        if (result?.query) {
          const url = buildExternalToolUrl('googleSearch', String(result.query).trim(), config);
          if (url) openExternalLink(url);
        }
        break;
      }
      case 'searchScholar': {
        const config = getProviderConfig();
        const scholarUrlTemplate = String(getToolLinksConfig(config)?.scholar?.url || '');
        if (scholarUrlTemplate && !scholarUrlTemplate.includes('{query}')) {
          const url = buildExternalToolUrl('scholar', '', config);
          if (url) openExternalLink(url);
          break;
        }

        const initial = String(selectedText || currentBlockText || '').trim();
        const result = await requestInputDialog({
          title: 'חיפוש ב-Google Scholar',
          description: 'אפשר לחפש נושא, מאמר, חוקר או מילות מפתח.',
          fields: [
            { id: 'query', label: 'מונח חיפוש', placeholder: 'למשל: legal writing pedagogy', value: initial },
          ],
          confirmLabel: 'פתח Scholar',
        });
        if (result?.query) {
          const url = buildExternalToolUrl('scholar', String(result.query).trim(), config);
          if (url) openExternalLink(url);
        }
        break;
      }
      case 'openOrbit': {
        const url = buildExternalToolUrl('orbit', '', getProviderConfig());
        if (url) openExternalLink(url);
        break;
      }
      case 'openModelHub': {
        const url = buildExternalToolUrl('modelHub', '', getProviderConfig());
        if (url) openExternalLink(url);
        break;
      }
      case 'openCopyleaksDetector': {
        openCopyleaksDetector(typeof value === 'string' ? value : value?.source);
        break;
      }
      case 'openCopyleaksSettings': {
        openCopyleaksSettingsPanel();
        break;
      }
      case 'setColor': editor.chain().focus().setColor(value).run(); break;
      case 'setHighlight': editor.chain().focus().toggleHighlight({ color: value }).run(); break;
      case 'insertTaskList': editor.chain().focus().toggleTaskList().run(); break;
      case 'pageBreak':
        editor.chain().focus().setPageBreak().run();
        break;
      case 'insertDate': {
        const d = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
        editor.chain().focus().insertContent(d).run(); break;
      }
      case 'insertMath': {
        const mathResult = await requestInputDialog({
          title: 'הוספת משוואה',
          description: 'הקלד נוסחה בתחביר LaTeX, למשל: x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}',
          fields: [{ id: 'latex', label: 'נוסחה (LaTeX)', type: 'textarea', placeholder: 'a^2 + b^2 = c^2' }],
          confirmLabel: 'הוסף משוואה',
        });
        const latexInput = String(mathResult?.latex || '').trim();
        if (!latexInput) break;
        editor.chain().focus().insertMathNode(latexInput).run();
        break;
      }
      case 'insertSymbol': editor.chain().focus().insertContent(value).run(); break;
      case 'addComment': {
        const { from, to, empty } = editor.state.selection;
        if (empty) { showToast('בחר טקסט כדי להוסיף הערה.', { tone: 'warning' }); break; }
        const quote = editor.state.doc.textBetween(from, to, ' ').slice(0, 120);
        const id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        editor.chain().focus().setComment(id).run();
        setComments((prev) => [...prev, { id, quote, body: '', replies: [], resolved: false }]);
        setActiveCommentId(id);
        setCommentsPanelOpen(true);
        setTrackPanelOpen(false);
        break;
      }
      case 'removeComment': {
        const attrs = editor.getAttributes('comment') || {};
        const id = attrs.commentId;
        if (id) {
          removeCommentById(editor, id);
          setComments((prev) => prev.filter((c) => c.id !== id));
        } else {
          editor.chain().focus().unsetHighlight().run();
        }
        break;
      }

      case 'copySelection': {
        const { from, to, empty } = editor.state.selection;
        if (empty) {
          showToast('בחר טקסט להעתקה.', { tone: 'warning' });
          break;
        }
        const text = editor.state.doc.textBetween(from, to, ' ');
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          document.execCommand('copy');
        }
        break;
      }
      case 'copyCurrentParagraph': {
        const paragraphText = String(currentBlockText || '').trim();
        if (!paragraphText) {
          showToast('לא זוהתה פסקה פעילה להעתקה.', { tone: 'warning' });
          break;
        }
        const copied = await copyPlainTextToClipboard(paragraphText);
        if (!copied) {
          showToast('לא הצלחתי להעתיק את הפסקה הפעילה.', { tone: 'error' });
          break;
        }
        showToast('הפסקה הפעילה הועתקה ללוח.', { tone: 'success' });
        break;
      }
      case 'cutSelection': {
        const { from, to, empty } = editor.state.selection;
        if (empty) {
          showToast('בחר טקסט לגזירה.', { tone: 'warning' });
          break;
        }
        const text = editor.state.doc.textBetween(from, to, ' ');
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          document.execCommand('cut');
        }
        editor.chain().focus().deleteSelection().run();
        break;
      }
      case 'pasteClipboard': {
        try {
          const text = await navigator.clipboard.readText();
          if (text) editor.chain().focus().insertContent(escHtml(text).replace(/\n/g, '<br />')).run();
        } catch {
          showToast('הדבקה אוטומטית נחסמה על ידי המערכת. אפשר להשתמש גם ב־Ctrl+V.', { tone: 'warning' });
        }
        break;
      }
      case 'openAssignmentScaffold':
        enterStudioMode('assignment-scaffold');
        break;
      case 'toggleEvidencePanel':
        setEvidencePanelOpen((v) => !v);
        break;
      case 'refreshAssignmentEvidence': {
        // מריץ את ההתאמה מחדש מול החומרים העדכניים — שימושי אחרי הוספת מקור
        // באמצע הכתיבה, בלי לחזור לסטודיו ולבנות שלד מחדש.
        const current = readScaffold();
        if (!current?.spec) {
          showToast('אין מטלה פעילה.', { tone: 'warning' });
          break;
        }
        showToast('מחפש ראיות בחומרים שלך…');
        try {
          const { findEvidenceForSpec } = await import('./services/evidenceMatchService');
          const { saveScaffold } = await import('./services/assignmentScaffoldStore');
          // בלי k מפורש — DEFAULT_EVIDENCE_K, אותו ערך שה-Studio וההרנס מריצים.
          const result = await findEvidenceForSpec(current.spec, {});
          saveScaffold({
            spec: current.spec,
            evidence: result.bySection,
            gaps: result.gaps,
            mode: result.mode,
            title: current.title,
          });
          setEvidencePanelOpen(true);
          const supported = current.spec.sections.length - result.gaps.length;
          showToast(`נמצאו ראיות ל-${supported} מתוך ${current.spec.sections.length} סעיפים.`, { tone: 'success' });
        } catch (err) {
          showToast(`חיפוש הראיות נכשל: ${String(err?.message || err)}`, { tone: 'error' });
        }
        break;
      }
      case 'finishAssignment': {
        const { clearScaffold } = await import('./services/assignmentScaffoldStore');
        clearScaffold();
        showToast('המטלה נסגרה. המסמך נשאר כמו שהוא.', { tone: 'success' });
        break;
      }
      case 'wordCount':
      case 'charCount': {
        // דיאלוג סטטיסטיקות מלא (כמו "ספירת מילים" של Word)
        const txt = editor.getText();
        const trimmed = txt.trim();
        const words = trimmed ? trimmed.split(/\s+/).length : 0;
        const charsWithSpaces = txt.replace(/\n/g, '').length;
        const charsNoSpaces = txt.replace(/\s/g, '').length;
        let paragraphs = 0;
        let lines = 0;
        editor.state.doc.descendants((node) => {
          if (node.type.name === 'paragraph' || node.type.name === 'heading') {
            if (node.textContent.trim()) paragraphs += 1;
            lines += Math.max(1, node.textContent.split('\n').length);
            return false;
          }
          return true;
        });
        await showConfirm(
          [
            `מילים: ${words.toLocaleString('he-IL')}`,
            `תווים (ללא רווחים): ${charsNoSpaces.toLocaleString('he-IL')}`,
            `תווים (כולל רווחים): ${charsWithSpaces.toLocaleString('he-IL')}`,
            `פסקאות: ${paragraphs.toLocaleString('he-IL')}`,
            `שורות (הערכה): ${lines.toLocaleString('he-IL')}`,
            `עמודים: ${pageCount.toLocaleString('he-IL')}`,
          ].join('\n'),
          { title: 'סטטיסטיקת מסמך', confirmLabel: 'סגור', cancelLabel: '' },
        );
        break;
      }

      // --- תוכן עניינים חי (node שמתעדכן אוטומטית לפי הכותרות) ---
      case 'generateTOC': {
        let hasHeading = false;
        let hasToc = false;
        editor.state.doc.descendants((node) => {
          if (node.type.name === 'heading' && node.textContent.trim()) hasHeading = true;
          if (node.type.name === 'tocNode') hasToc = true;
          return true;
        });
        if (hasToc) {
          showToast('תוכן העניינים כבר קיים ומתעדכן אוטומטית לפי הכותרות.', { tone: 'info' });
          break;
        }
        if (!hasHeading) { showToast('לא נמצאו כותרות במסמך', { tone: 'warning' }); break; }
        editor.chain().focus().insertTocNode().run();
        showToast('תוכן עניינים חי נוסף — מתעדכן אוטומטית וקליק על שורה קופץ לכותרת.', { tone: 'success' });
        break;
      }

      // --- הערת שוליים ---
      case 'insertFootnote': {
        const result = await requestInputDialog({
          title: 'הוספת הערת שוליים',
          fields: [
            { id: 'footnote', label: 'טקסט הערת שוליים', placeholder: 'הקלד כאן את ההערה' },
          ],
          confirmLabel: 'הוסף הערה',
        });
        const footnoteText = String(result?.footnote || '').trim();
        if (!footnoteText) break;
        const existingFootnotes = document.querySelectorAll('.footnote-ref').length;
        const num = existingFootnotes + 1;
        const safeFnText = escHtml(footnoteText);
        editor.chain().focus().insertContent(
          `<sup class="footnote-ref" id="fnref-${num}" style="color:#2B579A;cursor:pointer" title="${safeFnText}">[${num}]</sup>`
        ).run();
        // הוסף הערה בתחתית הדף
        editor.chain().focus().insertContentAt(
          editor.state.doc.content.size,
          `<p><small id="fn-${num}"><sup>${num}</sup> ${safeFnText}</small></p>`
        ).run();
        break;
      }

      case 'aiSpellCheck': {
        // סריקת איות/דקדוק אמיתית: מריצים את סוכן ה'תיקון' על הבחירה (או על כל המסמך),
        // והתוצאה מוצגת כהצעת AI עם קבל/דחה (התשתית הקיימת של AiSuggestionMark).
        const { empty: selEmpty } = editor.state.selection;
        const docTextLength = editor.getText().length;
        if (selEmpty && docTextLength > 12000) {
          showToast('המסמך ארוך — סמן קטע (עד ~12,000 תווים) והרץ שוב את בדיקת האיות.', { tone: 'warning' });
          break;
        }
        if (selEmpty && !docTextLength) {
          showToast('המסמך ריק — אין מה לבדוק.', { tone: 'info' });
          break;
        }
        if (selEmpty) {
          const confirmed = await showConfirm('להריץ בדיקת איות ודקדוק על כל המסמך? התיקונים יוצגו כהצעה עם אישור/דחייה.', {
            title: 'בדיקת איות AI',
            confirmLabel: 'בדוק את כל המסמך',
          });
          if (!confirmed) break;
          editor.chain().focus().selectAll().run();
        }
        showToast('בודק איות ודקדוק...', { tone: 'info' });
        try {
          const { applyInlineAi } = await import('./services/aiService');
          await applyInlineAi(editor, 'fix');
          showToast('הבדיקה הושלמה — אשר או דחה את התיקון בתפריט הצף.', { tone: 'success' });
        } catch (error) {
          showToast(`בדיקת האיות נכשלה: ${error?.message || 'שגיאה'}`, { tone: 'error' });
        }
        break;
      }
      case 'insertCrossReference': {
        // דיאלוג הפניה מקושרת אמיתי: בחירת כותרת יעד → node חי שמתעדכן עם הכותרת
        const availableHeadings = [];
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'heading' && node.textContent.trim()) {
            availableHeadings.push({ pos, text: node.textContent.trim(), refId: node.attrs.refId || null });
          }
        });
        if (!availableHeadings.length) {
          showToast('אין כותרות במסמך — הוסף כותרת (כותרת 1/2/3) ואז צור הפניה.', { tone: 'warning' });
          break;
        }
        const crossRefResult = await requestInputDialog({
          title: 'הפניה מקושרת',
          description: 'בחר כותרת יעד — ההפניה תציג את שם הכותרת ותתעדכן אם הכותרת תשתנה.',
          fields: [{
            id: 'target',
            label: 'כותרת יעד',
            type: 'select',
            value: '0',
            options: availableHeadings.map((h, idx) => ({ value: String(idx), label: h.text.slice(0, 80) })),
          }],
          confirmLabel: 'הוסף הפניה',
        });
        if (!crossRefResult) break;
        const chosen = availableHeadings[Number(crossRefResult.target || 0)];
        if (!chosen) break;
        let refId = chosen.refId;
        if (!refId) {
          refId = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const headingNode = editor.state.doc.nodeAt(chosen.pos);
          if (headingNode) {
            editor.view.dispatch(
              editor.state.tr.setNodeMarkup(chosen.pos, undefined, { ...headingNode.attrs, refId }),
            );
          }
        }
        editor.chain().focus().insertCrossReference({ targetId: refId, fallbackLabel: chosen.text }).run();
        break;
      }

      // --- פקודות File Menu ---
      case 'newDoc': {
        if (await showConfirm('האם למחוק את תוכן המסמך הנוכחי ולפתוח מסמך חדש?', { title: 'מסמך חדש', confirmLabel: 'מחק והתחל', tone: 'danger' })) {
          const shouldShowStartExperience = isLegacyHomeEnabled() ? true : wordPreferences.showStartExperience !== false;
          clearDraftReviewState();
          editor.commands.clearContent();
          clearPersistedDraftCache();
          clearAssignmentBrief();
          saveHomeInstructions('');
          setStartScreenInstructionsResetToken((prev) => prev + 1);
          beginDocumentIdentity({ filePath: '' });
          persistActiveTemplateId('blank');
          syncPersistedAppSettings();
          setActiveTemplateId('blank');
          if (shouldShowStartExperience) {
            openHomeSafely();
          } else {
            // בלי מסך פתיחה נכנסים ישר למסמך ריק — כאן מזריקים עמוד שער ברירת-מחדל אם הופעל.
            const blankWithCover = applyDefaultCoverPage('<p></p>');
            if (blankWithCover !== '<p></p>') editor.commands.setContent(blankWithCover);
            setShowStartScreen(false);
          }
        }
        break;
      }
      case 'saveLocal': {
        await runGuardedSaveCommand(async () => {
          const html = editor.getHTML();
          const text = editor.getText();
          const title = inferCurrentDocumentTitle(text);
          persistLocalCache(html);

          if (window.desktopApp?.saveDocumentDialog) {
            const ext = String(currentFilePath || '').toLowerCase().split('.').pop();
            const canSaveDirectly = Boolean(currentFilePath) && ['html', 'htm', 'docx'].includes(ext);
            const result = await window.desktopApp.saveDocumentDialog({
              ...buildDesktopSavePayload(ext === 'html' || ext === 'htm' ? 'html' : 'docx'),
              filePath: canSaveDirectly ? currentFilePath : '',
            });

            if (result && result.ok === false) {
              showToast(result.error || 'השמירה נכשלה.', { tone: 'error' });
              return;
            }

            if (!result?.canceled && result?.filePath) {
              setCurrentFilePath(String(result.filePath));
              saveDocumentHistory({
                title: resolveDocumentHistoryTitle({
                  text,
                  filePath: result.filePath,
                  templateId: activeTemplateId || 'blank',
                  fallbackTitle: title,
                }),
                content: html,
                templateId: activeTemplateId || 'blank',
                source: 'save-local',
                filePath: String(result.filePath || ''),
              });
              showToast(buildDesktopSaveSuccessMessage(result, canSaveDirectly ? 'המסמך נשמר בהצלחה במחשב.' : 'המסמך נשמר בהצלחה.'), { tone: 'success' });
            }
            return;
          }

          const browserSaveResult = await downloadBrowserDocxOrAlert('docx');
          if (browserSaveResult?.handled && !browserSaveResult.canceled) {
            saveDocumentHistory({
              title,
              content: html,
              templateId: activeTemplateId || 'blank',
              source: 'save-local',
            });
          }
        });
        break;
      }
      case 'openFile': {
        if (window.desktopApp?.openDocumentDialog) {
          try {
            const result = await window.desktopApp.openDocumentDialog();
            if (!result?.canceled) applyImportedDocument(result);
          } catch (error) {
            showToast(error?.message || 'לא ניתן לפתוח את הקובץ שנבחר.', { tone: 'error' });
          }
          break;
        }

        const picker = document.createElement('input');
        picker.type = 'file';
        picker.accept = BROWSER_DOC_ACCEPT;
        picker.onchange = async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          try {
            // קורא Word‏ (docx), PDF, וגם טקסט/HTML דרך המחלץ של הדפדפן (כמו בדסקטופ).
            const doc = await readBrowserDocumentFile(file);
            if (doc) applyImportedDocument(doc);
          } catch (error) {
            showToast(error?.message || 'לא ניתן לפתוח את הקובץ שנבחר.', { tone: 'error' });
          }
        };
        picker.click();
        break;
      }
      case 'saveAs': {
        await runGuardedSaveCommand(async () => {
          const html = editor.getHTML();
          const title = inferCurrentDocumentTitle(editor.getText());

          if (window.desktopApp?.saveDocumentDialog) {
            const result = await window.desktopApp.saveDocumentDialog(buildDesktopSavePayload('docx'));

            if (result && result.ok === false) {
              showToast(result.error || 'השמירה נכשלה.', { tone: 'error' });
              return;
            }

            if (!result?.canceled) {
              setCurrentFilePath(String(result.filePath || ''));
              persistLocalCache(html);
              saveDocumentHistory({
                title: resolveDocumentHistoryTitle({
                  text: editor.getText(),
                  filePath: result.filePath,
                  templateId: activeTemplateId || 'blank',
                  fallbackTitle: title,
                }),
                content: html,
                templateId: activeTemplateId || 'blank',
                source: 'save-as',
                filePath: String(result.filePath || ''),
              });
              showToast(buildDesktopSaveSuccessMessage(result, 'המסמך נשמר בהצלחה.'), { tone: 'success' });
            }
            return;
          }

          const browserSaveResult = await downloadBrowserDocxOrAlert('docx');
          if (browserSaveResult?.handled && !browserSaveResult.canceled) {
            persistLocalCache(html);
            saveDocumentHistory({
              title,
              content: html,
              templateId: activeTemplateId || 'blank',
              source: 'save-as',
            });
          }
        });
        break;
      }
      case 'exportDocx': {
        await runGuardedSaveCommand(async () => {
          if (window.desktopApp?.saveDocumentDialog) {
            const result = await window.desktopApp.saveDocumentDialog(buildDesktopSavePayload('docx'));
            if (result && result.ok === false) {
              showToast(result.error || 'השמירה נכשלה.', { tone: 'error' });
            }
            return;
          }
          await downloadBrowserDocxOrAlert('docx');
        });
        break;
      }
      case 'print': {
        setFileMenuOpen(false);
        window.setTimeout(() => window.print(), 60);
        break;
      }

      case 'zoom': setZoom(value); break;
      case 'focusMode': setSidebarOpen(false); break;
      case 'toggleWatermark': {
        const el = document.querySelector('.ProseMirror');
        if (documentLayout.watermark) {
          // סימן מים קיים — הסרה
          if (el) el.style.backgroundImage = '';
          setDocumentLayout((prev) => ({ ...prev, watermark: null }));
          showToast('סימן המים הוסר', { tone: 'info' });
          break;
        }
        const wmResult = await requestInputDialog({
          title: 'סימן מים',
          description: 'הטקסט יופיע באלכסון על כל עמוד, וגם בקובץ ה-Word המיוצא.',
          fields: [
            { id: 'text', label: 'טקסט סימן המים', value: 'טיוטה', placeholder: 'טיוטה / סודי / עותק' },
            {
              id: 'color', label: 'צבע', type: 'select', value: '#C8C8C8',
              options: [
                { value: '#C8C8C8', label: 'אפור בהיר' },
                { value: '#FCA5A5', label: 'אדום בהיר' },
                { value: '#93C5FD', label: 'כחול בהיר' },
              ],
            },
          ],
          confirmLabel: 'החל סימן מים',
        });
        const wmText = String(wmResult?.text || '').trim();
        if (!wmText) break;
        const wmColor = wmResult.color || '#C8C8C8';
        if (el) {
          const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><text x='200' y='200' font-size='48' fill='${wmColor}' fill-opacity='0.35' text-anchor='middle' transform='rotate(-45 200 200)' font-family='Arial'>${wmText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/'/g,'')}</text></svg>`;
          el.style.backgroundImage = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
          el.style.backgroundRepeat = 'repeat';
        }
        setDocumentLayout((prev) => ({ ...prev, watermark: { text: wmText, color: wmColor } }));
        break;
      }
      case 'setPageColor': {
        const el = document.querySelector('.ProseMirror');
        if (el) {
          el.dataset.customBackground = value;
          el.style.background = value;
        }
        setDocumentLayout((prev) => ({ ...prev, pageColor: value || '' }));
        break;
      }
      case 'togglePageBorders': {
        const el = document.querySelector('.ProseMirror');
        if (documentLayout.pageBorder) {
          if (el) { el.dataset.customBorder = ''; el.style.border = ''; }
          setDocumentLayout((prev) => ({ ...prev, pageBorder: null }));
          showToast('גבולות העמוד הוסרו', { tone: 'info' });
          break;
        }
        const pbResult = await requestInputDialog({
          title: 'גבולות עמוד',
          description: 'הגבול יופיע סביב העמוד וגם בקובץ ה-Word המיוצא.',
          fields: [
            {
              id: 'color', label: 'צבע', type: 'select', value: '#2B579A',
              options: [
                { value: '#2B579A', label: 'כחול Word' },
                { value: '#000000', label: 'שחור' },
                { value: '#6B7280', label: 'אפור' },
                { value: '#B91C1C', label: 'אדום' },
              ],
            },
            {
              id: 'width', label: 'עובי', type: 'select', value: '1',
              options: [
                { value: '0.5', label: 'דק (½ נק׳)' },
                { value: '1', label: 'רגיל (1 נק׳)' },
                { value: '2', label: 'עבה (2 נק׳)' },
                { value: '3', label: 'עבה מאוד (3 נק׳)' },
              ],
            },
          ],
          confirmLabel: 'החל גבול',
        });
        if (!pbResult) break;
        const pbColor = pbResult.color || '#2B579A';
        const pbWidth = Number(pbResult.width) || 1;
        if (el) {
          const cssBorder = `${Math.max(1, Math.round(pbWidth * 1.33))}px solid ${pbColor}`;
          el.dataset.customBorder = cssBorder;
          el.style.border = cssBorder;
        }
        setDocumentLayout((prev) => ({ ...prev, pageBorder: { style: 'single', color: pbColor, sizePt: pbWidth } }));
        break;
      }
      case 'exportHTML': {
        const exportCss = String(buildDesktopSavePayload('html')?.exportOptions?.styleCss || EXPORT_DOC_STYLES);
        const htmlCtx = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8" /><title>WordFlow AI Document</title>${exportCss}</head><body>${normalizeDocumentExportHtml(editor.getHTML(), { documentStyle })}</body></html>`;
        await downloadFile(htmlCtx, 'my-document.html', 'text/html');
        break;
      }
      case 'exportText':
        await downloadFile(editor.getText(), 'my-document.txt', 'text/plain');
        break;

      /* ---- פקודות פריסה ---- */
      case 'setMargins': {
        const marginMap = { normal: '2.54cm', narrow: '1.27cm', moderate: '1.91cm', wide: '3.81cm', centered: '5cm' };
        const m = marginMap[value] || '2.54cm';
        const page = document.querySelector('.ProseMirror');
        if (page) {
          page.dataset.customPadding = m;
          page.style.padding = m;
        }
        setDocumentLayout((prev) => ({ ...prev, margins: marginMap[value] ? value : 'normal' }));
        break;
      }
      case 'setOrientation': {
        setDocumentLayout((prev) => ({ ...prev, orientation: value === 'landscape' ? 'landscape' : 'portrait' }));
        const page2 = document.querySelector('.ProseMirror');
        if (!page2) break;
        if (value === 'landscape') {
          page2.dataset.customWidth = '29.7cm';
          page2.dataset.customMinHeight = '21cm';
        } else {
          page2.dataset.customWidth = '21cm';
          page2.dataset.customMinHeight = '29.7cm';
        }
        if ((page2.dataset.viewMode || viewMode) === 'print') {
          applyDocumentStyleToEditor(documentStyle);
        }
        break;
      }
      case 'setPageSize': {
        const sizes = { a4: ['21cm','29.7cm'], a3: ['29.7cm','42cm'], letter: ['21.59cm','27.94cm'], legal: ['21.59cm','35.56cm'] };
        const [pw, ph] = sizes[value] || sizes.a4;
        setDocumentLayout((prev) => ({ ...prev, pageSize: sizes[value] ? value : 'a4' }));
        const pg = document.querySelector('.ProseMirror');
        if (pg) {
          pg.dataset.customWidth = pw;
          pg.dataset.customMinHeight = ph;
          if ((pg.dataset.viewMode || viewMode) === 'print') {
            applyDocumentStyleToEditor(documentStyle);
          }
        }
        break;
      }
      case 'setColumns': {
        const pg2 = document.querySelector('.ProseMirror');
        if (pg2) { pg2.style.columnCount = value > 1 ? String(value) : ''; pg2.style.columnGap = value > 1 ? '2em' : ''; }
        break;
      }
      case 'setMarginBefore': {
        const block = getCurrentBlockElement();
        if (block) block.style.marginRight = `${Math.max(0, Number(value) || 0)}cm`;
        break;
      }
      case 'setMarginAfter': {
        const block = getCurrentBlockElement();
        if (block) block.style.marginLeft = `${Math.max(0, Number(value) || 0)}cm`;
        break;
      }
      case 'setSpacingBefore': {
        const block = getCurrentBlockElement();
        if (block) block.style.marginTop = `${Math.max(0, Number(value) || 0)}pt`;
        break;
      }
      case 'setSpacingAfter': {
        const block = getCurrentBlockElement();
        if (block) block.style.marginBottom = `${Math.max(0, Number(value) || 0)}pt`;
        break;
      }

      /* ---- פקודות הוספה ---- */
      case 'insertHTML':
        editor.chain().focus().insertContent(value).run();
        break;
      case 'insertBookmark':
        editor.chain().focus().insertContent(`<a id="${value}" name="${value}" style="color:inherit;text-decoration:none;">⚓ ${value}</a>`).run();
        break;
      case 'insertSignature':
        editor.chain().focus().insertContent(
          `<div style="margin-top:40px;border-top:1px solid #333;width:200px;padding-top:4px;font-size:12px;color:#555;">חתימה</div>`
        ).run();
        break;
      case 'insertHeader': {
        // כותרת עליונה = state ברמת מסמך (מוצג כ-chrome על העמוד + מיוצא כ-Header אמיתי ב-DOCX)
        const headerTextMap = {
          'ריק': '',
          'שם מסמך': inferCurrentDocumentTitle(editor?.getText?.() || '') || 'כותרת מסמך',
          'תאריך + שם': `${inferCurrentDocumentTitle(editor?.getText?.() || '') || 'שם המסמך'} · ${new Date().toLocaleDateString('he-IL')}`,
          'מספר עמוד': '',
        };
        if (value === 'הסר') {
          setDocumentLayout((prev) => ({ ...prev, header: null }));
          showToast('הכותרת העליונה הוסרה', { tone: 'info' });
          break;
        }
        setDocumentLayout((prev) => ({
          ...prev,
          header: { preset: value || 'ריק', text: headerTextMap[value] ?? '', pageNumber: value === 'מספר עמוד' },
        }));
        showToast('כותרת עליונה הוגדרה — תופיע בכל עמוד ובקובץ ה-Word המיוצא', { tone: 'success' });
        break;
      }
      case 'insertFooter': {
        const footerTextMap = {
          'ריק': '',
          'שם מסמך': inferCurrentDocumentTitle(editor?.getText?.() || '') || 'שם המסמך',
          'מספר עמוד': '',
          'תאריך': new Date().toLocaleDateString('he-IL'),
        };
        if (value === 'הסר') {
          setDocumentLayout((prev) => ({ ...prev, footer: null, pageNumbers: false }));
          showToast('הכותרת התחתונה הוסרה', { tone: 'info' });
          break;
        }
        setDocumentLayout((prev) => ({
          ...prev,
          footer: { preset: value || 'ריק', text: footerTextMap[value] ?? '', pageNumber: value === 'מספר עמוד' },
          pageNumbers: prev.pageNumbers || value === 'מספר עמוד',
        }));
        showToast('כותרת תחתונה הוגדרה — תופיע בכל עמוד ובקובץ ה-Word המיוצא', { tone: 'success' });
        break;
      }
      case 'insertPageNum':
        // שדה חי בעורך + מספרי עמוד אמיתיים ב-Footer של קובץ ה-Word המיוצא
        editor.chain().focus().insertPageNumberField().run();
        setDocumentLayout((prev) => ({ ...prev, pageNumbers: true }));
        break;
      case 'insertTextBox': {
        const tbMap = {
          'פשוט': 'border:1px solid #ccc;padding:12px;margin:8px 0;min-height:60px',
          'עם כותרת': 'border:1px solid #2B579A;padding:12px;margin:8px 0;min-height:60px',
          'ציטוט': 'border-right:4px solid #2B579A;padding:8px 16px;margin:8px 0;color:#555;font-style:italic',
          'הדגשה': 'background:#f3f4f6;border:none;padding:12px;margin:8px 0;border-radius:4px',
        };
        editor.chain().focus().insertContent(`<div style="${tbMap[value] || tbMap['פשוט']}">לחץ לעריכה...</div>`).run();
        break;
      }
      case 'insertWordArt': {
        const { text: waText, style: waStyle } = value || {};
        if (waText && waStyle) editor.chain().focus().insertContent(`<span style="${waStyle}">${waText}</span>`).run();
        break;
      }
      case 'insertSmartArt': {
        const result = await requestInputDialog({
          title: 'יצירת SmartArt',
          description: 'הפרד בין הפריטים בפסיקים.',
          fields: [
            { id: 'items', label: 'פריטים', placeholder: 'למשל: מבוא, שיטה, ממצאים, מסקנה' },
          ],
          confirmLabel: 'צור מבנה',
        });
        const items = String(result?.items || '').split(',').map(s => s.trim()).filter(Boolean);
        if (!items.length) break;
        const smartMap = {
          list: `<ul style="padding-right:20px">${items.map(i => `<li>${i}</li>`).join('')}</ul>`,
          process: `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${items.map((it, idx) => `<span style="background:#2B579A;color:white;padding:6px 12px;border-radius:4px">${it}</span>${idx < items.length - 1 ? '<span>→</span>' : ''}`).join('')}</div>`,
          cycle: `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${items.map((it, idx) => `<span style="background:#217346;color:white;padding:6px 12px;border-radius:20px">${it}</span>${idx < items.length - 1 ? '<span>↻</span>' : ''}`).join('')}</div>`,
          hierarchy: `<div style="text-align:center"><div style="background:#2B579A;color:white;padding:6px 20px;display:inline-block;margin-bottom:12px">${items[0] || ''}</div><div style="display:flex;gap:12px;justify-content:center">${items.slice(1).map(it => `<div style="background:#DEECF9;border:1px solid #2B579A;padding:6px 12px">${it}</div>`).join('')}</div></div>`,
          matrix: `<table style="border-collapse:collapse;width:100%">${items.map((it, i) => i % 2 === 0 ? `<tr><td style="border:1px solid #ccc;padding:8px;background:#f3f4f6">${it}</td><td style="border:1px solid #ccc;padding:8px">${items[i + 1] || ''}</td></tr>` : '').join('')}</table>`,
        };
        editor.chain().focus().insertContent(smartMap[value] || smartMap.list).run();
        break;
      }
      case 'insertChart': {
        const result = await requestInputDialog({
          title: 'בניית תרשים',
          description: 'הקלד זוגות של שם וערך בפורמט שם:ערך, מופרדים בפסיקים.',
          fields: [
            { id: 'chartData', label: 'נתונים', placeholder: 'ינואר:45, פברואר:72, מרץ:60' },
          ],
          confirmLabel: 'צור תרשים',
        });
        const chartData = String(result?.chartData || '');
        const rows = chartData.split(',').map(r => r.trim().split(':').map(s => s.trim())).filter(r => r.length === 2);
        if (!rows.length) break;
        const chartType = ['bar', 'line', 'pie', 'table'].includes(value) ? value : 'bar';
        const values = rows.map(([, v]) => parseFloat(v) || 0);
        const max = Math.max(...values) || 1;
        const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
        let chartHtml = '';
        if (chartType === 'table') {
          chartHtml = `<table><tr><th>שם</th><th>ערך</th></tr>${rows.map(([lbl, val]) => `<tr><td>${esc(lbl)}</td><td>${esc(val)}</td></tr>`).join('')}</table>`;
        } else if (chartType === 'pie') {
          // עוגה: SVG conic דרך stroke-dasharray על עיגולים
          const total = values.reduce((a, b) => a + b, 0) || 1;
          const colors = ['#2B579A', '#E97132', '#196B24', '#0F9ED5', '#A02B93', '#DE9ED8', '#4EA72E', '#C00000'];
          let acc = 0;
          const segments = rows.map(([lbl, val], i) => {
            const frac = (parseFloat(val) || 0) / total;
            const seg = `<circle r="15.9155" cx="21" cy="21" fill="transparent" stroke="${colors[i % colors.length]}" stroke-width="10" stroke-dasharray="${(frac * 100).toFixed(2)} ${(100 - frac * 100).toFixed(2)}" stroke-dashoffset="${(25 - acc * 100).toFixed(2)}"></circle>`;
            acc += frac;
            return seg;
          }).join('');
          const legendText = rows.map(([lbl, val]) => `${lbl}: ${val}`).join(' · ');
          const pieSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 42 42"><g transform="rotate(-90 21 21)">${segments}</g></svg>`;
          // SVG גולמי לא שורד את הסכימה של TipTap — עוטפים כתמונת data-URI
          chartHtml = `<img src="data:image/svg+xml;utf8,${encodeURIComponent(pieSvg)}" alt="תרשים עוגה" /><p style="text-align:center;font-size:12px;color:#475569">${esc(legendText)}</p>`;
        } else if (chartType === 'line') {
          const w = 320; const h = 140; const pad = 20;
          const step = rows.length > 1 ? (w - pad * 2) / (rows.length - 1) : 0;
          const points = values.map((v, i) => `${pad + i * step},${h - pad - ((v / max) * (h - pad * 2))}`).join(' ');
          const labels = rows.map(([lbl], i) => `<text x="${pad + i * step}" y="${h - 4}" font-size="9" text-anchor="middle" fill="#475569">${esc(lbl).slice(0, 8)}</text>`).join('');
          const lineSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><polyline points="${points}" fill="none" stroke="#2B579A" stroke-width="2"/>${values.map((v, i) => `<circle cx="${pad + i * step}" cy="${h - pad - ((v / max) * (h - pad * 2))}" r="3" fill="#2B579A"/>`).join('')}${labels}</svg>`;
          chartHtml = `<img src="data:image/svg+xml;utf8,${encodeURIComponent(lineSvg)}" alt="תרשים קווים" />`;
        } else {
          chartHtml = `<div style="padding:12px;background:#f9f9f9;border:1px solid #ddd;border-radius:4px;margin:8px 0"><div style="font-weight:bold;margin-bottom:8px;text-align:center">תרשים</div>${rows.map(([lbl, val]) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span style="width:70px;font-size:12px;text-align:right">${esc(lbl)}</span><div style="flex:1;background:#e5e7eb;border-radius:2px;height:18px;position:relative"><div style="width:${Math.round(((parseFloat(val) || 0) / max) * 100)}%;background:#2B579A;height:100%;border-radius:2px;display:flex;align-items:center;padding-right:4px"><span style="font-size:11px;color:white">${esc(val)}</span></div></div></div>`).join('')}</div>`;
        }
        editor.chain().focus().insertContent(chartHtml).run();
        break;
      }

      /* ---- פקודות עמודים ---- */
      case 'insertCoverPage': {
        const styleType = value || 'classic';
        const initialTitle = editor.getText().trim().split('\n').find(Boolean) || 'כותרת המסמך';
        const result = await requestInputDialog({
          title: 'פרטי עמוד שער',
          description: 'אם כבר קיים עמוד שער קודם, הוא יוחלף בצורה בטוחה.',
          fields: [
            { id: 'title', label: 'כותרת המסמך', value: initialTitle },
            { id: 'subtitle', label: 'כותרת משנה', value: 'כותרת משנה' },
            { id: 'author', label: 'שם המחבר', value: '________________' },
          ],
          confirmLabel: 'החל עמוד שער',
        });
        if (!result) break;
        const title = String(result.title || 'כותרת המסמך').trim() || 'כותרת המסמך';
        const sub = String(result.subtitle || 'כותרת משנה').trim() || 'כותרת משנה';
        const author = String(result.author || '________________').trim() || '________________';
        const date = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long' });
        const safeTitle = escHtml(title);
        const safeSub = escHtml(sub);
        const safeAuthor = escHtml(author);
        const safeDate = escHtml(date);

        const coverTemplates = {
          classic: `<div data-cover-page="true"><p>מסמך רשמי</p><h1>${safeTitle}</h1><h2>${safeSub}</h2><hr /><p>נכתב על ידי ${safeAuthor}</p><p>${safeDate}</p></div>`,
          modern: `<div data-cover-page="true"><p>WordFlow AI</p><h1>${safeTitle}</h1><h2>${safeSub}</h2><hr /><p>${safeAuthor}</p><p>${safeDate}</p></div>`,
          academic: `<div data-cover-page="true"><p>עבודה אקדמית</p><h1>${safeTitle}</h1><h2>${safeSub}</h2><hr /><p>מגיש/ה: ${safeAuthor}</p><p>${safeDate}</p></div>`,
          bold: `<div data-cover-page="true"><p>דוח / מצגת / מסמך</p><h1>${safeTitle}</h1><h2>${safeSub}</h2><hr /><p>${safeAuthor}</p><p>${safeDate}</p></div>`,
          minimal: `<div data-cover-page="true"><p></p><p></p><p></p><h1 style="text-align:center">${safeTitle}</h1><p style="text-align:center"><span style="color:#64748b">${safeSub}</span></p><p></p><p></p><p style="text-align:center">${safeAuthor} · ${safeDate}</p></div>`,
          elegant: `<div data-cover-page="true"><p style="text-align:center"><span style="color:#94a3b8">✦ ✦ ✦</span></p><h1 style="text-align:center">${safeTitle}</h1><hr /><h3 style="text-align:center">${safeSub}</h3><p></p><p style="text-align:center">${safeAuthor}</p><p style="text-align:center"><span style="color:#64748b">${safeDate}</span></p><p style="text-align:center"><span style="color:#94a3b8">✦ ✦ ✦</span></p></div>`,
          corporate: `<div data-cover-page="true"><p style="text-align:left"><span style="color:#2B579A"><strong>■■■</strong></span></p><p></p><h1>${safeTitle}</h1><h2><span style="color:#2B579A">${safeSub}</span></h2><p></p><hr /><p><strong>הוכן על ידי:</strong> ${safeAuthor}</p><p><strong>תאריך:</strong> ${safeDate}</p><p><strong>סטטוס:</strong> טיוטה לאישור</p></div>`,
          thesis: `<div data-cover-page="true"><p style="text-align:center">מוסד אקדמי</p><p style="text-align:center"><span style="color:#64748b">הפקולטה / החוג</span></p><p></p><p></p><h1 style="text-align:center">${safeTitle}</h1><h3 style="text-align:center">${safeSub}</h3><p></p><p style="text-align:center">עבודה זו מוגשת כחלק מהדרישות לקבלת התואר</p><p></p><p style="text-align:center"><strong>מגיש/ה:</strong> ${safeAuthor}</p><p style="text-align:center"><strong>מנחה:</strong> ________________</p><p></p><p style="text-align:center">${safeDate}</p></div>`,
          legal: `<div data-cover-page="true"><p style="text-align:center"><strong>ב״ה</strong></p><p></p><h1 style="text-align:center">${safeTitle}</h1><h3 style="text-align:center">${safeSub}</h3><p></p><hr /><p><strong>נערך על ידי:</strong> ${safeAuthor}</p><p><strong>תאריך עריכה:</strong> ${safeDate}</p><p><span style="color:#64748b">מסמך זה הינו טיוטה משפטית ואינו מהווה ייעוץ משפטי.</span></p></div>`,
          creative: `<div data-cover-page="true"><h1 style="text-align:center"><span style="color:#7c3aed">${safeTitle}</span></h1><p style="text-align:center"><span style="color:#a78bfa">〰〰〰〰〰</span></p><h3 style="text-align:center">${safeSub}</h3><p></p><p></p><p style="text-align:center">${safeAuthor}</p><p style="text-align:center"><span style="color:#64748b">${safeDate}</span></p></div>`,
        };

  persistActiveTemplateId('cover');
        syncPersistedAppSettings();
        setActiveTemplateId('cover');
        // המחרוזת <div data-type="page-break"> נטענת כ-node תקין ע"י PageBreak.parseHTML — לא להמיר ל-setPageBreak (כאן חייבים setContent של המסמך המלא).
        const existingHtml = String(editor.getHTML() || '').replace(/<div data-cover-page="true">[\s\S]*?<\/div>\s*(<div data-type="page-break"><\/div>)?/i, '').trim();
        const cover = `${coverTemplates[styleType] || coverTemplates.classic}<div data-type="page-break"></div>${existingHtml || '<h1>כותרת פרק</h1><p></p>'}`;
        editor.commands.setContent(cover);
        break;
      }
      case 'insertCoverField': {
        // הוספת שדה דינמי ({{token}}) בנקודת הסמן בזמן עיצוב תבנית עמוד שער.
        const token = String(value || '').trim();
        if (!token) break;
        editor.chain().focus().insertContent(token).run();
        break;
      }
      case 'saveCurrentAsCoverTemplate': {
        // לוכד את עמוד השער הנוכחי (כולל פונט/גודל/יישור/שורות ריקות) כתבנית אישית.
        const fullHtml = String(editor.getHTML() || '');
        const coverMatch = fullHtml.match(/<div data-cover-page="true">[\s\S]*?<\/div>/i);
        let captured;
        if (coverMatch) {
          captured = coverMatch[0];
        } else {
          const pbIdx = fullHtml.search(/<div data-type="page-break">/i);
          const head = (pbIdx >= 0 ? fullHtml.slice(0, pbIdx) : fullHtml).trim();
          captured = `<div data-cover-page="true">${head}</div>`;
        }
        const plain = captured.replace(/<[^>]+>/g, '').replace(/ /g, ' ').trim();
        if (!plain) {
          showToast('העמוד ריק — כתוב ועצב עמוד שער לפני שמירה כתבנית.', { tone: 'warning' });
          break;
        }
        const profile = getPersonalStyleProfile();
        savePersonalStyleProfile({ ...profile, coverTemplateHtml: captured, coverTemplateSavedAt: new Date().toISOString() });
        showToast('עמוד השער הנוכחי נשמר כתבנית האישית שלך. הוסף אותו בכל מסמך דרך "עמוד שער ← עמוד השער שלי".', { tone: 'success', duration: 6000 });
        break;
      }
      case 'insertMyCoverPage': {
        // מזריק את תבנית עמוד השער האישית, ממלא שדות ידועים (קורס/מרצה/שם/מוסד) ומשאיר ריק אם לא ידוע.
        const profile = getPersonalStyleProfile();
        const templateHtml = String(profile.coverTemplateHtml || '').trim();
        if (!templateHtml) {
          showToast('עדיין לא שמרת תבנית עמוד שער. עצב עמוד שער ולחץ "שמור עמוד נוכחי כתבנית", או בנה אחת בהגדרות ← סגנון אישי.', { tone: 'info', duration: 7000 });
          break;
        }
        const existingHtml = String(editor.getHTML() || '').replace(/<div data-cover-page="true">[\s\S]*?<\/div>\s*(<div data-type="page-break"><\/div>)?/i, '').trim();
        let bodyTitle = '';
        try {
          const holder = document.createElement('div');
          holder.innerHTML = existingHtml;
          bodyTitle = (holder.textContent || '').split('\n').map((s) => s.trim()).find(Boolean) || '';
        } catch { bodyTitle = ''; }
        const filled = fillCoverTemplateTokens(templateHtml, profile, { title: bodyTitle });
        const coverBlock = /data-cover-page="true"/i.test(filled) ? filled : `<div data-cover-page="true">${filled}</div>`;
        persistActiveTemplateId('cover');
        syncPersistedAppSettings();
        setActiveTemplateId('cover');
        const cover = `${coverBlock}<div data-type="page-break"></div>${existingHtml || '<h1>כותרת פרק</h1><p></p>'}`;
        editor.commands.setContent(cover);
        showToast('עמוד השער שלך נוסף.', { tone: 'success' });
        break;
      }
      case 'insertBlankPage': {
        const blankPageHtml = `<div data-type="page-break"></div>${'<p>&nbsp;</p>'.repeat(14)}<div data-type="page-break"></div><p></p>`;
        editor.chain().focus().insertContent(blankPageHtml).run();
        break;
      }

      /* ---- פקודות סקירה ---- */
      case 'toggleComments': {
        setCommentsPanelOpen((prev) => {
          const next = !prev;
          if (next) setTrackPanelOpen(false);
          return next;
        });
        break;
      }
      case 'toggleTracking': {
        const newVal = !trackChanges;
        setTrackChanges(newVal);
        editor.commands.setTrackChangesEnabled?.(newVal);
        if (newVal) { setTrackPanelOpen(true); setCommentsPanelOpen(false); }
        showToast(newVal ? 'מעקב שינויים: פעיל (הוספות ומחיקות מסומנות)' : 'מעקב שינויים: כבוי', { tone: 'info' });
        break;
      }
      case 'toggleTrackPanel': {
        setTrackPanelOpen((prev) => {
          const next = !prev;
          if (next) setCommentsPanelOpen(false);
          return next;
        });
        break;
      }
      case 'acceptAllChanges': {
        // משביתים זמנית את המעקב כדי ש-setContent לא יסומן בעצמו כשינוי
        editor.commands.setTrackChangesEnabled?.(false);
        const html = editor.getHTML();
        const div = document.createElement('div');
        div.innerHTML = html;
        div.querySelectorAll('[data-ai-suggestion="true"]').forEach(el => {
          el.replaceWith(...Array.from(el.childNodes));
        });
        editor.commands.setContent(div.innerHTML);
        acceptInsertions(editor);
        editor.commands.setTrackChangesEnabled?.(trackChanges);
        break;
      }
      case 'rejectAllChanges': {
        const html2 = editor.getHTML();
        const div2 = document.createElement('div');
        div2.innerHTML = html2;
        div2.querySelectorAll('[data-ai-suggestion="true"]').forEach(el => {
          const origHtml = el.getAttribute('data-original-html');
          if (origHtml) {
            const holder = document.createElement('div');
            holder.innerHTML = origHtml;
            el.replaceWith(...Array.from(holder.childNodes));
            return;
          }
          const orig = el.getAttribute('data-original-text') || '';
          const span = document.createElement('span');
          span.textContent = orig;
          el.replaceWith(span);
        });
        editor.commands.setTrackChangesEnabled?.(false);
        editor.commands.setContent(div2.innerHTML);
        rejectInsertions(editor);
        editor.commands.setTrackChangesEnabled?.(trackChanges);
        break;
      }

      /* ---- פקודות ציטוטים ---- */
      case 'insertCitation': {
        const result = await requestInputDialog({
          title: 'הוספת ציטוט',
          fields: [
            { id: 'author', label: 'שם המחבר', placeholder: 'למשל: Cohen' },
            { id: 'year', label: 'שנה', value: String(new Date().getFullYear()) },
            { id: 'title', label: 'כותרת המקור', placeholder: 'שם מאמר או ספר' },
          ],
          confirmLabel: 'הוסף ציטוט',
        });
        const author = String(result?.author || '').trim();
        const year = String(result?.year || new Date().getFullYear()).trim();
        const title = String(result?.title || '').trim();
        if (!author) break;
        const citStyle = localStorage.getItem('citation-style') || 'APA';
        const citText = citStyle === 'APA'
          ? `(${escHtml(author)}, ${escHtml(String(year))})`
          : citStyle === 'MLA'
            ? `(${escHtml(author)} ${escHtml(String(year))})`
            : `${escHtml(author)} (${escHtml(String(year))})`;
        const titleTip = escHtml(`${author} (${year}). ${title}`);
        const src = { author, year, title };
        let sources = [];
        try { sources = JSON.parse(localStorage.getItem('bib-sources') || '[]'); } catch { sources = []; }
        sources.push(src);
        localStorage.setItem('bib-sources', JSON.stringify(sources));
        syncPersistedAppSettings();
        editor.chain().focus().insertContent(`<sup style="color:#2B579A;cursor:pointer" title="${titleTip}">${citText}</sup>`).run();
        break;
      }
      case 'setCitationStyle':
        localStorage.setItem('citation-style', value);
        syncPersistedAppSettings();
        break;
      case 'manageSources': {
        setSourceManagerOpen(true);
        break;
      }
      case 'insertBibliography': {
        let srcs2 = [];
        try { srcs2 = JSON.parse(localStorage.getItem('bib-sources') || '[]'); } catch { srcs2 = []; }
        const scaffoldSources = collectScaffoldBibliographyEntries(readScaffold());
        srcs2 = mergeBibliographyEntries(srcs2, scaffoldSources);
        const style = localStorage.getItem('citation-style') || 'APA';
        if (!srcs2.length) { showToast('אין מקורות לביבליוגרפיה. הוסף ציטוטים או בנה שלד עם ראיות תחילה.', { tone: 'warning' }); break; }
        if (scaffoldSources.length) {
          localStorage.setItem('bib-sources', JSON.stringify(srcs2));
          syncPersistedAppSettings();
        }
        const bibItems = srcs2
          .map((source) => `<li>${escHtml(formatBibliographyEntry(source, style))}</li>`)
          .join('');
        editor.chain().focus().insertContent(`<div style="margin-top:24px"><h2 style="font-size:16px;font-weight:bold;border-bottom:1px solid #ccc;padding-bottom:4px">ביבליוגרפיה</h2><ol style="padding-right:20px;line-height:2">${bibItems}</ol></div>`).run();
        if (scaffoldSources.length) {
          showToast(`הביבליוגרפיה נבנתה מקומית מ-${srcs2.length} מקורות, כולל ${scaffoldSources.length} מקורות משלד המטלה.`);
        }
        break;
      }

      /* ---- פקודות תצוגה ---- */
      case 'setViewMode': {
        const pg = document.querySelector('.ProseMirror');
        if (!pg) break;
        const nextViewMode = value || 'print';
        pg.dataset.viewMode = nextViewMode;
        setViewMode(nextViewMode);
        switch (nextViewMode) {
          case 'read':
            editor.setEditable(false);
            pg.style.background = '#FAFAFA';
            pg.style.fontFamily = 'Georgia, serif';
            pg.style.fontSize = '17px';
            pg.style.lineHeight = '1.8';
            pg.style.maxWidth = '700px';
            break;
          case 'web':
            pg.style.maxWidth = '100%';
            pg.style.padding = '20px 40px';
            pg.style.background = 'white';
            pg.style.boxShadow = 'none';
            editor.setEditable(true);
            break;
          case 'outline':
            editor.setEditable(true);
            pg.style.fontFamily = 'monospace';
            pg.style.fontSize = '13px';
            pg.style.lineHeight = '1.4';
            break;
          case 'draft':
            pg.style.maxWidth = '100%';
            pg.style.background = 'white';
            pg.style.boxShadow = 'none';
            pg.style.border = 'none';
            editor.setEditable(true);
            break;
          default: // print
            editor.setEditable(true);
            pg.contentEditable = 'true';
            pg.style.maxWidth = '21cm';
            pg.style.background = 'white';
            pg.style.fontFamily = '';
            pg.style.fontSize = '';
            pg.style.lineHeight = '';
            applyDocumentStyleToEditor(documentStyle);
        }
        break;
      }
      case 'toggleRuler': {
        const wrapper = document.querySelector('#editor-wrapper');
        if (!wrapper) break;
        const shouldShow = typeof value === 'boolean' ? value : !wrapper.classList.contains('show-ruler');
        wrapper.classList.toggle('show-ruler', shouldShow);
        break;
      }
      case 'toggleGrid': {
        const wrapper = document.querySelector('#editor-wrapper');
        if (!wrapper) break;
        const shouldShow = typeof value === 'boolean' ? value : !wrapper.classList.contains('show-grid');
        wrapper.classList.toggle('show-grid', shouldShow);
        break;
      }
      case 'splitWindow':
        // אין ארכיטקטורת split-pane; החלופה הכנה — חלון נוסף של האפליקציה
        if (window.desktopApp?.createAppWindow) {
          Promise.resolve(window.desktopApp.createAppWindow()).catch(() => {});
        } else {
          window.open(window.location.href, '_blank', 'noopener');
        }
        break;

      default: break;
    }
  };
  handleCommandRef.current = handleCommand;

  const hasPendingUserApproval = Boolean(feedbackSurvey.prompt || feedbackSurvey.usedFallback)
    && (liveGeneration.state === 'success' || liveGeneration.state === 'warning');
  const shouldShowProgressOnlyPanel = liveGeneration.active
    && (liveGeneration.state === 'running' || feedbackSurvey.open || hasPendingUserApproval);
  const liveGenerationStateMeta = getLiveGenerationStateMeta(liveGeneration.state);
  const liveGenerationHasFailureState = isLiveGenerationFailureState(liveGeneration.state);
  const liveGenerationBadgeClassName = liveGeneration.state === 'success'
    ? 'bg-emerald-100 text-emerald-700'
    : liveGeneration.state === 'warning'
      ? 'bg-amber-100 text-amber-700'
      : liveGeneration.state === LIVE_GENERATION_TIMEOUT_STATE
        ? 'bg-orange-100 text-orange-700'
        : liveGenerationHasFailureState
          ? 'bg-red-100 text-red-700'
          : 'bg-blue-100 text-blue-700';
  const progressLogs = Array.isArray(liveGeneration.logs) ? liveGeneration.logs : [];
  const feedbackReviewSuggestions = Array.isArray(feedbackSurvey.reviewResult?.suggestions)
    ? feedbackSurvey.reviewResult.suggestions
    : [];
  const feedbackReviewSelection = resolveReviewSuggestionSelection(feedbackSurvey.reviewApplySelection, feedbackReviewSuggestions);
  const feedbackReviewSummary = String(feedbackSurvey.reviewResult?.summary || '').trim();
  const feedbackReviewApplying = feedbackSurvey.applyingRecommendations === true;
  const canOpenDraftRecommendations = !feedbackSurvey.submitting
    && liveGeneration.state !== 'running'
    && hasMeaningfulEditorContent(editor);
  const isStartTransitionRunning = startTransitionPhase === 'running';
  const prefersReducedMotion = getPrefersReducedMotion();
  const isSpssMode = appMode === 'spss';
  const isSpssProjectMode = appMode === 'spss-project';
  const isWordMode = appMode === 'word';
  const isPresentationMode = appMode === 'presentation';
  const isDocDraftMode = appMode === 'docdraft';

  // Stream a generated SPSS findings chapter into the editor and switch to Word mode.
  // אם הטיוטה שבעורך מכילה הערות placeholder ("חלק זה יורחב לאחר הרצת הניתוח
  // בפועל") — משלבים את תתי-הפרק במקומן ושומרים על שאר העבודה, במקום להחליף
  // את כל המסמך בפרק בלבד.
  // נספח AI על תוצר ה-SPSS שכבר יושב בעורך — קריאת API נוספת שמוסיפה פרק תיעוד לסוף המסמך.
  const appendAiAppendixToCurrentEditor = React.useCallback(async () => {
    if (!editor) return;
    try {
      showToast('מייצר נספח AI (תיעוד שימוש) — קריאת API נוספת…');
      const snapshot = buildSidebarDocumentSnapshot(editor);
      const parsed = await generateAiAppendixHtml({ contextText: String(snapshot?.text || '') });
      if (parsed.ok && parsed.appendixHtml) {
        editor.chain().focus().insertContentAt(editor.state.doc.content.size, parsed.appendixHtml).run();
        triggerDocumentArrival('warning');
        showToast('נספח ה-AI נוסף לסוף המסמך. זכור למחוק את בלוק ההוראות "למחוק לפני הגשה" לפני ההגשה.');
      } else {
        showToast('נספח ה-AI לא הוחזר בפורמט צפוי — דלגתי עליו. אפשר לנסות שוב מסרגל ה-AI.', { tone: 'warning' });
      }
    } catch (appendixError) {
      showToast('יצירת נספח ה-AI נכשלה: ' + (appendixError?.message || 'שגיאה'), { tone: 'warning' });
    }
  }, [editor, generateAiAppendixHtml, triggerDocumentArrival]);

  const handleEmitSpssDocument = React.useCallback(({ html = '', title = 'פרק ממצאים', withAiAppendix = false, mode = 'merge' } = {}) => {
    if (!String(html || '').trim()) return;
    let placed = false;
    if (mode !== 'replace' && editor) {
      try {
        const merge = mergeSpssFindingsIntoDraftHtml(editor.getHTML(), html);
        if (merge && merge.replacedCount > 0) {
          editor.commands.setContent(merge.mergedHtml);
          setAppMode('word');
          showToast(
            `פרק הממצאים שולב בעבודה: ${merge.replacedCount} הערות "יורחב לאחר ההרצה" הוחלפו בתוצאות בפועל${merge.appendedCount ? `, ועוד ${merge.appendedCount} תתי-פרקים נוספו בסוף המסמך` : ''}.`,
            { tone: 'success', duration: 7000 },
          );
          placed = true;
        }
      } catch { /* נפילה שקטה להתנהגות הישנה — החלפת מסמך מלאה */ }
    }
    if (!placed) {
      applyImportedDocument({ ok: true, html, title, filePath: '', source: 'spss-project' });
      setAppMode('word');
      if (mode === 'replace') {
        showToast('העבודה המלאה נטענה לעורך.', { tone: 'success', duration: 7000 });
      }
    }
    if (withAiAppendix) {
      // ממתינים ריצה קצרה כדי שהתוכן יתייצב בעורך לפני קריאת הנספח.
      setTimeout(() => { appendAiAppendixToCurrentEditor(); }, 400);
    }
  }, [editor, applyImportedDocument, appendAiAppendixToCurrentEditor]);

  // יצירה/איפוס מתוך הסטודיו: payload=null → טופס יצירה חדש; אחרת מייצר deck
  const handleStudioGenerate = React.useCallback((payload) => {
    if (!payload) { setPresentationDeck(null); return; }
    return generatePresentationDeck(payload);
  }, [generatePresentationDeck]);

  // העלאת מצגת קיימת (.pptx) כטיוטה לעריכת טקסט/שכתוב — נכנס למצב טיוטת מצגת.
  const handleUploadPptxDraft = React.useCallback(async (file) => {
    if (!file) return false;
    enterStudioMode('presentation');
    setShowStartScreen(false);
    setPresentationBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const draft = await importPptxDraft(new Uint8Array(buf), file.name || 'presentation.pptx');
      setPresentationDeck(null);
      setPptxDraft(draft);
      return true;
    } catch (error) {
      showToast(error?.message || 'טעינת המצגת נכשלה', { tone: 'error' });
      return false;
    } finally {
      setPresentationBusy(false);
    }
  }, []);

  // העלאת מסמך Word קיים (.docx) כטיוטה לשכתוב לסגנון המשתמש — נכנס למצב טיוטת מסמך.
  const handleUploadDocDraft = React.useCallback(async (file) => {
    if (!file) return false;
    enterStudioMode('docdraft');
    setShowStartScreen(false);
    try {
      const buf = await file.arrayBuffer();
      const draft = await importDocumentDraft(new Uint8Array(buf), file.name || 'document.docx');
      setDocDraft(draft);
      return true;
    } catch (error) {
      showToast(error?.message || 'טעינת המסמך נכשלה', { tone: 'error' });
      exitStudioMode();
      return false;
    }
  }, []);

  // טעינת הטקסט המשוכתב מהסטודיו ישירות לעורך TipTap.
  const handleLoadDocDraftToEditor = React.useCallback(({ html = '', title = '' } = {}) => {
    if (!String(html || '').trim()) return;
    applyImportedDocument({ ok: true, html, title, filePath: '', source: 'docdraft' });
    setDocDraft(null);
    setAppMode('word');
  }, [applyImportedDocument]);

  const isNonDocumentMode = !isWordMode;
  const isInputDialogVisible = inputDialog.open && isWordMode;
  const isCopyleaksDetectorVisible = copyleaksDetector.open && !showStartScreen && isWordMode;
  const isFeedbackSurveyVisible = feedbackSurvey.open && !showStartScreen && isWordMode;
  const copyleaksConfig = normalizeCopyleaksConfig(getProviderConfig().copyleaks);
  const copyleaksTextStats = getCopyleaksTextStats(copyleaksDetector.text);
  const copyleaksValidationMessage = getCopyleaksValidationMessage(copyleaksDetector.text);
  const isCopyleaksConfigured = Boolean(copyleaksConfig.email && copyleaksConfig.key);
  const canSubmitCopyleaks = Boolean(!copyleaksDetector.submitting && isCopyleaksConfigured && copyleaksTextStats.isValid);
  const shouldHideEditorWrapper = showStartScreen && !isInputDialogVisible;
  return (
    <div className="flex flex-col h-[100dvh] min-h-[100dvh] bg-[var(--page-bg,#E1DFDD)] text-[var(--text-color,#323130)] overflow-hidden" dir="rtl">
      {showSplash && <AppStartupSplash onDone={() => setShowSplash(false)} />}
      <ConfettiCelebration active={documentArrival.active && documentArrival.tone === 'success'} />
      <TopBar
        onOpenUpdates={openUpdatesPanel}
        onOpenSearch={() => setFindReplace({ open: true, mode: 'find' })}
        onOpen={() => handleCommand('openFile')}
        onNew={() => handleCommand('newDoc')}
        onNewWindow={() => window.open(window.location.href, '_blank')}
        newWindowDisabled={isDesktopApp()}
        onSave={() => handleCommand('saveLocal')}
        onSaveAs={() => handleCommand('saveAs')}
        onUndo={() => editor?.chain().focus().undo().run()}
        onRedo={() => editor?.chain().focus().redo().run()}
        onHome={openHomeSafely}
        onOpenDraftRecommendations={openDraftRecommendations}
        draftRecommendationsDisabled={!canOpenDraftRecommendations}
        onCheckStyle={() => setAuthenticityOpen(true)}
        onToggleAssignmentBrief={() => {
          setAssignmentBriefOpen((prev) => !prev);
        }}
        assignmentBriefAvailable={Boolean(assignmentBrief.text)}
        assignmentBriefOpen={assignmentBriefOpen}
        appMode={appMode}
        onModeChange={enterStudioMode}
        cloudAvailable={cloudAvailable}
        cloudUser={cloudUser}
        cloudStatusLabel={cloudStatusLabel}
        cloudBusy={cloudSyncState.status === 'saving'}
        onCloudSignIn={handleCloudGoogleSignIn}
        onCloudSave={() => {
          Promise.resolve(handleManualCloudSync()).catch(() => {});
        }}
        onCloudPull={() => {
          Promise.resolve(handlePullFromCloud()).catch(() => {});
        }}
        onCloudSignOut={handleCloudSignOut}
        documentTitle={getDraftTitleFromFilePath(currentFilePath)}
        startScreenActive={showStartScreen}
        onOpenSettings={() => { setFileMenuTargetTab('ai'); setFileMenuOpen(true); }}
      />
      {isWordMode && isPhoneViewport && !showStartScreen && (
        <MobileToolbar
          onCommand={handleCommand}
          onUndo={() => editor?.chain().focus().undo().run()}
          onRedo={() => editor?.chain().focus().redo().run()}
          onOpenFileMenu={() => {
            setFileMenuTargetTab(null);
            setFileMenuOpen(true);
          }}
          activeFormats={activeFormats}
          assistantOpen={sidebarOpen}
          onToggleTaskpane={() => {
            setAssistantTrigger('manual');
            setSidebarOpen((v) => {
              const next = !v;
              if (next) setSidebarCompact(false);
              return next;
            });
            setLastEditorActivityAt(Date.now());
          }}
        />
      )}
      {isWordMode && !isPhoneViewport && (
        <Ribbon
          onCommand={handleCommand}
          documentStyle={documentStyle}
          scaffoldActive={scaffoldActive}
          evidencePanelOpen={evidencePanelOpen}
          assignmentTitle={scaffoldTitle}
          onToggleTaskpane={() => {
            setAssistantTrigger('manual');
            setSidebarOpen((v) => {
              const next = !v;
              if (next) setSidebarCompact(false);
              return next;
            });
            setLastEditorActivityAt(Date.now());
          }}
          zoom={zoom}
          onOpenFileMenu={() => {
            setFileMenuTargetTab(null);
            setFileMenuOpen(true);
          }}
          formatPainterActive={formatPainterActive}
          activeFormats={activeFormats}
          shortcuts={shortcuts}
          assistantOpen={sidebarOpen}
        />
      )}
      
      <main id="workspace" className="flex flex-1 overflow-hidden relative">
        <div className="min-w-0 flex-1" style={{ display: isSpssMode ? 'flex' : 'none' }}>
          <SpssSyntaxStudio onOpenProjectMode={() => enterStudioMode('spss-project')} onOpenHelp={openHelpTopic} />
        </div>

        {isSpssProjectMode && (
          <div className="min-w-0 flex-1 flex">
            <SpssProjectStudio
              onExit={exitStudioMode}
              onEmitDocument={handleEmitSpssDocument}
              onOpenHelp={openHelpTopic}
            />
          </div>
        )}

        {appMode === 'project-hub' && projectHubProjectId && (
          <div className="min-w-0 flex-1 flex">
            <ProjectHubStudio
              projectId={projectHubProjectId}
              onExit={() => {
                setProjectHubProjectId(null);
                exitStudioMode();
              }}
              onOpenDocument={(payload) => {
                // מסמך שנפתח מה-Hub נטען לעורך — יוצאים ממצב ה-Hub למצב עריכה.
                setProjectHubProjectId(null);
                setAppMode('word');
                applyImportedDocument(payload);
              }}
              onGenerateDocForMilestone={(seed) => {
                // חזרה למסך הבית עם הפרומפט של השלב; השיוך לשלב נסגר אחרי היצירה.
                setProjectHubDocSeed({ ...seed, token: Date.now() });
                setProjectHubProjectId(null);
                setAppMode('word');
                setShowStartScreen(true);
              }}
              onOpenHelp={openHelpTopic}
            />
          </div>
        )}

        {appMode === 'assignment-scaffold' && (
          <div className="min-w-0 flex-1 flex">
            <AssignmentScaffoldStudio
              onExit={exitStudioMode}
              onOpenDocument={(payload) => {
                // השלד נטען לעורך; פאנל הראיות נפתח אוטומטית כי החנות סומנה כפעילה.
                setAppMode('word');
                setShowStartScreen(false);
                setEvidencePanelOpen(true);
                applyImportedDocument(payload);
              }}
              onOpenHelp={openHelpTopic}
            />
          </div>
        )}

        {/* פאנל הראיות מתנהג בדיוק כמו חלונית ה-AI: aside מעוגן בדסקטופ, מסך מלא
            עם רקע מוחשך בנייד. שניהם order-last, כך שכששניהם פתוחים הם יושבים זה
            לצד זה לפי סדר ה-DOM (AI ואז ראיות). */}
        {isWordMode && !showStartScreen && scaffoldActive && evidencePanelOpen && isMobileViewport && (
          <button
            type="button"
            aria-label="סגור פאנל ראיות"
            className="fixed inset-0 z-20 bg-slate-950/35 backdrop-blur-[1px]"
            onClick={() => setEvidencePanelOpen(false)}
          />
        )}

        {isWordMode && !showStartScreen && scaffoldActive && evidencePanelOpen && (
          <aside
            className={`${isMobileViewport
              ? 'fixed inset-0 z-30 border-none bg-[#F8FAFC]'
              : 'order-last h-full min-h-0 shrink-0 border-r border-slate-300 bg-[#F8FAFC] z-20'} transition-all duration-200 shadow-[8px_0_24px_rgba(15,23,42,0.06)] flex flex-col overflow-hidden`}
            style={isMobileViewport ? undefined : { width: 'min(360px, 28vw)', minWidth: 288, maxWidth: '30vw' }}
          >
            <EvidencePanel editor={editor} onClose={() => setEvidencePanelOpen(false)} />
          </aside>
        )}

        {isPresentationMode && pptxDraft && (
          <div className="min-w-0 flex-1 flex">
            <PptxDraftStudio
              draft={pptxDraft}
              onExit={() => { setPptxDraft(null); exitStudioMode(); }}
              showToast={showToast}
              onOpenHelp={openHelpTopic}
            />
          </div>
        )}

        {isDocDraftMode && docDraft && (
          <div className="min-w-0 flex-1 flex">
            <DocumentDraftStudio
              draft={docDraft}
              onExit={() => { setDocDraft(null); exitStudioMode(); }}
              onLoadToEditor={handleLoadDocDraftToEditor}
              showToast={showToast}
            />
          </div>
        )}

        {isPresentationMode && !pptxDraft && (
          <div className="min-w-0 flex-1 flex">
            <PresentationStudio
              deck={presentationDeck}
              onDeckChange={setPresentationDeck}
              onGenerate={handleStudioGenerate}
              onUploadPptx={handleUploadPptxDraft}
              onExit={exitStudioMode}
              busy={presentationBusy}
              hasDocument={Boolean(editor && editor.getText && editor.getText().trim())}
              documentTitle={getDraftTitleFromFilePath(currentFilePath)}
              showToast={showToast}
              onOpenHelp={openHelpTopic}
            />
          </div>
        )}

        {isWordMode && !showStartScreen && sidebarOpen && isMobileViewport && (
          <button
            type="button"
            aria-label="סגור חלונית AI"
            className="fixed inset-0 z-20 bg-slate-950/35 backdrop-blur-[1px]"
            onClick={closeAssistantPopup}
          />
        )}

        {isWordMode && !showStartScreen && sidebarOpen && (
          <aside
            className={`${isMobileViewport
              ? 'fixed inset-0 z-30 border-none bg-[#F8FAFC]'
              : 'order-last h-full min-h-0 shrink-0 border-r border-slate-300 bg-[#F8FAFC] z-20'} transition-all duration-200 shadow-[8px_0_24px_rgba(15,23,42,0.06)] flex flex-col overflow-hidden`}
            style={isMobileViewport ? undefined : { width: sidebarCompact ? 'min(340px, 36vw)' : 'min(460px, 44vw)', minWidth: sidebarCompact ? 280 : 340, maxWidth: sidebarCompact ? '38vw' : '520px' }}
          >
            {liveGeneration.active && (
              <div className={`${shouldShowProgressOnlyPanel ? 'h-full min-h-0 p-4' : 'border-b border-slate-200 bg-white px-3 py-3'}`}>
                <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${shouldShowProgressOnlyPanel ? 'h-full min-h-0 flex flex-col overflow-hidden p-4' : 'p-3'}`}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="text-base font-bold text-slate-900">
                        {liveGenerationStateMeta.title}
                      </div>
                      <div className="text-xs text-slate-600 mt-1 truncate">{liveGeneration.prompt || 'מעבד את הבקשה שלך...'}</div>
                    </div>
                    <div className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${liveGenerationBadgeClassName}`}>
                      {liveGenerationStateMeta.label}
                    </div>
                  </div>

                  <div className={`${shouldShowProgressOnlyPanel ? 'flex-1 min-h-0 overflow-y-auto pr-1 pb-1' : ''}`}>
                    <LiveGenerationMood state={liveGeneration.state} />
                    <div className="space-y-2">
                      {(liveGeneration.summary?.stages || []).slice(0, 6).map((stage) => (
                        <div key={stage.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-xs bg-slate-50">
                          <span className="font-medium text-slate-700 truncate pr-2">{stage.label}</span>
                          <span className={`font-bold ${stage.state === 'success' ? 'text-emerald-600' : stage.state === 'error' ? 'text-red-600' : stage.state === 'running' ? 'text-blue-600' : 'text-slate-400'}`}>
                            {stage.state === 'success' ? '✓' : stage.state === 'error' ? '✗' : stage.state === 'running' ? '...' : '•'}
                          </span>
                        </div>
                      ))}
                    </div>

                    {liveGeneration.state === 'running' && (
                      <OneAxisAirHockeyGame title="Arcade בזמן שהצוות עובד" compact allowPopup />
                    )}

                      {(liveGeneration.state === 'running' || liveGenerationHasFailureState) && (
                      <div className={`mt-3 rounded-xl border p-3 ${liveGeneration.state === 'running' ? 'border-amber-200 bg-amber-50/80' : liveGeneration.state === LIVE_GENERATION_TIMEOUT_STATE ? 'border-orange-200 bg-orange-50/80' : 'border-slate-200 bg-slate-50/80'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[11px] leading-4 text-slate-700">
                            {liveGeneration.state === 'running'
                              ? 'אם ההרצה נראית תקועה, אפשר לנקות את המצב ולהתחיל מחדש.'
                              : liveGeneration.state === LIVE_GENERATION_TIMEOUT_STATE
                                ? 'הספק לא החזיר תשובה בזמן. אפשר לנקות את המצב ולנסות שוב, או לשחזר מהשלב שנכשל.'
                                : 'אפשר לסגור את מצב השגיאה ולחזור לעבודה.'}
                          </div>
                          <button
                            type="button"
                            className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                            onClick={clearDraftReviewState}
                          >
                            {liveGeneration.state === 'running' ? 'שחרר מצב תקוע' : liveGeneration.state === LIVE_GENERATION_TIMEOUT_STATE ? 'נקה מצב timeout' : 'נקה מצב שגיאה'}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5">
                      <div className="text-[11px] font-bold text-slate-700 mb-2">לוג חי של ההרצה</div>
                      <div className={`${shouldShowProgressOnlyPanel ? 'max-h-[34vh]' : 'max-h-32'} overflow-auto space-y-1.5 pr-1`}>
                        {progressLogs.length ? progressLogs.map((log, index) => {
                          const logTimeValue = log?.timestamp || log?.time || log?.ts;
                          const logTime = logTimeValue ? new Date(logTimeValue).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';
                          const logAgent = String(log?.agentLabel || log?.agentId || 'מערכת');
                          const logMessage = String(log?.message || log?.type || 'עודכן סטטוס תהליך');
                          return (
                            <div key={`${logTime}-${logAgent}-${index}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                              <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 mb-0.5">
                                <span className="font-semibold text-slate-600 truncate">{logAgent}</span>
                                <span>{logTime}</span>
                              </div>
                              <div className="text-[11px] text-slate-700 leading-4">{logMessage}</div>
                            </div>
                          );
                        }) : (
                          <div className="text-[11px] text-slate-500 px-1 py-1">הלוגים יופיעו כאן בזמן אמת...</div>
                        )}
                      </div>
                    </div>

                    {canRetryFailedGeneration && (
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50/80 p-3">
                        <div className="text-[11px] font-bold text-red-700">הסוכן שנכשל: {failedGenerationStage?.label || failedStageAgentRecord?.name || 'לא זוהה'}</div>
                        <div className="mt-1 text-[11px] leading-4 text-slate-700">
                          ההרצה נעצרה ב־{failedStageProviderLabel} / {failedStageModelLabel}. אפשר לעדכן רק את הסוכן הזה ולהפעיל מחדש את אותה פעולה מההתחלה.
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <label className="block text-[11px] text-slate-700">
                            <span className="mb-1 block font-semibold">Provider חלופי</span>
                            <select
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[12px] text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                              value={generationRecovery.provider}
                              onChange={handleRecoveryProviderChange}
                              disabled={generationRecovery.pending}
                            >
                              {configuredProviderChoices.map((provider) => (
                                <option key={provider.id} value={provider.id}>{provider.label}</option>
                              ))}
                            </select>
                          </label>

                          <label className="block text-[11px] text-slate-700">
                            <span className="mb-1 block font-semibold">מודל חלופי</span>
                            <select
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[12px] text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                              value={generationRecovery.model}
                              onChange={handleRecoveryModelChange}
                              disabled={generationRecovery.pending || !recoveryModelChoices.length}
                            >
                              {recoveryModelChoices.map((model) => (
                                <option key={model} value={model}>{model}</option>
                              ))}
                            </select>
                          </label>
                        </div>

                        {generationRecovery.error && (
                          <div className="mt-2 text-[11px] font-medium text-red-700">{generationRecovery.error}</div>
                        )}

                        <button
                          className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-red-600 px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                          onClick={retryFailedGenerationWithUpdatedAgent}
                          disabled={generationRecovery.pending || !generationRecovery.provider || !generationRecovery.model}
                        >
                          {generationRecovery.pending ? 'מעדכן סוכן ומריץ מחדש...' : 'החלף מודל והרץ מחדש'}
                        </button>
                      </div>
                    )}

                    {(liveGeneration.state === 'success' || liveGeneration.state === 'warning') && (feedbackSurvey.prompt || feedbackSurvey.usedFallback) && (
                      <div className="mt-3 flex gap-2">
                        <button
                          className="btn btn-sm btn-primary flex-1"
                          onClick={() => setFeedbackSurvey((prev) => ({ ...prev, open: true, phase: 'details' }))}
                        >
                          בקש תיקונים
                        </button>
                        <button
                          className="btn btn-sm btn-ghost flex-1"
                          onClick={() => setLiveGeneration((prev) => ({ ...prev, active: false }))}
                        >
                          אשר והמשך לערוך
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!shouldShowProgressOnlyPanel && (
            <AiSidebar
              mode="sidebar"
              onOpenHelp={openHelpTopic}
              compactMode={sidebarCompact}
              launchPreset={assistantLaunchPreset}
              activeDocumentSessionId={activeDocumentSessionId}
                currentFilePath={currentFilePath}
                assignmentBrief={assignmentBrief}
                onToggleCompact={() => setSidebarCompact((prev) => !prev)}
                reason={assistantTrigger}
                documentContext={() => {
                  // כשיש מטלה פעילה, כל שיחה בחלונית יורשת את הסעיף שהסמן בו,
                  // המכסה שלו והמקורות המותרים — אחרת "תרחיב לי כאן" חסר הקשר.
                  const snapshot = buildSidebarDocumentSnapshot(editor);
                  if (!scaffoldActive) return snapshot;
                  const spec = readScaffold()?.spec;
                  const hit = spec ? findSectionAtCursor(editor, spec) : null;
                  const block = buildScaffoldContextBlock({ sectionId: hit?.sectionId || null });
                  return block ? `${snapshot}\n\n${block}` : snapshot;
                }}
                selectedText={selectedText}
                currentBlockText={currentBlockText}
                editTarget={editTarget}
                getCurrentEditTarget={getCurrentEditTarget}
                resolveEditTargetFromPrompt={resolveEditTargetFromPrompt}
                resolveEditTargetsFromPrompt={resolveEditTargetsFromPrompt}
                assistantBehavior={assistantBehavior}
                onOpenSettingsTab={(targetTab) => {
                  setFileMenuTargetTab(targetTab || 'assistant');
                  setFileMenuOpen(true);
                }}
                wordPreferences={wordPreferences}
                onApplyEdit={handleApplyAssistantEdit}
                onApplyEditBatch={handleApplyAssistantEditBatch}
                onApplyDocumentPlan={handleApplyDocumentActionPlan}
                onInsert={(text) => {
                  if (editor) editor.chain().focus().insertContent(`\n\n${text}\n\n`).run();
                }}
                onAppendAiAppendix={handleAppendAiAppendix}
                onStreamStart={handleStreamStart}
                onStreamChunk={handleStreamChunk}
                onStreamEnd={handleStreamEnd}
                onClose={closeAssistantPopup}
              />
            )}
          </aside>
        )}

        <div
          id="editor-wrapper"
          className="flex flex-1 min-w-0 overflow-y-auto overflow-x-auto p-3 sm:p-8 justify-center items-start bg-[#E1DFDD] relative"
          style={{
            display: isNonDocumentMode ? 'none' : undefined,
            opacity: shouldHideEditorWrapper ? 0 : 1,
            transform: prefersReducedMotion
              ? 'none'
              : (shouldHideEditorWrapper ? 'translateY(24px) scale(0.985)' : 'translateY(0px) scale(1)'),
            filter: prefersReducedMotion ? 'none' : (shouldHideEditorWrapper ? 'blur(12px)' : 'blur(0px)'),
            transition: prefersReducedMotion
              ? 'none'
              : 'opacity 320ms ease-out, transform 420ms cubic-bezier(0.22, 1, 0.36, 1), filter 260ms ease-out',
            pointerEvents: shouldHideEditorWrapper ? 'none' : 'auto',
          }}
          aria-hidden={shouldHideEditorWrapper || isNonDocumentMode}
          inert={shouldHideEditorWrapper || isNonDocumentMode ? true : undefined}
        >
          {isInputDialogVisible && (
            <Modal
              open={isInputDialogVisible}
              onClose={() => closeInputDialog(null)}
              title={inputDialog.title || 'השלם פרטים'}
              size="md"
              /* Escape is handled by the global overlay-coordination effect; block
                 the Modal's own Escape to avoid double-close. */
              escapeBlocked
              backdropBlocked={!inputDialog.closeOnBackdrop}
              initialFocusRef={inputDialogFirstFieldRef}
              footer={(
                <>
                  <Button variant="quiet" onClick={() => closeInputDialog(null)}>ביטול</Button>
                  <Button onClick={submitInputDialog}>{inputDialog.confirmLabel || 'אישור'}</Button>
                </>
              )}
            >
              {inputDialog.description ? (
                <p className="-mt-1 mb-4 text-sm leading-relaxed text-slate-500">{inputDialog.description}</p>
              ) : null}
              <div className="flex flex-col gap-5">
                {(inputDialog.fields || []).map((field, idx) => {
                  const commonProps = {
                    label: field.label,
                    placeholder: field.placeholder || '',
                    value: inputDialog.values?.[field.id] || '',
                    onChange: (e) => setInputDialog((prev) => ({
                      ...prev,
                      values: { ...prev.values, [field.id]: e.target.value },
                    })),
                  };
                  if (field.type === 'select') {
                    return (
                      <label key={field.id} className="flex flex-col gap-1.5 text-sm text-slate-600">
                        <span>{field.label}</span>
                        <select
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                          value={inputDialog.values?.[field.id] || ''}
                          onChange={(e) => setInputDialog((prev) => ({
                            ...prev,
                            values: { ...prev.values, [field.id]: e.target.value },
                          }))}
                        >
                          {(field.options || []).map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                    );
                  }
                  if (field.type === 'textarea') {
                    return (
                      <TextArea
                        key={field.id}
                        ref={idx === 0 ? inputDialogFirstFieldRef : undefined}
                        rows={5}
                        {...commonProps}
                        onKeyDown={(e) => {
                          if (inputDialog.submitOnCtrlEnterForTextarea && e.key === 'Enter' && e.ctrlKey) {
                            e.preventDefault();
                            submitInputDialog();
                          }
                        }}
                      />
                    );
                  }
                  return (
                    <Input
                      key={field.id}
                      ref={idx === 0 ? inputDialogFirstFieldRef : undefined}
                      type={field.type || 'text'}
                      ltr={field.id === 'url'}
                      className={field.id === 'url' ? 'font-mono text-sm' : ''}
                      {...commonProps}
                      onKeyDown={(e) => {
                        if (inputDialog.submitOnEnter && e.key === 'Enter') {
                          e.preventDefault();
                          submitInputDialog();
                        }
                      }}
                    />
                  );
                })}
              </div>
            </Modal>
          )}

          {isCopyleaksDetectorVisible && (
            <div
              className="fixed inset-0 z-[101] bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4"
              dir="rtl"
              onMouseDown={(event) => {
                if (event.target !== event.currentTarget) return;
                closeCopyleaksDetector();
              }}
            >
              <div className="w-[1180px] max-w-[98%] max-h-[92vh] overflow-hidden rounded-[28px] bg-white shadow-2xl border border-slate-200 flex flex-col">
                {copyleaksDetector.scoreFlash && (
                  <div className="pointer-events-none absolute inset-0 z-[102] flex items-center justify-center">
                    <div className={`animate-pulse rounded-[32px] border px-8 py-7 shadow-2xl backdrop-blur-md ${
                      copyleaksDetector.scoreFlash.tone === 'success'
                        ? 'border-emerald-200 bg-emerald-50/95 text-emerald-700'
                        : copyleaksDetector.scoreFlash.tone === 'balanced'
                          ? 'border-cyan-200 bg-cyan-50/95 text-cyan-700'
                          : copyleaksDetector.scoreFlash.tone === 'warning'
                            ? 'border-amber-200 bg-amber-50/95 text-amber-700'
                            : 'border-rose-200 bg-rose-50/95 text-rose-700'
                    }`}>
                      <div className="text-center">
                        <div className="text-6xl leading-none mb-3">{copyleaksDetector.scoreFlash.emoji}</div>
                        <div className="text-[11px] font-bold tracking-[0.24em] uppercase opacity-70">AI Detection</div>
                        <div className="text-6xl font-black leading-none mt-2">{formatCopyleaksPercent(copyleaksDetector.scoreFlash.value)}</div>
                        <div className="text-sm font-semibold mt-3">{copyleaksDetector.scoreFlash.label}</div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-start justify-between gap-4 px-6 py-5 md:px-8 border-b border-slate-100 bg-slate-50/70">
                  <div className="min-w-0 flex-1 text-right">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold text-blue-700">Copyleaks</span>
                      <span className="inline-flex items-center rounded-full bg-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-700">{copyleaksDetector.sourceLabel}</span>
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${isCopyleaksConfigured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {isCopyleaksConfigured ? 'ההגדרות מוכנות' : 'צריך למלא הגדרות'}
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-slate-800 tracking-tight">זיהוי AI עם Copyleaks</h3>
                    <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                      הכלי הזה בודק טקסט קיים דרך Copyleaks כדי להעריך אם הוא נראה אנושי או נראה כתוכן שנוצר בעזרת AI. הוא לא כותב טקסט ולא משנה את מנוע הכתיבה שלכם.
                    </p>
                  </div>
                  <button
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors flex-shrink-0"
                    onClick={closeCopyleaksDetector}
                    title="סגור"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[1.15fr,0.85fr] gap-0 min-h-0 flex-1 overflow-hidden">
                  <div className="p-6 md:p-8 overflow-y-auto border-b xl:border-b-0 xl:border-l border-slate-100 space-y-5">
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">רגישות: {copyleaksConfig.sensitivity}</span>
                      <span className={`inline-flex items-center rounded-full px-3 py-1 font-semibold ${copyleaksConfig.explain ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>פירוט נוסף: {copyleaksConfig.explain ? 'פעיל' : 'כבוי'}</span>
                      <span className={`inline-flex items-center rounded-full px-3 py-1 font-semibold ${copyleaksConfig.sandbox ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>מצב הדגמה: {copyleaksConfig.sandbox ? 'פעיל' : 'כבוי'}</span>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">שפה: {copyleaksConfig.language || 'אוטומטי'}</span>
                    </div>

                    <label className="block text-right">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="text-sm font-semibold text-slate-700">טקסט לבדיקה</span>
                        <span className={`text-xs font-semibold ${copyleaksTextStats.isValid ? 'text-emerald-700' : copyleaksTextStats.length ? 'text-amber-700' : 'text-slate-400'}`}>
                          {copyleaksTextStats.length.toLocaleString('he-IL')} תווים
                        </span>
                      </div>
                      <textarea
                        dir="auto"
                        className="w-full min-h-[240px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none resize-y leading-7"
                        placeholder={`הדביקו כאן טקסט לבדיקה בטווח ${COPYLEAKS_TEXT_MIN_CHARS}-${COPYLEAKS_TEXT_MAX_CHARS} תווים`}
                        value={copyleaksDetector.text}
                        onChange={(event) => setCopyleaksDetector((prev) => ({
                          ...prev,
                          text: event.target.value,
                          error: '',
                          result: null,
                        }))}
                      />
                    </label>

                    <div className={`rounded-2xl border px-4 py-3 text-sm ${copyleaksTextStats.isValid ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                      {copyleaksTextStats.isValid
                        ? `הטקסט מוכן לשליחה. Copyleaks יקבל ${copyleaksTextStats.length.toLocaleString('he-IL')} תווים לבדיקה.`
                        : (copyleaksValidationMessage || `Copyleaks דורש ${COPYLEAKS_TEXT_MIN_CHARS}-${COPYLEAKS_TEXT_MAX_CHARS} תווים לבדיקה.`)}
                    </div>

                    {!isCopyleaksConfigured && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 leading-7">
                        כדי להריץ בדיקה אמיתית, פתחו את הגדרות Copyleaks ומלאו אימייל ומפתח סודי. אפשר גם לבדוק חיבור כדי לוודא שהפרטים נכונים. ההגדרה הזו נפרדת ממנוע הכתיבה הפעיל.
                      </div>
                    )}

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-sm font-bold text-slate-800 mb-2">מה חשוב לדעת</div>
                      <div className="space-y-2 text-sm leading-7 text-slate-600">
                        {COPYLEAKS_HELP_LINES.map((line) => (
                          <div key={line}>• {line}</div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-3 justify-end">
                      <button
                        className="px-4 py-2.5 rounded-xl font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors"
                        onClick={openCopyleaksSettingsPanel}
                      >
                        פתח הגדרות Copyleaks
                      </button>
                      <button
                        className="px-4 py-2.5 rounded-xl font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                        onClick={closeCopyleaksDetector}
                      >
                        סגור
                      </button>
                      <button
                        className={`px-6 py-2.5 rounded-xl font-semibold text-white shadow-sm transition-all ${canSubmitCopyleaks ? 'bg-[#0066cc] hover:bg-blue-700 hover:shadow active:scale-[0.98]' : 'bg-slate-300 cursor-not-allowed'}`}
                        onClick={submitCopyleaksDetector}
                        disabled={!canSubmitCopyleaks}
                      >
                        {copyleaksDetector.submitting ? 'מריץ בדיקת Copyleaks...' : 'הרץ בדיקה'}
                      </button>
                    </div>
                  </div>

                  <div className="p-6 md:p-8 overflow-y-auto space-y-5 bg-white">
                    {copyleaksDetector.error && (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 leading-7">
                        {copyleaksDetector.error}
                      </div>
                    )}

                    {copyleaksDetector.result ? (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="text-xs font-bold tracking-[0.16em] text-slate-400 mb-2">נראה כ-AI</div>
                            <div className="text-2xl font-bold text-slate-900">{formatCopyleaksPercent(copyleaksDetector.result.summary.ai)}</div>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="text-xs font-bold tracking-[0.16em] text-slate-400 mb-2">נראה אנושי</div>
                            <div className="text-2xl font-bold text-slate-900">{formatCopyleaksPercent(copyleaksDetector.result.summary.human)}</div>
                          </div>
                          <div className={`rounded-2xl border px-4 py-4 ${copyleaksDetector.result.classificationCode === COPYLEAKS_CLASSIFICATION_AI ? 'border-rose-200 bg-rose-50' : copyleaksDetector.result.classificationCode === COPYLEAKS_CLASSIFICATION_HUMAN ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                            <div className="text-xs font-bold tracking-[0.16em] text-slate-400 mb-2">הערכה כללית</div>
                            <div className={`text-lg font-bold ${copyleaksDetector.result.classificationCode === COPYLEAKS_CLASSIFICATION_AI ? 'text-rose-700' : copyleaksDetector.result.classificationCode === COPYLEAKS_CLASSIFICATION_HUMAN ? 'text-emerald-700' : 'text-slate-700'}`}>
                              {copyleaksDetector.result.classificationLabel}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="text-sm font-bold text-slate-800 mb-3">פרטי הבדיקה</div>
                          <div className="flex flex-wrap gap-2 text-[12px] text-slate-600">
                            {copyleaksDetector.result.modelVersion && <span className="inline-flex items-center rounded-full bg-white px-3 py-1 border border-slate-200">גרסת מנוע: {copyleaksDetector.result.modelVersion}</span>}
                            {copyleaksDetector.result.scannedDocument?.wordCount != null && <span className="inline-flex items-center rounded-full bg-white px-3 py-1 border border-slate-200">מילים: {Number(copyleaksDetector.result.scannedDocument.wordCount).toLocaleString('he-IL')}</span>}
                            {copyleaksDetector.result.scannedDocument?.credits != null && <span className="inline-flex items-center rounded-full bg-white px-3 py-1 border border-slate-200">קרדיטים: {Number(copyleaksDetector.result.scannedDocument.credits).toLocaleString('he-IL')}</span>}
                            {(copyleaksDetector.result.scannedDocument?.language || copyleaksDetector.result.requestMeta?.language) && <span className="inline-flex items-center rounded-full bg-white px-3 py-1 border border-slate-200">שפה: {copyleaksDetector.result.scannedDocument?.language || copyleaksDetector.result.requestMeta?.language}</span>}
                            {copyleaksDetector.result.requestMeta?.sandbox && <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">תוצאות הדגמה פעילות</span>}
                            {copyleaksDetector.result.requestMeta?.explain && <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 font-semibold text-indigo-700">פירוט נוסף פעיל</span>}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                          <div className="text-sm font-bold text-slate-800 mb-3">קטעים שסומנו</div>
                          {copyleaksDetector.result.results.length ? (
                            <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                              {copyleaksDetector.result.results.map((entry, index) => (
                                <div key={`${entry.id}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <div className="text-sm font-semibold text-slate-800">{entry.classificationLabel}</div>
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                      {entry.score != null && <span>ציון: {formatCopyleaksPercent(entry.score)}</span>}
                                      {entry.ai != null && <span>נראה כ-AI: {formatCopyleaksPercent(entry.ai)}</span>}
                                      {entry.human != null && <span>נראה אנושי: {formatCopyleaksPercent(entry.human)}</span>}
                                      {(entry.startIndex != null || entry.endIndex != null) && <span>טווח: {entry.startIndex ?? '?'}-{entry.endIndex ?? '?'}</span>}
                                    </div>
                                  </div>
                                  <div className="text-sm leading-7 text-slate-600 whitespace-pre-wrap">{entry.preview || 'Copyleaks לא החזיר טקסט מקטע מפורט עבור פריט זה.'}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-slate-500 leading-7">לא הוחזרו תתי-מקטעים מפורטים עבור הבדיקה הזו.</div>
                          )}
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                          <div className="text-sm font-bold text-slate-800 mb-3">פירוט נוסף</div>
                          {copyleaksDetector.result.explainPatterns.length ? (
                            <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                              {copyleaksDetector.result.explainPatterns.map((pattern) => (
                                <div key={pattern.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <div className="text-sm font-semibold text-slate-800">{pattern.title}</div>
                                    {pattern.score != null && <div className="text-[11px] font-semibold text-indigo-700">{formatCopyleaksPercent(pattern.score)}</div>}
                                  </div>
                                  <div className="text-sm leading-7 text-slate-600">{pattern.text || 'Copyleaks ציין pattern בלי תיאור טקסטואלי נוסף.'}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-slate-500 leading-7">לא הוחזר פירוט נוסף. אם צריך הסבר מפורט יותר, הפעילו את האפשרות "פירוט נוסף" בהגדרות Copyleaks והריצו שוב.</div>
                          )}
                        </div>
                      </>
                    ) : !copyleaksDetector.error ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm text-slate-500 leading-7">
                        Copyleaks יציג כאן אחוזים, הערכה כללית, גרסת מנוע, פרטי הבדיקה, קטעים שסומנו ופירוט נוסף כשזמינים. במצב הדגמה יוצגו תוצאות הדגמה לצורכי בדיקה בלבד.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )}

          {isFeedbackSurveyVisible && (
            <div className="absolute inset-0 z-40 bg-slate-900/35 flex items-center justify-center p-4">
              <div className="w-[760px] max-w-[96%] rounded-[28px] bg-white shadow-2xl border border-slate-200 p-5 md:p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">{feedbackSurvey.phase === 'question' ? 'איך יצא המסמך?' : feedbackSurvey.phase === 'review' ? 'המלצות לעריכה בטיוטה' : 'מה לתקן במסמך?'}</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      {feedbackSurvey.phase === 'question'
                        ? 'אפשר לאשר שהכול מצוין, או לבקש תיקון ישיר של המסמך.'
                        : feedbackSurvey.phase === 'review'
                          ? (feedbackSurvey.submitting ? 'בודק את הטיוטה ומכין המלצות לא מחייבות בלבד.' : 'אלו המלצות עריכה בלבד. המסמך עצמו לא שונה.')
                          : 'בחר את הנקודות החשובות לך, כתוב חופשי מה לשפר, או בקש קודם המלצות בלבד.'}
                    </p>
                  </div>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={closeFeedbackSurvey}
                  >
                    סגור
                  </button>
                </div>

                {feedbackSurvey.usedFallback && (
                  <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    נוצרה כרגע טיוטה בטוחה. אפשר לאשר אותה או לשלוח עכשיו הערות לעדכון ישיר של המסמך.
                  </div>
                )}

                {feedbackSurvey.phase === 'question' ? (
                  <div className="flex flex-col md:flex-row gap-3">
                    <button
                      className="btn btn-primary flex-1"
                      onClick={approveFeedbackSurvey}
                    >
                      כן, המסמך מוכן
                    </button>
                    <button
                      className="btn btn-outline flex-1"
                      onClick={() => {
                        setFeedbackSurvey((prev) => ({ ...prev, phase: 'details' }));
                        setLiveGeneration((prev) => ({ ...prev, active: false }));
                      }}
                    >
                      לא, צריך תיקונים
                    </button>
                  </div>
                ) : feedbackSurvey.phase === 'review' ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-sm font-bold text-slate-800">
                        {feedbackReviewApplying
                          ? 'ממפה את הערות המרצה ליעדי עריכה ומחיל אותן על המסמך...'
                          : feedbackSurvey.submitting
                            ? 'בודק ומכין המלצות לעריכת המסמך...'
                            : (feedbackReviewSummary || 'אלו כמה המלצות לעריכה ממוקדת בטיוטה.')}
                      </div>
                      <div className="mt-2 text-xs leading-6 text-slate-500 whitespace-pre-wrap">
                        {feedbackSurvey.reviewFocus || 'המיקוד לבדיקה לא הוגדר ולכן נבדקה הטיוטה בכללותה.'}
                      </div>
                    </div>

                    {feedbackSurvey.reviewErrorMessage && (
                      <div className={`rounded-2xl px-4 py-3 text-sm ${feedbackReviewUsedFallback ? 'border border-amber-200 bg-amber-50 text-amber-800' : 'border border-rose-200 bg-rose-50 text-rose-700'}`}>
                        {feedbackReviewUsedFallback
                          ? `חלק מההמלצות לא הושלמו במלואן${feedbackSurvey.reviewErrorMessage ? `: ${feedbackSurvey.reviewErrorMessage}` : '.'}`
                          : feedbackSurvey.reviewErrorMessage}
                      </div>
                    )}

                    {feedbackSurvey.submitting || feedbackReviewApplying ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                        {feedbackReviewApplying
                          ? 'מכין תכנית תיקונים ישימה ומחיל אותה על כמה אזורים במסמך, גם כשהם לא באותה פסקה.'
                          : 'ההמלצות נבנות עכשיו לפי המיקוד שביקשת, בלי לשנות עדיין את המסמך עצמו.'}
                      </div>
                    ) : feedbackReviewSuggestions.length ? (
                      <div className="space-y-3 max-h-[48vh] overflow-y-auto pr-1">
                        {feedbackReviewSuggestions.map((suggestion, index) => (
                          <div key={`${suggestion.title || 'review'}-${index}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                            <div className="text-base font-bold text-slate-800">{index + 1}. {suggestion.title || `המלצה ${index + 1}`}</div>
                            <div className="mt-2 text-sm leading-6 text-slate-600">{suggestion.reason}</div>
                            <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-3">
                              <div className="text-[11px] font-bold tracking-[0.16em] text-slate-400">ניסוח מוצע</div>
                              <div className="mt-1 text-sm leading-6 text-slate-700">{suggestion.suggestedChange}</div>
                            </div>
                          </div>
                        ))}
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                          <label className="text-xs font-bold text-amber-900" htmlFor="review-apply-selection">בחר המלצות להחלה</label>
                          <input
                            id="review-apply-selection"
                            className="mt-2 input input-sm input-bordered w-full bg-white text-sm"
                            value={feedbackSurvey.reviewApplySelection}
                            onChange={(event) => setFeedbackSurvey((prev) => ({ ...prev, reviewApplySelection: event.target.value }))}
                            placeholder="ריק = הכל · לדוגמה: 1,2,3 בלי 4,5"
                            disabled={feedbackSurvey.submitting || feedbackReviewApplying}
                          />
                          <div className="mt-2 text-xs leading-5 text-amber-800">
                            {feedbackReviewSelection.hasExplicitSelection
                              ? feedbackReviewSelection.invalid
                                ? 'לא זוהתה בחירה תקינה.'
                                : `יוחלו המלצות: ${feedbackReviewSelection.selectedIndexes.join(', ')}${feedbackReviewSelection.excludedIndexes.length ? ` · דילוג: ${feedbackReviewSelection.excludedIndexes.join(', ')}` : ''}`
                              : 'אם השדה ריק, כל ההמלצות יוחלו.'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                        לא נוצרו המלצות ממוקדות. אפשר לנסות שוב, או לשלוח הערות מדויקות כדי שנבצע תיקון ישיר.
                      </div>
                    )}

                    <div className="flex flex-col md:flex-row gap-3 justify-end">
                      <button
                        className="btn btn-ghost"
                        onClick={() => setFeedbackSurvey((prev) => ({ ...prev, phase: 'details', submitting: false, submissionRequestId: null, applyingRecommendations: false }))}
                        disabled={feedbackSurvey.submitting || feedbackReviewApplying}
                      >
                        שנה מיקוד
                      </button>
                      <button
                        className={`btn btn-outline ${(feedbackSurvey.submitting || feedbackReviewApplying) ? 'btn-disabled' : ''}`}
                        onClick={requestDocumentRecommendations}
                        disabled={feedbackSurvey.submitting || feedbackReviewApplying}
                      >
                        {feedbackSurvey.submitting ? 'מכין המלצות...' : 'רענן המלצות'}
                      </button>
                      <button
                        className={`btn btn-outline ${(feedbackSurvey.submitting || feedbackReviewApplying || !feedbackReviewSuggestions.length) ? 'btn-disabled' : ''}`}
                        onClick={applyFeedbackReviewSuggestions}
                        disabled={feedbackSurvey.submitting || feedbackReviewApplying || !feedbackReviewSuggestions.length}
                      >
                        {feedbackReviewApplying
                          ? 'ממפה ומחיל...'
                          : feedbackReviewSelection.hasExplicitSelection && !feedbackReviewSelection.invalid
                            ? `החל ${feedbackReviewSelection.selectedIndexes.length} המלצות`
                            : 'החל את כל ההמלצות'}
                      </button>
                      <button
                        className={`btn btn-primary ${(feedbackSurvey.submitting || feedbackReviewApplying) ? 'btn-disabled' : ''}`}
                        onClick={submitDocumentFeedback}
                        disabled={feedbackSurvey.submitting || feedbackReviewApplying}
                      >
                        {feedbackSubmitLabel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      {FEEDBACK_OPTION_GROUPS.map((group) => (
                        <div key={group.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="font-bold text-slate-800 mb-3">{group.title}</div>
                          <div className="space-y-2">
                            {group.options.map((option) => (
                              <label key={option} className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="checkbox checkbox-sm mt-0.5"
                                  checked={feedbackSurvey.selectedOptions.includes(option)}
                                  onChange={() => toggleFeedbackOption(option)}
                                />
                                <span>{option}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <div className="font-bold text-slate-800 mb-2">הערה חופשית</div>
                      <textarea
                        className="textarea textarea-bordered w-full min-h-[120px]"
                        placeholder="למשל: חזקי יותר את הטיעון המרכזי, הוסיפי מקור עדכני, קצרי את הפתיחה, או בדקי שוב את ניסוח הסיכום..."
                        value={feedbackSurvey.freeText}
                        onChange={(e) => setFeedbackSurvey((prev) => ({ ...prev, freeText: e.target.value }))}
                      />
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                      <div className="font-bold text-slate-800">סבב תיקון ישיר</div>
                      <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-3">
                        <div className="font-semibold text-slate-800">תיקון ישיר</div>
                        <div className="text-xs text-slate-500 mt-1">סבב מהיר מול המודל הפעיל, בלי שכבת תיאום נוספת.</div>
                      </div>
                      <div className="text-xs text-slate-500">
                        {`סבב תיקון ${feedbackRoundIndex}. אפשר להמשיך לבקש סבבי תיקון נוספים מהמסך הזה כל עוד צריך.`}
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-3 justify-end">
                      <button
                        className="btn btn-ghost"
                        onClick={() => setFeedbackSurvey((prev) => ({ ...prev, phase: 'question' }))}
                        disabled={feedbackSurvey.submitting}
                      >
                        חזור
                      </button>
                      <button
                        className={`btn btn-outline ${feedbackSurvey.submitting ? 'btn-disabled' : ''}`}
                        onClick={requestDocumentRecommendations}
                        disabled={feedbackSurvey.submitting}
                      >
                        קבל המלצות בלבד
                      </button>
                      <button
                        className={`btn btn-primary ${feedbackSurvey.submitting ? 'btn-disabled' : ''}`}
                        onClick={submitDocumentFeedback}
                        disabled={feedbackSurvey.submitting}
                      >
                        {feedbackSubmitLabel}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className={`wordai-document-stage relative w-full flex justify-center ${documentArrival.active ? `wordai-document-arrival wordai-document-arrival--${documentArrival.tone}` : ''}`} style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', transition: 'transform 0.2s' }}>
            <DocumentEditor
              documentStyle={documentStyle}
              documentLayout={documentLayout}
              viewMode={viewMode}
              activeTemplateId={activeTemplateId}
              onReady={handleEditorReady}
              onWordCountChange={setWordCount}
              onCommand={handleCommand}
              wordPreferences={wordPreferences}
              onContextMenuOpen={() => {
                setAssistantAutoPopupBlockedUntil(Date.now() + 2500);
              }}
              onOpenAssistant={(preset = null) => {
                if (Date.now() < assistantAutoPopupBlockedUntil) return;
                if (preset && typeof preset === 'object') {
                  setAssistantLaunchPreset({
                    nonce: Date.now(),
                    classicAgentId: String(preset.classicAgentId || '').trim(),
                    composerMode: String(preset.composerMode || '').trim(),
                    prompt: String(preset.prompt || '').trim(),
                  });
                }
                setAssistantTrigger('manual');
                setLastEditorActivityAt(Date.now());
                setSidebarOpen(true);
              }}
            />
          </div>

        </div>

        {isWordMode && showStartScreen && (
          <div
            className="absolute inset-0 z-30 overflow-y-auto"
            style={{
              opacity: 1,
              transform: prefersReducedMotion ? 'none' : (isStartTransitionRunning ? 'scale(0.992)' : 'scale(1)'),
              filter: prefersReducedMotion ? 'none' : (isStartTransitionRunning ? 'brightness(0.74) saturate(0.84)' : 'none'),
              transition: prefersReducedMotion ? 'none' : 'transform 240ms ease-out, filter 220ms linear',
              pointerEvents: isStartTransitionRunning ? 'none' : 'auto',
            }}
          >
            <div
              style={{
                minHeight: '100%',
                animation: prefersReducedMotion || !isStartTransitionRunning
                  ? 'none'
                  : `wordai-start-transition-shake 360ms cubic-bezier(0.22, 1, 0.36, 1) ${getStartScreenTransitionDelayMs(-4)} both`,
                transformOrigin: 'center center',
                willChange: isStartTransitionRunning ? 'transform' : undefined,
              }}
            >
              <StartScreen
                onOpenHelp={openHelpTopic}
                instructionsResetToken={startScreenInstructionsResetToken}
                onInstructionsResetConsumed={() => setStartScreenInstructionsResetToken(0)}
                documentStyle={documentStyle}
                onDocumentStyleChange={changeDocumentStyle}
                escapeBlocked={fileMenuOpen || isInputDialogVisible || isCopyleaksDetectorVisible || isFeedbackSurveyVisible}
                onClose={() => {
                  runStartTransition(() => {}, 'start');
                }}
                hasOpenDocument={Boolean(editor && editor.getText && editor.getText().trim())}
                hasDraft={wordPreferences.keepLastAutosavedVersion !== false && Boolean(getPersistedDraftHtml())}
                lastSavedAt={getPersistedDraftSavedAt()}
                onCreateBlank={() => {
                  if (!confirmReplaceCurrentDocument()) return;
                  clearPersistedDraftCache();
                  clearDraftReviewState();
                  clearAssignmentBrief();
                  runStartTransition((activeEditor) => {
                    activeEditor.commands.clearContent();
                    beginDocumentIdentity({ filePath: '' });
                    persistActiveTemplateId('blank');
                    syncPersistedAppSettings();
                    setActiveTemplateId('blank');
                  }, 'start');
                }}
                onCreateTemplate={(template) => {
                  if (!confirmReplaceCurrentDocument()) return;
                  const templateId = typeof template === 'string' ? template : template?.id;
                  const templateExamples = Array.isArray(template?.examples) ? template.examples : [];
                  clearPersistedDraftCache();
                  clearDraftReviewState();
                  clearAssignmentBrief();
                  runStartTransition((activeEditor) => {
                    beginDocumentIdentity({ filePath: '' });
                    persistActiveTemplateId(templateId || 'blank');
                    syncPersistedAppSettings();
                    setActiveTemplateId(templateId || 'blank');
                    const recommendedStyle = {
                      academic: 'academic',
                      legal: 'legal',
                      report: 'business',
                      summary: 'presentation',
                      office: 'business',
                      proposal: 'business',
                      letter: 'legal',
                    };
                    changeDocumentStyle(recommendedStyle[templateId] || documentStyle);
                    activeEditor.commands.setContent(applyDefaultCoverPage(
                      buildTemplateSkeleton(templateId, '', templateExamples),
                      { assignmentType: TEMPLATE_ASSIGNMENT_LABELS[templateId] || '' },
                    ));
                  }, 'start');
                }}
                onOpenDocument={(payload) => {
                  if (payload && typeof payload === 'object' && ('html' in payload || 'filePath' in payload || 'ok' in payload || 'error' in payload || 'canceled' in payload)) {
                    applyImportedDocument(payload);
                    return;
                  }
                  handleCommand('openFile');
                }}
                onOpenLastDraft={() => {
                  if (!confirmReplaceCurrentDocument()) return;
                  const savedDraft = wordPreferences.keepLastAutosavedVersion === false
                    ? null
                    : getPersistedDraftHtml();
                  clearDraftReviewState();
                  runStartTransition((activeEditor) => {
                    if (savedDraft) activeEditor.commands.setContent(savedDraft);
                    beginDocumentIdentity({ filePath: '' });
                    setActiveTemplateId(getPersistedActiveTemplateId());
                  }, 'end');
                }}
                onOpenSettings={(targetTab = 'guide') => {
                  setFileMenuTargetTab(targetTab || 'guide');
                  setFileMenuOpen(true);
                }}
                onGenerateFromPrompt={(payload) => executeStartScreenGeneration({
                  kind: 'start-screen-generate',
                  workspaceId: payload?.workspaceId || getActiveWorkspaceId(),
                  payload,
                })}
                onGeneratePresentation={(payload) => generatePresentationDeck(payload)}
                onUploadDocDraft={handleUploadDocDraft}
                onOpenSpssProject={() => enterStudioMode('spss-project')}
                onOpenAssignmentScaffold={() => enterStudioMode('assignment-scaffold')}
                onOpenProjectHub={(project) => {
                  if (!project?.id) return;
                  setProjectHubProjectId(project.id);
                  enterStudioMode('project-hub');
                }}
                projectDocSeed={projectHubDocSeed}
                onProjectDocSeedConsumed={() => setProjectHubDocSeed(null)}
              />
            </div>
          </div>
        )}

        {/* עט קסמים צף */}
        {isWordMode && !showStartScreen && <MagicWand
          sidebarOpen={sidebarOpen}
          escapeBlocked={fileMenuOpen || isInputDialogVisible || isCopyleaksDetectorVisible || isFeedbackSurveyVisible || sidebarOpen}
          documentContext={() => editor ? editor.getText().slice(0, 7000) : ''}
          selectedText={selectedText}
          selectionContext={selectionContext}
          shortcuts={shortcuts}
          onInsert={(text) => {
            if (editor) editor.chain().focus().insertContent(text).run();
          }}
        />}

        <AuthenticityModal
          open={authenticityOpen}
          onClose={() => setAuthenticityOpen(false)}
          getText={() => (editor ? editor.getText() : '')}
        />

        {isWordMode && isStartTransitionRunning && <StartScreenTransitionOverlay />}
      </main>
      {isWordMode && !showStartScreen && assignmentBriefOpen && (
        <div className={`pointer-events-none fixed z-40 ${isMobileViewport ? 'inset-0 p-3' : 'inset-x-0 bottom-10 top-24'}`}>
          <aside className={`pointer-events-auto overflow-hidden rounded-[28px] border border-amber-200/80 bg-white/95 shadow-[0_22px_70px_rgba(120,53,15,0.18)] backdrop-blur ${isMobileViewport ? 'absolute inset-0' : 'absolute left-4 top-4 bottom-4 w-[min(34rem,calc(100vw-2rem))]'}`}>
            <input
              ref={assignmentBriefFileInputRef}
              type="file"
              accept={getInstructionFileAcceptList()}
              onChange={handleAssignmentBriefFileSelected}
              className="hidden"
            />
            <div className="flex items-start justify-between gap-3 border-b border-amber-100 bg-gradient-to-br from-amber-50 via-white to-orange-50 px-5 py-4">
              <div className="min-w-0">
                <div className="text-[11px] font-bold tracking-[0.24em] text-amber-700">TASK BRIEF</div>
                <div className="mt-1 text-lg font-bold text-slate-900">הוראות המטלה</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {assignmentBrief.sourceLabel ? (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">{assignmentBrief.sourceLabel}</span>
                  ) : null}
                  {assignmentBrief.fileName ? (
                    <span className="truncate rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800">{assignmentBrief.fileName}</span>
                  ) : null}
                  <span>{assignmentBrief.text.length.toLocaleString('he-IL')} תווים</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssignmentBriefOpen(false)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                סגור
              </button>
            </div>
            <div className="h-full overflow-y-auto px-5 py-4">
              <div className="flex flex-wrap items-center gap-2 pb-4">
                <button
                  type="button"
                  onClick={() => assignmentBriefFileInputRef.current?.click()}
                  className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
                >
                  טען קובץ הוראות
                </button>
                <button
                  type="button"
                  onClick={saveAssignmentBriefDraft}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                >
                  שמור למסמך
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAssignmentBriefDraft('');
                    clearAssignmentBrief();
                  }}
                  className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                >
                  נקה הוראות
                </button>
                <div className="text-xs text-slate-500">
                  כאן אפשר להדביק הוראות ידנית או לשייך קובץ הוראות למסמך הפעיל.
                </div>
              </div>
              <div className="mb-4 inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setAssignmentBriefPanelMode('preview')}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    assignmentBriefPanelMode === 'preview'
                      ? 'bg-amber-100 text-amber-900'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  תצוגה
                </button>
                <button
                  type="button"
                  onClick={() => setAssignmentBriefPanelMode('edit')}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    assignmentBriefPanelMode === 'edit'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  עריכה
                </button>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-3">
                {assignmentBriefPanelMode === 'preview' ? (
                  renderAssignmentBriefPreview(assignmentBriefPreviewBlocks)
                ) : (
                  <textarea
                    value={assignmentBriefDraft}
                    onChange={(event) => setAssignmentBriefDraft(event.target.value)}
                    placeholder="הדבק כאן את הוראות המטלה, הדרישות, הסעיפים או הערות המרצה..."
                    className="min-h-[42vh] w-full resize-none rounded-[18px] border border-slate-200 bg-white px-4 py-4 text-[15px] leading-7 text-slate-700 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                  />
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
      <footer id="status-bar" className="min-h-6 bg-[#2B579A] text-white flex flex-row items-center justify-between gap-1 px-3 py-1 text-[11px] shrink-0 z-30 sm:h-6 sm:px-4">
        {isSpssMode ? (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>SPSS Syntax Studio פעיל</span>
              <span><i className="ph ph-shield-check text-green-300"></i> רק metadata טוקניזי נשלח ל-AI</span>
            </div>
            <div className="hidden sm:flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>Tutor mode נשלט מתוך הסטודיו</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>עמוד 1 מתוך {pageCount}</span>
              <span>{wordCount} מילים</span>
              <span className="hidden sm:inline"><i className="ph ph-check text-green-400"></i> עברית (ישראל)</span>
            </div>
            <div className="hidden sm:flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{VIEW_MODE_LABELS[viewMode] || 'מצב הדפסה'}</span>
              <span>{zoom}%</span>
              <a href="legal/privacy.html" target="_blank" rel="noopener noreferrer" className="text-white/85 underline-offset-2 hover:text-white hover:underline">פרטיות</a>
              <a href="legal/terms.html" target="_blank" rel="noopener noreferrer" className="text-white/85 underline-offset-2 hover:text-white hover:underline">תנאי שימוש</a>
              <a href="legal/accessibility.html" target="_blank" rel="noopener noreferrer" className="text-white/85 underline-offset-2 hover:text-white hover:underline">נגישות</a>
            </div>
          </>
        )}
      </footer>

      {/* File Menu Backstage — מחוץ ל-word רק במצב settings-only (deep-link עם טאב יעד) */}
      {(isWordMode || fileMenuTargetTab) && fileMenuOpen && (
        <FileMenuErrorBoundary
          onClose={() => {
            setFileMenuOpen(false);
            setFileMenuTargetTab(null);
            setUpdateCheckToken(0);
          }}
        >
          <FileMenu
            initialSettingsTab={fileMenuTargetTab}
            updateCheckToken={updateCheckToken}
            onClose={() => {
              setFileMenuOpen(false);
              setFileMenuTargetTab(null);
              setUpdateCheckToken(0);
            }}
            onCommand={(cmd, value) => handleCommand(cmd, value)}
            shortcuts={shortcuts}
            onShortcutsChange={setShortcuts}
            assistantBehavior={assistantBehavior}
            onAssistantBehaviorChange={setAssistantBehavior}
            wordPreferences={wordPreferences}
            onWordPreferencesChange={setWordPreferences}
            lastGenerationAction={lastGenerationAction}
            liveGeneration={liveGeneration}
          />
        </FileMenuErrorBoundary>
      )}

      {helpModalOpen && (
        <HelpModal
          isOpen={helpModalOpen}
          onClose={() => setHelpModalOpen(false)}
          topic={helpModalTopic}
        />
      )}

      {showWelcome && (
        <WelcomeGate
          cloudUser={cloudUser}
          cloudAvailable={cloudAvailable}
          onSignIn={handleCloudGoogleSignIn}
          onFinish={({ openOnboarding } = {}) => {
            if (typeof localStorage !== 'undefined') localStorage.setItem('wordai_welcome_seen', '1');
            setShowWelcome(false);
            if (openOnboarding) {
              setFileMenuTargetTab('onboarding');
              setFileMenuOpen(true);
            }
          }}
        />
      )}

      <CloudUnlockGate user={cloudUser} />

      {appMode === 'word' && findReplace.open && editor && !showStartScreen && (
        <FindReplace
          editor={editor}
          open={findReplace.open}
          mode={findReplace.mode}
          onClose={() => setFindReplace((prev) => ({ ...prev, open: false }))}
        />
      )}

      {appMode === 'word' && sourceManagerOpen && (
        <SourceManager
          open={sourceManagerOpen}
          editor={editor}
          onCommand={handleCommand}
          onClose={() => setSourceManagerOpen(false)}
        />
      )}

      {appMode === 'word' && commentsPanelOpen && (
        <CommentsPanel
          open={commentsPanelOpen}
          comments={comments}
          activeCommentId={activeCommentId}
          onClose={() => setCommentsPanelOpen(false)}
          onUpdateBody={(id, body) => setComments((prev) => prev.map((c) => (c.id === id ? { ...c, body } : c)))}
          onAddReply={(id, text) => setComments((prev) => prev.map((c) => (c.id === id ? { ...c, replies: [...(c.replies || []), { id: `r_${Date.now()}`, text }] } : c)))}
          onResolve={(id) => { if (editor) removeCommentById(editor, id); setComments((prev) => prev.map((c) => (c.id === id ? { ...c, resolved: true } : c))); }}
          onDelete={(id) => { if (editor) removeCommentById(editor, id); setComments((prev) => prev.filter((c) => c.id !== id)); }}
          onScrollTo={(id) => {
            setActiveCommentId(id);
            const dom = document.querySelector('.ProseMirror');
            const el = dom?.querySelector(`span[data-comment-id="${id}"]`);
            if (el) {
              el.scrollIntoView({ block: 'center', behavior: 'smooth' });
              el.classList.add('comment-active');
              window.setTimeout(() => el.classList.remove('comment-active'), 1200);
            }
          }}
        />
      )}

      {appMode === 'word' && trackPanelOpen && (
        <TrackChangesPanel
          open={trackPanelOpen}
          changes={trackedChanges}
          trackingEnabled={trackChanges}
          onClose={() => setTrackPanelOpen(false)}
          onAccept={(change) => { acceptTrackedChange(editor, change); setTrackedChanges(collectTrackedChanges(editor)); }}
          onReject={(change) => { rejectTrackedChange(editor, change); setTrackedChanges(collectTrackedChanges(editor)); }}
          onAcceptAll={() => { acceptInsertions(editor); setTrackedChanges([]); }}
          onRejectAll={() => { rejectInsertions(editor); setTrackedChanges([]); }}
          onScrollTo={(change) => {
            const from = change?.ranges?.[0]?.from;
            if (typeof from !== 'number' || !editor) return;
            editor.chain().focus().setTextSelection(Math.min(from, editor.state.doc.content.size)).run();
            const dom = editor.view.domAtPos(Math.min(from + 1, editor.state.doc.content.size))?.node;
            (dom?.nodeType === 1 ? dom : dom?.parentElement)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }}
        />
      )}
    </div>
  );
}

const rootElement = document.getElementById('app');
if (rootElement) {
  class ErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { error: null }; }
    static getDerivedStateFromError(error) { return { error }; }
    componentDidCatch(error, info) {
      console.error('[ErrorBoundary]', error, info);
      if (window.__showCrashOverlay) window.__showCrashOverlay(error?.message || String(error));
    }
    render() {
      if (this.state.error) return null; // ה-overlay הוצג מ-componentDidCatch
      return this.props.children;
    }
  }
  const appRoot = rootElement.__wordflowReactRoot || ReactDOM.createRoot(rootElement);
  rootElement.__wordflowReactRoot = appRoot;
  appRoot.render(
    <ErrorBoundary><App /></ErrorBoundary>
  );
  window.__wordflowAppMounted = true;
}

export default App;
