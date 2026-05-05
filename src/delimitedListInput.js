import { useEffect, useState } from 'react';

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

export function useDelimitedListInput(value, onCommit) {
  const formattedValue = formatDelimitedList(value);
  const [draftValue, setDraftValue] = useState(formattedValue);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setDraftValue(formattedValue);
    }
  }, [formattedValue, isFocused]);

  const commitDraft = (nextValue = draftValue) => {
    const normalizedValue = formatDelimitedList(normalizeDelimitedList(nextValue));
    setDraftValue(normalizedValue);
    setIsFocused(false);
    onCommit(nextValue);
  };

  return {
    value: draftValue,
    onFocus: () => setIsFocused(true),
    onChange: (event) => {
      const nextValue = typeof event === 'string' ? event : event?.target?.value ?? '';
      setIsFocused(true);
      setDraftValue(nextValue);
    },
    onBlur: (event) => commitDraft(event?.target?.value ?? draftValue),
  };
}