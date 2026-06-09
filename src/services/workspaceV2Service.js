export const WORKSPACE_V2_VERSION = 'workspace-v2.0-draft';
const WORKSPACE_V2_CUSTOM_TEMPLATES_KEY = 'wordai_workspace_v2_templates';

export const WORKSPACE_V2_TEMPLATE_IDS = {
  MARKETING: 'marketing',
  ACADEMIC_HEAVY: 'academic-heavy',
  ACADEMIC_LIGHT: 'academic-light',
  ARGUMENT: 'argument',
};

const WORKSPACE_V2_DEFAULT_TEMPLATE_ID = WORKSPACE_V2_TEMPLATE_IDS.ACADEMIC_LIGHT;

const normalizeText = (value = '') => String(value || '')
  .replace(/\s+/g, ' ')
  .trim();

const unique = (values = []) => [...new Set((Array.isArray(values) ? values : [values])
  .map((value) => normalizeText(value))
  .filter(Boolean))];

const containsAnySignal = (text = '', signals = []) => {
  const normalizedText = normalizeText(text).toLowerCase();
  return (Array.isArray(signals) ? signals : []).some((signal) => {
    const normalizedSignal = normalizeText(signal).toLowerCase();
    return normalizedSignal && normalizedText.includes(normalizedSignal);
  });
};

const buildWorkspaceV2Step = ({
  id = '',
  role = '',
  goal = '',
  instructions = [],
  output = '',
  providerId = '',
  model = '',
  required = true,
} = {}) => ({
  id,
  role,
  goal,
  instructions: unique(instructions),
  output,
  providerId: normalizeText(providerId),
  model: normalizeText(model),
  required: required !== false,
});

const readWorkspaceV2TemplateOverrides = () => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKSPACE_V2_CUSTOM_TEMPLATES_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeWorkspaceV2TemplateOverrides = (value = {}) => {
  if (typeof localStorage === 'undefined') return value;
  const safeValue = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  localStorage.setItem(WORKSPACE_V2_CUSTOM_TEMPLATES_KEY, JSON.stringify(safeValue));
  try {
    window.dispatchEvent(new CustomEvent('wordai-workspace-v2-templates-changed', { detail: { templates: safeValue } }));
  } catch {}
  return safeValue;
};

const normalizeWorkspaceV2Step = (step = {}, index = 0) => buildWorkspaceV2Step({
  id: normalizeText(step?.id) || `step-${index + 1}`,
  role: normalizeText(step?.role) || `שלב ${index + 1}`,
  goal: normalizeText(step?.goal),
  instructions: Array.isArray(step?.instructions)
    ? step.instructions
    : String(step?.instructions || '').split(/\n|;/g),
  output: normalizeText(step?.output),
  providerId: normalizeText(step?.providerId),
  model: normalizeText(step?.model),
  required: step?.required !== false,
});

const normalizeWorkspaceV2TemplateRecord = (template = {}, fallback = {}) => {
  const source = template && typeof template === 'object' ? template : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  const id = normalizeText(source.id || base.id).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const pipelineSource = Array.isArray(source.pipeline) && source.pipeline.length ? source.pipeline : base.pipeline;
  const sourcePolicy = {
    ...(base.sourcePolicy || {}),
    ...(source.sourcePolicy && typeof source.sourcePolicy === 'object' ? source.sourcePolicy : {}),
  };
  const stylePolicy = {
    ...(base.stylePolicy || {}),
    ...(source.stylePolicy && typeof source.stylePolicy === 'object' ? source.stylePolicy : {}),
  };

  return {
    ...base,
    ...source,
    id: id || base.id || WORKSPACE_V2_DEFAULT_TEMPLATE_ID,
    label: normalizeText(source.label || base.label) || 'סביבת עבודה',
    mission: normalizeText(source.mission || base.mission),
    taskSignals: unique(Array.isArray(source.taskSignals) ? source.taskSignals : (base.taskSignals || [])),
    providerId: normalizeText(source.providerId || base.providerId),
    model: normalizeText(source.model || base.model),
    sourcePolicy: {
      ...sourcePolicy,
      mode: normalizeText(sourcePolicy.mode),
      citationStyle: normalizeText(sourcePolicy.citationStyle),
      requireSourcesWhen: unique(sourcePolicy.requireSourcesWhen || []),
    },
    stylePolicy: {
      ...stylePolicy,
      preservePersonalStyle: stylePolicy.preservePersonalStyle !== false,
      allowPersuasiveReframing: stylePolicy.allowPersuasiveReframing === true,
      avoid: unique(stylePolicy.avoid || []),
    },
    pipeline: (Array.isArray(pipelineSource) ? pipelineSource : []).map(normalizeWorkspaceV2Step).filter((step) => step.id && step.role),
    builtIn: base.builtIn === true || Object.prototype.hasOwnProperty.call(WORKSPACE_V2_TEMPLATES, id),
    updatedAt: normalizeText(source.updatedAt || base.updatedAt),
  };
};

