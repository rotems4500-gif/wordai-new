import Papa from 'papaparse';

const MAX_INFERENCE_ROWS = 5;
const MAX_DISTINCT_PREVIEW = 8;
const SAFE_SPSS_NAME_MAX_LENGTH = 64;
const DATE_INFERENCE_RATIO = 0.8;
const LOW_CARDINALITY_RATIO = 0.25;
const SMALL_SET_CATEGORICAL_RATIO = 0.75;
const MAX_SMALL_SET_DISTINCT = 12;
// Classic SPSS sentinel/user-missing codes. Used only to FLAG suspected undeclared
// missing (a sentinel sitting far outside the natural scale), never to drop data.
const SENTINEL_MISSING_CODES = new Set([-9, -99, -999, 97, 98, 99, 997, 998, 999, 9998, 9999]);
// Many survey exports never DECLARE user-missing — they bury the sentinel meaning in
// the VALUE-LABEL text instead ("888", "999", "Don't know", "Refuse to answer"), often
// on remapped codes (98/99/100/101) that the numeric heuristic can't see because other
// non-asked codes (94/96) inflate the scale max. So we read the dictionary text directly.
// Conservative on purpose: only universal "respondent gave no usable answer" markers —
// NOT analytic categories like "Didn't vote" / "Blank ballot" / "Undecided", which can be
// legitimate response options. EN + HE.
const MISSING_LABEL_PATTERNS = [
  /\b888\b/,
  /\b999\b/,
  /don'?t\s*know/i,
  /doesn'?t\s*know/i,
  /no\s*answer/i,
  /no\s*response/i,
  /refus/i,
  /(?:don'?t|not|doesn'?t)\s*remember/i,
  /declined\s*to\s*answer/i,
  /\bn\/?a\b/i,
  /לא\s*יוד[עע]/u,
  /לא\s*זוכר/u,
  /(?:מסרב|סירב|סירוב)/u,
  /אין\s*תשוב/u,
];
// Normalize curly/typographic apostrophes so the EN patterns above match real SAV labels.
const normalizeApostrophes = (text = '') => String(text).replace(/[‘’ʼ´`]/g, "'");
const labelMarksMissing = (label = '') => {
  const normalized = normalizeApostrophes(label);
  return MISSING_LABEL_PATTERNS.some((pattern) => pattern.test(normalized));
};
const REVERSE_SCALE_MAX_DISTINCT = 10;
const REVERSE_SCALE_MAX_RANGE = 10;
const REVERSE_SCALE_MIN_VALUE = -1;
const REVERSE_SCALE_MAX_VALUE = 11;
const REVERSE_SCALE_MAX_MISSING_CATEGORIES = 1;
const REVERSE_SCALE_CANONICAL_RANGES = Object.freeze([
  Object.freeze({ min: 1, max: 4 }),
  Object.freeze({ min: 1, max: 5 }),
  Object.freeze({ min: 1, max: 7 }),
  Object.freeze({ min: 0, max: 10 }),
]);
const REVERSE_SCALE_GENERIC_NAME_SIGNAL_PATTERNS = [
  /\bq(?:uestion)?[\s_-]*\d+\b/iu,
  /\bitem[\s_-]*\d+\b/iu,
  /(?:שאלה|פריט)[\s_-]*\d*\b/u,
];
const REVERSE_SCALE_STRONG_NAME_SIGNAL_PATTERNS = [
  /\b(?:likert|scale|rating|response|agreement|satisfaction|attitude|survey|score|index)\b/iu,
  /(?:סולם|ליקרט|דירוג|היגד|שביעות[\s_-]*רצון|ציון|מדד)/u,
];

const NUMERIC_PATTERN = /^[-+]?((\d+([.,]\d+)?)|([.,]\d+))$/;
const DATE_PATTERNS = [
  /^\d{4}-\d{1,2}-\d{1,2}$/,
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
  /^\d{1,2}-\d{1,2}-\d{2,4}$/,
];

const T_TEST_PATTERN = /(t[\s-]?test|מבחן\s*t|טי[\s-]?טסט)/i;
const CORRELATION_PATTERN = /(correlation|pearson|spearman|מתאם)/i;
const REGRESSION_PATTERN = /(regression|רגרסיה)/i;
const CHI_SQUARE_PATTERN = /(chi[\s-]?square|chi square|חי[\s-]?בריבוע|קי[\s-]?בריבוע)/i;
const ANOVA_PATTERN = /(anova|ניתוח\s+שונות)/i;
const OUTLIER_PATTERN = /(outlier|outliers|חריג(?:ים)?)/i;
const DESCRIPTIVE_PATTERN = /(descriptive|descriptives|סטטיסטיק(?:ה|ות)?\s+תיאורי(?:ת|ות)|תיאורי(?:ת|ות))/i;
const REVERSE_SCALE_PATTERN = /(reverse\s+scale|reverse\s+code|reverse\s+score|הפוך\s+סולם|היפוך\s+סולם|רברס)/i;
const FILTER_DISPLAY_PATTERN = /(show|list|display|filter|select\s+only|only\s+(?:show|list|display)|הצג|הציגו|הראה|הראו|סנן|סננו|בחר|בחרו|רק\s+(?:משיבים|נבדקים|מקרים|שורות)|משיבים\s+ש(?:הם|גילם|ענו|סומנו))/i;
// NOTE: \b is an ASCII-only word boundary, so `\bבין\b` never matched Hebrew. Use
// Unicode letter lookarounds for the Hebrew alternatives (so "בין" matches as a word
// but not inside "מבינים"), and keep \b for the Latin tokens.
const GROUP_COMPARISON_HINT_PATTERN = /(?:(?<![\p{L}])(?:בין|מול|לעומת)(?![\p{L}])|השוו?ה?\s+בין|compare\s+(?:between|across)|versus|\bvs\.?\b)/iu;
const GROUP_REFERENCE_PATTERNS = [
  /\bBY\s+(VAR_\d+)\b/gi,
  /לפי\s+(VAR_\d+)\b/g,
  /על\s+פי\s+(VAR_\d+)\b/g,
  /חלוקה\s+לפי\s+(VAR_\d+)\b/g,
  /בקבוצ(?:ה|ות)\s+של\s+(VAR_\d+)\b/g,
  /split\s+by\s+(VAR_\d+)\b/gi,
  /group(?:ed|ing)?\s+by\s+(VAR_\d+)\b/gi,
];

const SPSS_COMMAND_START_PATTERNS = [
  /^(?:T-?TEST|ONEWAY|ANOVA|UNIANOVA|GLM|MANOVA|DESCRIPTIVES|FREQUENCIES|EXAMINE|LIST|RECODE|COMPUTE|CORRELATIONS|PARTIAL\s+CORR|NONPAR\s+CORR|NPAR\s+TESTS|NPTESTS|REGRESSION|LOGISTIC\s+REGRESSION|NOMREG|PLUM|MIXED|GENLIN|GENLINMIXED|DISCRIMINANT|COXREG|CURVEFIT|WLS|2SLS|NLR|CNLR|RELIABILITY|FACTOR|PROXIMITIES|CLUSTER|QUICK\s+CLUSTER|TWOSTEP\s+CLUSTER|HILOGLINEAR|LOGLINEAR|GENLOG|SURVIVAL|KM|ROC|CROSSTABS|MEANS|SUMMARIZE|OLAP\s+CUBES|REPORT|MULT\s+RESPONSE|RATIO\s+STATISTICS|MVA|GRAPH|XGRAPH|GGRAPH|PPLOT|SORT\s+CASES|SPLIT\s+FILE|TEMPORARY|SELECT\s+IF|FILTER\s+(?:BY|OFF)|USE\s+ALL|WEIGHT|N\s+OF\s+CASES|SAMPLE|IF|DO\s+IF|ELSE\s+IF|ELSE|END\s+IF|DO\s+REPEAT|END\s+REPEAT|LOOP|END\s+LOOP|BREAK|COUNT|AUTORECODE|NUMERIC|STRING|VECTOR|VALUE\s+LABELS|ADD\s+VALUE\s+LABELS|VARIABLE\s+LABELS|VARIABLE\s+LEVEL|VARIABLE\s+WIDTH|VARIABLE\s+ALIGNMENT|FORMATS|MISSING\s+VALUES|RENAME\s+VARIABLES|DELETE\s+VARIABLES|ALTER\s+TYPE|AGGREGATE|RANK|CTABLES|OMS|DATASET|TITLE|SUBTITLE|EXECUTE|COMMENT|SET|SHOW|DISPLAY|CODEBOOK|ECHO|PRESERVE|RESTORE|MRSETS|CATREG|CATPCA|CORRESPONDENCE|OVERALS|PREFSCAL|ALSCAL|MULTIDIMENSIONAL|GENLOG|MODEL\s+CLOSE|MODEL\s+HANDLE|BEGIN\s+PROGRAM|END\s+PROGRAM|BEGIN\s+DATA|END\s+DATA|BEGIN\s+GPL|END\s+GPL|MATRIX|END\s+MATRIX|DEFINE|!ENDDEFINE|CSPLAN|CSSELECT|CSDESCRIPTIVES|CSTABULATE|CSGLM|CSLOGISTIC|CSCOXREG|CSORDINAL|TSMODEL|TSAPPLY|SPECTRA|ACF|PACF|CCF|TSPLOT|PREDICT|BOOTSTRAP|KNN|NAIVEBAYES|OPTIMAL\s+BINNING|DETECTANOMALY|VALIDATEDATA|GET|GET\s+DATA|GET\s+FILE|SAVE|SAVE\s+TRANSLATE|XSAVE|EXPORT|IMPORT|ADD\s+FILES|MATCH\s+FILES|UPDATE|NEW\s+FILE|DATA\s+LIST|APPLY\s+DICTIONARY|CACHE|COMPRESS|INCLUDE|INSERT|WRITE|PRINT|REREAD|OUTPUT|FLIP|RESTRUCTURE|VARSTOCASES|CASESTOVARS|SPSSINC|STATS)\b/i,
];

const RECODE_RANGE_KEYWORD_PATTERN = /\b(?:THRU|THROUGH|TO|LO|LOWEST|HI|HIGHEST|MISSING|SYSMIS|ELSE|COPY)\b/i;

const RESERVED_SLOT_TOKENS = new Set([
  'TO',
  'WITH',
  'BY',
  'AND',
  'OR',
  'NOT',
  'EQ',
  'NE',
  'GT',
  'GE',
  'LT',
  'LE',
  'THRU',
  'THROUGH',
  'LO',
  'LOWEST',
  'HI',
  'HIGHEST',
  'ALL',
  'COPY',
  'ELSE',
  'SYSMIS',
  'MISSING',
  'FIRST',
  'LAST',
  'PAIRED',
  'INTO',
  'CONVERT',
  'ENTER',
  'STEPWISE',
  'REMOVE',
  'FORWARD',
  'BACKWARD',
  'POOLED',
  'SEPARATE',
  'TEST',
  'KEY',
  'USING',
  'IN',
  'OUT',
]);

const IDENTIFIER_PATTERN = /[\p{L}_][\p{L}\p{N}_]*/gu;
const FUNCTION_NAME_PATTERN = /\b[\p{L}_][\p{L}\p{N}_]*(?=\s*\()/gu;

const GRAPH_VARIABLE_COMMAND_PATTERN = /\bGRAPH\b[\s\S]*?\./gi;
const GRAPH_VARIABLE_SUBCOMMAND_PATTERN = /\/(?:SCATTERPLOT|LINE|BAR|PIE|HISTOGRAM|BOXPLOT|ERRORBAR)\b(?:\([^)]*\))?\s*=\s*([\s\S]*?)(?=\s*(?:\/|\.|$))/gi;
const GRAPH_ARGUMENT_KEYWORDS = new Set([
  'COUNT',
  'PCT',
  'PERCENT',
  'N',
  'MEAN',
  'SUM',
  'MIN',
  'MAX',
  'MEDIAN',
  'MODE',
  'SD',
  'STDDEV',
  'SE',
  'SEMEAN',
  'VARIANCE',
  'RANGE',
  'KURTOSIS',
  'SKEWNESS',
  'CUMULATIVE',
  'CUPCT',
  'CUFREQ',
  'GMEDIAN',
  'VALID',
  'MISSING',
  'FIRST',
  'LAST',
  'PAIRS',
  'TOTAL',
]);

const POSITIONAL_VARIABLE_COMMAND_SPECS = [
  { pattern: /^DESCRIPTIVES\b/i, extraAllowedIdentifiers: new Set(['VARIABLES']) },
  { pattern: /^FREQUENCIES\b/i, extraAllowedIdentifiers: new Set(['VARIABLES']) },
  { pattern: /^LIST\b/i, extraAllowedIdentifiers: new Set(['VARIABLES', 'CASES', 'FROM']) },
  { pattern: /^MEANS\b/i, extraAllowedIdentifiers: new Set(['TABLES']) },
  { pattern: /^CORRELATIONS\b/i, extraAllowedIdentifiers: new Set(['VARIABLES']) },
  { pattern: /^EXAMINE\b/i, extraAllowedIdentifiers: new Set(['VARIABLES']) },
  { pattern: /^CROSSTABS\b/i, extraAllowedIdentifiers: new Set(['TABLES']) },
  { pattern: /^ONEWAY\b/i, extraAllowedIdentifiers: new Set() },
  { pattern: /^NONPAR\s+CORR\b/i, extraAllowedIdentifiers: new Set(['VARIABLES']) },
  // GLM / mixed-model family: "dv BY factors WITH covariates" — no '=', so NONE of the
  // VARIABLE_SLOT_PATTERNS (which all require BY=/WITH=) match them, and their operands
  // were never validated. A derived dv whose creating block was blocked (or any phantom)
  // slipped straight through to SPSS as "undefined variable name". BY/WITH/TO are already
  // RESERVED_SLOT_TOKENS, and the positional operand section stops at the first '/', so
  // only the real dv/factor/covariate identifiers are checked against the allow-list.
  { pattern: /^UNIANOVA\b/i, extraAllowedIdentifiers: new Set() },
  { pattern: /^GLM\b/i, extraAllowedIdentifiers: new Set() },
  { pattern: /^MANOVA\b/i, extraAllowedIdentifiers: new Set() },
  { pattern: /^VARCOMP\b/i, extraAllowedIdentifiers: new Set() },
  { pattern: /^MIXED\b/i, extraAllowedIdentifiers: new Set() },
  { pattern: /^LOGISTIC\s+REGRESSION\b/i, extraAllowedIdentifiers: new Set() },
];

const VARIABLE_SLOT_PATTERNS = [
  /\b(?:VARIABLES|GROUPS|WITH|BY|DEPENDENT|INDEPENDENT|COLUMNS|ROWS|BREAK|TABLES|PAIRS)\s*=\s*([^\n/]+)/gi,
  /\/DEPENDENT\b\s*=?\s*([^\n/]+)/gi,
  /\/METHOD\s*=\s*(?:ENTER|STEPWISE|REMOVE|BACKWARD(?:\([^)]*\)|\s+\w+)?|FORWARD(?:\([^)]*\)|\s+\w+)?)\s+([^\n/]+)/gi,
  /\bONEWAY\s+([^\n/.]+?)\s+BY\s+([^\n/.]+)/gi,
  /\bRECODE\s+([^\n/]+)/gi,
  /\bINTO\s+([^\n/]+)/gi,
  /\bCOMPUTE\s+([\p{L}_][\p{L}\p{N}_]*)\s*=/giu,
  /\bIF\s*\([\s\S]*?\)\s*([\p{L}_][\p{L}\p{N}_]*)\s*=/giu,
  /(?:^|[\r\n])\s*IF\s+(?!\()(?:[\s\S]*?)\s+([\p{L}_][\p{L}\p{N}_]*)\s*=\s*[\s\S]*?\.(?=\s*(?:$|\r?\n))/giu,
  /\bSORT\s+CASES\s+BY\s+([^\n/]+)/gi,
  /\bSPLIT\s+FILE(?:\s+LAYERED)?\s+BY\s+([^\n/]+)/gi,
];

const EXPRESSION_CONTEXT_PATTERNS = [
  { pattern: /\bCOMPUTE\s+[\p{L}_][\p{L}\p{N}_]*\s*=\s*([\s\S]*?)\.(?=\s*(?:$|\r?\n))/giu, captureGroups: [1] },
  { pattern: /\bIF\s*\(([\s\S]*?)\)\s*[\p{L}_][\p{L}\p{N}_]*\s*=\s*([\s\S]*?)\.(?=\s*(?:$|\r?\n))/giu, captureGroups: [1, 2] },
  { pattern: /(?:^|[\r\n])\s*IF\s+(?!\()([\s\S]*?)\s+[\p{L}_][\p{L}\p{N}_]*\s*=\s*([\s\S]*?)\.(?=\s*(?:$|\r?\n))/giu, captureGroups: [1, 2] },
  { pattern: /\bDO\s+IF\s*\(([\s\S]*?)\)\s*\.(?=\s*(?:$|\r?\n))/giu, captureGroups: [1] },
  { pattern: /\bDO\s+IF\s+([\s\S]*?)\.(?=\s*(?:$|\r?\n))/giu, captureGroups: [1] },
  { pattern: /\bELSE\s+IF\s*\(([\s\S]*?)\)\s*\.(?=\s*(?:$|\r?\n))/giu, captureGroups: [1] },
  { pattern: /\bELSE\s+IF\s+([\s\S]*?)\.(?=\s*(?:$|\r?\n))/giu, captureGroups: [1] },
  { pattern: /\bSELECT\s+IF\s*\(([\s\S]*?)\)\s*\.(?=\s*(?:$|\r?\n))/giu, captureGroups: [1] },
  { pattern: /\bSELECT\s+IF\s+([\s\S]*?)\.(?=\s*(?:$|\r?\n))/giu, captureGroups: [1] },
];

const EXPRESSION_LITERAL_COMPARISON_PATTERNS = [
  { pattern: /\b(VAR_\d+)\b\s*(?:(?:=|<>|~=|<=|>=|<|>)|\b(?:EQ|NE|LT|LE|GT|GE)\b)\s*('(?:[^']*)'|"(?:[^"]*)"|[-+]?(?:(?:\d+(?:[.,]\d+)?)|(?:[.,]\d+)))/gi, tokenIndex: 1, literalIndex: 2 },
  { pattern: /('(?:[^']*)'|"(?:[^"]*)"|[-+]?(?:(?:\d+(?:[.,]\d+)?)|(?:[.,]\d+)))\s*(?:(?:=|<>|~=|<=|>=|<|>)|\b(?:EQ|NE|LT|LE|GT|GE)\b)\s*\b(VAR_\d+)\b/gi, tokenIndex: 2, literalIndex: 1 },
];

const EXPRESSION_LITERAL_SET_PATTERNS = [
  { pattern: /\bANY\s*\(\s*(VAR_\d+)\s*,([^)]*)\)/gi, tokenIndex: 1, literalsIndex: 2, label: 'ANY' },
];

// blockInPrep=true => blocked even in data-prep mode (file/session/output management, or
// commands whose state leaks across the accumulated master-syntax blocks).
// blockInPrep=false => transformation/metadata commands allowed once data-prep mode is on.
const ANALYSIS_ONLY_BLOCKED_COMMANDS = [
  { pattern: /^\s*DATASET\b/im, label: 'DATASET', reason: 'they manage dataset and session state', blockInPrep: true },
  { pattern: /^\s*OMS\b/im, label: 'OMS', reason: 'they reroute output outside the sandbox', blockInPrep: true },
  { pattern: /^\s*COMPUTE\b/im, label: 'COMPUTE', reason: 'it writes transformed values back into the dataset', blockInPrep: false },
  { pattern: /^\s*RECODE\b/im, label: 'RECODE', reason: 'it rewrites data values instead of running a read-only analysis', blockInPrep: false },
  { pattern: /^\s*IF\b/im, label: 'IF', reason: 'it conditionally rewrites data values instead of running a read-only analysis', blockInPrep: false },
  { pattern: /^\s*DO\s+IF\b/im, label: 'DO IF', reason: 'it opens a transformation block that rewrites data values', blockInPrep: false },
  { pattern: /^\s*ELSE\s+IF\b/im, label: 'ELSE IF', reason: 'it continues a transformation block that rewrites data values', blockInPrep: false },
  { pattern: /^\s*DO\s+REPEAT\b/im, label: 'DO REPEAT', reason: 'it expands repeated transformations that rewrite data values', blockInPrep: false },
  { pattern: /^\s*COUNT\b/im, label: 'COUNT', reason: 'it writes derived values back into the dataset', blockInPrep: false },
  { pattern: /^\s*AUTORECODE\b/im, label: 'AUTORECODE', reason: 'it writes recoded values back into the dataset', blockInPrep: false },
  { pattern: /^\s*(?:NUMERIC|STRING|VECTOR)\b/im, label: 'NUMERIC/STRING/VECTOR', reason: 'they create writable variables instead of running a read-only analysis', blockInPrep: false },
  { pattern: /^\s*AGGREGATE\b/im, label: 'AGGREGATE', reason: 'it can create target variables that are not allowed in analysis-only mode', blockInPrep: false },
  { pattern: /^\s*VALUE\s+LABELS\b/im, label: 'VALUE LABELS', reason: 'it mutates metadata instead of running an analysis', blockInPrep: false },
  { pattern: /^\s*VARIABLE\s+LABELS\b/im, label: 'VARIABLE LABELS', reason: 'it mutates metadata instead of running an analysis', blockInPrep: false },
  { pattern: /^\s*FORMATS\b/im, label: 'FORMATS', reason: 'it mutates metadata instead of running an analysis', blockInPrep: false },
  { pattern: /^\s*MISSING\s+VALUES\b/im, label: 'MISSING VALUES', reason: 'it mutates metadata instead of running an analysis', blockInPrep: false },
  { pattern: /^\s*RENAME\s+VARIABLES\b/im, label: 'RENAME VARIABLES', reason: 'it mutates variable schema instead of running an analysis', blockInPrep: false },
  { pattern: /^\s*RANK\b/im, label: 'RANK', reason: 'it writes ranked values back into the dataset', blockInPrep: false },
  { pattern: /^\s*NEW\s+FILE\b/im, label: 'NEW FILE', reason: 'it opens or resets session state', blockInPrep: true },
  { pattern: /^\s*(?:GET\s+(?:FILE|DATA)|IMPORT)\b/im, label: 'GET FILE/GET DATA/IMPORT', reason: 'they import external data into the session', blockInPrep: true },
  { pattern: /^\s*(?:SAVE|XSAVE|EXPORT)\b/im, label: 'SAVE/XSAVE/EXPORT', reason: 'they write data outside the sandbox', blockInPrep: true },
  { pattern: /^\s*OUTPUT\s+(?:NEW|OPEN|CLOSE|SAVE|EXPORT|MODIFY)\b/im, label: 'OUTPUT', reason: 'it changes output routing or writes external output', blockInPrep: true },
  { pattern: /^\s*SPLIT\s+FILE\b/im, label: 'SPLIT FILE', reason: 'it changes split-processing state between blocks', blockInPrep: true },
  { pattern: /^\s*FILTER(?:\s+(?:BY|OFF))?\b/im, label: 'FILTER/FILTER BY/FILTER OFF', reason: 'it changes row-filter state between blocks', blockInPrep: true },
  { pattern: /^\s*SELECT\s+IF\b/im, label: 'SELECT IF', reason: 'it permanently changes the active case set between blocks', blockInPrep: true },
  { pattern: /^\s*USE\s+ALL\b/im, label: 'USE ALL', reason: 'it resets row-filter state between blocks', blockInPrep: true },
  { pattern: /^\s*TEMPORARY\b/im, label: 'TEMPORARY', reason: 'it changes case-selection state between blocks', blockInPrep: true },
  { pattern: /^\s*SORT\s+CASES\b/im, label: 'SORT CASES', reason: 'it changes case order between blocks', blockInPrep: true },
  { pattern: /^\s*(?:FILE\s+HANDLE|ADD\s+FILES|MATCH\s+FILES|UPDATE|INSERT|INCLUDE|WRITE|PRINT)\b/im, label: 'file/session management commands', reason: 'they open, merge, or write external resources', blockInPrep: true },
];

const TEMPORARY_FILTER_COMMAND_HEADS = [
  /^T-?TEST\b/i,
  /^ONEWAY\b/i,
  /^ANOVA\b/i,
  /^UNIANOVA\b/i,
  /^GLM\b/i,
  /^DESCRIPTIVES\b/i,
  /^FREQUENCIES\b/i,
  /^EXAMINE\b/i,
  /^LIST\b/i,
  /^CORRELATIONS\b/i,
  /^NONPAR\s+CORR\b/i,
  /^NPAR\s+TESTS\b/i,
  /^REGRESSION\b/i,
  /^CROSSTABS\b/i,
  /^MEANS\b/i,
  /^GRAPH\b/i,
  /^CTABLES\b/i,
];

export const SPSS_QUICK_ACTIONS = [
  { id: 'outliers', label: 'מצא חריגים', command: 'EXAMINE', requiresNumeric: true },
  { id: 'reverse-scale', label: 'היפוך סולם', command: 'RECODE', requiresNumeric: true, destructive: true, warningLabel: 'מחליף ערכים קיימים' },
  { id: 'descriptives', label: 'סטטיסטיקה תיאורית', command: 'DESCRIPTIVES', requiresNumeric: true },
];

const getQuickActionById = (actionId = '') => SPSS_QUICK_ACTIONS.find((action) => action.id === actionId) || null;

const normalizeCell = (value = '') => String(value ?? '').replace(/^\uFEFF/, '').trim();

const escapeRegExp = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeHeaderLabel = (value = '', index = 0) => {
  const normalized = normalizeCell(value).replace(/\s+/g, ' ');
  return normalized || `עמודה ${index + 1}`;
};

const ensureUniqueLabels = (labels = []) => {
  const used = new Set();
  return labels.map((label) => {
    const base = String(label || '').trim() || 'עמודה';
    let next = base;
    let counter = 2;
    while (used.has(next)) {
      next = `${base} ${counter}`;
      counter += 1;
    }
    used.add(next);
    return next;
  });
};

const sanitizeSpssVariableName = (value = '', index = 0) => {
  const normalized = String(value || '')
    .trim()
    // Strip C1 controls + Latin-1 supplement (U+0080–U+00FF). This is where UTF-8↔Latin-1
    // mis-decode artifacts land (e.g. a SAV name byte read as 'â'/'Ã'/'Â'), and they are
    // Unicode letters so the \p{L} pass below would otherwise KEEP them, producing broken
    // names like "Versionâ" that SPSS rejects. ASCII and Hebrew (U+05xx) names are untouched.
    .replace(/[\u0080-\u00FF]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_@#$]/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  let safeName = normalized || `VAR${index + 1}`;
  if (!/^[\p{L}@#$]/u.test(safeName)) {
    safeName = `V_${safeName}`;
  }
  return safeName.slice(0, SAFE_SPSS_NAME_MAX_LENGTH);
};

const ensureUniqueSpssNames = (names = []) => {
  const used = new Set();
  return names.map((name, index) => {
    const base = sanitizeSpssVariableName(name, index);
    let next = base;
    let counter = 2;
    while (used.has(next)) {
      const suffix = `_${counter}`;
      next = `${base.slice(0, Math.max(1, SAFE_SPSS_NAME_MAX_LENGTH - suffix.length))}${suffix}`;
      counter += 1;
    }
    used.add(next);
    return next;
  });
};

const parseNumericValue = (value = '') => {
  const normalized = normalizeCell(value);
  if (!normalized) return null;
  if (!NUMERIC_PATTERN.test(normalized)) return null;
  if (normalized.includes(',') && normalized.includes('.')) return null;
  const decimalNormalized = normalized.includes(',') && !normalized.includes('.')
    ? normalized.replace(',', '.')
    : normalized;
  const parsed = Number(decimalNormalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const unwrapQuotedLiteral = (value = '') => {
  const normalized = normalizeCell(value);
  if (
    (normalized.startsWith("'") && normalized.endsWith("'"))
    || (normalized.startsWith('"') && normalized.endsWith('"'))
  ) {
    return normalized.slice(1, -1);
  }
  return normalized;
};

const buildComparableLiteralKeys = (value = '') => {
  const normalized = unwrapQuotedLiteral(value);
  if (!normalized) return [];

  const keys = new Set([`str:${normalized}`]);
  const numericValue = parseNumericValue(normalized);
  if (numericValue !== null) {
    const canonical = formatNumericLiteral(numericValue);
    keys.add(`num:${canonical}`);
  }
  return Array.from(keys);
};

const isObservedLiteralColumn = (column = null) => Boolean(
  column
  && column.distinctCount > 0
  && column.distinctCount <= MAX_SMALL_SET_DISTINCT
  && (column.isCategorical || column.measurementLevel === 'ordinal')
);

const getObservedLiteralValues = (column = null) => {
  if (!isObservedLiteralColumn(column)) return [];

  const values = Array.isArray(column.observedValues) && column.observedValues.length
    ? column.observedValues
    : Array.isArray(column.distinctPreview)
      ? column.distinctPreview
      : [];

  return values.map(normalizeCell).filter(Boolean);
};

const buildObservedLiteralLookup = (column = null) => {
  const lookup = new Set();
  getObservedLiteralValues(column).forEach((value) => {
    buildComparableLiteralKeys(value).forEach((key) => lookup.add(key));
  });
  return lookup;
};

const formatObservedLiteralMetadata = (column = null) => {
  const values = getObservedLiteralValues(column);
  if (!values.length) return '';
  return `; observedValues=[${values.map((value) => JSON.stringify(value)).join(', ')}]`;
};

const isDateLikeValue = (value = '') => {
  const normalized = normalizeCell(value);
  if (!normalized) return false;
  if (!DATE_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed);
};

const inferColumnType = ({ nonEmptyValues = [], numericValues = [], distinctValues = [] } = {}) => {
  if (!nonEmptyValues.length) return 'text';

  if (numericValues.length === nonEmptyValues.length) return 'numeric';

  const dateMatches = nonEmptyValues.filter((value) => isDateLikeValue(value)).length;
  if (dateMatches >= Math.max(2, Math.ceil(nonEmptyValues.length * DATE_INFERENCE_RATIO))) return 'date';

  const distinctCount = distinctValues.length;
  const distinctRatio = distinctCount / nonEmptyValues.length;
  if (distinctRatio <= LOW_CARDINALITY_RATIO) return 'categorical';
  if (distinctCount <= MAX_SMALL_SET_DISTINCT && distinctRatio <= SMALL_SET_CATEGORICAL_RATIO) return 'categorical';
  return 'text';
};

const inferMeasurementLevel = ({ inferredType = 'text', numericValues = [], distinctCount = 0, min = null, max = null } = {}) => {
  if (inferredType === 'date') return 'date';
  if (inferredType === 'text') return 'text';
  if (inferredType === 'categorical') return 'nominal';
  const integerLike = numericValues.length > 0 && numericValues.every((value) => Number.isInteger(value));
  const numericRange = min !== null && max !== null ? max - min : null;
  if (
    integerLike
    && distinctCount >= 2
    && distinctCount <= REVERSE_SCALE_MAX_DISTINCT
    && Number.isFinite(numericRange)
    && numericRange <= REVERSE_SCALE_MAX_RANGE
    && min >= REVERSE_SCALE_MIN_VALUE
    && max <= REVERSE_SCALE_MAX_VALUE
  ) {
    return 'ordinal';
  }
  return 'scale';
};

// Names that strongly signal a bookkeeping identifier (respondent id / serial),
// not a measure. Used only to demote a high-cardinality integer to role=identifier.
const IDENTIFIER_NAME_PATTERN = /(\bid\b|\bids\b|\bcode\b|\bserial\b|\buuid\b|\brow\b|\bindex\b|מזהה|מספר\s*(?:נבדק|מזהה|סידורי|שורה)|ת\.?\s*ז|תעודת\s*זהות|מס['׳]\s*נבדק)/i;

// Likert item signal = the variable NAME reads like a rated survey item/scale, OR
// a generic item name (q1, item3, שאלה_2). Reuses the reverse-scale name patterns.
const LIKERT_NAME_SIGNAL_PATTERNS = [
  ...REVERSE_SCALE_STRONG_NAME_SIGNAL_PATTERNS,
  ...REVERSE_SCALE_GENERIC_NAME_SIGNAL_PATTERNS,
];
const hasLikertNameSignal = (nameText = '') => LIKERT_NAME_SIGNAL_PATTERNS.some((pattern) => pattern.test(nameText));
// A Likert response sits inside a canonical rating span (1..4 / 1..5 / 1..7 / 0..10).
// "within" (not exact) tolerates an unused endpoint, e.g. observed 2..5 on a 1..5 scale.
const isLikertCanonicalRange = (min = null, max = null) => min !== null && max !== null
  && REVERSE_SCALE_CANONICAL_RANGES.some((range) => min >= range.min && max <= range.max);

// Analysis role = how a variable should be USED in a statistical procedure, which
// is NOT the same as its storage type. A category coded as a number (1=male,
// 2=female; region 1..5) is type=numeric but must be treated as categorical.
// The role is a precomputed hint so the model does not have to re-derive it:
//   continuous       — a real measured quantity (regression/correlation/t-test test var, ANOVA DV)
//   categorical      — a clear group/factor (text categories, or nominal level)
//   categorical-code — a number that stands for a NOMINAL category (gender/region/education);
//                      must be dummy-coded for regression, used as a factor in ANOVA/chi-square
//   likert           — a rated item on a canonical 1..5/1..7-style span whose NAME reads like a
//                      survey item/scale; may be treated as ~continuous (mean/correlation/regression)
//                      or pooled into an index. Single item → Spearman is also defensible.
//   identifier       — a bookkeeping id/serial; not a measure, do not analyze
//   date / text      — non-analytic as-is
const deriveAnalysisRole = ({
  inferredType = 'text',
  measurementLevel = 'text',
  distinctCount = 0,
  nonEmptyCount = 0,
  numericStats = null,
  aliases = [],
  hasValueLabels = false,
  valueLabelCoverage = 0,
} = {}) => {
  if (inferredType === 'date') return 'date';
  if (inferredType === 'text') return 'text';
  if (inferredType === 'categorical') return 'categorical';
  // numeric storage from here:
  const integerLike = Boolean(numericStats?.integerLike);
  const distinctRatio = nonEmptyCount > 0 ? distinctCount / nonEmptyCount : 0;
  const nameText = (Array.isArray(aliases) ? aliases : []).filter(Boolean).join(' ');
  if (
    integerLike
    && distinctCount > MAX_SMALL_SET_DISTINCT
    && distinctRatio >= 0.9
    && IDENTIFIER_NAME_PATTERN.test(nameText)
  ) {
    return 'identifier';
  }
  if (integerLike && distinctCount >= 2 && distinctCount <= MAX_SMALL_SET_DISTINCT) {
    // A coded number with a Likert name AND a canonical rating span (≥3 points) is a
    // rated item, not a nominal code — split it out so the model can treat it as ~continuous.
    if (
      distinctCount >= 3
      && hasLikertNameSignal(nameText)
      && isLikertCanonicalRange(numericStats?.min ?? null, numericStats?.max ?? null)
    ) {
      return 'likert';
    }
    return 'categorical-code';
  }
  // SAV dictionary truth beats the distinct-count heuristic: a numeric variable whose
  // observed values are (almost) all value-labeled is categorical by definition —
  // even past the small-set threshold (e.g. a 15-category country/region code). The
  // likert branch above already claimed labeled rating items, so this stays nominal.
  if (hasValueLabels && valueLabelCoverage >= 0.8 && distinctCount >= 2) {
    return 'categorical-code';
  }
  if (measurementLevel === 'nominal') return 'categorical';
  return 'continuous';
};

const getTypeLabel = (value = '') => {
  switch (value) {
    case 'numeric':
      return 'מספרי';
    case 'categorical':
      return 'קטגוריאלי';
    case 'date':
      return 'תאריך';
    default:
      return 'טקסט';
  }
};

const getLevelLabel = (value = '') => {
  switch (value) {
    case 'scale':
      return 'Scale';
    case 'ordinal':
      return 'Ordinal';
    case 'nominal':
      return 'Nominal';
    case 'date':
      return 'Date';
    default:
      return 'Text';
  }
};

const getReverseScaleNameAliases = (column = null) => {
  const aliases = Array.isArray(column?.aliases)
    ? column.aliases
    : [column?.originalName, column?.outputName];

  return aliases
    .map(normalizeCell)
    .filter(Boolean);
};

const hasReverseScaleGenericNameSignal = (column = null) => getReverseScaleNameAliases(column)
  .some((alias) => REVERSE_SCALE_GENERIC_NAME_SIGNAL_PATTERNS.some((pattern) => pattern.test(alias)));

const hasReverseScaleStrongNameSignal = (column = null) => getReverseScaleNameAliases(column)
  .some((alias) => REVERSE_SCALE_STRONG_NAME_SIGNAL_PATTERNS.some((pattern) => pattern.test(alias)));

const isReverseScaleCanonicalRange = (min = null, max = null) => REVERSE_SCALE_CANONICAL_RANGES
  .some((range) => range.min === min && range.max === max);

const getReverseScalePlan = (column = null) => {
  const emptyPlan = {
    allowed: false,
    scaleValues: [],
    min: null,
    max: null,
  };

  if (!column?.isNumeric) return emptyPlan;

  const numericStats = column.numericStats || null;
  if (!numericStats || numericStats.min === null || numericStats.max === null || !numericStats.integerLike) {
    return emptyPlan;
  }

  const uniqueValues = Array.isArray(numericStats.uniqueValues) ? numericStats.uniqueValues : [];
  if (uniqueValues.length < 2 || uniqueValues.length > REVERSE_SCALE_MAX_DISTINCT) {
    return emptyPlan;
  }

  const numericRange = numericStats.max - numericStats.min;
  if (
    !Number.isFinite(numericRange)
    || numericRange > REVERSE_SCALE_MAX_RANGE
    || numericStats.min < REVERSE_SCALE_MIN_VALUE
    || numericStats.max > REVERSE_SCALE_MAX_VALUE
  ) {
    return emptyPlan;
  }

  const scaleLength = numericRange + 1;
  if (scaleLength < 2 || scaleLength > REVERSE_SCALE_MAX_DISTINCT) {
    return emptyPlan;
  }

  const hasLargeGap = uniqueValues.slice(1).some((value, index) => Math.abs(value - uniqueValues[index]) > 2);
  if (hasLargeGap) return emptyPlan;

  if (column.nonEmptyCount >= 12) {
    const distinctRatio = column.distinctCount / column.nonEmptyCount;
    if (distinctRatio > 0.6) return emptyPlan;
  }

  const hasGenericNameSignal = hasReverseScaleGenericNameSignal(column);
  const hasStrongNameSignal = hasReverseScaleStrongNameSignal(column);
  if (!hasGenericNameSignal && !hasStrongNameSignal) return emptyPlan;

  const missingCategoryCount = Math.max(0, scaleLength - uniqueValues.length);
  const hasDenseObservedCoverage = missingCategoryCount <= REVERSE_SCALE_MAX_MISSING_CATEGORIES;
  const hasCanonicalAnchor = hasDenseObservedCoverage && isReverseScaleCanonicalRange(numericStats.min, numericStats.max);
  const hasStrongNameAnchor = hasStrongNameSignal && hasDenseObservedCoverage;

  if (hasGenericNameSignal && !hasCanonicalAnchor) return emptyPlan;
  if (!hasCanonicalAnchor && !hasStrongNameAnchor) return emptyPlan;

  return {
    allowed: true,
    scaleValues: Array.from({ length: scaleLength }, (_, index) => numericStats.min + index),
    min: numericStats.min,
    max: numericStats.max,
  };
};

const isReverseScaleCandidate = (column = null) => getReverseScalePlan(column).allowed;

// Does a numeric value fall inside a SAV-declared user-missing spec?
const isDeclaredMissingNumeric = (num, declared) => {
  if (num === null || !declared) return false;
  if (Array.isArray(declared.discrete) && declared.discrete.some((value) => value === num)) return true;
  if (declared.range && num >= declared.range.min && num <= declared.range.max) return true;
  return false;
};

// Map raw SAV value-label entries to a clean { value, label } list keyed by the
// normalized cell string, so we can both report them and measure how many of the
// observed distinct values are labeled (a categorical fingerprint).
const buildValueLabelMap = (valueLabels = []) => {
  const map = new Map();
  (Array.isArray(valueLabels) ? valueLabels : []).forEach((entry) => {
    const value = normalizeCell(entry?.value);
    const label = String(entry?.label || '').trim();
    if (value && label && !map.has(value)) map.set(value, label);
  });
  return map;
};

const buildColumnProfile = ({ originalName = '', outputName = '', token = '', allValues = [], sampleValues = [], aliases = [], valueLabels = [], declaredMissing = null } = {}) => {
  const declared = declaredMissing && (declaredMissing.discrete?.length || declaredMissing.range) ? declaredMissing : null;
  const normalizedValues = allValues.map(normalizeCell);
  // Treat SAV-declared user-missing codes as missing — exactly what SPSS does. This
  // keeps min/max/distinct/observedValues clean (the 98/99 codes no longer inflate
  // the range) while missingCount rises to reflect the real picture.
  const nonEmptyValues = normalizedValues.filter((value) => {
    if (!value) return false;
    return !isDeclaredMissingNumeric(parseNumericValue(value), declared);
  });
  const numericValues = nonEmptyValues.map(parseNumericValue).filter((value) => value !== null);
  const distinctValues = Array.from(new Set(nonEmptyValues));
  const min = numericValues.length ? Math.min(...numericValues) : null;
  const max = numericValues.length ? Math.max(...numericValues) : null;
  const inferredType = inferColumnType({
    nonEmptyValues,
    numericValues,
    distinctValues,
  });
  const measurementLevel = inferMeasurementLevel({
    inferredType,
    numericValues,
    distinctCount: distinctValues.length,
    min,
    max,
  });
  const uniqueNumericValues = Array.from(new Set(numericValues)).sort((left, right) => left - right);
  const observedValues = distinctValues.length > 0
    && distinctValues.length <= MAX_SMALL_SET_DISTINCT
    && (inferredType === 'categorical' || measurementLevel === 'nominal' || measurementLevel === 'ordinal')
    ? distinctValues.slice(0, MAX_SMALL_SET_DISTINCT)
    : [];

  const integerLike = numericValues.length > 0 && numericValues.every((value) => Number.isInteger(value));
  const aliasList = Array.from(new Set([originalName, outputName, ...aliases].map(normalizeCell).filter(Boolean)));

  // Value labels (1="זכר", 2="נקבה") are the SAV dictionary's categorical fingerprint
  // and the human-readable key for naming groups in code + interpretation.
  const valueLabelMap = buildValueLabelMap(valueLabels);
  const labeledValueList = distinctValues
    .filter((value) => valueLabelMap.has(value))
    .map((value) => ({ value, label: valueLabelMap.get(value) }))
    .slice(0, MAX_SMALL_SET_DISTINCT);
  const valueLabelCoverage = distinctValues.length ? labeledValueList.length / distinctValues.length : 0;
  const hasValueLabels = valueLabelMap.size > 0;

  // D5: suspected UNDECLARED user-missing — codes SPSS is NOT excluding (no
  // declared-missing spec) that silently inflate means/SD. Two deterministic signals,
  // unioned: (a) the numeric heuristic — a classic sentinel sitting far outside the
  // natural scale; (b) the dictionary heuristic — a value LABEL that literally reads
  // "888"/"999"/"Don't know"/"Refuse" etc. (b) is the authoritative one for survey
  // exports that bury missing meaning in label text on remapped codes (98/99/100/101),
  // where (a) goes blind because non-asked codes (94/96) poison the scale max.
  const sentinelCandidates = uniqueNumericValues.filter((value) => SENTINEL_MISSING_CODES.has(value));
  const nonSentinelValues = uniqueNumericValues.filter((value) => !SENTINEL_MISSING_CODES.has(value));
  const restMax = nonSentinelValues.length ? Math.max(...nonSentinelValues) : 0;
  const numericHeuristicMissing = integerLike && restMax > 0
    ? sentinelCandidates.filter((value) => value >= 2 * restMax)
    : [];
  // Read every dictionary entry (not just observed/labeled distinct values) so prep code
  // defensively declares the sentinel even when this sample never happened to hit it.
  const labelDerivedMissing = [];
  valueLabelMap.forEach((label, valueKey) => {
    if (!labelMarksMissing(label)) return;
    const numericCode = parseNumericValue(valueKey);
    if (numericCode !== null && Number.isInteger(numericCode)) labelDerivedMissing.push(numericCode);
  });
  const suspectedMissingCodes = Array.from(new Set([...numericHeuristicMissing, ...labelDerivedMissing]))
    .sort((left, right) => left - right);

  const analysisRole = deriveAnalysisRole({
    inferredType,
    measurementLevel,
    distinctCount: distinctValues.length,
    nonEmptyCount: nonEmptyValues.length,
    numericStats: { integerLike, min, max },
    aliases: aliasList,
    hasValueLabels,
    valueLabelCoverage,
  });

  return {
    token,
    originalName,
    outputName,
    aliases: aliasList,
    inferredType,
    typeLabel: getTypeLabel(inferredType),
    measurementLevel,
    measurementLabel: getLevelLabel(measurementLevel),
    sampleValues: sampleValues.map(normalizeCell).filter(Boolean).slice(0, MAX_INFERENCE_ROWS),
    rowCount: allValues.length,
    nonEmptyCount: nonEmptyValues.length,
    missingCount: allValues.length - nonEmptyValues.length,
    distinctCount: distinctValues.length,
    distinctPreview: distinctValues.slice(0, MAX_DISTINCT_PREVIEW),
    observedValues,
    valueLabels: labeledValueList,
    declaredMissing: declared,
    suspectedMissingCodes,
    numericStats: numericValues.length
      ? {
          min,
          max,
          uniqueValues: uniqueNumericValues,
          integerLike,
        }
      : null,
    analysisRole,
    isNumeric: inferredType === 'numeric',
    isCategorical: inferredType === 'categorical' || measurementLevel === 'nominal',
  };
};

const formatNumericLiteral = (value = 0) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return '0';
  return Number.isInteger(normalized) ? String(normalized) : String(Number(normalized.toFixed(4)));
};

const escapeReplacement = (value = '') => String(value || '').replace(/\$/g, '$$$$');

const replaceAliasWithToken = (text = '', alias = '', token = '') => {
  if (!alias || !token) return text;
  const escapedAlias = escapeRegExp(alias);
  try {
    return text.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escapedAlias}(?![\\p{L}\\p{N}_])`, 'gu'), token);
  } catch {
    return text.replace(new RegExp(escapedAlias, 'g'), escapeReplacement(token));
  }
};

