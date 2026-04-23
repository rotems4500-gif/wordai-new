import React, { useState, useEffect } from 'react';
import { chefModeDecideNextStep, chefModeGenerateQuestion } from './services/aiService';

const MAX_QUESTIONS = 13;
const MIN_AUTO_STOP_RESPONSES = 5;

const CHEF_MODEL_OPTIONS = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'claude', label: 'Claude' },
  { value: 'openai', label: 'OpenAI' },
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

export default function ChefModeDialog({ onStart, onClose, onGoToEditor, onModelChange, selectedModel = 'gemini', chefContext = {} }) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [questionFlow, setQuestionFlow] = useState([]);
  const [responses, setResponses] = useState([]);
  const [selectedChoices, setSelectedChoices] = useState([]);
  const [customText, setCustomText] = useState('');
  const [localModel, setLocalModel] = useState(selectedModel || 'gemini');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);

  const saveSession = (updatedResponses, updatedQuestion, updatedQuestionFlow, model = localModel) => {
    localStorage.setItem('wordflow_chef_session', JSON.stringify({
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

  const requestDynamicQuestion = async (step, baseResponses, model = localModel) => {
    const payload = await chefModeGenerateQuestion({
      step,
      maxQuestions: MAX_QUESTIONS,
      selectedModel: model,
      responses: baseResponses,
      documentPrompt: chefContext?.prompt,
      templateId: chefContext?.templateId,
      instructions: chefContext?.instructions,
      selectedMaterials: chefContext?.selectedMaterials || [],
    });
    return payload;
  };

  const canAutoStop = (responsesCount) => Number(responsesCount || 0) >= MIN_AUTO_STOP_RESPONSES;

  useEffect(() => {
    const bootstrap = async () => {
      let loadedResponses = [];
      let loadedQuestionFlow = [];
      let loadedCurrentQuestion = 0;
      let loadedModel = selectedModel || 'gemini';

      const saved = localStorage.getItem('wordflow_chef_session');
      if (saved) {
        try {
          const data = JSON.parse(saved);
          loadedResponses = Array.isArray(data.responses) ? data.responses : [];
          loadedQuestionFlow = Array.isArray(data.questionFlow) ? data.questionFlow : [];
          loadedCurrentQuestion = Number(data.currentQuestion) || 0;
          if (data.selectedModel) loadedModel = data.selectedModel;
        } catch {}
      }

      setResponses(loadedResponses);
      setLocalModel(loadedModel);

      if (!loadedQuestionFlow.length) {
        setIsLoadingQuestion(true);
        try {
          const firstQuestion = await requestDynamicQuestion(1, loadedResponses, loadedModel);
          if (firstQuestion?.shouldStop && canAutoStop(loadedResponses.length)) {
            if (typeof onStart === 'function') await onStart(loadedResponses, loadedModel);
            return;
          }
          loadedQuestionFlow = [toSafeQuestionCard(1, firstQuestion)];
        } finally {
          setIsLoadingQuestion(false);
        }
      }

      const safeQuestionIndex = Math.max(0, Math.min(loadedCurrentQuestion, Math.max(loadedQuestionFlow.length - 1, 0)));
      setQuestionFlow(loadedQuestionFlow);
      setCurrentQuestion(safeQuestionIndex);
      saveSession(loadedResponses, safeQuestionIndex, loadedQuestionFlow, loadedModel);
      const currentCard = loadedQuestionFlow[safeQuestionIndex];
      if (currentCard) hydrateInputsFromResponse(currentCard.id, loadedResponses);
    };

    bootstrap();
  }, []);

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

  const handleFinish = async (finalResponses) => {
    setIsSubmitting(true);
    try {
      localStorage.setItem('wordflow_chef_responses', JSON.stringify({
        responses: finalResponses,
        selectedModel: localModel,
        completedAt: Date.now(),
      }));

      if (typeof onStart === 'function') {
        await onStart(finalResponses, localModel);
      }

      localStorage.removeItem('wordflow_chef_session');
    } catch (error) {
      console.error('שגיאה בהתחלת בישול:', error);
    } finally {
      setIsSubmitting(false);
    }
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
      await handleFinish(newResponses);
      return;
    }

    if (currentQuestion < questionFlow.length - 1) {
      goToQuestion(currentQuestion + 1, newResponses, questionFlow);
      return;
    }

    setIsEvaluating(true);
    try {
      const decision = await chefModeDecideNextStep(newResponses, localModel, {
        currentQuestionId: current.id,
        maxQuestions: MAX_QUESTIONS,
        documentPrompt: chefContext?.prompt,
        templateId: chefContext?.templateId,
        instructions: chefContext?.instructions,
        selectedMaterials: chefContext?.selectedMaterials || [],
      });
      if (decision?.shouldStop && canAutoStop(newResponses.length)) {
        await handleFinish(newResponses);
        return;
      }

      setIsLoadingQuestion(true);
      const nextStep = questionFlow.length + 1;
      const dynamicQuestion = await requestDynamicQuestion(nextStep, newResponses, localModel);
      if (dynamicQuestion?.shouldStop && canAutoStop(newResponses.length)) {
        await handleFinish(newResponses);
        return;
      }
      const nextQuestionFlow = [...questionFlow, toSafeQuestionCard(nextStep, dynamicQuestion)];
      setQuestionFlow(nextQuestionFlow);
      goToQuestion(nextQuestionFlow.length - 1, newResponses, nextQuestionFlow);
    } catch (error) {
      console.warn('Chef flow fallback error', error);
      if (canAutoStop(newResponses.length)) {
        await handleFinish(newResponses);
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
      await handleFinish(responses);
      return;
    }

    setIsLoadingQuestion(true);
    try {
      const nextStep = questionFlow.length + 1;
      const dynamicQuestion = await requestDynamicQuestion(nextStep, responses, localModel);
      if (dynamicQuestion?.shouldStop && canAutoStop(responses.length)) {
        await handleFinish(responses);
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

  const handleBack = () => {
    if (currentQuestion <= 0 || isSubmitting || isEvaluating || isLoadingQuestion) return;
    goToQuestion(currentQuestion - 1, responses, questionFlow);
  };

  const handleStop = () => {
    if (window.confirm('בטוח שתרצה להפסיק בישול?')) {
      localStorage.removeItem('wordflow_chef_session');
      setResponses([]);
      setCurrentQuestion(0);
      setQuestionFlow([]);
      setSelectedChoices([]);
      setCustomText('');
      onClose?.();
    }
  };

  const handleGoToEditor = () => {
    if (window.confirm('המשך לעורך? ההיסטוריה של הבישול תישמר.')) {
      onGoToEditor?.();
    }
  };

  const question = questionFlow[currentQuestion] || null;
  const progress = (responses.length / MAX_QUESTIONS) * 100;

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
          {!question || isLoadingQuestion ? (
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
              onClick={() => handleFinish(responses)}
              disabled={responses.length < 3 || isSubmitting || isEvaluating || isLoadingQuestion}
              className="px-6 py-3 rounded-xl font-bold border border-amber-200/40 text-amber-100 hover:bg-amber-300/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              יש מספיק מידע - התחל לכתוב
            </button>

            <button
              onClick={handleGoToEditor}
              className="px-8 py-3 rounded-xl font-bold border border-white/30 text-white/80 hover:bg-white/5 transition-all"
            >
              📝 לעורך
            </button>
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
