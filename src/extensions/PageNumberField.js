import { Node, mergeAttributes } from '@tiptap/core';
import { getPageAtPos } from './Pagination';

// שדה מספר-עמוד חי: מציג את העמוד לפי מנוע העימוד (Pagination), עם fallback
// לספירת מעברי-עמוד ידניים. בייצוא DOCX מספרי עמוד אמיתיים מגיעים מה-Footer.
export const PageNumberField = Node.create({
  name: 'pageNumberField',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'span[data-field="page-number"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-field': 'page-number',
      class: 'page-number-field',
    }), '1'];
  },

  addCommands() {
    return {
      insertPageNumberField: () => ({ commands }) => commands.insertContent({ type: this.name }),
    };
  },

  addNodeView() {
    return ({ editor, getPos }) => {
      const dom = document.createElement('span');
      dom.dataset.field = 'page-number';
      dom.className = 'page-number-field';
      dom.contentEditable = 'false';
      dom.style.cssText = 'border:1px solid #cbd5e1;padding:0 6px;border-radius:3px;font-size:0.85em;color:#475569;background:#f8fafc;';
      dom.title = 'שדה מספר עמוד (מתעדכן לפי מעברי עמוד)';

      const update = () => {
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (typeof pos !== 'number') return;
        let page = null;
        try {
          page = getPageAtPos(editor.state, pos);
        } catch { page = null; }
        if (page == null) {
          page = 1;
          try {
            editor.state.doc.nodesBetween(0, Math.min(pos, editor.state.doc.content.size), (node) => {
              if (node.type.name === 'pageBreak') page += 1;
            });
          } catch {
            // מיקום לא תקף רגעית בזמן עדכון — נתעלם
          }
        }
        dom.textContent = String(page);
      };

      update();
      editor.on('update', update);

      return {
        dom,
        destroy: () => { editor.off('update', update); },
      };
    };
  },
});

export default PageNumberField;