export const tokenizeSpssRequest = (request = '', analysis = null) => {
  const columns = Array.isArray(analysis?.columns) ? analysis.columns : [];
  return columns
    .flatMap((column) => column.aliases.map((alias) => ({ alias, token: column.token })))
    .sort((left, right) => right.alias.length - left.alias.length)
    .reduce((currentText, replacement) => replaceAliasWithToken(currentText, replacement.alias, replacement.token), String(request || '').trim());
};

const buildTabularAnalysis = ({
  fileName = '',
  originalNames = [],
  outputNames = [],
  dataRows = [],
  aliasesByIndex = [],
  valueLabelsByIndex = [],
  declaredMissingByIndex = [],
} = {}) => {
  const safeDataRows = Array.isArray(dataRows) ? dataRows : [];
  const columnCount = Math.max(originalNames.length, outputNames.length, safeDataRows.reduce((max, row) => Math.max(max, row.length), 0));
  if (safeDataRows.length < 1) {
    throw new Error('צריך לפחות שורת כותרות ושורת נתונים אחת.');
  }

  if (!columnCount) throw new Error('לא זוהו עמודות בקובץ הנתונים.');

  const safeOriginalNames = ensureUniqueLabels(Array.from({ length: columnCount }, (_, index) => normalizeHeaderLabel(originalNames[index], index)));
  const safeOutputNames = ensureUniqueSpssNames(Array.from({ length: columnCount }, (_, index) => outputNames[index] || safeOriginalNames[index]));
  const normalizedDataRows = safeDataRows.map((row) => Array.from({ length: columnCount }, (_, index) => normalizeCell(row?.[index])));
  const sampleRows = normalizedDataRows.slice(0, MAX_INFERENCE_ROWS);

  const columns = safeOriginalNames.map((originalName, index) => buildColumnProfile({
    originalName,
    outputName: safeOutputNames[index],
    token: `VAR_${index + 1}`,
    allValues: normalizedDataRows.map((row) => row[index]),
    sampleValues: sampleRows.map((row) => row[index]),
    aliases: Array.isArray(aliasesByIndex[index]) ? aliasesByIndex[index] : [],
    valueLabels: Array.isArray(valueLabelsByIndex[index]) ? valueLabelsByIndex[index] : [],
    declaredMissing: declaredMissingByIndex[index] || null,
  }));

  return {
    fileName: String(fileName || '').trim(),
    rowCount: normalizedDataRows.length,
    columnCount: columns.length,
    inferenceSampleRowCount: Math.min(sampleRows.length, MAX_INFERENCE_ROWS),
    columns,
    tokenToOriginalName: Object.fromEntries(columns.map((column) => [column.token, column.originalName])),
    tokenToOutputName: Object.fromEntries(columns.map((column) => [column.token, column.outputName])),
    originalNameToToken: Object.fromEntries(columns.flatMap((column) => column.aliases.map((alias) => [alias, column.token]))),
  };
};

export const parseCsvText = (csvText = '', { fileName = '' } = {}) => {
  const text = String(csvText || '').replace(/^\uFEFF/, '');
  if (!text.trim()) throw new Error('הקובץ ריק. צריך להעלות CSV עם כותרות ונתונים.');

  const parsed = Papa.parse(text, {
    skipEmptyLines: 'greedy',
  });

  if (Array.isArray(parsed.errors) && parsed.errors.length && !parsed.data?.length) {
    throw new Error('לא הצלחתי לקרוא את קובץ ה-CSV. בדוק שהקובץ נשמר כ-CSV תקין.');
  }

  const rows = Array.isArray(parsed.data) ? parsed.data.filter((row) => Array.isArray(row)) : [];
  if (rows.length < 2) {
    throw new Error('צריך לפחות שורת כותרות ושורת נתונים אחת.');
  }

  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const headerRow = Array.from({ length: columnCount }, (_, index) => rows[0]?.[index]);
  const dataRows = rows.slice(1);

  return buildTabularAnalysis({
    fileName,
    originalNames: headerRow,
    outputNames: headerRow,
    dataRows,
  });
};

export const parseSpssSavDataset = ({ fileName = '', variables = [], rows = [] } = {}) => {
  const safeVariables = Array.isArray(variables) ? variables.filter((variable) => normalizeCell(variable?.name)) : [];
  if (!safeVariables.length) throw new Error('לא זוהו משתנים בקובץ ה-SAV.');

  const dataRows = (Array.isArray(rows) ? rows : []).map((row) => safeVariables.map((variable) => row?.[variable.name]));
  if (!dataRows.length) throw new Error('קובץ ה-SAV נקרא, אבל לא נמצאו בו שורות נתונים.');

  return buildTabularAnalysis({
    fileName,
    originalNames: safeVariables.map((variable) => variable.label || variable.name),
    outputNames: safeVariables.map((variable) => variable.name),
    dataRows,
    aliasesByIndex: safeVariables.map((variable) => [variable.name, variable.label]),
    valueLabelsByIndex: safeVariables.map((variable) => (Array.isArray(variable.valueLabels) ? variable.valueLabels : [])),
    declaredMissingByIndex: safeVariables.map((variable) => variable.declaredMissing || null),
  });
};

const getNumericColumns = (analysis = null) => (Array.isArray(analysis?.columns) ? analysis.columns.filter((column) => column.isNumeric) : []);

const getCategoricalColumns = (analysis = null) => (Array.isArray(analysis?.columns)
  ? analysis.columns.filter((column) => column.isCategorical || column.measurementLevel === 'ordinal')
  : []);

const getNumericColumnsFromList = (columns = []) => columns.filter((column) => column?.isNumeric);

const getCategoricalColumnsFromList = (columns = []) => columns.filter((column) => (column?.isCategorical || column?.measurementLevel === 'ordinal'));

const getColumnsByTokens = (analysis = null, tokens = []) => {
  const columns = Array.isArray(analysis?.columns) ? analysis.columns : [];
  if (!columns.length || !Array.isArray(tokens) || !tokens.length) return [];

  const columnByToken = new Map(columns.map((column) => [column.token, column]));
  return tokens.map((token) => columnByToken.get(token)).filter(Boolean);
};

const formatColumnNames = (columns = []) => Array.from(new Set(columns.map((column) => column?.originalName).filter(Boolean))).join(', ');

const getReferencedColumnsContext = (request = '', analysis = null) => {
  const tokenizedRequest = tokenizeSpssRequest(request, analysis);
  const referencedColumns = getColumnsByTokens(analysis, extractReferencedTokens(tokenizedRequest));
  return {
    tokenizedRequest,
    referencedColumns,
    hasReferencedColumns: referencedColumns.length > 0,
  };
};

const quoteSpssStringLiteral = (value = '') => `'${String(value || '').replace(/'/g, "''")}'`;

const formatSpssLiteral = (value = '', column = null) => {
  const normalized = normalizeCell(value);
  if (!normalized) return '';
  const numericValue = parseNumericValue(normalized);
  if (column?.isNumeric && numericValue !== null) return formatNumericLiteral(numericValue);
  if (numericValue !== null && column?.inferredType !== 'text') return formatNumericLiteral(numericValue);
  return quoteSpssStringLiteral(unwrapQuotedLiteral(normalized));
};

const normalizeFilterOperator = (value = '') => {
  const cleanValue = String(value || '').trim().toLowerCase();
  if (/^(?:=|==|eq|שווה|שווה\s+ל|הוא|היא|ערכו|שערכו|שערכה|עם\s+ערך)$/iu.test(cleanValue)) return '=';
  if (/^(?:<>|!=|~=|ne|לא\s+שווה|אינו|אינה)$/iu.test(cleanValue)) return '<>';
  if (/^(?:>|gt|גדול|גדול\s+מ|מעל|יותר\s+מ|גבוה\s+מ|אחרי)$/iu.test(cleanValue)) return '>';
  if (/^(?:>=|ge|לפחות|גדול\s+או\s+שווה|מעל\s+או\s+שווה)$/iu.test(cleanValue)) return '>=';
  if (/^(?:<|lt|קטן|קטן\s+מ|מתחת|פחות\s+מ|נמוך\s+מ|לפני)$/iu.test(cleanValue)) return '<';
  if (/^(?:<=|le|עד|לכל\s+היותר|קטן\s+או\s+שווה|מתחת\s+או\s+שווה)$/iu.test(cleanValue)) return '<=';
  return '';
};

const FILTER_VALUE_PATTERN = /('(?:[^']*)'|"(?:[^"]*)"|[-+]?(?:(?:\d+(?:[.,]\d+)?)|(?:[.,]\d+))|[\p{L}\p{N}_-]+)/u;

const extractFilterConditionForColumn = (tokenizedRequest = '', column = null) => {
  if (!column?.token) return null;
  const source = String(tokenizedRequest || '');
  const tokenPattern = new RegExp(`\\b${escapeRegExp(column.token)}\\b`, 'g');
  let tokenMatch = tokenPattern.exec(source);

  while (tokenMatch) {
    const after = source.slice(tokenMatch.index + tokenMatch[0].length, tokenMatch.index + tokenMatch[0].length + 90);
    const before = source.slice(Math.max(0, tokenMatch.index - 45), tokenMatch.index);
    const candidates = [
      after.match(new RegExp(`^\\s*(?:ש(?:ערכו|ערכה)|ערכו|ערכה|הוא|היא|שווה\\s+ל-?|=|==|EQ|eq)\\s*${FILTER_VALUE_PATTERN.source}`, 'u')),
      after.match(new RegExp(`^\\s*(?:גדול\\s+מ-?|מעל|יותר\\s+מ-?|גבוה\\s+מ-?|>|GT|gt)\\s*${FILTER_VALUE_PATTERN.source}`, 'u')),
      after.match(new RegExp(`^\\s*(?:לפחות|גדול\\s+או\\s+שווה|>=|GE|ge)\\s*${FILTER_VALUE_PATTERN.source}`, 'u')),
      after.match(new RegExp(`^\\s*(?:קטן\\s+מ-?|מתחת|פחות\\s+מ-?|נמוך\\s+מ-?|<|LT|lt)\\s*${FILTER_VALUE_PATTERN.source}`, 'u')),
      after.match(new RegExp(`^\\s*(?:עד|לכל\\s+היותר|קטן\\s+או\\s+שווה|<=|LE|le)\\s*${FILTER_VALUE_PATTERN.source}`, 'u')),
      before.match(new RegExp(`${FILTER_VALUE_PATTERN.source}\\s*(?:=|==|שווה\\s+ל-?|הוא|היא)\\s*$`, 'u')),
    ].filter(Boolean);

    for (const candidate of candidates) {
      const fullText = String(candidate[0] || '').trim();
      const literal = normalizeCell(candidate[1]);
      const operator = fullText.includes('>=') || /לפחות|גדול\s+או\s+שווה|\bGE\b/i.test(fullText)
        ? '>='
        : fullText.includes('<=') || /עד|לכל\s+היותר|קטן\s+או\s+שווה|\bLE\b/i.test(fullText)
          ? '<='
          : fullText.includes('>') || /גדול\s+מ|מעל|יותר\s+מ|גבוה\s+מ|\bGT\b/i.test(fullText)
            ? '>'
            : fullText.includes('<') || /קטן\s+מ|מתחת|פחות\s+מ|נמוך\s+מ|\bLT\b/i.test(fullText)
              ? '<'
              : '=';
      const formattedLiteral = formatSpssLiteral(literal, column);
      if (formattedLiteral) return { token: column.token, operator: normalizeFilterOperator(operator) || operator, literal: formattedLiteral };
    }

    tokenMatch = tokenPattern.exec(source);
  }

  return null;
};

