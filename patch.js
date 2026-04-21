const fs = require('fs');
let code = fs.readFileSync('src/StartScreen.jsx', 'utf8');

// 1. Add states
const statesBlock = `
  const fileInputRef = useRef(null);
  const instructionFileInputRef = useRef(null);
  const [instructions, setInstructions] = useState(() => (typeof getHomeInstructions === 'function' ? getHomeInstructions() : ''));
  const [materials, setMaterials] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [instructionFileName, setInstructionFileName] = useState('');
  const [loadedWorkspace, setLoadedWorkspace] = useState(null);
  const [uploadKind, setUploadKind] = useState('general');

  useEffect(() => {
    if (typeof loadProjectMaterials === 'function') loadProjectMaterials().then(setMaterials).catch(()=>null);
    if (typeof getWorkspaceAutomation === 'function') {
      const auto = getWorkspaceAutomation();
      if (auto?.enabled) setLoadedWorkspace(auto);
    }
  }, []);

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const selectedUploadMeta = typeof getMaterialUploadMeta === 'function' ? getMaterialUploadMeta(uploadKind) : { id: uploadKind };
      const uploadedIds = [];
      for (const file of files) {
        if (typeof saveHelperMaterial === 'function') {
          const result = await saveHelperMaterial(file, selectedUploadMeta);
          if (result?.entry?.id) uploadedIds.push(result.entry.id);
        }
      }
      if (typeof loadProjectMaterials === 'function') {
        const mats = await loadProjectMaterials();
        setMaterials(mats);
      }
      if (uploadedIds.length) {
        setSelectedIds((prev) => Array.from(new Set([...prev, ...uploadedIds])));
      }
    } catch(e) { console.error(e); } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleInstructionFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      let extracted = '';
      if (typeof readInstructionFile === 'function') extracted = await readInstructionFile(file);
      if (!String(extracted || '').trim()) {
        window.alert('לא הצלחתי לקרוא תוכן מתוך קובץ ההנחיות.');
        return;
      }
      const labeledText = 'קובץ הנחיות: ' + file.name + '\\n' + String(extracted).trim();
      const nextInstructions = instructions.trim() ? instructions.trim() + '\\n\\n---\\n' + labeledText : labeledText;
      setInstructions(nextInstructions);
      setInstructionFileName(file.name);
    } catch (error) {
      console.error(error);
    } finally {
      event.target.value = '';
    }
  };

  const handleLoadWorkspace = () => {
    if (typeof getWorkspaceAutomation !== 'function' || typeof getOrderedRoleAgents !== 'function') return;
    const automation = getWorkspaceAutomation();
    const agents = getOrderedRoleAgents(automation.workflowMode);
    if (!automation?.enabled) {
      window.alert('צריך קודם להפעיל את סביבת הסוכנים במסך ההגדרות.');
      return;
    }
    setLoadedWorkspace({ ...automation, agents });
  };
`;
code = code.replace(/const profile = getPersonalStyleProfile\(\);/, 'const profile = getPersonalStyleProfile();\n' + statesBlock);

// 2. Update Generate wrapper to include materials
const generateFunc = `
  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    try {
      if (typeof onGenerateFromPrompt === 'function') {
        await onGenerateFromPrompt({
          prompt,
          templateId: selectedTemplate,
          instructions: instructions.trim(),
          selectedMaterials: materials.filter(m => selectedIds.includes(m.id)),
          documentStyle
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };
`;
code = code.replace(/const handleGenerate = async \(\) => \{[\s\S]*?setIsGenerating\(false\);\n    \}\n  \};/, generateFunc.trim());

// 3. Inject UI
const uiBlock = `
            {/* Advance Options Area */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-6">
               <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
                 <div className="text-white/80 font-medium whitespace-nowrap">✨ חומרי עזר והנחיות</div>
                 <div className="flex flex-wrap items-center gap-2 justify-end w-full">
                   <button onClick={handleLoadWorkspace} className="px-3 py-2 bg-indigo-500/30 hover:bg-indigo-500/50 border border-indigo-400/30 rounded-xl text-white text-xs transition-all shadow-sm">
                     טען סביבת עבודה
                   </button>
                   <button onClick={() => instructionFileInputRef.current?.click()} className="px-3 py-2 bg-emerald-500/30 hover:bg-emerald-500/50 border border-emerald-400/30 rounded-xl text-white text-xs transition-all shadow-sm">
                     קובץ הנחיות
                   </button>
                   <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 bg-blue-500/30 hover:bg-blue-500/50 border border-blue-400/30 rounded-xl text-white text-xs transition-all shadow-sm">
                     {uploading ? 'מעלה...' : 'הוסף מסמכי עזר'}
                   </button>
                   <input ref={instructionFileInputRef} type="file" accept=".txt,.md,.markdown,.html,.htm,.json,.pdf" className="hidden" onChange={handleInstructionFileUpload} />
                   <input ref={fileInputRef} type="file" multiple accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.markdown,.html,.htm,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleUpload} />
                 </div>
               </div>
               
               <div className="grid md:grid-cols-2 gap-4 text-right">
                 <div>
                   <textarea
                     value={instructions}
                     onChange={(e) => setInstructions(e.target.value)}
                     placeholder="הנחיות קצרות למסמך המסוים הזה... (למשל: סגנון אקדמי, פסקאות קצרות)"
                     className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-sm outline-none focus:ring-1 focus:ring-pink-400 focus:border-transparent resize-y min-h-[90px] h-full"
                   />
                 </div>
                 <div className="bg-white/5 border border-white/10 rounded-xl p-3 min-h-[90px] max-h-[140px] overflow-y-auto">
                   {materials.length === 0 ? (
                     <div className="text-white/40 text-[11px] text-center mt-4">בחר 'הוסף מסמכי עזר' כדי לבסס את הצ'אט עליהם.</div>
                   ) : (
                     materials.map(item => (
                       <label key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg mb-1 cursor-pointer transition-colors">
                         <div className="flex items-center gap-2 overflow-hidden w-[85%]">
                           <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={e => setSelectedIds(prev => e.target.checked ? [...prev, item.id] : prev.filter(id => id !== item.id))} className="checkbox checkbox-xs border-indigo-300 rounded bg-white/20" />
                           <span className="text-white/90 text-xs truncate leading-tight w-full" title={item.title}>{item.title}</span>
                         </div>
                         <span className="text-white/50 text-[9px] whitespace-nowrap border border-white/20 bg-white/5 px-2 py-0.5 rounded">{item.label || 'כללי'}</span>
                       </label>
                     ))
                   )}
                 </div>
               </div>
               
               {loadedWorkspace && (
                 <div className="mt-4 p-3 bg-amber-500/20 border border-amber-400/30 rounded-xl text-right">
                   <div className="text-amber-100 text-sm font-semibold mb-1">סביבת העבודה שנטענה</div>
                   <div className="text-amber-200/80 text-xs">{loadedWorkspace.workflow}</div>
                   <div className="text-amber-200/60 text-[10px] mt-1">{loadedWorkspace.agents?.join(' • ')}</div>
                 </div>
               )}
            </div>
            
            {/* Quick Actions */}
`;
code = code.replace(/\{\/\* Quick Actions \*\/\}/, uiBlock.trim());

fs.writeFileSync('src/StartScreen.jsx', code);
console.log('Success - StartScreen Patcher completed.');
