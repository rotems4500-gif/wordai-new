import React from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';

/**
 * UserGuide — the in-app "מדריך למשתמש".
 *
 * Editorial card carousel driven by framer-motion: spring slide between cards,
 * drag-to-swipe (RTL-aware), staggered content reveal, hover springs. Navigate
 * with tabs, side arrows, ← → keys, or by dragging.
 *
 * Deps: framer-motion (already in package.json). Styling uses the existing
 * Wave-A Tailwind tokens (bg-brand / text-ink / text-muted / bg-surface /
 * bg-page / rounded-card …) + Phosphor icons (ph ph-*). Render inside
 * <Modal size="xl"> with modal padding cancelled (see INTEGRATION.md).
 */

/* ── data ─────────────────────────────────────────────────────────────────── */
const DAILY = [
  { k: '01', icon: 'ph-cursor-click', title: 'התחל ב-3 צעדים', body: 'מסך הבית ← נושא קצר ← «צור עם AI». זהו — יש לך טיוטה ראשונה.' },
  { k: '02', icon: 'ph-magic-wand', title: 'עדן בחלונית ה-AI', body: 'סמן קטע במסמך ובחר פעולה מהירה: תיקון, ניסוח אקדמי או האנשה.' },
  { k: '03', icon: 'ph-at', title: 'שני קיצורים ששווה לזכור', body: '@ מפעיל סוכן ייעודי · / מפעיל skill ממוקד אחד.' },
  { k: '04', icon: 'ph-export', title: 'לפני הגשה', body: 'בדיקת מרצה ← בדיקת מקוריות ← ייצוא ל-Word (DOCX) מסודר.' },
];

const TOUR = [
  { title: 'מסך הבית', body: 'מתחילים מסמך חדש — תבנית, נושא, הנחיות, חומרי עזר וטיוטת בסיס. וגם מחליטים: ישיר או דרך workspace.' },
  { title: 'מסלול ישיר', body: '«ללא סביבת עבודה» שולח את הבקשה ישירות לספק והמודל שבחרת. מצוין לטיוטות מהירות ולשכתוב נקודתי.' },
  { title: 'סביבות עבודה', body: 'workspace מפעיל צוות סוכנים מוכן מראש — מי רץ, באיזה סדר ובאיזה סגנון. בוחרים לפי המשימה, לא לפי הספק.' },
  { title: 'חלונית AI', body: 'רוב העבודה האיטרטיבית: שכתוב, קיצור, הרחבה, ליטוש ובדיקה. אפשר לצרף קבצים, והתשובות נכתבות בלייב.' },
  { title: 'סקילים ושליטה מדויקת', body: '@ מפעיל סוכן ייעודי, / מפעיל skill ממוקד, וטאב Prompt שמור להנחיות שחוזרות כמעט בכל הרצה.' },
  { title: 'סגנון אישי ופרופיל', body: '«פרופיל והגשה» מרכז onboarding ורקע, ו«סגנון אישי» מרכז דוגמאות כתיבה, כללי ניסוח והעדפות קבועות.' },
  { title: 'ליטוש, כתיבה ויצוא', body: 'טאב «כתיבה» שולט על גופנים וגדלים, ובסוף מייצאים ל-Word אמיתי בפורמט DOCX.' },
];

const CHOOSE_DIRECT = ['אתה צריך תשובה מהירה או טיוטה ראשונה.', 'אתה יודע בדיוק מה לבקש ולא צריך צוות סוכנים.', 'אתה רוצה לשלוט ישירות בספק ובמודל.'];
const CHOOSE_WS = ['המשימה מורכבת או רב-שלבית.', 'אתה רוצה מחקר, מבנה, כתיבה וליטוש מסודרים.', 'אתה רוצה workflow שלם ולא צ׳אט ישיר.'];

