import React, { useEffect, useRef, useState } from "react";
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
} from "./services/aiService";
import { loadProjectMaterials, saveHelperMaterial, syncLearnedStyleFromWorkspace } from "./services/workspaceLearningService";

// ─── ספקים נפוצים לדוגמה ───
const POPULAR_CUSTOM = [
  { name: 'Groq (מהיר ובחינם)',    url: 'https://api.groq.com/openai/v1',         note: 'מפתח חינמי ב-console.groq.com',           model: 'llama-3.3-70b-versatile',              keyNote: 'מתחיל ב-gsk_' },
  { name: 'Mistral AI',             url: 'https://api.mistral.ai/v1',               note: 'מפתח ב-console.mistral.ai',               model: 'mistral-large-latest',                 keyNote: 'מפתח אלפאנומרי' },
  { name: 'Perplexity',             url: 'https://api.perplexity.ai',               note: 'מפתח ב-perplexity.ai/settings/api',       model: 'llama-3.1-sonar-large-128k-online',    keyNote: 'מתחיל ב-pplx-' },
  { name: 'Together.ai',            url: 'https://api.together.xyz/v1',             note: 'מפתח ב-api.together.ai',                   model: 'meta-llama/Llama-3-70b-chat-hf',       keyNote: 'מפתח ארוך' },
  { name: 'DeepSeek',               url: 'https://api.deepseek.com/v1',             note: 'מפתח ב-platform.deepseek.com',             model: 'deepseek-chat',                        keyNote: 'מתחיל ב-sk-' },
  { name: 'Ollama (מקומי - חינם)', url: 'http://localhost:11434/v1',              note: 'הורד מ-ollama.com — ✅ לא דורש מפתח',    model: 'llama3.2',                             keyNote: 'ריק (לא נדרש)' },
  { name: 'LM Studio (מקומי)',      url: 'http://localhost:1234/v1',               note: 'הורד מ-lmstudio.ai — ✅ לא דורש מפתח',  model: 'loaded-model',                         keyNote: 'ריק (לא נדרש)' },
];

