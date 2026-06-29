import React from 'react';
import ReactDOM from 'react-dom';

/**
 * Shared accessible modal — declarative counterpart to the imperative
 * showConfirm/showToast in src/services/uiFeedback.js (which stays for
 * service-level calls). RTL-aware, portalled to <body>.
 *
 * Features: role="dialog" + aria-modal, focus trap (Tab cycle + initial focus
 * + focus restore on close), Escape to close (honoring `escapeBlocked`),
 * backdrop click to close (honoring `backdropBlocked`), body scroll lock,
 * z-index from the --z-modal token. Respects prefers-reduced-motion via CSS.
 *
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {string} [title]
 * @param {React.ReactNode} [footer]
 * @param {'sm'|'md'|'lg'|'xl'} [size='md']
 * @param {boolean} [escapeBlocked]   disable Escape-to-close
 * @param {boolean} [backdropBlocked] disable backdrop-click-to-close
 * @param {React.RefObject} [initialFocusRef] element to focus on open
 * @param {string} [labelledBy] / [describedBy] override aria ids
 */
const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  escapeBlocked = false,
  backdropBlocked = false,
  initialFocusRef,
  labelledBy,
  describedBy,
  className = '',
}) {
  const panelRef = React.useRef(null);
  const previouslyFocused = React.useRef(null);
  const titleId = React.useId();

  // Focus management + body scroll lock
  React.useEffect(() => {
    if (!open) return undefined;
    previouslyFocused.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusInitial = () => {
      const target =
        initialFocusRef?.current ||
        panelRef.current?.querySelector(FOCUSABLE) ||
        panelRef.current;
      target?.focus?.();
    };
    // defer to next frame so the panel is in the DOM
    const raf = requestAnimationFrame(focusInitial);

    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, initialFocusRef]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && !escapeBlocked) {
      e.stopPropagation();
      onClose?.();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = panelRef.current?.querySelectorAll(FOCUSABLE);
    if (!nodes || nodes.length === 0) {
      e.preventDefault();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;

  return ReactDOM.createPortal(
    <div
      dir="rtl"
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 'var(--z-modal, 1100)' }}
      onKeyDown={onKeyDown}
    >
      <div
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm"
        onMouseDown={() => !backdropBlocked && onClose?.()}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || (title ? titleId : undefined)}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`relative w-full ${SIZES[size] || SIZES.md} max-h-[90vh] overflow-auto rounded-card bg-white shadow-2xl outline-none dark:bg-[#13212f] dark:text-ink dark:ring-1 dark:ring-white/10 ${className}`}
      >
        {title && (
          <div className="flex items-center justify-between gap-4 border-b border-black/5 px-5 py-4 dark:border-white/10">
            <h2 id={titleId} className="text-[15px] font-bold text-ink">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="סגירה"
              className="flex h-8 w-8 items-center justify-center rounded-pill text-muted transition hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 dark:hover:bg-white/10"
            >
              <i className="ph ph-x text-[18px]" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-start gap-2 border-t border-black/5 px-5 py-4 dark:border-white/10">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
