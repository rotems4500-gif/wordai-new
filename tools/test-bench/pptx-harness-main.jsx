// ═══════════════════════════════════════════════════════════════
// pptx-harness-main.jsx — harness אימות לייצוא מצגות.
// רץ בתוך vite dev (VITE_NO_HTTPS=1): מרכיב deck fixture עם כל
// הפריסות, מרנדר SlideFrame לכל שקף, וחושף window.__runExport
// להרצת buildPptxBase64 בכל פרופיל. התוצאה נשמרת ב-window.__pptxResults
// ונמשכת ע"י ה-driver בפרוסות (preview_eval).
// ═══════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SlideFrame } from '../../src/presentation/SlideRenderer';
import { normalizeDeck } from '../../src/presentation/deckModel';
import { DECK_THEMES } from '../../src/presentation/deckThemes';
import { buildPptxBase64 } from '../../src/services/pptxExport';

// תמונת בדיקה זעירה (PNG 1×1) — מפעילה את מסלולי התמונה בלי רשת/CORS
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// fixture: כל הפריסות, עברית + לטינית (bidi), stats/steps/columns
const FIXTURE = {
  title: 'מצגת בדיקה — עיצוב וייצוא',
  themeId: 'premium',
  slides: [
    { layout: 'cover', title: 'המהפכה הדיגיטלית בישראל', subtitle: 'מחקר של Wolfsfeld (2011) ואחרים', image: { source: 'upload', dataUrl: TINY_PNG, alt: 'רקע' } },
    { layout: 'agenda', title: 'על מה נדבר', kicker: 'סדר יום', bullets: ['רקע היסטורי', 'המצב כיום', 'נתונים מרכזיים', 'תהליך היישום', 'השוואת גישות', 'סיכום והמלצות'] },
    { layout: 'title-bullets', title: 'רקע היסטורי', kicker: 'פרק ראשון', bullets: ['האינטרנט הגיע לישראל ב-1991', 'חברת Bezeq International הובילה', 'עד 2000 — פחות מ-20% חיבור', 'המהפך: broadband ב-2004'] },
    { layout: 'section', title: 'המצב כיום', subtitle: 'תמונת מצב 2026' },
    { layout: 'title-bullets', title: 'שוק התקשורת', bullets: ['תחרות בין Partner, Cellcom ו-HOT', 'סיבים אופטיים ב-85% מהבתים', 'מחירים ירדו ב-40%'] },
    { layout: 'stat', title: 'המספרים מדברים', kicker: 'נתונים', stats: [ { value: '92%', label: 'חדירת אינטרנט', caption: 'מהגבוהות בעולם' }, { value: '4.2M', label: 'משקי בית מחוברים' }, { value: '₪89', label: 'עלות חודשית ממוצעת', caption: 'ירידה של 40% מ-2015' } ] },
    { layout: 'steps', title: 'תהליך היישום', steps: [ { title: 'תשתית', body: 'פריסת סיבים ארצית' }, { title: 'רגולציה', body: 'רפורמת השוק הסיטונאי' }, { title: 'תחרות', body: 'כניסת שחקנים חדשים' }, { title: 'אימוץ', body: 'מעבר צרכנים המוני' } ] },
    { layout: 'comparison', title: 'שתי גישות רגולטוריות', columns: [ { heading: 'השוק החופשי', bullets: ['מחירים תחרותיים', 'חדשנות מהירה', 'סיכון לריכוזיות'] }, { heading: 'פיקוח ממשלתי', bullets: ['הגנת צרכן', 'יציבות', 'איטיות בחדשנות'] } ] },
    { layout: 'two-column', title: 'השפעות חברתיות', columns: [ { heading: 'חיוביות', bullets: ['נגישות למידע', 'עבודה מרחוק', 'חינוך דיגיטלי'] }, { heading: 'אתגרים', bullets: ['פער דיגיטלי', 'פרטיות', 'התמכרות'] } ] },
    { layout: 'image-right', title: 'תשתית הסיבים', bullets: ['פריסה ב-85% מהיישובים', 'מהירות עד 2.5Gbps', 'השקעה של ₪4 מיליארד'], image: { source: 'upload', dataUrl: TINY_PNG, alt: 'סיבים' } },
    { layout: 'quote', body: 'האינטרנט הוא לא טכנולוגיה — הוא סביבת החיים החדשה של האנושות', subtitle: 'פרופ׳ שיזף רפאלי' },
    { layout: 'big-statement', body: 'ישראל עברה מ-20% חדירה ל-92% בעשרים שנה', subtitle: 'הקצב המהיר ב-OECD' },
    { layout: 'timeline', title: 'ציר הזמן', steps: [ { title: '1991', body: 'האינטרנט מגיע' }, { title: '2004', body: 'מהפכת הפס הרחב' }, { title: '2015', body: 'השוק הסיטונאי' }, { title: '2021', body: 'עידן הסיבים' }, { title: '2026', body: 'היום' } ] },
    { layout: 'image-full', title: 'העתיד כבר כאן', subtitle: 'דור חדש של תשתיות', image: { source: 'upload', dataUrl: TINY_PNG, alt: 'עתיד' } },
    { layout: 'closing', title: 'המסקנה: תחרות + רגולציה חכמה', bullets: ['להמשיך את פתיחת השוק', 'להשקיע בפריפריה', 'Digital-first ממשלתי'] },
  ],
};

