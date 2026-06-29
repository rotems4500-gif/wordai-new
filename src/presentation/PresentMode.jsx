// ═══════════════════════════════════════════════════════════════
// PresentMode.jsx — נגן מצגת מלא-מסך. ניווט בחצים/רווח/Esc.
// ═══════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { SlideFrame } from './SlideRenderer';

export default function PresentMode({ deck, startIndex = 0, onClose = () => {} }) {
  const slides = deck?.slides || [];
  const [index, setIndex] = useState(Math.max(0, Math.min(startIndex, slides.length - 1)));
  const [showNotes, setShowNotes] = useState(false);

  const go = useCallback((delta) => {
    setIndex((i) => Math.max(0, Math.min(slides.length - 1, i + delta)));
  }, [slides.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
      else if (e.key === 'Home') setIndex(0);
      else if (e.key === 'End') setIndex(slides.length - 1);
      else if (e.key.toLowerCase() === 'n') setShowNotes((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose, slides.length]);

  if (!slides.length) return null;
  const slide = slides[index];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 'min(100vw, 177.78vh)', maxHeight: '100vh' }}>
        <SlideFrame slide={slide} themeId={deck.themeId} index={index} rounded={false} shadow={false} />
      </div>

      {showNotes && slide.notes && (
        <div style={{ position: 'absolute', bottom: 70, right: 24, left: 24, maxWidth: 900, margin: '0 auto', background: 'rgba(15,23,42,0.92)', color: '#e2e8f0', padding: '16px 20px', borderRadius: 14, fontSize: 16, lineHeight: 1.6, direction: 'rtl' }}>
          📝 {slide.notes}
        </div>
      )}

      {/* פס בקרה */}
      <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(15,23,42,0.7)', padding: '8px 16px', borderRadius: 999, color: '#e2e8f0', fontSize: 14, direction: 'ltr' }}>
        <button onClick={() => go(-1)} disabled={index === 0} style={navBtn(index === 0)}>‹</button>
        <span>{index + 1} / {slides.length}</span>
        <button onClick={() => go(1)} disabled={index === slides.length - 1} style={navBtn(index === slides.length - 1)}>›</button>
        <span style={{ opacity: 0.4 }}>|</span>
        <button onClick={() => setShowNotes((v) => !v)} style={navBtn(false)} title="הערות מרצה (N)">📝</button>
        <button onClick={onClose} style={navBtn(false)} title="יציאה (Esc)">✕</button>
      </div>
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
