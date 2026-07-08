import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ReplaceStep, ReplaceAroundStep } from '@tiptap/pm/transform';

// מעקב שינויים מבוסס-marks:
// - הוספות: mark 'insertion' (קו תחתון כחול).
// - מחיקות: הטקסט לא נמחק בפועל — מוחזר עם mark 'deletion' (קו חוצה אדום).
// - כל פעולה מקבלת changeId לקיבוץ, מה שמאפשר קבל/דחה פר-שינוי (ראה collectTrackedChanges).
// מגבלה מכוונת: מחיקת מבנים מורכבים (טבלה/תמונה) משוחזרת כטקסט בלבד.

export const trackChangeKey = new PluginKey('trackChange');

const makeChangeId = () => `tc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const changeAttrs = {
  changeId: {
    default: null,
    parseHTML: (element) => element.getAttribute('data-change-id'),
    renderHTML: (attributes) => (attributes.changeId ? { 'data-change-id': attributes.changeId } : {}),
  },
};

export const TrackChange = Mark.create({
  name: 'insertion',
  inclusive: true,

  addStorage() {
    return { enabled: false };
  },

  addAttributes() {
    return { ...changeAttrs };
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
    const insertionName = this.name;

    return [
      new Plugin({
        key: trackChangeKey,
        appendTransaction(transactions, oldState, newState) {
          if (!storage.enabled) return null;

          const insertionType = newState.schema.marks[insertionName];
          const deletionType = newState.schema.marks.deletion;
          if (!insertionType || !deletionType) return null;

          const relevant = transactions.filter((t) => t.docChanged
            && !t.getMeta('trackChangeSkip')
            && !t.getMeta('history$'));
          if (!relevant.length) return null;

          const changeId = makeChangeId();
          let tr = newState.tr;
          let changed = false;

          // --- סימון הוספות (טקסט חדש) ---
          const insertRanges = [];
          const allSteps = [];
          relevant.forEach((transaction) => transaction.steps.forEach((step) => allSteps.push(step)));
          allSteps.forEach((step, i) => {
            const map = step.getMap();
            map.forEach((oldStart, oldEnd, newStart, newEnd) => {
              if (newEnd <= newStart) return;
              let from = newStart;
              let to = newEnd;
              for (let j = i + 1; j < allSteps.length; j += 1) {
                const m = allSteps[j].getMap();
                from = m.map(from, -1);
                to = m.map(to, 1);
              }
              insertRanges.push({ from, to });
            });
          });
          insertRanges.forEach(({ from, to }) => {
            if (to > from && to <= newState.doc.content.size) {
              tr = tr.addMark(from, to, insertionType.create({ changeId }));
              changed = true;
            }
          });

          // --- שחזור מחיקות עם mark 'deletion' ---
          // עוברים על ה-steps של כל טרנזקציה עם snapshot של המסמך שלפניהם (transaction.docs[i]).
          const deletions = [];
          relevant.forEach((transaction) => {
            transaction.steps.forEach((step, i) => {
              if (!(step instanceof ReplaceStep) && !(step instanceof ReplaceAroundStep)) return;
              const docBefore = transaction.docs[i] || transaction.before;
              const map = step.getMap();
              map.forEach((oldStart, oldEnd, newStart) => {
                if (oldEnd <= oldStart) return; // הוספה טהורה
                let removedSlice;
                try {
                  removedSlice = docBefore.slice(oldStart, oldEnd);
                } catch {
                  return;
                }
                const removedText = removedSlice.content.textBetween(0, removedSlice.content.size, '\n', '');
                if (!removedText.trim() && removedText.length <= 1) return;

                // אם כל מה שנמחק היה טקסט שסומן כהוספה במעקב — מוחקים באמת (המשתמש התחרט על ההוספה שלו)
                let allInserted = true;
                let sawText = false;
                docBefore.nodesBetween(oldStart, oldEnd, (node) => {
                  if (node.isText) {
                    sawText = true;
                    if (!node.marks.some((m) => m.type.name === insertionName)) allInserted = false;
                  }
                  return !node.isText;
                });
                if (sawText && allInserted) return;

                deletions.push({ transaction, stepIndex: i, newStart, removedText });
              });
            });
          });

          // מיפוי מיקום ההזרקה דרך שאר ה-steps של אותה טרנזקציה + הטרנזקציות הבאות
          const mapPosForward = (target, startTransaction, startStepIndex, pos) => {
            let mapped = pos;
            let seenStart = false;
            relevant.forEach((transaction) => {
              transaction.steps.forEach((step, i) => {
                if (!seenStart) {
                  if (transaction === startTransaction && i === startStepIndex) seenStart = true;
                  return;
                }
                mapped = step.getMap().map(mapped, -1);
              });
              if (transaction === startTransaction) seenStart = true;
            });
            return mapped;
          };

          deletions.forEach(({ transaction, stepIndex, newStart, removedText }) => {
            let pos = mapPosForward(newState, transaction, stepIndex, newStart);
            pos = tr.mapping.map(pos, -1);
            const size = tr.doc.content.size;
            if (pos < 0 || pos > size) return;
            tr = tr.insertText(removedText, pos);
            tr = tr.addMark(pos, pos + removedText.length, deletionType.create({ changeId }));
            // אין להשאיר את הסמן בתוך הטקסט המשוחזר
            changed = true;
          });

          if (!changed) return null;
          tr.setMeta('trackChangeSkip', true);
          return tr;
        },
      }),
    ];
  },
});

export const DeletionMark = Mark.create({
  name: 'deletion',
  inclusive: false,

  addAttributes() {
    return { ...changeAttrs };
  },

  parseHTML() {
    return [{ tag: 'span[data-track-delete]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-track-delete': 'true', class: 'track-delete' }), 0];
  },
});

// --- איסוף שינויים לפאנל: רצפי טקסט עם insertion/deletion מקובצים לפי changeId ---
export const collectTrackedChanges = (editor) => {
  if (!editor) return [];
  const groups = new Map();
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    node.marks.forEach((mark) => {
      if (mark.type.name !== 'insertion' && mark.type.name !== 'deletion') return;
      const id = mark.attrs.changeId || `legacy_${mark.type.name}`;
      const key = `${id}:${mark.type.name}`;
      if (!groups.has(key)) {
        groups.set(key, { id, key, type: mark.type.name, ranges: [], text: '' });
      }
      const group = groups.get(key);
      const last = group.ranges[group.ranges.length - 1];
      const from = pos;
      const to = pos + node.nodeSize;
      if (last && last.to === from) {
        last.to = to;
      } else {
        group.ranges.push({ from, to });
      }
      group.text += node.text || '';
    });
    return true;
  });
  return [...groups.values()].sort((a, b) => (a.ranges[0]?.from || 0) - (b.ranges[0]?.from || 0));
};

const applyToChange = (editor, change, mode) => {
  if (!editor || !change?.ranges?.length) return;
  const remove = (mode === 'accept' && change.type === 'deletion')
    || (mode === 'reject' && change.type === 'insertion');
  // בלי ה-meta, מחיקת הטקסט של accept/reject הייתה נתפסת שוב על-ידי מנגנון המעקב
  const chain = editor.chain().focus().command(({ tr }) => { tr.setMeta('trackChangeSkip', true); return true; });
  const sorted = [...change.ranges].sort((a, b) => b.from - a.from);
  sorted.forEach(({ from, to }) => {
    if (remove) {
      chain.deleteRange({ from, to });
    } else {
      chain.setTextSelection({ from, to }).unsetMark(change.type);
    }
  });
  const caret = Math.min(change.ranges[0].from, editor.state.doc.content.size);
  chain.setTextSelection(caret).run();
};

export const acceptTrackedChange = (editor, change) => applyToChange(editor, change, 'accept');
export const rejectTrackedChange = (editor, change) => applyToChange(editor, change, 'reject');

// כל שינוי מזיז מיקומים — אז אוספים מחדש אחרי כל החלה (מהאחרון לראשון)
const applyToAllChanges = (editor, mode) => {
  if (!editor) return;
  let guard = 0;
  while (guard < 1000) {
    guard += 1;
    const changes = collectTrackedChanges(editor);
    if (!changes.length) break;
    applyToChange(editor, changes[changes.length - 1], mode);
  }
};

// קבל את כל השינויים: הוספות נשארות (בלי סימון), מחיקות מוסרות סופית.
export const acceptInsertions = (editor) => applyToAllChanges(editor, 'accept');

// דחה את כל השינויים: הוספות נמחקות, מחיקות משוחזרות (הסימון מוסר).
export const rejectInsertions = (editor) => applyToAllChanges(editor, 'reject');
