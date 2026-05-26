import React, { useState, useCallback } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Extension } from "@tiptap/core";
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
  academic: { fontFamily: "'Frank Ruhl Libre', 'Times New Roman', serif", fontSize: '12.5pt', lineHeight: '1.72', padding: '2.54cm', width: '21cm', minHeight: '29.7cm', background: '#ffffff', border: '1px solid #d6d9de' },
  legal: { fontFamily: "'Times New Roman', 'Miriam Libre', serif", fontSize: '12.5pt', lineHeight: '1.85', padding: '2.54cm 2.75cm', width: '21cm', minHeight: '29.7cm', background: '#ffffff', border: '1px solid #d1d5db' },
  business: { fontFamily: "'Segoe UI', 'Assistant', sans-serif", fontSize: '12pt', lineHeight: '1.62', padding: '2.45cm 2.54cm', width: '21cm', minHeight: '29.7cm', background: '#ffffff', border: '1px solid #dbe3ee' },
  presentation: { fontFamily: "'Heebo', 'Segoe UI', sans-serif", fontSize: '14pt', lineHeight: '1.48', padding: '2.15cm', width: '21cm', minHeight: '29.7cm', background: '#ffffff', border: '1px solid #d8d6e8' },
};

const normalizeTextDirection = (value) => {
  const dir = String(value || '').trim().toLowerCase();
  return ['rtl', 'ltr', 'auto'].includes(dir) ? dir : null;
};

