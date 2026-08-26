// ═══════════════════════════════════════════════════════════════
// PresentMode.jsx — נגן מצגת מלא-מסך. ניווט בחצים/רווח/Esc.
// בנוסף: מסך מלא אמיתי (Fullscreen API), האפלה ב-B, וקפיצה למספר שקופית
// בהקלדת ספרות + Enter.
// ═══════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SlideFrame } from './SlideRenderer';

// חלון הזמן לצבירת ספרות לפני שהחוצץ מתאפס ("12" ולא "1" ואז "2").
const JUMP_BUFFER_MS = 2000;

export default function PresentMode({ deck, startIndex = 0, onClose = () => {} }) {
  const slides = deck?.slides || [];
  const [index, setIndex] = useState(Math.max(0, Math.min(startIndex, slides.length - 1)));
  const [showNotes, setShowNotes] = useState(false);
  // האפלה (B) — שקף שחור זמני בלי לצאת מהמצגת.
  const [blackout, setBlackout] = useState(false);
  // חוצץ הספרות של הקפיצה ("7" → Enter → שקופית 7).
  const [jumpBuffer, setJumpBuffer] = useState('');
  // ⚠️ החוצץ מוחזק גם ב-ref: ה-handler רץ מחוץ למחזור הרינדור, ועדכון-בתוך-updater
  // (setIndex בתוך setJumpBuffer) הוא side-effect ב-updater שרץ פעמיים ב-StrictMode.
  const jumpBufferRef = useRef('');
  const jumpTimerRef = useRef(null);
  const containerRef = useRef(null);
  // onClose נתפס ב-effect של המסך המלא שרץ פעם אחת — קוראים דרך ref כדי
  // שהוא לא יהיה מיושן.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const go = useCallback((delta) => {
    setIndex((i) => Math.max(0, Math.min(slides.length - 1, i + delta)));
  }, [slides.length]);

  const clearJump = useCallback(() => {
    clearTimeout(jumpTimerRef.current);
    jumpBufferRef.current = '';
    setJumpBuffer('');
  }, []);

  useEffect(() => () => clearTimeout(jumpTimerRef.current), []);

  // ── מסך מלא אמיתי ────────────────────────────────────────────────
  // הבקשה נכשלת בשקט בלי מחוות משתמש/בהרשאות חסומות — המצגת ממשיכה לעבוד
  // כשכבת fixed רגילה. יציאה מהמסך המלא (Esc של הדפדפן, F11) סוגרת את הנגן,
  // אחרת המשתמש היה נשאר תקוע בשכבה שחורה בלי מסך מלא.
  useEffect(() => {
    const el = containerRef.current;
    let entered = false;
    const request = el?.requestFullscreen || el?.webkitRequestFullscreen;
    if (request) {
      try {
        Promise.resolve(request.call(el)).then(() => { entered = true; }).catch(() => { /* אין הרשאה */ });
      } catch { /* דפדפן ללא Fullscreen API */ }
    }
    const onFsChange = () => {
      if (!entered) return;
      if (!document.fullscreenElement) {
        entered = false;
        onCloseRef.current?.();
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      entered = false;
      // רק אם המסך המלא הוא באמת שלנו — אחרת נסגור מסך מלא של רכיב אחר.
      try { if (document.fullscreenElement === el) document.exitFullscreen?.(); } catch { /* no-op */ }
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      // ⚠️ e.key עשוי להיות undefined (אירוע סינתטי / השלמה אוטומטית) —
      // .toLowerCase() עליו הפיל את כל ה-handler, כולל Escape.
      const key = String(e?.key || '');
      if (!key) return;
      if (key === 'Escape') { onClose(); return; }

      // ── קפיצה למספר שקופית: ספרות נצברות, Enter מבצע ──
      if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        setBlackout(false);
        const next = (jumpBufferRef.current + key).slice(0, 4);
        jumpBufferRef.current = next;
        setJumpBuffer(next);
        clearTimeout(jumpTimerRef.current);
        jumpTimerRef.current = setTimeout(() => { jumpBufferRef.current = ''; setJumpBuffer(''); }, JUMP_BUFFER_MS);
        return;
      }
      if (key === 'Enter') {
        e.preventDefault();
        const typed = jumpBufferRef.current;
        const num = Number(typed);
        clearJump();
        setBlackout(false);
        // Enter בלי ספרות = השקופית הבאה (מוסכמת מציגים).
        if (!typed) { go(1); return; }
        if (Number.isFinite(num) && num >= 1) setIndex(Math.min(slides.length - 1, num - 1));
        return;
      }
      if (key === 'Backspace') { e.preventDefault(); clearJump(); return; }

      // ── האפלה (B / ב) ──
      if (key.toLowerCase() === 'b' || key === 'ב') {
        e.preventDefault();
        clearJump();
        setBlackout((v) => !v);
        return;
      }

      // כל מקש ניווט מבטל האפלה (מוסכמת מציגים: מקש כלשהו מחזיר את השקף).
      // RTL: שמאלה/למטה = השקופית הבאה, ימינה/למעלה = הקודמת. זו המוסכמה
      // של העורך (מקלדת ה-PresentationStudio), וכיוון הפוך בין השניים הוא
      // באג ניווט שמרגיש כמו תקלה אקראית.
      if (key === 'ArrowLeft' || key === 'ArrowDown' || key === ' ' || key === 'PageDown') { e.preventDefault(); setBlackout(false); go(1); }
      else if (key === 'ArrowRight' || key === 'ArrowUp' || key === 'PageUp') { e.preventDefault(); setBlackout(false); go(-1); }
      else if (key === 'Home') { setBlackout(false); setIndex(0); }
      else if (key === 'End') { setBlackout(false); setIndex(slides.length - 1); }
      else if (key.toLowerCase() === 'n') setShowNotes((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose, slides.length, clearJump]);

  if (!slides.length) return null;
  // ⚠️ index הוא state ולא מתאפס כשהדק מתקצר (מחיקת שקופית בזמן שהנגן פתוח,
  // או deck אחר עם פחות שקופיות) — קריאה ישירה ב-slides[index] נתנה undefined
  // ומפילה את ה-SlideFrame. מהדקים בכל רינדור.
  const safeIndex = Math.max(0, Math.min(index, slides.length - 1));
  const slide = slides[safeIndex];

  return (
    <div ref={containerRef} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 'min(100vw, 177.78vh)', maxHeight: '100vh' }}>
        <SlideFrame slide={slide} themeId={deck.themeId} index={safeIndex} rounded={false} shadow={false} deckTitle={deck.title} customTheme={deck.customTheme || null} deckId={deck.id || ''} />
      </div>

      {showNotes && slide.notes && (
        <div style={{ position: 'absolute', bottom: 70, right: 24, left: 24, maxWidth: 900, margin: '0 auto', background: 'rgba(15,23,42,0.92)', color: '#e2e8f0', padding: '16px 20px', borderRadius: 14, fontSize: 16, lineHeight: 1.6, direction: 'rtl' }}>
          📝 {slide.notes}
        </div>
      )}

      {/* חיווי קפיצה — הספרות שהוקלדו עד כה */}
      {Boolean(jumpBuffer) && (
        <div style={{ position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,23,42,0.85)', color: '#e2e8f0', padding: '6px 16px', borderRadius: 12, fontSize: 20, fontWeight: 700, letterSpacing: 2, direction: 'ltr', zIndex: 30 }}>
          {jumpBuffer} ⏎
        </div>
      )}

      {/* פס בקרה */}
      <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(15,23,42,0.7)', padding: '8px 16px', borderRadius: 999, color: '#e2e8f0', fontSize: 14, direction: 'ltr' }}>
        <button onClick={() => { setBlackout(false); go(-1); }} disabled={safeIndex === 0} style={navBtn(safeIndex === 0)}>‹</button>
        <span>{safeIndex + 1} / {slides.length}</span>
        <button onClick={() => { setBlackout(false); go(1); }} disabled={safeIndex === slides.length - 1} style={navBtn(safeIndex === slides.length - 1)}>›</button>
        <span style={{ opacity: 0.4 }}>|</span>
        <button onClick={() => setShowNotes((v) => !v)} style={navBtn(false)} title="הערות מרצה (N)">📝</button>
        <button onClick={() => setBlackout((v) => !v)} style={navBtn(false)} title="מסך שחור (B)">⬛</button>
        <button onClick={onClose} style={navBtn(false)} title="יציאה (Esc)">✕</button>
      </div>

      {/* האפלה — מכסה הכל; לחיצה כלשהי מחזירה את השקף */}
      {blackout && (
        <div
          onClick={() => setBlackout(false)}
          style={{ position: 'absolute', inset: 0, background: '#000', zIndex: 40, cursor: 'pointer', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 24 }}
        >
          <span style={{ color: 'rgba(226,232,240,0.35)', fontSize: 12, direction: 'rtl' }}>מסך שחור — כל מקש או לחיצה מחזירים את השקופית</span>
        </div>
      )}
    </div>
  );
}

const navBtn = (disabled) => ({
  border: 'none',
  background: 'transparent',
  color: '#e2e8f0',
  fontSize: 22,
  lineHeight: 1,
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.3 : 1,
  padding: '2px 8px',
});
