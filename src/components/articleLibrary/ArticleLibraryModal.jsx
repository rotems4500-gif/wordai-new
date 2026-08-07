import React, { useEffect, useRef, useState } from 'react';
import ArticleResultsList from './ArticleResultsList';
import { showToast } from '../../services/uiFeedback';
import { getProviderConfig } from '../../services/aiService';
import {
  searchArticleLibrary,
  formatArticleLibraryReply,
  addArticleToMaterials,
  primeArticleMaterialsIndex,
} from '../../services/articleLibraryService';

/**
 * מודאל "ספריית מאמרים" של דף הבית.
 * חיווט בלבד: כל הלוגיקה ב-articleLibraryService. אפס קריאות LLM.
 *
 * @param {{projects?:Array<{id:string,name:string}>, onClose:()=>void}} props
 */
export default function ArticleLibraryModal({ projects = [], onClose }) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState(null);
  const [statusLine, setStatusLine] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  // { [articleId]: { status, error?, strength? } }
  const [addState, setAddState] = useState({});
  // ref במקבילה ל-state: מונע לחיצה כפולה לפני שה-setState נכנס לתוקף.
  const inFlightRef = useRef(new Set());

  // מחמם את חנות החומרים כדי ש"כבר בחומרים" יוצג מיד.
  useEffect(() => {
    primeArticleMaterialsIndex().catch(() => {});
  }, []);

  const projectList = Array.isArray(projects) ? projects.filter((p) => p && p.id) : [];
  const selectedProject = projectList.find((p) => p.id === selectedProjectId) || null;

  const handleSearch = async () => {
    const prompt = String(query || '').trim();
    if (!prompt || searching) return;
    setSearching(true);
    setResult(null);
    setStatusLine('מחפש מקורות מאומתים…');
    setAddState({});
    inFlightRef.current = new Set();
    try {
      const res = await searchArticleLibrary({ prompt, cfg: getProviderConfig() });
      setResult(res);
      setStatusLine(formatArticleLibraryReply(res));
    } catch (error) {
      setResult(null);
      setStatusLine(`החיפוש נכשל: ${String(error?.message || error)}`);
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async (article) => {
    const id = article?.id;
    if (!id) return;
    if (inFlightRef.current.has(id)) return;
    const current = addState[id]?.status;
    if (current === 'fetching' || current === 'adding' || current === 'embedding' || current === 'added' || current === 'already') return;

    inFlightRef.current.add(id);
    const setStatus = (status, extra = {}) => {
      setAddState((prev) => ({ ...prev, [id]: { status, ...extra } }));
    };
    setStatus('fetching');

    try {
      const res = await addArticleToMaterials(article, {
        projectId: selectedProjectId || null,
        onStage: (stage, detail = {}) => {
          if (stage === 'fetching') setStatus('fetching');
          else if (stage === 'adding') setStatus('adding', { strength: detail?.strength || '' });
          else if (stage === 'embedding') setStatus('embedding');
        },
      });

      if (res?.status === 'added') {
        setStatus('added', { strength: res.strength || '' });
        const where = selectedProject ? ` לפרויקט "${selectedProject.name}"` : ' לחומרי העזר';
        const thin = res.strength === 'abstract' ? ' (תקציר בלבד)' : '';
        showToast(`נוסף${where}${thin} ✓`, { tone: 'success' });
      } else if (res?.status === 'already') {
        setStatus('already');
      } else if (res?.status === 'too-thin') {
        setStatus('error', { error: 'לא נמשך מספיק טקסט מהמקור' });
      } else {
        setStatus('error', { error: res?.error || 'ההוספה נכשלה' });
      }
    } catch (error) {
      setStatus('error', { error: String(error?.message || error) });
    } finally {
      inFlightRef.current.delete(id);
    }
  };

  const articles = Array.isArray(result?.articles) ? result.articles : [];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => onClose?.()}
    >
      <div
        dir="rtl"
        className="w-[820px] max-w-[96vw] max-h-[88vh] flex flex-col rounded-[24px] bg-slate-800/90 shadow-2xl border border-white/20 p-6 text-right"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="text-2xl font-bold text-white">📚 ספריית מאמרים</div>
            <div className="text-sm text-slate-300 mt-2 leading-6">
              חיפוש מקורות אקדמיים מאומתים — כל קישור נבדק שהוא נפתח בפועל. אפשר להוסיף כל תוצאה לחומרי העזר.
            </div>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
            title="סגירה"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleSearch();
              }
            }}
            disabled={searching}
            placeholder="שם מאמר, מחבר, או נושא — למשל: מאמרים על זיכרון עבודה"
            className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-base outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching || !String(query || '').trim()}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold shadow-lg hover:shadow-cyan-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {searching ? 'מחפש…' : 'חפש'}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <label className="text-xs text-slate-400 font-semibold" htmlFor="article-library-project">
            שיוך לפרויקט
          </label>
          <select
            id="article-library-project"
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
            className="px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <option value="" className="bg-slate-800">ללא פרויקט</option>
            {projectList.map((project) => (
              <option key={project.id} value={project.id} className="bg-slate-800">
                {project.name || 'פרויקט ללא שם'}
              </option>
            ))}
          </select>
        </div>

        {statusLine ? (
          <div className="rounded-xl border border-white/15 bg-white/8 p-3 text-slate-200 text-sm leading-6 whitespace-pre-wrap mb-4">
            {statusLine}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto min-h-0">
          {articles.length ? (
            <ArticleResultsList
              articles={articles}
              addState={addState}
              onAdd={handleAdd}
              variant="dark"
              projectMissing={false}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
