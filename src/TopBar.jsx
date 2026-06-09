import React from 'react';

export default function TopBar({
  onSave = () => {},
  onSaveAs = () => {},
  onOpen = () => {},
  onNew = () => {},
  onNewWindow = () => {},
  newWindowDisabled = false,
  onUndo = () => {},
  onRedo = () => {},
  onHome = () => {},
  onOpenUpdates = () => {},
  onFocus = () => {},
  onOpenDraftRecommendations = () => {},
  draftRecommendationsDisabled = false,
  onToggleAssignmentBrief = () => {},
  assignmentBriefAvailable = false,
  assignmentBriefOpen = false,
  appMode = 'word',
  onModeChange = () => {},
  cloudAvailable = false,
  cloudUser = null,
  cloudStatusLabel = '',
  cloudBusy = false,
  onCloudSignIn = () => {},
  onCloudSave = () => {},
  onCloudSignOut = () => {},
}) {
  const isSpssMode = appMode === 'spss';
  const isPresentationsMode = appMode === 'presentations';
  const isWordMode = appMode === 'word';
  const cloudInitials = String(cloudUser?.displayName || cloudUser?.email || 'CL')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'CL';
  const quickBtn = (icon, title, action, disabled = false) => (
    <button
      onClick={action}
      title={title}
      disabled={disabled}
      className={`h-8 min-w-8 rounded-full flex items-center justify-center transition ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/20'}`}
    >
      <i className={`${icon} text-[18px] text-amber-100`}></i>
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
    <header className="bg-[#2B579A] text-white min-h-12 flex flex-wrap items-center justify-between px-3 py-2 text-sm shrink-0 w-full gap-2 sm:px-4">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {quickBtn('ph ph-house', 'בית', onHome)}
        {isWordMode && (
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
          <i className="ph ph-arrows-out-simple text-lg text-amber-100"></i>
        </button>
        <div className="hidden lg:flex items-center gap-1 rounded-full bg-white/10 p-1 mr-1">
          {modeBtn('word', 'Word')}
          {modeBtn('presentations', 'מצגות')}
          {modeBtn('spss', 'SPSS AI')}
        </div>
        <i className={`${isSpssMode ? 'ph-fill ph-chart-scatter' : isPresentationsMode ? 'ph-fill ph-presentation-chart' : 'ph-fill ph-file-word'} text-2xl ml-1`}></i>
        <span className="truncate max-w-full">{isSpssMode ? 'SPSS Syntax Studio' : isPresentationsMode ? 'Presentation Studio' : 'מסמך 1 - Word'}</span>
      </div>
      {isSpssMode ? (
        <div className="hidden min-w-0 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 md:flex">
          <i className="ph ph-shield-check text-base"></i>
          <span className="truncate">SPSS mode פעיל · רק metadata טוקניזי נשלח</span>
        </div>
      ) : isPresentationsMode ? (
        <div className="hidden min-w-0 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 md:flex">
          <i className="ph ph-sparkle text-base"></i>
          <span className="truncate">מצב מצגות פעיל · בריף, ויזואליה, תמונות וסיפור הצגה</span>
        </div>
      ) : (
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-nowrap lg:justify-center">
          {isWordMode && (
            <button
              type="button"
              onClick={onToggleAssignmentBrief}
              title={assignmentBriefAvailable ? 'הצג או הסתר את הוראות המטלה' : 'פתח את חלונית הוראות המטלה כדי להוסיף ידנית או לטעון קובץ'}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                assignmentBriefOpen
                  ? 'border-amber-200 bg-amber-50 text-[#7a3e00]'
                  : assignmentBriefAvailable
                    ? 'border-white/30 bg-white/12 text-white hover:bg-white/20'
                    : 'border-white/20 bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <i className={`ph ${assignmentBriefOpen ? 'ph-eye' : 'ph-notepad'} text-base`}></i>
              <span>{assignmentBriefOpen ? 'הסתר הוראות' : (assignmentBriefAvailable ? 'הוראות המטלה' : 'הוסף הוראות')}</span>
            </button>
          )}
          <div className="hidden md:flex bg-white/20 rounded px-3 py-1 w-full md:w-[320px] lg:w-[400px] md:max-w-[42vw] flex items-center gap-2">
            <i className="ph ph-magnifying-glass"></i>
            <input 
              type="text" 
              placeholder="חיפוש (Alt+Q)" 
              className="bg-transparent border-none text-white outline-none w-full placeholder-white/70 font-[inherit]"
            />
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
        <div className="flex lg:hidden items-center gap-1 rounded-full bg-white/10 p-1">
          {modeBtn('word', 'Word')}
          {modeBtn('presentations', 'מצגות')}
          {modeBtn('spss', 'SPSS')}
        </div>
        {isWordMode && cloudAvailable && (
          <>
            {cloudUser ? (
              <>
                <button
                  type="button"
                  onClick={onCloudSave}
                  disabled={cloudBusy}
                  title={cloudStatusLabel || 'סנכרן עכשיו את הפרופיל והמסמך לענן'}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition text-xs font-semibold ${
                    cloudBusy
                      ? 'border-sky-200/40 bg-sky-100/10 text-white/70 cursor-wait'
                      : 'border-sky-200/60 bg-sky-300/15 text-white hover:bg-sky-300/25'
                  }`}
                >
                  <i className={`ph ${cloudBusy ? 'ph-arrows-clockwise' : 'ph-cloud-arrow-up'} text-base`}></i>
                  <span>{cloudBusy ? 'מסנכרן...' : 'העלה לענן'}</span>
                </button>
                <button
                  type="button"
                  onClick={onCloudSignOut}
                  disabled={cloudBusy}
                  title="התנתק מחשבון Google"
                  className="hidden sm:flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:bg-white/15"
                >
                  <i className="ph ph-sign-out text-base"></i>
                  <span>התנתק</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onCloudSignIn}
                disabled={cloudBusy}
                title="התחבר עם Google כדי לשמור ב-Firebase"
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition text-xs font-semibold ${
                  cloudBusy
                    ? 'border-white/20 bg-white/10 text-white/70 cursor-wait'
                    : 'border-white/30 bg-white/12 text-white hover:bg-white/20'
                }`}
              >
                <i className="ph ph-google-logo text-base"></i>
                <span>התחבר עם Google</span>
              </button>
            )}
            <div className="hidden xl:flex max-w-[18rem] items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[11px] font-semibold text-white/80">
              <i className="ph ph-cloud text-sm"></i>
              <span className="truncate">{cloudStatusLabel || 'Firebase לא מחובר'}</span>
            </div>
          </>
        )}
        {isWordMode && (
          <>
            <button
              onClick={onOpenUpdates}
              title="בדוק אם יש עדכון"
              className="flex items-center gap-2 rounded-full border border-white/30 px-3 py-1.5 hover:bg-white/20 transition text-xs font-semibold"
            >
              <i className="ph ph-arrow-circle-up text-base"></i>
              <span className="hidden sm:inline">עדכונים</span>
            </button>
            <i className="hidden sm:inline ph-fill ph-megaphone text-lg"></i>
          </>
        )}
        {isSpssMode && (
          <div className="hidden items-center gap-2 rounded-full border border-white/25 px-3 py-1.5 text-xs font-semibold text-white/90 sm:flex">
            <i className="ph ph-chart-scatter text-base"></i>
            <span>מצב SPSS ברור ומצומצם</span>
          </div>
        )}
        {isPresentationsMode && (
          <div className="hidden items-center gap-2 rounded-full border border-white/25 px-3 py-1.5 text-xs font-semibold text-white/90 sm:flex">
            <i className="ph ph-presentation-chart text-base"></i>
            <span>סטודיו מצגות חזותי</span>
          </div>
        )}
        <div className="w-8 h-8 shrink-0 rounded-full bg-blue-400 flex items-center justify-center text-white font-bold" title={cloudUser?.email || 'משתמש מקומי'}>
          {cloudUser ? cloudInitials : 'RL'}
        </div>
      </div>
    </header>
  );
}