const hasAnalysisIntent = (request = '') => [
  T_TEST_PATTERN,
  CORRELATION_PATTERN,
  REGRESSION_PATTERN,
  CHI_SQUARE_PATTERN,
  ANOVA_PATTERN,
  OUTLIER_PATTERN,
  DESCRIPTIVE_PATTERN,
].some((pattern) => pattern.test(String(request || '')));

const buildLocalFilterDisplaySyntax = ({ request = '', analysis = null, tutorMode = false } = {}) => {
  const { tokenizedRequest, referencedColumns } = getReferencedColumnsContext(request, analysis);
  if (!FILTER_DISPLAY_PATTERN.test(String(request || ''))) return null;
  if (hasAnalysisIntent(request)) return null;
  if (!referencedColumns.length) return null;

  const conditions = referencedColumns
    .map((column) => extractFilterConditionForColumn(tokenizedRequest, column))
    .filter(Boolean);
  if (!conditions.length) return null;

  const conditionText = conditions
    .map((condition) => `${condition.token} ${condition.operator} ${condition.literal}`)
    .join(' AND ');
  const displayColumns = Array.from(new Set(referencedColumns.map((column) => column.token)));

  return {
    tokenizedRequest,
    syntax: [
      buildTutorComment('בחרתי TEMPORARY עם SELECT IF כדי להציג תת-מדגם להרצה אחת בלבד, בלי לשנות את קובץ הנתונים או להשאיר פילטר פעיל.', tutorMode),
      'TEMPORARY.',
      `SELECT IF (${conditionText}).`,
      `LIST VARIABLES=${displayColumns.join(' ')}`,
      '  /CASES=FROM 1 TO 200.',
    ].filter(Boolean).join('\n'),
  };
};

export const buildSmartSuggestions = (analysis = null) => {
  const numericColumns = getNumericColumns(analysis);
  const categoricalColumns = getCategoricalColumns(analysis)
    .filter((column) => column.distinctCount >= 2 && column.distinctCount <= 12);
  const binaryGroupColumn = categoricalColumns.find((column) => column.distinctCount === 2);
  const anovaGroupColumn = categoricalColumns.find((column) => column.distinctCount >= 3);
  const suggestions = [];

  if (numericColumns[0]) {
    suggestions.push({
      id: 'desc-first-numeric',
      title: 'תיאוריים למשתנה המרכזי',
      prompt: `תן לי syntax לסטטיסטיקה תיאורית עבור ${numericColumns[0].originalName}.`,
    });
    suggestions.push({
      id: 'outlier-first-numeric',
      title: 'בדיקת חריגים',
      prompt: `בדוק חריגים עבור ${numericColumns[0].originalName}.`,
    });
  }

  if (numericColumns.length >= 2) {
    suggestions.push({
      id: 'correlation-top-pair',
      title: 'מתאם בין שני משתנים מספריים',
      prompt: `בדוק מתאם בין ${numericColumns[0].originalName} לבין ${numericColumns[1].originalName}.`,
    });
  }

  if (binaryGroupColumn && numericColumns[0]) {
    suggestions.push({
      id: 'ttest-binary-group',
      title: 'השוואת ממוצעים בין שתי קבוצות',
      prompt: `בצע T-test עבור ${numericColumns[0].originalName} לפי ${binaryGroupColumn.originalName}.`,
    });
  }

  if (anovaGroupColumn && numericColumns[0]) {
    suggestions.push({
      id: 'anova-group',
      title: 'השוואת ממוצעים בין כמה קבוצות',
      prompt: `בצע ANOVA עבור ${numericColumns[0].originalName} לפי ${anovaGroupColumn.originalName}.`,
    });
  }

  if (categoricalColumns.length >= 2) {
    suggestions.push({
      id: 'chi-square-pair',
      title: 'קשר בין שני משתנים קטגוריאליים',
      prompt: `בדוק Chi-square בין ${categoricalColumns[0].originalName} לבין ${categoricalColumns[1].originalName}.`,
    });
  }

  return suggestions.slice(0, 6);
};

const ensureSpssSentenceTerminator = (value = '') => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed.endsWith('.') ? trimmed : `${trimmed}.`;
};

const buildSpssCommentLine = (value = '') => {
  const content = ensureSpssSentenceTerminator(String(value || '').trim().replace(/^\*\s?/, ''));
  return content ? `* ${content}` : '';
};

const buildErrorLine = (message = '') => buildSpssCommentLine(`ERROR: ${String(message || '').trim()}`);

const stripGuardrailPrefix = (value = '') => String(value || '').trim().replace(/^\*\s*ERROR:\s*/i, '').trim();

export const isGuardrailSyntaxResponse = (value = '') => /^\*\s*ERROR:/i.test(String(value || '').trim());

export const getQuickActionState = ({ actionId = '', column = null } = {}) => {
  const action = getQuickActionById(actionId);
  if (!action) {
    return {
      action: null,
      available: false,
      reason: 'Unknown quick action.',
      warningLabel: '',
    };
  }

  if (!column) {
    return {
      action,
      available: false,
      reason: 'Load a data file before using quick actions.',
      warningLabel: action.warningLabel || '',
    };
  }

  if (action.requiresNumeric && !column.isNumeric) {
    return {
      action,
      available: false,
      reason: `${action.command} requires a numeric variable.`,
      warningLabel: action.warningLabel || '',
    };
  }

  if (action.id === 'reverse-scale' && !isReverseScaleCandidate(column)) {
    return {
      action,
      available: false,
      reason: 'Reverse scale is only available for Likert-style ordinal variables.',
      warningLabel: action.warningLabel || '',
    };
  }

  return {
    action,
    available: true,
    reason: '',
    warningLabel: action.warningLabel || '',
  };
};

const GUARDRAIL_TRANSLATIONS = [
  {
    pattern: /^Load a CSV file before generating syntax\.$/i,
    value: 'טען קודם קובץ נתונים כדי להתחיל לבנות syntax.',
  },
  {
    pattern: /^Load a CSV file before using quick actions\.$/i,
    value: 'טען קודם קובץ נתונים לפני שימוש בפעולות המהירות.',
  },
  {
    pattern: /^Load a data file before generating syntax\.$/i,
    value: 'טען קודם קובץ נתונים כדי להתחיל לבנות syntax.',
  },
  {
    pattern: /^Load a data file before using quick actions\.$/i,
    value: 'טען קודם קובץ נתונים לפני שימוש בפעולות המהירות.',
  },
  {
    pattern: /^Write a short Hebrew request before generating syntax\.$/i,
    value: 'כתוב בקשה קצרה וברורה בעברית כדי לייצר syntax.',
  },
  {
    pattern: /^T-test requires a numeric test variable\.$/i,
    value: 'כדי לבצע T-test צריך לפחות משתנה נבדק אחד מסוג מספרי.',
  },
  {
    pattern: /^T-test requires a grouping variable with exactly two groups\.$/i,
    value: 'כדי לבצע T-test צריך גם משתנה קיבוץ עם בדיוק שתי קבוצות.',
  },
  {
    pattern: /^T-test requires an explicitly requested grouping variable with exactly two groups\.$/i,
    value: 'כדי לבצע T-test צריך לציין במפורש משתנה חלוקה עם בדיוק שתי קבוצות. בחר עמודת חלוקה מתאימה מתוך הקובץ.',
  },
  {
    pattern: /^The requested T-test grouping variable must have exactly two groups\.$/i,
    value: 'העמודה שבחרת כמשתנה חלוקה ל-T-test לא מתאימה, כי אין לה בדיוק שתי קבוצות. בחר משתנה חלוקה בינארי מתוך הקובץ.',
  },
  {
    pattern: /^T-test requires numeric requested test variables: (.+)\.$/i,
    replace: (_, variables) => `ב-T-test רק משתנה החלוקה יכול להיות קטגוריאלי או ordinal. המשתנים הנבדקים שביקשת חייבים להיות מספריים: ${variables}.`,
  },
  {
    pattern: /^Correlation requires at least two numeric variables\.$/i,
    value: 'כדי לחשב מתאם צריך לפחות שני משתנים מספריים.',
  },
  {
    pattern: /^Correlation requires numeric requested variables: (.+)\.$/i,
    replace: (_, variables) => `כדי לחשב מתאם, כל המשתנים שביקשת חייבים להיות מספריים. המשתנים האלה אינם מספריים: ${variables}.`,
  },
  {
    pattern: /^Regression requires at least one numeric outcome and one additional numeric predictor\.$/i,
    value: 'כדי לבצע רגרסיה צריך לפחות משתנה תוצאה מספרי ומשתנה מנבא נוסף.',
  },
  {
    pattern: /^Regression requires numeric requested variables: (.+)\.$/i,
    replace: (_, variables) => `כדי לבצע רגרסיה, כל המשתנים שביקשת כתוצאה או כמנבאים חייבים להיות מספריים. המשתנים האלה אינם מספריים: ${variables}.`,
  },
  {
    pattern: /^Chi-square requires at least two categorical variables\.$/i,
    value: 'כדי לבצע Chi-square צריך לפחות שני משתנים קטגוריאליים.',
  },
  {
    pattern: /^ANOVA requires a numeric dependent variable\.$/i,
    value: 'כדי לבצע ANOVA צריך משתנה תלוי מספרי.',
  },
  {
    pattern: /^ANOVA requires a grouping variable with at least three groups\.$/i,
    value: 'כדי לבצע ANOVA צריך משתנה קיבוץ עם שלוש קבוצות לפחות.',
  },
  {
    pattern: /^ANOVA requires an explicitly requested grouping variable with at least three groups\.$/i,
    value: 'כדי לבצע ANOVA צריך לציין במפורש משתנה חלוקה עם שלוש קבוצות לפחות. בחר עמודת חלוקה מתאימה מתוך הקובץ.',
  },
  {
    pattern: /^The requested ANOVA grouping variable must have at least three groups\.$/i,
    value: 'העמודה שבחרת כמשתנה חלוקה ל-ANOVA לא מתאימה, כי אין לה שלוש קבוצות לפחות. בחר משתנה חלוקה אחר מתוך הקובץ.',
  },
  {
    pattern: /^ANOVA requires numeric requested dependent variables: (.+)\.$/i,
    replace: (_, variables) => `ב-ANOVA רק משתנה החלוקה יכול להיות קטגוריאלי או ordinal. המשתנים התלויים שביקשת חייבים להיות מספריים: ${variables}.`,
  },
  {
    pattern: /^EXAMINE requires at least one numeric variable\.$/i,
    value: 'בדיקת חריגים זמינה רק למשתנה מספרי.',
  },
  {
    pattern: /^DESCRIPTIVES requires at least one numeric variable\.$/i,
    value: 'סטטיסטיקה תיאורית זמינה רק למשתנה מספרי.',
  },
  {
    pattern: /^Reverse scale requires a numeric variable\.$/i,
    value: 'היפוך סולם זמין רק למשתנה מספרי.',
  },
  {
    pattern: /^Reverse scale requires an explicitly requested target variable\.$/i,
    value: 'כדי לבצע היפוך סולם בבקשה חופשית צריך לציין במפורש איזו עמודה להפוך.',
  },
  {
    pattern: /^Reverse scale requires observable numeric values\.$/i,
    value: 'כדי להפוך סולם צריך עמודה מספרית עם ערכים בפועל, לא רק חסרים.',
  },
  {
    pattern: /^Reverse scale is only available for Likert-style ordinal variables\.$/i,
    value: 'היפוך סולם זמין רק למשתנים שנראים כמו סולם Likert או ordinal בדיד עם טווח קטן.',
  },
  {
    pattern: /^Reverse scale requires numeric requested variables: (.+)\.$/i,
    replace: (_, variables) => `היפוך סולם לא זמין עבור המשתנים שביקשת: ${variables}. אפשר לבצע אותו רק על עמודות מספריות מתאימות.`,
  },
  {
    pattern: /^Reverse scale is not available for requested variables: (.+)\.$/i,
    replace: (_, variables) => `היפוך סולם לא זמין עבור המשתנים שביקשת: ${variables}. הוא עובד רק על משתני Likert או ordinal בדידים עם טווח קטן.`,
  },
  {
    pattern: /^Unknown quick action\.$/i,
    value: 'הפעולה המהירה שנבחרה אינה מוכרת.',
  },
  {
    pattern: /^The model returned an empty SPSS response\.$/i,
    value: 'המודל לא החזיר syntax שימושי. נסח את הבקשה מחדש בצורה ממוקדת יותר.',
  },
  {
    pattern: /^The model returned comments without executable SPSS commands\.$/i,
    value: 'המודל החזיר רק הערות בלי אף פקודת SPSS שניתנת להרצה, ולכן הפלט נעצר.',
  },
  {
    pattern: /^Analysis-only mode blocks RECODE because .+\.$/i,
    value: 'במסלול ה-AI של SPSS מותר רק syntax לניתוח. RECODE נחסם כי הוא משנה ערכי דאטה. אם המטרה היא היפוך סולם, השתמש בפעולה המהירה הייעודית בסטודיו.',
  },
  {
    pattern: /^Analysis-only mode blocks COMPUTE because .+\.$/i,
    value: 'במסלול ה-AI של SPSS מותר רק syntax לניתוח. COMPUTE נחסם כי הוא כותב ערכים מחושבים חזרה לדאטה.',
  },
  {
    pattern: /^Analysis-only mode blocks (.+) because .+\.$/i,
    replace: (_, commandLabel) => `במסלול ה-AI של SPSS מותר רק syntax לניתוח. הפקודה ${commandLabel} נחסמה כי היא משנה את הדאטה או את מצב העבודה במקום להריץ ניתוח לקריאה בלבד.`,
  },
  {
    pattern: /^Data-prep mode blocks (.+) because .+\.$/i,
    replace: (_, commandLabel) => `גם במצב הכנת דאטה הפקודה ${commandLabel} חסומה, כי היא פותחת/כותבת קבצים או משנה מצב session בין הבלוקים. השתמש בה ידנית ב-SPSS אם צריך.`,
  },
  {
    pattern: /^The model referenced unknown variables: (.+)\.$/i,
    replace: (_, variables) => `המודל הפנה למשתנים שלא קיימים במיפוי הנוכחי: ${variables}. נסה לבקש שוב עם עמודות מהקובץ בלבד.`,
  },
  {
    pattern: /^EXAMINE requires numeric requested variables: (.+)\.$/i,
    replace: (_, variables) => `בדיקת חריגים זמינה רק למשתנים מספריים. המשתנים שביקשת אינם מספריים: ${variables}.`,
  },
  {
    pattern: /^DESCRIPTIVES requires numeric requested variables: (.+)\.$/i,
    replace: (_, variables) => `סטטיסטיקה תיאורית זמינה רק למשתנים מספריים. המשתנים שביקשת אינם מספריים: ${variables}.`,
  },
  {
    pattern: /^The model invented variables outside the allowed VAR_n mapping: (.+)\.$/i,
    replace: (_, variables) => `המודל המציא משתנים חדשים מעבר למיפוי המותר: ${variables}. לא הוספתי את הפלט ל-syntax.`,
  },
  {
    pattern: /^The model used unobserved GROUPS literals for (VAR_\d+): (.+)\.$/i,
    replace: (_, variableToken, literals) => `המודל השתמש בערכי GROUPS שלא נצפו בדאטה עבור ${variableToken}: ${literals}. לא הוספתי את הפלט ל-syntax.`,
  },
  {
    pattern: /^The model used unobserved BY literals for (VAR_\d+): (.+)\.$/i,
    replace: (_, variableToken, literals) => `המודל השתמש בערכי קיבוץ שלא נצפו בדאטה עבור ${variableToken}: ${literals}. לא הוספתי את הפלט ל-syntax.`,
  },
  {
    pattern: /^The model used unobserved RECODE source literals for (VAR_\d+): (.+)\.$/i,
    replace: (_, variableToken, literals) => `המודל השתמש בערכי מקור ל-RECODE שלא נצפו בדאטה עבור ${variableToken}: ${literals}. לא הוספתי את הפלט ל-syntax.`,
  },
];

export const getGuardrailGuidanceMessage = (value = '') => {
  const cleanMessage = stripGuardrailPrefix(value);
  if (!cleanMessage) return '';

  const matchedTranslation = GUARDRAIL_TRANSLATIONS.find((entry) => entry.pattern.test(cleanMessage));
  if (matchedTranslation) {
    if (typeof matchedTranslation.replace === 'function') {
      return cleanMessage.replace(matchedTranslation.pattern, matchedTranslation.replace);
    }
    return matchedTranslation.value;
  }

  return /[A-Za-z]/.test(cleanMessage)
    ? 'הבקשה נעצרה לפני יצירת syntax כדי למנוע פלט לא תקף. נסח אותה מחדש בצורה ממוקדת יותר.'
    : cleanMessage;
};

// Roles that genuinely cannot enter a modeling procedure (regression/correlation):
// free text, dates, and bookkeeping ids. Everything else — continuous, likert,
// categorical, categorical-code — is usable: the model dummy-codes categoricals or
// treats likert as ~continuous (guided by buildSpssSystemPrompt), and the retry
// ladder escalates to prep mode when data-prep (AUTORECODE/dummy) is required.
const METHODOLOGY_UNANALYZABLE_ROLES = new Set(['text', 'date', 'identifier']);
const isModelingUnanalyzableColumn = (column = null) => METHODOLOGY_UNANALYZABLE_ROLES.has(column?.analysisRole);

export const detectMethodologyIssue = (request = '', analysis = null) => {
  const cleanRequest = String(request || '').trim();
  if (!cleanRequest) return 'Write a short Hebrew request before generating syntax.';

  const { tokenizedRequest, referencedColumns, hasReferencedColumns } = getReferencedColumnsContext(cleanRequest, analysis);
  const explicitlyRequestedGroupingTokens = extractExplicitGroupingTokens(tokenizedRequest, analysis);
  const explicitlyRequestedGroupColumns = getColumnsByTokens(analysis, explicitlyRequestedGroupingTokens)
    .filter((column) => column.distinctCount >= 2);
  const explicitlyRequestedGroupTokenSet = new Set(explicitlyRequestedGroupColumns.map((column) => column.token));
  const numericColumns = getNumericColumns(analysis);
  const reverseScaleColumns = numericColumns.filter((column) => isReverseScaleCandidate(column));
  const categoricalColumns = getCategoricalColumns(analysis).filter((column) => column.distinctCount >= 2);
  const scopedNumericColumns = hasReferencedColumns ? getNumericColumnsFromList(referencedColumns) : numericColumns;
  const requestedAnalysisColumns = hasReferencedColumns
    ? referencedColumns.filter((column) => column && !explicitlyRequestedGroupTokenSet.has(column.token))
    : [];
  const scopedRequestedAnalysisNumericColumns = hasReferencedColumns
    ? getNumericColumnsFromList(requestedAnalysisColumns)
    : numericColumns;
  const requestedNonNumericAnalysisColumns = hasReferencedColumns
    ? requestedAnalysisColumns.filter((column) => !column?.isNumeric)
    : [];
  const scopedCategoricalColumns = (hasReferencedColumns ? getCategoricalColumnsFromList(referencedColumns) : categoricalColumns)
    .filter((column) => column.distinctCount >= 2);
  const scopedNonNumericColumns = hasReferencedColumns
    ? referencedColumns.filter((column) => !column?.isNumeric)
    : [];
  // Role-aware view for modeling gates (regression/correlation): block only on truly
  // unusable roles, and count usable predictors regardless of storage type so a coded
  // categorical predictor no longer trips the "needs another numeric variable" guard.
  const datasetColumns = Array.isArray(analysis?.columns) ? analysis.columns : [];
  const scopedUnanalyzableColumns = hasReferencedColumns
    ? referencedColumns.filter(isModelingUnanalyzableColumn)
    : [];
  const scopedAnalyzableColumns = (hasReferencedColumns ? referencedColumns : datasetColumns)
    .filter((column) => column && !isModelingUnanalyzableColumn(column));
  const binaryGroupColumn = scopedCategoricalColumns.find((column) => column.distinctCount === 2);
  const explicitlyRequestedBinaryGroupColumn = explicitlyRequestedGroupColumns.find((column) => column.distinctCount === 2);

  const hasGroupComparisonHint = GROUP_COMPARISON_HINT_PATTERN.test(cleanRequest);

  if (T_TEST_PATTERN.test(cleanRequest)) {
    if (requestedNonNumericAnalysisColumns.length) {
      return `T-test requires numeric requested test variables: ${formatColumnNames(requestedNonNumericAnalysisColumns)}.`;
    }
    if (!scopedRequestedAnalysisNumericColumns.length) return 'T-test requires a numeric test variable.';
    if (explicitlyRequestedGroupColumns.length) {
      // An explicit grouping variable was named — keep the strict two-group check.
      if (!explicitlyRequestedBinaryGroupColumn) {
        return 'The requested T-test grouping variable must have exactly two groups.';
      }
    } else if (!(hasGroupComparisonHint && binaryGroupColumn)) {
      // No grouping variable named. Allow value-based phrasing ("compare men vs women")
      // when a comparison hint + a binary group column exist — the model maps the group
      // words to the right variable via valueLabels. Otherwise block.
      return 'T-test requires an explicitly requested grouping variable with exactly two groups.';
    }
    if (!binaryGroupColumn) return 'T-test requires a grouping variable with exactly two groups.';
  }

  if (CORRELATION_PATTERN.test(cleanRequest) && scopedUnanalyzableColumns.length) {
    return `Correlation requires numeric requested variables: ${formatColumnNames(scopedUnanalyzableColumns)}.`;
  }

  if (CORRELATION_PATTERN.test(cleanRequest) && scopedAnalyzableColumns.length < 2) {
    return 'Correlation requires at least two numeric variables.';
  }

  if (REGRESSION_PATTERN.test(cleanRequest) && scopedUnanalyzableColumns.length) {
    return `Regression requires numeric requested variables: ${formatColumnNames(scopedUnanalyzableColumns)}.`;
  }

  if (REGRESSION_PATTERN.test(cleanRequest) && scopedAnalyzableColumns.length < 2) {
    return 'Regression requires at least one numeric outcome and one additional numeric predictor.';
  }

  if (CHI_SQUARE_PATTERN.test(cleanRequest) && scopedCategoricalColumns.length < 2) {
    return 'Chi-square requires at least two categorical variables.';
  }

  if (ANOVA_PATTERN.test(cleanRequest)) {
    const multiGroupColumn = scopedCategoricalColumns.find((column) => column.distinctCount >= 3);
    const explicitlyRequestedMultiGroupColumn = explicitlyRequestedGroupColumns.find((column) => column.distinctCount >= 3);
    if (requestedNonNumericAnalysisColumns.length) {
      return `ANOVA requires numeric requested dependent variables: ${formatColumnNames(requestedNonNumericAnalysisColumns)}.`;
    }
    if (!scopedRequestedAnalysisNumericColumns.length) return 'ANOVA requires a numeric dependent variable.';
    if (explicitlyRequestedGroupColumns.length) {
      if (!explicitlyRequestedMultiGroupColumn) {
        return 'The requested ANOVA grouping variable must have at least three groups.';
      }
    } else if (!(hasGroupComparisonHint && multiGroupColumn)) {
      return 'ANOVA requires an explicitly requested grouping variable with at least three groups.';
    }
    if (!multiGroupColumn) return 'ANOVA requires a grouping variable with at least three groups.';
  }

  if (OUTLIER_PATTERN.test(cleanRequest) && scopedNonNumericColumns.length) {
    return `EXAMINE requires numeric requested variables: ${formatColumnNames(scopedNonNumericColumns)}.`;
  }

  if (OUTLIER_PATTERN.test(cleanRequest) && !scopedNumericColumns.length) {
    return 'EXAMINE requires at least one numeric variable.';
  }

  if (DESCRIPTIVE_PATTERN.test(cleanRequest) && scopedNonNumericColumns.length) {
    return `DESCRIPTIVES requires numeric requested variables: ${formatColumnNames(scopedNonNumericColumns)}.`;
  }

  if (DESCRIPTIVE_PATTERN.test(cleanRequest) && !scopedNumericColumns.length) {
    return 'DESCRIPTIVES requires at least one numeric variable.';
  }

  if (REVERSE_SCALE_PATTERN.test(cleanRequest) && !numericColumns.length) {
    return 'Reverse scale requires a numeric variable.';
  }

  if (REVERSE_SCALE_PATTERN.test(cleanRequest)) {
    const referencedReverseScaleColumns = getColumnsByTokens(analysis, extractReferencedTokens(tokenizedRequest));
    if (!referencedReverseScaleColumns.length) {
      return 'Reverse scale requires an explicitly requested target variable.';
    }

    if (referencedReverseScaleColumns.length) {
      const nonNumericColumns = referencedReverseScaleColumns.filter((column) => !column.isNumeric);
      if (nonNumericColumns.length) {
        return `Reverse scale requires numeric requested variables: ${formatColumnNames(nonNumericColumns)}.`;
      }

      const invalidReverseScaleColumns = referencedReverseScaleColumns.filter((column) => !isReverseScaleCandidate(column));
      if (invalidReverseScaleColumns.length) {
        return `Reverse scale is not available for requested variables: ${formatColumnNames(invalidReverseScaleColumns)}.`;
      }
    }
  }

  if (REVERSE_SCALE_PATTERN.test(cleanRequest) && !reverseScaleColumns.length) {
    return 'Reverse scale is only available for Likert-style ordinal variables.';
  }

  return '';
};

const buildTutorComment = (text = '', tutorMode = false) => (tutorMode ? buildSpssCommentLine(text) : '');

export const buildQuickActionSyntax = ({ actionId = '', column = null, tutorMode = false } = {}) => {
  const actionState = getQuickActionState({ actionId, column });
  if (!actionState.available) {
    return buildErrorLine(actionState.reason);
  }

  if (actionId === 'outliers') {
    return [
      buildTutorComment(`בחרתי EXAMINE כי ${column.originalName} הוא משתנה מספרי, וזו הדרך הישירה לזהות חריגים ולהפיק boxplot.`, tutorMode),
      `EXAMINE VARIABLES=${column.outputName}`,
      '  /PLOT=BOXPLOT STEMLEAF NPPLOT',
      '  /STATISTICS=DESCRIPTIVES',
      '  /CINTERVAL=95',
      '  /MISSING=LISTWISE',
      '  /NOTOTAL.',
    ].filter(Boolean).join('\n');
  }

  if (actionId === 'descriptives') {
    return [
      buildTutorComment(`בחרתי DESCRIPTIVES כי ${column.originalName} הוא משתנה מספרי, והמטרה כאן היא לקבל ממוצע, סטיית תקן, מינימום ומקסימום.`, tutorMode),
      `DESCRIPTIVES VARIABLES=${column.outputName}`,
      '  /STATISTICS=MEAN STDDEV MIN MAX.',
    ].filter(Boolean).join('\n');
  }

  if (actionId === 'reverse-scale') {
    const reverseScalePlan = getReverseScalePlan(column);
    if (!reverseScalePlan.allowed) {
      return buildErrorLine('Reverse scale is only available for Likert-style ordinal variables.');
    }

    const numericStats = column.numericStats || null;
    if (!numericStats || numericStats.min === null || numericStats.max === null) {
      return buildErrorLine('Reverse scale requires observable numeric values.');
    }

    const recodeMap = reverseScalePlan.scaleValues
      .map((value, index) => `(${formatNumericLiteral(value)}=${formatNumericLiteral(reverseScalePlan.scaleValues[reverseScalePlan.scaleValues.length - 1 - index])})`)
      .join(' ');

    return [
      buildTutorComment(`בחרתי RECODE כי ${column.originalName} עבר עיגון לטווח סולם בדיד בטוח, ולכן הכי בטוח להפוך את הערכים לפי הטווח הרציף המלא ולא רק לפי הערכים שנצפו בפועל.`, tutorMode),
      `RECODE ${column.outputName} ${recodeMap}.`,
      'EXECUTE.',
    ].filter(Boolean).join('\n');
  }

  return buildErrorLine('Unknown quick action.');
};

