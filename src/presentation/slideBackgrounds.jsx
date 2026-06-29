// ═══════════════════════════════════════════════════════════════
// slideBackgrounds.jsx — render של ספריית רקעי-השקף (variants).
// כל variant הוא שכבה דקורטיבית בצבעי ה-theme, עדינה כדי לא לפגוע
// בקריאות הטקסט. ה-id וההיגיון (רוטציה/resolve) ב-deckModel.js.
// ═══════════════════════════════════════════════════════════════

import React from 'react';

const base = { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 };

// בסיס הרקע מסתובב per-slide וגם נצבע מעט לפי ה-accent של השקף.
// כך אין שני שקפים עם אותו רקע, וכל שקף "נצבע" בגוון משלו (DOM/image).
export const getSlideBaseBackground = (theme, accent, index = 0) => {
  const c = theme.colors;
  const ac = accent || c.accent;
  const tint = `${ac}24`;  // ~14% alpha
  const tint2 = `${ac}14`; // ~8%
  const opts = [
    `linear-gradient(135deg, ${c.bg}, ${c.bgAlt})`,
    `linear-gradient(160deg, ${c.bg} 55%, ${tint})`,
    `radial-gradient(circle at 82% 12%, ${tint}, ${c.bg} 58%)`,
    `linear-gradient(205deg, ${c.surface}, ${c.bg})`,
    `radial-gradient(circle at 14% 88%, ${tint}, ${c.bg} 55%)`,
    `linear-gradient(135deg, ${c.bg} 60%, ${tint2})`,
  ];
  const i = Number.isFinite(index) ? index : 0;
  return opts[((i % opts.length) + opts.length) % opts.length];
};

// גרסת hex לרקע native (pptx) — מסתובב בין גווני ה-theme (בלי gradient).
export const getSlideBaseColor = (theme, index = 0) => {
  const c = theme.colors;
  const opts = [c.bg, c.bgAlt, c.surface, c.bg, c.surface, c.bgAlt];
  const i = Number.isFinite(index) ? index : 0;
  return opts[((i % opts.length) + opts.length) % opts.length];
};

export function SlideBackground({ theme, variant, accent }) {
  const c = theme.colors;
  const ac = accent || c.accent;
  const ac2 = c.accent2 || ac;

  switch (variant) {
    case 'mesh':
      return (
        <div style={base}>
          <div style={{ position: 'absolute', top: -180, right: -120, width: 620, height: 620, borderRadius: '50%', background: ac, opacity: 0.20, filter: 'blur(90px)' }} />
          <div style={{ position: 'absolute', bottom: -220, left: -160, width: 680, height: 680, borderRadius: '50%', background: ac2, opacity: 0.16, filter: 'blur(100px)' }} />
        </div>
      );
    case 'glowTR':
      return <div style={base}><div style={{ position: 'absolute', top: -260, right: -200, width: 760, height: 760, borderRadius: '50%', background: ac, opacity: 0.15, filter: 'blur(120px)' }} /></div>;
    case 'glowBL':
      return <div style={base}><div style={{ position: 'absolute', bottom: -260, left: -200, width: 760, height: 760, borderRadius: '50%', background: ac2, opacity: 0.15, filter: 'blur(120px)' }} /></div>;
    case 'shapes':
      return (
        <div style={{ ...base, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', bottom: -200, left: -120, width: 520, height: 520, borderRadius: '50%', border: `60px solid ${ac}`, opacity: 0.10 }} />
          <div style={{ position: 'absolute', top: -140, right: -100, width: 360, height: 360, borderRadius: '50%', background: ac2, opacity: 0.09 }} />
        </div>
      );
    case 'grid':
      return <div style={{ ...base, backgroundImage: `radial-gradient(${c.muted} 1.4px, transparent 1.4px)`, backgroundSize: '34px 34px', opacity: 0.12 }} />;
    case 'band':
      return <div style={base}><div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 180, background: `linear-gradient(0deg, ${ac}, transparent)`, opacity: 0.13 }} /></div>;
    case 'arcTR':
      return <div style={{ ...base, overflow: 'hidden' }}><div style={{ position: 'absolute', top: -300, right: -300, width: 660, height: 660, borderRadius: '50%', background: ac, opacity: 0.12 }} /></div>;
    case 'arcBL':
      return <div style={{ ...base, overflow: 'hidden' }}><div style={{ position: 'absolute', bottom: -300, left: -300, width: 660, height: 660, borderRadius: '50%', background: ac2, opacity: 0.12 }} /></div>;
    case 'diagonal':
      return <div style={{ ...base, overflow: 'hidden' }}><div style={{ position: 'absolute', top: -260, left: -200, width: 1800, height: 600, background: c.bgAlt, opacity: 0.55, transform: 'rotate(-11deg)', transformOrigin: 'top left' }} /></div>;
    case 'ring':
      return <div style={{ ...base, overflow: 'hidden' }}><div style={{ position: 'absolute', top: -220, right: -150, width: 560, height: 560, borderRadius: '50%', border: `30px solid ${ac}`, opacity: 0.13 }} /></div>;
    case 'stripes':
      return <div style={{ ...base, backgroundImage: `repeating-linear-gradient(45deg, ${c.muted}22 0, ${c.muted}22 2px, transparent 2px, transparent 24px)`, opacity: 0.6 }} />;
    case 'dotsCorner':
      return <div style={base}><div style={{ position: 'absolute', top: 56, right: 56, width: 250, height: 160, backgroundImage: `radial-gradient(${ac} 3px, transparent 3px)`, backgroundSize: '26px 26px', opacity: 0.35 }} /></div>;
    case 'none':
    default:
      return null;
  }
}
