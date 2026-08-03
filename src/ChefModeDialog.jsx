import React, { useState, useEffect, useRef } from 'react';
import { chefModeGenerateQuestion, chefModeInterview } from './services/aiService';
import { showConfirm } from './services/uiFeedback';
import { buildSelectedMaterialsContext } from './services/workspaceLearningService';

const MAX_QUESTIONS = 13;
const MIN_AUTO_STOP_RESPONSES = 4;
// כשהפרומפט + הנחיות/חומרים כבר עונים על רוב השאלות — מותר לשף לעצור מוקדם יותר.
const MIN_AUTO_STOP_RESPONSES_RICH_CONTEXT = 2;
const CHEF_MATERIALS_CONTEXT_MAX_CHARS = 8000;
const CHEF_FINAL_ADDITIONS_QUESTION_ID = 'final-additions';

const CHEF_MODEL_OPTIONS = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'claude', label: 'Claude' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'scholar', label: 'Google Scholar' },
  { value: 'perplexity', label: 'Perplexity' },
  { value: 'groq', label: 'Groq' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'custom', label: 'Custom' },
];

const normalizeAnswerText = (choices = [], freeText = '') => {
  const cleanChoices = Array.isArray(choices) ? choices.filter(Boolean) : [];
  const cleanFreeText = String(freeText || '').trim();
  if (cleanChoices.length && cleanFreeText) return `${cleanChoices.join(' | ')} || ${cleanFreeText}`;
  if (cleanChoices.length) return cleanChoices.join(' | ');
  return cleanFreeText;
};

const toSafeQuestionCard = (step = 1, payload = {}) => ({
  id: Number(step),
  question: String(payload?.question || '').trim() || `מה חשוב לך לדייק בשלב ${step}?`,
  multiChoice: Array.isArray(payload?.options) ? payload.options.filter(Boolean).map((item) => String(item).trim()).filter(Boolean).slice(0, 6) : [],
  placeholder: String(payload?.placeholder || '').trim() || 'אפשר גם לכתוב תשובה חופשית כאן...',
});

const stableChefText = (value = '') => String(value || '').trim();

