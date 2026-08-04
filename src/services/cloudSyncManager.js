import {
  applyPersistedAppSettingsSnapshot,
  getProviderConfig,
  saveProviderConfig,
} from "./aiService";
import { fetchSettingsFromCloud, syncSettingsToCloud, fetchCloudCryptoMeta } from "../firebase/services";
import {
  isUnlocked,
  encryptSecrets,
  decryptSecrets,
  hasEncryptedSecrets,
} from "./cloudCryptoSession";
import { syncV3FromLegacy as syncWorkspacesV3FromLegacy } from "../v3/workspaces/store";
import {
  ensureStyleTargetsReady,
  exportStyleTargets,
  importStyleTargets,
  STYLE_TARGETS_UPDATED_EVENT,
} from "./styleTargetsStore";

// schema 3 (2026-07-03): נוסף wordai_workspaces_v3 (ה-blob המאוחד של סביבות העבודה)
// + תבניות workspace-v2. לקוחות schema-2 בוחרים מפתחות לפי הרשימה המקומית שלהם ולכן
// מתעלמים מהמפתחות החדשים בבטחה; מפתחות ה-legacy ממשיכים להישלח (dual-write) עבורם.
// schema 4 (2026-08-04): נוסף styleTargets — פרופיל הסגנון המבני (רשומות מדידה).
// אותו כלל בטיחות: normalizeCloudProfile מעתיק **רק** מפתחות מוכרים, ולכן לקוח
// ישן שמושך מסמך schema-4 פשוט מתעלם מהשדה במקום להיחנק בו.
const CLOUD_PROFILE_SCHEMA_VERSION = 4;

// ---- E2EE flag ----
// כבוי כברירת מחדל. מודלק רק אחרי שהמשתמש מגדיר passphrase (setCloudCryptoEnabled(true)).
// כשכבוי — אפס שינוי בהתנהגות הקיימת: providerConfig עולה/יורד גלוי כמו היום.
const CLOUD_CRYPTO_FLAG_KEY = "wordai_cloud_crypto_enabled";

export function isCloudCryptoEnabled() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(CLOUD_CRYPTO_FLAG_KEY) === "1";
}

export function setCloudCryptoEnabled(enabled) {
  if (typeof window === "undefined") return;
  if (enabled) localStorage.setItem(CLOUD_CRYPTO_FLAG_KEY, "1");
  else localStorage.removeItem(CLOUD_CRYPTO_FLAG_KEY);
}

// אירוע ל-UI: נמשכו מהענן מפתחות מוצפנים אבל ה-session נעול → צריך passphrase.
function emitNeedsPassphrase() {
  if (typeof window === "undefined" || typeof CustomEvent === "undefined") return;
  window.dispatchEvent(new CustomEvent("wordai-cloud-crypto-locked"));
}
const CLOUD_PROFILE_SYNC_META_KEY = "wordai_cloud_profile_sync_meta";
const CLOUD_PROFILE_SYNC_DEBOUNCE_MS = 2000;
const CLOUD_PROFILE_APP_SETTING_KEYS = [
  "wordai_shortcuts",
  "wordai_assistant_behavior",
  "wordai_skills_config",
  "wordai_word_preferences",
  "wordai_personal_style",
  "wordai_workspace_automation",
  "wordai_workspaces_library",
  "wordai_workspaces_v3",
  "wordai_workspace_v2_templates",
  "wordai_shared_agent_instructions",
  "wordai_role_agents",
  "wordai_home_instructions",
  "wordai_hidden_project_materials",
  "wordai_projects_v1",
  "wordflow_home_customizations",
  "wordflow_style_overrides",
  "default-font",
  "default-size",
  "citation-style",
];

let debounceTimer = null;
let isSyncingToCloud = false;
let isApplyingCloudSettings = false;
let lastQueuedSnapshotSignature = "";

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return fallback;
  }
}

function readCloudSyncMeta() {
  if (typeof window === "undefined") return {};
  return safeJsonParse(localStorage.getItem(CLOUD_PROFILE_SYNC_META_KEY), {}) || {};
}

