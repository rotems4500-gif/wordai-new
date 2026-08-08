// aiSuggestionApply.js — החלת הצעות AI על עורך TipTap (חולץ מ-aiService.js)
// הופרד כדי ש-entry של תוסף ה-Word (taskpane) לא יגרור ProseMirror לבאנדל.
import { DOMParser as ProseMirrorDOMParser, DOMSerializer } from "@tiptap/pm/model";
import { callAiAgent } from "./aiService";

const AI_EDIT_ALLOWED_INLINE_TAGS = new Set(['strong', 'b', 'em', 'i', 'u', 'span', 's', 'mark', 'sub', 'sup', 'a', 'code']);
const AI_EDIT_ALLOWED_BLOCK_TAGS = new Set(['p', 'div', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote']);
const AI_EDIT_ALLOWED_TAGS = new Set([...AI_EDIT_ALLOWED_INLINE_TAGS, ...AI_EDIT_ALLOWED_BLOCK_TAGS]);
const AI_EDIT_BLOCKED_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'option']);
const AI_EDIT_SINGLE_REGION_ERROR = 'מצב העריכה במסמך תומך כרגע רק בהחלפת מקטע רציף אחד. בקש מהמודל להחזיר ניסוח בפסקה אחת בלי רשימות או בלוקים מרובים ונסה שוב.';
const AI_EDIT_STRUCTURED_MULTILINE_LINE_PATTERN = /^(?:(?:[-*+]|\u2022|[\dA-Za-z\u0590-\u05FF]+[.)])\s+|#{1,6}\s+|>\s+|\[[ xX]\]\s+|[^.!?\n]{1,80}:)$/u;
const AI_EDIT_SINGLE_CODE_FENCE_WRAPPER_PATTERN = /^```[^\n`]*\r?\n([\s\S]*?)\r?\n```\s*$/;

const stripAiReplacementCodeFence = (value = '') => {
  const trimmed = String(value || '').trim();
  if (!trimmed.startsWith('```')) return trimmed;
  const match = trimmed.match(AI_EDIT_SINGLE_CODE_FENCE_WRAPPER_PATTERN);
  return match ? String(match[1] || '').trim() : trimmed;
};

const escapeAiSuggestionHtml = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const sanitizeAiSuggestionHref = (value = '') => {
  const href = String(value || '').trim();
  if (!href) return '';
  if (/^(?:javascript|data|vbscript):/i.test(href)) return '';
  return href;
};

