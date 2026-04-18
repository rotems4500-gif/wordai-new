import React, { useEffect, useRef, useState } from 'react';
import {
  getHomeInstructions,
  getWorkspaceTemplateCards,
  loadPastDocsIndex,
  loadProjectMaterials,
  saveHelperMaterial,
  saveHomeInstructions,
  syncLearnedStyleFromWorkspace,
  readInstructionFile,
} from './services/workspaceLearningService';
import { getOrderedRoleAgents, getWorkspaceAutomation } from './services/aiService';

const TEMPLATE_CARDS = [
  { id: 'blank', title: 'מסמך ריק', subtitle: 'התחל מאפס' },
  { id: 'academic', title: 'עבודה אקדמית', subtitle: 'מבוא, פרקים וסיכום' },
  { id: 'report', title: 'דוח מסודר', subtitle: 'ממצאים והמלצות' },
  { id: 'summary', title: 'סיכום נושא', subtitle: 'נקודות מפתח מהירות' },
  { id: 'office', title: 'מסמך משרדי', subtitle: 'ניסוח מקצועי וענייני' },
  { id: 'proposal', title: 'הצעה', subtitle: 'רקע, מטרות ושלבים' },
  { id: 'letter', title: 'מכתב רשמי', subtitle: 'פתיחה, גוף וסיום' },
];

const STYLE_CARDS = [
  { id: 'academic', title: 'אקדמי', subtitle: 'נקי, רשמי ומובנה' },
  { id: 'legal', title: 'משפטי', subtitle: 'פורמלי, צפוף ומדויק' },
  { id: 'business', title: 'עסקי', subtitle: 'מודרני, חד וברור' },
  { id: 'presentation', title: 'מצגת', subtitle: 'גדול, מרווח ובולט' },
];

const WORKFLOW_LABELS = {
  'manager-auto': 'מנהל אוטומטי בוחר מסלול',
  'manager-pipeline': 'מנהל ← מקורות ← מבנה ← כתיבה ← ליטוש',
  'design-first': 'מבנה קודם',
  'research-first': 'חקר קודם',
  'custom-order': 'סדר מותאם אישית',
};

