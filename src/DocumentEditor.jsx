import React, { useState, useCallback } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Image } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { Color } from "@tiptap/extension-color";
import { Highlight } from "@tiptap/extension-highlight";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { TextStyle, FontFamily, FontSize, LineHeight } from "@tiptap/extension-text-style";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { Wand2, Sparkles, CheckCheck, PaintBucket, BookOpen, Table2, Check, X } from "lucide-react";
import { applyInlineAi, getApiKey, getProviderConfig } from "./services/aiService";
import { AiSuggestionMark } from "./extensions/AiSuggestionMark";
import { PageBreak } from "./extensions/PageBreak";

const DOC_STYLE_PRESETS = {
  academic: { fontFamily: "'Frank Ruhl Libre', 'Times New Roman', serif", fontSize: '12pt', lineHeight: '1.9', padding: '2.8cm', width: '21cm', minHeight: '29.7cm', background: '#fffefc', border: '1px solid #dbe3f0' },
  legal: { fontFamily: "'Times New Roman', 'Miriam Libre', serif", fontSize: '12.5pt', lineHeight: '2', padding: '2.6cm 2.9cm', width: '21cm', minHeight: '29.7cm', background: '#fffefe', border: '1px solid #d1d5db' },
  business: { fontFamily: "'Segoe UI', 'Assistant', sans-serif", fontSize: '11.5pt', lineHeight: '1.65', padding: '2.4cm', width: '21cm', minHeight: '29.7cm', background: '#ffffff', border: '1px solid #dbeafe' },
  presentation: { fontFamily: "'Heebo', 'Segoe UI', sans-serif", fontSize: '14pt', lineHeight: '1.5', padding: '2cm', width: '21cm', minHeight: '29.7cm', background: 'linear-gradient(180deg,#ffffff 0%,#f8fbff 100%)', border: '1px solid #c4b5fd' },
};

const getSavedTypographyDefaults = (prefs = {}) => {
  try {
    const savedFont = String(prefs.defaultFontStack || localStorage.getItem('default-font-stack') || prefs.defaultFontFamily || localStorage.getItem('default-font') || '').trim();
    const savedSizeRaw = String(prefs.defaultFontSize || localStorage.getItem('default-size') || '').trim();
    const savedSize = savedSizeRaw && /px|pt|em|rem$/i.test(savedSizeRaw) ? savedSizeRaw : (savedSizeRaw ? `${savedSizeRaw}pt` : '');
    return { savedFont, savedSize };
  } catch {
    return { savedFont: '', savedSize: '' };
  }
};

