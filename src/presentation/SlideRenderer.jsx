// ═══════════════════════════════════════════════════════════════
// SlideRenderer.jsx — רנדר שקופית בודדת מהמודל. read-only.
// משותף לעורך, לתמונות-ממוזערות ולמצב הצגה, וגם למנוע ה-image-export.
// מרונדר על במה קבועה 1280×720 ומוקטן בעזרת scale כדי להתאים לכל גודל.
// כל שקף בנוי משכבות: BackgroundLayer (שפת עיצוב) → Motif → תוכן.
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react';
import { getThemeById, getSlideAccent, isLightTheme } from './deckThemes';
import { resolveBgVariant } from './deckModel';
import { SlideBackground, getSlideBaseBackground } from './slideBackgrounds';
import {
  TextureLayer,
  renderBulletMarker,
  renderAccentMark,
  renderHeadingTreatment,
  cardSurfaceStyle,
  getImageTreatment,
  dividerBackground,
} from './themes/decorations.jsx';

export const STAGE_W = 1280;
export const STAGE_H = 720;

// פריסות "תוכן" — יש להן קיקר + פוטר. שער/מפריד/תמונה-מלאה יש להם קומפוזיציה עצמאית.
const FURNITURE_LAYOUTS_EXCLUDE = new Set(['cover', 'section', 'image-full']);

