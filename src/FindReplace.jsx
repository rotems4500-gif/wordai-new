import React from 'react';
import { setFindHighlight } from './extensions/FindHighlight';

// פאנל "חיפוש והחלפה" בסגנון Word. עובד ישירות על instance של TipTap (ProseMirror).
// בונה מפת תווים -> מיקומי ProseMirror כדי לאתר התאמות (כולל חוצה-עיצוב בתוך אותו בלוק),
// ומונע התאמות חוצות-בלוקים על ידי הוספת מפריד בין בלוקים.

const isWordChar = (ch) => !!ch && /[\p{L}\p{N}_]/u.test(ch);

const buildDocCharMap = (editor) => {
  const chars = [];
  const positions = [];
  const doc = editor?.state?.doc;
  if (!doc) return { text: '', positions };
  doc.descendants((node, pos) => {
    if (node.isText) {
      const str = node.text || '';
      for (let i = 0; i < str.length; i += 1) {
        chars.push(str[i]);
        positions.push(pos + i);
      }
    } else if (node.isBlock) {
      if (chars.length && chars[chars.length - 1] !== '\n') {
        chars.push('\n');
        positions.push(null);
      }
    }
    return true;
  });
  return { text: chars.join(''), positions };
};

const computeMatches = (editor, query, { caseSensitive, wholeWord }) => {
  if (!editor || !query) return [];
  const { text, positions } = buildDocCharMap(editor);
  if (!text) return [];
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const len = needle.length;
  if (!len) return [];
  const matches = [];
  let from = 0;
  while (from <= haystack.length - len) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    const endIdx = idx + len - 1;
    const startPos = positions[idx];
    const endPos = positions[endIdx];
    const valid = startPos != null && endPos != null;
    if (valid && wholeWord) {
      const before = text[idx - 1];
      const after = text[idx + len];
      if (isWordChar(before) || isWordChar(after)) {
        from = idx + 1;
        continue;
      }
    }
    if (valid) matches.push({ from: startPos, to: endPos + 1 });
    from = idx + 1;
  }
  return matches;
};

