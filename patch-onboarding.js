const fs = require('fs');
let content = fs.readFileSync('src/ProfileOnboarding.jsx', 'utf8');

// Update total steps in arrays and math
content = content.replace('[1, 2, 3, 4].map', '[1, 2, 3, 4, 5, 6].map');
content = content.split(' / 4) * 100').join(' / 6) * 100');
content = content.replace('if (step < 4) {', 'if (step < 6) {');

// Update step dictionaries
content = content.replace(`  const stepIcons = {
    1: '👋',
    2: '💼',
    3: '🎨',
    4: '✨'
  };`, `  const stepIcons = {
    1: '👋',
    2: '💼',
    3: '🎯',
    4: '⚖️',
    5: '🎨',
    6: '✨'
  };`);

content = content.replace(`  const stepTitles = {
    1: 'הכירות',
    2: 'סביבה',
    3: 'סגנון',
    4: 'סיום'
  };`, `  const stepTitles = {
    1: 'הכירות',
    2: 'סביבה',
    3: 'קהל יעד',
    4: 'חוקים',
    5: 'משחק',
    6: 'סיום'
  };`);

// Shift Step 4 to Step 6 logic
content = content.replace('{step === 4 && (', '{step === 6 && (');
// Shift Step 3 to Step 5 logic
content = content.replace('{step === 3 && (', '{step === 5 && (');

// Disable states and render buttons shift logic
content = content.split('disabled={step === 4}').join('disabled={step === 6}');
content = content.split("step === 4\n                  ? 'bg-slate-800/30").join("step === 6\n                  ? 'bg-slate-800/30");
content = content.split("{step === 4 ? 'סיום ✨' : 'המשך →'}").join("{step === 6 ? 'סיום ✨' : 'המשך →'}");
content = content.split("שלב {step} מתוך 4").join("שלב {step} מתוך 6");
content = content.split("step === 4\n                  ? 'bg-white/10 text-white/40 cursor-not-allowed").join("step === 6\n                  ? 'bg-white/10 text-white/40 cursor-not-allowed");

// Inject the new Steps 3 and 4 before newly named Step 5
const newSteps = `            {step === 3 && (
              <div className="space-y-6 animate-in slide-in-from-left-5 duration-700">
                <div className="text-center mb-6">
                  <h2 className="text-3xl font-bold text-white mb-3" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                    🎯 קהל יעד
                  </h2>
                  <p className="text-white text-lg leading-relaxed" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    איך תרצה שהטקסט ירגיש לאנשים שקוראים אותו?
                  </p>
                </div>

                <div className="space-y-5">
                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-2 group-hover:text-pink-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      סגנון רשמי או חברי? (Tone)
                    </label>
                    <select
                      value={profile.tonePreference || 'balanced'}
                      onChange={(e) => updateField('tonePreference', e.target.value)}
                      className="w-full px-4 py-3 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white outline-none focus:ring-2 focus:ring-pink-400 focus:border-pink-400 transition-all duration-300 hover:bg-slate-800/80 cursor-pointer"
                    >
                      <option value="very_formal" className="bg-slate-800 text-white">רשמי לחלוטין (אקדמי / עסקי נוקשה)</option>
                      <option value="formal" className="bg-slate-800 text-white">מכובד ומקצועי</option>
                      <option value="balanced" className="bg-slate-800 text-white">מאוזן (נגיש אך מקצועי)</option>
                      <option value="casual" className="bg-slate-800 text-white">חצי-רשמי / חברי</option>
                      <option value="very_casual" className="bg-slate-800 text-white">סלנג וזורם לחלוטין</option>
                    </select>
                  </div>

                  <div className="group">
                    <label className="block text-sm font-medium text-white/90 mb-2 group-hover:text-white transition-colors">
                      אורך פסקאות ופירוט עיקרי
                    </label>
                    <select
                      value={profile.lengthPreference || 'default'}
                      onChange={(e) => updateField('lengthPreference', e.target.value)}
                      className="w-full px-4 py-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all duration-300 hover:bg-white/25 cursor-pointer"
                    >
                      <option value="short" className="bg-slate-800 text-white">קצר ולעניין - ישר ולנקודה</option>
                      <option value="default" className="bg-slate-800 text-white">ממוצע - עם מעט רקע והסבר</option>
                      <option value="detailed" className="bg-slate-800 text-white">מפורט - הסברים ארוכים ודוגמאות</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6 animate-in slide-in-from-left-5 duration-700">
                <div className="text-center mb-6">
                  <h2 className="text-3xl font-bold text-white mb-3" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                    ⚖️ חוקי ברזל ואוצר מילים
                  </h2>
                  <p className="text-white text-lg leading-relaxed" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    מהם הדברים שיגרמו לטקסט להיראות בדיוק כמו שצריך?
                  </p>
                </div>

                <div className="space-y-5">
                  <div className="group">
                    <label className="block text-sm font-medium text-white mb-2 group-hover:text-red-300 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      ממה להימנע לחלוטין? 🚫
                    </label>
                    <textarea
                      value={profile.avoidRules || ''}
                      onChange={(e) => updateField('avoidRules', e.target.value)}
                      placeholder="למשל: אל תשתמש באימוג'י, בלי מילים גבוהות מדי, אורך משפט עד 10 מילים..."
                      rows={2}
                      className="w-full px-4 py-3 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white placeholder-slate-300 resize-none outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400 transition-all duration-300 hover:bg-slate-800/80"
                    />
                  </div>

                  <div className="group">
                    <label className="block text-sm font-medium text-white/90 mb-2 group-hover:text-green-300 transition-colors">
                      חוקים שתמיד צריך לקיים ✅
                    </label>
                    <textarea
                      value={profile.alwaysRules || ''}
                      onChange={(e) => updateField('alwaysRules', e.target.value)}
                      placeholder="למשל: כתוב תמיד בלשון נקבה, תמיד תסיים במשפט מניע לפעולה, הוסף סימן קריאה בכותרת..."
                      rows={2}
                      className="w-full px-4 py-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 resize-none outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-300 hover:bg-white/25"
                    />
                  </div>

                  <div className="group">
                    <label className="block text-sm font-medium text-white/90 mb-2 group-hover:text-blue-300 transition-colors">
                      מילים או ביטויים אהובים עליך ✨
                    </label>
                    <textarea
                      value={profile.favoritePhrases || ''}
                      onChange={(e) => updateField('favoritePhrases', e.target.value)}
                      placeholder="מילים שאתה משתמש בהן הרבה (למשל: 'סופר מעניין', 'בגדול', 'קלאסי'...)"
                      rows={2}
                      className="w-full px-4 py-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 resize-none outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-300 hover:bg-white/25"
                    />
                  </div>
                </div>
              </div>
            )}`;

content = content.replace('{step === 5 && (', newSteps + '\n\n            {step === 5 && (');

fs.writeFileSync('src/ProfileOnboarding.jsx', content);
console.log('Patched!');
