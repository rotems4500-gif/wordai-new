// projectService.js — תיקיות פרויקטים: קיבוץ מסמכים + קונטקסט מתמיד (הוראות, חומרים,
// זיכרון שיחות מצטבר) שמוזרק אוטומטית לכל עבודת AI בתוך הפרויקט.
//
// אחסון: מפתח יחיד 'wordai_projects_v1' (בבעלות בלעדית של המודול הזה).
// בכוונה לא בתוך ה-blob של workspaces V3 — פרויקט הוא קיבוץ תוכן, לא קונפיגורציית AI,
// וה-blob נמצא באמצע מיגרציה (dual-write). מיזוג רב-מכשירי משתמש באותו דפוס tombstone
// של mergeWorkspaceMaps (רשומה חדשה יותר מנצחת, מחיקה רכה לא קמה לתחייה).

import {
  chatWithActiveProvider,
  syncPersistedAppSettings,
} from './aiService';
import {
  readInstructionFile,
  loadProjectMaterials,
  getSavedDocsHistory,
  updateDocumentHistoryEntry,
} from './workspaceLearningService';
export const PROJECTS_STORAGE_KEY = 'wordai_projects_v1';
export const PROJECTS_SCHEMA_VERSION = 1;
export const PROJECTS_UPDATED_EVENT = 'wordai-projects-updated';

// תקרות קונטקסט (תווים). הקונטקסט של הפרויקט הוא משלים — מוגבל כך שלא ידחק את
// קונטקסט המסמך עצמו (שמוגבל ב-48k ב-workspaceLearningService).
const PROJECT_INSTRUCTIONS_MAX_CHARS = 3000;
const PROJECT_INSTRUCTION_FILE_MAX_CHARS = 6000;
const PROJECT_MATERIALS_CONTEXT_MAX_CHARS = 8000;
const PROJECT_MEMORY_CONTEXT_MAX_CHARS = 6000;
const PROJECT_CONTEXT_TOTAL_MAX_CHARS = 16000;
const MEMORY_SUMMARY_MAX_CHARS = 800;
const MEMORY_TITLE_MAX_CHARS = 80;
const MEMORY_RAW_EXCERPT_MAX_CHARS = 1200;
const MAX_MEMORY_ENTRIES = 40;
const SUMMARIZE_TRANSCRIPT_MAX_CHARS = 24000;

const MEMORY_SOURCE_LABELS = {
  'brainstorm-start': 'שיחת תכנון (מסך הבית)',
  'brainstorm-sidebar': 'שיחת תכנון (בתוך מסמך)',
  'external-link': 'שיחה חיצונית מצורפת',
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const nowIso = () => new Date().toISOString();

const makeId = () => `prj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const makeMemoryId = () => `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function emitProjectsUpdated() {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(PROJECTS_UPDATED_EVENT));
  } catch {}
}

function readBlob() {
  if (typeof window === 'undefined') return { schemaVersion: PROJECTS_SCHEMA_VERSION, updatedAt: '', projects: {} };
  let parsed = null;
  try {
    parsed = JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY) || '');
  } catch {}
  if (!isPlainObject(parsed) || !isPlainObject(parsed.projects)) {
    return { schemaVersion: PROJECTS_SCHEMA_VERSION, updatedAt: '', projects: {} };
  }
  return parsed;
}

function writeBlob(blob) {
  if (typeof window === 'undefined') return;
  const next = {
    schemaVersion: PROJECTS_SCHEMA_VERSION,
    updatedAt: nowIso(),
    projects: isPlainObject(blob?.projects) ? blob.projects : {},
  };
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
    syncPersistedAppSettings();
  } catch {}
  emitProjectsUpdated();
}

function normalizeProject(raw = {}) {
  return {
    id: String(raw.id || '').trim(),
    name: String(raw.name || '').trim(),
    createdAt: String(raw.createdAt || ''),
    updatedAt: String(raw.updatedAt || ''),
    instructions: String(raw.instructions || ''),
    instructionFileText: String(raw.instructionFileText || ''),
    instructionFileName: String(raw.instructionFileName || ''),
    materialIds: Array.isArray(raw.materialIds) ? raw.materialIds.map(String).filter(Boolean) : [],
    documentIds: Array.isArray(raw.documentIds) ? raw.documentIds.map(String).filter(Boolean) : [],
    memory: Array.isArray(raw.memory) ? raw.memory.filter(isPlainObject) : [],
    linkedWorkspaceId: String(raw.linkedWorkspaceId || ''),
    deletedAt: raw.deletedAt || null,
  };
}

