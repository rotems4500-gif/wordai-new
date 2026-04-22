import React, { useState, useRef, useEffect } from "react";
import { chatWithActiveProvider, getActiveProviderName, getOrderedRoleAgents, chatWithRoleAgent, getWorkspaceAutomation, getAgentDebugLogs, clearAgentDebugLogs, getSkillCatalog, getSkillsConfig, getAppMemory, saveAppMemory } from "./services/aiService";

const CONTEXT_PROMPTS = [
  '🤔 נראה ארוך אה?',
  '📚 יש מקור למה שאמרתי?', 
  '💡 תחדד לי את זה',
  '🎓 תן ניסוח אקדמי',
  '✂️ תקצר בלי לפגוע בטיעון',
  '🚀 איך ממשיכים מכאן?',
];

const MODERN_QUICK_ACTIONS = [
  { 
    id: 'fix', 
    icon: '✨', 
    label: 'תקן שגיאות', 
    prompt: 'תקן שגיאות כתיב ודקדוק', 
    sel: true,
    color: 'from-red-400 to-pink-500',
    category: 'edit'
  },
  { 
    id: 'humanize', 
    icon: '👤', 
    label: 'הפוך לאנושי', 
    prompt: 'שכתב בסגנון אנושי וטבעי', 
    sel: true,
    color: 'from-blue-400 to-indigo-500',
    category: 'style'
  },
  { 
    id: 'summary', 
    icon: '📝', 
    label: 'סכם', 
    prompt: 'סכם בנקודות עיקריות קצרות', 
    sel: true,
    color: 'from-green-400 to-emerald-500',
    category: 'transform'
  },
  { 
    id: 'expand', 
    icon: '📖', 
    label: 'הרחב', 
    prompt: 'הרחב עם פרטים ודוגמאות נוספות', 
    sel: true,
    color: 'from-purple-400 to-violet-500',
    category: 'transform'
  },
  { 
    id: 'academic', 
    icon: '🎓', 
    label: 'אקדמי', 
    prompt: 'שכתב בסגנון אקדמי ופורמלי', 
    sel: true,
    color: 'from-amber-400 to-orange-500',
    category: 'style'
  },
  { 
    id: 'translate', 
    icon: '🌐', 
    label: 'תרגם לאנגלית', 
    prompt: 'תרגם לאנגלית בצורה טבעית', 
    sel: true,
    color: 'from-teal-400 to-cyan-500',
    category: 'language'
  },
];

const QUICK_PROMPTS = [
  { text: '🚀 המשך לכתוב את הטקסט הבא', icon: '➡️', category: 'write' },
  { text: '🎯 כתוב מבוא מתאים למסמך', icon: '🚀', category: 'write' },
  { text: '🏁 כתוב מסקנה מתאימה למסמך', icon: '🏁', category: 'write' },
  { text: '📚 הצע מקורות מחקריים רלוונטיים', icon: '📚', category: 'research' },
  { text: '💡 תן רעיונות להמשך', icon: '💡', category: 'ideas' },
  { text: '🔍 בדוק עובדות ונתונים', icon: '🔍', category: 'check' },
];

const CHAT_MEMORY_STORAGE_KEY = 'wordai_sidebar_messages';

const getDefaultMessages = () => ([
  { 
    role: 'assistant', 
    content: `שלום! אני ${getActiveProviderName()} 🤖\n\nאני כאן לעזור לך עם הכתיבה. אני רואה את ההקשר של המסמך, אז אפשר לשאול גם בקצרה:\n• "נראה ארוך אה?" 🤔\n• "יש מקור לזה?" 📚\n• "תחדד לי את זה" 💡\n\nמה נכתוב היום?`,
    timestamp: Date.now()
  }
]);

const getSavedMessages = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_MEMORY_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) && parsed.length ? parsed.slice(-60) : getDefaultMessages();
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
  flexShrink: 0,
  height: mode === 'sidebar' ? '100%' : 'auto',
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

