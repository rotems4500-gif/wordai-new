const fs = require('fs');
let content = fs.readFileSync('src/FileMenu.jsx', 'utf8');

// 1. Hide popup header for onboarding
content = content.replace(
  '{/* POPUP HEADER */}\n               <div className="bg-white px-6 sm:px-8 py-5 border-b border-slate-200 flex items-center justify-between shadow-sm z-10 shrink-0">',
  '{/* POPUP HEADER */}\n               {settingsTab !== \'onboarding\' && (\n               <div className="bg-white px-6 sm:px-8 py-5 border-b border-slate-200 flex items-center justify-between shadow-sm z-10 shrink-0">'
);
content = content.replace(
  '                  </button>\n               </div>\n\n               {/* POPUP CONTENT (TABS + SCREENS) */}',
  '                  </button>\n               </div>\n               )}\n\n               {/* POPUP CONTENT (TABS + SCREENS) */}'
);

// 2. Adjust content area padding and background for onboarding
content = content.replace(
  '               <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-slate-50/50 custom-scrollbar-slim">',
  '               <div className={`flex-1 overflow-y-auto custom-scrollbar-slim ${settingsTab === \'onboarding\' ? \'p-0 bg-transparent\' : \'p-4 sm:p-6 md:p-8 bg-slate-50/50\'}`}>'
);

// 3. Hide tabs for onboarding
content = content.replace(
  '                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6 md:mb-8">',
  '                  {settingsTab !== \'onboarding\' && (\n                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6 md:mb-8">'
);
content = content.replace(
  '                    ))}  \n                  </div>',
  '                    ))}  \n                  </div>\n                  )}'
);

// 4. Adjust the white background bounds for settings content
content = content.replace(
  '                  <div className="bg-white rounded-3xl p-5 sm:p-8 border border-slate-200 shadow-sm min-h-[500px]">',
  '                  <div className={settingsTab === \'onboarding\' ? \'w-full h-full\' : \'bg-white rounded-3xl p-5 sm:p-8 border border-slate-200 shadow-sm min-h-[500px]\'}>'
);

// 5. Hide footer for onboarding
content = content.replace(
  '                  {/* Footer Actions */}\n                  <div className="mt-6 md:mt-8 flex flex-wrap gap-4 items-center justify-end bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm">',
  '                  {/* Footer Actions */}\n                  {settingsTab !== \'onboarding\' && (\n                  <div className="mt-6 md:mt-8 flex flex-wrap gap-4 items-center justify-end bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm">'
);

content = content.replace(
  '                    </button>\n                  </div>',
  '                    </button>\n                  </div>\n                  )}'
);

// 6. Fix outer modal wrapper to expand or be transparent when onboarding
content = content.replace(
  '<div className="bg-slate-50 w-full max-w-[1280px] h-[90vh] sm:h-[85vh] rounded-[24px] shadow-2xl flex flex-col overflow-hidden border border-slate-200/60" onClick={e => e.stopPropagation()}>',
  '<div className={`${settingsTab === \'onboarding\' ? \'bg-transparent w-full max-w-[1400px] h-[95vh] border-none shadow-none\' : \'bg-slate-50 w-full max-w-[1280px] h-[90vh] sm:h-[85vh] rounded-[24px] shadow-2xl border border-slate-200/60\'} flex flex-col overflow-hidden`} onClick={e => e.stopPropagation()}>'
);


fs.writeFileSync('src/FileMenu.jsx', content);
console.log('UI modal size patched for onboarding.');