export default function FindReplace({ editor, open, mode = 'find', onClose = () => {} }) {
  const [query, setQuery] = React.useState('');
  const [replaceText, setReplaceText] = React.useState('');
  const [caseSensitive, setCaseSensitive] = React.useState(false);
  const [wholeWord, setWholeWord] = React.useState(false);
  const [showReplace, setShowReplace] = React.useState(mode === 'replace');
  const [matches, setMatches] = React.useState([]);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const findInputRef = React.useRef(null);

  const options = React.useMemo(() => ({ caseSensitive, wholeWord }), [caseSensitive, wholeWord]);

  React.useEffect(() => {
    if (open) {
      setShowReplace(mode === 'replace');
      const selected = editor?.state ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ') : '';
      if (selected && selected.length <= 80) setQuery(selected);
      window.requestAnimationFrame(() => {
        findInputRef.current?.focus();
        findInputRef.current?.select();
      });
    }
  }, [open, mode, editor]);

  const refreshMatches = React.useCallback((keepIndex = false) => {
    const next = computeMatches(editor, query, options);
    setMatches(next);
    setActiveIndex((prev) => {
      if (!next.length) return -1;
      if (keepIndex) return Math.min(Math.max(prev, 0), next.length - 1);
      return -1;
    });
    return next;
  }, [editor, query, options]);

  React.useEffect(() => {
    if (!open) return;
    refreshMatches();
  }, [open, query, caseSensitive, wholeWord, refreshMatches]);

  // רענון חי: אם הטקסט במסמך משתנה בזמן שהפאנל פתוח, חשב מחדש את ההתאמות.
  React.useEffect(() => {
    if (!open || !editor) return undefined;
    const handler = () => refreshMatches(true);
    editor.on('update', handler);
    return () => editor.off('update', handler);
  }, [open, editor, refreshMatches]);

  // הדגשת כל ההתאמות (decorations) + גלילה להתאמה הפעילה — בלי לגזול פוקוס מתיבת החיפוש.
  React.useEffect(() => {
    if (!editor) return undefined;
    if (!open) {
      setFindHighlight(editor, [], -1);
      return undefined;
    }
    setFindHighlight(editor, matches, activeIndex);
    if (activeIndex >= 0) {
      window.requestAnimationFrame(() => {
        const el = editor.view?.dom?.querySelector?.('.find-match-active');
        el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      });
    }
    return undefined;
  }, [editor, open, matches, activeIndex]);

  React.useEffect(() => () => { if (editor) setFindHighlight(editor, [], -1); }, [editor]);

  const goToMatch = React.useCallback((index, list = matches) => {
    if (!list.length) return;
    const safe = ((index % list.length) + list.length) % list.length;
    setActiveIndex(safe);
  }, [matches]);

  const findNext = React.useCallback(() => {
    const list = matches.length ? matches : refreshMatches();
    if (!list.length) return;
    goToMatch(activeIndex + 1, list);
  }, [matches, activeIndex, goToMatch, refreshMatches]);

  const findPrev = React.useCallback(() => {
    const list = matches.length ? matches : refreshMatches();
    if (!list.length) return;
    goToMatch(activeIndex - 1, list);
  }, [matches, activeIndex, goToMatch, refreshMatches]);

  const replaceCurrent = React.useCallback(() => {
    if (!editor || !matches.length) return;
    const idx = activeIndex < 0 ? 0 : Math.min(activeIndex, matches.length - 1);
    const current = matches[idx];
    if (!current) return;
    editor.chain().insertContentAt({ from: current.from, to: current.to }, replaceText).run();
    window.requestAnimationFrame(() => {
      const next = computeMatches(editor, query, options);
      setMatches(next);
      setActiveIndex(next.length ? Math.min(idx, next.length - 1) : -1);
    });
  }, [editor, matches, activeIndex, replaceText, query, options]);

  const replaceAll = React.useCallback(() => {
    if (!editor) return;
    const list = computeMatches(editor, query, options);
    if (!list.length) return;
    const chain = editor.chain();
    for (let i = list.length - 1; i >= 0; i -= 1) {
      chain.insertContentAt({ from: list[i].from, to: list[i].to }, replaceText);
    }
    chain.run();
    window.requestAnimationFrame(() => refreshMatches());
  }, [editor, query, options, replaceText, refreshMatches]);

  if (!open) return null;

  const matchLabel = matches.length
    ? (activeIndex >= 0 ? `${activeIndex + 1} מתוך ${matches.length}` : `${matches.length} תוצאות`)
    : (query ? 'אין תוצאות' : '');

  const handleFindKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) findPrev();
      else findNext();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div dir="rtl" className="fixed top-24 left-6 z-[120] w-[340px] rounded-xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <i className="ph ph-magnifying-glass text-base text-slate-500"></i>
          <span>{showReplace ? 'חיפוש והחלפה' : 'חיפוש'}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowReplace((v) => !v)}
            title={showReplace ? 'הסתר החלפה' : 'הצג החלפה'}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100"
          >
            <i className={`ph ${showReplace ? 'ph-caret-up' : 'ph-swap'} text-base`}></i>
          </button>
          <button
            type="button"
            onClick={onClose}
            title="סגור (Esc)"
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100"
          >
            <i className="ph ph-x text-base"></i>
          </button>
        </div>
      </div>

      <div className="space-y-2 px-3 py-3">
        <div className="flex items-center gap-2">
          <input
            ref={findInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleFindKeyDown}
            placeholder="חפש..."
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white"
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={findPrev}
              disabled={!matches.length}
              title="הקודם (Shift+Enter)"
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
            >
              <i className="ph ph-caret-right text-base"></i>
            </button>
            <button
              type="button"
              onClick={findNext}
              disabled={!matches.length}
              title="הבא (Enter)"
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
            >
              <i className="ph ph-caret-left text-base"></i>
            </button>
            <span className="mr-1 text-xs text-slate-500">{matchLabel}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCaseSensitive((v) => !v)}
              title="התאם אותיות גדולות/קטנות"
              className={`flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold transition ${caseSensitive ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              Aa
            </button>
            <button
              type="button"
              onClick={() => setWholeWord((v) => !v)}
              title="מילה שלמה בלבד"
              className={`flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold transition ${wholeWord ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <i className="ph ph-text-aa text-base"></i>
            </button>
          </div>
        </div>

        {showReplace && (
          <div className="space-y-2 border-t border-slate-100 pt-2">
            <input
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}
              placeholder="החלף ב..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={replaceCurrent}
                disabled={!matches.length}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
              >
                החלף
              </button>
              <button
                type="button"
                onClick={replaceAll}
                disabled={!matches.length}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-40"
              >
                החלף הכל
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