// יש בטקסט אות עברית? (משמש לשער ה-placeholder — לא מציגים query באנגלית)
const RE_HAS_HEB = /[֐-׿יִ-ﭏ]/;

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
// bgOnly=true — מרנדר רק את שכבת הרקע/העיצוב של השקף (בלי טקסט/תוכן/תמונות),
// לצריבת רקע ל-native export. early-return בראש כדי שלא ידרוף מלוגיקת הפריסות.
// forExport=true — רנדר לצריבה (PPTX/תמונה): מציין שקופית שהתמונה שלה עדיין
// חסרה מרונדרת כבלוק ניטרלי לגמרי, בלי שום טקסט placeholder.
export function SlideStage({ slide, themeId, index = null, bgOnly = false, deckTitle = '', customTheme = null, forExport = false }) {
  // customTheme — ערכה שנוצרה ב-AI (resolveTheme כבר מילא בה כל שדה חסר).
  // גוברת על themeId, כדי שהעיצוב החדש יופיע בעורך, בתצוגה ובייצוא באותה שכבה.
  const theme = (customTheme && customTheme.colors) ? customTheme : getThemeById(themeId);
  const c = theme.colors;
  const fD = theme.fonts?.display || theme.fonts?.body || "'Heebo', sans-serif";
  const fB = theme.fonts?.body || "'Heebo', sans-serif";
  // per-slide: כל שקף accent מסתובב מפלטת ה-theme (override ידני גובר)
  const accent = getSlideAccent(theme, slide, index);
  const bgVariant = resolveBgVariant(slide, index, theme);
  const accentStyle = theme.shape?.accentStyle || 'bar';
  const radius = theme.shape?.radius ?? 18;
  const isLight = isLightTheme(theme);
  const layout = slide?.layout || 'title-bullets';
  const img = slide?.image;
  const imgSrc = img ? (img.dataUrl || img.url) : '';
  // רקע מחולל (AI): שכבה מתחת לתוכן ומעל בסיס ה-theme. מרונדר גם ב-bgOnly,
  // ולכן נצרב אוטומטית לרקע ה-PPTX דרך מסלול ה-bg-raster הקיים.
  const bgImg = slide?.bgImage;
  const bgImgSrc = bgImg ? (bgImg.dataUrl || bgImg.url) : '';
  // ⚠️ הרקע המחולל נצרב לתוך baseStage ולא כרכיב נפרד: חלק מהפריסות
  // (image-full/cover/quote) לא עוברות דרך Shell, ושכבה נפרדת פשוט לא הופיעה בהן.
  // שכבות CSS-background חלות על כל פריסה, וגם על bgOnly ⇒ שורדות לייצוא PPTX.
  // אין opacity פר-שכבה ב-CSS, ולכן העמעום נעשה דרך אלפא של ה-scrim מעל התמונה.
  const bgAlphaHex = (() => {
    const opacity = Number.isFinite(bgImg?.opacity) ? bgImg.opacity : 0.55;
    const scrimAlpha = Math.round(Math.min(1, Math.max(0, 1 - opacity)) * 255);
    return scrimAlpha.toString(16).padStart(2, '0').toUpperCase();
  })();
  const generatedBgLayers = bgImgSrc
    ? [
        ...(bgImg?.scrim === false ? [] : [`linear-gradient(180deg, ${c.bg}${bgAlphaHex} 0%, ${c.bg}${bgAlphaHex} 100%)`]),
        `url("${bgImgSrc}") center center / cover no-repeat`,
      ]
    : [];

  const baseStage = {
    position: 'relative',
    width: STAGE_W,
    height: STAGE_H,
    overflow: 'hidden',
    background: [...generatedBgLayers, getSlideBaseBackground(theme, accent, index)].join(', '),
    color: c.text,
    fontFamily: fB,
    direction: 'rtl',
    boxSizing: 'border-box',
  };

  // טיפול-כותרת פעיל. ל-6 ה-themes הקיימים headingTreatment === accentStyle.
  const headingTreatment = theme.headingTreatment || accentStyle;

  // תווית עליונה קטנה מעל הכותרת (אופציונלי, פריסות תוכן בלבד)
  const Kicker = () => (
    !slide?.kicker ? null : (
      <div style={{ fontFamily: fB, fontSize: 20, fontWeight: 700, letterSpacing: '2px', color: accent, marginBottom: 14 }}>
        {slide.kicker}
      </div>
    )
  );

  // כותרת אחידה עם טיפול accent (כולל מצב rail = פס אנכי לצד)
  const Heading = ({ children, size = 56, maxWidth = 1000 }) => {
    const h = (
      <h2 style={{ margin: 0, fontFamily: fD, fontSize: size, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.5px', maxWidth }}>{children}</h2>
    );
    if (headingTreatment === 'rail') {
      return (
        <div style={{ display: 'flex', gap: 22, alignItems: 'stretch' }}>
          <div style={{ flex: '0 0 auto', width: 9, borderRadius: 9, background: accent }} />
          <div><Kicker />{h}</div>
        </div>
      );
    }
    // bar/block/underline — פלט זהה לקודם; טיפולים חדשים דרך decorations.
    if (headingTreatment === 'bar' || headingTreatment === 'block' || headingTreatment === 'underline') {
      return <div><Kicker />{h}{renderAccentMark(headingTreatment, accent)}</div>;
    }
    return renderHeadingTreatment({ treatment: headingTreatment, accent, radius, colors: c, displayFont: fD, index, kicker: <Kicker />, heading: h });
  };

  // פוטר תחתון: שם הדק מימין + מספר שקף משמאל. פריסות תוכן בלבד (לא cover/section/image-full), לא ב-bgOnly.
  const Footer = () => {
    if (bgOnly || FURNITURE_LAYOUTS_EXCLUDE.has(layout)) return null;
    const footerStyle = theme.footerStyle || 'minimal';
    if (footerStyle === 'none') return null;
    const pageNum = index == null ? '' : String(index + 1).padStart(2, '0');
    // 'ruled' — קו-שיער עליון לכל הרוחב; 'boxed' — צ'יפ ממוסגר סביב המספר.
    if (footerStyle === 'ruled') {
      return (
        <div style={{ position: 'absolute', bottom: 28, right: 96, left: 96, zIndex: 1, display: 'flex', justifyContent: 'space-between', fontFamily: fB, fontSize: 16, color: c.muted, opacity: 0.75, whiteSpace: 'nowrap', borderTop: `1px solid ${c.border || c.muted}`, paddingTop: 12 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 700 }}>{deckTitle}</span>
          <span>{pageNum}</span>
        </div>
      );
    }
    if (footerStyle === 'boxed') {
      return (
        <div style={{ position: 'absolute', bottom: 28, right: 96, left: 96, zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: fB, fontSize: 16, color: c.muted, opacity: 0.75, whiteSpace: 'nowrap' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 700 }}>{deckTitle}</span>
          <span style={{ border: `1px solid ${c.border || c.muted}`, borderRadius: 6, padding: '2px 10px' }}>{pageNum}</span>
        </div>
      );
    }
    // 'minimal' (ברירת מחדל / לא-מוכר) — פלט זהה לקודם.
    return (
      <div style={{ position: 'absolute', bottom: 28, right: 96, left: 96, zIndex: 1, display: 'flex', justifyContent: 'space-between', fontFamily: fB, fontSize: 16, color: c.muted, opacity: 0.75, whiteSpace: 'nowrap' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 700 }}>{deckTitle}</span>
        <span>{pageNum}</span>
      </div>
    );
  };

  // סמן בולט לפי theme.bulletStyle (default 'check' = הצ'יפ העגול הקודם)
  const bulletStyle = theme.bulletStyle || 'check';

  const Bullets = ({ items, size = 30, gap = 22 }) => (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap }}>
      {(items || []).map((b, i) => (
        <li key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', fontSize: size, lineHeight: 1.42, color: c.text }}>
          {renderBulletMarker({ style: bulletStyle, accent, index: i, size, colors: c, displayFont: fD })}
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );

  // ── placeholder לתמונה שעדיין לא נוצרה ──────────────────────────
  // ⚠️ בעבר הוצג כאן `🖼 ${alt || query}` — אימוג'י + ה-query באנגלית. שקפי
  // cover/closing/image-full מיוצאים כרסטר, ולכן הטקסט הזה נצרב לתוך ה-PPTX.
  // עכשיו: רק alt עברי (בלי אימוג'י), ובצריבה (forExport) בלי שום טקסט.
  const placeholderLabel = (() => {
    if (forExport) return '';
    const alt = String(img?.alt || '').trim();
    return alt && RE_HAS_HEB.test(alt) ? alt : '';
  })();
  const placeholderBackground = `linear-gradient(135deg, ${accent}1F 0%, ${c.bgAlt} 70%)`;

  const ImagePlaceholder = ({ style }) => (
    <div style={{
      ...style,
      background: placeholderBackground,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: placeholderLabel ? '0 28px' : 0,
      textAlign: 'center',
      color: c.muted,
      fontFamily: fB,
      fontSize: 22,
    }}>
      {placeholderLabel}
    </div>
  );

  const ImageBox = ({ style, rounded = false }) => {
    const tr = getImageTreatment({ image: theme.image, accent, colors: c, radius });
    // plain → tr ריק, פלט זהה לקודם. treatments עוטפים (frame/polaroid/duotone) → wrapper.
    if (!tr.wrap) {
      return imgSrc
        ? <img src={imgSrc} alt={img?.alt || ''} style={{ objectFit: 'cover', ...(rounded ? { borderRadius: radius } : {}), ...tr.imgStyle, ...style }} />
        : <ImagePlaceholder style={{ ...style, ...(rounded ? { borderRadius: radius } : {}), ...tr.placeholderStyle }} />;
    }
    return (
      <div style={{ ...style, ...tr.wrapperStyle, position: (style && style.position) || 'relative', overflow: 'hidden' }}>
        {imgSrc
          ? <img src={imgSrc} alt={img?.alt || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', ...tr.imgStyle }} />
          : <ImagePlaceholder style={{ width: '100%', height: '100%' }} />}
        {tr.overlay}
      </div>
    );
  };

  // עוטף סטנדרטי: רקע + motif + תוכן בשכבה עליונה + פוטר (שקפי תוכן)
  const Shell = ({ children, padded = true, withBg = true, withMotif = true }) => (
    <div style={baseStage}>
      {withBg && <SlideBackground theme={theme} variant={bgVariant} accent={accent} />}

      <TextureLayer theme={theme} accent={accent} />
      {withMotif && <Motif theme={theme} index={index} />}
      <div style={{ position: 'relative', zIndex: 1, height: '100%', boxSizing: 'border-box', ...(padded ? { padding: '92px 96px' } : {}) }}>
        {children}
      </div>
      <Footer />
    </div>
  );

  // ══ עזרי-שער/מפריד משותפים (full render + bgOnly) ══════════════
  const svgFull = { position: 'absolute', inset: 0, width: '100%', height: '100%' };
  const tId = theme.id;
  const coverTitle = slide?.title || 'כותרת המצגת';
  const sectionTitle = slide?.title || 'מפריד נושא';
  const themePalette = (Array.isArray(theme.accents) && theme.accents.length)
    ? theme.accents
    : [accent, c.accent2 || accent, c.accent || accent].filter(Boolean);
  const palAt = (i) => themePalette[((i % themePalette.length) + themePalette.length) % themePalette.length];
  // גודל display לפי אורך הכותרת (במה קבועה, דטרמיניסטי)
  const fitDisplay = (t, big, mid, small) => {
    const n = (t || '').length;
    return n > 40 ? small : n > 24 ? mid : big;
  };

  // ── שכבת אמנות ל-poster: רקע luxe כהה + מסגרת שיער / זוהר ניאון ──
  const CoverArtPoster = () => (
    <>
      <SlideBackground theme={theme} variant="mesh" accent={accent} />
      <TextureLayer theme={theme} accent={accent} />
      <div style={{ position: 'absolute', inset: 0, background: theme.coverGradient, opacity: isLight ? 0.10 : 0.22 }} />
      {!isLight && <div style={{ position: 'absolute', inset: 28, border: `1px solid ${accent}55`, pointerEvents: 'none' }} />}
      {tId === 'neon' && (
        <>
          <div style={{ position: 'absolute', top: -120, right: 120, width: 440, height: 440, borderRadius: '50%', background: accent, opacity: 0.30, filter: 'blur(120px)' }} />
          <div style={{ position: 'absolute', bottom: -150, left: 60, width: 480, height: 480, borderRadius: '50%', background: c.accent2 || accent, opacity: 0.28, filter: 'blur(130px)' }} />
        </>
      )}
    </>
  );

  // ── שכבת אמנות ל-geo: memphis (צורות מפוזרות) / deco (מניפה סימטרית + מסגרת זהב) ──
  const CoverArtGeo = () => {
    if (tId === 'deco') {
      const rays = [];
      const n = 20;
      const cx = 640;
      const cy = 78;
      const R = 900;
      for (let i = 0; i <= n; i++) {
        const a = Math.PI * (i / n);
        rays.push(<line key={i} x1={cx} y1={cy} x2={cx + Math.cos(a) * R} y2={cy + Math.sin(a) * R} stroke={accent} strokeWidth={i % 2 ? 1 : 2.4} opacity={0.2} />);
      }
      return (
        <>
          <TextureLayer theme={theme} accent={accent} />
          <svg viewBox="0 0 1280 720" style={svgFull}>{rays}</svg>
          <div style={{ position: 'absolute', inset: 26, border: `2px solid ${accent}`, opacity: 0.65, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: 34, border: `1px solid ${accent}`, opacity: 0.4, pointerEvents: 'none' }} />
        </>
      );
    }
    return (
      <>
        <TextureLayer theme={theme} accent={accent} />
        <svg viewBox="0 0 1280 720" style={svgFull}>
          <circle cx="150" cy="140" r="66" fill="none" stroke={palAt(0)} strokeWidth="14" />
          <path d="M1074 66 L1146 200 L1002 200 Z" fill={palAt(1)} />
          <path d="M58 468 q40 -48 80 0 q40 48 80 0 q40 -48 80 0" fill="none" stroke={palAt(2)} strokeWidth="8" strokeLinecap="round" />
          <g fill={palAt(3)}>
            {[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((k) => <circle key={`${r}-${k}`} cx={1058 + k * 34} cy={512 + r * 34} r="7" />))}
          </g>
          <path d="M1214 296 A72 72 0 0 1 1214 440 Z" fill={palAt(4)} />
          <rect x="72" y="70" width="46" height="46" transform="rotate(18 95 93)" fill={palAt(5)} />
        </svg>
      </>
    );
  };

  // ── מצב bgOnly: רק שכבת הרקע/העיצוב, בלי טקסט/תוכן (לצריבת רקע native) ──
  if (bgOnly) {
    if (layout === 'cover') {
      const cs = theme.coverStyle;
      if (cs === 'poster') return <div style={baseStage}><CoverArtPoster /></div>;
      if (cs === 'geo') return <div style={baseStage}><CoverArtGeo /></div>;
      if (cs === 'typographic') {
        return (
          <div style={baseStage}>
            <TextureLayer theme={theme} accent={accent} />
            {tId === 'brutal' && <div style={{ position: 'absolute', top: 0, left: 0, width: 120, height: 40, background: c.accent2 || accent }} />}
          </div>
        );
      }
      if (cs === 'split') {
        return (
          <div style={{ ...baseStage, display: 'flex', flexDirection: 'row-reverse' }}>
            <div style={{ flex: '0 0 45%', background: accent }} />
            <div style={{ flex: '0 0 55%', position: 'relative' }}>
              <SlideBackground theme={theme} variant="mesh" accent={accent} />
              <TextureLayer theme={theme} accent={accent} />
            </div>
          </div>
        );
      }
      if (cs === 'terminal') {
        return (
          <div style={baseStage}>
            <SlideBackground theme={theme} variant="scanlines" accent={accent} />
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 52, background: c.surface, borderBottom: `1px solid ${c.border || accent}` }} />
          </div>
        );
      }
      // gradient (ברירת מחדל): mesh + overlay של ה-coverGradient
      return (
        <div style={baseStage}>
          <SlideBackground theme={theme} variant="mesh" accent={accent} />
          <TextureLayer theme={theme} accent={accent} />
          <div style={{ position: 'absolute', inset: 0, background: theme.coverGradient, opacity: 0.16 }} />
        </div>
      );
    }
    if (layout === 'section') {
      const ss = theme.sectionStyle;
      if (ss === 'numbered') {
        return (
          <div style={baseStage}>
            <SlideBackground theme={theme} variant={bgVariant} accent={accent} />
            <TextureLayer theme={theme} accent={accent} />
            {index != null && <div style={{ position: 'absolute', top: '50%', right: 96, transform: 'translateY(-50%)', fontFamily: fD, fontSize: 300, fontWeight: 900, lineHeight: 0.8, color: 'transparent', WebkitTextStroke: `3px ${accent}`, opacity: 0.5, userSelect: 'none' }}>{String(index + 1).padStart(2, '0')}</div>}
          </div>
        );
      }
      if (ss === 'sidebar') {
        return (
          <div style={{ ...baseStage, display: 'flex', flexDirection: 'row' }}>
            <div style={{ flex: '0 0 200px', background: accent }} />
            <div style={{ flex: 1, position: 'relative' }}>
              <SlideBackground theme={theme} variant={bgVariant} accent={accent} />
              <TextureLayer theme={theme} accent={accent} />
            </div>
          </div>
        );
      }
      if (ss === 'poster') {
        return (
          <div style={baseStage}>
            <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${accent} 0%, ${c.accent2 || accent} 100%)` }} />
          </div>
        );
      }
      // gradient (ברירת מחדל): גרדיאנט אטום מלא + מספר-פרק ענק, בלי טקסט
      return (
        <div style={baseStage}>
          <div style={{ position: 'absolute', inset: 0, background: theme.coverGradient, opacity: 1 }} />
          <TextureLayer theme={theme} accent={accent} />
          {index != null && (
            <div style={{ position: 'absolute', top: '6%', left: '6%', zIndex: 1, fontFamily: fD, fontSize: 150, fontWeight: 900, lineHeight: 1, color: '#ffffff', opacity: 0.25, userSelect: 'none' }}>
              {String(index + 1).padStart(2, '0')}
            </div>
          )}
        </div>
      );
    }
    if (layout === 'image-full') {
      // תמונה מלאה: רק הבסיס (התמונה היא התוכן, מוזרקת ב-native)
      return <div style={baseStage} />;
    }
    // ברירת מחדל: בסיס + variant + רקע מחולל + motif
    return (
      <div style={baseStage}>
        <SlideBackground theme={theme} variant={bgVariant} accent={accent} />

        <TextureLayer theme={theme} accent={accent} />
        <Motif theme={theme} index={index} />
      </div>
    );
  }

  // ── פריסות ──────────────────────────────────────────────────
  if (layout === 'cover') {
    // קומפוזיצית שער — ברירת מחדל 'gradient' (הפלט הקיים). Phase 2 יוסיף
    // ענפים ל-solid/image/split/minimal; כרגע כולם נופלים ל-gradient.
    const renderCoverGradient = () => {
      if (imgSrc) {
        // קומפוזיציה מפוצלת: ימין (55%, RTL) = פאנל טקסט על bg+mesh; שמאל (45%) = תמונה מלאה.
        // הערה: תחת direction:rtl, row-reverse+ילד-ראשון-ב-DOM נוחת ויזואלית משמאל (כמו image-right/image-left).
        return (
          <div style={{ ...baseStage, display: 'flex', flexDirection: 'row-reverse' }}>
            <div style={{ flex: '0 0 45%', position: 'relative' }}>
              <img src={imgSrc} alt={img?.alt || ''} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ flex: '0 0 55%', boxSizing: 'border-box', position: 'relative', background: c.bg, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 90px', overflow: 'hidden' }}>
              <SlideBackground theme={theme} variant="mesh" accent={accent} />
              <TextureLayer theme={theme} accent={accent} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                {slide.kicker && <div style={{ fontFamily: fB, fontSize: 20, fontWeight: 700, letterSpacing: '2px', color: accent, marginBottom: 18 }}>{slide.kicker}</div>}
                <h1 style={{ margin: 0, fontFamily: fD, fontSize: 64, fontWeight: 900, lineHeight: 1.08, letterSpacing: '-1px' }}>{slide.title || 'כותרת המצגת'}</h1>
                {slide.subtitle && <p style={{ marginTop: 24, fontFamily: fB, fontSize: 26, color: c.muted }}>{slide.subtitle}</p>}
                <div style={{ width: 90, height: 9, borderRadius: 8, background: accent, marginTop: 32 }} />
              </div>
            </div>
          </div>
        );
      }
      return (
        <div style={baseStage}>
          <SlideBackground theme={theme} variant="mesh" accent={accent} />
          <TextureLayer theme={theme} accent={accent} />
          <div style={{ position: 'absolute', inset: 0, background: theme.coverGradient, opacity: 0.16 }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 110px', zIndex: 1 }}>
            {slide.kicker && <div style={{ fontFamily: fB, fontSize: 20, fontWeight: 700, letterSpacing: '2px', color: accent, marginBottom: 18 }}>{slide.kicker}</div>}
            <div style={{ width: 96, height: 10, borderRadius: 8, background: accent, marginBottom: 36 }} />
            <h1 style={{ margin: 0, fontFamily: fD, fontSize: 80, fontWeight: 900, lineHeight: 1.06, letterSpacing: '-1px', maxWidth: 940 }}>{slide.title || 'כותרת המצגת'}</h1>
            {slide.subtitle && <p style={{ marginTop: 28, fontFamily: fB, fontSize: 32, color: c.muted, maxWidth: 820 }}>{slide.subtitle}</p>}
          </div>
        </div>
      );
    };
    // ── 'poster': רקע luxe (CoverArtPoster) + כותרת ענקית עוגן תחתון-ימני ──
    const renderCoverPoster = () => {
      const title = coverTitle;
      const size = fitDisplay(title, 150, 110, 84);
      const glow = tId === 'neon'
        ? { textShadow: `0 0 18px ${accent}aa, 0 0 42px ${accent}66, 0 0 90px ${c.accent2 || accent}44` }
        : {};
      return (
        <div style={baseStage}>
          <CoverArtPoster />
          <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'flex-start', padding: '0 110px 100px' }}>
            {slide.kicker && <div style={{ fontFamily: fB, fontSize: 20, fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', color: accent, marginBottom: 20 }}>{slide.kicker}</div>}
            <h1 style={{ margin: 0, fontFamily: fD, fontSize: size, fontWeight: 900, lineHeight: 1.02, letterSpacing: '-1px', maxWidth: 1000, ...glow }}>{title}</h1>
            {slide.subtitle && <p style={{ marginTop: 26, fontFamily: fB, fontSize: 26, color: c.muted, maxWidth: 760 }}>{slide.subtitle}</p>}
            <div style={{ marginTop: 34, display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ width: 70, height: 3, background: accent }} />
              {deckTitle && <span style={{ fontFamily: fB, fontSize: 15, letterSpacing: '1px', color: c.muted, opacity: 0.75 }}>{deckTitle}</span>}
            </div>
          </div>
        </div>
      );
    };

    // ── 'typographic': שטח לבן, כותרת ענקית flush-right, קו מלא-רוחב, index ──
    const renderCoverTypographic = () => {
      const title = coverTitle;
      const size = fitDisplay(title, 140, 104, 80);
      const idx = index != null ? String(index + 1).padStart(2, '0') : '01';
      const titleBlock = (
        <h1 style={{ margin: 0, fontFamily: fD, fontSize: size, fontWeight: 900, lineHeight: 1.02, letterSpacing: '-1.5px', textAlign: 'right', maxWidth: 1080 }}>{title}</h1>
      );
      return (
        <div style={baseStage}>
          <TextureLayer theme={theme} accent={accent} />
          {tId === 'brutal' && <div style={{ position: 'absolute', top: 0, left: 0, width: 120, height: 40, background: c.accent2 || accent, zIndex: 1 }} />}
          <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 100px' }}>
            {tId === 'brutal' ? (
              <div style={{ border: `6px solid ${c.text}`, boxShadow: `10px 10px 0 ${accent}`, background: c.bg, padding: '40px 46px', alignSelf: 'flex-end', maxWidth: 1080, boxSizing: 'border-box' }}>
                {titleBlock}
              </div>
            ) : titleBlock}
            <div style={{ width: '100%', height: 2, background: c.text, marginTop: 46 }} />
            <div style={{ marginTop: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {slide.kicker
                ? <div style={{ fontFamily: fB, fontSize: 20, fontWeight: 700, letterSpacing: '2px', color: accent }}>{slide.kicker}</div>
                : <div />}
              <div style={{ fontFamily: fD, fontSize: 46, fontWeight: 900, color: c.muted, opacity: 0.55 }}>{idx}</div>
            </div>
            {slide.subtitle && <p style={{ marginTop: 18, fontFamily: fB, fontSize: 24, color: c.muted, maxWidth: 760, textAlign: 'right', alignSelf: 'flex-end' }}>{slide.subtitle}</p>}
          </div>
        </div>
      );
    };

    // ── 'geo': memphis (מרכזי, שובבני) / deco (סימטרי, קווי זהב + kicker letterspaced) ──
    const renderCoverGeo = () => {
      const title = coverTitle;
      if (tId === 'deco') {
        const size = fitDisplay(title, 100, 80, 64);
        return (
          <div style={baseStage}>
            <CoverArtGeo />
            <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 140px' }}>
              {slide.kicker && <div style={{ fontFamily: fB, fontSize: 18, fontWeight: 700, letterSpacing: '4px', textTransform: 'uppercase', color: accent, marginBottom: 22 }}>{slide.kicker}</div>}
              <div style={{ width: 130, height: 2, background: accent, opacity: 0.8, marginBottom: 26 }} />
              <h1 style={{ margin: 0, fontFamily: fD, fontSize: size, fontWeight: 800, lineHeight: 1.14, letterSpacing: '0.5px', maxWidth: 900 }}>{title}</h1>
              <div style={{ width: 130, height: 2, background: accent, opacity: 0.8, marginTop: 26 }} />
              {slide.subtitle && <p style={{ marginTop: 26, fontFamily: fB, fontSize: 24, color: c.muted, maxWidth: 720 }}>{slide.subtitle}</p>}
            </div>
          </div>
        );
      }
      const size = fitDisplay(title, 110, 88, 68);
      return (
        <div style={baseStage}>
          <CoverArtGeo />
          <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 130px' }}>
            {slide.kicker && <div style={{ display: 'inline-block', fontFamily: fB, fontSize: 18, fontWeight: 800, letterSpacing: '2px', color: c.onAccent || '#fff', background: accent, borderRadius: 30, padding: '8px 24px', marginBottom: 24 }}>{slide.kicker}</div>}
            <h1 style={{ margin: 0, fontFamily: fD, fontSize: size, fontWeight: 900, lineHeight: 1.1, maxWidth: 920 }}>{title}</h1>
            {slide.subtitle && <p style={{ marginTop: 24, fontFamily: fB, fontSize: 26, color: c.muted, maxWidth: 740 }}>{slide.subtitle}</p>}
          </div>
        </div>
      );
    };

    // ── 'editorial' (mono): masthead מגזין — קווי-שיער, kicker small-caps, סריף ענק ──
    const renderCoverEditorial = () => {
      const title = coverTitle;
      const size = fitDisplay(title, 120, 92, 72);
      return (
        <div style={baseStage}>
          <TextureLayer theme={theme} accent={accent} />
          <div style={{ position: 'absolute', top: 60, left: 100, right: 100, height: 2, background: c.text, zIndex: 1 }} />
          <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 140px' }}>
            {slide.kicker && <div style={{ fontFamily: fB, fontSize: 16, fontWeight: 700, letterSpacing: '5px', textTransform: 'uppercase', color: c.muted, marginBottom: 30 }}>{slide.kicker}</div>}
            <h1 style={{ margin: 0, fontFamily: fD, fontSize: size, fontWeight: 800, lineHeight: 1.1, maxWidth: 940 }}>{title}</h1>
            <div style={{ marginTop: 34, display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ width: 60, height: 1, background: c.muted }} />
              {deckTitle && <span style={{ fontFamily: fB, fontSize: 16, color: c.muted }}>{deckTitle}</span>}
              <div style={{ width: 60, height: 1, background: c.muted }} />
            </div>
            {slide.subtitle && <p style={{ marginTop: 20, fontFamily: fB, fontSize: 22, color: c.muted, maxWidth: 720 }}>{slide.subtitle}</p>}
          </div>
          <div style={{ position: 'absolute', bottom: 60, left: 100, right: 100, height: 2, background: c.text, zIndex: 1 }} />
        </div>
      );
    };

    // ── 'split': 55/45 (טקסט על mesh) / (תמונה או accent מלא) — תואם ל-bgOnly ──
    const renderCoverSplit = () => {
      const title = coverTitle;
      const size = fitDisplay(title, 96, 76, 60);
      const accentSide = imgSrc ? (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <img src={imgSrc} alt={img?.alt || ''} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: accent, opacity: 0.25 }} />
        </div>
      ) : (
        <div style={{ position: 'relative', width: '100%', height: '100%', background: accent, overflow: 'hidden' }}>
          {tId === 'sandstone' && (
            <svg viewBox="0 0 600 720" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.15 }}>
              <g fill="none" stroke={c.onAccent || '#fff'} strokeWidth="2">
                <circle cx="300" cy="360" r="70" /><circle cx="300" cy="360" r="150" /><circle cx="300" cy="360" r="230" /><circle cx="300" cy="360" r="310" />
              </g>
            </svg>
          )}
          {tId !== 'midnight' && tId !== 'sandstone' && deckTitle && (
            <div style={{ position: 'absolute', bottom: 50, left: 40, right: 40, fontFamily: fD, fontSize: 130, fontWeight: 900, color: c.onAccent || '#fff', opacity: 0.18, lineHeight: 1 }}>
              {deckTitle.slice(0, 1)}
            </div>
          )}
        </div>
      );
      return (
        <div style={{ ...baseStage, display: 'flex', flexDirection: 'row-reverse' }}>
          <div style={{ flex: '0 0 45%' }}>{accentSide}</div>
          <div style={{ flex: '0 0 55%', boxSizing: 'border-box', position: 'relative', background: c.bg, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 90px', overflow: 'hidden' }}>
            <SlideBackground theme={theme} variant="mesh" accent={accent} />
            <TextureLayer theme={theme} accent={accent} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              {slide.kicker && <div style={{ fontFamily: fB, fontSize: 20, fontWeight: 700, letterSpacing: '2px', color: accent, marginBottom: 18 }}>{slide.kicker}</div>}
              <h1 style={{ margin: 0, fontFamily: fD, fontSize: size, fontWeight: 900, lineHeight: 1.08, letterSpacing: '-1px', maxWidth: 620 }}>{title}</h1>
              {slide.subtitle && <p style={{ marginTop: 24, fontFamily: fB, fontSize: 24, color: c.muted, maxWidth: 560 }}>{slide.subtitle}</p>}
              <div style={{ width: 80, height: 3, background: accent, marginTop: 30 }} />
            </div>
          </div>
        </div>
      );
    };

    // ── 'terminal': חלון קוד — bar עם 3 נקודות, prompt block ('>' / '//' / '[ ]') ──
    const renderCoverTerminal = () => {
      const title = coverTitle;
      const size = fitDisplay(title, 72, 56, 46);
      const mono = "'Fira Code','Consolas',monospace";
      return (
        <div style={baseStage}>
          <SlideBackground theme={theme} variant="scanlines" accent={accent} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 52, background: c.surface, borderBottom: `1px solid ${c.border || accent}`, zIndex: 1, display: 'flex', alignItems: 'center', padding: '0 22px', gap: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f56', display: 'inline-block' }} />
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e', display: 'inline-block' }} />
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#27c93f', display: 'inline-block' }} />
            {deckTitle && <span style={{ marginInlineStart: 16, fontFamily: mono, fontSize: 15, color: c.muted, direction: 'ltr', unicodeBidi: 'isolate' }}>{deckTitle}</span>}
          </div>
          <div style={{ position: 'absolute', top: 52, left: 0, right: 0, bottom: 0, zIndex: 1, padding: '70px 100px', fontFamily: mono }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <span style={{ direction: 'ltr', unicodeBidi: 'isolate', color: accent, fontSize: size, fontWeight: 700 }}>{'>'}</span>
              <span style={{ fontSize: size, fontWeight: 700, color: accent, lineHeight: 1.2, maxWidth: 900 }}>{title}<span style={{ color: accent }}>▊</span></span>
            </div>
            {slide.subtitle && (
              <div style={{ marginTop: 26, display: 'flex', gap: 14 }}>
                <span style={{ direction: 'ltr', unicodeBidi: 'isolate', color: c.muted, fontSize: 22 }}>{'//'}</span>
                <span style={{ fontSize: 22, color: c.muted }}>{slide.subtitle}</span>
              </div>
            )}
            {slide.kicker && (
              <div style={{ marginTop: 22, fontSize: 18, color: accent, opacity: 0.85 }}>
                <span style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{'[ '}</span>{slide.kicker}<span style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{' ]'}</span>
              </div>
            )}
          </div>
        </div>
      );
    };

    switch (theme.coverStyle) {
      case 'poster':
        return renderCoverPoster();
      case 'typographic':
        return renderCoverTypographic();
      case 'geo':
        return renderCoverGeo();
      case 'editorial':
        return renderCoverEditorial();
      case 'split':
        return renderCoverSplit();
      case 'terminal':
        return renderCoverTerminal();
      case 'gradient':
      default:
        return renderCoverGradient();
    }
  }

  if (layout === 'section') {
    // מפריד נושא — ברירת מחדל 'gradient' (הפלט הקיים). Phase 2 יוסיף
    // ענפים ל-solid/bar/minimal; כרגע כולם נופלים ל-gradient.
    const renderSectionGradient = () => (
      // מפריד נושא: גרדיאנט אטום מלא-שקוף, מספר-פרק ענק בפינה, כותרת גדולה במרכז — טקסט לבן.
      <div style={{ ...baseStage }}>
        <div style={{ position: 'absolute', inset: 0, background: theme.coverGradient, opacity: 1 }} />
        <TextureLayer theme={theme} accent={accent} />
        {index != null && (
          <div style={{ position: 'absolute', top: '6%', left: '6%', zIndex: 1, fontFamily: fD, fontSize: 150, fontWeight: 900, lineHeight: 1, color: '#ffffff', opacity: 0.25, userSelect: 'none' }}>
            {String(index + 1).padStart(2, '0')}
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '0 120px', textAlign: 'center', zIndex: 1 }}>
          <div style={{ width: 70, height: 8, borderRadius: 8, background: '#ffffff', marginBottom: 30, opacity: 0.85 }} />
          <h1 style={{ margin: 0, fontFamily: fD, fontSize: 76, fontWeight: 900, lineHeight: 1.12, letterSpacing: '-0.5px', color: '#ffffff', textShadow: '0 2px 18px rgba(0,0,0,0.18)' }}>{slide.title || 'מפריד נושא'}</h1>
          {slide.subtitle && <p style={{ marginTop: 24, fontFamily: fB, fontSize: 30, color: '#ffffff', opacity: 0.88 }}>{slide.subtitle}</p>}
        </div>
      </div>
    );
    // ── 'numbered': מספר-פרק ענק outline/דהוי + כותרת לצידו ──
    const renderSectionNumbered = () => {
      const title = sectionTitle;
      const size = fitDisplay(title, 60, 48, 40);
      const numColor = isLight
        ? { color: accent, opacity: 0.14 }
        : { color: 'transparent', WebkitTextStroke: `3px ${accent}`, opacity: 0.5 };
      return (
        <div style={baseStage}>
          <SlideBackground theme={theme} variant={bgVariant} accent={accent} />
          <TextureLayer theme={theme} accent={accent} />
          {index != null && (
            <div style={{ position: 'absolute', top: '50%', right: 96, transform: 'translateY(-50%)', zIndex: 0, fontFamily: fD, fontSize: 300, fontWeight: 900, lineHeight: 0.8, userSelect: 'none', ...numColor }}>
              {String(index + 1).padStart(2, '0')}
            </div>
          )}
          <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: index != null ? '0 340px 0 100px' : '0 110px' }}>
            {slide.kicker && <div style={{ fontFamily: fB, fontSize: 18, fontWeight: 700, letterSpacing: '2px', color: accent, marginBottom: 16 }}>{slide.kicker}</div>}
            <h1 style={{ margin: 0, fontFamily: fD, fontSize: size, fontWeight: 900, lineHeight: 1.12, maxWidth: 780 }}>{title}</h1>
            {slide.subtitle && <p style={{ marginTop: 22, fontFamily: fB, fontSize: 24, color: c.muted, maxWidth: 700 }}>{slide.subtitle}</p>}
            <div style={{ width: 90, height: 4, background: accent, marginTop: 30 }} />
          </div>
        </div>
      );
    };

    // ── 'sidebar': פס accent אנכי (ימין ב-RTL) עם kicker אנכי + מספר, כותרת בשטח הראשי ──
    const renderSectionSidebar = () => {
      const title = sectionTitle;
      const size = fitDisplay(title, 58, 46, 38);
      const pageNum = index != null ? String(index + 1).padStart(2, '0') : '';
      return (
        <div style={{ ...baseStage, display: 'flex', flexDirection: 'row' }}>
          <div style={{ flex: '0 0 200px', position: 'relative', background: accent, color: c.onAccent || '#fff', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '50px 0', boxSizing: 'border-box' }}>
            {tId === 'sandstone' && (
              <svg viewBox="0 0 200 720" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.15 }}>
                <g fill="none" stroke={c.onAccent || '#fff'} strokeWidth="2">
                  <circle cx="100" cy="360" r="60" /><circle cx="100" cy="360" r="130" /><circle cx="100" cy="360" r="200" />
                </g>
              </svg>
            )}
            {slide.kicker && (
              <div style={{ position: 'relative', zIndex: 1, writingMode: 'vertical-rl', fontFamily: fB, fontSize: 20, fontWeight: 700, letterSpacing: '3px' }}>{slide.kicker}</div>
            )}
            {pageNum && <div style={{ position: 'relative', zIndex: 1, fontFamily: fD, fontSize: 30, fontWeight: 900 }}>{pageNum}</div>}
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <SlideBackground theme={theme} variant={bgVariant} accent={accent} />
            <TextureLayer theme={theme} accent={accent} />
            <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 100px' }}>
              <h1 style={{ margin: 0, fontFamily: fD, fontSize: size, fontWeight: 900, lineHeight: 1.12, maxWidth: 820 }}>{title}</h1>
              {slide.subtitle && <p style={{ marginTop: 24, fontFamily: fB, fontSize: 26, color: c.muted, maxWidth: 700 }}>{slide.subtitle}</p>}
            </div>
          </div>
        </div>
      );
    };

    // ── 'poster': גרדיאנט אלכסוני מלא + כותרת ענקית ממורכזת; deco: קווי-זהב+יהלומים, memphis: קונפטי ──
    const renderSectionPoster = () => {
      const title = sectionTitle;
      const size = fitDisplay(title, 78, 60, 48);
      return (
        <div style={baseStage}>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${accent} 0%, ${c.accent2 || accent} 100%)` }} />
          <TextureLayer theme={theme} accent={accent} />
          {tId === 'memphis' && (
            <svg viewBox="0 0 1280 720" style={svgFull}>
              <circle cx="180" cy="120" r="40" fill="none" stroke="#fff" strokeWidth="8" opacity="0.35" />
              <rect x="1080" y="540" width="60" height="60" transform="rotate(20 1110 570)" fill="#fff" opacity="0.25" />
              <path d="M1120 90 L1180 200 L1060 200 Z" fill="#fff" opacity="0.3" />
            </svg>
          )}
          <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 130px' }}>
            {tId === 'deco' && <div style={{ width: 130, height: 2, background: '#fff', opacity: 0.85, marginBottom: 26 }} />}
            <h1 style={{ margin: 0, fontFamily: fD, fontSize: size, fontWeight: 900, lineHeight: 1.1, color: '#fff', maxWidth: 940, textShadow: '0 2px 18px rgba(0,0,0,0.18)' }}>
              {tId === 'deco' && <span style={{ opacity: 0.85, marginInlineEnd: 14 }}>◆</span>}
              {title}
              {tId === 'deco' && <span style={{ opacity: 0.85, marginInlineStart: 14 }}>◆</span>}
            </h1>
            {tId === 'deco' && <div style={{ width: 130, height: 2, background: '#fff', opacity: 0.85, marginTop: 26 }} />}
            {slide.subtitle && <p style={{ marginTop: 24, fontFamily: fB, fontSize: 28, color: '#fff', opacity: 0.88 }}>{slide.subtitle}</p>}
          </div>
        </div>
      );
    };

    switch (theme.sectionStyle) {
      case 'numbered':
        return renderSectionNumbered();
      case 'sidebar':
        return renderSectionSidebar();
      case 'poster':
        return renderSectionPoster();
      case 'gradient':
      default:
        return renderSectionGradient();
    }
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
        <TextureLayer theme={theme} accent={accent} />
        {imgCol}{textCol}
        <Footer />
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
            <div key={i} style={{ flex: 1, ...cardSurfaceStyle({ cardStyle: theme.cardStyle, colors: c, isLight, accent }), borderRadius: radius, padding: '34px 30px' }}>
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

  if (layout === 'agenda') {
    // סדר יום: רשימת נקודות ממוספרת גדולה, מפוצלת לשתי עמודות מאוזנות (עמודה ימנית ראשונה — RTL)
    const items = (slide.bullets || []).slice(0, 8);
    const half = Math.ceil(items.length / 2);
    const rightCol = items.slice(0, half);
    const leftCol = items.slice(half);
    const AgendaCol = ({ list, offset }) => (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 26 }}>
        {list.map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <span style={{ flex: '0 0 auto', fontFamily: fD, fontSize: 34, fontWeight: 900, color: accent, lineHeight: 1.2 }}>
              {String(offset + i + 1).padStart(2, '0')}
            </span>
            <span style={{ fontSize: 28, lineHeight: 1.4, color: c.text, marginTop: 4 }}>{b}</span>
          </div>
        ))}
      </div>
    );
    return (
      <Shell>
        <Heading size={50}>{slide.title || 'סדר יום'}</Heading>
        <div style={{ marginTop: 46, display: 'flex', gap: 60 }}>
          <AgendaCol list={rightCol} offset={0} />
          {leftCol.length > 0 && <AgendaCol list={leftCol} offset={half} />}
        </div>
      </Shell>
    );
  }

  if (layout === 'timeline') {
    // ציר זמן: קו אופקי עם צמתים לכל שלב; כותרת מעל, גוף מתחת (עקבי, בלי זיגזג)
    const steps = (slide.steps || []).slice(0, 6);
    return (
      <Shell>
        <Heading size={50}>{slide.title || 'ציר זמן'}</Heading>
        <div style={{ marginTop: 90, position: 'relative' }}>
          <div style={{ position: 'absolute', right: 0, left: 0, top: '50%', height: 3, background: dividerBackground(theme.dividerStyle, accent, c), transform: 'translateY(-50%)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-around' }}>
            {steps.map((st, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, padding: '0 10px' }}>
                <div style={{ fontFamily: fD, fontSize: 24, fontWeight: 800, color: accent, textAlign: 'center', marginBottom: 22 }}>{st.title}</div>
                <div style={{ flex: '0 0 auto', width: 18, height: 18, borderRadius: '50%', background: accent, border: `3px solid ${c.bg}`, boxShadow: `0 0 0 3px ${accent}` }} />
                {st.body && (
                  <div style={{ marginTop: 22, fontFamily: fB, fontSize: 17, color: c.muted, textAlign: 'center', lineHeight: 1.45, maxWidth: 180 }}>{st.body}</div>
                )}
              </div>
            ))}
          </div>
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
            <div key={i} style={{ flex: 1, ...cardSurfaceStyle({ cardStyle: theme.cardStyle, colors: c, isLight, accent }), borderRadius: radius, padding: '30px 28px', margin: i === 0 ? '0 14px 0 0' : '0 0 0 14px' }}>
              <div style={{ display: 'inline-block', fontFamily: fD, fontSize: 28, fontWeight: 800, color: sideAccent[i % 2], borderBottom: `4px solid ${sideAccent[i % 2]}`, paddingBottom: 8, marginBottom: 22 }}>{col.heading || (i === 0 ? 'אפשרות א' : 'אפשרות ב')}</div>
              <Bullets items={col.bullets} size={24} gap={16} />
            </div>
          ))}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 64, height: 64, borderRadius: '50%', background: c.bg, border: `3px solid ${accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fD, fontSize: 24, fontWeight: 900, color: accent, zIndex: 2 }}>VS</div>
        </div>
      </Shell>
    );
  }

  if (layout === 'closing') {
    // סיום כ-CTA: משפט גדול במרכז, בולטים קצרים מתחת, פס accent מלא-רוחב בתחתית.
    const bullets = (slide.bullets || []).slice(0, 4);
    return (
      <Shell padded={false}>
        <div style={{ height: '100%', padding: '0 130px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <Kicker />
          <h2 style={{ margin: 0, fontFamily: fD, fontSize: 60, fontWeight: 900, lineHeight: 1.14, letterSpacing: '-0.5px', maxWidth: 980 }}>{slide.title || 'תודה!'}</h2>
          {bullets.length > 0 && (
            <ul style={{ listStyle: 'none', margin: '36px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
              {bullets.map((b, i) => (
                <li key={i} style={{ fontFamily: fB, fontSize: 26, lineHeight: 1.4, color: c.muted }}>{b}</li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 14, background: accent, zIndex: 1 }} />
      </Shell>
    );
  }

  // title-bullets: כותרת + נקודות. זוגי = top-heading (ברירת מחדל); אי-זוגי = side-rail.
  // תמונה בשקף → תמיד top-heading (בלי רוטציה) כדי לשמר את מקום התמונה.
  const rotateSideRail = layout === 'title-bullets' && index != null && index % 2 === 1 && !imgSrc;

  if (rotateSideRail) {
    return (
      <Shell padded={false}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'row-reverse' }}>
          <div style={{ flex: '0 0 34%', display: 'flex', alignItems: 'center', padding: '92px 72px 92px 40px' }}>
            <div style={{ display: 'flex', gap: 22, alignItems: 'stretch' }}>
              <div style={{ flex: '0 0 auto', width: 9, borderRadius: 9, background: accent }} />
              <div>
                <Kicker />
                <h2 style={{ margin: 0, fontFamily: fD, fontSize: 48, fontWeight: 800, lineHeight: 1.16, letterSpacing: '-0.5px' }}>{slide.title || 'כותרת השקופית'}</h2>
                {slide.subtitle && <p style={{ margin: '18px 0 0', fontFamily: fB, fontSize: 24, color: c.muted }}>{slide.subtitle}</p>}
              </div>
            </div>
          </div>
          <div style={{ flex: '0 0 66%', display: 'flex', alignItems: 'center', padding: '92px 40px 92px 96px' }}>
            <Bullets items={slide.bullets} size={30} />
          </div>
        </div>
      </Shell>
    );
  }

  // ברירת מחדל: title-bullets (זוגי / עם תמונה)
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
export function SlideFrame({ slide, themeId, index = null, rounded = true, shadow = true, className = '', style = {}, deckTitle = '', customTheme = null }) {
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
        <SlideStage slide={slide} themeId={themeId} index={index} deckTitle={deckTitle} customTheme={customTheme} />
      </div>
    </div>
  );
}