const buildAiSuggestionHtmlFromText = (value = '') => {
  const normalized = String(value || '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return '';
  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (!paragraphs.length) return '';
  return paragraphs
    .map((paragraph) => `<p>${escapeAiSuggestionHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
};

const sanitizeAiSuggestionHtml = (value = '', { allowBlockElements = true } = {}) => {
  if (typeof DOMParser === 'undefined') {
    return { ok: false, multiBlock: true, value: String(value || '').trim() };
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<div>${String(value || '')}</div>`, 'text/html');
  const container = parsed.body.firstElementChild;
  if (!container) {
    return { ok: false, empty: true, value: '' };
  }

  const unwrapElement = (element) => {
    while (element.firstChild) {
      element.parentNode?.insertBefore(element.firstChild, element);
    }
    element.remove();
  };

  const sanitizeElement = (element) => {
    Array.from(element.children).forEach((child) => sanitizeElement(child));

    const tagName = element.tagName.toLowerCase();
    if (AI_EDIT_BLOCKED_TAGS.has(tagName)) {
      element.remove();
      return;
    }

    if (!AI_EDIT_ALLOWED_TAGS.has(tagName)) {
      unwrapElement(element);
      return;
    }

    Array.from(element.attributes).forEach((attr) => {
      const attrName = attr.name.toLowerCase();
      if (tagName === 'a' && ['href', 'target', 'rel'].includes(attrName)) return;
      element.removeAttribute(attr.name);
    });

    if (tagName === 'a') {
      const href = sanitizeAiSuggestionHref(element.getAttribute('href'));
      if (href) {
        element.setAttribute('href', href);
        element.setAttribute('rel', 'noopener noreferrer');
        if (element.getAttribute('target') === '_blank') {
          element.setAttribute('target', '_blank');
        } else {
          element.removeAttribute('target');
        }
      } else {
        element.removeAttribute('href');
        element.removeAttribute('target');
        element.removeAttribute('rel');
      }
    }
  };

  Array.from(container.children).forEach((child) => sanitizeElement(child));

  const html = container.innerHTML.trim();
  const textContent = String(container.textContent || '').replace(/\u00A0/g, ' ').trim();
  if (!textContent) {
    return { ok: false, empty: true, value: '' };
  }

  const hasBlockElements = Array.from(container.querySelectorAll('*'))
    .some((element) => AI_EDIT_ALLOWED_BLOCK_TAGS.has(element.tagName.toLowerCase()));

  if (!allowBlockElements && hasBlockElements) {
    return { ok: false, multiBlock: true, value: html || String(value || '').trim() };
  }

  return { ok: true, value: html };
};

const createAiSuggestionId = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `ai-suggestion-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const prepareAiSuggestionReplacement = (replacementText, { enforceSingleRegion = false } = {}) => {
  const stripped = stripAiReplacementCodeFence(replacementText);
  if (!stripped) {
    return { ok: false, empty: true, value: '' };
  }

  const looksLikeHtml = /<\/?[a-z][^>]*>/i.test(stripped);
  if (!looksLikeHtml) {
    const normalized = stripped.replace(/\r\n?/g, '\n').trim();
    if (!normalized) {
      return { ok: false, empty: true, value: '' };
    }
    const nonEmptyLines = normalized
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (enforceSingleRegion) {
      if (/\n\s*\n/.test(normalized)) {
        return { ok: false, multiBlock: true, value: normalized };
      }
      if (
        nonEmptyLines.length > 1 &&
        nonEmptyLines.some((line) => AI_EDIT_STRUCTURED_MULTILINE_LINE_PATTERN.test(line))
      ) {
        return { ok: false, multiBlock: true, value: normalized };
      }
      return {
        ok: true,
        value: normalized
          .replace(/[ \t]*\n[ \t]*/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim(),
      };
    }

    if (!/\n/.test(normalized)) {
      return {
        ok: true,
        value: normalized
          .replace(/[ \t]*\n[ \t]*/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim(),
      };
    }

    const html = buildAiSuggestionHtmlFromText(normalized);
    const sanitizedHtml = sanitizeAiSuggestionHtml(html, { allowBlockElements: true });
    if (!sanitizedHtml.ok) {
      return sanitizedHtml.empty
        ? { ok: false, empty: true, value: '' }
        : { ok: false, multiBlock: true, value: normalized };
    }

    return { ok: true, value: sanitizedHtml.value };
  }

  return sanitizeAiSuggestionHtml(stripped, { allowBlockElements: !enforceSingleRegion });
};

const serializeAiSuggestionOriginalHtml = (editor, from, to) => {
  const serializer = DOMSerializer.fromSchema(editor.schema);
  const fragment = serializer.serializeFragment(editor.state.doc.slice(from, to).content);
  const tempDiv = document.createElement('div');
  tempDiv.appendChild(fragment);
  return tempDiv.innerHTML;
};

const parseAiSuggestionReplacementSlice = (editor, clean = '') => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = clean;
  const slice = ProseMirrorDOMParser.fromSchema(editor.schema).parseSlice(tempDiv);
  return slice?.size ? slice : null;
};

const prepareAiSuggestionRangeTransaction = (editor, { from, to, replacementText, agentType = 'assistant-edit', enforceSingleRegion = false, targetId = '' } = {}) => {
  const safeFrom = Number(from);
  const safeTo = Number(to);
  if (!Number.isInteger(safeFrom) || !Number.isInteger(safeTo) || safeFrom >= safeTo) {
    throw new Error('Invalid AI edit target');
  }

  const selectedText = editor.state.doc.textBetween(safeFrom, safeTo, ' ');
  if (!selectedText.trim()) {
    throw new Error('AI edit target is empty');
  }

  const originalSlice = JSON.stringify(editor.state.doc.slice(safeFrom, safeTo).content.toJSON());
  const originalHtml = serializeAiSuggestionOriginalHtml(editor, safeFrom, safeTo);
  const preparedReplacement = prepareAiSuggestionReplacement(replacementText, { enforceSingleRegion });
  if (!preparedReplacement.ok) {
    if (preparedReplacement.empty) return null;
    if (enforceSingleRegion) {
      throw new Error(AI_EDIT_SINGLE_REGION_ERROR);
    }
    return null;
  }

  const clean = preparedReplacement.value;
  if (!clean) return null;

  const slice = parseAiSuggestionReplacementSlice(editor, clean);
  if (!slice) return null;

  const suggestionId = createAiSuggestionId();
  const replacementTo = safeFrom + slice.size;
  return {
    from: safeFrom,
    to: safeTo,
    replacementTo,
    text: clean,
    slice,
    suggestionId,
    targetId,
    markAttrs: {
      suggestionId,
      agentType,
      originalText: selectedText,
      originalSlice,
      originalHtml,
      replacementFrom: safeFrom,
      replacementTo,
    },
  };
};

export const applyAiSuggestionToRange = (editor, { from, to, replacementText, agentType = 'assistant-edit', enforceSingleRegion = false } = {}) => {
  if (!editor) throw new Error('Editor instance is required');

  const safeFrom = Number(from);
  const safeTo = Number(to);
  if (!Number.isInteger(safeFrom) || !Number.isInteger(safeTo) || safeFrom >= safeTo) {
    throw new Error('Invalid AI edit target');
  }

  const selectedText = editor.state.doc.textBetween(safeFrom, safeTo, ' ');
  if (!selectedText.trim()) {
    throw new Error('AI edit target is empty');
  }

  const originalSlice = JSON.stringify(editor.state.doc.slice(safeFrom, safeTo).content.toJSON());
  const serializer = DOMSerializer.fromSchema(editor.schema);
  const fragment = serializer.serializeFragment(editor.state.doc.slice(safeFrom, safeTo).content);
  const tempDiv = document.createElement('div');
  tempDiv.appendChild(fragment);
  const originalHtml = tempDiv.innerHTML;
  const preparedReplacement = prepareAiSuggestionReplacement(replacementText, { enforceSingleRegion });
  if (!preparedReplacement.ok) {
    if (preparedReplacement.empty) return null;
    if (enforceSingleRegion) {
      throw new Error(AI_EDIT_SINGLE_REGION_ERROR);
    }
    return null;
  }

  const clean = preparedReplacement.value;

  if (!clean) return null;

  const suggestionId = createAiSuggestionId();

  editor.chain().focus().setTextSelection({ from: safeFrom, to: safeTo }).deleteSelection().insertContent(clean).run();
  const insertedTo = editor.state.selection.to;
  editor.chain().focus()
    .setTextSelection({ from: safeFrom, to: insertedTo })
    .setMark('aiSuggestion', {
      suggestionId,
      agentType,
      originalText: selectedText,
      originalSlice,
      originalHtml,
      replacementFrom: safeFrom,
      replacementTo: insertedTo,
    })
    .run();

  return { from: safeFrom, to: insertedTo, text: clean, suggestionId };
};

export const applyAiSuggestionBatchToRanges = (editor, edits = [], { agentType = 'assistant-edit', enforceSingleRegion = false } = {}) => {
  if (!editor) throw new Error('Editor instance is required');
  const markType = editor.schema.marks.aiSuggestion;
  if (!markType) throw new Error('AI suggestion mark is not available');

  const sortedEdits = (Array.isArray(edits) ? edits : [])
    .map((entry) => ({
      from: entry?.from ?? entry?.target?.from,
      to: entry?.to ?? entry?.target?.to,
      replacementText: entry?.replacementText,
      targetId: entry?.targetId || entry?.target?.targetId || '',
    }))
    .sort((left, right) => {
      if (Number(right.from) !== Number(left.from)) return Number(right.from) - Number(left.from);
      return Number(right.to) - Number(left.to);
    });

  const prepared = sortedEdits.map((entry) => prepareAiSuggestionRangeTransaction(editor, {
    ...entry,
    agentType,
    enforceSingleRegion,
  }));

  if (prepared.some((entry) => !entry)) return null;

  let transaction = editor.state.tr;
  prepared.forEach((entry) => {
    transaction = transaction.replace(entry.from, entry.to, entry.slice);
    transaction = transaction.addMark(entry.from, entry.replacementTo, markType.create(entry.markAttrs));
  });

  if (!transaction.docChanged) return null;
  editor.view.focus();
  editor.view.dispatch(transaction.scrollIntoView());

  return prepared.map((entry) => ({
    from: entry.from,
    to: entry.replacementTo,
    text: entry.text,
    suggestionId: entry.suggestionId,
    targetId: entry.targetId,
  }));
};

export const applyInlineAi = async (editor, agentId) => {
  const { from, to, empty } = editor.state.selection;
  if (empty) return;
  const selectedText = editor.state.doc.textBetween(from, to, " ");
  if (!selectedText.trim()) return;
  const aiResultText = await callAiAgent(agentId, selectedText);
  if (!aiResultText) return;
  applyAiSuggestionToRange(editor, { from, to, replacementText: aiResultText, agentType: agentId });
};
