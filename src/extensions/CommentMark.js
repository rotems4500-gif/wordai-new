import { Mark, mergeAttributes } from '@tiptap/core';

// D6: סימון הערה (mark) שמעגן טקסט להערה לפי commentId. mark בטוח (לא widget decoration).
export const CommentMark = Mark.create({
  name: 'comment',
  inclusive: false,
  excludes: '',

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-comment-id'),
        renderHTML: (attrs) => (attrs.commentId ? { 'data-comment-id': attrs.commentId } : {}),
      },
      resolved: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-resolved') === 'true',
        renderHTML: (attrs) => (attrs.resolved ? { 'data-resolved': 'true' } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'comment-mark' }), 0];
  },

  addCommands() {
    return {
      setComment: (commentId) => ({ commands }) => commands.setMark(this.name, { commentId, resolved: false }),
      unsetComment: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
});

// סריקת המסמך והסרת mark של הערה לפי id (למחיקה/שחרור).
export const removeCommentById = (editor, commentId) => {
  if (!editor) return;
  const markType = editor.state.schema.marks.comment;
  if (!markType) return;
  const ranges = [];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const mark = node.marks.find((m) => m.type === markType && m.attrs.commentId === commentId);
    if (mark) ranges.push({ from: pos, to: pos + node.nodeSize });
  });
  if (!ranges.length) return;
  const chain = editor.chain();
  ranges.forEach(({ from, to }) => chain.setTextSelection({ from, to }).unsetMark('comment'));
  chain.run();
};