export const WORKSPACE_V2_GLOBAL_GUARDRAILS = {
  directIsolation: [
    'המסלול הישיר הוא baseline עצמאי. אין להשתמש בזיכרון, סוכנים או תבניות workspace כאשר הריצה סומנה כ-direct.',
    'כל context של workspace נוצר מחדש לכל run ומקבל runId משלו.',
  ],
  styleProtection: [
    'שמור על הסגנון האישי של המשתמש, אבל אל תכפה מבנה או אורך שלא מתאים למטלה.',
    'כל שינוי סגנוני חייב לשרת את העבודה, לא למחוק את הקול האישי.',
  ],
  sourceDiscipline: [
    'כאשר המשימה דורשת עובדות, מחקר, ציטוטים או מקורות, העדף grounding לפני כתיבה.',
    'אל תמציא מקורות, DOI, שמות מאמרים, ציטוטים או נתונים.',
  ],
  memoryIsolation: [
    'זיכרון run קודם לא נכנס אוטומטית ל-run חדש.',
    'זיכרון workspace מותר רק אם הוא הוגדר במפורש כפרופיל או חומר עזר רלוונטי.',
  ],
};

export const WORKSPACE_V2_TEMPLATES = {
  [WORKSPACE_V2_TEMPLATE_IDS.MARKETING]: {
    id: WORKSPACE_V2_TEMPLATE_IDS.MARKETING,
    label: 'שיווק',
    mission: 'להפוך בקשה שיווקית לתוצר חד, שימושי ומשכנע שמותאם לקהל היעד ולפעולה הרצויה.',
    taskSignals: ['שיווק', 'קמפיין', 'מותג', 'פרסום', 'פוסט', 'מודעה', 'קהל יעד', 'מסר', 'cta', 'copy', 'landing', 'sales'],
    sourcePolicy: {
      mode: 'context-first',
      requireSourcesWhen: ['טענות עובדתיות', 'נתונים', 'השוואת מתחרים', 'אירועים עדכניים'],
      citationStyle: 'plain-links-when-needed',
    },
    stylePolicy: {
      preservePersonalStyle: true,
      allowPersuasiveReframing: true,
      avoid: ['קלישאות שיווקיות ריקות', 'הבטחות לא מבוססות', 'טון גנרי מדי'],
    },
    pipeline: [
      buildWorkspaceV2Step({
        id: 'brief-reader',
        role: 'מפענח בריף',
        goal: 'להבין מוצר, קהל יעד, הצעה, ערוץ וטון.',
        instructions: ['חלץ את מטרת העבודה ואת הפעולה הרצויה.', 'סמן חוסרים חשובים בלי לעצור אם אפשר להתקדם בהנחה סבירה.'],
        output: 'תקציר בריף והנחות עבודה',
      }),
      buildWorkspaceV2Step({
        id: 'message-strategist',
        role: 'אסטרטג מסר',
        goal: 'לבנות זווית, הבטחה, ועמודי מסר.',
        instructions: ['העדף מסר אחד ברור על פני רשימת רעיונות מפוזרת.', 'בדוק התאמה לקהל ולערוץ.'],
        output: 'מסר מרכזי וזוויות תמיכה',
      }),
      buildWorkspaceV2Step({
        id: 'copywriter',
        role: 'כותב שיווקי',
        goal: 'לכתוב טקסט חד, טבעי ומוכן לשימוש.',
        instructions: ['שמור על קול אנושי.', 'הימנע מהייפ שלא נשען על הבריף.'],
        output: 'טיוטת copy מלאה',
      }),
      buildWorkspaceV2Step({
        id: 'conversion-reviewer',
        role: 'מבקר המרה',
        goal: 'לוודא שהתוצר ברור, משכנע ומוביל לפעולה.',
        instructions: ['בדוק כותרת, פתיחה, CTA, וטון.', 'תקן חיכוך או ניסוח חלש במקום רק להעיר עליו.'],
        output: 'גרסה סופית מלוטשת',
      }),
    ],
  },
  [WORKSPACE_V2_TEMPLATE_IDS.ACADEMIC_HEAVY]: {
    id: WORKSPACE_V2_TEMPLATE_IDS.ACADEMIC_HEAVY,
    label: 'עבודה אקדמית כבדה',
    mission: 'להפיק עבודה אקדמית מסכמת או מורכבת עם מבנה, מקורות, זהירות טענה ושמירה על קול אישי.',
    taskSignals: ['עבודה מסכמת', 'סמינר', 'סקירת ספרות', 'ביבליוגרפיה', 'מקורות', 'apa', 'mla', 'ציטוטים', 'מאמרים', 'מחקר', 'אקדמית כבדה'],
    sourcePolicy: {
      mode: 'sources-first',
      requireSourcesWhen: ['תמיד, אלא אם המשתמש סיפק חומרי קורס בלבד וביקש לא לצאת מהם'],
      citationStyle: 'academic-requested-or-apa',
    },
    stylePolicy: {
      preservePersonalStyle: true,
      allowPersuasiveReframing: false,
      avoid: ['קביעות לא מגובות', 'רשימת מקורות מומצאת', 'שפה גבוהה מדי שמוחקת את הסגנון האישי'],
    },
    pipeline: [
      buildWorkspaceV2Step({
        id: 'assignment-analyst',
        role: 'מנתח מטלה',
        goal: 'לפרק דרישות, היקף, שיטת ציטוט, מגבלות וחומרי חובה.',
        instructions: ['זהה דרישות שעלולות להפיל את העבודה.', 'הפרד בין מה שהמרצה דרש לבין הצעות שיפור.'],
        output: 'מפת דרישות וסיכונים',
      }),
      buildWorkspaceV2Step({
        id: 'source-researcher',
        role: 'חוקר מקורות',
        goal: 'לאתר או לארגן מקורות אמינים ורלוונטיים לפני כתיבה.',
        instructions: ['העדף מקורות אקדמיים.', 'אל תכתוב טענה עובדתית בלי בסיס ברור.'],
        output: 'רשימת מקורות/חומרי בסיס והקשר שימוש',
      }),
      buildWorkspaceV2Step({
        id: 'academic-architect',
        role: 'בונה מבנה',
        goal: 'לבנות שלד עבודה עם טיעון, פרקים ותנועה לוגית.',
        instructions: ['שמור על מבנה שמתאים להיקף.', 'אל תכפה פרקים אם המטלה דורשת פורמט אחר.'],
        output: 'שלד מפורט',
      }),
      buildWorkspaceV2Step({
        id: 'academic-writer',
        role: 'כותב אקדמי',
        goal: 'לכתוב גוף עבודה זהיר, ברור ומבוסס.',
        instructions: ['שלב מקורות רק כאשר הם קיימים בהקשר.', 'שמור על סגנון אישי בתוך מסגרת אקדמית.'],
        output: 'טיוטת עבודה',
      }),
      buildWorkspaceV2Step({
        id: 'compliance-reviewer',
        role: 'בודק דרישות',
        goal: 'לוודא התאמה למטלה, מקורות, מבנה וסגנון.',
        instructions: ['חפש חוסרים שעלולים להוריד ציון.', 'תקן את הטיוטה בפועל ולא רק תסכם בעיות.'],
        output: 'גרסה מוכנה להגשה או רשימת חוסרים חסומים',
      }),
    ],
  },
  [WORKSPACE_V2_TEMPLATE_IDS.ACADEMIC_LIGHT]: {
    id: WORKSPACE_V2_TEMPLATE_IDS.ACADEMIC_LIGHT,
    label: 'עבודה אקדמית קלה',
    mission: 'לעזור במשימה לימודית קצרה או בינונית בלי להפוך אותה למסמך כבד מדי.',
    taskSignals: ['מטלה', 'סיכום', 'רפלקציה', 'שאלה', 'תשובה', 'קורס', 'מרצה', 'אקדמית קלה', 'עבודה קצרה'],
    sourcePolicy: {
      mode: 'materials-aware',
      requireSourcesWhen: ['כאשר המשתמש ביקש מקורות', 'כאשר יש טענות עובדתיות או דרישה אקדמית מפורשת'],
      citationStyle: 'simple-academic',
    },
    stylePolicy: {
      preservePersonalStyle: true,
      allowPersuasiveReframing: false,
      avoid: ['ניפוח מיותר', 'מבנה מסורבל', 'שפה שלא נשמעת כמו המשתמש'],
    },
    pipeline: [
      buildWorkspaceV2Step({
        id: 'task-reader',
        role: 'קורא מטלה',
        goal: 'להבין מה בדיוק צריך להגיש ומה ההיקף הסביר.',
        instructions: ['זהה את הפורמט המבוקש.', 'שמור על פתרון קצר אם המטלה קצרה.'],
        output: 'פירוק דרישה קצר',
      }),
      buildWorkspaceV2Step({
        id: 'learning-writer',
        role: 'כותב לימודי',
        goal: 'לנסח תשובה ברורה, מסודרת וטבעית.',
        instructions: ['השתמש במושגי הקורס אם הם קיימים.', 'שמור על קול אישי ומובן.'],
        output: 'טיוטה לימודית',
      }),
      buildWorkspaceV2Step({
        id: 'clarity-reviewer',
        role: 'בודק בהירות',
        goal: 'לוודא שהתשובה עונה לשאלה בלי עודף.',
        instructions: ['הסר חזרות.', 'חדד משפטים עמומים.'],
        output: 'גרסה נקייה להגשה',
      }),
    ],
  },
  [WORKSPACE_V2_TEMPLATE_IDS.ARGUMENT]: {
    id: WORKSPACE_V2_TEMPLATE_IDS.ARGUMENT,
    label: 'טקסט טיעון',
    mission: 'לבנות טקסט טיעון משכנע עם עמדה ברורה, נימוקים, נגד-טענה וסיום חזק.',
    taskSignals: ['טיעון', 'טקסט טיעון', 'עמדה', 'נימוקים', 'נגד טענה', 'בעד ונגד', 'שכנוע', 'argument', 'opinion'],
    sourcePolicy: {
      mode: 'claim-aware',
      requireSourcesWhen: ['כאשר הנימוקים עובדתיים', 'כאשר הטקסט נדרש להיות אקדמי או ציבורי'],
      citationStyle: 'inline-when-needed',
    },
    stylePolicy: {
      preservePersonalStyle: true,
      allowPersuasiveReframing: true,
      avoid: ['עמדה עמומה', 'נימוקים לא קשורים', 'נגד-טענה חלשה בכוונה'],
    },
    pipeline: [
      buildWorkspaceV2Step({
        id: 'position-framer',
        role: 'מנסח עמדה',
        goal: 'לזקק טענה מרכזית וקהל יעד.',
        instructions: ['בחר עמדה ברורה לפי בקשת המשתמש.', 'אם המשתמש לא נתן עמדה, הצע עמדה סבירה מתוך ההקשר.'],
        output: 'טענה מרכזית וכיוון',
      }),
      buildWorkspaceV2Step({
        id: 'argument-builder',
        role: 'בונה נימוקים',
        goal: 'לבנות רצף נימוקים חזק ומדורג.',
        instructions: ['כל נימוק צריך לתמוך ישירות בעמדה.', 'הוסף דוגמה או הסבר לכל נימוק.'],
        output: 'שלד טיעון',
      }),
      buildWorkspaceV2Step({
        id: 'counterargument-reviewer',
        role: 'בודק נגד-טענה',
        goal: 'להכניס התנגדות אמינה ומענה משכנע.',
        instructions: ['אל תיצור איש קש.', 'חבר את המענה בחזרה לעמדה המרכזית.'],
        output: 'נגד-טענה ומענה',
      }),
      buildWorkspaceV2Step({
        id: 'argument-writer',
        role: 'כותב טיעון',
        goal: 'לכתוב טקסט רציף, ברור ומשכנע.',
        instructions: ['שמור על סגנון אישי.', 'סיים במשפט שמחדד את העמדה.'],
        output: 'טקסט טיעון סופי',
      }),
    ],
  },
};

