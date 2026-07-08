// ═══════════════════════════════════════════════════════════════
// fontEmbed.js — CSS פונטים מוטמעים (data-URI) לצריבת שקפים.
// למה: html-to-image מרנדר את ה-SVG בהקשר <img> מבודד — פונטי הדף
// לא נגישים שם, והטקסט נופל ל-Segoe UI (מטריקות שונות → שבירות שורה
// ועיצוב שונה מהעורך). הפתרון: @font-face עם data-URI בתוך ה-SVG עצמו,
// דרך option fontEmbedCSS (גובר על skipFonts, בלי fetch cross-origin).
// הקבצים ב-public/fonts (subset עברית+לטינית, self-hosted).
// ═══════════════════════════════════════════════════════════════

let masterCssPromise = null;   // ה-CSS הגולמי (נתיבים מקומיים) — fetch יחיד
const builtCache = new Map();  // מפתח: רשימת משפחות ממוינת → CSS מוטמע מוכן

// טוען את deck-fonts.css (נתיבים מקומיים /fonts/*.woff2)
const loadMasterCss = () => {
  if (!masterCssPromise) {
    masterCssPromise = fetch('/fonts/deck-fonts.css')
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => '');
  }
  return masterCssPromise;
};

const bufToBase64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
};

/**
 * getFontEmbedCss — CSS מוטמע (data-URI) עבור משפחות הפונט המבוקשות.
 * @param {string[]} families  שמות משפחה ("Rubik", "Heebo"...)
 * @returns {Promise<string|null>}  null אם אין קבצים/נכשל (הקורא ייפול ל-skipFonts)
 */
export const getFontEmbedCss = async (families = []) => {
  const wanted = [...new Set(families.filter(Boolean))].sort();
  if (!wanted.length) return null;
  const key = wanted.join('|');
  if (builtCache.has(key)) return builtCache.get(key);

  const build = (async () => {
    const master = await loadMasterCss();
    if (!master) return null;
    // בלוקים של @font-face עבור המשפחות המבוקשות בלבד
    const blocks = [...master.matchAll(/@font-face\s*\{[^}]+\}/g)]
      .map((m) => m[0])
      .filter((b) => wanted.some((f) => b.includes(`font-family: '${f}'`)));
    if (!blocks.length) return null;

    // הטמעת כל קובץ woff2 כ-data-URI (במקביל, עם dedup)
    const urls = [...new Set(blocks.flatMap((b) => [...b.matchAll(/url\((\/fonts\/[^)]+)\)/g)].map((m) => m[1])))];
    const dataMap = new Map();
    await Promise.all(urls.map(async (u) => {
      try {
        const r = await fetch(u);
        if (!r.ok) return;
        dataMap.set(u, `data:font/woff2;base64,${bufToBase64(await r.arrayBuffer())}`);
      } catch { /* קובץ חסר — הבלוק יושמט */ }
    }));

    const embedded = blocks
      .filter((b) => [...b.matchAll(/url\((\/fonts\/[^)]+)\)/g)].every((m) => dataMap.has(m[1])))
      .map((b) => b.replace(/url\((\/fonts\/[^)]+)\)/g, (_, u) => `url(${dataMap.get(u)})`));
    return embedded.length ? embedded.join('\n') : null;
  })().catch(() => null);

  builtCache.set(key, build);
  const result = await build;
  builtCache.set(key, result); // מחליף את ה-promise בתוצאה
  return result;
};
