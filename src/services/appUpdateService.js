// appUpdateService — בדיקת עדכון אוטומטית באפליקציית הדסקטופ.
//
// למה זה קיים: עד עכשיו העדכון היה ידני לגמרי — המשתמש היה צריך לדעת מעצמו
// להיכנס ל"קובץ → עדכונים" וללחוץ "בדוק". בפועל אף אחד לא עושה את זה, ולכן
// משתמשים נשארו על גרסאות ישנות. כאן הבדיקה קורית לבד, והיא מגיעה כ-toast
// שאפשר להתעלם ממנו — לא חלון חוסם.
//
// מדיניות: בדיקה אחת בהפעלה (אחרי שהאפליקציה נרגעה), ואז כל 6 שעות כל עוד
// החלון פתוח. "אחר כך" משתיק את הגרסה הזו ל-3 ימים; גרסה חדשה יותר מדברת שוב.

import { showToast } from './uiFeedback';

const SNOOZE_KEY = 'wordflow:update-snooze';
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 12_000;
const RECHECK_EVERY_MS = 6 * 60 * 60 * 1000;

const isDesktop = () => typeof window !== 'undefined' && !!window.desktopApp?.checkForAppUpdates;

const readSnooze = () => {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return { version: String(parsed.version || ''), until: Number(parsed.until || 0) };
  } catch {
    return null;
  }
};

const writeSnooze = (version) => {
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify({ version: String(version || ''), until: Date.now() + SNOOZE_MS }));
  } catch {}
};

const clearSnooze = () => {
  try { localStorage.removeItem(SNOOZE_KEY); } catch {}
};

const isSnoozed = (version) => {
  const snooze = readSnooze();
  if (!snooze) return false;
  if (snooze.until <= Date.now()) { clearSnooze(); return false; }
  // גרסה חדשה יותר מאשר זו שהושתקה — מודיעים שוב.
  return snooze.version === String(version || '');
};

/** מתחיל התקנה ומראה התקדמות. ההתקנה מסתיימת בהפעלה מחדש של האפליקציה. */
export async function startUpdateInstall({ availableVersion = '' } = {}) {
  if (!isDesktop() || !window.desktopApp?.installAppUpdate) return { ok: false, reason: 'unavailable' };
  clearSnooze();

  let dismissProgress = showToast('מוריד את העדכון…', { tone: 'info', duration: 600_000 });
  let lastShown = -1;
  const unsubscribe = window.desktopApp.onAppUpdateStatus?.((payload = {}) => {
    if (payload.status === 'downloading') {
      const percent = Math.round(Number(payload.percent || 0));
      if (percent === lastShown) return;
      lastShown = percent;
      dismissProgress?.();
      dismissProgress = showToast(percent > 0 ? `מוריד את העדכון… ${percent}%` : 'מוריד את העדכון…', { tone: 'info', duration: 600_000 });
      return;
    }
    if (payload.status === 'downloaded') {
      dismissProgress?.();
      dismissProgress = showToast('ההורדה הושלמה — האפליקציה תיסגר ותיפתח מחדש עם הגרסה החדשה.', { tone: 'success', duration: 600_000 });
    }
  });

  try {
    const result = await window.desktopApp.installAppUpdate();
    // הצלחה = restart, כלומר לא אמורים להגיע לכאן. אם הגענו — משהו נכשל.
    dismissProgress?.();
    unsubscribe?.();
    if (result && result.ok === false) {
      showToast(result.message || 'התקנת העדכון נכשלה. אפשר לנסות שוב מ"קובץ → עדכונים".', { tone: 'error', duration: 9000 });
    }
    return result || { ok: false };
  } catch (error) {
    dismissProgress?.();
    unsubscribe?.();
    showToast(error?.message || 'התקנת העדכון נכשלה.', { tone: 'error', duration: 9000 });
    return { ok: false, reason: 'install-failed' };
  }
}

async function checkOnce({ silent = true } = {}) {
  if (!isDesktop()) {
    if (!silent) showToast('בדיקת עדכונים זמינה רק באפליקציית שולחן העבודה.', { tone: 'info' });
    return { ok: false, reason: 'web' };
  }
  let result;
  try {
    result = await window.desktopApp.checkForAppUpdates();
  } catch (error) {
    if (!silent) showToast(error?.message || 'בדיקת העדכונים נכשלה.', { tone: 'error', duration: 7000 });
    return { ok: false, reason: 'check-failed' };
  }

  if (!result || result.status !== 'available') {
    // בדיקה יזומה חייבת לענות משהו. בדיקה אוטומטית שותקת כשאין חדש.
    if (!silent) {
      if (result?.status === 'up-to-date') {
        showToast(`האפליקציה מעודכנת${result.currentVersion ? ` (גרסה ${result.currentVersion})` : ''}.`, { tone: 'success' });
      } else {
        showToast(result?.message || 'לא הצלחתי לבדוק עדכונים כרגע.', { tone: 'warning', duration: 7000 });
      }
    }
    return result || { ok: false };
  }

  const version = String(result.availableVersion || '');
  // השתקה חלה רק על הבדיקה האוטומטית. ביקש במפורש — מקבל תשובה.
  if (silent && isSnoozed(version)) return result;

  showToast(`גרסה ${version} של WordFlow AI זמינה.`, {
    tone: 'success',
    duration: 14_000,
    actionLabel: 'עדכן עכשיו',
    onAction: () => { startUpdateInstall({ availableVersion: version }); },
    onDismiss: () => writeSnooze(version),
  });
  return result;
}

/**
 * מפעיל את מחזור הבדיקה. מחזיר פונקציית ניקוי.
 * בטוח לקרוא באתר — פשוט לא עושה כלום.
 */
export function startAutoUpdateChecks() {
  if (!isDesktop()) return () => {};
  const first = setTimeout(() => { checkOnce({ silent: true }); }, FIRST_CHECK_DELAY_MS);
  const interval = setInterval(() => { checkOnce({ silent: true }); }, RECHECK_EVERY_MS);
  return () => { clearTimeout(first); clearInterval(interval); };
}

export const checkForUpdateNow = () => checkOnce({ silent: false });
