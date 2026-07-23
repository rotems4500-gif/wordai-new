// AssignmentScaffoldStudio — מסך מלא: הנחיות מטלה → שלד נערך → חומרים → ראיות → עורך.
//
// כל מה שקורה כאן רץ מקומית, בלי מפתח API: הפרסר דטרמיניסטי, ה-embedding הוא e5
// ב-WASM, והדירוג הוא מנוע ה-retrieval הקיים. זה המסלול למשתמש בלי מפתח.
//
// עיצוב: מועתק מבנית מ-ProjectHubStudio (רקע gradient, dir=rtl, header max-w-7xl,
// Escape ליציאה, revealClass לכניסה) כדי שהמסך ירגיש חלק מהאפליקציה.

import React from 'react';
import { parseAssignmentSpec, defaultSectionTemplate, INTENT_LABELS } from '../../services/assignmentSpecService';
import {
  addMaterialDocument,
  clearMaterialStore,
  commitMaterialStore,
  getMaterials,
  getMaterialStoreStats,
  removeMaterial,
  MATERIAL_CHUNKS_UPDATED_EVENT,
} from '../../services/materialChunkStore';
import { ensureMaterialsEmbedded, findEvidenceForSpec } from '../../services/evidenceMatchService';
import { saveScaffold } from '../../services/assignmentScaffoldStore';
import {
  buildPrepLedger,
  summarizeLedger,
  PREP_STATE,
  WORK_KIND_LABELS,
} from '../../services/assignmentPrepService';
import { buildScaffoldHtml, buildWholeWorkHtml } from '../../services/assignmentScaffoldDoc';
import { ensureOpenersReady, composeSectionOpener } from '../../services/styleOpenerService';
import { ensureOpenerProfile, getOpenerProfile } from '../../services/openerProfileService';
import { draftWholeWork } from '../../services/assignmentAiService';
import { hasUsableAiProvider } from '../../services/aiService';
import { reviewDraft, applyFinishingPasses, FINISHING_PASSES } from '../../services/assignmentReviewService';
import { composeSectionProseBest, ensureProseReady, PROSE_COMMANDS } from '../../services/proseComposeService';
import { ensureFrameProfile, getFrameProfile } from '../../services/styleFrameProfileService';
import { scoreTextAuthenticity } from '../../services/styleAuthenticityService';
import WorkReviewDialog from './WorkReviewDialog';
import { extractMaterialTextFromBytes } from '../../services/materialExtractBrowser';

const revealClass = (mounted, extra = '') => (
  `${extra} transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`
);

const STAGE_BG = 'radial-gradient(125% 120% at 82% -8%, #14304a 0%, #0b1a2b 46%, #070f1c 100%)';

const INTENT_OPTIONS = Object.entries(INTENT_LABELS);

// חילוץ טקסט מקובץ שהופל למסך. maxLength גבוה — מאמר שלם, לא תצוגה מקדימה.
// ⚠️ extractMaterialTextFromBytes מחזיר {ok, text, error} ולא מחרוזת. בלי הפירוק
// הזה מקבלים "[object Object]" — מילה אחת שנזרקת בחיתוך, וה-ingest "מצליח" עם 0 קטעים.
async function readFileText(file, maxLength = 400000, opts = {}) {
  const buffer = await file.arrayBuffer();
  const result = await extractMaterialTextFromBytes(file.name, new Uint8Array(buffer), maxLength, opts);
  if (!result?.ok) {
    const err = new Error(result?.error || 'שגיאת חילוץ');
    err.scanned = Boolean(result?.scanned);
    throw err;
  }
  return String(result.text || '');
}

