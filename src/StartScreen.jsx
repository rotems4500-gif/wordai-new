import React, { useEffect, useRef, useState } from 'react';
import ChefModeDialog from './ChefModeDialog';
import {
  getHomeInstructions,
  getWorkspaceTemplateCards,
  loadPastDocsIndex,
  loadProjectMaterials,
  saveHelperMaterial,
  saveHomeInstructions,
  syncLearnedStyleFromWorkspace,
  readInstructionFile,
  MATERIAL_UPLOAD_PRESETS,
  getMaterialUploadMeta,
} from './services/workspaceLearningService';
import { getOrderedRoleAgents, getWorkspaceAutomation, getPersonalStyleProfile, savePersonalStyleProfile, chefModeInterview } from './services/aiService';

const MODERN_TEMPLATES = [
  { 
    id: 'blank', 
    title: '📄 דף ריק', 
    subtitle: 'התחל עם רעיון חדש', 
    description: 'יצירה חופשית ללא מגבלות',
    gradient: 'from-slate-400 to-slate-600',
    icon: '✨'
  },
  { 
    id: 'academic', 
    title: '🎓 מאמר אקדמי', 
    subtitle: 'עבודת מחקר מקצועית', 
    description: 'מבוא, פרקים, מקורות וסיכום',
    gradient: 'from-blue-400 to-indigo-600',
    icon: '📚'
  },
  { 
    id: 'report', 
    title: '📊 דוח עסקי', 
    subtitle: 'ניתוח וממצאים מסודרים', 
    description: 'נתונים, גרפים והמלצות',
    gradient: 'from-emerald-400 to-teal-600',
    icon: '📈'
  },
  { 
    id: 'summary', 
    title: '⚡ סיכום מהיר', 
    subtitle: 'נקודות מפתח בקצרה', 
    description: 'תמצית יעילה של נושא מורכב',
    gradient: 'from-yellow-400 to-orange-600',
    icon: '🔥'
  },
  { 
    id: 'proposal', 
    title: '💡 הצעת פרויקט', 
    subtitle: 'רעיון שמוכר את עצמו', 
    description: 'רקע, מטרות ותוכנית פעולה',
    gradient: 'from-purple-400 to-pink-600',
    icon: '🚀'
  },
  { 
    id: 'creative', 
    title: '🎨 כתיבה יצירתית', 
    subtitle: 'סיפור, שיר או תוכן מקורי', 
    description: 'בטא את עצמך ללא גבולות',
    gradient: 'from-pink-400 to-rose-600',
    icon: '🌟'
  },
];

const QUICK_PROMPTS = [
  '✍️ כתוב לי מכתב פורמלי למעסיק',
  '📝 צור הצעת מחקר על בינה מלאכותית',
  '📊 עזור לי להכין דוח ביצועים רבעוני',
  '🎯 כתוב תוכנית עסקית לסטארטאפ',
  '📚 סכם לי מאמר אקדמי מורכב',
  '💌 צור פוסט מרגש לרשתות חברתיות',
];

const WORKFLOW_LABELS = {
  'manager-auto': 'מנהל אוטומטי בוחר מסלול',
  'manager-pipeline': 'מנהל ← מקורות ← מבנה ← כתיבה ← ליטוש',
  'design-first': 'מבנה קודם',
  'research-first': 'חקר קודם',
  'custom-order': 'סדר מותאם אישית',
};

