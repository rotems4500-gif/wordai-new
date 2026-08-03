import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// הדגשת משפטים "חשודים" (נשמעים כמו AI) דרך decorations — קו גלי, בלי לגעת במסמך
// עצמו (לא נכנס להיסטוריית undo, לא נשמר בשמירה/ייצוא). מודל verbatim על FindHighlight.js.
export const authenticityHighlightKey = new PluginKey('authenticityHighlight');

const severityClass = (level) => {
  const n = Number(level) || 0;
  if (n >= 0.75) return 'authenticity-flag-high';
  if (n >= 0.5) return 'authenticity-flag-med';
  return 'authenticity-flag-low';
};

export const AuthenticityHighlight = Extension.create({
  name: 'authenticityHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: authenticityHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(authenticityHighlightKey);
            if (meta) {
              const ranges = Array.isArray(meta.ranges) ? meta.ranges : [];
              if (!ranges.length) return DecorationSet.empty;
              const decos = ranges
                .filter((r) => r && Number.isInteger(r.from) && Number.isInteger(r.to) && r.to > r.from)
                .map((r) => Decoration.inline(r.from, r.to, { class: severityClass(r.level) }));
              return DecorationSet.create(tr.doc, decos);
            }
            return old.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return authenticityHighlightKey.getState(state);
          },
        },
      }),
    ];
  },
});

// helper: הצגת/עדכון ההדגשות מבחוץ (מ-main.jsx, אחרי ריצת analyzeSentencesAuthenticity).
export const setAuthenticityHighlight = (editor, ranges) => {
  if (!editor?.view) return;
  const tr = editor.state.tr.setMeta(authenticityHighlightKey, { ranges: ranges || [] });
  tr.setMeta('addToHistory', false);
  editor.view.dispatch(tr);
};

// helper: ניקוי ההדגשות (סגירת המודל / הרצה חדשה).
export const clearAuthenticityHighlight = (editor) => {
  if (!editor?.view) return;
  const tr = editor.state.tr.setMeta(authenticityHighlightKey, { ranges: [] });
  tr.setMeta('addToHistory', false);
  editor.view.dispatch(tr);
};
