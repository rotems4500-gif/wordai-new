// ═══════════════════════════════════════════════════════════════
// SlideRenderer.jsx — רנדר שקופית בודדת מהמודל. read-only.
// משותף לעורך, לתמונות-ממוזערות ולמצב הצגה, וגם למנוע ה-image-export.
// מרונדר על במה קבועה 1280×720 ומוקטן בעזרת scale כדי להתאים לכל גודל.
// כל שקף בנוי משכבות: BackgroundLayer (שפת עיצוב) → Motif → תוכן.
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react';
import { getThemeById, getSlideAccent } from './deckThemes';
import { resolveBgVariant } from './deckModel';
import { SlideBackground, getSlideBaseBackground } from './slideBackgrounds';

export const STAGE_W = 1280;
export const STAGE_H = 720;

// ── motif: מספר שקף ענק ועמום כקישוט (כשמוגדר ב-theme) ───────────
function Motif({ theme, index }) {
  if (theme.motif !== 'index' || index == null) return null;
  return (
    <div style={{
      position: 'absolute', bottom: -70, left: 40, zIndex: 0, pointerEvents: 'none',
      fontFamily: theme.fonts?.display, fontSize: 340, fontWeight: 900, lineHeight: 1,
      color: theme.colors.text, opacity: 0.05, userSelect: 'none',
    }}>
      {String(index + 1).padStart(2, '0')}
    </div>
  );
}

