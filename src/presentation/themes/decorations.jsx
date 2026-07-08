// ═══════════════════════════════════════════════════════════════
// themes/decorations.jsx — אוצר-מילים ויזואלי משותף ל-SlideRenderer.
// רכיבים/helpers *טהורים* (props מפורשים, בלי state גלובלי של theme).
// כל אלה מרונדרים כ-DOM שנצרב ל-raster (html-to-image) בייצוא, לכן:
//   אסור: backdrop-filter / mask-image / mix-blend-mode / url() חיצוני.
//   מותר: inline <svg> (feTurbulence/filter עצמאיים), CSS gradients,
//          filter: blur()/drop-shadow, box-shadow, clip-path polygon.
// כל ה-defaults משחזרים את ההתנהגות הקיימת של 6 ה-themes בדיוק.
// ═══════════════════════════════════════════════════════════════

import React from 'react';
import { Check } from 'lucide-react';
import { isLightTheme } from '../deckThemes';

// data-URI לתוך background-image (לא url חיצוני — נצרב ל-raster בסדר)
const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

// resolve צבע טקסטורה: 'muted'|'accent'|hex → צבע ממשי מול פלטת ה-theme
function resolveTexColor(color, colors, accent) {
  if (!color || color === 'muted') return colors?.muted || '#94a3b8';
  if (color === 'accent') return accent;
  return color; // hex גולמי
}

// ── שכבת טקסטורה מלאת-במה ──────────────────────────────────────
// מחזיר style object (או null) עבור div אבסולוטי inset:0.
function textureLayerStyle(tex, colors, accent, isLight) {
  const kind = tex?.kind;
  if (!kind || kind === 'none') return null;
  const scale = tex.scale || 1;
  const col = resolveTexColor(tex.color, colors, accent);
  let opacity = tex.opacity ?? 0.06;
  if (isLight) opacity *= 0.6; // עמעום על themes בהירים

  switch (kind) {
    case 'noise': {
      const T = Math.round(180 * scale);
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${T}' height='${T}'><filter id='t'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#t)'/></svg>`;
      return { backgroundImage: svgUrl(svg), backgroundSize: `${T}px ${T}px`, opacity };
    }
    case 'grain': {
      const T = Math.round(120 * scale);
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${T}' height='${T}'><filter id='t'><feTurbulence type='fractalNoise' baseFrequency='0.5' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#t)'/></svg>`;
      return { backgroundImage: svgUrl(svg), backgroundSize: `${T}px ${T}px`, opacity };
    }
    case 'halftone': {
      // דמוי-הלפטון: 2-3 שכבות נקודות רדיאליות בגדלים שונים
      const a = Math.round(18 * scale);
      const b = Math.round(12 * scale);
      return {
        backgroundImage: `radial-gradient(${col} 1.6px, transparent 1.8px), radial-gradient(${col} 1px, transparent 1.2px)`,
        backgroundSize: `${a}px ${a}px, ${b}px ${b}px`,
        backgroundPosition: '0 0, 6px 6px',
        opacity,
      };
    }
    case 'topo': {
      const T = Math.round(260 * scale);
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${T}' height='${T}'><g fill='none' stroke='${col}' stroke-width='1.4'><circle cx='${T / 2}' cy='${T / 2}' r='${T * 0.09}'/><circle cx='${T / 2}' cy='${T / 2}' r='${T * 0.2}'/><circle cx='${T / 2}' cy='${T / 2}' r='${T * 0.31}'/><circle cx='${T / 2}' cy='${T / 2}' r='${T * 0.42}'/></g></svg>`;
      return { backgroundImage: svgUrl(svg), backgroundSize: `${T}px ${T}px`, opacity };
    }
    case 'dotmatrix': {
      const T = Math.round(22 * scale);
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${T}' height='${T}'><rect x='0' y='0' width='2.5' height='2.5' fill='${col}'/></svg>`;
      return { backgroundImage: svgUrl(svg), backgroundSize: `${T}px ${T}px`, opacity };
    }
    case 'scanlines': {
      const step = Math.max(2, Math.round(3 * scale));
      return {
        backgroundImage: `repeating-linear-gradient(0deg, ${col} 0, ${col} 1px, transparent 1px, transparent ${step}px)`,
        opacity,
      };
    }
    case 'crosshatch': {
      const step = Math.round(8 * scale);
      return {
        backgroundImage: `repeating-linear-gradient(45deg, ${col} 0, ${col} 1px, transparent 1px, transparent ${step}px), repeating-linear-gradient(-45deg, ${col} 0, ${col} 1px, transparent 1px, transparent ${step}px)`,
        opacity,
      };
    }
    default:
      return null;
  }
}

