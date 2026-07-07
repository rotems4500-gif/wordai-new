// responseShape.js — נורמליזציה של תשובות ספקים לצורה אחת: ChatResult.
//
// היום Gemini מחזיר finishReason, Claude מחזיר stopReason, OpenAI מחזיר finish_reason —
// וכל צרכן מסתעף לפי ספק. כאן הכל מתנרמל ל-enum אחד + usage אחיד.
//
// ChatResult: {
//   text, finishReason: 'stop'|'length'|'filter'|'tool'|'error'|'',
//   usage: { inputTokens, outputTokens }, provider, model,
//   webResults: [], allowedUrls: [], raw
// }

const FINISH_REASON_MAP = {
  // OpenAI-compatible
  stop: 'stop', length: 'length', content_filter: 'filter', tool_calls: 'tool', function_call: 'tool',
  // Gemini
  STOP: 'stop', MAX_TOKENS: 'length', SAFETY: 'filter', RECITATION: 'filter', OTHER: 'error',
  // Anthropic
  end_turn: 'stop', max_tokens: 'length', stop_sequence: 'stop', tool_use: 'tool', refusal: 'filter',
};

export const normalizeFinishReason = (raw = '') => FINISH_REASON_MAP[String(raw || '').trim()] || (raw ? 'stop' : '');

const toCount = (value) => (Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0);

export const buildChatResult = ({
  text = '',
  provider = '',
  model = '',
  rawFinishReason = '',
  usage = null,
  webResults = [],
  allowedUrls = [],
  raw = null,
} = {}) => ({
  text: String(text || ''),
  finishReason: normalizeFinishReason(rawFinishReason),
  usage: {
    inputTokens: toCount(usage?.inputTokens ?? usage?.prompt_tokens ?? usage?.input_tokens ?? usage?.promptTokenCount),
    outputTokens: toCount(usage?.outputTokens ?? usage?.completion_tokens ?? usage?.output_tokens ?? usage?.candidatesTokenCount),
  },
  provider,
  model,
  webResults: Array.isArray(webResults) ? webResults : [],
  allowedUrls: Array.isArray(allowedUrls) ? allowedUrls.filter(Boolean) : [],
  raw,
});

// payload → ChatResult לכל צורת ספק. extractWebResults מוזרק (הלוגיקה של perplexity
// grounded results נשארת ב-aiService — לא משכפלים אותה כאן).
export const parseOpenAICompatiblePayload = (data = {}, { provider = '', model = '', extractWebResults = null } = {}) => {
  const webResults = typeof extractWebResults === 'function' ? (extractWebResults(data) || []) : [];
  return buildChatResult({
    text: data.choices?.[0]?.message?.content || '',
    provider,
    model: data.model || model,
    rawFinishReason: data.choices?.[0]?.finish_reason || '',
    usage: data.usage,
    webResults,
    allowedUrls: webResults.map((item) => item?.url).filter(Boolean),
    raw: data,
  });
};

export const parseClaudePayload = (data = {}, { provider = 'claude', model = '' } = {}) => buildChatResult({
  text: Array.isArray(data.content) ? data.content.map((block) => block?.text || '').join('') : '',
  provider,
  model: data.model || model,
  rawFinishReason: data.stop_reason || '',
  usage: data.usage,
  raw: data,
});

export const parseGeminiPayload = (data = {}, { provider = 'gemini', model = '' } = {}) => {
  const candidate = data.candidates?.[0] || {};
  const text = Array.isArray(candidate.content?.parts)
    ? candidate.content.parts.map((part) => part?.text || '').join('')
    : '';
  return buildChatResult({
    text,
    provider,
    model,
    rawFinishReason: candidate.finishReason || '',
    usage: data.usageMetadata ? {
      inputTokens: data.usageMetadata.promptTokenCount,
      outputTokens: data.usageMetadata.candidatesTokenCount,
    } : null,
    raw: data,
  });
};

// גשר תאימות: ChatResult → הצורה שהקוד הקיים מצפה לה מ-callOpenAICompatible/callClaudeApi
// ({ text, completion: { finishReason/stopReason, webResults, allowedUrls } }).
export const chatResultToLegacyResponse = (result, { legacyStopReason = false } = {}) => ({
  text: result.text,
  completion: {
    ...(legacyStopReason ? { stopReason: result.finishReason } : { finishReason: result.finishReason }),
    ...(result.webResults.length ? { webResults: result.webResults, allowedUrls: result.allowedUrls } : {}),
    provider: result.provider,
    model: result.model,
    usage: result.usage,
  },
});