const WORKSPACES = [
  { n: '01', name: 'ללא סביבת עבודה', fit: 'טיוטה מהירה, ניסוח נקודתי, שאלה קצרה.', how: 'הבקשה נשלחת ישירות לספק ולמודל שבחרת.' },
  { n: '02', name: 'סטודיו תוכן', fit: 'מסמכים כלליים, דוחות, סיכומים, מכתבים.', how: 'הכללי והמאוזן ביותר. טוב להתחלה כשלא בטוחים.' },
  { n: '03', name: 'מחקר מערכת כבד', fit: 'משימות מורכבות, חקר אקדמי רחב וחזותי.', how: 'המסלול הכי עשיר ומעמיק — יותר שלבים ובקרה.' },
  { n: '04', name: 'מחקר מערכת קל', fit: 'מחקר עם מקורות ועומק, בזמן ועלות נמוכים.', how: 'דומה למסלול הכבד, אך חסכוני ומהיר יותר.' },
  { n: '05', name: 'כתיבה אקדמית מהירה', fit: 'עבודות, סמינרים וסיכומים אקדמיים.', how: 'בונה שלד אקדמי, מנסח פורמלית ומלטש.' },
  { n: '06', name: 'אקדמי מאומת', fit: 'עבודות שבהן המקורות הם ליבת המשימה.', how: 'מחקר אקדמי + משלים, ואז כתיבה ובקרת התאמה.' },
  { n: '07', name: 'מוצר ושיווק', fit: 'PRD, אפיון, הצעות ותוכן עסקי.', how: 'דגש על מבנה, בהירות, קהל יעד והגדרת הערך.' },
  { n: '08', name: 'משפטי וחוזים', fit: 'נהלים, חוזים ומסמכים בטון משפטי.', how: 'מבנה סעיפים, ניסוח זהיר ובקרת עמימות.' },
  { n: '09', name: 'ליטוש והגשה סופית', fit: 'מסמך כמעט גמור שצריך שיוף אחרון.', how: 'מבנה, אחידות ושער סופי של מוכן / לא מוכן.' },
  { n: '10', name: 'תוכן לרשתות', fit: 'פוסטים, מודעות, קרוסלות, hooks ו-CTA.', how: 'מסר חד, התאמה לפלטפורמה וקצב שיווקי.' },
];

const PROVIDERS = [
  { initial: 'G', label: 'Gemini', rec: true, desc: 'אקדמי בעברית · מהיר וחינמי' },
  { initial: 'C', label: 'Claude', desc: 'הסברים מעמיקים ובדיקת מרצה' },
  { initial: 'P', label: 'Perplexity', desc: 'איתור מקורות מאומתים מהרשת' },
  { initial: 'O', label: 'OpenAI', desc: 'GPT לכתיבה כללית' },
  { initial: 'Q', label: 'Groq', desc: 'תגובות מהירות במיוחד' },
  { initial: 'L', label: 'Ollama', desc: 'מודלים מקומיים — בלי עלות' },
];

const AI_EXAMPLES = ['תקצר את הפסקה הזאת', 'תן ניסוח אקדמי יותר', 'שפר את המבנה בלי לשנות את הטיעון', 'תן לי 3 כותרות חלופיות'];
const AT_EXAMPLES = ['@writer נסח לי פתיח חד וברור', '@researcher תן כיווני חיפוש לנושא', '@proofreader לטש לפני הגשה'];
const SLASH_EXAMPLES = ['/academic-structure בנה שלד לעבודה', '/source-hunter מילות חיפוש ל-Scholar', '/final-submission בדוק אם מוכן'];

const PROFILE = [
  { tag: 'פרופיל', icon: 'ph-identification-card', title: 'פרופיל והגשה', body: 'onboarding: שם, מוסד, חוג ותהליך הגשה. הבסיס שמכוון את כל הסוכנים.' },
  { tag: 'קבוע', icon: 'ph-fingerprint', title: 'סגנון אישי', body: 'דוגמאות כתיבה, כללי ניסוח והעדפות טון — משפיע על העבודה שלך לאורך זמן.' },
  { tag: 'נקודתי', icon: 'ph-paperclip', title: 'חומרי עזר במסך הבית', body: 'מסמכים למסמך הנוכחי בלבד. סגנון אישי = קבוע, חומרי עזר = למסמך הזה.' },
];

