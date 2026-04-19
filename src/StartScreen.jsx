import React, { useEffect, useRef, useState } from 'react';
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
import { getOrderedRoleAgents, getWorkspaceAutomation, getPersonalStyleProfile, savePersonalStyleProfile } from './services/aiService';

const TEMPLATE_CARDS = [
  { id: 'blank', title: 'מסמך ריק', subtitle: 'התחל מאפס' },
  { id: 'academic', title: 'עבודה אקדמית', subtitle: 'מבוא, פרקים וסיכום' },
  { id: 'report', title: 'דוח מסודר', subtitle: 'ממצאים והמלצות' },
  { id: 'summary', title: 'סיכום נושא', subtitle: 'נקודות מפתח מהירות' },
  { id: 'office', title: 'מסמך משרדי', subtitle: 'ניסוח מקצועי וענייני' },
  { id: 'proposal', title: 'הצעה', subtitle: 'רקע, מטרות ושלבים' },
  { id: 'letter', title: 'מכתב רשמי', subtitle: 'פתיחה, גוף וסיום' },
];

const STYLE_CARDS = [
  { id: 'academic', title: 'אקדמי', subtitle: 'נקי, רשמי ומובנה' },
  { id: 'legal', title: 'משפטי', subtitle: 'פורמלי, צפוף ומדויק' },
  { id: 'business', title: 'עסקי', subtitle: 'מודרני, חד וברור' },
  { id: 'presentation', title: 'מצגת', subtitle: 'גדול, מרווח ובולט' },
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

export default function StartScreen({ onCreateBlank, onCreateTemplate, onOpenLastDraft, onOpenDocument = () => {}, onGenerateFromPrompt, onDocumentStyleChange = () => {}, documentStyle = 'academic', hasDraft = false, lastSavedAt = '' }) {
  const recentItems = hasDraft
    ? [{ id: 'last', title: 'טיוטה אחרונה', meta: lastSavedAt ? `עודכן: ${lastSavedAt}` : 'שוחזר מכתיבה קודמת' }]
    : [];

  const [prompt, setPrompt] = useState('');
  const [templateId, setTemplateId] = useState('blank');
  const [instructions, setInstructions] = useState(getHomeInstructions());
  const [materials, setMaterials] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [templateCards, setTemplateCards] = useState(applyStartScreenCustomizations(TEMPLATE_CARDS.map((item) => ({ ...item, count: 0, example: '' })), 'templates'));
  const [editingCard, setEditingCard] = useState(null);
  const [learningText, setLearningText] = useState('לומד מהמסמכים הקודמים שלך...');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPromptOptions, setShowPromptOptions] = useState(false);
  const [instructionFileName, setInstructionFileName] = useState('');
  const [loadedWorkspace, setLoadedWorkspace] = useState(null);
  const [profile, setProfile] = useState(() => getPersonalStyleProfile());
  const [showOnboarding, setShowOnboarding] = useState(() => {
    const personal = getPersonalStyleProfile();
    const snoozedUntil = new Date(personal.onboardingSnoozedUntil || '').getTime();
    return !personal.onboardingCompletedAt && (!snoozedUntil || Number.isNaN(snoozedUntil) || snoozedUntil < Date.now());
  });
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [savingGame, setSavingGame] = useState(false);
  const [uploadKind, setUploadKind] = useState('general');
  const [onboarding, setOnboarding] = useState(() => {
    const personal = getPersonalStyleProfile();
    return {
      displayName: personal.displayName || '',
      institutionName: personal.institutionName || '',
      studyTrack: personal.studyTrack || '',
      userRole: personal.userRole || '',
      courses: Array.isArray(personal.currentCourses) ? personal.currentCourses.join(', ') : '',
      additionalContext: personal.additionalContext || '',
      area: personal.userBackground || '',
      goals: personal.writingGoals || '',
      audience: personal.defaultAudience || '',
      format: personal.formatPreferences || '',
      tones: Array.isArray(personal.tonePreferences) ? personal.tonePreferences.slice(0, 4) : [],
      terms: Array.isArray(personal.manualVocabulary) ? personal.manualVocabulary.join(', ') : '',
      keepTerms: Array.isArray(personal.protectedVocabulary) ? personal.protectedVocabulary.join(', ') : '',
      allowLearning: personal.learningConsent === true,
    };
  });
  const [personalizationDraft, setPersonalizationDraft] = useState(() => {
    const personal = getPersonalStyleProfile();
    return {
      defaultStyle: personal.defaultDocumentStyle || 'academic',
      favoriteStyles: Array.isArray(personal.preferredHomeStyleIds) && personal.preferredHomeStyleIds.length ? personal.preferredHomeStyleIds : ['academic'],
      sentenceLength: personal.sentenceLengthPreference || 'מאוזן',
      paragraphLength: personal.paragraphLengthPreference || 'בינוני',
      notes: personal.customStyleGuidance || '',
    };
  });
  const [learningGameAnswers, setLearningGameAnswers] = useState(() => ({ ...(getPersonalStyleProfile().learningGameAnswers || {}) }));
  const fileInputRef = useRef(null);
  const instructionFileInputRef = useRef(null);

  const reloadWorkspaceContext = async () => {
    const [docs, projectMaterials, learned, workspaceTemplates] = await Promise.all([
      loadPastDocsIndex(),
      loadProjectMaterials(),
      syncLearnedStyleFromWorkspace(),
      getWorkspaceTemplateCards(),
    ]);
    setMaterials(projectMaterials);
    setTemplateCards(applyStartScreenCustomizations(workspaceTemplates, 'templates'));
    setProfile(learned?.profile || getPersonalStyleProfile());
    const categoryLabel = learned.dominantCategory === 'academic'
      ? 'אקדמי'
      : learned.dominantCategory === 'office'
        ? 'משרדי'
        : learned.dominantCategory === 'summary'
          ? 'סיכומי'
          : 'כללי';
    const personalizationSuffix = learned?.profile?.onboardingCompletedAt ? ' • התאמה אישית פעילה' : '';
    setLearningText(`נמצאו ${docs.length} מסמכים קודמים • הסגנון הדומיננטי: ${categoryLabel}${personalizationSuffix}`);
  };

  useEffect(() => {
    reloadWorkspaceContext().catch(() => {
      setLearningText('המערכת מוכנה ללמידה ממסמכים קודמים');
    });
  }, []);

  const selectedMaterials = materials.filter((item) => selectedIds.includes(item.id));
  const onboardingCompleted = Boolean(profile.onboardingCompletedAt);
  const customizations = getStartScreenCustomizations();
  const personalizedStyleCards = [...STYLE_CARDS].map((style) => ({
    ...style,
    ...(customizations.styles?.[style.id] || {}),
  })).sort((a, b) => {
    const aFav = personalizationDraft.favoriteStyles.includes(a.id) ? 1 : 0;
    const bFav = personalizationDraft.favoriteStyles.includes(b.id) ? 1 : 0;
    return bFav - aFav;
  }).map((style) => ({
    ...style,
    subtitle: personalizationDraft.favoriteStyles.includes(style.id)
      ? `${style.subtitle} • מועדף עליך`
      : style.subtitle,
  }));

  const updateOnboarding = (field, value) => {
    setOnboarding((prev) => ({ ...prev, [field]: value }));
  };

  const updatePersonalization = (field, value) => {
    setPersonalizationDraft((prev) => ({ ...prev, [field]: value }));
  };

  const chooseLearningGameAnswer = (gameId, optionId) => {
    setLearningGameAnswers((prev) => ({ ...prev, [gameId]: optionId }));
  };

  const toggleFavoriteStyle = (styleId) => {
    setPersonalizationDraft((prev) => {
      const exists = prev.favoriteStyles.includes(styleId);
      const nextFavoriteStyles = exists
        ? prev.favoriteStyles.filter((item) => item !== styleId)
        : [...prev.favoriteStyles, styleId].slice(0, 4);
      return {
        ...prev,
        favoriteStyles: nextFavoriteStyles.length ? nextFavoriteStyles : [styleId],
      };
    });
  };

  const toggleTone = (tone) => {
    setOnboarding((prev) => ({
      ...prev,
      tones: prev.tones.includes(tone)
        ? prev.tones.filter((item) => item !== tone)
        : [...prev.tones, tone].slice(0, 4),
    }));
  };

  useEffect(() => {
    const personal = getPersonalStyleProfile();
    setPersonalizationDraft({
      defaultStyle: personal.defaultDocumentStyle || 'academic',
      favoriteStyles: Array.isArray(personal.preferredHomeStyleIds) && personal.preferredHomeStyleIds.length ? personal.preferredHomeStyleIds : ['academic'],
      sentenceLength: personal.sentenceLengthPreference || 'מאוזן',
      paragraphLength: personal.paragraphLengthPreference || 'בינוני',
      notes: personal.customStyleGuidance || '',
    });
  }, [profile]);

  const handleOnboardingLater = () => {
    const nextProfile = {
      ...profile,
      learningConsent: onboarding.allowLearning !== false,
      onboardingDismissedAt: new Date().toISOString(),
      onboardingSnoozedUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    };
    savePersonalStyleProfile(nextProfile);
    setProfile(nextProfile);
    setShowOnboarding(false);
  };

  const handleSaveOnboarding = async () => {
    if (savingOnboarding) return;
    setSavingOnboarding(true);
    try {
      const nextProfile = {
        ...profile,
        displayName: String(onboarding.displayName || '').trim(),
        institutionName: String(onboarding.institutionName || '').trim(),
        studyTrack: String(onboarding.studyTrack || '').trim(),
        userRole: String(onboarding.userRole || '').trim(),
        currentCourses: splitInlineList(onboarding.courses).slice(0, 12),
        additionalContext: String(onboarding.additionalContext || '').trim(),
        userBackground: onboarding.area,
        writingGoals: String(onboarding.goals || '').trim(),
        defaultAudience: onboarding.audience,
        formatPreferences: onboarding.format,
        preferredDocumentTypes: onboarding.area ? [onboarding.area] : [],
        tonePreferences: (onboarding.tones || []).slice(0, 8),
        manualVocabulary: splitInlineList(onboarding.terms).slice(0, 20),
        protectedVocabulary: splitInlineList(onboarding.keepTerms).slice(0, 20),
        learningConsent: onboarding.allowLearning !== false,
        notes: [
          String(profile.notes || '').trim(),
          onboarding.goals ? `מטרות משתמש: ${String(onboarding.goals || '').trim()}` : '',
        ].filter(Boolean).slice(-2).join('\n'),
        onboardingCompletedAt: new Date().toISOString(),
        onboardingDismissedAt: '',
        onboardingSnoozedUntil: '',
        onboardingVersion: 1,
      };

      savePersonalStyleProfile(nextProfile);
      setProfile(nextProfile);
      setShowOnboarding(false);
      if (nextProfile.learningConsent !== false) {
        await reloadWorkspaceContext();
        setLearningText('ההיכרות נשמרה. העוזר יתאים את עצמו אליך וימשיך ללמוד מהמסמכים לאורך הזמן.');
      } else {
        setLearningText('ההיכרות נשמרה. הלמידה האוטומטית כבויה כרגע והעוזר יישען על ההעדפות שהגדרת.');
      }
    } finally {
      setSavingOnboarding(false);
    }
  };

  const handleSaveLearningGame = () => {
    if (savingGame) return;
    setSavingGame(true);
    try {
      const selectedOptions = LEARNING_GAMES.map((game) => game.options.find((option) => option.id === learningGameAnswers[game.id])).filter(Boolean);
      const insights = selectedOptions.map((option) => option.insight).filter(Boolean);
      const nextProfile = {
        ...profile,
        learningGameAnswers,
        learningGameInsights: insights,
        tonePreferences: Array.from(new Set([...(profile.tonePreferences || []), ...selectedOptions.map((option) => option.tone).filter(Boolean)])).slice(0, 8),
        sentenceLengthPreference: selectedOptions.find((option) => option.sentenceLength)?.sentenceLength || profile.sentenceLengthPreference,
        paragraphLengthPreference: selectedOptions.find((option) => option.paragraphLength)?.paragraphLength || profile.paragraphLengthPreference,
        formatPreferences: selectedOptions.find((option) => option.format)?.format || profile.formatPreferences,
        customStyleGuidance: Array.from(new Set([
          String(profile.customStyleGuidance || '').trim(),
          ...insights,
        ].filter(Boolean))).join(' • '),
        learningGamesCompletedAt: new Date().toISOString(),
      };
      savePersonalStyleProfile(nextProfile);
      setProfile(nextProfile);
      setLearningText('משחקי הלמידה נשמרו. הסוכן מכיר עכשיו טוב יותר את ההעדפות האישיות שלך.');
    } finally {
      setSavingGame(false);
    }
  };

  const handleSavePersonalization = () => {
    if (savingPreferences) return;
    setSavingPreferences(true);
    try {
      const nextProfile = {
        ...profile,
        defaultDocumentStyle: personalizationDraft.defaultStyle || 'academic',
        preferredHomeStyleIds: Array.from(new Set([personalizationDraft.defaultStyle || 'academic', ...personalizationDraft.favoriteStyles])).slice(0, 4),
        sentenceLengthPreference: personalizationDraft.sentenceLength,
        paragraphLengthPreference: personalizationDraft.paragraphLength,
        customStyleGuidance: String(personalizationDraft.notes || '').trim(),
        onboardingCompletedAt: profile.onboardingCompletedAt || new Date().toISOString(),
      };
      savePersonalStyleProfile(nextProfile);
      setProfile(nextProfile);
      onDocumentStyleChange(nextProfile.defaultDocumentStyle || 'academic');
      setLearningText('ההתאמה האישית נשמרה. מסך הבית והסוכן יתעדפו את הסגנונות שבחרת.');
    } finally {
      setSavingPreferences(false);
    }
  };

  const stripWorkspaceBlock = (value = '') => String(value || '')
    .replace(/\n?\[סביבת עבודה טעונה\][\s\S]*?\[\/סביבת עבודה טעונה\]\n?/g, '')
    .trim();

  const handleLoadWorkspace = () => {
    const automation = getWorkspaceAutomation();
    const agents = getOrderedRoleAgents(automation.workflowMode);
    if (!automation?.enabled) {
      window.alert('צריך קודם להפעיל את סביבת הסוכנים במסך ההגדרות.');
      return;
    }

    const block = [
      '[סביבת עבודה טעונה]',
      `שם הסביבה: ${automation.workspaceName || 'סביבת עבודה מותאמת'}`,
      `סדר עבודה: ${WORKFLOW_LABELS[automation.workflowMode] || WORKFLOW_LABELS['manager-pipeline']}`,
      agents.length ? `סוכנים פעילים: ${agents.map((agent) => agent.name).join(', ')}` : 'אין סוכנים פעילים',
      automation.sharedGoal ? `מטרה: ${automation.sharedGoal}` : '',
      '[/סביבת עבודה טעונה]',
    ].filter(Boolean).join('\n');

    const baseInstructions = stripWorkspaceBlock(instructions);
    const nextInstructions = [baseInstructions, block].filter(Boolean).join('\n\n');
    setInstructions(nextInstructions);
    setLoadedWorkspace({
      name: automation.workspaceName || 'סביבת עבודה מותאמת',
      workflow: WORKFLOW_LABELS[automation.workflowMode] || WORKFLOW_LABELS['manager-pipeline'],
      agents: agents.map((agent) => agent.name),
    });
    setShowPromptOptions(true);
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    try {
      await onGenerateFromPrompt?.({
        prompt,
        templateId,
        instructions,
        selectedMaterials,
        documentStyle,
      });
      saveHomeInstructions('');
      setPrompt('');
      setInstructions('');
      setInstructionFileName('');
    } finally {
      setLoading(false);
    }
  };

  const saveCardCustomization = () => {
    if (!editingCard?.id) return;
    const nextCustomizations = getStartScreenCustomizations();
    const bucket = editingCard.kind === 'style' ? 'styles' : 'templates';
    nextCustomizations[bucket] = {
      ...(nextCustomizations[bucket] || {}),
      [editingCard.id]: {
        title: String(editingCard.title || '').trim() || editingCard.title,
        subtitle: String(editingCard.subtitle || '').trim() || editingCard.subtitle,
        ...(editingCard.kind === 'style' ? { fontFamily: String(editingCard.fontFamily || '').trim() } : {}),
      },
    };
    localStorage.setItem('wordflow_home_customizations', JSON.stringify(nextCustomizations));

    if (editingCard.kind === 'style') {
      let styleOverrides = {};
      try {
        styleOverrides = JSON.parse(localStorage.getItem('wordflow_style_overrides') || '{}');
      } catch {
        styleOverrides = {};
      }
      styleOverrides[editingCard.id] = {
        ...(styleOverrides[editingCard.id] || {}),
        fontFamily: String(editingCard.fontFamily || '').trim(),
      };
      localStorage.setItem('wordflow_style_overrides', JSON.stringify(styleOverrides));
      if (editingCard.id === documentStyle) onDocumentStyleChange(editingCard.id);
    }

    if (editingCard.kind === 'template') {
      setTemplateCards((prev) => prev.map((item) => item.id === editingCard.id ? {
        ...item,
        title: String(editingCard.title || '').trim() || item.title,
        subtitle: String(editingCard.subtitle || '').trim() || item.subtitle,
      } : item));
    }

    setEditingCard(null);
  };

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const selectedUploadMeta = getMaterialUploadMeta(uploadKind);
      const uploadedIds = [];
      for (const file of files) {
        const result = await saveHelperMaterial(file, selectedUploadMeta);
        if (result?.entry?.id) uploadedIds.push(result.entry.id);
      }
      await reloadWorkspaceContext();
      if (uploadedIds.length) {
        setSelectedIds((prev) => Array.from(new Set([...prev, ...uploadedIds])));
      }
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleInstructionFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const extracted = await readInstructionFile(file);
      if (!String(extracted || '').trim()) {
        window.alert('לא הצלחתי לקרוא תוכן מתוך קובץ ההנחיות.');
        return;
      }

      const labeledText = `קובץ הנחיות: ${file.name}\n${String(extracted).trim()}`;
      const nextInstructions = instructions.trim()
        ? `${instructions.trim()}\n\n---\n${labeledText}`
        : labeledText;

      setInstructions(nextInstructions);
      setInstructionFileName(file.name);
      setShowPromptOptions(true);
    } catch (error) {
      const message = error?.message === 'unsupported-binary-file'
        ? 'זה קובץ Word/PowerPoint בינארי ולכן הוא הוצג כג׳יבריש. השתמש ב-TXT, MD, HTML, JSON או PDF טקסטואלי.'
        : 'לא הצלחתי לקרוא את קובץ ההנחיות. אם זה קובץ טקסט ישן, עכשיו המערכת מנסה לזהות גם קידוד עברי אוטומטית.';
      window.alert(message);
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="absolute inset-0 z-20 bg-[#F7F9FC] overflow-y-auto" dir="rtl" data-theme="corporate">
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="rounded-[28px] bg-gradient-to-br from-[#DCE9FB] to-[#EEF4FF] border border-[#D7E3F8] px-8 py-10 mb-8 text-center shadow-sm">
          <h1 className="text-4xl font-bold text-slate-800 mb-4">{profile.displayName ? `שלום ${profile.displayName}, מה תרצה ליצור היום?` : 'מה תרצה ליצור היום?'}</h1>
          <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || loading}
                className="btn btn-primary px-5 min-h-0 h-10 rounded-xl text-sm disabled:opacity-50"
              >
                {loading ? 'יוצר...' : 'צור'}
              </button>
              <button
                type="button"
                onClick={() => setShowPromptOptions((prev) => !prev)}
                className="btn btn-outline btn-primary px-4 min-h-0 h-10 rounded-xl text-sm"
              >
                {showPromptOptions ? 'הסתר הנחיות וקבצים' : 'הוסף הנחיות וקבצים'}
              </button>
              <button
                type="button"
                onClick={handleLoadWorkspace}
                className="btn btn-outline btn-accent px-4 min-h-0 h-10 rounded-xl text-sm"
              >
                טען סביבת עבודה
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPromptOptions(true);
                  instructionFileInputRef.current?.click();
                }}
                className="btn btn-outline btn-secondary px-4 min-h-0 h-10 rounded-xl text-sm"
              >
                קובץ הנחיות
              </button>
              <button
                type="button"
                onClick={onOpenDocument}
                className="btn btn-outline btn-info px-4 min-h-0 h-10 rounded-xl text-sm"
              >
                פתח מסמך לעריכה
              </button>
              <select
                value={uploadKind}
                onChange={(e) => setUploadKind(e.target.value)}
                className="select select-bordered min-h-0 h-10 rounded-xl text-sm bg-white"
              >
                {Object.values(MATERIAL_UPLOAD_PRESETS).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-outline px-4 min-h-0 h-10 rounded-xl text-sm"
              >
                {uploading ? 'מעלה...' : 'צרף קבצי עזר'}
              </button>
              <input ref={instructionFileInputRef} type="file" accept=".txt,.md,.markdown,.html,.htm,.json,.pdf" className="hidden" onChange={handleInstructionFileUpload} />
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
                placeholder="תאר את המסמך שברצונך לכתוב, למשל: @claude עבודה על הונגריה עם מקורות וסיכום"
                className="input input-bordered flex-1 min-w-[260px] bg-white text-slate-700 text-right"
              />
            </div>

            <div className="text-[11px] text-slate-500 text-right mb-2">
              לפתיחת קובץ קיים שאפשר לערוך השתמש ב־"פתח מסמך לעריכה". אפשר גם לתייג מודל ישירות בבקשה: @claude, @gemini, @openai או אפילו כמה יחד.
            </div>

            <div className="flex flex-wrap gap-2 mb-3 text-right">
              <span className="rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs">סוג מסמך: {templateId === 'blank' ? 'חופשי' : templateId}</span>
              <span className={`rounded-full px-3 py-1 text-xs ${selectedMaterials.length ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                {selectedMaterials.length ? `נבחרו ${selectedMaterials.length} קבצי עזר` : 'ללא קבצי עזר'}
              </span>
              <span className="rounded-full bg-fuchsia-100 text-fuchsia-700 px-3 py-1 text-xs">סוג העלאה: {getMaterialUploadMeta(uploadKind).label}</span>
              <span className={`rounded-full px-3 py-1 text-xs ${instructions.trim() ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {instructions.trim() ? 'יש הנחיות ספציפיות למסמך' : 'ללא הנחיות נוספות'}
              </span>
              {instructionFileName ? (
                <span className="rounded-full bg-violet-100 text-violet-700 px-3 py-1 text-xs">קובץ הנחיות: {instructionFileName}</span>
              ) : null}
              {loadedWorkspace ? (
                <span className="rounded-full bg-amber-100 text-amber-700 px-3 py-1 text-xs">סביבה נטענה: {loadedWorkspace.name}</span>
              ) : null}
            </div>

            {showPromptOptions && (
              <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-3 text-right border-t border-slate-200 pt-3 mt-3 mb-3">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="text-xs text-slate-500">הנחיות ספציפיות למסמך הזה</div>
                    <button onClick={() => instructionFileInputRef.current?.click()} className="btn btn-outline btn-secondary btn-xs rounded-lg">
                      טען קובץ הנחיות
                    </button>
                  </div>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="למשל: כתוב בסגנון אקדמי, השתמש בטון ענייני, שמור על פסקאות קצרות, אל תמציא מקורות"
                    className="textarea textarea-bordered w-full min-h-[120px] rounded-xl resize-y"
                  />
                  <div className="text-xs text-slate-500 mt-2">אפשר לכתוב כאן ידנית, או לטעון קובץ הנחיות שלם שיתווסף אוטומטית למסמך הנוכחי.</div>
                </div>

                <div>                  {loadedWorkspace ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 mb-2 text-right">
                      <div className="text-xs font-semibold text-amber-800">סביבת העבודה שנטענה</div>
                      <div className="text-xs text-amber-700 mt-1">{loadedWorkspace.workflow}</div>
                      <div className="text-[11px] text-amber-700 mt-1">{loadedWorkspace.agents?.join(' • ')}</div>
                    </div>
                  ) : null}                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="text-xs text-slate-500">קבצי עזר למסמך הזה</div>
                    <button onClick={() => fileInputRef.current?.click()} className="btn btn-outline btn-primary btn-xs rounded-lg">
                      {uploading ? 'מעלה...' : 'הוסף קבצים'}
                    </button>
                  </div>
                  <div className="max-h-[190px] overflow-y-auto space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                    {materials.length ? materials.map((item) => (
                      <label key={item.id} className="flex items-start gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2 hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-primary checkbox-sm mt-0.5"
                          checked={selectedIds.includes(item.id)}
                          onChange={(e) => setSelectedIds((prev) => e.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id))}
                        />
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{item.title}</div>
                          <div className="text-xs text-slate-500">{item.label || 'כללי'}</div>
                        </div>
                      </label>
                    )) : <div className="text-sm text-slate-500 px-2 py-3">אפשר לצרף PDF, מצגות, סיכומים, Word או קבצי טקסט.</div>}
                  </div>
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-3 text-right">
              <div>
                <div className="text-xs text-slate-500 mb-1">סוג מסמך רצוי</div>
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="select select-bordered w-full rounded-xl bg-white">
                  <option value="blank">חופשי</option>
                  <option value="academic">עבודה אקדמית</option>
                  <option value="report">דוח</option>
                  <option value="legal">מסמך משפטי</option>
                  <option value="summary">סיכום נושא</option>
                  <option value="office">מסמך משרדי</option>
                  <option value="proposal">הצעה</option>
                  <option value="letter">מכתב רשמי</option>
                </select>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600">
                {learningText}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8">
            <div className="rounded-[24px] bg-white border border-slate-200 shadow-sm p-5 text-right">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">היכרות אישית עם הסוכן</h2>
                  <div className="text-sm text-slate-500">רשות בלבד • נשמר מקומית על המחשב • אפשר לעדכן בכל רגע</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!showOnboarding && (
                    <button type="button" onClick={() => setShowOnboarding(true)} className="btn btn-outline btn-primary btn-sm rounded-xl">
                      {onboardingCompleted ? 'עדכן היכרות' : 'התחל היכרות'}
                    </button>
                  )}
                  {showOnboarding && (
                    <button type="button" onClick={handleOnboardingLater} className="btn btn-ghost btn-sm rounded-xl">
                      לא עכשיו
                    </button>
                  )}
                </div>
              </div>

              {showOnboarding ? (
                <div className="grid lg:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <input
                      value={onboarding.displayName}
                      onChange={(e) => updateOnboarding('displayName', e.target.value)}
                      placeholder="איך תרצה שהסוכן יקרא לך?"
                      className="input input-bordered w-full rounded-xl bg-white"
                    />

                    <input
                      value={onboarding.institutionName}
                      onChange={(e) => updateOnboarding('institutionName', e.target.value)}
                      placeholder="מוסד לימודים, ארגון או מקום עבודה"
                      className="input input-bordered w-full rounded-xl bg-white"
                    />

                    <input
                      value={onboarding.studyTrack}
                      onChange={(e) => updateOnboarding('studyTrack', e.target.value)}
                      placeholder="חוג, מסלול, התמחות או תחום מרכזי"
                      className="input input-bordered w-full rounded-xl bg-white"
                    />

                    <input
                      value={onboarding.userRole}
                      onChange={(e) => updateOnboarding('userRole', e.target.value)}
                      placeholder="למשל: סטודנט, מרצה, מנהל, עורך דין, עצמאי"
                      className="input input-bordered w-full rounded-xl bg-white"
                    />

                    <textarea
                      value={onboarding.courses}
                      onChange={(e) => updateOnboarding('courses', e.target.value)}
                      placeholder="קורסים או נושאים חשובים כרגע, מופרדים בפסיקים"
                      className="textarea textarea-bordered w-full min-h-[82px] rounded-xl resize-y"
                    />

                    <div>
                      <div className="text-xs text-slate-500 mb-1">באיזה הקשר אתה כותב לרוב?</div>
                      <select value={onboarding.area} onChange={(e) => updateOnboarding('area', e.target.value)} className="select select-bordered w-full rounded-xl bg-white">
                        <option value="">בחר תחום עיקרי</option>
                        {ONBOARDING_AREAS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500 mb-1">מי בדרך כלל קורא את מה שאתה כותב?</div>
                      <select value={onboarding.audience} onChange={(e) => updateOnboarding('audience', e.target.value)} className="select select-bordered w-full rounded-xl bg-white">
                        <option value="">בחר קהל יעד</option>
                        {ONBOARDING_AUDIENCES.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500 mb-1">איך אתה אוהב שהטקסט ייראה?</div>
                      <select value={onboarding.format} onChange={(e) => updateOnboarding('format', e.target.value)} className="select select-bordered w-full rounded-xl bg-white">
                        <option value="">בחר מבנה מועדף</option>
                        {ONBOARDING_FORMATS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </div>

                    <textarea
                      value={onboarding.goals}
                      onChange={(e) => updateOnboarding('goals', e.target.value)}
                      placeholder="מה חשוב לך שהסוכן יעשה טוב יותר עבורך? למשל: עבודה אקדמית מדויקת, ניסוח חד למיילים, סיכומים קצרים"
                      className="textarea textarea-bordered w-full min-h-[110px] rounded-xl resize-y"
                    />
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-slate-500 mb-2">טון כתיבה מועדף</div>
                      <div className="flex flex-wrap gap-2">
                        {ONBOARDING_TONES.map((tone) => (
                          <button
                            key={tone}
                            type="button"
                            onClick={() => toggleTone(tone)}
                            className={`px-3 py-1.5 rounded-full text-xs border ${onboarding.tones.includes(tone) ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}
                          >
                            {tone}
                          </button>
                        ))}
                      </div>
                    </div>

                    <textarea
                      value={onboarding.terms}
                      onChange={(e) => updateOnboarding('terms', e.target.value)}
                      placeholder="מילים או מונחים שחשוב לך שהסוכן יעדיף להשתמש בהם"
                      className="textarea textarea-bordered w-full min-h-[88px] rounded-xl resize-y"
                    />

                    <textarea
                      value={onboarding.keepTerms}
                      onChange={(e) => updateOnboarding('keepTerms', e.target.value)}
                      placeholder="מילים או ביטויים שלא כדאי לשנות אצלך"
                      className="textarea textarea-bordered w-full min-h-[88px] rounded-xl resize-y"
                    />

                    <textarea
                      value={onboarding.additionalContext}
                      onChange={(e) => updateOnboarding('additionalContext', e.target.value)}
                      placeholder="כל פרט נוסף שיעזור לסוכן להכיר אותך טוב יותר"
                      className="textarea textarea-bordered w-full min-h-[88px] rounded-xl resize-y"
                    />

                    <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <input type="checkbox" className="checkbox checkbox-primary checkbox-sm mt-0.5" checked={onboarding.allowLearning !== false} onChange={(e) => updateOnboarding('allowLearning', e.target.checked)} />
                      <span>אפשר לסוכן להמשיך ללמוד מהמסמכים והקבצים שלי לאורך הזמן</span>
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={handleSaveOnboarding} disabled={savingOnboarding} className="btn btn-primary btn-sm rounded-xl">
                        {savingOnboarding ? 'שומר...' : 'שמור התאמה אישית'}
                      </button>
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-outline btn-secondary btn-sm rounded-xl">
                        צרף דוגמאות כתיבה
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-sm text-slate-600 mb-2">
                    {onboardingCompleted ? 'הסוכן כבר מכיר את הסגנון שלך וימשיך לדייק אותו עם הזמן.' : 'אפשר להתחיל היכרות קצרה כדי שהסוכן יתאים את עצמו אליך כבר מהשימוש הראשון.'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {profile.displayName ? <span className="rounded-full bg-violet-50 text-violet-700 px-3 py-1 text-xs">{profile.displayName}</span> : null}
                    {profile.institutionName ? <span className="rounded-full bg-amber-50 text-amber-700 px-3 py-1 text-xs">{profile.institutionName}</span> : null}
                    {profile.studyTrack ? <span className="rounded-full bg-cyan-50 text-cyan-700 px-3 py-1 text-xs">{profile.studyTrack}</span> : null}
                    {profile.userBackground ? <span className="rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs">{profile.userBackground}</span> : null}
                    {profile.defaultAudience ? <span className="rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs">קהל יעד: {profile.defaultAudience}</span> : null}
                    {(profile.tonePreferences || []).slice(0, 4).map((tone) => (
                      <span key={tone} className="rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-xs">{tone}</span>
                    ))}
                    <span className={`rounded-full px-3 py-1 text-xs ${profile.learningConsent === false ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {profile.learningConsent === false ? 'למידה אוטומטית כבויה' : 'למידה מתמשכת פעילה'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

        <div className="mb-8">
          <div className="rounded-[24px] bg-white border border-slate-200 shadow-sm p-5 text-right mb-4">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div>
                <h2 className="text-xl font-bold text-slate-800">התאמה אישית מהירה</h2>
                <div className="text-sm text-slate-500">בחר סגנונות מועדפים, ברירת מחדל והנחיות אישיות למסך הבית</div>
              </div>
              <button type="button" onClick={handleSavePersonalization} disabled={savingPreferences} className="btn btn-primary btn-sm rounded-xl">
                {savingPreferences ? 'שומר...' : 'שמור התאמה'}
              </button>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-slate-500 mb-2">סגנונות מועדפים</div>
                  <div className="flex flex-wrap gap-2">
                    {STYLE_CARDS.map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => toggleFavoriteStyle(style.id)}
                        className={`px-3 py-1.5 rounded-full text-xs border ${personalizationDraft.favoriteStyles.includes(style.id) ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-700 border-slate-200'}`}
                      >
                        {style.title}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500 mb-1">סגנון ברירת מחדל</div>
                  <select value={personalizationDraft.defaultStyle} onChange={(e) => updatePersonalization('defaultStyle', e.target.value)} className="select select-bordered w-full rounded-xl bg-white">
                    {STYLE_CARDS.map((style) => <option key={style.id} value={style.id}>{style.title}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-xs text-slate-500 mb-2">אורך משפטים מועדף</div>
                  <div className="flex flex-wrap gap-2">
                    {LENGTH_OPTIONS.map((item) => (
                      <button key={item} type="button" onClick={() => updatePersonalization('sentenceLength', item)} className={`px-3 py-1.5 rounded-full text-xs border ${personalizationDraft.sentenceLength === item ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>{item}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500 mb-2">אורך פסקאות מועדף</div>
                  <div className="flex flex-wrap gap-2">
                    {PARAGRAPH_OPTIONS.map((item) => (
                      <button key={item} type="button" onClick={() => updatePersonalization('paragraphLength', item)} className={`px-3 py-1.5 rounded-full text-xs border ${personalizationDraft.paragraphLength === item ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>{item}</button>
                    ))}
                  </div>
                </div>

                <textarea
                  value={personalizationDraft.notes}
                  onChange={(e) => updatePersonalization('notes', e.target.value)}
                  placeholder="מה חשוב שיהיה קבוע בסגנון שלך? למשל: תשובות ישירות, עברית אקדמית, כותרות ברורות, בלי חזרתיות"
                  className="textarea textarea-bordered w-full min-h-[110px] rounded-xl resize-y"
                />
              </div>
            </div>
          </div>

          <div className="rounded-[20px] border border-violet-200 bg-violet-50 p-4 mb-4 text-right">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div>
                <h3 className="text-lg font-bold text-violet-900">משחקי למידה מהירים</h3>
                <div className="text-sm text-violet-700">כמה בחירות קצרות שיעזרו לסוכן להבין איך הכי נכון לעבוד איתך</div>
              </div>
              <button type="button" onClick={handleSaveLearningGame} disabled={savingGame} className="btn btn-secondary btn-sm rounded-xl">
                {savingGame ? 'שומר...' : 'שמור את תוצאות המשחק'}
              </button>
            </div>

            <div className="grid lg:grid-cols-2 gap-3">
              {LEARNING_GAMES.map((game) => (
                <div key={game.id} className="rounded-xl border border-violet-100 bg-white p-3">
                  <div className="text-sm font-semibold text-slate-800 mb-2">{game.title}</div>
                  <div className="flex flex-wrap gap-2">
                    {game.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => chooseLearningGameAnswer(game.id, option.id)}
                        className={`px-3 py-1.5 rounded-full text-xs border ${learningGameAnswers[game.id] === option.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {!!(profile.learningGameInsights || []).length && (
              <div className="mt-3 text-xs text-violet-800">
                למידה פעילה שנשמרה: {(profile.learningGameInsights || []).join(' • ')}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-2xl font-bold text-slate-800">סגנון מסמך מקצועי</h2>
            <div className="text-sm text-slate-500">הסגנון נצמד גם למסמכים חדשים וגם לכתיבה הקיימת</div>
          </div>
          <div className="grid md:grid-cols-4 gap-3">
            {personalizedStyleCards.map((style) => (
              <button
                key={style.id}
                onClick={() => onDocumentStyleChange(style.id)}
                className={`card relative rounded-2xl text-right border transition-all duration-200 ${documentStyle === style.id ? 'border-[#2B579A] bg-[#EEF4FF] shadow-md' : 'border-slate-200 bg-white hover:shadow-sm'}`}
              >
                <span
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditingCard({
                      kind: 'style',
                      id: style.id,
                      title: style.title,
                      subtitle: style.subtitle,
                      fontFamily: style.fontFamily || '',
                    });
                  }}
                  className="absolute left-3 top-3 inline-flex items-center justify-center w-8 h-8 rounded-full border border-slate-200 bg-white text-slate-600 hover:text-[#2B579A]"
                  title="ערוך סגנון"
                >
                  ✎
                </span>
                <div className="card-body p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-slate-800" style={{ fontFamily: style.fontFamily || 'inherit' }}>{style.title}</div>
                    <div className="flex gap-1 flex-wrap">
                      {personalizationDraft.defaultStyle === style.id && <span className="text-xs rounded-full bg-slate-800 text-white px-2 py-1">ברירת מחדל</span>}
                      {documentStyle === style.id && <span className="text-xs rounded-full bg-[#2B579A] text-white px-2 py-1">פעיל</span>}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">{style.subtitle}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.3fr_0.7fr] gap-5 mb-8">
          <div className="card bg-base-100 border border-slate-200 rounded-2xl shadow-sm">
            <div className="card-body p-4">
              <div className="flex items-center justify-between mb-2 gap-3">
                <div className="text-lg font-bold text-slate-800">הנחיות ספציפיות למסמך</div>
                <button onClick={() => fileInputRef.current?.click()} className="btn btn-outline btn-primary btn-sm rounded-xl">
                  {uploading ? 'מעלה...' : 'צרף קבצים'}
                </button>
              </div>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="למשל: כתוב תמיד בעברית תקינה, השתמש בפסקאות קצרות, אל תמציא מקורות, שמור על טון ענייני"
                className="textarea textarea-bordered w-full min-h-[120px] rounded-xl resize-y"
              />
              <div className="text-xs text-slate-500 mt-2">כאן אפשר לכתוב הנחיות ייעודיות למסמך המסוים שאתה יוצר עכשיו.</div>
            </div>
          </div>

          <div className="card bg-base-100 border border-slate-200 rounded-2xl shadow-sm">
            <div className="card-body p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-bold text-slate-800">חומרי עזר</div>
              <button onClick={() => fileInputRef.current?.click()} className="btn btn-outline btn-primary btn-sm rounded-xl">
                {uploading ? 'מעלה...' : 'הוסף קובץ'}
              </button>
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.markdown,.html,.htm,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleUpload} />
            </div>
            <div className="max-h-[220px] overflow-y-auto space-y-2">
              {materials.length ? materials.map((item) => (
                <label key={item.id} className="flex items-start gap-2 rounded-xl border border-slate-100 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary checkbox-sm mt-0.5"
                    checked={selectedIds.includes(item.id)}
                    onChange={(e) => setSelectedIds((prev) => e.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id))}
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{item.title}</div>
                    <div className="text-xs text-slate-500">{item.label || 'כללי'}</div>
                  </div>
                </label>
              )) : <div className="text-sm text-slate-500">עדיין לא הוספת חומרי עזר</div>}
            </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-slate-800">תבניות מהירות</h2>
          <button onClick={onCreateBlank} className="btn btn-ghost btn-sm text-[#2B579A] font-semibold">מסמך ריק</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4 mb-10">
          {templateCards.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => (tpl.id === 'blank' ? onCreateBlank() : onCreateTemplate(tpl))}
              className="card relative bg-base-100 border border-slate-200 rounded-2xl p-4 text-right hover:shadow-lg hover:border-[#93C5FD] transition-all duration-200"
            >
              <span
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditingCard({
                    kind: 'template',
                    id: tpl.id,
                    title: tpl.title,
                    subtitle: tpl.subtitle || '',
                  });
                }}
                className="absolute left-3 top-3 inline-flex items-center justify-center w-8 h-8 rounded-full border border-slate-200 bg-white text-slate-600 hover:text-[#2B579A]"
                title="ערוך תבנית"
              >
                ✎
              </span>
              <div className="h-28 rounded-xl bg-gradient-to-b from-white to-slate-100 border border-slate-200 mb-3 flex items-center justify-center text-[#2B579A] font-bold text-center px-2">
                {tpl.title}
              </div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="font-semibold text-slate-800 text-sm">{tpl.title}</div>
                {tpl.count ? <span className="text-[10px] rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">{tpl.count}</span> : null}
              </div>
              <div className="text-xs text-slate-500 min-h-[32px]">{tpl.subtitle || ''}</div>
              {tpl.example ? <div className="text-[11px] text-slate-400 truncate mt-1">{tpl.example}</div> : <div className="h-[16px]"></div>}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-slate-800">אחרונים</h3>
          {hasDraft && (
            <button onClick={onOpenLastDraft} className="btn btn-primary btn-sm rounded-full px-4">
              פתח טיוטה אחרונה
            </button>
          )}
        </div>

        {editingCard && (
          <div className="fixed inset-0 z-40 bg-slate-900/35 flex items-center justify-center p-4">
            <div className="w-[520px] max-w-[96%] rounded-[24px] bg-white shadow-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <div className="text-xl font-bold text-slate-800">{editingCard.kind === 'style' ? 'עריכת סגנון' : 'עריכת תבנית'}</div>
                  <div className="text-sm text-slate-500">אפשר לעדכן שם, תיאור וגופן ברירת מחדל.</div>
                </div>
                <button type="button" onClick={() => setEditingCard(null)} className="btn btn-sm btn-ghost">סגור</button>
              </div>

              <div className="space-y-3">
                <input
                  value={editingCard.title || ''}
                  onChange={(e) => setEditingCard((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="שם"
                  className="input input-bordered w-full rounded-xl bg-white"
                />
                <textarea
                  value={editingCard.subtitle || ''}
                  onChange={(e) => setEditingCard((prev) => ({ ...prev, subtitle: e.target.value }))}
                  placeholder="תיאור קצר"
                  className="textarea textarea-bordered w-full min-h-[90px] rounded-xl"
                />
                {editingCard.kind === 'style' && (
                  <input
                    value={editingCard.fontFamily || ''}
                    onChange={(e) => setEditingCard((prev) => ({ ...prev, fontFamily: e.target.value }))}
                    placeholder="גופן לסגנון הזה, למשל: Frank Ruhl Libre"
                    className="input input-bordered w-full rounded-xl bg-white"
                  />
                )}
              </div>

              <div className="flex gap-3 justify-end mt-5">
                <button type="button" onClick={() => setEditingCard(null)} className="btn btn-ghost">ביטול</button>
                <button type="button" onClick={saveCardCustomization} className="btn btn-primary">שמור</button>
              </div>
            </div>
          </div>
        )}

        <div className="card bg-base-100 border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {recentItems.length ? recentItems.map((item) => (
            <button
              key={item.id}
              onClick={onOpenLastDraft}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 border-b last:border-b-0 border-slate-100"
            >
              <div className="text-right">
                <div className="font-semibold text-slate-800">{item.title}</div>
                <div className="text-xs text-slate-500">{item.meta}</div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-[#E8F0FE] text-[#2B579A] flex items-center justify-center">W</div>
            </button>
          )) : (
            <div className="px-5 py-8 text-sm text-slate-500 text-center">עדיין אין מסמכים אחרונים</div>
          )}
        </div>
      </div>
    </div>
  );
}