const PROVIDER_MODEL_OPTIONS = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash'],
  openai: ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini'],
  claude: ['claude-3-5-sonnet-20241022', 'claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  perplexity: ['llama-3.1-sonar-large-128k-online', 'sonar-pro', 'sonar'],
  ollama: ['llama3.2', 'qwen2.5', 'mistral'],
  custom: ['deepseek-chat', 'mistral-large-latest', 'loaded-model'],
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

// ─── קטע ספק ───
const isProviderConfigured = (config, providerId) => {
  const provider = config?.[providerId] || {};
  switch (providerId) {
    case 'gemini':
    case 'openai':
    case 'claude':
    case 'groq':
    case 'perplexity':
      return Boolean(String(provider.key || '').trim());
    case 'ollama':
      return Boolean(String(provider.baseUrl || '').trim() && String(provider.model || '').trim());
    case 'custom':
      return Boolean(String(provider.baseUrl || '').trim() && String(provider.model || '').trim());
    default:
      return false;
  }
};

function ProviderSection({ title, icon, description, active, configured, onActivate, children }) {
  return (
    <div style={{ border: `2px solid ${active ? '#2B579A' : '#E1DFDD'}`, borderRadius: 10, padding: '14px 18px', marginBottom: 16, background: active ? '#FAFCFF' : 'white', transition: 'all 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 20 }}>{icon}</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#323130' }}>{title}</span>
          {active && <span style={{ fontSize: 10, background: '#2B579A', color: 'white', padding: '2px 8px', borderRadius: 10 }}>ברירת מחדל</span>}
          {configured && <span style={{ fontSize: 10, background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: 10 }}>מוגדר</span>}
          {!configured && <span style={{ fontSize: 10, background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 10 }}>חסר מפתח/הגדרה</span>}
        </div>
        <button onClick={onActivate}
          disabled={!configured}
          style={{ fontSize: 11, padding: '4px 14px', background: active ? '#E1DFDD' : '#2B579A', color: active ? '#605E5C' : 'white', border: 'none', borderRadius: 6, cursor: !configured ? 'not-allowed' : 'pointer', opacity: !configured ? 0.55 : 1 }}>
          {active ? 'ברירת מחדל פעילה' : 'קבע כברירת מחדל'}
        </button>
      </div>
      {description && <p style={{ fontSize: 11, color: '#605E5C', marginBottom: 10 }}>{linkifyText(description)}</p>}
      <div>{children}</div>
    </div>
  );
}

// ─── הגדרות AI ───
function AiSettings({ config, setConfig }) {
  const [showCustomHelp, setShowCustomHelp] = useState(false);
  const update = (provider, field, value) =>
    setConfig(prev => ({ ...prev, [provider]: { ...prev[provider], [field]: value } }));
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
      </ProviderSection>

      {/* OpenAI */}
      <ProviderSection title="OpenAI (ChatGPT / GPT-4)" icon="🟢" active={config.active === 'openai'} configured={isProviderConfigured(config, 'openai')} onActivate={() => activate('openai')}
        description="קבל מפתח API ב: platform.openai.com/api-keys">
        <FieldRow label="מפתח API" type="password" placeholder="sk-..." value={config.openai?.key}
          onChange={v => update('openai', 'key', v)} hint="מתחיל ב-sk-" />
        <FieldRow label="מודל" placeholder="gpt-4o" value={config.openai?.model}
          onChange={v => update('openai', 'model', v)} hint="ברירת מחדל: gpt-4o" />
      </ProviderSection>

      {/* Claude */}
      <ProviderSection title="Claude (Anthropic)" icon="🟠" active={config.active === 'claude'} configured={isProviderConfigured(config, 'claude')} onActivate={() => activate('claude')}
        description="קבל מפתח API ב: console.anthropic.com/settings/keys">
        <FieldRow label="מפתח API" type="password" placeholder="sk-ant-..." value={config.claude?.key}
          onChange={v => update('claude', 'key', v)} hint="מתחיל ב-sk-ant-" />
        <FieldRow label="מודל" placeholder="claude-3-5-sonnet-20241022" value={config.claude?.model}
          onChange={v => update('claude', 'model', v)} />
      </ProviderSection>

      {/* Groq */}
      <ProviderSection title="Groq (מהיר ובחינם)" icon="⚡" active={config.active === 'groq'} configured={isProviderConfigured(config, 'groq')} onActivate={() => activate('groq')}
        description="מהיר מאוד ובחינם! קבל מפתח API ב: console.groq.com — לא דורש כרטיס אשראי">
        <FieldRow label="מפתח API" type="password" placeholder="gsk_..." value={config.groq?.key}
          onChange={v => update('groq', 'key', v)} hint="מתחיל ב-gsk_" />
        <FieldRow label="מודל" placeholder="llama-3.3-70b-versatile" value={config.groq?.model}
          onChange={v => update('groq', 'model', v)} hint="ברירת מחדל: llama-3.3-70b-versatile" />
      </ProviderSection>

      {/* Perplexity */}
      <ProviderSection title="Perplexity AI" icon="🔍" active={config.active === 'perplexity'} configured={isProviderConfigured(config, 'perplexity')} onActivate={() => activate('perplexity')}
        description="AI עם גישה לאינטרנט בזמן אמת. מפתח ב: perplexity.ai/settings/api">
        <FieldRow label="מפתח API" type="password" placeholder="pplx-..." value={config.perplexity?.key}
          onChange={v => update('perplexity', 'key', v)} hint="מתחיל ב-pplx-" />
        <FieldRow label="מודל" placeholder="llama-3.1-sonar-large-128k-online" value={config.perplexity?.model}
          onChange={v => update('perplexity', 'model', v)} hint="sonar-large = עם גישה לאינטרנט" />
      </ProviderSection>

      {/* Ollama */}
      <ProviderSection title="Ollama (מקומי — חינמי לחלוטין)" icon="🦙" active={config.active === 'ollama'} configured={isProviderConfigured(config, 'ollama')} onActivate={() => activate('ollama')}
        description="הרץ AI ישירות על המחשב שלך! הורד מ-ollama.com — פרטי, חינמי, ללא אינטרנט">
        <FieldRow label="כתובת שרת" placeholder="http://localhost:11434/v1" value={config.ollama?.baseUrl}
          onChange={v => update('ollama', 'baseUrl', v)} hint="ברירת מחדל כשאולמה רץ על המחשב" />
        <FieldRow label="שם מודל" placeholder="llama3.2" value={config.ollama?.model}
          onChange={v => update('ollama', 'model', v)} hint='בדוק מה הורדת: "ollama list" בטרמינל' />
      </ProviderSection>
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
      </ProviderSection>
    </div>
  );
}

