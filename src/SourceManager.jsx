import React from 'react';

// D7: מנהל מקורות/ביבליוגרפיה. עובד מול אותו מאגר localStorage שכבר משמש את
// פקודות הציטוט הקיימות (bib-sources + citation-style), כך שהכול נשאר מסונכרן.

const STORE_KEY = 'bib-sources';
const STYLE_KEY = 'citation-style';
const STYLES = ['APA', 'MLA', 'Chicago'];

const loadSources = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const formatCitationText = (style, author, year) => {
  if (style === 'MLA') return `(${author} ${year})`;
  if (style === 'Chicago') return `${author} (${year})`;
  return `(${author}, ${year})`;
};

export default function SourceManager({ open, onClose = () => {}, onCommand = () => {}, editor = null }) {
  const [sources, setSources] = React.useState([]);
  const [style, setStyle] = React.useState('APA');
  const [draft, setDraft] = React.useState({ author: '', year: String(new Date().getFullYear()), title: '' });
  const [editingIndex, setEditingIndex] = React.useState(-1);

  React.useEffect(() => {
    if (!open) return;
    setSources(loadSources());
    setStyle(localStorage.getItem(STYLE_KEY) || 'APA');
    setEditingIndex(-1);
    setDraft({ author: '', year: String(new Date().getFullYear()), title: '' });
  }, [open]);

  const persist = (next) => {
    setSources(next);
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  };

  const changeStyle = (next) => {
    setStyle(next);
    localStorage.setItem(STYLE_KEY, next);
    onCommand('setCitationStyle', next);
  };

  const submitDraft = () => {
    const author = draft.author.trim();
    if (!author) return;
    const entry = { author, year: draft.year.trim() || String(new Date().getFullYear()), title: draft.title.trim() };
    if (editingIndex >= 0) {
      const next = sources.slice();
      next[editingIndex] = entry;
      persist(next);
    } else {
      persist([...sources, entry]);
    }
    setEditingIndex(-1);
    setDraft({ author: '', year: String(new Date().getFullYear()), title: '' });
  };

  const startEdit = (index) => {
    const s = sources[index];
    setEditingIndex(index);
    setDraft({ author: s.author || '', year: String(s.year || ''), title: s.title || '' });
  };

  const remove = (index) => {
    persist(sources.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setEditingIndex(-1);
      setDraft({ author: '', year: String(new Date().getFullYear()), title: '' });
    }
  };

  const insertCitation = (s) => {
    if (!editor) return;
    const citText = formatCitationText(style, s.author, s.year);
    const tip = escapeHtml(`${s.author} (${s.year}). ${s.title}`);
    editor.chain().focus().insertContent(`<sup style="color:#2B579A;cursor:pointer" title="${tip}">${escapeHtml(citText)}</sup>`).run();
  };

  const insertBibliography = () => {
    onCommand('insertBibliography');
    onClose();
  };

  if (!open) return null;

  return (
    <div dir="rtl" style={{ position: 'fixed', inset: 0, zIndex: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.45)' }}>
      <div style={{ width: 560, maxWidth: 'calc(100vw - 32px)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(15,23,42,0.3)', fontFamily: "'Heebo','Segoe UI',sans-serif" }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: '#1e293b' }}>
            <i className="ph ph-books" style={{ fontSize: 20, color: '#2B579A' }}></i>
            <span>מנהל מקורות</span>
          </div>
          <button type="button" onClick={onClose} title="סגור" style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer' }}>
            <i className="ph ph-x" style={{ fontSize: 18 }}></i>
          </button>
        </div>

        <div style={{ padding: '14px 18px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <label style={{ fontSize: 14, color: '#475569' }}>סגנון ציטוט:</label>
            <select value={style} onChange={(e) => changeStyle(e.target.value)} style={{ height: 34, borderRadius: 8, border: '1px solid #cbd5e1', padding: '0 10px', fontFamily: 'inherit' }}>
              {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>
            מקורות שמורים ({sources.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {sources.length === 0 && (
              <div style={{ fontSize: 13, color: '#94a3b8', padding: '12px', textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: 8 }}>
                אין מקורות עדיין. הוסף מקור למטה.
              </div>
            )}
            {sources.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, background: editingIndex === i ? '#eff6ff' : '#fff' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: '#1e293b', fontWeight: 500 }}>{s.author} <span style={{ color: '#64748b', fontWeight: 400 }}>({s.year})</span></div>
                  {s.title && <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>}
                </div>
                <button type="button" onClick={() => insertCitation(s)} title="הוסף ציטוט במיקום הסמן" style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 7, padding: '4px 8px', fontSize: 12, color: '#2B579A', cursor: 'pointer' }}>ציטוט</button>
                <button type="button" onClick={() => startEdit(i)} title="ערוך" style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', padding: 4 }}><i className="ph ph-pencil-simple" style={{ fontSize: 16 }}></i></button>
                <button type="button" onClick={() => remove(i)} title="מחק" style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer', padding: 4 }}><i className="ph ph-trash" style={{ fontSize: 16 }}></i></button>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 8, fontWeight: 500 }}>{editingIndex >= 0 ? 'עריכת מקור' : 'הוספת מקור חדש'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8, marginBottom: 8 }}>
              <input value={draft.author} onChange={(e) => setDraft({ ...draft, author: e.target.value })} placeholder="שם המחבר" style={{ height: 34, borderRadius: 8, border: '1px solid #cbd5e1', padding: '0 10px', fontFamily: 'inherit' }} />
              <input value={draft.year} onChange={(e) => setDraft({ ...draft, year: e.target.value })} placeholder="שנה" style={{ height: 34, borderRadius: 8, border: '1px solid #cbd5e1', padding: '0 10px', fontFamily: 'inherit' }} />
            </div>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="כותרת המקור (מאמר/ספר)" style={{ width: '100%', height: 34, borderRadius: 8, border: '1px solid #cbd5e1', padding: '0 10px', fontFamily: 'inherit', marginBottom: 8, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={submitDraft} disabled={!draft.author.trim()} style={{ border: 'none', background: draft.author.trim() ? '#2B579A' : '#cbd5e1', color: '#fff', borderRadius: 8, padding: '7px 14px', fontSize: 14, fontWeight: 500, cursor: draft.author.trim() ? 'pointer' : 'not-allowed' }}>
                {editingIndex >= 0 ? 'שמור שינויים' : 'הוסף מקור'}
              </button>
              {editingIndex >= 0 && (
                <button type="button" onClick={() => { setEditingIndex(-1); setDraft({ author: '', year: String(new Date().getFullYear()), title: '' }); }} style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 8, padding: '7px 14px', fontSize: 14, cursor: 'pointer' }}>ביטול</button>
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>נשמר אוטומטית</span>
          <button type="button" onClick={insertBibliography} disabled={!sources.length} style={{ border: 'none', background: sources.length ? '#2B579A' : '#cbd5e1', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 500, cursor: sources.length ? 'pointer' : 'not-allowed' }}>
            <i className="ph ph-list-numbers" style={{ marginInlineEnd: 6 }}></i>
            הוסף ביבליוגרפיה למסמך
          </button>
        </div>
      </div>
    </div>
  );
}