function writeCloudSyncMeta(patch = {}) {
  if (typeof window === "undefined") return {};
  const next = {
    ...readCloudSyncMeta(),
    ...(patch && typeof patch === "object" ? patch : {}),
  };
  localStorage.setItem(CLOUD_PROFILE_SYNC_META_KEY, JSON.stringify(next));
  return next;
}

function hasMeaningfulSnapshotData(snapshot = {}) {
  return Boolean(snapshot && typeof snapshot === "object" && Object.keys(snapshot).length);
}

function getCloudProfileAppSettingsSnapshot() {
  if (typeof window === "undefined") return {};

  const snapshot = {};
  CLOUD_PROFILE_APP_SETTING_KEYS.forEach((key) => {
    const value = localStorage.getItem(key);
    if (value !== null) snapshot[key] = value;
  });
  return snapshot;
}

function pickCloudProfileAppSettings(source = {}) {
  const snapshot = {};
  if (!source || typeof source !== "object") return snapshot;

  CLOUD_PROFILE_APP_SETTING_KEYS.forEach((key) => {
    if (typeof source[key] === "string") snapshot[key] = source[key];
  });
  return snapshot;
}

function getLocalProfilePayload() {
  const appSettings = getCloudProfileAppSettingsSnapshot();
  const providerConfig = getProviderConfig();
  const meta = readCloudSyncMeta();
  const profileUpdatedAt = Number(meta.lastLocalMutationAt || 0) || Date.now();

  return {
    schemaVersion: CLOUD_PROFILE_SCHEMA_VERSION,
    profileUpdatedAt,
    appSettings,
    providerConfig,
  };
}

/**
 * אותו payload + פרופיל הסגנון המבני. אסינכרוני כי היעדים יושבים ב-IndexedDB,
 * ולכן הגרסה הסינכרונית נשארת בשימוש ה-poller של initCloudSyncListeners.
 *
 * styleTargets נוסע **גלוי**, כמו appSettings: זו טבלת מספרים (אורך משפט,
 * פסיקים למשפט, ספירות משמורת) עם docId שהוא hash תוכן — אין בו טקסט של
 * המשתמש ואין שם קובץ. ההצפנה נשארת בלעדית ל-providerConfig.
 */
async function getLocalProfilePayloadFull() {
  const payload = getLocalProfilePayload();
  try {
    await ensureStyleTargetsReady();
    payload.styleTargets = exportStyleTargets();
  } catch { /* פרופיל הסגנון הוא שיפור, לא תנאי לסנכרון ההגדרות */ }
  return payload;
}

function buildPayloadSignature(payload = {}) {
  try {
    return JSON.stringify(payload);
  } catch {
    return "";
  }
}

function markLocalProfileDirty() {
  writeCloudSyncMeta({ lastLocalMutationAt: Date.now() });
}

function normalizeLegacyCloudSettings(cloudSettings = {}) {
  if (!cloudSettings || typeof cloudSettings !== "object") return null;

  const appSettings = {};
  Object.entries(cloudSettings).forEach(([key, value]) => {
    if (key === "ai_provider_config" || key === "providerConfig") return;
    if (typeof value === "string" && CLOUD_PROFILE_APP_SETTING_KEYS.includes(key)) appSettings[key] = value;
  });

  const legacyProviderConfigRaw = typeof cloudSettings.ai_provider_config === "string"
    ? safeJsonParse(cloudSettings.ai_provider_config, null)
    : null;

  return {
    schemaVersion: 1,
    profileUpdatedAt: Number(cloudSettings.profileUpdatedAt || cloudSettings.timestamp || 0) || 0,
    appSettings,
    providerConfig: cloudSettings.providerConfig && typeof cloudSettings.providerConfig === "object"
      ? cloudSettings.providerConfig
      : legacyProviderConfigRaw,
  };
}

