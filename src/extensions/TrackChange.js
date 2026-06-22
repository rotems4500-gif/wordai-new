import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// D5 (בטוח, מבוסס-mark): מעקב הוספות. כשמעקב פעיל, טקסט שנכתב/מודבק מסומן ב-mark
// 'insertion' (קו תחתון כחול). accept מסיר את הסימון (משאיר טקסט), reject מוחק את הטקסט.
// מחיקות אינן נשמרות כ"שינוי מסומן" בגרסה זו — זה החלק שדורש מנגנון כבד יותר.

export const trackChangeKey = new PluginKey('trackChange');

export const TrackChange = Mark.create({
  name: 'insertion',
  inclusive: true,

  addStorage() {
    return { enabled: false };
  },

  parseHTML() {
    return [{ tag: 'span[data-track-insert]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-track-insert': 'true', class: 'track-insert' }), 0];
  },

  addCommands() {
    return {
      setTrackChangesEnabled: (enabled) => () => {
        this.storage.enabled = !!enabled;
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    const markName = this.name;
    return [
      new Plugin({
        key: trackChangeKey,
        appendTransaction(transactions, oldState, newState) {
          if (!storage.enabled) return null;
          const steps = [];
          transactions.forEach((tr) => {
            if (!tr.docChanged || tr.getMeta('trackChangeSkip')) return;
            tr.steps.forEach((step) => steps.push(step));
          });
          if (!steps.length) return null;

          const ranges = [];
          steps.forEach((step, i) => {
            const map = step.getMap();
            map.forEach((oldStart, oldEnd, newStart, newEnd) => {
              if (newEnd <= newStart) return; // הסרה בלבד — לא מסמנים
              let from = newStart;
              let to = newEnd;
              for (let j = i + 1; j < steps.length; j += 1) {
                const m = steps[j].getMap();
                from = m.map(from, -1);
                to = m.map(to, 1);
              }
              ranges.push({ from, to });
            });
          });
          if (!ranges.length) return null;

          const markType = newState.schema.marks[markName];
          if (!markType) return null;
          let tr = newState.tr;
          let changed = false;
          ranges.forEach(({ from, to }) => {
            if (to > from && to <= newState.doc.content.size) {
              tr = tr.addMark(from, to, markType.create());
              changed = true;
            }
          });
          if (!changed) return null;
          tr.setMeta('trackChangeSkip', true);
          tr.setMeta('addToHistory', false);
          return tr;
        },
      }),
    ];
  },
});

// קבל את כל ההוספות: הסר את הסימון, השאר את הטקסט.
export const acceptInsertions = (editor) => {
  if (!editor) return;
  const markType = editor.state.schema.marks.insertion;
  if (!markType) return;
  const caret = editor.state.selection.from;
  const size = editor.state.doc.content.size;
  editor.chain().focus()
    .setTextSelection({ from: 0, to: size })
    .unsetMark('insertion')
    .setTextSelection(Math.min(caret, size))
    .run();
};

// דחה את כל ההוספות: מחק את הטקסט שנוסף.
export const rejectInsertions = (editor) => {
  if (!editor) return;
  const markType = editor.state.schema.marks.insertion;
  if (!markType) return;
  const ranges = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.marks.some((m) => m.type === markType)) {
      ranges.push({ from: pos, to: pos + node.nodeSize });
    }
  });
  if (!ranges.length) return;
  const chain = editor.chain();
  for (let i = ranges.length - 1; i >= 0; i -= 1) {
    chain.deleteRange(ranges[i]);
  }
  chain.run();
};
