import { Extension, Node, mergeAttributes } from '@tiptap/core';

// מזהה יציב לכותרות (data-ref-id) — מאפשר הפניות מקושרות ששורדות עריכה והזזה.
export const HeadingRefId = Extension.create({
  name: 'headingRefId',

  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          refId: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-ref-id'),
            renderHTML: (attributes) => (attributes.refId ? { 'data-ref-id': attributes.refId } : {}),
          },
        },
      },
    ];
  },
});

const findHeadingByRefId = (doc, refId) => {
  let found = null;
  if (!refId) return null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === 'heading' && node.attrs.refId === refId) {
      found = { node, pos };
      return false;
    }
    return true;
  });
  return found;
};

// הפניה מקושרת חיה: מציגה את טקסט הכותרת העדכני; קליק גולל אל היעד.
export const CrossReferenceNode = Node.create({
  name: 'crossReference',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      targetId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-target-id') || '',
        renderHTML: (attributes) => ({ 'data-target-id': attributes.targetId || '' }),
      },
      fallbackLabel: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-fallback-label') || '',
        renderHTML: (attributes) => ({ 'data-fallback-label': attributes.fallbackLabel || '' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="cross-reference"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-type': 'cross-reference',
      class: 'cross-reference-node',
    }), node.attrs.fallbackLabel || ''];
  },

  addCommands() {
    return {
      insertCrossReference: ({ targetId, fallbackLabel = '' } = {}) => ({ commands }) => {
        if (!targetId) return false;
        return commands.insertContent({ type: this.name, attrs: { targetId, fallbackLabel } });
      },
    };
  },

  addNodeView() {
    return ({ node, editor }) => {
      const dom = document.createElement('span');
      dom.dataset.type = 'cross-reference';
      dom.className = 'cross-reference-node';
      dom.contentEditable = 'false';
      dom.style.cssText = 'color:#2B579A;text-decoration:underline;cursor:pointer;';
      dom.title = 'הפניה מקושרת — קליק למעבר לכותרת';

      let currentTargetId = node.attrs.targetId;
      let currentFallback = node.attrs.fallbackLabel;

      const refresh = () => {
        const found = findHeadingByRefId(editor.state.doc, currentTargetId);
        dom.textContent = found?.node?.textContent?.trim() || currentFallback || '[הפניה שבורה]';
        dom.style.color = found ? '#2B579A' : '#b91c1c';
      };
      refresh();
      editor.on('update', refresh);

      dom.addEventListener('click', () => {
        const found = findHeadingByRefId(editor.state.doc, currentTargetId);
        if (!found) return;
        const targetDom = editor.view.nodeDOM(found.pos);
        (targetDom instanceof HTMLElement ? targetDom : editor.view.dom)
          .scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'crossReference') return false;
          currentTargetId = updatedNode.attrs.targetId;
          currentFallback = updatedNode.attrs.fallbackLabel;
          refresh();
          return true;
        },
        destroy: () => { editor.off('update', refresh); },
      };
    };
  },
});

export default CrossReferenceNode;