function normalizeCloudProfile(cloudSettings = {}) {
  if (!cloudSettings || typeof cloudSettings !== "object") return null;

  if (cloudSettings.appSettings && typeof cloudSettings.appSettings === "object") {
    return {
      schemaVersion: Number(cloudSettings.schemaVersion || CLOUD_PROFILE_SCHEMA_VERSION),
      profileUpdatedAt: Number(cloudSettings.profileUpdatedAt || 0) || 0,
      appSettings: pickCloudProfileAppSettings(cloudSettings.appSettings),
      providerConfig: cloudSettings.providerConfig && typeof cloudSettings.providerConfig === "object"
        ? cloudSettings.providerConfig
        : null,
      // schema 4: פרופיל הסגנון המבני עובר כמו שהוא. הוולידציה (גרסת סכמה,
      // נרמול רשומות) נעשית ב-importStyleTargets ולא כאן.
      styleTargets: cloudSettings.styleTargets && typeof cloudSettings.styleTargets === "object"
        ? cloudSettings.styleTargets
        : null,
    };
  }

  return normalizeLegacyCloudSettings(cloudSettings);
}

function shouldApplyCloudProfile(cloudProfile = null) {
  if (!cloudProfile) return false;

  const cloudHasData = hasMeaningfulSnapshotData(cloudProfile.appSettings)
    || Boolean(cloudProfile.providerConfig && typeof cloudProfile.providerConfig === "object");
  if (!cloudHasData) return false;

  const meta = readCloudSyncMeta();
  const cloudUpdatedAt = Number(cloudProfile.profileUpdatedAt || 0) || 0;
  const localMutationAt = Number(meta.lastLocalMutationAt || 0) || 0;
  const lastAppliedCloudUpdatedAt = Number(meta.lastAppliedCloudUpdatedAt || 0) || 0;

  if (!cloudUpdatedAt) {
    return !lastAppliedCloudUpdatedAt;
  }

  return cloudUpdatedAt > Math.max(localMutationAt, lastAppliedCloudUpdatedAt);
}

function applyCloudProfile(cloudProfile = null) {
  if (!cloudProfile) return false;

  isApplyingCloudSettings = true;
  try {
    const appliedSettings = hasMeaningfulSnapshotData(cloudProfile.appSettings)
      ? applyPersistedAppSettingsSnapshot(cloudProfile.appSettings, { replaceExisting: true })
      : false;

    const appliedProviderConfig = Boolean(
      cloudProfile.providerConfig
      && typeof cloudProfile.providerConfig === "object"
      && Object.keys(cloudProfile.providerConfig).length
    );

    if (appliedProviderConfig) {
      saveProviderConfig(cloudProfile.providerConfig);
    }

    if (appliedSettings || appliedProviderConfig) {
      // V3: אחרי החלת profile מהענן — ה-blob המאוחד של סביבות העבודה מתעדכן מיד
      // מה-legacy keys שהוחלו, כך שהוא לא נשאר מאחור עד המוטציה הבאה.
      try { syncWorkspacesV3FromLegacy(); } catch {}
      writeCloudSyncMeta({
        lastAppliedCloudUpdatedAt: Number(cloudProfile.profileUpdatedAt || Date.now()) || Date.now(),
        lastSuccessfulCloudSyncAt: Date.now(),
      });
      return true;
    }

    return false;
  } finally {
    isApplyingCloudSettings = false;
  }
}

function cloudProfileHasData(cloudProfile = null) {
  if (!cloudProfile) return false;
  return hasMeaningfulSnapshotData(cloudProfile.appSettings)
    || Boolean(cloudProfile.providerConfig && typeof cloudProfile.providerConfig === "object" && Object.keys(cloudProfile.providerConfig).length);
}

// משיכה מהענן והחלה מקומית. force=true עוקף את שער ה-timestamp (לכפתור ידני
// ולמכשיר חדש). מחזיר תוצאה מפורטת ל-UI.
/**
 * מביא את providerConfig המוצפן מהענן **בלי להחיל שום דבר**.
 *
 * קיים בשביל אימות מפתח: "זכור במכשיר הזה" צריך לבדוק שהמפתח השמור מפענח
 * ciphertext אמיתי לפני שהוא מאמץ אותו כ-session. pullFromCloud לא מתאים לזה
 * כי הוא גם מפענח *וגם מחיל* — כלומר מחייב session פתוח מראש.
 *
 * @returns {Promise<object|null>}
 */
