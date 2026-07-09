import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * AddSynonymDialog — modal for adding a community synonym
 * Renders via createPortal to document.body (parent editor has CSS transform)
 * RTL, Hebrew strings, Tailwind + daisyUI styling
 *
 * @param {string} word - target word to which user adds a synonym
 * @param {(value: string) => Promise<{ok: boolean; error?: string}>} onSave - handler for save
 * @param {() => void} onClose - handler for close
 */
export default function AddSynonymDialog({ word, onSave, onClose }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();

    const trimmed = value.trim();
    if (!trimmed) {
      setError('יש להזין מילה נרדפת');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await onSave(trimmed);
      if (res?.ok) {
        onClose();
      } else {
        const errorMsg =
          res?.error === 'auth'
            ? 'יש להתחבר כדי להוסיף מילים נרדפות'
            : res?.error === 'invalid'
            ? 'יש להזין מילה בעברית (עד 30 תווים), שונה מהמילה המקורית'
            : 'השמירה נכשלה, נסה שוב';
        setError(errorMsg);
      }
    } catch (err) {
      setError('שגיאה בשמירה, נסה שוב');
      console.error('AddSynonymDialog save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      dir="rtl"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-base-100 rounded-2xl shadow-xl border border-base-300 w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-base-300 bg-base-200">
          <h2 className="text-lg font-bold text-base-content">הוספת מילה נרדפת</h2>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {/* Word display */}
          <div>
            <label className="label text-sm font-semibold text-base-content">המילה:</label>
            <div className="input input-bordered bg-base-200 text-base-content font-medium pointer-events-none">
              {word}
            </div>
          </div>

          {/* Synonym input */}
          <div>
            <label className="label text-sm font-semibold text-base-content">מילה נרדפת:</label>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="הקלד את המילה הנרדפת"
              disabled={saving}
              className="input input-bordered w-full text-base-content placeholder-base-content/50 disabled:opacity-50"
              dir="rtl"
              autoComplete="off"
            />
          </div>

          {/* Helper text */}
          <div className="text-xs text-base-content/70 text-right">
            המילה תישלח לאימות ותשותף עם כל המשתמשים.
          </div>

          {/* Error message */}
          {error && (
            <div className="text-sm text-error text-right font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-base-300 bg-base-200 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={saving}
            className="btn btn-ghost btn-sm"
          >
            ביטול
          </button>
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || saving}
            className="btn btn-primary btn-sm"
          >
            {saving ? '⏳ שמירה...' : 'שמור'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
