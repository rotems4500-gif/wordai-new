import React, { useEffect, useRef, useState } from 'react';
import { chatWithActiveProvider } from '../services/aiService';
import { showToast } from '../services/uiFeedback';
import { AGENTS_CONFIG } from '../agentConfig';
import {
  buildProjectContextBlock,
  summarizeConversationForMemory,
  appendProjectMemory,
  isSupportedExternalChatShareUrl,
} from '../services/projectService';

const MAX_STORED_MESSAGES = 60;
const HISTORY_TURNS_FOR_PROMPT = 12;

function storageKeyFor(projectId) {
  return `wordai_project_brainstorm:${projectId}`;
}

function loadHistory(projectId) {
  try {
    const raw = localStorage.getItem(storageKeyFor(projectId));
    const parsed = JSON.parse(raw || '');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m) => m && typeof m === 'object' && m.role && m.content);
  } catch {
    return [];
  }
}

function saveHistory(projectId, messages) {
  try {
    localStorage.setItem(storageKeyFor(projectId), JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
  } catch {}
}

function buildHistoryPromptPrefix(messages) {
  const recent = messages.slice(-HISTORY_TURNS_FOR_PROMPT * 2);
  if (!recent.length) return '';
  const lines = recent.map((m) => `${m.role === 'user' ? 'משתמש' : 'עוזר'}: ${String(m.content || '').trim()}`);
  return `היסטוריית השיחה עד כה:\n${lines.join('\n')}\n\n`;
}

const BRIEF_DISTILL_SYSTEM_PROMPT = `== AGENT: WORK DIRECTION DISTILLER ==
קרא את שיחת התכנון שצורפה, וגבש ממנה בריף עבודה תמציתי בעברית. הפלט חייב להיות בדיוק 6 שורות, בפורמט הבא ובסדר הזה, טקסט פשוט בלבד, ללא HTML וללא Markdown, ללא כל טקסט נוסף לפני או אחרי:
נושא: <...>
מטרה: <...>
קהל יעד: <...>
טון וסגנון: <...>
מבנה ואורך: <...>
דגשים מחייבים: <...>
כל שורה נגזרת אך ורק מהמסקנות וההחלטות שעלו בפועל בשיחה. אם נושא מסוים לא נדון בשיחה, כתוב ברירת מחדל סבירה (למשל "לפי שיקול דעת הכותב") במקום להמציא פרטים.
== END AGENT ==`;

export default function ProjectBrainstormPanel({ project, onClose, onTurnIntoWorkDirection = null }) {
  const [messages, setMessages] = useState(() => loadHistory(project?.id));
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSavingMemory, setIsSavingMemory] = useState(false);
  const [isDistilling, setIsDistilling] = useState(false);
  const [showExternalForm, setShowExternalForm] = useState(false);
  const [externalUrl, setExternalUrl] = useState('');
  const [externalText, setExternalText] = useState('');
  const [isSavingExternal, setIsSavingExternal] = useState(false);

  const listEndRef = useRef(null);
  const projectId = project?.id;

  useEffect(() => {
    if (!projectId) return;
    saveHistory(projectId, messages);
  }, [messages, projectId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSending]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!project) return null;

  const handleClearHistory = () => {
    if (!window.confirm('למחוק את כל היסטוריית שיחת התכנון הזו?')) return;
    setMessages([]);
    saveHistory(projectId, []);
  };

  const handleSend = async () => {
    const cleanText = inputText.trim();
    if (!cleanText || isSending) return;

    const userMessage = { role: 'user', content: cleanText, at: Date.now() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInputText('');
    setIsSending(true);

    try {
      const projectContext = await buildProjectContextBlock(projectId);
      const extraSystemPrompt = `${projectContext}\n\n${AGENTS_CONFIG.brainstorm.systemCtx}`;
      const historyPrefix = buildHistoryPromptPrefix(messages);
      const userPrompt = historyPrefix
        ? `${historyPrefix}ההודעה החדשה: ${cleanText}`
        : cleanText;

      const reply = await chatWithActiveProvider(userPrompt, '', extraSystemPrompt, {
        agentLabel: 'שיחת תכנון',
        skipAutomation: true,
        skipMultiModel: true,
        directChat: true,
      });

      setMessages((prev) => [...prev, { role: 'assistant', content: String(reply || '').trim(), at: Date.now() }]);
    } catch (err) {
      const message = err?.message || 'שגיאה בשיחה עם המודל';
      setMessages((prev) => [...prev, { role: 'assistant', content: `❌ ${message}`, at: Date.now() }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveMemory = async () => {
    if (messages.length < 2 || isSavingMemory) return;
    setIsSavingMemory(true);
    try {
      const entry = await summarizeConversationForMemory({
        transcript: messages.slice(-24),
        source: 'brainstorm-start',
      });
      appendProjectMemory(projectId, entry);
      showToast('המסקנות נשמרו לזיכרון הפרויקט', { tone: 'success' });
    } catch (err) {
      showToast(err?.message || 'שמירת המסקנות נכשלה', { tone: 'error' });
    } finally {
      setIsSavingMemory(false);
    }
  };

  const handleTurnIntoWorkDirection = async () => {
    if (messages.length < 2 || !onTurnIntoWorkDirection || isDistilling) return;
    setIsDistilling(true);
    try {
      const transcriptText = messages
        .slice(-24)
        .map((m) => `${m.role === 'user' ? 'משתמש' : 'עוזר'}: ${m.content}`)
        .join('\n');

      const brief = String(await chatWithActiveProvider(
        `זקק את שיחת התכנון הבאה לבריף עבודה:\n\n${transcriptText}`,
        '',
        BRIEF_DISTILL_SYSTEM_PROMPT,
        {
          agentLabel: 'זיקוק כיוון עבודה',
          skipAutomation: true,
          skipMultiModel: true,
          directChat: true,
        },
      ) || '').trim();

      if (!brief) {
        showToast('לא הצלחנו לגבש בריף מהשיחה', { tone: 'error' });
        return;
      }

      onTurnIntoWorkDirection({ brief, projectId });
      onClose?.();
    } catch (err) {
      showToast(err?.message || 'גיבוש כיוון העבודה נכשל', { tone: 'error' });
    } finally {
      setIsDistilling(false);
    }
  };

  const handleSaveExternal = async () => {
    const cleanText = externalText.trim();
    if (cleanText.length < 40) {
      showToast('צריך להדביק לפחות 40 תווים מתוכן השיחה', { tone: 'warning' });
      return;
    }
    setIsSavingExternal(true);
    try {
      const entry = await summarizeConversationForMemory({
        transcript: cleanText,
        source: 'external-link',
        sourceUrl: externalUrl.trim(),
      });
      appendProjectMemory(projectId, entry);
      showToast('השיחה החיצונית נשמרה לזיכרון הפרויקט', { tone: 'success' });
      setExternalText('');
      setExternalUrl('');
      setShowExternalForm(false);
    } catch (err) {
      showToast(err?.message || 'שמירת השיחה נכשלה', { tone: 'error' });
    } finally {
      setIsSavingExternal(false);
    }
  };

  const hasEnoughForActions = messages.length >= 2;
  const showUnsupportedUrlNote = externalUrl.trim() && !isSupportedExternalChatShareUrl(externalUrl);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      dir="rtl"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 rounded-3xl max-w-[640px] w-full max-h-[85vh] flex flex-col shadow-2xl border border-cyan-200/20" dir="rtl">
        {/* כותרת */}
        <div className="bg-gradient-to-r from-slate-900/95 to-blue-900/95 backdrop-blur-xl p-5 sticky top-0 z-10 border-b border-cyan-100/20 rounded-t-3xl">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-2xl">🧭</span>
              <h2 className="text-lg md:text-xl font-bold text-white truncate">שיחת תכנון — {project.name}</h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="px-2 py-1 text-xs text-white/60 hover:text-white/90 underline decoration-dotted"
                >
                  נקה שיחה
                </button>
              )}
              <button
                type="button"
                onClick={() => onClose?.()}
                className="px-3 py-1.5 bg-red-500/30 hover:bg-red-500/50 border border-red-400/30 rounded-xl text-white/90 transition-all text-sm font-medium"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* גוף השיחה */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-white/50 text-sm py-10">
              בוא נחשוב יחד על הכיוון לפני שכותבים — נושא, מבנה, טון, קהל יעד.
              <br />
              כתוב הודעה כדי להתחיל.
            </div>
          )}
          {messages.map((m, idx) => (
            <div key={`${m.at || idx}-${idx}`} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                  m.role === 'user'
                    ? 'bg-cyan-600/30 border border-cyan-400/30 text-white'
                    : 'bg-white/10 border border-white/15 text-white/90'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {isSending && (
            <div className="flex justify-end">
              <div className="bg-white/10 border border-white/15 text-white/60 rounded-2xl px-4 py-2.5 text-sm">
                חושב…
              </div>
            </div>
          )}
          <div ref={listEndRef} />
        </div>

        {/* טופס שיחה חיצונית */}
        {showExternalForm && (
          <div className="px-5 pb-3 border-t border-white/10 pt-3 bg-black/20">
            <div className="text-white/80 text-sm font-medium mb-2">צירוף שיחה חיצונית לזיכרון הפרויקט</div>
            <input
              type="text"
              dir="ltr"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://chatgpt.com/share/…"
              className="w-full mb-2 px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 text-sm outline-none focus:ring-2 focus:ring-cyan-200"
            />
            {showUnsupportedUrlNote && (
              <div className="text-amber-300/90 text-xs mb-2">
                הקישור הזה לא נתמך לחילוץ אוטומטי — הוא יישמר רק כתווית מקור.
              </div>
            )}
            <textarea
              value={externalText}
              onChange={(e) => setExternalText(e.target.value)}
              placeholder="הדבק כאן את תוכן השיחה"
              rows={5}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 text-sm outline-none focus:ring-2 focus:ring-cyan-200 resize-y"
            />
            <div className="text-white/45 text-xs mt-1.5 mb-3">
              דפי שיתוף של צ'אטים חיצוניים נטענים ב-JavaScript, ולכן אי אפשר לחלץ מהם תוכן אוטומטית — יש להדביק את הטקסט ידנית.
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowExternalForm(false); setExternalText(''); setExternalUrl(''); }}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white/80 text-sm"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleSaveExternal}
                disabled={isSavingExternal}
                className="px-3 py-1.5 bg-cyan-600/40 hover:bg-cyan-600/60 border border-cyan-400/30 rounded-xl text-white text-sm disabled:opacity-50"
              >
                {isSavingExternal ? 'שומר…' : 'שמור לזיכרון הפרויקט'}
              </button>
            </div>
          </div>
        )}

        {/* קלט הודעה */}
        <div className="p-4 border-t border-white/10">
          <div className="flex gap-2 items-end">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleInputKeyDown}
              disabled={isSending}
              placeholder={AGENTS_CONFIG.brainstorm.placeholder}
              rows={2}
              className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 text-sm outline-none focus:ring-2 focus:ring-cyan-200 resize-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending || !inputText.trim()}
              className="px-4 py-2 bg-cyan-600/50 hover:bg-cyan-600/70 border border-cyan-400/30 rounded-xl text-white text-sm font-medium disabled:opacity-40 h-full"
            >
              שלח
            </button>
          </div>
        </div>

        {/* שורת פעולות תחתונה */}
        <div className="p-4 border-t border-white/10 bg-black/20 rounded-b-3xl flex flex-wrap gap-2 justify-between">
          <button
            type="button"
            onClick={() => setShowExternalForm((v) => !v)}
            className="px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white/85 text-sm"
          >
            🔗 צרף שיחה חיצונית
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveMemory}
              disabled={!hasEnoughForActions || isSavingMemory}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white/85 text-sm disabled:opacity-40"
            >
              {isSavingMemory ? 'שומר…' : '🧭 שמור מסקנות לפרויקט'}
            </button>
            {onTurnIntoWorkDirection && (
              <button
                type="button"
                onClick={handleTurnIntoWorkDirection}
                disabled={!hasEnoughForActions || isDistilling}
                className="px-3 py-2 bg-gradient-to-r from-cyan-500/60 to-blue-500/60 hover:from-cyan-500/80 hover:to-blue-500/80 border border-cyan-300/30 rounded-xl text-white text-sm font-medium disabled:opacity-40"
              >
                {isDistilling ? 'מזקק…' : '🚀 הפוך לכיוון עבודה'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
