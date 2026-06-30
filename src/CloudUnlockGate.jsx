import React, { useEffect, useState } from 'react';
import { fetchCloudCryptoMeta, saveCloudCryptoMeta } from './firebase/services';
import {
  isUnlocked as isCryptoUnlocked,
  unlockWithPassphrase as unlockCryptoPassphrase,
  unlockWithRecoveryCode as unlockCryptoRecovery,
  changePassphrase as changeCryptoPassphrase,
  initializePassphrase as initCryptoPassphrase,
  hasPlaintextSecrets,
} from './services/cloudCryptoSession';
import { getProviderConfig } from './services/aiService';
import { setCloudCryptoEnabled, triggerCloudSync, pullFromCloud } from './services/cloudSyncManager';
import { showToast } from './services/uiFeedback';

const MIN_PASSPHRASE_LEN = 8;
const SETUP_DECLINED_KEY = 'wordai_cloud_crypto_setup_declined';

function readDeclined() {
  try { return JSON.parse(localStorage.getItem(SETUP_DECLINED_KEY) || '[]'); } catch { return []; }
}
function markDeclined(uid) {
  const list = readDeclined();
  if (!list.includes(uid)) { list.push(uid); localStorage.setItem(SETUP_DECLINED_KEY, JSON.stringify(list)); }
}

