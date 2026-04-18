import React, { useState, useRef, useEffect } from 'react';
import { chatWithActiveProvider, matchShortcut } from './services/aiService';

const WAND_ACTIONS = [
  { icon: '✏️', label: 'שפר',      prompt: 'שפר את הטקסט הנבחר מבחינה סגנונית ולשונית' },
  { icon: '📝', label: 'סכם',      prompt: 'סכם את הטקסט הנבחר בנקודות קצרות' },
  { icon: '🌐', label: 'תרגם',     prompt: 'תרגם את הטקסט הנבחר לאנגלית' },
  { icon: '📖', label: 'הרחב',     prompt: 'הרחב את הטקסט עם פרטים ודוגמאות נוספות' },
  { icon: '🎓', label: 'אקדמי',    prompt: 'שכתב בסגנון אקדמי ופורמלי' },
  { icon: '✂️', label: 'קצר',      prompt: 'קצר את הטקסט ב-40% בלי לאבד את המשמעות העיקרית' },
];

export default function MagicWand({ sidebarOpen, documentContext, selectedText, onInsert, shortcuts = {} }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const popupRef = useRef(null);
  const inputRef = useRef(null);

  // סגור בלחיצה מחוץ לחלון
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // קיצור מקשים מותאם אישית
  useEffect(() => {
    const handler = (e) => {
      if (matchShortcut(e, shortcuts.magicWand || 'Ctrl+Space')) {
        e.preventDefault();
        setOpen(v => !v);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [shortcuts]);

  // פוקוס על input בפתיחה + ניקוי timeout תקין
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    } else {
      setResult('');
      setInput('');
    }
  }, [open]);

  const run = async (prompt) => {
    const ctx = selectedText
      ? `טקסט נבחר: "${selectedText}"\n\n${typeof documentContext === 'function' ? documentContext() : documentContext}`
      : (typeof documentContext === 'function' ? documentContext() : documentContext);
    setLoading(true);
    setResult('');
    try {
      const res = await chatWithActiveProvider(prompt, ctx);
      setResult(res);
    } catch (err) {
      setResult('❌ ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCustom = () => {
    if (!input.trim()) return;
    run(input.trim());
    setInput('');
  };

  // מיקום קבוע ונוח גם כשהעוזר נפתח כחלונית צד
  const rightPx = sidebarOpen ? 20 : 20;

  return (
    <div style={{ position: 'fixed', right: rightPx, bottom: 80, zIndex: 500, transition: 'right 0.25s, opacity 0.2s', opacity: sidebarOpen ? 0 : 1, pointerEvents: sidebarOpen ? 'none' : 'auto' }}>

      {/* ─── Popup ─── */}
      {open && (
        <div ref={popupRef} dir="rtl"
          style={{ position: 'absolute', bottom: 58, right: 0, width: 290, background: 'white', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', border: '1px solid #E1DFDD', overflow: 'hidden' }}>

          {/* header */}
          <div style={{ background: 'linear-gradient(135deg,#2B579A,#106EBE)', padding: '10px 14px' }}>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 13 }}>✨ עט קסמים AI</div>
            {selectedText && (
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 }}>
                על: &ldquo;{selectedText.slice(0, 42)}{selectedText.length > 42 ? '…' : ''}&rdquo;
              </div>
            )}
            {!selectedText && (
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 }}>זמין תוך כדי כתיבה ושכתוב מהיר</div>
            )}
          </div>

          {/* כפתורי פעולה מהירה */}
          <div style={{ display: 'flex', gap: 4, padding: '10px 10px 6px', flexWrap: 'wrap' }}>
            {WAND_ACTIONS.map(a => (
              <button key={a.label} onClick={() => run(a.prompt)} title={a.prompt}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 8px', border: '1px solid #E1DFDD', borderRadius: 8, background: 'white', cursor: 'pointer', fontSize: 11, minWidth: 44, transition: 'all 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#EFF6FF'; e.currentTarget.style.borderColor = '#2B579A'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#E1DFDD'; }}>
                <span style={{ fontSize: 18 }}>{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>

          {/* שדה חופשי */}
          <div style={{ padding: '6px 10px 10px', display: 'flex', gap: 6 }}>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCustom(); }}
              placeholder="תאר מה ברצונך לערוך..."
              style={{ flex: 1, padding: '7px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, direction: 'rtl', outline: 'none', fontFamily: 'inherit' }}
              disabled={loading} />
            <button onClick={handleCustom} disabled={loading || !input.trim()}
              style={{ width: 34, flexShrink: 0, background: !input.trim() || loading ? '#C8C6C4' : '#2B579A', color: 'white', border: 'none', borderRadius: 8, cursor: !input.trim() || loading ? 'default' : 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ↑
            </button>
          </div>

          {/* תוצאה */}
          {(loading || result) && (
            <div style={{ borderTop: '1px solid #E1DFDD', padding: '10px 12px', maxHeight: 200, overflowY: 'auto', background: '#FAFAFA' }}>
              {loading ? (
                <div style={{ color: '#605E5C', fontSize: 12 }}>⏳ מחשב...</div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: '#323130', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 8, direction: 'rtl' }}>{result}</div>
                  {onInsert && (
                    <button onClick={() => { onInsert(result); setOpen(false); }}
                      style={{ fontSize: 11, padding: '5px 14px', background: '#2B579A', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                      + הוסף למסמך
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── כפתור ─── */}
      <button onClick={() => setOpen(v => !v)} title={`עט קסמים AI (${shortcuts.magicWand || 'Ctrl+Space'})`}
        style={{ width: 50, height: 50, borderRadius: '50%', background: open ? '#106EBE' : 'linear-gradient(135deg,#2B579A,#106EBE)', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 4px 18px rgba(43,87,154,0.5)', fontSize: open ? 22 : 24, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', transform: open ? 'scale(1.08) rotate(20deg)' : 'scale(1)' }}>
        {open ? '×' : '✨'}
      </button>
    </div>
  );
}
