// StyleProfilePanel.jsx — Phase 2 UI: ניהול מלא של פרופיל מנוע הסגנון האישי.
// עוטף upload/analyze/blacklist/מדדים. מדבר רק עם styleIngestService + styleSampleStore.
// עיצוב: תואם לסקין wf-settings-pane (כרטיסי לבן/סלייט, אקסנט אינדיגו) כדי להשתלב בטאב הגדרות.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ingestAndAnalyze,
  getStyleOverview,
  removeDocumentAndRecompute,
  runQualitativeAnalysis,
  setStyleEngineEnabled,
  setBlacklistUser,
  removeAutoBlacklistItem,
  restoreAutoBlacklistItem,
  rejectPattern,
  unrejectPattern,
  pinPattern,
} from '../services/styleIngestService';
import { getSampleDocuments } from '../services/styleSampleStore';

const CONFIDENCE_STYLES = {
  low: 'border-amber-200 bg-amber-50 text-amber-700',
  medium: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  high: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const CONFIDENCE_LABELS = { low: 'נמוכה', medium: 'בינונית', high: 'גבוהה' };

const PATTERN_TYPE_LABELS = {
  signature_phrase: 'ביטוי חתימה',
  structure: 'מבנה',
  lexical_habit: 'הרגל מילולי',
  punctuation: 'פיסוק',
  register: 'רגיסטר',
};

const ACCEPT_EXTENSIONS = '.docx,.pdf,.txt,.md,.html,.rtf';

function formatNumber(n, digits = 0) {
  const num = Number(n);
  if (!Number.isFinite(num)) return null;
  return num.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function burstinessLabel(cv) {
  const n = Number(cv);
  if (!Number.isFinite(n)) return null;
  if (n >= 0.5) return 'גבוהה';
  if (n >= 0.25) return 'בינונית';
  return 'נמוכה';
}

function parenthesesLabel(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return null;
  if (n >= 0.3) return 'תכופים';
  if (n >= 0.08) return 'מדי פעם';
  return 'נדירים';
}

function formatDate(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function StyleProfilePanel({ onClose }) {
  const [overview, setOverview] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [userBlacklistDraft, setUserBlacklistDraft] = useState('');
  const fileInputRef = useRef(null);

  const refresh = useCallback(() => {
    try {
      setOverview(getStyleOverview());
    } catch (err) {
      console.error('getStyleOverview failed:', err);
    }
    try {
      setDocuments(getSampleDocuments() || []);
    } catch (err) {
      console.error('getSampleDocuments failed:', err);
    }
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('wordai-personal-style-updated', handler);
    window.addEventListener('wordai-style-samples-updated', handler);
    // Seam 1 — כשמפתח AI נשמר (חיבור ספק חדש), רענן: אם הפרופיל היה חלקי (LLM נכשל/חסר)
    // ויש כבר מסמכים, ה-banner למטה יציע "נתח מחדש" באופן טבעי (overview מתעדכן).
    window.addEventListener('wordai-provider-config-changed', handler);
    return () => {
      window.removeEventListener('wordai-personal-style-updated', handler);
      window.removeEventListener('wordai-style-samples-updated', handler);
      window.removeEventListener('wordai-provider-config-changed', handler);
    };
  }, [refresh]);

  useEffect(() => {
    setUserBlacklistDraft((overview?.blacklist?.user || []).join('\n'));
  }, [overview?.blacklist?.user]);

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    setUploading(true);
    setProgressText(`מנתח מסמך 1/${files.length}...`);
    try {
      await ingestAndAnalyze(files, {
        onProgress: (info) => {
          const current = Number(info?.current ?? info?.index ?? 1);
          const total = Number(info?.total ?? files.length);
          setProgressText(`מנתח מסמך ${current}/${total}...`);
        },
        runPatterns: true,
      });
    } catch (err) {
      console.error('ingestAndAnalyze failed:', err);
    } finally {
      setUploading(false);
      setProgressText('');
      refresh();
    }
  }, [refresh]);

  const handleFileInputChange = (e) => {
    const files = e.target.files;
    handleFiles(files);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer?.files);
  };

  const handleToggleEnabled = () => {
    const next = !overview?.enabled;
    try {
      setStyleEngineEnabled(next);
    } catch (err) {
      console.error('setStyleEngineEnabled failed:', err);
    }
    refresh();
  };

  const handleRemoveDocument = async (docId) => {
    try {
      await removeDocumentAndRecompute(docId);
    } catch (err) {
      console.error('removeDocumentAndRecompute failed:', err);
    } finally {
      refresh();
    }
  };

  const handleReanalyze = async () => {
    setAnalyzing(true);
    try {
      await runQualitativeAnalysis({ force: true });
    } catch (err) {
      console.error('runQualitativeAnalysis failed:', err);
    } finally {
      setAnalyzing(false);
      refresh();
    }
  };

  const handleRemoveAuto = (phrase) => {
    try {
      removeAutoBlacklistItem(phrase);
    } catch (err) {
      console.error('removeAutoBlacklistItem failed:', err);
    } finally {
      refresh();
    }
  };

  const handleRestoreAuto = (phrase) => {
    try {
      restoreAutoBlacklistItem(phrase);
    } catch (err) {
      console.error('restoreAutoBlacklistItem failed:', err);
    } finally {
      refresh();
    }
  };

  const handleRejectPattern = (patternId) => {
    try {
      rejectPattern(patternId);
    } catch (err) {
      console.error('rejectPattern failed:', err);
    } finally {
      refresh();
    }
  };

  const handleUnrejectPattern = (key) => {
    try {
      unrejectPattern(key);
    } catch (err) {
      console.error('unrejectPattern failed:', err);
    } finally {
      refresh();
    }
  };

  const handlePinPattern = (patternId, pinned) => {
    try {
      pinPattern(patternId, pinned);
    } catch (err) {
      console.error('pinPattern failed:', err);
    } finally {
      refresh();
    }
  };

  const handleUserBlacklistBlur = () => {
    const lines = userBlacklistDraft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    try {
      setBlacklistUser(lines);
    } catch (err) {
      console.error('setBlacklistUser failed:', err);
    } finally {
      refresh();
    }
  };

  const confidence = overview?.confidence || {};
  const metrics = overview?.metrics || null;
  // E3 — פיזור ז'אנרים מתוך תת-פרופילי המדדים (ז'אנרים עם ≥3 מסמכים).
  const genreDistribution = overview?.genreProfiles
    ? Object.entries(overview.genreProfiles)
        .map(([g, gp]) => ({ genre: g, docCount: Number(gp?.docCount) || 0 }))
        .filter((e) => e.docCount > 0)
        .sort((a, b) => b.docCount - a.docCount)
    : [];
  const connectorEntries = metrics?.connectorFrequency
    ? Object.keys(metrics.connectorFrequency).slice(0, 3)
    : [];

  // Change 3 — נאדג' ז'אנר פעיל: כמה מסמכים יש לכל ז'אנר מתוך המסמכים שהועלו בפועל.
  const docGenreCounts = {};
  documents.forEach((doc) => {
    const g = doc?.genre;
    if (!g || g === 'אחר') return;
    docGenreCounts[g] = (docGenreCounts[g] || 0) + 1;
  });
  const nearGenres = Object.entries(docGenreCounts)
    .filter(([, count]) => count >= 1 && count <= 2)
    .slice(0, 2);
  const hasGenreAtThreshold = Object.values(docGenreCounts).some((count) => count >= 3);
  const genreNudgeLines = nearGenres.map(([genre, count]) => (
    `📈 יש רק ${count} מסמכי "${genre}" — העלה עוד ${3 - count} כדי שאבנה פרופיל מותאם לז'אנר הזה.`
  ));
  const showGenericGenreNudge = genreNudgeLines.length === 0 && !hasGenreAtThreshold && documents.length >= 3;

  // Seam 3 — סטטוס דו-שכבתי: פרופיל מקומי (מדדים/דפוסים) מול שכבת ה-LLM (ז'אנרים/דפוסים איכותניים).
  const docCount = overview?.stats?.docCount || 0;
  const extractionMeta = overview?.extractionMeta || null;
  const hasLocalProfile = Boolean(metrics) || (overview?.qualitativePatterns?.length > 0);
  const llmIncomplete = docCount > 0 && (
    !extractionMeta
    || !(extractionMeta.batches > 0)
    || extractionMeta.llmBatchesFailed > 0
    || extractionMeta.genreClassificationFailed
  );
  const llmComplete = docCount > 0 && extractionMeta
    && extractionMeta.batches > 0
    && !extractionMeta.llmBatchesFailed
    && !extractionMeta.genreClassificationFailed;

  const metricCards = [];
  if (metrics) {
    const avgSentenceLen = formatNumber(metrics.avgSentenceWords ?? metrics.averageSentenceLength);
    if (avgSentenceLen) metricCards.push({ label: 'אורך משפט ממוצע', value: `~${avgSentenceLen} מילים` });

    const cv = metrics.sentenceLengthCV ?? metrics.burstinessCV;
    const cvLabel = burstinessLabel(cv);
    if (cvLabel) metricCards.push({ label: 'שונות (burstiness)', value: `CV ${formatNumber(cv, 2)} — ${cvLabel}` });

    const commasPerSentence = formatNumber(metrics.avgCommasPerSentence ?? metrics.commasPerSentence, 1);
    if (commasPerSentence) metricCards.push({ label: 'פסיקים למשפט', value: `~${commasPerSentence}` });

    const parenLabel = parenthesesLabel(metrics.parenthesesRate ?? metrics.parenthesisFrequency);
    if (parenLabel) metricCards.push({ label: 'סוגריים', value: parenLabel });

    if (connectorEntries.length) metricCards.push({ label: 'מילות קישור מזהות', value: connectorEntries.join(', ') });
  }

  return (
    <div className="flex flex-col gap-6 text-right" dir="rtl">
      {/* 1. Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 flex items-center justify-center transition-colors"
              aria-label="סגור"
              title="סגור"
            >
              <i className="ph ph-x text-sm" />
            </button>
          )}
          <div>
            <h2 className="text-[18px] font-extrabold text-slate-800 flex items-center gap-2">
              🖋️ מנוע הסגנון האישי
              <span
                className={`text-[10px] font-semibold rounded-full border px-2 py-0.5 ${CONFIDENCE_STYLES[confidence.level] || CONFIDENCE_STYLES.low}`}
                title="ככל שתעלה יותר מסמכים שכתבת, החיקוי יהיה מדויק יותר"
              >
                ודאות פרופיל: {CONFIDENCE_LABELS[confidence.level] || CONFIDENCE_LABELS.low}
                {Number.isFinite(confidence.score) ? ` (${Math.round(confidence.score * 100)}%)` : ''}
              </span>
            </h2>
            <p className="text-[12px] text-slate-400 mt-1">
              {overview?.stats
                ? `${overview.stats.docCount || 0} מסמכים · ${overview.stats.totalWords || 0} מילים · ${overview.stats.chunkCount || 0} קטעים`
                : ''}
              {overview?.stats && overview.metricsEligibleDocCount > 0 && overview.metricsEligibleDocCount < (overview.stats.docCount || 0)
                ? ` (${overview.metricsEligibleDocCount} נכללים במדדים)`
                : ''}
            </p>
            {genreDistribution.length > 0 && (
              <p className="text-[11.5px] text-slate-400 mt-0.5">
                {`ז'אנרים: ${genreDistribution.map((e) => `${e.genre} (${e.docCount})`).join(', ')}`}
              </p>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer select-none">
          <input
            type="checkbox"
            checked={Boolean(overview?.enabled)}
            onChange={handleToggleEnabled}
            className="w-4 h-4 accent-indigo-600"
          />
          <span className="text-[13px] font-semibold text-slate-700">מנוע הסגנון פעיל</span>
        </label>
      </div>

      {/* 2. Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-2xl px-4 py-8 text-center transition-colors ${
          dragActive ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <span className="text-[28px]">📄</span>
        <p className="text-[13.5px] font-semibold text-slate-700">
          גרור לכאן קבצים או
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="mx-1 text-indigo-600 hover:text-indigo-700 underline disabled:opacity-50"
          >
            בחר קבצים
          </button>
        </p>
        <p className="text-[12px] text-slate-400 max-w-[46ch]">
          העלה עבודות שכתבת — ככל שיותר, החיקוי מדויק יותר. הטקסט נשאר במכשיר שלך.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_EXTENSIONS}
          onChange={handleFileInputChange}
          disabled={uploading}
          className="hidden"
        />
        {uploading && (
          <div className="flex items-center gap-2 mt-2 text-[12.5px] font-semibold text-indigo-600">
            <span className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            {progressText || 'מעלה ומנתח...'}
          </div>
        )}
      </div>

      {/* 3. Documents list */}
      <div>
        {(genreNudgeLines.length > 0 || showGenericGenreNudge) && (
          <div className="flex flex-col gap-1 mb-2">
            {genreNudgeLines.map((line) => (
              <div key={line} className="text-[12px] font-semibold text-cyan-700 bg-cyan-50 border border-cyan-100 rounded-lg px-3 py-1.5">
                {line}
              </div>
            ))}
            {showGenericGenreNudge && (
              <div className="text-[12px] font-semibold text-cyan-700 bg-cyan-50 border border-cyan-100 rounded-lg px-3 py-1.5">
                💡 העלה 3 מסמכים או יותר מאותו סוג (למשל סקירות ספרות) ואבנה פרופיל מותאם-ז'אנר.
              </div>
            )}
          </div>
        )}
        <div className="text-[14px] font-extrabold text-slate-800 mb-2">מסמכים שהועלו</div>
        {documents.length === 0 ? (
          <div className="text-[13px] text-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-4 py-6 text-center">
            עדיין לא הועלו מסמכים
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-[13.5px] font-semibold text-slate-800 truncate">{doc.title || 'מסמך ללא שם'}</div>
                    {doc.genre && doc.genre !== 'אחר' && (
                      <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100">
                        {doc.genre}
                      </span>
                    )}
                  </div>
                  <div className="text-[11.5px] text-slate-400">
                    {doc.wordCount ? `${doc.wordCount} מילים` : ''}
                    {doc.source ? ` · ${doc.source}` : ''}
                    {doc.addedAt ? ` · ${formatDate(doc.addedAt)}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveDocument(doc.id)}
                  className="shrink-0 w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors"
                  title="הסר מסמך"
                  aria-label="הסר מסמך"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Metrics dashboard */}
      {metricCards.length > 0 && (
        <div>
          <div className="text-[14px] font-extrabold text-slate-800 mb-2">מדדי סגנון</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {metricCards.map((card) => (
              <div key={card.label} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                <div className="text-[11px] text-slate-400 font-semibold">{card.label}</div>
                <div className="text-[13.5px] font-bold text-slate-800 mt-0.5">{card.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasLocalProfile && llmIncomplete && (
        <div className="flex items-center justify-between gap-3 flex-wrap text-[12.5px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
          <span>
            ✓ פרופיל בסיסי מוכן (מדדים + ביטויי חתימה). 🔌 חבר מפתח AI בהגדרות כדי להשלים דפוסים איכותניים וזיהוי ז'אנרים — ואז לחץ "נתח מחדש".
          </span>
          <button
            type="button"
            onClick={handleReanalyze}
            disabled={analyzing}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[12px] font-bold transition-colors disabled:opacity-60"
          >
            נתח מחדש עכשיו
          </button>
        </div>
      )}
      {llmComplete && (
        <div className="inline-flex items-center gap-1.5 self-start text-[11.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
          ✓ ניתוח AI מלא
        </div>
      )}

      {/* 5. Qualitative patterns */}
      <div>
        <div className="text-[14px] font-extrabold text-slate-800 mb-1">דפוסים איכותניים</div>
        <p className="text-[12px] text-slate-400 mb-2">
          סמן ✗ על דפוס שהוא נושא מקרי ולא הסגנון שלך — הוא לא יחזור גם בניתוח מחדש. 📌 נועל דפוס חשוב.
        </p>
        {(!overview?.qualitativePatterns || overview.qualitativePatterns.length === 0) ? (
          <div className="text-[13px] text-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-4 py-6 text-center">
            לחץ "נתח מחדש" אחרי העלאת מסמכים כדי לחלץ דפוסים
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {overview.qualitativePatterns.map((pattern) => (
              <div key={pattern.id} className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                    {PATTERN_TYPE_LABELS[pattern.type] || pattern.type}
                  </span>
                  <span className="text-[13px] font-semibold text-slate-700 flex-1">{pattern.label}</span>
                  <button
                    type="button"
                    onClick={() => handlePinPattern(pattern.id, !pattern.pinned)}
                    className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                      pattern.pinned
                        ? 'text-indigo-600 bg-indigo-50'
                        : 'text-slate-300 hover:text-indigo-500 hover:bg-indigo-50'
                    }`}
                    title={pattern.pinned ? 'בטל נעילה' : 'נעל דפוס'}
                    aria-label={pattern.pinned ? 'בטל נעילה' : 'נעל דפוס'}
                  >
                    📌
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRejectPattern(pattern.id)}
                    className="shrink-0 w-7 h-7 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors"
                    title="לא אני"
                    aria-label="לא אני"
                  >
                    ✗
                  </button>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-400 rounded-full"
                    style={{ width: `${Math.max(0, Math.min(100, Math.round((pattern.weight || 0) * 100)))}%` }}
                  />
                </div>
                {pattern.evidence && (
                  <div className="text-[11.5px] text-slate-400 mt-1.5 truncate" title={pattern.evidence}>
                    "{String(pattern.evidence).slice(0, 90)}{String(pattern.evidence).length > 90 ? '…' : ''}"
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {overview?.rejectedPatternKeys?.length > 0 && (
          <details className="mt-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
            <summary className="text-[12.5px] font-semibold text-slate-500 cursor-pointer select-none">
              דפוסים שדחיתי ({overview.rejectedPatternKeys.length})
            </summary>
            <p className="text-[11.5px] text-slate-400 mt-1.5 mb-1.5">שחזור יחזיר את הדפוס בניתוח הבא.</p>
            <div className="flex flex-col gap-1.5">
              {overview.rejectedPatternKeys.map((key) => (
                <div key={key} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                  <span className="text-[12.5px] text-slate-500 truncate">{key}</span>
                  <button
                    type="button"
                    onClick={() => handleUnrejectPattern(key)}
                    className="shrink-0 text-slate-400 hover:text-indigo-600 text-[13px]"
                    title="שחזר"
                    aria-label="שחזר"
                  >
                    ↺
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* 6. Negative space */}
      {overview?.negativeSpace && overview.negativeSpace.length > 0 && (
        <div>
          <div className="text-[14px] font-extrabold text-slate-800 mb-2">מה אתה לא כותב</div>
          <div className="flex flex-wrap gap-2">
            {overview.negativeSpace.map((item, idx) => (
              <span key={idx} className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-100">
                לעולם לא: {typeof item === 'string' ? item : item?.label || ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 7. Blacklist editor */}
      <div>
        <div className="text-[14px] font-extrabold text-slate-800 mb-1">רשימת ביטויים חסומים</div>
        <p className="text-[12px] text-slate-400 mb-2">ביטויים ברשימה הזו לא ייכתבו בטקסט שנוצר עבורך.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="text-[12px] font-bold text-slate-500 mb-1.5">אוטומטי</div>
            <div className="flex flex-col gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-2.5 min-h-[80px]">
              {(overview?.blacklist?.auto || []).length === 0 && (overview?.blacklist?.removed || []).length === 0 ? (
                <span className="text-[12px] text-slate-400 px-1">אין ביטויים אוטומטיים עדיין</span>
              ) : (
                <>
                  {(overview?.blacklist?.auto || []).map((phrase) => (
                    <div key={phrase} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                      <span className="text-[12.5px] text-slate-700 truncate">{phrase}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAuto(phrase)}
                        className="shrink-0 text-slate-400 hover:text-rose-600 text-[13px] font-bold"
                        title="הסר מהרשימה"
                        aria-label="הסר"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {(overview?.blacklist?.removed || []).map((phrase) => (
                    <div key={phrase} className="flex items-center justify-between gap-2 bg-white/60 border border-slate-100 rounded-lg px-2.5 py-1.5">
                      <span className="text-[12.5px] text-slate-400 line-through truncate">{phrase}</span>
                      <button
                        type="button"
                        onClick={() => handleRestoreAuto(phrase)}
                        className="shrink-0 text-slate-400 hover:text-indigo-600 text-[13px]"
                        title="שחזר"
                        aria-label="שחזר"
                      >
                        ↺
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
          <div>
            <div className="text-[12px] font-bold text-slate-500 mb-1.5">שלי</div>
            <textarea
              value={userBlacklistDraft}
              onChange={(e) => setUserBlacklistDraft(e.target.value)}
              onBlur={handleUserBlacklistBlur}
              placeholder={'ביטוי אחד בכל שורה...'}
              dir="auto"
              className="w-full min-h-[80px] text-[12.5px] text-slate-700 bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-y"
            />
          </div>
        </div>
      </div>

      {/* 8. Footer actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-t border-slate-100 pt-4">
        <span className="text-[12px] text-slate-400">
          {overview?.qualitativePatterns?.length ? `${overview.qualitativePatterns.length} דפוסים מזוהים` : ''}
        </span>
        <button
          type="button"
          onClick={handleReanalyze}
          disabled={analyzing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-bold transition-colors disabled:opacity-60"
        >
          {analyzing ? (
            <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <span>🔄</span>
          )}
          נתח מחדש
        </button>
      </div>
    </div>
  );
}