export function TextureLayer({ theme, accent }) {
  const tex = theme?.texture;
  if (!tex || !tex.kind || tex.kind === 'none') return null;
  const style = textureLayerStyle(tex, theme.colors || {}, accent, isLightTheme(theme));
  if (!style) return null;
  return <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', ...style }} />;
}

// ── סמן בולט לפי bulletStyle ────────────────────────────────────
// 'check' = בדיוק ה-BulletChip הקודם. השאר — וריאציות.
export function renderBulletMarker({ style, accent, index = 0, size = 30, colors, displayFont }) {
  const chip = Math.round((size / 30) * 26);
  switch (style || 'check') {
    case 'dash':
      return <span key="m" style={{ flex: '0 0 auto', width: Math.round(chip * 0.7), height: Math.max(3, Math.round(chip * 0.16)), borderRadius: 2, background: accent, marginTop: Math.round(size * 0.5) }} />;
    case 'square': {
      const s = Math.round(chip * 0.5);
      return <span key="m" style={{ flex: '0 0 auto', width: s, height: s, borderRadius: 2, background: accent, marginTop: Math.round(size * 0.28) }} />;
    }
    case 'arrow': {
      const s = Math.round(chip * 0.62);
      return (
        <span key="m" style={{ flex: '0 0 auto', width: s, height: s, marginTop: Math.round(size * 0.22), display: 'flex' }}>
          <svg width={s} height={s} viewBox="0 0 10 10"><path d="M7.5 1.5 L2.5 5 L7.5 8.5 Z" fill={accent} /></svg>
        </span>
      );
    }
    case 'dot': {
      const s = Math.round(chip * 0.42);
      return <span key="m" style={{ flex: '0 0 auto', width: s, height: s, borderRadius: '50%', background: accent, marginTop: Math.round(size * 0.34) }} />;
    }
    case 'plus':
      return <span key="m" style={{ flex: '0 0 auto', width: chip, height: chip, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, fontFamily: displayFont, fontSize: Math.round(chip * 0.95), fontWeight: 900, lineHeight: 1 }}>+</span>;
    case 'number':
      return <span key="m" style={{ flex: '0 0 auto', width: chip, height: chip, borderRadius: '50%', background: `${accent}2E`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: displayFont, fontSize: Math.round(chip * 0.5), fontWeight: 800 }}>{(index || 0) + 1}</span>;
    case 'check':
    default: {
      const iconSize = Math.round(chip * 0.6);
      return (
        <span key="m" style={{ flex: '0 0 auto', width: chip, height: chip, borderRadius: '50%', background: `${accent}2E`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={iconSize} color={accent} strokeWidth={2.5} />
        </span>
      );
    }
  }
}

// ── סמן accent מתחת לכותרת (bar/block/underline) — משוחזר מדויק ──
export function renderAccentMark(treatment, accent) {
  if (treatment === 'underline') return <div style={{ marginTop: 14, width: 130, height: 5, borderRadius: 5, background: accent }} />;
  if (treatment === 'block') return <div style={{ marginTop: 16, width: 46, height: 16, borderRadius: 3, background: accent }} />;
  return <div style={{ marginTop: 16, width: 76, height: 8, borderRadius: 8, background: accent }} />; // bar
}

// ── טיפולי-כותרת חדשים (עוטפים את הכותרת כולה) ──────────────────
// treatment: bracket|boxed|highlight|kickerRule|oversizeNumber.
// kicker/heading — nodes מוכנים; index — למספר-ענק.
export function renderHeadingTreatment({ treatment, accent, radius = 18, colors, displayFont, index, kicker, heading }) {
  switch (treatment) {
    case 'bracket':
      return (
        <div style={{ position: 'relative', display: 'inline-block', padding: '16px 20px' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: 26, height: 26, borderTop: `4px solid ${accent}`, borderRight: `4px solid ${accent}` }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: 26, height: 26, borderBottom: `4px solid ${accent}`, borderLeft: `4px solid ${accent}` }} />
          {kicker}{heading}
        </div>
      );
    case 'boxed':
      return (
        <div style={{ display: 'inline-block', border: `3px solid ${accent}`, borderRadius: radius, padding: '16px 24px' }}>
          {kicker}{heading}
        </div>
      );
    case 'highlight':
      return (
        <div>
          {kicker}
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div style={{ position: 'absolute', left: -8, right: -8, bottom: 6, height: '40%', background: `${accent}55`, borderRadius: 4, zIndex: 0 }} />
            <div style={{ position: 'relative', zIndex: 1 }}>{heading}</div>
          </div>
        </div>
      );
    case 'kickerRule':
      return (
        <div>
          <div style={{ height: 2, background: accent, opacity: 0.5, marginBottom: 14 }} />
          {kicker}{heading}
        </div>
      );
    case 'oversizeNumber':
      return (
        <div style={{ position: 'relative' }}>
          {index != null && (
            <div style={{ position: 'absolute', top: -46, left: 0, fontFamily: displayFont, fontSize: 200, fontWeight: 900, lineHeight: 1, color: accent, opacity: 0.12, zIndex: 0, userSelect: 'none', pointerEvents: 'none' }}>
              {String(index + 1).padStart(2, '0')}
            </div>
          )}
          <div style={{ position: 'relative', zIndex: 1 }}>{kicker}{heading}</div>
        </div>
      );
    default:
      return <div>{kicker}{heading}{renderAccentMark(treatment, accent)}</div>;
  }
}

// ── סגנון משטח כרטיס לפי cardStyle ─────────────────────────────
// elevated/flat משחזרים את ה-elevation/border הקיימים בדיוק.
export function cardSurfaceStyle({ cardStyle, colors, isLight, accent }) {
  switch (cardStyle) {
    case 'outline':
      return { background: 'transparent', boxShadow: 'none', border: `2px solid ${colors.border || accent}` };
    case 'glass':
      return {
        background: isLight ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.08)',
        boxShadow: `inset 0 0 0 1px ${isLight ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.16)'}`,
        border: 'none',
      };
    case 'flat':
      return { background: colors.surface, boxShadow: 'none', border: `1px solid ${colors.border || 'transparent'}` };
    case 'elevated':
    default:
      return { background: colors.surface, boxShadow: '0 12px 34px rgba(2,6,23,0.28)', border: `1px solid ${colors.border || 'transparent'}` };
  }
}

