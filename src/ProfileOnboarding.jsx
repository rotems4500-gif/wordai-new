import React, { useState, useEffect } from 'react';

const PROVIDER_QUICK_LINKS = [
  { id: 'gemini', label: 'Gemini', keyUrl: 'https://aistudio.google.com/app/apikey', keyHint: 'Google AI Studio' },
  { id: 'openai', label: 'OpenAI', keyUrl: 'https://platform.openai.com/api-keys', keyHint: 'OpenAI Platform' },
  { id: 'claude', label: 'Claude', keyUrl: 'https://console.anthropic.com/settings/keys', keyHint: 'Anthropic Console' },
  { id: 'groq', label: 'Groq', keyUrl: 'https://console.groq.com/keys', keyHint: 'Groq Console' },
  { id: 'perplexity', label: 'Perplexity', keyUrl: 'https://www.perplexity.ai/settings/api', keyHint: 'Perplexity Settings' },
  { id: 'deepseek', label: 'DeepSeek', keyUrl: 'https://platform.deepseek.com/api_keys', keyHint: 'DeepSeek Platform' },
  { id: 'mistral', label: 'Mistral', keyUrl: 'https://console.mistral.ai/api-keys', keyHint: 'Mistral Console' },
  { id: 'together', label: 'Together.ai', keyUrl: 'https://api.together.ai/settings/api-keys', keyHint: 'Together API' },
  { id: 'openrouter', label: 'OpenRouter', keyUrl: 'https://openrouter.ai/keys', keyHint: 'OpenRouter Keys' },
  { id: 'xai', label: 'xAI (Grok)', keyUrl: 'https://console.x.ai', keyHint: 'xAI Console' },
];

const EXTERNAL_PROVIDER_OPTIONS = [
  { id: 'gemini', label: 'Gemini' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'claude', label: 'Claude' },
  { id: 'groq', label: 'Groq' },
  { id: 'perplexity', label: 'Perplexity' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'mistral', label: 'Mistral' },
  { id: 'together', label: 'Together.ai' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'xai', label: 'xAI (Grok)' },
  { id: 'ollama', label: 'Ollama' },
  { id: 'lmstudio', label: 'LM Studio' },
  { id: 'custom', label: 'ספק אחר / מותאם' },
];