function mutateProject(projectId, mutator) {
  const cleanId = String(projectId || '').trim();
  if (!cleanId) return null;
  const blob = readBlob();
  const existing = blob.projects[cleanId];
  if (!isPlainObject(existing)) return null;
  const project = normalizeProject(existing);
  const mutated = mutator(project) || project;
  mutated.updatedAt = nowIso();
  blob.projects[cleanId] = mutated;
  writeBlob(blob);
  return mutated;
}

// ── CRUD ──

export function getProjectsLibrary() {
  return readBlob().projects;
}

export function getProject(projectId) {
  const raw = readBlob().projects[String(projectId || '').trim()];
  if (!isPlainObject(raw) || raw.deletedAt) return null;
  return normalizeProject(raw);
}

export function listProjects({ includeDeleted = false } = {}) {
  return Object.values(readBlob().projects)
    .filter(isPlainObject)
    .map(normalizeProject)
    .filter((p) => p.id && (includeDeleted || !p.deletedAt))
    .sort((a, b) => (Date.parse(b.updatedAt || b.createdAt) || 0) - (Date.parse(a.updatedAt || a.createdAt) || 0));
}

export function createProject({ name = '' } = {}) {
  const cleanName = String(name || '').trim() || 'פרויקט חדש';
  const blob = readBlob();
  const project = normalizeProject({
    id: makeId(),
    name: cleanName,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  blob.projects[project.id] = project;
  writeBlob(blob);
  return project;
}

export function renameProject(projectId, name) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return null;
  return mutateProject(projectId, (p) => { p.name = cleanName; return p; });
}

// מחיקה רכה: tombstone עם deletedAt, כדי שמיזוג ענן לא יחזיר את הפרויקט ממכשיר מיושן.
export function deleteProject(projectId) {
  return mutateProject(projectId, (p) => { p.deletedAt = nowIso(); return p; });
}

// ── הוראות ──

export function updateProjectInstructions(projectId, text) {
  return mutateProject(projectId, (p) => {
    p.instructions = String(text || '');
    return p;
  });
}

export async function attachProjectInstructionFile(projectId, file) {
  if (!file) return null;
  const extractedText = await readInstructionFile(file, PROJECT_INSTRUCTION_FILE_MAX_CHARS);
  return mutateProject(projectId, (p) => {
    p.instructionFileText = String(extractedText || '');
    p.instructionFileName = String(file.name || '');
    return p;
  });
}

export function removeProjectInstructionFile(projectId) {
  return mutateProject(projectId, (p) => {
    p.instructionFileText = '';
    p.instructionFileName = '';
    return p;
  });
}

// ── חומרים (הפניות לחומרים הקיימים — לא העתקה) ──

export function attachMaterialToProject(projectId, materialId) {
  const cleanMaterialId = String(materialId || '').trim();
  if (!cleanMaterialId) return null;
  return mutateProject(projectId, (p) => {
    if (!p.materialIds.includes(cleanMaterialId)) p.materialIds.push(cleanMaterialId);
    return p;
  });
}

export function detachMaterialFromProject(projectId, materialId) {
  const cleanMaterialId = String(materialId || '').trim();
  return mutateProject(projectId, (p) => {
    p.materialIds = p.materialIds.filter((id) => id !== cleanMaterialId);
    return p;
  });
}

// חומרי הפרויקט: חומרים שמזוהים ב-materialIds או שהועלו עם projectId תואם.
export async function loadProjectScopedMaterials(projectId) {
  const project = getProject(projectId);
  if (!project) return [];
  const all = await loadProjectMaterials();
  const idSet = new Set(project.materialIds);
  return all.filter((m) => idSet.has(String(m.id || '')) || String(m.projectId || '') === project.id);
}

// ── מסמכים ──

export function assignDocumentToProject(docHistoryId, projectId) {
  const cleanDocId = String(docHistoryId || '').trim();
  const cleanProjectId = String(projectId || '').trim();
  if (!cleanDocId) return null;

  updateDocumentHistoryEntry(cleanDocId, { projectId: cleanProjectId });

  // הסרה מכל פרויקט אחר + הוספה לפרויקט היעד.
  const blob = readBlob();
  let changed = false;
  Object.values(blob.projects).forEach((raw) => {
    if (!isPlainObject(raw) || !Array.isArray(raw.documentIds)) return;
    const idx = raw.documentIds.indexOf(cleanDocId);
    if (idx >= 0 && raw.id !== cleanProjectId) {
      raw.documentIds.splice(idx, 1);
      raw.updatedAt = nowIso();
      changed = true;
    }
  });
  const target = cleanProjectId ? blob.projects[cleanProjectId] : null;
  if (isPlainObject(target)) {
    if (!Array.isArray(target.documentIds)) target.documentIds = [];
    if (!target.documentIds.includes(cleanDocId)) {
      target.documentIds.push(cleanDocId);
      target.updatedAt = nowIso();
      changed = true;
    }
  }
  if (changed) writeBlob(blob);
  return getProject(cleanProjectId);
}

export function unassignDocumentFromProject(docHistoryId) {
  return assignDocumentToProject(docHistoryId, '');
}

export function getProjectDocuments(projectId) {
  const cleanProjectId = String(projectId || '').trim();
  if (!cleanProjectId) return [];
  return getSavedDocsHistory().filter((entry) => String(entry?.projectId || '') === cleanProjectId);
}

export function getUngroupedDocuments() {
  const activeIds = new Set(listProjects().map((p) => p.id));
  return getSavedDocsHistory().filter((entry) => {
    const pid = String(entry?.projectId || '');
    return !pid || !activeIds.has(pid); // מסמך של פרויקט שנמחק חוזר להיות "ללא פרויקט"
  });
}

// המסמך הפתוח → הפרויקט שלו (לפי filePath בהיסטוריה, ואם אין — לפי id).
export function getProjectForDocument({ filePath = '', docHistoryId = '' } = {}) {
  const cleanPath = String(filePath || '').trim();
  const cleanDocId = String(docHistoryId || '').trim();
  if (!cleanPath && !cleanDocId) return null;
  const entry = getSavedDocsHistory().find((item) => (
    (cleanPath && String(item?.filePath || '').trim() === cleanPath)
    || (cleanDocId && String(item?.id || '') === cleanDocId)
  ));
  const pid = String(entry?.projectId || '').trim();
  return pid ? getProject(pid) : null;
}

// ── זיכרון שיחות ──

export function getProjectMemory(projectId) {
  const project = getProject(projectId);
  return project ? project.memory : [];
}

export function appendProjectMemory(projectId, entry = {}) {
  const cleanSummary = String(entry.summary || '').trim();
  if (!cleanSummary) return null;
  const memoryEntry = {
    id: makeMemoryId(),
    source: MEMORY_SOURCE_LABELS[entry.source] ? entry.source : 'brainstorm-start',
    createdAt: nowIso(),
    title: String(entry.title || '').trim().slice(0, MEMORY_TITLE_MAX_CHARS),
    summary: cleanSummary.slice(0, MEMORY_SUMMARY_MAX_CHARS),
    sourceUrl: String(entry.sourceUrl || '').trim(),
    rawExcerpt: String(entry.rawExcerpt || '').trim().slice(0, MEMORY_RAW_EXCERPT_MAX_CHARS),
  };
  const updated = mutateProject(projectId, (p) => {
    p.memory = [...p.memory, memoryEntry].slice(-MAX_MEMORY_ENTRIES);
    return p;
  });
  return updated ? memoryEntry : null;
}

export function removeProjectMemory(projectId, memoryId) {
  const cleanMemoryId = String(memoryId || '').trim();
  return mutateProject(projectId, (p) => {
    p.memory = p.memory.filter((m) => String(m?.id || '') !== cleanMemoryId);
    return p;
  });
}

/**
 * מסכם שיחה (או טקסט מודבק של שיחה חיצונית) לרשומת זיכרון קצרה.
 * transcript: מחרוזת או מערך הודעות [{role, content}].
 * רץ על הספק הפעיל בקריאה ישירה שקטה (בלי אוטומציה/מקורות/סגנון אישי).
 */
export async function summarizeConversationForMemory({ transcript = '', source = 'brainstorm-start', sourceUrl = '' } = {}) {
  const text = (Array.isArray(transcript)
    ? transcript
      .map((m) => `${m?.role === 'user' ? 'משתמש' : 'עוזר'}: ${String(m?.content || m?.text || '').trim()}`)
      .filter((line) => line.length > 8)
      .join('\n')
    : String(transcript || '')
  ).trim().slice(0, SUMMARIZE_TRANSCRIPT_MAX_CHARS);

  if (text.length < 40) {
    throw new Error('השיחה קצרה מדי לסיכום — אין מספיק תוכן לשמור.');
  }

  const systemPrompt = `== AGENT: PROJECT MEMORY SUMMARIZER ==
אתה מסכם שיחת תכנון לזיכרון פרויקט. קרא את השיחה והפק סיכום תמציתי של המסקנות בלבד:
כיוון שנבחר, החלטות שהתקבלו, מבנה/נושא/טיעון שסוכמו, ומה נותר פתוח.
אל תסכם את מהלך השיחה ("המשתמש שאל... העוזר ענה...") — רק את השורה התחתונה.
החזר בדיוק בפורמט הבא, בעברית, בלי שום טקסט נוסף:
כותרת: <כותרת קצרה עד 8 מילים>
סיכום: <עד 10 שורות של מסקנות והחלטות>
== END AGENT ==`;

  const response = String(await chatWithActiveProvider(
    `סכם את השיחה הבאה לזיכרון הפרויקט:\n\n${text}`,
    '',
    systemPrompt,
    {
      agentLabel: 'זיכרון פרויקט',
      skipAutomation: true,
      skipMultiModel: true,
      directChat: true,
      suppressPersonalStyle: true,
    },
  ) || '').trim();

  const titleMatch = response.match(/כותרת:\s*(.+)/);
  const summaryMatch = response.match(/סיכום:\s*([\s\S]+)/);
  const summary = String(summaryMatch?.[1] || response).trim();
  if (!summary) throw new Error('הסיכום חזר ריק — נסה שוב.');

  return {
    source,
    sourceUrl,
    title: String(titleMatch?.[1] || '').trim(),
    summary,
    rawExcerpt: text.slice(0, MEMORY_RAW_EXCERPT_MAX_CHARS),
  };
}

// ── קישור לשיחה חיצונית ──

const EXTERNAL_CHAT_SHARE_PATTERNS = [
  /^https:\/\/chatgpt\.com\/share\//i,
  /^https:\/\/chat\.openai\.com\/share\//i,
  /^https:\/\/gemini\.google\.com\/share\//i,
  /^https:\/\/g\.co\/gemini\/share\//i,
  /^https:\/\/claude\.ai\/share\//i,
];

export function isSupportedExternalChatShareUrl(url = '') {
  const clean = String(url || '').trim();
  return EXTERNAL_CHAT_SHARE_PATTERNS.some((pattern) => pattern.test(clean));
}

// ── הרכבת קונטקסט — התפר היחיד שקוראים משתמשים בו ──

function clip(text, max) {
  const clean = String(text || '').trim();
  return clean.length > max ? `${clean.slice(0, max)}\n[... קוצר ...]` : clean;
}

/**
 * בונה בלוק קונטקסט מלא של הפרויקט להזרקה כ-extraSystemPrompt.
 * מחזיר '' כשאין פרויקט/אין תוכן — כך שקוראים יכולים תמיד לקרוא בלי בדיקה.
 */
export async function buildProjectContextBlock(projectId) {
  const project = getProject(projectId);
  if (!project) return '';

  const sections = [];

  const instructions = clip(project.instructions, PROJECT_INSTRUCTIONS_MAX_CHARS);
  if (instructions) sections.push(`הנחיות קבועות של הפרויקט:\n${instructions}`);

  const fileText = clip(project.instructionFileText, PROJECT_INSTRUCTION_FILE_MAX_CHARS);
  if (fileText) sections.push(`קובץ הנחיות (${project.instructionFileName || 'קובץ'}):\n${fileText}`);

  try {
    const materials = await loadProjectScopedMaterials(project.id);
    if (materials.length) {
      let used = 0;
      const lines = [];
      materials.forEach((m) => {
        if (used >= PROJECT_MATERIALS_CONTEXT_MAX_CHARS) return;
        const budget = PROJECT_MATERIALS_CONTEXT_MAX_CHARS - used;
        const preview = String(m.previewText || '').trim().slice(0, Math.max(0, budget - 100));
        const line = `- ${m.title} (${m.label || 'כללי'})${preview ? `\n${preview}` : ''}`;
        lines.push(line);
        used += line.length;
      });
      if (lines.length) sections.push(`חומרי הפרויקט:\n${lines.join('\n')}`);
    }
  } catch {}

  const memory = [...project.memory].reverse(); // אחרונים קודם
  if (memory.length) {
    let used = 0;
    const lines = [];
    memory.forEach((m) => {
      if (used >= PROJECT_MEMORY_CONTEXT_MAX_CHARS) return;
      const label = MEMORY_SOURCE_LABELS[m.source] || 'שיחה';
      const line = `• [${label}${m.title ? ` — ${m.title}` : ''}]\n${String(m.summary || '').trim()}`;
      if (used + line.length > PROJECT_MEMORY_CONTEXT_MAX_CHARS) return;
      lines.push(line);
      used += line.length;
    });
    if (lines.length) sections.push(`מסקנות משיחות קודמות בפרויקט (מהחדש לישן):\n${lines.join('\n\n')}`);
  }

  if (!sections.length) return '';

  const block = [
    `== הקשר פרויקט: ${project.name} ==`,
    'המסמך הנוכחי שייך לפרויקט הזה. השתמש בהקשר הבא כרקע מחייב לכל תשובה, בלי לחזור עליו מילולית:',
    ...sections,
    '== סוף הקשר פרויקט ==',
  ].join('\n\n');

  return clip(block, PROJECT_CONTEXT_TOTAL_MAX_CHARS);
}
