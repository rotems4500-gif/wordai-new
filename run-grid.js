const fs = require('fs');
let content = fs.readFileSync('src/ProfileOnboarding.jsx', 'utf8');

// Replace inner vertical spaced divs with grid layouts where applicable

// Step 1: Wrap first 4 inputs in a grid, leave currentCourses below
content = content.replace(
  '<div className="space-y-2">\n                    <div className="group">',
  '<div className="space-y-3">\n                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">\n                    <div className="group">'
);
content = content.replace(
  '</div>\n\n                    <div className="group">\n                      <label className="block text-sm font-medium text-white mb-1 group-hover:text-yellow-200 transition-colors" style={{ textShadow: \'1px 1px 3px rgba(0,0,0,0.8)\' }}>\n                        קורסים או פרויקטים פעילים 📚\n                      </label>',
  '</div>\n                  </div>\n\n                    <div className="group">\n                      <label className="block text-sm font-medium text-white mb-1 group-hover:text-yellow-200 transition-colors" style={{ textShadow: \'1px 1px 3px rgba(0,0,0,0.8)\' }}>\n                        קורסים או פרויקטים פעילים 📚\n                      </label>'
);

// Step 2:
content = content.replace(
  '💼 סביבת העבודה שלך\n                  </h2>\n                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: \'1px 1px 4px rgba(0,0,0,0.7)\' }}>\n                    איך אתה כותב ובשביל מי? המידע הזה יעזור לי לדייק את הניסוחים\n                  </p>\n                </div>\n\n                <div className="space-y-3">',
  '💼 סביבת העבודה שלך\n                  </h2>\n                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: \'1px 1px 4px rgba(0,0,0,0.7)\' }}>\n                    איך אתה כותב ובשביל מי? המידע הזה יעזור לי לדייק את הניסוחים\n                  </p>\n                </div>\n\n                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">'
);

// Step 3:
content = content.replace(
  '🎯 קהל יעד\n                  </h2>\n                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: \'1px 1px 4px rgba(0,0,0,0.7)\' }}>\n                    איך תרצה שהטקסט ירגיש לאנשים שקוראים אותו?\n                  </p>\n                </div>\n\n                <div className="space-y-3">',
  '🎯 קהל יעד\n                  </h2>\n                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: \'1px 1px 4px rgba(0,0,0,0.7)\' }}>\n                    איך תרצה שהטקסט ירגיש לאנשים שקוראים אותו?\n                  </p>\n                </div>\n\n                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">'
);

// Step 4: Add emojis to headers/rules, and use grid for avoid/always, text area full width
content = content.replace(
  '⚖️ חוקי ברזל ואוצר מילים\n                  </h2>\n                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: \'1px 1px 4px rgba(0,0,0,0.7)\' }}>\n                    מהם הדברים שיגרמו לטקסט להיראות בדיוק כמו שצריך?\n                  </p>\n                </div>\n\n                <div className="space-y-3">',
  '⚖️ חוקי ברזל ואוצר מילים\n                  </h2>\n                  <p className="text-white text-sm leading-relaxed" style={{ textShadow: \'1px 1px 4px rgba(0,0,0,0.7)\' }}>\n                    מהם הדברים שיגרמו לטקסט להיראות בדיוק כמו שצריך?\n                  </p>\n                </div>\n\n                <div className="space-y-3">\n                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">'
);
content = content.replace(
  '</div>\n\n                  <div className="group">\n                    <label className="block text-sm font-medium text-white/90 mb-1 group-hover:text-blue-300 transition-colors">\n                      מילים או ביטויים אהובים עליך ✨',
  '</div>\n                  </div>\n\n                  <div className="group">\n                    <label className="block text-sm font-medium text-white/90 mb-1 group-hover:text-blue-300 transition-colors">\n                      מילים או ביטויים אהובים עליך ✨'
);


fs.writeFileSync('src/ProfileOnboarding.jsx', content);
console.log('Applied grid to Step 1, 2, 3, 4');
