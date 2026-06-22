// ═══════════════════════════════════════════════════════════════
// SlideRenderer.jsx — רנדר שקופית בודדת מהמודל. read-only.
// משותף לעורך, לתמונות-ממוזערות ולמצב הצגה.
// מרונדר על במה קבועה 1280×720 ומוקטן בעזרת scale כדי להתאים לכל גודל.
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react';
import { getThemeById } from './deckThemes';

export const STAGE_W = 1280;
export const STAGE_H = 720;

// במה בגודל קבוע — כל המידות ב-px ביחס ל-1280×720
export function SlideStage({ slide, themeId }) {
  const theme = getThemeById(themeId);
  const c = theme.colors;
  const accent = (slide?.accent && slide.accent.trim()) || c.accent;
  const layout = slide?.layout || 'title-bullets';
  const img = slide?.image;
  const imgSrc = img ? (img.dataUrl || img.url) : '';

  const baseStage = {
    position: 'relative',
    width: STAGE_W,
    height: STAGE_H,
    overflow: 'hidden',
    background: c.bg,
    color: c.text,
    fontFamily: theme.fontFamily,
    direction: 'rtl',
    boxSizing: 'border-box',
  };

  const Bullets = ({ items, size = 30 }) => (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 22 }}>
      {(items || []).map((b, i) => (
        <li key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', fontSize: size, lineHeight: 1.4, color: c.text }}>
          <span style={{ flex: '0 0 auto', width: 12, height: 12, marginTop: size * 0.45, borderRadius: 4, background: accent }} />
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );

  const AccentBar = ({ left = 80 }) => (
    <div style={{ position: 'absolute', top: 96, right: left, width: 72, height: 8, borderRadius: 8, background: accent }} />
  );

  const ImageBox = ({ style }) => (
    imgSrc
      ? <img src={imgSrc} alt={img?.alt || ''} style={{ objectFit: 'cover', ...style }} />
      : <div style={{ ...style, background: c.bgAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.muted, fontSize: 22 }}>
          {img?.query ? `🖼 ${img.alt || img.query}` : '🖼 תמונה'}
        </div>
  );

  // ── פריסות ──────────────────────────────────────────────────
  if (layout === 'cover') {
    return (
      <div style={baseStage}>
        {imgSrc && <img src={imgSrc} alt={img?.alt || ''} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45 }} />}
        <div style={{ position: 'absolute', inset: 0, background: imgSrc ? `linear-gradient(90deg, ${c.bg} 8%, transparent 70%)` : theme.coverGradient, opacity: imgSrc ? 0.9 : 0.18 }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 110px' }}>
          <div style={{ width: 96, height: 10, borderRadius: 8, background: accent, marginBottom: 36 }} />
          <h1 style={{ margin: 0, fontSize: 76, fontWeight: 900, lineHeight: 1.1, maxWidth: 900 }}>{slide.title || 'כותרת המצגת'}</h1>
          {slide.subtitle && <p style={{ marginTop: 28, fontSize: 32, color: c.muted, maxWidth: 820 }}>{slide.subtitle}</p>}
        </div>
      </div>
    );
  }

  if (layout === 'section') {
    return (
      <div style={{ ...baseStage, background: theme.coverGradient }}>
        <div style={{ position: 'absolute', inset: 0, background: c.bg, opacity: 0.55 }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '0 120px', textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 68, fontWeight: 900, lineHeight: 1.15 }}>{slide.title || 'מפריד נושא'}</h1>
          {slide.subtitle && <p style={{ marginTop: 24, fontSize: 30, color: c.text, opacity: 0.85 }}>{slide.subtitle}</p>}
        </div>
      </div>
    );
  }

  if (layout === 'quote') {
    return (
      <div style={{ ...baseStage, padding: '0 130px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: 160, lineHeight: 0.6, color: accent, fontWeight: 900, marginBottom: 20 }}>״</div>
        <blockquote style={{ margin: 0, fontSize: 48, fontWeight: 700, lineHeight: 1.35, maxWidth: 1000 }}>{slide.body || 'ציטוט'}</blockquote>
        {slide.subtitle && <p style={{ marginTop: 32, fontSize: 28, color: c.muted }}>— {slide.subtitle}</p>}
      </div>
    );
  }

  if (layout === 'image-full') {
    return (
      <div style={baseStage}>
        <ImageBox style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        {(slide.title || slide.subtitle) && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '120px 90px 60px', background: `linear-gradient(0deg, ${c.bg} 10%, transparent)` }}>
            <h2 style={{ margin: 0, fontSize: 52, fontWeight: 800 }}>{slide.title}</h2>
            {slide.subtitle && <p style={{ marginTop: 14, fontSize: 28, color: c.muted }}>{slide.subtitle}</p>}
          </div>
        )}
      </div>
    );
  }

  if (layout === 'image-right' || layout === 'image-left') {
    const imageFirst = layout === 'image-left';
    const textCol = (
      <div style={{ flex: 1, padding: '110px 90px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h2 style={{ margin: '0 0 14px', fontSize: 52, fontWeight: 800, lineHeight: 1.15 }}>{slide.title || 'כותרת'}</h2>
        <div style={{ width: 64, height: 8, borderRadius: 8, background: accent, marginBottom: 34 }} />
        <Bullets items={slide.bullets} size={29} />
      </div>
    );
    const imgCol = <div style={{ flex: '0 0 46%', position: 'relative' }}><ImageBox style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} /></div>;
    return (
      <div style={{ ...baseStage, display: 'flex', flexDirection: imageFirst ? 'row' : 'row-reverse' }}>
        {imgCol}{textCol}
      </div>
    );
  }

  if (layout === 'two-column') {
    const cols = (slide.columns || []).slice(0, 3);
    return (
      <div style={{ ...baseStage, padding: '96px 90px' }}>
        <AccentBar />
        <h2 style={{ margin: '0 0 50px', fontSize: 52, fontWeight: 800 }}>{slide.title || 'כותרת'}</h2>
        <div style={{ display: 'flex', gap: 48 }}>
          {cols.map((col, i) => (
            <div key={i} style={{ flex: 1, background: c.surface, borderRadius: 22, padding: '34px 30px' }}>
              {col.heading && <h3 style={{ margin: '0 0 22px', fontSize: 32, fontWeight: 800, color: accent }}>{col.heading}</h3>}
              <Bullets items={col.bullets} size={26} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ברירת מחדל: title-bullets / closing
  return (
    <div style={{ ...baseStage, padding: '96px 90px' }}>
      <AccentBar />
      <h2 style={{ margin: '0 0 16px', fontSize: 56, fontWeight: 800, lineHeight: 1.15, maxWidth: 1000 }}>{slide.title || 'כותרת השקופית'}</h2>
      {slide.subtitle && <p style={{ margin: '0 0 36px', fontSize: 30, color: c.muted }}>{slide.subtitle}</p>}
      <div style={{ marginTop: slide.subtitle ? 0 : 40, display: 'flex', gap: 60, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}><Bullets items={slide.bullets} size={32} /></div>
        {imgSrc && <div style={{ flex: '0 0 38%' }}><ImageBox style={{ width: '100%', height: 400, borderRadius: 22 }} /></div>}
      </div>
    </div>
  );
}

// עוטף רספונסיבי — מקטין את הבמה כדי שתתאים לרוחב ההורה (שומר 16:9)
export function SlideFrame({ slide, themeId, rounded = true, shadow = true, className = '', style = {} }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setScale(el.clientWidth / STAGE_W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        borderRadius: rounded ? 16 : 0,
        overflow: 'hidden',
        boxShadow: shadow ? '0 18px 50px rgba(2,6,23,0.35)' : 'none',
        ...style,
      }}
    >
      <div style={{ position: 'absolute', top: 0, right: 0, transformOrigin: 'top right', transform: `scale(${scale})` }}>
        <SlideStage slide={slide} themeId={themeId} />
      </div>
    </div>
  );
}