export default function StartScreen({ onCreateBlank, onCreateTemplate, onOpenLastDraft, onOpenDocument = () => {}, onGenerateFromPrompt, onDocumentStyleChange = () => {}, documentStyle = 'academic', hasDraft = false, lastSavedAt = '' }) {
  const recentItems = hasDraft
    ? [{ id: 'last', title: 'טיוטה אחרונה', meta: lastSavedAt ? `עודכן: ${lastSavedAt}` : 'שוחזר מכתיבה קודמת' }]
    : [];

  const [prompt, setPrompt] = useState('');
  const [templateId, setTemplateId] = useState('blank');
  const [instructions, setInstructions] = useState(getHomeInstructions());
  const [materials, setMaterials] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [templateCards, setTemplateCards] = useState(TEMPLATE_CARDS.map((item) => ({ ...item, count: 0, example: '' })));
  const [learningText, setLearningText] = useState('לומד מהמסמכים הקודמים שלך...');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPromptOptions, setShowPromptOptions] = useState(false);
  const [instructionFileName, setInstructionFileName] = useState('');
  const [loadedWorkspace, setLoadedWorkspace] = useState(null);
  const fileInputRef = useRef(null);
  const instructionFileInputRef = useRef(null);

  const reloadWorkspaceContext = async () => {
    const [docs, projectMaterials, learned, workspaceTemplates] = await Promise.all([
      loadPastDocsIndex(),
      loadProjectMaterials(),
      syncLearnedStyleFromWorkspace(),
      getWorkspaceTemplateCards(),
    ]);
    setMaterials(projectMaterials);
    setTemplateCards(workspaceTemplates);
    const categoryLabel = learned.dominantCategory === 'academic'
      ? 'אקדמי'
      : learned.dominantCategory === 'office'
        ? 'משרדי'
        : learned.dominantCategory === 'summary'
          ? 'סיכומי'
          : 'כללי';
    setLearningText(`נמצאו ${docs.length} מסמכים קודמים • הסגנון הדומיננטי: ${categoryLabel}`);
  };

  useEffect(() => {
    reloadWorkspaceContext().catch(() => {
      setLearningText('המערכת מוכנה ללמידה ממסמכים קודמים');
    });
  }, []);

  const selectedMaterials = materials.filter((item) => selectedIds.includes(item.id));

  const stripWorkspaceBlock = (value = '') => String(value || '')
    .replace(/\n?\[סביבת עבודה טעונה\][\s\S]*?\[\/סביבת עבודה טעונה\]\n?/g, '')
    .trim();

  const handleLoadWorkspace = () => {
    const automation = getWorkspaceAutomation();
    const agents = getOrderedRoleAgents(automation.workflowMode);
    if (!automation?.enabled) {
      window.alert('צריך קודם להפעיל את סביבת הסוכנים במסך ההגדרות.');
      return;
    }

    const block = [
      '[סביבת עבודה טעונה]',
      `שם הסביבה: ${automation.workspaceName || 'סביבת עבודה מותאמת'}`,
      `סדר עבודה: ${WORKFLOW_LABELS[automation.workflowMode] || WORKFLOW_LABELS['manager-pipeline']}`,
      agents.length ? `סוכנים פעילים: ${agents.map((agent) => agent.name).join(', ')}` : 'אין סוכנים פעילים',
      automation.sharedGoal ? `מטרה: ${automation.sharedGoal}` : '',
      '[/סביבת עבודה טעונה]',
    ].filter(Boolean).join('\n');

    const baseInstructions = stripWorkspaceBlock(instructions);
    const nextInstructions = [baseInstructions, block].filter(Boolean).join('\n\n');
    setInstructions(nextInstructions);
    setLoadedWorkspace({
      name: automation.workspaceName || 'סביבת עבודה מותאמת',
      workflow: WORKFLOW_LABELS[automation.workflowMode] || WORKFLOW_LABELS['manager-pipeline'],
      agents: agents.map((agent) => agent.name),
    });
    setShowPromptOptions(true);
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    try {
      await onGenerateFromPrompt?.({
        prompt,
        templateId,
        instructions,
        selectedMaterials,
        documentStyle,
      });
      saveHomeInstructions('');
      setPrompt('');
      setInstructions('');
      setInstructionFileName('');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        await saveHelperMaterial(file);
      }
      await reloadWorkspaceContext();
      const refreshedMaterials = await loadProjectMaterials();
      const uploadedIds = refreshedMaterials
        .filter((item) => files.some((file) => item.file === file.name || item.title === file.name))
        .map((item) => item.id);
      if (uploadedIds.length) {
        setSelectedIds((prev) => Array.from(new Set([...prev, ...uploadedIds])));
      }
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleInstructionFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const extracted = await readInstructionFile(file);
      if (!String(extracted || '').trim()) {
        window.alert('לא הצלחתי לקרוא תוכן מתוך קובץ ההנחיות.');
        return;
      }

      const labeledText = `קובץ הנחיות: ${file.name}\n${String(extracted).trim()}`;
      const nextInstructions = instructions.trim()
        ? `${instructions.trim()}\n\n---\n${labeledText}`
        : labeledText;

      setInstructions(nextInstructions);
      setInstructionFileName(file.name);
      setShowPromptOptions(true);
    } catch (error) {
      const message = error?.message === 'unsupported-binary-file'
        ? 'זה קובץ Word/PowerPoint בינארי ולכן הוא הוצג כג׳יבריש. השתמש ב-TXT, MD, HTML, JSON או PDF טקסטואלי.'
        : 'לא הצלחתי לקרוא את קובץ ההנחיות. אם זה קובץ טקסט ישן, עכשיו המערכת מנסה לזהות גם קידוד עברי אוטומטית.';
      window.alert(message);
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="absolute inset-0 z-20 bg-[#F7F9FC] overflow-y-auto" dir="rtl" data-theme="corporate">
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="rounded-[28px] bg-gradient-to-br from-[#DCE9FB] to-[#EEF4FF] border border-[#D7E3F8] px-8 py-10 mb-8 text-center shadow-sm">
          <h1 className="text-4xl font-bold text-slate-800 mb-4">מה תרצה ליצור היום?</h1>
          <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || loading}
                className="btn btn-primary px-5 min-h-0 h-10 rounded-xl text-sm disabled:opacity-50"
              >
                {loading ? 'יוצר...' : 'צור'}
              </button>
              <button
                type="button"
                onClick={() => setShowPromptOptions((prev) => !prev)}
                className="btn btn-outline btn-primary px-4 min-h-0 h-10 rounded-xl text-sm"
              >
                {showPromptOptions ? 'הסתר הנחיות וקבצים' : 'הוסף הנחיות וקבצים'}
              </button>
              <button
                type="button"
                onClick={handleLoadWorkspace}
                className="btn btn-outline btn-accent px-4 min-h-0 h-10 rounded-xl text-sm"
              >
                טען סביבת עבודה
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPromptOptions(true);
                  instructionFileInputRef.current?.click();
                }}
                className="btn btn-outline btn-secondary px-4 min-h-0 h-10 rounded-xl text-sm"
              >
                קובץ הנחיות
              </button>
              <button
                type="button"
                onClick={onOpenDocument}
                className="btn btn-outline btn-info px-4 min-h-0 h-10 rounded-xl text-sm"
              >
                פתח מסמך לעריכה
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-outline px-4 min-h-0 h-10 rounded-xl text-sm"
              >
                {uploading ? 'מעלה...' : 'צרף קבצי עזר'}
              </button>
              <input ref={instructionFileInputRef} type="file" accept=".txt,.md,.markdown,.html,.htm,.json,.pdf" className="hidden" onChange={handleInstructionFileUpload} />
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
                placeholder="תאר את המסמך שברצונך לכתוב, למשל: @claude עבודה על הונגריה עם מקורות וסיכום"
                className="input input-bordered flex-1 min-w-[260px] bg-white text-slate-700 text-right"
              />
            </div>

            <div className="text-[11px] text-slate-500 text-right mb-2">
              לפתיחת קובץ קיים שאפשר לערוך השתמש ב־"פתח מסמך לעריכה". אפשר גם לתייג מודל ישירות בבקשה: @claude, @gemini, @openai או אפילו כמה יחד.
            </div>

            <div className="flex flex-wrap gap-2 mb-3 text-right">
              <span className="rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs">סוג מסמך: {templateId === 'blank' ? 'חופשי' : templateId}</span>
              <span className={`rounded-full px-3 py-1 text-xs ${selectedMaterials.length ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                {selectedMaterials.length ? `נבחרו ${selectedMaterials.length} קבצי עזר` : 'ללא קבצי עזר'}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs ${instructions.trim() ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {instructions.trim() ? 'יש הנחיות ספציפיות למסמך' : 'ללא הנחיות נוספות'}
              </span>
              {instructionFileName ? (
                <span className="rounded-full bg-violet-100 text-violet-700 px-3 py-1 text-xs">קובץ הנחיות: {instructionFileName}</span>
              ) : null}
              {loadedWorkspace ? (
                <span className="rounded-full bg-amber-100 text-amber-700 px-3 py-1 text-xs">סביבה נטענה: {loadedWorkspace.name}</span>
              ) : null}
            </div>

            {showPromptOptions && (
              <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-3 text-right border-t border-slate-200 pt-3 mt-3 mb-3">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="text-xs text-slate-500">הנחיות ספציפיות למסמך הזה</div>
                    <button onClick={() => instructionFileInputRef.current?.click()} className="btn btn-outline btn-secondary btn-xs rounded-lg">
                      טען קובץ הנחיות
                    </button>
                  </div>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="למשל: כתוב בסגנון אקדמי, השתמש בטון ענייני, שמור על פסקאות קצרות, אל תמציא מקורות"
                    className="textarea textarea-bordered w-full min-h-[120px] rounded-xl resize-y"
                  />
                  <div className="text-xs text-slate-500 mt-2">אפשר לכתוב כאן ידנית, או לטעון קובץ הנחיות שלם שיתווסף אוטומטית למסמך הנוכחי.</div>
                </div>

                <div>                  {loadedWorkspace ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 mb-2 text-right">
                      <div className="text-xs font-semibold text-amber-800">סביבת העבודה שנטענה</div>
                      <div className="text-xs text-amber-700 mt-1">{loadedWorkspace.workflow}</div>
                      <div className="text-[11px] text-amber-700 mt-1">{loadedWorkspace.agents?.join(' • ')}</div>
                    </div>
                  ) : null}                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="text-xs text-slate-500">קבצי עזר למסמך הזה</div>
                    <button onClick={() => fileInputRef.current?.click()} className="btn btn-outline btn-primary btn-xs rounded-lg">
                      {uploading ? 'מעלה...' : 'הוסף קבצים'}
                    </button>
                  </div>
                  <div className="max-h-[190px] overflow-y-auto space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                    {materials.length ? materials.map((item) => (
                      <label key={item.id} className="flex items-start gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2 hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-primary checkbox-sm mt-0.5"
                          checked={selectedIds.includes(item.id)}
                          onChange={(e) => setSelectedIds((prev) => e.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id))}
                        />
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{item.title}</div>
                          <div className="text-xs text-slate-500">{item.label || 'כללי'}</div>
                        </div>
                      </label>
                    )) : <div className="text-sm text-slate-500 px-2 py-3">אפשר לצרף PDF, מצגות, סיכומים, Word או קבצי טקסט.</div>}
                  </div>
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-3 text-right">
              <div>
                <div className="text-xs text-slate-500 mb-1">סוג מסמך רצוי</div>
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="select select-bordered w-full rounded-xl bg-white">
                  <option value="blank">חופשי</option>
                  <option value="academic">עבודה אקדמית</option>
                  <option value="report">דוח</option>
                  <option value="legal">מסמך משפטי</option>
                  <option value="summary">סיכום נושא</option>
                  <option value="office">מסמך משרדי</option>
                  <option value="proposal">הצעה</option>
                  <option value="letter">מכתב רשמי</option>
                </select>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600">
                {learningText}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-2xl font-bold text-slate-800">סגנון מסמך מקצועי</h2>
            <div className="text-sm text-slate-500">הסגנון נצמד גם למסמכים חדשים וגם לכתיבה הקיימת</div>
          </div>
          <div className="grid md:grid-cols-4 gap-3">
            {STYLE_CARDS.map((style) => (
              <button
                key={style.id}
                onClick={() => onDocumentStyleChange(style.id)}
                className={`card rounded-2xl text-right border transition-all duration-200 ${documentStyle === style.id ? 'border-[#2B579A] bg-[#EEF4FF] shadow-md' : 'border-slate-200 bg-white hover:shadow-sm'}`}
              >
                <div className="card-body p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-slate-800">{style.title}</div>
                    {documentStyle === style.id && <span className="text-xs rounded-full bg-[#2B579A] text-white px-2 py-1">פעיל</span>}
                  </div>
                  <div className="text-xs text-slate-500">{style.subtitle}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.3fr_0.7fr] gap-5 mb-8">
          <div className="card bg-base-100 border border-slate-200 rounded-2xl shadow-sm">
            <div className="card-body p-4">
              <div className="flex items-center justify-between mb-2 gap-3">
                <div className="text-lg font-bold text-slate-800">הנחיות ספציפיות למסמך</div>
                <button onClick={() => fileInputRef.current?.click()} className="btn btn-outline btn-primary btn-sm rounded-xl">
                  {uploading ? 'מעלה...' : 'צרף קבצים'}
                </button>
              </div>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="למשל: כתוב תמיד בעברית תקינה, השתמש בפסקאות קצרות, אל תמציא מקורות, שמור על טון ענייני"
                className="textarea textarea-bordered w-full min-h-[120px] rounded-xl resize-y"
              />
              <div className="text-xs text-slate-500 mt-2">כאן אפשר לכתוב הנחיות ייעודיות למסמך המסוים שאתה יוצר עכשיו.</div>
            </div>
          </div>

          <div className="card bg-base-100 border border-slate-200 rounded-2xl shadow-sm">
            <div className="card-body p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-bold text-slate-800">חומרי עזר</div>
              <button onClick={() => fileInputRef.current?.click()} className="btn btn-outline btn-primary btn-sm rounded-xl">
                {uploading ? 'מעלה...' : 'הוסף קובץ'}
              </button>
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.markdown,.html,.htm" className="hidden" onChange={handleUpload} />
            </div>
            <div className="max-h-[220px] overflow-y-auto space-y-2">
              {materials.length ? materials.map((item) => (
                <label key={item.id} className="flex items-start gap-2 rounded-xl border border-slate-100 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary checkbox-sm mt-0.5"
                    checked={selectedIds.includes(item.id)}
                    onChange={(e) => setSelectedIds((prev) => e.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id))}
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{item.title}</div>
                    <div className="text-xs text-slate-500">{item.label || 'כללי'}</div>
                  </div>
                </label>
              )) : <div className="text-sm text-slate-500">עדיין לא הוספת חומרי עזר</div>}
            </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-slate-800">תבניות מהירות</h2>
          <button onClick={onCreateBlank} className="btn btn-ghost btn-sm text-[#2B579A] font-semibold">מסמך ריק</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4 mb-10">
          {templateCards.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => (tpl.id === 'blank' ? onCreateBlank() : onCreateTemplate(tpl))}
              className="card bg-base-100 border border-slate-200 rounded-2xl p-4 text-right hover:shadow-lg hover:border-[#93C5FD] transition-all duration-200"
            >
              <div className="h-28 rounded-xl bg-gradient-to-b from-white to-slate-100 border border-slate-200 mb-3 flex items-center justify-center text-[#2B579A] font-bold text-center px-2">
                {tpl.title}
              </div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="font-semibold text-slate-800 text-sm">{tpl.title}</div>
                {tpl.count ? <span className="text-[10px] rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">{tpl.count}</span> : null}
              </div>
              <div className="text-xs text-slate-500 min-h-[32px]">{tpl.subtitle || ''}</div>
              {tpl.example ? <div className="text-[11px] text-slate-400 truncate mt-1">{tpl.example}</div> : <div className="h-[16px]"></div>}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-slate-800">אחרונים</h3>
          {hasDraft && (
            <button onClick={onOpenLastDraft} className="btn btn-primary btn-sm rounded-full px-4">
              פתח טיוטה אחרונה
            </button>
          )}
        </div>

        <div className="card bg-base-100 border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {recentItems.length ? recentItems.map((item) => (
            <button
              key={item.id}
              onClick={onOpenLastDraft}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 border-b last:border-b-0 border-slate-100"
            >
              <div className="text-right">
                <div className="font-semibold text-slate-800">{item.title}</div>
                <div className="text-xs text-slate-500">{item.meta}</div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-[#E8F0FE] text-[#2B579A] flex items-center justify-center">W</div>
            </button>
          )) : (
            <div className="px-5 py-8 text-sm text-slate-500 text-center">עדיין אין מסמכים אחרונים</div>
          )}
        </div>
      </div>
    </div>
  );
}
