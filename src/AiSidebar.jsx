import React, { useState, useRef, useEffect, useCallback } from "react";
import { chatWithActiveProvider, getConfiguredProviderChoices, getOrderedRoleAgents, chatWithRoleAgent, getWorkspaceAutomation, saveWorkspaceAutomation, getAgentDebugLogs, clearAgentDebugLogs, getSkillCatalog, getSkillsConfig, getAppMemory, saveAppMemory, getActiveProviderName } from "./services/aiService";
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
];

const LEGACY_CHAT_MEMORY_STORAGE_KEY = 'wordai_sidebar_messages';
const getChatMemoryStorageKey = (workspaceId = '') => {
  const resolvedWorkspaceId = String(workspaceId || getWorkspaceAutomation().activeWorkspaceId || 'default-content-studio').trim() || 'default-content-studio';
  return `${LEGACY_CHAT_MEMORY_STORAGE_KEY}:${resolvedWorkspaceId}`;
};

const getDefaultMessages = () => ([
  { 
    role: 'assistant', 
    content: `שלום! אני כאן בצ'אט ישיר עם ספק ה-AI שלך 🤖\n\nאני רואה את ההקשר של המסמך, אז אפשר לשאול גם בקצרה:\n• "נראה ארוך אה?" 🤔\n• "יש מקור לזה?" 📚\n• "תחדד לי את זה" 💡\n\nמה נכתוב היום?`,
    timestamp: Date.now()
  }
]);

const getSavedMessages = (workspaceId = '') => {
  const storageKey = getChatMemoryStorageKey(workspaceId);
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(parsed) && parsed.length) return parsed.slice(-60);

    const legacyParsed = JSON.parse(localStorage.getItem(LEGACY_CHAT_MEMORY_STORAGE_KEY) || '[]');
    if (Array.isArray(legacyParsed) && legacyParsed.length) {
      const migratedMessages = legacyParsed.slice(-60);
      localStorage.setItem(storageKey, JSON.stringify(migratedMessages));
      localStorage.removeItem(LEGACY_CHAT_MEMORY_STORAGE_KEY);
      return migratedMessages;
    }

    return getDefaultMessages();
  } catch {
    return getDefaultMessages();
  }
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

