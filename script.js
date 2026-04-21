const fs = require('fs');
let css = fs.readFileSync('tailwind.css', 'utf8');

css = css.replace(
  'body { font-family: \'Segoe UI\', Tahoma, Geneva, Verdana, sans-serif; background-color: var(--page-bg); margin: 0; display: flex; height: 100vh; overflow: hidden; flex-direction: column; color: var(--text-color); }',
  'body { font-family: system-ui, -apple-system, sans-serif; background: linear-gradient(135deg, color-mix(in srgb, var(--page-bg) 60%, white) 0%, color-mix(in srgb, var(--page-bg) 95%, black) 100%); margin: 0; display: flex; height: 100vh; overflow: hidden; flex-direction: column; color: var(--text-color); }'
);

css = css.replace(
  '#top-bar { background-color: var(--word-blue); color: white; height: 48px; display: flex; align-items: center; justify-content: space-between; padding: 0 1rem; font-size: 0.9rem; flex-shrink: 0; }',
  '#top-bar { background: color-mix(in srgb, var(--word-blue) 85%, transparent); backdrop-filter: blur(12px); color: white; height: 50px; display: flex; align-items: center; justify-content: space-between; padding: 0 1.5rem; font-size: 0.9rem; flex-shrink: 0; border-bottom: 1px solid rgba(255,255,255,0.1); z-index: 50; }'
);

css = css.replace(
  '.top-search { background: rgba(255,255,255,0.2); border-radius: 4px; padding: 4px 12px; width: 400px; display: flex; align-items: center; gap: 8px; }',
  '.top-search { background: rgba(255,255,255,0.15); border-radius: 999px; padding: 6px 16px; width: 400px; display: flex; align-items: center; gap: 8px; }'
);

css = css.replace(
  '#ribbon-container { background-color: var(--ribbon-bg); border-bottom: 1px solid var(--ribbon-border); display: flex; flex-direction: column; z-index: 20; flex-shrink: 0; }',
  '#ribbon-container { background: color-mix(in srgb, var(--ribbon-bg) 60%, transparent); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(0,0,0,0.05); display: flex; flex-direction: column; z-index: 20; flex-shrink: 0; box-shadow: 0 4px 20px rgba(0,0,0,0.03); }'
);

css = css.replace(
  '.tab-btn { padding: 6px 16px; cursor: pointer; font-size: 0.85rem; border: none; background: transparent; color: var(--text-color); border-bottom: 2px solid transparent; white-space: nowrap; }',
  '.tab-btn { padding: 8px 20px; cursor: pointer; font-size: 0.85rem; font-weight: 500; border: none; background: transparent; color: var(--text-color); border-radius: 8px 8px 0 0; margin-right: 4px; transition: all 0.2s ease; white-space: nowrap; }'
);

css = css.replace(
  '#taskpane { width: 376px; background-color: transparent; border-right: none; display: flex; flex-direction: column; box-shadow: none; z-index: 10; flex-shrink: 0; padding: 0 8px 0 0; }',
  '#taskpane { width: 380px; background: rgba(255,255,255,0.4); backdrop-filter: blur(24px); border-left: 1px solid rgba(255,255,255,0.4); display: flex; flex-direction: column; box-shadow: -8px 0 24px rgba(0,0,0,0.02); z-index: 10; flex-shrink: 0; padding: 0; }'
);

css += '\n\n/* Modern Overrides */\n.tp-card { background: rgba(255,255,255,0.7); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.4); border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.02); }\n.tp-card:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,0,0,0.04); }\n#file-menu { background: rgba(248,250,252,0.95); backdrop-filter: blur(24px); border-top: 1px solid rgba(255,255,255,0.2); }\n.file-sidebar { box-shadow: 4px 0 24px rgba(0,0,0,0.1); border-radius: 0; }\n.action-card { border-radius: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.02); border-color: transparent; }\n#editor-wrapper { background: transparent !important; }\n.page-surface { border-radius: 12px; box-shadow: 0 12px 30px rgba(0,0,0,0.05); border: 1px solid rgba(255,255,255,0.6) !important; }\n.r-btn { border-radius: 10px; }\n.r-btn.is-active { border-radius: 10px; }\n.r-select { border-radius: 6px; }\n';

fs.writeFileSync('tailwind.css', css);
console.log('CSS transformed seamlessly!');