export default function DocumentEditor({ onReady, onWordCountChange, onCommand = () => {}, onOpenAssistant = () => {}, wordPreferences = {}, documentStyle = 'academic', viewMode = 'print', activeTemplateId = 'blank' }) {
  const [loadingAction, setLoadingAction] = useState(null);
  const [formatPainterActive, setFormatPainterActive] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState(null);
  const [contextPanel, setContextPanel] = useState({ open: false, y: 80 });
  const wrapperRef = React.useRef(null);
  const wordCountFrameRef = React.useRef(null);
  const bubbleActions = React.useMemo(() => ([
    { id: "fix", icon: <CheckCheck size={14} className="text-green-600" />, label: "תיקון" },
    { id: "humanize", icon: <Sparkles size={14} className="text-purple-600" />, label: "האנשה" },
    { id: "summary", icon: <Wand2 size={14} className="text-blue-600" />, label: "סיכום" },
    { id: "academic", icon: <BookOpen size={14} className="text-indigo-600" />, label: "אקדמי" },
    { id: "organize", icon: <PaintBucket size={14} className="text-orange-500" />, label: "ארגון" },
    { id: "textToTable", icon: <Table2 size={14} className="text-teal-600" />, label: "לטבלה" },
  ].filter(({ id }) => wordPreferences?.aiQuickActions?.[id] !== false)), [wordPreferences]);

  const syncEditorSurface = useCallback((instance, styleId = documentStyle) => {
    if (!instance?.view?.dom) return;
    const preset = DOC_STYLE_PRESETS[styleId] || DOC_STYLE_PRESETS.academic;
    const { savedFont, savedSize } = getSavedTypographyDefaults(wordPreferences || {});
    const dom = instance.view.dom;
    const currentViewMode = dom.dataset.viewMode || viewMode || 'print';
    dom.setAttribute('data-placeholder', 'התחל לכתוב כאן...');
    dom.setAttribute('data-empty', instance.isEmpty ? 'true' : 'false');
    dom.setAttribute('data-doc-style', styleId);
    dom.setAttribute('data-active-template', activeTemplateId || 'blank');
    dom.dataset.viewMode = currentViewMode;

    if (currentViewMode === 'print') {
      const pageWidth = dom.dataset.customWidth || preset.width;
      dom.style.minHeight = dom.dataset.customMinHeight || preset.minHeight;
      dom.style.padding = dom.dataset.customPadding || preset.padding;
      dom.style.lineHeight = preset.lineHeight;
      dom.style.background = dom.dataset.customBackground || preset.background;
      dom.style.border = dom.dataset.customBorder || preset.border;
      dom.style.width = `min(100%, ${pageWidth})`;
      dom.style.maxWidth = pageWidth;
      dom.style.marginInline = 'auto';
      dom.style.fontSize = savedSize || preset.fontSize;
      dom.style.fontFamily = savedFont || preset.fontFamily;
    } else if (currentViewMode === 'read') {
      dom.style.minHeight = 'auto';
      dom.style.padding = '24px 32px';
      dom.style.lineHeight = '1.8';
      dom.style.background = '#FAFAFA';
      dom.style.border = 'none';
      dom.style.width = '100%';
      dom.style.maxWidth = '700px';
      dom.style.marginInline = 'auto';
      dom.style.fontSize = '17px';
      dom.style.fontFamily = 'Georgia, serif';
    } else if (currentViewMode === 'outline') {
      dom.style.minHeight = 'auto';
      dom.style.padding = '18px 22px';
      dom.style.lineHeight = '1.4';
      dom.style.background = '#FFFFFF';
      dom.style.border = 'none';
      dom.style.width = '100%';
      dom.style.maxWidth = '100%';
      dom.style.marginInline = '0';
      dom.style.fontSize = '13px';
      dom.style.fontFamily = 'monospace';
    } else {
      dom.style.minHeight = 'auto';
      dom.style.padding = currentViewMode === 'web' ? '20px 40px' : '20px 28px';
      dom.style.lineHeight = preset.lineHeight;
      dom.style.background = '#FFFFFF';
      dom.style.border = 'none';
      dom.style.width = '100%';
      dom.style.maxWidth = '100%';
      dom.style.marginInline = '0';
      dom.style.fontSize = savedSize || preset.fontSize;
      dom.style.fontFamily = savedFont || preset.fontFamily;
    }
  }, [documentStyle, activeTemplateId, viewMode, wordPreferences?.defaultFontFamily, wordPreferences?.defaultFontStack, wordPreferences?.defaultFontSize]);

  // editor חייב להיות מוגדר לפני useCallback שמשתמשים בו
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // כבה extensions שמוגדרים בנפרד כדי למנוע כפילויות
        link: false,
        underline: false,
      }),
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      LineHeight,
      Subscript,
      Superscript,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        defaultAlignment: 'right',
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Image,
      Link.configure({ openOnClick: false }),
      Color,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem,
      AiSuggestionMark,
      PageBreak,
    ],
    content: "<p></p>",
    editorProps: {
      attributes: {
        class: "bg-white shadow-[0_12px_36px_rgba(15,23,42,0.12)] outline-none text-black relative transition-all duration-300 shrink-0 prose max-w-none text-right rounded-[22px] page-surface",
        style: "width: min(100%, 21cm); max-width: 21cm; min-height: 29.7cm; padding: 2.54cm; font-size: 12pt; line-height: 1.6; font-family: 'Alef', sans-serif; box-sizing: border-box; overflow-wrap: anywhere;",
        dir: "rtl",
        spellcheck: 'true',
        autocorrect: 'on',
        autocomplete: 'on',
        autocapitalize: 'sentences',
        lang: 'he',
        'data-placeholder': 'התחל לכתוב כאן...'
      },
      handleDOMEvents: {
        click: (view, event) => {
          const anchor = event.target?.closest?.('a[href]');
          if (anchor && wordPreferences.ctrlClickOpensLinks !== false && event.ctrlKey) {
            event.preventDefault();
            window.open(anchor.getAttribute('href'), '_blank', 'noopener,noreferrer');
            return true;
          }
          return false;
        },
        contextmenu: (view, event) => {
          event.preventDefault();
          const hasSelection = !view.state.selection.empty;
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          if (!hasSelection && typeof pos === 'number') {
            editor?.chain().focus().setTextSelection(pos).run();
          }
          const rect = wrapperRef.current?.getBoundingClientRect();
          const relativeY = rect ? (event?.clientY || 120) - rect.top + (wrapperRef.current?.scrollTop || 0) - 70 : 80;
          setContextPanel({
            open: true,
            y: Math.max(16, relativeY),
          });
          return true;
        },
      },
    },
    onCreate: ({ editor }) => {
      syncEditorSurface(editor, documentStyle);
    },
    onUpdate: ({ editor }) => {
      syncEditorSurface(editor, documentStyle);
      if (onWordCountChange) {
        if (wordCountFrameRef.current) window.cancelAnimationFrame(wordCountFrameRef.current);
        wordCountFrameRef.current = window.requestAnimationFrame(() => {
          const text = editor.getText();
          const words = text.trim().split(/\s+/).filter(word => word.length > 0).length;
          onWordCountChange(words);
        });
      }
    }
  });

  const getAiSuggestionRange = useCallback(() => {
    if (!editor) return null;
    const markType = editor.state.schema.marks.aiSuggestion;
    if (!markType) return null;

    let from = editor.state.selection.from;
    let to = editor.state.selection.to;

    while (from > 1 && editor.state.doc.rangeHasMark(from - 1, from, markType)) from -= 1;
    while (to < editor.state.doc.content.size && editor.state.doc.rangeHasMark(to, to + 1, markType)) to += 1;

    return { from, to };
  }, [editor]);

  const handleAiAction = async (agentId) => {
    if (!editor) return;
    const cfg = getProviderConfig();
    if (cfg.active === 'gemini' && !getApiKey()) {
      alert('לא הוגדר מפתח AI. פתח את ההגדרות מתוך תפריט קובץ.');
      return;
    }

    let { from, to } = editor.state.selection;
    if (from === to) {
      const { $from } = editor.state.selection;
      const blockFrom = $from.start();
      const blockTo = $from.end();
      const blockText = editor.state.doc.textBetween(blockFrom, blockTo, ' ').trim();
      if (!blockText) return;
      editor.chain().focus().setTextSelection({ from: blockFrom, to: blockTo }).run();
      from = blockFrom;
      to = blockTo;
    }

    setLoadingAction(agentId);
    try {
      await applyInlineAi(editor, agentId);
      setContextPanel((prev) => ({ ...prev, open: false }));
    } catch (error) {
      alert("שגיאה מקריאת AI: " + error.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const copyFormat = useCallback(() => {
    if (!editor) return;
    const attrs = editor.getAttributes("textStyle");
    const marks = editor.state.selection.$from.marks().map((m) => ({
      type: m.type.name,
      attrs: m.attrs,
    }));
    setCopiedFormat({ attrs, marks });
    setFormatPainterActive(true);
  }, [editor]);

  const applyFormat = useCallback(() => {
    if (!editor || !copiedFormat) return;
    const chain = editor.chain().focus();
    if (copiedFormat.attrs.fontFamily) chain.setFontFamily(copiedFormat.attrs.fontFamily);
    if (copiedFormat.attrs.fontSize) chain.setFontSize(copiedFormat.attrs.fontSize);
    if (copiedFormat.attrs.color) chain.setColor(copiedFormat.attrs.color);
    copiedFormat.marks.forEach((m) => {
      if (m.type === "bold") chain.setBold();
      if (m.type === "italic") chain.setItalic();
      if (m.type === "underline") chain.setUnderline();
    });
    chain.run();
    setFormatPainterActive(false);
    setCopiedFormat(null);
  }, [editor, copiedFormat]);

  React.useEffect(() => {
    if (editor && onReady) onReady(editor, { copyFormat, applyFormat, formatPainterActive });
  }, [editor, onReady, copyFormat, applyFormat, formatPainterActive]);

  React.useEffect(() => {
    if (editor) syncEditorSurface(editor, documentStyle);
  }, [editor, documentStyle, syncEditorSurface]);

  React.useEffect(() => {
    if (!contextPanel.open) return;
    const closePanel = (e) => {
      if (!e.target.closest?.('[data-context-panel="true"]')) {
        setContextPanel((prev) => ({ ...prev, open: false }));
      }
    };
    document.addEventListener('mousedown', closePanel);
    return () => document.removeEventListener('mousedown', closePanel);
  }, [contextPanel.open]);

  if (!editor) return null;

  return (
    <div ref={wrapperRef} className="flex flex-col items-center w-full min-h-full relative">
      {contextPanel.open && (
        <div
          data-context-panel="true"
          className="absolute right-4 z-40 w-56 rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-sm"
          style={{ top: `${contextPanel.y}px` }}
        >
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="text-sm font-bold text-slate-800">פעולות מהירות</div>
            <div className="text-[11px] text-slate-500 mt-1">נפתח בקליק ימני על המסמך</div>
          </div>
          <div className="p-2 flex flex-col gap-1 text-sm">
            {wordPreferences?.aiQuickActions?.fix !== false && <button className="text-right rounded-xl px-3 py-2 hover:bg-slate-50" onClick={() => handleAiAction('fix')}>✨ תיקון AI</button>}
            {wordPreferences?.aiQuickActions?.summary !== false && <button className="text-right rounded-xl px-3 py-2 hover:bg-slate-50" onClick={() => handleAiAction('summary')}>📝 סיכום מהיר</button>}
            <button className="text-right rounded-xl px-3 py-2 hover:bg-slate-50" onClick={() => { onOpenAssistant(); setContextPanel((prev) => ({ ...prev, open: false })); }}>💬 פתח חלון AI</button>
            <button className="text-right rounded-xl px-3 py-2 hover:bg-slate-50" onClick={() => { onCommand('insertBlankPage'); setContextPanel((prev) => ({ ...prev, open: false })); }}>📄 עמוד ריק</button>
            <button className="text-right rounded-xl px-3 py-2 hover:bg-slate-50" onClick={() => { onCommand('pageBreak'); setContextPanel((prev) => ({ ...prev, open: false })); }}>↩️ מעבר עמוד</button>
            <button className="text-right rounded-xl px-3 py-2 hover:bg-slate-50" onClick={async () => {
              try {
                const selected = editor?.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ');
                if (selected) await navigator.clipboard.writeText(selected);
              } catch {}
              setContextPanel((prev) => ({ ...prev, open: false }));
            }}>📋 העתק נבחר</button>
          </div>
        </div>
      )}

      {/* תפריט צף חכם שמופיע רק כשיש בחירת טקסט */}
      <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }} className="flex flex-wrap overflow-hidden rtl bg-white border border-gray-200 shadow-xl rounded-xl px-2 py-1.5 items-center gap-1 max-w-[520px]">
        {/* --- AI Actions --- */}
        {bubbleActions.length ? (
          bubbleActions.map(({ id, icon, label }) => (
            <button
              key={id}
              onClick={() => handleAiAction(id)}
              disabled={loadingAction !== null}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap ${
                loadingAction === id
                  ? "text-gray-400 bg-gray-50"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              title={label}
            >
              {loadingAction === id ? (
                <span className="animate-spin inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full" />
              ) : (
                icon
              )}
              <span>{loadingAction === id ? "..." : label}</span>
            </button>
          ))
        ) : (
          <button
            onClick={onOpenAssistant}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-full text-slate-700 hover:bg-gray-100"
          >
            ✨ פתח חלון AI
          </button>
        )}

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* --- Accept / Reject AI Suggestion --- */}
        {editor.isActive("aiSuggestion") && (
          <>
            <button
              onClick={() => editor.chain().focus().unsetMark("aiSuggestion").run()}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-full bg-green-50 text-green-700 hover:bg-green-100"
              title="אשר שינוי AI"
            >
              <Check size={13} /> אשר
            </button>
            <button
              onClick={() => {
                const attrs = editor.getAttributes("aiSuggestion");
                const range = getAiSuggestionRange();
                const insertAt = range?.from ?? editor.state.selection.from;
                if (range) {
                  editor.chain().focus().setTextSelection(range).deleteSelection().run();
                }

                if (attrs.originalHtml) {
                  editor.chain().focus().insertContentAt(insertAt, attrs.originalHtml).run();
                } else if (attrs.originalSlice) {
                  try {
                    const parsed = JSON.parse(attrs.originalSlice);
                    editor.chain().focus().insertContentAt(insertAt, parsed).run();
                  } catch {
                    const escaped = (attrs.originalText || '')
                      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    editor.chain().focus().insertContentAt(insertAt, escaped).run();
                  }
                } else if (attrs.originalText) {
                  const escaped = attrs.originalText
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                  editor.chain().focus().insertContentAt(insertAt, escaped).run();
                } else {
                  editor.chain().focus().unsetMark("aiSuggestion").run();
                }
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-full bg-red-50 text-red-700 hover:bg-red-100"
              title="דחה שינוי AI"
            >
              <X size={13} /> דחה
            </button>
          </>
        )}
      </BubbleMenu>

      <EditorContent editor={editor} className="w-full shrink-0" />
    </div>
  );
}
