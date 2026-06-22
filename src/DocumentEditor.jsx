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
import { Wand2, Sparkles, CheckCheck, PaintBucket, Table2, Check, X, GraduationCap, Newspaper, Shield, Clipboard, Copy, Scissors, Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, AlignRight, AlignCenter, AlignLeft, Eraser, UserCheck, Bot } from "lucide-react";
import { applyInlineAi, getApiKey, getProviderConfig } from "./services/aiService";
import { showToast } from "./services/uiFeedback";
import { tagStyleSample } from "./services/styleAuthenticityService";
import { AiSuggestionMark } from "./extensions/AiSuggestionMark";
import { PageBreak } from "./extensions/PageBreak";
import { FindHighlight } from "./extensions/FindHighlight";
import { CommentMark } from "./extensions/CommentMark";
import { TrackChange } from "./extensions/TrackChange";

const DOC_STYLE_PRESETS = {
  academic: { fontFamily: "'Frank Ruhl Libre', 'Times New Roman', serif", fontSize: '12.5pt', lineHeight: '1.72', padding: '2.54cm', width: '21cm', minHeight: '29.7cm', background: '#ffffff', border: '1px solid #d6d9de' },
  legal: { fontFamily: "'Times New Roman', 'Miriam Libre', serif", fontSize: '12.5pt', lineHeight: '1.85', padding: '2.54cm 2.75cm', width: '21cm', minHeight: '29.7cm', background: '#ffffff', border: '1px solid #d1d5db' },
  business: { fontFamily: "'Segoe UI', 'Assistant', sans-serif", fontSize: '12pt', lineHeight: '1.62', padding: '2.45cm 2.54cm', width: '21cm', minHeight: '29.7cm', background: '#ffffff', border: '1px solid #dbe3ee' },
  presentation: { fontFamily: "'Heebo', 'Segoe UI', sans-serif", fontSize: '14pt', lineHeight: '1.48', padding: '2.15cm', width: '21cm', minHeight: '29.7cm', background: '#ffffff', border: '1px solid #d8d6e8' },
};

const MINI_TOOLBAR_FONTS = ['Alef', 'David', 'Assistant', 'Heebo', 'Arial', 'Times New Roman'];
const MINI_TOOLBAR_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '36'];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getBestContextPanelPosition = ({ anchorX, anchorY, containerWidth, containerHeight, menuWidth, menuHeight, gap = 12, padding = 16 }) => {
  const availableRight = containerWidth - anchorX - padding;
  const availableLeft = anchorX - padding;
  const availableBottom = containerHeight - anchorY - padding;
  const availableTop = anchorY - padding;

  const placeRight = availableRight >= availableLeft;
  const placeDown = availableBottom >= availableTop;

  const x = placeRight
    ? anchorX + gap
    : anchorX - menuWidth - gap;
  const y = placeDown
    ? anchorY + gap
    : anchorY - menuHeight - gap;

  return {
    x: clamp(x, padding, Math.max(padding, containerWidth - menuWidth - padding)),
    y: clamp(y, padding, Math.max(padding, containerHeight - menuHeight - padding)),
  };
};

