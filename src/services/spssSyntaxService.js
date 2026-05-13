import Papa from 'papaparse';

const MAX_INFERENCE_ROWS = 5;
const MAX_DISTINCT_PREVIEW = 8;
const SAFE_SPSS_NAME_MAX_LENGTH = 64;
const DATE_INFERENCE_RATIO = 0.8;
const LOW_CARDINALITY_RATIO = 0.25;
const SMALL_SET_CATEGORICAL_RATIO = 0.75;
const MAX_SMALL_SET_DISTINCT = 12;
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
const GROUP_COMPARISON_HINT_PATTERN = /(?:\bבין\b|\bמול\b|\bלעומת\b|השוו?ה?\s+בין|compare\s+(?:between|across)|versus|\bvs\.?\b)/i;
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
  /^(?:T-?TEST|ONEWAY|ANOVA|UNIANOVA|GLM|DESCRIPTIVES|FREQUENCIES|EXAMINE|RECODE|COMPUTE|CORRELATIONS|NONPAR\s+CORR|NPAR\s+TESTS|REGRESSION|CROSSTABS|MEANS|GRAPH|SORT\s+CASES|SPLIT\s+FILE|TEMPORARY|SELECT\s+IF|FILTER\s+(?:BY|OFF)|USE\s+ALL|IF|DO\s+IF|ELSE\s+IF|ELSE|END\s+IF|VALUE\s+LABELS|VARIABLE\s+LABELS|FORMATS|MISSING\s+VALUES|RENAME\s+VARIABLES|AGGREGATE|RANK|CTABLES|OMS|DATASET|TITLE|EXECUTE)\b/i,
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
  'SE',
  'VARIANCE',
  'PAIRS',
  'TOTAL',
]);