// ─── הגדרות עוזר חכם ───
function AssistantBehaviorSettings({ behavior, setBehavior }) {
  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 16 }}>
        כשהכתיבה נתקעת, העוזר יכול לקפוץ אוטומטית בתוך המסמך ולעזור בלי לשבור את הזרימה.
      </p>

      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', background: 'white', marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#323130', fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={behavior.autoPopup !== false}
            onChange={(e) => setBehavior(prev => ({ ...prev, autoPopup: e.target.checked }))}
          />
          פתח עוזר אוטומטית כשאני נתקע בכתיבה
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

function WordDefaultsSettings({ prefs, setPrefs }) {
  const setFlag = (field, value) => setPrefs(prev => ({ ...prev, [field]: value }));

  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 16 }}>
        סימנתי כברירת מחדל את האפשרויות המרכזיות שסומנו אצלך ב-Word המקורי.
      </p>

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

function PersonalStyleSettings({ profile, setProfile }) {
  const updateField = (field, value) => setProfile(prev => ({ ...prev, [field]: value }));
  const updateList = (field, value) => setProfile(prev => ({ ...prev, [field]: splitList(value) }));
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [recentMaterials, setRecentMaterials] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadProjectMaterials().then((items) => setRecentMaterials(items.slice(0, 4))).catch(() => {});
  }, []);

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        await saveHelperMaterial(file);
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

      <div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '14px', background: '#F8FBFF', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: '#1E3A8A', fontWeight: 700 }}>העלה קבצים ללמידת סגנון</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.markdown,.html,.htm" style={{ display: 'none' }} onChange={handleUpload} />
        </div>
        <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>
          אפשר לצרף עבודות קודמות, סיכומים, PDF, מצגות או טיוטות. לחצן הריענון יזהה קבצים חדשים שעדיין לא נסרקו, יסרוק אותם ויעדכן את הסגנון האישי שלך.
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
        </div>
      </div>
    </div>
  );
}