export default function AssignmentScaffoldStudio({ onExit, onOpenDocument, onOpenHelp }) {
  const [mounted, setMounted] = React.useState(false);
  const [instructions, setInstructions] = React.useState('');
  const [spec, setSpec] = React.useState(null);
  const [materials, setMaterials] = React.useState([]);
  const [stats, setStats] = React.useState({ chunks: 0, embedded: 0, materials: 0 });
  const [busy, setBusy] = React.useState('');
  const [notice, setNotice] = React.useState(null);
  const [evidenceResult, setEvidenceResult] = React.useState(null);
  const [dropActive, setDropActive] = React.useState(false);
  // פקודות הטיוטה המקומית: בחירה מרשימה סגורה (PROSE_COMMANDS) — לא שפה חופשית.
  const [proseCommands, setProseCommands] = React.useState(() => new Set());
  // "נסח מחדש" = seed חדש; המונה נכנס ל-seedKey כך שכל לחיצה מגרילה מסגרות אחרות.
  const [regenCounter, setRegenCounter] = React.useState(0);

  const toggleProseCommand = React.useCallback((cmd) => {
    setProseCommands((prev) => {
      const next = new Set(prev);
      if (next.has(cmd.id)) {
        next.delete(cmd.id);
      } else {
        // קטגוריית single (למשל אורך): בחירה חדשה מנקה את האחיות.
        if (cmd.single) {
          PROSE_COMMANDS.filter((c) => c.single === cmd.single).forEach((c) => next.delete(c.id));
        }
        next.add(cmd.id);
      }
      return next;
    });
  }, []);
  // הטיוטה ממתינה לאישור: נכתבה, נסקרה, וטרם נכנסה לעורך.
  const [pendingDraft, setPendingDraft] = React.useState(null);
  const [review, setReview] = React.useState(null);

  const instructionInputRef = React.useRef(null);
  const materialsInputRef = React.useRef(null);

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const refreshMaterials = React.useCallback(() => {
    setMaterials(getMaterials());
    setStats(getMaterialStoreStats());
  }, []);

  React.useEffect(() => {
    refreshMaterials();
    window.addEventListener(MATERIAL_CHUNKS_UPDATED_EVENT, refreshMaterials);
    return () => window.removeEventListener(MATERIAL_CHUNKS_UPDATED_EVENT, refreshMaterials);
  }, [refreshMaterials]);

  // מנוע הפתיחים נטען מראש כדי שבניית המסמך (סינכרונית) תמצא אותו מוכן —
  // אחרת הסעיף הראשון נפתח בלי משפט פתיחה בפעם הראשונה בלבד.
  React.useEffect(() => {
    Promise.all([ensureOpenersReady(), ensureOpenerProfile()]).catch(() => {});
  }, []);

  // Escape יוצא מהסטודיו — אותה קונבנציה כמו ProjectHubStudio.
  React.useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onExit?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  // ---------- פעולות ----------

  const handleParse = React.useCallback(() => {
    const parsed = parseAssignmentSpec(instructions);
    if (!parsed.sections.length) {
      // התבנית נגזרת מטקסט ההנחיות עצמו (אילו תפקידים הוזכרו בו), ולא מרשימה
      // קבועה — אחרת כל מטלה שלא פורקה מקבלת בדיוק את אותם ארבעה סעיפים.
      parsed.sections = defaultSectionTemplate(parsed.totalWords || 1500, instructions);
      const notAssignment = parsed.warnings.some((w) => w.includes('לא נראה כמו הנחיות מטלה'));
      setNotice({
        tone: 'warn',
        text: notAssignment
          ? 'הקובץ לא נראה כמו הנחיות מטלה — ודא שהעלית את הקובץ הנכון. בינתיים נטען שלד בסיסי.'
          : 'לא זוהו סעיפים בהנחיות — נבנה שלד לפי מה שההנחיות מזכירות. ערוך אותו לפי המטלה.',
      });
    } else {
      setNotice({ tone: 'ok', text: `זוהו ${parsed.sections.length} סעיפים. בדוק ותקן לפני שממשיכים.` });
    }
    setSpec(parsed);
    setEvidenceResult(null);
  }, [instructions]);

  const handleInstructionFile = React.useCallback(async (file) => {
    if (!file) return;
    setBusy('קורא את קובץ ההנחיות…');
    try {
      const text = await readFileText(file, 60000);
      setInstructions(String(text || ''));
      setNotice({ tone: 'ok', text: `נטען "${file.name}". לחץ "פרק הנחיות".` });
    } catch (err) {
      setNotice({ tone: 'err', text: `לא הצלחתי לקרוא את הקובץ: ${String(err?.message || err)}` });
    } finally {
      setBusy('');
    }
  }, []);

  const handleMaterialFiles = React.useCallback(async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    let added = 0;
    let skipped = 0;
    // קבצים שנכשלו נאספים עם הסיבה. קודם הם נבלעו ב-skipped יחד עם כפולים, ולכן
    // PDF סרוק — קובץ שהמשתמש סומך עליו — נעלם בלי שום סימן.
    const failures = [];
    // PDFים סרוקים נאספים לסבב שני. OCR עולה שניות לעמוד, ואין סיבה שקובץ סרוק
    // אחד יעכב את 30 הקבצים הטקסטואליים שאחריו.
    const scannedQueue = [];

    const ingest = (file, text) => {
      if (!String(text || '').trim()) { failures.push(`${file.name}: לא נמצא טקסט`); return; }
      // defer: כתיבה אחת ל-IDB בסוף האצווה במקום כתיבה מלאה (עשרות MB) לכל קובץ.
      const result = addMaterialDocument({
        title: file.name.replace(/\.[^.]+$/, ''), text, source: 'scaffold-upload', defer: true,
      });
      if (result.skipped) skipped += 1;
      else added += result.added;
    };

    for (let i = 0; i < list.length; i += 1) {
      const file = list[i];
      setBusy(`מאנדקס ${i + 1}/${list.length}: ${file.name}`);
      try {
        ingest(file, await readFileText(file));
      } catch (err) {
        if (err?.scanned) scannedQueue.push(file);
        else failures.push(`${file.name}: ${String(err?.message || err)}`);
      }
      // נשימה ל-UI בין קבצים — חילוץ + chunking הם סינכרוניים וארוכים.
      await new Promise((r) => setTimeout(r, 0));
    }

    let ocrDone = 0;
    for (let i = 0; i < scannedQueue.length; i += 1) {
      const file = scannedQueue[i];
      try {
        const text = await readFileText(file, 400000, {
          ocr: true,
          onOcrProgress: ({ page, pages }) => setBusy(
            `סורק טקסט (OCR) ${i + 1}/${scannedQueue.length}: ${file.name} — עמוד ${page}/${pages}`,
          ),
        });
        ingest(file, text);
        ocrDone += 1;
      } catch (err) {
        failures.push(`${file.name}: ${String(err?.message || err)}`);
      }
      await new Promise((r) => setTimeout(r, 0));
    }

    await commitMaterialStore();
    refreshMaterials();

    // ההטמעה היא החלק האיטי (טעינת מודל WASM בפעם הראשונה) — מדווחת בנפרד.
    // ensureMaterialsEmbedded מטמיע באצווה מוגבלת כדי לא לתקוע את ה-UI, ולכן
    // ספרייה גדולה דורשת כמה סבבים. עוצרים כשאין שארית או כשהשכבה לא זמינה.
    setBusy('מחשב אינדקס סמנטי מקומי…');
    let embedResult = { embedded: 0, remaining: 0, unavailable: null };
    // תקרת הסבבים נגזרת מגודל הקורפוס בפועל, לא ממספר קבוע: 25 סבבים × 400 עצרו
    // על 10,000 קטעים והשאירו ספרייה גדולה מאונדקסת חלקית בשקט.
    const toEmbed = getMaterialStoreStats().chunks - getMaterialStoreStats().embedded;
    const maxPasses = Math.max(25, Math.ceil(toEmbed / 400) + 5);
    let indexed = 0;
    for (let pass = 0; pass < maxPasses; pass += 1) {
      embedResult = await ensureMaterialsEmbedded({
        onProgress: ({ done, total }) => setBusy(
          `מחשב אינדקס סמנטי מקומי… ${Math.min(indexed + done, toEmbed || total)}/${toEmbed || total}`,
        ),
      });
      indexed += embedResult.embedded || 0;
      if (embedResult.unavailable || !embedResult.remaining) break;
    }
    refreshMaterials();
    setBusy('');

    // added=0 עם skipped>0 אינו כישלון — זה dedupe מול חומר שכבר מאונדקס.
    // בלי האבחנה הזו ההודעה נקראת כאילו שום דבר לא נקלט.
    const gist = added
      ? `נוספו ${added} קטעים`
      : (skipped ? `${skipped} קבצים כבר היו באינדקס` : 'לא נוספו קטעים');
    const ocrNote = ocrDone ? ` ${ocrDone} PDF סרוקים נקראו ב-OCR.` : '';
    const failNote = failures.length
      ? ` ${failures.length} קבצים לא נקלטו: ${failures.slice(0, 3).join(' · ')}${failures.length > 3 ? ` (ועוד ${failures.length - 3})` : ''}.`
      : '';
    if (embedResult.unavailable) {
      setNotice({
        tone: 'warn',
        text: `${gist}. האינדקס הסמנטי לא זמין (${embedResult.unavailable}) — ההתאמה תרוץ במצב מילולי, פחות מדויק.${ocrNote}${failNote}`,
      });
    } else {
      setNotice({
        tone: failures.length ? 'warn' : 'ok',
        text: `${gist} מאונדקסים${skipped ? `, ${skipped} כפולים דולגו` : ''}.${ocrNote}${failNote}`,
      });
    }
  }, [refreshMaterials]);

  const handleFindEvidence = React.useCallback(async () => {
    if (!spec) return;
    setBusy('מחפש ראיות בחומרים שלך…');
    try {
      const result = await findEvidenceForSpec(spec, { k: 5 });
      setEvidenceResult(result);
      // gaps כולל עכשיו גם תתי-סעיפים — סופרים סעיפים ראשיים בנפרד להודעה.
      const sectionIds = new Set(spec.sections.filter((s) => s.enabled !== false).map((s) => s.id));
      const sectionGaps = (result.gaps || []).filter((id) => sectionIds.has(id));
      const supported = sectionIds.size - sectionGaps.length;
      setNotice({
        tone: sectionGaps.length ? 'warn' : 'ok',
        text: `נמצאו ראיות ל-${supported} מתוך ${sectionIds.size} סעיפים${sectionGaps.length ? `. ${sectionGaps.length} סעיפים ללא חומר תומך — שקול להעלות מקור נוסף.` : '.'}`,
      });
    } catch (err) {
      setNotice({ tone: 'err', text: `החיפוש נכשל: ${String(err?.message || err)}` });
    } finally {
      setBusy('');
    }
  }, [spec]);

  const handleOpenInEditor = React.useCallback(() => {
    if (!spec) return;
    saveScaffold({
      spec,
      evidence: evidenceResult?.bySection || {},
      gaps: evidenceResult?.gaps || [],
      mode: evidenceResult?.mode || 'none',
      title: spec.title,
    });
    // פתיח מלא (משפט–שניים) לכל סעיף ותת-סעיף: גדם מהדקדוק (בקול המשתמש כשיש
    // פרופיל) שהושלם בנושא הסעיף + משפט מתווה — מהמושגים שהמרצה דרש אם ישנם.
    // המשוב שהוליד את זה: גדם של שלוש מילים ("מן הראוי לנתח את") לא שווה הרבה.
    // עדיין אפס API, והממוקשים מהקורפוס נשארים הצעה בפאנל בלבד (פתיח ממוקש
    // גורר תוכן ממטלה אחרת — נמדד).
    const openers = {};
    try {
      const profile = getOpenerProfile();
      const used = new Set(); // דה-דופליקציה של הגדם — בלעדיה כל הפרקים נפתחים אותו דבר
      (spec.sections || []).filter((s) => s?.enabled !== false).forEach((s) => {
        const subs = Array.isArray(s.subSections) ? s.subSections : [];
        if (subs.length) {
          subs.forEach((sub) => {
            const text = composeSectionOpener({
              intent: s.intent,
              seedKey: sub.id,
              profile,
              topic: sub.title,
              framework: s.title,
              mustMention: sub.mustMention?.length ? sub.mustMention : s.mustMention,
              usedTexts: used,
            });
            if (text) openers[sub.id] = text;
          });
          return;
        }
        const text = composeSectionOpener({
          intent: s.intent,
          seedKey: s.id,
          profile,
          topic: s.title,
          mustMention: s.mustMention,
          usedTexts: used,
        });
        if (text) openers[s.id] = text;
      });
    } catch {}

    onOpenDocument?.({
      ok: true,
      // evidence → שורת "מקורות מהחומרים שלך" מתחת לכל סעיף ותת-סעיף במסמך.
      html: buildScaffoldHtml(spec, { openers, evidence: evidenceResult?.bySection || null }),
      title: spec.title || 'מטלה',
      source: 'assignment-scaffold',
    });
  }, [spec, evidenceResult, onOpenDocument]);

  // טיוטה מקומית מלאה — אפס API: פתיחים מהדקדוק + גוף מכל סעיף שיש לו ראיות
  // (proseComposeService: משפטי תוכן מעוגני-chunk + מסגור רטורי). סעיף בלי
  // ראיות נשאר עם רמז מכסה — לא ממציאים.
  const handleLocalDraft = React.useCallback(async () => {
    if (!spec) return;
    setBusy('מרכיב טיוטה מקומית מהראיות…');
    setNotice(null);
    try {
      await ensureProseReady();
      // פרופיל המסגרות: נכרה מהקורפוס האישי (אילו מסגרות רטוריות המשתמש באמת
      // כותב) + משוב. מוזן למשקלי בחירת ה-frame — הטיוטה נוטה לקול שלו.
      try { await ensureFrameProfile(); } catch {}
      saveScaffold({
        spec,
        evidence: evidenceResult?.bySection || {},
        gaps: evidenceResult?.gaps || [],
        mode: evidenceResult?.mode || 'none',
        title: spec.title,
      });
      const profile = getOpenerProfile();
      const openers = {};
      const prose = {};
      const used = new Set();
      const bySection = evidenceResult?.bySection || {};
      const frameProfile = getFrameProfile();
      // Set אחד לכל העבודה — אותו משפט ראיה לא יופיע בשני סעיפים (נמדד: בלעדיו
      // אותה פסקה בוליוודית חזרה בסעיפים א-ד).
      const workUsedSentences = new Set();
      const commands = [...proseCommands];
      const variants = proseCommands.has('st_pick5') ? 5 : 3;
      // "נסח מחדש" נצרך חד-פעמית: המונה נכנס ל-seed ומאופס אחרי היצירה.
      const seedSuffix = regenCounter ? `~${regenCounter}` : '';
      let written = 0;
      (spec.sections || []).filter((s) => s?.enabled !== false).forEach((s) => {
        const units = (Array.isArray(s.subSections) && s.subSections.length)
          ? s.subSections.map((sub) => ({ ...sub, intent: sub.intent || s.intent, parent: s }))
          : [{ ...s, parent: null }];
        units.forEach((u) => {
          const openerText = composeSectionOpener({
            intent: u.intent,
            seedKey: u.id,
            profile,
            topic: u.title,
            framework: u.parent?.title,
            mustMention: u.mustMention?.length ? u.mustMention : (u.parent?.mustMention || s.mustMention),
            usedTexts: used,
          });
          if (openerText) openers[u.id] = openerText;
          const ev = bySection[u.id]?.evidence || [];
          // 3 וריאנטים לכל סעיף; הדטקטור המקומי בוחר את הכי-אנושי (לולאת האיכות).
          const r = composeSectionProseBest(
            { ...u, keywords: u.keywords?.length ? u.keywords : s.keywords },
            ev,
            { quotaWords: u.wordQuota || 0, seedKey: `${u.id}${seedSuffix}`, profile: frameProfile, commands, sharedUsedSentences: workUsedSentences },
            { scoreFn: scoreTextAuthenticity, variants },
          );
          if (r?.html) { prose[u.id] = r.html; written += 1; }
        });
      });
      if (!written) {
        setNotice({ tone: 'warn', text: 'אין סעיף עם ראיות — הרץ "מצא ראיות" קודם, או הוסף חומרים.' });
        return;
      }
      onOpenDocument?.({
        ok: true,
        html: buildScaffoldHtml(spec, { openers, prose, evidence: evidenceResult?.bySection || null }),
        title: spec.title || 'מטלה',
        source: 'assignment-scaffold-local-draft',
      });
      setNotice({ tone: 'ok', text: `נכתבה טיוטה מקומית ל-${written} סעיפים — כולה מהחומרים שלך, בלי AI.` });
      // "נסח מחדש" מגריל seed חדש בכל לחיצה — הקידום כאן מבטיח שהלחיצה הבאה שונה.
      if (proseCommands.has('st_reshuffle')) setRegenCounter((c) => c + 1);
    } catch (err) {
      setNotice({ tone: 'err', text: String(err?.message || err) });
    } finally {
      setBusy('');
    }
  }, [spec, evidenceResult, onOpenDocument, proseCommands, regenCounter]);

  // כתיבת העבודה כולה ב**קריאה אחת** ופתיחתה בעורך. לא אחת לסעיף: זה יקר פי N,
  // וכל סעיף נכתב עיוור לשאר — מכאן חזרות ואפס מעברים. ראה assignmentAiService.
  const handleDraftWholeWork = React.useCallback(async () => {
    if (!spec) return;
    if (!hasUsableAiProvider()) {
      setNotice({ tone: 'err', text: 'אין ספק AI מוגדר. אפשר לפתוח בעורך ולכתוב מהראיות ידנית.' });
      return;
    }
    setBusy('כותב את העבודה בקריאה אחת…');
    setNotice(null);
    try {
      const scaffold = {
        active: true,
        title: spec.title,
        spec,
        evidence: evidenceResult?.bySection || {},
      };
      const draft = await draftWholeWork(spec, { scaffold });
      if (!draft.ok) {
        setNotice({ tone: 'err', text: draft.reason });
        return;
      }
      // לא נכנס ישר לעורך: קודם סבב תיקונים. הסקירה עצמה חינם (אפס קריאות),
      // והליטוש רץ רק אם המשתמש בוחר אותו שם.
      setPendingDraft(draft);
      setReview(reviewDraft(spec, draft, { evidenceBySection: evidenceResult?.bySection || {} }));
    } catch (err) {
      setNotice({ tone: 'err', text: String(err?.message || err) });
    } finally {
      setBusy('');
    }
  }, [spec, evidenceResult]);

  // אישור מתוך דיאלוג הסקירה: מריץ את הליטוש שנבחר (אם נבחר) ופותח בעורך.
  const handleApproveDraft = React.useCallback(async (mode) => {
    if (!spec || !pendingDraft) return;
    let html = buildWholeWorkHtml(spec, pendingDraft);
    const notes = [];

    if (mode && mode !== FINISHING_PASSES.NONE) {
      setBusy('מלטש…');
      try {
        const polished = await applyFinishingPasses(html, {
          mode,
          onProgress: (stage) => setBusy(stage === 'style' ? 'מעבר סגנון…' : 'מעבר אנטי-גלאי…'),
        });
        html = polished.html;
        if (polished.style?.score != null) notes.push(`סגנון: ${polished.style.score}`);
        if (polished.humanize?.score != null) {
          notes.push(`גלאי: ${polished.humanize.score}${polished.humanize.hitTarget ? ' ✓' : ''}`);
        }
        // כישלון של מעבר אינו מבטל את העבודה — אבל המשתמש חייב לדעת עליו.
        if (polished.style?.error) notes.push(`מעבר הסגנון נכשל: ${polished.style.error}`);
        if (polished.humanize?.error) notes.push(`מעבר האנטי-גלאי נכשל: ${polished.humanize.error}`);
      } catch (err) {
        setNotice({ tone: 'err', text: String(err?.message || err) });
        setBusy('');
        return;
      } finally {
        setBusy('');
      }
    }

    // שומרים את השלד לפני הפתיחה — פאנל הראיות בעורך קורא ממנו.
    saveScaffold({
      spec,
      evidence: evidenceResult?.bySection || {},
      gaps: evidenceResult?.gaps || [],
      mode: evidenceResult?.mode || 'none',
      title: spec.title,
    });
    onOpenDocument?.({
      ok: true,
      html,
      title: spec.title || 'מטלה',
      source: 'assignment-scaffold-draft',
    });
    setPendingDraft(null);
    setReview(null);
    const blockedNote = pendingDraft.blocked.length
      ? ` ${pendingDraft.blocked.length} סעיפים נותרו חסומים וסומנו במסמך.`
      : '';
    setNotice({
      tone: 'ok',
      text: `נכתבו ${pendingDraft.sections.length} סעיפים מ-${pendingDraft.usedEvidence} ראיות, בקריאה אחת.${blockedNote}${notes.length ? ` (${notes.join(' · ')})` : ''}`,
    });
  }, [spec, pendingDraft, evidenceResult, onOpenDocument]);

  // ---------- עריכת סעיפים ----------

  const updateSection = (id, patch) => {
    setSpec((prev) => (prev ? {
      ...prev,
      sections: prev.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    } : prev));
  };

  const removeSection = (id) => {
    setSpec((prev) => (prev ? { ...prev, sections: prev.sections.filter((s) => s.id !== id) } : prev));
  };

  const addSection = () => {
    setSpec((prev) => {
      if (!prev) return prev;
      const order = prev.sections.length + 1;
      return {
        ...prev,
        sections: [...prev.sections, {
          id: `sec_new_${Date.now()}`,
          order,
          marker: String(order),
          title: 'סעיף חדש',
          instructions: '',
          intent: 'exposition',
          wordQuota: null,
          quotaSource: 'manual',
          keywords: [],
          requiresSources: true,
          enabled: true,
        }],
      };
    });
  };

  // פנקס ההכנה — נבנה מקומית מה-spec ומהראיות, בלי שום קריאת מודל. מציג למשתמש
  // מה כבר מוכן, מה יעלה לו קריאת AI, ומה חסום עד שיוסיף מקור.
  const ledger = React.useMemo(() => (
    spec ? buildPrepLedger({ spec, evidence: evidenceResult?.bySection || {} }) : null
  ), [spec, evidenceResult]);

  // בלי ראיות ולו לסעיף אחד אין מה לכתוב — draftWholeWork יסרב ממילא, עדיף
  // להשבית את הכפתור מאשר לתת למשתמש ללחוץ ולקבל שגיאה.
  const hasEvidence = React.useMemo(() => (
    Object.values(evidenceResult?.bySection || {}).some((r) => (r?.evidence || []).length > 0)
  ), [evidenceResult]);

  const totalPlanned = React.useMemo(() => (
    (spec?.sections || []).reduce((sum, s) => sum + (s.enabled === false ? 0 : (Number(s.wordQuota) || 0)), 0)
  ), [spec]);

  const noticeTone = {
    ok: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
    warn: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
    err: 'border-rose-400/30 bg-rose-400/10 text-rose-100',
  }[notice?.tone] || '';

  return (
    <div
      dir="rtl"
      className="flex h-full min-h-[100dvh] w-full flex-col overflow-hidden text-white"
      style={{ background: STAGE_BG }}
    >
      {/* Header */}
      <header className="shrink-0 border-b border-white/10 bg-white/[0.03] px-5 py-3.5 backdrop-blur-sm md:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold">🧭 שלד מטלה</h1>
            <p className="mt-0.5 text-xs text-white/60">
              הנחיות + החומרים שלך → שלד עם ראיות. הכל מקומי, בלי מפתח API.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onOpenHelp && (
              <button
                type="button"
                onClick={() => onOpenHelp('assignment-scaffold')}
                className="rounded-xl border border-white/15 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10"
              >
                עזרה
              </button>
            )}
            <button
              type="button"
              onClick={onExit}
              className="rounded-xl bg-white/10 px-4 py-1.5 text-sm font-bold transition hover:bg-white/20"
            >
              חזרה
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto w-full max-w-7xl flex-1 overflow-y-auto px-5 py-6">
        {/* ⚠️ sticky: הבאנר יושב בראש גוף שנגלל, וכפתור העלאת החומרים נמצא הרבה
            מתחתיו. משתמש שגלל אל אזור ההעלאה איבד את החיווי מהמסך לגמרי ודיווח
            ש"אין שום חיווי בזמן ההעלאה" — בזמן שהאינדוקס רץ בסדר גמור. */}
        {(busy || notice) && (
          <div className={revealClass(mounted, 'sticky top-0 z-20 mb-4 space-y-2')}>
            {busy && (
              <div className="rounded-xl border border-sky-400/30 bg-sky-950/90 px-4 py-2.5 text-sm text-sky-100 shadow-lg backdrop-blur-md">
                <span className="inline-block animate-pulse">⏳</span> {busy}
              </div>
            )}
            {notice && !busy && (
              <div className={`rounded-xl border px-4 py-2.5 text-sm ${noticeTone}`}>{notice.text}</div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
          {/* עמודה: הנחיות + חומרים */}
          <div className={revealClass(mounted, 'space-y-4')}>
            <section className="rounded-2xl border border-white/15 bg-white/[0.05] p-4 backdrop-blur-md">
              <h2 className="mb-2 text-sm font-bold">1. הנחיות המטלה</h2>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={9}
                dir="rtl"
                placeholder={'הדבק כאן את ההנחיות, או העלה קובץ.\n\nלמשל:\n1. מבוא - הציגו את שאלת המחקר. עד 300 מילים.\n2. סקירת ספרות - סקרו את המחקרים המרכזיים.'}
                className="w-full resize-y rounded-xl border border-white/15 bg-slate-950/40 p-3 text-sm leading-relaxed text-white placeholder:text-white/30 focus:border-sky-400/50 focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleParse}
                  disabled={!instructions.trim() || Boolean(busy)}
                  className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-sm font-bold shadow-lg transition disabled:cursor-not-allowed disabled:opacity-40"
                >
                  פרק הנחיות
                </button>
                <button
                  type="button"
                  onClick={() => instructionInputRef.current?.click()}
                  className="rounded-xl border border-white/20 px-3 py-2 text-sm text-white/80 transition hover:bg-white/10"
                >
                  העלה קובץ
                </button>
                <input
                  ref={instructionInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.txt,.html,.md"
                  onChange={(e) => { handleInstructionFile(e.target.files?.[0]); e.target.value = ''; }}
                />
              </div>
            </section>

            <section
              className={`rounded-2xl border p-4 backdrop-blur-md transition ${dropActive ? 'border-cyan-400/60 bg-cyan-400/10' : 'border-white/15 bg-white/[0.05]'}`}
              onDragEnter={(e) => { e.preventDefault(); setDropActive(true); }}
              onDragOver={(e) => { e.preventDefault(); setDropActive(true); }}
              onDragLeave={() => setDropActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDropActive(false);
                handleMaterialFiles(e.dataTransfer?.files);
              }}
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-bold">2. חומרי עזר</h2>
                {stats.chunks > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      // שיקום מאינדקס פגום (למשל קבצים שנקלטו לפני זיהוי ה-garbled):
                      // מנקה הכל ומעלים מחדש. בלי זה אין למשתמש שום דרך להיפטר
                      // מקטעים מורעלים חוץ מהסרה קובץ-קובץ.
                      if (window.confirm('לנקות את כל אינדקס החומרים? תצטרך להעלות את הקבצים מחדש.')) {
                        clearMaterialStore();
                        refreshMaterials();
                        setEvidenceResult(null);
                        setNotice({ tone: 'ok', text: 'האינדקס נוקה. העלה את החומרים מחדש.' });
                      }
                    }}
                    className="rounded-lg border border-white/15 px-2 py-0.5 text-[11px] text-white/60 transition hover:border-rose-400/40 hover:text-rose-200"
                  >
                    נקה אינדקס
                  </button>
                )}
              </div>
              <div className="rounded-xl border border-dashed border-white/25 p-4 text-center text-xs text-white/60">
                גרור לכאן מאמרים (PDF, DOCX, TXT) — או
                <button
                  type="button"
                  onClick={() => materialsInputRef.current?.click()}
                  className="mx-1 font-bold text-cyan-300 underline underline-offset-2"
                >
                  בחר קבצים
                </button>
                <input
                  ref={materialsInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.docx,.txt,.html,.md,.pptx,.xlsx"
                  onChange={(e) => { handleMaterialFiles(e.target.files); e.target.value = ''; }}
                />
              </div>

              {/* חיווי גם *בתוך* כרטיס החומרים — כאן העין נמצאת אחרי בחירת קבצים,
                  ולא בראש העמוד. OCR על ספרייה סרוקה נמשך עשרות דקות, ובלי חיווי
                  צמוד זה נראה כאילו כלום לא קרה. */}
              {busy ? (
                <div className="mt-3 rounded-lg border border-sky-400/30 bg-sky-400/10 px-2.5 py-2 text-[11px] text-sky-100">
                  <span className="inline-block animate-pulse">⏳</span> {busy}
                  <div className="mt-1 text-sky-200/70">
                    אפשר לעבור לטאב אחר — העבודה ממשיכה. אל תסגור את החלון.
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-[11px] text-white/50">
                  {stats.materials} מקורות · {stats.chunks} קטעים · {stats.embedded} מאונדקסים סמנטית
                </div>
              )}

              {materials.length > 0 && (
                <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                  {materials.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs">
                      <span className="truncate" title={m.title}>{m.title}</span>
                      <button
                        type="button"
                        onClick={() => { removeMaterial(m.id); refreshMaterials(); }}
                        className="shrink-0 text-white/40 transition hover:text-rose-300"
                        aria-label={`הסר ${m.title}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* עמודה: השלד */}
          <div className={revealClass(mounted, 'space-y-4')}>
            {!spec ? (
              <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] text-center text-sm text-white/50">
                הדבק הנחיות ולחץ "פרק הנחיות" כדי לבנות שלד.
              </div>
            ) : (
              <>
                <section className="rounded-2xl border border-white/15 bg-white/[0.05] p-4 backdrop-blur-md">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-sm font-bold">3. השלד — בדוק ותקן</h2>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {spec.totalWords && <Badge>{spec.totalWords} מילים</Badge>}
                      {spec.sourceRequirement && <Badge>{spec.sourceRequirement.count}+ מקורות</Badge>}
                      {spec.citationStyle && <Badge>{spec.citationStyle}</Badge>}
                      {spec.dueDate && <Badge>הגשה {spec.dueDate}</Badge>}
                      <Badge tone={totalPlanned > (spec.totalWords || Infinity) ? 'warn' : 'muted'}>
                        מתוכנן: {totalPlanned}
                      </Badge>
                    </div>
                  </div>

                  {spec.warnings?.length > 0 && (
                    <ul className="mb-3 space-y-1 text-[11px] text-amber-200/80">
                      {spec.warnings.map((w) => <li key={w}>• {w}</li>)}
                    </ul>
                  )}

                  <div className="space-y-2">
                    {spec.sections.map((section) => {
                      const found = evidenceResult?.bySection?.[section.id];
                      return (
                        <div
                          key={section.id}
                          className={`rounded-xl border p-3 transition ${section.enabled === false ? 'border-white/10 bg-white/[0.02] opacity-50' : 'border-white/15 bg-slate-950/30'}`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="checkbox"
                              checked={section.enabled !== false}
                              onChange={(e) => updateSection(section.id, { enabled: e.target.checked })}
                              className="h-4 w-4 shrink-0 accent-cyan-400"
                              aria-label="כלול סעיף"
                            />
                            <input
                              value={section.title}
                              onChange={(e) => updateSection(section.id, { title: e.target.value })}
                              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-transparent px-2 py-1 text-sm font-bold focus:border-sky-400/50 focus:outline-none"
                            />
                            <select
                              value={section.intent}
                              onChange={(e) => updateSection(section.id, { intent: e.target.value })}
                              className="shrink-0 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs"
                            >
                              {INTENT_OPTIONS.map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min="0"
                              step="10"
                              value={section.wordQuota || ''}
                              onChange={(e) => updateSection(section.id, {
                                wordQuota: e.target.value ? Number(e.target.value) : null,
                                quotaSource: 'manual',
                              })}
                              className="w-20 shrink-0 rounded-lg border border-white/10 bg-transparent px-2 py-1 text-xs"
                              placeholder="מילים"
                            />
                            <button
                              type="button"
                              onClick={() => removeSection(section.id)}
                              className="shrink-0 text-white/40 transition hover:text-rose-300"
                              aria-label="מחק סעיף"
                            >
                              ✕
                            </button>
                          </div>

                          {found && (
                            <div className={`mt-2 text-[11px] ${found.gap ? 'text-amber-300' : 'text-emerald-300'}`}>
                              {found.gap
                                ? '⚠ אין חומר תומך לסעיף הזה'
                                : `✓ ${found.evidence.length} ראיות · ${found.evidence[0]?.sourceTitle || ''}`}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={addSection}
                    className="mt-3 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10"
                  >
                    + הוסף סעיף
                  </button>
                </section>

                {ledger && (
                  <section className="rounded-2xl border border-white/15 bg-white/[0.05] p-4 backdrop-blur-md">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-bold">4. מה מוכן — ומה עוד דורש AI</h2>
                      <span className="text-[11px] text-white/60">{summarizeLedger(ledger)}</span>
                    </div>

                    {/* פס יחסים: מקומי / דורש AI / חסום */}
                    <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-white/10">
                      {[
                        { key: PREP_STATE.LOCAL, cls: 'bg-emerald-400' },
                        { key: PREP_STATE.LOCAL_DRAFT, cls: 'bg-violet-400' },
                        { key: PREP_STATE.NEEDS_AI, cls: 'bg-sky-400' },
                        { key: PREP_STATE.BLOCKED, cls: 'bg-amber-400' },
                      ].map(({ key, cls }) => {
                        const n = ledger.totals[key] || 0;
                        if (!n) return null;
                        return <div key={key} className={cls} style={{ width: `${(n / ledger.totals.all) * 100}%` }} />;
                      })}
                    </div>

                    <ul className="space-y-1.5">
                      {ledger.sections.map((section) => {
                        const rows = ledger.bySection[section.id] || [];
                        return (
                          <li key={section.id} className="rounded-xl bg-slate-950/30 p-2.5">
                            <div className="mb-1 text-xs font-bold text-white/90">{section.title}</div>
                            <div className="flex flex-wrap gap-1.5">
                              {rows.map((row) => {
                                const tone = row.state === PREP_STATE.LOCAL
                                  ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                                  : row.state === PREP_STATE.LOCAL_DRAFT
                                    ? 'border-violet-400/30 bg-violet-400/10 text-violet-200'
                                    : row.state === PREP_STATE.NEEDS_AI
                                      ? 'border-sky-400/30 bg-sky-400/10 text-sky-200'
                                      : 'border-amber-400/30 bg-amber-400/10 text-amber-200';
                                const icon = row.state === PREP_STATE.LOCAL ? '✓'
                                  : row.state === PREP_STATE.LOCAL_DRAFT ? '📝'
                                    : row.state === PREP_STATE.NEEDS_AI ? '✦' : '⚠';
                                return (
                                  <span
                                    key={row.id}
                                    title={row.detail || row.reason || ''}
                                    className={`rounded-full border px-2 py-0.5 text-[10px] ${tone}`}
                                  >
                                    {icon} {WORK_KIND_LABELS[row.kind] || row.kind}
                                  </span>
                                );
                              })}
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    <div className="mt-2.5 text-[10px] leading-relaxed text-white/50">
                      ✓ הופק מקומית · 📝 טיוטה מקומית זמינה מהראיות (בלי AI) · ✦ אפשר להשלים ב-AI מתוך
                      הפאנל בעורך · ⚠ חסום עד שתוסיף מקור — כתיבה שם תהיה המצאה, ולכן לא תוצע.
                    </div>
                  </section>
                )}

                {hasEvidence && (
                  <section className="rounded-2xl border border-white/15 bg-white/[0.05] p-4 backdrop-blur-md">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-bold">🎛 התאמות לטיוטה המקומית</h2>
                      {proseCommands.size > 0 && (
                        <button
                          type="button"
                          onClick={() => setProseCommands(new Set())}
                          className="text-[11px] text-white/50 underline-offset-2 hover:underline"
                        >
                          נקה בחירות
                        </button>
                      )}
                    </div>
                    <p className="mb-3 text-[11px] leading-relaxed text-white/50">
                      אלה לא בקשות למודל — כל פקודה היא חוק קבוע במנוע המקומי. בחר, ואז "טיוטה מקומית".
                    </p>
                    {[...new Set(PROSE_COMMANDS.map((c) => c.cat))].map((cat) => (
                      <div key={cat} className="mb-2.5 last:mb-0">
                        <div className="mb-1 text-[11px] font-bold text-white/60">{cat}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {PROSE_COMMANDS.filter((c) => c.cat === cat).map((cmd) => {
                            const on = proseCommands.has(cmd.id);
                            return (
                              <button
                                key={cmd.id}
                                type="button"
                                onClick={() => toggleProseCommand(cmd)}
                                title={cmd.desc}
                                className={`rounded-full border px-2.5 py-1 text-[11px] transition ${on
                                  ? 'border-violet-400/60 bg-violet-400/20 text-violet-100'
                                  : 'border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10'}`}
                              >
                                {on ? '✓ ' : ''}{cmd.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </section>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleFindEvidence}
                    disabled={Boolean(busy) || !stats.chunks}
                    title={!stats.chunks ? 'העלה חומרי עזר קודם' : ''}
                    className="rounded-xl border border-white/20 px-4 py-2 text-sm font-bold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    🔎 מצא ראיות
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenInEditor}
                    disabled={Boolean(busy)}
                    className="rounded-xl border border-white/20 px-4 py-2 text-sm font-bold transition hover:bg-white/10 disabled:opacity-40"
                  >
                    פתח שלד בעורך ←
                  </button>
                  <button
                    type="button"
                    onClick={handleLocalDraft}
                    disabled={Boolean(busy) || !hasEvidence}
                    title={!hasEvidence ? 'מצא ראיות קודם — הטיוטה נבנית מהן בלבד' : 'טיוטה מהראיות בלבד — עובד גם בלי מפתח API'}
                    className="rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-2 text-sm font-bold shadow-lg transition disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    📝 טיוטה מקומית (ללא AI) ←
                  </button>
                  <button
                    type="button"
                    onClick={handleDraftWholeWork}
                    disabled={Boolean(busy) || !hasEvidence}
                    title={!hasEvidence ? 'מצא ראיות קודם — בלי מקורות אין מה לכתוב' : ''}
                    className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2 text-sm font-bold shadow-lg transition disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ✍️ כתוב את כל העבודה ←
                  </button>
                </div>
                <div className="text-[10px] leading-relaxed text-white/50">
                  הכתיבה היא <b>קריאת API אחת</b> לכל העבודה — כל סעיף מקבל את הראיות שלו,
                  והמעברים ביניהם נכתבים באותה קריאה. הביבליוגרפיה נבנית מהמקורות עצמם ולא ע"י המודל.
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {review && pendingDraft && (
        <WorkReviewDialog
          spec={spec}
          review={review}
          draft={pendingDraft}
          busy={busy}
          onApprove={handleApproveDraft}
          onCancel={() => { setPendingDraft(null); setReview(null); }}
          onFixSources={() => {
            // חיפוש המקורות עצמו חי בפאנל הראיות שבעורך, שם יש הקשר של סעיף
            // וסמן. מכאן רק מפנים לשם במקום לשכפל את הזרימה.
            setPendingDraft(null);
            setReview(null);
            setNotice({
              tone: 'warn',
              text: 'פתח את השלד בעורך וחפש מקורות לסעיף מתוך פאנל הראיות, ואז חזור לכתוב.',
            });
          }}
        />
      )}
    </div>
  );
}

function Badge({ children, tone = 'muted' }) {
  const cls = tone === 'warn'
    ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
    : 'border-white/15 bg-white/5 text-white/70';
  return <span className={`rounded-full border px-2 py-0.5 ${cls}`}>{children}</span>;
}
