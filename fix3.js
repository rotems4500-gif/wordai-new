const fs = require('fs');
let code = fs.readFileSync('src/FileMenu.jsx', 'utf8');

const splitMarker = 'return (\n    <div className="fixed inset-0 z-[999] flex" dir="rtl"';
if (!code.includes(splitMarker)) {
    console.error("Marker not found! Let me try another marker...");
    // Fallback: search for return ( ... fixed inset-0
    const match = code.match(/return \(\s*<div className="fixed inset-0 z-\[999\] flex" dir="rtl"/);
    if(match) {
        console.log("Found using regex match!");
        code = code.substring(0, match.index) + "\n\n  " + `return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 md:p-8" dir="rtl"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      
      <div className="w-full max-w-[1240px] h-[92vh] max-h-[900px] bg-[#fdfdfc] rounded-3xl shadow-2xl shadow-indigo-900/20 flex overflow-hidden ring-1 ring-white/20">
        
        {/* ─── Sidebar ─── */}
        <div className="w-[280px] bg-gradient-to-b from-slate-900 via-indigo-950 to-purple-950 text-white flex flex-col shrink-0 relative overflow-hidden border-l border-white/5 shadow-2xl">
          {/* Glass glare effect */}
          <div className="absolute top-0 right-0 w-full h-full bg-white/5 opacity-50 blur-3xl pointer-events-none rounded-full transform -translate-y-1/2 translate-x-1/4" />
          
          <div className="flex flex-col items-center gap-3 pt-10 pb-6 px-6 relative z-10">
            <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-purple-400 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-900/50 border border-white/20">
              <i className="ph-fill ph-circles-four text-white drop-shadow-md" style={{ fontSize: 32 }} />
            </div>
            <div className="text-center mt-2">
              <div className="text-[17px] font-bold tracking-wide bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">WordFlow OS</div>
              <div className="text-[11px] font-medium text-indigo-300/80 uppercase tracking-widest mt-1">Workspace Settings</div>
            </div>
          </div>

          <nav className="flex flex-col gap-1.5 px-4 flex-1 relative z-10 overflow-y-auto pb-4">
            <button className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-[13px] font-semibold bg-white/10 hover:bg-white/20 text-white transition-all shadow-sm border border-white/10 mb-4"
              onClick={onClose}>
              <i className="ph-bold ph-arrow-right text-[15px]" />
              חזור לעריכה
            </button>

            <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider px-2 mb-1 mt-2">פעולות חירום</div>
            {menuItems.map(item => sideBtn(item.id, item.icon, item.label))}      

            <div className="h-px bg-white/10 mx-2 my-4" />
            <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider px-2 mb-1 mt-2">הגדרות מערכת</div>

            <button
              className={\`flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-medium transition-all duration-200 w-full text-right \${(activePanel === 'settings' && settingsTab === 'updates') ? 'bg-white/20 text-white shadow-sm border border-white/10' : 'text-white/70 hover:bg-white/10 hover:text-white border border-transparent'}\`}
              onClick={() => { setActivePanel('settings'); setSettingsTab('updates'); }}>
              <i className={\`ph-fill ph-arrow-circle-up text-lg shrink-0 \${(activePanel === 'settings' && settingsTab === 'updates') ? 'text-blue-300' : 'opacity-80'}\`} />
              בדוק עדכונים
            </button>

            {sideBtn('settings', 'ph-fill ph-sliders-horizontal', 'הגדרות מתקדמות', true)}
          </nav>

          <div className="p-5 text-[10px] text-white/30 text-center border-t border-white/5 relative z-10 font-mono tracking-widest">
            WF-OS v1.0.13
          </div>
        </div>

        {/* ─── Content ─── */}
        <div className="flex-1 bg-transparent overflow-y-auto relative">
          {activePanel === 'main' && (
            <div className="flex flex-col items-center justify-center h-full gap-6 text-slate-400"> 
              <div className="w-32 h-32 rounded-full border border-slate-200 flex items-center justify-center bg-slate-50 shadow-inner">
                <i className="ph-fill ph-magic-wand text-slate-300" style={{ fontSize: 64 }} />
              </div>
              <p className="text-[15px] font-medium tracking-wide">בחר אזור ניהול מהתפריט</p> 
            </div>
          )}

          {activePanel === 'settings' && (
            <div className="max-w-[840px] mx-auto py-10 px-6 sm:px-8 lg:py-14 lg:px-12">
              <div className="flex items-center justify-between mb-8">
                 <div>
                   <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
                     <i className="ph-duotone ph-sliders-horizontal text-purple-600" />
                     הגדרות והתאמות
                   </h2>
                   <p className="text-[14px] text-slate-500 mt-2 font-medium">ניהול מנועים, סקילים, אוטומציות וסביבת עבודה</p>
                 </div>
                 {/* Modern Status Badge */}
                 <div className={\`px-4 py-2 rounded-full text-xs font-bold shadow-sm flex items-center gap-2 border \${saved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}\`}>
                    <div className={\`w-2 h-2 rounded-full \${saved ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-slate-300'}\`} />   
                    {saved ? 'השינויים נשמרו' : 'סנכרון ענן (מקומי)'}
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">        
                {SETTINGS_TAB_GROUPS.map((group) => (
                  <div key={group.title} className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="text-[11px] font-bold text-slate-400 mb-3 tracking-widest">{group.title}</div>
                    <div className="flex flex-wrap gap-2">   
                      {group.tabs.map(([id, label]) => (
                        <button key={id} onClick={() => setSettingsTab(id)}       
                          className={\`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all \${settingsTab === id ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm' : 'bg-slate-50 text-slate-600 border border-transparent hover:bg-slate-100 hover:border-slate-200'}\`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Setting Screens inject here */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm min-h-[400px]">
                {settingsTab === 'guide'       && <GuideSettings />}
                {settingsTab === 'ai'          && <AiSettings config={config} setConfig={setConfig} />}
                {settingsTab === 'skills'      && <SkillsSettings skillsState={skillsState} setSkillsState={setSkillsState} />}
                {settingsTab === 'agents'      && <RoleAgentsSettings agents={roleAgents} setAgents={setRoleAgents} automation={workspaceAutomationState} setAutomation={setWorkspaceAutomationState} config={config} />}
                {settingsTab === 'updates'     && <UpdateSettings />}
                {settingsTab === 'assistant'   && <AssistantBehaviorSettings behavior={assistantBehaviorState} setBehavior={setAssistantBehaviorState} />}
                {settingsTab === 'debug'       && <DebugConsoleSettings automation={workspaceAutomationState} />}
                {settingsTab === 'writing'     && <WordDefaultsSettings prefs={wordPrefsState} setPrefs={setWordPrefsState} />}
                {settingsTab === 'personal'    && <PersonalStyleSettings profile={personalStyleState} setProfile={setPersonalStyleState} />}
                {settingsTab === 'appearance'  && <AppearanceSettings />}
              </div>

              {/* Action Bar */}
              <div className="mt-8 flex gap-4 items-center justify-end bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <button onClick={onClose}
                  className="px-6 py-2.5 bg-white text-slate-700 border border-slate-300 rounded-xl cursor-pointer text-[14px] font-semibold hover:bg-slate-50 transition-colors shadow-sm">
                  סגור ועבור לעריכה
                </button>
                <button onClick={handleSave}
                  className={\`px-8 py-2.5 text-white rounded-xl cursor-pointer text-[14px] font-bold transition-all shadow-md \${saved ? 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 shadow-emerald-600/30' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 border border-indigo-500 shadow-indigo-600/30'}\`}>
                  {saved ? '✓ עודכן בהצלחה!' : 'שמור והחל שינויים'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
`;
        fs.writeFileSync('src/FileMenu.jsx', code, 'utf8');
        console.log('Written successfully 2');
        process.exit(0);
    }
} else {
    const mainParts = code.split(splitMarker);
    const before = mainParts[0];

    const newTail = `return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 md:p-8" dir="rtl"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      
      <div className="w-full max-w-[1240px] h-[92vh] max-h-[900px] bg-[#fdfdfc] rounded-3xl shadow-2xl shadow-indigo-900/20 flex overflow-hidden ring-1 ring-white/20">
        
        {/* ─── Sidebar ─── */}
        <div className="w-[280px] bg-gradient-to-b from-slate-900 via-indigo-950 to-purple-950 text-white flex flex-col shrink-0 relative overflow-hidden border-l border-white/5 shadow-2xl">
          {/* Glass glare effect */}
          <div className="absolute top-0 right-0 w-full h-full bg-white/5 opacity-50 blur-3xl pointer-events-none rounded-full transform -translate-y-1/2 translate-x-1/4" />
          
          <div className="flex flex-col items-center gap-3 pt-10 pb-6 px-6 relative z-10">
            <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-purple-400 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-900/50 border border-white/20">
              <i className="ph-fill ph-circles-four text-white drop-shadow-md" style={{ fontSize: 32 }} />
            </div>
            <div className="text-center mt-2">
              <div className="text-[17px] font-bold tracking-wide bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">WordFlow OS</div>
              <div className="text-[11px] font-medium text-indigo-300/80 uppercase tracking-widest mt-1">Workspace Settings</div>
            </div>
          </div>

          <nav className="flex flex-col gap-1.5 px-4 flex-1 relative z-10 overflow-y-auto pb-4">
            <button className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-[13px] font-semibold bg-white/10 hover:bg-white/20 text-white transition-all shadow-sm border border-white/10 mb-4"
              onClick={onClose}>
              <i className="ph-bold ph-arrow-right text-[15px]" />
              חזור לעריכה
            </button>

            <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider px-2 mb-1 mt-2">פעולות חירום</div>
            {menuItems.map(item => sideBtn(item.id, item.icon, item.label))}      

            <div className="h-px bg-white/10 mx-2 my-4" />
            <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider px-2 mb-1 mt-2">הגדרות מערכת</div>

            <button
              className={\`flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-medium transition-all duration-200 w-full text-right \${(activePanel === 'settings' && settingsTab === 'updates') ? 'bg-white/20 text-white shadow-sm border border-white/10' : 'text-white/70 hover:bg-white/10 hover:text-white border border-transparent'}\`}
              onClick={() => { setActivePanel('settings'); setSettingsTab('updates'); }}>
              <i className={\`ph-fill ph-arrow-circle-up text-lg shrink-0 \${(activePanel === 'settings' && settingsTab === 'updates') ? 'text-blue-300' : 'opacity-80'}\`} />
              בדוק עדכונים
            </button>

            {sideBtn('settings', 'ph-fill ph-sliders-horizontal', 'הגדרות מתקדמות', true)}
          </nav>

          <div className="p-5 text-[10px] text-white/30 text-center border-t border-white/5 relative z-10 font-mono tracking-widest">
            WF-OS v1.0.13
          </div>
        </div>

        {/* ─── Content ─── */}
        <div className="flex-1 bg-transparent overflow-y-auto relative">
          {activePanel === 'main' && (
            <div className="flex flex-col items-center justify-center h-full gap-6 text-slate-400"> 
              <div className="w-32 h-32 rounded-full border border-slate-200 flex items-center justify-center bg-slate-50 shadow-inner">
                <i className="ph-fill ph-magic-wand text-slate-300" style={{ fontSize: 64 }} />
              </div>
              <p className="text-[15px] font-medium tracking-wide">בחר אזור ניהול מהתפריט</p> 
            </div>
          )}

          {activePanel === 'settings' && (
            <div className="max-w-[840px] mx-auto py-10 px-6 sm:px-8 lg:py-14 lg:px-12">
              <div className="flex items-center justify-between mb-8">
                 <div>
                   <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
                     <i className="ph-duotone ph-sliders-horizontal text-purple-600" />
                     הגדרות והתאמות
                   </h2>
                   <p className="text-[14px] text-slate-500 mt-2 font-medium">ניהול מנועים, סקילים, אוטומציות וסביבת עבודה</p>
                 </div>
                 {/* Modern Status Badge */}
                 <div className={\`px-4 py-2 rounded-full text-xs font-bold shadow-sm flex items-center gap-2 border \${saved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}\`}>
                    <div className={\`w-2 h-2 rounded-full \${saved ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-slate-300'}\`} />   
                    {saved ? 'השינויים נשמרו' : 'סנכרון ענן (מקומי)'}
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">        
                {SETTINGS_TAB_GROUPS.map((group) => (
                  <div key={group.title} className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="text-[11px] font-bold text-slate-400 mb-3 tracking-widest">{group.title}</div>
                    <div className="flex flex-wrap gap-2">   
                      {group.tabs.map(([id, label]) => (
                        <button key={id} onClick={() => setSettingsTab(id)}       
                          className={\`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all \${settingsTab === id ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm' : 'bg-slate-50 text-slate-600 border border-transparent hover:bg-slate-100 hover:border-slate-200'}\`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Setting Screens inject here */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm min-h-[400px]">
                {settingsTab === 'guide'       && <GuideSettings />}
                {settingsTab === 'ai'          && <AiSettings config={config} setConfig={setConfig} />}
                {settingsTab === 'skills'      && <SkillsSettings skillsState={skillsState} setSkillsState={setSkillsState} />}
                {settingsTab === 'agents'      && <RoleAgentsSettings agents={roleAgents} setAgents={setRoleAgents} automation={workspaceAutomationState} setAutomation={setWorkspaceAutomationState} config={config} />}
                {settingsTab === 'updates'     && <UpdateSettings />}
                {settingsTab === 'assistant'   && <AssistantBehaviorSettings behavior={assistantBehaviorState} setBehavior={setAssistantBehaviorState} />}
                {settingsTab === 'debug'       && <DebugConsoleSettings automation={workspaceAutomationState} />}
                {settingsTab === 'writing'     && <WordDefaultsSettings prefs={wordPrefsState} setPrefs={setWordPrefsState} />}
                {settingsTab === 'personal'    && <PersonalStyleSettings profile={personalStyleState} setProfile={setPersonalStyleState} />}
                {settingsTab === 'appearance'  && <AppearanceSettings />}
              </div>

              {/* Action Bar */}
              <div className="mt-8 flex gap-4 items-center justify-end bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <button onClick={onClose}
                  className="px-6 py-2.5 bg-white text-slate-700 border border-slate-300 rounded-xl cursor-pointer text-[14px] font-semibold hover:bg-slate-50 transition-colors shadow-sm">
                  סגור ועבור לעריכה
                </button>
                <button onClick={handleSave}
                  className={\`px-8 py-2.5 text-white rounded-xl cursor-pointer text-[14px] font-bold transition-all shadow-md \${saved ? 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 shadow-emerald-600/30' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 border border-indigo-500 shadow-indigo-600/30'}\`}>
                  {saved ? '✓ עודכן בהצלחה!' : 'שמור והחל שינויים'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
`;
    fs.writeFileSync('src/FileMenu.jsx', before + newTail, 'utf8');
    console.log('Written successfully');
}
