import React, { useEffect, useRef, useState } from "react";
import ProfileOnboarding from './ProfileOnboarding';
import {
  getProviderConfig,
  saveProviderConfig,
  getShortcutsConfig,
  saveShortcutsConfig,
  getRoleAgents,
  saveRoleAgents,
  getAssistantBehavior,
  saveAssistantBehavior,
  getWordPreferences,
  saveWordPreferences,
  getPersonalStyleProfile,
  savePersonalStyleProfile,
  getWorkspaceAutomation,
  saveWorkspaceAutomation,
  getWorkspaceAgentPresets,
  buildWorkspaceAgentPreset,
  getAgentDebugLogs,
  clearAgentDebugLogs,
  getLatestAgentRunSummary,
  getSkillCatalog,
  getSkillsConfig,
  saveSkillsConfig,
  getAppMemory,
  clearAppMemory,
  testProviderConnection,
} from "./services/aiService";
import { loadProjectMaterials, saveHelperMaterial, syncLearnedStyleFromWorkspace, MATERIAL_UPLOAD_PRESETS, getMaterialUploadMeta } from "./services/workspaceLearningService";

// ─── ספקים נפוצים לדוגמה ───
const POPULAR_CUSTOM = [
  { name: 'Groq (מהיר ובחינם)',    url: 'https://api.groq.com/openai/v1',         note: 'מפתח חינמי ב-console.groq.com',           model: 'llama-3.3-70b-versatile',              keyNote: 'מתחיל ב-gsk_' },
  { name: 'Mistral AI',             url: 'https://api.mistral.ai/v1',               note: 'מפתח ב-console.mistral.ai',               model: 'mistral-large-latest',                 keyNote: 'מפתח אלפאנומרי' },
  { name: 'Perplexity',             url: 'https://api.perplexity.ai',               note: 'מפתח ב-perplexity.ai/settings/api',       model: 'sonar-pro',    keyNote: 'מתחיל ב-pplx-' },
  { name: 'Together.ai',            url: 'https://api.together.xyz/v1',             note: 'מפתח ב-api.together.ai',                   model: 'meta-llama/Llama-3-70b-chat-hf',       keyNote: 'מפתח ארוך' },
  { name: 'DeepSeek',               url: 'https://api.deepseek.com/v1',             note: 'מפתח ב-platform.deepseek.com',             model: 'deepseek-chat',                        keyNote: 'מתחיל ב-sk-' },
  { name: 'Ollama (מקומי - חינם)', url: 'http://localhost:11434/v1',              note: 'הורד מ-ollama.com — ✅ לא דורש מפתח',    model: 'llama3.2',                             keyNote: 'ריק (לא נדרש)' },
  { name: 'LM Studio (מקומי)',      url: 'http://localhost:1234/v1',               note: 'הורד מ-lmstudio.ai — ✅ לא דורש מפתח',  model: 'loaded-model',                         keyNote: 'ריק (לא נדרש)' },
];

const PROVIDER_MODEL_OPTIONS = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash'],
  openai: ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini'],
  claude: ['claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-7'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  perplexity: ['sonar-pro', 'sonar', 'sonar-reasoning-pro'],
  ollama: ['llama3.2', 'qwen2.5', 'mistral'],
  custom: ['deepseek-chat', 'mistral-large-latest', 'loaded-model'],
};

const DEFAULT_FONT_OPTIONS = ['Alef', 'Heebo', 'Assistant', 'Frank Ruhl Libre', 'Miriam Libre', 'Arial', 'Calibri', 'David', 'Georgia', 'Segoe UI', 'Tahoma', 'Times New Roman'];

const ACTION_VISIBILITY_OPTIONS = [
  { id: 'fix', label: 'תיקון מהיר', hint: 'כתיב, דקדוק וליטוש' },
  { id: 'summary', label: 'סיכום', hint: 'תקציר קצר של הקטע' },
  { id: 'academic', label: 'אקדמי', hint: 'ניסוח רשמי ומובנה' },
  { id: 'humanize', label: 'האנשה', hint: 'ריכוך ושפה טבעית יותר' },
  { id: 'organize', label: 'ארגון', hint: 'סידור מבנה ורצף' },
  { id: 'textToTable', label: 'המרה לטבלה', hint: 'כשהקטע מתאים להצגה טבלאית' },
  { id: 'expand', label: 'הרחבה', hint: 'הוספת עומק ודוגמאות' },
  { id: 'bullets', label: 'רשימת נקודות', hint: 'הפיכה לרשימה ברורה' },
  { id: 'shorter', label: 'קיצור', hint: 'צמצום בלי לאבד משמעות' },
  { id: 'continue', label: 'המשך כתיבה', hint: 'יצירת המשך חדש' },
  { id: 'intro', label: 'מבוא', hint: 'פתיחה למסמך' },
  { id: 'conclusion', label: 'מסקנה', hint: 'סיום חד וברור' },
  { id: 'sources', label: 'מקורות', hint: 'הצעת כיווני חיפוש' },
  { id: 'translate', label: 'תרגום לאנגלית', hint: 'המרת הקטע לאנגלית' },
];

const SETTINGS_TAB_GROUPS = [
  {
    title: 'התחלה ועזרה',
    tabs: [['guide', '📘 מדריך'], ['assistant', '✨ עוזר'], ['updates', '⬆️ עדכונים']],
  },
  {
    title: 'AI וצוות עבודה',
    tabs: [['ai', '🤖 מנועי AI'], ['skills', '🧠 סקילים'], ['agents', '🧩 סוכנים']],
  },
  {
    title: 'כתיבה והתאמה אישית',
    tabs: [['onboarding', '🎯 פרופיל אישי'], ['writing', '✍️ כתיבה'], ['personal', '📝 סגנון אישי'], ['appearance', '🎨 מראה']],
  },
  {
    title: 'תחזוקה ולוגים',
    tabs: [['debug', '🪵 לוגים']],
  },
];

const mergeUniqueStrings = (values = []) => [...new Set((Array.isArray(values) ? values : [values])
  .flatMap((item) => (Array.isArray(item) ? item : [item]))
  .map((item) => String(item || '').trim())
  .filter(Boolean))];

const mergePersonalStyleForSave = (draft = {}) => {
  const live = getPersonalStyleProfile();
  return finalizePersonalProfile({
    ...live,
    ...draft,
    learnedVocabularyCounts: live.learnedVocabularyCounts || {},
    learnedPhraseCounts: live.learnedPhraseCounts || {},
    learnedVocabulary: live.learnedVocabulary || [],
    learnedPhrases: live.learnedPhrases || [],
    learnedNotes: live.learnedNotes || [],
    learnedSentencePatterns: live.learnedSentencePatterns || [],
    preferredConnectors: live.preferredConnectors || [],
    preferredSentenceOpeners: live.preferredSentenceOpeners || [],
    toneDescriptors: live.toneDescriptors || [],
    styleFingerprint: live.styleFingerprint || {},
    scannedSourceIds: live.scannedSourceIds || [],
    scanStats: live.scanStats || {},
    autoLearnedFromEditorAt: live.autoLearnedFromEditorAt || '',
    lastAutoLearnedSignature: live.lastAutoLearnedSignature || '',
    autoLearnedVocabularyCounts: live.autoLearnedVocabularyCounts || {},
    autoLearnedPhraseCounts: live.autoLearnedPhraseCounts || {},
  });
};

const STYLE_TRAINING_QUESTIONS = [
  {
    id: 'tone',
    title: 'איזה ניסוח מרגיש יותר אתה?',
    options: [
      { id: 'formal', label: 'אפשרות א', text: 'בהתאם לממצאים, ניתן להסיק כי יש חשיבות להמשך בחינה מדויקת של הנושא.', insight: 'מעדיף ניסוח רשמי, נקי ומדויק.', avoid: 'סלנג או קלילות מוגזמת' },
      { id: 'natural', label: 'אפשרות ב', text: 'מהממצאים די ברור שכדאי להמשיך לבדוק את הנושא בצורה מסודרת.', insight: 'מעדיף שפה טבעית, ישירה ונגישה.', avoid: 'ניסוח כבד ומרוחק מדי' },
    ],
  },
  {
    id: 'depth',
    title: 'איזו רמת פירוט מתאימה יותר?',
    options: [
      { id: 'concise', label: 'אפשרות א', text: 'לסיכום, ההצעה תחסוך זמן ותשפר את רצף העבודה.', insight: 'מעדיף ניסוח תמציתי ומהיר לקריאה.', avoid: 'הרחבות ארוכות שלא מוסיפות ערך' },
      { id: 'rich', label: 'אפשרות ב', text: 'לסיכום, ההצעה צפויה לחסוך זמן, לשפר את רצף העבודה וליצור חוויית שימוש מדויקת וברורה יותר לאורך התהליך.', insight: 'מעדיף עומק והשלמת רעיונות לפני סיום.', avoid: 'משפטים קצרים מדי בלי הקשר' },
    ],
  },
  {
    id: 'structure',
    title: 'איזה מבנה קריאה נוח יותר עבורך?',
    options: [
      { id: 'structured', label: 'אפשרות א', text: 'המסמך יכלול: מטרה, שלבים, סיכונים והמלצה סופית.', insight: 'מעדיף מבנה מאורגן עם נקודות וכותרות ברורות.', avoid: 'פסקאות זורמות בלי היררכיה' },
      { id: 'flowing', label: 'אפשרות ב', text: 'המסמך ייפתח בהסבר קצר, ימשיך לניתוח מרכזי ויסתיים בהמלצה טבעית ורציפה.', insight: 'מעדיף זרימה טבעית ופחות רשימות נוקשות.', avoid: 'עודף כותרות ונקודות טכניות' },
    ],
  },
  {
    id: 'assertiveness',
    title: 'איזה סיום נשמע לך נכון יותר?',
    options: [
      { id: 'soft', label: 'אפשרות א', text: 'נראה שכדאי לשקול את ההצעה הזו בזהירות ובהתאם לצורך.', insight: 'מעדיף טון זהיר, מאוזן ולא תוקפני.', avoid: 'קביעות חדות מדי' },
      { id: 'direct', label: 'אפשרות ב', text: 'ההצעה הזו היא הכיוון הנכון וצריך לקדם אותה כבר עכשיו.', insight: 'מעדיף טון החלטי, חד ובטוח.', avoid: 'זהירות יתר וניסוח מהוסס' },
    ],
  },
  {
    id: 'linguistic_register',
    title: 'איזו רמה לשונית נשמעת לך נכון יותר?',
    options: [
      { id: 'academic', label: 'אקדמי', text: 'ניתוח הממצאים מעיד על מגמה ברורה הדורשת התייחסות מעמיקה בספרות המקצועית.', insight: 'מעדיף שפה אקדמית, מינוח מקצועי ומדויק.', avoid: 'שפה יומיומית ומינוח לא מקצועי' },
      { id: 'standard', label: 'תקנית', text: 'הממצאים מראים מגמה ברורה שחשוב להתייחס אליה בצורה מסודרת.', insight: 'מעדיף שפה תקנית, תקינה ומאוזנת.', avoid: 'ז\'רגון אקדמי כבד מדי' },
      { id: 'conversational', label: 'שיחתית', text: 'רואים בבירור מגמה מעניינת — שווה לחשוב על זה ולדון בה.', insight: 'מעדיף שפה שיחתית, נגישה וקרובה לקורא.', avoid: 'ניסוח רשמי מדי שמרחיק את הקורא' },
    ],
  },
];

const buildLearningGameProfilePatch = (answers = {}) => {
  const selectedOptions = STYLE_TRAINING_QUESTIONS
    .map((question) => question.options.find((option) => option.id === answers[question.id]))
    .filter(Boolean);

  const insights = mergeUniqueStrings(selectedOptions.map((option) => option.insight)).slice(0, 8);
  const preferredTrainingExamples = selectedOptions.map((option) => option.text).slice(0, 4);
  const dislikedStylePatterns = mergeUniqueStrings(selectedOptions.map((option) => option.avoid)).slice(0, 8);
  const linguisticInsight = answers['linguistic_register']
    ? (STYLE_TRAINING_QUESTIONS.find(q => q.id === 'linguistic_register')?.options.find(o => o.id === answers['linguistic_register'])?.insight || '')
    : '';

  return {
    learningGameAnswers: answers,
   learningGamesCompletedAt: Object.keys(answers).filter(k => answers[k]).length >= STYLE_TRAINING_QUESTIONS.length ? new Date().toISOString() : '',
    learningGameInsights: insights,
   styleTrainingSummary: [...insights, ...(linguisticInsight ? [linguisticInsight] : [])].join(' '),
   linguisticRegisterPreference: answers['linguistic_register'] || '',
    preferredTrainingExamples,
    dislikedStylePatterns,
  };
};

const linkifyText = (text = '') => {
  const value = String(text || '');
  const parts = value.split(/(https?:\/\/[^\s)]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)]*)?)/gi);

  return parts.map((part, index) => {
    const trimmed = String(part || '').trim();
    if (!trimmed) return <React.Fragment key={index}>{part}</React.Fragment>;
    const isLink = /^(https?:\/\/|(?:[a-z0-9-]+\.)+[a-z]{2,})/i.test(trimmed);
    if (!isLink) return <React.Fragment key={index}>{part}</React.Fragment>;

    const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return (
      <a key={index} href={href} target="_blank" rel="noreferrer"
        style={{ color: '#2B579A', textDecoration: 'underline', wordBreak: 'break-all' }}>
        {trimmed}
      </a>
    );
  });
};

