// ═══════════════════════════════════════════════════════════════
// PresentationStudio.jsx — סטודיו מצגות מלא.
// שני מצבים: (1) ללא deck → טופס יצירה. (2) עם deck → עורך שקופיות.
// מקור האמת הוא אובייקט ה-deck (deckModel). אין HTML, אין TipTap.
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SlideFrame } from './presentation/SlideRenderer';
import PresentMode from './presentation/PresentMode';
import { DECK_THEMES } from './presentation/deckThemes';
import {
  SLIDE_LAYOUTS, getLayout, layoutHasImage, getSlideExportMode, BG_VARIANTS,
  createSlide, updateSlide, addSlideAfter, removeSlide, moveSlide,
} from './presentation/deckModel';
import { searchStockImages, generateAiImage, getImageSourceAvailability } from './services/imageService';
import { buildPptxBase64 } from './services/pptxExport';
import { getProviderConfig, saveProviderConfig, getPresentationPreferences, savePresentationPreferences } from './services/aiService';

const DENSITY = [
  { id: 'lean', label: 'רזה' },
  { id: 'balanced', label: 'מאוזן' },
  { id: 'rich', label: 'עשיר' },
];

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

// ── טופס יצירה (מצב ללא deck) ────────────────────────────────────
function CreateForm({ onGenerate, onUploadPptx, busy, hasDocument, documentTitle }) {
  const prefs = useMemo(() => getPresentationPreferences(), []);
  const uploadRef = useRef(null);
  const [source, setSource] = useState('topic');
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState(prefs.defaultAudience || '');
  const [goal, setGoal] = useState(prefs.defaultGoal || '');
  const [slideCount, setSlideCount] = useState(prefs.defaultSlideCount === 'auto' ? 10 : (prefs.defaultSlideCount || 10));
  const [slideAuto, setSlideAuto] = useState(prefs.defaultSlideCount === 'auto');
  const [themeId, setThemeId] = useState(prefs.defaultThemeId || 'premium');
  const [density, setDensity] = useState(prefs.defaultDensity || 'balanced');
  const [imageIntensity, setImageIntensity] = useState(prefs.defaultImageIntensity || 'high');

  const fromDocument = source === 'document';
  const fromUpload = source === 'upload';
  const canGenerate = (fromDocument ? hasDocument : Boolean(topic.trim())) && !busy;

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
        defaultAudience: audience.trim(),
        defaultGoal: goal.trim(),
      });
    }
    onGenerate({
      source, topic: topic.trim(), audience: audience.trim(), goal: goal.trim(),
      slideCount: slideAuto ? 'auto' : resolvedSlideCount,
      themeId, density, imageIntensity,
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
        <button type="button" onClick={() => setSource('document')} disabled={!hasDocument} title={hasDocument ? '' : 'אין מסמך פתוח'} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${fromDocument ? 'bg-cyan-500 text-slate-950' : 'text-slate-300'} ${!hasDocument ? 'cursor-not-allowed opacity-40' : ''}`}>מהמסמך הפתוח</button>
        <button type="button" onClick={() => setSource('upload')} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${fromUpload ? 'bg-cyan-500 text-slate-950' : 'text-slate-300'}`}>העלאת מצגת (טיוטה)</button>
      </div>

      {fromUpload && (
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm leading-7 text-slate-300">
            העלה מצגת קיימת (<b className="text-white">.pptx</b>) כדי לערוך ולשכתב את הטקסט לסגנון שלך.
            <br />העיצוב המקורי — צבעים, מיקומים, תמונות, פונטים — נשמר במלואו בקובץ המיוצא.
          </div>
          <input ref={uploadRef} type="file" accept=".pptx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadPptx?.(f); e.target.value = ''; }} />
          <button type="button" onClick={() => uploadRef.current?.click()} disabled={busy} className="rounded-2xl border-2 border-dashed border-slate-600 py-12 text-sm font-semibold text-slate-300 hover:border-cyan-400 hover:text-cyan-300 disabled:opacity-50">
            {busy ? 'טוען מצגת...' : '📥 לחץ לבחירת קובץ PowerPoint (.pptx)'}
          </button>
        </div>
      )}

      {!fromUpload && fromDocument && (
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-slate-300">
          {hasDocument ? <>המצגת תיבנה מהמסמך הפתוח{documentTitle ? <>: <b className="text-white">{documentTitle}</b></> : ''}. שדה הנושא אופציונלי — זווית או דגש.</> : 'אין מסמך פתוח.'}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2"><span className="text-sm font-bold text-slate-200">סגנון</span>
          <div className="grid grid-cols-2 gap-2">
            {DECK_THEMES.map((t) => (
              <button key={t.id} type="button" onClick={() => setThemeId(t.id)} title={t.blurb} className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${themeId === t.id ? 'border-cyan-400 bg-cyan-500/15 text-white' : 'border-slate-700 bg-slate-800/40 text-slate-300'}`}>{t.label}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2"><span className="text-sm font-bold text-slate-200">רמת עומס</span>
          <div className="grid grid-cols-3 gap-2">
            {DENSITY.map((d) => (
              <button key={d.id} type="button" onClick={() => setDensity(d.id)} className={`rounded-xl border px-2 py-2 text-sm font-bold transition ${density === d.id ? 'border-cyan-400 bg-cyan-500/15 text-white' : 'border-slate-700 bg-slate-800/40 text-slate-300'}`}>{d.label}</button>
            ))}
          </div>
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
function Inspector({ slide, onChange, onOpenImagePicker }) {
  const layoutDef = getLayout(slide.layout);
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

  const fields = layoutDef.fields;

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

      {(fields.includes('title')) && (
        <label className="flex flex-col gap-1.5"><span className="text-xs font-bold text-slate-400">כותרת</span>
          <input value={slide.title} onChange={(e) => setField('title', e.target.value)} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400" /></label>
      )}
      {(fields.includes('subtitle')) && (
        <label className="flex flex-col gap-1.5"><span className="text-xs font-bold text-slate-400">כותרת משנה</span>
          <input value={slide.subtitle} onChange={(e) => setField('subtitle', e.target.value)} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400" /></label>
      )}
      {(fields.includes('body')) && (
        <label className="flex flex-col gap-1.5"><span className="text-xs font-bold text-slate-400">טקסט / ציטוט</span>
          <textarea value={slide.body} onChange={(e) => setField('body', e.target.value)} className="min-h-[100px] rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm leading-7 text-slate-100 outline-none focus:border-cyan-400" /></label>
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
              <input value={col.heading} placeholder={`כותרת עמודה ${ci + 1}`} onChange={(e) => { const cols = slide.columns.map((c, idx) => idx === ci ? { ...c, heading: e.target.value } : c); setField('columns', cols); }} className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-400" />
              <textarea value={(col.bullets || []).join('\n')} placeholder="נקודה בכל שורה" onChange={(e) => { const cols = slide.columns.map((c, idx) => idx === ci ? { ...c, bullets: e.target.value.split('\n').filter(Boolean) } : c); setField('columns', cols); }} className="min-h-[70px] w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs leading-6 text-slate-100 outline-none focus:border-cyan-400" />
            </div>
          ))}
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
  onExit = () => {},
  busy = false,
  hasDocument = false,
  documentTitle = '',
  showToast = () => {},
}) {
  const [selectedId, setSelectedId] = useState(deck?.slides?.[0]?.id || '');
  const [presenting, setPresenting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const slides = deck?.slides || [];
  const selectedIndex = useMemo(() => slides.findIndex((s) => s.id === selectedId), [slides, selectedId]);
  const selected = selectedIndex >= 0 ? slides[selectedIndex] : slides[0];
  const selectedThumbRef = useRef(null);

  // ניווט שקופיות בחיצים (כל עוד לא מקלידים בשדה). RTL: ימינה=הקודם, שמאלה=הבא.
  useEffect(() => {
    if (!deck) return undefined;
    const onKey = (e) => {
      if (presenting || pickerOpen || exportOpen) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
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
  }, [deck, presenting, pickerOpen, exportOpen, selectedId]);

  // החזקת השקופית הנבחרת בתוך התצוגה בעת ניווט
  useEffect(() => {
    selectedThumbRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  // אם אין deck — טופס יצירה
  if (!deck) {
    return (
      <div className="flex min-h-full flex-1 overflow-auto bg-slate-950">
        <div className="flex w-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
            <span className="text-sm font-bold text-slate-300">📊 סטודיו מצגות</span>
            <button onClick={onExit} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">חזרה</button>
          </div>
          {busy
            ? <div className="flex flex-1 flex-col items-center justify-center gap-4 text-slate-300">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400" />
                <div className="text-sm font-semibold">בונה את המצגת...</div>
              </div>
            : <CreateForm onGenerate={onGenerate} onUploadPptx={onUploadPptx} busy={busy} hasDocument={hasDocument} documentTitle={documentTitle} />}
        </div>
      </div>
    );
  }

  const patchSlide = (patch) => onDeckChange(updateSlide(deck, selected.id, patch));
  const handleAddSlide = () => {
    const next = addSlideAfter(deck, selected.id, createSlide({ layout: 'title-bullets', title: 'שקופית חדשה' }));
    onDeckChange(next);
    const newIdx = next.slides.findIndex((s) => s.id === selected.id) + 1;
    setSelectedId(next.slides[newIdx]?.id || selectedId);
  };
  const handleRemove = () => {
    if (slides.length <= 1) return;
    const idx = selectedIndex;
    const next = removeSlide(deck, selected.id);
    onDeckChange(next);
    setSelectedId(next.slides[Math.max(0, idx - 1)]?.id || '');
  };
  const handleMove = (dir) => onDeckChange(moveSlide(deck, selected.id, dir));

  const handleExport = async (profile = 'auto') => {
    setExportOpen(false);
    setExporting(true);
    try {
      const base64 = await buildPptxBase64(deck, { profile });
      if (window.desktopApp?.saveDocumentDialog) {
        const res = await window.desktopApp.saveDocumentDialog({ title: deck.title || 'presentation', preferredExtension: 'pptx', base64 });
        if (res?.ok) showToast('המצגת נשמרה כ-PPTX ✓', { tone: 'success' });
        else if (!res?.canceled) showToast(res?.error || 'שמירה נכשלה', { tone: 'error' });
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
      }
    } catch (e) {
      showToast(e?.message || 'ייצוא נכשל', { tone: 'error' });
    } finally { setExporting(false); }
  };

  return (
    <div className="flex min-h-full flex-1 flex-col overflow-hidden bg-slate-950" dir="rtl">
      {/* סרגל עליון */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-2">
        <input value={deck.title} onChange={(e) => onDeckChange({ ...deck, title: e.target.value })} className="rounded-lg bg-transparent px-2 py-1 text-sm font-bold text-white outline-none focus:bg-slate-800" />
        <select value={deck.themeId} onChange={(e) => onDeckChange({ ...deck, themeId: e.target.value })} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none">
          {DECK_THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <div className="flex-1" />
        <button onClick={() => onGenerate(null)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">מצגת חדשה</button>
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
        <button onClick={onExit} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">חזרה</button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ניווט שקופיות */}
        <div className="flex w-52 flex-col gap-2 overflow-auto border-l border-slate-800 bg-slate-900/50 p-3">
          {slides.map((s, i) => (
            <button key={s.id} ref={s.id === selected.id ? selectedThumbRef : null} onClick={() => setSelectedId(s.id)} className={`relative rounded-lg border-2 text-right transition ${s.id === selected.id ? 'border-cyan-400' : 'border-transparent hover:border-slate-700'}`}>
              <span className="absolute right-1 top-1 z-10 rounded bg-slate-950/70 px-1.5 text-[10px] text-slate-300">{i + 1}</span>
              <SlideFrame slide={s} themeId={deck.themeId} index={i} shadow={false} />
            </button>
          ))}
          <button onClick={handleAddSlide} className="mt-1 rounded-lg border border-dashed border-slate-700 py-3 text-xs text-slate-400 hover:border-cyan-400 hover:text-cyan-300">+ שקופית</button>
        </div>

        {/* תצוגה מרכזית */}
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 overflow-auto bg-slate-950 p-6">
          <div className="w-full max-w-3xl">
            {selected && <SlideFrame slide={selected} themeId={deck.themeId} index={selectedIndex} />}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => handleMove('up')} disabled={selectedIndex <= 0} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-30">← הקדם</button>
            <button onClick={() => handleMove('down')} disabled={selectedIndex >= slides.length - 1} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-30">אחר →</button>
            <button onClick={handleRemove} disabled={slides.length <= 1} className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs text-rose-400 disabled:opacity-30">מחק שקופית</button>
          </div>
        </div>

        {/* inspector */}
        <div className="w-72 overflow-auto border-r border-slate-800 bg-slate-900/50">
          {selected && <Inspector slide={selected} onChange={patchSlide} onOpenImagePicker={() => setPickerOpen(true)} />}
        </div>
      </div>

      {pickerOpen && selected && (
        <ImagePicker
          slide={selected}
          onClose={() => setPickerOpen(false)}
          onPick={(img) => { patchSlide({ image: { source: img.source || 'stock', url: img.url || '', dataUrl: img.dataUrl || '', query: img.query || '', alt: img.alt || '', attribution: img.attribution || '' } }); setPickerOpen(false); }}
        />
      )}

      {presenting && <PresentMode deck={deck} startIndex={Math.max(0, selectedIndex)} onClose={() => setPresenting(false)} />}
    </div>
  );
}