const TextDirection = Extension.create({
  name: 'textDirection',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'listItem', 'taskItem', 'tableCell', 'tableHeader'],
        attributes: {
          dir: {
            default: null,
            parseHTML: (element) => normalizeTextDirection(element.getAttribute('dir')),
            renderHTML: (attributes) => {
              const dir = normalizeTextDirection(attributes.dir);
              return dir ? { dir } : {};
            },
          },
        },
      },
    ];
  },
});

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
      const pageMinHeight = dom.dataset.customMinHeight || preset.minHeight;
      const pagePadding = dom.dataset.customPadding || preset.padding;
      const pageFontSize = savedSize || preset.fontSize;
      dom.style.setProperty('--wordai-page-width', pageWidth);
      dom.style.setProperty('--wordai-page-min-height', pageMinHeight);
      dom.style.setProperty('--wordai-page-padding', pagePadding);
      dom.style.setProperty('--wordai-page-font-size', pageFontSize);
      dom.style.setProperty('--wordai-page-line-height', preset.lineHeight);
      dom.style.minHeight = 'var(--wordai-page-min-height)';
      dom.style.padding = 'var(--wordai-page-padding)';
      dom.style.lineHeight = 'var(--wordai-page-line-height)';
      dom.style.background = dom.dataset.customBackground || preset.background;
      dom.style.border = dom.dataset.customBorder || preset.border;
      dom.style.width = 'var(--wordai-page-width)';
      dom.style.maxWidth = 'calc(100vw - 32px)';
      dom.style.marginInline = 'auto';
      dom.style.fontSize = 'var(--wordai-page-font-size)';
      dom.style.fontFamily = savedFont || preset.fontFamily;
      dom.style.textAlign = 'right';
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
      TextDirection,
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
        class: "bg-white shadow-[0_8px_28px_rgba(15,23,42,0.14)] outline-none text-black relative transition-all duration-300 shrink-0 prose max-w-none text-right rounded-[3px] page-surface",
        style: "width: 21cm; max-width: calc(100vw - 32px); min-height: 29.7cm; padding: var(--wordai-page-padding, 2.54cm); font-size: var(--wordai-page-font-size, 12.5pt); line-height: var(--wordai-page-line-height, 1.72); font-family: 'Alef', sans-serif; box-sizing: border-box; overflow-wrap: break-word; word-break: normal; margin-inline: auto; text-align: right;",
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

  const getStoredAiSuggestionRange = useCallback((attrs = {}) => {
    const from = Number(attrs?.replacementFrom);
    const to = Number(attrs?.replacementTo);
    return Number.isInteger(from) && Number.isInteger(to) && from < to
      ? { from, to }
      : null;
  }, []);

  const getActiveAiSuggestion = useCallback(() => {
    if (!editor) return null;
    const markType = editor.state.schema.marks.aiSuggestion;
    if (!markType) return null;

    const selectionFrom = editor.state.selection.from;
    const selectionTo = editor.state.selection.to;

    const activeAttrs = editor.getAttributes('aiSuggestion') || {};
    const suggestionId = String(activeAttrs.suggestionId || '').trim();
    if (!suggestionId) {
      const range = getStoredAiSuggestionRange(activeAttrs) || getAiSuggestionRange();
      if (!range) return null;
      return {
        suggestionId: '',
        attrs: activeAttrs,
        ranges: [range],
        union: range,
      };
    }

    let resolvedAttrs = Object.keys(activeAttrs).length ? activeAttrs : null;
    const ranges = [];

    editor.state.doc.descendants((node, pos) => {
      if (!node.isInline || !Array.isArray(node.marks) || !node.marks.length) return;
      const matchingMark = node.marks.find(
        (mark) => mark.type === markType && String(mark.attrs?.suggestionId || '').trim() === suggestionId,
      );
      if (!matchingMark) return;

      if (!resolvedAttrs) resolvedAttrs = matchingMark.attrs || {};

      const from = pos;
      const to = pos + node.nodeSize;
      const previousRange = ranges[ranges.length - 1];
      if (previousRange && previousRange.to === from) {
        previousRange.to = to;
      } else {
        ranges.push({ from, to });
      }
    });

    const storedRange = getStoredAiSuggestionRange(resolvedAttrs || activeAttrs);

    if (!ranges.length) {
      const range = storedRange || getAiSuggestionRange();
      if (!range) return null;
      return {
        suggestionId: '',
        attrs: resolvedAttrs || activeAttrs,
        ranges: [range],
        union: range,
      };
    }

    const selectionCenter = Math.floor((selectionFrom + selectionTo) / 2);
    const rangeDistanceFromSelection = (range) => {
      if (selectionTo < range.from) return range.from - selectionTo;
      if (selectionFrom > range.to) return selectionFrom - range.to;
      return 0;
    };

    const anchorIndexFromStoredRange = storedRange
      ? ranges.findIndex((range) => range.from < storedRange.to && range.to > storedRange.from)
      : -1;

    const anchorIndex = anchorIndexFromStoredRange >= 0
      ? anchorIndexFromStoredRange
      : ranges.reduce((bestIndex, range, index) => {
          if (bestIndex === -1) return index;

          const bestRange = ranges[bestIndex];
          const distance = rangeDistanceFromSelection(range);
          const bestDistance = rangeDistanceFromSelection(bestRange);

          if (distance !== bestDistance) {
            return distance < bestDistance ? index : bestIndex;
          }

          const center = Math.floor((range.from + range.to) / 2);
          const bestCenter = Math.floor((bestRange.from + bestRange.to) / 2);
          return Math.abs(center - selectionCenter) < Math.abs(bestCenter - selectionCenter)
            ? index
            : bestIndex;
        }, -1);

    const isLocalClusterGap = (leftRange, rightRange) => {
      if (!leftRange || !rightRange) return false;
      if (rightRange.from <= leftRange.to) return true;

      const gapText = editor.state.doc.textBetween(leftRange.to, rightRange.from, '\n', '\n');
      return !gapText.trim();
    };

    let clusterStart = anchorIndex;
    let clusterEnd = anchorIndex;

    while (clusterStart > 0 && isLocalClusterGap(ranges[clusterStart - 1], ranges[clusterStart])) {
      clusterStart -= 1;
    }
    while (clusterEnd < ranges.length - 1 && isLocalClusterGap(ranges[clusterEnd], ranges[clusterEnd + 1])) {
      clusterEnd += 1;
    }

    const localRanges = ranges.slice(clusterStart, clusterEnd + 1);

    return {
      suggestionId,
      attrs: resolvedAttrs || activeAttrs,
      ranges: localRanges,
      union: { from: localRanges[0].from, to: localRanges[localRanges.length - 1].to },
    };
  }, [editor, getAiSuggestionRange, getStoredAiSuggestionRange]);

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
              onClick={() => {
                const suggestion = getActiveAiSuggestion();
                if (!suggestion?.ranges?.length) {
                  editor.chain().focus().unsetMark("aiSuggestion").run();
                  return;
                }

                const chain = editor.chain().focus();
                suggestion.ranges.forEach((range) => {
                  chain.setTextSelection(range).unsetMark("aiSuggestion");
                });
                const cursorPos = suggestion.union?.to ?? suggestion.ranges[suggestion.ranges.length - 1]?.to ?? editor.state.selection.to;
                chain.setTextSelection({ from: cursorPos, to: cursorPos }).run();
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-full bg-green-50 text-green-700 hover:bg-green-100"
              title="אשר שינוי AI"
            >
              <Check size={13} /> אשר
            </button>
            <button
              onClick={() => {
                const suggestion = getActiveAiSuggestion();
                const attrs = suggestion?.attrs || editor.getAttributes("aiSuggestion");
                const unionRange = suggestion?.union || getStoredAiSuggestionRange(attrs) || getAiSuggestionRange();
                const insertAt = unionRange?.from ?? editor.state.selection.from;
                if (unionRange) {
                  editor.chain().focus().setTextSelection(unionRange).deleteSelection().run();
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
