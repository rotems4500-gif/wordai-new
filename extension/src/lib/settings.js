// settings.js — הגדרות משתמש שנשמרות ב-chrome.storage.sync
// defaultDestination: 'material' | 'source' | 'inbox'
// lastProjectId: string | null (שלב עתידי — כרגע לא בשימוש ב-UI)

const DEFAULTS = {
  defaultDestination: 'material',
  lastProjectId: null,
};

export async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

export async function setDefaultDestination(destination) {
  await chrome.storage.sync.set({ defaultDestination: destination });
}

export async function setLastProjectId(projectId) {
  await chrome.storage.sync.set({ lastProjectId: projectId });
}