const RECIPES = [
  { icon: 'ph-lightning', title: 'כתיבה מהירה', steps: ['«ללא סביבת עבודה»', 'בחר ספק ומודל', 'כתוב נושא קצר', 'הרץ'] },
  { icon: 'ph-graduation-cap', title: 'עבודה אקדמית מסודרת', steps: ['«כתיבה אקדמית» או «אקדמי מאומת»', 'הוסף חומרי עזר', 'הנחיות מפורטות', 'הרץ', 'ליטוש בחלונית ה-AI'] },
  { icon: 'ph-pencil-simple', title: 'טיוטה לפני הגשה', steps: ['טען טיוטת בסיס', '«ליטוש והגשה סופית»', 'מה לתקן או לשפר', 'הרץ'] },
  { icon: 'ph-megaphone', title: 'תוכן לרשתות', steps: ['«תוכן שיווקי לרשתות»', 'פלטפורמה, קהל, מטרה, CTA', 'הרץ'] },
  { icon: 'ph-scales', title: 'מסמך משפטי', steps: ['«משפטי וחוזים»', 'מה ידוע ומה אסור להמציא', 'הרץ', 'עבור על הטקסט לפני שימוש'] },
];

const ADVANCED = [
  { emoji: '📈', title: 'עבודת SPSS', body: 'ניתוח נתונים מודרך — .sav / Excel / CSV, תחביר חכם לפי תפקיד המשתנה, זיהוי ערכי חיסר ולולאת תיקון שגיאות מ-SPSS.' },
  { emoji: '📊', title: 'סטודיו מצגות', body: 'הזן נושא — נבנה deck שקופית-אחר-שקופית. אפשר גם להפוך טיוטת בסיס לשקופיות. סגנון ומספר תחת ⚙️ הגדרות מצגת.' },
  { emoji: '🎨', title: 'שכתוב טיוטת מצגת', body: 'העלה .pptx והטקסט נכתב מחדש בקול שלך. העיצוב המקורי נשמר במלואו, עם תצוגת השוואה מקור↔משוכתב.' },
  { emoji: '🧬', title: 'האנשה אנטי-זיהוי-AI', body: 'נבדק מול מזהה AI מקומי ונכתב מחדש בלולאה עד מתחת לסף. שליטה לכל ריצה: הפעלה, סף (10–60) ומספר מעברים.' },
];

const TIPS = [
  'כתוב מטרה ברורה במשפט אחד לפני שאתה מריץ.',
  'אם המסמך מורכב — בחר workspace במקום מסלול ישיר.',
  'אם אתה צריך פעולה אחת בלבד — skill עדיף על workspace.',
  'מעדכן מסמך קיים? טיוטת בסיס כמעט תמיד עדיפה.',
  'התוצאה כללית מדי? חדד קהל יעד, טון ותוצר רצוי.',
];

/* ── motion presets ───────────────────────────────────────────────────────── */
const SPRING = { type: 'spring', stiffness: 320, damping: 32 };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } };
const rise = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } } };
const Item = (props) => <motion.div variants={rise} {...props} />;

function SubCard({ children, className = '' }) {
  return (
    <motion.div
      variants={rise}
      whileHover={{ y: -3, transition: SPRING }}
      className={`rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_1px_2px_rgba(45,52,54,.04),0_10px_30px_-12px_rgba(108,92,231,.18)] ${className}`}
    >
      {children}
    </motion.div>
  );
}

/* ── card bodies (no header — the shell renders the header) ──────────────────── */
function DailyBody() {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3.5">
      {DAILY.map((d) => (
        <SubCard key={d.k}>
          <div className="mb-2.5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl text-[18px] text-white" style={{ background: 'linear-gradient(135deg,#6c5ce7,#a29bfe)' }}>
              <i className={`ph ${d.icon}`} aria-hidden="true" />
            </span>
            <div className="text-[15px] font-bold leading-tight text-ink">{d.title}</div>
          </div>
          <p className="m-0 text-[13.5px] leading-relaxed text-muted">{d.body}</p>
        </SubCard>
      ))}
      <Item className="col-span-2 flex items-center gap-3 rounded-2xl px-5 py-3.5" style={{ background: 'linear-gradient(110deg,rgba(108,92,231,.10),rgba(162,155,254,.10))' }}>
        <i className="ph ph-lightning text-[20px] text-brand" aria-hidden="true" />
        <span className="text-[14px] leading-relaxed text-ink"><b>בקיצור:</b> <b>ישיר</b> = תשובה מהירה. <b>סביבת עבודה</b> = משימה מורכבת. מתלבטים? מתחילים ב«סטודיו תוכן».</span>
      </Item>
    </motion.div>
  );
}

