// Pure list helpers. The React hook lives in useDelimitedListInput.js so this
// module stays free of React (mixing a hook with plain exports breaks the dev
// React Fast Refresh boundary).
export const normalizeDelimitedList = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  return String(value || '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

export const formatDelimitedList = (value) => {
  if (Array.isArray(value)) return value.join(', ');
  return String(value || '');
};