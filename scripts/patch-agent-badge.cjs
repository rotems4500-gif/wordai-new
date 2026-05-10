const fs = require('fs');
let content = fs.readFileSync('src/AiSidebar.jsx', 'utf8');

// Also clear the activeClassicAgentId upon successful send (if we want to mimic one-shot, but WordAddIn didn't clear it until toggled off. Let's leave it as toggle-only).

// Add a visible indicator (badge) above the input
const inputSectionMatch = "<div style={{ position: 'sticky', bottom: 0, padding: 12, background: 'rgba(250, 249, 248, 0.9)', backdropFilter: 'blur(10px)', borderTop: '1px solid #EDEBE9', zIndex: 10 }}>";
const inputSectionReplacement = `<div style={{ position: 'sticky', bottom: 0, padding: 12, background: 'rgba(250, 249, 248, 0.9)', backdropFilter: 'blur(10px)', borderTop: '1px solid #EDEBE9', zIndex: 10 }}>
          {activeClassicAgent && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: '#E0F2FE', border: '1px solid #0D9488', borderRadius: 8, marginBottom: 8, color: '#0F766E', fontSize: 13, fontWeight: 600 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                ✅ סוכן פעיל: {activeClassicAgent.label}
              </div>
              <button onClick={() => setActiveClassicAgentId(null)} style={{ background: 'none', border: 'none', color: '#0F766E', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
          )}`;

if(!content.includes('✅ סוכן פעיל:')) {
  content = content.replace(inputSectionMatch, inputSectionReplacement);
}

fs.writeFileSync('src/AiSidebar.jsx', content);
console.log('UI Badge added');