const cloneWorkspaceV2Template = (template = {}) => ({
  ...template,
  taskSignals: [...(template.taskSignals || [])],
  sourcePolicy: {
    ...(template.sourcePolicy || {}),
    requireSourcesWhen: [...(template.sourcePolicy?.requireSourcesWhen || [])],
  },
  stylePolicy: {
    ...(template.stylePolicy || {}),
    avoid: [...(template.stylePolicy?.avoid || [])],
  },
  pipeline: (template.pipeline || []).map((step) => ({ ...step, instructions: [...(step.instructions || [])] })),
});

export const getWorkspaceV2TemplatesMap = () => {
  const baseTemplates = Object.fromEntries(Object.entries(WORKSPACE_V2_TEMPLATES).map(([id, template]) => [
    id,
    normalizeWorkspaceV2TemplateRecord({ ...template, builtIn: true }, { ...template, builtIn: true }),
  ]));
  const overrides = readWorkspaceV2TemplateOverrides();
  Object.entries(overrides).forEach(([id, override]) => {
    const normalizedId = normalizeText(override?.id || id).toLowerCase();
    if (!normalizedId) return;
    baseTemplates[normalizedId] = normalizeWorkspaceV2TemplateRecord(
      { ...override, id: normalizedId },
      baseTemplates[normalizedId] || {},
    );
  });
  return baseTemplates;
};

