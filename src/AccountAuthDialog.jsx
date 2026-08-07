import React, { useEffect } from 'react';
import EmailAuthForm from './EmailAuthForm';

// דיאלוג התחברות לחשבון ענן: Google או אימייל+סיסמה (שניהם על אותו חשבון).
// נסגר אוטומטית כשההתחברות מצליחה (cloudUser מתעדכן דרך onAuthStateChanged).
export default function AccountAuthDialog({ open, cloudUser, onClose, onGoogleSignIn }) {
  useEffect(() => {
    if (open && cloudUser) onClose?.();
  }, [open, cloudUser, onClose]);

  if (!open) return null;

  const primary = 'w-full px-5 py-2.5 rounded-xl bg-[var(--wf-accent)] text-[var(--wf-accent-text)] text-[14px] font-extrabold hover:brightness-105 transition-all';

  return (
    <div dir="rtl" className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl border border-slate-200 p-6 dark:bg-[#0f1d2e] dark:border-white/10">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-[18px] font-extrabold text-slate-800 dark:text-[#f1f6fb]">התחברות לחשבון ענן</h2>
            <p className="text-[12.5px] text-slate-500 leading-relaxed mt-1 dark:text-[#8ba3bd]">
              עם Google או עם אימייל וסיסמה — שניהם מגיעים לאותו חשבון.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-[18px] leading-none px-1" aria-label="סגור">✕</button>
        </div>
        <button type="button" onClick={onGoogleSignIn} className={primary}>
          המשך עם Google
        </button>
        <div className="flex items-center gap-3 my-4">
          <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
          <span className="text-[11px] font-bold text-slate-400 dark:text-[#8ba3bd]">או עם אימייל</span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
        </div>
        <EmailAuthForm initialMode="signin" />
      </div>
    </div>
  );
}
