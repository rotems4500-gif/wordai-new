// AddinSidebar — צ'אט + סוכנים + החלה על מסמך ה-Word. UI רזה; כל ההיגיון
// ב-aiService (צ'אט/סוכנים) + wordBridge (Word.run) + wordRouting (החלה חכמה).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { chatWithActiveProvider, callAiAgent, getProviderConfig, saveProviderConfig } from '../services/aiService';
import { getAddinAgents } from './addinAgents';
import {
  isWordAvailable,
  buildDocumentSnapshot,
  getSelectedText,
  onSelectionChanged,
  insertTextAsTracked,
  replaceSelectionText,
  applyRoutingBatch,
} from './wordBridge';
import { buildAIRoutingMap } from './wordRouting';

const PROVIDER_OPTIONS = [
  { id: 'gemini', label: 'Gemini' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'claude', label: 'Claude' },
  { id: 'groq', label: 'Groq' },
  { id: 'perplexity', label: 'Perplexity' },
];

const CHAT_OPTIONS = {
  directChat: true,
  skipAutomation: true,
  skipSkillSelection: true,
  skipMultiModel: true,
  includeAppMemory: false,
  autoUseDefaultSkill: false,
};

export default function AddinSidebar({ isWordHost = false }) {
  const agents = useMemo(() => getAddinAgents(), []);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [activeAgentId, setActiveAgentId] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const listRef = useRef(null);

  const activeAgent = agents.find((agent) => agent.id === activeAgentId) || null;
  const hasAnyKey = useMemo(() => {
    const cfg = getProviderConfig();
    return PROVIDER_OPTIONS.some(({ id }) => String(cfg?.[id]?.key || '').trim());
  }, [settingsOpen, messages.length]);

  useEffect(() => {
    if (!isWordHost || !isWordAvailable()) return undefined;
    return onSelectionChanged((text) => setSelectedText(text));
  }, [isWordHost]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const pushMessage = (role, text, extra = {}) => {
    setMessages((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, role, text, ...extra }]);
  };

  const runGuarded = async (fn, statusText) => {
    if (busy) return;
    setBusy(true);
    setStatus(statusText || 'עובד...');
    try {
      await fn();
    } catch (err) {
      pushMessage('assistant', `⚠️ שגיאה: ${err?.message || 'הפעולה נכשלה'}`, { isError: true });
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  const handleSend = () => {
    const prompt = input.trim();
    if (!prompt && !(activeAgent?.inline && selectedText)) return;

    // סוכן inline עם טקסט מסומן: מפעילים על הסימון ומחליפים כ-track change
    if (activeAgent?.inline && isWordHost && selectedText) {
      const agent = activeAgent;
      pushMessage('user', `${agent.label} על הטקסט המסומן${prompt ? ` — ${prompt}` : ''}`);
      setInput('');
      runGuarded(async () => {
        setStatus(`${agent.label} עובד על הסימון...`);
        const result = await callAiAgent(agent.id, selectedText, prompt);
        if (!String(result || '').trim()) throw new Error('לא התקבלה תשובה מהמודל');
        await replaceSelectionText(result, { trackChanges: true });
        pushMessage('assistant', `✅ הוחל על הטקסט המסומן כשינוי למעקב (${agent.label}). אפשר לאשר או לדחות דרך לשונית "סקירה" ב-Word.`);
      }, `${agent.label} עובד...`);
      return;
    }

    if (!prompt) return;
    pushMessage('user', prompt);
    setInput('');
    runGuarded(async () => {
      let documentContext = '';
      if (isWordHost && isWordAvailable()) {
        setStatus('קורא את המסמך...');
        try {
          const snapshot = await buildDocumentSnapshot();
          documentContext = snapshot.excerptText || '';
        } catch { /* מסמך לא זמין — ממשיכים בלי קונטקסט */ }
      }
      setStatus('מנסח תשובה...');
      const reply = await chatWithActiveProvider(prompt, documentContext, activeAgent?.systemCtx || '', {
        ...CHAT_OPTIONS,
        agentLabel: activeAgent?.label || 'צ׳אט תוסף Word',
      });
      pushMessage('assistant', String(reply || '').trim() || 'לא התקבלה תשובה', { userPrompt: prompt });
    }, 'מנסח תשובה...');
  };

  const handleSmartApply = (message) => runGuarded(async () => {
    setStatus('🧭 מנתח את מבנה המסמך...');
    const snapshot = await buildDocumentSnapshot();
    setStatus('🧭 ממפה את ההצעות ליעדים במסמך...');
    const routing = await buildAIRoutingMap(message.text, snapshot, { userPrompt: message.userPrompt || '' });
    if (!routing.length) throw new Error('לא זוהו מיקומים ברורים במסמך עבור ההצעות');
    setStatus('✍️ מחיל שינויים למעקב...');
    const { insertedCount, skippedTargets } = await applyRoutingBatch(routing, { onStatus: setStatus });
    if (!insertedCount) throw new Error('לא נמצאו מיקומים תואמים במסמך');
    const skippedNote = skippedTargets.length
      ? `\nדולגו ${skippedTargets.length} יעדים לא חד-משמעיים: ${skippedTargets.map((t) => `"${String(t).slice(0, 40)}"`).join(', ')}`
      : '';
    pushMessage('assistant', `✅ הוחלו ${insertedCount} שינויים למעקב במסמך.${skippedNote}`);
  }, 'מחיל על המסמך...');

  const handleInsertTracked = (message) => runGuarded(async () => {
    await insertTextAsTracked(message.text);
    pushMessage('assistant', '✅ הוכנס במיקום הסמן כשינוי למעקב.');
  }, 'מכניס למסמך...');

  const handleCopy = async (message) => {
    try {
      await navigator.clipboard.writeText(message.text);
      setStatus('הועתק ✓');
      setTimeout(() => setStatus(''), 1500);
    } catch { /* clipboard חסום */ }
  };

  return (
    <div className="flex h-full flex-col">
      {/* פס סוכנים */}
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-white px-2 py-1.5">
        {agents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            onClick={() => setActiveAgentId(activeAgentId === agent.id ? '' : agent.id)}
            className={`rounded-full px-2 py-0.5 text-[11px] transition ${
              activeAgentId === agent.id
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title={agent.placeholder}
          >
            {agent.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSettingsOpen((open) => !open)}
          className="mr-auto rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-200"
        >
          ⚙️ הגדרות
        </button>
      </div>

      {settingsOpen && <SettingsDrawer onClose={() => setSettingsOpen(false)} />}

      {/* טקסט מסומן */}
      {isWordHost && (
        <div className="border-b border-gray-100 bg-gray-50 px-3 py-1 text-[11px] text-gray-500">
          {selectedText
            ? <>מסומן: <span className="text-gray-700">{selectedText.slice(0, 80)}{selectedText.length > 80 ? '…' : ''}</span></>
            : 'אין טקסט מסומן במסמך'}
        </div>
      )}

      {/* הודעות */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {!messages.length && (
          <div className="pt-8 text-center text-xs text-gray-400">
            {!hasAnyKey
              ? <>אין עדיין מפתח API. פתח ⚙️ הגדרות והדבק מפתח (למשל Gemini — חינמי).</>
              : activeAgent
                ? activeAgent.placeholder || `מצב ${activeAgent.label} פעיל`
                : 'שאל שאלה על המסמך, או בחר סוכן ולחץ שלח.'}
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className={`max-w-[95%] rounded-lg px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${
            message.role === 'user'
              ? 'mr-auto bg-indigo-50 text-indigo-900'
              : message.isError
                ? 'ml-auto bg-red-50 text-red-800'
                : 'ml-auto border border-gray-200 bg-white text-gray-800'
          }`}>
            {message.text}
            {message.role === 'assistant' && !message.isError && message.userPrompt !== undefined && (
              <div className="mt-2 flex flex-wrap gap-1 border-t border-gray-100 pt-1.5">
                {isWordHost && (
                  <>
                    <MsgButton onClick={() => handleSmartApply(message)} disabled={busy}>🧭 החל על המסמך</MsgButton>
                    <MsgButton onClick={() => handleInsertTracked(message)} disabled={busy}>📌 הכנס בסמן</MsgButton>
                  </>
                )}
                <MsgButton onClick={() => handleCopy(message)}>📋 העתק</MsgButton>
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            {status || 'עובד...'}
          </div>
        )}
      </div>

      {/* קלט */}
      <div className="border-t border-gray-200 bg-white p-2">
        {!busy && status && <div className="pb-1 text-[11px] text-gray-500">{status}</div>}
        <div className="flex items-end gap-1.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={2}
            placeholder={activeAgent?.inline && selectedText
              ? `הנחיה ל${activeAgent.label} (אופציונלי) — יוחל על הסימון`
              : activeAgent?.placeholder || 'שאל על המסמך או בקש שינוי...'}
            className="min-h-[40px] flex-1 resize-none rounded-lg border border-gray-300 px-2.5 py-1.5 text-[13px] focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={busy || (!input.trim() && !(activeAgent?.inline && selectedText))}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white transition hover:bg-indigo-700 disabled:opacity-40"
          >
            שלח
          </button>
        </div>
      </div>
    </div>
  );
}

function MsgButton({ onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700 hover:bg-gray-200 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SettingsDrawer({ onClose }) {
  const [cfg, setCfg] = useState(() => getProviderConfig());
  const [providerId, setProviderId] = useState(() => cfg.active || 'gemini');
  const [saved, setSaved] = useState(false);

  const providerCfg = cfg?.[providerId] || {};

  const update = (patch) => {
    setSaved(false);
    setCfg((prev) => ({ ...prev, [providerId]: { ...(prev?.[providerId] || {}), ...patch } }));
  };

  const handleSave = () => {
    const next = { ...cfg, active: providerId, activeProviders: [providerId] };
    saveProviderConfig(next);
    setCfg(getProviderConfig());
    setSaved(true);
  };

  return (
    <div className="space-y-2 border-b border-gray-200 bg-white px-3 py-2 text-[12px]">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-gray-700">ספק AI ומפתח</span>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
      </div>
      <div className="flex gap-1.5">
        <select
          value={providerId}
          onChange={(e) => { setProviderId(e.target.value); setSaved(false); }}
          className="rounded border border-gray-300 px-1.5 py-1"
        >
          {PROVIDER_OPTIONS.map(({ id, label }) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <input
          type="text"
          value={providerCfg.model || ''}
          onChange={(e) => update({ model: e.target.value })}
          placeholder="מודל (ברירת מחדל אם ריק)"
          dir="ltr"
          className="min-w-0 flex-1 rounded border border-gray-300 px-1.5 py-1 text-left"
        />
      </div>
      <input
        type="password"
        value={providerCfg.key || ''}
        onChange={(e) => update({ key: e.target.value })}
        placeholder="API key"
        dir="ltr"
        className="w-full rounded border border-gray-300 px-1.5 py-1 text-left"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="rounded bg-indigo-600 px-2.5 py-1 text-white hover:bg-indigo-700"
        >
          שמור והפעל
        </button>
        {saved && <span className="text-green-600">נשמר ✓</span>}
        <span className="text-[11px] text-gray-400">המפתח נשמר מקומית במחשב שלך בלבד.</span>
      </div>
    </div>
  );
}
