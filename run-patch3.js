const fs = require('fs');
let content = fs.readFileSync('src/ProfileOnboarding.jsx', 'utf8');

// Update total steps in arrays and math
content = content.replace('[1, 2, 3, 4, 5, 6].map', '[1, 2, 3, 4, 5, 6, 7].map');
content = content.split(' / 6) * 100').join(' / 7) * 100');
content = content.replace('if (step < 6) {', 'if (step < 7) {');

// Update step dictionaries
content = content.replace(`  const stepIcons = {
    1: '👋',
    2: '💼',
    3: '🎯',
    4: '⚖️',
    5: '🎨',
    6: '✨'
  };`, `  const stepIcons = {
    1: '👋',
    2: '💼',
    3: '🎯',
    4: '⚖️',
    5: '🎨',
    6: '📝',
    7: '✨'
  };`);

content = content.replace(`  const stepTitles = {
    1: 'הכירות',
    2: 'סביבה',
    3: 'קהל יעד',
    4: 'חוקים',
    5: 'משחק',
    6: 'סיום'
  };`, `  const stepTitles = {
    1: 'הכירות',
    2: 'סביבה',
    3: 'קהל יעד',
    4: 'חוקים',
    5: 'משחק',
    6: 'דוגמה',
    7: 'סיום'
  };`);

// Shift Step 6 to Step 7 logic
content = content.replace('{step === 6 && (', '{step === 7 && (');

// Disable states and render buttons shift logic
content = content.split('disabled={step === 6}').join('disabled={step === 7}');
content = content.split("step === 6\n                  ? 'bg-slate-800/30").join("step === 7\n                  ? 'bg-slate-800/30");
content = content.split("{step === 6 ? 'סיום ✨' : 'המשך →'}").join("{step === 7 ? 'סיום ✨' : 'המשך →'}");
content = content.split("שלב {step} מתוך 6").join("שלב {step} מתוך 7");
content = content.split("step === 6\n                  ? 'bg-white/10 text-white/40 cursor-not-allowed").join("step === 7\n                  ? 'bg-white/10 text-white/40 cursor-not-allowed");

// Inject the new Step 6 before newly named Step 7
const newStep6 = `            {step === 6 && (
              <div className="space-y-6 animate-in slide-in-from-left-5 duration-700">
                <div className="text-center mb-6">
                  <h2 className="text-3xl font-bold text-white mb-3" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)' }}>
                    📝 הטאצ'ים הקטנים ודוגמת הזהב
                  </h2>
                  <p className="text-white text-lg leading-relaxed" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.7)' }}>
                    כדי להגיע לתוצאה מושלמת, אצטרך לדעת מה ההרגלים שלך
                  </p>
                </div>

                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="group">
                      <label className="block text-sm font-medium text-white mb-2 group-hover:text-yellow-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                         פתיח אהוב (Greetings)
                      </label>
                      <input
                        value={profile.greetingStyle || ''}
                        onChange={(e) => updateField('greetingStyle', e.target.value)}
                        placeholder="למשל: היי צוות, שלום לכולם, או בלי פתיח..."
                        className="w-full px-4 py-3 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all duration-300 hover:bg-slate-800/80"
                      />
                    </div>
                    <div className="group">
                      <label className="block text-sm font-medium text-white mb-2 group-hover:text-yellow-200 transition-colors" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                        סיום אהוב (Sign-offs)
                      </label>
                      <input
                        value={profile.signOffStyle || ''}
                        onChange={(e) => updateField('signOffStyle', e.target.value)}
                        placeholder="למשל: בברכה, תודה מראש, נדבר..."
                        className="w-full px-4 py-3 bg-slate-800/60 backdrop-blur-sm border border-slate-600 rounded-xl text-white outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all duration-300 hover:bg-slate-800/80"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="group">
                      <label className="block text-sm font-medium text-white mb-2 group-hover:text-cyan-200 transition-colors">
                        שימוש באימוג'י 😊
                      </label>
                      <select
                        value={profile.emojiPreference || 'moderate'}
                        onChange={(e) => updateField('emojiPreference', e.target.value)}
                        className="w-full px-4 py-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 hover:bg-white/25 cursor-pointer"
                      >
                        <option value="none" className="bg-slate-800 text-white">ללא אימוג'י בכלל</option>
                        <option value="rare" className="bg-slate-800 text-white">מעט מאוד (רק בסוף)</option>
                        <option value="moderate" className="bg-slate-800 text-white">במידה (כאן ושם לפי ההקשר)</option>
                        <option value="lots" className="bg-slate-800 text-white">משתמש בהרבה אימוג'ים</option>
                      </select>
                    </div>
                    <div className="group">
                      <label className="block text-sm font-medium text-white mb-2 group-hover:text-cyan-200 transition-colors">
                        הרגלי עיצוב רשימות
                      </label>
                      <select
                        value={profile.listPreference || 'bullets'}
                        onChange={(e) => updateField('listPreference', e.target.value)}
                        className="w-full px-4 py-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 hover:bg-white/25 cursor-pointer"
                      >
                        <option value="bullets" className="bg-slate-800 text-white">עדיפות לנקודות (Bullets •)</option>
                        <option value="numbers" className="bg-slate-800 text-white">עדיפות למספרים (1,2,3)</option>
                        <option value="hyphens" className="bg-slate-800 text-white">עדיפות לקווים מפרידים (-)</option>
                      </select>
                    </div>
                  </div>

                  <div className="group pt-2">
                    <label className="block text-sm font-medium text-white mb-2 group-hover:text-purple-300 transition-colors">
                      ✨ דוגמת הזהב - הדבק כאן טקסט לדוגמה שכתבת (רשות אך מומלץ)
                    </label>
                    <textarea
                      value={profile.goldenExample || ''}
                      onChange={(e) => updateField('goldenExample', e.target.value)}
                      placeholder="טקסט קצר שכתבת (מייל, פוסט, או סיכום). אני אלמד לנתח בדיוק אותו..."
                      rows={4}
                      className="w-full px-4 py-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 resize-none outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-300 hover:bg-white/25"
                    />
                  </div>
                </div>
              </div>
            )}`;

content = content.replace('{step === 7 && (', newStep6 + '\n\n            {step === 7 && (');

fs.writeFileSync('src/ProfileOnboarding.jsx', content);
console.log('Patched ProfileOnboarding.jsx with Step 6: Golden Example');