const ONBOARDING_AREAS = ['אקדמיה ומחקר', 'עסקים וניהול', 'משפט ומסמכים רשמיים', 'שיווק ותוכן', 'עבודה משרדית', 'שימוש כללי'];
const ONBOARDING_AUDIENCES = ['מרצים ובודקים', 'לקוחות ושותפים', 'מנהלים בארגון', 'קהל רחב', 'שימוש פנימי'];
const ONBOARDING_FORMATS = ['פסקאות קצרות וברורות', 'סגנון מפורט ומעמיק', 'תוכן עם כותרות וסעיפים', 'ניסוח תכליתי ומהיר'];
const ONBOARDING_TONES = ['רשמי', 'אקדמי', 'אנושי', 'ישיר', 'משכנע', 'ידידותי'];
const LENGTH_OPTIONS = ['קצר', 'מאוזן', 'מעמיק'];
const PARAGRAPH_OPTIONS = ['תמציתי', 'בינוני', 'מפורט'];
const LEARNING_GAMES = [
  {
    id: 'tone-game',
    title: 'איזה קול אתה רוצה מהסוכן?',
    options: [
      { id: 'formal', label: 'רשמי ומדויק', insight: 'להעדיף טון רשמי ומדויק', tone: 'רשמי' },
      { id: 'human', label: 'אנושי וזורם', insight: 'להעדיף ניסוח אנושי וזורם', tone: 'אנושי' },
      { id: 'direct', label: 'ישיר ולעניין', insight: 'להעדיף תשובות ישירות וללא מריחות', tone: 'ישיר' },
    ],
  },
  {
    id: 'depth-game',
    title: 'איזו רמת פירוט עובדת הכי טוב בשבילך?',
    options: [
      { id: 'short', label: 'קצר ומהיר', insight: 'להעדיף תמצות ותשובות קצרות', sentenceLength: 'קצר', paragraphLength: 'תמציתי' },
      { id: 'balanced', label: 'מאוזן וברור', insight: 'להעדיף איזון בין קיצור להסבר', sentenceLength: 'מאוזן', paragraphLength: 'בינוני' },
      { id: 'deep', label: 'מעמיק ומפורט', insight: 'להעדיף עומק ופירוט כשיש צורך', sentenceLength: 'מעמיק', paragraphLength: 'מפורט' },
    ],
  },
  {
    id: 'structure-game',
    title: 'איך הכי נוח לך לקבל טקסט?',
    options: [
      { id: 'headings', label: 'כותרות וסעיפים', insight: 'להעדיף מבנה היררכי עם כותרות', format: 'תוכן עם כותרות וסעיפים' },
      { id: 'paragraphs', label: 'פסקאות זורמות', insight: 'להעדיף כתיבה רציפה בפסקאות', format: 'סגנון מפורט ומעמיק' },
      { id: 'quick', label: 'נקודות קצרות', insight: 'להעדיף נקודות תכליתיות ומהירות', format: 'ניסוח תכליתי ומהיר' },
    ],
  },
  {
    id: 'avoid-game',
    title: 'מה הכי חשוב לך שהסוכן ימנע ממנו?',
    options: [
      { id: 'invent', label: 'לא להמציא מקורות', insight: 'לא להמציא עובדות או מקורות חסרים' },
      { id: 'repeat', label: 'לא לחזור על עצמו', insight: 'להימנע מחזרתיות וניפוח' },
      { id: 'robotic', label: 'לא להיות רובוטי', insight: 'להעדיף שפה טבעית ולא מכנית' },
    ],
  },
];

const splitInlineList = (value = '') => String(value || '')
  .split(/[\n,•]+/)
  .map((item) => item.trim())
  .filter(Boolean);

const getStartScreenCustomizations = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem('wordflow_home_customizations') || '{}');
    return {
      templates: parsed?.templates || {},
      styles: parsed?.styles || {},
    };
  } catch {
    return { templates: {}, styles: {} };
  }
};

const applyStartScreenCustomizations = (items = [], kind = 'templates') => {
  const overrides = getStartScreenCustomizations()?.[kind] || {};
  return items.map((item) => ({
    ...item,
    ...(overrides[item.id] || {}),
  }));
};

