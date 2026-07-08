// ═══════════════════════════════════════════════════════════════
// slideBackgrounds.jsx — render של ספריית רקעי-השקף (variants).
// כל variant הוא שכבה דקורטיבית בצבעי ה-theme, עדינה כדי לא לפגוע
// בקריאות הטקסט. ה-id וההיגיון (רוטציה/resolve) ב-deckModel.js.
// ═══════════════════════════════════════════════════════════════

import React from 'react';
import { isLightTheme } from './deckThemes';

const base = { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 };

// בסיס הרקע מסתובב per-slide וגם נצבע מעט לפי ה-accent של השקף.
// כך אין שני שקפים עם אותו רקע, וכל שקף "נצבע" בגוון משלו (DOM/image).
export const getSlideBaseBackground = (theme, accent, index = 0) => {
  const c = theme.colors;
  const ac = accent || c.accent;
  const light = isLightTheme(theme);
  const tint = `${ac}${light ? '24' : '33'}`;  // כהה: ~20% alpha, בהיר: ~14% (קריאות)
  const tint2 = `${ac}${light ? '14' : '1F'}`; // כהה: ~12% alpha, בהיר: ~8%
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

// כיול נוכחות: בערכות בהירות (אקדמי/מגזין) הרקע לבן — מורידים עוצמה (~0.6×)
// כדי שהטקסט יישאר קריא; בערכות כהות משאירים את העוצמה המוגברת החדשה.
const presence = (theme, value) => (isLightTheme(theme) ? value * 0.6 : value);

// שכבת SVG פורשת על כל הבמה (1280×720). defs עצמאיים בלבד — בלי url() חיצוני.
const svgFull = { position: 'absolute', inset: 0, width: '100%', height: '100%' };

export function SlideBackground({ theme, variant, accent }) {
  const c = theme.colors;
  const ac = accent || c.accent;
  const ac2 = c.accent2 || ac;
  const p = (v) => presence(theme, v);

  switch (variant) {
    case 'mesh':
      return (
        <div style={base}>
          <div style={{ position: 'absolute', top: -180, right: -120, width: 620, height: 620, borderRadius: '50%', background: ac, opacity: p(0.34), filter: 'blur(90px)' }} />
          <div style={{ position: 'absolute', bottom: -220, left: -160, width: 680, height: 680, borderRadius: '50%', background: ac2, opacity: p(0.28), filter: 'blur(100px)' }} />
        </div>
      );
    case 'glowTR':
      return <div style={base}><div style={{ position: 'absolute', top: -260, right: -200, width: 760, height: 760, borderRadius: '50%', background: ac, opacity: p(0.26), filter: 'blur(120px)' }} /></div>;
    case 'glowBL':
      return <div style={base}><div style={{ position: 'absolute', bottom: -260, left: -200, width: 760, height: 760, borderRadius: '50%', background: ac2, opacity: p(0.26), filter: 'blur(120px)' }} /></div>;
    case 'shapes':
      return (
        <div style={{ ...base, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', bottom: -200, left: -120, width: 520, height: 520, borderRadius: '50%', border: `60px solid ${ac}`, opacity: p(0.20) }} />
          <div style={{ position: 'absolute', top: -140, right: -100, width: 360, height: 360, borderRadius: '50%', background: ac2, opacity: p(0.18) }} />
        </div>
      );
    case 'grid':
      return <div style={{ ...base, backgroundImage: `radial-gradient(${c.muted} 1.4px, transparent 1.4px)`, backgroundSize: '34px 34px', opacity: p(0.18) }} />;
    case 'band':
      return <div style={base}><div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 180, background: `linear-gradient(0deg, ${ac}, transparent)`, opacity: p(0.24) }} /></div>;
    case 'arcTR':
      return <div style={{ ...base, overflow: 'hidden' }}><div style={{ position: 'absolute', top: -300, right: -300, width: 660, height: 660, borderRadius: '50%', background: ac, opacity: p(0.22) }} /></div>;
    case 'arcBL':
      return <div style={{ ...base, overflow: 'hidden' }}><div style={{ position: 'absolute', bottom: -300, left: -300, width: 660, height: 660, borderRadius: '50%', background: ac2, opacity: p(0.22) }} /></div>;
    case 'diagonal':
      return <div style={{ ...base, overflow: 'hidden' }}><div style={{ position: 'absolute', top: -260, left: -200, width: 1800, height: 600, background: c.bgAlt, opacity: p(0.70), transform: 'rotate(-11deg)', transformOrigin: 'top left' }} /></div>;
    case 'ring':
      return <div style={{ ...base, overflow: 'hidden' }}><div style={{ position: 'absolute', top: -220, right: -150, width: 560, height: 560, borderRadius: '50%', border: `30px solid ${ac}`, opacity: p(0.24) }} /></div>;
    case 'stripes':
      return <div style={{ ...base, backgroundImage: `repeating-linear-gradient(45deg, ${c.muted}22 0, ${c.muted}22 2px, transparent 2px, transparent 24px)`, opacity: p(0.6) }} />;
    case 'dotsCorner':
      return <div style={base}><div style={{ position: 'absolute', top: 56, right: 56, width: 250, height: 160, backgroundImage: `radial-gradient(${ac} 3px, transparent 3px)`, backgroundSize: '26px 26px', opacity: p(0.35) }} /></div>;

    // ── variants חדשים (WP0.3) — decor packs לפי משפחת theme ─────────
    case 'waves':
      return (
        <div style={base}>
          <svg viewBox="0 0 1280 720" preserveAspectRatio="none" style={svgFull}>
            <path d="M0 552 C 213 500 427 604 640 552 C 853 500 1067 604 1280 552 L1280 720 L0 720 Z" fill={ac} opacity={p(0.16)} />
            <path d="M0 606 C 240 560 440 656 640 606 C 853 556 1067 652 1280 606 L1280 720 L0 720 Z" fill={ac2} opacity={p(0.15)} />
            <path d="M0 662 C 256 630 470 700 700 660 C 900 626 1090 700 1280 656 L1280 720 L0 720 Z" fill={ac} opacity={p(0.10)} />
          </svg>
        </div>
      );
    case 'blobOutline':
      return (
        <div style={{ ...base, overflow: 'hidden' }}>
          <svg viewBox="0 0 1280 720" style={svgFull}>
            <path d="M980 -50 C 1130 10 1215 150 1168 268 C 1121 386 992 408 906 340 C 820 272 846 118 902 56 C 934 20 954 -34 980 -50 Z" fill="none" stroke={ac} strokeWidth="2.5" opacity={p(0.22)} />
            <path d="M128 772 C -22 706 -46 556 62 470 C 170 384 316 418 356 526 C 396 634 306 728 220 758 C 184 771 152 782 128 772 Z" fill="none" stroke={ac2} strokeWidth="2.5" opacity={p(0.20)} />
          </svg>
        </div>
      );
    case 'plusGrid': {
      const tile = `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'><path d='M24 17 V31 M17 24 H31' stroke='${c.muted}' stroke-width='1.4' stroke-linecap='round'/></svg>`;
      return <div style={{ ...base, backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(tile)}")`, backgroundSize: '48px 48px', opacity: p(0.4) }} />;
    }
    case 'concentric':
      return (
        <div style={{ ...base, overflow: 'hidden' }}>
          <svg viewBox="0 0 1280 720" style={svgFull}>
            {[130, 235, 340, 445, 550, 655, 760].map((r, i) => (
              <circle key={i} cx="1184" cy="112" r={r} fill="none" stroke={ac} strokeWidth="1.5" opacity={p(0.16)} />
            ))}
          </svg>
        </div>
      );
    case 'halftoneCorner': {
      const dots = [];
      for (let ry = 0; ry < 4; ry++) {
        for (let cx = 0; cx < 8; cx++) {
          const dist = Math.sqrt(cx * cx + ry * ry);
          const r = Math.max(1.4, 9 - dist * 1.45);
          dots.push(<circle key={`${ry}-${cx}`} cx={1244 - cx * 54} cy={684 - ry * 54} r={r} fill={ac} />);
        }
      }
      return (
        <div style={base}>
          <svg viewBox="0 0 1280 720" style={{ ...svgFull, opacity: p(0.22) }}>{dots}</svg>
        </div>
      );
    }
    case 'topo':
      return (
        <div style={{ ...base, overflow: 'hidden' }}>
          <svg viewBox="0 0 1280 720" style={svgFull}>
            {[0.42, 0.56, 0.7, 0.84, 1].map((s, i) => (
              <path
                key={i}
                d="M860 150 C 1006 172 1070 300 1026 424 C 982 548 818 566 716 484 C 614 402 656 236 758 184 C 794 166 826 146 860 150 Z"
                fill="none"
                stroke={ac}
                strokeWidth="1.5"
                opacity={p(0.15)}
                transform={`translate(860 340) scale(${s}) translate(-860 -340)`}
              />
            ))}
          </svg>
        </div>
      );
    case 'confetti': {
      const cf = [
        { t: 'c', x: 140, y: 110, r: 0, col: ac },
        { t: 't', x: 300, y: 84, r: 18, col: ac2 },
        { t: 'q', x: 480, y: 140, r: -8, col: c.text },
        { t: 's', x: 660, y: 96, r: 0, col: ac },
        { t: 'c', x: 850, y: 128, r: 0, col: ac2 },
        { t: 't', x: 1030, y: 92, r: -24, col: ac },
        { t: 'q', x: 1178, y: 150, r: 12, col: ac2 },
        { t: 's', x: 96, y: 308, r: 200, col: c.text },
        { t: 'c', x: 1198, y: 344, r: 0, col: ac },
        { t: 't', x: 164, y: 560, r: 8, col: ac2 },
        { t: 'q', x: 380, y: 620, r: -14, col: ac },
        { t: 's', x: 640, y: 602, r: 180, col: c.text },
        { t: 'c', x: 900, y: 612, r: 0, col: ac2 },
        { t: 't', x: 1120, y: 580, r: 32, col: ac },
      ];
      const shape = (it, i) => {
        const tr = `translate(${it.x} ${it.y}) rotate(${it.r})`;
        if (it.t === 'c') return <circle key={i} cx={it.x} cy={it.y} r="7" fill={it.col} />;
        if (it.t === 't') return <path key={i} d="M0 -9 L8 7 L-8 7 Z" fill={it.col} transform={tr} />;
        if (it.t === 'q') return <path key={i} d="M-11 0 q5 -9 11 0 q6 9 11 0" fill="none" stroke={it.col} strokeWidth="2.6" strokeLinecap="round" transform={tr} />;
        return <path key={i} d="M-9 0 A9 9 0 0 1 9 0 Z" fill={it.col} transform={tr} />;
      };
      return (
        <div style={base}>
          <svg viewBox="0 0 1280 720" style={{ ...svgFull, opacity: p(0.55) }}>{cf.map(shape)}</svg>
        </div>
      );
    }
    case 'circuit': {
      const nodes = [[260, 120], [260, 300], [980, 180], [980, 80], [900, 600], [900, 460], [700, 460], [340, 620]];
      return (
        <div style={{ ...base, overflow: 'hidden' }}>
          <svg viewBox="0 0 1280 720" style={svgFull}>
            <g fill="none" stroke={ac} strokeWidth="1.5" opacity={p(0.2)}>
              <polyline points="60,120 260,120 260,300 470,300" />
              <polyline points="1200,180 980,180 980,80 748,80" />
              <polyline points="1130,600 900,600 900,460 700,460 700,566" />
              <polyline points="110,624 340,624 340,516" />
            </g>
            <g fill={ac2} opacity={p(0.3)}>
              {nodes.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="5" />)}
            </g>
          </svg>
        </div>
      );
    }
    case 'sunburst': {
      const rays = [];
      const n = 24;
      const R = 1500;
      for (let i = 0; i <= n; i++) {
        const a = (Math.PI / 2) * (i / n);
        rays.push(<line key={i} x1="0" y1="0" x2={Math.cos(a) * R} y2={Math.sin(a) * R} stroke={ac} strokeWidth="1.2" />);
      }
      return (
        <div style={{ ...base, overflow: 'hidden' }}>
          <svg viewBox="0 0 1280 720" style={{ ...svgFull, opacity: p(0.14) }}>{rays}</svg>
        </div>
      );
    }
    case 'scanlines':
      return <div style={{ ...base, backgroundImage: `repeating-linear-gradient(0deg, ${c.muted}44 0, ${c.muted}44 1px, transparent 1px, transparent 4px)`, opacity: p(0.5) }} />;
    case 'crosshatch':
      return <div style={{ ...base, backgroundImage: `repeating-linear-gradient(45deg, ${c.muted}33 0, ${c.muted}33 1px, transparent 1px, transparent 22px), repeating-linear-gradient(-45deg, ${c.muted}33 0, ${c.muted}33 1px, transparent 1px, transparent 22px)`, opacity: p(0.55) }} />;
    case 'cornerBracket':
      return (
        <div style={base}>
          <div style={{ position: 'absolute', top: 48, left: 48, width: 190, height: 190, borderTop: `2px solid ${ac}`, borderLeft: `2px solid ${ac}`, opacity: p(0.4) }} />
          <div style={{ position: 'absolute', bottom: 48, right: 48, width: 190, height: 190, borderBottom: `2px solid ${ac}`, borderRight: `2px solid ${ac}`, opacity: p(0.4) }} />
        </div>
      );
    case 'gridLines':
      return <div style={{ ...base, backgroundImage: `repeating-linear-gradient(0deg, ${c.muted}2b 0, ${c.muted}2b 1px, transparent 1px, transparent 64px), repeating-linear-gradient(90deg, ${c.muted}2b 0, ${c.muted}2b 1px, transparent 1px, transparent 64px)`, opacity: p(0.5) }} />;

    case 'none':
    default:
      return null;
  }
}
