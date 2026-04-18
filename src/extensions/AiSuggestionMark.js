import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * AiSuggestionMark - הרחבת TipTap מותאמת ל-Track Changes של AI.
 * כאשר ה-AI מחזיר תוצאה, היא מוזרקת עם ה-Mark הזה.
 * לחיצה על הטקסט המסומן מסירה את ה-Mark ומאשרת את השינוי.
 * לחיצה על ❌ מחזירה את הטקסט המקורי.
 */
export const AiSuggestionMark = Mark.create({
  name: 'aiSuggestion',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      agentType: {
        default: 'AI',
        parseHTML: (el) => el.getAttribute('data-agent-type'),
        renderHTML: (attrs) => ({ 'data-agent-type': attrs.agentType }),
      },
      originalText: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-original-text'),
        renderHTML: (attrs) => ({ 'data-original-text': attrs.originalText }),
      },
      originalSlice: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-original-slice'),
        renderHTML: (attrs) => ({ 'data-original-slice': attrs.originalSlice }),
      },
      originalHtml: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-original-html'),
        renderHTML: (attrs) => ({ 'data-original-html': attrs.originalHtml }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-ai-suggestion]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-ai-suggestion': 'true',
        'data-agent-type': HTMLAttributes.agentType,
        'data-original-text': HTMLAttributes.originalText,
        'data-original-slice': HTMLAttributes.originalSlice,
        'data-original-html': HTMLAttributes.originalHtml,
        class:
          'ai-suggestion border-b-2 border-indigo-400 bg-indigo-50 cursor-pointer ' +
          'hover:bg-indigo-100 transition-colors relative group',
        title: 'לחץ לאישור ההצעה (Track Change)',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setAiSuggestion:
        (attributes) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes);
        },
      unsetAiSuggestion:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
      acceptAiSuggestion:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});
