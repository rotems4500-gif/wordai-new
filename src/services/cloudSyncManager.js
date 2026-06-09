import {
  applyPersistedAppSettingsSnapshot,
  getProviderConfig,
  saveProviderConfig,
} from "./aiService";
import { fetchSettingsFromCloud, syncSettingsToCloud } from "../firebase/services";

const CLOUD_PROFILE_SCHEMA_VERSION = 2;
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
  "wordai_shared_agent_instructions",
  "wordai_role_agents",
  "wordai_home_instructions",
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

export async function handleCloudAuthSuccess(user) {
  if (!user) return;

  try {
    const cloudSettings = await fetchSettingsFromCloud(user);
    const cloudProfile = normalizeCloudProfile(cloudSettings);

    if (shouldApplyCloudProfile(cloudProfile)) {
      applyCloudProfile(cloudProfile);
    }
  } catch (e) {
    console.error("Failed to handle cloud auth success:", e);
  }
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
      const payload = getLocalProfilePayload();
      const signature = buildPayloadSignature(payload);
      if (!options?.force && signature && signature === lastQueuedSnapshotSignature) return payload;

      await syncSettingsToCloud(user, payload);
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
  };
}
