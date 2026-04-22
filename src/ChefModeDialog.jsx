import React, { useState, useEffect } from 'react';

const CHEF_QUESTIONS = [
  {
    id: 1,
    question: '👨‍🍳 בואו נבשל קצת! קודם - על מה אתה רוצה לכתוב?',
    multiChoice: ['תוכן עסקי', 'כתיבה אקדמית', 'תוכן יצירתי', 'מסמך רשמי'],
    placeholder: 'או כתוב משהו אחר...'
  },
  {
    id: 2,
    question: '🎯 מי הקהל שלך?',
    multiChoice: ['מנהלים/בוסים', 'חברים/משפחה', 'לקוחות', 'קהל רחב'],
    placeholder: 'תאר את הקהל היעד...'
  },
  {
    id: 3,
    question: '📋 איך תרצה שהמסמך יראה?',
    multiChoice: ['פסקאות זורמות', 'כותרות וסעיפים', 'נקודות תכליתיות', 'מרכיב טבלה'],
    placeholder: 'תן עוד פרטים על המבנה...'
  },
  {
    id: 4,
    question: '🎨 איזה טון אתה רוצה?',
    multiChoice: ['רשמי ומקצועי', 'אנושי וידידותי', 'ישיר ולעניין', 'משכנע ודרמטי'],
    placeholder: 'הסבר את הטון שלך...'
  },
  {
    id: 5,
    question: '📏 כמה ארוך המסמך צריך להיות?',
    multiChoice: ['קצר (עד 500 מילים)', 'בינוני (500-1500)', 'ארוך (1500+ מילים)', 'לא חשוב'],
    placeholder: 'קבע גודל משוער...'
  },
  {
    id: 6,
    question: '🎯 מה המטרה העיקרית שלך?',
    multiChoice: ['להשכנע', 'להודיע', 'לזכור', 'לכיף ובידור'],
    placeholder: 'הסבר מה אתה רוצה להשיג...'
  },
  {
    id: 7,
    question: '💡 יש לך רעיונות ספציפיים שרוצה לכלול?',
    multiChoice: ['כן, יש לי מפת דרכים', 'רק רעיונות כללים', 'בואו תסגרו לי', 'צריך חקירה קודם'],
    placeholder: 'ספר על הרעיונות שלך...'
  },
  {
    id: 8,
    question: '📚 צריך להתבסס על מקורות?',
    multiChoice: ['כן, עם ציטוטים', 'כן, אבל נפיץ', 'לא צריך', 'לא בטוח'],
    placeholder: 'סוגי מקורות שיעזרו לך...'
  },
  {
    id: 9,
    question: '🔗 יש לך מסמכים משלך שרוצה לשלב?',
    multiChoice: ['כן, יש לי עבודה קודמת', 'לא, שריטה נקייה', 'בחלקה בלבד', 'אולי מאוחר יותר'],
    placeholder: 'תאר מה כבר קיים...'
  },
  {
    id: 10,
    question: '⚡ מה החשוב לך הכי הרבה?',
    multiChoice: ['קריאות ובהירות', 'מקוריות', 'דיוק וחוקר', 'מסירה מהירה'],
    placeholder: 'ציין את העדיפויות שלך...'
  },
  {
    id: 11,
    question: '🌍 איזה שפה/סגנון בעברית?',
    multiChoice: ['עברית מדבוקה', 'עברית סטנדרטית', 'עברית מתמחויות', 'מעזר'],
    placeholder: 'הוסף הערות על השפה שלך...'
  },
  {
    id: 12,
    question: '🛠️ צריך עזרה בעריכה/ליטוש לאחר?',
    multiChoice: ['כן, עריכה מלאה', 'רק קצת ליטוש', 'לא צריך', 'בחלקה בלבד'],
    placeholder: 'איך אנחנו מרבים בעבודה אחרי יצירה?...'
  },
  {
    id: 13,
    question: '🎁 משהו אחרון שחשוב לך להגיד?',
    multiChoice: ['כל הקודם בסדר', 'יש עוד משהו חשוב', 'רק מעט משהו', 'לא - מוכן!'],
    placeholder: 'כל הערה נוספת שחשובה לך...'
  },
];