export const normalizeWorkspaceV2TemplateId = (templateId = '') => {
  const normalizedId = normalizeText(templateId).toLowerCase();
  const templates = getWorkspaceV2TemplatesMap();
  return templates[normalizedId] ? normalizedId : WORKSPACE_V2_DEFAULT_TEMPLATE_ID;
};

export const getWorkspaceV2Templates = () => Object.values(getWorkspaceV2TemplatesMap()).map(cloneWorkspaceV2Template);

export const getWorkspaceV2Template = (templateId = '') => {
  const templates = getWorkspaceV2TemplatesMap();
  const resolvedId = normalizeWorkspaceV2TemplateId(templateId);
  const template = templates[resolvedId] || templates[WORKSPACE_V2_DEFAULT_TEMPLATE_ID];
  return cloneWorkspaceV2Template(template);
};

export const saveWorkspaceV2Template = (template = {}) => {
  const currentTemplates = getWorkspaceV2TemplatesMap();
  const normalized = normalizeWorkspaceV2TemplateRecord(template, currentTemplates[normalizeText(template?.id).toLowerCase()] || {});
  if (!normalized.id) throw new Error('Workspace v2 template id is required');
  if (!normalized.pipeline.length) throw new Error('Workspace v2 template must include at least one step');
  const overrides = readWorkspaceV2TemplateOverrides();
  overrides[normalized.id] = {
    ...normalized,
    builtIn: currentTemplates[normalized.id]?.builtIn === true,
    updatedAt: new Date().toISOString(),
  };
  writeWorkspaceV2TemplateOverrides(overrides);
  return getWorkspaceV2Template(normalized.id);
};