export default function AiSidebar({ onClose, documentContext, onInsert, selectedText, currentBlockText = '', mode = 'popup', reason = 'manual', compactMode = mode === 'sidebar', onToggleCompact = () => {}, wordPreferences = {} }) {
  const [tab, setTab] = useState('chat');
  const [workspaceAutomation, setWorkspaceAutomation] = useState(() => getWorkspaceAutomation());
  const [roleAgents, setRoleAgents] = useState(() => getOrderedRoleAgents(getWorkspaceAutomation().workflowMode));
  const [messages, setMessages] = useState(() => getSavedMessages(getWorkspaceAutomation().activeWorkspaceId));
  const [input, setInput] = useState('');
  const [agentTaskInput, setAgentTaskInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeAgentStatus, setActiveAgentStatus] = useState(() => ({ ...IDLE_AGENT_STATUS }));
  const [agentProgressMap, setAgentProgressMap] = useState({});
  const [showLogs, setShowLogs] = useState(false);
  const [debugLogs, setDebugLogs] = useState(() => {
    const initialAutomation = getWorkspaceAutomation();
    return getAgentDebugLogs({ workspaceId: initialAutomation.activeWorkspaceId, includeUnscoped: false }).slice(-60).reverse();
  });
  const [selectedProviderId, setSelectedProviderId] = useState(() => getAppMemory().sidebarProviderId || 'default');
  const [selectedAgentId, setSelectedAgentId] = useState(() => getAppMemory().lastSelectedAgentId || '');
  const [selectedSkillId, setSelectedSkillId] = useState(() => getAppMemory().lastSelectedSkillId || 'none');
  const [resolvedSkillLabel, setResolvedSkillLabel] = useState(() => getAppMemory().lastResolvedSkillLabel || '');
  const [requestSnapshot, setRequestSnapshot] = useState(null);
  const [mentionMenu, setMentionMenu] = useState(() => ({ ...EMPTY_MENTION_MENU }));
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const messagesRef = useRef(null);
  const inputRef = useRef(null);
  const activeWorkspaceIdRef = useRef(String(getWorkspaceAutomation().activeWorkspaceId || ''));
  const pendingMentionSelectionRef = useRef({ ...EMPTY_PENDING_MENTION_SELECTION });
  const preservePendingMentionRef = useRef(false);
  const requestCycleRef = useRef(0);

  const docCtx = (typeof documentContext === 'function' ? documentContext() : (documentContext || '')).slice(0, 6000);
  const localContext = selectedText || currentBlockText;
  const quickPromptList = compactMode ? CONTEXT_PROMPTS.slice(0, 4) : CONTEXT_PROMPTS;
  const visibleActions = MODERN_QUICK_ACTIONS.filter((action) => wordPreferences?.aiQuickActions?.[action.id] !== false);
  const selectionActions = visibleActions.filter((action) => action.sel);
  const generationActions = visibleActions.filter((action) => !action.sel);
  const skillCatalog = getSkillCatalog();
  const skillsConfig = getSkillsConfig();
  const configuredProviderChoices = getConfiguredProviderChoices();
  const workspaceAutomationEnabled = workspaceAutomation?.enabled === true;
  const activeProviderChoice = configuredProviderChoices.find((choice) => choice.id === selectedProviderId) || null;
  const activeProviderLabel = activeProviderChoice?.label || getActiveProviderName();
  const activeProviderSummary = activeProviderChoice ? activeProviderLabel : `${activeProviderLabel} · ברירת מחדל`;
  const activeAgent = workspaceAutomationEnabled
    ? roleAgents.find((agent) => agent.id === selectedAgentId) || null
    : null;
  const activeSkill = selectedSkillId !== 'none'
    ? skillCatalog.find((skill) => skill.id === selectedSkillId) || null
    : null;
  const contextScopeLabel = selectedText ? 'טקסט נבחר' : currentBlockText ? 'הפסקה הנוכחית' : 'המסמך כולו';
  const contextSourceText = localContext || '';
  const contextPreview = contextSourceText
    ? `${contextSourceText.replace(/\s+/g, ' ').slice(0, 96)}${contextSourceText.length > 96 ? '…' : ''}`
    : '';
  const effectiveProviderSummary = loading && requestSnapshot?.providerLabel ? requestSnapshot.providerLabel : activeProviderSummary;
  const effectiveAgentSummary = loading && requestSnapshot?.agentLabel ? requestSnapshot.agentLabel : (activeAgent ? activeAgent.name : 'צ׳אט ישיר');
  const effectiveSkillSummary = loading && requestSnapshot?.skillLabel ? requestSnapshot.skillLabel : (activeSkill ? activeSkill.label : 'אוטומטי');
  const effectiveScopeSummary = loading && requestSnapshot?.scopeLabel ? requestSnapshot.scopeLabel : contextScopeLabel;
  const effectiveContextPreview = loading && requestSnapshot?.contextPreview ? requestSnapshot.contextPreview : contextPreview;
  const isSettingsLocked = loading;
  const progressPercent = Math.min(100, Math.max(Math.round(activeAgentStatus.progress || 0), loading ? 8 : 0));
  const progressTone = activeAgentStatus.state === 'error'
    ? {
        background: 'rgba(239, 68, 68, 0.2)',
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
      setMessages(getSavedMessages(nextAutomation.activeWorkspaceId));
      setDebugLogs(getAgentDebugLogs({ workspaceId: nextAutomation.activeWorkspaceId, includeUnscoped: false }).slice(-60).reverse());
      if (shouldResetWorkspaceState) {
        beginRequestCycle();
        setLoading(false);
        setRequestSnapshot(null);
        setActiveAgentStatus({ ...IDLE_AGENT_STATUS });
        setAgentProgressMap({});
        setSelectedAgentId('');
        clearPendingMentionSelection();
        setMentionMenu({ ...EMPTY_MENTION_MENU });
      }
    };

    syncWorkspace();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('wordai-workspace-changed', syncWorkspace);
    return () => window.removeEventListener('wordai-workspace-changed', syncWorkspace);
  }, [beginRequestCycle, clearPendingMentionSelection]);

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
    try {
      localStorage.setItem(getChatMemoryStorageKey(workspaceAutomation.activeWorkspaceId), JSON.stringify(messages.slice(-60)));
      saveAppMemory({
        ...getAppMemory(),
        sidebarProviderId: selectedProviderId || 'default',
        lastSelectedAgentId: selectedAgentId || '',
        lastSelectedSkillId: selectedSkillId || 'none',
        lastResolvedSkillLabel: resolvedSkillLabel || '',
      });
    } catch {}
  }, [messages, selectedProviderId, selectedAgentId, selectedSkillId, resolvedSkillLabel]);

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
      localStorage.removeItem(getChatMemoryStorageKey(workspaceAutomation.activeWorkspaceId));
    } catch {}
    clearPendingMentionSelection();
    setMessages(getDefaultMessages());
    setInput('');
    setAgentTaskInput('');
    setLoading(false);
    setResolvedSkillLabel('');
    setRequestSnapshot(null);
    setActiveAgentStatus({ ...IDLE_AGENT_STATUS });
    setAgentProgressMap({});
    setMentionMenu({ ...EMPTY_MENTION_MENU });
  }, [beginRequestCycle, clearPendingMentionSelection, workspaceAutomation.activeWorkspaceId]);

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

  const buildContext = () => (
    selectedText
      ? `טקסט נבחר: "${selectedText}"\n\nפסקה נוכחית: "${currentBlockText}"\n\n${docCtx}`
      : currentBlockText
        ? `פסקה נוכחית: "${currentBlockText}"\n\n${docCtx}`
        : docCtx
  );

  const executeRoleAgentTask = async (agent, task, runtimeOptions = {}) => {
    if (!agent?.prompt || loading) return;
    const requestCycle = beginRequestCycle();
    const ctx = buildContext();
    const requestedSkill = runtimeOptions.skillId
      ? skillCatalog.find((skill) => skill.id === runtimeOptions.skillId) || null
      : null;
    const runtimeSkillLabel = runtimeOptions.skillLabel || (requestedSkill ? requestedSkill.label : runtimeOptions.autoUseDefaultSkill === false ? 'ללא סקיל' : 'אוטומטי');
    const safeAgentLabel = typeof agent.name === 'string' ? agent.name : (agent.name?.label || agent.name?.he || agent.id || 'סוכן');
    setTab('chat');
    if (runtimeOptions.persistSelection !== false) setSelectedAgentId(agent.id);
    setRequestSnapshot({
      providerLabel: runtimeOptions.providerLabel || activeProviderSummary,
      agentLabel: safeAgentLabel,
      skillLabel: runtimeSkillLabel,
      scopeLabel: runtimeOptions.scopeLabel || contextScopeLabel,
      contextPreview: runtimeOptions.contextPreview || contextPreview,
    });
    setMessages((prev) => [...prev, { role: 'user', content: `🧩 ${agent.name}: ${task}` }]);
    setLoading(true);
    updateAgentStatus(agent.id, safeAgentLabel, { state: 'running', progress: 10, message: 'הסוכן התחיל לעבוד' });
    try {
      const reply = await chatWithRoleAgent(agent, task, ctx, {
        onStatus: (payload) => {
          if (!isCurrentRequestCycle(requestCycle)) return;
          updateAgentStatus(agent.id, safeAgentLabel, payload);
        },
        skillId: runtimeOptions.skillId || '',
        autoUseDefaultSkill: runtimeOptions.autoUseDefaultSkill !== false,
        providerOverride: runtimeOptions.providerOverride || '',
        strictProviderOverride: runtimeOptions.strictProviderOverride === true,
      });
      if (!isCurrentRequestCycle(requestCycle)) return;
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      setDraftInput('');
      setAgentTaskInput('');
      updateAgentStatus(agent.id, safeAgentLabel, { state: 'success', progress: 100, message: 'סיים בהצלחה' });
    } catch (err) {
      if (!isCurrentRequestCycle(requestCycle)) return;
      setMessages((prev) => [...prev, { role: 'assistant', content: `❌ ${err.message}`, error: true }]);
      updateAgentStatus(agent.id, safeAgentLabel, { state: 'error', progress: 100, message: err.message || 'שגיאה' });
    } finally {
      if (!isCurrentRequestCycle(requestCycle)) return;
      setLoading(false);
      setRequestSnapshot(null);
      inputRef.current?.focus();
    }
  };

  const send = async (customPrompt, extraSystemPrompt = '', agentMeta = { id: 'assistant-main', name: 'צ׳אט ישיר' }) => {
    const pendingMentionSelection = pendingMentionSelectionRef.current;
    const hasPendingMentionSelection = Boolean(pendingMentionSelection.agentId || pendingMentionSelection.skillId);
    const originalText = (customPrompt || input).trim();
    if ((!originalText && !hasPendingMentionSelection) || loading) return;
    if (!customPrompt) setInput('');
    closeMentionMenu();

    let txt = originalText;
    let manualSkillId = selectedSkillId === 'none' ? '' : selectedSkillId;
    let forcedAgent = workspaceAutomationEnabled ? activeAgent : null;
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

    if (workspaceAutomationEnabled && !usedDraftAgentMention && pendingMentionSelection.agentId) {
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

    const requestedSkill = manualSkillId
      ? skillCatalog.find((skill) => skill.id === manualSkillId) || null
      : null;
    const runtimeSkillLabel = requestedSkill
      ? requestedSkill.label
      : disabledSkillRequested
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

    const directProviderId = activeProviderChoice?.id || '';
    const hasExplicitProviderSelection = Boolean(directProviderId);
    const explicitProviderLabel = hasExplicitProviderSelection ? activeProviderLabel : activeProviderSummary;
    clearPendingMentionSelection();

    if (forcedAgent) {
      await executeRoleAgentTask(forcedAgent, txt, {
        skillId: manualSkillId,
        skillLabel: runtimeSkillLabel,
        autoUseDefaultSkill: disabledSkillRequested ? false : !manualSkillId,
        persistSelection: !usedDraftAgentMention && !usedQueuedAgentMention,
        providerLabel: explicitProviderLabel,
        providerOverride: directProviderId,
        strictProviderOverride: hasExplicitProviderSelection,
        scopeLabel: contextScopeLabel,
        contextPreview,
      });
      return;
    }

    const ctx = buildContext();
    const directAgentName = hasExplicitProviderSelection ? `${agentMeta.name} · ${activeProviderLabel}` : agentMeta.name;
    setMessages((prev) => [...prev, { role: 'user', content: originalText }]);
    setRequestSnapshot({
      providerLabel: hasExplicitProviderSelection ? activeProviderLabel : activeProviderSummary,
      agentLabel: directAgentName,
      skillLabel: runtimeSkillLabel,
      scopeLabel: contextScopeLabel,
      contextPreview,
    });
    const requestCycle = beginRequestCycle();
    setLoading(true);
    updateAgentStatus(agentMeta.id, directAgentName, { state: 'running', progress: 10, message: 'מתחיל טיפול' });
    try {
      const reply = await chatWithActiveProvider(txt, ctx, extraSystemPrompt, {
        agentLabel: directAgentName,
        skillId: manualSkillId,
        autoUseDefaultSkill: disabledSkillRequested ? false : !manualSkillId,
        providerOverride: directProviderId,
        strictProviderOverride: hasExplicitProviderSelection,
        skipAutomation: true,
        skipAutomationPrompt: true,
        skipMultiModel: hasExplicitProviderSelection,
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
        },
      });
      if (!isCurrentRequestCycle(requestCycle)) return;
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      updateAgentStatus(agentMeta.id, directAgentName, { state: 'success', progress: 100, message: 'הושלם' });
    } catch (err) {
      if (!isCurrentRequestCycle(requestCycle)) return;
      setMessages((prev) => [...prev, { role: 'assistant', content: `❌ ${err.message}`, error: true }]);
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
    const task = customTask
      ? `${customTask}${selectedText ? `\n\nטקסט רלוונטי:\n"${selectedText}"` : ''}${currentBlockText && !selectedText ? `\n\nפסקה רלוונטית:\n"${currentBlockText}"` : ''}`
      : selectedText
        ? `עבוד על הטקסט הבא לפי התפקיד שלך:\n\n"${selectedText}"`
        : currentBlockText
          ? `עבוד על הפסקה הנוכחית לפי התפקיד שלך:\n\n"${currentBlockText}"`
          : (input.trim() || 'סייע לי עם המסמך הנוכחי לפי התפקיד שלך.');
      const directProviderId = activeProviderChoice?.id || '';
      const hasExplicitProviderSelection = Boolean(directProviderId);
    await executeRoleAgentTask(agent, task, {
      skillId: selectedSkillId === 'none' ? '' : selectedSkillId,
      autoUseDefaultSkill: selectedSkillId === 'none',
        providerLabel: hasExplicitProviderSelection ? activeProviderLabel : activeProviderSummary,
        providerOverride: directProviderId,
        strictProviderOverride: hasExplicitProviderSelection,
        scopeLabel: contextScopeLabel,
        contextPreview,
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
    send(`${action.prompt}${selectedText ? `:\n\n"${selectedText}"` : ''}`);
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
                  {msg.content}
                  
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
                
                {msg.role === 'assistant' && !msg.error && onInsert && (
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
                    ➕ הוסף למסמך
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
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="💬 כתוב בחופשיות... @ לסוכנים, / לסקילים"
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
                disabled={loading}
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
            <label
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
                cursor: isSettingsLocked ? 'not-allowed' : 'pointer',
                opacity: isSettingsLocked ? 0.7 : 1,
              }}
            >
              <span style={{ display: 'grid', gap: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#E2E8F0' }}>🏢 סביבת עבודה</span>
                <span style={{ fontSize: 11, color: 'rgba(226, 232, 240, 0.72)', lineHeight: 1.5 }}>
                  כשמכבים, הצ׳אט חוזר למסלול ישיר עם מנוע ברירת המחדל.
                </span>
              </span>
              <input
                type="checkbox"
                checked={workspaceAutomationEnabled}
                disabled={isSettingsLocked}
                onChange={(e) => {
                  clearPendingMentionSelection();
                  const enabled = e.target.checked;
                  const nextAutomation = saveWorkspaceAutomation({
                    ...workspaceAutomation,
                    enabled,
                  });
                  setWorkspaceAutomation(nextAutomation);
                  if (!enabled) {
                    setSelectedProviderId('default');
                    setSelectedAgentId('');
                  }
                }}
                style={{ width: 16, height: 16, accentColor: '#60A5FA', cursor: isSettingsLocked ? 'not-allowed' : 'pointer' }}
              />
            </label>

            <div style={controlLabelStyle}>🛰️ ספק לשיחה</div>
            <div style={controlHelperStyle}>
              כאן מגדירים override מקומי לצ׳אט. בחירת ברירת מחדל נשענת על ההגדרות הכלליות שלך.
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
          </div>

          <div style={controlCardStyle}>
            <div style={controlLabelStyle}>⚙️ סקיל פעיל</div>
            <div style={controlHelperStyle}>
              אפשר להשאיר בחירה אוטומטית, לקבע סקיל ידני, או לזמן זמנית מתוך הקלט עם `/skill`.
            </div>
            <select
              value={selectedSkillId}
              onChange={(e) => {
                clearPendingMentionSelection();
                setSelectedSkillId(e.target.value);
              }}
              disabled={isSettingsLocked}
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
              בחירה כאן מפנה את ההודעות הבאות לסוכן עד שמחליפים אותו. `@agent` מתוך הצ׳אט נשאר חד־פעמי לשליחה הנוכחית בלבד.
              {!workspaceAutomationEnabled ? ' כרגע סביבת העבודה כבויה, לכן הבחירה הזו נעולה והודעות נשלחות ישירות.' : ''}
            </div>
            <select
              value={selectedAgentId}
              onChange={(e) => {
                clearPendingMentionSelection();
                setSelectedAgentId(e.target.value);
              }}
              disabled={isSettingsLocked || !workspaceAutomationEnabled}
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
                      send(prompt.text);
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


