import React, { useState, useRef, useEffect } from "react";
import { chatWithActiveProvider, getActiveProviderName, getOrderedRoleAgents, chatWithRoleAgent, getWorkspaceAutomation, getAgentDebugLogs, clearAgentDebugLogs, getSkillCatalog, getSkillsConfig, getAppMemory, saveAppMemory } from "./services/aiService";

const CONTEXT_PROMPTS = [
  'נראה ארוך אה?',
  'יש מקור למה שאמרתי?',
  'תחדד לי את זה',
  'תן ניסוח אקדמי',
  'תקצר בלי לפגוע בטיעון',
  'איך ממשיכים מכאן?',
];

const QUICK_ACTIONS = [
  { id: 'fix',       icon: '✏️', label: 'תקן שגיאות',    prompt: 'תקן שגיאות כתיב ודקדוק',             sel: true  },
  { id: 'humanize',  icon: '👤', label: 'הפוך לאנושי',   prompt: 'שכתב בסגנון אנושי וטבעי',             sel: true  },
  { id: 'summary',   icon: '📝', label: 'סכם',            prompt: 'סכם בנקודות עיקריות קצרות',            sel: true  },
  { id: 'expand',    icon: '📖', label: 'הרחב',           prompt: 'הרחב עם פרטים ודוגמאות נוספות',        sel: true  },
  { id: 'academic',  icon: '🎓', label: 'אקדמי',          prompt: 'שכתב בסגנון אקדמי ופורמלי',           sel: true  },
  { id: 'translate', icon: '🌐', label: 'תרגם לאנגלית',  prompt: 'תרגם לאנגלית בצורה טבעית',            sel: true  },
  { id: 'bullets',   icon: '📋', label: 'הפוך לרשימה',   prompt: 'המר לרשימת נקודות ברורה',              sel: true  },
  { id: 'shorter',   icon: '✂️', label: 'קצר',            prompt: 'קצר ב-50% בלי לאבד משמעות',           sel: true  },
  { id: 'continue',  icon: '➡️', label: 'המשך כתיבה',    prompt: 'המשך לכתוב את הטקסט הבא',             sel: false },
  { id: 'intro',     icon: '🚀', label: 'הוסף מבוא',      prompt: 'כתוב מבוא מתאים למסמך',                sel: false },
  { id: 'conclusion',icon: '🏁', label: 'הוסף מסקנה',    prompt: 'כתוב מסקנה מתאימה למסמך',              sel: false },
  { id: 'sources',   icon: '📚', label: 'הצע מקורות',    prompt: 'הצע מקורות מחקריים רלוונטיים לנושא',   sel: false },
];

const CHAT_MEMORY_STORAGE_KEY = 'wordai_sidebar_messages';

