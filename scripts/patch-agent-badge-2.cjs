const fs = require('fs');
let content = fs.readFileSync('src/AiSidebar.jsx', 'utf8');

const targetStr = "<div style={{ padding: '6px 12px 2px', color: '#605E5C', fontSize: '0.74rem', textAlign: 'center', borderTop: '1px solid #EDEBE9', background: '#FAF9F8', margin: '0 -12px 8px' }}>";

const badgeHtml = `{activeClassicAgent && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: '#F0FDFA', border: '1px solid #0D9488', borderRadius: 8, margin: '8px 0', color: '#0F766E', fontSize: 13, fontWeight: 600 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                ✅ סוכן פעיל: {activeClassicAgent.label}
              </div>
              <button onClick={() => setActiveClassicAgentId(null)} style={{ background: 'transparent', border: 'none', color: '#0F766E', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
          )}\n              ` + targetStr;

content = content.replace(targetStr, badgeHtml);
fs.writeFileSync('src/AiSidebar.jsx', content);
console.log('Badge injected');