export const createWorkspaceV2Template = (template = {}) => {
  const templates = getWorkspaceV2TemplatesMap();
  const baseLabel = normalizeText(template.label) || 'סביבת עבודה חדשה';
  const baseId = normalizeText(template.id)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || `custom-${Date.now()}`;
  let id = baseId;
  let counter = 2;
  while (templates[id]) {
    id = `${baseId}-${counter}`;
    counter += 1;
  }
  return saveWorkspaceV2Template({
    ...template,
    id,
    label: baseLabel,
    builtIn: false,
  });
};

export const deleteWorkspaceV2Template = (templateId = '') => {
  const id = normalizeText(templateId).toLowerCase();
  if (!id) return getWorkspaceV2Templates();
  const overrides = readWorkspaceV2TemplateOverrides();
  delete overrides[id];
  writeWorkspaceV2TemplateOverrides(overrides);
  return getWorkspaceV2Templates();
};

export const resetWorkspaceV2Templates = () => {
  writeWorkspaceV2TemplateOverrides({});
  return getWorkspaceV2Templates();
};

export const classifyWorkspaceV2Template = ({
  prompt = '',
  instructions = '',
  templateId = '',
  selectedTemplateId = '',
} = {}) => {
  const templates = getWorkspaceV2TemplatesMap();
  const explicitId = normalizeText(selectedTemplateId).toLowerCase();
  if (explicitId && templates[explicitId]) {
    return { templateId: explicitId, confidence: 1, reason: 'explicit-template' };
  }

  const requestText = [prompt, instructions, templateId].map(normalizeText).filter(Boolean).join(' ');
  const scored = Object.values(templates).map((template) => {
    const matchedSignals = template.taskSignals.filter((signal) => containsAnySignal(requestText, [signal]));
    const templateBoost = templateId === 'academic' && template.id.startsWith('academic') ? 1 : 0;
    return {
      templateId: template.id,
      score: matchedSignals.length + templateBoost,
      matchedSignals,
    };
  }).sort((a, b) => b.score - a.score);

  const winner = scored[0];
  if (winner?.score > 0) {
    return {
      templateId: winner.templateId,
      confidence: Math.min(0.95, 0.45 + (winner.score * 0.15)),
      reason: 'signal-match',
      matchedSignals: winner.matchedSignals,
    };
  }

  return {
    templateId: WORKSPACE_V2_DEFAULT_TEMPLATE_ID,
    confidence: 0.35,
    reason: 'default',
    matchedSignals: [],
  };
};