const getSelectionClientRect = (view) => {
  if (!view?.state?.selection || !view?.coordsAtPos) return null;
  const { from, to, empty } = view.state.selection;
  const resolvedFrom = Number(from);
  const resolvedTo = Number(to);
  if (!Number.isInteger(resolvedFrom) || !Number.isInteger(resolvedTo)) return null;

  try {
    const start = view.coordsAtPos(resolvedFrom);
    const end = view.coordsAtPos(empty ? resolvedFrom : resolvedTo);
    const left = Math.min(start.left, end.left);
    const right = Math.max(start.right || start.left, end.right || end.left);
    const top = Math.min(start.top, end.top);
    const bottom = Math.max(start.bottom || start.top, end.bottom || end.top);
    return {
      left,
      right,
      top,
      bottom,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  } catch {
    return null;
  }
};

const getBubbleMenuReferenceRect = (editor) => {
  const rect = getSelectionClientRect(editor?.view);
  if (!rect) return editor?.view?.dom?.getBoundingClientRect?.() || {
    left: 0,
    right: 1,
    top: 0,
    bottom: 1,
    width: 1,
    height: 1,
  };
  const centerX = rect.left + (rect.width / 2);
  return {
    left: centerX,
    right: centerX,
    top: rect.top,
    bottom: rect.bottom,
    width: 1,
    height: rect.height || 1,
  };
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

export default function DocumentEditor({ onReady, onWordCountChange, onCommand = () => {}, onOpenAssistant = () => {}, onContextMenuOpen = () => {}, wordPreferences = {}, documentStyle = 'academic', viewMode = 'print', activeTemplateId = 'blank' }) {
  const [loadingAction, setLoadingAction] = useState(null);
  const [formatPainterActive, setFormatPainterActive] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState(null);
  const [contextPanel, setContextPanel] = useState({ open: false, x: 24, y: 80 });
  // D2: קווי גבול-עמוד (overlay בטוח, ללא reflow) — מציין היכן כל עמוד A4 נגמר.
  const [pageBox, setPageBox] = useState(null);
  const [pageGuides, setPageGuides] = useState([]);
  const wrapperRef = React.useRef(null);
  const wordCountFrameRef = React.useRef(null);
  const bubbleActions = React.useMemo(() => ([
    { id: "sourcesAcademic", type: "assistant", row: 1, icon: <GraduationCap size={14} className="text-indigo-600" />, label: "מקור אקדמי", payload: { classicAgentId: 'sources', composerMode: 'chat', prompt: 'מצא לי מקורות אקדמיים מאומתים בלבד לטקסט או למסמך הפעיל. אם חסר הקשר, התבסס על המסמך והשיחה הקודמת.' } },
    { id: "summary", type: "inline", row: 1, icon: <Wand2 size={14} className="text-blue-600" />, label: "סיכום" },
    { id: "humanize", type: "inline", row: 1, icon: <Sparkles size={14} className="text-purple-600" />, label: "האנשה" },
    { id: "reviewFix", type: "inline", row: 1, icon: <CheckCheck size={14} className="text-rose-600" />, label: "תצרה+תיקון" },
    { id: "fix", type: "inline", row: 1, icon: <CheckCheck size={14} className="text-green-600" />, label: "תיקון" },
    { id: "aiDetect", type: "command", row: 2, icon: <Shield size={14} className="text-fuchsia-600" />, label: "זיהוי AI", command: "openCopyleaksDetector", commandValue: { source: 'selection' } },
    { id: "textToTable", type: "inline", row: 2, icon: <Table2 size={14} className="text-teal-600" />, label: "לטבלה" },
    { id: "organize", type: "inline", row: 2, icon: <PaintBucket size={14} className="text-orange-500" />, label: "ארגון" },
    { id: "holeFill", type: "inline", row: 2, icon: <Wand2 size={14} className="text-lime-600" />, label: "מילוי חורים" },
    { id: "sourcesGeneral", type: "assistant", row: 2, icon: <Newspaper size={14} className="text-sky-600" />, label: "מקור לא אקדמי", payload: { classicAgentId: 'sources', composerMode: 'chat', prompt: 'מצא לי מקורות לא אקדמיים אבל אמינים ומאומתים, כמו כתבות, אתרי ממשלה או גופים רשמיים, לטקסט או למסמך הפעיל.' } },
    { id: "tagDesired", type: "tag", tagKind: "desired", row: 3, icon: <UserCheck size={14} className="text-emerald-600" />, label: "הסגנון שלי (רצוי)" },
    { id: "tagAi", type: "tag", tagKind: "ai", row: 3, icon: <Bot size={14} className="text-rose-500" />, label: "נראה כמו AI" },
  ].filter(({ id }) => wordPreferences?.aiQuickActions?.[id] !== false)), [wordPreferences]);
  const bubbleActionRows = React.useMemo(() => ([1, 2, 3].map((row) => bubbleActions.filter((action) => action.row === row)).filter((row) => row.length)), [bubbleActions]);

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
      FindHighlight,
      CommentMark,
      TrackChange,
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
          event.stopPropagation();
          event.stopImmediatePropagation?.();
          onContextMenuOpen();
          const hasSelection = !view.state.selection.empty;
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          if (!hasSelection && typeof pos === 'number') {
            editor?.chain().focus().setTextSelection(pos).run();
          }
          const menuWidth = 356;
          const menuHeight = 290;
          const viewport = window.visualViewport || window;
          const viewportWidth = viewport.width || window.innerWidth || menuWidth + 48;
          const viewportHeight = viewport.height || window.innerHeight || menuHeight + 48;
          const selectionRect = hasSelection ? getSelectionClientRect(view) : null;
          const viewportOffsetLeft = Number(viewport.offsetLeft) || 0;
          const viewportOffsetTop = Number(viewport.offsetTop) || 0;
          const anchorX = (selectionRect ? selectionRect.right : event?.clientX) - viewportOffsetLeft || 24;
          const anchorY = (selectionRect ? selectionRect.bottom : event?.clientY) - viewportOffsetTop || 80;
          const position = getBestContextPanelPosition({
            anchorX,
            anchorY,
            containerWidth: viewportWidth,
            containerHeight: viewportHeight,
            menuWidth,
            menuHeight,
          });
          setContextPanel({
            open: true,
            x: position.x,
            y: position.y,
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
      showToast('לא הוגדר מפתח AI. פתח את ההגדרות מתוך תפריט קובץ.', { tone: 'warning' });
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
      showToast("שגיאה מקריאת AI: " + error.message, { tone: 'error' });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleBubbleAction = async (action) => {
    if (!action) return;
    if (action.type === 'tag') {
      if (!editor || editor.state.selection.empty) {
        showToast('בחר טקסט לפני התיוג.', { tone: 'warning' });
        return;
      }
      const selected = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ');
      const res = tagStyleSample(selected, action.tagKind);
      showToast(res.message, { tone: res.ok ? (action.tagKind === 'desired' ? 'success' : 'info') : 'warning' });
      return;
    }
    if (action.type === 'inline') {
      await handleAiAction(action.id);
      return;
    }
    if (action.type === 'assistant') {
      onOpenAssistant(action.payload || {});
      return;
    }
    if (action.type === 'command') {
      onCommand(action.command, action.commandValue);
    }
  };

  const closeContextPanel = useCallback(() => {
    setContextPanel((prev) => ({ ...prev, open: false }));
  }, []);

  const applyContextCommand = useCallback((command, value) => {
    if (!editor) return;
    const chain = editor.chain().focus();

    switch (command) {
      case 'fontFamily':
        chain.setFontFamily(value).run();
        break;
      case 'fontSize':
        chain.setFontSize(value).run();
        break;
      case 'bold':
        chain.toggleBold().run();
        break;
      case 'italic':
        chain.toggleItalic().run();
        break;
      case 'underline':
        chain.toggleUnderline().run();
        break;
      case 'bulletList':
        chain.toggleBulletList().run();
        break;
      case 'orderedList':
        chain.toggleOrderedList().run();
        break;
      case 'alignRight':
        chain.setTextAlign('right').run();
        break;
      case 'alignCenter':
        chain.setTextAlign('center').run();
        break;
      case 'alignLeft':
        chain.setTextAlign('left').run();
        break;
      case 'clearFormatting':
        chain.unsetAllMarks().clearNodes().run();
        break;
      default:
        break;
    }
  }, [editor]);

  const handleCopySelection = useCallback(async () => {
    try {
      const selected = editor?.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ');
      if (selected) await navigator.clipboard.writeText(selected);
    } catch {}
    closeContextPanel();
  }, [closeContextPanel, editor]);

  const handleCutSelection = useCallback(async () => {
    if (!editor || editor.state.selection.empty) {
      closeContextPanel();
      return;
    }
    try {
      const selected = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ');
      if (selected) await navigator.clipboard.writeText(selected);
    } catch {}
    editor.chain().focus().deleteSelection().run();
    closeContextPanel();
  }, [closeContextPanel, editor]);

  const handlePasteClipboard = useCallback(async () => {
    if (!editor) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        editor.chain().focus().insertContent(text.replace(/\r\n/g, '\n')).run();
      }
    } catch {}
    closeContextPanel();
  }, [closeContextPanel, editor]);

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
        closeContextPanel();
      }
    };
    const handleEscape = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      closeContextPanel();
    };
    document.addEventListener('mousedown', closePanel);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', closePanel);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closeContextPanel, contextPanel.open]);

  // D2: מדידת גבולות עמוד A4 וציור קווי-עמוד ב-overlay (ללא נגיעה במסמך).
  React.useEffect(() => {
    if (!editor) return undefined;
    const PX_PER_CM = 96 / 2.54;
    const PAGE_OUTER_PX = 29.7 * PX_PER_CM;

    const measure = () => {
      const wrap = wrapperRef.current;
      const pm = wrap?.querySelector('.ProseMirror');
      if (!wrap || !pm || (pm.dataset.viewMode && pm.dataset.viewMode !== 'print')) {
        setPageGuides((prev) => (prev.length ? [] : prev));
        return;
      }
      let top = 0;
      let left = 0;
      let el = pm;
      while (el && el !== wrap) { top += el.offsetTop; left += el.offsetLeft; el = el.offsetParent; }
      const height = pm.offsetHeight;
      const width = pm.offsetWidth;
      const guides = [];
      for (let y = PAGE_OUTER_PX; y < height - 6; y += PAGE_OUTER_PX) {
        guides.push(Math.round(y));
      }
      setPageBox({ top, left, width, height });
      setPageGuides(guides);
    };

    let timer = null;
    const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(measure, 60); };

    schedule();
    editor.on('update', schedule);
    const pmEl = wrapperRef.current?.querySelector('.ProseMirror');
    const ro = pmEl ? new window.ResizeObserver(schedule) : null;
    if (pmEl && ro) ro.observe(pmEl);

    return () => {
      if (timer) clearTimeout(timer);
      editor.off('update', schedule);
      if (ro) ro.disconnect();
    };
  }, [editor, viewMode, documentStyle]);

  if (!editor) return null;

  return (
    <div ref={wrapperRef} className="flex flex-col items-center w-full min-h-full relative">
      {contextPanel.open && (
        <div
          data-context-panel="true"
          className="fixed z-40 max-h-[calc(100vh-32px)] w-[356px] overflow-hidden rounded-2xl border border-slate-200 bg-white/98 shadow-[0_24px_72px_rgba(15,23,42,0.22)] backdrop-blur-sm"
          style={{ left: `${contextPanel.x}px`, top: `${contextPanel.y}px` }}
        >
          <div className="border-b border-slate-200 bg-slate-50/95 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <button className="rounded-lg p-2 text-slate-600 transition hover:bg-white hover:text-slate-900" onClick={handlePasteClipboard} title="הדבק">
                <Clipboard size={16} />
              </button>
              <button className="rounded-lg p-2 text-slate-600 transition hover:bg-white hover:text-slate-900" onClick={handleCutSelection} title="גזור">
                <Scissors size={16} />
              </button>
              <button className="rounded-lg p-2 text-slate-600 transition hover:bg-white hover:text-slate-900" onClick={handleCopySelection} title="העתק">
                <Copy size={16} />
              </button>
              <div className="mx-1 h-5 w-px bg-slate-200" />
              <select
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none"
                value={editor.getAttributes('textStyle').fontFamily || 'Alef'}
                onChange={(e) => applyContextCommand('fontFamily', e.target.value)}
                title="גופן"
              >
                {!MINI_TOOLBAR_FONTS.includes(editor.getAttributes('textStyle').fontFamily || '') && editor.getAttributes('textStyle').fontFamily ? (
                  <option value={editor.getAttributes('textStyle').fontFamily}>{editor.getAttributes('textStyle').fontFamily}</option>
                ) : null}
                {MINI_TOOLBAR_FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
              </select>
              <select
                className="h-9 w-[68px] rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none"
                value={String(editor.getAttributes('textStyle').fontSize || '12').replace(/pt$/i, '')}
                onChange={(e) => applyContextCommand('fontSize', `${e.target.value}pt`)}
                title="גודל"
              >
                {!MINI_TOOLBAR_SIZES.includes(String(editor.getAttributes('textStyle').fontSize || '12').replace(/pt$/i, '')) ? (
                  <option value={String(editor.getAttributes('textStyle').fontSize || '12').replace(/pt$/i, '')}>
                    {String(editor.getAttributes('textStyle').fontSize || '12').replace(/pt$/i, '')}
                  </option>
                ) : null}
                {MINI_TOOLBAR_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
              <button className={`rounded-lg p-2 transition ${editor.isActive('bold') ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`} onClick={() => applyContextCommand('bold')} title="מודגש">
                <Bold size={16} />
              </button>
              <button className={`rounded-lg p-2 transition ${editor.isActive('italic') ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`} onClick={() => applyContextCommand('italic')} title="נטוי">
                <Italic size={16} />
              </button>
              <button className={`rounded-lg p-2 transition ${editor.isActive('underline') ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`} onClick={() => applyContextCommand('underline')} title="קו תחתי">
                <UnderlineIcon size={16} />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button className={`rounded-lg p-2 transition ${editor.isActive('bulletList') ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`} onClick={() => applyContextCommand('bulletList')} title="רשימת נקודות">
                <List size={16} />
              </button>
              <button className={`rounded-lg p-2 transition ${editor.isActive('orderedList') ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`} onClick={() => applyContextCommand('orderedList')} title="רשימה ממוספרת">
                <ListOrdered size={16} />
              </button>
              <button className={`rounded-lg p-2 transition ${editor.isActive({ textAlign: 'right' }) ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`} onClick={() => applyContextCommand('alignRight')} title="יישור לימין">
                <AlignRight size={16} />
              </button>
              <button className={`rounded-lg p-2 transition ${editor.isActive({ textAlign: 'center' }) ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`} onClick={() => applyContextCommand('alignCenter')} title="מרכוז">
                <AlignCenter size={16} />
              </button>
              <button className={`rounded-lg p-2 transition ${editor.isActive({ textAlign: 'left' }) ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`} onClick={() => applyContextCommand('alignLeft')} title="יישור לשמאל">
                <AlignLeft size={16} />
              </button>
              <button className="rounded-lg p-2 text-slate-600 transition hover:bg-white hover:text-slate-900" onClick={() => applyContextCommand('clearFormatting')} title="נקה עיצוב">
                <Eraser size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* תפריט צף חכם שמופיע רק כשיש בחירת טקסט */}
      <BubbleMenu
        editor={editor}
        shouldShow={({ editor }) => !contextPanel.open && !editor.state.selection.empty}
        tippyOptions={{
          duration: 100,
          appendTo: () => document.body,
          placement: 'top',
          strategy: 'fixed',
          getReferenceClientRect: () => getBubbleMenuReferenceRect(editor),
        }}
        className="rtl bg-white border border-gray-200 shadow-xl rounded-2xl px-3 py-2.5 max-w-[760px] min-w-[620px]"
      >
        {bubbleActions.length ? (
          <div className="flex flex-col gap-2">
            {bubbleActionRows.map((row, rowIndex) => (
              <React.Fragment key={`bubble-row-${rowIndex}`}>
                {rowIndex > 0 ? <div className="h-px bg-slate-200 mx-2" /> : null}
                <div className="flex flex-wrap items-center justify-start gap-1.5">
                  {row.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleBubbleAction(action)}
                      disabled={loadingAction !== null}
                      className={`flex flex-row-reverse items-center gap-1.5 px-3 py-1.5 text-[15px] font-semibold rounded-xl transition-colors whitespace-nowrap ${
                        loadingAction === action.id
                          ? "text-gray-400 bg-gray-50"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                      title={action.label}
                    >
                      {loadingAction === action.id ? (
                        <span className="animate-spin inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full" />
                      ) : (
                        action.icon
                      )}
                      <span>{loadingAction === action.id ? "..." : action.label}</span>
                    </button>
                  ))}
                </div>
              </React.Fragment>
            ))}
          </div>
        ) : (
          <button
            onClick={onOpenAssistant}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-full text-slate-700 hover:bg-gray-100"
          >
            ✨ פתח חלון AI
          </button>
        )}

        {/* --- Accept / Reject AI Suggestion --- */}
        {editor.isActive("aiSuggestion") && (
          <>
            <div className="w-full h-px bg-gray-200 my-2" />
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

      {pageBox && pageGuides.length > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: pageBox.top,
            left: pageBox.left,
            width: pageBox.width,
            height: pageBox.height,
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          {pageGuides.map((y, i) => (
            <div key={y} style={{ position: 'absolute', top: y, left: 0, right: 0 }}>
              <div style={{ borderTop: '1px dashed #94a3b8', opacity: 0.7 }} />
              <span
                style={{
                  position: 'absolute',
                  top: -9,
                  left: 12,
                  background: '#eef2f7',
                  color: '#64748b',
                  fontSize: 11,
                  lineHeight: '18px',
                  padding: '0 8px',
                  borderRadius: 9,
                  border: '1px solid #cbd5e1',
                  fontFamily: "'Heebo','Segoe UI',sans-serif",
                }}
              >
                עמוד {i + 2}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
