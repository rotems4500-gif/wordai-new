import React from 'react';

/**
 * Shared RTL-aware form controls — Input, TextArea, Select.
 * RTL by default (Hebrew-first). Pass `ltr` for url/code/number fields that
 * read better left-to-right (mirrors the inputDialog logic in main.jsx).
 * Consumes Wave-A tokens (focus ring uses --color-brand).
 *
 * Common props: label, error, hint, id, ltr, className, ...native.
 */
const baseField =
  'w-full rounded-control border bg-white/80 px-3 py-2 text-sm text-ink ' +
  'placeholder:text-muted/70 transition outline-none ' +
  'focus:border-brand focus:ring-2 focus:ring-brand/20 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

function fieldClasses(error, extra) {
  return [baseField, error ? 'border-err/70 focus:border-err focus:ring-err/20' : 'border-black/10', extra]
    .filter(Boolean)
    .join(' ');
}

function Field({ label, error, hint, id, children }) {
  const describedById = hint || error ? `${id || ''}-desc` : undefined;
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-[13px] font-medium text-ink">
          {label}
        </label>
      )}
      {React.cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedById,
      })}
      {(hint || error) && (
        <span id={describedById} className={`text-[12px] ${error ? 'text-err' : 'text-muted'}`}>
          {error || hint}
        </span>
      )}
    </div>
  );
}

export const Input = React.forwardRef(function Input(
  { label, error, hint, id, ltr = false, className = '', ...rest },
  ref,
) {
  return (
    <Field label={label} error={error} hint={hint} id={id}>
      <input
        ref={ref}
        dir={ltr ? 'ltr' : undefined}
        className={fieldClasses(error, ltr ? 'text-left' : '') + (className ? ` ${className}` : '')}
        {...rest}
      />
    </Field>
  );
});

export const TextArea = React.forwardRef(function TextArea(
  { label, error, hint, id, rows = 4, className = '', ...rest },
  ref,
) {
  return (
    <Field label={label} error={error} hint={hint} id={id}>
      <textarea
        ref={ref}
        rows={rows}
        className={fieldClasses(error, 'resize-y leading-relaxed') + (className ? ` ${className}` : '')}
        {...rest}
      />
    </Field>
  );
});

export const Select = React.forwardRef(function Select(
  { label, error, hint, id, className = '', children, ...rest },
  ref,
) {
  return (
    <Field label={label} error={error} hint={hint} id={id}>
      <select ref={ref} className={fieldClasses(error, 'cursor-pointer') + (className ? ` ${className}` : '')} {...rest}>
        {children}
      </select>
    </Field>
  );
});

export default Input;
