import { Node, mergeAttributes } from '@tiptap/core';

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [
      { tag: 'div[data-type="page-break"]' },
      { tag: 'div[data-page-break="true"]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'page-break',
        'data-page-break': 'true',
        class: 'page-break-indicator page-break-node',
        contenteditable: 'false',
        style: 'display:block;page-break-after:always;break-after:page;',
      }),
    ];
  },

  addCommands() {
    return {
      setPageBreak: () => ({ commands }) => commands.insertContent([{ type: this.name }, { type: 'paragraph' }]),
    };
  },
});
