// uiFeedback.js — שירות toast/confirm/alert פנימי אחיד.
// מחליף את window.alert/window.confirm המקומיים ב-UI מעוצב, RTL, תואם למותג.
// עצמאי לחלוטין: מזריק container ל-body, לא תלוי בעץ ה-React, ולכן עובד
// גם מתוך services וגם מתוך event handlers.

const BRAND = 'var(--word-blue, #2B579A)';

const TONE_STYLES = {
  info: { bg: '#0f172a', accent: BRAND, icon: 'ℹ️' },
  success: { bg: '#065f46', accent: '#10b981', icon: '✓' },
  warning: { bg: '#92400e', accent: '#f59e0b', icon: '⚠️' },
  error: { bg: '#991b1b', accent: '#ef4444', icon: '✕' },
};

let toastHost = null;
let styleInjected = false;

const injectStyleOnce = () => {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
@keyframes wf-feedback-in { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes wf-feedback-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(12px); } }
@keyframes wf-feedback-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .wf-feedback-toast, .wf-feedback-overlay, .wf-feedback-dialog { animation: none !important; }
}`;
  document.head.appendChild(style);
};

const ensureToastHost = () => {
  if (typeof document === 'undefined') return null;
  injectStyleOnce();
  if (toastHost && document.body.contains(toastHost)) return toastHost;
  toastHost = document.createElement('div');
  toastHost.setAttribute('dir', 'rtl');
  Object.assign(toastHost.style, {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '2147483600',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    alignItems: 'center',
    pointerEvents: 'none',
    maxWidth: 'min(520px, 92vw)',
  });
  document.body.appendChild(toastHost);
  return toastHost;
};

/**
 * הצגת toast חולף (מחליף window.alert לרוב המקרים).
 * @param {string} message
 * @param {{tone?: 'info'|'success'|'warning'|'error', duration?: number, actionLabel?: string, onAction?: () => void, onDismiss?: () => void}} [opts]
 */
export const showToast = (message, opts = {}) => {
  const host = ensureToastHost();
  if (!host) return () => {};
  const tone = TONE_STYLES[opts.tone] || TONE_STYLES.info;
  const duration = Number.isFinite(opts.duration) ? opts.duration : 4200;

  const toast = document.createElement('div');
  toast.className = 'wf-feedback-toast';
  toast.setAttribute('role', tone === TONE_STYLES.error ? 'alert' : 'status');
  Object.assign(toast.style, {
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    background: tone.bg,
    color: 'white',
    borderRight: `4px solid ${tone.accent}`,
    borderRadius: '14px',
    padding: '12px 16px',
    boxShadow: '0 12px 32px rgba(2,6,23,0.45)',
    fontSize: '13px',
    lineHeight: '1.6',
    fontWeight: '500',
    animation: 'wf-feedback-in 0.2s ease both',
    maxWidth: '100%',
  });

  const iconEl = document.createElement('span');
  iconEl.textContent = tone.icon;
  iconEl.style.flexShrink = '0';
  const textEl = document.createElement('div');
  textEl.style.whiteSpace = 'pre-wrap';
  textEl.style.flex = '1';
  textEl.textContent = String(message ?? '');

  toast.appendChild(iconEl);
  toast.appendChild(textEl);
  host.appendChild(toast);

  let removed = false;
  let acted = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    toast.style.animation = 'wf-feedback-out 0.18s ease both';
    setTimeout(() => toast.remove(), 180);
    if (!acted && typeof opts.onDismiss === 'function') {
      try { opts.onDismiss(); } catch {}
    }
  };

  // כפתור פעולה אופציונלי (למשל "התקן עכשיו" בהודעת עדכון) — לחיצה עליו אינה "התעלמות".
  if (opts.actionLabel && typeof opts.onAction === 'function') {
    const actionEl = document.createElement('button');
    actionEl.type = 'button';
    actionEl.textContent = String(opts.actionLabel);
    Object.assign(actionEl.style, {
      flexShrink: '0',
      alignSelf: 'center',
      border: '1px solid rgba(255,255,255,0.55)',
      background: 'rgba(255,255,255,0.14)',
      color: 'white',
      borderRadius: '999px',
      padding: '5px 12px',
      fontSize: '12px',
      fontWeight: '700',
      cursor: 'pointer',
      fontFamily: 'inherit',
    });
    actionEl.addEventListener('click', (event) => {
      event.stopPropagation();
      acted = true;
      remove();
      try { opts.onAction(); } catch {}
    });
    toast.appendChild(actionEl);
  }

  toast.addEventListener('click', remove);
  const timer = setTimeout(remove, duration);
  toast.addEventListener('mouseenter', () => clearTimeout(timer));
  return remove;
};

// --- שורת מצב מתמשכת (status chip) ---
// toast חולף לא מתאים לעבודה שנמשכת דקות (OCR של PDF סרוק): הוא נעלם אחרי
// שניות והמסך נראה תקוע. הצ'יפ נשאר על המסך ומתעדכן במקום עד שקוראים לו לרדת.
// מזוהה לפי id — קריאה חוזרת עם אותו id מעדכנת טקסט ולא מוסיפה שורה.

let statusHost = null;
const statusChips = new Map();

const ensureStatusHost = () => {
  if (typeof document === 'undefined') return null;
  injectStyleOnce();
  if (statusHost && document.body.contains(statusHost)) return statusHost;
  statusHost = document.createElement('div');
  statusHost.setAttribute('dir', 'rtl');
  Object.assign(statusHost.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: '2147483599',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    alignItems: 'flex-end',
    pointerEvents: 'none',
    maxWidth: 'min(420px, 90vw)',
  });
  document.body.appendChild(statusHost);
  return statusHost;
};

/**
 * מציג/מעדכן שורת מצב מתמשכת. מחזיר פונקציית סגירה.
 * @param {string} id מזהה יציב (למשל 'clip-ingest')
 * @param {string} message
 * @param {{tone?: 'info'|'success'|'warning'|'error'}} [opts]
 */
export const setStatusChip = (id, message, opts = {}) => {
  const key = String(id || 'default');
  const host = ensureStatusHost();
  if (!host) return () => {};
  const tone = TONE_STYLES[opts.tone] || TONE_STYLES.info;

  let entry = statusChips.get(key);
  if (!entry || !host.contains(entry.el)) {
    const el = document.createElement('div');
    el.className = 'wf-feedback-toast';
    el.setAttribute('role', 'status');
    Object.assign(el.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      background: 'rgba(15,23,42,0.94)',
      color: 'white',
      borderRadius: '999px',
      padding: '9px 16px',
      boxShadow: '0 10px 28px rgba(2,6,23,0.4)',
      fontSize: '12.5px',
      fontWeight: '600',
      animation: 'wf-feedback-in 0.2s ease both',
      maxWidth: '100%',
    });
    const spinner = document.createElement('span');
    spinner.textContent = '⏳';
    spinner.style.flexShrink = '0';
    const textEl = document.createElement('span');
    textEl.style.flex = '1';
    el.appendChild(spinner);
    el.appendChild(textEl);
    host.appendChild(el);
    entry = { el, textEl, spinner };
    statusChips.set(key, entry);
  }
  entry.spinner.textContent = opts.tone && opts.tone !== 'info' ? tone.icon : '⏳';
  entry.el.style.borderRight = `4px solid ${tone.accent}`;
  entry.textEl.textContent = String(message ?? '');
  return () => clearStatusChip(key);
};

export const clearStatusChip = (id) => {
  const key = String(id || 'default');
  const entry = statusChips.get(key);
  if (!entry) return;
  statusChips.delete(key);
  entry.el.style.animation = 'wf-feedback-out 0.18s ease both';
  setTimeout(() => entry.el.remove(), 180);
};

/**
 * דיאלוג אישור (מחליף window.confirm). מחזיר Promise<boolean>.
 * @param {string} message
 * @param {{title?: string, confirmLabel?: string, cancelLabel?: string, tone?: 'default'|'danger'}} [opts]
 */
export const showConfirm = (message, opts = {}) => {
  if (typeof document === 'undefined') return Promise.resolve(false);
  injectStyleOnce();
  const {
    title = '',
    confirmLabel = 'אישור',
    cancelLabel = 'ביטול',
    tone = 'default',
  } = opts;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'wf-feedback-overlay';
    overlay.setAttribute('dir', 'rtl');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483601',
      background: 'rgba(15,23,42,0.45)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      animation: 'wf-feedback-fade 0.15s ease both',
    });

    const dialog = document.createElement('div');
    dialog.className = 'wf-feedback-dialog';
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');
    Object.assign(dialog.style, {
      width: '420px',
      maxWidth: '96%',
      background: 'white',
      borderRadius: '20px',
      boxShadow: '0 24px 60px rgba(2,6,23,0.35)',
      padding: '22px 24px',
      animation: 'wf-feedback-in 0.2s ease both',
      textAlign: 'right',
    });

    if (title) {
      const titleEl = document.createElement('div');
      titleEl.textContent = title;
      Object.assign(titleEl.style, { fontSize: '17px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' });
      dialog.appendChild(titleEl);
    }

    const msgEl = document.createElement('div');
    msgEl.textContent = String(message ?? '');
    Object.assign(msgEl.style, { fontSize: '14px', color: '#334155', lineHeight: '1.7', whiteSpace: 'pre-wrap', marginBottom: '20px' });
    dialog.appendChild(msgEl);

    const actions = document.createElement('div');
    Object.assign(actions.style, { display: 'flex', gap: '10px', justifyContent: 'flex-start' });

    const confirmColor = tone === 'danger' ? '#dc2626' : BRAND;

    let settled = false;
    const close = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey);
      overlay.style.animation = 'wf-feedback-fade 0.12s ease reverse both';
      setTimeout(() => overlay.remove(), 120);
      resolve(result);
    };

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = confirmLabel;
    Object.assign(confirmBtn.style, {
      padding: '9px 22px', borderRadius: '12px', border: 'none', cursor: 'pointer',
      background: confirmColor, color: 'white', fontSize: '14px', fontWeight: '700',
    });
    confirmBtn.addEventListener('click', () => close(true));

    actions.appendChild(confirmBtn);

    if (cancelLabel) {
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = cancelLabel;
      Object.assign(cancelBtn.style, {
        padding: '9px 18px', borderRadius: '12px', border: '1px solid #e2e8f0', cursor: 'pointer',
        background: '#f8fafc', color: '#475569', fontSize: '14px', fontWeight: '600',
      });
      cancelBtn.addEventListener('click', () => close(false));
      actions.appendChild(cancelBtn);
    }
    dialog.appendChild(actions);
    overlay.appendChild(dialog);

    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(false); });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Enter') { e.preventDefault(); close(true); }
    };
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    confirmBtn.focus();
  });
};

/**
 * דיאלוג הודעה עם אישור יחיד (מחליף window.alert כשצריך acknowledgement מפורש).
 * לרוב עדיף showToast. מחזיר Promise<void>.
 */
export const showAlert = (message, opts = {}) =>
  showConfirm(message, { ...opts, cancelLabel: '', confirmLabel: opts.confirmLabel || 'הבנתי' }).then(() => {});