export async function fetchEncryptedProviderConfig(user) {
  if (!user) return null;
  try {
    const cloudSettings = await fetchSettingsFromCloud(user);
    return normalizeCloudProfile(cloudSettings)?.providerConfig || null;
  } catch {
    return null;
  }
}

export async function pullFromCloud(user, { force = false } = {}) {
  if (!user) return { ok: false, error: "לא מחובר לחשבון." };
  try {
    const cloudSettings = await fetchSettingsFromCloud(user);
    let cloudProfile = normalizeCloudProfile(cloudSettings);
    if (!cloudProfileHasData(cloudProfile)) {
      return { ok: true, applied: false, reason: "אין נתונים בענן לחשבון הזה." };
    }

    // פענוח providerConfig אם הוא מוצפן. נעול / מפתח שגוי → משמיטים את providerConfig
    // (שאר ההגדרות עדיין מוחלות) ומסמנים שצריך passphrase.
    let needsPassphrase = false;
    if (cloudProfile?.providerConfig && hasEncryptedSecrets(cloudProfile.providerConfig)) {
      if (isUnlocked()) {
        try {
          cloudProfile = { ...cloudProfile, providerConfig: await decryptSecrets(cloudProfile.providerConfig) };
        } catch {
          cloudProfile = { ...cloudProfile, providerConfig: null };
          needsPassphrase = true;
        }
      } else {
        cloudProfile = { ...cloudProfile, providerConfig: null };
        needsPassphrase = true;
      }
    }
    if (needsPassphrase) emitNeedsPassphrase();

    // פרופיל הסגנון מוחל **בלי קשר לשער ה-timestamp**: המיזוג מונוטוני —
    // importStyleTargets משאיר את הצד עם יותר מסמכים, ולכן משיכה לעולם לא
    // מוחקת מדידות מקומיות גם כשהענן ישן יותר.
    // ⚠️ v1: "יותר רשומות מנצח" הוא **החלפה ולא איחוד**. שני מכשירים עם מסמכים
    // זרים מתכנסים לקבוצה הגדולה מבין השתיים, לא לאיחוד שלהן. מקובל לגרסה
    // הזאת; איחוד לפי docId הוא המשך.
    if (cloudProfile?.styleTargets) {
      try { await importStyleTargets(cloudProfile.styleTargets); } catch {}
    }

    if (force || shouldApplyCloudProfile(cloudProfile)) {
      const applied = applyCloudProfile(cloudProfile);
      return { ok: true, applied, needsPassphrase, hadProviderConfig: Boolean(cloudProfile.providerConfig && Object.keys(cloudProfile.providerConfig || {}).length) };
    }
    return { ok: true, applied: false, needsPassphrase, reason: "הנתונים המקומיים חדשים יותר." };
  } catch (e) {
    console.error("pullFromCloud failed:", e);
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function handleCloudAuthSuccess(user) {
  if (!user) return;
  // קודם כל: אם לחשבון יש הצפנה פעילה (קיים bundle בענן) — להדליק את ה-flag במכשיר
  // הזה *לפני* כל סנכרון, כדי שלא ייווצר חלון שבו מכשיר נעול מעלה גלוי ודורס מוצפן.
  try {
    const bundle = await fetchCloudCryptoMeta(user);
    setCloudCryptoEnabled(Boolean(bundle));
  } catch { /* בכישלון רשת לא נוגעים ב-flag */ }

  // מכשיר חדש (מעולם לא הוחל ענן כאן) → משיכה כפויה כדי שמפתחות/הגדרות יחזרו מהענן.
  const meta = readCloudSyncMeta();
  const neverAppliedHere = !Number(meta.lastAppliedCloudUpdatedAt || 0);
  await pullFromCloud(user, { force: neverAppliedHere });
}

// מכין את ה-payload לעלייה לענן בהתאם למצב ההצפנה:
//  - הצפנה כבויה → ללא שינוי (גלוי, כמו היום).
//  - הצפנה דלוקה + פתוח → מצפין את providerConfig לפני העלייה.
//  - הצפנה דלוקה + נעול → משמיט providerConfig לגמרי (merge:true בענן שומר את
//    הגרסה המוצפנת הקיימת; לעולם לא דורסים מפתחות מוצפנים בגלויים).
async function buildUploadPayload(payload) {
  if (!isCloudCryptoEnabled() || !payload || !payload.providerConfig) return payload;

  if (isUnlocked()) {
    return { ...payload, providerConfig: await encryptSecrets(payload.providerConfig) };
  }

  const guarded = { ...payload };
  delete guarded.providerConfig;
  return guarded;
}

export async function triggerCloudSync(user, options = {}) {
  if (!user || isApplyingCloudSettings) return null;
  if (isSyncingToCloud) {
    if (options?.throwOnError) throw new Error("סנכרון פרופיל כבר רץ. נסה שוב בעוד רגע.");
    return null;
  }

  const runSync = async () => {
    isSyncingToCloud = true;
    try {
      const payload = await getLocalProfilePayloadFull();
      // חתימת dedup מחושבת על ה-payload הגלוי (ה-ciphertext משתנה בכל הצפנה בגלל IV אקראי).
      const signature = buildPayloadSignature(payload);
      if (!options?.force && signature && signature === lastQueuedSnapshotSignature) return payload;

      await syncSettingsToCloud(user, await buildUploadPayload(payload));
      lastQueuedSnapshotSignature = signature;
      writeCloudSyncMeta({
        lastSuccessfulCloudSyncAt: Date.now(),
        lastAppliedCloudUpdatedAt: Number(payload.profileUpdatedAt || Date.now()) || Date.now(),
      });
      console.log("Profile successfully synced to cloud.");
      return payload;
    } catch (e) {
      console.error("Failed to sync settings to cloud:", e);
      if (options?.throwOnError) throw e;
      return null;
    } finally {
      isSyncingToCloud = false;
    }
  };

  if (options?.immediate) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    return runSync();
  }

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    runSync().catch(() => {});
  }, CLOUD_PROFILE_SYNC_DEBOUNCE_MS);
  return null;
}

