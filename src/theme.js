// ניהול ערכת נושא (בהיר / כהה) — כתוספת לערכה הבהירה הקיימת.
// מוסיף/מסיר class="dark" על <html>; הערכה הבהירה היא ברירת המחדל.
// נשמר ב-localStorage תחת המפתח הזה. init מוקדם נעשה inline ב-index.html
// כדי למנוע הבזק (FOUC) לפני טעינת React — כאן יושבת לוגיקת ה-API.

const STORAGE_KEY = 'wordflow:theme';
const VALID = new Set(['light', 'dark']);
const listeners = new Set();

export function getTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (VALID.has(v)) return v;
  } catch {
    /* localStorage חסום — נופלים לברירת מחדל */
  }
  return 'light';
}

export function applyTheme(theme) {
  const t = VALID.has(theme) ? theme : 'light';
  const root = document.documentElement;
  root.classList.toggle('dark', t === 'dark');
  // עדכון theme-color למובייל/PWA
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#0a1422' : '#f8f9fa');
  return t;
}

export function setTheme(theme) {
  const t = applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* ניתן להתעלם */
  }
  listeners.forEach((fn) => {
    try {
      fn(t);
    } catch {
      /* listener בודד שנכשל לא מפיל את השאר */
    }
  });
  return t;
}

export function toggleTheme() {
  return setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

// מנוי לשינויי ערכה (לרכיבי React שצריכים לרנדר מחדש). מחזיר unsubscribe.
export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// יישור מצב התחלתי (במקרה שה-init המוקדם ב-index.html לא רץ).
export function initTheme() {
  return applyTheme(getTheme());
}
