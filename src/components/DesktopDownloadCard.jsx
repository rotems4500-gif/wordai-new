// DesktopDownloadCard — הורדת אפליקציית המחשב מתוך האתר.
//
// עד עכשיו הדרך היחידה להגיע למתקין הייתה לדעת מעצמך על עמוד ה-releases בגיטהאב.
// כאן האתר שולף את הגרסה האחרונה מ-GitHub API (CORS פתוח), מציג גרסה + גודל,
// ונותן קישור ישיר ל-.exe. אם ה-API לא זמין (rate limit / אופליין) — נופלים
// לקישור לעמוד ההורדות, שתמיד עובד.
//
// מוצג רק בדפדפן. בתוך אפליקציית הדסקטופ הרכיב מחזיר null.

import React, { useEffect, useState } from 'react';

const RELEASES_PAGE = 'https://github.com/rotems4500-gif/wordai-new/releases/latest';
const LATEST_API = 'https://api.github.com/repos/rotems4500-gif/wordai-new/releases/latest';
const CACHE_KEY = 'wordflow:latest-release';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const formatMb = (bytes) => {
  const mb = Number(bytes) / (1024 * 1024);
  return Number.isFinite(mb) && mb > 0 ? `${mb.toFixed(0)} MB` : '';
};

const readCache = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!parsed || Date.now() - Number(parsed.at || 0) > CACHE_TTL_MS) return null;
    return parsed.release || null;
  } catch {
    return null;
  }
};

const writeCache = (release) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), release })); } catch {}
};

async function fetchLatestRelease() {
  const response = await fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`github ${response.status}`);
  const data = await response.json();
  const assets = Array.isArray(data?.assets) ? data.assets : [];
  const installer = assets.find((asset) => /setup\.exe$/i.test(String(asset?.name || '')))
    || assets.find((asset) => /\.exe$/i.test(String(asset?.name || '')));
  return {
    version: String(data?.tag_name || '').replace(/^v/, ''),
    url: installer?.browser_download_url || '',
    size: Number(installer?.size || 0),
    publishedAt: String(data?.published_at || ''),
  };
}

const isWindows = () => typeof navigator !== 'undefined' && /win/i.test(navigator.platform || navigator.userAgent || '');

// שני עורות: 'panel' לתוך ההגדרות (רקע בהיר), 'glass' על ההירו הכהה של מסך הבית.
const SKINS = {
  panel: {
    shell: { border: '1px solid var(--s-border)', background: 'linear-gradient(135deg, rgba(59,130,246,0.10) 0%, var(--s-surface-2) 100%)' },
    title: 'var(--s-text)',
    body: 'var(--s-muted)',
    meta: 'var(--s-muted)',
    cta: { background: '#2563EB', color: 'white' },
  },
  glass: {
    shell: { border: '1px solid rgba(255,255,255,0.20)', background: 'rgba(255,255,255,0.10)', backdropFilter: 'blur(12px)' },
    title: 'white',
    body: 'rgba(255,255,255,0.78)',
    meta: 'rgba(255,255,255,0.62)',
    cta: { background: 'linear-gradient(90deg, rgba(6,182,212,0.9), rgba(37,99,235,0.9))', color: 'white' },
  },
};

export default function DesktopDownloadCard({ compact = false, variant = 'panel' }) {
  const [release, setRelease] = useState(() => readCache());
  const [failed, setFailed] = useState(false);
  const [showWarningHelp, setShowWarningHelp] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || window.desktopApp) return undefined;
    if (release) return undefined;
    let alive = true;
    fetchLatestRelease()
      .then((next) => {
        if (!alive) return;
        if (next.url) { writeCache(next); setRelease(next); } else { setFailed(true); }
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [release]);

  if (typeof window !== 'undefined' && window.desktopApp) return null;

  const skin = SKINS[variant] || SKINS.panel;
  const windows = isWindows();
  const href = release?.url || RELEASES_PAGE;
  const sizeLabel = formatMb(release?.size);
  const versionLabel = release?.version ? `גרסה ${release.version}` : (failed ? '' : 'בודק גרסה…');

  return (
    <div dir="rtl" style={{ ...skin.shell, borderRadius: 20, padding: compact ? '14px 16px' : '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220, flex: 1 }}>
          <div style={{ fontSize: compact ? 14 : 16, fontWeight: 800, color: skin.title, marginBottom: 4 }}>
            🖥️ אפליקציית המחשב של WordFlow AI
          </div>
          <div style={{ fontSize: 12, color: skin.body, lineHeight: 1.7 }}>
            עורך מלא לחלונות: פתיחה ושמירה של קבצים ישירות מהמחשב, מפתחות API מוצפנים במכשיר,
            ועדכונים אוטומטיים מתוך האפליקציה.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8, fontSize: 11, color: skin.meta }}>
            {versionLabel && <span>{versionLabel}</span>}
            {sizeLabel && <span>· {sizeLabel}</span>}
            <span>· Windows 10/11</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              textAlign: 'center',
              padding: '10px 18px',
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 13,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              ...skin.cta,
            }}
          >
            {release?.url ? 'הורד את המתקין' : 'לעמוד ההורדות'}
          </a>
          {release?.url && (
            <a
              href={RELEASES_PAGE}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: skin.meta, textAlign: 'center', textDecoration: 'none' }}
            >
              כל הגרסאות ויומן שינויים
            </a>
          )}
        </div>
      </div>

      {!windows && (
        <div style={{ marginTop: 10, fontSize: 11, color: skin.meta, lineHeight: 1.7 }}>
          המתקין הוא ל-Windows. במערכת אחרת אפשר להמשיך לעבוד כאן באתר, או להתקין את האתר כאפליקציה
          דרך תפריט הדפדפן (Install / הוסף למסך הבית).
        </div>
      )}

      {/* אזהרת SmartScreen: מופיעה כי המתקין עדיין לא חתום בתעודת מפרסם.
          בלי הסבר מראש חלק מהמשתמשים נוטשים בשלב הזה. */}
      {windows && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${variant === 'glass' ? 'rgba(255,255,255,0.14)' : 'var(--s-border)'}`, paddingTop: 10 }}>
          <button
            type="button"
            onClick={() => setShowWarningHelp((prev) => !prev)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: 11.5,
              fontWeight: 700,
              color: skin.body,
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>{showWarningHelp ? '▾' : '◂'}</span>
            <span>Windows מציג אזהרה בהתקנה? זה צפוי — הנה מה לעשות</span>
          </button>

          {showWarningHelp && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: skin.meta, lineHeight: 1.85 }}>
              במסך הכחול <strong style={{ color: skin.body }}>"Windows הגן על המחשב שלך"</strong> לוחצים על
              {' '}<strong style={{ color: skin.body }}>"מידע נוסף"</strong>, ואז על
              {' '}<strong style={{ color: skin.body }}>"הפעל בכל מקרה"</strong>. ההתקנה תמשיך כרגיל.
              <br />
              האזהרה אינה אומרת שנמצאה בעיה בקובץ. Windows מציג אותה לכל מתקין שעדיין לא נרכשה עבורו
              תעודת חתימה מסחרית — כולל תוכנות חדשות לגמרי. הקובץ מגיע ישירות מעמוד ה-releases הרשמי
              של הפרויקט ב-GitHub, ואפשר לראות שם את כל הגרסאות.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