const getDefaultMessages = () => ([
  { role: 'assistant', content: `שלום! אני ${getActiveProviderName()} — העוזר ה-AI שלך.\nאני קורא את ההקשר של המסמך, כך שאפשר לשאול גם בקצרה כמו "נראה ארוך אה?" או "יש מקור לזה?".` }
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
  const messagesRef = useRef(null);
  const inputRef = useRef(null);

  const docCtx = (typeof documentContext === 'function' ? documentContext() : (documentContext || '')).slice(0, 6000);
  const localContext = selectedText || currentBlockText;
  const quickPromptList = compactMode ? CONTEXT_PROMPTS.slice(0, 4) : CONTEXT_PROMPTS;
  const visibleActions = QUICK_ACTIONS.filter((action) => wordPreferences?.aiQuickActions?.[action.id] !== false);
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

  return (
    <div style={getShellStyle(mode, compactMode)} dir="rtl">

      {/* כותרת */}
      <div style={{ background: 'linear-gradient(135deg,#2B579A 0%,#106EBE 100%)', padding: compactMode ? '10px 12px' : '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: compactMode ? 8 : 10 }}>
          <span style={{ fontSize: compactMode ? 20 : 24 }}>✨</span>
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: compactMode ? 13 : 14 }}>WordFlow AI</div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 1 }}>מנוע פעיל: {getActiveProviderName()}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {mode === 'sidebar' && (
            <button
              style={{ color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '6px 8px', borderRadius: 8 }}
              onClick={onToggleCompact}
              title={compactMode ? 'הרחב חלונית' : 'כווץ חלונית'}
            >
              {compactMode ? '⤢' : '⤡'}
            </button>
          )}
          <button style={{ color: 'rgba(255,255,255,0.8)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '2px 6px', borderRadius: 4 }} onClick={onClose}>×</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E1DFDD', background: '#F8F7F6', flexShrink: 0 }}>
        {[['chat', "💬 צ'אט"], ['actions', '⚡ פעולות'], ['agents', '🧩 סוכנים']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ flex: 1, padding: compactMode ? '8px 6px' : '9px', fontSize: compactMode ? 11 : 12, border: 'none', cursor: 'pointer', fontWeight: tab === id ? 600 : 400, background: tab === id ? 'white' : 'transparent', color: tab === id ? '#2B579A' : '#605E5C', borderBottom: tab === id ? '2px solid #2B579A' : '2px solid transparent' }}>
            {label}
          </button>
        ))}
      </div>

      {shouldShowProgress && (
        <div style={{ padding: '10px 12px', background: '#F8FBFF', borderBottom: '1px solid #DBEAFE', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: '#1E3A8A', fontWeight: 700, marginBottom: 6 }}>
            <span>{activeAgentStatus.agentLabel ? `כעת עובד: ${activeAgentStatus.agentLabel}` : 'מוכן לעבודה'}</span>
            <span>{Math.round(activeAgentStatus.progress || 0)}%</span>
          </div>
          <div style={{ height: 8, background: '#DBEAFE', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${activeAgentStatus.progress || 0}%`, height: '100%', background: activeAgentStatus.state === 'error' ? '#DC2626' : activeAgentStatus.state === 'success' ? '#16A34A' : '#2563EB', transition: 'width 0.25s ease' }} />
          </div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>{activeAgentStatus.message || 'מוכן'}</div>
          {(activeAgentStatus.provider || activeAgentStatus.model) && (
            <div style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>
              {activeAgentStatus.provider ? `מנוע: ${activeAgentStatus.provider}` : ''}
              {activeAgentStatus.model ? ` · מודל: ${activeAgentStatus.model}` : ''}
              {activeAgentStatus.attempt ? ` · ניסיון ${activeAgentStatus.attempt}` : ''}
            </div>
          )}
        </div>
      )}

      {tab === 'agents' && (
        <div style={{ padding: compactMode ? '7px 10px' : '10px 12px', borderBottom: '1px solid #E2E8F0', background: '#FFFFFF', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <button
              onClick={() => setShowLogs((prev) => !prev)}
              style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: '#0F172A', fontSize: 12, fontWeight: 700 }}
            >
              🪵 יומן סוכנים מפורט {showLogs ? '▴' : '▾'}
            </button>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={copyLogsToClipboard} style={{ border: '1px solid #CBD5E1', background: 'white', borderRadius: 999, padding: '3px 8px', cursor: 'pointer', fontSize: 10 }}>
                העתק
              </button>
              <button onClick={clearLogs} style={{ border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', borderRadius: 999, padding: '3px 8px', cursor: 'pointer', fontSize: 10 }}>
                נקה
              </button>
            </div>
          </div>

          {showLogs && (
            <div style={{ marginTop: 8, maxHeight: 170, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {debugLogs.length ? debugLogs.map((log) => (
                <div key={log.id} style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: '7px 9px', background: log.state === 'error' ? '#FEF2F2' : log.state === 'success' ? '#F0FDF4' : '#F8FAFC' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: '#1E293B' }}>{log.agentLabel || 'מערכת'}</span>
                    <span style={{ color: '#64748B' }}>{formatLogTime(log.ts)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#334155', lineHeight: 1.45 }}>{log.message || 'ללא הודעה'}</div>
                  <div style={{ fontSize: 10, color: '#64748B', marginTop: 4, lineHeight: 1.4 }}>
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
                <div style={{ fontSize: 11, color: '#64748B', padding: '8px 4px' }}>
                  עדיין אין אירועים ביומן.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Chat ─── */}
      {tab === 'chat' && (
        <>
          <div style={{ padding: '7px 12px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: '#64748B' }}>פועל על:</span>
              <span style={{ fontSize: 10, background: '#DBEAFE', color: '#1D4ED8', padding: '4px 8px', borderRadius: 999 }}>המסמך כולו</span>
              {currentBlockText && <span style={{ fontSize: 10, background: '#E0F2FE', color: '#0369A1', padding: '4px 8px', borderRadius: 999 }}>הפסקה הנוכחית</span>}
              {selectedText && <span style={{ fontSize: 10, background: '#DCFCE7', color: '#166534', padding: '4px 8px', borderRadius: 999 }}>הטקסט הנבחר</span>}
            </div>
            <button onClick={clearConversation} style={{ border: '1px solid #CBD5E1', background: 'white', borderRadius: 999, padding: '3px 8px', cursor: 'pointer', fontSize: 10, color: '#334155' }}>
              נקה שיחה
            </button>
          </div>
          <div ref={messagesRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: compactMode ? 10 : 12, display: 'flex', flexDirection: 'column', gap: compactMode ? 8 : 10, background: mode === 'sidebar' ? '#FCFDFE' : 'transparent' }}>
            {reason === 'idle' && (
              <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 14, padding: '10px 12px', color: '#9A3412', fontSize: 12, fontWeight: 600 }}>
                נראה שנתקעת רגע — אני יכול לעזור בלי להוציא אותך מקו המחשבה.
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={bbl(msg.role === 'user', compactMode)}>{msg.content}</div>
                {msg.role === 'assistant' && !msg.error && onInsert && (
                  <button onClick={() => onInsert(msg.content)}
                    style={{ fontSize: 11, color: '#2B579A', background: 'none', border: 'none', cursor: 'pointer', marginTop: 3, padding: '2px 4px', textDecoration: 'underline' }}>
                    + הוסף למסמך
                  </button>
                )}
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ ...bbl(false, compactMode), color: '#605E5C', fontStyle: 'italic' }}>⏳ מחשב...</div>
              </div>
            )}
            <div style={{ height: 1 }} />
          </div>

          <div style={{ padding: '10px 12px', borderTop: '1px solid #E1DFDD', background: 'white', flexShrink: 0, boxShadow: '0 -8px 20px rgba(15,23,42,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              {activeAgent && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#EEF2FF', color: '#3730A3', padding: '5px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                  @{activeAgent.id}
                  <button onClick={() => setSelectedAgentId('')} style={{ border: 'none', background: 'transparent', color: '#3730A3', cursor: 'pointer', fontSize: 12, padding: 0 }}>×</button>
                </span>
              )}
              <span style={{ fontSize: 11, color: '#475569', fontWeight: 700 }}>סקיל פעיל</span>
              <select
                value={selectedSkillId}
                onChange={(e) => setSelectedSkillId(e.target.value)}
                style={{ minWidth: compactMode ? 170 : 220, padding: '7px 10px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 12, background: '#F8FAFC' }}
              >
                <option value="none">בחירה אוטומטית לפי ההגדרות</option>
                {skillCatalog.map((skill) => {
                  const mode = skillsConfig.skills?.[skill.id]?.mode || 'manual';
                  return (
                    <option key={skill.id} value={skill.id} disabled={mode === 'off'}>
                      {skill.label}{mode === 'auto' ? ' · אוטומטי' : mode === 'off' ? ' · כבוי' : ''}
                    </option>
                  );
                })}
              </select>
              {resolvedSkillLabel && <span style={{ fontSize: 10, color: '#64748B' }}>בשיחה האחרונה: {resolvedSkillLabel}</span>}
            </div>
            {localContext && (
              <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 6, padding: '6px 8px', background: '#F0F7FF', borderRadius: 8, borderRight: '3px solid #2B579A' }}>
                📌 הקשר פעיל: &ldquo;{(selectedText || currentBlockText).slice(0, 80)}{(selectedText || currentBlockText).length > 80 ? '…' : ''}&rdquo;
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
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
                placeholder="כתוב חופשי. אפשר להקליד @ כדי לבחור סוכן, או / כדי לבחור סקיל"
                style={{ flex: 1, resize: 'none', border: '1px solid #CBD5E1', borderRadius: 12, padding: compactMode ? '9px 10px' : '10px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none', height: compactMode ? 56 : 72, direction: 'rtl', background: '#F8FAFC' }}
                disabled={loading}
              />
              {mentionMenu.open && (
                <div style={{ position: 'absolute', right: 0, left: 46, bottom: compactMode ? 64 : 80, background: 'white', border: '1px solid #CBD5E1', borderRadius: 12, boxShadow: '0 12px 30px rgba(15,23,42,0.12)', overflow: 'hidden', zIndex: 20 }}>
                  <div style={{ padding: '7px 10px', fontSize: 10, fontWeight: 700, color: '#64748B', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    {mentionMenu.type === 'agent' ? 'סוכנים זמינים' : 'סקילים זמינים'}
                  </div>
                  {mentionMenu.items.map((item, index) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyMentionChoice(item);
                      }}
                      style={{ width: '100%', textAlign: 'right', border: 'none', borderTop: index === 0 ? 'none' : '1px solid #F1F5F9', background: index === mentionMenu.activeIndex ? '#EFF6FF' : 'white', padding: '9px 10px', cursor: 'pointer' }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 2 }}>{mentionMenu.type === 'agent' ? '@' : '/'}{item.id}</div>
                      <div style={{ fontSize: 11, color: '#475569' }}>{item.label}</div>
                      <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{item.description}</div>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => send()} disabled={loading || !input.trim()}
                style={{ width: 40, flexShrink: 0, background: !loading && input.trim() ? '#2B579A' : '#C8C6C4', color: 'white', border: 'none', borderRadius: 8, cursor: !loading && input.trim() ? 'pointer' : 'default', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ↑
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── Quick Actions ─── */}
      {tab === 'actions' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {localContext ? (
            <div style={{ fontSize: 11, color: '#166534', marginBottom: 10, padding: '6px 10px', background: '#F0FDF4', borderRadius: 6, border: '1px solid #BBF7D0' }}>
              ✅ הסוכן מחובר להקשר הכתיבה הנוכחי שלך
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#92400E', marginBottom: 10, padding: '6px 10px', background: '#FFFBEB', borderRadius: 6, border: '1px solid #FDE68A' }}>
              💡 מקם את הסמן בפסקה הרלוונטית או בחר טקסט כדי לקבל עזרה מדויקת יותר
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: '#323130', marginBottom: 6 }}>✂️ עריכת הקטע הנוכחי</div>
          {selectionActions.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
              {selectionActions.map(a => (
                <button key={a.id} style={actBtn} onClick={() => runAction(a)}
                  onMouseEnter={e => { e.currentTarget.style.background = '#EFF6FF'; e.currentTarget.style.borderColor = '#93C5FD'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#E1DFDD'; }}>
                  <span style={{ fontSize: 20 }}>{a.icon}</span>
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#64748B', marginBottom: 14, padding: '8px 10px', background: '#F8FAFC', borderRadius: 8, border: '1px dashed #CBD5E1' }}>
              אין כרגע פעולות עריכה מהירות מסומנות להצגה.
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: '#323130', marginBottom: 6 }}>✨ יצירת תוכן חדש</div>
          {generationActions.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {generationActions.map(a => (
                <button key={a.id} style={actBtn} onClick={() => runAction(a)}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F0FDF4'; e.currentTarget.style.borderColor = '#6EE7B7'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#E1DFDD'; }}>
                  <span style={{ fontSize: 20 }}>{a.icon}</span>
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#64748B', padding: '8px 10px', background: '#F8FAFC', borderRadius: 8, border: '1px dashed #CBD5E1' }}>
              אין כרגע פעולות יצירה מהירות מסומנות להצגה.
            </div>
          )}
        </div>
      )}

      {tab === 'agents' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, background: 'linear-gradient(180deg,#FAFCFF 0%,#FFFFFF 100%)' }}>
          <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 10 }}>
            סוכנים לפי תפקידים שהוגדרו במסך ההגדרות.
          </div>

          <div style={{ marginBottom: 12, padding: '12px', border: '1px solid #DBEAFE', borderRadius: 14, background: '#EFF6FF' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1E3A8A', marginBottom: 6 }}>
              מה תרצה שהסוכן יבצע?
            </div>
            <div style={{ fontSize: 11, color: '#475569', marginBottom: 8, lineHeight: 1.5 }}>
              כתוב משימה חופשית, ואז לחץ על אחד הסוכנים למטה כדי שיבצע אותה בהקשר של המסמך.
            </div>
            <textarea
              value={agentTaskInput}
              onChange={(e) => setAgentTaskInput(e.target.value)}
              placeholder="למשל: תעבור על הטקסט ותבנה לי גרסה מקצועית וקצרה יותר"
              style={{
                width: '100%',
                minHeight: 84,
                resize: 'vertical',
                border: '1px solid #93C5FD',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 13,
                fontFamily: 'inherit',
                direction: 'rtl',
                outline: 'none',
                background: 'white',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {roleAgents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => runRoleAgent(agent)}
                style={{
                  textAlign: 'right',
                  border: '1px solid #DBEAFE',
                  background: 'white',
                  borderRadius: 16,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  boxShadow: '0 6px 18px rgba(37,99,235,0.06)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1E3A8A' }}>{agent.name}</div>
                  <span style={{ fontSize: 10, borderRadius: 999, padding: '3px 8px', background: (agentProgressMap[agent.id]?.state === 'error') ? '#FEE2E2' : (agentProgressMap[agent.id]?.state === 'success') ? '#DCFCE7' : (agentProgressMap[agent.id]?.state === 'running' || agentProgressMap[agent.id]?.state === 'retrying') ? '#DBEAFE' : '#F1F5F9', color: (agentProgressMap[agent.id]?.state === 'error') ? '#B91C1C' : (agentProgressMap[agent.id]?.state === 'success') ? '#166534' : (agentProgressMap[agent.id]?.state === 'running' || agentProgressMap[agent.id]?.state === 'retrying') ? '#1D4ED8' : '#475569' }}>
                    {agentProgressMap[agent.id]?.state === 'running' ? 'עובד' : agentProgressMap[agent.id]?.state === 'retrying' ? 'מנסה שוב' : agentProgressMap[agent.id]?.state === 'success' ? 'הושלם' : agentProgressMap[agent.id]?.state === 'error' ? 'שגיאה' : 'מוכן'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5 }}>{agent.prompt.slice(0, 110)}{agent.prompt.length > 110 ? '…' : ''}</div>
                {agentTaskInput.trim() && (
                  <div style={{ marginTop: 8, fontSize: 10, color: '#1D4ED8', background: '#EFF6FF', borderRadius: 8, padding: '6px 8px' }}>
                    משימה לשליחה: {agentTaskInput.trim().slice(0, 120)}{agentTaskInput.trim().length > 120 ? '…' : ''}
                  </div>
                )}
                {workspaceAutomation.showProgress !== false && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ height: 6, background: '#E5E7EB', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${agentProgressMap[agent.id]?.progress || 0}%`, height: '100%', background: '#2563EB', transition: 'width 0.25s ease' }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>{agentProgressMap[agent.id]?.message || 'מוכן'}</div>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