// ─── שדה קלט עם toggle לסיסמה ───
function FieldRow({ label, type = 'text', placeholder, value, onChange, hint }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, color: '#605E5C', display: 'block', marginBottom: 3, fontWeight: 500 }}>{label}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type={type === 'password' && !show ? 'password' : 'text'}
          placeholder={placeholder} value={value || ''}
          onChange={e => onChange(e.target.value)}
          style={{ flex: 1, padding: '7px 10px', border: '1px solid #C8C6C4', borderRadius: 4, fontSize: 12, direction: 'ltr', fontFamily: 'monospace', outline: 'none' }} />
        {type === 'password' && (
          <button type="button" onClick={() => setShow(v => !v)} style={{ padding: '0 10px', border: '1px solid #C8C6C4', borderRadius: 4, background: 'white', cursor: 'pointer', fontSize: 12 }}>
            {show ? '🙈' : '👁️'}
          </button>
        )}
      </div>
      {hint && <div style={{ fontSize: 10, color: '#919191', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

// ─── כפתור בדיקת תקינות API ───
function ApiTestButton({ providerId, providerConfig }) {
  const [status, setStatus] = useState(null); // null | 'loading' | 'ok' | 'fail'
  const [resultText, setResultText] = useState('');

  const handleTest = async () => {
    setStatus('loading');
    setResultText('');
    try {
      const result = await testProviderConnection(providerId, providerConfig);
      if (result.ok) {
        setStatus('ok');
        const modelLabel = result.model ? ` (${result.model})` : '';
        const tried = result.triedModels.length > 1 ? ` · ניסה ${result.triedModels.length} מודלים` : '';
        setResultText(`✅ מחובר${modelLabel}${tried}`);
      } else {
        setStatus('fail');
        const tried = result.triedModels.length ? ` · נוסו: ${result.triedModels.join(', ')}` : '';
        setResultText(`❌ נכשל: ${result.error}${tried}`);
      }
    } catch (e) {
      setStatus('fail');
      setResultText(`❌ ${e?.message || 'שגיאה לא ידועה'}`);
    }
  };

  const btnColor = status === 'ok' ? '#D1FAE5' : status === 'fail' ? '#FEE2E2' : '#F1F5F9';
  const btnBorder = status === 'ok' ? '#6EE7B7' : status === 'fail' ? '#FCA5A5' : '#CBD5E1';
  const btnTextColor = status === 'ok' ? '#065F46' : status === 'fail' ? '#991B1B' : '#334155';

  return (
    <div style={{ marginTop: 4 }}>
      <button
        type="button"
        onClick={handleTest}
        disabled={status === 'loading'}
        style={{ fontSize: 11, padding: '4px 10px', background: btnColor, color: btnTextColor, border: `1px solid ${btnBorder}`, borderRadius: 6, cursor: status === 'loading' ? 'wait' : 'pointer', transition: 'all 0.15s' }}
      >
        {status === 'loading' ? '⏳ בודק...' : '🔌 בדוק חיבור'}
      </button>
      {resultText && (
        <div style={{ marginTop: 4, fontSize: 11, color: status === 'ok' ? '#065F46' : '#991B1B', lineHeight: 1.5, direction: 'rtl' }}>
          {resultText}
        </div>
      )}
    </div>
  );
}

// ─── קטע ספק ───
const isProviderConfigured = (config, providerId) => {
  const provider = config?.[providerId] || {};
  switch (providerId) {
    case 'gemini':
    case 'openai':
    case 'claude':
    case 'groq':
    case 'perplexity':
    case 'scholar':
      return Boolean(String(provider.key || '').trim());
    case 'ollama':
      return Boolean(String(provider.baseUrl || '').trim() && String(provider.model || '').trim());
    case 'custom':
      return Boolean(String(provider.baseUrl || '').trim() && String(provider.model || '').trim());
    default:
      return false;
  }
};

function ProviderSection({ title, icon, description, active, configured, onActivate, children, allowActivate = true }) {
  const [expanded, setExpanded] = useState(active || configured);

  useEffect(() => {
    if (active) setExpanded(true);
  }, [active]);

  return (
    <div style={{ border: `2px solid ${active ? '#2B579A' : '#E1DFDD'}`, borderRadius: 10, padding: '10px 12px', marginBottom: 10, background: active ? '#FAFCFF' : 'white', transition: 'all 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#323130' }}>{title}</span>
          {active && <span style={{ fontSize: 10, background: '#2B579A', color: 'white', padding: '2px 8px', borderRadius: 10 }}>ברירת מחדל</span>}
          {configured && <span style={{ fontSize: 10, background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: 10 }}>מוגדר</span>}
          {!configured && <span style={{ fontSize: 10, background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 10 }}>חסר מפתח/הגדרה</span>}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            style={{ fontSize: 11, padding: '4px 10px', background: 'white', color: '#334155', border: '1px solid #CBD5E1', borderRadius: 6, cursor: 'pointer' }}
          >
            {expanded ? 'הסתר פרטים' : 'הצג פרטים'}
          </button>
          {allowActivate && (
            <button onClick={onActivate}
              disabled={!configured}
              style={{ fontSize: 11, padding: '4px 12px', background: active ? '#E1DFDD' : '#2B579A', color: active ? '#605E5C' : 'white', border: 'none', borderRadius: 6, cursor: !configured ? 'not-allowed' : 'pointer', opacity: !configured ? 0.55 : 1 }}>
              {active ? 'ברירת מחדל פעילה' : 'קבע כברירת מחדל'}
            </button>
          )}
        </div>
      </div>

      {expanded ? (
        <>
          {description && <p style={{ fontSize: 11, color: '#605E5C', marginBottom: 10, marginTop: 8 }}>{linkifyText(description)}</p>}
          <div>{children}</div>
        </>
      ) : (
        <div style={{ fontSize: 10, color: '#64748B', marginTop: 8, lineHeight: 1.6, opacity: 0.9 }}>
          {configured ? 'הספק מוכן לעבודה. אפשר לפתוח כדי לראות או לערוך את ההגדרות.' : 'פתח את הכרטיס כדי להגדיר מפתח API, כתובת או מודל.'}
        </div>
      )}
    </div>
  );
}

// ─── הגדרות AI ───
function AiSettings({ config, setConfig }) {
  const [showCustomHelp, setShowCustomHelp] = useState(false);
  const update = (provider, field, value) =>
    setConfig(prev => ({ ...prev, [provider]: { ...prev[provider], [field]: value } }));
  const updateToolLink = (toolId, field, value) =>
    setConfig((prev) => ({
      ...prev,
      toolLinks: {
        ...(prev.toolLinks || {}),
        [toolId]: {
          ...(prev.toolLinks?.[toolId] || {}),
          [field]: value,
        },
      },
    }));
  const activate = (id) => setConfig(prev => ({
    ...prev,
    active: id,
    activeProviders: [id, ...Array.from(new Set([...(Array.isArray(prev.activeProviders) ? prev.activeProviders : [prev.active]), id].filter(Boolean))).filter((providerId) => providerId !== id)],
  }));
  const selectedProviders = new Set(Array.isArray(config.activeProviders) && config.activeProviders.length ? config.activeProviders : [config.active]);
  const toggleMultiProvider = (providerId) => {
    setConfig((prev) => {
      const current = new Set(Array.isArray(prev.activeProviders) && prev.activeProviders.length ? prev.activeProviders : [prev.active]);
      if (current.has(providerId)) {
        if (current.size === 1) return prev;
        current.delete(providerId);
      } else {
        current.add(providerId);
      }
      const nextProviders = Array.from(current);
      return {
        ...prev,
        activeProviders: nextProviders,
        active: current.has(prev.active) ? prev.active : nextProviders[0],
      };
    });
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 12, lineHeight: 1.6 }}>
        אפשר לשמור כמה מנועי AI במקביל. במסך הזה יש רק <strong>ברירת מחדל אחת</strong>, אבל בתוך סוכני התפקיד אפשר לבחור מנוע אחר לכל סוכן וכך לעבוד עם כמה מודלים יחד.
      </p>

      <div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '10px 12px', background: '#F8FBFF', marginBottom: 12, fontSize: 11, color: '#1E3A8A', lineHeight: 1.7 }}>
        לדוגמה: אפשר להפעיל ביחד Gemini + Claude, וכל בקשה תעבור דרך שניהם ואז תאוחד לתשובה אחת.
      </div>

      <div style={{ border: '1px solid #D1FAE5', borderRadius: 12, padding: '12px', background: '#F0FDF4', marginBottom: 18 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#166534', fontWeight: 700, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={config.multiModelEnabled === true}
            onChange={(e) => setConfig((prev) => ({
              ...prev,
              multiModelEnabled: e.target.checked,
              activeProviders: Array.from(new Set([...(Array.isArray(prev.activeProviders) ? prev.activeProviders : [prev.active]), prev.active].filter(Boolean))),
            }))}
          />
          הפעל מצב Multi-Model
        </label>

        <div style={{ fontSize: 11, color: '#166534', lineHeight: 1.7, marginBottom: 8 }}>
          סמן כאן כמה מנועים שירוצו על אותה בקשה. מנוע ברירת המחדל יבצע גם את האיחוד הסופי של התוצאה.
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {[
            ['gemini', 'Gemini'],
            ['claude', 'Claude'],
            ['openai', 'OpenAI'],
            ['groq', 'Groq'],
            ['perplexity', 'Perplexity'],
            ['ollama', 'Ollama'],
            ['custom', config.custom?.name || 'Custom'],
          ].map(([providerId, label]) => {
            const configured = isProviderConfigured(config, providerId);
            const isSelected = selectedProviders.has(providerId);
            const isDisabled = !configured && !isSelected;
            return (
              <label key={providerId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: isDisabled ? '#64748B' : '#14532D', background: 'white', border: `1px solid ${isDisabled ? '#E5E7EB' : '#BBF7D0'}`, borderRadius: 999, padding: '6px 10px', opacity: isDisabled ? 0.7 : 1 }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isDisabled}
                  onChange={() => toggleMultiProvider(providerId)}
                />
                {label}{configured ? '' : ' (לא מוגדר)'}
              </label>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: '#166534', marginTop: 8 }}>
          רק מנועים שהוגדרו במלואם ניתנים לבחירה להפעלה משולבת.
        </div>
      </div>

      {/* Gemini */}
      <ProviderSection title="Google Gemini" icon="🔵" active={config.active === 'gemini'} configured={isProviderConfigured(config, 'gemini')} onActivate={() => activate('gemini')}
        description="קבל מפתח API חינמי ב: aistudio.google.com/app/apikey">
        <FieldRow label="מפתח API" type="password" placeholder="AIza..." value={config.gemini?.key}
          onChange={v => update('gemini', 'key', v)} hint="מתחיל ב-AIza" />
        <ApiTestButton providerId="gemini" providerConfig={{ key: config.gemini?.key }} />
      </ProviderSection>

      {/* OpenAI */}
      <ProviderSection title="OpenAI (ChatGPT / GPT-4)" icon="🟢" active={config.active === 'openai'} configured={isProviderConfigured(config, 'openai')} onActivate={() => activate('openai')}
        description="קבל מפתח API ב: platform.openai.com/api-keys">
        <FieldRow label="מפתח API" type="password" placeholder="sk-..." value={config.openai?.key}
          onChange={v => update('openai', 'key', v)} hint="מתחיל ב-sk-" />
        <FieldRow label="מודל" placeholder="gpt-4o" value={config.openai?.model}
          onChange={v => update('openai', 'model', v)} hint="ברירת מחדל: gpt-4o" />
        <ApiTestButton providerId="openai" providerConfig={{ key: config.openai?.key, model: config.openai?.model }} />
      </ProviderSection>

      {/* Claude */}
      <ProviderSection title="Claude (Anthropic)" icon="🟠" active={config.active === 'claude'} configured={isProviderConfigured(config, 'claude')} onActivate={() => activate('claude')}
        description="קבל מפתח API ב: console.anthropic.com/settings/keys">
        <FieldRow label="מפתח API" type="password" placeholder="sk-ant-..." value={config.claude?.key}
          onChange={v => update('claude', 'key', v)} hint="מתחיל ב-sk-ant-" />
        <FieldRow label="מודל" placeholder="claude-sonnet-4-6" value={config.claude?.model}
          onChange={v => update('claude', 'model', v)} />
        <ApiTestButton providerId="claude" providerConfig={{ key: config.claude?.key, model: config.claude?.model }} />
      </ProviderSection>

      {/* Groq */}
      <ProviderSection title="Groq (מהיר ובחינם)" icon="⚡" active={config.active === 'groq'} configured={isProviderConfigured(config, 'groq')} onActivate={() => activate('groq')}
        description="מהיר מאוד ובחינם! קבל מפתח API ב: console.groq.com — לא דורש כרטיס אשראי">
        <FieldRow label="מפתח API" type="password" placeholder="gsk_..." value={config.groq?.key}
          onChange={v => update('groq', 'key', v)} hint="מתחיל ב-gsk_" />
        <FieldRow label="מודל" placeholder="llama-3.3-70b-versatile" value={config.groq?.model}
          onChange={v => update('groq', 'model', v)} hint="ברירת מחדל: llama-3.3-70b-versatile" />
        <ApiTestButton providerId="groq" providerConfig={{ key: config.groq?.key, model: config.groq?.model }} />
      </ProviderSection>

      {/* Perplexity */}
      <ProviderSection title="Perplexity AI" icon="🔍" active={config.active === 'perplexity'} configured={isProviderConfigured(config, 'perplexity')} onActivate={() => activate('perplexity')}
        description="AI עם גישה לאינטרנט בזמן אמת. מפתח ב: perplexity.ai/settings/api">
        <FieldRow label="מפתח API" type="password" placeholder="pplx-..." value={config.perplexity?.key}
          onChange={v => update('perplexity', 'key', v)} hint="מתחיל ב-pplx-" />
        <FieldRow label="מודל" placeholder="sonar-pro" value={config.perplexity?.model}
          onChange={v => update('perplexity', 'model', v)} hint="sonar-pro = עם גישה לאינטרנט" />
        <ApiTestButton providerId="perplexity" providerConfig={{ key: config.perplexity?.key, model: config.perplexity?.model }} />
      </ProviderSection>

      {/* Ollama */}
      <ProviderSection title="Ollama (מקומי — חינמי לחלוטין)" icon="🦙" active={config.active === 'ollama'} configured={isProviderConfigured(config, 'ollama')} onActivate={() => activate('ollama')}
        description="הרץ AI ישירות על המחשב שלך! הורד מ-ollama.com — פרטי, חינמי, ללא אינטרנט">
        <FieldRow label="כתובת שרת" placeholder="http://localhost:11434/v1" value={config.ollama?.baseUrl}
          onChange={v => update('ollama', 'baseUrl', v)} hint="ברירת מחדל כשאולמה רץ על המחשב" />
        <FieldRow label="שם מודל" placeholder="llama3.2" value={config.ollama?.model}
          onChange={v => update('ollama', 'model', v)} hint='בדוק מה הורדת: "ollama list" בטרמינל' />
        <ApiTestButton providerId="ollama" providerConfig={{ baseUrl: config.ollama?.baseUrl, model: config.ollama?.model }} />
      </ProviderSection>

      <ProviderSection title="Google Scholar / SerpAPI" icon="🎓" active={false} configured={isProviderConfigured(config, 'scholar')} onActivate={() => {}} allowActivate={false}
        description="אם קיבלת מפתח דרך SerpAPI, אפשר לשמור אותו כאן לשימוש במחקר וחיפוש מקורות. הוצא מפתח מכאן: https://serpapi.com/google-scholar-api">
        <FieldRow label="מפתח SerpAPI" type="password" placeholder="your_serpapi_key" value={config.scholar?.key}
          onChange={v => update('scholar', 'key', v)} hint="המפתח משמש לחיבור חיפושי Google Scholar" />
      </ProviderSection>

      <div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '12px 14px', background: '#F8FBFF', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1E3A8A', marginBottom: 6 }}>קישורי תוספות בסרגל</div>
        <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.7, marginBottom: 10 }}>
          כאן אפשר לשנות גם את שם הכפתור וגם את הכתובת של כל קישור. בשדות חיפוש אפשר להשתמש ב־{'{query}'} כדי לשלב את מה שסימנת או כתבת, וב־{'{serpapiKey}'} כדי לשלב אוטומטית את מפתח SerpAPI ששמרת.
        </div>
        {[
          ['googleSearch', 'חיפוש גוגל'],
          ['scholar', 'Google Scholar'],
          ['modelHub', 'מודל'],
          ['orbit', 'Orbit'],
        ].map(([toolId, fallbackLabel]) => (
          <div key={toolId} style={{ borderTop: '1px solid #DBEAFE', paddingTop: 10, marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>{fallbackLabel}</div>
            <FieldRow
              label="כותרת כפתור"
              placeholder={fallbackLabel}
              value={config.toolLinks?.[toolId]?.label || ''}
              onChange={(v) => updateToolLink(toolId, 'label', v)}
            />
            <FieldRow
              label="כתובת אתר"
              placeholder="https://example.com/search?q={query}"
              value={config.toolLinks?.[toolId]?.url || ''}
              onChange={(v) => updateToolLink(toolId, 'url', v)}
              hint="אפשר להשתמש ב־{'{query}'} וב־{'{serpapiKey}'} בתוך הכתובת"
            />
          </div>
        ))}
      </div>

      <ProviderSection title={config.custom?.name || 'מנוע אחר (מותאם אישית)'} icon="🔌"
        active={config.active === 'custom'} configured={isProviderConfigured(config, 'custom')} onActivate={() => activate('custom')}
        description="">

        {/* כפתור הסבר */}
        <button onClick={() => setShowCustomHelp(v => !v)}
          style={{ fontSize: 12, color: '#2B579A', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12, textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: 4 }}>
          {showCustomHelp ? '▴' : '▾'} מה צריך להכין? איך זה עובד?
        </button>

        {/* הסבר מפורט */}
        {showCustomHelp && (
          <div style={{ background: '#F8F7F6', border: '1px solid #E1DFDD', borderRadius: 8, padding: '14px 16px', marginBottom: 14, fontSize: 12, lineHeight: 1.7, color: '#323130' }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>🔌 מנוע מותאם אישית — OpenAI-Compatible API</div>
            <p style={{ marginBottom: 10, color: '#605E5C' }}>
              רוב ספקי ה-AI הקטנים והמקומיים מספקים API התואם לפרוטוקול של OpenAI.
              בדרך כלל, בדשבורד של הספק תמצא <strong>שלושה דברים</strong> שצריך להעתיק לכאן:
            </p>
            <ul style={{ paddingRight: 18, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li><strong>כתובת API (Base URL)</strong> — מופיעה בתיעוד תחת &ldquo;API Reference&rdquo; או &ldquo;Endpoint&rdquo;. נראית כך: <code style={{ background: '#E8E8E8', padding: '1px 5px', borderRadius: 3 }}>https://api.groq.com/openai/v1</code></li>
              <li><strong>מפתח API</strong> — מחרוזת שהספק נותן, לפעמים מתחילה ב-<code style={{ background: '#E8E8E8', padding: '1px 5px', borderRadius: 3 }}>sk-</code>. <em>לשרתים מקומיים (Ollama, LM Studio) לא נדרש.</em></li>
              <li><strong>שם מודל</strong> — השם הטכני כמו <code style={{ background: '#E8E8E8', padding: '1px 5px', borderRadius: 3 }}>llama-3.3-70b-versatile</code>. מופיע ברשימת Models בתיעוד.</li>
            </ul>

            <div style={{ fontWeight: 700, marginBottom: 8 }}>🌐 ספקים נפוצים — לחץ להעתקה מהירה:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {POPULAR_CUSTOM.map(p => (
                <div key={p.name} style={{ background: 'white', border: '1px solid #E1DFDD', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600, color: '#2B579A', marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 6 }}>📌 {linkifyText(p.note)}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => update('custom', 'baseUrl', p.url)}
                      style={{ fontSize: 11, padding: '3px 10px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 4, cursor: 'pointer', color: '#1D4ED8' }}>
                      📋 העתק URL
                    </button>
                    <button onClick={() => update('custom', 'model', p.model)}
                      style={{ fontSize: 11, padding: '3px 10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 4, cursor: 'pointer', color: '#166534' }}>
                      📋 העתק שם מודל
                    </button>
                    <button onClick={() => { update('custom', 'baseUrl', p.url); update('custom', 'model', p.model); update('custom', 'name', p.name); }}
                      style={{ fontSize: 11, padding: '3px 10px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 4, cursor: 'pointer', color: '#92400E' }}>
                      ⚡ מלא הכל
                    </button>
                    <span style={{ fontSize: 10, color: '#919191', alignSelf: 'center' }}>מפתח: {p.keyNote}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <FieldRow label="שם לתצוגה" placeholder="Groq / Ollama / DeepSeek ..." value={config.custom?.name}
          onChange={v => update('custom', 'name', v)} />
        <FieldRow label="כתובת API (Base URL)" placeholder="https://api.groq.com/openai/v1" value={config.custom?.baseUrl}
          onChange={v => update('custom', 'baseUrl', v)} hint="הכתובת מסתיימת בדרך כלל ב-/v1" />
        <FieldRow label="מפתח API" type="password" placeholder="gsk_... (ריק אם לא נדרש)" value={config.custom?.key}
          onChange={v => update('custom', 'key', v)} />
        <FieldRow label="שם מודל" placeholder="llama-3.3-70b-versatile" value={config.custom?.model}
          onChange={v => update('custom', 'model', v)} hint="חובה — העתק מרשימת Models של הספק" />
        <ApiTestButton providerId="custom" providerConfig={{ baseUrl: config.custom?.baseUrl, key: config.custom?.key, model: config.custom?.model }} />
      </ProviderSection>
    </div>
  );
}

// ─── הגדרות עוזר חכם ───
function AssistantBehaviorSettings({ behavior, setBehavior }) {
  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 16 }}>
        כשהכתיבה נתקעת, העוזר נפתח אוטומטית כסיידבר קבוע בצד ימין כדי לעזור בלי לחסום את המסמך.
      </p>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#323130', fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={behavior.autoPopup !== false}
            onChange={(e) => setBehavior(prev => ({ ...prev, autoPopup: e.target.checked }))}
          />
          פתח פאנל עוזר אוטומטית כשאני נתקע בכתיבה
        </label>
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: '#FAFAFA' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#323130', marginBottom: 6 }}>זמן המתנה לפני קפיצה</div>
        <input
          type="number"
          min="3"
          max="30"
          value={behavior.idleSeconds || 5}
          onChange={(e) => setBehavior(prev => ({ ...prev, idleSeconds: Math.max(3, Number(e.target.value) || 5) }))}
          style={{ width: 110, padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
        />
        <span style={{ marginRight: 8, fontSize: 12, color: '#605E5C' }}>שניות</span>
      </div>
    </div>
  );
}

const splitList = (value) => String(value || '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
const STYLE_PRESET_OPTIONS = [
  { id: 'academic', label: 'אקדמי' },
  { id: 'legal', label: 'משפטי' },
  { id: 'business', label: 'עסקי' },
  { id: 'presentation', label: 'מצגת' },
];

const finalizePersonalProfile = (profile = {}) => {
  const normalizedFavoriteStyles = Array.from(new Set([
    ...((Array.isArray(profile.preferredHomeStyleIds) ? profile.preferredHomeStyleIds : []).filter(Boolean)),
    profile.defaultDocumentStyle || 'academic',
  ])).slice(0, 4);

  const hasMeaningfulStyleCustomization = Boolean(
    String(profile.customStyleGuidance || '').trim() ||
    (profile.defaultDocumentStyle && profile.defaultDocumentStyle !== 'academic') ||
    normalizedFavoriteStyles.some((item) => item && item !== 'academic')
  );

  const hasProfileDetails = Boolean(
    String(profile.displayName || '').trim() ||
    String(profile.institutionName || '').trim() ||
    String(profile.studyTrack || '').trim() ||
    String(profile.userRole || '').trim() ||
    String(profile.userBackground || '').trim() ||
    String(profile.writingGoals || '').trim() ||
    String(profile.defaultAudience || '').trim() ||
    String(profile.additionalContext || '').trim() ||
    (Array.isArray(profile.currentCourses) && profile.currentCourses.length) ||
    hasMeaningfulStyleCustomization
  );

  const currentFavoriteStyles = Array.isArray(profile.preferredHomeStyleIds) && profile.preferredHomeStyleIds.length
    ? profile.preferredHomeStyleIds
    : ['academic'];

  if (!hasProfileDetails) {
    const favoritesChanged = JSON.stringify(currentFavoriteStyles) !== JSON.stringify(normalizedFavoriteStyles);
    return favoritesChanged ? { ...profile, preferredHomeStyleIds: normalizedFavoriteStyles } : profile;
  }
  const favoritesChanged = JSON.stringify(currentFavoriteStyles) !== JSON.stringify(normalizedFavoriteStyles);
  const needsNormalization = profile.onboardingDismissedAt || profile.onboardingSnoozedUntil || favoritesChanged;
  if (!needsNormalization) return profile;

  return {
    ...profile,
    preferredHomeStyleIds: normalizedFavoriteStyles,
    onboardingCompletedAt: profile.onboardingCompletedAt || '',
    onboardingDismissedAt: '',
    onboardingSnoozedUntil: '',
  };
};

function WordDefaultsSettings({ prefs, setPrefs }) {
  const setFlag = (field, value) => setPrefs(prev => ({ ...prev, [field]: value }));
  const setActionVisibility = (actionId, value) => setPrefs(prev => ({
    ...prev,
    aiQuickActions: {
      ...(prev.aiQuickActions || {}),
      [actionId]: value,
    },
  }));

  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 16 }}>
        סימנתי כברירת מחדל את האפשרויות המרכזיות שסומנו אצלך ב-Word המקורי.
      </p>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>טיפוגרפיה ברירת מחדל</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4 }}>גופן כללי למסמכים חדשים</div>
            <select
              value={prefs.defaultFontFamily || 'Alef'}
              onChange={(e) => setFlag('defaultFontFamily', e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
            >
              {DEFAULT_FONT_OPTIONS.map((font) => <option key={font} value={font}>{font}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4 }}>גודל ברירת מחדל</div>
            <input
              type="text"
              value={prefs.defaultFontSize || '12pt'}
              onChange={(e) => setFlag('defaultFontSize', e.target.value)}
              placeholder="12pt"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
            />
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6 }}>אפשר להגדיר כאן ברירת מחדל כללית, ובמסך הבית לערוך סגנון ספציפי עם אייקון העיפרון.</div>
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>בדיקות בזמן כתיבה</div>
        {[
          ['checkSpellingAsYouType', 'בדיקת איות תוך כדי כתיבה'],
          ['markGrammarAsYouType', 'סימון שגיאות דקדוק תוך כדי כתיבה'],
          ['grammarWithSpelling', 'בדיקת דקדוק יחד עם איות'],
        ].map(([field, label]) => (
          <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130', marginBottom: 8 }}>
            <input type="checkbox" checked={prefs[field] !== false} onChange={(e) => setFlag(field, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>עריכה חכמה</div>
        {[
          ['replaceSelectionOnType', 'החלף טקסט מסומן כשמתחילים להקליד'],
          ['selectWholeWord', 'בחר אוטומטית מילה שלמה'],
          ['allowDragDropEditing', 'אפשר גרירה ושחרור של טקסט'],
          ['ctrlClickOpensLinks', 'Ctrl + לחיצה על קישור לפתיחה'],
          ['showPasteOptions', 'הצג אפשרויות הדבקה'],
          ['smartCutPaste', 'הדבקה וחיתוך חכמים'],
        ].map(([field, label]) => (
          <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130', marginBottom: 8 }}>
            <input type="checkbox" checked={prefs[field] !== false} onChange={(e) => setFlag(field, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>הדפסה ותצוגה</div>
        {[
          ['showDrawings', 'הצג ציורים ותיבות טקסט על המסך'],
          ['showTextHighlighting', 'הצג סימון טקסט'],
          ['printBackgrounds', 'הדפס צבעי רקע ותמונות'],
          ['updateFieldsBeforePrint', 'עדכן שדות לפני הדפסה'],
        ].map(([field, label]) => (
          <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130', marginBottom: 8 }}>
            <input type="checkbox" checked={prefs[field] !== false} onChange={(e) => setFlag(field, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 6 }}>התאמה אישית של פעולות AI</div>
        <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 10, lineHeight: 1.6 }}>
          בחר אילו פעולות יופיעו בסרגל האקדמי ובחלונית ה-AI. השינויים חלים מיד.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {ACTION_VISIBILITY_OPTIONS.map((action) => (
            <label key={action.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#323130', border: '1px solid #E5E7EB', borderRadius: 10, padding: '8px 10px', background: '#FAFAFA' }}>
              <input
                type="checkbox"
                checked={prefs.aiQuickActions?.[action.id] !== false}
                onChange={(e) => setActionVisibility(action.id, e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>
                <strong style={{ display: 'block', marginBottom: 2 }}>{action.label}</strong>
                <span style={{ fontSize: 10, color: '#64748B' }}>{action.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: '#FAFAFA' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>שמירה ושחזור</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130', marginBottom: 10 }}>
          <input type="checkbox" checked={prefs.autoSave !== false} onChange={(e) => setFlag('autoSave', e.target.checked)} />
          שמירה אוטומטית פעילה כברירת מחדל
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130', marginBottom: 10 }}>
          <input type="checkbox" checked={prefs.keepLastAutosavedVersion !== false} onChange={(e) => setFlag('keepLastAutosavedVersion', e.target.checked)} />
          שמור את הגרסה האחרונה לשחזור
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130', marginBottom: 10 }}>
          <input type="checkbox" checked={prefs.allowBackgroundSave !== false} onChange={(e) => setFlag('allowBackgroundSave', e.target.checked)} />
          אפשר שמירה ברקע
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130', marginBottom: 10 }}>
          <input type="checkbox" checked={prefs.savePreview !== false} onChange={(e) => setFlag('savePreview', e.target.checked)} />
          שמור תמונת תצוגה למסמך
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: '#605E5C' }}>שמור כל</span>
          <input
            type="number"
            min="1"
            max="60"
            value={prefs.autoSaveMinutes || 10}
            onChange={(e) => setFlag('autoSaveMinutes', Math.max(1, Number(e.target.value) || 10))}
            style={{ width: 90, padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
          />
          <span style={{ fontSize: 12, color: '#605E5C' }}>דקות</span>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130' }}>
          <input type="checkbox" checked={prefs.showStartExperience !== false} onChange={(e) => setFlag('showStartExperience', e.target.checked)} />
          הצג את מסך הבית בעת הפתיחה
        </label>
      </div>
    </div>
  );
}

function SkillsSettings({ skillsState, setSkillsState }) {
  const skills = getSkillCatalog();
  const updateMode = (skillId, mode) => setSkillsState((prev) => ({
    ...prev,
    skills: {
      ...(prev.skills || {}),
      [skillId]: {
        ...(prev.skills?.[skillId] || {}),
        mode,
      },
    },
  }));
  const updateSkillField = (skillId, field, value) => setSkillsState((prev) => ({
    ...prev,
    skills: {
      ...(prev.skills || {}),
      [skillId]: {
        ...(prev.skills?.[skillId] || {}),
        [field]: value,
      },
    },
  }));
  const resetSkill = (skillId) => setSkillsState((prev) => ({
    ...prev,
    skills: {
      ...(prev.skills || {}),
      [skillId]: {
        mode: skillId === 'style-guardian' ? 'auto' : 'manual',
        customInstruction: '',
        customKeywords: [],
      },
    },
  }));

  return (
    <div>
      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 8 }}>שליטה מלאה בסקילים</div>
        <div style={{ fontSize: 11, color: '#605E5C', lineHeight: 1.6, marginBottom: 10 }}>
          כאן בוחרים איזה סקיל יפעל אוטומטית, איזה יישאר ידני בלבד, ואיך כל סקיל ידבר ויעבוד בדיוק בדרך שמתאימה לך.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4 }}>סקיל ברירת מחדל</div>
            <select
              value={skillsState.defaultSkillId || 'style-guardian'}
              onChange={(e) => setSkillsState((prev) => ({ ...prev, defaultSkillId: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
            >
              {skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.label}</option>)}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130', alignSelf: 'end', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={skillsState.autoApplyDefault === true}
              onChange={(e) => setSkillsState((prev) => ({ ...prev, autoApplyDefault: e.target.checked }))}
            />
            החל אוטומטית את ברירת המחדל
          </label>
        </div>
        <div style={{ fontSize: 10, color: '#64748B' }}>טיפ: אם אתה רוצה שליטה גבוהה, השאר את הסקילים על מצב ידני והפעל אותם דרך / בחלונית ה-AI.</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {skills.map((skill) => {
          const mode = skillsState.skills?.[skill.id]?.mode || 'manual';
          const customInstruction = String(skillsState.skills?.[skill.id]?.customInstruction || '');
          const customKeywords = Array.isArray(skillsState.skills?.[skill.id]?.customKeywords)
            ? skillsState.skills?.[skill.id]?.customKeywords.join(', ')
            : String(skillsState.skills?.[skill.id]?.customKeywords || '');
          return (
            <div key={skill.id} style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start', marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 4 }}>{skill.label}</div>
                  <div style={{ fontSize: 11, color: '#605E5C', lineHeight: 1.6 }}>{skill.description}</div>
                  <div style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>מתאים במיוחד ל: {skill.usageHint}</div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>טריגרים קיימים: {(skill.keywords || []).slice(0, 5).join(' • ')}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={mode}
                    onChange={(e) => updateMode(skill.id, e.target.value)}
                    style={{ width: 138, padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white', flexShrink: 0 }}
                  >
                    <option value="manual">ידני בלבד</option>
                    <option value="auto">אוטומטי כשמתאים</option>
                    <option value="off">כבוי</option>
                  </select>
                  <button type="button" onClick={() => resetSkill(skill.id)} style={{ border: '1px solid #CBD5E1', background: '#F8FAFC', color: '#334155', borderRadius: 8, padding: '8px 10px', fontSize: 11, cursor: 'pointer' }}>
                    אפס התאמה
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>איך אתה רוצה שהסקיל יעבוד?</div>
                  <textarea
                    value={customInstruction}
                    onChange={(e) => updateSkillField(skill.id, 'customInstruction', e.target.value)}
                    rows={4}
                    placeholder="למשל: תמיד תהיה תמציתי, אל תמציא מקורות, תכתוב עם כותרות קצרות, שמור על טון אקדמי רגוע"
                    style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>מילות זיהוי שאתה רוצה להוסיף</div>
                  <textarea
                    value={customKeywords}
                    onChange={(e) => updateSkillField(skill.id, 'customKeywords', e.target.value)}
                    rows={4}
                    placeholder="מופרדות בפסיקים, למשל: עבודה, מאמר, מבוא, סיכום"
                    style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GuideSettings() {
  const [memorySnapshot, setMemorySnapshot] = useState(() => getAppMemory());
  const demoPrompts = [
    { title: 'שכתוב מהיר', text: 'שכתב את הפסקה הזאת בצורה טבעית וברורה יותר' },
    { title: 'הפעלת סוכן', text: '@writer נסח לי פתיח קצר ומקצועי למייל הזה' },
    { title: 'הפעלת סקיל', text: '/academic-structure בנה לי שלד לעבודה על מנהיגות דיגיטלית' },
    { title: 'מקורות מחקר', text: '/source-hunter תן לי מילות חיפוש ל-Google Scholar על חרדת מבחנים' },
  ];

  const resetSavedMemory = () => {
    clearAppMemory();
    try {
      localStorage.removeItem('wordai_sidebar_messages');
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wordai-chat-history-cleared'));
      }
    } catch {}
    setMemorySnapshot(getAppMemory());
  };

  return (
    <div>
      <div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '14px', background: '#F8FBFF', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E3A8A', marginBottom: 6 }}>מדריך שימוש מלא ל-WordFlow AI</div>
        <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7 }}>
          ריכזתי את כל הפעולות במקום אחד ברור: יצירת מסמך, עבודה עם הסוכן, שימוש בסקילים, והבנה איפה כל הגדרה נמצאת.
        </div>
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#323130' }}>זיכרון מתמשך</div>
          <button onClick={resetSavedMemory} style={{ border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', borderRadius: 8, padding: '7px 10px', fontSize: 11, cursor: 'pointer' }}>
            אפס זיכרון שמור
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#605E5C', lineHeight: 1.6 }}>
          האפליקציה שומרת מקומית את היסטוריית הצ'אט האחרונה, הסוכן האחרון, הסקיל האחרון והעדפות שנלמדו, כדי שלא תצטרך להסביר הכול מחדש בכל פתיחה.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <span style={{ fontSize: 10, background: '#EEF2FF', color: '#3730A3', padding: '4px 8px', borderRadius: 999 }}>שיחות שמורות: {(memorySnapshot.recentChats || []).length}</span>
          <span style={{ fontSize: 10, background: '#ECFDF5', color: '#166534', padding: '4px 8px', borderRadius: 999 }}>תזכורות פעילות: {(memorySnapshot.memoryNotes || []).length}</span>
          <span style={{ fontSize: 10, background: '#F8FAFC', color: '#334155', padding: '4px 8px', borderRadius: 999 }}>סקיל אחרון: {memorySnapshot.lastSelectedSkillId || 'ללא'}</span>
        </div>
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>איפה עושים כל דבר?</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { title: 'דף הבית', text: 'רק להתחלת מסמך, פתיחת טיוטה וטעינת חומרי עזר.' },
            { title: 'הגדרות', text: 'כל מה שקשור לסקילים, זיכרון, סגנון אישי, גופנים ומנועי AI.' },
            { title: 'חלונית AI', text: 'לשאול, לשכתב, לבחור סוכן עם @ או סקיל עם /.' },
          ].map((item) => (
            <div key={item.title} style={{ border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 11px', background: '#FAFAFA' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>{item.text}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>זרימת עבודה מומלצת</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            '1. פתח מסמך ריק או בחר תבנית מדף הבית.',
            '2. אם צריך, צרף חומרי עזר והנחיות למסמך הנוכחי בלבד.',
            '3. פתח את חלונית ה-AI ובקש ניסוח, שכתוב או בניית שלד.',
            '4. הקלד @ כדי לבחור סוכן ייעודי, או / כדי לבחור סקיל ממוקד.',
            '5. אם התוצאה טובה — לחץ על הוספה למסמך. אם לא, חדד את הבקשה במשפט קצר נוסף.',
            '6. להתאמה קבועה פתח את טאב הסקילים או הסגנון האישי בהגדרות.',
          ].map((step) => (
            <div key={step} style={{ fontSize: 12, color: '#334155', lineHeight: 1.7, borderRight: '3px solid #2B579A', paddingRight: 10, background: '#F8FAFC', borderRadius: 8, paddingTop: 8, paddingBottom: 8, paddingLeft: 8 }}>{step}</div>
          ))}
        </div>
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>הדגמות מוכנות להעתקה</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {demoPrompts.map((item) => (
            <div key={item.title} style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 11px', background: '#F8FAFC' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 11, color: '#1E293B', lineHeight: 1.7, fontFamily: 'Consolas, monospace', background: 'white', border: '1px dashed #CBD5E1', borderRadius: 8, padding: '8px 9px' }}>
                {item.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OnboardingTabContainer({ profile, setProfile }) {
  const updateField = (field, value) => setProfile(prev => ({ ...prev, [field]: value }));
  const updateList = (field, value) => setProfile(prev => ({ ...prev, [field]: splitList(value) }));
  const toggleStyle = (styleId) => setProfile((prev) => {
    const current = Array.isArray(prev.preferredHomeStyleIds) ? prev.preferredHomeStyleIds : [];
    const next = current.includes(styleId)
      ? current.filter((item) => item !== styleId)
      : [...current, styleId].slice(0, 4);
    return { ...prev, preferredHomeStyleIds: next.length ? next : [styleId] };
  });

  const trainingAnswers = profile.learningGameAnswers || {};

  const selectLearningOption = (questionId, optionId) => {
    setProfile((prev) => ({
      ...prev,
      ...buildLearningGameProfilePatch({ ...(prev.learningGameAnswers || {}), [questionId]: optionId })
    }));
  };

  const resetLearningGame = () => {
    if (confirm('האם אתה בטוח שברצונך לאפס את הלמידה?')) {
      setProfile((prev) => ({
        ...prev,
        learningGameAnswers: {},
        learningGameInsights: [],
        learningGamesCompletedAt: '',
        styleTrainingSummary: '',
        preferredTrainingExamples: [],
        dislikedStylePatterns: [],
      }));
    }
  };

  return (
    <ProfileOnboarding
      profile={profile}
      updateField={updateField}
      updateList={updateList}
      STYLE_TRAINING_QUESTIONS={STYLE_TRAINING_QUESTIONS}
      STYLE_PRESET_OPTIONS={STYLE_PRESET_OPTIONS}
      trainingAnswers={trainingAnswers}
      selectLearningOption={selectLearningOption}
      toggleStyle={toggleStyle}
      resetLearningGame={resetLearningGame}
    />
  );
}

function PersonalStyleSettings({ profile, setProfile }) {
  const updateField = (field, value) => setProfile(prev => ({ ...prev, [field]: value }));
  const updateList = (field, value) => setProfile(prev => ({ ...prev, [field]: splitList(value) }));
  const toggleStyle = (styleId) => setProfile((prev) => {
    const current = Array.isArray(prev.preferredHomeStyleIds) ? prev.preferredHomeStyleIds : [];
    const next = current.includes(styleId)
      ? current.filter((item) => item !== styleId)
      : [...current, styleId].slice(0, 4);
    return { ...prev, preferredHomeStyleIds: next.length ? next : [styleId] };
  });
  const onboardingDone = Boolean(profile.onboardingCompletedAt);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [recentMaterials, setRecentMaterials] = useState([]);
  const [uploadKind, setUploadKind] = useState('writing-sample');
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadProjectMaterials().then((items) => setRecentMaterials(items.slice(0, 4))).catch(() => {});
  }, []);

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const selectedUploadMeta = getMaterialUploadMeta(uploadKind);
      for (const file of files) {
        await saveHelperMaterial(file, selectedUploadMeta);
      }
      await syncLearnedStyleFromWorkspace();
      setProfile(getPersonalStyleProfile());
      const items = await loadProjectMaterials();
      setRecentMaterials(items.slice(0, 4));
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await syncLearnedStyleFromWorkspace();
      setProfile(getPersonalStyleProfile());
      const items = await loadProjectMaterials();
      setRecentMaterials(items.slice(0, 4));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 16 }}>
        הקובץ האישי שלך מחובר עכשיו לעוזר, כך שהוא יכתוב בהתאם לרמה, למונחים ולהעדפות שלך.
      </p>

      <div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '14px', background: onboardingDone ? '#F8FBFF' : '#FFF7ED', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: '#1E3A8A', fontWeight: 700, marginBottom: 6 }}>היכרות אישית עם הסוכן</div>
        <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>
          {onboardingDone
            ? 'ההיכרות הושלמה. הסוכן מתאים את עצמו אליך ויכול להמשיך ללמוד מהחומרים המקומיים שלך לאורך הזמן.'
            : 'עדיין לא בוצעה היכרות מלאה. אפשר למלא כאן את המידע הידני, או לפתוח את מסך הבית ולבצע היכרות מהירה.'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {profile.displayName ? <span style={{ fontSize: 10, background: '#FAE8FF', color: '#A21CAF', padding: '4px 8px', borderRadius: 999 }}>{profile.displayName}</span> : null}
          {profile.institutionName ? <span style={{ fontSize: 10, background: '#FEF3C7', color: '#92400E', padding: '4px 8px', borderRadius: 999 }}>{profile.institutionName}</span> : null}
          {profile.userBackground ? <span style={{ fontSize: 10, background: '#EFF6FF', color: '#1D4ED8', padding: '4px 8px', borderRadius: 999 }}>{profile.userBackground}</span> : null}
          {profile.defaultAudience ? <span style={{ fontSize: 10, background: '#F1F5F9', color: '#334155', padding: '4px 8px', borderRadius: 999 }}>קהל יעד: {profile.defaultAudience}</span> : null}
          {(profile.tonePreferences || []).slice(0, 4).map((tone) => (
            <span key={tone} style={{ fontSize: 10, background: '#EEF2FF', color: '#4338CA', padding: '4px 8px', borderRadius: 999 }}>{tone}</span>
          ))}
          <span style={{ fontSize: 10, background: profile.learningConsent === false ? '#FEF3C7' : '#DCFCE7', color: profile.learningConsent === false ? '#92400E' : '#166534', padding: '4px 8px', borderRadius: 999 }}>
            {profile.learningConsent === false ? 'למידה אוטומטית כבויה' : 'למידה אוטומטית פעילה'}
          </span>
        </div>
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>פרופיל היכרות</div>

        <input
          value={profile.displayName || ''}
          onChange={(e) => updateField('displayName', e.target.value)}
          placeholder="שם או איך תרצה שהסוכן יקרא לך"
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, marginBottom: 8 }}
        />

        <input
          value={profile.institutionName || ''}
          onChange={(e) => updateField('institutionName', e.target.value)}
          placeholder="מוסד לימודים, ארגון או מקום עבודה"
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, marginBottom: 8 }}
        />

        <input
          value={profile.studyTrack || ''}
          onChange={(e) => updateField('studyTrack', e.target.value)}
          placeholder="חוג, מסלול, התמחות או תחום מרכזי"
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, marginBottom: 8 }}
        />

        <input
          value={profile.userRole || ''}
          onChange={(e) => updateField('userRole', e.target.value)}
          placeholder="סטטוס או תפקיד, למשל: סטודנט, מרצה, מנהל"
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, marginBottom: 8 }}
        />

        <textarea
          value={(profile.currentCourses || []).join(', ')}
          onChange={(e) => updateList('currentCourses', e.target.value)}
          placeholder="קורסים, שיעורים או נושאים פעילים כרגע"
          rows={2}
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
        />

        <textarea
          value={profile.userBackground || ''}
          onChange={(e) => updateField('userBackground', e.target.value)}
          placeholder="מי אתה ככותב או באיזה הקשר אתה בדרך כלל כותב"
          rows={2}
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
        />

        <textarea
          value={profile.writingGoals || ''}
          onChange={(e) => updateField('writingGoals', e.target.value)}
          placeholder="מטרות הכתיבה שלך, למשל: עבודה אקדמית מדויקת, ניסוח עסקי חד, סיכומים קצרים"
          rows={3}
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
        />

        <textarea
          value={profile.defaultAudience || ''}
          onChange={(e) => updateField('defaultAudience', e.target.value)}
          placeholder="מי קהל היעד הטיפוסי שלך"
          rows={2}
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
        />

        <textarea
          value={profile.formatPreferences || ''}
          onChange={(e) => updateField('formatPreferences', e.target.value)}
          placeholder="איך אתה מעדיף שהטקסט ייראה: קצר, מובנה, עם סעיפים, מפורט, וכדומה"
          rows={2}
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
        />

        <textarea
          value={profile.additionalContext || ''}
          onChange={(e) => updateField('additionalContext', e.target.value)}
          placeholder="כל פרט נוסף שיעזור לסוכן להכיר אותך ולהתאים את התשובות"
          rows={2}
          style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
        />

        <div style={{ borderTop: '1px solid #E5E7EB', marginTop: 10, paddingTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>התאמת סגנונות אישית</div>

          <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 6 }}>סגנונות מועדפים במסך הבית</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {STYLE_PRESET_OPTIONS.map((style) => {
              const active = (profile.preferredHomeStyleIds || []).includes(style.id);
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => toggleStyle(style.id)}
                  style={{ padding: '6px 10px', borderRadius: 999, border: `1px solid ${active ? '#1D4ED8' : '#CBD5E1'}`, background: active ? '#DBEAFE' : 'white', color: active ? '#1D4ED8' : '#334155', cursor: 'pointer', fontSize: 12 }}
                >
                  {style.label}
                </button>
              );
            })}
          </div>

          <select
            value={profile.defaultDocumentStyle || 'academic'}
            onChange={(e) => updateField('defaultDocumentStyle', e.target.value)}
            style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, marginBottom: 8, background: 'white' }}
          >
            {STYLE_PRESET_OPTIONS.map((style) => <option key={style.id} value={style.id}>ברירת מחדל: {style.label}</option>)}
          </select>

          <select
            value={profile.sentenceLengthPreference || 'מאוזן'}
            onChange={(e) => updateField('sentenceLengthPreference', e.target.value)}
            style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, marginBottom: 8, background: 'white' }}
          >
            <option value="קצר">משפטים קצרים</option>
            <option value="מאוזן">משפטים מאוזנים</option>
            <option value="מעמיק">משפטים מעמיקים</option>
          </select>

          <select
            value={profile.paragraphLengthPreference || 'בינוני'}
            onChange={(e) => updateField('paragraphLengthPreference', e.target.value)}
            style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, marginBottom: 8, background: 'white' }}
          >
            <option value="תמציתי">פסקאות קצרות</option>
            <option value="בינוני">פסקאות בינוניות</option>
            <option value="מפורט">פסקאות מפורטות</option>
          </select>

          <textarea
            value={profile.customStyleGuidance || ''}
            onChange={(e) => updateField('customStyleGuidance', e.target.value)}
            placeholder="חוקים אישיים לסגנון הכתיבה שלך"
            rows={2}
            style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
          />
        </div>

        <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.7, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '8px 10px', marginBottom: 10 }}>
          סקיל הסגנון הקיים משתמש עכשיו גם בלמידה אוטומטית מהרקע. כשהאפשרות פעילה, האפליקציה לומדת מקומית מהמסמך הפעיל ומהתיקונים שלך לאורך הזמן.
          {profile.autoLearnedFromEditorAt ? <div style={{ marginTop: 4, color: '#64748B' }}>עודכן לאחרונה: {new Date(profile.autoLearnedFromEditorAt).toLocaleString('he-IL')}</div> : null}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130' }}>
          <input type="checkbox" checked={profile.learningConsent === true} onChange={(e) => updateField('learningConsent', e.target.checked)} />
          אפשר לסוכן להמשיך ללמוד מהמסמכים המקומיים שלי עם הזמן
        </label>
      </div>

      <div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '14px', background: '#F8FBFF', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: '#1E3A8A', fontWeight: 700 }}>העלה קבצים ללמידת סגנון</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={uploadKind}
              onChange={(e) => setUploadKind(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #C8C6C4', background: 'white', fontSize: 12 }}
            >
              {Object.values(MATERIAL_UPLOAD_PRESETS).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <button
              type="button"
              onClick={handleRefresh}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #86EFAC', background: 'white', color: '#166534', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              {refreshing ? 'מרענן...' : 'רענן סריקה'}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #93C5FD', background: 'white', color: '#1D4ED8', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              {uploading ? 'מעלה...' : 'העלה קבצים'}
            </button>
          </div>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.markdown,.html,.htm,.png,.jpg,.jpeg,.webp" style={{ display: 'none' }} onChange={handleUpload} />
        </div>
        <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>
          אפשר לצרף עבודות קודמות, סיכומים, PDF, מצגות, דפי שער לדוגמה, תבניות מסמך או טיוטות. בחר את סוג הקובץ לפני ההעלאה כדי שהסוכן ילמד בדיוק ממה להשתמש.
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: '#334155', background: 'white', border: '1px solid #DBEAFE', borderRadius: 10, padding: '8px 10px' }}>
          נסרקו: {profile.scanStats?.totalScanned || 0} מתוך {profile.scanStats?.totalKnown || 0} • חדשים בריענון האחרון: {profile.scanStats?.newlyScanned || 0}
        </div>
        {recentMaterials.length ? (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {recentMaterials.map((item) => (
              <span key={item.id} style={{ fontSize: 10, background: '#EFF6FF', color: '#1D4ED8', padding: '4px 8px', borderRadius: 999 }}>
                {item.title}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>רמה אקדמית</div>
        <select
          value={profile.academic_level || 'undergraduate'}
          onChange={(e) => updateField('academic_level', e.target.value)}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
        >
          <option value="school">בית ספר</option>
          <option value="undergraduate">תואר ראשון</option>
          <option value="graduate">תואר שני</option>
          <option value="doctoral">דוקטורט</option>
          <option value="professional">מקצועי</option>
        </select>
      </div>

      <textarea
        value={(profile.manualVocabulary || []).join(', ')}
        onChange={(e) => updateList('manualVocabulary', e.target.value)}
        placeholder="מונחים שהעוזר יעדיף להשתמש בהם"
        rows={3}
        style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
      />

      <textarea
        value={(profile.protectedVocabulary || []).join(', ')}
        onChange={(e) => updateList('protectedVocabulary', e.target.value)}
        placeholder="מונחים שלא תרצה לשנות לעולם"
        rows={3}
        style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
      />

      <textarea
        value={(profile.manualPhrases || []).join(', ')}
        onChange={(e) => updateList('manualPhrases', e.target.value)}
        placeholder="ביטויים אופייניים שתרצה לשלב"
        rows={3}
        style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
      />

      <textarea
        value={(profile.preferredSentenceStructures || []).join(', ')}
        onChange={(e) => updateList('preferredSentenceStructures', e.target.value)}
        placeholder="מבני משפט מועדפים, למשל: מצד אחד... מצד שני, יתרה מזו, ניתן לראות כי"
        rows={3}
        style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
      />

      <textarea
        value={(profile.tonePreferences || []).join(', ')}
        onChange={(e) => updateList('tonePreferences', e.target.value)}
        placeholder="טון כתיבה מועדף, למשל: ענייני, אקדמי, רהוט, ישיר"
        rows={2}
        style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
      />

      <textarea
        value={profile.paragraphPreferences || ''}
        onChange={(e) => updateField('paragraphPreferences', e.target.value)}
        placeholder="העדפות לפסקאות, למשל: פסקאות קצרות של 3–4 שורות, או פסקאות ארוכות ומעמיקות"
        rows={3}
        style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
      />

      <textarea
        value={profile.notes || ''}
        onChange={(e) => updateField('notes', e.target.value)}
        placeholder="הערות נוספות על הסגנון האישי שלך"
        rows={4}
        style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical' }}
      />

      <div style={{ marginTop: 12, border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px', background: '#F9FAFB' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#323130', marginBottom: 6 }}>מה נלמד אוטומטית מהקבצים</div>
        <div style={{ fontSize: 11, color: '#605E5C', lineHeight: 1.8 }}>
          מונחים בולטים: {(profile.learnedVocabulary || []).slice(0, 8).join(', ') || 'עדיין אין'}
          <br />
          פתיחות משפט: {(profile.preferredSentenceOpeners || []).slice(0, 4).join(', ') || 'עדיין אין'}
          <br />
          טון שנלמד: {(profile.toneDescriptors || []).slice(0, 4).join(', ') || 'עדיין אין'}
          <br />
          למידה ממשחקים: {(profile.learningGameInsights || []).slice(0, 4).join(' • ') || 'עדיין אין'}
        </div>
      </div>
    </div>
  );
}

function RoleAgentsSettings({ agents, setAgents, automation, setAutomation, config }) {
  const presets = getWorkspaceAgentPresets();
  const managerIndex = agents.findIndex((agent) => /manager|מנהל/i.test(`${agent?.id || ''} ${agent?.name || ''}`));
  const managerAgent = managerIndex >= 0 ? agents[managerIndex] : null;
  const isManagerWorkflow = ['manager-auto', 'circular-team'].includes(automation?.workflowMode);
  const isAutopilotManagerMode = isManagerWorkflow && automation?.autopilotEnabled !== false;

  const updateAgent = (index, field, value) => {
    setAgents(prev => prev.map((agent, i) => i === index ? { ...agent, [field]: value } : agent));
  };

  const applyPreset = () => {
    const nextPresetId = automation?.preset || 'content-studio';
    const preset = presets[nextPresetId];
    setAgents(buildWorkspaceAgentPreset(nextPresetId));
    if (preset?.automation) {
      setAutomation((prev) => ({
        ...prev,
        ...preset.automation,
        workspaceName: prev.workspaceName || 'סביבת עבודה מותאמת',
      }));
    }
  };

  const startCustomWorkspace = () => {
    setAutomation((prev) => ({
      ...prev,
      enabled: true,
      preset: 'custom-workspace',
      workflowMode: 'custom-order',
      workspaceName: prev.workspaceName || 'סביבת סוכנים מותאמת',
    }));
    if (!Array.isArray(agents) || agents.length === 0) {
      setAgents(buildWorkspaceAgentPreset('custom-workspace'));
    }
  };

  const addAgent = () => {
    setAgents(prev => ([
      ...prev,
      { id: `custom-${Date.now()}`, name: 'סוכן חדש', prompt: 'כתוב כאן את התפקיד וההנחיות של הסוכן.', provider: '', model: '', enabled: true },
    ]));
  };

  const moveAgent = (index, direction) => {
    setAgents((prev) => {
      const next = [...prev];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
    setAutomation((prev) => ({
      ...prev,
      preset: 'custom-workspace',
      workflowMode: 'custom-order',
      enabled: true,
    }));
  };

  const removeAgent = (index) => {
    setAgents((prev) => {
      const target = prev[index];
      if (isAutopilotManagerMode && /manager|מנהל/i.test(`${target?.id || ''} ${target?.name || ''}`)) {
        return prev;
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const updateManager = (field, value) => {
    if (managerIndex < 0) return;
    updateAgent(managerIndex, field, value);
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 10 }}>
        הוסף סוכני AI לפי תפקידים, וקבע לכל אחד מהם הוראות עבודה משלו.
      </p>

      <div style={{ border: '1px solid #D1FAE5', borderRadius: 12, padding: '10px 12px', background: '#F0FDF4', marginBottom: 10, fontSize: 11, color: '#166534', lineHeight: 1.7 }}>
        כאן בדיוק אפשר לשלב כמה מודלים יחד: בחר לכל סוכן ספק ומודל שונים, והמערכת תריץ אותם לפי סדר העבודה שהגדרת.
      </div>

      <div style={{ border: `1px solid ${isAutopilotManagerMode ? '#BFDBFE' : '#DDD6FE'}`, borderRadius: 12, padding: '12px 14px', background: isAutopilotManagerMode ? '#F8FBFF' : '#F8F7FF', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: isAutopilotManagerMode ? '#1E3A8A' : '#6D28D9', marginBottom: 6 }}>
          חוקי ההכרעה הפעילים
        </div>
        <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.7 }}>
          {isAutopilotManagerMode
            ? 'במצב הזה כל סוכן מדווח מה הושלם ומה עדיין חסר, ומנהל הצוות הוא זה שמחליט על הצעד הבא.'
            : 'במצב הזה כל סוכן עדיין מדווח מה חסר, אבל ההמשך נקבע לפי כללים וסקילים פעילים ולא על ידי מנהל מרכזי.'}
        </div>
      </div>

      <div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '14px', background: '#F8FBFF', marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1E3A8A', fontWeight: 700, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={automation?.enabled !== false}
            onChange={(e) => setAutomation(prev => ({ ...prev, enabled: e.target.checked }))}
          />
          הפעל סביבת עבודה רב-סוכנית אוטומטית
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>Preset</div>
            <select
              value={automation?.preset || 'content-studio'}
              onChange={(e) => setAutomation(prev => ({ ...prev, preset: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
            >
              {Object.entries(presets).map(([id, preset]) => (
                <option key={id} value={id}>{preset.label}</option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>סדר עבודה</div>
            <select
              value={automation?.workflowMode || 'manager-pipeline'}
              onChange={(e) => {
                const nextMode = e.target.value;
                setAutomation(prev => ({
                  ...prev,
                  workflowMode: nextMode,
                  preset: nextMode === 'custom-order' ? 'custom-workspace' : prev.preset,
                  circularWorkflowEnabled: nextMode === 'circular-team' ? true : false,
                  autopilotEnabled: ['manager-auto', 'circular-team'].includes(nextMode) ? true : false,
                }));
                if (nextMode === 'manager-auto' || nextMode === 'circular-team') {
                  setAgents((prev) => {
                    const hasManager = prev.some((agent) => /manager|מנהל/i.test(`${agent?.id || ''} ${agent?.name || ''}`));
                    const hasAdditionalRoles = prev.some((agent) => !/manager|מנהל/i.test(`${agent?.id || ''} ${agent?.name || ''}`));
                    if (hasManager && hasAdditionalRoles) return prev;
                    const fallbackTeam = buildWorkspaceAgentPreset(automation?.preset || 'content-studio');
                    const currentManager = prev.find((agent) => /manager|מנהל/i.test(`${agent?.id || ''} ${agent?.name || ''}`));
                    return fallbackTeam.map((agent) => (
                      /manager|מנהל/i.test(`${agent?.id || ''} ${agent?.name || ''}`) && currentManager
                        ? { ...agent, ...currentManager }
                        : agent
                    ));
                  });
                }
              }}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
            >
              <option value="manager-auto">טייס אוטומטי — מנהל הצוות מחליט</option>
              <option value="circular-team">סביבה מעגלית — שיפור בסבבים</option>
              <option value="manager-pipeline">מצב רגיל — כללים וסקילים מובילים</option>
              <option value="design-first">מבנה קודם</option>
              <option value="research-first">חקר קודם</option>
              <option value="custom-order">סדר מותאם אישית</option>
            </select>
          </div>

          <button
            type="button"
            onClick={applyPreset}
            style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #93C5FD', background: 'white', color: '#1D4ED8', cursor: 'pointer', fontWeight: 600 }}
          >
            טען צוות מוכן
          </button>

          <button
            type="button"
            onClick={startCustomWorkspace}
            style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #C4B5FD', background: 'white', color: '#6D28D9', cursor: 'pointer', fontWeight: 600 }}
          >
            סביבה מותאמת
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>שם סביבת העבודה</div>
            <input
              value={automation?.workspaceName || ''}
              onChange={(e) => setAutomation(prev => ({ ...prev, workspaceName: e.target.value }))}
              placeholder="למשל: צוות כתיבה אקדמי"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>Retry אוטומטי</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'white', border: '1px solid #C8C6C4', borderRadius: 6, padding: '8px 10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#323130' }}>
                <input
                  type="checkbox"
                  checked={automation?.retryEnabled !== false}
                  onChange={(e) => setAutomation(prev => ({ ...prev, retryEnabled: e.target.checked }))}
                />
                פעיל
              </label>
              <span style={{ fontSize: 12, color: '#605E5C' }}>עד</span>
              <input
                type="number"
                min="0"
                max="5"
                value={automation?.maxRetries ?? 2}
                onChange={(e) => setAutomation(prev => ({ ...prev, maxRetries: Math.max(0, Number(e.target.value) || 0) }))}
                style={{ width: 60, padding: '6px 8px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
              />
              <span style={{ fontSize: 12, color: '#605E5C' }}>ניסיונות</span>
            </div>
          </div>
        </div>

        {isManagerWorkflow && (
          <div style={{ marginTop: 10, fontSize: 11, color: '#1E3A8A', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '8px 10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={automation?.autopilotEnabled !== false}
                onChange={(e) => setAutomation(prev => ({ ...prev, autopilotEnabled: e.target.checked }))}
              />
              AUTOPILOT מלא — קבע תפקידים, סדר ומודל באופן אוטומטי
            </label>
            כשהאפשרות פעילה, מנהל העבודה מחליט לבד מי צריך לעבוד, באיזה סדר, ואיזה תפקיד זמני יהיה לכל שלב.
            <div style={{ marginTop: 6, color: '#334155' }}>
              במצב מעגלי, אם מתגלים פערים, הסוכן הכותב או סוכנים אחרים יכולים לחזור לעוד סבב שיפור.
            </div>
            {automation?.workflowMode === 'circular-team' && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={automation?.circularWorkflowEnabled === true}
                    onChange={(e) => setAutomation(prev => ({ ...prev, circularWorkflowEnabled: e.target.checked }))}
                  />
                  אפשר חזרה לסוכן קודם
                </label>
                <span style={{ color: '#605E5C' }}>מקסימום סבבים לכל סוכן</span>
                <input
                  type="number"
                  min="1"
                  max="4"
                  value={automation?.circularMaxRounds ?? 2}
                  onChange={(e) => setAutomation(prev => ({ ...prev, circularMaxRounds: Math.max(1, Math.min(4, Number(e.target.value) || 2)) }))}
                  style={{ width: 64, padding: '6px 8px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
                />
              </div>
            )}
          </div>
        )}

        {automation?.workflowMode === 'custom-order' && (
          <div style={{ marginTop: 10, fontSize: 11, color: '#6D28D9', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '8px 10px' }}>
            סדר העבודה נקבע לפי סדר הכרטיסים של הסוכנים למטה. אפשר להזיז כל סוכן למעלה או למטה.
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>מטרה והנחיה משותפת לסביבת הסוכנים</div>
          <textarea
            value={automation?.sharedGoal || ''}
            onChange={(e) => setAutomation(prev => ({ ...prev, sharedGoal: e.target.value }))}
            placeholder="למשל: כתיבת עבודות אקדמיות בעברית, עם מבנה מסודר, מקורות, וליטוש סופי"
            rows={3}
            style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', background: 'white' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#323130' }}>
            <input
              type="checkbox"
              checked={automation?.autoDispatch !== false}
              onChange={(e) => setAutomation(prev => ({ ...prev, autoDispatch: e.target.checked }))}
            />
            הפעלה אוטומטית בין הסוכנים
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#323130' }}>
            <input
              type="checkbox"
              checked={automation?.showProgress !== false}
              onChange={(e) => setAutomation(prev => ({ ...prev, showProgress: e.target.checked }))}
            />
            הצג חיווי התקדמות וסטטוס חי
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#323130' }}>
            <span>Timeout</span>
            <input
              type="number"
              min="10"
              max="180"
              value={automation?.requestTimeoutMs ?? 45}
              onChange={(e) => setAutomation(prev => ({ ...prev, requestTimeoutMs: Math.max(10, Number(e.target.value) || 45) }))}
              style={{ width: 70, padding: '6px 8px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
            />
            <span>שניות</span>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 11, color: '#475569', lineHeight: 1.7 }}>
          אפשר לבנות כאן סביבת עבודה משלך: לבחור שם לסביבה, מטרה, להוסיף או למחוק סוכנים, ולהגדיר לכל סוכן מודל ותפקיד שונים. במצב AUTOPILOT המערכת גם תקבע לבד מי יעבוד, באיזה סדר, ומה יהיה התפקיד המעשי של כל שלב לפי ההנחיה והחומרים.
        </div>
      </div>

      {isAutopilotManagerMode && managerAgent && (
        <div style={{ border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px', background: '#F8FBFF', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E3A8A' }}>בקרת מנהל העבודה</div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>כאן בוחרים מהר את המנוע והמודל של מי שמנהל את כל תהליך ה-AUTOPILOT.</div>
            </div>
            <span style={{ fontSize: 10, background: '#DBEAFE', color: '#1D4ED8', padding: '4px 8px', borderRadius: 999, fontWeight: 700 }}>AUTOPILOT</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>ספק למנהל</div>
              <select
                value={managerAgent.provider || ''}
                onChange={(e) => updateManager('provider', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
              >
                <option value="">כמו הספק הפעיל</option>
                <option value="gemini" disabled={!isProviderConfigured(config, 'gemini')}>Gemini</option>
                <option value="openai" disabled={!isProviderConfigured(config, 'openai')}>OpenAI</option>
                <option value="claude" disabled={!isProviderConfigured(config, 'claude')}>Claude</option>
                <option value="groq" disabled={!isProviderConfigured(config, 'groq')}>Groq</option>
                <option value="perplexity" disabled={!isProviderConfigured(config, 'perplexity')}>Perplexity</option>
                <option value="ollama" disabled={!isProviderConfigured(config, 'ollama')}>Ollama</option>
                <option value="custom" disabled={!isProviderConfigured(config, 'custom')}>Custom</option>
              </select>
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>מודל למנהל</div>
              <input
                value={managerAgent.model || ''}
                onChange={(e) => updateManager('model', e.target.value)}
                placeholder="למשל: gemini-2.5-pro או claude-sonnet-4-6"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, direction: 'ltr', background: 'white' }}
              />
            </div>
          </div>

          <div style={{ marginTop: 8, fontSize: 11, color: '#334155', lineHeight: 1.6 }}>
            ההנחיות המלאות של המנהל זמינות לעריכה בכרטיס שלו למטה, אבל בחירת המוח המנהל עכשיו הרבה יותר ישירה.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {agents.map((agent, index) => {
          if (isAutopilotManagerMode && !/manager|מנהל/i.test(`${agent.id || ''} ${agent.name || ''}`)) {
            return null;
          }
          return (
          <div key={agent.id || index} style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <span style={{ minWidth: 28, height: 28, borderRadius: 999, background: '#EEF4FF', color: '#2B579A', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                {index + 1}
              </span>
              <input
                value={agent.name || ''}
                onChange={(e) => updateAgent(index, 'name', e.target.value)}
                placeholder="שם סוכן"
                style={{ flex: 1, padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12 }}
              />
              <button
                type="button"
                disabled={isAutopilotManagerMode || index === 0}
                onClick={() => moveAgent(index, -1)}
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #BFDBFE', background: (isAutopilotManagerMode || index === 0) ? '#F8FAFC' : '#EFF6FF', color: '#1D4ED8', cursor: (isAutopilotManagerMode || index === 0) ? 'default' : 'pointer' }}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={isAutopilotManagerMode || index === agents.length - 1}
                onClick={() => moveAgent(index, 1)}
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #BFDBFE', background: (isAutopilotManagerMode || index === agents.length - 1) ? '#F8FAFC' : '#EFF6FF', color: '#1D4ED8', cursor: (isAutopilotManagerMode || index === agents.length - 1) ? 'default' : 'pointer' }}
              >
                ↓
              </button>
              <button
                onClick={() => removeAgent(index)}
                disabled={isAutopilotManagerMode}
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #FCA5A5', background: isAutopilotManagerMode ? '#FFF5F5' : '#FEF2F2', color: '#B91C1C', cursor: isAutopilotManagerMode ? 'default' : 'pointer', opacity: isAutopilotManagerMode ? 0.6 : 1 }}
              >
                מחק
              </button>
            </div>

            <textarea
              value={agent.prompt || ''}
              onChange={(e) => updateAgent(index, 'prompt', e.target.value)}
              placeholder="הנחיות לסוכן"
              rows={4}
              style={{ width: '100%', padding: '9px 10px', border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, resize: 'vertical', marginBottom: 8 }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>ספק מועדף</div>
                <select
                  value={agent.provider || ''}
                  onChange={(e) => updateAgent(index, 'provider', e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
                >
                  <option value="">כמו הספק הפעיל</option>
                  <option value="gemini" disabled={!isProviderConfigured(config, 'gemini')}>Gemini</option>
                  <option value="openai" disabled={!isProviderConfigured(config, 'openai')}>OpenAI</option>
                  <option value="claude" disabled={!isProviderConfigured(config, 'claude')}>Claude</option>
                  <option value="groq" disabled={!isProviderConfigured(config, 'groq')}>Groq</option>
                  <option value="perplexity" disabled={!isProviderConfigured(config, 'perplexity')}>Perplexity</option>
                  <option value="ollama" disabled={!isProviderConfigured(config, 'ollama')}>Ollama</option>
                  <option value="scholar" disabled={!isProviderConfigured(config, 'scholar')}>Google Scholar</option>
                  <option value="custom" disabled={!isProviderConfigured(config, 'custom')}>Custom</option>
                </select>
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#605E5C', marginBottom: 4, fontWeight: 500 }}>מודל מועדף לסוכן</div>
                <select
                  value={(agent.provider && PROVIDER_MODEL_OPTIONS[agent.provider]?.includes(agent.model || '')) ? (agent.model || '') : ''}
                  onChange={(e) => updateAgent(index, 'model', e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white', marginBottom: 6 }}
                >
                  <option value="">בחר מודל מהרשימה</option>
                  {((agent.provider && PROVIDER_MODEL_OPTIONS[agent.provider]) || []).map((modelName) => (
                    <option key={modelName} value={modelName}>{modelName}</option>
                  ))}
                </select>
                <input
                  value={agent.model || ''}
                  onChange={(e) => updateAgent(index, 'model', e.target.value)}
                  placeholder="אפשר גם להקליד ידנית: gemini-2.5-flash / gpt-4o / claude-sonnet-4-6"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, direction: 'ltr' }}
                />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#323130' }}>
              <input
                type="checkbox"
                checked={agent.enabled !== false}
                onChange={(e) => updateAgent(index, 'enabled', e.target.checked)}
              />
              פעיל בחלונית ה-AI
            </label>
          </div>
          );
        })}
      </div>

      {!isAutopilotManagerMode && (
        <button
          onClick={addAgent}
          style={{ marginTop: 14, padding: '9px 16px', borderRadius: 8, border: '1px dashed #93C5FD', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontWeight: 600 }}
        >
          + הוסף סוכן תפקידי
        </button>
      )}
    </div>
  );
}

function UpdateSettings() {
  const [updateInfo, setUpdateInfo] = useState({
    status: 'idle',
    message: 'מוכן לבדיקת עדכונים',
    currentVersion: '',
    availableVersion: '',
    percent: 0,
    isPackaged: false,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dispose;

    const loadInfo = async () => {
      try {
        if (!window.desktopApp?.getAppUpdateInfo) {
          setUpdateInfo({ status: 'web', message: 'אפשרות זו זמינה רק באפליקציית שולחן העבודה', isPackaged: false });
          return;
        }
        const info = await window.desktopApp.getAppUpdateInfo();
        setUpdateInfo((prev) => ({ ...prev, ...(info || {}) }));
      } catch {}
    };

    loadInfo();
    if (window.desktopApp?.onAppUpdateStatus) {
      dispose = window.desktopApp.onAppUpdateStatus((payload) => {
        setUpdateInfo((prev) => ({ ...prev, ...(payload || {}) }));
      });
    }

    return () => dispose?.();
  }, []);

  const checkNow = async () => {
    if (!window.desktopApp?.checkForAppUpdates) return;
    setBusy(true);
    try {
      const result = await window.desktopApp.checkForAppUpdates();
      setUpdateInfo((prev) => ({ ...prev, ...(result || {}) }));
    } catch (error) {
      setUpdateInfo((prev) => ({ ...prev, status: 'error', message: error?.message || 'בדיקת העדכונים נכשלה' }));
    } finally {
      setBusy(false);
    }
  };

  const installNow = async () => {
    if (!window.desktopApp?.installAppUpdate) return;
    setBusy(true);
    try {
      const result = await window.desktopApp.installAppUpdate();
      setUpdateInfo((prev) => ({ ...prev, ...(result || {}) }));
    } catch (error) {
      setUpdateInfo((prev) => ({ ...prev, status: 'error', message: error?.message || 'התקנת העדכון נכשלה' }));
    } finally {
      setBusy(false);
    }
  };

  const getStatusMeta = (state) => {
    if (state === 'downloaded') return { color: '#166534', bg: '#F0FDF4', border: '#BBF7D0', title: 'העדכון מוכן להתקנה' };
    if (state === 'downloading' || state === 'checking') return { color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE', title: 'העדכון בבדיקה/הורדה' };
    if (state === 'up-to-date') return { color: '#166534', bg: '#F0FDF4', border: '#BBF7D0', title: 'האפליקציה מעודכנת' };
    if (state === 'manual-download') return { color: '#92400E', bg: '#FFFBEB', border: '#FDE68A', title: 'נדרש עדכון ידני' };
    if (state === 'dev-mode' || state === 'web' || state === 'unavailable') return { color: '#92400E', bg: '#FFFBEB', border: '#FDE68A', title: 'עדכון לא זמין כרגע' };
    if (state === 'error') return { color: '#991B1B', bg: '#FEF2F2', border: '#FECACA', title: 'אירעה שגיאה בעדכון' };
    return { color: '#475569', bg: '#F8FAFC', border: '#CBD5E1', title: 'בדיקת עדכונים' };
  };

  const meta = getStatusMeta(updateInfo.status);

  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 14, lineHeight: 1.7 }}>
        כאן אפשר לבדוק ידנית אם יש גרסה חדשה, ולהתקין אותה מתוך האפליקציה ברגע שהיא מוכנה.
      </p>

      <div style={{ border: `1px solid ${meta.border}`, background: meta.bg, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: meta.color, marginBottom: 6 }}>{meta.title}</div>
        <div style={{ fontSize: 12, color: '#334155', marginBottom: 8 }}>{updateInfo.message || 'מוכן לבדיקת עדכונים'}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: '#475569' }}>
          <span>גרסה נוכחית: {updateInfo.currentVersion || '—'}</span>
          {updateInfo.availableVersion && <span>גרסה זמינה: {updateInfo.availableVersion}</span>}
          {(updateInfo.status === 'downloading' || updateInfo.status === 'checking') && <span>התקדמות: {Math.round(Number(updateInfo.percent || 0))}%</span>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={checkNow}
          disabled={busy || updateInfo.status === 'checking' || updateInfo.status === 'downloading' || !window.desktopApp?.checkForAppUpdates}
          style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #93C5FD', background: (busy || updateInfo.status === 'checking' || updateInfo.status === 'downloading') ? '#E5E7EB' : '#EFF6FF', color: '#1D4ED8', cursor: (busy || updateInfo.status === 'checking' || updateInfo.status === 'downloading') ? 'default' : 'pointer', fontWeight: 700 }}
        >
          {busy ? 'בודק…' : 'בדוק אם יש עדכון'}
        </button>

        {updateInfo.status === 'downloaded' && (
          <button
            onClick={installNow}
            disabled={busy}
            style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #16A34A', background: '#16A34A', color: 'white', cursor: busy ? 'default' : 'pointer', fontWeight: 700 }}
          >
            התקן עכשיו
          </button>
        )}

        {updateInfo.status === 'manual-download' && (
          <button
            onClick={() => window.open('https://github.com/rotems4500-gif/wordai-new/releases', '_blank', 'noopener,noreferrer')}
            style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #D97706', background: '#FEF3C7', color: '#92400E', cursor: 'pointer', fontWeight: 700 }}
          >
            פתח עמוד הורדות
          </button>
        )}
      </div>
    </div>
  );
}

function DebugConsoleSettings({ automation }) {
  const [logs, setLogs] = useState(() => getAgentDebugLogs().slice(-120).reverse());
  const [summary, setSummary] = useState(() => getLatestAgentRunSummary(automation));

  useEffect(() => {
    const sync = () => {
      setLogs(getAgentDebugLogs().slice(-120).reverse());
      setSummary(getLatestAgentRunSummary(automation));
    };

    sync();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('wordai-agent-logs-updated', sync);
    return () => window.removeEventListener('wordai-agent-logs-updated', sync);
  }, [automation]);

  const getStatusMeta = (state) => {
    if (state === 'success') return { icon: '✓', color: '#166534', bg: '#F0FDF4', border: '#BBF7D0' };
    if (state === 'running') return { icon: '…', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' };
    if (state === 'idle') return { icon: '✗', color: '#475569', bg: '#F8FAFC', border: '#CBD5E1' };
    return { icon: '✗', color: '#991B1B', bg: '#FEF2F2', border: '#FECACA' };
  };

  const formatTime = (ts) => {
    try {
      return new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  };

  const copyLogs = async () => {
    try {
      const text = getAgentDebugLogs().map((log) => {
        const parts = [
          formatTime(log.ts),
          log.agentLabel || 'מערכת',
          log.message || '',
          log.provider ? `מנוע: ${log.provider}` : '',
          log.model ? `מודל: ${log.model}` : '',
          log.errorMessage ? `שגיאה: ${log.errorMessage}` : '',
        ].filter(Boolean);
        return parts.join(' | ');
      }).join('\n');
      await navigator.clipboard.writeText(text || 'אין לוגים זמינים כרגע.');
    } catch {}
  };

  const resetLogs = () => {
    clearAgentDebugLogs();
    setLogs([]);
    setSummary(getLatestAgentRunSummary(automation));
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 14, lineHeight: 1.7 }}>
        כאן אפשר לראות בדיוק מה קרה בהרצה האחרונה: האם הופעל API, האם AUTOPILOT ניהל את הצוות, ואילו שלבים הושלמו או נכשלו.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginBottom: 14 }}>
        {(summary?.criteria || []).map((item) => {
          const meta = getStatusMeta(item.state);
          return (
            <div key={item.key} style={{ border: `1px solid ${meta.border}`, background: meta.bg, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>{item.label}</span>
                <span style={{ width: 26, height: 26, borderRadius: 999, background: 'white', color: meta.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{meta.icon}</span>
              </div>
              <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>{item.details}</div>
            </div>
          );
        })}
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#323130', marginBottom: 10 }}>מצב שלבים</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {(summary?.stages || []).map((stage) => {
            const meta = getStatusMeta(stage.state);
            return (
              <div key={stage.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: `1px solid ${meta.border}`, borderRadius: 10, padding: '8px 10px', background: meta.bg }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1F2937' }}>{stage.label}</div>
                  <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>{stage.details || 'לא הופעל'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {(stage.provider || stage.model) && <span style={{ fontSize: 10, color: '#475569' }}>{[stage.provider, stage.model].filter(Boolean).join(' · ')}</span>}
                  <span style={{ width: 24, height: 24, borderRadius: 999, background: 'white', color: meta.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{meta.icon}</span>
                </div>
              </div>
            );
          })}
        </div>
        {!!summary?.lastError && (
          <div style={{ marginTop: 10, fontSize: 11, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '8px 10px' }}>
            סיבת הכשל האחרונה: {summary.lastError}
          </div>
        )}
      </div>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#323130' }}>קונסולת לוגים</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={copyLogs} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #CBD5E1', background: 'white', cursor: 'pointer', fontSize: 11 }}>העתק</button>
            <button onClick={resetLogs} style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer', fontSize: 11 }}>נקה</button>
          </div>
        </div>

        <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, background: '#0F172A', borderRadius: 12, padding: '10px' }}>
          {logs.length ? logs.map((log) => {
            const meta = getStatusMeta(log.state);
            return (
              <div key={log.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#E2E8F0' }}>{log.agentLabel || 'מערכת'}</span>
                  <span style={{ fontSize: 10, color: '#94A3B8' }}>{formatTime(log.ts)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 999, background: 'white', color: meta.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11 }}>{meta.icon}</span>
                  <span style={{ fontSize: 11, color: '#F8FAFC', lineHeight: 1.5 }}>{log.message || 'ללא הודעה'}</span>
                </div>
                <div style={{ fontSize: 10, color: '#94A3B8' }}>
                  {[log.provider, log.model, log.errorMessage].filter(Boolean).join(' • ')}
                </div>
              </div>
            );
          }) : (
            <div style={{ fontSize: 11, color: '#94A3B8', padding: '8px 4px' }}>עדיין אין לוגים להצגה.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── הגדרות מראה ───
function AppearanceSettings() {
  const themes = [
    { name: 'Word Classic',    vars: { '--word-blue': '#2B579A', '--page-bg': '#E1DFDD', '--text-color': '#323130' }, preview: ['#2B579A', '#E1DFDD'] },
    { name: 'ירוק Office',     vars: { '--word-blue': '#217346', '--page-bg': '#D5E8D4', '--text-color': '#1E3A2B' }, preview: ['#217346', '#D5E8D4'] },
    { name: 'כהה (Dark)',      vars: { '--word-blue': '#3B82F6', '--page-bg': '#1E1E1E', '--text-color': '#D4D4D4' }, preview: ['#1E1E1E', '#2D2D2D'] },
    { name: 'מינימל לבן',     vars: { '--word-blue': '#4B5563', '--page-bg': '#F9FAFB', '--text-color': '#111827' }, preview: ['#4B5563', '#F9FAFB'] },
    { name: 'סגול',             vars: { '--word-blue': '#7C3AED', '--page-bg': '#EDE9FE', '--text-color': '#2E1065' }, preview: ['#7C3AED', '#EDE9FE'] },
    { name: 'כחול בהיר',       vars: { '--word-blue': '#0369A1', '--page-bg': '#E0F2FE', '--text-color': '#0C4A6E' }, preview: ['#0369A1', '#E0F2FE'] },
  ];
  const applyTheme = (vars) => Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));

  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 16 }}>ערכת נושא — תחול מיידית:</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {themes.map(t => (
          <button key={t.name} onClick={() => applyTheme(t.vars)}
            style={{ border: '1px solid #E1DFDD', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', background: 'white', textAlign: 'center', transition: 'box-shadow 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
            <div style={{ height: 36, background: `linear-gradient(90deg, ${t.preview[0]} 50%, ${t.preview[1]} 50%)` }} />
            <div style={{ padding: '7px 6px', fontSize: 11, color: '#323130', fontWeight: 500 }}>{t.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── FileMenu ראשי ───
export default function FileMenu({ onClose, onCommand, shortcuts, onShortcutsChange, assistantBehavior, onAssistantBehaviorChange, wordPreferences, onWordPreferencesChange, initialSettingsTab = null }) {
  const [activePanel, setActivePanel] = useState(initialSettingsTab ? 'settings' : 'main');
  const [settingsTab, setSettingsTab] = useState(initialSettingsTab || 'ai');
  const [config, setConfig] = useState(getProviderConfig);
  const [shortcutsState, setShortcutsState] = useState(shortcuts || getShortcutsConfig());
  const [assistantBehaviorState, setAssistantBehaviorState] = useState(assistantBehavior || getAssistantBehavior());
  const [wordPrefsState, setWordPrefsState] = useState(wordPreferences || getWordPreferences());
  const [personalStyleState, setPersonalStyleState] = useState(getPersonalStyleProfile());
  const [skillsState, setSkillsState] = useState(getSkillsConfig());
  const [roleAgents, setRoleAgents] = useState(getRoleAgents());
  const [workspaceAutomationState, setWorkspaceAutomationState] = useState(getWorkspaceAutomation());
  const [saved, setSaved] = useState(false);
  const didHydrate = useRef(false);
  const [inlineUpdateState, setInlineUpdateState] = useState({ status: 'idle', message: '' });

  useEffect(() => {
    if (initialSettingsTab) {
      setActivePanel('settings');
      setSettingsTab(initialSettingsTab);
    }
  }, [initialSettingsTab]);

  useEffect(() => {
    const syncProfile = () => {
      setPersonalStyleState((prev) => {
        const next = mergePersonalStyleForSave(prev);
        return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
      });
    };

    window.addEventListener('wordai-personal-style-updated', syncProfile);
    return () => window.removeEventListener('wordai-personal-style-updated', syncProfile);
  }, []);

  useEffect(() => {
    if (!didHydrate.current) {
      didHydrate.current = true;
      return;
    }

    const normalizedPersonalStyle = mergePersonalStyleForSave(personalStyleState);

    saveProviderConfig(config);
    saveShortcutsConfig(shortcutsState);
    saveAssistantBehavior(assistantBehaviorState);
    saveWordPreferences(wordPrefsState);
    localStorage.setItem('default-font', wordPrefsState.defaultFontFamily || 'Alef');
    localStorage.setItem('default-size', wordPrefsState.defaultFontSize || '12pt');
    savePersonalStyleProfile(normalizedPersonalStyle);
    saveSkillsConfig(skillsState);
    saveRoleAgents(roleAgents);
    saveWorkspaceAutomation(workspaceAutomationState);
    const nextDocumentStyle = normalizedPersonalStyle.defaultDocumentStyle || 'academic';
    if (localStorage.getItem('wordai_document_style') !== nextDocumentStyle) {
      localStorage.setItem('wordai_document_style', nextDocumentStyle);
      onCommand?.('applyDocumentStyle', nextDocumentStyle);
    }
    onShortcutsChange?.(shortcutsState);
    onAssistantBehaviorChange?.(assistantBehaviorState);
    onWordPreferencesChange?.(wordPrefsState);
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 1200);
    return () => clearTimeout(timer);
  }, [config, shortcutsState, assistantBehaviorState, wordPrefsState, personalStyleState, skillsState, roleAgents, workspaceAutomationState, onShortcutsChange, onAssistantBehaviorChange, onWordPreferencesChange]);

  const menuItems = [
    { id: 'openFile',   icon: 'ph-fill ph-folder-open',   label: 'פתח מהמחשב',         desc: 'פותח מסמך מקומי' },
    { id: 'newDoc',     icon: 'ph-fill ph-file',          label: 'מסמך ריק חדש',       desc: 'מנקה את תוכן העורך' },
    { id: 'saveLocal',  icon: 'ph-fill ph-floppy-disk',   label: 'שמור',               desc: 'שומר למחשב. המטמון מתעדכן אוטומטית ברקע' },
    { id: 'saveAs',     icon: 'ph-fill ph-floppy-disk-back', label: 'שמור עותק בשם', desc: 'שמירת עותק חדש לכל תיקייה במחשב' },
    { id: 'exportDocx', icon: 'ph-fill ph-microsoft-word',label: 'הורד ל-Word (.docx)', desc: 'מייצא קובץ Word אמיתי בפורמט DOCX' },
    { id: 'print',      icon: 'ph-fill ph-printer',       label: 'הדפסה / ייצוא PDF',  desc: 'פותח תפריט הדפסה' },
  ];

  const handleItem = (id) => { onCommand(id); if (id !== 'print') onClose(); };

  const handleSave = () => {
    const normalizedPersonalStyle = mergePersonalStyleForSave(personalStyleState);

    saveProviderConfig(config);
    saveShortcutsConfig(shortcutsState);
    saveAssistantBehavior(assistantBehaviorState);
    saveWordPreferences(wordPrefsState);
    localStorage.setItem('default-font', wordPrefsState.defaultFontFamily || 'Alef');
    localStorage.setItem('default-size', wordPrefsState.defaultFontSize || '12pt');
    savePersonalStyleProfile(normalizedPersonalStyle);
    saveSkillsConfig(skillsState);
    saveRoleAgents(roleAgents);
    saveWorkspaceAutomation(workspaceAutomationState);
    const nextDocumentStyle = normalizedPersonalStyle.defaultDocumentStyle || 'academic';
    if (localStorage.getItem('wordai_document_style') !== nextDocumentStyle) {
      localStorage.setItem('wordai_document_style', nextDocumentStyle);
      onCommand?.('applyDocumentStyle', nextDocumentStyle);
    }
    onShortcutsChange?.(shortcutsState);
    onAssistantBehaviorChange?.(assistantBehaviorState);
    onWordPreferencesChange?.(wordPrefsState);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const sideBtn = (id, icon, label, isSettings = false) => (
    <button
      key={id}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 6, fontSize: 13, background: (activePanel === id || (isSettings && activePanel === 'settings')) ? 'rgba(255,255,255,0.25)' : 'none', border: 'none', color: 'white', cursor: 'pointer', textAlign: 'right', width: '100%', transition: 'background 0.15s' }}
      onClick={() => isSettings ? setActivePanel('settings') : handleItem(id)}
      onMouseEnter={e => { if (!((activePanel === id) || (isSettings && activePanel === 'settings'))) e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
      onMouseLeave={e => { if (!((activePanel === id) || (isSettings && activePanel === 'settings'))) e.currentTarget.style.background = 'none'; }}>
      <i className={icon} style={{ fontSize: 16, flexShrink: 0 }} />
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[999] bg-slate-900/30 backdrop-blur-sm transition-opacity duration-300" dir="rtl"
      onClick={e => { if (e.target === e.currentTarget && activePanel !== 'settings') onClose(); }}>

      {/* ─── Sliding Sidebar Drawer ─── */}
      <div className={`absolute top-0 right-0 bottom-0 w-[240px] sm:w-[280px] bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 border-x-0 transition-transform duration-300 shadow-2xl flex flex-col ${activePanel === 'settings' ? 'pointer-events-none translate-x-full' : 'translate-x-0'}`}>
        <div className="flex flex-col items-center justify-center gap-3 px-6 pt-10 pb-8 border-b border-white/5">
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-[18px] shadow-lg shadow-indigo-500/20 flex items-center justify-center">
              <i className="ph-fill ph-circles-four text-white text-[28px]" />
          </div>
          <div className="text-center mt-2">
            <div className="text-white font-extrabold text-xl tracking-wide">WordFlow OS</div>
            <div className="text-indigo-300/80 text-[10px] font-bold tracking-widest uppercase mt-1">Workspace Settings</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-1.5 scrollbar-hide">
          <div className="px-2 py-1 text-[10px] font-bold text-slate-500 tracking-widest mb-1 mt-1">קובץ ומסמך</div>
          {menuItems.map(item => (
            <button key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 hover:translate-x-[-2px] transition-transform w-full text-right group outline-none focus:ring-1 focus:ring-indigo-400/50" onClick={() => handleItem(item.id)}>
              <i className={`${item.icon} text-lg text-indigo-400/70 group-hover:text-indigo-300 group-hover:scale-110 transition-transform`} />
              <span className="font-semibold text-[13px]">{item.label}</span>
            </button>
          ))}

          <div className="h-px bg-white/5 my-3 mx-2" />

          <div className="px-2 py-1 text-[10px] font-bold text-slate-500 tracking-widest mb-1">הגדרות מערכת</div>
          <div className="flex flex-col gap-1">
            <button
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 hover:translate-x-[-2px] transition-transform w-full text-right group outline-none focus:ring-1 focus:ring-indigo-400/50"
              disabled={inlineUpdateState.status === 'checking'}
              onClick={async () => {
                if (!window.desktopApp?.checkForAppUpdates) {
                  setInlineUpdateState({ status: 'error', message: 'זמין רק באפליקציה' });
                  return;
                }
                setInlineUpdateState({ status: 'checking', message: 'בודק...' });
                try {
                  const result = await window.desktopApp.checkForAppUpdates();
                  const s = String(result?.status || '').toLowerCase();
                  if (['downloaded', 'downloading', 'update-available', 'manual-download'].includes(s)) {
                    setInlineUpdateState({ status: 'available', message: 'עדכון זמין!' });
                  } else if (['up-to-date', 'not-available', 'dev-mode', 'unavailable'].includes(s)) {
                    setInlineUpdateState({ status: 'uptodate', message: 'הגרסה עדכנית ✓' });
                    setTimeout(() => setInlineUpdateState({ status: 'idle', message: '' }), 4000);
                  } else {
                    setInlineUpdateState({ status: 'uptodate', message: 'בדיקה הושלמה ✓' });
                    setTimeout(() => setInlineUpdateState({ status: 'idle', message: '' }), 4000);
                  }
                } catch {
                  setInlineUpdateState({ status: 'error', message: 'שגיאה בבדיקה' });
                  setTimeout(() => setInlineUpdateState({ status: 'idle', message: '' }), 4000);
                }
              }}>
              <i className={`ph-fill ph-arrow-circle-up text-lg transition-transform ${inlineUpdateState.status === 'checking' ? 'animate-spin text-yellow-400/80' : inlineUpdateState.status === 'available' ? 'text-yellow-400' : 'text-emerald-400/70 group-hover:text-emerald-300 group-hover:scale-110'}`} />
              <div className="flex flex-col items-start">
                <span className="font-semibold text-[13px]">בדוק עדכונים</span>
                {inlineUpdateState.message && (
                  <span className={`text-[10px] font-medium mt-0.5 ${inlineUpdateState.status === 'available' ? 'text-yellow-400' : inlineUpdateState.status === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                    {inlineUpdateState.message}
                  </span>
                )}
              </div>
            </button>

            {inlineUpdateState.status === 'available' && (
              <div className="px-4">
                <button
                  className="text-[10px] bg-yellow-400/20 border border-yellow-400/40 text-yellow-300 px-2 py-0.5 rounded-lg hover:bg-yellow-400/40 transition-colors"
                  onClick={() => { setActivePanel('settings'); setSettingsTab('updates'); }}>
                  פרטים והתקנה
                </button>
              </div>
            )}
          </div>

          <button
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-white bg-indigo-500/20 border border-indigo-500/30 hover:bg-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/10 transition-all w-full text-right group mt-2 outline-none focus:ring-2 focus:ring-indigo-400/50"
            onClick={() => { setActivePanel('settings'); setSettingsTab('ai'); }}>
            <i className="ph-fill ph-sliders-horizontal text-lg text-indigo-300 group-hover:text-white transition-colors" />
            <span className="font-bold text-[13px]">הגדרות מתקדמות</span>
          </button>
        </div>
        
        <div className="px-4 pb-4 pt-2">
            <button className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-slate-400 bg-black/20 hover:text-white hover:bg-black/40 transition-colors w-full outline-none focus:ring-1 focus:ring-indigo-400/50" onClick={onClose}>
              <i className="ph ph-x text-sm" />
              <span className="font-semibold text-xs">חזור לעריכה</span>
            </button>
        </div>

        <div className="pb-4 text-center text-[10px] text-slate-600 font-mono tracking-wider opacity-60">
          WF-OS v1.0.13
        </div>
      </div>

      {/* ─── Settings Popup Modal ─── */}
      {activePanel === 'settings' && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md transition-opacity duration-200" onClick={() => setActivePanel('main')}>
          <div className={`${settingsTab === 'onboarding' ? 'bg-transparent w-full max-w-[1400px] h-[95vh] border-none shadow-none' : 'bg-slate-50 w-full max-w-[1280px] h-[90vh] sm:h-[85vh] rounded-[24px] shadow-2xl border border-slate-200/60'} flex flex-col overflow-hidden`} onClick={e => e.stopPropagation()}>
             {/* POPUP HEADER */}
             <div className="bg-white px-6 sm:px-8 py-5 border-b border-slate-200 flex items-center justify-between shadow-sm z-10 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center shadow-inner border border-indigo-100/50">
                        <i className="ph-fill ph-gear-fine text-[26px] text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight">הגדרות סביבת עבודה</h2>
                        <div className="text-[12px] sm:text-[13px] text-slate-500 font-semibold mt-0.5" dir="rtl">WordFlow OS &mdash; Advanced Configuration</div>
                    </div>
                </div>
                <button onClick={() => setActivePanel('main')} className="w-10 h-10 bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 rounded-full flex items-center justify-center transition-colors outline-none focus:ring-2 focus:ring-rose-200">
                    <i className="ph ph-x text-lg font-bold" />
                </button>
             </div>
             
             {/* POPUP CONTENT (TABS + SCREENS) */}
             <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-slate-50/50 custom-scrollbar-slim">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6 md:mb-8">
                  {SETTINGS_TAB_GROUPS.map((group) => (
                    <div key={group.title} className="bg-white border border-slate-200/70 rounded-2xl p-4 shadow-sm hover:border-slate-300 transition-colors">
                      <div className="text-[11px] font-bold text-slate-400 mb-3 tracking-widest">{group.title}</div>
                      <div className="flex flex-col gap-1.5">
                        {group.tabs.map(([id, label]) => (
                          <button key={id} onClick={() => setSettingsTab(id)}
                            className={`w-full text-right px-3 py-2 rounded-xl text-[12px] sm:text-[13px] font-semibold transition-all outline-none focus:ring-2 ${settingsTab === id ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm focus:ring-indigo-100' : 'bg-transparent text-slate-600 border border-transparent hover:bg-slate-50 hover:text-slate-900 focus:ring-slate-100 focus:bg-slate-50'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded-3xl p-5 sm:p-8 border border-slate-200 shadow-sm min-h-[500px]">
                  {settingsTab === 'guide'       && <GuideSettings />}
                  {settingsTab === 'ai'          && <AiSettings config={config} setConfig={setConfig} />}
                  {settingsTab === 'skills'      && <SkillsSettings skillsState={skillsState} setSkillsState={setSkillsState} />}
                  {settingsTab === 'agents'      && <RoleAgentsSettings agents={roleAgents} setAgents={setRoleAgents} automation={workspaceAutomationState} setAutomation={setWorkspaceAutomationState} config={config} />}
                  {settingsTab === 'updates'     && <UpdateSettings />}
                  {settingsTab === 'assistant'   && <AssistantBehaviorSettings behavior={assistantBehaviorState} setBehavior={setAssistantBehaviorState} />}      
                  {settingsTab === 'debug'       && <DebugConsoleSettings automation={workspaceAutomationState} />}
                  {settingsTab === 'onboarding'  && <OnboardingTabContainer profile={personalStyleState} setProfile={setPersonalStyleState} />}
                  {settingsTab === 'writing'     && <WordDefaultsSettings prefs={wordPrefsState} setPrefs={setWordPrefsState} />}
                  {settingsTab === 'personal'    && <PersonalStyleSettings profile={personalStyleState} setProfile={setPersonalStyleState} />}
                  {settingsTab === 'appearance'  && <AppearanceSettings />}       
                </div>

                {/* Footer Actions */}
                <div className="mt-6 md:mt-8 flex flex-wrap gap-4 items-center justify-end bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm">
                  <div className="flex-1 text-[12px] text-slate-400 font-semibold px-2">
                     * שינויים מוחלים מיד בלחיצה על שמירה.
                  </div>
                  <button onClick={() => setActivePanel('main')}
                    className="px-6 py-2.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl cursor-pointer text-[13px] sm:text-[14px] font-bold hover:bg-slate-100 transition-colors shadow-sm focus:ring-2 focus:ring-slate-200 outline-none">
                    בטל וחזור לתפריט
                  </button>
                  <button onClick={handleSave}
                    className={`px-8 py-2.5 text-white rounded-xl cursor-pointer text-[13px] sm:text-[14px] font-bold transition-all shadow-md outline-none focus:ring-2 ${saved ? 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 shadow-emerald-600/30 focus:ring-emerald-200' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 border border-indigo-500 shadow-indigo-600/30 focus:ring-indigo-200'}`}>
                    {saved ? '✓ עודכן בהצלחה!' : 'שמור והחל שינויים'}
                  </button>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}



