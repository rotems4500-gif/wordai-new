import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// הדגשת התאמות חיפוש דרך decorations (שכבת תצוגה), כדי שההתאמות יוארו גם
// כשהפוקוס נמצא בתיבת החיפוש ולא בעורך — בדיוק כמו ב-Word/Google Docs.
export const findHighlightKey = new PluginKey('findHighlight');

export const FindHighlight = Extension.create({
  name: 'findHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: findHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(findHighlightKey);
            if (meta) {
              const matches = Array.isArray(meta.matches) ? meta.matches : [];
              const active = Number.isInteger(meta.active) ? meta.active : -1;
              if (!matches.length) return DecorationSet.empty;
              const decos = matches
                .filter((m) => m && Number.isInteger(m.from) && Number.isInteger(m.to) && m.to > m.from)
                .map((m, i) => Decoration.inline(m.from, m.to, {
                  class: i === active ? 'find-match find-match-active' : 'find-match',
                }));
              return DecorationSet.create(tr.doc, decos);
            }
            return old.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return findHighlightKey.getState(state);
          },
        },
      }),
    ];
  },
});

// helper: עדכון/ניקוי ההדגשות מבחוץ (מהרכיב FindReplace)
export const setFindHighlight = (editor, matches, active) => {
  if (!editor?.view) return;
  const tr = editor.state.tr.setMeta(findHighlightKey, { matches: matches || [], active });
  tr.setMeta('addToHistory', false);
  editor.view.dispatch(tr);
};
