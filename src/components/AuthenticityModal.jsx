import React, { useState, useEffect, useCallback } from 'react';
import {
  scoreTextAuthenticity,
  addAuthenticitySample,
  removeAuthenticitySample,
  getAuthenticityCalibration,
} from '../services/styleAuthenticityService';

// מודאל "בדיקת סגנון": תוצאה ברמת מסמך + UI כיול (תיוג דוגמאות me/ai).
// getText: פונקציה שמחזירה את הטקסט לבדיקה (כל המסמך).
export default function AuthenticityModal({ open, onClose, getText, sourceLabel = '' }) {
  const [result, setResult] = useState(null);
  const [sampleText, setSampleText] = useState('');
  const [calibration, setCalibration] = useState(() => getAuthenticityCalibration());
  const [showCalibration, setShowCalibration] = useState(false);
  const [notice, setNotice] = useState('');

  const runCheck = useCallback(() => {
    const text = typeof getText === 'function' ? String(getText() || '') : '';
    setResult(scoreTextAuthenticity(text));
  }, [getText]);

  useEffect(() => {
    if (open) {
      runCheck();
      setCalibration(getAuthenticityCalibration());
      setNotice('');
    }
  }, [open, runCheck]);

  if (!open) return null;

  const humanCutoff = result?.ok ? Math.max(30, result.threshold - 20) : 40;
  const scoreColor = !result?.ok ? '#8A8886'
    : result.score >= result.threshold ? '#C0392B'
      : result.score < humanCutoff ? '#1E8E5A'
        : '#B7791F';

  const handleLabel = (label) => {
    const text = sampleText.trim();
    if (text.length < 25) {
      setNotice('הדוגמה קצרה מדי (לפחות ~25 מילים).');
      return;
    }
    const res = addAuthenticitySample(text, label);
    if (!res.ok) {
      setNotice(res.message || 'לא ניתן להוסיף את הדוגמה.');
      return;
    }
    setSampleText('');
    setCalibration(getAuthenticityCalibration());
    setNotice(res.trained?.ok
      ? `אומן מחדש ✓ (סף=${res.trained.threshold}, אני=${res.meCount}, AI=${res.aiCount})`
      : `נוסף ✓ (אני=${res.meCount}, AI=${res.aiCount}). צריך ≥2 מכל סוג כדי לאמן.`);
    runCheck();
  };

  const handleRemove = (index) => {
    removeAuthenticitySample(index);
    setCalibration(getAuthenticityCalibration());
    runCheck();
  };

  const samples = Array.isArray(calibration?.samples) ? calibration.samples : [];
  const meCount = samples.filter((s) => s.label === 'me').length;
  const aiCount = samples.filter((s) => s.label === 'ai').length;

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
  const card = { width: 540, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', background: 'white', borderRadius: 16, boxShadow: '0 12px 48px rgba(0,0,0,0.3)', direction: 'rtl' };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div style={{ background: 'linear-gradient(135deg,#2B579A,#106EBE)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
          <div style={{ color: 'white', fontWeight: 700, fontSize: 15 }}>
            🔍 בדיקת סגנון
            {sourceLabel ? <span style={{ fontWeight: 500, fontSize: 12, opacity: 0.85 }}> · {sourceLabel}</span> : null}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: 18 }}>
          {/* result */}
          {!result?.ok ? (
            <div style={{ fontSize: 13, color: '#605E5C', padding: '8px 0' }}>{result?.message || 'אין מספיק טקסט לבדיקה.'}</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                <div style={{ width: 84, height: 84, borderRadius: '50%', border: `6px solid ${scoreColor}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{result.score}</div>
                  <div style={{ fontSize: 10, color: '#8A8886' }}>/ 100</div>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: scoreColor }}>{result.label}</div>
                  <div style={{ fontSize: 12, color: '#605E5C', marginTop: 4 }}>ציון "נשמע גנרי / מכונה". סף נוכחי: {result.threshold}</div>
                  {result.calibrated && <div style={{ fontSize: 11, color: '#1E8E5A', marginTop: 2 }}>מכויל לפי הדוגמאות שלך ✓</div>}
                </div>
              </div>

              {result.markers.length > 0 ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#323130', marginBottom: 6 }}>סימנים שזוהו:</div>
                  {result.markers.map((m) => (
                    <div key={m.key} style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#323130' }}>
                        <span>{m.label}</span>
                        <span style={{ color: '#8A8886' }}>{Math.round(m.severity * 100)}%</span>
                      </div>
                      <div style={{ height: 5, background: '#EDEBE9', borderRadius: 3, marginTop: 2 }}>
                        <div style={{ height: '100%', width: `${Math.round(m.severity * 100)}%`, background: scoreColor, borderRadius: 3 }} />
                      </div>
                      {m.detail && <div style={{ fontSize: 11, color: '#8A8886', marginTop: 2 }}>{m.detail}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#1E8E5A', marginBottom: 12 }}>לא זוהו סימנים בולטים של טקסט גנרי.</div>
              )}

              <div style={{ fontSize: 11, color: '#8A8886', background: '#FAF9F8', padding: '8px 10px', borderRadius: 8, marginBottom: 12 }}>
                ℹ️ אומדן רך, לא פסק-דין. טקסט אנושי מלוטש עלול להיתפס כגנרי ולהפך. כיול לפי דוגמאות שלך משפר דיוק.
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={runCheck} style={{ flex: 1, padding: '8px 12px', background: '#2B579A', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>בדוק שוב</button>
            <button onClick={() => setShowCalibration((v) => !v)} style={{ flex: 1, padding: '8px 12px', background: 'white', color: '#2B579A', border: '1px solid #2B579A', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {showCalibration ? 'הסתר כיול' : `שפר דיוק (כיול) · אני=${meCount} AI=${aiCount}`}
            </button>
          </div>

          {/* calibration */}
          {showCalibration && (
            <div style={{ marginTop: 14, borderTop: '1px solid #EDEBE9', paddingTop: 14 }}>
              <div style={{ fontSize: 12, color: '#605E5C', marginBottom: 8 }}>
                הדבק קטע, ותייג אותו: "זה אני" (כתיבה שלך) או "זה AI". אחרי ≥2 מכל סוג המערכת מתכווננת אליך אוטומטית.
              </div>
              <textarea
                value={sampleText}
                onChange={(e) => setSampleText(e.target.value)}
                placeholder="הדבק כאן דוגמת טקסט..."
                style={{ width: '100%', minHeight: 80, padding: 10, border: '1px solid #C8C6C4', borderRadius: 8, fontSize: 12, direction: 'rtl', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => handleLabel('me')} style={{ flex: 1, padding: '7px', background: '#1E8E5A', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✍️ זה אני</button>
                <button onClick={() => handleLabel('ai')} style={{ flex: 1, padding: '7px', background: '#C0392B', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>🤖 זה AI</button>
              </div>
              {notice && <div style={{ fontSize: 11, color: '#605E5C', marginTop: 6 }}>{notice}</div>}

              {samples.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: '#8A8886', marginBottom: 4 }}>
                    דוגמאות ({samples.length}){calibration?.trainedAt ? ` · מאומן (סף=${calibration.threshold})` : ' · לא מאומן עדיין'}
                  </div>
                  {samples.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 0', borderBottom: '1px solid #F3F2F1' }}>
                      <span style={{ flexShrink: 0, padding: '1px 6px', borderRadius: 4, color: 'white', background: s.label === 'me' ? '#1E8E5A' : '#C0392B' }}>{s.label === 'me' ? 'אני' : 'AI'}</span>
                      <span style={{ flex: 1, color: '#605E5C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(s.features?.wordCount || 0)} מילים
                      </span>
                      <button onClick={() => handleRemove(i)} style={{ background: 'transparent', border: 'none', color: '#A19F9D', cursor: 'pointer', fontSize: 14 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
