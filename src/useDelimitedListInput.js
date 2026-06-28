import { useEffect, useState } from 'react';
import { formatDelimitedList, normalizeDelimitedList } from './delimitedListInput';

// מוחזק בקובץ נפרד (רק hook, בלי export-ים אחרים) כדי שלא ישבור את גבול
// ה-React Fast Refresh. כשהוק חי יחד עם פונקציות עזר רגילות באותו מודול, ה-refresh
// boundary לא תקין וגורם ל-"Invalid hook call" ב-dev (ProfileOnboarding/FileMenu).
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