// ── טיפול תמונה לפי theme.image ─────────────────────────────────
// plain — בלי תוספת (parity מלא מול ImageBox הקיים).
export function getImageTreatment({ image, accent, colors, radius = 18 }) {
  const t = image?.treatment || 'plain';
  const r = image?.radius ?? radius;
  switch (t) {
    case 'rounded':
      return { wrap: false, imgStyle: { borderRadius: r }, placeholderStyle: { borderRadius: r }, overlay: null };
    case 'border': {
      const bs = { borderRadius: r, border: `4px solid ${image?.borderColor || accent}`, boxSizing: 'border-box' };
      return { wrap: false, imgStyle: bs, placeholderStyle: bs, overlay: null };
    }
    case 'frame':
      return { wrap: true, wrapperStyle: { background: colors.surface, padding: 14, border: `1px solid ${image?.borderColor || accent}`, borderRadius: r, boxSizing: 'border-box' }, imgStyle: { borderRadius: Math.max(0, r - 8) }, overlay: null };
    case 'polaroid':
      return { wrap: true, wrapperStyle: { background: '#ffffff', padding: '14px 14px 44px', borderRadius: 3, transform: 'rotate(-1.5deg)', boxShadow: '0 16px 34px rgba(2,6,23,0.30)', boxSizing: 'border-box' }, imgStyle: {}, overlay: null };
    case 'duotone': {
      const duo = Array.isArray(image?.duotone) ? image.duotone : ['#0b1220', accent];
      return {
        wrap: true,
        wrapperStyle: { borderRadius: r, boxSizing: 'border-box' },
        imgStyle: { filter: 'grayscale(1) contrast(1.05)' },
        overlay: <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${duo[0]}, ${duo[1]})`, opacity: 0.55, pointerEvents: 'none' }} />,
      };
    }
    case 'plain':
    default:
      return { wrap: false, imgStyle: {}, placeholderStyle: {}, overlay: null };
  }
}

// ── רקע לקו-מפריד לפי dividerStyle ─────────────────────────────
// 'line' (default) → colors.bgAlt (זהה לקו הקיים בציר-הזמן).
export function dividerBackground(style, accent, colors) {
  switch (style) {
    case 'dotted':
    case 'dashed':
      return `repeating-linear-gradient(90deg, ${colors.muted} 0, ${colors.muted} 6px, transparent 6px, transparent 12px)`;
    case 'gradient':
      return `linear-gradient(90deg, ${accent}, transparent)`;
    case 'zigzag':
      return `repeating-linear-gradient(-45deg, ${accent} 0, ${accent} 2px, transparent 2px, transparent 8px)`;
    case 'none':
      return 'transparent';
    case 'line':
    default:
      return colors.bgAlt;
  }
}
