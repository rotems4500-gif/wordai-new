import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
  ensureAutocompleteIndex,
  suggestCompletion,
  STYLE_AUTOCOMPLETE_READY_EVENT,
} from '../services/styleAutocompleteService';

// StyleAutocomplete — הצעת המשך "רפאים" (ghost text) מתוך הקורפוס האישי.
//
// אין קריאת API: ההצעה מגיעה מ-styleAutocompleteService (אינדקס n-gram מקומי).
// קבלה: חץ שמאלה (RTL = קדימה) או Tab. ביטול: Escape / כל הקלדה שסותרת.
//
// ה-ghost הוא Decoration.widget בלבד — לעולם לא נכנס למסמך עד שמקבלים אותו,
// כך ש-undo/track-changes/ייצוא לא רואים אותו.

export const styleAutocompleteKey = new PluginKey('styleAutocomplete');

const GHOST_CLASS = 'wf-autocomplete-ghost';

// הטקסט מתחילת ה-textblock עד הסמן — הקלט לשאילתת ההשלמה.
function textBeforeCursor(state) {
  const { $from, empty } = state.selection;
  if (!empty) return '';
  if (!$from.parent.isTextblock) return '';
  return $from.parent.textBetween(0, $from.parentOffset, '\n', ' ');
}

// מותר גם באמצע פסקה, אבל לא באמצע מילה: התו שאחרי הסמן חייב להיות גבול
// (סוף בלוק / רווח / פיסוק). אחרת ה-ghost היה נדחף לתוך מילה קיימת.
function atWordBoundary(state) {
  const { $from } = state.selection;
  if ($from.parentOffset === $from.parent.content.size) return true;
  const after = $from.parent.textBetween($from.parentOffset, $from.parentOffset + 1, '\n', ' ');
  return !after || /[\s.,;:!?)\]}"'׳״־-]/.test(after);
}

function computeSuggestion(state) {
  if (!state.selection.empty) return null;
  if (!atWordBoundary(state)) return null;
  const before = textBeforeCursor(state);
  if (!before.trim()) return null;
  const hit = suggestCompletion(before);
  if (!hit?.text) return null;
  return { text: hit.text, pos: state.selection.from, count: hit.count, order: hit.order };
}

function ghostWidget(pos, text) {
  return Decoration.widget(pos, () => {
    const span = document.createElement('span');
    span.className = GHOST_CLASS;
    span.setAttribute('contenteditable', 'false');
    span.textContent = text;
    return span;
  }, { side: 1, marks: [] });
}

export const StyleAutocomplete = Extension.create({
  name: 'styleAutocomplete',

  addOptions() {
    return {
      // בוליאני או פונקציה — פונקציה מאפשרת שינוי מההגדרות בלי לבנות מחדש את העורך.
      enabled: true,
      // 'ArrowLeft' ב-RTL = קדימה. ניתן להחלפה מהגדרות.
      acceptKey: 'ArrowLeft',
      // השהיית debounce: ההצעה מופיעה רק אחרי שקט של X מ"ש בהקלדה.
      idleDelayMs: 3000,
    };
  },

  addProseMirrorPlugins() {
    const extension = this;
    const isEnabled = () => {
      const opt = extension.options.enabled;
      return typeof opt === 'function' ? Boolean(opt()) : Boolean(opt);
    };

    return [
      new Plugin({
        key: styleAutocompleteKey,

        state: {
          init: () => ({ suggestion: null, dismissed: false, pending: false }),
          apply(tr, prev, oldState, newState) {
            const meta = tr.getMeta(styleAutocompleteKey);
            if (meta?.type === 'dismiss') return { suggestion: null, dismissed: true, pending: false };
            if (meta?.type === 'refresh') {
              // ה-timer ירה — עכשיו מחשבים בפועל.
              return {
                suggestion: isEnabled() ? computeSuggestion(newState) : null,
                dismissed: false,
                pending: false,
              };
            }
            if (!isEnabled()) return { suggestion: null, dismissed: false, pending: false };

            // הקלדה/הזזת סמן: מורידים את ה-ghost הקיים ומסמנים pending —
            // ה-view יאתחל מחדש את שעון ה-debounce ורק אחריו נחשב.
            if (tr.docChanged) return { suggestion: null, dismissed: false, pending: true };
            if (tr.selectionSet) {
              if (prev.dismissed) return { suggestion: null, dismissed: true, pending: false };
              return { suggestion: null, dismissed: false, pending: true };
            }
            // המסמך לא השתנה — ממפים את המיקום כדי לא להציג ghost תלוש.
            if (prev.suggestion) {
              const pos = tr.mapping.map(prev.suggestion.pos);
              return { ...prev, suggestion: { ...prev.suggestion, pos } };
            }
            return prev;
          },
        },

        props: {
          decorations(state) {
            const own = styleAutocompleteKey.getState(state);
            if (!own?.suggestion) return DecorationSet.empty;
            return DecorationSet.create(state.doc, [
              // בלי רווח מוביל: ההצעה נוצרת רק כשהטקסט שלפני הסמן כבר מסתיים ברווח.
              ghostWidget(own.suggestion.pos, own.suggestion.text),
            ]);
          },

          handleKeyDown(view, event) {
            const own = styleAutocompleteKey.getState(view.state);
            const suggestion = own?.suggestion;

            if (event.key === 'Escape' && suggestion) {
              view.dispatch(view.state.tr.setMeta(styleAutocompleteKey, { type: 'dismiss' }));
              return true;
            }
            if (!suggestion) return false;

            const isAccept = event.key === extension.options.acceptKey || event.key === 'Tab';
            if (!isAccept) return false;
            // מקש הקבלה חייב להיות "נקי" — Shift+חץ זה בחירה, Ctrl+חץ זה קפיצת מילה.
            if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;

            const tr = view.state.tr.insertText(suggestion.text, view.state.selection.from);
            tr.setMeta(styleAutocompleteKey, { type: 'dismiss' });
            view.dispatch(tr);
            event.preventDefault();
            return true;
          },
        },

        view(editorView) {
          // בניית האינדקס lazy — מתחילה כשהעורך עולה, לא חוסמת אותו.
          let disposed = false;
          let timer = null;

          const clearTimer = () => {
            if (timer) { clearTimeout(timer); timer = null; }
          };

          const refresh = () => {
            clearTimer();
            if (disposed) return;
            const tr = editorView.state.tr.setMeta(styleAutocompleteKey, { type: 'refresh' });
            tr.setMeta('addToHistory', false);
            editorView.dispatch(tr);
          };

          ensureAutocompleteIndex().then(refresh).catch(() => {});
          if (typeof window !== 'undefined') {
            window.addEventListener(STYLE_AUTOCOMPLETE_READY_EVENT, refresh);
          }

          return {
            // debounce: כל עוד pending — מאתחלים מחדש את השעון. הקלדה רצופה
            // דוחה את ההצעה; שקט של idleDelayMs מפעיל אותה.
            update() {
              if (disposed) return;
              const own = styleAutocompleteKey.getState(editorView.state);
              if (!own?.pending) { clearTimer(); return; }
              clearTimer();
              timer = setTimeout(refresh, extension.options.idleDelayMs);
            },
            destroy() {
              disposed = true;
              clearTimer();
              if (typeof window !== 'undefined') {
                window.removeEventListener(STYLE_AUTOCOMPLETE_READY_EVENT, refresh);
              }
            },
          };
        },
      }),
    ];
  },
});
