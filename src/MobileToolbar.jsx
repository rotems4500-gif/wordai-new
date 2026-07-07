import React from 'react';

// סרגל עריכה קומפקטי לטלפון — מחליף את ה-Ribbon המלא במסכים צרים (≤640px).
// שורה אחת נגללת אופקית עם פעולות העריכה החיוניות בלבד, בכפתורי מגע גדולים.
// כפתור ה-AI מוצמד בקצה ולא נגלל, כדי שתמיד יהיה נגיש.
export default function MobileToolbar({
  onCommand = () => {},
  onUndo = () => {},
  onRedo = () => {},
  onToggleTaskpane = () => {},
  onOpenFileMenu = () => {},
  assistantOpen = false,
  activeFormats = {},
}) {
  const blockValue = activeFormats.isBlockquote
    ? 'quote'
    : activeFormats.headingLevel
      ? `h${activeFormats.headingLevel}`
      : 'p';

  const applyBlockStyle = (value) => {
    if (value === 'quote') onCommand('blockquote');
    else if (value.startsWith('h')) onCommand('heading', Number(value.slice(1)));
    else onCommand('paragraph');
  };

  const cycleAlign = () => {
    if (activeFormats.alignRight) onCommand('alignCenter');
    else if (activeFormats.alignCenter) onCommand('alignLeft');
    else onCommand('alignRight');
  };
  const alignIcon = activeFormats.alignCenter
    ? 'ph-text-align-center'
    : activeFormats.alignLeft
      ? 'ph-text-align-left'
      : 'ph-text-align-right';

  const btn = (icon, title, action, isActive = false) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={isActive || undefined}
      className={`wf-mtb-btn ${isActive ? 'is-active' : ''}`}
      onClick={action}
    >
      <i className={`ph ${icon}`}></i>
    </button>
  );

  return (
    <div className="wf-mobile-toolbar" dir="rtl">
      <button
        type="button"
        title="תפריט קובץ"
        aria-label="תפריט קובץ"
        className="wf-mtb-file"
        onClick={onOpenFileMenu}
      >
        <i className="ph ph-list"></i>
      </button>
      <div className="wf-mtb-scroll">
        {btn('ph-arrow-counter-clockwise', 'בטל', onUndo)}
        {btn('ph-arrow-clockwise', 'בצע שוב', onRedo)}
        <span className="wf-mtb-sep" />
        <select
          className="wf-mtb-select"
          title="סגנון פסקה"
          aria-label="סגנון פסקה"
          value={blockValue}
          onChange={(e) => applyBlockStyle(e.target.value)}
        >
          <option value="p">טקסט</option>
          <option value="h1">כותרת 1</option>
          <option value="h2">כותרת 2</option>
          <option value="h3">כותרת 3</option>
          <option value="quote">ציטוט</option>
        </select>
        {btn('ph-text-b', 'מודגש', () => onCommand('bold'), activeFormats.bold)}
        {btn('ph-text-italic', 'נטוי', () => onCommand('italic'), activeFormats.italic)}
        {btn('ph-text-underline', 'קו תחתון', () => onCommand('underline'), activeFormats.underline)}
        <span className="wf-mtb-sep" />
        {btn('ph-list-bullets', 'רשימת תבליטים', () => onCommand('bulletList'), activeFormats.bulletList)}
        {btn('ph-list-numbers', 'רשימה ממוספרת', () => onCommand('orderedList'), activeFormats.orderedList)}
        {btn(alignIcon, 'יישור (החלפה)', cycleAlign)}
        <span className="wf-mtb-sep" />
        {btn('ph-text-aa', 'הגדל גופן', () => onCommand('fontSizeInc'))}
        {btn('ph-text-a-underline', 'הקטן גופן', () => onCommand('fontSizeDec'))}
        {btn('ph-highlighter', 'סימון (מרקר)', () => onCommand('setHighlight', '#FEF08A'))}
        {btn('ph-table', 'הוסף טבלה 3×3', () => onCommand('insertTable', { rows: 3, cols: 3 }))}
        {btn('ph-eraser', 'נקה עיצוב', () => onCommand('clearFormatting'))}
      </div>
      <button
        type="button"
        title="עוזר ה-AI"
        aria-label="עוזר ה-AI"
        className={`wf-mtb-ai ${assistantOpen ? 'is-active' : ''}`}
        onClick={onToggleTaskpane}
      >
        <i className="ph-fill ph-sparkle"></i>
      </button>
    </div>
  );
}