const POSITIONAL_VARIABLE_COMMAND_SPECS = [
  { pattern: /^DESCRIPTIVES\b/i, extraAllowedIdentifiers: new Set(['VARIABLES']) },
  { pattern: /^FREQUENCIES\b/i, extraAllowedIdentifiers: new Set(['VARIABLES']) },
  { pattern: /^MEANS\b/i, extraAllowedIdentifiers: new Set(['TABLES']) },
  { pattern: /^CORRELATIONS\b/i, extraAllowedIdentifiers: new Set(['VARIABLES']) },
  { pattern: /^EXAMINE\b/i, extraAllowedIdentifiers: new Set(['VARIABLES']) },
  { pattern: /^CROSSTABS\b/i, extraAllowedIdentifiers: new Set(['TABLES']) },
  { pattern: /^ONEWAY\b/i, extraAllowedIdentifiers: new Set() },
  { pattern: /^NONPAR\s+CORR\b/i, extraAllowedIdentifiers: new Set(['VARIABLES']) },
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

const ANALYSIS_ONLY_BLOCKED_COMMANDS = [
  { pattern: /^\s*DATASET\b/im, label: 'DATASET', reason: 'they manage dataset and session state' },
  { pattern: /^\s*OMS\b/im, label: 'OMS', reason: 'they reroute output outside the analysis-only sandbox' },
  { pattern: /^\s*COMPUTE\b/im, label: 'COMPUTE', reason: 'it writes transformed values back into the dataset' },
  { pattern: /^\s*RECODE\b/im, label: 'RECODE', reason: 'it rewrites data values instead of running a read-only analysis' },
  { pattern: /^\s*IF\b/im, label: 'IF', reason: 'it conditionally rewrites data values instead of running a read-only analysis' },
  { pattern: /^\s*DO\s+IF\b/im, label: 'DO IF', reason: 'it opens a transformation block that rewrites data values' },
  { pattern: /^\s*ELSE\s+IF\b/im, label: 'ELSE IF', reason: 'it continues a transformation block that rewrites data values' },
  { pattern: /^\s*DO\s+REPEAT\b/im, label: 'DO REPEAT', reason: 'it expands repeated transformations that rewrite data values' },
  { pattern: /^\s*COUNT\b/im, label: 'COUNT', reason: 'it writes derived values back into the dataset' },
  { pattern: /^\s*AUTORECODE\b/im, label: 'AUTORECODE', reason: 'it writes recoded values back into the dataset' },
  { pattern: /^\s*(?:NUMERIC|STRING|VECTOR)\b/im, label: 'NUMERIC/STRING/VECTOR', reason: 'they create writable variables instead of running a read-only analysis' },
  { pattern: /^\s*AGGREGATE\b/im, label: 'AGGREGATE', reason: 'it can create target variables that are not allowed in analysis-only mode' },
  { pattern: /^\s*VALUE\s+LABELS\b/im, label: 'VALUE LABELS', reason: 'it mutates metadata instead of running an analysis' },
  { pattern: /^\s*VARIABLE\s+LABELS\b/im, label: 'VARIABLE LABELS', reason: 'it mutates metadata instead of running an analysis' },
  { pattern: /^\s*FORMATS\b/im, label: 'FORMATS', reason: 'it mutates metadata instead of running an analysis' },
  { pattern: /^\s*MISSING\s+VALUES\b/im, label: 'MISSING VALUES', reason: 'it mutates metadata instead of running an analysis' },
  { pattern: /^\s*RENAME\s+VARIABLES\b/im, label: 'RENAME VARIABLES', reason: 'it mutates variable schema instead of running an analysis' },
  { pattern: /^\s*NEW\s+FILE\b/im, label: 'NEW FILE', reason: 'it opens or resets session state' },
  { pattern: /^\s*(?:GET\s+(?:FILE|DATA)|IMPORT)\b/im, label: 'GET FILE/GET DATA/IMPORT', reason: 'they import external data into the session' },
  { pattern: /^\s*(?:SAVE|XSAVE|EXPORT)\b/im, label: 'SAVE/XSAVE/EXPORT', reason: 'they write data outside the analysis-only sandbox' },
  { pattern: /^\s*OUTPUT\s+(?:NEW|OPEN|CLOSE|SAVE|EXPORT|MODIFY)\b/im, label: 'OUTPUT', reason: 'it changes output routing or writes external output' },
  { pattern: /^\s*SPLIT\s+FILE\b/im, label: 'SPLIT FILE', reason: 'it changes split-processing state between analysis blocks' },
  { pattern: /^\s*FILTER(?:\s+(?:BY|OFF))?\b/im, label: 'FILTER/FILTER BY/FILTER OFF', reason: 'it changes row-filter state between analysis blocks' },
  { pattern: /^\s*SELECT\s+IF\b/im, label: 'SELECT IF', reason: 'it changes the active case set between analysis blocks' },
  { pattern: /^\s*USE\s+ALL\b/im, label: 'USE ALL', reason: 'it resets row-filter state between analysis blocks' },
  { pattern: /^\s*TEMPORARY\b/im, label: 'TEMPORARY', reason: 'it changes case-selection state between analysis blocks' },
  { pattern: /^\s*SORT\s+CASES\b/im, label: 'SORT CASES', reason: 'it changes case order between analysis blocks' },
  { pattern: /^\s*RANK\b/im, label: 'RANK', reason: 'it writes ranked values back into the dataset' },
  { pattern: /^\s*(?:FILE\s+HANDLE|ADD\s+FILES|MATCH\s+FILES|UPDATE|INSERT|INCLUDE|WRITE|PRINT)\b/im, label: 'file/session management commands', reason: 'they open, merge, or write external resources' },
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

const buildColumnProfile = ({ originalName = '', outputName = '', token = '', allValues = [], sampleValues = [] } = {}) => {
  const normalizedValues = allValues.map(normalizeCell);
  const nonEmptyValues = normalizedValues.filter(Boolean);
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

  return {
    token,
    originalName,
    outputName,
    aliases: Array.from(new Set([originalName, outputName].filter(Boolean))),
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
    numericStats: numericValues.length
      ? {
          min,
          max,
          uniqueValues: uniqueNumericValues,
          integerLike: numericValues.every((value) => Number.isInteger(value)),
        }
      : null,
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
  if (!columnCount) throw new Error('לא זוהו עמודות בקובץ ה-CSV.');

  const headerRow = Array.from({ length: columnCount }, (_, index) => normalizeHeaderLabel(rows[0]?.[index], index));
  const originalNames = ensureUniqueLabels(headerRow);
  const outputNames = ensureUniqueSpssNames(originalNames);
  const dataRows = rows.slice(1).map((row) => Array.from({ length: columnCount }, (_, index) => normalizeCell(row?.[index])));
  const sampleRows = dataRows.slice(0, MAX_INFERENCE_ROWS);

  const columns = originalNames.map((originalName, index) => buildColumnProfile({
    originalName,
    outputName: outputNames[index],
    token: `VAR_${index + 1}`,
    allValues: dataRows.map((row) => row[index]),
    sampleValues: sampleRows.map((row) => row[index]),
  }));

  return {
    fileName: String(fileName || '').trim(),
    rowCount: dataRows.length,
    columnCount: columns.length,
    inferenceSampleRowCount: Math.min(sampleRows.length, MAX_INFERENCE_ROWS),
    columns,
    tokenToOriginalName: Object.fromEntries(columns.map((column) => [column.token, column.originalName])),
    tokenToOutputName: Object.fromEntries(columns.map((column) => [column.token, column.outputName])),
    originalNameToToken: Object.fromEntries(columns.flatMap((column) => column.aliases.map((alias) => [alias, column.token]))),
  };
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
      reason: 'Load a CSV file before using quick actions.',
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
    value: 'טען קודם קובץ CSV כדי להתחיל לבנות syntax.',
  },
  {
    pattern: /^Load a CSV file before using quick actions\.$/i,
    value: 'טען קודם קובץ CSV לפני שימוש בפעולות המהירות.',
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
  const binaryGroupColumn = scopedCategoricalColumns.find((column) => column.distinctCount === 2);
  const explicitlyRequestedBinaryGroupColumn = explicitlyRequestedGroupColumns.find((column) => column.distinctCount === 2);

  if (T_TEST_PATTERN.test(cleanRequest)) {
    if (requestedNonNumericAnalysisColumns.length) {
      return `T-test requires numeric requested test variables: ${formatColumnNames(requestedNonNumericAnalysisColumns)}.`;
    }
    if (!scopedRequestedAnalysisNumericColumns.length) return 'T-test requires a numeric test variable.';
    if (!explicitlyRequestedGroupColumns.length) {
      return 'T-test requires an explicitly requested grouping variable with exactly two groups.';
    }
    if (!explicitlyRequestedBinaryGroupColumn) {
      return 'The requested T-test grouping variable must have exactly two groups.';
    }
    if (!binaryGroupColumn) return 'T-test requires a grouping variable with exactly two groups.';
  }

  if (CORRELATION_PATTERN.test(cleanRequest) && scopedNonNumericColumns.length) {
    return `Correlation requires numeric requested variables: ${formatColumnNames(scopedNonNumericColumns)}.`;
  }

  if (CORRELATION_PATTERN.test(cleanRequest) && scopedNumericColumns.length < 2) {
    return 'Correlation requires at least two numeric variables.';
  }

  if (REGRESSION_PATTERN.test(cleanRequest) && scopedNonNumericColumns.length) {
    return `Regression requires numeric requested variables: ${formatColumnNames(scopedNonNumericColumns)}.`;
  }

  if (REGRESSION_PATTERN.test(cleanRequest) && scopedNumericColumns.length < 2) {
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
    if (!explicitlyRequestedGroupColumns.length) {
      return 'ANOVA requires an explicitly requested grouping variable with at least three groups.';
    }
    if (!explicitlyRequestedMultiGroupColumn) {
      return 'The requested ANOVA grouping variable must have at least three groups.';
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

const findBlockedAnalysisOnlyCommandIssue = (input = '') => {
  for (const command of getSpssCommands(input)) {
    for (const { pattern, label, reason } of ANALYSIS_ONLY_BLOCKED_COMMANDS) {
      pattern.lastIndex = 0;
      if (pattern.test(command)) {
        return `Analysis-only mode blocks ${label} because ${reason}.`;
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

export const restoreColumnTokens = (text = '', analysis = null) => {
  const tokenMap = analysis?.tokenToOutputName && typeof analysis.tokenToOutputName === 'object'
    ? analysis.tokenToOutputName
    : {};
  return Object.entries(tokenMap)
    .sort((left, right) => right[0].length - left[0].length)
    .reduce((currentText, entry) => currentText.replace(new RegExp(`\\b${escapeRegExp(entry[0])}\\b`, 'g'), escapeReplacement(entry[1])), String(text || '').trim());
};

export const sanitizeSpssSyntax = (text = '', analysis = null) => {
  const cleaned = commentOutNonSpssTextLines(stripMarkdownArtifacts(text))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!cleaned) return buildErrorLine('The model returned an empty SPSS response.');

  const allowedTokens = new Set(Array.isArray(analysis?.columns) ? analysis.columns.map((column) => column.token) : []);
  const syntaxOnly = stripSpssCommentLines(cleaned);
  const syntaxCommands = getSpssCommands(syntaxOnly);
  if (!syntaxCommands.length) {
    return buildErrorLine('The model returned comments without executable SPSS commands.');
  }
  const blockedCommandIssue = findBlockedAnalysisOnlyCommandIssue(syntaxCommands);
  if (blockedCommandIssue) {
    return buildErrorLine(blockedCommandIssue);
  }

  const referencedTokens = extractReferencedTokens(syntaxOnly);
  const unknownTokens = referencedTokens.filter((token) => !allowedTokens.has(token));
  if (unknownTokens.length) {
    return buildErrorLine(`The model referenced unknown variables: ${unknownTokens.join(', ')}.`);
  }

  const invalidIdentifiers = Array.from(new Set([
    ...extractInvalidVariableIdentifiers(syntaxCommands, allowedTokens),
    ...extractInvalidGraphIdentifiers(syntaxCommands, allowedTokens),
    ...extractInvalidExpressionIdentifiers(syntaxCommands, allowedTokens),
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

const buildTokenizedMetadataLines = (analysis = null) => {
  const columns = Array.isArray(analysis?.columns) ? analysis.columns : [];
  return columns.map((column) => {
    const numericRange = column.numericStats && column.numericStats.min !== null && column.numericStats.max !== null
      ? `; range=${formatNumericLiteral(column.numericStats.min)}..${formatNumericLiteral(column.numericStats.max)}`
      : '';
    const observedValues = formatObservedLiteralMetadata(column);
    return `${column.token}: type=${column.inferredType}; level=${column.measurementLevel}; missing=${column.missingCount}; distinct=${column.distinctCount}${numericRange}${observedValues}`;
  }).join('\n');
};

const buildSpssSystemPrompt = ({ analysis = null, tutorMode = false } = {}) => {
  const allowedTokens = Array.isArray(analysis?.columns) ? analysis.columns.map((column) => column.token).join(', ') : '';
  return [
    'אתה מחזיר SPSS syntax בלבד עבור SPSS Syntax Studio בתוך WordFlow.',
    'אסור להחזיר markdown, bullets, כותרות, הסברים חופשיים, או fences.',
    'מותר להחזיר רק פקודות SPSS ושורות comment של SPSS שמתחילות ב-* .',
    `העמודות המותרות היחידות הן: ${allowedTokens || 'none'}.`,
    'אסור להמציא משתנים חדשים. אין להשתמש ב-INTO או ב-COMPUTE כדי ליצור שם חדש שאינו VAR_n קיים.',
    'זהו מסלול analysis-only. אל תחזיר COMPUTE, RECODE, IF, DO IF, ELSE IF, DO REPEAT, COUNT, AUTORECODE, NUMERIC, STRING, VECTOR או כל פקודת transformation שמשנה ערכי data או metadata.',
    'אם הבקשה לא תקפה מתודולוגית, החזר רק שורות comment שמתחילות ב-* ERROR:.',
    tutorMode
      ? 'Tutor mode פעיל: לפני הבלוק הוסף 1-2 שורות comment קצרות בעברית שמסבירות למה בחרת בפרוצדורה.'
      : 'Tutor mode כבוי: אל תוסיף comment אלא אם זו שגיאת * ERROR:.',
    'ה-metadata הבא הוא metadata טוקניזי בלבד. אין לך גישה לשורות הדאטה, ואסור לך לטעון שיש לך גישה כזו.',
    'אם צריך literals מפורשים ב-/GROUPS, ב-BY(...), או ב-RECODE, השתמש רק ב-observedValues שסופקו במשתנים המתאימים. אם אין observedValues, אל תנחש literals.',
    'Metadata:',
    buildTokenizedMetadataLines(analysis),
  ].filter(Boolean).join('\n');
};

export const generateSpssSyntax = async ({ analysis = null, request = '', tutorMode = false } = {}) => {
  if (!analysis || !Array.isArray(analysis.columns) || !analysis.columns.length) {
    return {
      ok: false,
      tokenizedRequest: '',
      rawSyntax: '',
      syntax: '',
      guidanceMessage: getGuardrailGuidanceMessage('Load a CSV file before generating syntax.'),
      providerId: '',
      model: '',
      source: 'guardrail',
    };
  }

  const cleanRequest = String(request || '').trim();
  const methodologyIssue = detectMethodologyIssue(cleanRequest, analysis);
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
  const { chatWithActiveProvider, getProviderConfig } = await import('./aiService.js');
  const providerConfig = getProviderConfig();
  const providerId = String(providerConfig?.active || '').trim();
  const providerModel = providerId && providerConfig?.[providerId]?.model
    ? String(providerConfig[providerId].model || '').trim()
    : '';

  const rawResponse = await chatWithActiveProvider(tokenizedRequest, '', buildSpssSystemPrompt({ analysis, tutorMode }), {
    providerOverride: providerId || undefined,
    strictProviderOverride: Boolean(providerId),
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
  const syntax = sanitizeSpssSyntax(rawSyntax, analysis);
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