const stripMarkdownFences = (text = '') => {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```[a-zA-Z0-9_-]*\s*/, '').replace(/\s*```$/, '').trim();
};

const stripMarkdownArtifacts = (text = '') => stripMarkdownFences(text)
  .replace(/^\s*#{1,6}\s+/gm, '')
  .replace(/^\s*>\s?/gm, '')
  .replace(/^\s*[-+]\s+/gm, '')
  .replace(/^\s*\d+\.\s+/gm, '')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .trim();

const extractReferencedTokens = (text = '') => Array.from(new Set(String(text || '').match(/\bVAR_\d+\b/g) || []));

const extractExplicitGroupingTokens = (text = '', analysis = null) => {
  const groupTokens = new Set();
  GROUP_REFERENCE_PATTERNS.forEach((pattern) => {
    pattern.lastIndex = 0;
    let match = pattern.exec(String(text || ''));
    while (match) {
      const token = String(match[1] || '').trim();
      if (token) groupTokens.add(token);
      if (match[0].length === 0) pattern.lastIndex += 1;
      match = pattern.exec(String(text || ''));
    }
  });

  if (!groupTokens.size && analysis && GROUP_COMPARISON_HINT_PATTERN.test(String(text || ''))) {
    const referencedColumns = getColumnsByTokens(analysis, extractReferencedTokens(text));
    const categoricalCandidates = getCategoricalColumnsFromList(referencedColumns).filter((column) => column.distinctCount >= 2);
    if (referencedColumns.length >= 2 && categoricalCandidates.length === 1) {
      groupTokens.add(categoricalCandidates[0].token);
    }
  }

  return Array.from(groupTokens);
};

const stripQuotedStringLiterals = (text = '') => String(text || '').replace(/'[^']*'|"[^"]*"/g, ' ');

const collectInvalidArgumentIdentifiers = (text = '', allowedTokens = new Set(), extraAllowedIdentifiers = new Set()) => {
  const invalidIdentifiers = new Set();
  const candidateText = stripQuotedStringLiterals(text);
  const functionNames = new Set((candidateText.match(FUNCTION_NAME_PATTERN) || [])
    .map((identifier) => String(identifier || '').trim().toUpperCase())
    .filter(Boolean));
  const identifiers = candidateText.match(IDENTIFIER_PATTERN) || [];

  identifiers.forEach((identifier) => {
    const normalized = String(identifier || '').trim();
    if (!normalized) return;

    const upper = normalized.toUpperCase();
    if (RESERVED_SLOT_TOKENS.has(upper)) return;
    if (functionNames.has(upper)) return;
    if (allowedTokens.has(normalized)) return;
    if (extraAllowedIdentifiers.has(upper) || extraAllowedIdentifiers.has(normalized)) return;
    invalidIdentifiers.add(normalized);
  });

  return invalidIdentifiers;
};

const stripSpssCommentLines = (text = '') => String(text || '')
  .split(/\r?\n/)
  .filter((line) => !String(line || '').trim().startsWith('*'))
  .join('\n');

const isAsciiDigit = (value = '') => value >= '0' && value <= '9';

const isNumericLiteralDot = (text = '', index = 0) => {
  const previousCharacter = text[index - 1] || '';
  const nextCharacter = text[index + 1] || '';

  if (!isAsciiDigit(nextCharacter)) return false;
  if (isAsciiDigit(previousCharacter)) return true;
  return /[\s(=+\-*/,<>]/.test(previousCharacter);
};

const scanSpssCommandLine = (line = '', initialQuoteCharacter = '') => {
  const source = String(line || '');
  let quoteCharacter = initialQuoteCharacter;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (quoteCharacter) {
      if (character === quoteCharacter) {
        const nextCharacter = source[index + 1] || '';
        if (nextCharacter === quoteCharacter) {
          index += 1;
          continue;
        }
        quoteCharacter = '';
      }
      continue;
    }

    if (character === '\'' || character === '"') {
      quoteCharacter = character;
      continue;
    }

    if (character === '.' && !isNumericLiteralDot(source, index)) {
      return { quoteCharacter: '', terminated: true };
    }
  }

  return { quoteCharacter, terminated: false };
};

const tokenizeSpssCommands = (text = '') => {
  const source = String(text || '');
  const commands = [];
  let currentCommand = '';
  let quoteCharacter = '';

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    currentCommand += character;

    if (quoteCharacter) {
      if (character === quoteCharacter) {
        const nextCharacter = source[index + 1] || '';
        if (nextCharacter === quoteCharacter) {
          currentCommand += nextCharacter;
          index += 1;
          continue;
        }
        quoteCharacter = '';
      }
      continue;
    }

    if (character === '\'' || character === '"') {
      quoteCharacter = character;
      continue;
    }

    if (character !== '.' || isNumericLiteralDot(source, index)) continue;

    const command = currentCommand.trim();
    if (command) commands.push(command);
    currentCommand = '';
  }

  const trailingCommand = currentCommand.trim();
  if (trailingCommand) commands.push(trailingCommand);

  return commands;
};

const getSpssCommands = (input = '') => (Array.isArray(input) ? input : tokenizeSpssCommands(input))
  .map((command) => String(command || '').trim())
  .filter(Boolean);

const isSpssSubcommandContinuationLine = (line = '') => {
  const trimmed = String(line || '').trim();
  return !trimmed || trimmed.startsWith('/') || trimmed.startsWith('+') || /^(?:ELSE|ELSE\s+IF|END\s+IF|END\s+REPEAT|END\s+LOOP|END\s+GPL|END\s+MATRIX|END\s+PROGRAM|END\s+DATA)\b/i.test(trimmed);
};

const findSpssCommandTerminatorIssue = (text = '') => {
  const source = stripSpssCommentLines(text);
  const lines = source.split(/\r?\n/);
  let insideOpenCommand = false;
  let quoteCharacter = '';
  let openCommandLine = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = String(line || '').trim();
    if (!trimmed) continue;

    if (insideOpenCommand && isLikelySpssCommandStartLine(trimmed) && !isSpssSubcommandContinuationLine(trimmed)) {
      return `Missing period before line ${index + 1}; SPSS command started on line ${openCommandLine} was not terminated with ".".`;
    }

    if (!insideOpenCommand) {
      insideOpenCommand = true;
      quoteCharacter = '';
      openCommandLine = index + 1;
    }

    const nextState = scanSpssCommandLine(line, quoteCharacter);
    quoteCharacter = nextState.quoteCharacter;
    if (nextState.terminated) {
      insideOpenCommand = false;
      quoteCharacter = '';
      openCommandLine = 0;
    }
  }

  if (insideOpenCommand) {
    return `Missing period at the end of the SPSS command that starts on line ${openCommandLine}.`;
  }

  return '';
};

const findFirstSubcommandIndex = (text = '') => {
  const source = String(text || '');
  let quoteCharacter = '';

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (quoteCharacter) {
      if (character === quoteCharacter) {
        const nextCharacter = source[index + 1] || '';
        if (nextCharacter === quoteCharacter) {
          index += 1;
          continue;
        }
        quoteCharacter = '';
      }
      continue;
    }

    if (character === '\'' || character === '"') {
      quoteCharacter = character;
      continue;
    }

    if (character === '/' && (index === 0 || /\s/.test(source[index - 1] || ''))) {
      return index;
    }
  }

  return -1;
};

const extractCommandHead = (command = '') => {
  const normalized = String(command || '').trim();
  const subcommandIndex = findFirstSubcommandIndex(normalized);
  return subcommandIndex === -1 ? normalized : normalized.slice(0, subcommandIndex).trim();
};

const extractPositionalOperandSection = (command = '', pattern = null) => {
  if (!(pattern instanceof RegExp)) return '';
  const commandHead = extractCommandHead(command);
  const match = commandHead.match(pattern);
  if (!match) return '';
  return commandHead.slice(match[0].length).trim();
};

const stripExpressionFunctionNames = (text = '') => String(text || '')
  .replace(/\b[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)*\s*\(/gu, '(');

const extractInvalidVariableIdentifiers = (input = '', allowedTokens = new Set()) => {
  const invalidIdentifiers = new Set();
  getSpssCommands(input).forEach((command) => {
    POSITIONAL_VARIABLE_COMMAND_SPECS.forEach(({ pattern, extraAllowedIdentifiers }) => {
      const operandSection = extractPositionalOperandSection(command, pattern);
      if (!operandSection) return;

      collectInvalidArgumentIdentifiers(operandSection, allowedTokens, extraAllowedIdentifiers).forEach((identifier) => {
        invalidIdentifiers.add(identifier);
      });
    });

    VARIABLE_SLOT_PATTERNS.forEach((pattern) => {
      pattern.lastIndex = 0;
      let match = pattern.exec(command);
      while (match) {
        match.slice(1).forEach((captureGroup) => {
          collectInvalidArgumentIdentifiers(captureGroup, allowedTokens).forEach((identifier) => {
            invalidIdentifiers.add(identifier);
          });
        });
        if (match[0].length === 0) pattern.lastIndex += 1;
        match = pattern.exec(command);
      }
    });
  });
  return Array.from(invalidIdentifiers);
};

const extractInvalidGraphIdentifiers = (input = '', allowedTokens = new Set()) => {
  const invalidIdentifiers = new Set();
  getSpssCommands(input).forEach((command) => {
    GRAPH_VARIABLE_COMMAND_PATTERN.lastIndex = 0;
    let commandMatch = GRAPH_VARIABLE_COMMAND_PATTERN.exec(command);

    while (commandMatch) {
      const graphCommandText = String(commandMatch[0] || '');
      GRAPH_VARIABLE_SUBCOMMAND_PATTERN.lastIndex = 0;
      let subcommandMatch = GRAPH_VARIABLE_SUBCOMMAND_PATTERN.exec(graphCommandText);

      while (subcommandMatch) {
        collectInvalidArgumentIdentifiers(subcommandMatch[1], allowedTokens, GRAPH_ARGUMENT_KEYWORDS).forEach((identifier) => {
          invalidIdentifiers.add(identifier);
        });
        if (subcommandMatch[0].length === 0) GRAPH_VARIABLE_SUBCOMMAND_PATTERN.lastIndex += 1;
        subcommandMatch = GRAPH_VARIABLE_SUBCOMMAND_PATTERN.exec(graphCommandText);
      }

      if (commandMatch[0].length === 0) GRAPH_VARIABLE_COMMAND_PATTERN.lastIndex += 1;
      commandMatch = GRAPH_VARIABLE_COMMAND_PATTERN.exec(command);
    }
  });

  return Array.from(invalidIdentifiers);
};

const extractInvalidExpressionIdentifiers = (input = '', allowedTokens = new Set()) => {
  const invalidIdentifiers = new Set();
  getSpssCommands(input).forEach((command) => {
    EXPRESSION_CONTEXT_PATTERNS.forEach(({ pattern, captureGroups = [] }) => {
      pattern.lastIndex = 0;
      let match = pattern.exec(command);
      while (match) {
        captureGroups.forEach((captureGroupIndex) => {
          const candidateText = stripExpressionFunctionNames(stripQuotedStringLiterals(match[captureGroupIndex] || ''));
          const identifiers = candidateText.match(/[\p{L}_][\p{L}\p{N}_]*/gu) || [];
          identifiers.forEach((identifier) => {
            const normalized = String(identifier || '').trim();
            if (!normalized) return;
            if (RESERVED_SLOT_TOKENS.has(normalized.toUpperCase())) return;
            if (allowedTokens.has(normalized)) return;
            invalidIdentifiers.add(normalized);
          });
        });
        if (match[0].length === 0) pattern.lastIndex += 1;
        match = pattern.exec(command);
      }
    });
  });
  return Array.from(invalidIdentifiers);
};

const isLikelySpssCommandStartLine = (line = '') => {
  const trimmed = String(line || '').trim();
  if (!trimmed) return true;
  return SPSS_COMMAND_START_PATTERNS.some((pattern) => pattern.test(trimmed));
};

const commentOutNonSpssTextLines = (text = '') => {
  const outputLines = [];
  let insideOpenCommand = false;
  let quoteCharacter = '';

  String(text || '')
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = String(line || '').trim();

      if (!insideOpenCommand) {
        if (!trimmed) {
          outputLines.push('');
          return;
        }

        if (trimmed.startsWith('*')) {
          outputLines.push(buildSpssCommentLine(trimmed));
          return;
        }

        if (!isLikelySpssCommandStartLine(trimmed)) {
          outputLines.push(buildSpssCommentLine(trimmed));
          return;
        }

        insideOpenCommand = true;
        quoteCharacter = '';
      }

      outputLines.push(line);

      const nextState = scanSpssCommandLine(line, quoteCharacter);
      quoteCharacter = nextState.quoteCharacter;

      if (nextState.terminated) {
        insideOpenCommand = false;
        quoteCharacter = '';
      }
    });

  return outputLines.join('\n');
};

const findBlockedAnalysisOnlyCommandIssue = (input = '', mode = 'analysis') => {
  const isPrepMode = mode === 'prep';
  const modeLabel = isPrepMode ? 'Data-prep mode' : 'Analysis-only mode';
  const commands = getSpssCommands(input);
  const hasSafeTemporaryFilter = commands.some((command) => /^\s*TEMPORARY\b/i.test(command))
    && commands.some((command) => /^\s*SELECT\s+IF\b/i.test(command))
    && commands.some((command) => TEMPORARY_FILTER_COMMAND_HEADS.some((pattern) => pattern.test(command)));

  for (const command of commands) {
    for (const { pattern, label, reason, blockInPrep } of ANALYSIS_ONLY_BLOCKED_COMMANDS) {
      pattern.lastIndex = 0;
      if (isPrepMode && blockInPrep === false) continue;
      if (hasSafeTemporaryFilter && /^(?:TEMPORARY|SELECT IF)$/i.test(label)) continue;
      if (pattern.test(command)) {
        return `${modeLabel} blocks ${label} because ${reason}.`;
      }
    }
  }
  return '';
};

const extractLiteralCandidates = (text = '') => String(text || '').match(/'[^']*'|"[^"]*"|[^,\s()=]+/g) || [];

const findInvalidObservedLiterals = (token = '', literals = [], analysis = null, contextLabel = 'GROUPS') => {
  if (!token) return '';

  const columns = Array.isArray(analysis?.columns) ? analysis.columns : [];
  const column = columns.find((entry) => entry.token === token) || null;
  const observedLookup = buildObservedLiteralLookup(column);
  if (!observedLookup.size) return '';

  const invalidLiterals = literals.filter((literal) => {
    const comparableKeys = buildComparableLiteralKeys(literal);
    return !comparableKeys.length || !comparableKeys.some((key) => observedLookup.has(key));
  });

  if (!invalidLiterals.length) return '';
  return `The model used unobserved ${contextLabel} literals for ${token}: ${invalidLiterals.join(', ')}.`;
};

const findInvalidObservedExpressionLiteral = (expressionText = '', analysis = null, contextLabel = 'expression') => {
  const text = String(expressionText || '');

  for (const { pattern, tokenIndex, literalIndex } of EXPRESSION_LITERAL_COMPARISON_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match) {
      const token = normalizeCell(match[tokenIndex]);
      const literal = normalizeCell(match[literalIndex]);
      const validationIssue = findInvalidObservedLiterals(token, [literal], analysis, contextLabel);
      if (validationIssue) return validationIssue;
      if (match[0].length === 0) pattern.lastIndex += 1;
      match = pattern.exec(text);
    }
  }

  for (const { pattern, tokenIndex, literalsIndex, label } of EXPRESSION_LITERAL_SET_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match) {
      const token = normalizeCell(match[tokenIndex]);
      const literalValues = extractLiteralCandidates(match[literalsIndex])
        .map((literal) => normalizeCell(literal))
        .filter(Boolean)
        .filter((literal) => !RESERVED_SLOT_TOKENS.has(unwrapQuotedLiteral(literal).toUpperCase()))
        .filter((literal) => !/^VAR_\d+$/i.test(unwrapQuotedLiteral(literal)));
      const validationIssue = findInvalidObservedLiterals(token, literalValues, analysis, label || contextLabel);
      if (validationIssue) return validationIssue;
      if (match[0].length === 0) pattern.lastIndex += 1;
      match = pattern.exec(text);
    }
  }

  return '';
};

const validateObservedLiteralReferences = (input = '', analysis = null) => {
  const groupPatterns = [
    { pattern: /(?:\/GROUPS|\bGROUPS)\s*=\s*(VAR_\d+)\s*\(([^)]*)\)/gi, label: 'GROUPS' },
    { pattern: /\bBY\s+(VAR_\d+)\s*\(([^)]*)\)/gi, label: 'BY' },
  ];

  const commands = getSpssCommands(input);

  for (const command of commands) {
    for (const { pattern, label } of groupPatterns) {
      pattern.lastIndex = 0;
      let match = pattern.exec(command);
      while (match) {
        const literalValues = extractLiteralCandidates(match[2]).map((literal) => normalizeCell(literal)).filter(Boolean);
        const validationIssue = findInvalidObservedLiterals(String(match[1] || '').trim(), literalValues, analysis, label);
        if (validationIssue) return validationIssue;
        if (match[0].length === 0) pattern.lastIndex += 1;
        match = pattern.exec(command);
      }
    }

    const recodePattern = /\bRECODE\b([\s\S]*?)\./gi;
    recodePattern.lastIndex = 0;
    let recodeMatch = recodePattern.exec(command);
    while (recodeMatch) {
      const recodeBody = String(recodeMatch[1] || '');
      const sourceSection = recodeBody.split(/\bINTO\b/i)[0] || '';
      const sourceTokens = sourceSection.match(/\bVAR_\d+\b/g) || [];
      if (sourceTokens.length === 1) {
        const clausePattern = /\(([^()]*)\)/g;
        clausePattern.lastIndex = 0;
        let clauseMatch = clausePattern.exec(recodeBody);
        while (clauseMatch) {
          const clauseText = String(clauseMatch[1] || '').trim();
          const sourceLiteralText = clauseText.split('=')[0]?.trim() || '';
          if (sourceLiteralText && !RECODE_RANGE_KEYWORD_PATTERN.test(sourceLiteralText)) {
            const literals = extractLiteralCandidates(sourceLiteralText)
              .map((literal) => normalizeCell(literal))
              .filter(Boolean)
              .filter((literal) => !RESERVED_SLOT_TOKENS.has(unwrapQuotedLiteral(literal).toUpperCase()));
            const validationIssue = findInvalidObservedLiterals(sourceTokens[0], literals, analysis, 'RECODE source');
            if (validationIssue) return validationIssue;
          }
          if (clauseMatch[0].length === 0) clausePattern.lastIndex += 1;
          clauseMatch = clausePattern.exec(recodeBody);
        }
      }
      if (recodeMatch[0].length === 0) recodePattern.lastIndex += 1;
      recodeMatch = recodePattern.exec(command);
    }

    for (const { pattern, captureGroups = [] } of EXPRESSION_CONTEXT_PATTERNS) {
      pattern.lastIndex = 0;
      let match = pattern.exec(command);
      while (match) {
        for (const captureGroupIndex of captureGroups) {
          const expressionText = String(match[captureGroupIndex] || '').trim();
          if (!expressionText) continue;
          const validationIssue = findInvalidObservedExpressionLiteral(expressionText, analysis, 'expression');
          if (validationIssue) return validationIssue;
        }
        if (match[0].length === 0) pattern.lastIndex += 1;
        match = pattern.exec(command);
      }
    }

    const ifAssignmentPatterns = [
      /\bIF\s*\([\s\S]*?\)\s*(VAR_\d+)\s*=\s*('(?:[^']*)'|"(?:[^"]*)"|[-+]?(?:(?:\d+(?:[.,]\d+)?)|(?:[.,]\d+)))\s*\.(?=\s*(?:$|\r?\n))/giu,
      /(?:^|[\r\n])\s*IF\s+(?!\()[\s\S]*?\s+(VAR_\d+)\s*=\s*('(?:[^']*)'|"(?:[^"]*)"|[-+]?(?:(?:\d+(?:[.,]\d+)?)|(?:[.,]\d+)))\s*\.(?=\s*(?:$|\r?\n))/giu,
    ];

    for (const ifAssignmentPattern of ifAssignmentPatterns) {
      ifAssignmentPattern.lastIndex = 0;
      let ifAssignmentMatch = ifAssignmentPattern.exec(command);
      while (ifAssignmentMatch) {
        const validationIssue = findInvalidObservedLiterals(
          normalizeCell(ifAssignmentMatch[1]),
          [normalizeCell(ifAssignmentMatch[2])],
          analysis,
          'IF assignment',
        );
        if (validationIssue) return validationIssue;
        if (ifAssignmentMatch[0].length === 0) ifAssignmentPattern.lastIndex += 1;
        ifAssignmentMatch = ifAssignmentPattern.exec(command);
      }
    }
  }

  return '';
};

// In data-prep mode the model may legitimately create new variables (COMPUTE x=, RECODE ... INTO x,
// IF (...) x=, NUMERIC/STRING/VECTOR/COUNT). Collect those declared target names so the
// invalid-identifier guard treats them as known instead of "invented" variables.
const DECLARED_TARGET_PATTERNS = [
  { pattern: /\bCOMPUTE\s+([\p{L}_][\p{L}\p{N}_]*)\s*=/giu, list: false },
  { pattern: /\bCOUNT\s+([\p{L}_][\p{L}\p{N}_]*)\s*=/giu, list: false },
  { pattern: /\bVECTOR\s+([\p{L}_][\p{L}\p{N}_]*)/giu, list: false },
  { pattern: /\bIF\s*\([\s\S]*?\)\s*([\p{L}_][\p{L}\p{N}_]*)\s*=/giu, list: false },
  { pattern: /\bINTO\s+([^\n/.=]+)/giu, list: true },
  { pattern: /\bNUMERIC\s+([^\n/.=(]+)/giu, list: true },
  { pattern: /\bSTRING\s+([^\n/.=(]+)/giu, list: true },
];

export const collectDeclaredTargetNames = (input = '') => {
  const names = new Set();
  const addName = (value = '') => {
    const normalized = String(value || '').trim();
    if (!normalized) return;
    if (/^VAR_\d+$/i.test(normalized)) return;
    if (RESERVED_SLOT_TOKENS.has(normalized.toUpperCase())) return;
    if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(normalized)) return;
    names.add(normalized);
  };

  getSpssCommands(input).forEach((command) => {
    DECLARED_TARGET_PATTERNS.forEach(({ pattern, list }) => {
      pattern.lastIndex = 0;
      let match = pattern.exec(command);
      while (match) {
        const captured = String(match[1] || '');
        if (list) {
          captured.split(/[\s,]+/).forEach(addName);
        } else {
          addName(captured);
        }
        if (match[0].length === 0) pattern.lastIndex += 1;
        match = pattern.exec(command);
      }
    });
  });

  return names;
};

export const restoreColumnTokens = (text = '', analysis = null) => {
  const tokenMap = analysis?.tokenToOutputName && typeof analysis.tokenToOutputName === 'object'
    ? analysis.tokenToOutputName
    : {};
  return Object.entries(tokenMap)
    .sort((left, right) => right[0].length - left[0].length)
    .reduce((currentText, entry) => currentText.replace(new RegExp(`\\b${escapeRegExp(entry[0])}\\b`, 'g'), escapeReplacement(entry[1])), String(text || '').trim());
};

// SPSS `MISSING VALUES` accepts at most THREE discrete values per variable (or a
// range `lo THRU hi`, or a range plus one value). Batch G's dictionary reader
// legitimately surfaces 4+ missing codes (98,99,100,101) which the model then emits
// as a flat list — SPSS rejects it and the whole run dies at the first block. This
// collapses a code set to a LEGAL spec, converting to a range ONLY when it is exact
// (a contiguous run, or a contiguous run plus a single outlier) so we NEVER over-cover
// real data with a naive min..max.
export const formatSpssMissingValueSpec = (codes = []) => {
  const nums = Array.from(new Set(
    (Array.isArray(codes) ? codes : [])
      .map((value) => (typeof value === 'number' ? value : parseNumericValue(value)))
      .filter((value) => value !== null && Number.isFinite(value)),
  )).sort((left, right) => left - right);
  if (!nums.length) return '';
  const list = (arr) => arr.map((value) => formatNumericLiteral(value)).join(', ');
  const isContiguous = (arr) => arr.every((value, index) => index === 0 || value === arr[index - 1] + 1);
  if (nums.length <= 3) return list(nums);
  if (isContiguous(nums)) return `${formatNumericLiteral(nums[0])} THRU ${formatNumericLiteral(nums[nums.length - 1])}`;
  // One contiguous run + a single outlier — SPSS allows a range plus one value.
  for (let i = 0; i < nums.length; i += 1) {
    const rest = nums.filter((_, index) => index !== i);
    if (rest.length >= 2 && isContiguous(rest)) {
      return `${formatNumericLiteral(rest[0])} THRU ${formatNumericLiteral(rest[rest.length - 1])}, ${formatNumericLiteral(nums[i])}`;
    }
  }
  // Genuinely scattered >3 (rare for sentinels, which sit far outside the real scale):
  // widest legal form. Legal, and practically safe because the codes are outliers.
  return `${formatNumericLiteral(nums[0])} THRU ${formatNumericLiteral(nums[nums.length - 1])}`;
};

// Deterministic safety net: rewrite any generated `MISSING VALUES var (v1,v2,v3,v4…)`
// whose parenthetical spec has >3 discrete numeric values into an SPSS-legal spec.
// Independent of the model — guarantees legal output even if the prompt guidance is
// ignored. Only touches numeric-list specs; leaves ranges/keywords (THRU/LO/HI…) alone.
const MISSING_VALUES_SPEC_HAS_RANGE = /\b(THRU|LO|LOWEST|HI|HIGHEST|SYSMIS|MISSING)\b/i;
export const normalizeMissingValuesStatements = (text = '') => String(text || '').replace(
  /(MISSING\s+VALUES\b[^\n]*?\))(\s*\.)/gi,
  (whole, body, tail) => {
    const rewritten = body.replace(/\(([^)]*)\)/g, (group, inner) => {
      if (MISSING_VALUES_SPEC_HAS_RANGE.test(inner)) return group;
      const parts = inner.split(',').map((part) => part.trim()).filter(Boolean);
      if (parts.length <= 3) return group;
      const nums = parts.map((part) => parseNumericValue(part));
      if (nums.some((value) => value === null)) return group;
      const spec = formatSpssMissingValueSpec(nums);
      return spec ? `(${spec})` : group;
    });
    return `${rewritten}${tail}`;
  },
);

