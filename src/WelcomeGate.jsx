import React, { useEffect, useState } from 'react';
import { initializePassphrase as initCryptoPassphrase } from './services/cloudCryptoSession';
import { saveCloudCryptoMeta } from './firebase/services';
import { setCloudCryptoEnabled, triggerCloudSync } from './services/cloudSyncManager';
import { showToast } from './services/uiFeedback';

const MIN_PASSPHRASE_LEN = 8;

// מסך פתיחה בהפעלה ראשונה. פותר את סדר התלות: התחברות Google קודם, אז הצפנה.
// onFinish({ openOnboarding }) — סוגר את המסך וממשיך (פותח onboarding או לא).
export default function WelcomeGate({ cloudUser, cloudAvailable = true, onSignIn, onFinish }) {
  const [screen, setScreen] = useState('choice'); // choice | waitingAuth | newSetup
  const [pendingMode, setPendingMode] = useState(null); // 'returning' | 'new'
  const [busy, setBusy] = useState(false);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [recovery, setRecovery] = useState(null);
  const [copied, setCopied] = useState(false);

  // תגובה להתחברות מוצלחת
  useEffect(() => {
    if (!cloudUser || !pendingMode) return;
    if (pendingMode === 'returning') {
      // משתמש קיים: ה-unlock gate יטפל ב-passphrase. סוגרים את ה-welcome.
      onFinish({ openOnboarding: false });
    } else if (pendingMode === 'new' && screen !== 'newSetup' && !recovery) {
      setScreen('newSetup'); // קביעת passphrase לפני ה-onboarding
    }
  }, [cloudUser, pendingMode, screen, recovery, onFinish]);

  const startSignIn = (mode) => {
    setPendingMode(mode);
    setScreen('waitingAuth');
    Promise.resolve(onSignIn?.()).catch(() => {});
  };

  const handleSetPass = async () => {
    if (pass.length < MIN_PASSPHRASE_LEN) { showToast(`הסיסמה חייבת באורך ${MIN_PASSPHRASE_LEN} תווים לפחות.`, 'error'); return; }
    if (pass !== pass2) { showToast('הסיסמאות לא תואמות.', 'error'); return; }
    if (!cloudUser) { showToast('צריך קודם להתחבר.', 'error'); return; }
    setBusy(true);
    try {
      const { bundle, recoveryCode } = await initCryptoPassphrase(pass);
      await saveCloudCryptoMeta(cloudUser, bundle);
      setCloudCryptoEnabled(true);
      await triggerCloudSync(cloudUser, { immediate: true, force: true });
      setRecovery(recoveryCode);
    } catch (e) {
      showToast('שגיאה בהגדרת ההצפנה: ' + (e?.message || e), 'error');
    } finally { setBusy(false); }
  };

  const copyRecovery = async () => {
    try { await navigator.clipboard.writeText(recovery); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { showToast('ההעתקה נכשלה — העתק ידנית.', 'error'); }
  };

  const field = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-800 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 dark:bg-white/5 dark:border-white/12 dark:text-[#f1f6fb]';
  const primary = 'w-full px-5 py-3 rounded-xl bg-[var(--wf-accent)] text-[var(--wf-accent-text)] text-[15px] font-extrabold hover:brightness-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed';
  const secondary = 'w-full px-5 py-3 rounded-xl bg-slate-50 text-slate-700 border border-slate-200 text-[14px] font-bold hover:bg-slate-100 transition-colors disabled:opacity-50 dark:bg-white/5 dark:text-[#cfe0ef] dark:border-white/12';
  const label = 'block text-[12px] font-bold text-slate-500 mb-1.5 dark:text-[#8ba3bd]';

  const shell = (children) => (
    <div dir="rtl" className="fixed inset-0 z-[9998] flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-200 p-7 dark:bg-[#0f1d2e] dark:border-white/10">
        {children}
      </div>
    </div>
  );

  // קוד שחזור אחרי הגדרה → ואז onboarding
  if (recovery) {
    return shell(
      <div>
        <div className="text-center mb-3">
          <div className="text-4xl mb-2">🗝️</div>
          <h2 className="text-[19px] font-extrabold text-slate-800 dark:text-[#f1f6fb]">שמור את קוד השחזור</h2>
          <p className="text-[13px] text-slate-500 leading-relaxed mt-1 dark:text-[#8ba3bd]">
            זו הדרך היחידה לשחזר גישה אם תשכח את הסיסמה. <b>לא נציג אותו שוב.</b>
          </p>
        </div>
        <div dir="ltr" className="font-mono text-[16px] font-bold tracking-wider text-slate-800 bg-amber-50 rounded-xl border-2 border-amber-300 px-4 py-3 text-center select-all break-all dark:bg-amber-400/10 dark:text-amber-100 dark:border-amber-400/30">
          {recovery}
        </div>
        <div className="grid gap-2 mt-4">
          <button type="button" onClick={copyRecovery} className={secondary}>{copied ? '✓ הועתק' : 'העתק קוד'}</button>
          <button type="button" onClick={() => onFinish({ openOnboarding: true })} className={primary}>שמרתי — בוא נתחיל</button>
        </div>
      </div>,
    );
  }

  if (screen === 'newSetup') {
    return shell(
      <div>
        <div className="text-center mb-5">
          <div className="text-4xl mb-2">🔒</div>
          <h2 className="text-[19px] font-extrabold text-slate-800 dark:text-[#f1f6fb]">בחר סיסמת הצפנה</h2>
          <p className="text-[13px] text-slate-500 leading-relaxed mt-1 dark:text-[#8ba3bd]">
            הסיסמה תגן על מפתחות ה-API שלך בענן. רק אתה יודע אותה — גם אנחנו לא. תקבל קוד שחזור.
          </p>
        </div>
        <div className="grid gap-3">
          <div>
            <label className={label}>סיסמת הצפנה (לפחות {MIN_PASSPHRASE_LEN} תווים)</label>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} dir="ltr" autoFocus className={field} />
          </div>
          <div>
            <label className={label}>אימות סיסמה</label>
            <input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} dir="ltr"
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy) handleSetPass(); }} className={field} />
          </div>
          <button type="button" onClick={handleSetPass} disabled={busy} className={primary}>{busy ? 'מגדיר…' : 'המשך'}</button>
          <button type="button" onClick={() => onFinish({ openOnboarding: true })} disabled={busy}
            className="text-[12px] font-bold text-slate-400 hover:underline dark:text-[#8ba3bd]">
            דלג — אגדיר הצפנה מאוחר יותר
          </button>
        </div>
      </div>,
    );
  }

  if (screen === 'waitingAuth') {
    return shell(
      <div className="text-center py-6">
        <div className="text-4xl mb-3 animate-pulse">🔗</div>
        <h2 className="text-[18px] font-extrabold text-slate-800 dark:text-[#f1f6fb]">מתחבר עם Google…</h2>
        <p className="text-[13px] text-slate-500 leading-relaxed mt-1 mb-5 dark:text-[#8ba3bd]">
          השלם את ההתחברות בחלון שנפתח. אם החלון נסגר בטעות — חזור ונסה שוב.
        </p>
        <button type="button" onClick={() => { setPendingMode(null); setScreen('choice'); }} className={secondary}>חזור</button>
      </div>,
    );
  }

  // choice
  return shell(
    <div>
      <div className="text-center mb-6">
        <div className="text-5xl mb-3">👋</div>
        <h1 className="text-[22px] font-extrabold text-slate-800 dark:text-[#f1f6fb]">ברוכים הבאים ל-WordFlow AI</h1>
        <p className="text-[13.5px] text-slate-500 leading-relaxed mt-2 dark:text-[#8ba3bd]">
          חשבון ענן מסנכרן את המפתחות וההגדרות בין מכשירים — מוצפן מקצה לקצה. אפשר גם להתחיל מקומית בלי חשבון.
        </p>
      </div>
      <div className="grid gap-2.5">
        {cloudAvailable && (
          <>
            <button type="button" onClick={() => startSignIn('returning')} className={primary}>כבר יש לי חשבון</button>
            <button type="button" onClick={() => startSignIn('new')} className={secondary}>אני חדש — צור חשבון</button>
          </>
        )}
        <button type="button" onClick={() => onFinish({ openOnboarding: true })}
          className={cloudAvailable
            ? 'text-[13px] font-bold text-slate-400 hover:underline mt-1 dark:text-[#8ba3bd]'
            : primary}>
          {cloudAvailable ? 'המשך בלי חשבון' : 'התחל'}
        </button>
      </div>
    </div>,
  );
}
