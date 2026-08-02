import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// הערת שוליים אמיתית: node inline-atom שמחזיק את טקסט ההערה ב-attr,
// כך שהיא שורדת setContent / getHTML / העתקה — בניגוד למימוש הישן שהיה
// <sup class="footnote-ref" title="..."> ש-TipTap פשוט זרק (המאפיינים לא בסכמה).
// המספור נגזר מהמיקום במסמך ומתעדכן אוטומטית (appendTransaction) — מחיקת הערה
// באמצע ממספרת מחדש את כל השאר.
// לחיצה שולחת wordflow:edit-footnote — main.jsx פותח דיאלוג עריכה.

export const footnoteNumberingKey = new PluginKey('footnoteNumbering');
export const FOOTNOTE_EDIT_EVENT = 'wordflow:edit-footnote';

// כל ההערות במסמך, לפי סדר הופעה: [{ pos, text, number }]
export const collectFootnotes = (doc) => {
  const out = [];
  if (!doc) return out;
  doc.descendants((node, pos) => {
    if (node.type?.name === 'footnote') {
      out.push({ pos, text: node.attrs.text || '', number: out.length + 1 });
    }
    return true;
  });
  return out;
};

export const FootnoteNode = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      text: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-footnote-text')
          || element.getAttribute('title')
          || '',
        renderHTML: (attributes) => ({
          'data-footnote-text': attributes.text || '',
          title: attributes.text || '',
        }),
      },
      // המספר נשמר כדי שייצוא/שמירה ל-HTML יראו את הסימון הנכון; מסונכרן ע"י הפלאגין.
      number: {
        default: 1,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-footnote-number')
            || String(element.textContent || '').replace(/[^\d]/g, '');
          const num = Number.parseInt(raw, 10);
          return Number.isFinite(num) && num > 0 ? num : 1;
        },
        renderHTML: (attributes) => ({ 'data-footnote-number': String(attributes.number || 1) }),
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'sup[data-type="footnote"]' },
      { tag: 'sup[data-footnote-text]' },
      // תאימות לאחור למימוש הישן (טקסט ההערה ישב ב-title בלבד)
      {
        tag: 'sup.footnote-ref',
        getAttrs: (element) => (element.getAttribute('title') ? null : false),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes, {
      'data-type': 'footnote',
      class: 'footnote-ref',
    }), `[${node.attrs.number || 1}]`];
  },

  addCommands() {
    return {
      insertFootnote: (text = '') => ({ commands }) => {
        const value = String(text || '').trim();
        if (!value) return false;
        return commands.insertContent({ type: this.name, attrs: { text: value } });
      },
      updateFootnoteAt: (pos, text = '') => ({ tr, dispatch }) => {
        const node = tr.doc.nodeAt(pos);
        if (!node || node.type.name !== this.name) return false;
        if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, text: String(text || '') });
        return true;
      },
      removeFootnoteAt: (pos) => ({ tr, dispatch }) => {
        const node = tr.doc.nodeAt(pos);
        if (!node || node.type.name !== this.name) return false;
        if (dispatch) tr.delete(pos, pos + node.nodeSize);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const typeName = this.name;
    return [
      new Plugin({
        key: footnoteNumberingKey,
        appendTransaction: (transactions, oldState, newState) => {
          if (!transactions.some((t) => t.docChanged)) return null;
          let tr = null;
          let index = 0;
          newState.doc.descendants((node, pos) => {
            if (node.type.name !== typeName) return true;
            index += 1;
            if (node.attrs.number !== index) {
              tr = tr || newState.tr;
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, number: index });
            }
            return true;
          });
          return tr ? tr.setMeta('addToHistory', false) : null;
        },
      }),
    ];
  },

  addNodeView() {
    const typeName = this.name;
    return ({ node, getPos }) => {
      const dom = document.createElement('sup');
      dom.dataset.type = 'footnote';
      dom.className = 'footnote-ref';
      dom.contentEditable = 'false';
      dom.style.cssText = 'color:#2B579A;cursor:pointer;font-weight:600;';

      const render = (attrs) => {
        dom.dataset.footnoteText = attrs.text || '';
        dom.dataset.footnoteNumber = String(attrs.number || 1);
        dom.title = attrs.text || 'הערת שוליים';
        dom.textContent = `[${attrs.number || 1}]`;
      };
      render(node.attrs);

      dom.addEventListener('click', (event) => {
        event.preventDefault();
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (typeof pos !== 'number') return;
        window.dispatchEvent(new CustomEvent(FOOTNOTE_EDIT_EVENT, {
          detail: { pos, text: dom.dataset.footnoteText || '' },
        }));
      });

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== typeName) return false;
          render(updatedNode.attrs);
          return true;
        },
      };
    };
  },
});

export default FootnoteNode;
