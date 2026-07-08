import { Node, mergeAttributes } from '@tiptap/core';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// משוואה מתמטית inline: מאוחסנת כ-LaTeX (attr) ומרונדרת עם KaTeX.
// לחיצה כפולה שולחת אירוע wordflow:edit-math — main.jsx פותח דיאלוג עריכה.
export const MathNode = Node.create({
  name: 'mathNode',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-latex') || '',
        renderHTML: (attributes) => ({ 'data-latex': attributes.latex || '' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="math"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-type': 'math',
      class: 'math-node',
    }), node.attrs.latex || ''];
  },

  addCommands() {
    return {
      insertMathNode: (latex = '') => ({ commands }) => commands.insertContent({
        type: this.name,
        attrs: { latex },
      }),
      updateMathNodeAt: (pos, latex = '') => ({ tr, dispatch }) => {
        const node = tr.doc.nodeAt(pos);
        if (!node || node.type.name !== this.name) return false;
        if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, latex });
        return true;
      },
    };
  },

  addNodeView() {
    return ({ node, getPos }) => {
      const dom = document.createElement('span');
      dom.dataset.type = 'math';
      dom.className = 'math-node';
      dom.contentEditable = 'false';
      dom.style.cssText = 'display:inline-block;direction:ltr;padding:0 2px;border-radius:3px;cursor:pointer;';
      dom.title = 'לחיצה כפולה לעריכת המשוואה';

      const render = (latex) => {
        dom.dataset.latex = latex || '';
        try {
          katex.render(latex || '\\;', dom, { throwOnError: false, output: 'html' });
        } catch {
          dom.textContent = latex || '';
        }
      };
      render(node.attrs.latex);

      dom.addEventListener('dblclick', (event) => {
        event.preventDefault();
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (typeof pos !== 'number') return;
        window.dispatchEvent(new CustomEvent('wordflow:edit-math', {
          detail: { pos, latex: dom.dataset.latex || '' },
        }));
      });

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'mathNode') return false;
          render(updatedNode.attrs.latex);
          return true;
        },
      };
    };
  },
});

export default MathNode;