function TourBody() {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="relative">
      <span className="absolute bottom-2 top-2 right-[18px] w-px bg-gradient-to-b from-brand/40 via-brand/20 to-transparent" aria-hidden="true" />
      <div className="flex flex-col gap-3.5">
        {TOUR.map((s, i) => (
          <Item key={i} className="flex items-start gap-4">
            <span className="relative z-10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white text-[15px] font-bold text-brand shadow-[0_0_0_2px_rgba(108,92,231,.35)]">{i + 1}</span>
            <div className="min-w-0 pt-1">
              <div className="text-[16px] font-bold text-ink">{s.title}</div>
              <p className="m-0 mt-0.5 max-w-2xl text-[14px] leading-relaxed text-muted">{s.body}</p>
            </div>
          </Item>
        ))}
      </div>
    </motion.div>
  );
}

function ChooseBody() {
  const cols = [
    { t: 'ללא סביבת עבודה', sub: 'מהיר וישיר', items: CHOOSE_DIRECT, icon: 'ph-arrow-right' },
    { t: 'סביבת עבודה', sub: 'צוות סוכנים', items: CHOOSE_WS, icon: 'ph-users-three' },
  ];
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-4">
      {cols.map((col) => (
        <SubCard key={col.t} className="!p-6">
          <div className="mb-4 flex items-center gap-3 border-b border-black/[0.06] pb-3.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand/10 text-[19px] text-brand"><i className={`ph ${col.icon}`} aria-hidden="true" /></span>
            <div>
              <div className="text-[16px] font-bold text-ink">{col.t}</div>
              <div className="text-[12px] text-muted">{col.sub}</div>
            </div>
          </div>
          {col.items.map((it, i) => (
            <div key={i} className="mb-2.5 flex items-start gap-2.5">
              <i className="ph ph-check mt-0.5 text-[15px] text-brand" aria-hidden="true" />
              <span className="text-[14px] leading-relaxed text-ink">{it}</span>
            </div>
          ))}
        </SubCard>
      ))}
    </motion.div>
  );
}

function WorkspacesBody() {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3">
      {WORKSPACES.map((w) => (
        <SubCard key={w.n} className="!p-4">
          <div className="mb-2 flex items-center gap-2.5">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 text-[12px] font-extrabold text-brand">{w.n}</span>
            <span className="text-[15px] font-bold text-ink">{w.name}</span>
          </div>
          <p className="m-0 text-[13px] leading-relaxed text-ink">{w.fit}</p>
          <p className="m-0 mt-1.5 border-t border-dashed border-black/[0.07] pt-1.5 text-[12.5px] leading-relaxed text-muted">{w.how}</p>
        </SubCard>
      ))}
    </motion.div>
  );
}

function ProvidersBody() {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3">
      {PROVIDERS.map((p) => (
        <SubCard key={p.label} className="flex items-center gap-3 !p-4">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl text-[16px] font-extrabold text-white" style={{ background: p.rec ? 'linear-gradient(135deg,#6c5ce7,#a29bfe)' : '#eceaf6', color: p.rec ? '#fff' : '#6c5ce7' }}>{p.initial}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-ink">{p.label}</span>
              {p.rec && <span className="rounded-pill bg-brand/10 px-2 py-0.5 text-[10.5px] font-bold text-brand">מומלץ</span>}
            </div>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{p.desc}</span>
          </div>
        </SubCard>
      ))}
    </motion.div>
  );
}

function AiBody() {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <Item className="mb-4 flex flex-wrap gap-2.5">
        {AI_EXAMPLES.map((e, i) => (
          <span key={i} className="rounded-pill border border-black/[0.06] bg-white px-4 py-2 text-[13.5px] text-ink shadow-sm">“{e}”</span>
        ))}
      </Item>
      <div className="grid grid-cols-2 gap-3.5">
        <SubCard>
          <div className="mb-1.5 flex items-center gap-2 text-[16px] font-bold text-ink"><i className="ph ph-paperclip-horizontal text-brand" aria-hidden="true" />צירוף קבצים לצ׳אט</div>
          <p className="m-0 text-[14px] leading-relaxed text-muted">צרף מסמך, תמונה או קובץ טקסט ישירות לשיחה — והשתמש בו כבסיס לשאלות.</p>
        </SubCard>
        <SubCard>
          <div className="mb-1.5 flex items-center gap-2 text-[16px] font-bold text-ink"><i className="ph ph-broadcast text-brand" aria-hidden="true" />הזרמה בלייב</div>
          <p className="m-0 text-[14px] leading-relaxed text-muted">התשובות מופיעות בזמן אמת בצ׳אט ובמסמך — בלי לחכות לסיום.</p>
        </SubCard>
      </div>
    </motion.div>
  );
}