window.__pptxResults = {};

// שקף שער לדוגמה למצב grid (שער אחד לכל theme)
const GRID_COVER = { layout: 'cover', title: 'המהפכה הדיגיטלית בישראל', subtitle: 'סקירה עיצובית — Wolfsfeld 2011', kicker: 'סדרת מחקר' };
const GRID_SECTION = { layout: 'section', title: 'המצב כיום', subtitle: 'תמונת מצב 2026' };

function Harness() {
  const [themeId, setThemeId] = useState('premium');
  const [status, setStatus] = useState('מוכן');
  const [mode, setMode] = useState('sweep'); // 'sweep' = דק מלא לפי theme נבחר; 'grid' = שער+מפריד לכל 18 ה-themes
  const deck = normalizeDeck({ ...FIXTURE, themeId });

  // חושף לרנדר הנוכחי (theme נבחר) — ה-driver קורא לזה דרך preview_eval
  window.__runExport = async (profile, overrideThemeId) => {
    const d = normalizeDeck({ ...FIXTURE, themeId: overrideThemeId || themeId });
    const t0 = performance.now();
    const { base64, warnings } = await buildPptxBase64(d, { profile });
    const ms = Math.round(performance.now() - t0);
    const key = `${overrideThemeId || themeId}-${profile}`;
    window.__pptxResults[key] = base64;
    return { key, bytes: base64.length, warnings, ms };
  };
  // משיכת התוצאה בפרוסות (מגבלת גודל של eval)
  window.__pullResult = (key, offset, len) => {
    const b = window.__pptxResults[key] || '';
    return { total: b.length, chunk: b.slice(offset, offset + len) };
  };

  const run = async (profile) => {
    setStatus(`מייצא ${profile}...`);
    try {
      const r = await window.__runExport(profile);
      setStatus(`✓ ${r.key}: ${(r.bytes * 0.75 / 1024 / 1024).toFixed(2)}MB, ${r.ms}ms, אזהרות: ${r.warnings?.length || 0}`);
    } catch (e) { setStatus(`✗ ${e?.message || e}`); }
  };

  return (
    <div dir="rtl">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <b>PPTX Harness</b>
        <select id="theme-select" value={themeId} onChange={(e) => setThemeId(e.target.value)} style={{ padding: 4 }}>
          {DECK_THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        {['auto', 'editable', 'faithful'].map((p) => (
          <button key={p} id={`export-${p}`} onClick={() => run(p)} style={{ padding: '4px 12px' }}>{p}</button>
        ))}
        <button id="mode-toggle" onClick={() => setMode(mode === 'sweep' ? 'grid' : 'sweep')} style={{ padding: '4px 12px' }}>
          {mode === 'sweep' ? '→ grid כל הערכות' : '→ sweep ערכה אחת'}
        </button>
        <span id="status">{status}</span>
      </div>
      {mode === 'sweep' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, maxWidth: 1400 }}>
          {deck.slides.map((s, i) => (
            <div key={s.id} id={`slide-${i}`}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{i + 1} · {s.layout}</div>
              <SlideFrame slide={s} themeId={themeId} index={i} deckTitle={deck.title} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, maxWidth: 1400 }}>
          {DECK_THEMES.map((t) => (
            <React.Fragment key={t.id}>
              <div id={`grid-cover-${t.id}`}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{t.id} · שער · {t.label}</div>
                <SlideFrame slide={normalizeDeck({ title: FIXTURE.title, themeId: t.id, slides: [GRID_COVER] }).slides[0]} themeId={t.id} index={0} deckTitle={FIXTURE.title} />
              </div>
              <div id={`grid-section-${t.id}`}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{t.id} · מפריד</div>
                <SlideFrame slide={normalizeDeck({ title: FIXTURE.title, themeId: t.id, slides: [GRID_SECTION] }).slides[0]} themeId={t.id} index={3} deckTitle={FIXTURE.title} />
              </div>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
