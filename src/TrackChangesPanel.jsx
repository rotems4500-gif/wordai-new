import React from 'react';

// חלונית סקירת שינויים (בסגנון Reviewing Pane של Word): רשימת הוספות/מחיקות
// מקובצות לפי changeId, עם קבל/דחה פרטני, קפיצה לשינוי, וקבל/דחה הכל.

export default function TrackChangesPanel({
  open,
  changes = [],
  trackingEnabled = false,
  onClose = () => {},
  onAccept = () => {},
  onReject = () => {},
  onAcceptAll = () => {},
  onRejectAll = () => {},
  onScrollTo = () => {},
}) {
  if (!open) return null;

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
          <i className="ph ph-git-diff" style={{ fontSize: 18, color: '#2B579A' }}></i>
          <span>שינויים ({changes.length})</span>
        </div>
        <button type="button" onClick={onClose} title="סגור" style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer' }}>
          <i className="ph ph-x" style={{ fontSize: 16 }}></i>
        </button>
      </div>

      {!trackingEnabled && (
        <div style={{ padding: '8px 16px', fontSize: 12, color: '#92400e', background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
          מעקב שינויים כבוי — שינויים חדשים לא יסומנו.
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {changes.length === 0 && (
          <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '24px 12px' }}>
            אין שינויים מסומנים. הפעל "עקוב אחר שינויים" וערוך את המסמך.
          </div>
        )}
        {changes.map((change) => (
          <div
            key={change.key}
            style={{
              border: '1px solid #e2e8f0', borderRadius: 10, padding: 10,
              borderInlineStartWidth: 4,
              borderInlineStartColor: change.type === 'insertion' ? '#1d4ed8' : '#b91c1c',
            }}
          >
            <button
              type="button"
              onClick={() => onScrollTo(change)}
              style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'right', width: '100%' }}
              title="קפוץ לשינוי במסמך"
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: change.type === 'insertion' ? '#1d4ed8' : '#b91c1c', marginBottom: 4 }}>
                {change.type === 'insertion' ? 'הוספה' : 'מחיקה'}
              </div>
              <div style={{
                fontSize: 13, color: '#334155', lineHeight: 1.5, maxHeight: 60, overflow: 'hidden',
                textDecoration: change.type === 'deletion' ? 'line-through' : 'none',
              }}>
                {(change.text || '').slice(0, 120) || '(ללא טקסט)'}
              </div>
            </button>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => onAccept(change)}
                style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: 'none', background: '#dcfce7', color: '#166534', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                קבל
              </button>
              <button
                type="button"
                onClick={() => onReject(change)}
                style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: 'none', background: '#fee2e2', color: '#991b1b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                דחה
              </button>
            </div>
          </div>
        ))}
      </div>

      {changes.length > 0 && (
        <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #e2e8f0' }}>
          <button
            type="button"
            onClick={onAcceptAll}
            style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: '#166534', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            קבל הכל
          </button>
          <button
            type="button"
            onClick={onRejectAll}
            style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#991b1b', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            דחה הכל
          </button>
        </div>
      )}
    </div>
  );
}