function SkillsBody() {
  const cols = [{ s: '@', t: 'סוכן ייעודי', ex: AT_EXAMPLES }, { s: '/', t: 'skill ממוקד', ex: SLASH_EXAMPLES }];
  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <div className="grid grid-cols-2 gap-4">
        {cols.map((c) => (
          <SubCard key={c.s} className="overflow-hidden !p-0">
            <div className="flex items-center gap-2 px-5 py-3 text-[16px] font-bold text-white" style={{ background: 'linear-gradient(135deg,#6c5ce7,#a29bfe)' }}>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 font-mono">{c.s}</span>{c.t}
            </div>
            <div className="space-y-2 p-4">
              {c.ex.map((x, i) => (
                <div key={i} className="rounded-control bg-page px-3 py-2 font-mono text-[13px] text-ink" dir="ltr">{x}</div>
              ))}
            </div>
          </SubCard>
        ))}
      </div>
      <Item className="mt-4">
        <DaniAside text={<>צריך פעולה אחת בלבד? <b>skill</b> עדיף. צריך מסלול שלם של מחקר + כתיבה + ליטוש? בחר <b>workspace</b>.</>} />
      </Item>
    </motion.div>
  );
}

function ProfileBody() {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-3">
      {PROFILE.map((p) => (
        <SubCard key={p.title} className="flex items-start gap-4">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-[20px] text-brand"><i className={`ph ${p.icon}`} aria-hidden="true" /></span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-bold text-ink">{p.title}</span>
              <span className="rounded-pill bg-brand/10 px-2.5 py-0.5 text-[11px] font-bold text-brand">{p.tag}</span>
            </div>
            <p className="m-0 mt-1 text-[14px] leading-relaxed text-muted">{p.body}</p>
          </div>
        </SubCard>
      ))}
    </motion.div>
  );
}

function RecipesBody() {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3.5">
      {RECIPES.map((r) => (
        <SubCard key={r.title}>
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand/10 text-[18px] text-brand"><i className={`ph ${r.icon}`} aria-hidden="true" /></span>
            <div className="text-[16px] font-bold text-ink">{r.title}</div>
          </div>
          <div className="flex flex-col gap-2">
            {r.steps.map((st, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="flex flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-bold text-brand" style={{ height: 20, width: 20 }}>{i + 1}</span>
                <span className="text-[13.5px] leading-relaxed text-ink">{st}</span>
              </div>
            ))}
          </div>
        </SubCard>
      ))}
    </motion.div>
  );
}

function AdvancedBody() {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <div className="grid grid-cols-2 gap-3.5">
        {ADVANCED.map((a) => (
          <SubCard key={a.title}>
            <div className="mb-2 flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand/[0.07] text-[22px] leading-none">{a.emoji}</span>
              <span className="text-[15.5px] font-bold text-ink">{a.title}</span>
            </div>
            <p className="m-0 text-[13.5px] leading-relaxed text-muted">{a.body}</p>
          </SubCard>
        ))}
      </div>
      <Item className="mt-4 flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3.5">
        <i className="ph ph-warning mt-0.5 text-[19px] text-warn" aria-hidden="true" />
        <span className="text-[14px] leading-relaxed text-ink">אל תעלה קובץ <b>.spv</b> — הוא בינארי ולא קריא. ייצא מ-SPSS ל-Word / Excel / HTML, או העתק את הטבלאות כטקסט.</span>
      </Item>
    </motion.div>
  );
}