export default function ProfileOnboarding({
  profile,
  updateField,
  updateList,
  externalAnalysis = {},
  onExternalProviderChange = () => {},
  onQuickProviderChange = () => {},
  onExternalAnalysisRawChange = () => {},
  onQuickProviderKeyChange = () => {},
  onSubmitExternalAnalysis = () => {},
  STYLE_TRAINING_QUESTIONS,
  STYLE_PRESET_OPTIONS,
  trainingAnswers,
  selectLearningOption,
  toggleStyle,
  resetLearningGame,
  onOpenAiSettings = () => {},
  onOpenPersonalStyle = () => {},
  onComplete = () => {},
  onDismiss = () => {}
}) {
  const [step, setStep] = useState(1);
  const [animating, setAnimating] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [copyPromptState, setCopyPromptState] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!copyPromptState) return undefined;
    const timer = setTimeout(() => setCopyPromptState(''), 2000);
    return () => clearTimeout(timer);
  }, [copyPromptState]);

  const nextStep = () => {
    if (step < 7) {
      setAnimating(true);
      setTimeout(() => {
        setStep((s) => s + 1);
        setAnimating(false);
      }, 600);
    }
  };

  const prevStep = () => {
    if (step > 1) {
      setAnimating(true);
      setTimeout(() => {
        setStep((s) => s - 1);
        setAnimating(false);
      }, 600);
    }
  };

  const currentCoursesStr = (profile.currentCourses || []).join(', ');
  const externalProviderOptions = EXTERNAL_PROVIDER_OPTIONS;
  const externalStatusText = externalAnalysis.status === 'processed'
    ? 'הניתוח החיצוני עובד בהצלחה ונשמר בפרופיל.'
    : externalAnalysis.status === 'processing'
      ? 'מעבד כרגע את התוצאה החיצונית לפרופיל מובנה...'
      : externalAnalysis.status === 'pending-provider'
        ? 'התוצאה נשמרה מקומית וממתינה לחיבור ספק AI מקומי כדי להשלים מיפוי אוטומטי.'
        : externalAnalysis.status === 'error'
          ? (externalAnalysis.error || 'העיבוד נכשל. אפשר לשמור ולנסות שוב אחרי חיבור ספק.')
          : 'הדבק כאן תשובת AI חיצונית כדי לחסוך קריאות פנימיות יקרות.';

  const handleCopyExternalPrompt = async () => {
    const promptText = String(externalAnalysis.promptText || '').trim();
    if (!promptText) {
      setCopyPromptState('אין prompt להעתקה');
      return;
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(promptText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = promptText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopyPromptState('הועתק ללוח');
    } catch {
      setCopyPromptState('ההעתקה נכשלה');
    }
  };

  const stepIcons = {
    1: '👋',
    2: '💼', 
    3: '🎯',
    4: '⚖️',
    5: '🎨',
    6: '📝',
    7: '✨'
  };

  const stepTitles = {
    1: 'הכירות',
    2: 'הגשה',
    3: 'קהל יעד',
    4: 'חוקים',
    5: 'משחק',
    6: 'ניתוח',
    7: 'סיום'
  };

  return (
    <div className="relative h-full flex flex-col justify-center min-h-[500px] overflow-hidden" dir="rtl">
      {/* Animated Background - תרבקע רגוע יותר */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800"></div>
      <div className="absolute inset-0 bg-gradient-to-tl from-blue-900/30 via-purple-900/20 to-indigo-900/30 opacity-50"></div>
      
      {/* Floating Decorative Elements - פחות מסיח דעת */}
      <div className="absolute top-10 right-10 w-16 h-16 bg-white bg-opacity-5 rounded-full animate-pulse" style={{ animationDuration: '4s' }}></div>
      <div className="absolute bottom-20 left-10 w-12 h-12 bg-blue-300 bg-opacity-10 rounded-full animate-pulse" style={{ animationDuration: '6s' }}></div>
      
      {/* Main Glassmorphism Container */}
      <div
        className={`relative mx-auto w-full max-w-5xl px-2 mt-2 backdrop-blur-xl bg-slate-900/40 border border-white/20 rounded-3xl shadow-2xl overflow-hidden transition-all duration-1000 ${
          mounted ? 'transform translate-y-0 opacity-100' : 'transform translate-y-10 opacity-0'
        }`}
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
        }}
      >
        {/* Modern Progress Bar */}
        <div className="relative px-4 py-6">
          {/* Progress Track */}
          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full h-2 bg-white/20 rounded-full backdrop-blur-sm">
                <div 
                  className="h-full bg-gradient-to-r from-pink-400 via-purple-500 to-indigo-600 rounded-full shadow-lg transition-all duration-1000 ease-out"
                  style={{ 
                    width: `${(step / 7) * 100}%`,
                    boxShadow: '0 0 20px rgba(168, 85, 247, 0.4)'
                  }}
                ></div>
              </div>
            </div>
            
            {/* Step Indicators */}
            <div className="relative flex justify-between">
              {[1, 2, 3, 4, 5, 6, 7].map((s) => (
                <div key={s} className="flex flex-col items-center">
                  <div 
                    className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center font-bold text-base transition-all duration-700 border-4 ${
                      s <= step 
                        ? 'bg-gradient-to-br from-white to-purple-50 text-purple-700 border-purple-300 shadow-xl transform scale-110' 
                        : 'bg-white/30 text-white/70 border-white/40 backdrop-blur-sm'
                    }`}
                    style={{
                      boxShadow: s <= step ? '0 10px 25px rgba(168, 85, 247, 0.3)' : 'none',
                      animationDelay: `${s * 0.1}s`
                    }}
                  >
                    <span className="text-base">{stepIcons[s]}</span>
                  </div>
                  <div className={`mt-2 text-xs font-medium transition-all duration-500 ${
                    s <= step ? 'text-white' : 'text-white/60'
                  }`}>
                    {stepTitles[s]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Content Area with Glassmorphism */}
        <div className="px-4 pb-4">
          <div 
            className={`bg-slate-900/50 backdrop-blur-md rounded-2xl p-4 border border-slate-700/50 shadow-xl transition-all duration-700 ${
              animating 
                ? 'transform translate-x-10 opacity-0 scale-95' 
                : 'transform translate-x-0 opacity-100 scale-100'
            }`}
            style={{
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 15px 35px rgba(0, 0, 0, 0.1)'
            }}
          >
            {step === 1 && (
              <div className="space-y-3 animate-in slide-in-from-right-5 duration-700">
                <div className="text-center mb-4">
                  <h2 className="text-base font-bold text-white mb-3" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                    👋 בואו נכיר!
                  </h2>
                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    ספר לי על עצמך כדי שאוכל לכתוב בסגנון שמתאים לך בדיוק
                  </p>
                </div>
                
                <div className="space-y-2">
                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-yellow-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      שם הסטודנט/ית או שם התצוגה ✨
                    </label>
                    <input
                      value={profile.displayName || ''}
                      onChange={(e) => updateField('displayName', e.target.value)}
                      placeholder="השם שלך..."
                      className="w-full px-4 py-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white placeholder-slate-300 outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all duration-300 hover:bg-slate-800/80"
                    />
                  </div>
                  
                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-blue-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      מוסד / מרכז אקדמי 🏢
                    </label>
                    <input
                      value={profile.institutionName || ''}
                      onChange={(e) => updateField('institutionName', e.target.value)}
                      placeholder="אוניברסיטה, חברה, או ארגון..."
                      className="w-full px-4 py-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white placeholder-slate-300 outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-300 hover:bg-slate-800/80"
                    />
                  </div>
                  
                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-green-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      פקולטה / חוג / מסלול 🎓
                    </label>
                    <input
                      value={profile.studyTrack || ''}
                      onChange={(e) => updateField('studyTrack', e.target.value)}
                      placeholder="מסלול אקדמי, התמחות או תחום מקצועי..."
                      className="w-full px-4 py-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white placeholder-slate-300 outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all duration-300 hover:bg-slate-800/80"
                    />
                  </div>
                  
                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-cyan-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      תפקיד או סטטוס נוכחי 👤
                    </label>
                    <input
                      value={profile.userRole || ''}
                      onChange={(e) => updateField('userRole', e.target.value)}
                      placeholder="סטודנט, חוקר, מנהל, יועץ..."
                      className="w-full px-4 py-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white placeholder-slate-300 outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 transition-all duration-300 hover:bg-slate-800/80"
                    />
                  </div>
                  
                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-yellow-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      שם קורס / קורסים פעילים 📚
                    </label>
                    <textarea
                      value={currentCoursesStr}
                      onChange={(e) => updateList('currentCourses', e.target.value)}
                      placeholder="פרט על הקורסים, הנושאים או הפרויקטים שאתה עובד עליהם..."
                      rows={2}
                      className="w-full px-4 py-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white placeholder-slate-300 resize-none outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 transition-all duration-300 hover:bg-slate-800/80"
                    />
                  </div>

                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-rose-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      תעודת זהות / מזהה סטודנט 🪪
                    </label>
                    <input
                      value={profile.studentId || ''}
                      onChange={(e) => updateField('studentId', e.target.value)}
                      placeholder="מספר מזהה להגשה..."
                      className="w-full px-4 py-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white placeholder-slate-300 outline-none focus:ring-2 focus:ring-rose-400 focus:border-rose-400 transition-all duration-300 hover:bg-slate-800/80"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3 animate-in slide-in-from-left-5 duration-700">
                <div className="text-center mb-4">
                  <h2 className="text-base font-bold text-white mb-3" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                    💼 סביבת העבודה שלך
                  </h2>
                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    כאן מגדירים גם פרטי הגשה קבועים וגם את הקונטקסט שבו אתה כותב
                  </p>
                </div>
                
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="group">
                      <label className="block text-sm font-medium text-white mb-1 group-hover:text-amber-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                        מרצה / מנחה 👩‍🏫
                      </label>
                      <input
                        value={profile.lecturerName || ''}
                        onChange={(e) => updateField('lecturerName', e.target.value)}
                        placeholder="שם המרצה"
                        className="w-full px-4 py-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white placeholder-slate-300 outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all duration-300 hover:bg-slate-800/80"
                      />
                    </div>
                    <div className="group">
                      <label className="block text-sm font-medium text-white mb-1 group-hover:text-emerald-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                        סוג מטלה / מסמך 📄
                      </label>
                      <input
                        value={profile.assignmentType || ''}
                        onChange={(e) => updateField('assignmentType', e.target.value)}
                        placeholder="למשל: עבודה מסכמת"
                        className="w-full px-4 py-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white placeholder-slate-300 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all duration-300 hover:bg-slate-800/80"
                      />
                    </div>
                    <div className="group">
                      <label className="block text-sm font-medium text-white mb-1 group-hover:text-cyan-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                        תאריך הגשה 📅
                      </label>
                      <input
                        type="date"
                        value={profile.submissionDate || ''}
                        onChange={(e) => updateField('submissionDate', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 transition-all duration-300 hover:bg-slate-800/80"
                      />
                    </div>
                  </div>

                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-purple-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      הצהרת שימוש ב-AI להגשה 🤖
                    </label>
                    <textarea
                      value={profile.aiAssistanceDeclaration || ''}
                      onChange={(e) => updateField('aiAssistanceDeclaration', e.target.value)}
                      placeholder="אם למוסד יש נוסח קבוע, הדבק אותו כאן לשימוש עתידי בעמודי שער והצהרות."
                      rows={2}
                      className="w-full px-4 py-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white placeholder-slate-300 resize-none outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-all duration-300 hover:bg-slate-800/80"
                    />
                  </div>

                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-green-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      הרקע שלך ככותב ✍️
                    </label>
                    <textarea
                      value={profile.userBackground || ''}
                      onChange={(e) => updateField('userBackground', e.target.value)}
                      placeholder="מה מאפיין אותך? למשל: אוהב שפה פשוטה, כותב מאמרים אקדמיים, מעדיף סגנון עיתונאי..."
                      rows={2}
                      className="w-full px-4 py-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white placeholder-slate-300 resize-none outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all duration-300 hover:bg-slate-800/80"
                    />
                  </div>
                  
                  <div className="group">
                    <label className="block text-sm font-medium text-white/90 mb-1 group-hover:text-white transition-colors">
                      המטרות שלך בכתיבה 🎯
                    </label>
                    <textarea
                      value={profile.writingGoals || ''}
                      onChange={(e) => updateField('writingGoals', e.target.value)}
                      placeholder="למה אתה כותב? כתיבה שיווקית, עבודות אקדמיות, דוחות מקצועיים, תוכן למדיה חברתית..."
                      rows={2}
                      className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 resize-none outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all duration-300 hover:bg-white/25"
                    />
                  </div>
                  
                  <div className="group">
                    <label className="block text-sm font-medium text-white/90 mb-1 group-hover:text-white transition-colors">
                      הקהל שלך 👥
                    </label>
                    <textarea
                      value={profile.defaultAudience || ''}
                      onChange={(e) => updateField('defaultAudience', e.target.value)}
                      placeholder="מי קורא את מה שאתה כותב? סטודנטים, עמיתים, לקוחות, הקהל הרחב..."
                      rows={2}
                      className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 resize-none outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-300 hover:bg-white/25"
                    />
                  </div>
                  
                  <div className="group">
                    <label className="block text-sm font-medium text-white/90 mb-1 group-hover:text-white transition-colors">
                      העדפות עיצוב וסגנון 🎨
                    </label>
                    <textarea
                      value={profile.formatPreferences || ''}
                      onChange={(e) => updateField('formatPreferences', e.target.value)}
                      placeholder="איך אתה אוהב לעצב טקסטים? קצר ולעניין, פסקאות ארוכות, עם כותרות משנה, רשימות..."
                      rows={2}
                      className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 resize-none outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all duration-300 hover:bg-white/25"
                    />
                  </div>
                </div>
              </div>
            )}

                        {step === 3 && (
              <div className="space-y-3 animate-in slide-in-from-left-5 duration-700">
                <div className="text-center mb-4">
                  <h2 className="text-base font-bold text-white mb-3" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                    🎯 קהל יעד
                  </h2>
                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    איך תרצה שהטקסט ירגיש לאנשים שקוראים אותו?
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-pink-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      סגנון רשמי או חברי? (Tone)
                    </label>
                    <select
                      value={profile.tonePreference || 'balanced'}
                      onChange={(e) => updateField('tonePreference', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white outline-none focus:ring-2 focus:ring-pink-400 focus:border-pink-400 transition-all duration-300 hover:bg-slate-800/80 cursor-pointer"
                    >
                      <option value="very_formal" className="bg-slate-800 text-white">רשמי לחלוטין (אקדמי / עסקי נוקשה)</option>
                      <option value="formal" className="bg-slate-800 text-white">מכובד ומקצועי</option>
                      <option value="balanced" className="bg-slate-800 text-white">מאוזן (נגיש אך מקצועי)</option>
                      <option value="casual" className="bg-slate-800 text-white">חצי-רשמי / חברי</option>
                      <option value="very_casual" className="bg-slate-800 text-white">סלנג וזורם לחלוטין</option>
                    </select>
                  </div>

                  <div className="group">
                    <label className="block text-sm font-medium text-white/90 mb-1 group-hover:text-white transition-colors">
                      אורך פסקאות ופירוט עיקרי
                    </label>
                    <select
                      value={profile.lengthPreference || 'default'}
                      onChange={(e) => updateField('lengthPreference', e.target.value)}
                      className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all duration-300 hover:bg-white/25 cursor-pointer"
                    >
                      <option value="short" className="bg-slate-800 text-white">קצר ולעניין - ישר ולנקודה</option>
                      <option value="default" className="bg-slate-800 text-white">ממוצע - עם מעט רקע והסבר</option>
                      <option value="detailed" className="bg-slate-800 text-white">מפורט - הסברים ארוכים ודוגמאות</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3 animate-in slide-in-from-left-5 duration-700">
                <div className="text-center mb-4">
                  <h2 className="text-base font-bold text-white mb-3" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                    ⚖️ חוקי ברזל ואוצר מילים
                  </h2>
                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    מהם הדברים שיגרמו לטקסט להיראות בדיוק כמו שצריך?
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-red-300 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      ממה להימנע לחלוטין? 🚫
                    </label>
                    <textarea
                      value={profile.avoidRules || ''}
                      onChange={(e) => updateField('avoidRules', e.target.value)}
                      placeholder="למשל: אל תשתמש באימוג'י, בלי מילים גבוהות מדי, אורך משפט עד 10 מילים..."
                      rows={2}
                      className="w-full px-4 py-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white placeholder-slate-300 resize-none outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400 transition-all duration-300 hover:bg-slate-800/80"
                    />
                  </div>

                  <div className="group">
                    <label className="block text-sm font-medium text-white/90 mb-1 group-hover:text-green-300 transition-colors">
                      חוקים שתמיד צריך לקיים ✅
                    </label>
                    <textarea
                      value={profile.alwaysRules || ''}
                      onChange={(e) => updateField('alwaysRules', e.target.value)}
                      placeholder="למשל: כתוב תמיד בלשון נקבה, תמיד תסיים במשפט מניע לפעולה, הוסף סימן קריאה בכותרת..."
                      rows={2}
                      className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 resize-none outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-300 hover:bg-white/25"
                    />
                  </div>
                  </div>
                  </div>

                  <div className="group">
                    <label className="block text-sm font-medium text-white/90 mb-1 group-hover:text-blue-300 transition-colors">
                      מילים או ביטויים אהובים עליך ✨
                    </label>
                    <textarea
                      value={profile.favoritePhrases || ''}
                      onChange={(e) => updateField('favoritePhrases', e.target.value)}
                      placeholder="מילים שאתה משתמש בהן הרבה (למשל: 'סופר מעניין', 'בגדול', 'קלאסי'...)"
                      rows={2}
                      className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 resize-none outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-300 hover:bg-white/25"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-3 animate-in slide-in-from-bottom-5 duration-700">
                <div className="text-center mb-4">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-base font-bold text-white" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                      🎨 למד את הסגנון שלי
                    </h2>
                    <button
                      type="button"
                      onClick={resetLearningGame}
                      className="px-4 py-2 rounded-xl bg-slate-800/60 backdrop-blur-sm border border-slate-600 text-white text-sm font-semibold hover:bg-slate-800/80 transition-all duration-300 shadow-lg"
                    >
                      🔄 איפוס
                    </button>
                  </div>
                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    בחר את הניסוחים שמתאימים לך כדי שאלמד את הסגנון האישי שלך
                  </p>
                </div>

                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                  {STYLE_TRAINING_QUESTIONS.map((question, index) => (
                    <div 
                      key={question.id} 
                      className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-5 shadow-lg hover:bg-white/15 transition-all duration-300"
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <div className="text-base font-bold text-white mb-4 drop-shadow-sm">
                        {question.title}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {question.options.map((option) => {
                          const selected = trainingAnswers[question.id] === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => selectLearningOption(question.id, option.id)}
                              className={`text-right p-4 rounded-xl border-2 transition-all duration-300 transform hover:scale-105 ${
                                selected
                                  ? 'border-yellow-300 bg-yellow-400/20 text-white shadow-lg shadow-yellow-400/25'
                                  : 'border-white/30 bg-white/10 text-white/90 hover:border-white/50 hover:bg-white/20'
                              }`}
                            >
                              <div className="text-sm font-bold mb-1 text-shadow-sm">{option.label}</div>
                              <div className="text-xs leading-relaxed opacity-90">{option.text}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="bg-gradient-to-r from-white/10 to-white/20 backdrop-blur-md border border-white/30 rounded-2xl p-4 shadow-xl">
                  <div className="text-sm font-bold text-white mb-1">💡 מה למדתי עד עכשיו:</div>
                  <div className="text-sm text-white/80 leading-relaxed">
                    {profile.styleTrainingSummary || 'עדיין אין מספיק בחירות כדי ללמוד את הסגנון שלך.'}
                  </div>
                </div>
              </div>
            )}

                        {step === 6 && (
              <div className="space-y-3 animate-in slide-in-from-left-5 duration-700">
                <div className="text-center mb-4">
                  <h2 className="text-base font-bold text-white mb-3" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                    📝 הטאצ'ים הקטנים ודוגמת הזהב
                  </h2>
                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    כדי להגיע לתוצאה מושלמת, אצטרך לדעת מה ההרגלים שלך
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="group">
                      <label className="block text-sm font-medium text-white mb-1 group-hover:text-yellow-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                         פתיח אהוב (Greetings)
                      </label>
                      <input
                        value={profile.greetingStyle || ''}
                        onChange={(e) => updateField('greetingStyle', e.target.value)}
                        placeholder="למשל: היי צוות, שלום לכולם, או בלי פתיח..."
                        className="w-full px-4 py-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all duration-300 hover:bg-slate-800/80"
                      />
                    </div>
                    <div className="group">
                      <label className="block text-sm font-medium text-white mb-1 group-hover:text-yellow-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                        סיום אהוב (Sign-offs)
                      </label>
                      <input
                        value={profile.signOffStyle || ''}
                        onChange={(e) => updateField('signOffStyle', e.target.value)}
                        placeholder="למשל: בברכה, תודה מראש, נדבר..."
                        className="w-full px-4 py-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all duration-300 hover:bg-slate-800/80"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="group">
                      <label className="block text-sm font-medium text-white mb-1 group-hover:text-cyan-200 transition-colors">
                        שימוש באימוג'י 😊
                      </label>
                      <select
                        value={profile.emojiPreference || 'moderate'}
                        onChange={(e) => updateField('emojiPreference', e.target.value)}
                        className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 hover:bg-white/25 cursor-pointer"
                      >
                        <option value="none" className="bg-slate-800 text-white">ללא אימוג'י בכלל</option>
                        <option value="rare" className="bg-slate-800 text-white">מעט מאוד (רק בסוף)</option>
                        <option value="moderate" className="bg-slate-800 text-white">במידה (כאן ושם לפי ההקשר)</option>
                        <option value="lots" className="bg-slate-800 text-white">משתמש בהרבה אימוג'ים</option>
                      </select>
                    </div>
                    <div className="group">
                      <label className="block text-sm font-medium text-white mb-1 group-hover:text-cyan-200 transition-colors">
                        הרגלי עיצוב רשימות
                      </label>
                      <select
                        value={profile.listPreference || 'bullets'}
                        onChange={(e) => updateField('listPreference', e.target.value)}
                        className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 hover:bg-white/25 cursor-pointer"
                      >
                        <option value="bullets" className="bg-slate-800 text-white">עדיפות לנקודות (Bullets •)</option>
                        <option value="numbers" className="bg-slate-800 text-white">עדיפות למספרים (1,2,3)</option>
                        <option value="hyphens" className="bg-slate-800 text-white">עדיפות לקווים מפרידים (-)</option>
                      </select>
                    </div>
                  </div>

                  <div className="group pt-2">
                    <label className="block text-sm font-medium text-white mb-1 group-hover:text-purple-300 transition-colors">
                      ✨ דוגמת הזהב - הדבק כאן טקסט לדוגמה שכתבת (רשות אך מומלץ)
                    </label>
                    <textarea
                      value={profile.goldenExample || ''}
                      onChange={(e) => updateField('goldenExample', e.target.value)}
                      placeholder="טקסט קצר שכתבת (מייל, פוסט, או סיכום). אני אלמד לנתח בדיוק אותו..."
                      rows={4}
                      className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 resize-none outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-300 hover:bg-white/25"
                    />
                  </div>

                  <div className="bg-slate-900/40 border border-slate-700/70 rounded-2xl p-4 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-white mb-1">🧠 ניתוח סגנון חיצוני מוזל</div>
                        <div className="text-xs text-white/80 leading-relaxed max-w-2xl">
                          אפשר לשלוח prompt מוכן לספק חיצוני, לצרף עבודות עבר, ואז להדביק כאן את התוצאה. אם אין כרגע ספק מקומי פעיל, אשמור את הטקסט ואעבד אותו אוטומטית כשתחבר ספק בהגדרות ה-AI.
                        </div>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-[11px] font-semibold ${externalAnalysis.hasLocalProvider ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-300/30' : 'bg-amber-500/20 text-amber-100 border border-amber-300/30'}`}>
                        {externalAnalysis.hasLocalProvider
                          ? `עיבוד מקומי זמין: ${externalAnalysis.processingProviderLabel || 'AI'}`
                          : 'אין כרגע ספק מקומי זמין'}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-white mb-1">בחר לאיזה ספק חיצוני תשלח את ה-prompt</label>
                        <select
                          value={externalAnalysis.selectedProviderId || 'gemini'}
                          onChange={(e) => onExternalProviderChange(e.target.value)}
                          className="w-full px-4 py-2 bg-slate-800/60 border border-slate-600 rounded-xl text-white outline-none focus:ring-2 focus:ring-cyan-400"
                        >
                          {externalProviderOptions.map((provider) => (
                            <option key={provider.id} value={provider.id} className="bg-slate-800 text-white">{provider.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={handleCopyExternalPrompt}
                          className="w-full px-4 py-2 rounded-xl bg-cyan-500/70 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors"
                        >
                          העתק prompt לניתוח חיצוני
                        </button>
                      </div>
                    </div>

                    <div className="bg-cyan-950/35 border border-cyan-400/20 rounded-xl p-3">
                      <div className="text-xs font-semibold text-cyan-100 mb-1">לפני ההעתקה</div>
                      <div className="text-xs text-cyan-50/90 leading-relaxed">
                        {externalAnalysis.preparationHint || 'צרף את הקבצים והחומרים בממשק החיצוני לפני שליחת ה-prompt.'}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white mb-1">ה-prompt להעתקה</label>
                      <textarea
                        readOnly
                        value={externalAnalysis.promptText || ''}
                        rows={7}
                        className="w-full px-4 py-2 bg-slate-950/70 border border-slate-700 rounded-xl text-white/90 text-xs leading-relaxed resize-none outline-none"
                      />
                      <div className="text-[11px] text-cyan-100 mt-2 min-h-[18px]">{copyPromptState || 'ההעתקה מכילה רק את ה-prompt עצמו; הוראות ההכנה נשארות מחוץ לטקסט כדי להקל על ההדבקה.'}</div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white mb-1">הדבק כאן את תשובת ה-AI החיצוני</label>
                      <textarea
                        value={profile.externalStyleAnalysisRaw || ''}
                        onChange={(e) => onExternalAnalysisRawChange(e.target.value)}
                        placeholder="הדבק כאן את כל התשובה שקיבלת מהספק החיצוני. עדיף JSON מלא, אבל גם טקסט חופשי יתקבל."
                        rows={6}
                        className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 resize-none outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 hover:bg-white/25"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-white/80 leading-relaxed max-w-2xl">
                        {externalStatusText}
                      </div>
                      <button
                        type="button"
                        onClick={onSubmitExternalAnalysis}
                        disabled={!String(profile.externalStyleAnalysisRaw || '').trim() || externalAnalysis.isBusy}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${!String(profile.externalStyleAnalysisRaw || '').trim() || externalAnalysis.isBusy ? 'bg-slate-700/60 text-white/50 cursor-not-allowed' : 'bg-emerald-500/80 hover:bg-emerald-500 text-white'}`}
                      >
                        {externalAnalysis.isBusy ? 'מעבד...' : externalAnalysis.hasLocalProvider ? 'שמור ונתח עכשיו' : 'שמור להמשך'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 7 && (
              <div className="space-y-3 animate-in slide-in-from-top-5 duration-700">
                <div className="text-center mb-4">
                  <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-500 text-white rounded-full flex items-center justify-center text-5xl mb-4 mx-auto animate-bounce shadow-2xl shadow-green-400/50">
                    ✨
                  </div>
                  <h2 className="text-4xl font-bold text-white mb-4" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                    הפרופיל מוכן! 🎉
                  </h2>
                  <p className="text-white text-sm leading-relaxed max-w-md mx-auto" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    הסוכן יעבד את ההעדפות ויאמץ את סגנון הכתיבה שקבעת. עכשיו כל תוכן חדש יותאם אישית עבורך.
                  </p>
                </div>

                <div className="bg-slate-900/50 backdrop-blur-md border border-slate-700/50 rounded-2xl p-4 shadow-xl">
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                    ⚙️ הגדרות אחרונות
                  </h3>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-white mb-3" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                        סגנונות מועדפים במסך הבית:
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {STYLE_PRESET_OPTIONS.map((style) => {
                          const active = (profile.preferredHomeStyleIds || []).includes(style.id);
                          return (
                            <button
                              key={style.id}
                              type="button"
                              onClick={() => toggleStyle(style.id)}
                              className={`px-4 py-2 rounded-full border-2 text-sm font-medium transition-all duration-300 ${
                                active 
                                  ? 'border-yellow-300 bg-yellow-400/20 text-white shadow-lg shadow-yellow-400/25' 
                                  : 'border-slate-500 bg-slate-800/40 text-white hover:border-slate-400 hover:bg-slate-800/60'
                              }`}
                            >
                              {style.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-white mb-1" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                          אורך משפטים:
                        </label>
                        <select
                          value={profile.sentenceLengthPreference || 'מאוזן'}
                          onChange={(e) => updateField('sentenceLengthPreference', e.target.value)}
                          className="w-full px-4 py-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white outline-none focus:ring-2 focus:ring-cyan-400"
                        >
                          <option value="קצר" className="bg-slate-800">משפטים קצרים</option>
                          <option value="מאוזן" className="bg-slate-800">משפטים מאוזנים</option>
                          <option value="מעמיק" className="bg-slate-800">משפטים מעמיקים</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white mb-1" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                          אורך פסקאות:
                        </label>
                        <select
                          value={profile.paragraphLengthPreference || 'בינוני'}
                          onChange={(e) => updateField('paragraphLengthPreference', e.target.value)}
                          className="w-full px-4 py-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white outline-none focus:ring-2 focus:ring-purple-400"
                        >
                          <option value="תמציתי" className="bg-slate-800">פסקאות קצרות</option>
                          <option value="בינוני" className="bg-slate-800">פסקאות בינוניות</option>
                          <option value="מפורט" className="bg-slate-800">פסקאות מפורטות</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white/90 mb-1">
                        חוקים אישיים לסגנון הכתיבה (אופציונלי):
                      </label>
                      <textarea
                        value={profile.customStyleGuidance || ''}
                        onChange={(e) => updateField('customStyleGuidance', e.target.value)}
                        placeholder="לדוגמה: תמיד להשתמש בגוף ראשון רבים, לא להשתמש במילה 'מאוד'"
                        rows={2}
                        className="w-full px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 resize-none outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    </div>

                    <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4">
                      <div className="text-sm text-white/90 mb-3">
                        💡 סקיל הסגנון משתמש בלמידה אוטומטית. כשהאפשרות למטה פעילה, האפליקציה תלמד מקומית מהמסמך הפעיל ומהתיקונים שלך.
                      </div>
                      {profile.autoLearnedFromEditorAt && (
                        <div className="text-xs text-white/70">
                          עודכן לאחרונה: {new Date(profile.autoLearnedFromEditorAt).toLocaleString('he-IL')}
                        </div>
                      )}
                    </div>

                    <label className="flex items-center gap-3 text-white cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={profile.learningConsent === true}
                        onChange={(e) => updateField('learningConsent', e.target.checked)}
                        className="w-5 h-5 rounded bg-white/20 border-white/40 text-green-500 focus:ring-2 focus:ring-green-400"
                      />
                      <span className="text-sm group-hover:text-white/100 transition-colors">
                        🤖 אפשר לסוכן להמשיך ללמוד ולדייק איתי אוטומטית עם הזמן
                      </span>
                    </label>

                    <div className="bg-slate-800/40 border border-slate-600/70 rounded-xl p-4 space-y-3">
                      <div className="text-sm font-semibold text-white">🔐 חיבור ספק AI + קישורים ישירים להוצאת API key</div>
                      <div className="text-xs text-white/80 leading-relaxed">
                        אחרי יצירת המפתח אפשר להדביק אותו כאן מיד, בלי לצאת מה-onboarding. אם צריך אחר כך endpoint או מודל, אפשר לעבור להגדרות ה-AI המלאות.
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-white/90 mb-1">ספק נבחר להדבקה מהירה</label>
                        <select
                          value={externalAnalysis.quickSetupProviderId || 'gemini'}
                          onChange={(e) => onQuickProviderChange(e.target.value)}
                          className="w-full px-4 py-2 bg-slate-800/60 border border-slate-600 rounded-xl text-white outline-none focus:ring-2 focus:ring-cyan-400"
                        >
                          {externalProviderOptions.map((provider) => (
                            <option key={provider.id} value={provider.id} className="bg-slate-800 text-white">{provider.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {PROVIDER_QUICK_LINKS.map((provider) => (
                          <a
                            key={provider.id}
                            href={provider.keyUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-full border border-slate-400/70 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
                          >
                            {provider.label} · {provider.keyHint}
                          </a>
                        ))}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
                        <div>
                          <label className="block text-xs font-semibold text-white/90 mb-1">
                            הדבק מפתח עבור {externalAnalysis.quickProviderSetup?.label || 'הספק הנבחר'}
                          </label>
                          <input
                            type="password"
                            value={externalAnalysis.quickProviderSetup?.keyValue || ''}
                            onChange={(e) => onQuickProviderKeyChange(e.target.value)}
                            placeholder={externalAnalysis.quickProviderSetup?.placeholder || 'API key'}
                            disabled={externalAnalysis.quickProviderSetup?.acceptsKey === false}
                            className="w-full px-4 py-2 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white placeholder-slate-300 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                          <div className="text-[11px] text-white/70 mt-2 min-h-[18px]">
                            {externalAnalysis.quickProviderSetup?.helpText || 'אפשר להדביק כאן את המפתח ולשמור אותו ישירות מתוך ה-onboarding.'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={onOpenAiSettings}
                          className="px-3 py-2 rounded-lg bg-indigo-500/70 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
                        >
                          הגדרות AI מתקדמות
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={onOpenPersonalStyle}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/70 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
                        >
                          פתח חומרים ולמידה
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modern Navigation Buttons */}
        <div className="flex items-center justify-between px-4 py-6">
          <button
            onClick={prevStep}
            disabled={step === 1}
            className={`group relative px-4 py-4 rounded-2xl text-base font-bold transition-all duration-300 ${
              step === 1 
                ? 'bg-slate-800/30 text-slate-400 cursor-not-allowed backdrop-blur-sm border border-slate-600/50' 
                : 'bg-slate-800/60 text-white hover:bg-slate-800/80 backdrop-blur-md border border-slate-600 shadow-lg hover:shadow-xl transform hover:scale-105'
            }`}
          >
            <span className="flex items-center gap-2">
              ← חזור
            </span>
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="px-4 py-3 rounded-2xl text-sm font-semibold bg-white/10 text-white/85 border border-white/20 hover:bg-white/20 transition-all duration-300"
          >
            אמשיך אחר כך
          </button>
          
          <div className="text-center">
            <div className="text-white text-sm mb-1" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
              שלב {step} מתוך 7
            </div>
            <div className="w-24 h-2 bg-slate-700/50 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-400 to-purple-500 transition-all duration-700"
                style={{ width: `${(step / 7) * 100}%` }}
              ></div>
            </div>
          </div>
          
          <button
            onClick={step === 7 ? onComplete : nextStep}
            disabled={false}
            className={`group relative px-4 py-4 rounded-2xl text-base font-bold transition-all duration-300 ${
              step === 4 
                ? 'bg-white/10 text-white/40 cursor-not-allowed backdrop-blur-sm border border-white/20' 
                : 'bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:from-pink-600 hover:to-purple-700 shadow-lg hover:shadow-2xl transform hover:scale-105 border border-white/20'
            }`}
            style={{
              boxShadow: step !== 4 ? '0 10px 30px rgba(236, 72, 153, 0.3)' : 'none'
            }}
          >
            <span className="flex items-center gap-2">
              {step === 7 ? (profile.onboardingCompletedAt ? 'הושלם ✓' : 'סיום ✨') : 'המשך →'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

