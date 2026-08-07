import React, { useState } from 'react';
import { cloudSignInWithEmail, cloudSignUpWithEmail, cloudSendPasswordReset } from './firebase/services';
import { showToast } from './services/uiFeedback';

// טופס כניסה/הרשמה עם אימייל+סיסמה. משמש גם ב-WelcomeGate וגם בדיאלוג ההתחברות.
// mode: 'signin' | 'signup'. הצלחה מתגלגלת דרך onAuthStateChanged — onSuccess אופציונלי.
export default function EmailAuthForm({ initialMode = 'signin', onSuccess }) {
  const [mode, setMode] = useState(initialMode); // signin | signup | reset
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);

  const field = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-800 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 dark:bg-white/5 dark:border-white/12 dark:text-[#f1f6fb]';
  const primary = 'w-full px-5 py-2.5 rounded-xl bg-[var(--wf-accent)] text-[var(--wf-accent-text)] text-[14px] font-extrabold hover:brightness-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed';
  const link = 'text-[12px] font-bold text-indigo-600 hover:underline dark:text-[#2dd4bf]';
  const label = 'block text-[12px] font-bold text-slate-500 mb-1.5 dark:text-[#8ba3bd]';

  const submit = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) { showToast('צריך להקליד כתובת אימייל.', { tone: 'error' }); return; }
    setBusy(true);
    try {
      if (mode === 'reset') {
        await cloudSendPasswordReset(cleanEmail);
        showToast('נשלח אימייל לאיפוס סיסמה — בדוק את תיבת הדואר.', { tone: 'success' });
        setMode('signin');
        return;
      }
      if (!pass) { showToast('צריך להקליד סיסמה.', { tone: 'error' }); return; }
      if (mode === 'signup') {
        if (pass.length < 6) { showToast('הסיסמה חייבת להיות באורך 6 תווים לפחות.', { tone: 'error' }); return; }
        if (pass !== pass2) { showToast('הסיסמאות לא תואמות.', { tone: 'error' }); return; }
        const user = await cloudSignUpWithEmail(cleanEmail, pass);
        showToast('החשבון נוצר. שלחנו אימייל לאימות הכתובת.', { tone: 'success' });
        onSuccess?.(user);
      } else {
        const user = await cloudSignInWithEmail(cleanEmail, pass);
        onSuccess?.(user);
      }
    } catch (e) {
      showToast(e?.message || 'ההתחברות נכשלה.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const onEnter = (e) => { if (e.key === 'Enter' && !busy) submit(); };

  return (
    <div className="grid gap-3">
      <div>
        <label className={label}>אימייל</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr"
          autoComplete="email" onKeyDown={onEnter} className={field} placeholder="you@example.com" />
      </div>
      {mode !== 'reset' && (
        <div>
          <label className={label}>סיסמה</label>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} dir="ltr"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            onKeyDown={onEnter} className={field} />
        </div>
      )}
      {mode === 'signup' && (
        <div>
          <label className={label}>אימות סיסמה</label>
          <input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} dir="ltr"
            autoComplete="new-password" onKeyDown={onEnter} className={field} />
        </div>
      )}
      <button type="button" onClick={submit} disabled={busy} className={primary}>
        {busy ? 'רגע…' : mode === 'signup' ? 'צור חשבון' : mode === 'reset' ? 'שלח אימייל איפוס' : 'התחבר'}
      </button>
      <div className="flex items-center justify-between">
        {mode === 'signin' && (
          <>
            <button type="button" onClick={() => setMode('signup')} className={link}>אין לי חשבון — הרשמה</button>
            <button type="button" onClick={() => setMode('reset')} className={link}>שכחתי סיסמה</button>
          </>
        )}
        {mode === 'signup' && (
          <button type="button" onClick={() => setMode('signin')} className={link}>יש לי כבר חשבון — כניסה</button>
        )}
        {mode === 'reset' && (
          <button type="button" onClick={() => setMode('signin')} className={link}>חזרה לכניסה</button>
        )}
      </div>
    </div>
  );
}