function TipsBody() {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <Item className="mb-5 grid grid-cols-1 gap-2.5">
        {TIPS.map((tip, i) => (
          <div key={i} className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(45,52,54,.04)]">
            <i className="ph ph-check-circle mt-0.5 text-[18px] text-brand" aria-hidden="true" />
            <span className="text-[14.5px] leading-relaxed text-ink">{tip}</span>
          </div>
        ))}
      </Item>
      <Item className="overflow-hidden rounded-2xl p-7 text-white" style={{ background: 'linear-gradient(135deg,#6c5ce7,#8b7ff0 55%,#a29bfe)' }}>
        <div className="mb-2 flex items-center gap-2.5 text-[20px] font-bold"><i className="ph ph-compass text-[24px]" aria-hidden="true" />אם הלכת לאיבוד</div>
        <p className="m-0 text-[15px] leading-relaxed text-white/95">המסלול הכי פשוט: <b>מסך הבית</b> ← נושא קצר ← «ללא סביבת עבודה» או «סטודיו תוכן» ← <b>יצירה</b> ← ליטוש בחלונית ה-AI. ולעומק — הסיור החי תחת <b>הגדרות ← מדריך</b>.</p>
      </Item>
    </motion.div>
  );
}

function DaniAside({ text }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[16px] font-bold text-white" style={{ background: 'linear-gradient(135deg,#6c5ce7,#a29bfe)' }}>ד</span>
      <div className="relative rounded-2xl rounded-tr-sm bg-brand/[0.07] px-4 py-2.5">
        <div className="mb-0.5 text-[11.5px] font-bold text-brand">דני אומר</div>
        <p className="m-0 text-[14px] leading-relaxed text-ink">{text}</p>
      </div>
    </div>
  );
}

/* ── sections meta ────────────────────────────────────────────────────────── */
const SECTIONS = [
  { id: 'daily', tab: 'מדריך כיס', kicker: 'מדריך כיס', icon: 'ph-rocket-launch', title: 'ליום יום, בקצרה', lead: 'אם אתה כבר מכיר את WordFlow — זה כל מה שצריך כדי לעבוד מהר.', dani: 'ארבעה כרטיסים, ואתה בעניינים.', Body: DailyBody },
  { id: 'tour', tab: 'הסיור', kicker: 'הסיור המודרך', icon: 'ph-map-trifold', title: 'שבע תחנות, מההתחלה ועד הסוף', lead: 'אותו סיור מחכה גם בתוכנה, תחת הגדרות ← מדריך.', dani: 'נלך יחד תחנה-תחנה, בלי למהר.', Body: TourBody },
  { id: 'choose', tab: 'ישיר/סביבה', kicker: 'ההחלטה החשובה', icon: 'ph-signpost', title: 'ישיר מול סביבת עבודה', lead: 'ככל שהמשימה מורכבת יותר — כך כדאי לתת ל-workspace לעבוד בשבילך.', dani: 'מתלבט? תתחיל ישיר, תמיד אפשר לשדרג.', Body: ChooseBody },
  { id: 'workspaces', tab: 'סביבות', kicker: 'הספרייה המלאה', icon: 'ph-squares-four', title: 'כל סביבות העבודה', lead: 'עשר סביבות, לכל סוג משימה — למה כל אחת מתאימה ומה היא עושה.', dani: 'לא לפי שם הספק — לפי סוג המשימה.', Body: WorkspacesBody },
  { id: 'providers', tab: 'ספקים', kicker: 'מנועי ה-AI', icon: 'ph-plugs-connected', title: 'ספקים ומודלים', lead: 'במסלול הישיר אתה בוחר; ב-workspace זה נקבע לפי צוות הסוכנים.', dani: 'לעברית אקדמית — קל להתחיל מ-Gemini.', Body: ProvidersBody },
  { id: 'ai', tab: 'חלונית AI', kicker: 'בן הלוויה', icon: 'ph-sparkle', title: 'חלונית ה-AI', lead: 'כתוב בקשה בשפה חופשית — והטקסט נכתב בלייב, בצ׳אט ובמסמך.', dani: 'תדבר אליי כמו לחבר, לא כמו למכונה.', Body: AiBody },
  { id: 'skills', tab: 'סקילים', kicker: 'שליטה מדויקת', icon: 'ph-terminal-window', title: 'סקילים: @ ו-/', lead: '@ מפעיל סוכן ייעודי, / מפעיל skill ממוקד אחד.', dani: 'שני תווים שחוסכים המון הקלדה.', Body: SkillsBody },
  { id: 'profile', tab: 'פרופיל', kicker: 'שיהיה כמוך', icon: 'ph-user-focus', title: 'פרופיל, סגנון אישי וחומרי עזר', lead: 'ככל שתספר למערכת יותר עליך — היא תכתוב יותר כמוך.', dani: 'כמה דקות עכשיו = טקסט הרבה יותר שלך.', Body: ProfileBody },
  { id: 'recipes', tab: 'מסלולים', kicker: 'מתכונים', icon: 'ph-list-checks', title: 'מסלולי עבודה מומלצים', lead: 'חמישה מתכונים מוכנים. בחר את זה שמתאים, ועקוב אחרי הצעדים.', dani: 'כמו מתכון — צעד אחרי צעד.', Body: RecipesBody },
  { id: 'advanced', tab: 'מתקדם', kicker: 'מעבר למסמכים', icon: 'ph-flask', title: 'כלים מתקדמים', lead: 'שלושה סטודיו ייעודיים ומנגנון האנשה חדש.', dani: 'זה כבר לא רק מעבד תמלילים.', Body: AdvancedBody },
  { id: 'tips', tab: 'טיפים', kicker: 'לפני שנפרדים', icon: 'ph-lightbulb', title: 'טיפים לעבודה טובה יותר', lead: 'כמה הרגלים קטנים שמשנים את כל התוצאה.', dani: 'ואם הלכת לאיבוד — תמיד יש דרך חזרה.', Body: TipsBody },
];