export const buildWorkspaceV2RunContext = ({
  prompt = '',
  instructions = '',
  templateId = '',
  selectedTemplateId = '',
  selectedMaterials = [],
  personalStyleProfile = {},
  runId = '',
  workspaceId = '',
} = {}) => {
  const classification = classifyWorkspaceV2Template({ prompt, instructions, templateId, selectedTemplateId });
  const template = getWorkspaceV2Template(classification.templateId);
  const safeRunId = normalizeText(runId) || `workspace-v2-${Date.now()}`;
  const safeWorkspaceId = normalizeText(workspaceId) || template.id;
  const materialIds = (Array.isArray(selectedMaterials) ? selectedMaterials : [])
    .map((item) => typeof item === 'string' ? item : (item?.id || item?.fileName || item?.name || ''))
    .map(normalizeText)
    .filter(Boolean);

  return {
    version: WORKSPACE_V2_VERSION,
    runId: safeRunId,
    workspaceId: safeWorkspaceId,
    template,
    classification,
    request: {
      prompt: normalizeText(prompt),
      instructions: normalizeText(instructions),
      templateId: normalizeText(templateId),
      selectedMaterialIds: unique(materialIds),
    },
    memoryScopes: {
      global: 'personal-style-and-app-settings-only',
      workspace: `workspace-v2:${safeWorkspaceId}`,
      run: `workspace-v2:${safeWorkspaceId}:${safeRunId}`,
    },
    guardrails: WORKSPACE_V2_GLOBAL_GUARDRAILS,
    personalStyleSnapshot: {
      displayName: normalizeText(personalStyleProfile?.displayName),
      tonePreference: normalizeText(personalStyleProfile?.tonePreference),
      customStyleGuidance: normalizeText(personalStyleProfile?.customStyleGuidance),
      alwaysRules: normalizeText(personalStyleProfile?.alwaysRules),
      avoidRules: normalizeText(personalStyleProfile?.avoidRules),
      goldenExampleAvailable: Boolean(normalizeText(personalStyleProfile?.goldenExample)),
    },
  };
};

export const validateWorkspaceV2RunContext = (context = {}) => {
  const errors = [];
  if (context?.version !== WORKSPACE_V2_VERSION) errors.push('invalid-version');
  if (!normalizeText(context?.runId)) errors.push('missing-run-id');
  if (!normalizeText(context?.workspaceId)) errors.push('missing-workspace-id');
  if (!context?.template?.id || !getWorkspaceV2TemplatesMap()[context.template.id]) errors.push('invalid-template');
  if (!Array.isArray(context?.template?.pipeline) || !context.template.pipeline.length) errors.push('missing-pipeline');
  if (!context?.memoryScopes?.run || context.memoryScopes.run === context?.memoryScopes?.workspace) errors.push('invalid-memory-scope');

  return {
    ok: errors.length === 0,
    errors,
  };
};
