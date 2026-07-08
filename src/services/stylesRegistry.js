// stylesRegistry.js — סגנונות מהירים מוגדרים ע"י המשתמש (Word-like Quick Styles)
// שמירה ב-localStorage, קריאה/החלה על עורך TipTap.

const STORAGE_KEY = 'wordai_custom_styles';

/**
 * Style shape:
 * {
 *   id: string,
 *   name: string,
 *   fontFamily?: string,
 *   fontSize?: string,      // e.g. '12pt'
 *   bold?: boolean,
 *   italic?: boolean,
 *   underline?: boolean,
 *   color?: string,
 *   align?: 'right' | 'center' | 'left' | 'justify',
 *   lineHeight?: string,
 * }
 */

export function getCustomStyles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => s && typeof s === 'object' && s.id && s.name);
  } catch {
    return [];
  }
}

export function saveCustomStyles(list) {
  try {
    const safe = Array.isArray(list) ? list : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    return true;
  } catch {
    return false;
  }
}

/**
 * קורא את העיצוב הנוכחי מהבחירה/סמן בעורך ובונה ממנו אובייקט סגנון (ללא id/name).
 */
export function buildStyleFromEditor(editor) {
  if (!editor) return {};
  const textStyleAttrs = editor.getAttributes('textStyle') || {};

  const style = {};

  if (textStyleAttrs.fontFamily) style.fontFamily = String(textStyleAttrs.fontFamily);
  if (textStyleAttrs.fontSize) style.fontSize = String(textStyleAttrs.fontSize);
  if (textStyleAttrs.lineHeight) style.lineHeight = String(textStyleAttrs.lineHeight);
  if (textStyleAttrs.color) style.color = String(textStyleAttrs.color);

  style.bold = !!editor.isActive('bold');
  style.italic = !!editor.isActive('italic');
  style.underline = !!editor.isActive('underline');

  if (editor.isActive({ textAlign: 'center' })) style.align = 'center';
  else if (editor.isActive({ textAlign: 'left' })) style.align = 'left';
  else if (editor.isActive({ textAlign: 'justify' })) style.align = 'justify';
  else if (editor.isActive({ textAlign: 'right' })) style.align = 'right';

  return style;
}

/**
 * מחיל סגנון שמור על הבחירה/סמן הנוכחיים בעורך.
 */
export function applyStyleToEditor(editor, style) {
  if (!editor || !style) return;
  const chain = editor.chain().focus();

  if (style.fontFamily) chain.setFontFamily(style.fontFamily);
  if (style.fontSize) chain.setFontSize(style.fontSize);
  if (style.color) chain.setColor(style.color);
  if (style.lineHeight) chain.setLineHeight(style.lineHeight);

  if (typeof style.bold === 'boolean' && editor.isActive('bold') !== style.bold) {
    chain.toggleBold();
  }
  if (typeof style.italic === 'boolean' && editor.isActive('italic') !== style.italic) {
    chain.toggleItalic();
  }
  if (typeof style.underline === 'boolean' && editor.isActive('underline') !== style.underline) {
    chain.toggleUnderline();
  }

  if (style.align) chain.setTextAlign(style.align);

  chain.run();
}
