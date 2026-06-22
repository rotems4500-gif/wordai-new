import React from 'react';

/**
 * Shared RTL-aware button. Consumes Wave-A design tokens (bg-brand / bg-chrome…).
 * Replaces the ad-hoc per-component button patterns (.r-btn variants in
 * tailwind.css, TopBar quickBtn/modeBtn, inline FileMenu/HelpModal buttons).
 *
 * @param {object} props
 * @param {'primary'|'chrome'|'ghost'|'danger'|'quiet'} [props.variant='primary']
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {string} [props.iconLeft]   Phosphor icon class, e.g. "ph ph-check"
 * @param {string} [props.iconRight]  Phosphor icon class
 * @param {boolean} [props.loading]   shows spinner + disables
 * @param {boolean} [props.block]     full width
 * @param {boolean} [props.pill]      fully rounded
 */
const VARIANTS = {
  primary: 'bg-brand text-white hover:brightness-110 active:brightness-95 shadow-sm',
  chrome: 'bg-chrome text-white hover:bg-chrome-hover active:brightness-95 shadow-sm',
  ghost: 'bg-transparent text-ink hover:bg-black/5 active:bg-black/10',
  danger: 'bg-err text-white hover:brightness-110 active:brightness-95 shadow-sm',
  quiet: 'bg-black/[0.04] text-ink hover:bg-black/[0.08] active:bg-black/10',
};

const SIZES = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
};

const ICON_ONLY = {
  sm: 'h-8 w-8 px-0',
  md: 'h-10 w-10 px-0',
  lg: 'h-12 w-12 px-0',
};

const Button = React.forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    iconLeft,
    iconRight,
    loading = false,
    block = false,
    pill = false,
    disabled = false,
    type = 'button',
    className = '',
    children,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const iconOnly = !children && (iconLeft || iconRight);
  const classes = [
    'inline-flex items-center justify-center font-semibold select-none',
    'transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
    pill ? 'rounded-pill' : 'rounded-control',
    VARIANTS[variant] || VARIANTS.primary,
    iconOnly ? ICON_ONLY[size] : SIZES[size] || SIZES.md,
    block ? 'w-full' : '',
    isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button ref={ref} type={type} disabled={isDisabled} aria-busy={loading || undefined} className={classes} {...rest}>
      {loading ? (
        <i className="ph ph-spinner animate-spin text-[1.1em]" aria-hidden="true" />
      ) : (
        iconLeft && <i className={`${iconLeft} text-[1.15em]`} aria-hidden="true" />
      )}
      {children}
      {!loading && iconRight && <i className={`${iconRight} text-[1.15em]`} aria-hidden="true" />}
    </button>
  );
});

export default Button;
