import { Node, mergeAttributes } from '@tiptap/core';

// תוכן עניינים חי: node אטומי שמרנדר את רשימת הכותרות הנוכחית בכל עדכון מסמך.
// אין תוכן שמור — הרשימה מחושבת בזמן רנדור, כך ש"עדכן תוכן עניינים" מיותר.
export const TocNode = Node.create({
  name: 'tocNode',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="toc-live"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'toc-live',
      class: 'toc-live-node',
    }), 'תוכן עניינים'];
  },

  addCommands() {
    return {
      insertTocNode: () => ({ commands }) => commands.insertContentAt(1, { type: this.name }),
    };
  },

  addNodeView() {
    return ({ editor }) => {
      const dom = document.createElement('div');
      dom.dataset.type = 'toc-live';
      dom.className = 'toc-live-node';
      dom.contentEditable = 'false';
      dom.style.cssText = 'border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:8px 0;background:#f8fafc;';

      const render = () => {
        const headings = [];
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'heading' && node.textContent.trim()) {
            headings.push({ level: node.attrs.level || 1, text: node.textContent.trim(), pos });
          }
        });
        const items = headings.map((h, i) => (
          `<div data-toc-pos="${h.pos}" style="padding-right:${(h.level - 1) * 16}px;cursor:pointer;color:#2B579A;font-size:${h.level === 1 ? 14 : 13}px;line-height:1.9;${h.level === 1 ? 'font-weight:600;' : ''}">${h.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`
        )).join('');
        dom.innerHTML = `<div style="font-weight:700;font-size:15px;color:#1e293b;margin-bottom:6px">תוכן עניינים</div>${items || '<div style="color:#94a3b8;font-size:13px">אין כותרות במסמך עדיין</div>'}`;
      };

      render();
      editor.on('update', render);

      dom.addEventListener('click', (event) => {
        const item = event.target.closest('[data-toc-pos]');
        if (!item) return;
        const pos = Number(item.dataset.tocPos);
        if (!Number.isFinite(pos)) return;
        try {
          const target = editor.view.nodeDOM(Math.min(pos, editor.state.doc.content.size));
          (target instanceof HTMLElement ? target : editor.view.dom).scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch { /* מיקום השתנה — מתעלמים */ }
      });

      return {
        dom,
        destroy: () => { editor.off('update', render); },
      };
    };
  },
});

export default TocNode;