export default function AiSidebar({ onClose, documentContext, onInsert, selectedText, currentBlockText = '', mode = 'popup', reason = 'manual', compactMode = mode === 'sidebar', onToggleCompact = () => {}, wordPreferences = {} }) {
  const [tab, setTab] = useState('chat');
  const workspaceAutomation = getWorkspaceAutomation();
  const roleAgents = getOrderedRoleAgents(workspaceAutomation.workflowMode);
  const [messages, setMessages] = useState(() => getSavedMessages());
  const [input, setInput] = useState('');
  const [agentTaskInput, setAgentTaskInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeAgentStatus, setActiveAgentStatus] = useState({ agentLabel: '', progress: 0, message: 'מוכן', state: 'idle' });
  const [agentProgressMap, setAgentProgressMap] = useState({});
  const [showLogs, setShowLogs] = useState(false);
  const [debugLogs, setDebugLogs] = useState(() => getAgentDebugLogs().slice(-60).reverse());
  const [selectedAgentId, setSelectedAgentId] = useState(() => getAppMemory().lastSelectedAgentId || '');
  const [selectedSkillId, setSelectedSkillId] = useState(() => getAppMemory().lastSelectedSkillId || 'none');
  const [resolvedSkillLabel, setResolvedSkillLabel] = useState(() => getAppMemory().lastResolvedSkillLabel || '');
  const [mentionMenu, setMentionMenu] = useState({ open: false, type: '', query: '', start: 0, end: 0, items: [], activeIndex: 0 });
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const messagesRef = useRef(null);
  const inputRef = useRef(null);

  const docCtx = (typeof documentContext === 'function' ? documentContext() : (documentContext || '')).slice(0, 6000);
  const localContext = selectedText || currentBlockText;
  const quickPromptList = compactMode ? CONTEXT_PROMPTS.slice(0, 4) : CONTEXT_PROMPTS;
  const visibleActions = MODERN_QUICK_ACTIONS.filter((action) => wordPreferences?.aiQuickActions?.[action.id] !== false);
  const selectionActions = visibleActions.filter((action) => action.sel);
  const generationActions = visibleActions.filter((action) => !action.sel);
  const skillCatalog = getSkillCatalog();
  const skillsConfig = getSkillsConfig();
  const activeAgent = roleAgents.find((agent) => agent.id === selectedAgentId) || null;
  const shouldShowProgress = workspaceAutomation.showProgress !== false && (!compactMode || tab === 'agents' || ['running', 'retrying', 'error'].includes(activeAgentStatus.state));

  const closeMentionMenu = () => setMentionMenu((prev) => (prev.open ? { ...prev, open: false, items: [], activeIndex: 0 } : prev));

  const updateMentionMenu = (value, cursor = String(value || '').length) => {
    const match = resolveMentionMatch(value, cursor);
    if (!match) {
      closeMentionMenu();
      return;
    }

    const query = normalizeLookup(match.query);
    const items = (match.trigger === '@'
      ? roleAgents.map((agent) => ({
          id: agent.id,
          label: agent.name,
          description: 'הפעלת סוכן ייעודי למשימה הזו',
          insertText: `@${agent.id} `,
          type: 'agent',
        }))
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
    const nextValue = `${before}${item.insertText}${after}`;
    setInput(nextValue);
    if (item.type === 'skill') setSelectedSkillId(item.id);
    if (item.type === 'agent') setSelectedAgentId(item.id);
    closeMentionMenu();
    requestAnimationFrame(() => {
      textarea?.focus();
      const nextCursor = before.length + item.insertText.length;
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

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
    const syncLogs = () => setDebugLogs(getAgentDebugLogs().slice(-60).reverse());
    syncLogs();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('wordai-agent-logs-updated', syncLogs);
    return () => window.removeEventListener('wordai-agent-logs-updated', syncLogs);
  }, []);

  useEffect(() => {
    if (selectedSkillId !== 'none' && (skillsConfig.skills?.[selectedSkillId]?.mode || 'manual') === 'off') {
      setSelectedSkillId('none');
    }
    if (selectedAgentId && !roleAgents.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId('');
    }
  }, [selectedSkillId, selectedAgentId, skillsConfig, roleAgents]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_MEMORY_STORAGE_KEY, JSON.stringify(messages.slice(-60)));
      saveAppMemory({
        ...getAppMemory(),
        lastSelectedAgentId: selectedAgentId || '',
        lastSelectedSkillId: selectedSkillId || 'none',
        lastResolvedSkillLabel: resolvedSkillLabel || '',
      });
    } catch {}
  }, [messages, selectedAgentId, selectedSkillId, resolvedSkillLabel]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleReset = () => clearConversation();
    window.addEventListener('wordai-chat-history-cleared', handleReset);
    return () => window.removeEventListener('wordai-chat-history-cleared', handleReset);
  }, []);

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

  const copyLogsToClipboard = async () => {
    try {
      const text = getAgentDebugLogs().map((log) => {
        const parts = [
          formatLogTime(log.ts),
          log.agentLabel || 'מערכת',
          log.message || '',
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
    clearAgentDebugLogs();
    setDebugLogs([]);
  };

  const clearConversation = () => {
    try {
      localStorage.removeItem(CHAT_MEMORY_STORAGE_KEY);
      saveAppMemory({
        recentChats: [],
        memoryNotes: [],
        lastSelectedAgentId: '',
        lastSelectedSkillId: 'none',
        lastResolvedSkillLabel: '',
      });
    } catch {}
    setMessages(getDefaultMessages());
    setInput('');
    setSelectedAgentId('');
    setSelectedSkillId('none');
    setResolvedSkillLabel('');
  };

  const buildContext = () => (
    selectedText
      ? `טקסט נבחר: "${selectedText}"\n\nפסקה נוכחית: "${currentBlockText}"\n\n${docCtx}`
      : currentBlockText
        ? `פסקה נוכחית: "${currentBlockText}"\n\n${docCtx}`
        : docCtx
  );

  const executeRoleAgentTask = async (agent, task, runtimeOptions = {}) => {
    if (!agent?.prompt || loading) return;
    const ctx = buildContext();
    setTab('chat');
    setSelectedAgentId(agent.id);
    setMessages((prev) => [...prev, { role: 'user', content: `🧩 ${agent.name}: ${task}` }]);
    setLoading(true);
    updateAgentStatus(agent.id, agent.name, { state: 'running', progress: 10, message: 'הסוכן התחיל לעבוד' });
    try {
      const reply = await chatWithRoleAgent(agent, task, ctx, {
        onStatus: (payload) => updateAgentStatus(agent.id, agent.name, payload),
        skillId: runtimeOptions.skillId || '',
        autoUseDefaultSkill: runtimeOptions.autoUseDefaultSkill !== false,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      setInput('');
      setAgentTaskInput('');
      updateAgentStatus(agent.id, agent.name, { state: 'success', progress: 100, message: 'סיים בהצלחה' });
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `❌ ${err.message}`, error: true }]);
      updateAgentStatus(agent.id, agent.name, { state: 'error', progress: 100, message: err.message || 'שגיאה' });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const send = async (customPrompt, extraSystemPrompt = '', agentMeta = { id: 'assistant-main', name: 'עוזר ראשי' }) => {
    const originalText = (customPrompt || input).trim();
    if (!originalText || loading) return;
    if (!customPrompt) setInput('');
    closeMentionMenu();

    let txt = originalText;
    let manualSkillId = selectedSkillId === 'none' ? '' : selectedSkillId;
    let forcedAgent = activeAgent;
    let disabledSkillRequested = false;

    while (txt.startsWith('@') || txt.startsWith('/')) {
      const agentStartMatch = txt.match(/^@([^\s@/]+)\s*/);
      if (agentStartMatch) {
        const matchedAgent = findMentionedAgent(roleAgents, agentStartMatch[1]);
        if (!matchedAgent) break;
        forcedAgent = matchedAgent;
        setSelectedAgentId(matchedAgent.id);
        txt = txt.slice(agentStartMatch[0].length).trimStart();
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
          setSelectedSkillId(matchedSkill.id);
        }
        continue;
      }

      break;
    }

    if (disabledSkillRequested) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'הסקיל שביקשת כבוי כרגע בהגדרות, לכן דילגתי עליו.' }]);
    }

    if (!txt) {
      const helperText = forcedAgent
        ? `הסוכן ${forcedAgent.name} נבחר. עכשיו כתוב מה לבצע.`
        : manualSkillId
          ? 'הסקיל נבחר. עכשיו כתוב גם מה לבצע.'
          : 'בחרתי את הסוכן או הסקיל. עכשיו כתוב גם מה לבצע.';
      setMessages((prev) => [...prev, { role: 'assistant', content: helperText }]);
      inputRef.current?.focus();
      return;
    }

    if (forcedAgent) {
      await executeRoleAgentTask(forcedAgent, txt, {
        skillId: manualSkillId,
        autoUseDefaultSkill: disabledSkillRequested ? false : !manualSkillId,
      });
      return;
    }

    const ctx = buildContext();
    setMessages((prev) => [...prev, { role: 'user', content: originalText }]);
    setLoading(true);
    updateAgentStatus(agentMeta.id, agentMeta.name, { state: 'running', progress: 10, message: 'מתחיל טיפול' });
    try {
      const reply = await chatWithActiveProvider(txt, ctx, extraSystemPrompt, {
        agentLabel: agentMeta.name,
        skillId: manualSkillId,
        autoUseDefaultSkill: disabledSkillRequested ? false : !manualSkillId,
        onSkillResolved: (payload) => {
          const skill = payload?.skill;
          const reasonLabel = payload?.reason === 'auto' ? 'אוטומטי' : payload?.reason === 'default' ? 'ברירת מחדל' : 'ידני';
          setResolvedSkillLabel(skill?.label ? `${skill.label} · ${reasonLabel}` : 'ללא סקיל פעיל');
        },
        onStatus: (payload) => updateAgentStatus(agentMeta.id, agentMeta.name, payload),
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      updateAgentStatus(agentMeta.id, agentMeta.name, { state: 'success', progress: 100, message: 'הושלם' });
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `❌ ${err.message}`, error: true }]);
      updateAgentStatus(agentMeta.id, agentMeta.name, { state: 'error', progress: 100, message: err.message || 'שגיאה' });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const runRoleAgent = async (agent) => {
    const customTask = String(agentTaskInput || '').trim();
    const task = customTask
      ? `${customTask}${selectedText ? `\n\nטקסט רלוונטי:\n"${selectedText}"` : ''}${currentBlockText && !selectedText ? `\n\nפסקה רלוונטית:\n"${currentBlockText}"` : ''}`
      : selectedText
        ? `עבוד על הטקסט הבא לפי התפקיד שלך:\n\n"${selectedText}"`
        : currentBlockText
          ? `עבוד על הפסקה הנוכחית לפי התפקיד שלך:\n\n"${currentBlockText}"`
          : (input.trim() || 'סייע לי עם המסמך הנוכחי לפי התפקיד שלך.');
    await executeRoleAgentTask(agent, task, {
      skillId: selectedSkillId === 'none' ? '' : selectedSkillId,
      autoUseDefaultSkill: selectedSkillId === 'none',
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

  return (
    <div 
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
      dir="rtl"
    >
      {/* Animated Background */}
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `
            radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 40% 40%, rgba(120, 219, 255, 0.2) 0%, transparent 50%)
          `,
          animation: 'float 20s ease-in-out infinite',
          opacity: 0.4,
        }}
      />

      {/* Minimal Header */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(20px)',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        position: 'relative',
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #FF6B6B, #4ECDC4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            animation: 'pulse 2s ease-in-out infinite',
          }}>
            🤖
          </div>
          <div>
            <div style={{ 
              color: 'white', 
              fontWeight: 700, 
              fontSize: 14,
              textShadow: '0 2px 4px rgba(0,0,0,0.3)'
            }}>
              WordFlow AI ✨
            </div>
            <div style={{ 
              color: 'rgba(255,255,255,0.8)', 
              fontSize: 10, 
            }}>
              {getActiveProviderName()}
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {mode === 'sidebar' && (
            <button
              style={{
                color: 'rgba(255,255,255,0.9)',
                background: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 12,
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: 14,
                transition: 'all 0.3s ease',
              }}
              onClick={onToggleCompact}
              title={compactMode ? 'הרחב חלונית' : 'כווץ חלונית'}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.25)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {compactMode ? '⤢' : '⤡'}
            </button>
          )}
          <button 
            style={{
              color: 'rgba(255,255,255,0.8)',
              background: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 12,
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: 18,
              transition: 'all 0.3s ease',
            }}
            onClick={onClose}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 68, 68, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(255, 68, 68, 0.3)';
              e.currentTarget.style.transform = 'rotate(90deg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
              e.currentTarget.style.transform = 'rotate(0deg)';
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
          padding: '6px 12px',
          background: 'rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(15px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          position: 'relative',
          zIndex: 5,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 4,
            color: 'white',
            fontSize: 12,
            fontWeight: 600,
          }}>
            <span>
              {activeAgentStatus.agentLabel ? `🚀 ${activeAgentStatus.agentLabel}` : '⭐ מוכן לעבודה'}
            </span>
            <span style={{
              background: 'rgba(255, 255, 255, 0.2)',
              padding: '2px 8px',
              borderRadius: 12,
              fontSize: 11,
            }}>
              {Math.round(activeAgentStatus.progress || 0)}%
            </span>
          </div>
          
          <div style={{
            height: 6,
            background: 'rgba(255, 255, 255, 0.2)',
            borderRadius: 20,
            overflow: 'hidden',
            position: 'relative',
          }}>
            <div style={{
              width: `${activeAgentStatus.progress || 0}%`,
              height: '100%',
              background: activeAgentStatus.state === 'error' 
                ? 'linear-gradient(90deg, #FF6B6B, #FF8E8E)' 
                : activeAgentStatus.state === 'success' 
                ? 'linear-gradient(90deg, #4ECDC4, #44A08D)' 
                : 'linear-gradient(90deg, #667eea, #764ba2)',
              borderRadius: 20,
              transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 0 10px rgba(255, 255, 255, 0.3)',
            }} />
          </div>
          
          <div style={{
            fontSize: 11,
            color: 'rgba(255, 255, 255, 0.9)',
            marginTop: 6,
            textShadow: '0 1px 2px rgba(0,0,0,0.3)',
          }}>
            {activeAgentStatus.message || 'מוכן'}
          </div>
        </div>
      )}

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
          
          {/* Context Header */}
          <div style={{
            padding: '6px 12px',
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(15px)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>
                📄 פועל על:
              </span>
              <span style={{
                fontSize: 11,
                background: 'rgba(59, 130, 246, 0.2)',
                color: '#93C5FD',
                padding: '4px 12px',
                borderRadius: 20,
                fontWeight: 500,
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}>
                המסמך כולו
              </span>
              
              {currentBlockText && (
                <span style={{
                  fontSize: 11,
                  background: 'rgba(14, 165, 233, 0.2)',
                  color: '#7DD3FC',
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontWeight: 500,
                  border: '1px solid rgba(14, 165, 233, 0.3)',
                }}>
                  הפסקה הנוכחית
                </span>
              )}
              
              {selectedText && (
                <span style={{
                  fontSize: 11,
                  background: 'rgba(34, 197, 94, 0.2)',
                  color: '#86EFAC',
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontWeight: 500,
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}>
                  הטקסט הנבחר
                </span>
              )}
            </div>
            
            <button 
              onClick={clearConversation}
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 20,
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: 11,
                color: '#FCA5A5',
                fontWeight: 500,
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              🗑️ נקה שיחה
            </button>
          </div>

          {/* Quick Prompts Bar */}
          <div style={{
            padding: '6px 8px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}>
            <button
              onClick={() => setShowQuickPrompts(!showQuickPrompts)}
              style={{
                background: showQuickPrompts 
                  ? 'rgba(139, 92, 246, 0.2)' 
                  : 'rgba(255, 255, 255, 0.1)',
                border: showQuickPrompts 
                  ? '1px solid rgba(139, 92, 246, 0.4)'
                  : '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 20,
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: 12,
                color: showQuickPrompts ? '#C4B5FD' : 'rgba(255,255,255,0.8)',
                fontWeight: 600,
                transition: 'all 0.3s ease',
                whiteSpace: 'nowrap',
              }}
            >
              ✨ הצעות חכמות
            </button>
            
            {showQuickPrompts && quickPromptList.map((prompt, index) => (
              <button
                key={index}
                onClick={() => setInput(prompt)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 20,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.9)',
                  fontWeight: 500,
                  transition: 'all 0.3s ease',
                  whiteSpace: 'nowrap',
                  animation: `slideIn 0.3s ease ${index * 0.1}s both`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {prompt}
              </button>
            ))}
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
            
            {/* Agent & Skill Selection */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
              flexWrap: 'wrap'
            }}>
              {activeAgent && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'rgba(99, 102, 241, 0.15)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: 20,
                  padding: '6px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#C4B5FD',
                }}>
                  🤖 @{activeAgent.id}
                  <button 
                    onClick={() => setSelectedAgentId('')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#C4B5FD',
                      cursor: 'pointer',
                      fontSize: 14,
                      padding: 0,
                      marginLeft: 4,
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
              
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <span style={{ 
                  fontSize: 11, 
                  color: 'rgba(255,255,255,0.8)', 
                  fontWeight: 600 
                }}>
                  ⚙️ סקיל פעיל:
                </span>
                <select
                  value={selectedSkillId}
                  onChange={(e) => setSelectedSkillId(e.target.value)}
                  style={{
                    minWidth: 180,
                    padding: '8px 12px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: 12,
                    fontSize: 12,
                    background: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)',
                    color: 'white',
                    outline: 'none',
                  }}
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
              
              {resolvedSkillLabel && (
                <span style={{ 
                  fontSize: 10, 
                  color: 'rgba(255,255,255,0.6)',
                  background: 'rgba(255, 255, 255, 0.08)',
                  padding: '4px 8px',
                  borderRadius: 12,
                }}>
                  אחרון: {resolvedSkillLabel}
                </span>
              )}
            </div>

            {/* Context Indicator */}
            {localContext && (
              <div style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.9)',
                marginBottom: 12,
                padding: '10px 14px',
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: 12,
                backdropFilter: 'blur(10px)',
                borderRight: '4px solid #3B82F6',
              }}>
                📌 הקשר פעיל: "{(selectedText || currentBlockText).slice(0, 80)}{(selectedText || currentBlockText).length > 80 ? '…' : ''}"
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
                  setInput(e.target.value);
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
                  setTimeout(() => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                    e.currentTarget.style.boxShadow = 'none';
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
                disabled={loading || !input.trim()}
                style={{
                  width: 56,
                  height: 56,
                  flexShrink: 0,
                  background: !loading && input.trim() 
                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    : 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 16,
                  cursor: !loading && input.trim() ? 'pointer' : 'default',
                  fontSize: 20,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: !loading && input.trim() 
                    ? '0 8px 25px rgba(102, 126, 234, 0.3)'
                    : 'none',
                }}
                onMouseEnter={(e) => {
                  if (!loading && input.trim()) {
                    e.currentTarget.style.transform = 'scale(1.05) translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 12px 35px rgba(102, 126, 234, 0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1) translateY(0)';
                  e.currentTarget.style.boxShadow = !loading && input.trim() 
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

      {/* Modern Actions Tab */}
      {tab === 'actions' && (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          background: `
            radial-gradient(circle at 20% 80%, rgba(139, 92, 246, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(59, 130, 246, 0.06) 0%, transparent 50%),
            rgba(255, 255, 255, 0.02)
          `,
          backdropFilter: 'blur(20px)',
        }}>
          
          {/* Context Status */}
          {localContext ? (
            <div style={{
              fontSize: 12,
              color: '#86EFAC',
              marginBottom: 16,
              padding: '12px 16px',
              background: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: 16,
              backdropFilter: 'blur(10px)',
              textAlign: 'center',
              fontWeight: 600,
            }}>
              ✨ הסוכן מחובר להקשר הכתיבה הנוכחי שלך
            </div>
          ) : (
            <div style={{
              fontSize: 12,
              color: '#FDE047',
              marginBottom: 16,
              padding: '12px 16px',
              background: 'rgba(234, 179, 8, 0.15)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: 16,
              backdropFilter: 'blur(10px)',
              textAlign: 'center',
              fontWeight: 600,
            }}>
              💡 מקם את הסמן בפסקה או בחר טקסט לעזרה מדויקת יותר
            </div>
          )}

          {/* Text Editing Actions */}
          <div style={{
            marginBottom: 24,
          }}>
            <h3 style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'white',
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              ✂️ עריכת הטקסט הנבחר
            </h3>
            
            {selectionActions.length ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 12,
              }}>
                {selectionActions.map((action, index) => (
                  <button 
                    key={action.id}
                    onClick={() => runAction(action)}
                    style={{
                      ...modernActionButton(action),
                      animation: `slideIn 0.3s ease ${index * 0.1}s both`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05) translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 12px 25px rgba(0, 0, 0, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1) translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.05)';
                    }}
                  >
                    <div style={{
                      fontSize: 24,
                      marginBottom: 4,
                    }}>
                      {action.icon}
                    </div>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 600,
                      textAlign: 'center',
                      lineHeight: 1.2,
                    }}>
                      {action.label}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.6)',
                padding: '16px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: 12,
                border: '1px dashed rgba(255, 255, 255, 0.2)',
                textAlign: 'center',
              }}>
                🔄 אין פעולות עריכה זמינות כרגע
              </div>
            )}
          </div>

          {/* Content Generation Actions */}
          <div>
            <h3 style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'white',
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              ✨ יצירת תוכן חדש
            </h3>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
              marginBottom: 16,
            }}>
              {QUICK_PROMPTS.map((prompt, index) => (
                <button 
                  key={index}
                  onClick={() => setInput(prompt.text)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    padding: '16px 12px',
                    border: 'none',
                    borderRadius: 16,
                    cursor: 'pointer',
                    background: 'rgba(255, 255, 255, 0.08)',
                    backdropFilter: 'blur(15px)',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'white',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    animation: `slideIn 0.4s ease ${index * 0.1}s both`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.3)';
                    e.currentTarget.style.transform = 'scale(1.05) translateY(-4px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.transform = 'scale(1) translateY(0)';
                  }}
                >
                  <div style={{ fontSize: 20 }}>
                    {prompt.icon}
                  </div>
                  <span style={{
                    textAlign: 'center',
                    lineHeight: 1.3,
                  }}>
                    {prompt.text.replace(/🚀|🎯|🏁|📚|💡|🔍/g, '')}
                  </span>
                </button>
              ))}
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
              כתוב משימה חופשית, ואז לחץ על אחד הסוכנים למטה כדי שיבצע אותה בהקשר של המסמך.
            </div>
            <textarea
              value={agentTaskInput}
              onChange={(e) => setAgentTaskInput(e.target.value)}
              placeholder="💬 למשל: תעבור על הטקסט ותבנה לי גרסה מקצועית וקצרה יותר..."
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
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.02) translateY(-4px)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                  e.currentTarget.style.boxShadow = '0 15px 35px rgba(0, 0, 0, 0.2)';
                }}
                onMouseLeave={(e) => {
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
                        <span style={{ fontWeight: 700, color: 'white' }}>
                          {log.agentLabel || 'מערכת'}
                        </span>
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
                        {log.agentLabel || '⚙️ מערכת'}
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
  );
}