export default function StartScreen({ onCreateBlank, onCreateTemplate, onOpenLastDraft, onOpenDocument = () => {}, onGenerateFromPrompt, onDocumentStyleChange = () => {}, onOpenSettings = () => {}, documentStyle = 'academic', hasDraft = false, lastSavedAt = '' }) {
  const [prompt, setPrompt] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [showChefDialog, setShowChefDialog] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini');
  
  const profile = getPersonalStyleProfile();

  const fileInputRef = useRef(null);
  const instructionFileInputRef = useRef(null);
  const [instructions, setInstructions] = useState(() => (typeof getHomeInstructions === 'function' ? getHomeInstructions() : ''));
  const [materials, setMaterials] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [instructionFileName, setInstructionFileName] = useState('');
  const [loadedWorkspace, setLoadedWorkspace] = useState(null);
  const [uploadKind, setUploadKind] = useState('general');

  const [templateCards, setTemplateCards] = useState(() => applyStartScreenCustomizations(MODERN_TEMPLATES, 'templates'));
  const [editingCard, setEditingCard] = useState(null);

  const saveCardCustomization = () => {
    if (!editingCard?.id) return;
    const nextCustomizations = getStartScreenCustomizations();
    nextCustomizations['templates'] = {
      ...(nextCustomizations['templates'] || {}),
      [editingCard.id]: {
        title: String(editingCard.title || '').trim() || editingCard.title,
        subtitle: String(editingCard.subtitle || '').trim() || editingCard.subtitle,
        customPrompt: String(editingCard.customPrompt || '').trim() || '',
      },
    };
    localStorage.setItem('wordflow_home_customizations', JSON.stringify(nextCustomizations));

    setTemplateCards((prev) => prev.map((item) => item.id === editingCard.id ? {
      ...item,
      title: String(editingCard.title || '').trim() || item.title,
      subtitle: String(editingCard.subtitle || '').trim() || item.subtitle,
      customPrompt: String(editingCard.customPrompt || '').trim() || '',
    } : item));

    setEditingCard(null);
  };

  useEffect(() => {
    if (typeof loadProjectMaterials === 'function') loadProjectMaterials().then(setMaterials).catch(()=>null);
    if (typeof getWorkspaceAutomation === 'function') {
      const auto = getWorkspaceAutomation();
      if (auto?.enabled) setLoadedWorkspace(auto);
    }
  }, []);

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const selectedUploadMeta = typeof getMaterialUploadMeta === 'function' ? getMaterialUploadMeta(uploadKind) : { id: uploadKind };
      const uploadedIds = [];
      for (const file of files) {
        if (typeof saveHelperMaterial === 'function') {
          const result = await saveHelperMaterial(file, selectedUploadMeta);
          if (result?.entry?.id) uploadedIds.push(result.entry.id);
        }
      }
      if (typeof loadProjectMaterials === 'function') {
        const mats = await loadProjectMaterials();
        setMaterials(mats);
      }
      if (uploadedIds.length) {
        setSelectedIds((prev) => Array.from(new Set([...prev, ...uploadedIds])));
      }
    } catch(e) { console.error(e); } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleInstructionFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      let extracted = '';
      if (typeof readInstructionFile === 'function') extracted = await readInstructionFile(file);
      if (!String(extracted || '').trim()) {
        window.alert('לא הצלחתי לקרוא תוכן מתוך קובץ ההנחיות.');
        return;
      }
      const labeledText = 'קובץ הנחיות: ' + file.name + '\n' + String(extracted).trim();
      const nextInstructions = instructions.trim() ? instructions.trim() + '\n\n---\n' + labeledText : labeledText;
      setInstructions(nextInstructions);
      setInstructionFileName(file.name);
    } catch (error) {
      console.error(error);
    } finally {
      event.target.value = '';
    }
  };

  const handleLoadWorkspace = () => {
    if (typeof getWorkspaceAutomation !== 'function' || typeof getOrderedRoleAgents !== 'function') return;
    const automation = getWorkspaceAutomation();
    const agents = getOrderedRoleAgents(automation.workflowMode);
    if (!automation?.enabled) {
      window.alert('צריך קודם להפעיל את סביבת הסוכנים במסך ההגדרות.');
      return;
    }
    setLoadedWorkspace({ ...automation, agents });
  };

  
  useEffect(() => {
    setMounted(true);
    // אנימציה מחזורית של ההצעות המהירות
    const interval = setInterval(() => {
      setCurrentPromptIndex(prev => (prev + 1) % QUICK_PROMPTS.length);
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    
    setIsGenerating(true);
    try {
      await onGenerateFromPrompt?.({ prompt, templateId: selectedTemplate, instructions: '', selectedMaterials: [], selectedModel: selectedModel });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleQuickPrompt = (quickPrompt) => {
    setPrompt(quickPrompt);
    setShowQuickPrompts(false);
  };

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template.id);
    if (template.id === 'blank') {
      onCreateBlank?.();
    } else {
      onCreateTemplate?.(template);
    }
  };

  const handleChefStart = async (responses, model) => {
    try {
      setIsGenerating(true);
      const result = await chefModeInterview(responses, model);
      const prompt = String(result?.html ?? responses?.[0]?.answer ?? 'בישול אוטומטי').trim();
      await onGenerateFromPrompt?.({ prompt, templateId: selectedTemplate, instructions: '', selectedMaterials: [], selectedModel: model });
      setShowChefDialog(false);
    } catch (error) {
      console.error('שגיאה בשלב הבישול:', error);
      window.alert('שגיאה בשלב הבישול. בדוק את הקונסול.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleChefClose = () => {
    setShowChefDialog(false);
  };

  return (
    <div className="min-h-[calc(100vh-140px)] w-full flex-1 bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900 relative overflow-hidden" dir="rtl">
      {/* Animated Background Elements */}
      <div className="absolute inset-0">
        <div className="absolute top-20 right-20 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-pink-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '4s' }}></div>
      </div>

      {/* Floating Particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute bg-white/5 rounded-full animate-bounce"
            style={{
              width: Math.random() * 10 + 5 + 'px',
              height: Math.random() * 10 + 5 + 'px',
              left: Math.random() * 100 + '%',
              top: Math.random() * 100 + '%',
              animationDelay: Math.random() * 5 + 's',
              animationDuration: (Math.random() * 3 + 2) + 's'
            }}
          />
        ))}
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        {/* Hero Section */}
        <div className={`text-center mb-16 transition-all duration-1000 ${mounted ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-10'}`}>
          <div className="mb-8">
            <h1 className="text-6xl md:text-7xl font-bold text-white mb-4" style={{ textShadow: '2px 2px 20px rgba(0,0,0,0.5)' }}>
              {profile?.displayName ? (
                <>שלום <span className="bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">{profile.displayName}</span>! 👋</>
              ) : (
                <>יוצרים <span className="bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">תוכן חכם</span> ביחד? 🚀</>
              )}
            </h1>
            <p className="text-xl md:text-2xl text-white/80 max-w-3xl mx-auto leading-relaxed" style={{ textShadow: '1px 1px 10px rgba(0,0,0,0.3)' }}>
              AI שמבין אותך, יוצר איתך, וממשיך ללמוד מהסגנון שלך ⚡
            </p>
          </div>

          {/* Quick Prompt Animation */}
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 max-w-4xl mx-auto mb-8 shadow-2xl">
            <div className="text-white/70 text-sm mb-4">רעיונות למסמכים:</div>
            <div 
              className="text-white text-lg font-medium transition-all duration-500"
              style={{ textShadow: '1px 1px 5px rgba(0,0,0,0.5)' }}
            >
              {QUICK_PROMPTS[currentPromptIndex]}
            </div>
            <div className="flex justify-center mt-4 space-x-2">
              {QUICK_PROMPTS.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    i === currentPromptIndex ? 'bg-pink-400 w-6' : 'bg-white/30'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Main Input Area */}
          <div className="bg-white/10 backdrop-blur-xl border border-white/30 rounded-3xl p-8 max-w-5xl mx-auto shadow-2xl">
            <div className="flex flex-col md:flex-row gap-4 items-center mb-6">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                  placeholder="מה תרצה ליצור היום? תכתוב כאן ואני אעזור לך..."
                  className="w-full px-6 py-4 bg-white/20 backdrop-blur-sm border border-white/30 rounded-2xl text-white placeholder-white/60 text-lg outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all duration-300"
                />
                <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
                  <div className="w-3 h-3 bg-pink-400 rounded-full animate-pulse"></div>
                </div>
              </div>
              
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || isGenerating}
                className={`px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-300 transform hover:scale-105 ${
                  !prompt.trim() || isGenerating
                    ? 'bg-gray-500/50 text-gray-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-lg hover:shadow-2xl'
                }`}
                style={{
                  boxShadow: !prompt.trim() || isGenerating ? 'none' : '0 10px 30px rgba(236, 72, 153, 0.4)'
                }}
              >
                {isGenerating ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full"></div>
                    יוצר...
                  </div>
                ) : (
                  <>✨ בואו נתחיל</>
                )}
              </button>

              <button
                onClick={() => setShowChefDialog(true)}
                disabled={isGenerating}
                className="px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-300 transform hover:scale-105 bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-lg hover:shadow-2xl disabled:bg-gray-500/50 disabled:cursor-not-allowed"
                style={{
                  boxShadow: !isGenerating ? '0 10px 30px rgba(249, 115, 22, 0.4)' : 'none'
                }}
              >
                👨‍🍳 בוא נבשל
              </button>
            </div>

            {/* Advance Options Area */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-6">
               <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
                 <div className="text-white/80 font-medium whitespace-nowrap">✨ חומרי עזר והנחיות</div>
                 <div className="flex flex-wrap items-center gap-2 justify-end w-full">
                   <button onClick={handleLoadWorkspace} className="px-3 py-2 bg-indigo-500/30 hover:bg-indigo-500/50 border border-indigo-400/30 rounded-xl text-white text-xs transition-all shadow-sm">
                     טען סביבת עבודה
                   </button>
                   <button onClick={() => instructionFileInputRef.current?.click()} className="px-3 py-2 bg-emerald-500/30 hover:bg-emerald-500/50 border border-emerald-400/30 rounded-xl text-white text-xs transition-all shadow-sm">
                     קובץ הנחיות
                   </button>
                   <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 bg-blue-500/30 hover:bg-blue-500/50 border border-blue-400/30 rounded-xl text-white text-xs transition-all shadow-sm">
                     {uploading ? 'מעלה...' : 'הוסף מסמכי עזר'}
                   </button>
                   <input ref={instructionFileInputRef} type="file" accept=".txt,.md,.markdown,.html,.htm,.json,.pdf" className="hidden" onChange={handleInstructionFileUpload} />
                   <input ref={fileInputRef} type="file" multiple accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.markdown,.html,.htm,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleUpload} />
                 </div>
               </div>
               
               <div className="grid md:grid-cols-2 gap-4 text-right">
                 <div>
                   <textarea
                     value={instructions}
                     onChange={(e) => setInstructions(e.target.value)}
                     placeholder="הנחיות קצרות למסמך המסוים הזה... (למשל: סגנון אקדמי, פסקאות קצרות)"
                     className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-sm outline-none focus:ring-1 focus:ring-pink-400 focus:border-transparent resize-y min-h-[90px] h-full"
                   />
                 </div>
                 <div className="bg-white/5 border border-white/10 rounded-xl p-3 min-h-[90px] max-h-[140px] overflow-y-auto">
                   {materials.length === 0 ? (
                     <div className="text-white/40 text-[11px] text-center mt-4">בחר 'הוסף מסמכי עזר' כדי לבסס את הצ'אט עליהם.</div>
                   ) : (
                     materials.map(item => (
                       <label key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg mb-1 cursor-pointer transition-colors">
                         <div className="flex items-center gap-2 overflow-hidden w-[85%]">
                           <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={e => setSelectedIds(prev => e.target.checked ? [...prev, item.id] : prev.filter(id => id !== item.id))} className="checkbox checkbox-xs border-indigo-300 rounded bg-white/20" />
                           <span className="text-white/90 text-xs truncate leading-tight w-full" title={item.title}>{item.title}</span>
                         </div>
                         <span className="text-white/50 text-[9px] whitespace-nowrap border border-white/20 bg-white/5 px-2 py-0.5 rounded">{item.label || 'כללי'}</span>
                       </label>
                     ))
                   )}
                 </div>
               </div>
               
               {loadedWorkspace && (
                 <div className="mt-4 p-3 bg-amber-500/20 border border-amber-400/30 rounded-xl text-right">
                   <div className="text-amber-100 text-sm font-semibold mb-1">סביבת העבודה שנטענה</div>
                   <div className="text-amber-200/80 text-xs">{loadedWorkspace.workflow}</div>
                   <div className="text-amber-200/60 text-[10px] mt-1">{loadedWorkspace.agents?.join(' • ')}</div>
                 </div>
               )}
            </div>
            
            {/* Quick Actions */}
            <div className="flex flex-wrap justify-center gap-3">
              {['🎯 הצעת פרויקט', '📝 דוח מקצועי', '🎨 כתיבה יצירתית', '📊 ניתוח נתונים'].map((action, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickPrompt(action)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/30 rounded-xl text-white/90 text-sm transition-all duration-300 transform hover:scale-105"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Templates Grid */}
        <div className={`transition-all duration-1000 delay-300 ${mounted ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-10'}`}>
          <h2 className="text-3xl font-bold text-white mb-8 text-center" style={{ textShadow: '1px 1px 10px rgba(0,0,0,0.5)' }}>
            תבניות חכמות להתחלה מהירה
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            {templateCards.map((template, i) => (
              <div
                key={template.id}
                className={`group relative bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 cursor-pointer transition-all duration-500 transform hover:scale-105 hover:bg-white/15 shadow-xl hover:shadow-2xl ${
                  selectedTemplate === template.id ? 'ring-2 ring-pink-400 bg-white/20' : ''
                }`}
                onClick={() => handleTemplateSelect(template)}
                style={{
                  animationDelay: `${i * 0.1}s`
                }}
              >
                <span
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditingCard({
                      kind: 'template',
                      id: template.id,
                      title: template.title,
                      subtitle: template.subtitle || '',
                      customPrompt: template.customPrompt || '',
                    });
                  }}
                  className="absolute left-4 top-4 z-10 inline-flex items-center justify-center w-8 h-8 rounded-full border border-white/30 bg-white/10 text-white/50 hover:text-white hover:bg-white/30 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                  title="ערוך תבנית"
                >
                  ✎
                </span>
                <div className="text-center mb-4">
                  <div className={`w-16 h-16 mx-auto bg-gradient-to-br ${template.gradient} rounded-full flex items-center justify-center text-2xl mb-4 shadow-lg`}>
                    {template.icon}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2" style={{ textShadow: '1px 1px 5px rgba(0,0,0,0.5)' }}>
                    {template.title}
                  </h3>
                  <p className="text-white/70 text-sm mb-3">{template.subtitle}</p>
                  <p className="text-white/50 text-xs">{template.description}</p>
                </div>
                
                <div className="mt-6 opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${template.gradient} transform translate-x-full group-hover:translate-x-0 transition-transform duration-500`}></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Access Bar */}
        <div className={`bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 transition-all duration-1000 delay-500 ${mounted ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-10'}`}>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={onOpenDocument}
              className="flex items-center gap-2 px-6 py-3 bg-white/20 hover:bg-white/30 border border-white/30 rounded-xl text-white transition-all duration-300 transform hover:scale-105"
            >
              📁 פתח מסמך קיים
            </button>
            
            {hasDraft && (
              <button
                onClick={onOpenLastDraft}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500/80 to-emerald-600/80 hover:from-green-600/80 hover:to-emerald-700/80 border border-white/30 rounded-xl text-white transition-all duration-300 transform hover:scale-105 shadow-lg"
              >
                ⚡ המשך טיוטה אחרונה
              </button>
            )}
            
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-2 px-6 py-3 bg-white/20 hover:bg-white/30 border border-white/30 rounded-xl text-white transition-all duration-300 transform hover:scale-105"
            >
              ⚙️ הגדרות וסקילים
            </button>
          </div>
        </div>

        {editingCard && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-[520px] max-w-[96%] rounded-[24px] bg-slate-800 shadow-2xl border border-white/20 p-6 text-right">
              <div className="flex items-center justify-between gap-3 mb-6">
                <div>
                  <div className="text-2xl font-bold text-white">עריכת תבנית</div>
                  <div className="text-sm text-slate-400 mt-1">אפשר לעדכן את השם, התיאור, והנחיות העבודה של התבנית.</div>
                </div>
                <button type="button" onClick={() => setEditingCard(null)} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">✕</button>
              </div>

              <div className="space-y-4">
                <input
                  value={editingCard.title || ''}
                  onChange={(e) => setEditingCard((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="שם התבנית"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-base outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all"
                />
                <textarea
                  value={editingCard.subtitle || ''}
                  onChange={(e) => setEditingCard((prev) => ({ ...prev, subtitle: e.target.value }))}
                  placeholder="תיאור קצר"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-base outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all min-h-[60px] resize-y"
                />
                <textarea
                  value={editingCard.customPrompt || ''}
                  onChange={(e) => setEditingCard((prev) => ({ ...prev, customPrompt: e.target.value }))}
                  placeholder="הנחיות או פרומפט מותאם אישית לתבנית זו (למשל: 'כתוב בצורה אקדמית עם פסקאות קצרות')"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-base outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all min-h-[100px] resize-y"
                />
              </div>

              <div className="flex gap-3 justify-end mt-6">
                <button type="button" onClick={() => setEditingCard(null)} className="px-5 py-2.5 rounded-xl text-white hover:bg-white/10 transition-colors">ביטול</button>
                <button type="button" onClick={() => { saveCardCustomization(); setEditingCard(null); }} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold shadow-lg hover:shadow-pink-500/25 transition-all">שמור</button>
              </div>
            </div>
          </div>
        )}

        {showChefDialog && (
          <ChefModeDialog
            onStart={handleChefStart}
            onClose={handleChefClose}
            onGoToEditor={() => {
              setShowChefDialog(false);
            }}
            selectedModel={selectedModel}
          />
        )}
      </div>
    </div>
  );
}
