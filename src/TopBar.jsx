import React from 'react';

export default function TopBar({ onSave = () => {}, onSaveAs = () => {}, onOpen = () => {}, onNew = () => {}, onNewWindow = () => {}, newWindowDisabled = false, onUndo = () => {}, onRedo = () => {}, onHome = () => {}, onOpenUpdates = () => {}, onFocus = () => {}, onOpenDraftRecommendations = () => {}, draftRecommendationsDisabled = false, appMode = 'word', onModeChange = () => {} }) {
  const isSpssMode = appMode === 'spss';
  const quickBtn = (icon, title, action, disabled = false) => (
    <button
      onClick={action}
      title={title}
      disabled={disabled}
      className={`w-8 h-8 rounded-full flex items-center justify-center transition ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/20'}`}
    >
      <i className={icon}></i>
    </button>
  );
  const modeBtn = (mode, label) => (
    <button
      type="button"
      onClick={() => onModeChange(mode)}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${appMode === mode ? 'bg-white text-[#2B579A] shadow-sm' : 'text-white/85 hover:bg-white/20'}`}
    >
      {label}
    </button>
  );

  return (
    <header className="bg-[#2B579A] text-white h-12 flex items-center justify-between px-4 text-sm shrink-0 w-full gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {quickBtn('ph ph-house', 'בית', onHome)}
        {!isSpssMode && (
          <>
            {quickBtn('ph ph-folder-open', 'פתח מהמחשב', onOpen)}
            {quickBtn('ph ph-file-plus', 'חדש', onNew)}
            {quickBtn('ph ph-plus-square', 'חלון חדש', onNewWindow, newWindowDisabled)}
            {quickBtn('ph ph-floppy-disk', 'שמור', onSave)}
            {quickBtn('ph ph-floppy-disk-back', 'שמור בשם', onSaveAs)}
            {quickBtn('ph ph-arrow-counter-clockwise', 'בטל', onUndo)}
            {quickBtn('ph ph-arrow-clockwise', 'בצע שוב', onRedo)}
            {quickBtn('ph ph-list-checks', 'המלצות לטיוטה', onOpenDraftRecommendations, draftRecommendationsDisabled)}
            <div className="mx-1 h-6 w-px bg-white/30"></div>
          </>
        )}
        <button onClick={onFocus} title="מצב מיקוד" className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center transition">
          <i className="ph ph-arrows-out-simple text-lg"></i>
        </button>
        <div className="hidden lg:flex items-center gap-1 rounded-full bg-white/10 p-1 mr-1">
          {modeBtn('word', 'Word')}
          {modeBtn('spss', 'SPSS AI')}
        </div>
        <i className={`${isSpssMode ? 'ph-fill ph-chart-scatter' : 'ph-fill ph-file-word'} text-2xl ml-1`}></i>
        <span className="truncate">{isSpssMode ? 'SPSS Syntax Studio' : 'מסמך 1 - Word'}</span>
      </div>
      {isSpssMode ? (
        <div className="hidden min-w-0 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 md:flex">
          <i className="ph ph-shield-check text-base"></i>
          <span className="truncate">SPSS mode פעיל · רק metadata טוקניזי נשלח</span>
        </div>
      ) : (
        <div className="bg-white/20 rounded px-3 py-1 w-[400px] max-w-[40vw] flex items-center gap-2">
          <i className="ph ph-magnifying-glass"></i>
          <input 
            type="text" 
            placeholder="חיפוש (Alt+Q)" 
            className="bg-transparent border-none text-white outline-none w-full placeholder-white/70 font-[inherit]"
          />
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="flex lg:hidden items-center gap-1 rounded-full bg-white/10 p-1">
          {modeBtn('word', 'Word')}
          {modeBtn('spss', 'SPSS')}
        </div>
        {!isSpssMode && (
          <>
            <button
              onClick={onOpenUpdates}
              title="בדוק אם יש עדכון"
              className="flex items-center gap-2 rounded-full border border-white/30 px-3 py-1.5 hover:bg-white/20 transition text-xs font-semibold"
            >
              <i className="ph ph-arrow-circle-up text-base"></i>
              <span>עדכונים</span>
            </button>
            <i className="ph-fill ph-megaphone text-lg"></i>
          </>
        )}
        {isSpssMode && (
          <div className="hidden items-center gap-2 rounded-full border border-white/25 px-3 py-1.5 text-xs font-semibold text-white/90 sm:flex">
            <i className="ph ph-chart-scatter text-base"></i>
            <span>מצב SPSS ברור ומצומצם</span>
          </div>
        )}
        <div className="w-8 h-8 rounded-full bg-blue-400 flex items-center justify-center text-white font-bold">
          RL
        </div>
      </div>
    </header>
  );
}