const hashChefText = (value = '') => {
  let hash = 2166136261;
  const text = stableChefText(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return text ? (hash >>> 0).toString(16) : '';
};

const buildStableSelectedMaterialsKeyParts = (selectedMaterials = []) => (Array.isArray(selectedMaterials) ? selectedMaterials : [])
  .map((item = {}, index = 0) => ({
    id: stableChefText(item?.id || item?.file || item?.path || item?.filePath || item?.title || `material-${index + 1}`),
    title: stableChefText(item?.title),
    label: stableChefText(item?.label),
    source: stableChefText(item?.source),
    file: stableChefText(item?.file),
    path: stableChefText(item?.path || item?.filePath || item?.sourcePath),
    type: stableChefText(item?.type),
    hash: stableChefText(item?.hash || item?.contentHash || item?.previewHash),
    previewHash: hashChefText(item?.previewText || item?.excerptText || item?.preview || item?.extractedText || item?.content || item?.summary),
    previewChars: Number.isFinite(Number(item?.previewChars)) ? Number(item.previewChars) : '',
    canPreviewText: Boolean(item?.canPreviewText),
    hasPreview: Boolean(item?.hasPreview),
    previewStatus: stableChefText(item?.previewStatus),
  }))
  .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

const buildMaterialsContextCacheKey = (selectedMaterials = []) => JSON.stringify(buildStableSelectedMaterialsKeyParts(selectedMaterials));

const buildChefContextKey = ({ prompt = '', templateId = '', instructions = '', selectedMaterials = [] } = {}) => JSON.stringify({
  prompt: stableChefText(prompt),
  templateId: stableChefText(templateId),
  instructions: stableChefText(instructions),
  selectedMaterials: buildStableSelectedMaterialsKeyParts(selectedMaterials),
});

const trimChefMaterialsContext = (value = '') => String(value || '').trim().slice(0, CHEF_MATERIALS_CONTEXT_MAX_CHARS);

export default function ChefModeDialog({ onStart, onClose, onGoToEditor, onModelChange, selectedModel = 'gemini', chefContext = {}, escapeBlocked = false, forcedSourceRoute = '' }) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [questionFlow, setQuestionFlow] = useState([]);
  const [responses, setResponses] = useState([]);
  const [selectedChoices, setSelectedChoices] = useState([]);
  const [customText, setCustomText] = useState('');
  const [finalAdditionsText, setFinalAdditionsText] = useState('');
  const [finalAdditionsBaseResponses, setFinalAdditionsBaseResponses] = useState([]);
  const [isFinalAdditionsStep, setIsFinalAdditionsStep] = useState(false);
  // בחירת מסלול מקורות בסוף הבישול: auto (המערכת מחליטה) | pipeline | single-call | none
  const [sourceRoute, setSourceRoute] = useState(forcedSourceRoute || 'auto');
  // המתג במסך הבית דורס גם session משוחזר.
  useEffect(() => {
    if (forcedSourceRoute) setSourceRoute(forcedSourceRoute);
  }, [forcedSourceRoute]);
  const [askFinalAdditions, setAskFinalAdditions] = useState(() => {
    try {
      return localStorage.getItem('wordflow_chef_ask_final_additions') !== 'false';
    } catch {
      return true;
    }
  });
  const [localModel, setLocalModel] = useState(selectedModel || 'gemini');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  // מסך "הנה מה שהבנתי": בריף מזוקק לעריכה/אישור לפני יצירת המסמך.
  const [briefText, setBriefText] = useState('');
  const [isBriefStep, setIsBriefStep] = useState(false);
  const [isPreparingBrief, setIsPreparingBrief] = useState(false);
  const [briefBaseResponses, setBriefBaseResponses] = useState([]);
  const materialsContextCacheRef = useRef({ key: '', promise: null });
  const chefContextKey = buildChefContextKey(chefContext);

  const saveSession = (updatedResponses, updatedQuestion, updatedQuestionFlow, model = localModel) => {
    localStorage.setItem('wordflow_chef_session', JSON.stringify({
      chefContextKey,
      responses: updatedResponses,
      currentQuestion: updatedQuestion,
      questionFlow: updatedQuestionFlow,
      savedAt: Date.now(),
      selectedModel: model,
    }));
  };

  const hydrateInputsFromResponse = (questionId, list = responses) => {
    const existing = (list || []).find((item) => item.question === questionId);
    if (!existing) {
      setSelectedChoices([]);
      setCustomText('');
      return;
    }
    const nextChoices = Array.isArray(existing.choices) ? existing.choices.filter(Boolean) : [];
    setSelectedChoices(nextChoices);
    setCustomText(String(existing.freeText || '').trim());
  };

  const prepareChefMaterialsContext = async () => {
    const selectedMaterials = Array.isArray(chefContext?.selectedMaterials) ? chefContext.selectedMaterials : [];
    if (!selectedMaterials.length) return '';

    const cacheKey = buildMaterialsContextCacheKey(selectedMaterials);
    if (!materialsContextCacheRef.current.promise || materialsContextCacheRef.current.key !== cacheKey) {
      materialsContextCacheRef.current = {
        key: cacheKey,
        promise: buildSelectedMaterialsContext(selectedMaterials)
          .then(trimChefMaterialsContext)
          .catch((error) => {
            console.warn('Chef materials preview context failed', error);
            return '';
          }),
      };
    }

    return materialsContextCacheRef.current.promise;
  };

  const requestDynamicQuestion = async (step, baseResponses, model = localModel) => {
    const materialsContext = await prepareChefMaterialsContext();
    const payload = await chefModeGenerateQuestion({
      step,
      maxQuestions: MAX_QUESTIONS,
      selectedModel: model,
      responses: baseResponses,
      documentPrompt: chefContext?.prompt,
      templateId: chefContext?.templateId,
      instructions: chefContext?.instructions,
      selectedMaterials: chefContext?.selectedMaterials || [],
      materialsContext,
      baseDraftText: String(chefContext?.baseDraftText || '').trim(),
    });
    return payload;
  };

  const hasRichContext = Boolean(String(chefContext?.prompt || '').trim()
    && (String(chefContext?.instructions || '').trim() || (Array.isArray(chefContext?.selectedMaterials) && chefContext.selectedMaterials.length)));
  const minAutoStopResponses = hasRichContext ? MIN_AUTO_STOP_RESPONSES_RICH_CONTEXT : MIN_AUTO_STOP_RESPONSES;
  const canAutoStop = (responsesCount) => Number(responsesCount || 0) >= minAutoStopResponses;

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      let loadedResponses = [];
      let loadedQuestionFlow = [];
      let loadedCurrentQuestion = 0;
      let loadedModel = selectedModel || 'gemini';

      const saved = localStorage.getItem('wordflow_chef_session');
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (data?.chefContextKey === chefContextKey) {
            loadedResponses = Array.isArray(data.responses) ? data.responses : [];
            loadedQuestionFlow = Array.isArray(data.questionFlow) ? data.questionFlow : [];
            loadedCurrentQuestion = Number(data.currentQuestion) || 0;
            if (data.selectedModel) loadedModel = data.selectedModel;
          }
        } catch {}
      }

      if (!isMounted) return;
      setResponses(loadedResponses);
      setLocalModel(loadedModel);

      if (!loadedQuestionFlow.length) {
        setIsLoadingQuestion(true);
        try {
          const firstQuestion = await requestDynamicQuestion(1, loadedResponses, loadedModel);
          if (!isMounted) return;
          if (firstQuestion?.shouldStop && canAutoStop(loadedResponses.length)) {
            if (askFinalAdditions) {
              setFinalAdditionsText('');
              setFinalAdditionsBaseResponses(loadedResponses);
              setIsFinalAdditionsStep(true);
            } else {
              await startBriefPreview(loadedResponses, loadedModel);
            }
            return;
          }
          loadedQuestionFlow = [toSafeQuestionCard(1, firstQuestion)];
        } finally {
          if (isMounted) setIsLoadingQuestion(false);
        }
      }

      if (!isMounted) return;
      const safeQuestionIndex = Math.max(0, Math.min(loadedCurrentQuestion, Math.max(loadedQuestionFlow.length - 1, 0)));
      setQuestionFlow(loadedQuestionFlow);
      setCurrentQuestion(safeQuestionIndex);
      saveSession(loadedResponses, safeQuestionIndex, loadedQuestionFlow, loadedModel);
      const currentCard = loadedQuestionFlow[safeQuestionIndex];
      if (currentCard) hydrateInputsFromResponse(currentCard.id, loadedResponses);
    };

    bootstrap();
    return () => {
      isMounted = false;
    };
  }, [chefContextKey]);

  useEffect(() => {
    const currentCard = questionFlow[currentQuestion];
    if (!currentCard) return;
    hydrateInputsFromResponse(currentCard.id, responses);
  }, [currentQuestion, responses, questionFlow]);

  const goToQuestion = (nextIndex, nextResponses = responses, nextQuestionFlow = questionFlow) => {
    const safeIndex = Math.max(0, Math.min(nextIndex, Math.max(nextQuestionFlow.length - 1, 0)));
    setCurrentQuestion(safeIndex);
    saveSession(nextResponses, safeIndex, nextQuestionFlow, localModel);
  };

  const toggleChoice = (choice) => {
    setSelectedChoices((prev) => prev.includes(choice)
      ? prev.filter((item) => item !== choice)
      : [...prev, choice]);
  };

  const upsertResponse = (list = [], nextResponse) => {
    const idx = list.findIndex((item) => item.question === nextResponse.question);
    if (idx === -1) return [...list, nextResponse];
    const clone = [...list];
    clone[idx] = nextResponse;
    return clone;
  };

  const saveCurrentDraftResponse = (baseResponses = responses, { requireAnswer = false } = {}) => {
    const current = questionFlow[currentQuestion];
    if (!current) return baseResponses;
    const hasAnswer = selectedChoices.length || String(customText || '').trim();
    if (!hasAnswer && requireAnswer) return baseResponses;
    if (!hasAnswer) return baseResponses;

    const nextResponse = {
      question: current.id,
      questionText: current.question,
      choices: selectedChoices,
      freeText: String(customText || '').trim(),
      answer: normalizeAnswerText(selectedChoices, customText),
      answeredAt: Date.now(),
    };
    const nextResponses = upsertResponse(baseResponses, nextResponse);
    setResponses(nextResponses);
    saveSession(nextResponses, currentQuestion, questionFlow, localModel);
    return nextResponses;
  };

  const handleFinish = async (finalResponses, extraOptions = {}) => {
    setIsSubmitting(true);
    try {
      localStorage.setItem('wordflow_chef_responses', JSON.stringify({
        responses: finalResponses,
        selectedModel: localModel,
        completedAt: Date.now(),
      }));

      if (typeof onStart === 'function') {
        await onStart(finalResponses, localModel, { sourceRoute, ...extraOptions });
      }

      localStorage.removeItem('wordflow_chef_session');
    } catch (error) {
      console.error('שגיאה בהתחלת בישול:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // זיקוק הבריף והצגתו לאישור/עריכה לפני הכתיבה. אם הזיקוק נכשל —
  // ממשיכים במסלול הישן (StartScreen יזקק בעצמו) במקום לתקוע את המשתמש.
  const startBriefPreview = async (finalResponses, model = localModel) => {
    if (isPreparingBrief || isSubmitting) return;
    setIsPreparingBrief(true);
    try {
      const materialsContext = await prepareChefMaterialsContext();
      const result = await chefModeInterview(finalResponses, model, null, {
        documentPrompt: chefContext?.prompt,
        templateId: chefContext?.templateId,
        instructions: chefContext?.instructions,
        materialsContext,
      });
      const nextBrief = String(result?.brief || '').trim();
      if (!nextBrief) throw new Error('בריף ריק');
      setBriefText(nextBrief);
      setBriefBaseResponses(finalResponses);
      setIsFinalAdditionsStep(false);
      setIsBriefStep(true);
    } catch (error) {
      console.warn('Chef brief preview failed, falling back to direct compose', error);
      await handleFinish(finalResponses);
    } finally {
      setIsPreparingBrief(false);
    }
  };

  const handleConfirmBrief = async () => {
    if (isSubmitting) return;
    const cleanBrief = String(briefText || '').trim();
    await handleFinish(briefBaseResponses, cleanBrief ? { finalBrief: cleanBrief } : {});
  };

  const handleBackFromBrief = () => {
    if (isSubmitting) return;
    setIsBriefStep(false);
    if (askFinalAdditions) setIsFinalAdditionsStep(true);
  };

  const buildResponsesWithFinalAdditions = (baseResponses = responses) => {
    const cleanText = String(finalAdditionsText || '').trim();
    const withoutExistingFinalAdditions = (Array.isArray(baseResponses) ? baseResponses : [])
      .filter((item) => item?.question !== CHEF_FINAL_ADDITIONS_QUESTION_ID);

    if (!cleanText) return withoutExistingFinalAdditions;

    return [
      ...withoutExistingFinalAdditions,
      {
        question: CHEF_FINAL_ADDITIONS_QUESTION_ID,
        questionText: 'האם יש משהו אחרון שחשוב להוסיף לפני יצירת המסמך?',
        choices: [],
        freeText: cleanText,
        answer: cleanText,
        answeredAt: Date.now(),
      },
    ];
  };

  const requestFinishWithFinalReview = async (baseResponses = responses) => {
    const preparedResponses = saveCurrentDraftResponse(baseResponses, { requireAnswer: false });
    if (askFinalAdditions) {
      setFinalAdditionsText('');
      setFinalAdditionsBaseResponses(preparedResponses);
      setIsFinalAdditionsStep(true);
      saveSession(preparedResponses, currentQuestion, questionFlow, localModel);
      return;
    }
    await startBriefPreview(preparedResponses);
  };

  const handleConfirmFinalAdditions = async () => {
    if (isSubmitting || isPreparingBrief) return;
    await startBriefPreview(buildResponsesWithFinalAdditions(finalAdditionsBaseResponses));
  };

  const handleBackFromFinalAdditions = () => {
    if (isSubmitting) return;
    setIsFinalAdditionsStep(false);
    setFinalAdditionsBaseResponses([]);
  };

  const handleAskFinalAdditionsChange = (nextValue) => {
    setAskFinalAdditions(nextValue);
    try {
      localStorage.setItem('wordflow_chef_ask_final_additions', nextValue ? 'true' : 'false');
    } catch {}
  };

  const handleNext = async () => {
    if ((!selectedChoices.length && !customText.trim()) || isSubmitting || isEvaluating || isLoadingQuestion) return;

    const current = questionFlow[currentQuestion];
    if (!current) return;

    const answer = normalizeAnswerText(selectedChoices, customText);
    const nextResponse = {
      question: current.id,
      questionText: current.question,
      choices: selectedChoices,
      freeText: String(customText || '').trim(),
      answer,
      answeredAt: Date.now(),
    };

    const newResponses = upsertResponse(responses, nextResponse);
    setResponses(newResponses);
    saveSession(newResponses, currentQuestion, questionFlow, localModel);

    if (newResponses.length >= MAX_QUESTIONS) {
      await requestFinishWithFinalReview(newResponses);
      return;
    }

    if (currentQuestion < questionFlow.length - 1) {
      goToQuestion(currentQuestion + 1, newResponses, questionFlow);
      return;
    }

    // קריאה אחת בלבד: מחולל השאלה כבר מחזיר shouldStop בעצמו,
    // כך שקריאת ההחלטה הנפרדת (chefModeDecideNextStep) הייתה כפילות יקרה ואיטית.
    setIsEvaluating(true);
    try {
      setIsLoadingQuestion(true);
      const nextStep = questionFlow.length + 1;
      const dynamicQuestion = await requestDynamicQuestion(nextStep, newResponses, localModel);
      if (dynamicQuestion?.shouldStop && canAutoStop(newResponses.length)) {
        await requestFinishWithFinalReview(newResponses);
        return;
      }
      const nextQuestionFlow = [...questionFlow, toSafeQuestionCard(nextStep, dynamicQuestion)];
      setQuestionFlow(nextQuestionFlow);
      goToQuestion(nextQuestionFlow.length - 1, newResponses, nextQuestionFlow);
    } catch (error) {
      console.warn('Chef flow fallback error', error);
      if (canAutoStop(newResponses.length)) {
        await requestFinishWithFinalReview(newResponses);
      }
    } finally {
      setIsEvaluating(false);
      setIsLoadingQuestion(false);
    }
  };

  const handleSkip = async () => {
    if (isSubmitting || isEvaluating || isLoadingQuestion) return;

    if (currentQuestion < questionFlow.length - 1) {
      goToQuestion(currentQuestion + 1, responses, questionFlow);
      return;
    }

    if (canAutoStop(responses.length)) {
      await requestFinishWithFinalReview(responses);
      return;
    }

    setIsLoadingQuestion(true);
    try {
      const nextStep = questionFlow.length + 1;
      const dynamicQuestion = await requestDynamicQuestion(nextStep, responses, localModel);
      if (dynamicQuestion?.shouldStop && canAutoStop(responses.length)) {
        await requestFinishWithFinalReview(responses);
        return;
      }
      const nextQuestionFlow = [...questionFlow, toSafeQuestionCard(nextStep, dynamicQuestion)];
      setQuestionFlow(nextQuestionFlow);
      goToQuestion(nextQuestionFlow.length - 1, responses, nextQuestionFlow);
    } catch (error) {
      console.warn('Chef skip fallback', error);
    } finally {
      setIsLoadingQuestion(false);
    }
  };

  const handleAddQuestion = async () => {
    if (isSubmitting || isEvaluating || isLoadingQuestion || questionFlow.length >= MAX_QUESTIONS) return;

    const draftResponses = saveCurrentDraftResponse(responses, { requireAnswer: false });
    setIsLoadingQuestion(true);
    try {
      const nextStep = questionFlow.length + 1;
      const dynamicQuestion = await requestDynamicQuestion(nextStep, draftResponses, localModel);
      const nextQuestionFlow = [...questionFlow, toSafeQuestionCard(nextStep, dynamicQuestion)];
      setQuestionFlow(nextQuestionFlow);
      goToQuestion(nextQuestionFlow.length - 1, draftResponses, nextQuestionFlow);
    } catch (error) {
      console.warn('Chef add question fallback', error);
    } finally {
      setIsLoadingQuestion(false);
    }
  };

  const handleBack = () => {
    if (currentQuestion <= 0 || isSubmitting || isEvaluating || isLoadingQuestion) return;
    goToQuestion(currentQuestion - 1, responses, questionFlow);
  };

  const stoppingRef = useRef(false);
  const handleStop = async () => {
    if (stoppingRef.current) return; // מונע פתיחת דיאלוג אישור כפול (למשל Escape בזמן שהאישור פתוח)
    stoppingRef.current = true;
    let confirmed = false;
    try {
      confirmed = await showConfirm('בטוח שתרצה להפסיק בישול?', { title: 'הפסקת בישול', confirmLabel: 'הפסק', tone: 'danger' });
    } finally {
      stoppingRef.current = false;
    }
    if (!confirmed) return;
    localStorage.removeItem('wordflow_chef_session');
    setResponses([]);
    setCurrentQuestion(0);
    setQuestionFlow([]);
    setSelectedChoices([]);
    setCustomText('');
    setFinalAdditionsText('');
    setFinalAdditionsBaseResponses([]);
    setIsFinalAdditionsStep(false);
    setBriefText('');
    setBriefBaseResponses([]);
    setIsBriefStep(false);
    onClose?.();
  };

  useEffect(() => {
    if (escapeBlocked) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      // עקביות: Escape עובר דרך אותו אישור+ניקוי כמו "הפסק בישול"
      handleStop();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [escapeBlocked, onClose]);

  const handleGoToEditor = () => {
    saveCurrentDraftResponse(responses, { requireAnswer: false });
    onGoToEditor?.();
  };

  const question = questionFlow[currentQuestion] || null;
  const progress = (responses.length / MAX_QUESTIONS) * 100;
  const hasCurrentDraftAnswer = Boolean(selectedChoices.length || String(customText || '').trim());
  const currentDraftAlreadySaved = question ? responses.some((item) => item.question === question.id) : false;
  const effectiveResponseCount = responses.length + (hasCurrentDraftAnswer && !currentDraftAlreadySaved ? 1 : 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 rounded-3xl max-w-2xl w-full max-h-[82vh] overflow-y-auto shadow-2xl border border-cyan-200/20">
        <div className="bg-gradient-to-r from-slate-900/95 to-blue-900/95 backdrop-blur-xl p-6 sticky top-0 z-10 border-b border-cyan-100/20">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-3xl">👨‍🍳</span>
              <h2 className="text-2xl font-bold text-white">שלב הבישול</h2>
            </div>
            <button
              onClick={handleStop}
              className="px-4 py-2 bg-red-500/30 hover:bg-red-500/50 border border-red-400/30 rounded-xl text-white/90 transition-all text-sm font-medium"
            >
              הפסק בישול
            </button>
          </div>

          <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="text-white/80 text-sm font-medium">מודל השף:</label>
            <select
              value={localModel}
              onChange={(event) => {
                const nextModel = event.target.value;
                setLocalModel(nextModel);
                saveSession(responses, currentQuestion, questionFlow, nextModel);
                onModelChange?.(nextModel);
              }}
              className="bg-white/10 border border-white/25 rounded-xl px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-cyan-200"
            >
              {CHEF_MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="text-slate-900">
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <label className="mb-4 flex items-center gap-2 text-white/75 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={askFinalAdditions}
              onChange={(event) => handleAskFinalAdditionsChange(event.target.checked)}
              className="h-4 w-4 rounded border-white/30 bg-white/10 accent-cyan-400"
            />
            שאל אותי לפני הכתיבה אם יש משהו אחרון להוסיף
          </label>

          <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-300 to-blue-300 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-white/70 text-sm mt-2 text-center">
            {question ? `שאלה ${currentQuestion + 1} | נענו: ${responses.length} | מקסימום: ${MAX_QUESTIONS}` : 'טוען שאלת שף...' }
          </div>
        </div>

        <div className="p-8">
          {isPreparingBrief ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-cyan-200 rounded-full mx-auto mb-4"></div>
              <div className="text-white/80 text-sm">השף מזקק את התשובות לבריף יצירה...</div>
            </div>
          ) : isBriefStep ? (
            <>
              <h3 className="text-xl md:text-2xl font-bold text-white mb-3 text-right">
                הנה מה שהבנתי — אפשר לערוך לפני הכתיבה
              </h3>
              <p className="text-white/65 text-sm mb-6 text-right">
                זה הבריף שיישלח לכותב יחד עם התשובות המלאות שלך. תקן כאן כל דבר שלא מדויק.
              </p>

              <div className="mb-6">
                <textarea
                  value={briefText}
                  onChange={(e) => setBriefText(e.target.value)}
                  dir="rtl"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-sm outline-none focus:ring-2 focus:ring-cyan-200 focus:border-transparent resize-y min-h-[220px] leading-relaxed"
                />
              </div>
            </>
          ) : isFinalAdditionsStep ? (
            <>
              <h3 className="text-xl md:text-2xl font-bold text-white mb-3 text-right">
                יש משהו אחרון שחשוב להוסיף לפני שאני מתחיל לכתוב?
              </h3>
              <p className="text-white/65 text-sm mb-6 text-right">
                אפשר להשאיר ריק ולהתחיל מיד, או להוסיף דגש קצר שאכנס איתו לבריף הסופי.
              </p>

              <div className="mb-6">
                <textarea
                  value={finalAdditionsText}
                  onChange={(e) => setFinalAdditionsText(e.target.value)}
                  placeholder="למשל: להדגיש את הטון, להימנע מנושא מסוים, לשמור על מבנה מסוים, או להוסיף פרט אחרון..."
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-sm outline-none focus:ring-2 focus:ring-cyan-200 focus:border-transparent resize-y min-h-[120px]"
                />
              </div>

              <div className="mb-6 text-right">
                <div className="text-white font-bold text-sm mb-1">איך לטפל במקורות?</div>
                <p className="text-white/60 text-xs mb-3">בחירה מפורשת גוברת על ההחלטה האוטומטית של המערכת.</p>
                {forcedSourceRoute === 'none' && (
                  <div className="mb-3 px-3 py-2 rounded-xl border border-emerald-300/40 bg-emerald-400/15 text-emerald-50 text-xs">
                    🔒 מצב סגור פעיל מהמסך הראשי — הבישול ייכתב בלי חיפוש חיצוני. לשינוי, כבה את המתג במסך הבית.
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {[
                    { id: 'auto', label: 'אוטומטי (מומלץ)', desc: 'המערכת בוחרת מסלול לפי דרישות המטלה' },
                    { id: 'pipeline', label: 'מחקר מלא', desc: 'אחזור מקורות מאומתים (כולל אקדמיים) לפני הכתיבה — יסודי, איטי יותר' },
                    { id: 'single-call', label: 'קריאה אחת', desc: 'Gemini מחפש וכותב יחד — מהיר וחסכוני, מקורות web בלבד' },
                    { id: 'none', label: 'בלי מקורות', desc: 'כתיבה בלבד, ללא חיפוש וללא ביבליוגרפיה' },
                  ].map((route) => (
                    <button
                      key={route.id}
                      type="button"
                      onClick={() => setSourceRoute(route.id)}
                      disabled={Boolean(forcedSourceRoute)}
                      className={`p-3 rounded-xl border-2 transition-all text-right disabled:opacity-40 disabled:cursor-not-allowed ${
                        sourceRoute === route.id
                          ? 'border-cyan-300 bg-cyan-400/20 text-cyan-50 shadow-lg shadow-cyan-500/20'
                          : 'border-white/20 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white'
                      }`}
                    >
                      <div className="font-bold text-sm">{route.label}</div>
                      <div className="text-xs opacity-75 mt-1">{route.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : !question || isLoadingQuestion ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-cyan-200 rounded-full mx-auto mb-4"></div>
              <div className="text-white/80 text-sm">השף מנתח את ההקשר ובונה שאלה מותאמת...</div>
            </div>
          ) : (
            <>
              <h3 className="text-xl md:text-2xl font-bold text-white mb-6 text-right">
                {question.question}
              </h3>

              {!!question.multiChoice?.length && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                  {question.multiChoice.map((choice, idx) => (
                    <button
                      key={`${choice}-${idx}`}
                      onClick={() => toggleChoice(choice)}
                      className={`p-4 rounded-xl border-2 transition-all text-right font-medium ${
                        selectedChoices.includes(choice)
                          ? 'border-cyan-300 bg-cyan-400/20 text-cyan-50 shadow-lg shadow-cyan-500/20'
                          : 'border-white/20 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white'
                      }`}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              )}

              <div className="mb-6">
                <textarea
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder={question.placeholder}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-sm outline-none focus:ring-2 focus:ring-cyan-200 focus:border-transparent resize-y min-h-[100px]"
                />
              </div>
            </>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {isPreparingBrief ? null : isBriefStep ? (
              <>
                <button
                  onClick={handleConfirmBrief}
                  disabled={isSubmitting || !String(briefText || '').trim()}
                  className={`px-8 py-3 rounded-xl font-bold transition-all transform ${
                    isSubmitting || !String(briefText || '').trim()
                      ? 'bg-gray-500/30 text-gray-300 cursor-not-allowed'
                      : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg hover:shadow-cyan-500/30 hover:scale-105'
                  }`}
                >
                  {isSubmitting ? '⏳ מכין מסמך...' : '✓ אשר וכתוב את המסמך'}
                </button>

                <button
                  onClick={handleBackFromBrief}
                  disabled={isSubmitting}
                  className="px-8 py-3 rounded-xl font-bold border border-white/20 text-white hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  חזרה
                </button>
              </>
            ) : isFinalAdditionsStep ? (
              <>
                <button
                  onClick={handleConfirmFinalAdditions}
                  disabled={isSubmitting || isPreparingBrief}
                  className={`px-8 py-3 rounded-xl font-bold transition-all transform ${
                    isSubmitting
                      ? 'bg-gray-500/30 text-gray-300 cursor-not-allowed'
                      : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg hover:shadow-cyan-500/30 hover:scale-105'
                  }`}
                >
                  {isSubmitting ? '⏳ מכין מסמך...' : finalAdditionsText.trim() ? 'הוסף והמשך לאישור הבריף' : 'המשך לאישור הבריף'}
                </button>

                <button
                  onClick={handleBackFromFinalAdditions}
                  disabled={isSubmitting}
                  className="px-8 py-3 rounded-xl font-bold border border-white/20 text-white hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  חזרה לשאלות
                </button>
              </>
            ) : (
              <>
            <button
              onClick={handleNext}
              disabled={(!selectedChoices.length && !customText.trim()) || isSubmitting || isEvaluating || isLoadingQuestion || !question}
              className={`px-8 py-3 rounded-xl font-bold transition-all transform ${
                (!selectedChoices.length && !customText.trim()) || isSubmitting || isEvaluating || isLoadingQuestion || !question
                  ? 'bg-gray-500/30 text-gray-300 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg hover:shadow-cyan-500/30 hover:scale-105'
              }`}
            >
              {isSubmitting ? '⏳ מכין מסמך...' : isEvaluating ? '🧠 השף חושב...' : isLoadingQuestion ? 'טוען שאלה...' : '➜ המשך'}
            </button>

            {currentQuestion > 0 && (
              <button
                onClick={handleBack}
                disabled={isSubmitting || isEvaluating || isLoadingQuestion}
                className="px-8 py-3 rounded-xl font-bold border border-white/20 text-white hover:bg-white/10 transition-all"
              >
                ← חזרה
              </button>
            )}

            <button
              onClick={handleSkip}
              disabled={isSubmitting || isEvaluating || isLoadingQuestion}
              className="px-6 py-3 rounded-xl font-bold border border-white/20 text-white/80 hover:bg-white/10 transition-all"
            >
              דלג
            </button>

            <button
              onClick={() => requestFinishWithFinalReview(responses)}
              disabled={effectiveResponseCount < 3 || isSubmitting || isEvaluating || isLoadingQuestion}
              className="px-6 py-3 rounded-xl font-bold border border-amber-200/40 text-amber-100 hover:bg-amber-300/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              יש מספיק מידע - התחל לכתוב
            </button>

            <button
              onClick={handleAddQuestion}
              disabled={isSubmitting || isEvaluating || isLoadingQuestion || questionFlow.length >= MAX_QUESTIONS}
              className="px-6 py-3 rounded-xl font-bold border border-cyan-200/40 text-cyan-100 hover:bg-cyan-300/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              הוסף עוד שאלות
            </button>

            <button
              onClick={handleGoToEditor}
              className="px-8 py-3 rounded-xl font-bold border border-white/30 text-white/80 hover:bg-white/5 transition-all"
            >
              עבור ליצירת מסמך
            </button>
              </>
            )}
          </div>

          {responses.length > 0 && (
            <div className="mt-8 p-4 bg-white/5 border border-white/10 rounded-xl max-h-[150px] overflow-y-auto">
              <div className="text-white/70 text-xs font-bold mb-2">📋 תשובות שלך עד כה:</div>
              <div className="space-y-1">
                {responses.map((r, idx) => (
                  <div key={idx} className="text-white/60 text-xs">
                    <span className="text-white/40">Q{r.question}:</span> {String(r.answer).substring(0, 70)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white/5 border-t border-white/10 p-4 text-center text-white/50 text-xs">
          💡 השאלות מותאמות אוטומטית לפרומפט, לתבנית, להנחיות ולחומרי העזר שבחרת.
        </div>
      </div>
    </div>
  );
}