/* ── carousel shell ───────────────────────────────────────────────────────── */
export default function UserGuide() {
  const [index, setIndex] = React.useState(0);
  const n = SECTIONS.length;
  const tabsRef = React.useRef(null);
  const viewportRef = React.useRef(null);
  const [vw, setVw] = React.useState(0);
  const x = useMotionValue(0);
  const drag = React.useRef({ x: 0, y: 0, axis: null, active: false });
  const goTo = React.useCallback((i) => setIndex(Math.max(0, Math.min(n - 1, i))), [n]);

  React.useLayoutEffect(() => {
    const el = viewportRef.current; if (!el) return undefined;
    const measure = () => setVw(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => { if (!vw) return undefined; const c = animate(x, -index * vw, SPRING); return () => c.stop(); }, [index, vw, x]);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index + 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, goTo]);

  React.useEffect(() => {
    const bar = tabsRef.current; const btn = bar?.querySelector(`[data-tab="${index}"]`);
    if (bar && btn) {
      const L = btn.offsetLeft, R = L + btn.offsetWidth;
      if (L < bar.scrollLeft) bar.scrollLeft = L - 12;
      else if (R > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = R - bar.clientWidth + 12;
    }
  }, [index]);

  const onPointerDown = (e) => { drag.current = { x: e.clientX, y: e.clientY, axis: null, active: true }; };
  const onPointerMove = (e) => {
    const d = drag.current; if (!d.active) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) d.axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    if (d.axis === 'h') {
      e.preventDefault();
      const base = -index * vw;
      const lim = ((index === 0 && dx > 0) || (index === n - 1 && dx < 0)) ? dx * 0.3 : dx;
      x.set(base + lim);
    }
  };
  const onPointerUp = (e) => {
    const d = drag.current; if (!d.active) return; d.active = false;
    if (d.axis === 'h') {
      const dx = e.clientX - d.x;
      if (dx <= -80) goTo(index + 1);
      else if (dx >= 80) goTo(index - 1);
      else animate(x, -index * vw, SPRING);
    }
  };

  return (
    <div dir="rtl" className="flex h-[80vh] flex-col bg-page text-ink">
      {/* intro */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-black/5 bg-white px-6 py-3.5">
        <motion.span
          initial={{ rotate: -12, scale: 0.9 }} animate={{ rotate: 0, scale: 1 }} transition={SPRING}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[17px] font-bold text-white" style={{ background: 'linear-gradient(135deg,#6c5ce7,#a29bfe)' }}>ד</motion.span>
        <p className="m-0 text-[14px] leading-relaxed text-muted">היי, אני <b className="text-ink">דני</b>. כל נושא הוא כרטיסייה — החלק או השתמש בחיצים כדי לעבור.</p>
      </div>

      {/* tabs */}
      <div ref={tabsRef} className="flex flex-shrink-0 gap-1.5 overflow-x-auto border-b border-black/5 bg-white px-4 py-2.5" style={{ scrollbarWidth: 'none' }}>
        {SECTIONS.map((s, i) => (
          <button key={s.id} data-tab={i} type="button" onClick={() => goTo(i)}
            className={`flex flex-shrink-0 items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[13px] font-semibold transition ${i === index ? 'text-white shadow-sm' : 'text-muted hover:bg-black/[0.05]'}`}
            style={i === index ? { background: 'linear-gradient(135deg,#6c5ce7,#a29bfe)' } : undefined}>
            <i className={`ph ${s.icon} text-[14px]`} aria-hidden="true" />{s.tab}
          </button>
        ))}
      </div>

      {/* carousel */}
      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <motion.div className="flex h-full" style={{ x, width: vw ? n * vw : '100%' }}>
          {SECTIONS.map((sec, i) => {
            const SBody = sec.Body;
            return (
              <div key={sec.id} className="h-full overflow-y-auto" style={{ width: vw || '100%', flexShrink: 0 }}>
                <div className="relative mx-auto max-w-3xl px-8 py-7">
                  <span aria-hidden="true" className="pointer-events-none absolute left-4 top-0 select-none font-black leading-none text-brand/[0.06]" style={{ fontSize: 150 }}>{String(i + 1).padStart(2, '0')}</span>
                  <motion.div variants={stagger} initial="hidden" animate="show" className="relative mb-6">
                    <motion.div variants={rise} className="mb-3 flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-[20px] text-white shadow-[0_8px_20px_-6px_rgba(108,92,231,.6)]" style={{ background: 'linear-gradient(135deg,#6c5ce7,#a29bfe)' }}><i className={`ph ${sec.icon}`} aria-hidden="true" /></span>
                      <span className="rounded-pill bg-brand/10 px-3 py-1 text-[12.5px] font-bold text-brand">{sec.kicker}</span>
                    </motion.div>
                    <motion.h3 variants={rise} className="m-0 text-[30px] font-extrabold leading-tight text-ink">{sec.title}</motion.h3>
                    <motion.p variants={rise} className="m-0 mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{sec.lead}</motion.p>
                    <motion.div variants={rise} className="mt-4"><DaniAside text={sec.dani} /></motion.div>
                  </motion.div>
                  <SBody />
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* arrows */}
        <NavArrow side="right" icon="ph-caret-right" hidden={index === 0} onClick={() => goTo(index - 1)} label="הקודם" />
        <NavArrow side="left" icon="ph-caret-left" hidden={index === n - 1} onClick={() => goTo(index + 1)} label="הבא" />
      </div>

      {/* footer */}
      <div className="flex flex-shrink-0 items-center justify-between gap-4 border-t border-black/5 bg-white px-6 py-3">
        <div className="flex items-center gap-1.5">
          {SECTIONS.map((_, i) => (
            <button key={i} type="button" onClick={() => goTo(i)} aria-label={`כרטיסייה ${i + 1}`}>
              <motion.span className="block rounded-pill" animate={{ width: i === index ? 22 : 7, backgroundColor: i === index ? '#6c5ce7' : 'rgba(0,0,0,.14)' }} transition={SPRING} style={{ height: 7 }} />
            </button>
          ))}
        </div>
        <span className="text-[13px] font-semibold text-muted">{index + 1} / {n} · {SECTIONS[index].tab}</span>
      </div>
    </div>
  );
}

function NavArrow({ side, icon, hidden, onClick, label }) {
  return (
    <motion.button
      type="button" onClick={onClick} aria-label={label}
      initial={false} animate={{ opacity: hidden ? 0 : 1, scale: hidden ? 0.8 : 1 }}
      whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }} transition={SPRING}
      className={`absolute top-1/2 ${side === 'right' ? 'right-3' : 'left-3'} flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-black/5 bg-white text-brand shadow-md ${hidden ? 'pointer-events-none' : ''}`}
    >
      <i className={`ph ${icon} text-[20px]`} aria-hidden="true" />
    </motion.button>
  );
}