// gate אוטומטי לאחר כניסה לענן:
//  - mode 'unlock': לחשבון יש הצפנה פעילה והסשן נעול → לבקש passphrase.
//  - mode 'setup': אין הצפנה ויש מפתחות גלויים להגן עליהם → להציע להפעיל (ברירת מחדל),
//                  עם "לא עכשיו" = opt-out (נזכר כדי לא להציק שוב).
export default function CloudUnlockGate({ user }) {
  const [mode, setMode] = useState(null); // 'unlock' | 'setup' | null
  const [bundle, setBundle] = useState(null);
  const [busy, setBusy] = useState(false);
  const [handledUid, setHandledUid] = useState('');

  // unlock
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [recovery, setRecovery] = useState('');
  const [recVerified, setRecVerified] = useState(false);

  // setup / new-pass
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [revealedRecovery, setRevealedRecovery] = useState(null);
  const [copied, setCopied] = useState(false);

  const decide = React.useCallback(async () => {
    if (!user?.uid || isCryptoUnlocked()) return;
    try {
      const b = await fetchCloudCryptoMeta(user);
      if (isCryptoUnlocked()) return;
      if (b) { setBundle(b); setMode('unlock'); return; }
      // אין הצפנה לחשבון → להציע setup אם לא דחו וכבר יש מפתחות גלויים
      if (readDeclined().includes(user.uid)) return;
      if (hasPlaintextSecrets(getProviderConfig())) { setBundle(null); setMode('setup'); }
    } catch { /* ignore */ }
  }, [user]);

  useEffect(() => {
    if (!user?.uid) { setMode(null); setBundle(null); return; }
    if (user.uid === handledUid) return;
    setHandledUid(user.uid);
    if (isCryptoUnlocked()) return;
    decide();
  }, [user, handledUid, decide]);

  useEffect(() => {
    const onLocked = () => { if (!mode) decide(); };
    window.addEventListener('wordai-cloud-crypto-locked', onLocked);
    return () => window.removeEventListener('wordai-cloud-crypto-locked', onLocked);
  }, [mode, decide]);

  if (!mode) return null;

  const reset = () => {
    setPass(''); setShowPass(false); setForgot(false); setRecovery(''); setRecVerified(false);
    setNewPass(''); setNewPass2(''); setRevealedRecovery(null); setCopied(false);
  };
  const close = () => { setMode(null); reset(); };

  const validatePair = () => {
    if (newPass.length < MIN_PASSPHRASE_LEN) { showToast(`הסיסמה חייבת באורך ${MIN_PASSPHRASE_LEN} תווים לפחות.`, 'error'); return false; }
    if (newPass !== newPass2) { showToast('הסיסמאות לא תואמות.', 'error'); return false; }
    return true;
  };

  const afterUnlock = async () => {
    try { await pullFromCloud(user, { force: true }); } catch { /* ignore */ }
    showToast('המפתחות נטענו מהענן.', 'success');
    close();
  };

  // --- setup (הפעלה ראשונה) ---
  const handleEnable = async () => {
    if (!validatePair()) return;
    setBusy(true);
    try {
      const { bundle: b, recoveryCode } = await initCryptoPassphrase(newPass);
      await saveCloudCryptoMeta(user, b);
      setCloudCryptoEnabled(true);
      await triggerCloudSync(user, { immediate: true, force: true }); // מצפין את המפתחות הקיימים
      setBundle(b);
      setRevealedRecovery(recoveryCode); // מציג קוד שחזור פעם אחת
      showToast('הצפנת ענן הופעלה.', 'success');
    } catch (e) {
      showToast('שגיאה בהפעלה: ' + (e?.message || e), 'error');
    } finally { setBusy(false); }
  };

  const handleDeclineSetup = () => { markDeclined(user.uid); close(); };

  // --- unlock ---
  const handleUnlock = async () => {
    setBusy(true);
    try {
      const ok = await unlockCryptoPassphrase(pass, bundle);
      if (!ok) { showToast('סיסמה שגויה.', 'error'); return; }
      await afterUnlock();
    } finally { setBusy(false); }
  };
  const handleRecVerify = async () => {
    setBusy(true);
    try {
      const ok = await unlockCryptoRecovery(recovery, bundle);
      if (!ok) { showToast('קוד שחזור שגוי.', 'error'); return; }
      setRecVerified(true);
      showToast('הקוד אומת. קבע סיסמה חדשה.', 'success');
    } finally { setBusy(false); }
  };
  const handleSetNewPass = async () => {
    if (!validatePair()) return;
    setBusy(true);
    try {
      const b2 = await changeCryptoPassphrase(bundle, newPass);
      await saveCloudCryptoMeta(user, b2);
      setBundle(b2);
      await afterUnlock();
    } catch (e) {
      showToast('שגיאה בקביעת סיסמה: ' + (e?.message || e), 'error');
    } finally { setBusy(false); }
  };

  const copyRecovery = async () => {
    try { await navigator.clipboard.writeText(revealedRecovery); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { showToast('ההעתקה נכשלה — העתק ידנית.', 'error'); }
  };

  const field = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-800 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 dark:bg-white/5 dark:border-white/12 dark:text-[#f1f6fb]';
  const primary = 'px-5 py-2.5 rounded-xl bg-[var(--wf-accent)] text-[var(--wf-accent-text)] text-[14px] font-extrabold hover:brightness-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed';
  const ghost = 'px-4 py-2.5 rounded-xl bg-slate-50 text-slate-600 border border-slate-200 text-[13px] font-bold hover:bg-slate-100 transition-colors disabled:opacity-50 dark:bg-white/5 dark:text-[#cfe0ef] dark:border-white/12';
  const label = 'block text-[12px] font-bold text-slate-500 mb-1.5 dark:text-[#8ba3bd]';

  const shell = (children) => (
    <div dir="rtl" className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-200 p-6 dark:bg-[#0f1d2e] dark:border-white/10"
        onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );

  // קוד שחזור אחרי הפעלה — חוסם עד אישור
  if (revealedRecovery) {
    return shell(
      <div>
        <div className="text-center mb-3">
          <div className="text-4xl mb-2">🗝️</div>
          <h2 className="text-[18px] font-extrabold text-slate-800 dark:text-[#f1f6fb]">שמור את קוד השחזור</h2>
          <p className="text-[13px] text-slate-500 leading-relaxed mt-1 dark:text-[#8ba3bd]">
            זו הדרך היחידה לשחזר גישה אם תשכח את הסיסמה. <b>לא נציג אותו שוב.</b>
          </p>
        </div>
        <div dir="ltr" className="font-mono text-[16px] font-bold tracking-wider text-slate-800 bg-amber-50 rounded-xl border-2 border-amber-300 px-4 py-3 text-center select-all break-all dark:bg-amber-400/10 dark:text-amber-100 dark:border-amber-400/30">
          {revealedRecovery}
        </div>
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={copyRecovery} className={primary}>{copied ? '✓ הועתק' : 'העתק קוד'}</button>
          <button type="button" onClick={close} className={ghost}>שמרתי — סגור</button>
        </div>
      </div>,
    );
  }

  // setup
  if (mode === 'setup') {
    return shell(
      <div>
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">🔒</div>
          <h2 className="text-[18px] font-extrabold text-slate-800 dark:text-[#f1f6fb]">הגן על המפתחות שלך</h2>
          <p className="text-[13px] text-slate-500 leading-relaxed mt-1 dark:text-[#8ba3bd]">
            בחר סיסמת הצפנה כדי שהמפתחות יעלו לענן מוצפנים. מומלץ. תקבל קוד שחזור לשמירה.
          </p>
        </div>
        <div className="grid gap-3">
          <div>
            <label className={label}>סיסמת הצפנה (לפחות {MIN_PASSPHRASE_LEN} תווים)</label>
            <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} dir="ltr" autoFocus className={field} />
          </div>
          <div>
            <label className={label}>אימות סיסמה</label>
            <input type="password" value={newPass2} onChange={(e) => setNewPass2(e.target.value)} dir="ltr"
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy) handleEnable(); }} className={field} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={handleEnable} disabled={busy} className={primary}>{busy ? 'מפעיל…' : '🔒 הפעל הצפנה'}</button>
            <button type="button" onClick={handleDeclineSetup} disabled={busy} className="text-[12px] font-bold text-slate-400 hover:underline dark:text-[#8ba3bd]">לא עכשיו</button>
          </div>
        </div>
      </div>,
    );
  }

  // unlock
  return shell(
    <div>
      <div className="text-center mb-4">
        <div className="text-4xl mb-2">🔐</div>
        <h2 className="text-[18px] font-extrabold text-slate-800 dark:text-[#f1f6fb]">פתח את המפתחות שלך</h2>
        <p className="text-[13px] text-slate-500 leading-relaxed mt-1 dark:text-[#8ba3bd]">
          בחשבון הזה יש מפתחות API מוצפנים. הקלד את סיסמת ההצפנה כדי לטעון אותם למכשיר.
        </p>
      </div>

      {!forgot && (
        <div className="grid gap-3">
          <div className="relative">
            <input type={showPass ? 'text' : 'password'} value={pass} onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && pass && !busy) handleUnlock(); }}
              placeholder="סיסמת הצפנה" dir="ltr" autoFocus className={`${field} pe-12`} />
            <button type="button" onClick={() => setShowPass((s) => !s)}
              className="absolute inset-y-0 end-2 my-auto h-7 px-2 text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:text-[#8ba3bd]">
              {showPass ? 'הסתר' : 'הצג'}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleUnlock} disabled={busy || !pass} className={primary}>{busy ? 'פותח…' : 'פתח'}</button>
              <button type="button" onClick={close} className={ghost}>דלג</button>
            </div>
            <button type="button" onClick={() => setForgot(true)} className="text-[12px] font-bold text-indigo-600 hover:underline dark:text-[#2dd4bf]">שכחתי סיסמה</button>
          </div>
        </div>
      )}

      {forgot && !recVerified && (
        <div className="grid gap-3">
          <label className={label}>הקלד את קוד השחזור</label>
          <input value={recovery} onChange={(e) => setRecovery(e.target.value)} dir="ltr" autoFocus placeholder="XXXXX-XXXXX-…" className={`${field} font-mono`} />
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleRecVerify} disabled={busy || !recovery} className={primary}>{busy ? 'מאמת…' : 'אמת קוד'}</button>
            <button type="button" onClick={() => { setForgot(false); setRecovery(''); }} className={ghost}>חזור</button>
          </div>
        </div>
      )}

      {forgot && recVerified && (
        <div className="grid gap-3">
          <div className="text-[13px] font-bold text-emerald-700 dark:text-emerald-300">✓ הקוד אומת. קבע סיסמה חדשה:</div>
          <div>
            <label className={label}>סיסמה חדשה (לפחות {MIN_PASSPHRASE_LEN} תווים)</label>
            <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} dir="ltr" className={field} />
          </div>
          <div>
            <label className={label}>אימות</label>
            <input type="password" value={newPass2} onChange={(e) => setNewPass2(e.target.value)} dir="ltr" className={field} />
          </div>
          <button type="button" onClick={handleSetNewPass} disabled={busy} className={primary}>{busy ? 'שומר…' : 'קבע סיסמה ופתח'}</button>
        </div>
      )}
    </div>,
  );
}