// במה בגודל קבוע — כל המידות ב-px ביחס ל-1280×720
export function SlideStage({ slide, themeId, index = null }) {
  const theme = getThemeById(themeId);
  const c = theme.colors;
  const fD = theme.fonts?.display || theme.fonts?.body || "'Heebo', sans-serif";
  const fB = theme.fonts?.body || "'Heebo', sans-serif";
  // per-slide: כל שקף accent מסתובב מפלטת ה-theme (override ידני גובר)
  const accent = getSlideAccent(theme, slide, index);
  const bgVariant = resolveBgVariant(slide, index);
  const accentStyle = theme.shape?.accentStyle || 'bar';
  const radius = theme.shape?.radius ?? 18;
  const elevation = theme.shape?.cardElevation ? '0 12px 34px rgba(2,6,23,0.28)' : 'none';
  const layout = slide?.layout || 'title-bullets';
  const img = slide?.image;
  const imgSrc = img ? (img.dataUrl || img.url) : '';

  const baseStage = {
    position: 'relative',
    width: STAGE_W,
    height: STAGE_H,
    overflow: 'hidden',
    background: getSlideBaseBackground(theme, accent, index),
    color: c.text,
    fontFamily: fB,
    direction: 'rtl',
    boxSizing: 'border-box',
  };

  // אלמנט accent לפי סגנון ה-theme (מתחת/לצד כותרת)
  const AccentMark = () => {
    if (accentStyle === 'underline') return <div style={{ marginTop: 14, width: 130, height: 5, borderRadius: 5, background: accent }} />;
    if (accentStyle === 'block') return <div style={{ marginTop: 16, width: 46, height: 16, borderRadius: 3, background: accent }} />;
    return <div style={{ marginTop: 16, width: 76, height: 8, borderRadius: 8, background: accent }} />; // bar
  };

  // כותרת אחידה עם טיפול accent (כולל מצב rail = פס אנכי לצד)
  const Heading = ({ children, size = 56, maxWidth = 1000 }) => {
    const h = (
      <h2 style={{ margin: 0, fontFamily: fD, fontSize: size, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.5px', maxWidth }}>{children}</h2>
    );
    if (accentStyle === 'rail') {
      return (
        <div style={{ display: 'flex', gap: 22, alignItems: 'stretch' }}>
          <div style={{ flex: '0 0 auto', width: 9, borderRadius: 9, background: accent }} />
          <div>{h}</div>
        </div>
      );
    }
    return <div>{h}<AccentMark /></div>;
  };

  const Bullets = ({ items, size = 30, gap = 22 }) => (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap }}>
      {(items || []).map((b, i) => (
        <li key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', fontSize: size, lineHeight: 1.42, color: c.text }}>
          <span style={{ flex: '0 0 auto', width: 11, height: 11, marginTop: size * 0.42, borderRadius: 3, background: accent, transform: 'rotate(45deg)' }} />
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );

  const ImageBox = ({ style, rounded = false }) => (
    imgSrc
      ? <img src={imgSrc} alt={img?.alt || ''} style={{ objectFit: 'cover', ...(rounded ? { borderRadius: radius } : {}), ...style }} />
      : <div style={{ ...style, ...(rounded ? { borderRadius: radius } : {}), background: c.bgAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.muted, fontSize: 22 }}>
          {img?.query ? `🖼 ${img.alt || img.query}` : '🖼 תמונה'}
        </div>
  );

  // עוטף סטנדרטי: רקע + motif + תוכן בשכבה עליונה
  const Shell = ({ children, padded = true, withBg = true, withMotif = true }) => (
    <div style={baseStage}>
      {withBg && <SlideBackground theme={theme} variant={bgVariant} accent={accent} />}
      {withMotif && <Motif theme={theme} index={index} />}
      <div style={{ position: 'relative', zIndex: 1, height: '100%', boxSizing: 'border-box', ...(padded ? { padding: '92px 96px' } : {}) }}>
        {children}
      </div>
    </div>
  );

  // ── פריסות ──────────────────────────────────────────────────
  if (layout === 'cover') {
    return (
      <div style={baseStage}>
        {imgSrc
          ? <>
              <img src={imgSrc} alt={img?.alt || ''} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${c.bg} 12%, transparent 78%)` }} />
            </>
          : <>
              <SlideBackground theme={theme} variant="mesh" accent={accent} />
              <div style={{ position: 'absolute', inset: 0, background: theme.coverGradient, opacity: 0.16 }} />
            </>}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 110px', zIndex: 1 }}>
          <div style={{ width: 96, height: 10, borderRadius: 8, background: accent, marginBottom: 36 }} />
          <h1 style={{ margin: 0, fontFamily: fD, fontSize: 80, fontWeight: 900, lineHeight: 1.06, letterSpacing: '-1px', maxWidth: 940 }}>{slide.title || 'כותרת המצגת'}</h1>
          {slide.subtitle && <p style={{ marginTop: 28, fontFamily: fB, fontSize: 32, color: c.muted, maxWidth: 820 }}>{slide.subtitle}</p>}
        </div>
      </div>
    );
  }

  if (layout === 'section') {
    return (
      <div style={{ ...baseStage }}>
        <div style={{ position: 'absolute', inset: 0, background: theme.coverGradient, opacity: 0.9 }} />
        <div style={{ position: 'absolute', inset: 0, background: c.bg, opacity: 0.45 }} />
        <Motif theme={theme} index={index} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '0 120px', textAlign: 'center', zIndex: 1 }}>
          <div style={{ width: 70, height: 8, borderRadius: 8, background: accent, marginBottom: 30 }} />
          <h1 style={{ margin: 0, fontFamily: fD, fontSize: 72, fontWeight: 900, lineHeight: 1.12, letterSpacing: '-0.5px' }}>{slide.title || 'מפריד נושא'}</h1>
          {slide.subtitle && <p style={{ marginTop: 24, fontFamily: fB, fontSize: 30, color: c.text, opacity: 0.9 }}>{slide.subtitle}</p>}
        </div>
      </div>
    );
  }

  if (layout === 'quote') {
    return (
      <Shell padded={false}>
        <div style={{ height: '100%', padding: '0 130px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontFamily: fD, fontSize: 180, lineHeight: 0.6, color: accent, fontWeight: 900, marginBottom: 24 }}>״</div>
          <blockquote style={{ margin: 0, fontFamily: fD, fontSize: 50, fontWeight: 700, lineHeight: 1.32, maxWidth: 1000 }}>{slide.body || 'ציטוט'}</blockquote>
          {slide.subtitle && <p style={{ marginTop: 32, fontFamily: fB, fontSize: 28, color: c.muted }}>— {slide.subtitle}</p>}
        </div>
      </Shell>
    );
  }

  if (layout === 'image-full') {
    return (
      <div style={baseStage}>
        <ImageBox style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        {(slide.title || slide.subtitle) && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '130px 90px 60px', background: `linear-gradient(0deg, ${c.bg} 12%, transparent)`, zIndex: 1 }}>
            <h2 style={{ margin: 0, fontFamily: fD, fontSize: 54, fontWeight: 800, letterSpacing: '-0.5px' }}>{slide.title}</h2>
            {slide.subtitle && <p style={{ marginTop: 14, fontFamily: fB, fontSize: 28, color: c.muted }}>{slide.subtitle}</p>}
          </div>
        )}
      </div>
    );
  }

  if (layout === 'image-right' || layout === 'image-left') {
    const imageFirst = layout === 'image-left';
    const textCol = (
      <div style={{ flex: 1, padding: '104px 84px', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
        <Heading size={52} maxWidth={620}>{slide.title || 'כותרת'}</Heading>
        <div style={{ marginTop: 34 }}><Bullets items={slide.bullets} size={29} /></div>
      </div>
    );
    const imgCol = <div style={{ flex: '0 0 46%', position: 'relative' }}><ImageBox style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} /></div>;
    return (
      <div style={{ ...baseStage, display: 'flex', flexDirection: imageFirst ? 'row' : 'row-reverse' }}>
        <SlideBackground theme={theme} variant={bgVariant} accent={accent} />
        {imgCol}{textCol}
      </div>
    );
  }

  if (layout === 'two-column') {
    const cols = (slide.columns || []).slice(0, 3);
    return (
      <Shell>
        <Heading size={50}>{slide.title || 'כותרת'}</Heading>
        <div style={{ marginTop: 46, display: 'flex', gap: 40 }}>
          {cols.map((col, i) => (
            <div key={i} style={{ flex: 1, background: c.surface, borderRadius: radius, padding: '34px 30px', boxShadow: elevation, border: `1px solid ${c.border || 'transparent'}` }}>
              {col.heading && <h3 style={{ margin: '0 0 22px', fontFamily: fD, fontSize: 32, fontWeight: 800, color: accent }}>{col.heading}</h3>}
              <Bullets items={col.bullets} size={26} gap={18} />
            </div>
          ))}
        </div>
      </Shell>
    );
  }

  if (layout === 'big-statement') {
    return (
      <Shell padded={false}>
        <div style={{ height: '100%', padding: '0 120px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ width: 90, height: 9, borderRadius: 9, background: accent, marginBottom: 34 }} />
          <div style={{ fontFamily: fD, fontSize: 72, fontWeight: 900, lineHeight: 1.16, letterSpacing: '-0.5px', maxWidth: 1040 }}>{slide.body || 'משפט מפתח'}</div>
          {slide.subtitle && <p style={{ marginTop: 30, fontFamily: fB, fontSize: 28, color: c.muted }}>{slide.subtitle}</p>}
        </div>
      </Shell>
    );
  }

  if (layout === 'stat') {
    const stats = (slide.stats || []).slice(0, 4);
    const n = Math.max(1, stats.length);
    return (
      <Shell>
        <Heading size={50}>{slide.title || 'נתונים'}</Heading>
        <div style={{ marginTop: 54, display: 'flex', gap: 40, justifyContent: n <= 2 ? 'flex-start' : 'space-between' }}>
          {stats.map((st, i) => (
            <div key={i} style={{ flex: n <= 2 ? '0 0 auto' : 1, minWidth: 0, maxWidth: n <= 2 ? 460 : 'none' }}>
              <div style={{ fontFamily: fD, fontSize: 100, fontWeight: 900, lineHeight: 1, color: accent, letterSpacing: '-2px' }}>{st.value}</div>
              <div style={{ marginTop: 14, fontFamily: fD, fontSize: 26, fontWeight: 700 }}>{st.label}</div>
              {st.caption && <div style={{ marginTop: 8, fontFamily: fB, fontSize: 18, color: c.muted, lineHeight: 1.4 }}>{st.caption}</div>}
            </div>
          ))}
        </div>
      </Shell>
    );
  }

  if (layout === 'steps') {
    const steps = (slide.steps || []).slice(0, 6);
    const n = Math.max(1, steps.length);
    return (
      <Shell>
        <Heading size={50}>{slide.title || 'תהליך'}</Heading>
        <div style={{ marginTop: 50, display: 'flex', gap: 28 }}>
          {steps.map((st, i) => (
            <div key={i} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <div style={{ flex: '0 0 auto', width: 58, height: 58, borderRadius: '50%', background: accent, color: c.onAccent || c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fD, fontSize: 28, fontWeight: 900 }}>{i + 1}</div>
                {i < n - 1 && <div style={{ flex: 1, height: 3, borderRadius: 3, background: c.bgAlt }} />}
              </div>
              <div style={{ fontFamily: fD, fontSize: 24, fontWeight: 800, marginBottom: 8 }}>{st.title}</div>
              {st.body && <div style={{ fontFamily: fB, fontSize: 18, color: c.muted, lineHeight: 1.45 }}>{st.body}</div>}
            </div>
          ))}
        </div>
      </Shell>
    );
  }

  if (layout === 'comparison') {
    const cols = (slide.columns || []).slice(0, 2);
    const sideAccent = [accent, c.accent2 || accent];
    return (
      <Shell>
        <Heading size={48}>{slide.title || 'השוואה'}</Heading>
        <div style={{ marginTop: 42, display: 'flex', alignItems: 'stretch', position: 'relative' }}>
          {cols.map((col, i) => (
            <div key={i} style={{ flex: 1, background: c.surface, borderRadius: radius, padding: '30px 28px', boxShadow: elevation, border: `1px solid ${c.border || 'transparent'}`, margin: i === 0 ? '0 14px 0 0' : '0 0 0 14px' }}>
              <div style={{ display: 'inline-block', fontFamily: fD, fontSize: 28, fontWeight: 800, color: sideAccent[i % 2], borderBottom: `4px solid ${sideAccent[i % 2]}`, paddingBottom: 8, marginBottom: 22 }}>{col.heading || (i === 0 ? 'אפשרות א' : 'אפשרות ב')}</div>
              <Bullets items={col.bullets} size={24} gap={16} />
            </div>
          ))}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 64, height: 64, borderRadius: '50%', background: c.bg, border: `3px solid ${accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fD, fontSize: 24, fontWeight: 900, color: accent, zIndex: 2 }}>VS</div>
        </div>
      </Shell>
    );
  }

  // ברירת מחדל: title-bullets / closing
  return (
    <Shell>
      <Heading size={56}>{slide.title || 'כותרת השקופית'}</Heading>
      {slide.subtitle && <p style={{ margin: '20px 0 0', fontFamily: fB, fontSize: 30, color: c.muted }}>{slide.subtitle}</p>}
      <div style={{ marginTop: 40, display: 'flex', gap: 60, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}><Bullets items={slide.bullets} size={32} /></div>
        {imgSrc && <div style={{ flex: '0 0 38%' }}><ImageBox rounded style={{ width: '100%', height: 400 }} /></div>}
      </div>
    </Shell>
  );
}

// עוטף רספונסיבי — מקטין את הבמה כדי שתתאים לרוחב ההורה (שומר 16:9)
export function SlideFrame({ slide, themeId, index = null, rounded = true, shadow = true, className = '', style = {} }) {
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
        <SlideStage slide={slide} themeId={themeId} index={index} />
      </div>
    </div>
  );
}
