const fs = require('fs');
let content = fs.readFileSync('src/AiSidebar.jsx', 'utf8');

// 1. Add activeClassicAgentId state
if (!content.includes('const [activeClassicAgentId,')) {
    content = content.replace(
      'const [agentProgressMap, setAgentProgressMap] = useState({});',
      'const [agentProgressMap, setAgentProgressMap] = useState({});\n    const [activeClassicAgentId, setActiveClassicAgentId] = useState(null);'
    );
}

// 2. Replace runClassicTaskpaneAgent mapping in send()
const customSendInsert = `
      const cAgent = activeClassicAgentId ? AGENTS_CONFIG[activeClassicAgentId] : null;
      let finalExtraSystemPrompt = extraSystemPrompt;
      let finalProviderId = selectedProviderId;
      let finalProviderModel = selectedProviderModel;
      
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

// Look for 'const bypassFixedAgentSelection ='
if (!content.includes('const cAgent = activeClassicAgentId ? AGENTS_CONFIG')) {
    content = content.replace(
      'const bypassFixedAgentSelection = runtimeOptions.bypassFixedAgentSelection === true;',
      customSendInsert.trim() + '\n      const bypassFixedAgentSelection = runtimeOptions.bypassFixedAgentSelection === true;'
    );
}

// Update the provider Config logic
content = content.replace(
  'const providerConfig = getProviderConfig(selectedProviderId) || { providerId: \'default\' };',
  ''
);

content = content.replace(
  'providerConfig: providerConfig,',
  'providerConfig: configuredProvider,'
);

// inside chatWithActiveProvider call
content = content.replace(
  'const aiResponse = await chatWithActiveProvider(selectedProviderId,',
  'const aiResponse = await chatWithActiveProvider(finalProviderId,'
);
content = content.replace(
  'providerModel: selectedProviderModel,',
  'providerModel: finalProviderModel,'
);
content = content.replace(
  'extraSystemPrompt: extraSystemPrompt,',
  'extraSystemPrompt: finalExtraSystemPrompt,'
);

// 3. update runClassicTaskpaneAgent -> toggleClassicTaskpaneAgent
const regexRun = /const runClassicTaskpaneAgent = \(agentId\) => \{[\s\S]*?pendingMentionSelectionRef\.current \= \{[\s\S]*?preservePendingMentionRef\.current \= true;[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?\}\,\s*50\);[\s\S]*?\};/m;
const toggleLogic = `const toggleClassicTaskpaneAgent = (agentId) => {
      setActiveClassicAgentId(prev => prev === agentId ? null : agentId);
    };

    const activeClassicAgent = activeClassicAgentId ? AGENTS_CONFIG[activeClassicAgentId] : null;`;
    
content = content.replace(regexRun, toggleLogic);

// 4. Update the buttons in the UI
content = content.replace(/onClick=\{\(\) => runClassicTaskpaneAgent\(agent\.id\)\}/g, 'onClick={() => toggleClassicTaskpaneAgent(agent.id)}');

// Update button styling
const buttonStyleRegex = /style=\{\{\s*padding:\s*'7px 10px'(?:[\s\S]*?)whiteSpace:\s*'nowrap'\s*\}\}/g;
const newButtonStyle = `style={{ padding: '7px 10px', background: activeClassicAgentId === agent.id ? '#0F766E' : '#FFFFFF', border: '1px solid #D1D5DB', borderRadius: 999, fontSize: 12, fontWeight: 600, color: activeClassicAgentId === agent.id ? '#FFFFFF' : '#323130', cursor: loading || agent.providerAvailable === false ? 'not-allowed' : 'pointer', opacity: loading || agent.providerAvailable === false ? 0.55 : 1, whiteSpace: 'nowrap' }}`;
content = content.replace(buttonStyleRegex, newButtonStyle);

// 5. Update input placeholder
const fallbackPlaceholderStr = "placeholder=\"💬 כתוב בחופשיות... @ לסוכנים, / לסקילים\"";
const activePlaceholderStr = "placeholder={activeClassicAgent ? activeClassicAgent.placeholder : \"💬 כתוב בחופשיות... @ לסוכנים, / לסקילים\"}";
content = content.replace(fallbackPlaceholderStr, activePlaceholderStr);

const secondaryFallbackPlaceholderStr = "placeholder=\"שאל כל דבר — עריכה, ניסוח, מחקר, מקורות...\"";
const activeSecondaryPlaceholderStr = "placeholder={activeClassicAgent ? activeClassicAgent.placeholder : \"שאל כל דבר — עריכה, ניסוח, מקורות...\"}";
content = content.replace(secondaryFallbackPlaceholderStr, activeSecondaryPlaceholderStr);

fs.writeFileSync('src/AiSidebar.jsx', content);
console.log('Done mapping UI state to AiSidebar.jsx');