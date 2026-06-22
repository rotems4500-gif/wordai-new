import React from 'react';

// D6: חלונית הערות (review pane) בסגנון Word. ממוקמת בצד שמאל, מציגה את כל ההערות,
// מאפשרת כתיבה, תגובות, שחרור ומחיקה, וקפיצה לטקסט המסומן.

export default function CommentsPanel({
  open,
  comments = [],
  activeCommentId = null,
  onClose = () => {},
  onUpdateBody = () => {},
  onAddReply = () => {},
  onResolve = () => {},
  onDelete = () => {},
  onScrollTo = () => {},
}) {
  const [replyDrafts, setReplyDrafts] = React.useState({});
  const bodyRefs = React.useRef({});

  React.useEffect(() => {
    if (open && activeCommentId && bodyRefs.current[activeCommentId]) {
      bodyRefs.current[activeCommentId].focus();
    }
  }, [open, activeCommentId, comments.length]);

  if (!open) return null;

  const setReplyDraft = (id, value) => setReplyDrafts((prev) => ({ ...prev, [id]: value }));
  const submitReply = (id) => {
    const text = (replyDrafts[id] || '').trim();
    if (!text) return;
    onAddReply(id, text);
    setReplyDraft(id, '');
  };

  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed', top: 0, bottom: 0, left: 0, width: 320, zIndex: 110,
        background: '#fff', borderInlineEnd: '1px solid #e2e8f0', boxShadow: '4px 0 16px rgba(15,23,42,0.08)',
        display: 'flex', flexDirection: 'column', fontFamily: "'Heebo','Segoe UI',sans-serif",
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
          <i className="ph ph-chat-circle-dots" style={{ fontSize: 18, color: '#2B579A' }}></i>
          <span>הערות ({comments.filter((c) => !c.resolved).length})</span>
        </div>
        <button type="button" onClick={onClose} title="סגור" style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer' }}>
          <i className="ph ph-x" style={{ fontSize: 16 }}></i>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {comments.length === 0 && (
          <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '24px 12px' }}>
            אין הערות. בחר טקסט ולחץ "הוסף הערה".
          </div>
        )}
        {comments.map((c) => (
          <div
            key={c.id}
            onClick={() => onScrollTo(c.id)}
            style={{
              border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, cursor: 'pointer',
              background: c.resolved ? '#f8fafc' : '#fffbeb', opacity: c.resolved ? 0.7 : 1,
              borderColor: c.id === activeCommentId ? '#93c5fd' : '#e2e8f0',
            }}
          >
            {c.quote && (
              <div style={{ fontSize: 11, color: '#64748b', borderInlineStart: '3px solid #f59e0b', paddingInlineStart: 6, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                "{c.quote}"
              </div>
            )}
            <textarea
              ref={(el) => { bodyRefs.current[c.id] = el; }}
              value={c.body}
              onChange={(e) => onUpdateBody(c.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="כתוב הערה..."
              rows={2}
              disabled={c.resolved}
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', border: '1px solid #e2e8f0', borderRadius: 7, padding: '6px 8px', fontSize: 13, fontFamily: 'inherit', background: c.resolved ? '#f1f5f9' : '#fff' }}
            />

            {c.replies && c.replies.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {c.replies.map((rep) => (
                  <div key={rep.id} style={{ fontSize: 12, color: '#334155', background: '#f1f5f9', borderRadius: 6, padding: '4px 8px' }}>{rep.text}</div>
                ))}
              </div>
            )}

            {!c.resolved && (
              <div style={{ marginTop: 6, display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                <input
                  value={replyDrafts[c.id] || ''}
                  onChange={(e) => setReplyDraft(c.id, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitReply(c.id); } }}
                  placeholder="תגובה..."
                  style={{ flex: 1, minWidth: 0, height: 30, borderRadius: 7, border: '1px solid #e2e8f0', padding: '0 8px', fontSize: 12, fontFamily: 'inherit' }}
                />
                <button type="button" onClick={() => submitReply(c.id)} title="שלח תגובה" style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 7, padding: '0 8px', color: '#2B579A', cursor: 'pointer' }}>
                  <i className="ph ph-paper-plane-tilt" style={{ fontSize: 14 }}></i>
                </button>
              </div>
            )}

            <div style={{ marginTop: 8, display: 'flex', gap: 12, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
              {!c.resolved && (
                <button type="button" onClick={() => onResolve(c.id)} style={{ border: 'none', background: 'transparent', color: '#16a34a', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="ph ph-check-circle" style={{ fontSize: 15 }}></i> שחרר
                </button>
              )}
              <button type="button" onClick={() => onDelete(c.id)} style={{ border: 'none', background: 'transparent', color: '#dc2626', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="ph ph-trash" style={{ fontSize: 15 }}></i> מחק
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