export const sanitizeSpssSyntax = (text = '', analysis = null, { mode = 'analysis', extraAllowedNames = [] } = {}) => {
  const cleaned = normalizeMissingValuesStatements(
    commentOutNonSpssTextLines(stripMarkdownArtifacts(text))
      // מילות מפתח שהמודל ממציא ו-SPSS דוחה — נורמליזציה דטרמיניסטית (COEFFS אינו
      // keyword חוקי בשום פקודה, אז החלפה גלובלית בטוחה).
      .replace(/\bCOEFFS\b/gi, 'COEFF')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
  if (!cleaned) return buildErrorLine('The model returned an empty SPSS response.');

  const allowedTokens = new Set(Array.isArray(analysis?.columns) ? analysis.columns.map((column) => column.token) : []);
  const syntaxOnly = stripSpssCommentLines(cleaned);
  const terminatorIssue = findSpssCommandTerminatorIssue(cleaned);
  if (terminatorIssue) {
    return buildErrorLine(terminatorIssue);
  }

  const syntaxCommands = getSpssCommands(syntaxOnly);
  if (!syntaxCommands.length) {
    return buildErrorLine('The model returned comments without executable SPSS commands.');
  }
  const blockedCommandIssue = findBlockedAnalysisOnlyCommandIssue(syntaxCommands, mode);
  if (blockedCommandIssue) {
    return buildErrorLine(blockedCommandIssue);
  }

  const referencedTokens = extractReferencedTokens(syntaxOnly);
  const unknownTokens = referencedTokens.filter((token) => !allowedTokens.has(token));
  if (unknownTokens.length) {
    return buildErrorLine(`The model referenced unknown variables: ${unknownTokens.join(', ')}.`);
  }

  // Names created within this block, plus names carried over from prior blocks via
  // extraAllowedNames, count as known identifiers so the guard does not flag them as invented.
  // This holds in analysis mode too: a prior prep block may have created a derived variable
  // (e.g. age_group) that an analysis block legitimately READS. Creation itself stays blocked
  // in analysis mode by findBlockedAnalysisOnlyCommandIssue above, so this cannot be abused.
  const identifierAllowList = new Set([
    ...allowedTokens,
    ...(Array.isArray(extraAllowedNames) ? extraAllowedNames : []).map((name) => String(name || '').trim()).filter(Boolean),
    ...collectDeclaredTargetNames(syntaxCommands),
  ]);

  const invalidIdentifiers = Array.from(new Set([
    ...extractInvalidVariableIdentifiers(syntaxCommands, identifierAllowList),
    ...extractInvalidGraphIdentifiers(syntaxCommands, identifierAllowList),
    ...extractInvalidExpressionIdentifiers(syntaxCommands, identifierAllowList),
  ]));
  if (invalidIdentifiers.length) {
    return buildErrorLine(`The model invented variables outside the allowed VAR_n mapping: ${invalidIdentifiers.join(', ')}.`);
  }

  const literalValidationIssue = validateObservedLiteralReferences(syntaxCommands, analysis);
  if (literalValidationIssue) {
    return buildErrorLine(literalValidationIssue);
  }

  return restoreColumnTokens(cleaned, analysis);
};

// SAV value labels → "1=זכר; 2=נקבה" so the model can name groups, pick reference
// categories for dummies, and the interpreter can report results by category name.
const formatValueLabelMetadata = (column = null) => {
  const labels = Array.isArray(column?.valueLabels) ? column.valueLabels : [];
  if (!labels.length) return '';
  const rendered = labels
    .map((entry) => `${entry.value}=${String(entry.label || '').replace(/[\n;]+/g, ' ').trim()}`)
    .filter(Boolean)
    .join('; ');
  return rendered ? `; valueLabels=[${rendered}]` : '';
};

// Declared user-missing from the SAV dictionary — so the model knows SPSS already
// excludes these codes (no need to MISSING VALUES them again).
const formatDeclaredMissingMetadata = (column = null) => {
  const declared = column?.declaredMissing;
  if (!declared) return '';
  const parts = [];
  if (Array.isArray(declared.discrete) && declared.discrete.length) {
    parts.push(declared.discrete.map((value) => formatNumericLiteral(value)).join(','));
  }
  if (declared.range) {
    parts.push(`${formatNumericLiteral(declared.range.min)}..${formatNumericLiteral(declared.range.max)}`);
  }
  return parts.length ? `; declaredMissing=[${parts.join('; ')}]` : '';
};

const buildTokenizedMetadataLines = (analysis = null) => {
  const columns = Array.isArray(analysis?.columns) ? analysis.columns : [];
  return columns.map((column) => {
    const numericRange = column.numericStats && column.numericStats.min !== null && column.numericStats.max !== null
      ? `; range=${formatNumericLiteral(column.numericStats.min)}..${formatNumericLiteral(column.numericStats.max)}`
      : '';
    const observedValues = formatObservedLiteralMetadata(column);
    const valueLabels = formatValueLabelMetadata(column);
    const declaredMissing = formatDeclaredMissingMetadata(column);
    const suspectedMissing = Array.isArray(column.suspectedMissingCodes) && column.suspectedMissingCodes.length
      ? `; suspectedUndeclaredMissing=[${column.suspectedMissingCodes.map((value) => formatNumericLiteral(value)).join(',')}]; missingValuesSpec=(${formatSpssMissingValueSpec(column.suspectedMissingCodes)})`
      : '';
    // Real variable name is included for semantic context (this is a study tool, not a
    // privacy sandbox). The model still emits VAR_n tokens, which the guardrails validate.
    const name = column.originalName ? `; name=${JSON.stringify(column.originalName)}` : '';
    const role = column.analysisRole ? `; role=${column.analysisRole}` : '';
    return `${column.token}${name}: type=${column.inferredType}; level=${column.measurementLevel}${role}; missing=${column.missingCount}; distinct=${column.distinctCount}${numericRange}${observedValues}${valueLabels}${declaredMissing}${suspectedMissing}`;
  }).join('\n');
};

const buildSpssSystemPrompt = ({ analysis = null, tutorMode = false, mode = 'analysis', extraAllowedNames = [], repairHint = '' } = {}) => {
  const allowedTokens = Array.isArray(analysis?.columns) ? analysis.columns.map((column) => column.token).join(', ') : '';
  const isPrepMode = mode === 'prep';
  const carriedNames = (Array.isArray(extraAllowedNames) ? extraAllowedNames : [])
    .map((name) => String(name || '').trim())
    .filter(Boolean);

  const modeRules = isPrepMode
    ? [
        'זהו מסלול data-prep. מותר להחזיר פקודות הכנת דאטה: COMPUTE, RECODE (כולל INTO), IF, DO IF / ELSE IF / END IF, DO REPEAT, COUNT, AUTORECODE, NUMERIC, STRING, VECTOR, RANK, AGGREGATE, וגם VALUE LABELS / VARIABLE LABELS / FORMATS / MISSING VALUES / RENAME VARIABLES, לצד פקודות ניתוח.',
        'מותר ליצור משתנים חדשים דרך COMPUTE, RECODE ... INTO, COUNT, NUMERIC, STRING, VECTOR. תן להם שמות אנגלית קצרים, ברורים ותקפים ל-SPSS (אותיות, ספרות, _; עד 64 תווים; מתחיל באות). אסור להשתמש בשם של VAR_n קיים כשם יעד חדש.',
        'אסור לקרוא ממשתנה מקור שאינו VAR_n קיים (או שם יעד שכבר יצרת בבלוק הזה). אל תמציא משתני מקור.',
        'אחרי פקודות transformation הוסף EXECUTE. כשצריך, כדי שהן יחולו.',
        'עדיין אסור: GET/SAVE/EXPORT/IMPORT, DATASET, OMS, OUTPUT routing, SPLIT FILE, FILTER, SELECT IF קבוע, USE ALL, TEMPORARY, SORT CASES, ADD/MATCH FILES, INCLUDE, WRITE, PRINT — כל מה שפותח/כותב קבצים או משנה מצב session בין בלוקים.',
      ]
    : [
        'אסור להמציא משתנים חדשים. אין להשתמש ב-INTO או ב-COMPUTE כדי ליצור שם חדש שאינו VAR_n קיים.',
        'זהו מסלול analysis-only. אל תחזיר COMPUTE, RECODE, IF, DO IF, ELSE IF, DO REPEAT, COUNT, AUTORECODE, NUMERIC, STRING, VECTOR או כל פקודת transformation שמשנה ערכי data או metadata.',
        'אם הבקשה דורשת סינון זמני של מקרים לפני ניתוח, מותר להשתמש רק בצירוף TEMPORARY. ואז SELECT IF (...). ואז פקודת ניתוח/תצוגה אחת. אסור להשתמש ב-FILTER או USE ALL.',
      ];

  const carriedNamesLine = carriedNames.length
    ? `משתנים שכבר נוצרו בבלוקים קודמים והם קיימים בוודאות ב-dataset (שמות מדויקים — השתמש בהם בדיוק ככתבם, קריאה תקפה גם במצב analysis): ${carriedNames.join(', ')}. חובה: אלה משתנים אמיתיים וקיימים. אל תניח שקיים משתנה מקור דומה במקומם (למשל אל תשנה "age_groups" ל-"age_group"), אל תשנה או "תתקן" את שמם, ולעולם אל תחזיר עבורם * ERROR: או תשמיט אותם — השתמש בהם כמו בכל משתנה קיים אחר.`
    : '';

  // Methodology reasoning — make the model build the analysis from each variable's
  // analysis ROLE, not its storage type. Targets the two recurring failure modes:
  // (1) a numerically-coded category dumped raw into regression as if continuous,
  // (2) referencing a derived/grouping variable that was never created.
  const phantomRule = isPrepMode
    ? 'משתני רפאים — אסור: כל משתנה שאתה מזכיר חייב להיות VAR_n קיים, או שם שכבר נוצר (בבלוק הזה או בבלוק קודם מהרשימה למעלה). אם הניתוח דורש משתנה נגזר/מקובץ שלא קיים כעמודה (קבוצות גיל, ציון או מדד מחושב, משתני דמה) — צור אותו תחילה מ-VAR_n קיים (RECODE ... INTO / COMPUTE / COUNT) ואז השתמש בו. לעולם אל תניח שמשתנה נגזר כבר קיים.'
    : 'משתני רפאים — אסור: כל משתנה שאתה מזכיר חייב להיות VAR_n קיים, או שם שכבר נוצר בבלוק קודם (מהרשימה "משתנים שכבר נוצרו" למעלה). שם שמופיע ברשימה הזו נחשב קיים בוודאות — השתמש בו ככתבו ואל תחזיר עבורו * ERROR:. רק אם הניתוח דורש משתנה נגזר/מקובץ שלא קיים כעמודה ולא מופיע ברשימת המשתנים שכבר נוצרו (קבוצות גיל, ציון או מדד מחושב, דמיז) — אתה במצב analysis-only ואסור לך ליצור אותו כאן: החזר שורת * ERROR: שמסבירה איזה משתנה צריך להיווצר תחילה. לעולם אל תניח שמשתנה נגזר כבר קיים אם אינו ברשימה.';

  const methodologyRules = [
    '— מתודולוגיה (בנה את הניתוח לפי role של כל משתנה, לא רק לפי type):',
    'role=continuous = משתנה רציף (מתאים כ-DV/IV ברגרסיה, במתאם Pearson, וכמשתנה תלוי ב-t-test/ANOVA). role=categorical או role=categorical-code = משתנה קבוצתי/קטגוריאלי: מספר שמייצג קטגוריה (1=זכר 2=נקבה; אזור 1..5; השכלה 1..4) הוא קטגוריאלי גם אם type=numeric — אל תתייחס אליו כרציף.',
    'role=categorical-code = מספר שמייצג קטגוריה נומינלית (מגדר/אזור/השכלה) — קטגוריאלי לכל דבר: גורם ב-ANOVA/chi-square, ודורש dummy-coding ברגרסיה. role=likert = פריט דירוג בסולם (טווח 1..5/1..7) — מותר להתייחס אליו כרציף (ממוצע/מתאם/רגרסיה/t-test) או לאחד כמה פריטים למדד; פריט בודד אפשר גם Spearman. role=identifier = מזהה (ת"ז/מספר נבדק) — לעולם אל תכליל אותו כמשתנה בניתוח.',
    'התאמת פרוצדורה לרמות המדידה: T-TEST = DV רציף + משתנה קיבוץ עם 2 קטגוריות בדיוק; ONEWAY/ANOVA = DV רציף + גורם עם ≥3 קטגוריות; CORRELATIONS (Pearson) = שני משתנים רציפים; CROSSTABS/chi-square = שני משתנים קטגוריאליים; רגרסיה ליניארית = DV רציף.',
    'גרפים/תרשימים: אם הבקשה מבקשת גרף/תרשים/היסטוגרמה/"הצגה גרפית"/chart/plot — החזר פקודת תצוגה גרפית אמיתית, לא רק סטטיסטיקה. התאם לרמת המדידה: משתנה רציף → GRAPH /HISTOGRAM=VAR_n. או EXAMINE VARIABLES=VAR_n /PLOT=BOXPLOT /STATISTICS=NONE.; משתנה קטגוריאלי → GRAPH /BAR(SIMPLE)=COUNT BY VAR_n. או GRAPH /PIE=COUNT BY VAR_n.; שני משתנים רציפים לבדיקת קשר → GRAPH /SCATTERPLOT(BIVAR)=VAR_x WITH VAR_y.. פקודות GRAPH ו-EXAMINE /PLOT ו-FREQUENCIES /HISTOGRAM /BARCHART הן תצוגה בלבד ומותרות גם במצב analysis-only (הן אינן transformation).',
    'בדיקות הנחות: כשהבקשה כוללת מבחן היסק וגם בדיקת הנחות — הוסף את הבדיקה עם הפקודה. נורמליות: EXAMINE VARIABLES=VAR_n /PLOT NPPLOT BOXPLOT /STATISTICS DESCRIPTIVES. (Shapiro-Wilk/K-S בפלט). שוויון שונויות: ב-T-TEST טבלת Levene אוטומטית; ב-ONEWAY הוסף /STATISTICS=HOMOGENEITY. ברגרסיה הוסף /STATISTICS COLLIN TOL ו-/RESIDUALS. פקודות אלה מותרות גם ב-analysis-only.',
    'רגרסיה (REGRESSION /DEPENDENT): כל מנבא חייב להיות רציף או דמה (0/1). מנבא קטגוריאלי עם 2 קטגוריות אפשר להכניס גולמי. מנבא קטגוריאלי עם ≥3 קטגוריות אסור להכניס גולמי כאילו רציף — או (א) צור k-1 משתני דמה (RECODE/COMPUTE) במצב prep ואז הרץ REGRESSION, או (ב) השתמש ב-UNIANOVA/GLM עם המשתנה הקטגוריאלי כ-factor אחרי BY ו-/DESIGN. אל תשתמש במשתנה קטגוריאלי או role=identifier כ-DV רציף של רגרסיה.',
    phantomRule,
  ];

  return [
    'אתה מחזיר SPSS syntax בלבד עבור SPSS Syntax Studio בתוך WordFlow.',
    'אסור להחזיר markdown, bullets, כותרות, הסברים חופשיים, או fences.',
    'מותר להחזיר רק פקודות SPSS ושורות comment של SPSS שמתחילות ב-* .',
    `העמודות (משתני המקור) המותרות היחידות הן: ${allowedTokens || 'none'}.`,
    ...modeRules,
    carriedNamesLine,
    ...methodologyRules,
    'כללי הרצה קשיחים ל-SPSS: כל פקודה חייבת להסתיים בנקודה אחת בלבד; כל subcommand מתחיל ב-/; אל תשתמש ב-; בתוך פקודות; אל תשתמש בפקודות פסאודו או בשמות תפריטים; אל תחזיר טקסט שאינו פקודת SPSS או comment שמתחיל ב-* .',
    'כשאתה יוצר syntax עבור כמה ניתוחים או מתקן master syntax קיים — החזר קוד מלא להרצה מלמעלה למטה, כולל כל שלבי ההכנה שהניתוחים תלויים בהם. אל תחזיר diff, patch, הוראות ידניות או "הוסף את השורה".',
    'בדוק תאימות פרוצדורה לפני ההחזרה: T-TEST חייב /GROUPS עם קודים קיימים; ONEWAY צריך /STATISTICS DESCRIPTIVES HOMOGENEITY כאשר בודקים הנחות; CROSSTABS עם /STATISTICS=CHISQ ו-/CELLS=COUNT ROW COLUMN; REGRESSION עם /DEPENDENT ו-/METHOD=ENTER; FREQUENCIES/DESCRIPTIVES עם רשימת משתנים אמיתית בלבד.',
    'אם חסר מידע כדי לבחור קוד קטגוריה, אל תנחש. השתמש רק ב-observedValues/valueLabels מה-metadata, או כתוב comment קצר שמסביר מה המשתמש צריך להשלים ידנית במקום לייצר קוד שגוי.',
    repairHint
      ? `ניסיון קודם ליצור syntax לבקשה הזו נחסם בגלל: "${String(repairHint).slice(0, 300)}". זוהי בקשה אמיתית ממטלת סטטיסטיקה שכבר אומתה מול הנתונים — ספק את ה-syntax הטוב ביותר שאפשר. אם נדרשת הכנת נתונים (חישוב ציון/מדד, היפוך פריטים, recode) — בצע אותה תחילה ואז את הניתוח. החזר * ERROR: רק אם זה באמת בלתי אפשרי עם המשתנים הקיימים, ואז נמק בקצרה.`
      : 'אם הבקשה לא תקפה מתודולוגית, החזר רק שורות comment שמתחילות ב-* ERROR:.',
    tutorMode
      ? 'Tutor mode פעיל: לפני הבלוק הוסף 1-2 שורות comment קצרות בעברית שמסבירות למה בחרת בפרוצדורה.'
      : 'Tutor mode כבוי: אל תוסיף comment אלא אם זו שגיאת * ERROR:.',
    'ה-metadata כולל את שמות המשתנים (name) וסטטיסטיקות סיכום, אבל לא את שורות הדאטה הגולמיות. השתמש בשמות כדי להבין את ההקשר, אבל בפלט עצמו כתוב אך ורק tokens מסוג VAR_n — לא את השמות.',
    'אם צריך literals מפורשים ב-/GROUPS, ב-BY(...), או ב-RECODE, השתמש רק ב-observedValues שסופקו במשתנים המתאימים. אם אין observedValues, אל תנחש literals.',
    'valueLabels=[קוד=תווית] במטא-דאטה = משמעות הקודים (1=זכר, 2=נקבה). השתמש בהם כדי לבחור את הקבוצות הנכונות ב-/GROUPS, לבחור reference category הגיונית כשיוצרים משתני דמה, ולכתוב comment קצר עם שם הקטגוריה כשעוזר. אל תמציא קודים שלא ב-observedValues/valueLabels.',
    isPrepMode
      ? 'אם משתנה מסומן suspectedUndeclaredMissing=[קודים] — אלה קודי sentinel (98/99/-9) שלא הוגדרו כ-missing ומזהמים את הסטטיסטיקה. במצב prep הוסף MISSING VALUES להגדרתם כ-user-missing לפני הניתוח. חשוב: SPSS מתיר לכל היותר 3 ערכים בדידים ב-MISSING VALUES — אם יש יותר משלושה קודים, השתמש בטווח. ה-metadata כבר נותן לך את הצורה החוקית המוכנה בשדה missingValuesSpec=(...) — העתק אותה בדיוק (למשל MISSING VALUES VAR_n (98 THRU 101).). declaredMissing=[...] כבר מטופל — אל תיגע בו.'
      : 'אם משתנה מסומן suspectedUndeclaredMissing=[קודים] — אלה קודי sentinel שלא הוגדרו כ-missing. במצב analysis-only אסור לך להריץ MISSING VALUES; ציין זאת ב-comment קצר (* הערה:) שממליץ להגדירם במצב הכנת נתונים. declaredMissing=[...] כבר מטופל.',
    'Metadata:',
    buildTokenizedMetadataLines(analysis),
  ].filter(Boolean).join('\n');
};

export const generateSpssSyntax = async ({ analysis = null, request = '', tutorMode = false, mode = 'analysis', extraAllowedNames = [], providerOverride = '', modelOverride = '', skipMethodologyGuard = false, repairHint = '' } = {}) => {
  if (!analysis || !Array.isArray(analysis.columns) || !analysis.columns.length) {
    return {
      ok: false,
      tokenizedRequest: '',
      rawSyntax: '',
      syntax: '',
      guidanceMessage: getGuardrailGuidanceMessage('Load a data file before generating syntax.'),
      providerId: '',
      model: '',
      source: 'guardrail',
    };
  }

  const cleanRequest = String(request || '').trim();
  const methodologyIssue = skipMethodologyGuard ? '' : detectMethodologyIssue(cleanRequest, analysis);
  if (methodologyIssue) {
    return {
      ok: false,
      tokenizedRequest: tokenizeSpssRequest(cleanRequest, analysis),
      rawSyntax: '',
      syntax: '',
      guidanceMessage: getGuardrailGuidanceMessage(methodologyIssue),
      providerId: '',
      model: '',
      source: 'guardrail',
    };
  }

  const tokenizedRequest = tokenizeSpssRequest(cleanRequest, analysis);
  const localFilterDisplaySyntax = buildLocalFilterDisplaySyntax({ request: cleanRequest, analysis, tutorMode });
  if (localFilterDisplaySyntax?.syntax) {
    const syntax = sanitizeSpssSyntax(localFilterDisplaySyntax.syntax, analysis);
    const guardrailHit = isGuardrailSyntaxResponse(syntax);
    return {
      ok: !guardrailHit,
      tokenizedRequest: localFilterDisplaySyntax.tokenizedRequest || tokenizedRequest,
      rawSyntax: localFilterDisplaySyntax.syntax,
      syntax: guardrailHit ? '' : syntax,
      guidanceMessage: guardrailHit ? getGuardrailGuidanceMessage(syntax) : '',
      providerId: '',
      model: '',
      source: guardrailHit ? 'guardrail' : 'local',
    };
  }

  const { chatWithActiveProvider, getProviderConfig, getFeatureProviderConfig } = await import('./aiService.js');
  const providerConfig = getProviderConfig();
  // An explicit on-page pick (studio model picker) wins over the feature config.
  const studioProvider = String(providerOverride || '').trim();
  const studioModel = String(modelOverride || '').trim();
  const feat = studioProvider ? null : getFeatureProviderConfig('spss', providerConfig);
  const effectiveConfig = feat?.config || providerConfig;
  const providerId = studioProvider || feat?.providerId || String(providerConfig?.active || '').trim();
  const providerModel = studioModel || feat?.model || (providerId && effectiveConfig?.[providerId]?.model
    ? String(effectiveConfig[providerId].model || '').trim()
    : '');

  const rawResponse = await chatWithActiveProvider(tokenizedRequest, '', buildSpssSystemPrompt({ analysis, tutorMode, mode, extraAllowedNames, repairHint }), {
    providerOverride: providerId || undefined,
    strictProviderOverride: Boolean(providerId),
    modelOverride: providerModel || undefined,
    ...(feat ? { providerConfigOverride: feat.config } : {}),
    skipAutomation: true,
    skipSkillSelection: true,
    skipMultiModel: true,
    strictFormatting: true,
    includeAppMemory: false,
    shouldPersistMemory: false,
    autoUseDefaultSkill: false,
    agentLabel: 'SPSS Syntax Studio',
    agentName: 'SPSS Syntax Studio',
  });

  const rawSyntax = typeof rawResponse === 'string'
    ? rawResponse
    : String(rawResponse?.text || '').trim();
  const syntax = sanitizeSpssSyntax(rawSyntax, analysis, { mode, extraAllowedNames });
  const guardrailHit = isGuardrailSyntaxResponse(syntax);

  return {
    ok: !guardrailHit,
    tokenizedRequest,
    rawSyntax,
    syntax: guardrailHit ? '' : syntax,
    guidanceMessage: guardrailHit ? getGuardrailGuidanceMessage(syntax) : '',
    providerId,
    model: providerModel,
    source: guardrailHit ? 'guardrail' : 'ai',
  };
};

// ---------------------------------------------------------------------------
// Real-SPSS-error repair loop. The studio cannot run SPSS, so the human is the
// compiler: they run the master syntax in SPSS, paste the Output back, and we
// parse the real Error/Warning blocks and ask the model to fix the syntax that
// produced them. Same VAR_n privacy model as everywhere else (syntax + the
// pasted error text are tokenized to VAR_n before leaving the device).
//
// SPSS Output diagnostic block (each line usually prefixed with '>'):
//   >Error # 4285 in column 23.  Text: gender
//   >An undefined variable name ...
//   >Execution of this command stops.
// Variants: ">Error # 1.  Command name: FREENCIES" (no column, names the command),
// warnings (">Warning # 206 ...") are NON-fatal — the command still ran, so we
// only repair them when they change result correctness.
// ---------------------------------------------------------------------------

const SPSS_DIAGNOSTIC_PATTERN = /(error|warning)\s*#\s*(\d+)/gi;

export const parseSpssOutputErrors = (output = '') => {
  const text = String(output || '').replace(/\r\n?/g, '\n');
  const anchors = [];
  SPSS_DIAGNOSTIC_PATTERN.lastIndex = 0;
  let match = SPSS_DIAGNOSTIC_PATTERN.exec(text);
  while (match) {
    anchors.push({ index: match.index, severity: match[1].toLowerCase(), number: Number(match[2]) });
    if (match[0].length === 0) SPSS_DIAGNOSTIC_PATTERN.lastIndex += 1;
    match = SPSS_DIAGNOSTIC_PATTERN.exec(text);
  }

  const diagnostics = anchors.map((anchor, i) => {
    const rawSegment = text.slice(anchor.index, i + 1 < anchors.length ? anchors[i + 1].index : undefined);
    // Drop the leading '>' line markers SPSS prints so the description reads clean.
    const segment = rawSegment.replace(/^[ \t]*>[ \t]?/gm, '').trim();
    const columnMatch = segment.match(/in column\s+(\d+)/i);
    const textMatch = segment.match(/Text:\s*(.+?)(?:\n|$)/i);
    const commandMatch = segment.match(/Command name:\s*([^\n.]+)/i);
    return {
      severity: anchor.severity === 'warning' ? 'warning' : 'error',
      number: anchor.number,
      column: columnMatch ? Number(columnMatch[1]) : null,
      offendingText: textMatch ? textMatch[1].trim() : '',
      command: commandMatch ? commandMatch[1].trim() : '',
      message: segment.slice(0, 600),
    };
  });

  const fatal = diagnostics.filter((entry) => entry.severity === 'error');
  const warnings = diagnostics.filter((entry) => entry.severity === 'warning');
  return { diagnostics, fatal, warnings, hasFatal: fatal.length > 0, hasWarnings: warnings.length > 0 };
};

// זיהוי "הרצה חלקית": SPSS מדווח undefined variable על משתנה שה-syntax עצמו יוצר
// (COMPUTE/RECODE INTO). זה לא באג בקוד — המשתמש הריץ רק חלק מהקוד או פתח מחדש את
// הנתונים, והמשתנים המחושבים (שחיים בזיכרון הסשן בלבד) נעלמו. במקרה כזה "תיקון"
// ע"י LLM רק מקלקל קוד תקין; הפתרון הוא הרצה מלאה מלמעלה למטה.
export const detectStaleSessionRun = ({ syntax = '', output = '' } = {}) => {
  const none = { stale: false, variables: [], advice: '' };
  const cleanSyntax = String(syntax || '').trim();
  if (!cleanSyntax) return none;
  const parsed = parseSpssOutputErrors(output);
  if (!parsed.diagnostics.length) return none;

  const declared = new Set(
    Array.from(collectDeclaredTargetNames(getSpssCommands(stripSpssCommentLines(cleanSyntax))))
      .map((name) => name.toLowerCase()),
  );
  if (!declared.size) return none;

  // offendingText מגיע לעיתים כ-"VarName Command: REGRESSION" בשורה אחת — לכן
  // התאמה לפי טוקנים ולא לפי השורה כולה.
  const staleVariables = Array.from(new Set(
    parsed.diagnostics
      .filter((entry) => /undefined variable name|scratch or system variable/i.test(entry.message))
      .flatMap((entry) => String(entry.offendingText || '').split(/[^A-Za-z0-9_@#$.]+/))
      .map((token) => token.trim())
      .filter((token) => token && declared.has(token.toLowerCase())),
  ));
  if (!staleVariables.length) return none;

  return {
    stale: true,
    variables: staleVariables,
    advice: `SPSS מדווח שהמשתנים ${staleVariables.join(', ')} לא קיימים — אבל הקוד עצמו יוצר אותם בשלב ההכנה. `
      + 'זה קורה כשמריצים רק חלק מהקוד או כשקובץ הנתונים נפתח מחדש: משתנים מחושבים חיים רק בזיכרון של הסשן. '
      + 'הקוד תקין ואין מה לתקן בו — פתח את קובץ הנתונים המקורי, בחר את כל הקוד (Ctrl+A) והרץ הכול יחד מלמעלה למטה (Run → Selection).',
  };
};

const buildSpssErrorDigest = (parsed = null, analysis = null) => {
  const formatEntry = (entry) => {
    const parts = [`${entry.severity === 'warning' ? 'אזהרה' : 'שגיאה'} #${entry.number}`];
    if (entry.command) parts.push(`פקודה: ${tokenizeSpssRequest(entry.command, analysis)}`);
    if (entry.column !== null) parts.push(`עמודה ${entry.column}`);
    if (entry.offendingText) parts.push(`טקסט: ${tokenizeSpssRequest(entry.offendingText, analysis)}`);
    const body = tokenizeSpssRequest(entry.message, analysis).replace(/\n/g, '\n  ');
    return `- ${parts.join(' · ')}\n  ${body}`;
  };
  const lines = [];
  if (parsed?.fatal?.length) {
    lines.push('שגיאות (fatal — הפקודה לא רצה, חובה לתקן):');
    parsed.fatal.forEach((entry) => lines.push(formatEntry(entry)));
  }
  if (parsed?.warnings?.length) {
    lines.push('אזהרות (הפקודה רצה בכל זאת — תקן רק אם הן משנות את נכונות התוצאה):');
    parsed.warnings.forEach((entry) => lines.push(formatEntry(entry)));
  }
  return lines.join('\n');
};

const buildSuspectedMissingDigest = (analysis = null) => {
  const columns = Array.isArray(analysis?.columns) ? analysis.columns : [];
  const flagged = columns
    .filter((column) => Array.isArray(column?.suspectedMissingCodes) && column.suspectedMissingCodes.length)
    .map((column) => {
      const codes = column.suspectedMissingCodes.map((value) => formatNumericLiteral(value)).join(', ');
      const legalSpec = formatSpssMissingValueSpec(column.suspectedMissingCodes);
      const range = column.numericStats && column.numericStats.min !== null && column.numericStats.max !== null
        ? `; observed range ${formatNumericLiteral(column.numericStats.min)}..${formatNumericLiteral(column.numericStats.max)}`
        : '';
      return `- ${column.token}${column.originalName ? ` (${column.originalName})` : ''}: suspected missing codes [${codes}] → MISSING VALUES spec (${legalSpec})${range}`;
    });
  return flagged.length ? flagged.join('\n') : '';
};

const buildSpssOutputPreflightDigest = ({ output = '', analysis = null } = {}) => {
  const parsedErrors = parseSpssOutputErrors(output);
  const lines = [];
  if (parsedErrors.diagnostics.length) {
    lines.push('SPSS diagnostics detected in pasted output:');
    lines.push(buildSpssErrorDigest(parsedErrors, analysis));
    lines.push('Interpretation rule: if fatal Errors are present, do not interpret downstream tables as final results until the syntax is fixed and rerun.');
  }

  const missingDigest = buildSuspectedMissingDigest(analysis);
  if (missingDigest) {
    lines.push('Dataset-level missing-value risk from metadata:');
    lines.push(missingDigest);
    lines.push('Interpretation rule: if pasted descriptive or inferential output uses any flagged variable and shows implausible means, SDs, min/max, correlations, t/F/regression estimates, warn that results may be contaminated by undeclared missing codes and should be rerun after MISSING VALUES.');
  }

  return lines.join('\n');
};

const buildSpssRepairSystemPrompt = ({ analysis = null } = {}) => {
  const allowedTokens = Array.isArray(analysis?.columns) ? analysis.columns.map((column) => column.token).join(', ') : '';
  return [
    'אתה מומחה SPSS שמתקן syntax שמשתמש הריץ ב-SPSS וקיבל עליו שגיאות בחלון ה-Output.',
    'קיבלת את ה-syntax המקורי ואת הודעות השגיאה/אזהרה המדויקות מ-SPSS. תקן את ה-syntax כך שירוץ נקי.',
    'תקן מינימלית: שמר על מבנה הניתוח ועל הכוונה המקורית. שנה אך ורק את מה שגורם לשגיאה (נקודה חסרה, subcommand שגוי, שם משתנה לא תקף, סדר פקודות שגוי). אל תכתוב מחדש ניתוח שכבר תקין.',
    'הבחנה קריטית: Error = פטאלי, הפקודה לא רצה — חובה לתקן. Warning = הפקודה רצה בכל זאת — תקן רק אם האזהרה משנה את נכונות התוצאה (למשל ערכי missing שמזהמים סטטיסטיקה), אחרת השאר כמו שהיא.',
    'Error #1 ("first word in the line is not recognized as a command") נגרם כמעט תמיד מנקודה (.) חסרה בסוף הפקודה ה-קודמת — בדוק את הפקודה שלפני שורת השגיאה, לא רק את השורה שצוינה.',
    'כל פקודת SPSS חייבת להסתיים בנקודה (.). כל subcommand מתחיל ב-/.',
    `העמודות (משתני המקור) המותרות היחידות הן: ${allowedTokens || 'none'}. השתמש אך ורק ב-tokens מסוג VAR_n — לא בשמות אמיתיים. אם SPSS דיווח על "undefined variable", מפה אותו ל-VAR_n הנכון לפי ה-metadata, או הסר אותו אם אין התאמה אמיתית.`,
    'אם נדרש משתנה נגזר שלא קיים (קבוצות גיל, מדד מחושב, משתני דמה) — צור אותו תחילה (COMPUTE / RECODE ... INTO / COUNT) ואז השתמש בו, והוסף EXECUTE. אחרי transformation.',
    'אל תמציא קודים או literals שלא מופיעים ב-observedValues / valueLabels של המשתנה.',
    'החזר אך ורק את ה-syntax המלא והמתוקן — בלי markdown, fences, כותרות או הסברים חופשיים. מותר רק שורות comment של SPSS שמתחילות ב-* .',
    'אם אי אפשר לתקן עם המשתנים הקיימים, החזר רק שורת * ERROR: עם הסבר קצר בעברית.',
    'ה-metadata כולל את שמות המשתנים וסטטיסטיקות סיכום אך לא את שורות הדאטה הגולמיות. בפלט עצמו כתוב אך ורק tokens מסוג VAR_n.',
    'Metadata:',
    buildTokenizedMetadataLines(analysis),
  ].filter(Boolean).join('\n');
};

export const repairSpssSyntaxFromError = async ({ analysis = null, priorSyntax = '', output = '', providerOverride = '', modelOverride = '' } = {}) => {
  if (!analysis || !Array.isArray(analysis.columns) || !analysis.columns.length) {
    return { ok: false, syntax: '', rawSyntax: '', parsed: null, guidanceMessage: '', error: 'טען קובץ נתונים לפני תיקון syntax.', providerId: '', model: '' };
  }
  const cleanSyntax = String(priorSyntax || '').trim();
  if (!cleanSyntax) {
    return { ok: false, syntax: '', rawSyntax: '', parsed: null, guidanceMessage: '', error: 'אין syntax לתקן — צור קוד קודם.', providerId: '', model: '' };
  }
  const parsed = parseSpssOutputErrors(output);
  if (!parsed.diagnostics.length) {
    return { ok: false, syntax: '', rawSyntax: '', parsed, guidanceMessage: '', error: 'לא זוהו שגיאות או אזהרות SPSS בטקסט שהודבק. ודא שהדבקת את הודעת השגיאה (Error # / Warning #) מחלון ה-Output.', providerId: '', model: '' };
  }

  // הרצה חלקית ≠ באג בקוד: אל תשלח ל-LLM "לתקן" קוד תקין — החזר הנחיית הרצה מלאה.
  const staleRun = detectStaleSessionRun({ syntax: cleanSyntax, output });
  if (staleRun.stale) {
    return { ok: false, syntax: '', rawSyntax: '', parsed, guidanceMessage: staleRun.advice, error: '', providerId: '', model: '' };
  }

  const tokenizedSyntax = tokenizeSpssRequest(cleanSyntax, analysis);
  const userMessage = [
    'ה-syntax המקורי שהורץ ב-SPSS:',
    tokenizedSyntax,
    '',
    'הודעות מ-SPSS Output:',
    buildSpssErrorDigest(parsed, analysis),
  ].join('\n');

  const { chatWithActiveProvider, getProviderConfig, getFeatureProviderConfig } = await import('./aiService.js');
  const providerConfig = getProviderConfig();
  const studioProvider = String(providerOverride || '').trim();
  const studioModel = String(modelOverride || '').trim();
  const feat = studioProvider ? null : getFeatureProviderConfig('spss', providerConfig);
  const effectiveConfig = feat?.config || providerConfig;
  const providerId = studioProvider || feat?.providerId || String(providerConfig?.active || '').trim();
  const providerModel = studioModel || feat?.model || (providerId && effectiveConfig?.[providerId]?.model
    ? String(effectiveConfig[providerId].model || '').trim()
    : '');

  const rawResponse = await chatWithActiveProvider(userMessage, '', buildSpssRepairSystemPrompt({ analysis }), {
    providerOverride: providerId || undefined,
    strictProviderOverride: Boolean(providerId),
    modelOverride: providerModel || undefined,
    ...(feat ? { providerConfigOverride: feat.config } : {}),
    skipAutomation: true,
    skipSkillSelection: true,
    skipMultiModel: true,
    strictFormatting: true,
    includeAppMemory: false,
    shouldPersistMemory: false,
    autoUseDefaultSkill: false,
    agentLabel: 'SPSS Syntax Repair',
    agentName: 'SPSS Syntax Repair',
  });

  const rawSyntax = typeof rawResponse === 'string' ? rawResponse : String(rawResponse?.text || '').trim();
  // Repair runs in prep mode: the master file legitimately contains data-prep
  // commands, and a real fix may need to create a missing derived variable.
  const syntax = sanitizeSpssSyntax(rawSyntax, analysis, { mode: 'prep' });
  const guardrailHit = isGuardrailSyntaxResponse(syntax);
  return {
    ok: !guardrailHit,
    syntax: guardrailHit ? '' : syntax,
    rawSyntax,
    parsed,
    guidanceMessage: guardrailHit ? getGuardrailGuidanceMessage(syntax) : '',
    error: guardrailHit ? getGuardrailGuidanceMessage(syntax) : '',
    providerId,
    model: providerModel,
  };
};

// ---------------------------------------------------------------------------
// Guidance / tutoring layer: free-text Hebrew help (how-to, GUI menu steps,
// procedure choice, output interpretation). Uses the SAME privacy model as
// syntax generation — the request, history and pasted output are tokenized to
// VAR_n before leaving the device, and VAR_n is restored to safe variable
// names in the answer shown to the user.
// ---------------------------------------------------------------------------

const MAX_GUIDANCE_HISTORY_TURNS = 8;
const MAX_GUIDANCE_OUTPUT_CHARS = 8000;

const resolveActiveProviderMeta = (providerConfig = null) => {
  const providerId = String(providerConfig?.active || '').trim();
  const model = providerId && providerConfig?.[providerId]?.model
    ? String(providerConfig[providerId].model || '').trim()
    : '';
  return { providerId, model };
};

const buildGuidanceMetadataBlock = (analysis = null) => {
  const lines = buildTokenizedMetadataLines(analysis);
  return lines
    ? ['Metadata (variable names + summary stats, no raw data rows):', lines].join('\n')
    : 'אין dataset טעון כרגע.';
};

const renderTokenizedHistory = (history = [], analysis = null) => {
  const safeHistory = Array.isArray(history) ? history.slice(-MAX_GUIDANCE_HISTORY_TURNS) : [];
  return safeHistory
    .map((turn) => {
      const role = turn?.role === 'assistant' ? 'assistant' : 'user';
      const text = tokenizeSpssRequest(String(turn?.text || '').trim(), analysis);
      return text ? `${role}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n');
};

const SPSS_GUIDANCE_BASE_RULES = [
  'אתה מדריך SPSS מומחה בתוך WordFlow, עונה בעברית ברורה ומעשית למשתמש ישראלי (אקדמיה/מחקר).',
  'כשרלוונטי, בנה את התשובה מהחלקים: (1) מתי ולמה משתמשים בפרוצדורה + הנחות (assumptions) שכדאי לבדוק; (2) מסלול תפריטים ב-SPSS: Analyze → ... עם שמות המסכים והשדות; (3) ה-syntax המדויק להדבקה; (4) איך לקרוא את הטבלאות המרכזיות בפלט ואיך לדווח ב-APA.',
  'אם השאלה צרה (למשל רק "איך עושים X בתפריט") — ענה ממוקד, בלי למלא את כל החלקים.',
  'מותר markdown: כותרות קצרות, רשימות, ובלוקי קוד ל-syntax.',
  'הסתמך רק על המשתנים שב-metadata. אל תמציא משתנים, ואל תטען שיש לך גישה לשורות הדאטה הגולמיות.',
  'אם המשתמש מבקש החלטה סטטיסטית לא תקפה, הסבר בעדינות למה והצע חלופה נכונה.',
];

const buildSpssGuidanceSystemPrompt = ({ analysis = null, mode = 'analysis', history = [] } = {}) => {
  const historyBlock = renderTokenizedHistory(history, analysis);
  return [
    ...SPSS_GUIDANCE_BASE_RULES,
    mode === 'prep'
      ? 'המשתמש נמצא במצב הכנת דאטה — אפשר וצריך להציע גם פעולות transformation (COMPUTE, RECODE, בניית סולמות, Cronbach alpha, טיפול בחסרים).'
      : 'המשתמש נמצא במצב ניתוח — התמקד בפרוצדורות ניתוח לקריאה בלבד, אבל אם נדרשת הכנת דאטה ציין זאת והצע לעבור למצב הכנת דאטה.',
    buildGuidanceMetadataBlock(analysis),
    historyBlock ? `שיחה עד כה (tokenized):\n${historyBlock}` : '',
  ].filter(Boolean).join('\n\n');
};

const callGuidanceProvider = async ({ tokenizedMessage = '', systemPrompt = '', agentName = 'SPSS Tutor', providerOverride = '', modelOverride = '' } = {}) => {
  const { chatWithActiveProvider, getProviderConfig, getFeatureProviderConfig } = await import('./aiService.js');
  const providerConfig = getProviderConfig();
  // An explicit on-page pick (studio model picker) wins over the feature config.
  const studioProvider = String(providerOverride || '').trim();
  const studioModel = String(modelOverride || '').trim();
  const feat = studioProvider ? null : getFeatureProviderConfig('spss', providerConfig);
  const resolved = feat
    ? { providerId: feat.providerId, model: feat.model }
    : resolveActiveProviderMeta(providerConfig);
  const providerId = studioProvider || resolved.providerId;
  const model = studioModel || resolved.model;

  const rawResponse = await chatWithActiveProvider(tokenizedMessage, '', systemPrompt, {
    providerOverride: providerId || undefined,
    strictProviderOverride: Boolean(providerId),
    modelOverride: model || undefined,
    ...(feat ? { providerConfigOverride: feat.config } : {}),
    skipAutomation: true,
    skipSkillSelection: true,
    skipMultiModel: true,
    includeAppMemory: false,
    shouldPersistMemory: false,
    autoUseDefaultSkill: false,
    agentLabel: agentName,
    agentName,
  });

  const text = typeof rawResponse === 'string' ? rawResponse : String(rawResponse?.text || '').trim();
  return { text, providerId, model };
};

export const runSpssGuidance = async ({ analysis = null, question = '', history = [], mode = 'analysis', draftText = '', providerOverride = '', modelOverride = '' } = {}) => {
  const cleanQuestion = String(question || '').trim();
  if (!cleanQuestion) {
    return { ok: false, answer: '', providerId: '', model: '', error: 'כתוב שאלה כדי לקבל הדרכה.' };
  }

  try {
    const tokenizedQuestion = tokenizeSpssRequest(cleanQuestion, analysis);
    const tokenizedDraft = buildDraftContextBlock(draftText, analysis);
    const systemPrompt = buildSpssGuidanceSystemPrompt({ analysis, mode, history });
    const tokenizedMessage = tokenizedDraft
      ? `הטיוטה הקיימת של העבודה (להקשר וסגנון בלבד):\n${tokenizedDraft}\n\nהשאלה:\n${tokenizedQuestion}`
      : tokenizedQuestion;
    const { text, providerId, model } = await callGuidanceProvider({
      tokenizedMessage,
      systemPrompt,
      agentName: 'SPSS Tutor',
      providerOverride,
      modelOverride,
    });

    const answer = restoreColumnTokens(text, analysis) || text;
    if (!answer.trim()) {
      return { ok: false, answer: '', providerId, model, error: 'המודל לא החזיר תשובה. נסה לנסח מחדש.' };
    }
    return { ok: true, answer: answer.trim(), providerId, model, error: '' };
  } catch (error) {
    return {
      ok: false,
      answer: '',
      providerId: '',
      model: '',
      error: error instanceof Error ? error.message : 'קבלת ההדרכה נכשלה.',
    };
  }
};

export const interpretSpssOutput = async ({ analysis = null, output = '', question = '', draftText = '', providerOverride = '', modelOverride = '' } = {}) => {
  const cleanOutput = String(output || '').trim().slice(0, MAX_GUIDANCE_OUTPUT_CHARS);
  if (!cleanOutput) {
    return { ok: false, answer: '', providerId: '', model: '', error: 'הדבק את הפלט מ-SPSS כדי לקבל פירוש.' };
  }

  try {
    const tokenizedOutput = tokenizeSpssRequest(cleanOutput, analysis);
    const tokenizedQuestion = tokenizeSpssRequest(String(question || '').trim(), analysis);
    const tokenizedDraft = buildDraftContextBlock(draftText, analysis);
    const preflightDigest = buildSpssOutputPreflightDigest({ output: cleanOutput, analysis });
    const tokenizedPreflightDigest = tokenizeSpssRequest(preflightDigest, analysis);

    const systemPrompt = [
      'אתה מומחה SPSS ש-מסביר בעברית ברורה פלט (Output) שמשתמש הדביק.',
      'הסבר: מה הטבלה מציגה, מה הערכים המרכזיים (למשל t, F, χ², r, p, df, גודל אפקט), האם התוצאה מובהקת ומה המשמעות המהותית, ואזהרות על הפרת הנחות אם נראות.',
      'לפני כל פירוש, קרא את "בדיקת WordFlow לפני פירוש" אם צורפה. אם היא מזהה Error פטאלי, פתח בכך שההרצה לא תקינה ושאין לפרש תוצאות המשך כתוצאות סופיות. אם היא מזהה missing חשוד, הצלֵב זאת מול הפלט והזהר לפני ניסוח APA.',
      'בדיקת שפיות חובה לפני שאתה מסביר: ודא שהסטטיסטיקה התיאורית הגיונית ביחס לסוג המשתנה. דגל אדום קלאסי — סטיית תקן (SD) גדולה מהטווח הסביר של הסולם, או ממוצע/מינימום/מקסימום מחוץ לסולם הצפוי (למשל M≈9 או SD≈20 בסולם 0–10, או SD שגדול מהממוצע במשתנה חסום). זה כמעט תמיד אומר ערכי missing לא-מוגדרים (קודים כמו 98/99) שנכנסים לחישוב ומנפחים את התוצאות. אם יש metadata — הצלב מול ה-range וה-observedValues של המשתנה (קודים כמו 98/99 = חשד מיידי).',
      'ה-metadata כבר עשה חלק מהעבודה: שדה suspectedUndeclaredMissing=[...] במשתנה = WordFlow זיהה קוד sentinel (98/99/-9) שלא הוגדר כ-missing וכנראה מזהם את הסטטיסטיקה — התייחס לזה כדגל אדום ודאי. שדה declaredMissing=[...] = הקודים האלה כבר מוגדרים כ-user-missing ו-SPSS מתעלם מהם, אז הם תקינים.',
      'כשאתה מזהה דגל אדום כזה: פתח את הפירוש באזהרה מפורשת, הסבר שכל התוצאות שמבוססות על הממוצעים האלה (t-test/ANOVA/מתאם/רגרסיה) אינן אמינות עד שמגדירים את הקודים כ-user-missing (MISSING VALUES או Variable View → Missing) ומריצים מחדש, ואל תדווח את הערכים המזוהמים ב-APA כאילו הם תקינים.',
      'הפלט עשוי לכלול כמה ניתוחים/טבלאות. פרש כל ניתוח בנפרד: לכל אחד פתח בכותרת ### עם שם הניתוח, כתוב 2-3 שורות הסבר מהותי, וסיים בשורה מודגשת "**ניסוח APA:**" עם המשפט המוכן לשיבוץ (עם הערכים t/F/χ²/r/p/df וגודל אפקט מנוסחים נכון, קורסיב לסמלים סטטיסטיים ופסיק עשרוני לפי הצורך).',
      'אל תמציא מספרים שלא מופיעים בפלט. אם משהו חסר כדי להסיק, אמור זאת.',
      'מותר markdown.',
      tokenizedDraft ? 'צורפה טיוטה קיימת של העבודה — התאם את הניסוח למינוח ולסגנון שבה כדי שאפשר יהיה לשבץ את הפירוש ישירות.' : '',
      buildGuidanceMetadataBlock(analysis),
    ].filter(Boolean).join('\n\n');

    const message = [
      tokenizedDraft ? `הטיוטה הקיימת של העבודה (להקשר וסגנון בלבד):\n${tokenizedDraft}` : '',
      tokenizedQuestion ? `שאלה ממוקדת: ${tokenizedQuestion}` : '',
      tokenizedPreflightDigest ? `בדיקת WordFlow לפני פירוש:\n${tokenizedPreflightDigest}` : '',
      'פלט SPSS להסבר:',
      tokenizedOutput,
    ].filter(Boolean).join('\n\n');

    const { text, providerId, model } = await callGuidanceProvider({
      tokenizedMessage: message,
      systemPrompt,
      agentName: 'SPSS Output Reader',
      providerOverride,
      modelOverride,
    });

    const answer = restoreColumnTokens(text, analysis) || text;
    if (!answer.trim()) {
      return { ok: false, answer: '', providerId, model, error: 'המודל לא החזיר פירוש. נסה להדביק טבלה שלמה יותר.' };
    }
    return { ok: true, answer: answer.trim(), providerId, model, error: '' };
  } catch (error) {
    return {
      ok: false,
      answer: '',
      providerId: '',
      model: '',
      error: error instanceof Error ? error.message : 'פירוש הפלט נכשל.',
    };
  }
};

// ---------------------------------------------------------------------------
// Literature review + reference list. The assignment (sections א+ד) needs a
// short lit review with a properly-cited reference list — separate from the
// statistics. Reuses the verified-sources pipeline (retrieveSources) so every
// reference is a real, live-checked academic source (never a hallucinated one),
// then grounds a short Hebrew review strictly on those sources.
// ---------------------------------------------------------------------------

const formatAcademicReference = (source = {}) => {
  const title = String(source.title || '').trim() || 'מקור אקדמי';
  const details = String(source.summary || '').trim()
    || (Array.isArray(source.authors) && source.authors.length ? source.authors.join(', ') : '');
  const link = String(source.finalUrl || source.url || '').trim();
  const doi = String(source.doi || '').trim();
  const parts = [title];
  if (details) parts.push(details);
  if (doi) parts.push(`DOI: ${doi}`);
  else if (link) parts.push(link);
  return parts.join('. ');
};

export const buildLiteratureReview = async ({ topic = '', count = 5, providerOverride = '', modelOverride = '' } = {}) => {
  const cleanTopic = String(topic || '').trim();
  if (!cleanTopic) {
    return { ok: false, review: '', references: [], sources: [], providerId: '', model: '', error: 'ציין את נושא המחקר כדי לאתר מקורות.' };
  }
  try {
    const { retrieveSources } = await import('./sourceRetrieval/index.js');
    const { getProviderConfig } = await import('./aiService.js');
    const cfg = getProviderConfig();
    const retrieval = await retrieveSources({ query: cleanTopic, kind: 'academic', count: Math.max(3, Math.min(8, Number(count) || 5)), cfg });
    const sources = Array.isArray(retrieval?.sources) ? retrieval.sources.filter(Boolean) : [];
    if (!retrieval?.ok || !sources.length) {
      return {
        ok: false,
        review: '',
        references: [],
        sources: [],
        providerId: '',
        model: '',
        error: 'לא נמצאו מקורות אקדמיים מאומתים לנושא. נסח את הנושא באנגלית/מדויק יותר, או ודא ש-SerpAPI (Google Scholar) מוגדר בהגדרות.',
      };
    }

    const references = sources.map((source) => formatAcademicReference(source));
    const sourceDigest = sources
      .map((source, index) => {
        const link = String(source.finalUrl || source.url || '').trim();
        const snippet = String(source.snippet || source.summary || '').trim().slice(0, 400);
        return `[${index + 1}] ${String(source.title || '').trim()}${link ? ` (${link})` : ''}${snippet ? `\n    ${snippet}` : ''}`;
      })
      .join('\n');

    const systemPrompt = [
      'אתה כותב סקירת ספרות קצרה בעברית אקדמית לעבודת מחקר של סטודנט.',
      'קיבלת נושא מחקר ורשימת מקורות אקדמיים אמיתיים שכבר אומתו (כותרת + תקציר + קישור).',
      'כתוב פסקה או שתיים (עד ~200 מילים) שמסכמות את מה שעולה מהמקורות האלה ומובילות לשאלת המחקר.',
      'הסתמך אך ורק על המקורות שסופקו. אל תמציא ממצאים, שמות חוקרים, שנים או נתונים שלא מופיעים במקורות. אם המקורות דלים — כתוב סקירה כללית וזהירה בהתאם, ואל תשלים בהמצאה.',
      'כשאתה מתייחס למקור, סמן אותו במספר בסוגריים לפי הרשימה (למשל [1], [3]).',
      'החזר טקסט בלבד (מותר פסקאות), בלי כותרות markdown ובלי רשימת מקורות (היא תיווסף בנפרד).',
    ].join('\n');

    const { text, providerId, model } = await callGuidanceProvider({
      tokenizedMessage: `נושא המחקר: ${cleanTopic}\n\nמקורות מאומתים:\n${sourceDigest}`,
      systemPrompt,
      agentName: 'SPSS Literature Review',
      providerOverride,
      modelOverride,
    });

    return {
      ok: true,
      review: String(text || '').trim(),
      references,
      sources,
      providerId,
      model,
      error: '',
    };
  } catch (error) {
    return { ok: false, review: '', references: [], sources: [], providerId: '', model: '', error: error instanceof Error ? error.message : 'בניית סקירת הספרות נכשלה.' };
  }
};

// ---------------------------------------------------------------------------
// Project flow layer: the guided "final assignment" wizard. Same privacy model
// as the rest of the service (tokenize VAR_n out, restore names back in).
//   1. analyzeSpssAssignment  — read the task + dataset → structured plan.
//   4. critiqueSpssRun         — check pasted output against the task → fixes.
//   5. buildSpssFindingsChapter — assemble a Hebrew findings chapter (HTML).
// ---------------------------------------------------------------------------

const MAX_ASSIGNMENT_CHARS = 12000;
const MAX_PROJECT_SYNTAX_CHARS = 12000;
const MAX_DRAFT_CHARS = 60000;
const DRAFT_MIDDLE_OMITTED_MARKER = '\n\n... [קטע אמצעי הושמט] ...\n\n';

// טיוטה קיימת שהמשתמש העלה (עבודה בכתיבה) — מוזרמת כהקשר ל-AI, מטוקנת כמו כל
// טקסט אחר כדי לשמור על מודל הפרטיות (שמות עמודות → VAR_n).
// טיוטות ארוכות (עד MAX_DRAFT_CHARS) נדגמות ראש+זנב (70/30) במקום slice מהראש
// בלבד — כותב הפרק צריך לראות גם איך העבודה מסתיימת, לא רק איך היא נפתחת.
const buildDraftContextBlock = (draftText = '', analysis = null) => {
  const raw = String(draftText || '').trim();
  if (!raw) return '';
  let clean = raw;
  if (raw.length > MAX_DRAFT_CHARS) {
    const headChars = Math.round(MAX_DRAFT_CHARS * 0.7);
    const tailChars = MAX_DRAFT_CHARS - headChars;
    clean = `${raw.slice(0, headChars)}${DRAFT_MIDDLE_OMITTED_MARKER}${raw.slice(-tailChars)}`;
  }
  return tokenizeSpssRequest(clean, analysis);
};

// Pull the first balanced JSON object/array out of a model response that may be
// wrapped in ```json fences or surrounded by prose.
const extractJsonPayload = (text = '') => {
  const cleaned = String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const firstBrace = cleaned.search(/[[{]/);
  if (firstBrace < 0) return null;
  const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (lastBrace <= firstBrace) return null;
  const slice = cleaned.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
};

// Recursively restore VAR_n tokens to safe variable names in every string field.
const restoreTokensDeep = (value, analysis) => {
  if (typeof value === 'string') return restoreColumnTokens(value, analysis) || value;
  if (Array.isArray(value)) return value.map((item) => restoreTokensDeep(item, analysis));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, restoreTokensDeep(val, analysis)]));
  }
  return value;
};

const DELIVERABLE_VALUES = new Set(['findings-chapter', 'interpretation', 'code']);

const normalizeAssignmentProfile = (raw = {}, analysis = null) => {
  const restored = restoreTokensDeep(raw, analysis) || {};
  const rawAnalyses = Array.isArray(restored.analyses) ? restored.analyses : [];
  const analyses = rawAnalyses
    .map((entry, index) => ({
      id: `analysis-${index + 1}`,
      label: String(entry?.label || '').trim() || `ניתוח ${index + 1}`,
      method: String(entry?.method || '').trim(),
      variables: Array.isArray(entry?.variables)
        ? entry.variables.map((name) => String(name || '').trim()).filter(Boolean)
        : [],
      request: String(entry?.request || '').trim(),
      rationale: String(entry?.rationale || '').trim(),
    }))
    .filter((entry) => entry.request || entry.label);

  const deliverable = DELIVERABLE_VALUES.has(String(restored.deliverable || '').trim())
    ? String(restored.deliverable).trim()
    : 'findings-chapter';

  return {
    summary: String(restored.summary || '').trim(),
    deliverable,
    needsExplanation: restored.needsExplanation !== false,
    analyses,
    notes: String(restored.notes || '').trim(),
  };
};

// Deterministic self-check over the planner's output (Batch F, zero AI cost): resolve
// every analysis's variables to real columns and flag method↔measurement-level
// mismatches the model may have made. Warnings are advisory (appended to notes), never
// a hard fail — the user can still run, but is told what looks off.
const MODELING_CONTINUOUS_ROLES = new Set(['continuous', 'likert']);
const CATEGORICAL_ROLES = new Set(['categorical', 'categorical-code']);

const buildAliasToColumnMap = (analysis = null) => {
  const map = new Map();
  (Array.isArray(analysis?.columns) ? analysis.columns : []).forEach((column) => {
    (Array.isArray(column.aliases) ? column.aliases : []).forEach((alias) => {
      const key = String(alias || '').trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, column);
    });
  });
  return map;
};

// Prep methods that CREATE a new variable the later steps consume (age_groups,
// attitude_index, voted_binary…). When the plan contains one of these, an
// unresolved variable name is almost always a legitimately-derived variable the
// prep step will produce — NOT a typo. Flagging it as "not in the file" is a
// false positive that scared users into thinking their assignment was broken.
const DERIVATION_METHOD_PATTERN = /(recode|compute|autorecode|count|dummy|index|scale|קידוד|חישוב|מדד|דמ[יה])/i;

export const validateAssignmentProfile = (profile = null, analysis = null) => {
  const warnings = [];
  if (!profile || !Array.isArray(profile.analyses) || !Array.isArray(analysis?.columns)) return warnings;
  const aliasMap = buildAliasToColumnMap(analysis);

  // Does the plan build derived variables at all? If so, unresolved names are
  // treated as planned derivations, not missing-variable errors.
  const planHasDerivation = profile.analyses.some((entry) => DERIVATION_METHOD_PATTERN.test(`${entry?.method || ''} ${entry?.label || ''}`));

  profile.analyses.forEach((entry) => {
    const label = entry.label || entry.method || 'ניתוח';
    const method = String(entry.method || '').toLowerCase();
    const resolved = [];
    let hasDerived = false;
    (Array.isArray(entry.variables) ? entry.variables : []).forEach((name) => {
      const column = aliasMap.get(String(name || '').trim().toLowerCase());
      if (column) resolved.push(column);
      else if (name) {
        // Unresolved + the plan creates derived vars ⇒ this is one of them (created
        // by an earlier recode/compute step), so don't flag it as missing.
        if (planHasDerivation) hasDerived = true;
        else warnings.push(`"${label}": המשתנה "${name}" לא נמצא בקובץ הנתונים.`);
      }
    });
    if (!resolved.length) return;

    const roles = resolved.map((column) => column.analysisRole);
    const continuousCount = roles.filter((role) => MODELING_CONTINUOUS_ROLES.has(role)).length;
    const categoricalCols = resolved.filter((column) => CATEGORICAL_ROLES.has(column.analysisRole));
    const binaryGroup = categoricalCols.some((column) => column.distinctCount === 2);
    const multiGroup = categoricalCols.some((column) => column.distinctCount >= 3);
    const unusable = resolved.filter((column) => ['identifier', 'text', 'date'].includes(column.analysisRole));

    if (unusable.length && /(correlation|regression|t-test|anova|מתאם|רגרסיה)/.test(method)) {
      warnings.push(`"${label}": ${unusable.map((column) => column.originalName).join(', ')} אינו מתאים כמשתנה בניתוח (מזהה/טקסט/תאריך).`);
    }
    // Skip the measurement-level count checks when a derived variable is involved:
    // its role is unknown at plan stage (an index is continuous, age_groups is
    // categorical) and it usually satisfies the test — flagging it is a false alarm.
    if (!hasDerived) {
      if (/(t-test|ttest|מבחן t)/.test(method) && !binaryGroup) {
        warnings.push(`"${label}": מבחן t דורש משתנה קבוצה עם 2 קטגוריות — לא זוהה כזה במשתנים שנבחרו.`);
      }
      if (/anova|ניתוח שונות/.test(method) && !multiGroup) {
        warnings.push(`"${label}": ANOVA דורש גורם קטגוריאלי עם ≥3 קטגוריות — לא זוהה כזה במשתנים שנבחרו.`);
      }
      if (/(correlation|pearson|מתאם)/.test(method) && continuousCount < 2) {
        warnings.push(`"${label}": מתאם Pearson דורש שני משתנים רציפים — בדוק את רמות המדידה.`);
      }
      if (/(chi-square|chisquare|חי בריבוע|קי בריבוע)/.test(method) && categoricalCols.length < 2) {
        warnings.push(`"${label}": חי-בריבוע דורש שני משתנים קטגוריאליים.`);
      }
    }
  });

  // De-dup, cap so the notes block stays readable.
  return Array.from(new Set(warnings)).slice(0, 8);
};

// Deterministic plan→code coverage check (zero AI cost, advisory only — never blocks a
// run). Every analyses[] entry the planner produced should show up as a matching SPSS
// command in the final master syntax; this is the safety net for the case that broke
// the real run (planned analysis silently dropped from generation). Unknown methods
// are skipped rather than flagged, so a false positive never scares the user.
const METHOD_COMMAND_HEADS = {
  't-test': [/^T-TEST\b/i],
  anova: [/^ONEWAY\b/i, /^UNIANOVA\b/i, /^GLM\b/i],
  correlation: [/^CORRELATIONS\b/i, /^NONPAR CORR\b/i],
  regression: [/^REGRESSION\b/i],
  'chi-square': [/^CROSSTABS\b/i],
  descriptives: [/^DESCRIPTIVES\b/i, /^EXAMINE\b/i, /^MEANS\b/i, /^FREQUENCIES\b/i],
  frequencies: [/^FREQUENCIES\b/i],
  reliability: [/^RELIABILITY\b/i],
  graph: [/^GRAPH\b/i, /^EXAMINE\b/i, /^FREQUENCIES\b/i],
  recode: [/^RECODE\b/i, /^COMPUTE\b/i, /^DO IF\b/i],
  compute: [/^COMPUTE\b/i, /^RECODE\b/i],
  'missing-values': [/^MISSING VALUES\b/i],
};

// Resolve a plan variable name (may be a real dataset alias, or a name the plan invented
// for a compute/recode step) to the outputName that will actually appear in the syntax.
// Falls back to the raw name (trimmed) when it is not a known dataset alias — it may
// still be a derived variable declared by COMPUTE/RECODE ... INTO in the syntax itself.
const resolvePlanVariableName = (rawName = '', aliasMap = new Map()) => {
  const trimmed = String(rawName || '').trim();
  if (!trimmed) return '';
  const column = aliasMap.get(trimmed.toLowerCase());
  return column ? column.outputName : trimmed;
};

export const validatePlanCoverage = ({ profile = null, analysis = null, masterSyntax = '' } = {}) => {
  const gaps = [];
  if (!profile || !Array.isArray(profile.analyses) || !profile.analyses.length) return gaps;

  const aliasMap = buildAliasToColumnMap(analysis);
  const declaredTargets = collectDeclaredTargetNames(masterSyntax);
  const declaredTargetsLower = new Set(Array.from(declaredTargets).map((name) => name.toLowerCase()));
  const commands = getSpssCommands(masterSyntax);
  const commandHeads = commands.map((command) => extractCommandHead(command));

  profile.analyses.forEach((entry) => {
    const method = String(entry?.method || '').trim().toLowerCase();
    const heads = METHOD_COMMAND_HEADS[method];
    if (!heads) return; // unrecognized method — no basis to judge, skip (never a false flag)

    const matchingCommands = commands.filter((command, index) => heads.some((pattern) => pattern.test(commandHeads[index])));
    const label = entry.label || entry.method || 'ניתוח';
    const variables = Array.isArray(entry.variables) ? entry.variables.filter(Boolean) : [];

    if (!matchingCommands.length) {
      gaps.push({ label, method, variables });
      return;
    }
    if (!variables.length) return; // command head present, nothing else to verify

    const covered = variables.some((rawName) => {
      const outputName = resolvePlanVariableName(rawName, aliasMap);
      if (!outputName) return false;
      let pattern;
      try {
        pattern = new RegExp(`\\b${escapeRegExp(outputName)}\\b`, 'i');
      } catch {
        return false;
      }
      if (matchingCommands.some((command) => pattern.test(command))) return true;
      return declaredTargetsLower.has(String(rawName || '').trim().toLowerCase()) || declaredTargetsLower.has(outputName.toLowerCase());
    });

    if (!covered) gaps.push({ label, method, variables });
  });

  return gaps;
};

// ---------------------------------------------------------------------------
// Graph guarantee — deterministic backstop for the second real failure from the actual
// run (an assignment that asked for "הצגה גרפית" for every variable produced zero
// charts). The planner is instructed to add a "graph" analysis per variable, but code
// generation is per-block and can silently drop it. ensureGraphCoverage re-checks the
// assembled master syntax and synthesizes any missing chart command deterministically
// (no LLM call, no chance of inventing a wrong variable name).
// ---------------------------------------------------------------------------
export const isChartCommand = (command = '') => {
  const head = extractCommandHead(command);
  if (/^GRAPH\b/i.test(head)) return true;
  if (/^EXAMINE\b/i.test(head)) {
    return /\/PLOT\s*=?[^\n/]*\b(?:BOXPLOT|HISTOGRAM|NPPLOT)\b/i.test(command);
  }
  if (/^FREQUENCIES\b/i.test(head)) {
    return /\/HISTOGRAM\b/i.test(command) || /\/BARCHART\b/i.test(command);
  }
  return false;
};

export const chooseChartCommand = (columns = [], { pairForScatter = false } = {}) => {
  const cols = (Array.isArray(columns) ? columns : []).filter(Boolean);
  if (!cols.length) return '';

  if (pairForScatter && cols.length === 2 && cols.every((column) => MODELING_CONTINUOUS_ROLES.has(column.analysisRole))) {
    return `GRAPH /SCATTERPLOT(BIVAR)=${cols[0].outputName} WITH ${cols[1].outputName}.`;
  }

  const [first] = cols;
  if (MODELING_CONTINUOUS_ROLES.has(first.analysisRole)) {
    return `GRAPH /HISTOGRAM=${first.outputName}.`;
  }
  if (CATEGORICAL_ROLES.has(first.analysisRole)) {
    return `GRAPH /BAR(SIMPLE)=COUNT BY ${first.outputName}.`;
  }
  return ''; // identifier / date / text — not chartable, skip silently
};

export const ensureGraphCoverage = ({ profile = null, analysis = null, masterSyntax = '' } = {}) => {
  const baseSyntax = String(masterSyntax || '');
  const noop = { changed: false, syntax: baseSyntax, missing: [] };
  if (!profile || !Array.isArray(profile.analyses) || !profile.analyses.length) return noop;

  const aliasMap = buildAliasToColumnMap(analysis);
  const declaredTargets = collectDeclaredTargetNames(baseSyntax);
  const declaredTargetsLower = new Set(Array.from(declaredTargets).map((name) => name.toLowerCase()));
  const chartCommands = getSpssCommands(baseSyntax).filter(isChartCommand);

  // A plan variable that is not a known dataset column but IS a name the syntax itself
  // declares (COMPUTE/RECODE ... INTO) is a computed index — treat it as continuous
  // (a mean/sum index has no natural categorical reading) rather than skipping it.
  const resolveChartColumn = (rawName = '') => {
    const trimmed = String(rawName || '').trim();
    if (!trimmed) return null;
    const column = aliasMap.get(trimmed.toLowerCase());
    if (column) return column;
    if (declaredTargetsLower.has(trimmed.toLowerCase())) {
      return { outputName: trimmed, analysisRole: 'continuous' };
    }
    return null;
  };

  const missing = [];
  const appended = [];

  profile.analyses
    .filter((entry) => String(entry?.method || '').trim().toLowerCase() === 'graph')
    .forEach((entry) => {
      const label = entry.label || entry.method || 'גרף';
      const rawVariables = Array.isArray(entry.variables) ? entry.variables : [];
      const columns = rawVariables.map(resolveChartColumn).filter(Boolean);
      if (!columns.length) return; // nothing resolvable — validatePlanCoverage will flag it

      const isCovered = (column) => {
        let pattern;
        try {
          pattern = new RegExp(`\\b${escapeRegExp(column.outputName)}\\b`, 'i');
        } catch {
          return false;
        }
        return chartCommands.some((command) => pattern.test(command));
      };
      const uncovered = columns.filter((column) => !isCovered(column));
      if (!uncovered.length) return;

      missing.push(label);
      // זוג רציפים = scatter אחד; אחרת גרף נפרד לכל משתנה לא-מכוסה (entry מרובה
      // משתנים כמו "גרפים לכל המשתנים" חייב לכסות את כולם, לא רק את הראשון).
      const commands = columns.length === 2 && uncovered.length === 2 && columns.every((column) => MODELING_CONTINUOUS_ROLES.has(column.analysisRole))
        ? [chooseChartCommand(columns, { pairForScatter: true })]
        : uncovered.map((column) => chooseChartCommand([column]));
      const block = commands.filter(Boolean).join('\n');
      if (block) {
        appended.push(`* --- גרף (הושלם אוטומטית): ${label} ---.\n${block}`);
      }
    });

  if (!appended.length) return { changed: false, syntax: baseSyntax, missing };

  const syntax = [baseSyntax.trimEnd(), ...appended].join('\n\n');
  return { changed: true, syntax, missing };
};

export const analyzeSpssAssignment = async ({ assignmentText = '', analysis = null, draftText = '', providerOverride = '', modelOverride = '' } = {}) => {
  const cleanAssignment = String(assignmentText || '').trim().slice(0, MAX_ASSIGNMENT_CHARS);
  if (!cleanAssignment) {
    return { ok: false, profile: null, providerId: '', model: '', error: 'הדבק את טקסט המטלה כדי שאבין מה צריך לעשות.' };
  }
  if (!analysis || !Array.isArray(analysis.columns) || !analysis.columns.length) {
    return { ok: false, profile: null, providerId: '', model: '', error: 'טען קובץ נתונים כדי שאוכל למפות את הניתוחים למשתנים אמיתיים.' };
  }

  try {
    const tokenizedAssignment = tokenizeSpssRequest(cleanAssignment, analysis);
    const tokenizedDraft = buildDraftContextBlock(draftText, analysis);
    const systemPrompt = [
      'אתה יועץ סטטיסטי מומחה שמכין סטודנט ישראלי לעבודת סיום ב-SPSS.',
      'קיבלת טקסט מטלה ומטא-דאטה של dataset (שמות משתנים מתוקנים VAR_n + סטטיסטיקות סיכום, בלי שורות גולמיות).',
      'נתח את המטלה והחזר אך ורק JSON תקין (בלי טקסט מסביב, בלי ```), במבנה:',
      '{',
      '  "summary": "תקציר קצר של מה המטלה דורשת",',
      '  "deliverable": "findings-chapter" | "interpretation" | "code",',
      '  "needsExplanation": true|false,',
      '  "analyses": [',
      '    {"label":"שם קצר","method":"t-test|anova|correlation|regression|chi-square|descriptives|reliability|frequencies|graph|other",',
      '     "variables":["VAR_1","VAR_2"],',
      '     "request":"בקשה אחת בעברית מוכנה ליצירת syntax, שמזכירה את שמות המשתנים (VAR_n)",',
      '     "rationale":"למה המבחן הזה מתאים"}',
      '  ],',
      '  "notes":"אזהרות, הנחות לבדוק, או מה חסר במטלה"',
      '}',
      'כללים: השתמש אך ורק במשתנים שמופיעים במטא-דאטה (VAR_n). אל תמציא משתנים או מבחנים שלא נדרשים.',
      'בחר deliverable לפי מה שהמטלה מבקשת: פרק ממצאים שלם, פירוש פלט בלבד, או רק קוד.',
      'אם המטלה מציינת מבחן ספציפי — כבד אותו. אם לא, הצע את המבחן הסטטיסטי הנכון למבנה הנתונים.',
      'תכנן להרצה טובה בפעם הראשונה: אם נדרש recode/סולם/מדד/היפוך/טיפול ב-missing — הוסף analysis מקדים מסוג מתאים לפני הניתוח שמשתמש בתוצר. אם ניתוח תלוי במשתנה נגזר, ה-request של הניתוח יציין שהוא משתמש במשתנה שנוצר קודם ולא ימציא משתנה חדש.',
      'לכל analysis כתוב request מפורט מספיק ליצירת syntax: שם הפרוצדורה הרצויה, המשתנים המדויקים, בדיקות הנחות נדרשות, גרפים אם נדרשו, ומה לדווח. request עמום גורם לקוד SPSS פחות יציב — אל תחזיר request עמום.',
      'סווג כל משתנה לפי role במטא-דאטה, לא רק לפי type: role=continuous = רציף; role=categorical / role=categorical-code = קטגוריאלי/קבוצתי (מספר שמייצג קטגוריה הוא קטגוריאלי גם אם type=numeric); role=likert = פריט דירוג בסולם — אפשר לטפל בו כרציף או לאחד פריטים למדד; role=identifier = מזהה, אל תכליל בניתוח. התאם את המבחן לרמות המדידה (t-test/ANOVA = DV רציף + גורם קטגוריאלי; chi-square = שני קטגוריאליים; correlation/regression = רציפים).',
      'אם ניתוח דורש משתנה נגזר/מקובץ שלא קיים כעמודה (קבוצות גיל מתוך גיל רציף, ציון/מדד מחושב, משתני דמה) — הוסף קודם analysis נפרד בשלב הכנה (method "recode" או "compute") שה-request שלו יוצר את המשתנה בשם אנגלי ברור, ואז ב-analysis שאחריו השתמש בשם הזה. סדר ה-analyses חייב להציב את שלב ההכנה לפני השימוש. אל תניח שמשתנה נגזר כבר קיים.',
      'רגרסיה עם מנבא קטגוריאלי בעל ≥3 קטגוריות: או הוסף שלב prep ליצירת k-1 משתני דמה, או ציין ב-rationale שיש להריץ GLM/UNIANOVA עם המשתנה כ-factor. אל תכניס מנבא קטגוריאלי רב-קטגורי גולמי לרגרסיה ליניארית.',
      'השתמש ב-valueLabels=[קוד=תווית] במטא-דאטה כדי למפות תיאורים מילוליים במטלה ("נשים", "תואר ראשון") לקודים הנכונים ולמשתנה הנכון. אל תמציא קטגוריות שלא מופיעות ב-valueLabels/observedValues.',
      'אם משתנה שנדרש לניתוח מסומן suspectedUndeclaredMissing=[קודים] — הוסף analysis ראשון בשלב הכנה (method "missing-values") שה-request שלו מגדיר את הקודים האלה כ-user-missing (MISSING VALUES), לפני כל ניתוח שמשתמש במשתנה. אחרת התוצאות יהיו מוטות.',
      'הצגה גרפית — אם המטלה מבקשת גרף/תרשים/היסטוגרמה/"הצגה גרפית"/plot/chart/diagram, הוסף analysis ייעודי נפרד (method "graph") לכל משתנה או זוג רלוונטי. בחר את סוג הגרף לפי רמת המדידה: רציף (role=continuous/likert) → היסטוגרמה או boxplot; קטגוריאלי (role=categorical/categorical-code) → תרשים עמודות (bar) או עוגה (pie); שני משתנים רציפים לבדיקת קשר → תרשים פיזור (scatter). ה-request יציין במפורש את סוג הגרף ואת שמות המשתנים (VAR_n). אל תוותר על הגרף גם אם באותו סעיף מבקשים גם מדדי מרכז/פיזור — הגרף הוא analysis נפרד ונוסף.',
      'מתאמים — אם המטלה מבקשת במפורש מקדם מתאם / "מידת הקשר" בין המשתנים, הוסף analysis ייעודי (method "correlation", CORRELATIONS או NONPAR CORR לפי רמת המדידה) בין המשתנה התלוי לכל משתנה בלתי-תלוי — גם אם בנוסף מתוכננת רגרסיה לבחינת ההשערות. רגרסיה אינה תחליף לדרישת מתאם מפורשת; אלה שני סעיפים נפרדים בעבודה.',
      'בדיקות הנחות — לכל מבחן היסק (t-test/ANOVA/רגרסיה/מתאם Pearson) ודא שה-request מבקש גם את בדיקות ההנחות הרלוונטיות: נורמליות (Shapiro-Wilk/Kolmogorov-Smirnov דרך EXAMINE ... /PLOT NPPLOT), שוויון שונויות (Levene — אוטומטי ב-T-TEST, ו-/STATISTICS=HOMOGENEITY ב-ONEWAY), ולרגרסיה גם בדיקת שאריות/מולטיקולינאריות. אפשר לשלב את בדיקות ההנחה באותו request של המבחן. המטלה דורשת לדווח עליהן — אל תשמיט.',
      tokenizedDraft
        ? 'צורפה טיוטה קיימת של העבודה — היא מקור האמת להגדרת משתנים, לא טקסט המטלה. אם הטיוטה מגדירה משתנה (למשל "מדד עמדות = שאלה 21 + שאלה 36"), מפה את ההגדרה למשתנים המתאימים במטא-דאטה (VAR_n) ובנה לפיה. אם הטיוטה מגדירה משתנה תלוי מחושב מכמה פריטים — הוסף תמיד analysis מקדים בשלב הכנה (method "compute") שבונה אותו (כולל RECODE להיפוך פריטים אם הטיוטה מציינת זאת) לפני כל analysis שמשתמש בו, והשתמש בשם המשתנה הנגזר ב-variables של הניתוחים התלויים בו. אם יש סתירה בין הטיוטה לטקסט המטלה — ציין זאת ב-notes ואל תמציא הכרעה.'
        : '',
      buildGuidanceMetadataBlock(analysis),
    ].filter(Boolean).join('\n');

    const userMessage = [
      tokenizedDraft ? `הטיוטה הקיימת של העבודה (מקור אמת להגדרות משתנים):\n${tokenizedDraft}` : '',
      `טקסט המטלה:\n${tokenizedAssignment}`,
    ].filter(Boolean).join('\n\n');

    const { text, providerId, model } = await callGuidanceProvider({
      tokenizedMessage: userMessage,
      systemPrompt,
      agentName: 'SPSS Assignment Planner',
      providerOverride,
      modelOverride,
    });

    const parsed = extractJsonPayload(text);
    if (!parsed) {
      return { ok: false, profile: null, providerId, model, error: 'לא הצלחתי לפענח את ניתוח המטלה. נסה שוב או נסח את המטלה ברור יותר.' };
    }

    const profile = normalizeAssignmentProfile(parsed, analysis);
    if (!profile.analyses.length) {
      return { ok: false, profile, providerId, model, error: 'לא זוהו ניתוחים נדרשים מהמטלה. ודא שטקסט המטלה כולל מה צריך לבדוק.' };
    }
    const warnings = validateAssignmentProfile(profile, analysis);
    if (warnings.length) {
      const warningBlock = `⚠️ בדיקת התאמה אוטומטית:\n• ${warnings.join('\n• ')}`;
      profile.notes = profile.notes ? `${profile.notes}\n\n${warningBlock}` : warningBlock;
    }
    return { ok: true, profile, providerId, model, error: '' };
  } catch (error) {
    return { ok: false, profile: null, providerId: '', model: '', error: error instanceof Error ? error.message : 'ניתוח המטלה נכשל.' };
  }
};

export const critiqueSpssRun = async ({ assignmentText = '', analysis = null, masterSyntax = '', output = '', providerOverride = '', modelOverride = '' } = {}) => {
  const cleanOutput = String(output || '').trim().slice(0, MAX_GUIDANCE_OUTPUT_CHARS);
  if (!cleanOutput) {
    return { ok: false, verdict: 'needs-output', issues: [], summary: '', providerId: '', model: '', error: 'הדבק את הפלט מ-SPSS כדי שאבדוק אותו מול המטלה.' };
  }

  // הרצה חלקית ≠ באג בקוד: undefined variable על משתנה שהקוד יוצר בעצמו. עצירה
  // דטרמיניסטית לפני ה-LLM — fixRequest ריק בכוונה, כדי שלולאת "תקן הכל" לא תיגע בקוד.
  const staleRun = detectStaleSessionRun({ syntax: masterSyntax, output: cleanOutput });
  if (staleRun.stale) {
    return {
      ok: true,
      verdict: 'needs-fixes',
      issues: [{
        label: 'הרצה חלקית של הקוד',
        severity: 'error',
        problem: `SPSS לא מצא את ${staleRun.variables.join(', ')} — משתנים שהקוד יוצר בשלב ההכנה.`,
        explanation: 'הורץ רק חלק מהקוד, או שקובץ הנתונים נפתח מחדש אחרי שלב ההכנה. משתנים מחושבים קיימים רק בזיכרון הסשן.',
        fixRequest: '',
        rerunInstruction: 'פתח את קובץ הנתונים המקורי, בחר את כל הקוד (Ctrl+A) והרץ הכול יחד (Run → Selection). ואז הדבק את הפלט המלא מחדש.',
      }],
      summary: staleRun.advice,
      providerId: '',
      model: '',
      error: '',
    };
  }

  try {
    const tokenizedAssignment = tokenizeSpssRequest(String(assignmentText || '').trim().slice(0, MAX_ASSIGNMENT_CHARS), analysis);
    const tokenizedSyntax = tokenizeSpssRequest(String(masterSyntax || '').trim().slice(0, MAX_PROJECT_SYNTAX_CHARS), analysis);
    const tokenizedOutput = tokenizeSpssRequest(cleanOutput, analysis);

    const systemPrompt = [
      'אתה בודק סטטיסטי שמוודא שהרצת SPSS עונה על המטלה לפני שכותבים ממצאים.',
      'קיבלת: טקסט המטלה, ה-syntax שהורץ, והפלט שהמשתמש הדביק.',
      'בדוק: האם יש שגיאות SPSS בפלט (Error/Warning), האם כל הניתוחים הנדרשים רצו, האם הופרו הנחות (נורמליות, שונויות, גודל מדגם), והאם חסר משהו שהמטלה ביקשה.',
      'גרפים/תרשימים — כלל מיוחד נגד תיקונים חוזרים: גרף ב-SPSS הוא תמונה, לא טקסט. הוא כמעט אף פעם לא מופיע בפלט שמדביקים (שהוא טקסט/טבלאות בלבד), וזה תקין וצפוי. לפני שתתלונן על גרף חסר — בדוק את ה-syntax שהורץ: אם הוא כבר כולל את פקודת הגרף הנדרשת (GRAPH / HISTOGRAM / BAR / PIE / SCATTERPLOT / EXAMINE ... /PLOT), אז הקוד תקין והדרישה מולאה. במקרה כזה אסור לפתוח issue עם verdict="needs-fixes" ואסור להחזיר fixRequest שמבקש "להוסיף גרף" (זה רק ייצר שוב את אותה פקודה בדיוק — הלולאה שאתה חייב למנוע). לכל היותר ציין ב-summary הערה קצרה שהגרפים רצו אך אינם מופיעים בהדבקה כי הם תמונות, ושיש לייצא אותם מ-SPSS ישירות לתוצר. פתח issue על גרף רק אם ה-syntax באמת חסר לגמרי את פקודת הגרף שהמטלה דורשת.',
      'דגל אדום קריטי לבדוק תמיד — סטטיסטיקה תיאורית בלתי-אפשרית: אם ה-SD גדול מהטווח הסביר של הסולם, או הממוצע/מינימום/מקסימום חורגים מהסולם הצפוי (למשל M≈9 או SD≈20 בסולם 0–10, או SD גדול מהממוצע במשתנה חסום), זה מעיד על ערכי missing לא-מוגדרים (קודים כמו 98/99) שנכללים בחישוב ומנפחים את התוצאות. אם יש metadata — הצלב מול ה-range וה-observedValues (קוד 98/99 = חשד). אם זיהית זאת — סמן issue עם verdict="needs-fixes" ו-fixRequest להגדיר את הקודים כ-user-missing (MISSING VALUES) ולהריץ מחדש; כל ניתוח שמבוסס על הממוצעים האלה אינו אמין עד אז.',
      'אם משתנה ב-metadata מסומן suspectedUndeclaredMissing=[...] — זהו דגל אדום שזוהה אוטומטית. אבל לפני שאתה פותח issue: קרא את ה-syntax שהורץ. אם הוא כבר כולל שורת MISSING VALUES שמכריזה על אותם קודים עבור אותו משתנה — הבעיה כבר טופלה, אל תפתח אותה שוב ואל תדרוש להגדיר MISSING VALUES פעם נוספת. פתח issue רק אם ה-syntax עדיין לא מטפל בקודים האלה. אם הוא מסומן declaredMissing=[...] בלבד — הקודים כבר מטופלים ואין בעיה.',
      'עיקרון חשוב נגד תיקונים חוזרים: ה-metadata מתאר את קובץ הגלם ולא משתנה בין הרצות. שפוט תמיד לפי מה שנראה בפלט וב-syntax שהורץ בפועל — לא לפי ה-metadata לבדו. אם התיקון של סבב קודם כבר נמצא ב-syntax ובפלט אין יותר סימן לבעיה, אל תעלה אותה שוב.',
      'החזר אך ורק JSON תקין (בלי טקסט מסביב, בלי ```), במבנה:',
      '{',
      '  "verdict": "clean" | "needs-fixes",',
      '  "issues": [ {"label":"איזה ניתוח","severity":"error|warning|missing|assumption","problem":"מה הבעיה","explanation":"למה זה משנה לתוצר/למטלה","fixRequest":"בקשה בעברית לתיקון/הרצה מחדש, עם שמות VAR_n","rerunInstruction":"מה המשתמש צריך להריץ/להדביק אחרי התיקון"} ],',
      '  "summary": "סיכום קצר של מצב ההרצה"',
      '}',
      'אם הכל תקין — verdict="clean" ו-issues ריק. אל תמציא מספרים שלא בפלט. אם יש issue, הסבר אותו כך שסטודנט יבין מה לתקן ולמה, אבל אל תציע תיקון שאינו נדרש מהפלט או מהמטלה.',
      buildGuidanceMetadataBlock(analysis),
    ].filter(Boolean).join('\n');

    const message = [
      `טקסט המטלה:\n${tokenizedAssignment || '(לא סופק)'}`,
      `ה-syntax שהורץ:\n${tokenizedSyntax || '(לא סופק)'}`,
      `הפלט מ-SPSS:\n${tokenizedOutput}`,
    ].join('\n\n');

    const { text, providerId, model } = await callGuidanceProvider({
      tokenizedMessage: message,
      systemPrompt,
      agentName: 'SPSS Run Critic',
      providerOverride,
      modelOverride,
    });

    const parsed = extractJsonPayload(text);
    if (!parsed) {
      return { ok: false, verdict: 'unknown', issues: [], summary: '', providerId, model, error: 'לא הצלחתי לפענח את בדיקת הפלט. נסה שוב.' };
    }
    const restored = restoreTokensDeep(parsed, analysis) || {};
    const issues = Array.isArray(restored.issues)
      ? restored.issues.map((entry) => ({
          label: String(entry?.label || '').trim(),
          severity: String(entry?.severity || '').trim(),
          problem: String(entry?.problem || '').trim(),
          explanation: String(entry?.explanation || '').trim(),
          fixRequest: String(entry?.fixRequest || '').trim(),
          rerunInstruction: String(entry?.rerunInstruction || '').trim(),
        })).filter((entry) => entry.problem || entry.fixRequest)
      : [];
    const verdict = String(restored.verdict || '').trim() === 'needs-fixes' || issues.length ? 'needs-fixes' : 'clean';
    return { ok: true, verdict, issues, summary: String(restored.summary || '').trim(), providerId, model, error: '' };
  } catch (error) {
    return { ok: false, verdict: 'unknown', issues: [], summary: '', providerId: '', model: '', error: error instanceof Error ? error.message : 'בדיקת הפלט נכשלה.' };
  }
};

// ---------------------------------------------------------------------------
// Lecturer advisory (optional, שלב D) — an advisory voice, never a directive: reads the
// already-produced results and suggests directions the student can consider (e.g. a
// non-significant hypothesis test → concrete alternative predictors that actually exist
// in the file). Every suggestedVariables entry is validated deterministically against
// buildAliasToColumnMap AFTER restoreTokensDeep — a suggestion the model hallucinated for
// a variable outside the metadata is stripped (never trusted from the model alone).
// Recommendations that imply a post-hoc hypothesis change must carry integrityNote (HARKing).
// ---------------------------------------------------------------------------
export const adviseLecturerNextSteps = async ({ assignmentText = '', analysis = null, profile = null, masterSyntax = '', output = '', interpretations = [], providerOverride = '', modelOverride = '' } = {}) => {
  const cleanOutput = String(output || '').trim().slice(0, MAX_GUIDANCE_OUTPUT_CHARS);
  if (!cleanOutput) {
    return { ok: false, recommendations: [], summary: '', providerId: '', model: '', error: 'הדבק פלט מ-SPSS כדי לקבל המלצת מרצה על סמך התוצאות.' };
  }

  try {
    const tokenizedAssignment = tokenizeSpssRequest(String(assignmentText || '').trim().slice(0, MAX_ASSIGNMENT_CHARS), analysis);
    const tokenizedSyntax = tokenizeSpssRequest(String(masterSyntax || '').trim().slice(0, MAX_PROJECT_SYNTAX_CHARS), analysis);
    const tokenizedOutput = tokenizeSpssRequest(cleanOutput, analysis);

    const planDigest = Array.isArray(profile?.analyses)
      ? profile.analyses.map((entry, index) => `${index + 1}. ${entry.label || entry.method || 'ניתוח'} [${entry.method || ''}]`).join('\n')
      : '';

    const interpretationDigest = (Array.isArray(interpretations) ? interpretations : [])
      .map((entry) => {
        const label = String(entry?.label || '').trim();
        const answer = String(entry?.answer || '').trim();
        return answer ? `### ${label || 'ניתוח'}\n${answer}` : '';
      })
      .filter(Boolean)
      .join('\n\n');
    const tokenizedInterpretationDigest = tokenizeSpssRequest(interpretationDigest, analysis);

    const systemPrompt = [
      'אתה מרצה סטטיסטיקה בכיר שמייעץ לסטודנט — קול מייעץ (advisory), לא מכתיב. אתה עוזר לו לראות כיווני המשך אפשריים על סמך התוצאות שכבר התקבלו, ולא קובע במקומו מה לעשות.',
      'קיבלת: טקסט המטלה, תוכנית הניתוחים, ה-syntax שהורץ, פירושים שכבר הופקו לפלט (אם יש), והפלט הגולמי מ-SPSS.',
      'כלל מחייב וקשיח: כל ערך ב-suggestedVariables חייב להיות token מסוג VAR_n שקיים בפועל במטא-דאטה שצורפה בהמשך. הצעת משתנה שאינו קיים במטא-דאטה אסורה לחלוטין — זו הזיה.',
      'כשמבחן השערה בפלט אינו מובהק (p לא מובהק) — הצע 1-2 מנבאים חלופיים קונקרטיים שקיימים בפועל במטא-דאטה (למשל השכלה או הכנסה כמדד SES), עם הפרוצדורה הסטטיסטית המתאימה לרמת המדידה שלהם (role=continuous/categorical/likert וכו׳). אל תמציא משתנה שלא ברשימה.',
      'אזהרת HARKing (Hypothesizing After the Results are Known): כל המלצה שמשתמעת ממנה שינוי או הוספת השערה אחרי שכבר נראו התוצאות חייבת לשאת integrityNote שמסביר שיש לנסח זאת כניתוח חקרני (exploratory) ולגלות זאת במפורש בעבודה — לא להציג כאילו הייתה השערה שנקבעה מראש.',
      'החזר אך ורק JSON תקין (בלי טקסט מסביב, בלי ```), במבנה:',
      '{',
      '  "recommendations": [',
      '    {"finding":"מה נמצא בתוצאות","recommendation":"כיוון מוצע לשיקול הסטודנט, בניסוח מייעץ ולא מכתיב","suggestedVariables":["VAR_n"],"suggestedAnalysis":"הפרוצדורה הסטטיסטית המתאימה","integrityNote":"אזהרת HARKing אם רלוונטי, אחרת מחרוזת ריקה"}',
      '  ],',
      '  "summary": "סיכום קצר של כיווני ההמשך המוצעים"',
      '}',
      'עצה כללית/מתודולוגית שאינה תלויה במשתנה ספציפי מותרת — suggestedVariables יכול להיות מערך ריק במקרה כזה.',
      'אל תמציא ערכים או תוצאות שלא מופיעים בפלט. אם משהו חסר כדי להסיק, ציין זאת.',
      buildGuidanceMetadataBlock(analysis),
    ].filter(Boolean).join('\n');

    const message = [
      `טקסט המטלה:\n${tokenizedAssignment || '(לא סופק)'}`,
      planDigest ? `תוכנית הניתוחים:\n${planDigest}` : '',
      `ה-syntax שהורץ:\n${tokenizedSyntax || '(לא סופק)'}`,
      tokenizedInterpretationDigest ? `פירושים שכבר הופקו:\n${tokenizedInterpretationDigest}` : '',
      `הפלט הגולמי מ-SPSS:\n${tokenizedOutput}`,
    ].filter(Boolean).join('\n\n');

    const { text, providerId, model } = await callGuidanceProvider({
      tokenizedMessage: message,
      systemPrompt,
      agentName: 'SPSS Lecturer Advisor',
      providerOverride,
      modelOverride,
    });

    const parsed = extractJsonPayload(text);
    if (!parsed) {
      return { ok: false, recommendations: [], summary: '', providerId, model, error: 'לא הצלחתי לפענח את המלצת המרצה. נסה שוב.' };
    }

    const restored = restoreTokensDeep(parsed, analysis) || {};
    const aliasMap = buildAliasToColumnMap(analysis);
    let droppedCount = 0;
    const recommendations = (Array.isArray(restored.recommendations) ? restored.recommendations : [])
      .map((entry) => {
        const rawVariables = Array.isArray(entry?.suggestedVariables) ? entry.suggestedVariables : [];
        const resolvedColumns = rawVariables
          .map((name) => aliasMap.get(String(name || '').trim().toLowerCase()))
          .filter(Boolean);
        const resolvedNames = resolvedColumns.map((column) => column.originalName || column.outputName || column.token);
        // כלל אנטי-הזיה: אם ה-entry ביקש משתנים במפורש (לא עצה כללית) וכולם לא
        // נפתרו מול הקובץ האמיתי — כל ה-entry לא אמין, זורקים אותו כולו.
        if (rawVariables.length && !resolvedNames.length) {
          droppedCount += 1;
          return null;
        }
        return {
          finding: String(entry?.finding || '').trim(),
          recommendation: String(entry?.recommendation || '').trim(),
          suggestedVariables: resolvedNames,
          suggestedAnalysis: String(entry?.suggestedAnalysis || '').trim(),
          integrityNote: String(entry?.integrityNote || '').trim(),
        };
      })
      .filter((entry) => entry && (entry.finding || entry.recommendation || entry.suggestedAnalysis));

    let summary = String(restored.summary || '').trim();
    if (droppedCount > 0) {
      const dropNote = `הוסרו ${droppedCount} המלצות שהפנו למשתנים שאינם בקובץ.`;
      summary = summary ? `${summary}\n\n${dropNote}` : dropNote;
    }

    return { ok: true, recommendations, summary, providerId, model, error: '' };
  } catch (error) {
    return { ok: false, recommendations: [], summary: '', providerId: '', model: '', error: error instanceof Error ? error.message : 'הפקת המלצת המרצה נכשלה.' };
  }
};

// ---------------------------------------------------------------------------
// Pre-flight reviewer — the "good code on the first try" lever. The per-analysis
// generator writes each block in ISOLATION (one generateSpssSyntax call per item,
// seeing only the allowed names, not the whole plan or the sibling blocks). This
// reviewer takes a SECOND look at the fully-assembled master syntax against the
// task + plan + metadata BEFORE the user burns an SPSS run, and fixes only what
// is certainly wrong (phantom vars, prep-after-use order, missing MISSING VALUES
// on flagged vars, raw multi-category predictor in REGRESSION, a required analysis
// dropped, a missing terminating '.'). Deliberately conservative: if the code is
// fine or it is unsure it returns verdict="clean" and changes nothing, so it never
// mangles working syntax. Same VAR_n privacy model as the rest of the studio.
// ---------------------------------------------------------------------------
export const reviewSpssMasterSyntax = async ({ assignmentText = '', analysis = null, profile = null, masterSyntax = '', providerOverride = '', modelOverride = '' } = {}) => {
  const cleanSyntax = String(masterSyntax || '').trim();
  if (!analysis || !Array.isArray(analysis.columns) || !analysis.columns.length) {
    return { ok: false, verdict: 'skip', changed: false, syntax: '', notes: [], providerId: '', model: '', error: 'טען קובץ נתונים לפני בדיקת הקוד.' };
  }
  if (!cleanSyntax) {
    return { ok: false, verdict: 'skip', changed: false, syntax: '', notes: [], providerId: '', model: '', error: 'אין קוד לבדיקה.' };
  }

  try {
    const tokenizedAssignment = tokenizeSpssRequest(String(assignmentText || '').trim().slice(0, MAX_ASSIGNMENT_CHARS), analysis);
    const tokenizedSyntax = tokenizeSpssRequest(cleanSyntax.slice(0, MAX_PROJECT_SYNTAX_CHARS), analysis);
    // Names created by the code itself (COMPUTE/RECODE INTO targets) are legitimate
    // even though they are not in the metadata — carry them so the fixed syntax that
    // reuses a derived var is not rejected by the sanitizer as an invented name.
    const extraAllowedNames = Array.from(collectDeclaredTargetNames(cleanSyntax));
    const planLines = Array.isArray(profile?.analyses)
      ? profile.analyses
          .map((entry, index) => `${index + 1}. ${entry.label || entry.method || 'ניתוח'} [${entry.method || ''}]${entry.request ? ` — ${tokenizeSpssRequest(String(entry.request), analysis)}` : ''}`)
          .join('\n')
      : '';
    const missingDigest = buildSuspectedMissingDigest(analysis);

    const systemPrompt = [
      'אתה בודק SPSS מומחה שעובר על master syntax שנוצר אוטומטית, לפני שהמשתמש מריץ אותו ב-SPSS.',
      'המטרה: לתפוס טעויות שיגרמו לשגיאת ריצה או לתוצאה שגויה/חסרה — כדי שההרצה הראשונה תצליח.',
      'קיבלת: טקסט המטלה, תוכנית הניתוחים, וה-master syntax המלא. אין לך פלט (הקוד עדיין לא רץ).',
      'בדוק אך ורק בעיות ודאיות:',
      '1. משתנה שמופיע ב-syntax אך לא קיים ב-metadata ולא נוצר קודם ב-syntax (COMPUTE/RECODE ... INTO) — phantom variable.',
      '2. משתנה נגזר שנעשה בו שימוש לפני שנוצר (סדר prep שגוי — יש להעביר את שלב ההכנה למעלה).',
      '3. משתנה שמסומן suspectedUndeclaredMissing ומשמש בניתוח, אך אין לו שורת MISSING VALUES ב-syntax → יזהם את הסטטיסטיקה.',
      '4. מנבא קטגוריאלי רב-קטגורי (≥3 קטגוריות) שמוכנס גולמי ל-REGRESSION במקום dummy/GLM.',
      '5. ניתוח שהמטלה או התוכנית דורשת אך חסר לגמרי מה-syntax.',
      '6. פקודה בלי נקודה מסיימת (.), subcommand שגוי מובהק, או EXECUTE. חסר אחרי transformation שתוצאתו נצרכת מיד.',
      '7. syntax שאינו runnable כי הוא מכיל הוראות טבעיות, markdown, "TODO", או patch במקום פקודות SPSS מלאות.',
      '8. שימוש בקודי קבוצה שלא מופיעים ב-observedValues/valueLabels, או /GROUPS בלי קודים מפורשים כאשר SPSS דורש אותם.',
      'שמרנות — קריטי: אם הקוד תקין או שאינך בטוח, אל תשנה. אל תשכתב ניתוח תקין, אל תוסיף ניתוחים שלא נדרשו, ואל תשנה סגנון. תקן מינימלית ורק את מה שוודאי שגוי. עדיף להחזיר clean מאשר לשבור קוד עובד.',
      'גרפים: פקודת GRAPH / HISTOGRAM / BAR / PIE / SCATTERPLOT / EXAMINE ... /PLOT תקינה — אל תסמן אותה כבעיה גם אם היא לא תניב טבלת טקסט.',
      'החזר אך ורק JSON תקין (בלי טקסט מסביב, בלי ```), במבנה:',
      '{',
      '  "verdict": "clean" | "fixed",',
      '  "notes": ["מה נמצא ותוקן — משפט קצר בעברית לכל פריט"],',
      '  "syntax": "אם verdict=fixed — ה-master syntax המלא והמתוקן; אם clean — מחרוזת ריקה"',
      '}',
      'ב-syntax המתוקן השתמש אך ורק ב-tokens מסוג VAR_n עבור משתני המקור — לא בשמות אמיתיים. שמור על שורות ה-comment (* ...) שמסמנות את מבנה הבלוקים.',
      'ה-syntax המתוקן חייב להיות master syntax מלא להרצה ב-Run All: לא diff, לא רשימת תיקונים, לא הסבר מחוץ ל-comment, ולא קטע חלקי שמניח שהמשתמש ישלב ידנית.',
      missingDigest ? `משתנים עם קודי missing חשודים (הצהר עליהם ב-MISSING VALUES אם הם בשימוש בניתוח):\n${missingDigest}` : '',
      buildGuidanceMetadataBlock(analysis),
    ].filter(Boolean).join('\n');

    const message = [
      `טקסט המטלה:\n${tokenizedAssignment || '(לא סופק)'}`,
      planLines ? `תוכנית הניתוחים:\n${planLines}` : '',
      `ה-master syntax לבדיקה:\n${tokenizedSyntax}`,
    ].filter(Boolean).join('\n\n');

    const { text, providerId, model } = await callGuidanceProvider({
      tokenizedMessage: message,
      systemPrompt,
      agentName: 'SPSS Preflight Reviewer',
      providerOverride,
      modelOverride,
    });

    const parsed = extractJsonPayload(text);
    if (!parsed) {
      return { ok: false, verdict: 'unknown', changed: false, syntax: '', notes: [], providerId, model, error: 'לא הצלחתי לפענח את בדיקת הקוד.' };
    }
    const notes = Array.isArray(parsed.notes)
      ? parsed.notes.map((note) => restoreColumnTokens(String(note || '').trim(), analysis)).filter(Boolean).slice(0, 10)
      : [];
    const verdict = String(parsed.verdict || '').trim() === 'fixed' ? 'fixed' : 'clean';
    if (verdict !== 'fixed') {
      return { ok: true, verdict: 'clean', changed: false, syntax: '', notes, providerId, model, error: '' };
    }
    // Model output is in VAR_n tokens; sanitizeSpssSyntax validates then restores to
    // real names (prep mode — the master legitimately contains data-prep commands).
    const rawFixed = String(parsed.syntax || '').trim();
    if (!rawFixed) {
      return { ok: true, verdict: 'clean', changed: false, syntax: '', notes, providerId, model, error: '' };
    }
    const sanitized = sanitizeSpssSyntax(rawFixed, analysis, { mode: 'prep', extraAllowedNames });
    if (isGuardrailSyntaxResponse(sanitized)) {
      // The reviewer produced something the sanitizer rejects — do NOT replace the
      // working code. Surface its notes as advisory only.
      return { ok: true, verdict: 'clean', changed: false, syntax: '', notes, providerId, model, error: getGuardrailGuidanceMessage(sanitized) };
    }
    return { ok: true, verdict: 'fixed', changed: true, syntax: sanitized, notes, providerId, model, error: '' };
  } catch (error) {
    return { ok: false, verdict: 'unknown', changed: false, syntax: '', notes: [], providerId: '', model: '', error: error instanceof Error ? error.message : 'בדיקת הקוד נכשלה.' };
  }
};

// --- אנטי-חיתוך: פרק הממצאים כולל טבלאות ויכול להיות ארוך מברירת המחדל של
// הספק. אין אופציית maxOutputTokens גנרית ב-chatWithActiveProvider (נבדק —
// requestBodyExtras קיים אך משמש רק למסלול perplexity הפנימי), אז מסתמכים על
// זיהוי חיתוך דטרמיניסטי + לולאת continuation במקום.
const CLOSING_BLOCK_TAG_PATTERN = /<\/(p|table|h2|h3|ul|ol|li)>\s*$/i;
const BALANCED_TAG_NAMES = ['table', 'ul', 'ol', 'p'];

const countTagOccurrences = (html = '', tagName = '') => {
  const openPattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, 'gi');
  const closePattern = new RegExp(`</${tagName}\\s*>`, 'gi');
  const open = (html.match(openPattern) || []).length;
  const close = (html.match(closePattern) || []).length;
  return { open, close };
};

const isTruncatedHtml = (html = '') => {
  const trimmed = String(html || '').trim();
  if (!trimmed) return true;
  if (!CLOSING_BLOCK_TAG_PATTERN.test(trimmed)) return true;
  return BALANCED_TAG_NAMES.some((tag) => {
    const { open, close } = countTagOccurrences(trimmed, tag);
    return open > close;
  });
};

// מדביקה המשך לטקסט קיים, ומורידה חפיפה אם ה-continuation חוזר על זנב הטקסט
// שכבר נכתב (המודל לפעמים חוזר על כמה תווים אחרונים לפני שהוא ממשיך הלאה).
const appendContinuationHtml = (accumulated = '', continuation = '') => {
  const acc = String(accumulated || '');
  const cont = String(continuation || '').trim();
  if (!cont) return acc;
  const maxOverlap = Math.min(acc.length, cont.length, 400);
  for (let len = maxOverlap; len >= 40; len -= 1) {
    if (acc.slice(-len) === cont.slice(0, len)) {
      return acc + cont.slice(len);
    }
  }
  return `${acc}${/\s$/.test(acc) ? '' : '\n'}${cont}`;
};

const MAX_FINDINGS_CONTINUATION_ROUNDS = 3;
const FINDINGS_CONTINUATION_TAIL_CHARS = 1500;
const FINDINGS_CONTINUATION_INSTRUCTION = 'זה סוף הפרק שנכתב עד כה ונקטע. המשך בדיוק מהנקודה שנעצרת. אל תחזור על טקסט קיים, אל תפתח כותרת חדשה של הפרק, החזר אך ורק את ההמשך כ-HTML.';

export const buildSpssFindingsChapter = async ({ assignmentText = '', analysis = null, masterSyntax = '', output = '', interpretations = [], draftText = '', providerOverride = '', modelOverride = '' } = {}) => {
  const cleanOutput = String(output || '').trim().slice(0, MAX_GUIDANCE_OUTPUT_CHARS);
  if (!cleanOutput) {
    return { ok: false, html: '', title: '', providerId: '', model: '', error: 'אין פלט להרכבת פרק ממצאים. הדבק קודם את הפלט מ-SPSS.', truncated: false };
  }

  try {
    const tokenizedAssignment = tokenizeSpssRequest(String(assignmentText || '').trim().slice(0, MAX_ASSIGNMENT_CHARS), analysis);
    const tokenizedSyntax = tokenizeSpssRequest(String(masterSyntax || '').trim().slice(0, MAX_PROJECT_SYNTAX_CHARS), analysis);
    const tokenizedOutput = tokenizeSpssRequest(cleanOutput, analysis);
    const tokenizedDraft = buildDraftContextBlock(draftText, analysis);
    const interpretationBlock = (Array.isArray(interpretations) ? interpretations : [])
      .map((entry) => {
        const label = String(entry?.label || '').trim();
        const answer = String(entry?.answer || '').trim();
        return answer ? `### ${label || 'ניתוח'}\n${answer}` : '';
      })
      .filter(Boolean)
      .join('\n\n');

    const systemPrompt = [
      'אתה כותב אקדמי שמרכיב "פרק ממצאים" בעברית לעבודת סטטיסטיקה, על בסיס פלט SPSS.',
      'החזר אך ורק HTML נקי (בלי ```), עם <h2>/<h3>/<p>/<table> בלבד. בלי <html> או <body>.',
      'מבנה מומלץ: כותרת פרק (<h2>פרק ממצאים</h2>), ואז תת-פרק לכל ניתוח עם דיווח התוצאה, מובהקות וגודל אפקט בסגנון APA, וטבלה כשמתאים.',
      'הסתמך אך ורק על המספרים שבפלט ובפירושים שסופקו. אל תמציא ערכים. אם משהו חסר — ציין זאת בעדינות.',
      'דגל אדום לפני דיווח: אם הסטטיסטיקה התיאורית בלתי-אפשרית (SD גדול מהטווח הסביר של הסולם, או ממוצע/מינימום/מקסימום מחוץ לסולם — סימן לערכי missing לא-מוגדרים כמו 98/99 שנכללו בחישוב), או אם משתנה ב-metadata מסומן suspectedUndeclaredMissing=[...], אל תדווח את הערכים כאילו הם תקינים. ציין במפורש בפרק שהתוצאות מוטות עקב missing לא-מוגדר, ושיש להגדירו (MISSING VALUES) ולהריץ מחדש לפני הסקת מסקנות.',
      'כתוב עברית אקדמית רהוטה, לא תרגום מילולי.',
      tokenizedDraft
        ? 'צורפה טיוטה קיימת של העבודה. כתוב את פרק הממצאים כך שישתלב בה: התאם למינוח, למבנה ולסגנון הכתיבה, אל תחזור על דברים שכבר נכתבו בטיוטה, והפנה לחלקים קיימים כשרלוונטי. החזר רק את פרק הממצאים (לא לשכתב את הטיוטה).'
        : '',
      buildGuidanceMetadataBlock(analysis),
    ].filter(Boolean).join('\n');

    const message = [
      tokenizedDraft ? `הטיוטה הקיימת של העבודה (להקשר וסגנון בלבד):\n${tokenizedDraft}` : '',
      `טקסט המטלה:\n${tokenizedAssignment || '(לא סופק)'}`,
      interpretationBlock ? `פירושים שכבר הופקו:\n${interpretationBlock}` : '',
      `ה-syntax שהורץ:\n${tokenizedSyntax || '(לא סופק)'}`,
      `הפלט הגולמי מ-SPSS:\n${tokenizedOutput}`,
    ].filter(Boolean).join('\n\n');

    const { text, providerId, model } = await callGuidanceProvider({
      tokenizedMessage: message,
      systemPrompt,
      agentName: 'SPSS Findings Writer',
      providerOverride,
      modelOverride,
    });

    const restoredHtml = (restoreColumnTokens(text, analysis) || text)
      .replace(/```html/gi, '')
      .replace(/```/g, '')
      .trim();
    if (!restoredHtml) {
      return { ok: false, html: '', title: '', providerId, model, error: 'המודל לא החזיר פרק ממצאים. נסה שוב.', truncated: false };
    }

    // חיתוך: הטבלאות/הכותרות הארוכות בפרק הממצאים עלולות להיחתך על ברירת המחדל
    // של הספק. משלימים עד 3 סבבי continuation לפני שמוותרים ומדווחים truncated.
    let accumulatedHtml = restoredHtml;
    let truncated = isTruncatedHtml(accumulatedHtml);
    let round = 0;
    while (truncated && round < MAX_FINDINGS_CONTINUATION_ROUNDS) {
      round += 1;
      const tail = accumulatedHtml.slice(-FINDINGS_CONTINUATION_TAIL_CHARS);
      const tokenizedTail = tokenizeSpssRequest(tail, analysis);
      const continuationMessage = [
        'הפרק שנכתב עד כה (זנב הקטע, לצורך המשך בלבד):',
        tokenizedTail,
        '',
        FINDINGS_CONTINUATION_INSTRUCTION,
      ].join('\n');

      // eslint-disable-next-line no-await-in-loop
      const continuationResult = await callGuidanceProvider({
        tokenizedMessage: continuationMessage,
        systemPrompt,
        agentName: 'SPSS Findings Writer',
        providerOverride,
        modelOverride,
      });

      const continuationHtml = (restoreColumnTokens(continuationResult.text, analysis) || continuationResult.text)
        .replace(/```html/gi, '')
        .replace(/```/g, '')
        .trim();
      if (!continuationHtml) break;
      accumulatedHtml = appendContinuationHtml(accumulatedHtml, continuationHtml);
      truncated = isTruncatedHtml(accumulatedHtml);
    }

    return { ok: true, html: accumulatedHtml, title: 'פרק ממצאים', providerId, model, error: '', truncated };
  } catch (error) {
    return { ok: false, html: '', title: '', providerId: '', model: '', error: error instanceof Error ? error.message : 'הרכבת פרק הממצאים נכשלה.', truncated: false };
  }
};
