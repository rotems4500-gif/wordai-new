// ═══════════════════════════════════════════════════════════════
// PresentationStudio.jsx — סטודיו מצגות מלא.
// שלושה מסכים לפי state מפורש (view): 'list' רשימת מצגות · 'brief' טופס יצירה ·
// 'editor' עורך שקופיות. (עד קודם המסך נגזר מ-!deck ולא אפשר חזרה בלי איבוד דק.)
// מקור האמת הוא אובייקט ה-deck (deckModel). אין HTML, אין TipTap.
// ═══════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AiSidebar from './AiSidebar';
import { SlideFrame } from './presentation/SlideRenderer';
import PresentMode from './presentation/PresentMode';
import { DECK_THEMES, getThemeById, THEME_ACCENTS } from './presentation/deckThemes';
import { FAMILY_ORDER, FAMILY_LABELS } from './presentation/themes';
import {
  SLIDE_LAYOUTS, getLayout, layoutHasImage, getSlideExportMode, BG_VARIANTS,
  createSlide, updateSlide, addSlideAfter, removeSlide, moveSlide, normalizeDeck,
  MAX_VIDEO_DATA_URL_CHARS,
} from './presentation/deckModel';
import {
  DECKS_UPDATED_EVENT, listDecks, loadDeck, saveDeck, deleteDeck, duplicateDeck, renameDeck,
} from './services/deckStore';
import { searchStockImages, generateAiImage, getImageSourceAvailability } from './services/imageService';
import {
  generateSlideImage, generateSlideInfographic, generateSlideBackground, restructureSlideAsInfographic,
  generateMissingDeckImages, generateDeckTheme, compressImageDataUrl,
} from './services/deckMediaService';
import {
  buildDeckDocumentSnapshot, buildDeckEditTargetState, createDeckEditBridge, parseSlideContent,
  serializeSlide, slideLocatorLabel,
} from './presentation/deckEditBridge';
import { buildPptxBase64 } from './services/pptxExport';
import {
  getProviderConfig, saveProviderConfig, getPresentationPreferences, savePresentationPreferences,
  getWordPreferences, getAssistantBehavior,
} from './services/aiService';

const DENSITY = [
  { id: 'lean', label: 'רזה' },
  { id: 'balanced', label: 'מאוזן' },
  { id: 'rich', label: 'עשיר' },
];

// אפשרויות "שקופית חדשה" — פריסה נבחרת מראש במקום title-bullets תמיד.
const ADD_SLIDE_OPTIONS = [
  { layout: 'title-bullets', label: 'תוכן (כותרת + נקודות)', icon: '📝' },
  { layout: 'section', label: 'פרק', icon: '📑' },
  { layout: 'stat', label: 'נתון', icon: '📈' },
  { layout: 'steps', label: 'שלבים', icon: '🪜' },
  { layout: 'comparison', label: 'השוואה', icon: '⚖️' },
  { layout: 'quote', label: 'ציטוט', icon: '❝' },
  { layout: 'image-full', label: 'תמונה מלאה', icon: '🖼️' },
];

// שכפול שקופית: העתק עמוק של כל המבנים המקוננים (bullets/columns/stats/steps/
// image/bgImage). ⚠️ בלי זה העותק היה חולק מערכים עם המקור, ועריכה באחד הייתה
// משנה גם את השני. ה-id מושמט בכוונה — createSlide מנפיק חדש (addSlideAfter
// מכניס את האובייקט כמו שהוא ואינו מנפיק id).
const cloneSlideContent = (slide) => {
  const { id: _dropId, ...rest } = slide || {};
  return {
    ...rest,
    bullets: [...(slide?.bullets || [])],
    columns: (slide?.columns || []).map((c) => ({ heading: c?.heading || '', bullets: [...(c?.bullets || [])] })),
    stats: (slide?.stats || []).map((s) => ({ ...s })),
    steps: (slide?.steps || []).map((s) => ({ ...s })),
    image: slide?.image ? { ...slide.image } : null,
    bgImage: slide?.bgImage ? { ...slide.bgImage } : null,
  };
};

// AiSidebar משדר התקדמות ל"מסמך חי" — במצגת אין יעד סטרימינג, ולכן noop.
const noopStream = () => {};

// ── פרומפט מצב העריכה של המצגת ────────────────────────────────────
// ברירת המחדל של AiSidebar מדברת על "פסקה במסמך" ומתירה במפורש HTML בלוקי —
// תשובה כזו הייתה נכנסת לגשר כמחרוזת אחת ומוחקת את השקופית. כאן מלמדים את
// המודל את דקדוק התוויות של deckEditBridge.
// ⚠️ כל טקסט דוגמה מסומן כדוגמה בלבד: מודלים בריפו הזה נתפסו מעתיקים מילולית
// ביטויים מתוך דוגמאות בפרומפט אל התוצר.
const DECK_EDIT_SYSTEM_PROMPT = [
  'מצב עריכת שקופית: אתה עורך שקופית אחת במצגת, לא פסקה במסמך. החזר אך ורק את התוכן החלופי המלא של השקופית.',
  'פורמט התשובה: שורות טקסט רגיל בלבד. אסור HTML, אסור Markdown, אסור בלוקי קוד, אסור פתיח או הסבר.',
  'דקדוק השורות (כל שדה בשורה נפרדת, רק שדות שאתה רוצה שיופיעו):',
  [
    'שורה ראשונה = כותרת השקופית',
    'תווית עליונה: <טקסט קצר מעל הכותרת>',
    'כותרת משנה: <טקסט>',
    '• <נקודה> — שורה נפרדת לכל נקודה',
    'עמודה: <כותרת העמודה>, ואחריה שורות "• " ששייכות לאותה עמודה',
    'נתון: <ערך> — <תווית> (<כיתוב משנה>)',
    'שלב N: <כותרת השלב>: <גוף השלב>',
    'הערות מרצה: <טקסט למרצה>',
  ].join('\n'),
  'החזר תמיד את תוכן השקופית במלואו. אין תמיכה ב"רק את מה שהשתנה" — שדה שלא תחזיר פשוט יישאר כפי שהוא.',
  'שורות "תמונה:" ו-"וידאו:" הן קונטקסט קריאה-בלבד שמתאר את המדיה בשקופית. אל תחזיר אותן ואל תנסה לערוך אותן.',
  'אינך יכול לשנות פריסה, תמונות, רקע או סדר שקופיות — רק טקסט. אם הבקשה דורשת אחת מאלה, כתוב זאת בטקסט התשובה ואל תמציא שדות.',
  'לדוגמה בלבד — נסח בעצמך, אל תעתיק את המילים האלה:\nהכותרת כאן\n• נקודה ראשונה\n• נקודה שנייה\nהערות מרצה: מה לומר בעל פה',
].join('\n\n');

