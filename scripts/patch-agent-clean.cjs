// Node script to patch AiSidebar properly
const fs = require('fs');
let code = fs.readFileSync('src/AiSidebar.jsx', 'utf8');

// 1. state
if (!code.includes('activeClassicAgentId')) {
  code = code.replace(
    'const [agentProgressMap, setAgentProgressMap] = useState({});',
    'const [agentProgressMap, setAgentProgressMap] = useState({});\n    const [activeClassicAgentId, setActiveClassicAgentId] = useState(null);'
  );
}

// 2. send function
const customSendInsert = `
      let finalExtraSystemPrompt = extraSystemPrompt;
      let finalProviderId = selectedProviderId;
      let finalProviderModel = selectedProviderModel;
      const cAgent = activeClassicAgentId ? AGENTS_CONFIG[activeClassicAgentId] : null;
      
      if (cAgent) {
        if (cAgent.systemCtx) {
           finalExtraSystemPrompt += '\\n\\n' + cAgent.systemCtx;
        }
        if (cAgent.sidebarSelection && cAgent.sidebarSelection.providerId) {
           const fallbackSelection = buildClassicTaskpaneSelection(cAgent);
           if (fallbackSelection && fallbackSelection.selection) {
              finalProviderId = fallbackSelection.selection.providerId || finalProviderId;
              finalProviderModel = fallbackSelection.selection.model || finalProviderModel;
           }
        }
      }
      
      const configuredProvider = getProviderConfig(finalProviderId) || { providerId: 'default' };
`;

code = code.replace(
  'const bypassFixedAgentSelection = runtimeOptions.bypassFixedAgentSelection === true;',
  customSendInsert.trim() + '\n      const bypassFixedAgentSelection = runtimeOptions.bypassFixedAgentSelection === true;'
);

code = code.replace(
  'const providerConfig = getProviderConfig(selectedProviderId) || { providerId: \'default\' };',
  ''
);

code = code.replace(
  'providerConfig: providerConfig,',
  'providerConfig: configuredProvider,'
);

code = code.replace(
  'const aiResponse = await chatWithActiveProvider(selectedProviderId,',
  'const aiResponse = await chatWithActiveProvider(finalProviderId,'
);
code = code.replace(
  'providerModel: selectedProviderModel,',
  'providerModel: finalProviderModel,'
);
code = code.replace(
  'extraSystemPrompt: extraSystemPrompt,',
  'extraSystemPrompt: finalExtraSystemPrompt,'
);

// 3. toggle function
const toggleCode = `const toggleClassicTaskpaneAgent = (agentId) => {
      setActiveClassicAgentId(prev => prev === agentId ? null : agentId);
    };

    const activeClassicAgent = activeClassicAgentId ? AGENTS_CONFIG[activeClassicAgentId] : null;`;
    
const runAgentRegex = /const runClassicTaskpaneAgent = \([\s\S]*?\}\,\s*50\);\n\s*\};/m;
code = code.replace(runAgentRegex, toggleCode);

// 4. button replace
code = code.replace(/onClick=\{\(\) => runClassicTaskpaneAgent\(agent\.id\)\}/g, 'onClick={() => toggleClassicTaskpaneAgent(agent.id)}');

// button styling
const buttonSearchStr = `style={{ padding: '7px 10px', background: '#FFFFFF', border: '1px solid #D1D5DB', borderRadius: 999, fontSize: 12, fontWeight: 600, color: '#323130', cursor: loading || agent.providerAvailable === false ? 'not-allowed' : 'pointer', opacity: loading || agent.providerAvailable === false ? 0.55 : 1, whiteSpace: 'nowrap' }}`;
const buttonReplaceStr = `style={{ padding: '7px 10px', background: activeClassicAgentId === agent.id ? '#0F766E' : '#FFFFFF', border: '1px solid #D1D5DB', borderRadius: 999, fontSize: 12, fontWeight: 600, color: activeClassicAgentId === agent.id ? '#FFFFFF' : '#323130', cursor: loading || agent.providerAvailable === false ? 'not-allowed' : 'pointer', opacity: loading || agent.providerAvailable === false ? 0.55 : 1, whiteSpace: 'nowrap' }}`;

code = code.replace(buttonSearchStr, buttonReplaceStr);

// 5. placeholders
code = code.replace(
  /placeholder="שאל כל דבר — עריכה, ניסוח, מחקר, מקורות..."/,
  'placeholder={activeClassicAgent ? activeClassicAgent.placeholder : "שאל כל דבר — עריכה, ניסוח, מקורות..."}'
);

code = code.replace(
  /placeholder="💬 כתוב בחופשיות... @ לסוכנים, \/ לסקילים"/,
  'placeholder={activeClassicAgent ? activeClassicAgent.placeholder : "💬 כתוב בחופשיות... @ לסוכנים, / לסקילים"}'
);

// 6. badge UI
const inputSectionMatch = "<div style={{ padding: '6px 12px 2px', color: '#605E5C', fontSize: '0.74rem', textAlign: 'center', borderTop: '1px solid #EDEBE9', background: '#FAF9F8', margin: '0 -12px 8px' }}>";
const inputSectionReplace = `{activeClassicAgent && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: '#F0FDFA', border: '1px solid #0D9488', borderRadius: 8, margin: '8px 0', color: '#0F766E', fontSize: 13, fontWeight: 600 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✅ סוכן פעיל: {activeClassicAgent.label}
                </div>
                <button type="button" onClick={() => setActiveClassicAgentId(null)} style={{ background: 'transparent', border: 'none', color: '#0F766E', cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
            )}
              <div style={{ padding: '6px 12px 2px', color: '#605E5C', fontSize: '0.74rem', textAlign: 'center', borderTop: '1px solid #EDEBE9', background: '#FAF9F8', margin: '0 -12px 8px' }}>`;

code = code.replace(inputSectionMatch, inputSectionReplace);

fs.writeFileSync('src/AiSidebar.jsx', code);
console.log('Done cleanly patching!');