function RoleAgentsSettings({ agents, setAgents, automation, setAutomation, config }) {
  const presets = getWorkspaceAgentPresets();

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
    setAgents(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: '#605E5C', marginBottom: 10 }}>
        הוסף סוכני AI לפי תפקידים, וקבע לכל אחד מהם הוראות עבודה משלו.
      </p>

      <div style={{ border: '1px solid #D1FAE5', borderRadius: 12, padding: '10px 12px', background: '#F0FDF4', marginBottom: 14, fontSize: 11, color: '#166534', lineHeight: 1.7 }}>
        כאן בדיוק אפשר לשלב כמה מודלים יחד: בחר לכל סוכן ספק ומודל שונים, והמערכת תריץ אותם לפי סדר העבודה שהגדרת.
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
              onChange={(e) => setAutomation(prev => ({ ...prev, workflowMode: e.target.value, preset: e.target.value === 'custom-order' ? 'custom-workspace' : prev.preset }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #C8C6C4', borderRadius: 6, fontSize: 12, background: 'white' }}
            >
              <option value="manager-auto">AUTOPILOT מלא — המנהל קובע תפקידים וסדר</option>
              <option value="manager-pipeline">מנהל ← מקורות ← מבנה ← כתיבה ← ליטוש</option>
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

        {automation?.workflowMode === 'manager-auto' && (
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {agents.map((agent, index) => (
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
                disabled={index === 0}
                onClick={() => moveAgent(index, -1)}
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #BFDBFE', background: index === 0 ? '#F8FAFC' : '#EFF6FF', color: '#1D4ED8', cursor: index === 0 ? 'default' : 'pointer' }}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === agents.length - 1}
                onClick={() => moveAgent(index, 1)}
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #BFDBFE', background: index === agents.length - 1 ? '#F8FAFC' : '#EFF6FF', color: '#1D4ED8', cursor: index === agents.length - 1 ? 'default' : 'pointer' }}
              >
                ↓
              </button>
              <button
                onClick={() => removeAgent(index)}
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer' }}
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
                  placeholder="אפשר גם להקליד ידנית: gemini-2.5-flash / gpt-4o / claude-3-5-sonnet"
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
        ))}
      </div>

      <button
        onClick={addAgent}
        style={{ marginTop: 14, padding: '9px 16px', borderRadius: 8, border: '1px dashed #93C5FD', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontWeight: 600 }}
      >
        + הוסף סוכן תפקידי
      </button>
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
  const [roleAgents, setRoleAgents] = useState(getRoleAgents());
  const [workspaceAutomationState, setWorkspaceAutomationState] = useState(getWorkspaceAutomation());
  const [saved, setSaved] = useState(false);
  const didHydrate = useRef(false);

  useEffect(() => {
    if (initialSettingsTab) {
      setActivePanel('settings');
      setSettingsTab(initialSettingsTab);
    }
  }, [initialSettingsTab]);

  useEffect(() => {
    if (!didHydrate.current) {
      didHydrate.current = true;
      return;
    }

    saveProviderConfig(config);
    saveShortcutsConfig(shortcutsState);
    saveAssistantBehavior(assistantBehaviorState);
    saveWordPreferences(wordPrefsState);
    savePersonalStyleProfile(personalStyleState);
    saveRoleAgents(roleAgents);
    saveWorkspaceAutomation(workspaceAutomationState);
    onShortcutsChange?.(shortcutsState);
    onAssistantBehaviorChange?.(assistantBehaviorState);
    onWordPreferencesChange?.(wordPrefsState);
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 1200);
    return () => clearTimeout(timer);
  }, [config, shortcutsState, assistantBehaviorState, wordPrefsState, personalStyleState, roleAgents, workspaceAutomationState, onShortcutsChange, onAssistantBehaviorChange, onWordPreferencesChange]);

  const menuItems = [
    { id: 'openFile',   icon: 'ph-fill ph-folder-open',   label: 'פתח מהמחשב',         desc: 'פותח מסמך מקומי' },
    { id: 'newDoc',     icon: 'ph-fill ph-file',          label: 'מסמך ריק חדש',       desc: 'מנקה את תוכן העורך' },
    { id: 'saveLocal',  icon: 'ph-fill ph-floppy-disk',   label: 'שמירה מקומית',        desc: 'שומר במטמון לצורך למידה' },
    { id: 'saveAs',     icon: 'ph-fill ph-floppy-disk-back', label: 'שמור בשם',        desc: 'שמירה לכל תיקייה במחשב' },
    { id: 'exportDocx', icon: 'ph-fill ph-microsoft-word',label: 'הורד ל-Word (.doc)', desc: 'מייצא קובץ .doc תואם לפתיחה ב-Word' },
    { id: 'print',      icon: 'ph-fill ph-printer',       label: 'הדפסה / ייצוא PDF',  desc: 'פותח תפריט הדפסה' },
  ];

  const handleItem = (id) => { onCommand(id); if (id !== 'print') onClose(); };

  const handleSave = () => {
    saveProviderConfig(config);
    saveShortcutsConfig(shortcutsState);
    saveAssistantBehavior(assistantBehaviorState);
    saveWordPreferences(wordPrefsState);
    savePersonalStyleProfile(personalStyleState);
    saveRoleAgents(roleAgents);
    saveWorkspaceAutomation(workspaceAutomationState);
    onShortcutsChange?.(shortcutsState);
    onAssistantBehaviorChange?.(assistantBehaviorState);
    onWordPreferencesChange?.(wordPrefsState);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const sideBtn = (id, icon, label, isSettings = false) => (
    <button
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 6, fontSize: 13, background: (activePanel === id || (isSettings && activePanel === 'settings')) ? 'rgba(255,255,255,0.25)' : 'none', border: 'none', color: 'white', cursor: 'pointer', textAlign: 'right', width: '100%', transition: 'background 0.15s' }}
      onClick={() => isSettings ? setActivePanel('settings') : handleItem(id)}
      onMouseEnter={e => { if (!((activePanel === id) || (isSettings && activePanel === 'settings'))) e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
      onMouseLeave={e => { if (!((activePanel === id) || (isSettings && activePanel === 'settings'))) e.currentTarget.style.background = 'none'; }}>
      <i className={icon} style={{ fontSize: 16, flexShrink: 0 }} />
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[999] flex" dir="rtl"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

      {/* ─── Sidebar ─── */}
      <div style={{ width: 240, background: '#2B579A', color: 'white', display: 'flex', flexDirection: 'column', height: '100%', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '24px 20px 28px' }}>
          <i className="ph-fill ph-file-word" style={{ fontSize: 28 }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Word AI</div>
            <div style={{ fontSize: 11, opacity: 0.65 }}>מעבד תמלילים</div>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px', flex: 1 }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 6, fontSize: 13, background: 'none', border: 'none', color: 'white', cursor: 'pointer', textAlign: 'right', width: '100%' }}
            onClick={onClose}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            <i className="ph ph-arrow-right" style={{ fontSize: 16 }} />
            חזור לעריכה
          </button>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.2)', margin: '6px 10px' }} />

          {menuItems.map(item => sideBtn(item.id, item.icon, item.label))}

          <div style={{ height: 1, background: 'rgba(255,255,255,0.2)', margin: '6px 10px' }} />

          <button
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 6, fontSize: 13, background: (activePanel === 'settings' && settingsTab === 'updates') ? 'rgba(255,255,255,0.25)' : 'none', border: 'none', color: 'white', cursor: 'pointer', textAlign: 'right', width: '100%' }}
            onClick={() => { setActivePanel('settings'); setSettingsTab('updates'); }}
            onMouseEnter={e => { if (!(activePanel === 'settings' && settingsTab === 'updates')) e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
            onMouseLeave={e => { if (!(activePanel === 'settings' && settingsTab === 'updates')) e.currentTarget.style.background = 'none'; }}>
            <i className="ph-fill ph-arrow-circle-up" style={{ fontSize: 16, flexShrink: 0 }} />
            בדוק עדכונים
          </button>

          {sideBtn('settings', 'ph-fill ph-gear', 'הגדרות', true)}
        </nav>

        <div style={{ padding: '12px 20px', fontSize: 10, opacity: 0.4, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
          Word AI Perfect Assistant v1.0.4
        </div>
      </div>

      {/* ─── Content ─── */}
      <div style={{ flex: 1, background: 'white', overflowY: 'auto' }}>
        {activePanel === 'main' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, color: '#C8C6C4' }}>
            <i className="ph-fill ph-file-word" style={{ fontSize: 90, color: '#2B579A', opacity: 0.15 }} />
            <p style={{ fontSize: 14, color: '#A0A0A0' }}>בחר פעולה מהתפריט</p>
          </div>
        )}

        {activePanel === 'settings' && (
          <div style={{ padding: '36px 48px', maxWidth: 740 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#323130', marginBottom: 8 }}>הגדרות</h2>
            <p style={{ fontSize: 13, color: '#919191', marginBottom: 28 }}>Word AI Perfect Assistant</p>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #E1DFDD', marginBottom: 28 }}>
              {[['ai', '🤖 מנועי AI'], ['agents', '🧩 סוכני תפקיד'], ['updates', '⬆️ עדכונים'], ['debug', '🪵 לוגים'], ['assistant', '✨ עוזר חכם'], ['writing', '✍️ כתיבה'], ['personal', '📝 סגנון אישי'], ['appearance', '🎨 מראה']].map(([id, label]) => (
                <button key={id} onClick={() => setSettingsTab(id)}
                  style={{ padding: '9px 22px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: settingsTab === id ? 700 : 400, color: settingsTab === id ? '#2B579A' : '#605E5C', borderBottom: settingsTab === id ? '2px solid #2B579A' : '2px solid transparent', marginBottom: -1, transition: 'all 0.15s' }}>
                  {label}
                </button>
              ))}
            </div>

            {settingsTab === 'ai'          && <AiSettings config={config} setConfig={setConfig} />}
            {settingsTab === 'agents'      && <RoleAgentsSettings agents={roleAgents} setAgents={setRoleAgents} automation={workspaceAutomationState} setAutomation={setWorkspaceAutomationState} config={config} />}
            {settingsTab === 'updates'     && <UpdateSettings />}
            {settingsTab === 'assistant'   && <AssistantBehaviorSettings behavior={assistantBehaviorState} setBehavior={setAssistantBehaviorState} />}
            {settingsTab === 'debug'       && <DebugConsoleSettings automation={workspaceAutomationState} />}
            {settingsTab === 'writing'     && <WordDefaultsSettings prefs={wordPrefsState} setPrefs={setWordPrefsState} />}
            {settingsTab === 'personal'    && <PersonalStyleSettings profile={personalStyleState} setProfile={setPersonalStyleState} />}
            {settingsTab === 'appearance'  && <AppearanceSettings />}

            <div style={{ marginTop: 28, display: 'flex', gap: 10, alignItems: 'center' }}>
              <button onClick={handleSave}
                style={{ padding: '10px 30px', background: saved ? '#217346' : '#2B579A', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'background 0.3s' }}>
                {saved ? '✓ נשמר בהצלחה!' : 'שמור עכשיו'}
              </button>
              <button onClick={onClose}
                style={{ padding: '10px 22px', background: 'white', color: '#323130', border: '1px solid #C8C6C4', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                סגור
              </button>
              <span style={{ fontSize: 11, color: saved ? '#217346' : '#919191', marginRight: 4 }}>{saved ? 'נשמר אוטומטית' : 'השינויים נשמרים אוטומטית ב-localStorage'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