// ── זיהוי הפניות מפורשות לשקופיות בבקשה ("שפר את שקופיות 2 ו-5") ──
// בלי זה כל בקשה מרובת-שקופיות הייתה עורכת רק את השקופית הנבחרת, בשקט.
// המספרים הם 1-based, כמו ב-rail וכמו בסריאליזציה שהמודל רואה.
const SLIDE_REF_PATTERN = /(?:שקופיות|שקופית|שקפים|שקף|slides|slide)\s*(?:מספר\s*|מס['׳]?\s*|#\s*)?(\d+(?:\s*(?:,|ו[־–—-]?|עד|and|to|[־–—-])\s*\d+)*)/gi;

/** "2 ו-5" → [2,5] · "3-5" → [3,4,5] · "3 עד 5" → [3,4,5] */
const parseSlideNumberSpan = (span) => {
  // "ו-5"/"ו5" הוא ו' החיבור, לא טווח — מנטרלים לפני הטוקניזציה, אחרת
  // "שקופיות 2 ו-5" היה נקרא כטווח 2..5.
  const normalized = String(span || '').replace(/ו[־–—-]?(?=\s*\d)/g, ' , ');
  const tokens = normalized.match(/\d+|עד|to|and|[־–—-]/gi) || [];
  const out = [];
  let rangeOpen = false;
  let prev = null;
  tokens.forEach((token) => {
    if (!/^\d+$/.test(token)) { rangeOpen = !/^(?:and)$/i.test(token); return; }
    const num = Number(token);
    if (rangeOpen && prev != null) {
      const [from, to] = prev <= num ? [prev, num] : [num, prev];
      if (to - from <= 200) for (let i = from; i <= to; i += 1) out.push(i);
    } else out.push(num);
    rangeOpen = false;
    prev = num;
  });
  return out;
};

/**
 * מחזיר את חוזה resolveEditTargetsFromPrompt של AiSidebar:
 * { targets, unresolvedExplicitReferences }. מחזיר null כשאין הפניה מפורשת
 * לשתי שקופיות ומעלה — כדי לא לגעת במסלול היעד היחיד (השקופית הנבחרת).
 */
export const resolveDeckSlideReferences = (promptText, slides = []) => {
  const text = String(promptText || '');
  if (!text.trim()) return null;

  const numbers = [];
  SLIDE_REF_PATTERN.lastIndex = 0;
  let match = SLIDE_REF_PATTERN.exec(text);
  while (match) {
    parseSlideNumberSpan(match[1]).forEach((n) => { if (n > 0 && !numbers.includes(n)) numbers.push(n); });
    match = SLIDE_REF_PATTERN.exec(text);
  }
  if (numbers.length < 2) return null;

  const list = Array.isArray(slides) ? slides : [];
  const targets = [];
  const unresolvedExplicitReferences = [];
  numbers.forEach((num) => {
    const slide = list[num - 1];
    if (!slide?.id) { unresolvedExplicitReferences.push({ locatorLabel: `שקופית ${num}` }); return; }
    targets.push({
      kind: 'block',
      text: serializeSlide(slide, num - 1),
      targetId: `deck:${slide.id}`,
      locatorLabel: slideLocatorLabel(slide, num - 1),
      headingText: String(slide.title || '').trim(),
      matchKind: 'deck-slide-number',
    });
  });
  return { targets, unresolvedExplicitReferences };
};

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

// ── תמונת דוגמה חיה לבורר ה-themes: אובייקט אחד משותף (לא נוצר מחדש בכל רנדר) ──
const THEME_PREVIEW_SAMPLE_SLIDE = createSlide({
  layout: 'cover', title: 'כותרת המצגת', subtitle: 'שורת משנה קצרה', kicker: 'סדרה',
});

// תא preview בודד — ממתין ל-IntersectionObserver לפני שמרנדר SlideFrame חי (18 שקפים
// חיים במקביל כבד); עד אז מציג placeholder צבעוני לפי theme.colors.bg.
const ThemePreviewCell = React.memo(function ThemePreviewCell({ theme, selected, onSelect, small }) {
  const wrapRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return undefined;
    const el = wrapRef.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return (
    <button
      type="button"
      ref={wrapRef}
      onClick={() => onSelect(theme.id)}
      title={theme.blurb || theme.label}
      className={`flex flex-col gap-1.5 rounded-2xl border-2 p-1.5 text-right transition ${selected ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-700 bg-slate-800/30 hover:border-slate-500'}`}
    >
      <div className="w-full overflow-hidden rounded-xl" style={{ aspectRatio: '16 / 9' }}>
        {visible
          ? <SlideFrame slide={THEME_PREVIEW_SAMPLE_SLIDE} themeId={theme.id} rounded={false} shadow={false} />
          : <div className="h-full w-full" style={{ background: theme.coverGradient || theme.colors?.bg || '#0f172a' }} />}
      </div>
      <span className={`truncate font-semibold text-slate-200 ${small ? 'text-[10px]' : 'text-xs'}`}>{theme.label}</span>
    </button>
  );
});

// בורר themes מקובץ לפי family, עם כותרות עבריות ותאי preview חיים.
function ThemeFamilyPicker({ value, onSelect, small = false }) {
  return (
    <div className="flex flex-col gap-4">
      {FAMILY_ORDER.map((famId) => {
        const items = DECK_THEMES.filter((t) => t.family === famId);
        if (!items.length) return null;
        return (
          <div key={famId} className="flex flex-col gap-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{FAMILY_LABELS[famId] || famId}</div>
            <div className={`grid gap-2 ${small ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
              {items.map((t) => (
                <ThemePreviewCell key={t.id} theme={t} selected={t.id === value} onSelect={onSelect} small={small} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── "המצגות שלי": רשימת המצגות השמורות ───────────────────────────
// האינדקס יושב ב-localStorage וגוף הדק ב-IndexedDB (ר' services/deckStore.js).
// רשומה עם bodyMissing נוצרה במכשיר אחר וסונכרנה — אפשר רק למחוק אותה.

const RELATIVE_STEPS = [
  { limit: 60 * 1000, label: () => 'עכשיו' },
  { limit: 60 * 60 * 1000, label: (ms) => `לפני ${Math.max(1, Math.round(ms / 60000))} דקות` },
  { limit: 24 * 60 * 60 * 1000, label: (ms) => `לפני ${Math.max(1, Math.round(ms / 3600000))} שעות` },
  { limit: 7 * 24 * 60 * 60 * 1000, label: (ms) => `לפני ${Math.max(1, Math.round(ms / 86400000))} ימים` },
];

const formatUpdatedAt = (iso) => {
  const time = Date.parse(iso || '');
  if (!Number.isFinite(time)) return '';
  const diff = Date.now() - time;
  if (diff < 0) return 'עכשיו';
  const step = RELATIVE_STEPS.find((s) => diff < s.limit);
  if (step) return step.label(diff);
  try { return new Date(time).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return new Date(time).toISOString().slice(0, 10); }
};

function DeckListScreen({ openDeckId, onOpenDeck, onDeckDeleted, onDeckRenamed, onNewDeck, showToast }) {
  const [records, setRecords] = useState(() => listDecks());
  const [busyId, setBusyId] = useState('');

  // רענון בכניסה למסך ובכל שינוי במאגר (שמירה אוטומטית, מחיקה, סנכרון ענן).
  useEffect(() => {
    const refresh = () => setRecords(listDecks());
    refresh();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener(DECKS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(DECKS_UPDATED_EVENT, refresh);
  }, []);

  const runAction = async (id, work) => {
    if (busyId) return;
    setBusyId(id);
    try { await work(); }
    catch (e) { showToast?.(e?.message || 'הפעולה נכשלה', { tone: 'warning' }); }
    finally { setBusyId(''); }
  };

  const handleOpen = (rec) => runAction(rec.id, async () => {
    const body = await loadDeck(rec.id);
    if (!body) {
      showToast?.('המצגת נוצרה במכשיר אחר ואינה זמינה כאן', { tone: 'warning' });
      return;
    }
    // normalizeDeck משמר את ה-id, ולכן ה-effect של deck?.id באב מאפס היסטוריה
    // ומעביר לעורך. במכוון לא עובר דרך commitDeck — טעינה אינה עריכה.
    onOpenDeck(normalizeDeck(body));
  });

  const handleRename = (rec) => {
    const next = window.prompt('שם חדש למצגת:', rec.title);
    if (next == null) return;
    const clean = next.trim();
    if (!clean || clean === rec.title) return;
    runAction(rec.id, async () => {
      await renameDeck(rec.id, clean);
      // שינוי שם של המצגת שפתוחה בעורך חייב להגיע גם לדק שבזיכרון — אחרת
      // השמירה האוטומטית הבאה הייתה כותבת מחדש את הכותרת הישנה ומבטלת את השינוי.
      onDeckRenamed?.(rec.id, clean);
    });
  };

  const handleDuplicate = (rec) => runAction(rec.id, async () => {
    await duplicateDeck(rec.id);
    showToast?.('נוצר עותק של המצגת');
  });

  const handleDelete = (rec) => {
    if (!window.confirm(`למחוק את "${rec.title}"? הפעולה בלתי הפיכה.`)) return;
    runAction(rec.id, async () => {
      await deleteDeck(rec.id);
      // מחיקה של המצגת שפתוחה בעורך חייבת לרוקן גם אותו — אחרת העריכה הבאה
      // הייתה שומרת אותה מחדש ומחזירה אותה לרשימה.
      onDeckDeleted?.(rec.id);
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center rounded-full bg-cyan-500/15 px-3 py-1 text-[11px] font-bold text-cyan-300">סטודיו מצגות</div>
          <h1 className="mt-3 text-3xl font-black text-white">המצגות שלי</h1>
          <p className="mt-2 text-sm leading-7 text-slate-400">
            {records.length ? 'המצגות נשמרות אוטומטית תוך כדי עריכה.' : 'עוד לא שמרת מצגות.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onNewDeck}
          className="rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-3.5 text-sm font-bold text-white transition hover:from-cyan-400"
        >+ מצגת חדשה</button>
      </div>

      {!records.length && (
        <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-14 text-center">
          <div className="text-lg font-bold text-slate-200">אין כאן עדיין מצגות</div>
          <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-slate-400">
            צור מצגת ראשונה מנושא חופשי, מהמסמך הפתוח או מקובץ PowerPoint קיים. כל מצגת שתיצור תישמר כאן אוטומטית.
          </p>
          <button
            type="button"
            onClick={onNewDeck}
            className="mt-5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:from-cyan-400"
          >בוא נתחיל</button>
        </div>
      )}

      {Boolean(records.length) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {records.map((rec) => {
            const theme = getThemeById(rec.themeId);
            const missing = rec.bodyMissing;
            const isBusy = busyId === rec.id;
            const isOpen = rec.id === openDeckId;
            return (
              <div
                key={rec.id}
                className={`flex flex-col overflow-hidden rounded-2xl border transition ${isOpen ? 'border-cyan-400 bg-cyan-500/5' : 'border-slate-800 bg-slate-900/50 hover:border-slate-600'}`}
              >
                <button
                  type="button"
                  onClick={() => !missing && !isBusy && handleOpen(rec)}
                  disabled={missing || isBusy}
                  title={missing ? 'המצגת נוצרה במכשיר אחר ואינה זמינה כאן' : 'פתח לעריכה'}
                  className={`block w-full text-right ${missing ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <div
                    className="flex w-full items-end justify-between p-3"
                    style={{ aspectRatio: '16 / 9', background: theme?.coverGradient || theme?.colors?.bg || '#0f172a' }}
                  >
                    {rec.thumbDataUrl
                      ? <img src={rec.thumbDataUrl} alt="" className="h-full w-full object-cover" />
                      : (
                        <>
                          <span className="rounded-lg bg-slate-950/55 px-2 py-1 text-[11px] font-semibold text-slate-200">{rec.slideCount} שקופיות</span>
                          {isOpen && <span className="rounded-lg bg-cyan-400 px-2 py-1 text-[11px] font-bold text-slate-950">פתוחה</span>}
                        </>
                      )}
                  </div>
                  <div className="px-4 pb-2 pt-3">
                    <div className="truncate text-sm font-bold text-slate-100">{rec.title}</div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {missing ? 'לא זמינה במכשיר הזה' : `עודכן ${formatUpdatedAt(rec.updatedAt)} · ${rec.slideCount} שקופיות`}
                    </div>
                  </div>
                </button>
                <div className="mt-auto flex flex-wrap gap-1.5 border-t border-slate-800 px-3 py-2">
                  {!missing && (
                    <>
                      <button type="button" disabled={isBusy} onClick={() => handleOpen(rec)} className="rounded-lg bg-cyan-500/15 px-2.5 py-1 text-[11px] font-bold text-cyan-300 transition hover:bg-cyan-500/25 disabled:opacity-40">פתח</button>
                      <button type="button" disabled={isBusy} onClick={() => handleDuplicate(rec)} className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-400 transition hover:text-slate-100 disabled:opacity-40">שכפל</button>
                      <button type="button" disabled={isBusy} onClick={() => handleRename(rec)} className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-400 transition hover:text-slate-100 disabled:opacity-40">שנה שם</button>
                    </>
                  )}
                  <button type="button" disabled={isBusy} onClick={() => handleDelete(rec)} className="mr-auto rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition hover:text-rose-400 disabled:opacity-40">מחק</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── טופס יצירה (מצב ללא deck) ────────────────────────────────────
function CreateForm({ onGenerate, onUploadPptx, onImportPptxAsDeck, busy, hasDocument, documentTitle, seed = null, onSeedConsumed = () => {} }) {
  const prefs = useMemo(() => getPresentationPreferences(), []);
  const uploadRef = useRef(null);
  const importRef = useRef(null);
  const [source, setSource] = useState('topic');
  const [topic, setTopic] = useState('');
  // brief שהגיע ממסך הפתיחה: חומרי עזר שנבחרו שם + טיוטת בסיס שנבחרה שם.
  // הטופס הזה לא בוחר חומרים בעצמו, ולכן הם נשמרים כמות שהם ונשלחים ב-payload.
  const [seedMaterials, setSeedMaterials] = useState([]);
  const [seedDocText, setSeedDocText] = useState('');
  const [seedDocTitle, setSeedDocTitle] = useState('');
  const [audience, setAudience] = useState(prefs.defaultAudience || '');
  const [goal, setGoal] = useState(prefs.defaultGoal || '');
  const [slideCount, setSlideCount] = useState(prefs.defaultSlideCount === 'auto' ? 10 : (prefs.defaultSlideCount || 10));
  const [slideAuto, setSlideAuto] = useState(prefs.defaultSlideCount === 'auto');
  const [themeId, setThemeId] = useState(prefs.defaultThemeId || 'premium');
  const [density, setDensity] = useState(prefs.defaultDensity || 'balanced');
  const [imageIntensity, setImageIntensity] = useState(prefs.defaultImageIntensity || 'high');
  const [autoImages, setAutoImages] = useState(prefs.defaultAutoImages === true);
  const [autoInfographics, setAutoInfographics] = useState(prefs.defaultAutoInfographics === true);
  const [autoTheme, setAutoTheme] = useState(prefs.defaultAutoTheme !== false);
  // אפשרויות שהיו עד כה רק בפאנל המוקטן של מסך הפתיחה. הן עוברות ל-generateDeck
  // דרך אותו payload, ולכן הן חייבות לחיות כאן אחרי שהפאנל ההוא ירד.
  const [includeCover, setIncludeCover] = useState(prefs.defaultIncludeCover !== false);
  const [speakerNotes, setSpeakerNotes] = useState(prefs.defaultSpeakerNotes === true);
  const [aiAppendix, setAiAppendix] = useState(false);

  // אימוץ ה-seed ממסך הפתיחה — פעם אחת, ואז הוא מתאפס אצל ההורה.
  useEffect(() => {
    if (!seed) return;
    const seedTopic = String(seed.topic || '').trim();
    if (seedTopic) setTopic(seedTopic);
    const mats = Array.isArray(seed.selectedMaterials) ? seed.selectedMaterials.filter(Boolean) : [];
    if (mats.length) setSeedMaterials(mats);
    const docText = String(seed.baseDraftText || '').trim();
    if (docText) {
      setSeedDocText(docText);
      setSeedDocTitle(String(seed.baseDraftTitle || '').trim());
      setSource('document');
    }
    onSeedConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const fromDocument = source === 'document';
  const fromUpload = source === 'upload';
  // מקור "מסמך" זמין גם כשהמסמך הגיע כטיוטת בסיס ממסך הפתיחה ולא מהעורך הפתוח.
  const documentAvailable = hasDocument || Boolean(seedDocText);
  const canGenerate = (fromDocument ? documentAvailable : Boolean(topic.trim())) && !busy;

  const submit = () => {
    if (!canGenerate) return;
    const resolvedSlideCount = Math.max(4, Math.min(40, Number(slideCount) || 10));
    if (prefs.rememberLastChoices !== false) {
      savePresentationPreferences({
        ...prefs,
        defaultThemeId: themeId,
        defaultDensity: density,
        defaultSlideCount: slideAuto ? 'auto' : resolvedSlideCount,
        defaultImageIntensity: imageIntensity,
        defaultAutoImages: autoImages,
        defaultAutoInfographics: autoInfographics,
        defaultAutoTheme: autoTheme,
        defaultAudience: audience.trim(),
        defaultGoal: goal.trim(),
        defaultIncludeCover: includeCover,
        defaultSpeakerNotes: speakerNotes,
      });
    }
    onGenerate({
      source, topic: topic.trim(), audience: audience.trim(), goal: goal.trim(),
      slideCount: slideAuto ? 'auto' : resolvedSlideCount,
      themeId, density, imageIntensity, autoImages, autoInfographics, autoTheme,
      includeCover, speakerNotes, aiAppendix,
      // חומרי העזר וטיוטת הבסיס שהגיעו ממסך הפתיחה — בלעדיהם המצגת נבנית
      // מהנושא בלבד, וזה בדיוק מה שהמשתמש כבר בחר שלא לעשות.
      selectedMaterials: seedMaterials,
      ...(seedDocText ? { documentText: seedDocText } : {}),
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-10">
      <div>
        <div className="inline-flex items-center rounded-full bg-cyan-500/15 px-3 py-1 text-[11px] font-bold text-cyan-300">סטודיו מצגות</div>
        <h1 className="mt-3 text-3xl font-black text-white">בוא נבנה מצגת אמיתית</h1>
        <p className="mt-2 text-sm leading-7 text-slate-400">דק שקופיות חי שאפשר לערוך, להוסיף תמונות, להציג ולייצא ל-PowerPoint.</p>
      </div>

      <div className="inline-flex w-fit rounded-2xl border border-slate-700 bg-slate-800/60 p-1">
        <button type="button" onClick={() => setSource('topic')} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${source === 'topic' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300'}`}>נושא חופשי</button>
        <button type="button" onClick={() => setSource('document')} disabled={!documentAvailable} title={documentAvailable ? '' : 'אין מסמך פתוח'} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${fromDocument ? 'bg-cyan-500 text-slate-950' : 'text-slate-300'} ${!documentAvailable ? 'cursor-not-allowed opacity-40' : ''}`}>{seedDocText ? 'מטיוטת הבסיס' : 'מהמסמך הפתוח'}</button>
        <button type="button" onClick={() => setSource('upload')} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${fromUpload ? 'bg-cyan-500 text-slate-950' : 'text-slate-300'}`}>העלאת מצגת (טיוטה)</button>
      </div>

      {fromUpload && (
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm leading-7 text-slate-300">
            העלה מצגת קיימת (<b className="text-white">.pptx</b>) ובחר מה לעשות איתה. שתי הדרכים מתחילות מאותו קובץ.
          </div>
          <input ref={uploadRef} type="file" accept=".pptx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadPptx?.(f); e.target.value = ''; }} />
          <input ref={importRef} type="file" accept=".pptx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportPptxAsDeck?.(f); e.target.value = ''; }} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => uploadRef.current?.click()} disabled={busy} className="flex h-full min-h-[112px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-600 px-4 py-6 text-center text-sm font-semibold text-slate-300 hover:border-cyan-400 hover:text-cyan-300 disabled:opacity-50">
                <span className="text-lg">📝</span>
                <span>{busy ? 'טוען מצגת...' : 'שכתוב טקסט בלבד — העיצוב המקורי נשמר'}</span>
              </button>
              <span className="px-1 text-[11px] leading-5 text-slate-500">הקובץ המיוצא זהה למקור — צבעים, מיקומים, תמונות ופונטים — רק הטקסט משוכתב.</span>
            </div>

            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => importRef.current?.click()} disabled={busy} className="flex h-full min-h-[112px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-600 px-4 py-6 text-center text-sm font-semibold text-slate-300 hover:border-cyan-400 hover:text-cyan-300 disabled:opacity-50">
                <span className="text-lg">🎨</span>
                <span>{busy ? 'טוען מצגת...' : 'ייבוא לעריכה מלאה — העיצוב יוחלף בערכת עיצוב'}</span>
              </button>
              <span className="px-1 text-[11px] leading-5 text-slate-500">טבלאות, אנימציות ומיקומים מקוריים לא נשמרים; הטקסט, התמונות וההערות מיובאים.</span>
            </div>
          </div>
        </div>
      )}

      {!fromUpload && fromDocument && (
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-slate-300">
          {seedDocText
            ? <>המצגת תיבנה מטיוטת הבסיס שבחרת במסך הפתיחה{seedDocTitle ? <>: <b className="text-white">{seedDocTitle}</b></> : ''}. שדה הנושא אופציונלי — זווית או דגש.</>
            : hasDocument
              ? <>המצגת תיבנה מהמסמך הפתוח{documentTitle ? <>: <b className="text-white">{documentTitle}</b></> : ''}. שדה הנושא אופציונלי — זווית או דגש.</>
              : 'אין מסמך פתוח.'}
        </div>
      )}

      {!fromUpload && seedMaterials.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-2.5 text-sm text-emerald-200">
          <span>📎 ייכללו {seedMaterials.length} חומרי עזר שנבחרו</span>
          <button
            type="button"
            onClick={() => setSeedMaterials([])}
            title="אל תשתמש בחומרי העזר האלה במצגת"
            className="rounded-lg px-2 py-0.5 text-xs font-bold text-emerald-300/80 transition hover:bg-emerald-500/15 hover:text-emerald-200"
          >✕</button>
        </div>
      )}

      {!fromUpload && (<>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-bold text-slate-200">{fromDocument ? 'זווית או דגש (אופציונלי)' : 'נושא המצגת'}</span>
        <textarea value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={fromDocument ? 'על מה להדגיש מהמסמך?' : 'על מה המצגת? מה צריך להעביר?'} className="min-h-[96px] rounded-2xl border border-slate-700 bg-slate-800/60 px-4 py-3 text-sm leading-7 text-slate-100 outline-none focus:border-cyan-400" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2"><span className="text-sm font-bold text-slate-200">קהל יעד</span>
          <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="משקיעים, מרצה, לקוח..." className="rounded-2xl border border-slate-700 bg-slate-800/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400" /></label>
        <label className="flex flex-col gap-2"><span className="text-sm font-bold text-slate-200">מטרה</span>
          <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="לשכנע, להסביר, למכור..." className="rounded-2xl border border-slate-700 bg-slate-800/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400" /></label>
        <label className="flex flex-col gap-2">
          <span className="flex items-center justify-between text-sm font-bold text-slate-200">מספר שקופיות
            <button type="button" onClick={() => setSlideAuto((v) => !v)} className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${slideAuto ? 'bg-cyan-400 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>✨ אוטומטי</button>
          </span>
          <input type="number" min="4" max="40" value={slideAuto ? '' : slideCount} disabled={slideAuto} placeholder={slideAuto ? 'ה-AI יחליט לפי התוכן' : ''} onChange={(e) => setSlideCount(e.target.value)} className="rounded-2xl border border-slate-700 bg-slate-800/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400 disabled:opacity-50 placeholder:text-slate-500 placeholder:text-xs" /></label>
        <label className="flex flex-col gap-2"><span className="text-sm font-bold text-slate-200">דגש על תמונות</span>
          <select value={imageIntensity} onChange={(e) => setImageIntensity(e.target.value)} className="rounded-2xl border border-slate-700 bg-slate-800/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400">
            <option value="high">גבוה</option><option value="medium">בינוני</option><option value="low">נמוך</option>
          </select></label>
      </div>

      {/* ── מדיה אוטומטית אחרי הבנייה ── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <label className="flex cursor-pointer flex-col gap-1">
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoImages}
              onChange={(e) => setAutoImages(e.target.checked)}
              className="h-4 w-4 flex-none cursor-pointer accent-cyan-500"
            />
            <span className="text-sm font-bold text-slate-200">🖼️ צור תמונות אוטומטית אחרי הבנייה</span>
          </span>
          <span className="pr-6 text-[11px] leading-5 text-slate-500">כל שקופית שמסומנת כזקוקה לתמונה תקבל תמונה מחוללת. עולה כסף — כ-4 סנט לתמונה.</span>
        </label>
        <label className="flex cursor-pointer flex-col gap-1">
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoInfographics}
              onChange={(e) => setAutoInfographics(e.target.checked)}
              className="h-4 w-4 flex-none cursor-pointer accent-cyan-500"
            />
            <span className="text-sm font-bold text-slate-200">📊 המר שקופיות מתאימות לאינפוגרפיקה</span>
          </span>
          <span className="pr-6 text-[11px] leading-5 text-slate-500">שקופיות עם סדרת מספרים יומרו לגרף מדויק (חינם); השאר למבנה ויזואלי.</span>
        </label>
        <label className="flex cursor-pointer flex-col gap-1">
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoTheme}
              onChange={(e) => setAutoTheme(e.target.checked)}
              className="h-4 w-4 flex-none cursor-pointer accent-cyan-500"
            />
            <span className="text-sm font-bold text-slate-200">🎨 עיצוב מחולל (ערכה מותאמת לנושא)</span>
          </span>
          <span className="pr-6 text-[11px] leading-5 text-slate-500">ה-AI מייצר ערכת צבעים ופונטים לפי הנושא במקום ערכה מוכנה. קריאת טקסט אחת; אם נכשל נשארת הערכה שבחרת.</span>
        </label>
      </div>

      {/* ── מבנה ותוספות ── */}
      <div className="flex flex-wrap gap-x-5 gap-y-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" checked={includeCover} onChange={(e) => setIncludeCover(e.target.checked)} className="h-4 w-4 cursor-pointer accent-cyan-500" />
          שקופית פתיחה
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" checked={speakerNotes} onChange={(e) => setSpeakerNotes(e.target.checked)} className="h-4 w-4 cursor-pointer accent-cyan-500" />
          הערות מרצה קצרות
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-amber-200/90" title="שקופיות נספח בסוף הדק עם הפרומפטים לפי שלבים והדרכה. כרוך בקריאת API נוספת.">
          <input type="checkbox" checked={aiAppendix} onChange={(e) => setAiAppendix(e.target.checked)} className="h-4 w-4 cursor-pointer accent-amber-500" />
          📎 נספח AI (קריאת API נוספת)
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-slate-200">סגנון</span>
          <button
            type="button"
            onClick={() => setThemeId(DECK_THEMES[Math.floor(Math.random() * DECK_THEMES.length)].id)}
            className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300 transition hover:border-cyan-400 hover:text-cyan-300"
          >🎲 הפתע אותי</button>
        </div>
        <div className="max-h-[380px] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
          <ThemeFamilyPicker value={themeId} onSelect={setThemeId} />
        </div>
      </div>

      <div className="flex flex-col gap-2"><span className="text-sm font-bold text-slate-200">רמת עומס</span>
        <div className="grid grid-cols-3 gap-2">
          {DENSITY.map((d) => (
            <button key={d.id} type="button" onClick={() => setDensity(d.id)} className={`rounded-xl border px-2 py-2 text-sm font-bold transition ${density === d.id ? 'border-cyan-400 bg-cyan-500/15 text-white' : 'border-slate-700 bg-slate-800/40 text-slate-300'}`}>{d.label}</button>
          ))}
        </div>
      </div>

      <button type="button" onClick={submit} disabled={!canGenerate} className={`mt-2 rounded-2xl px-6 py-3.5 text-sm font-bold text-white transition ${canGenerate ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400' : 'cursor-not-allowed bg-slate-700 text-slate-400'}`}>
        {busy ? 'בונה מצגת...' : '📊 צור מצגת'}
      </button>
      </>)}
    </div>
  );
}

// ── הזנת מפתח inline (זהה בהתנהגות להגדרות, נגיש מתוך הבורר) ──────
function KeyEntry({ title, hint, link, linkLabel, onSave }) {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);
  return (
    <div className="mb-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="text-sm font-bold text-amber-300">{title}</div>
      {hint && <div className="mt-1 text-xs leading-6 text-slate-400">{hint}</div>}
      {link && <a href={link} target="_blank" rel="noreferrer" className="text-xs font-semibold text-cyan-400 underline">{linkLabel || 'קבל מפתח'}</a>}
      <div className="mt-2 flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => { setValue(e.target.value); setSaved(false); }}
          placeholder="הדבק מפתח כאן"
          dir="ltr"
          className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
        />
        <button
          onClick={() => { if (value.trim()) { onSave(value.trim()); setSaved(true); } }}
          disabled={!value.trim()}
          className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-40"
        >שמור</button>
      </div>
      {saved && <div className="mt-1.5 text-xs font-semibold text-emerald-400">✓ נשמר</div>}
    </div>
  );
}

// ── מודאל בחירת/יצירת תמונה ───────────────────────────────────────
function ImagePicker({ slide, onPick, onClose }) {
  const [tab, setTab] = useState('stock');
  const [query, setQuery] = useState(slide?.image?.query || slide?.title || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const [avail, setAvail] = useState(() => getImageSourceAvailability(null, 'presentations'));

  // שמירת מפתח ישירות מתוך החלון — בדיוק כמו בהגדרות, רק נגיש כאן
  const saveStockKey = (key) => {
    const cfg = getProviderConfig();
    const provider = avail.stockProvider === 'unsplash' ? 'unsplash' : 'pexels';
    const next = { ...cfg, [provider]: { ...cfg[provider], key: String(key || '').trim() } };
    saveProviderConfig(next);
    setAvail(getImageSourceAvailability(next));
  };
  const saveAiKey = (key) => {
    const cfg = getProviderConfig();
    const next = { ...cfg, imageGen: { ...cfg.imageGen, key: String(key || '').trim() } };
    saveProviderConfig(next);
    setAvail(getImageSourceAvailability(next));
  };

  const runSearch = async () => {
    setError(''); setLoading(true); setResults([]);
    try {
      const res = await searchStockImages(query, { count: 12, featureId: 'presentations' });
      setResults(res);
      if (!res.length) setError('לא נמצאו תמונות. נסה ניסוח אחר (באנגלית עובד טוב יותר).');
    } catch (e) { setError(e?.message || 'שגיאה בחיפוש'); }
    finally { setLoading(false); }
  };

  const runGenerate = async () => {
    setError(''); setLoading(true);
    try {
      const img = await generateAiImage(query, { featureId: 'presentations' });
      onPick({ ...img, query });
    } catch (e) { setError(e?.message || 'שגיאה ביצירת תמונה'); }
    finally { setLoading(false); }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      onPick({ source: 'upload', dataUrl, url: '', alt: file.name, query: '', attribution: '' });
    } catch { setError('שגיאה בטעינת הקובץ'); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/70 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="flex gap-1 rounded-xl bg-slate-800 p-1">
            <button onClick={() => setTab('stock')} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === 'stock' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300'}`}>מאגר תמונות</button>
            <button onClick={() => setTab('ai')} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === 'ai' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300'}`}>יצירת AI</button>
            <button onClick={() => setTab('upload')} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === 'upload' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300'}`}>העלאה</button>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {(tab === 'stock' || tab === 'ai') && (
            <div className="mb-4 flex gap-2">
              <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (tab === 'stock' ? runSearch() : runGenerate())} placeholder={tab === 'stock' ? 'תיאור לחיפוש (באנגלית מומלץ)' : 'תיאור התמונה ליצירה'} className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-400" />
              <button onClick={tab === 'stock' ? runSearch : runGenerate} disabled={loading || !query.trim()} className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40">{loading ? '...' : tab === 'stock' ? 'חפש' : 'צור'}</button>
            </div>
          )}

          {tab === 'stock' && !avail.stock && (
            <KeyEntry
              title={`הוסף מפתח ${avail.stockProvider === 'unsplash' ? 'Unsplash' : 'Pexels'}`}
              hint={avail.stockProvider === 'unsplash' ? 'Access Key חינמי מ-Unsplash Developers.' : 'מפתח חינמי מ-Pexels API.'}
              link={avail.stockProvider === 'unsplash' ? 'https://unsplash.com/developers' : 'https://www.pexels.com/api/'}
              linkLabel="קבל מפתח חינם"
              onSave={saveStockKey}
            />
          )}
          {tab === 'ai' && !avail.ai && (
            <KeyEntry
              title={`הוסף מפתח ליצירת תמונות (${avail.aiProvider === 'openai' ? 'OpenAI' : 'Gemini'})`}
              hint="המפתח נשמר בנפרד ומשמש ליצירת תמונות. אפשר גם להגדיר בהגדרות → מפתחות → תמונות."
              link={avail.aiProvider === 'openai' ? 'https://platform.openai.com/api-keys' : 'https://aistudio.google.com/apikey'}
              linkLabel="קבל מפתח"
              onSave={saveAiKey}
            />
          )}
          {error && <p className="text-sm text-rose-400">{error}</p>}

          {tab === 'stock' && (
            <div className="grid grid-cols-3 gap-3">
              {results.map((r) => (
                <button key={r.id} onClick={() => onPick(r)} className="group relative overflow-hidden rounded-xl border border-slate-700">
                  <img src={r.thumb || r.url} alt={r.alt} className="h-28 w-full object-cover transition group-hover:scale-105" />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-slate-950/70 px-2 py-1 text-[10px] text-slate-300">{r.attribution}</span>
                </button>
              ))}
            </div>
          )}
          {tab === 'ai' && loading && <p className="text-sm text-slate-400">יוצר תמונה... זה יכול לקחת כמה שניות.</p>}
          {tab === 'upload' && (
            <div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
              <button onClick={() => fileRef.current?.click()} className="w-full rounded-2xl border-2 border-dashed border-slate-600 py-12 text-sm text-slate-400 hover:border-cyan-400 hover:text-cyan-300">לחץ להעלאת תמונה מהמחשב</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── עורך (inspector) של שקופית נבחרת ─────────────────────────────
// focusFieldRef מקבל את שדה הטקסט הראשי של הפריסה (כותרת, ואם אין — גוף הטקסט);
// לחיצה כפולה על התצוגה הגדולה מקפיצה את המיקוד לשם (ר' focusInspectorTitle).
function Inspector({ slide, themeId, onChange, onOpenImagePicker, focusFieldRef = null }) {
  const layoutDef = getLayout(slide.layout);
  const theme = getThemeById(themeId);
  const accentChoices = (Array.isArray(theme.accents) && theme.accents.length ? theme.accents : null)
    || THEME_ACCENTS[theme.id]
    || [theme.colors?.accent, theme.colors?.accent2].filter(Boolean);
  const setField = (field, value) => onChange({ [field]: value });
  const setBullet = (i, value) => {
    const bullets = [...slide.bullets]; bullets[i] = value; setField('bullets', bullets);
  };
  const addBullet = () => setField('bullets', [...slide.bullets, '']);
  const removeBullet = (i) => setField('bullets', slide.bullets.filter((_, idx) => idx !== i));

  const setStat = (i, patch) => setField('stats', (slide.stats || []).map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStat = () => setField('stats', [...(slide.stats || []), { value: '', label: '', caption: '' }]);
  const removeStat = (i) => setField('stats', (slide.stats || []).filter((_, idx) => idx !== i));

  const setStep = (i, patch) => setField('steps', (slide.steps || []).map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStep = () => setField('steps', [...(slide.steps || []), { title: '', body: '' }]);
  const removeStep = (i) => setField('steps', (slide.steps || []).filter((_, idx) => idx !== i));

  // ── עמודות ──
  // ⚠️ עד קודם הפיצול לשורות סינן שורות ריקות בכל הקשה (.filter(Boolean)), ולכן
  // Enter באמצע הרשימה "נבלע" והסמן קפץ. עכשיו הפיצול משמר שורות ריקות תוך כדי
  // הקלדה, והניקוי (שורות ריקות בסוף בלבד) קורה ביציאה מהשדה.
  const setColumn = (ci, patch) => setField('columns', (slide.columns || []).map((c, idx) => (idx === ci ? { ...c, ...patch } : c)));
  const addColumn = () => {
    const cols = slide.columns || [];
    if (cols.length >= 3) return;   // deckModel חותך ל-3 (normalizeSlide)
    setField('columns', [...cols, { heading: '', bullets: [] }]);
  };
  const removeColumn = (ci) => {
    const cols = (slide.columns || []).filter((_, idx) => idx !== ci);
    setField('columns', cols.length ? cols : [{ heading: '', bullets: [] }]);
  };
  const trimTrailingEmpty = (arr) => {
    const out = [...(arr || [])];
    while (out.length && !String(out[out.length - 1]).trim()) out.pop();
    return out;
  };

  const fields = layoutDef.fields;
  const titleFieldRef = fields.includes('title') ? focusFieldRef : null;
  const bodyFieldRef = !fields.includes('title') && fields.includes('body') ? focusFieldRef : null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <label className="flex flex-col gap-1.5"><span className="text-xs font-bold text-slate-400">פריסה</span>
        <select value={slide.layout} onChange={(e) => setField('layout', e.target.value)} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400">
          {SLIDE_LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-slate-400">עיצוב רקע</span>
        <div className="grid grid-cols-3 gap-1.5">
          {BG_VARIANTS.map((v) => {
            const cur = slide.bgVariant || 'auto';
            return (
              <button
                key={v.id}
                onClick={() => setField('bgVariant', v.id === 'auto' ? '' : v.id)}
                className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${cur === v.id ? 'border-cyan-400 bg-cyan-500/15 text-white' : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-500'}`}
              >{v.label}</button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-slate-400">צבע הדגשה</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {accentChoices.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setField('accent', color)}
              title={color}
              style={{ background: color }}
              className={`h-7 w-7 flex-none rounded-full border-2 transition ${String(slide.accent || '').toLowerCase() === String(color).toLowerCase() ? 'scale-110 border-white' : 'border-slate-700 hover:border-slate-400'}`}
            />
          ))}
          <input
            type="color"
            value={slide.accent || theme.colors?.accent || '#38bdf8'}
            onChange={(e) => setField('accent', e.target.value)}
            title="בחירת צבע חופשית"
            className="h-7 w-9 flex-none cursor-pointer rounded-lg border border-slate-700 bg-transparent p-0.5"
          />
          {slide.accent && (
            <button type="button" onClick={() => setField('accent', '')} className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:border-cyan-400 hover:text-cyan-300">אוטו</button>
          )}
        </div>
      </div>

      {(fields.includes('title')) && (
        <label className="flex flex-col gap-1.5"><span className="text-xs font-bold text-slate-400">כותרת</span>
          <input ref={titleFieldRef} value={slide.title} onChange={(e) => setField('title', e.target.value)} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400" /></label>
      )}
      {(fields.includes('title')) && (
        <label className="flex flex-col gap-1.5"><span className="text-xs font-bold text-slate-400">תווית עליונה (אופציונלי)</span>
          <input value={slide.kicker || ''} onChange={(e) => setField('kicker', e.target.value)} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400" /></label>
      )}
      {(fields.includes('subtitle')) && (
        <label className="flex flex-col gap-1.5"><span className="text-xs font-bold text-slate-400">כותרת משנה</span>
          <input value={slide.subtitle} onChange={(e) => setField('subtitle', e.target.value)} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400" /></label>
      )}
      {(fields.includes('body')) && (
        <label className="flex flex-col gap-1.5"><span className="text-xs font-bold text-slate-400">טקסט / ציטוט</span>
          <textarea ref={bodyFieldRef} value={slide.body} onChange={(e) => setField('body', e.target.value)} className="min-h-[100px] rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm leading-7 text-slate-100 outline-none focus:border-cyan-400" /></label>
      )}

      {(fields.includes('bullets')) && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-slate-400">נקודות</span>
          {slide.bullets.map((b, i) => (
            <div key={i} className="flex gap-1.5">
              <input value={b} onChange={(e) => setBullet(i, e.target.value)} className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400" />
              <button onClick={() => removeBullet(i)} className="rounded-lg px-2 text-slate-500 hover:text-rose-400">✕</button>
            </div>
          ))}
          <button onClick={addBullet} className="mt-1 self-start rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-400">+ נקודה</button>
        </div>
      )}

      {(fields.includes('columns')) && (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold text-slate-400">עמודות</span>
          {(slide.columns || []).map((col, ci) => (
            <div key={ci} className="rounded-xl border border-slate-700 bg-slate-800/50 p-3">
              <div className="mb-2 flex gap-1.5">
                <input value={col.heading} placeholder={`כותרת עמודה ${ci + 1}`} onChange={(e) => setColumn(ci, { heading: e.target.value })} className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-400" />
                {(slide.columns || []).length > 1 && (
                  <button onClick={() => removeColumn(ci)} title="הסר עמודה" className="rounded-lg px-2 text-slate-500 hover:text-rose-400">✕</button>
                )}
              </div>
              <textarea
                value={(col.bullets || []).join('\n')}
                placeholder="נקודה בכל שורה"
                onChange={(e) => setColumn(ci, { bullets: e.target.value.split('\n') })}
                onBlur={() => setColumn(ci, { bullets: trimTrailingEmpty(col.bullets) })}
                className="min-h-[70px] w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs leading-6 text-slate-100 outline-none focus:border-cyan-400"
              />
            </div>
          ))}
          {(slide.columns || []).length < 3 && (
            <button onClick={addColumn} className="self-start rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-400">+ הוסף עמודה</button>
          )}
        </div>
      )}

      {(fields.includes('stats')) && (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold text-slate-400">מספרים</span>
          {(slide.stats || []).map((st, si) => (
            <div key={si} className="rounded-xl border border-slate-700 bg-slate-800/50 p-3">
              <div className="mb-2 flex gap-1.5">
                <input value={st.value} placeholder="87%" onChange={(e) => setStat(si, { value: e.target.value })} className="w-24 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm font-bold text-slate-100 outline-none focus:border-cyan-400" />
                <input value={st.label} placeholder="תווית" onChange={(e) => setStat(si, { label: e.target.value })} className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-400" />
                <button onClick={() => removeStat(si)} className="rounded-lg px-2 text-slate-500 hover:text-rose-400">✕</button>
              </div>
              <input value={st.caption} placeholder="הסבר קצר (אופציונלי)" onChange={(e) => setStat(si, { caption: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-400" />
            </div>
          ))}
          {(slide.stats || []).length < 4 && <button onClick={addStat} className="self-start rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-400">+ מספר</button>}
        </div>
      )}

      {(fields.includes('steps')) && (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold text-slate-400">שלבים</span>
          {(slide.steps || []).map((st, si) => (
            <div key={si} className="rounded-xl border border-slate-700 bg-slate-800/50 p-3">
              <div className="mb-2 flex gap-1.5">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-cyan-500/20 text-xs font-bold text-cyan-300">{si + 1}</span>
                <input value={st.title} placeholder="כותרת השלב" onChange={(e) => setStep(si, { title: e.target.value })} className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-400" />
                <button onClick={() => removeStep(si)} className="rounded-lg px-2 text-slate-500 hover:text-rose-400">✕</button>
              </div>
              <textarea value={st.body} placeholder="תיאור קצר (אופציונלי)" onChange={(e) => setStep(si, { body: e.target.value })} className="min-h-[50px] w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs leading-6 text-slate-100 outline-none focus:border-cyan-400" />
            </div>
          ))}
          {(slide.steps || []).length < 6 && <button onClick={addStep} className="self-start rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-400">+ שלב</button>}
        </div>
      )}

      {layoutHasImage(slide.layout) && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-slate-400">תמונה</span>
          {slide.image && (slide.image.dataUrl || slide.image.url)
            ? <div className="relative overflow-hidden rounded-xl border border-slate-700">
                <img src={slide.image.dataUrl || slide.image.url} alt="" className="h-24 w-full object-cover" />
                <button onClick={() => setField('image', null)} className="absolute left-1 top-1 rounded-md bg-slate-950/70 px-2 py-0.5 text-xs text-slate-200">הסר</button>
              </div>
            : null}
          <button onClick={onOpenImagePicker} className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-cyan-400">{slide.image ? 'החלף תמונה' : '+ הוסף תמונה'}</button>
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-slate-400">מצב ייצוא ל-PPTX</span>
        <select value={slide.exportMode || ''} onChange={(e) => setField('exportMode', e.target.value)} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400">
          <option value="">אוטומטי ({getSlideExportMode({ ...slide, exportMode: '' }) === 'image' ? 'תמונה' : 'עריך'})</option>
          <option value="image">תמונה — עיצוב מלא</option>
          <option value="native">עריך — טקסט ב-PowerPoint</option>
        </select>
        <span className="text-[11px] leading-5 text-slate-500">תמונה = נאמנות עיצוב מלאה אך לא ניתן לערוך ב-PowerPoint. עריך = טקסט/בולטים נשארים עריכים.</span>
      </label>

      <label className="flex flex-col gap-1.5"><span className="text-xs font-bold text-slate-400">הערות מרצה</span>
        <textarea value={slide.notes} onChange={(e) => setField('notes', e.target.value)} className="min-h-[60px] rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs leading-6 text-slate-100 outline-none focus:border-cyan-400" /></label>
    </div>
  );
}

// ── הקומפוננטה הראשית ─────────────────────────────────────────────
export default function PresentationStudio({
  deck = null,
  onDeckChange = () => {},
  onGenerate = () => {},
  onUploadPptx = () => {},
  // ייבוא אותו .pptx כ-deck מלא (טקסט+תמונות+הערות) במקום כטיוטת שכתוב.
  onImportPptxAsDeck = () => {},
  onExit = () => {},
  busy = false,
  // טקסט התקדמות של שלב היצירה/מדיה (מגיע מ-main.jsx, מוצג בספינר)
  busyLabel = '',
  // שער השלמות: { deck, missing } — דק שנוצר אבל חלק מהתמונות נכשלו.
  mediaFailure = null,
  onRetryMedia = null,
  onOpenAnyway = null,
  hasDocument = false,
  documentTitle = '',
  showToast = () => {},
  onOpenHelp = null,
  initialView = null,
  onViewConsumed = () => {},
  // brief ממסך הפתיחה: { topic, selectedMaterials, baseDraftText, baseDraftTitle }.
  // ממלא מראש את טופס היצירה במקום לייצר מיד.
  briefSeed = null,
  onBriefSeedConsumed = () => {},
}) {
  // מסך פעיל מפורש: 'list' (רשימת מצגות) · 'brief' (טופס יצירה) · 'editor' (עורך שקופיות).
  // עד עכשיו המסך נגזר מ-!deck, ולכן לא היה אפשר לחזור לרשימה בלי לאבד את הדק.
  const [view, setView] = useState(() => initialView || (deck ? 'editor' : 'brief'));
  const [selectedId, setSelectedId] = useState(deck?.slides?.[0]?.id || '');
  const [presenting, setPresenting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const themePanelRef = useRef(null);
  // תפריט "שקופית חדשה" (בחירת פריסה) בתחתית רצועת התצוגות המקדימות.
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  // גרירה לשינוי סדר ברצועה: אינדקס הנגרר ואינדקס יעד ההשלכה (להדגשה ויזואלית).
  const [dragIndex, setDragIndex] = useState(-1);
  const [dragOverIndex, setDragOverIndex] = useState(-1);
  // לחיצה כפולה על התצוגה הגדולה → מיקוד בשדה הכותרת בפאנל התכונות + הבהוב.
  const inspectorFieldRef = useRef(null);
  const inspectorFlashTimerRef = useRef(null);
  const [inspectorFlash, setInspectorFlash] = useState(false);
  // חלונית העוזר (AiSidebar) בתוך העורך — ר' "גשר עריכה לעוזר" בהמשך.
  const [assistantOpen, setAssistantOpen] = useState(false);
  // ⚠️ ב-AiSidebar החלת עריכה (onApplyEdit) רצה רק במצב מחבר 'edit'; ב-'chat'
  // התשובה נשארת בצ'אט. פתיחה מהסטודיו נכנסת ישר למצב עריכה דרך launchPreset,
  // אחרת "ערוך לי את השקופית" היה נראה כאילו לא קרה כלום.
  const [assistantPreset, setAssistantPreset] = useState({ nonce: 0, classicAgentId: '', composerMode: '', prompt: '' });
  const toggleAssistant = () => setAssistantOpen((open) => {
    if (!open) setAssistantPreset({ nonce: Date.now(), classicAgentId: '', composerMode: 'edit', prompt: '' });
    return !open;
  });

  // ── היסטוריית ביטול/ביצוע-שוב ברמת ה-deck (Ctrl+Z / Ctrl+Shift+Z) ──
  const historyRef = useRef({ past: [], future: [] });
  const titleSnapshotRef = useRef(null);
  // דוחף מצב-דק קודם להיסטוריה בלי לשנות את הדק הנוכחי (לעריכות רציפות כמו הקלדת שם).
  const pushHistorySnapshot = (snapshot) => {
    if (!snapshot) return;
    historyRef.current.past.push(snapshot);
    if (historyRef.current.past.length > 50) historyRef.current.past.shift();
    historyRef.current.future = [];
    bumpHistory((n) => n + 1);
  };
  const [, bumpHistory] = useState(0);

  // ⚠️ המדיה האוטומטית של דק חדש כבר לא רצה כאן. היא הועברה לשלב ה"עסוק" של
  // היצירה (main.jsx → runDeckAutoMedia), כדי שדק לא ייכנס לעורך חצי-מוכן.
  // הכפתור הידני "מלא תמונות חסרות" נשאר.
  // הדק שכבר נשמר (לפי זהות אובייקט) — מונע שמירה מיותרת בפתיחה מהרשימה
  // וברינדורים שלא שינו את הדק.
  const savedDeckRef = useRef(null);

  // ── מדיה ב-AI (תמונה/אינפוגרפיקה/רקע/מילוי אצווה/ערכה) ──────────
  const [imageStyle, setImageStyle] = useState('photo');
  const [mediaBusy, setMediaBusy] = useState('');      // מזהה הפעולה הרצה כרגע
  const [mediaError, setMediaError] = useState('');
  const [mediaProgress, setMediaProgress] = useState('');
  const [mediaResult, setMediaResult] = useState('');
  const [themePrompt, setThemePrompt] = useState('');
  const [themeBusy, setThemeBusy] = useState(false);
  const [themeError, setThemeError] = useState('');

  // ערכה פעילה: ערכת AI מותאמת גוברת על themeId המובנה.
  const activeTheme = deck?.customTheme?.colors ? deck.customTheme : getThemeById(deck?.themeId);

  const slides = deck?.slides || [];
  const selectedIndex = useMemo(() => slides.findIndex((s) => s.id === selectedId), [slides, selectedId]);
  const selected = selectedIndex >= 0 ? slides[selectedIndex] : slides[0];
  const selectedThumbRef = useRef(null);
  // ה-id של השקופית שבאמת נבחרה (selectedId עשוי להצביע על שקופית שנמחקה,
  // ואז selected נופל ל-slides[0]). העוזר קורא מכאן ולא מה-state.
  const selectedIdRef = useRef('');
  selectedIdRef.current = selected?.id || '';

  // הדק העדכני ביותר דרך ref — פעולה אסינכרונית ארוכה (מדיה) סוגרת על ה-prop
  // שהיה בתחילתה, וקומיט מתוכה היה מוחק עריכות שנעשו בינתיים.
  const deckRef = useRef(deck);
  deckRef.current = deck;

  // כל שינוי deck עובר כאן — דוחף את המצב הקודם להיסטוריה ומאפס את ה-redo.
  // מקבל דק מוכן או פונקציית עדכון (prev) => next שנפתרת מול המצב העדכני.
  const commitDeck = (nextDeck) => {
    const prev = deckRef.current;
    const resolved = typeof nextDeck === 'function' ? nextDeck(prev) : nextDeck;
    if (!resolved) return;
    const h = historyRef.current;
    if (prev) {
      h.past.push(prev);
      if (h.past.length > 50) h.past.shift();
    }
    h.future = [];
    bumpHistory((v) => v + 1);
    deckRef.current = resolved;
    onDeckChange(resolved);
  };
  const undo = () => {
    const h = historyRef.current;
    if (!h.past.length) return;
    const prev = h.past.pop();
    if (deckRef.current) h.future.push(deckRef.current);
    bumpHistory((v) => v + 1);
    deckRef.current = prev;
    onDeckChange(prev);
  };
  const redo = () => {
    const h = historyRef.current;
    if (!h.future.length) return;
    const next = h.future.pop();
    if (deckRef.current) h.past.push(deckRef.current);
    bumpHistory((v) => v + 1);
    deckRef.current = next;
    onDeckChange(next);
  };
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  // ── פעולות שקופית ────────────────────────────────────────────────
  // ⚠️ מוגדרות כאן, לפני ה-effects והיציאות המוקדמות (list/brief), כדי שגם
  // ה-effect של המקלדת יוכל לקרוא להן. הגדרה אחרי היציאה המוקדמת הייתה משאירה
  // אותן לא-מאותחלות במסכים האחרים ומפילה את ה-handler ב-TDZ.
  const handleRemove = () => {
    if (!deck || !selected || slides.length <= 1) return;
    const idx = selectedIndex;
    const next = removeSlide(deck, selected.id);
    commitDeck(next);
    setSelectedId(next.slides[Math.max(0, idx - 1)]?.id || '');
    showToast?.('השקופית נמחקה — Ctrl+Z לביטול');
  };
  const handleMove = (dir) => {
    if (!deck || !selected) return;
    commitDeck(moveSlide(deck, selected.id, dir));
  };
  // שינוי סדר חופשי (גרירה ברצועה). moveSlide מזיז צעד אחד בלבד, ולכן כאן
  // בונים את מערך השקופיות מחדש עם splice ומקמטים בקומיט אחד.
  const handleReorderSlides = (from, to) => {
    const current = deckRef.current;
    const list = [...(current?.slides || [])];
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    commitDeck({ ...current, slides: list });
    setSelectedId(moved.id);
  };
  const handleAddSlideOfLayout = (layout = 'title-bullets') => {
    const current = deckRef.current;
    if (!current) return;
    const slide = createSlide({ layout, title: 'שקופית חדשה' });
    commitDeck(addSlideAfter(current, selectedIdRef.current, slide));
    setSelectedId(slide.id);
  };
  const handleDuplicateSlide = () => {
    const current = deckRef.current;
    const source = (current?.slides || []).find((s) => s.id === selectedIdRef.current);
    if (!current || !source) return;
    const copy = createSlide(cloneSlideContent(source));
    commitDeck(addSlideAfter(current, source.id, copy));
    setSelectedId(copy.id);
    showToast?.('השקופית שוכפלה ✓', { tone: 'success' });
  };

  // ניקוי טיימר ההבהוב של פאנל התכונות ביציאה.
  useEffect(() => () => clearTimeout(inspectorFlashTimerRef.current), []);
  // סגירת תפריט ההוספה ב-Escape.
  useEffect(() => {
    if (!addMenuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setAddMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [addMenuOpen]);
  // ⚠️ עריכה במקום (contenteditable) על התצוגה הגדולה לא מומשה בכוונה: ה-SlideStage
  // מרונדר ב-1280×720 ומוקטן ב-transform: scale, והטקסט מפוזר בין 15 פריסות שכל
  // אחת מרנדרת את הכותרת אחרת. שכבת שדות שקופה מעל במה מוקטנת שבירה מדי.
  // במקום זה: לחיצה כפולה על התצוגה = מיקוד בשדה הראשי בפאנל התכונות + הבהוב.
  const focusInspectorField = () => {
    const el = inspectorFieldRef.current;
    if (el) { el.focus(); el.select?.(); }
    setInspectorFlash(true);
    clearTimeout(inspectorFlashTimerRef.current);
    inspectorFlashTimerRef.current = setTimeout(() => setInspectorFlash(false), 1200);
  };

  // ── גשר עריכה לעוזר ה-AI ─────────────────────────────────────────
  // הגשר נבנה פעם אחת (זהות יציבה, כי הוא נשלח כ-prop ל-AiSidebar) וקורא את
  // הדק/הקומיט/הטוסט דרך refs — תשובה שמגיעה אחרי אסינכרון ארוך חייבת להיפגש
  // עם המצב העדכני ולא עם זה שנתפס בזמן הרינדור שבו נוצר הגשר.
  const commitDeckRef = useRef(null);
  const showToastRef = useRef(showToast);
  commitDeckRef.current = commitDeck;
  showToastRef.current = showToast;
  const deckBridge = useMemo(() => createDeckEditBridge({
    getDeck: () => deckRef.current,
    commitDeck: (next) => commitDeckRef.current?.(next),
    showToast: (...args) => showToastRef.current?.(...args),
  }), []);
  // "שפר את שקופיות 2 ו-5" → שני יעדי עריכה, ומשם מסלול ה-batch של AiSidebar
  // (onApplyEditBatch). קורא דרך ה-ref, כי הבקשה מנוסחת ברגע השליחה.
  const resolveDeckEditTargetsFromPrompt = useCallback(
    (promptText = '') => resolveDeckSlideReferences(promptText, deckRef.current?.slides || []),
    [],
  );

  // הפניות/הגדרות העוזר נקראות פעם אחת לכניסה לעורך (זהה ל-AddinApp).
  const assistantWordPreferences = useMemo(() => getWordPreferences(), []);
  const assistantBehavior = useMemo(() => getAssistantBehavior(), []);

  // דגלי המדיה נוסעים ב-payload עצמו ומטופלים בשלב היצירה (main.jsx).
  const handleCreateSubmit = (payload) => onGenerate(payload);

  // מסך פתיחה שנכפה מבחוץ (כניסה מהטאב) — נצרך פעם אחת ומדווח לאב שיאפס אותו.
  useEffect(() => {
    if (!initialView) return;
    setView(initialView);
    onViewConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialView]);

  // שער השלמות המדיה חי במסך ה-brief בלבד. משתמש שחזר לרשימה בזמן היצירה היה
  // נשאר בלי שום סימן שהריצה נעצרה וממתינה להחלטה — לכן כישלון מדיה מושך את
  // התצוגה חזרה לטופס. (התלות היא באובייקט עצמו: חזרה ידנית לרשימה אחריו לא
  // מריצה את ה-effect שוב, ולכן היא לא "נחטפת".)
  useEffect(() => {
    if (mediaFailure) setView('brief');
  }, [mediaFailure]);

  // דק חדש (id אחר) — היסטוריית הביטול והבחירה של הדק הקודם כבר לא רלוונטיות,
  // והתצוגה עוברת לעורך. בלי זה Ctrl+Z היה מחזיר את המצגת הקודמת.
  const prevDeckIdRef = useRef(deck?.id || '');
  useEffect(() => {
    const id = deck?.id || '';
    if (id === prevDeckIdRef.current) return;
    prevDeckIdRef.current = id;
    historyRef.current = { past: [], future: [] };
    bumpHistory((v) => v + 1);
    setSelectedId(deck?.slides?.[0]?.id || '');
    if (id) setView('editor');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck?.id]);

  // חזרה: עורך → רשימה · טופס → רשימה · רשימה → יציאה מהסטודיו.
  const handleBack = () => {
    if (view === 'list') { onExit(); return; }
    setView('list');
  };

  // ניווט שקופיות בחיצים (כל עוד לא מקלידים בשדה). RTL: ימינה=הקודם, שמאלה=הבא.
  // בנוסף: Ctrl+Z/Y ביטול · Ctrl+D שכפול · Alt+חיצים הזזה · Delete מחיקה.
  useEffect(() => {
    if (!deck || view !== 'editor') return undefined;
    const onKey = (e) => {
      if (presenting || pickerOpen || exportOpen || themePanelOpen || addMenuOpen) return;
      const t = e.target;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      // ביטול / ביצוע-שוב / שכפול
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const key = String(e.key || '').toLowerCase();
        if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo(); return; }
        // preventDefault חובה — אחרת Ctrl+D פותח "הוסף סימנייה" בדפדפן.
        if (key === 'd' && !e.shiftKey) { e.preventDefault(); handleDuplicateSlide(); return; }
      }
      // Alt+חיצים = הזזת השקופית הנבחרת (ולא ניווט)
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        handleMove(e.key === 'ArrowUp' ? 'up' : 'down');
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Delete') { e.preventDefault(); handleRemove(); return; }
      const list = deck.slides || [];
      const idx = list.findIndex((s) => s.id === selectedId);
      let next = null;
      if (['ArrowDown', 'PageDown', 'ArrowLeft'].includes(e.key)) next = Math.min(list.length - 1, idx + 1);
      else if (['ArrowUp', 'PageUp', 'ArrowRight'].includes(e.key)) next = Math.max(0, idx - 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = list.length - 1;
      if (next != null && next !== idx && list[next]) { e.preventDefault(); setSelectedId(list[next].id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck, view, presenting, pickerOpen, exportOpen, themePanelOpen, addMenuOpen, selectedId]);

  // סגירת פאנל ה-theme בלחיצה מחוץ לו או ב-Escape
  useEffect(() => {
    if (!themePanelOpen) return undefined;
    const onDown = (e) => {
      if (themePanelRef.current && !themePanelRef.current.contains(e.target)) setThemePanelOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setThemePanelOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [themePanelOpen]);

  // החזקת השקופית הנבחרת בתוך התצוגה בעת ניווט
  useEffect(() => {
    selectedThumbRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  // ── שמירה אוטומטית (debounce 1200ms) ─────────────────────────────
  // מקור האמת נשאר ה-prop deck; כאן רק מקרינים אותו ל-deckStore. השוואת זהות
  // מול savedDeckRef חוסכת שמירה מיותרת (למשל מיד אחרי פתיחה מהרשימה).
  useEffect(() => {
    if (!deck?.id) return undefined;
    if (savedDeckRef.current === deck) return undefined;
    const timer = setTimeout(() => {
      const snapshot = deck;
      savedDeckRef.current = snapshot;
      // allowRevive:false — מחיקה של המצגת הפתוחה ושמירה אוטומטית שכבר הייתה
      // בהמתנה רצו במרוץ, והשמירה החזירה את המצגת המחוקה לרשימה.
      saveDeck(snapshot, { allowRevive: false }).catch((e) => {
        // כישלון מכסה חייב להגיע למשתמש — אחרת "נשמר" ונעלם בשקט.
        savedDeckRef.current = null;
        showToast?.(e?.message || 'שמירת המצגת נכשלה', { tone: 'warning' });
      });
    }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck]);

  // ── בחירת מסך לפי view (לא לפי !deck) ───────────────────────────
  // 'editor' בלי deck בזיכרון נופל חזרה לטופס היצירה.
  const resolvedView = (view === 'editor' && !deck) ? 'brief' : view;

  const studioHeader = (
    <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
      <span className="text-sm font-bold text-slate-300">📊 סטודיו מצגות</span>
      <div className="flex items-center gap-2">
        {onOpenHelp && <button onClick={() => onOpenHelp('studios')} title="מדריך הסטודיו" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">❓ מדריך</button>}
        <button onClick={handleBack} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">חזרה</button>
      </div>
    </div>
  );

  // רשימת המצגות השמורות.
  if (resolvedView === 'list') {
    return (
      <div className="flex min-h-full flex-1 overflow-auto bg-slate-950">
        <div className="flex w-full flex-col">
          {studioHeader}
          {/* ריצה פעילה חייבת להיות גלויה גם כאן — אחרת "יצירת מצגת" נראית תקועה. */}
          {busy && (
            <div className="flex items-center gap-3 border-b border-cyan-500/25 bg-cyan-500/10 px-6 py-2">
              <div className="h-3.5 w-3.5 flex-none animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400" />
              <span className="flex-none text-xs font-bold text-cyan-200">יוצר מצגת…</span>
              {busyLabel && <span className="truncate text-[11px] text-slate-400">{busyLabel}</span>}
            </div>
          )}
          {deck && (
            <div className="border-b border-slate-800 bg-slate-900/40 px-6 py-2.5">
              <button
                type="button"
                onClick={() => setView('editor')}
                className="text-xs font-bold text-cyan-300 transition hover:text-cyan-200"
              >✏️ חזרה למצגת הפתוחה{deck.title ? ` — ${deck.title}` : ''}</button>
            </div>
          )}
          <DeckListScreen
            openDeckId={deck?.id || ''}
            onOpenDeck={(loaded) => {
              // כבר "שמור" — מסמנים כדי שהשמירה האוטומטית לא תדרוס updatedAt
              // ותקפיץ את המצגת לראש הרשימה רק בגלל פתיחה.
              savedDeckRef.current = loaded;
              deckRef.current = loaded;
              onDeckChange(loaded);
              // ה-effect של deck?.id מטפל רק במעבר בין מזהים, ולכן פתיחה מחדש
              // של אותה מצגת (id זהה) הייתה משאירה היסטוריית ביטול של הגרסה
              // שלפני הטעינה — Ctrl+Z היה מחזיר תוכן שכבר לא קיים בקובץ.
              // כאן מאפסים תמיד, בלי תלות ב-effect.
              historyRef.current = { past: [], future: [] };
              bumpHistory((v) => v + 1);
              setSelectedId(loaded?.slides?.[0]?.id || '');
              setView('editor');
            }}
            onDeckDeleted={(id) => {
              if (!deck || deck.id !== id) return;
              savedDeckRef.current = null;
              deckRef.current = null;
              historyRef.current = { past: [], future: [] };
              onDeckChange(null);
            }}
            onDeckRenamed={(id, title) => {
              const current = deckRef.current;
              if (!current || current.id !== id) return;
              // לא commitDeck: שינוי שם מהרשימה אינו צעד עריכה בהיסטוריית הביטול.
              // renameDeck כבר כתב לאחסון, ולכן מסמנים את הדק כ"שמור" כדי שלא
              // תיווצר שמירה אוטומטית מיותרת שרק תקפיץ updatedAt.
              const next = { ...current, title };
              deckRef.current = next;
              savedDeckRef.current = next;
              onDeckChange(next);
            }}
            onNewDeck={() => setView('brief')}
            showToast={showToast}
          />
        </div>
      </div>
    );
  }

  // טופס יצירה — נשאר מורכב גם בזמן היצירה (הנושא שהוקלד שורד כישלון), עם scrim.
  if (resolvedView === 'brief') {
    return (
      <div className="flex min-h-full flex-1 overflow-auto bg-slate-950">
        <div className="flex w-full flex-col">
          {studioHeader}
          <div className="relative flex flex-1 flex-col">
            <CreateForm onGenerate={handleCreateSubmit} onUploadPptx={onUploadPptx} onImportPptxAsDeck={onImportPptxAsDeck} busy={busy} hasDocument={hasDocument} documentTitle={documentTitle} seed={briefSeed} onSeedConsumed={onBriefSeedConsumed} />
            {busy && (
              <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center gap-4 bg-slate-950/70 pt-[18vh] text-slate-200 backdrop-blur-[2px]">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400" />
                <div className="text-sm font-semibold">בונה את המצגת...</div>
                {busyLabel && <div className="max-w-md px-6 text-center text-xs leading-6 text-cyan-200">{busyLabel}</div>}
              </div>
            )}
            {/* ── שער השלמות: תמונות שנכשלו ⇒ הדק לא נכנס לעורך עד החלטת המשתמש ── */}
            {!busy && mediaFailure && (
              <div className="absolute inset-0 z-20 flex flex-col items-center bg-slate-950/85 pt-[16vh] backdrop-blur-[2px]">
                <div className="mx-6 max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 p-5 text-right">
                  <div className="text-base font-black text-rose-300">יצירת {mediaFailure.missing} תמונות נכשלה</div>
                  <div className="mt-2 text-xs leading-6 text-slate-400">
                    המצגת עצמה מוכנה. אפשר לנסות שוב ליצור רק את התמונות החסרות, או לפתוח את המצגת בלעדיהן —
                    השקופיות האלה יופיעו עם בלוק ריק במקום התמונה.
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onRetryMedia?.()}
                      className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:from-cyan-400"
                    >נסה שוב</button>
                    <button
                      type="button"
                      onClick={() => onOpenAnyway?.()}
                      className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
                    >פתח בלי התמונות</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // פונקציונלי בכוונה: פעולות המדיה קוראות ל-patchSlide אחרי await ארוך, ואז
  // deck/selected שנתפסו ברינדור כבר מיושנים — קומיט מתוכם היה מוחק עריכות
  // שנעשו בינתיים. commitDeck פותר את הפונקציה מול deckRef העדכני.
  const patchSlide = (patch) => commitDeck((prev) => (prev ? updateSlide(prev, selectedIdRef.current, patch) : prev));

  // יעד העריכה שהעוזר רואה — השקופית הנבחרת במלואה. מחושב פעם אחת לרנדר.
  const assistantTargetState = assistantOpen ? buildDeckEditTargetState(deck, selected?.id) : null;

  // ── פעולות מדיה ב-AI ─────────────────────────────────────────────
  const pendingImageCount = slides.filter((s) => s?.image?.pending && (s.image.query || s.image.alt)).length;

  // עוטף כל פעולת מדיה: נעילה, ניקוי שגיאה, החלת התוצאה, שחרור.
  const runMedia = async (actionId, work) => {
    if (mediaBusy) return;
    setMediaBusy(actionId);
    setMediaError('');
    setMediaResult('');
    setMediaProgress('');
    try {
      await work();
    } catch (e) {
      setMediaError(e?.message || 'הפעולה נכשלה');
    } finally {
      setMediaBusy('');
      setMediaProgress('');
    }
  };

  // פריסות כמו stat/steps/quote לא מציגות תמונה כלל — ויזואל שנוצר עבורן היה
  // נשמר במודל ונעלם מהמסך. מחליפים פריסה כדי שהתוצאה תיראה; שדות התוכן
  // (stats/steps) נשארים במודל, ולכן חזרה לפריסה הקודמת משחזרת אותם.
  const withVisibleImageLayout = (image, preferred) => {
    if (layoutHasImage(selected?.layout)) return { image };
    setMediaResult(`הפריסה "${getLayout(selected?.layout)?.label || selected?.layout}" לא מציגה תמונה — הוחלפה ל"${getLayout(preferred)?.label || preferred}".`);
    return { image, layout: preferred };
  };

  // ── הוספת מדיה שנוצרה בעוזר ה-AI לשקופית הנבחרת ─────────────────
  // ⚠️ ה-id נתפס בזמן הלחיצה: הדחיסה היא await ארוך, והמשתמש עלול לבחור
  // שקופית אחרת בינתיים — קומיט לפי selectedIdRef העדכני היה נוחת על הלא-נכונה.
  const handleInsertGeneratedMedia = async (payload) => {
    const slideId = selectedIdRef.current;
    const dataUrl = String(payload?.dataUrl || '');
    if (!slideId || !dataUrl) { showToast?.('לא נמצאה מדיה להוספה', { tone: 'warning' }); return; }
    // פריסה בלי חריץ תמונה (stat/steps/quote) לא תציג את המדיה — מחליפים.
    // ⚠️ לסרטון הרשימה צרה יותר: cover/closing מרנדרים את התמונה ישירות ולא
    // דרך ImageBox, ולכן סרטון שם היה נשמר במודל ונעלם מהמסך.
    const VIDEO_LAYOUTS = ['image-right', 'image-left', 'image-full'];
    const layoutPatchFor = (slide, kind) => {
      const ok = kind === 'video' ? VIDEO_LAYOUTS.includes(slide?.layout) : layoutHasImage(slide?.layout);
      return ok ? {} : { layout: 'image-right' };
    };
    try {
      if (payload.type === 'video') {
        if (dataUrl.length > MAX_VIDEO_DATA_URL_CHARS) {
          showToast?.('הסרטון כבד מדי לשמירה במצגת', { tone: 'error' });
          return;
        }
        commitDeck((prev) => (prev ? updateSlide(prev, slideId, (slide) => ({
          ...slide,
          ...layoutPatchFor(slide, 'video'),
          video: { dataUrl, mime: payload.mime || 'video/mp4', prompt: payload.prompt || '', model: payload.model || '' },
        })) : prev));
        showToast?.('הסרטון נוסף לשקופית ✓', { tone: 'success' });
        return;
      }
      const compressed = await compressImageDataUrl(dataUrl);
      const image = {
        source: 'ai',
        dataUrl: compressed,
        url: '',
        query: payload.prompt || '',
        alt: payload.prompt || '',
        attribution: 'נוצר ב-AI',
        model: payload.model || '',
        provider: payload.provider || '',
        prompt: payload.prompt || '',
        pending: false,
      };
      commitDeck((prev) => (prev ? updateSlide(prev, slideId, (slide) => ({
        ...slide,
        ...layoutPatchFor(slide, 'image'),
        image,
      })) : prev));
      showToast?.('התמונה נוספה לשקופית ✓', { tone: 'success' });
    } catch (e) {
      showToast?.(e?.message || 'הוספת המדיה נכשלה', { tone: 'error' });
    }
  };

  const handleGenerateImage = () => runMedia('image', async () => {
    const image = await generateSlideImage(selected, activeTheme, { style: imageStyle, deck });
    patchSlide(withVisibleImageLayout(image, 'image-right'));
  });

  // אינפוגרפיקה בשני מסלולים, שניהם עם עברית אמיתית:
  //   1. יש סדרת מספרים ⇒ גרף QuickChart מדויק (חינם, התוויות מרונדרות מטקסט אמיתי).
  //   2. אחרת ⇒ המרה לפריסה מובנית מקורית (שלבים/ציר זמן/השוואה/מספרים).
  // ⚠️ בכוונה *לא* דיאגרמה ממודל תמונות: נמדד שהוא משבש עברית בתוך התמונה
  // (אותיות שנראות עבריות אך חסרות פשר), ומצגת עם ג'יבריש היא כשל מוצר.
  const handleGenerateInfographic = () => runMedia('infographic', async () => {
    try {
      const image = await generateSlideInfographic(selected, activeTheme, {});
      patchSlide(withVisibleImageLayout(image, 'image-full'));
      return;
    } catch {
      // אין נתונים מספריים לגרף — ממשיכים למבנה ויזואלי מקורי.
    }
    const patch = await restructureSlideAsInfographic(selected, {});
    patchSlide(patch);
    setMediaResult('התוכן הומר למבנה ויזואלי עם טקסט אמיתי (ניתן לעריכה).');
  });

  const handleGenerateBackground = () => runMedia('bg', async () => {
    const bgImage = await generateSlideBackground(selected, activeTheme, {});
    patchSlide({ bgImage });
  });

  const handleFillMissingImages = () => runMedia('batch', async () => {
    const res = await generateMissingDeckImages(deck, activeTheme, {
      style: imageStyle,
      onProgress: ({ index, total }) => setMediaProgress(`יוצר תמונה ${index} מתוך ${total}…`),
    });
    // מחילים את כל התוצאות בקומיט אחד על המצב העדכני (לא על ה-deck שנתפס בהתחלה).
    const patches = {};
    (res.slides || []).forEach((r) => { patches[r.slideId] = { image: r.image }; });
    if (res.slides?.length) {
      commitDeck((prev) => (prev ? {
        ...prev,
        slides: (prev.slides || []).map((s) => (patches[s.id] ? { ...s, ...patches[s.id] } : s)),
      } : prev));
    }
    const failCount = res.failures?.length || 0;
    setMediaResult(`נוצרו ${res.slides?.length || 0} תמונות${failCount ? ` · ${failCount} נכשלו` : ''}`);
  });

  const handleGenerateTheme = async () => {
    if (themeBusy || !themePrompt.trim()) return;
    setThemeBusy(true);
    setThemeError('');
    try {
      const t = await generateDeckTheme(themePrompt.trim());
      commitDeck((prev) => (prev ? { ...prev, customTheme: t } : prev));
      setThemePrompt('');
      setThemePanelOpen(false);
    } catch (e) {
      setThemeError(e?.message || 'יצירת הערכה נכשלה');
    } finally {
      setThemeBusy(false);
    }
  };

  // "הוסף למסמך" מהעוזר = שקופית חדשה אחרי הנבחרת. שורה ראשונה כותרת, השאר
  // נקודות. stats/steps שהמודל ניסח בתווית מקופלים לטקסט נקודה כדי שלא ייעלמו.
  const handleAssistantInsert = (text) => {
    const current = deckRef.current;
    if (!current) return;
    const parsed = parseSlideContent(text);
    const bullets = [...parsed.bullets, ...parsed.plain];
    parsed.stats.forEach((s) => bullets.push(`${s.value}${s.label ? ` — ${s.label}` : ''}`));
    parsed.steps.forEach((s) => bullets.push(`${s.title}${s.body ? `: ${s.body}` : ''}`));
    parsed.columns.forEach((c) => { if (c.heading) bullets.push(c.heading); bullets.push(...c.bullets); });
    if (!parsed.title && !bullets.length) {
      showToast?.('לא זוהה תוכן להוספה כשקופית', { tone: 'warning' });
      return;
    }
    const newSlide = createSlide({
      layout: 'title-bullets',
      title: parsed.title || 'שקופית חדשה',
      subtitle: parsed.subtitle || '',
      kicker: parsed.kicker || '',
      notes: parsed.notes || '',
      bullets: bullets.filter(Boolean).slice(0, 8),
    });
    commitDeck(addSlideAfter(current, selectedIdRef.current, newSlide));
    setSelectedId(newSlide.id);
    showToast?.('נוספה שקופית חדשה מהעוזר ✓', { tone: 'success' });
  };

  const handleExport = async (profile = 'auto') => {
    setExportOpen(false);
    setExporting(true);
    try {
      const { base64, warnings } = await buildPptxBase64(deck, { profile });
      if (window.desktopApp?.saveDocumentDialog) {
        const res = await window.desktopApp.saveDocumentDialog({ title: deck.title || 'presentation', preferredExtension: 'pptx', base64 });
        if (res?.ok) {
          showToast('המצגת נשמרה כ-PPTX ✓', { tone: 'success' });
          if (warnings?.length) showToast(warnings.join(' · '), { tone: 'warning' });
        } else if (!res?.canceled) showToast(res?.error || 'שמירה נכשלה', { tone: 'error' });
      } else {
        // דפדפן: הורדה ישירה. מפענחים base64→Blob ישירות (fetch על data-URL
        // ענק נכשל ב"Failed to fetch" כשהמצגת כבדה עם תמונות מוטמעות).
        const byteChars = atob(base64);
        const bytes = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i += 1) bytes[i] = byteChars.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${deck.title || 'presentation'}.pptx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        showToast('המצגת ירדה ✓', { tone: 'success' });
        if (warnings?.length) showToast(warnings.join(' · '), { tone: 'warning' });
      }
    } catch (e) {
      showToast(e?.message || 'ייצוא נכשל', { tone: 'error' });
    } finally { setExporting(false); }
  };

  return (
    <div className="flex min-h-full flex-1 flex-col overflow-hidden bg-slate-950" dir="rtl">
      {/* סרגל עליון */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-2">
        {/* שם המצגת: עריכה שוטפת בלי היסטוריה, ורשומת undo אחת בעזיבת השדה —
            אחרת כל תו הופך לצעד undo נפרד. */}
        <input
          value={deck.title}
          onFocus={() => { titleSnapshotRef.current = deck; }}
          onChange={(e) => onDeckChange({ ...deck, title: e.target.value })}
          onBlur={() => {
            const before = titleSnapshotRef.current;
            titleSnapshotRef.current = null;
            if (before && before.title !== deck.title) pushHistorySnapshot(before);
          }}
          className="rounded-lg bg-transparent px-2 py-1 text-sm font-bold text-white outline-none focus:bg-slate-800"
        />
        <div className="relative" ref={themePanelRef}>
          <button
            type="button"
            onClick={() => setThemePanelOpen((v) => !v)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-400"
          >🎨 {activeTheme.label} ▾</button>
          {themePanelOpen && (
            <div className="absolute right-0 z-50 mt-1 max-h-[70vh] w-[380px] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-3 shadow-2xl">
              {/* יצירת ערכה ב-AI מתיאור חופשי */}
              <div className="mb-3 rounded-2xl border border-cyan-500/25 bg-cyan-500/5 p-3">
                <div className="text-xs font-bold text-cyan-300">ערכה משלך ב-AI</div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={themePrompt}
                    onChange={(e) => setThemePrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleGenerateTheme(); }}
                    placeholder={'תאר סגנון: "מינימלי כחול עם טיפוגרפיה חדה"'}
                    disabled={themeBusy}
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateTheme}
                    disabled={themeBusy || !themePrompt.trim()}
                    className="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-40"
                  >{themeBusy ? 'יוצר ערכה…' : '✨ צור ערכה'}</button>
                </div>
                {themeError && <div className="mt-1.5 text-[11px] leading-5 text-rose-400">{themeError}</div>}
                {deck.customTheme && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2.5 py-1 text-[11px] font-semibold text-cyan-300">
                      ✨ {deck.customTheme.label || 'ערכה שנוצרה ב-AI'}
                    </span>
                    <button
                      type="button"
                      onClick={() => commitDeck({ ...deck, customTheme: null })}
                      className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-cyan-400 hover:text-cyan-300"
                    >↺ חזור לערכה רגילה</button>
                  </div>
                )}
              </div>
              <ThemeFamilyPicker
                value={deck.themeId}
                onSelect={(id) => { commitDeck({ ...deck, themeId: id, customTheme: null }); setThemePanelOpen(false); }}
                small
              />
            </div>
          )}
        </div>
        {pendingImageCount > 0 && (
          <button
            type="button"
            onClick={handleFillMissingImages}
            disabled={Boolean(mediaBusy)}
            title={`${pendingImageCount} שקופיות ממתינות לתמונה`}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-400 disabled:opacity-50"
          >{mediaBusy === 'batch' ? (mediaProgress || 'יוצר תמונות…') : `🖼️ מלא תמונות חסרות (${pendingImageCount})`}</button>
        )}
        {mediaResult && <span className="text-[11px] font-semibold text-emerald-400">{mediaResult}</span>}
        <div className="flex-1" />
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          title="בטל (Ctrl+Z)"
          aria-label="בטל"
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-30"
        >↶</button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          title="בצע שוב (Ctrl+Shift+Z)"
          aria-label="בצע שוב"
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-30"
        >↷</button>
        <button
          type="button"
          onClick={toggleAssistant}
          title="עוזר AI — עריכת השקופית הנבחרת בשיחה"
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${assistantOpen ? 'border-cyan-400 bg-cyan-500/15 text-cyan-200' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
        >🤖 עוזר AI</button>
        <button onClick={() => { onGenerate(null); setView('brief'); }} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">מצגת חדשה</button>
        <button onClick={() => setPresenting(true)} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-600">▶ הצג</button>
        <div className="relative">
          <button onClick={() => setExportOpen((v) => !v)} disabled={exporting} className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{exporting ? 'מייצא...' : '⬇ ייצוא PPTX ▾'}</button>
          {exportOpen && !exporting && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
              <div className="absolute left-0 z-50 mt-1 w-64 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl">
                <button onClick={() => handleExport('auto')} className="w-full rounded-lg px-3 py-2 text-right text-xs hover:bg-slate-800">
                  <div className="font-bold text-white">מומלץ (מעורב)</div>
                  <div className="mt-0.5 text-[11px] leading-4 text-slate-400">שקפי עיצוב כתמונה, שקפי טקסט עריכים — לפי ההגדרה של כל שקף.</div>
                </button>
                <button onClick={() => handleExport('editable')} className="w-full rounded-lg px-3 py-2 text-right text-xs hover:bg-slate-800">
                  <div className="font-bold text-white">עריך (הכל)</div>
                  <div className="mt-0.5 text-[11px] leading-4 text-slate-400">כל השקפים טקסט/צורות עריכים ב-PowerPoint. עיצוב פשוט יותר.</div>
                </button>
                <button onClick={() => handleExport('faithful')} className="w-full rounded-lg px-3 py-2 text-right text-xs hover:bg-slate-800">
                  <div className="font-bold text-white">נאמן-עיצוב (הכל)</div>
                  <div className="mt-0.5 text-[11px] leading-4 text-slate-400">כל השקפים כתמונה — נראים בדיוק כמו בעורך. לא ניתן לערוך טקסט.</div>
                </button>
              </div>
            </>
          )}
        </div>
        {onOpenHelp && <button onClick={() => onOpenHelp('studios')} title="מדריך הסטודיו" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">❓</button>}
        <button onClick={handleBack} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">חזרה</button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ניווט שקופיות — גרירה משנה סדר; הכפתור התחתון יושב מחוץ לאזור הגלילה
            כדי שהתפריט הנפתח שלו לא ייחתך על ידי overflow-auto. */}
        <div className="flex w-52 flex-none flex-col border-l border-slate-800 bg-slate-900/50">
          <div className="flex flex-1 flex-col gap-2 overflow-auto p-3">
            {slides.map((s, i) => {
              const isDragging = dragIndex === i;
              const isDropTarget = dragOverIndex === i && dragIndex >= 0 && dragIndex !== i;
              return (
                <button
                  key={s.id}
                  ref={s.id === selected.id ? selectedThumbRef : null}
                  onClick={() => setSelectedId(s.id)}
                  draggable
                  title="גרור לשינוי סדר"
                  onDragStart={(e) => {
                    setDragIndex(i);
                    if (e.dataTransfer) {
                      e.dataTransfer.effectAllowed = 'move';
                      try { e.dataTransfer.setData('text/plain', String(i)); } catch { /* דפדפנים ישנים */ }
                    }
                  }}
                  onDragEnd={() => { setDragIndex(-1); setDragOverIndex(-1); }}
                  onDragOver={(e) => {
                    if (dragIndex < 0) return;
                    e.preventDefault();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                    if (dragOverIndex !== i) setDragOverIndex(i);
                  }}
                  onDragLeave={() => { if (dragOverIndex === i) setDragOverIndex(-1); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const raw = Number(e.dataTransfer?.getData('text/plain'));
                    const from = dragIndex >= 0 ? dragIndex : (Number.isFinite(raw) ? raw : -1);
                    setDragIndex(-1);
                    setDragOverIndex(-1);
                    handleReorderSlides(from, i);
                  }}
                  className={`relative cursor-grab rounded-lg border-2 text-right transition active:cursor-grabbing ${s.id === selected.id ? 'border-cyan-400' : 'border-transparent hover:border-slate-700'} ${isDragging ? 'opacity-40' : ''} ${isDropTarget ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-900' : ''}`}
                >
                  <span className="absolute right-1 top-1 z-10 rounded bg-slate-950/70 px-1.5 text-[10px] text-slate-300">{i + 1}</span>
                  <SlideFrame slide={s} themeId={deck.themeId} customTheme={deck.customTheme} index={i} shadow={false} deckTitle={deck.title} deckId={deck.id} />
                </button>
              );
            })}
          </div>

          {/* הוספת שקופית לפי פריסה (אותה תבנית dropdown של תפריט הייצוא) */}
          <div className="relative border-t border-slate-800 p-2">
            <button
              type="button"
              onClick={() => setAddMenuOpen((v) => !v)}
              className="w-full rounded-lg border border-dashed border-slate-700 py-2.5 text-xs text-slate-400 hover:border-cyan-400 hover:text-cyan-300"
            >+ שקופית ▾</button>
            {addMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAddMenuOpen(false)} />
                <div className="absolute bottom-full right-2 z-50 mb-1 w-56 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl">
                  {ADD_SLIDE_OPTIONS.map((opt) => (
                    <button
                      key={opt.layout}
                      type="button"
                      onClick={() => { setAddMenuOpen(false); handleAddSlideOfLayout(opt.layout); }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs font-semibold text-slate-200 hover:bg-slate-800"
                    ><span>{opt.icon}</span><span>{opt.label}</span></button>
                  ))}
                  <div className="my-1 h-px bg-slate-800" />
                  <button
                    type="button"
                    onClick={() => { setAddMenuOpen(false); handleDuplicateSlide(); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs font-semibold text-cyan-300 hover:bg-slate-800"
                  ><span>⧉</span><span>שכפול השקף הנוכחי</span><span className="mr-auto text-[10px] font-normal text-slate-500">Ctrl+D</span></button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* תצוגה מרכזית */}
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 overflow-auto bg-slate-950 p-6">
          {/* לחיצה כפולה = קפיצה לעריכת הכותרת בפאנל התכונות (עריכה במקום על
              הבמה המוקטנת נדחתה — ר' הערה בראש focusInspectorField). */}
          <div className="w-full max-w-3xl" onDoubleClick={focusInspectorField} title="לחיצה כפולה — עריכת הכותרת בפאנל התכונות">
            {selected && <SlideFrame slide={selected} themeId={deck.themeId} customTheme={deck.customTheme} index={selectedIndex} deckTitle={deck.title} deckId={deck.id} />}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => handleMove('up')} disabled={selectedIndex <= 0} title="הקדם (Alt+↑)" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-30">← הקדם</button>
            <button onClick={() => handleMove('down')} disabled={selectedIndex >= slides.length - 1} title="אחר (Alt+↓)" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-30">אחר →</button>
            <button onClick={handleDuplicateSlide} title="שכפל שקופית (Ctrl+D)" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-400 hover:text-cyan-300">⧉ שכפל</button>
            <button onClick={handleRemove} disabled={slides.length <= 1} title="מחק שקופית (Delete)" className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs text-rose-400 disabled:opacity-30">מחק שקופית</button>
          </div>

          {/* ── שורת פעולות מדיה ב-AI לשקופית הנבחרת ── */}
          {selected && (
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <select
                  value={imageStyle}
                  onChange={(e) => setImageStyle(e.target.value)}
                  disabled={Boolean(mediaBusy)}
                  title="סגנון התמונה"
                  className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-400 disabled:opacity-50"
                >
                  <option value="photo">תצלום</option>
                  <option value="illustration">איור</option>
                  <option value="abstract">מופשט</option>
                </select>
                <button
                  onClick={handleGenerateImage}
                  disabled={Boolean(mediaBusy)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-400 disabled:opacity-50"
                >{mediaBusy === 'image' ? '⏳ יוצר תמונה…' : '✨ תמונה'}</button>
                <button
                  onClick={handleGenerateInfographic}
                  disabled={Boolean(mediaBusy)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-400 disabled:opacity-50"
                >{mediaBusy === 'infographic' ? '⏳ יוצר אינפוגרפיקה…' : '📊 אינפוגרפיקה'}</button>
                <button
                  onClick={handleGenerateBackground}
                  disabled={Boolean(mediaBusy)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-400 disabled:opacity-50"
                >{mediaBusy === 'bg' ? '⏳ יוצר רקע…' : '🎨 רקע מעוצב'}</button>
                {selected.bgImage && (
                  <button
                    onClick={() => patchSlide({ bgImage: null })}
                    disabled={Boolean(mediaBusy)}
                    className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:border-rose-400 disabled:opacity-50"
                  >🚫 הסר רקע</button>
                )}
              </div>
              {mediaError && <div className="text-[11px] leading-5 text-rose-400">{mediaError}</div>}
            </div>
          )}
        </div>

        {/* inspector */}
        <div className={`w-72 flex-none overflow-auto border-r bg-slate-900/50 transition-colors ${inspectorFlash ? 'border-cyan-400 ring-2 ring-inset ring-cyan-400/60' : 'border-slate-800'}`}>
          {selected && (
            <Inspector
              slide={selected}
              themeId={deck.themeId}
              onChange={patchSlide}
              onOpenImagePicker={() => setPickerOpen(true)}
              focusFieldRef={inspectorFieldRef}
            />
          )}
        </div>

        {/* עוזר AI — עמודה אחרונה (RTL ⇒ הקצה השמאלי), כמו באפליקציה הראשית */}
        {assistantOpen && (
          <div className="flex w-[380px] min-w-[320px] max-w-[42vw] flex-none flex-col overflow-hidden border-r border-slate-800 bg-[#F8FAFC]">
            <AiSidebar
              mode="sidebar"
              reason="presentation"
              launchPreset={assistantPreset}
              onClose={() => setAssistantOpen(false)}
              currentFilePath={`deck:${deck.id}`}
              documentContext={() => buildDeckDocumentSnapshot(deckRef.current)}
              selectedText=""
              currentBlockText={assistantTargetState?.block?.text || ''}
              editTarget={assistantTargetState}
              getCurrentEditTarget={() => buildDeckEditTargetState(deckRef.current, selectedIdRef.current)}
              resolveEditTargetFromPrompt={() => null}
              resolveEditTargetsFromPrompt={resolveDeckEditTargetsFromPrompt}
              editModeSystemPrompt={DECK_EDIT_SYSTEM_PROMPT}
              onInsert={handleAssistantInsert}
              onInsertGeneratedMedia={handleInsertGeneratedMedia}
              insertMediaLabel="הוסף לשקופית"
              onApplyEdit={deckBridge.applyEdit}
              onApplyEditBatch={deckBridge.applyEditBatch}
              onStreamStart={noopStream}
              onStreamChunk={noopStream}
              onStreamEnd={noopStream}
              wordPreferences={assistantWordPreferences}
              assistantBehavior={assistantBehavior}
              onOpenHelp={onOpenHelp}
            />
          </div>
        )}
      </div>

      {pickerOpen && selected && (
        <ImagePicker
          slide={selected}
          onClose={() => setPickerOpen(false)}
          // spread קודם — כדי לשמר model/provider/prompt שה-deckModel מנרמל.
          onPick={(img) => { patchSlide({ image: { ...img, source: img.source || 'stock', url: img.url || '', dataUrl: img.dataUrl || '', query: img.query || '', alt: img.alt || '', attribution: img.attribution || '' } }); setPickerOpen(false); }}
        />
      )}

      {presenting && <PresentMode deck={deck} startIndex={Math.max(0, selectedIndex)} onClose={() => setPresenting(false)} />}
    </div>
  );
}