export function initCloudSyncListeners(user) {
  if (typeof window === "undefined") return () => {};

  let lastObservedSignature = buildPayloadSignature(getLocalProfilePayload());
  const markObservedProfileChanged = () => {
    if (isApplyingCloudSettings) return;
    markLocalProfileDirty();
  };

  const eventHandler = () => {
    markObservedProfileChanged();
  };

  const pollForProfileChanges = () => {
    if (isApplyingCloudSettings) return;
    const nextSignature = buildPayloadSignature(getLocalProfilePayload());
    if (!nextSignature || nextSignature === lastObservedSignature) return;
    lastObservedSignature = nextSignature;
    markObservedProfileChanged();
  };

  window.addEventListener("wordai-settings-hydrated", eventHandler);
  window.addEventListener("wordai-provider-config-changed", eventHandler);
  window.addEventListener("wordai-personal-style-updated", eventHandler);
  window.addEventListener("wordai-workspaces-v2-changed", eventHandler);
  // יעדי הסגנון יושבים ב-IndexedDB ולכן ה-poller הסינכרוני לא רואה אותם —
  // האירוע הוא הדרך היחידה לסמן מדידה חדשה כשינוי שדורש סנכרון.
  window.addEventListener(STYLE_TARGETS_UPDATED_EVENT, eventHandler);

  const intervalId = window.setInterval(pollForProfileChanges, 4000);

  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    window.clearInterval(intervalId);
    window.removeEventListener("wordai-settings-hydrated", eventHandler);
    window.removeEventListener("wordai-provider-config-changed", eventHandler);
    window.removeEventListener("wordai-personal-style-updated", eventHandler);
    window.removeEventListener("wordai-workspaces-v2-changed", eventHandler);
    window.removeEventListener(STYLE_TARGETS_UPDATED_EVENT, eventHandler);
  };
}
