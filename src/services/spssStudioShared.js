// spssStudioShared.js — Shared helpers for SpssProjectStudio & SpssSyntaxStudio
// Extracted to avoid duplication of helpers used in both studios.

import { splitMergedSpssLines } from './spssSyntaxService';

// ─────────────────────────────────────────────────────────────────────
// createLocalId: Generate a deterministic session-local ID for blocks
// ─────────────────────────────────────────────────────────────────────
export const createLocalId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `spss-proj-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

// ─────────────────────────────────────────────────────────────────────
// PREP_METHOD_PATTERN: Regex to detect methods that need data-prep mode
// (they write new variables back to the data).
// Note: ProjectStudio version (richer) — includes dummy, missing, דמ[יה], חסר
// ─────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────
// buildCritiqueFingerprint: Fingerprint of critique issues for detecting repeats
// Used to detect when a fix round changed nothing (same issues reappeared).
// ─────────────────────────────────────────────────────────────────────
export const buildCritiqueFingerprint = (issues = []) => issues
  .map((issue) => `${issue?.label || ''}|${issue?.problem || ''}`.toLowerCase().replace(/\s+/g, ' ').trim())
  .sort()
  .join('§');

// ─────────────────────────────────────────────────────────────────────
// buildAdviceFingerprint: same idea for lecturer recommendations — detects
// the advisor repeating an already-applied recommendation (advice loop).
// ─────────────────────────────────────────────────────────────────────
export const buildAdviceFingerprint = (recommendations = []) => (Array.isArray(recommendations) ? recommendations : [])
  .map((rec) => `${rec?.suggestedAnalysis || ''}|${(Array.isArray(rec?.suggestedVariables) ? rec.suggestedVariables : []).join(',')}|${rec?.recommendation || ''}`.toLowerCase().replace(/\s+/g, ' ').trim())
  .sort()
  .join('§');


export const PREP_METHOD_PATTERN = /(reliability|cronbach|recode|compute|scale|index|reverse|dummy|missing|מהימנות|סולם|מדד|היפוך|recoding|דמ[יה]|חסר)/i;

// ─────────────────────────────────────────────────────────────────────
// buildSafeFileStem: Sanitize filename to safe identifier
// ─────────────────────────────────────────────────────────────────────
export const buildSafeFileStem = (value = 'wordflow-spss') => {
  const base = String(value || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  return base || 'wordflow-spss';
};

// ─────────────────────────────────────────────────────────────────────
// Constants for stripAssemblyArtifacts (ProjectStudio only)
// ─────────────────────────────────────────────────────────────────────
const MASTER_SYNTAX_PREAMBLE = [
  '* ═══════════════════════════════════════════════════════════════════════.',
  '* חשוב: הרץ את כל הסינטקס יחד, מלמעלה למטה, על קובץ הנתונים המקורי (Run → All).',
  '* משתנים מחושבים (כמו age_groups / attitude_index) נוצרים בשלבי ההכנה ונשמרים רק בזיכרון.',
  '* אם תריץ רק חלק מהקוד, או תפתח מחדש את הנתונים — הם ייעלמו ותקבל "undefined variable name".',
  '* ═══════════════════════════════════════════════════════════════════════.',
].join('\n');

const PREAMBLE_LINE_SET = new Set(MASTER_SYNTAX_PREAMBLE.split('\n').map((line) => line.trim()));
const BLOCK_MARKER_PATTERN = /^\* --- \d+\. .* ---\.$/;

// ─────────────────────────────────────────────────────────────────────
// stripAssemblyArtifacts: Remove preamble & markers added during build
// (ProjectStudio only — removes stale copies from LLM round-trips)
// ─────────────────────────────────────────────────────────────────────
export const stripAssemblyArtifacts = (syntax = '') => String(syntax || '')
  .split('\n')
  .filter((line) => {
    const trimmed = line.trim();
    return !PREAMBLE_LINE_SET.has(trimmed) && !BLOCK_MARKER_PATTERN.test(trimmed);
  })
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

// ─────────────────────────────────────────────────────────────────────
// formatTime: Format timestamp to Hebrew locale (SyntaxStudio only)
// ─────────────────────────────────────────────────────────────────────
export const formatTime = (value = 0) => new Date(value || Date.now()).toLocaleTimeString('he-IL', {
  hour: '2-digit',
  minute: '2-digit',
});

// ─────────────────────────────────────────────────────────────────────
// normalizeBlockTitle: Collapse whitespace in block titles (SyntaxStudio only)
// ─────────────────────────────────────────────────────────────────────
export const normalizeBlockTitle = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

// ─────────────────────────────────────────────────────────────────────
// buildMasterSyntax: Assemble blocks into final SPSS syntax
// Options:
//   stripArtifacts (default true):
//     - true: ProjectStudio mode — strip artifacts, add preamble, use short block markers
//     - false: SyntaxStudio mode — keep as-is, no preamble, use long block markers w/ timestamp
// ─────────────────────────────────────────────────────────────────────
export const buildMasterSyntax = (blocks = [], { stripArtifacts = true } = {}) => {
  const processed = blocks.map((block, index) => {
    if (stripArtifacts) {
      // ProjectStudio mode: minimal marker, strip artifacts
      const marker = `* --- ${index + 1}. ${String(block.title || 'SPSS block').replace(/\s+/g, ' ').trim()} ---.`;
      const syntax = stripAssemblyArtifacts(splitMergedSpssLines(String(block.syntax || '').trim()));
      return [marker, syntax].filter(Boolean).join('\n');
    } else {
      // SyntaxStudio mode: full marker with timestamp, no artifact stripping
      const marker = `* --- Block ${index + 1}: ${normalizeBlockTitle(block.title) || 'SPSS block'} | ${formatTime(block.createdAt)} ---.`;
      const syntax = splitMergedSpssLines(String(block.syntax || '').trim());
      return [marker, syntax].filter(Boolean).join('\n');
    }
  });

  const body = processed.join('\n\n').trim();

  if (stripArtifacts) {
    // ProjectStudio: prepend preamble
    return body ? `${MASTER_SYNTAX_PREAMBLE}\n\n${body}` : '';
  } else {
    // SyntaxStudio: return as-is
    return body;
  }
};