export default function ChefModeDialog({ onStart, onClose, onGoToEditor, selectedModel = 'gemini' }) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [responses, setResponses] = useState([]);
  const [selectedChoice, setSelectedChoice] = useState('');
  const [customText, setCustomText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Load saved session from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('wordflow_chef_session');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setResponses(data.responses || []);
        setCurrentQuestion(data.currentQuestion || 0);
      } catch {}
    }
  }, []);

  // Save session to localStorage
  const saveSession = (updatedResponses, updatedQuestion) => {
    localStorage.setItem('wordflow_chef_session', JSON.stringify({
      responses: updatedResponses,
      currentQuestion: updatedQuestion,
      savedAt: Date.now(),
      selectedModel,
    }));
  };

  const handleChoiceSelect = (choice) => {
    setSelectedChoice(choice);
  };

  const handleNext = () => {
    if (!selectedChoice && !customText.trim()) return;

    const answer = selectedChoice || customText.trim();
    const newResponses = [...responses, { question: CHEF_QUESTIONS[currentQuestion].id, answer }];
    setResponses(newResponses);
    saveSession(newResponses, currentQuestion + 1);

    if (currentQuestion < CHEF_QUESTIONS.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
      setSelectedChoice('');
      setCustomText('');
    } else {
      handleFinish(newResponses);
    }
  };

  const handleFinish = async (finalResponses) => {
    setIsLoading(true);
    try {
      // Save the full responses to localStorage for use in document generation
      localStorage.setItem('wordflow_chef_responses', JSON.stringify({
        responses: finalResponses,
        selectedModel,
        completedAt: Date.now(),
      }));

      // Call the onStart callback with responses
      if (typeof onStart === 'function') {
        await onStart(finalResponses, selectedModel);
      }

      // Clear session after successful start
      localStorage.removeItem('wordflow_chef_session');
    } catch (error) {
      console.error('שגיאה בהתחלת בישול:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = () => {
    if (window.confirm('בטוח שתרצה להפסיק בישול?')) {
      localStorage.removeItem('wordflow_chef_session');
      setResponses([]);
      setCurrentQuestion(0);
      onClose?.();
    }
  };

  const handleGoToEditor = () => {
    if (window.confirm('המשך לעורך? ההיסטוריה של הבישול תישמר.')) {
      onGoToEditor?.();
    }
  };

  const question = CHEF_QUESTIONS[currentQuestion];
  const progress = ((currentQuestion + 1) / CHEF_QUESTIONS.length) * 100;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900 rounded-3xl max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-2xl border border-purple-400/30">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 sticky top-0 z-10">
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

          {/* Progress Bar */}
          <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-pink-400 to-purple-400 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-white/70 text-sm mt-2 text-center">
            שאלה {currentQuestion + 1} מתוך {CHEF_QUESTIONS.length}
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          <h3 className="text-xl md:text-2xl font-bold text-white mb-6 text-right">
            {question.question}
          </h3>

          {/* Multi-choice Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {question.multiChoice.map((choice, idx) => (
              <button
                key={idx}
                onClick={() => handleChoiceSelect(choice)}
                className={`p-4 rounded-xl border-2 transition-all text-right font-medium ${
                  selectedChoice === choice
                    ? 'border-pink-400 bg-pink-500/20 text-pink-100 shadow-lg shadow-pink-500/30'
                    : 'border-white/20 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white'
                }`}
              >
                {choice}
              </button>
            ))}
          </div>

          {/* Custom Text Field */}
          <div className="mb-6">
            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder={question.placeholder}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-sm outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent resize-y min-h-[100px]"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={handleNext}
              disabled={!selectedChoice && !customText.trim() || isLoading}
              className={`px-8 py-3 rounded-xl font-bold transition-all transform ${
                !selectedChoice && !customText.trim() || isLoading
                  ? 'bg-gray-500/30 text-gray-300 cursor-not-allowed'
                  : 'bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:shadow-lg hover:shadow-purple-500/30 hover:scale-105'
              }`}
            >
              {isLoading ? '⏳ מעבדת...' : currentQuestion === CHEF_QUESTIONS.length - 1 ? '🎉 סיים בישול!' : '➜ הבא'}
            </button>

            {currentQuestion > 0 && (
              <button
                onClick={() => {
                  setCurrentQuestion(currentQuestion - 1);
                  setSelectedChoice('');
                  setCustomText('');
                  const saved = localStorage.getItem('wordflow_chef_session');
                  if (saved) {
                    const data = JSON.parse(saved);
                    setResponses(data.responses?.slice(0, -1) || []);
                  }
                }}
                disabled={isLoading}
                className="px-8 py-3 rounded-xl font-bold border border-white/20 text-white hover:bg-white/10 transition-all"
              >
                ← חזרה
              </button>
            )}

            <button
              onClick={handleGoToEditor}
              className="px-8 py-3 rounded-xl font-bold border border-white/30 text-white/80 hover:bg-white/5 transition-all"
            >
              📝 לעורך
            </button>
          </div>

          {/* Response Summary */}
          {responses.length > 0 && (
            <div className="mt-8 p-4 bg-white/5 border border-white/10 rounded-xl max-h-[150px] overflow-y-auto">
              <div className="text-white/70 text-xs font-bold mb-2">📋 תשובות שלך עד כה:</div>
              <div className="space-y-1">
                {responses.map((r, idx) => (
                  <div key={idx} className="text-white/60 text-xs">
                    <span className="text-white/40">Q{r.question}:</span> {String(r.answer).substring(0, 50)}...
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-white/5 border-t border-white/10 p-4 text-center text-white/50 text-xs">
          💡 השאלות האלה יעזרו לי להבין בדיוק מה אתה רוצה כדי ליצור לך משהו מנצח!
        </div>
      </div>
    </div>
  );
}
