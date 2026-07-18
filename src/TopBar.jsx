import React from 'react';
import { getTheme, toggleTheme, onThemeChange } from './theme';
import { isDesktopApp } from './platform';

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
  onOpenSearch = () => {},
  onFocus = () => {},
  onOpenDraftRecommendations = () => {},
  draftRecommendationsDisabled = false,
  onCheckStyle = () => {},
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
  onCloudPull = () => {},
  onCloudSignOut = () => {},
  documentTitle = '',
  startScreenActive = false,
  onOpenSettings = () => {},
}) {
  const isSpssMode = appMode === 'spss';
  const isPresentationsMode = appMode === 'presentation';
  const isWordMode = appMode === 'word';
  const [theme, setThemeState] = React.useState(getTheme);
  React.useEffect(() => onThemeChange(setThemeState), []);
  const cloudInitials = String(cloudUser?.displayName || cloudUser?.email || 'CL')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'CL';
  const quickBtn = (icon, title, action, disabled = false, extraClass = '') => (
    <button
      onClick={action}
      title={title}
      disabled={disabled}
      className={`h-8 min-w-8 rounded-full items-center justify-center transition ${extraClass || 'flex'} ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/20'}`}
    >
      <i className={`${icon} text-[18px] text-amber-100`}></i>
    </button>
  );
  const modeBtn = (mode, label) => (
    <button
      type="button"
      onClick={() => onModeChange(mode)}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${appMode === mode ? 'bg-white text-chrome shadow-sm' : 'text-white/85 hover:bg-white/20'}`}
    >
      {label}
    </button>
  );

  return (
    <header className="bg-chrome text-white min-h-12 flex flex-wrap items-center justify-start px-3 py-2 text-sm shrink-0 w-full gap-2 sm:px-4 lg:flex-nowrap">
      <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-none lg:flex-nowrap">
        {quickBtn('ph ph-house', 'בית', onHome)}
        {isWordMode && (
          <>
            {quickBtn('ph ph-folder-open', 'פתח מהמחשב', onOpen, false, 'hidden sm:flex')}
            {quickBtn('ph ph-file-plus', 'חדש', onNew, false, 'hidden sm:flex')}
            {quickBtn('ph ph-plus-square', 'חלון חדש', onNewWindow, newWindowDisabled, 'hidden sm:flex')}
            {quickBtn('ph ph-floppy-disk', 'שמור', onSave)}
            {quickBtn('ph ph-floppy-disk-back', 'שמור בשם', onSaveAs, false, 'hidden sm:flex')}
            {quickBtn('ph ph-arrow-counter-clockwise', 'בטל', onUndo, false, 'hidden sm:flex')}
            {quickBtn('ph ph-arrow-clockwise', 'בצע שוב', onRedo, false, 'hidden sm:flex')}
            {quickBtn('ph ph-list-checks', 'המלצות לטיוטה', onOpenDraftRecommendations, draftRecommendationsDisabled, 'hidden sm:flex')}
            {quickBtn('ph ph-magnifying-glass', 'בדיקת סגנון (נשמע כמו AI?)', onCheckStyle, false, 'hidden sm:flex')}
            <div className="mx-1 hidden h-6 w-px bg-white/30 sm:block"></div>
          </>
        )}
        {!isWordMode && quickBtn('ph ph-gear', 'הגדרות', onOpenSettings)}
        <button onClick={onFocus} title="מצב מיקוד" className="hidden h-8 w-8 rounded-full hover:bg-white/20 sm:flex items-center justify-center transition">
          <i className="ph ph-arrows-out-simple text-lg text-amber-100"></i>
        </button>
        <div className="hidden lg:flex items-center gap-1 rounded-full bg-white/10 p-1 mr-1">
          {modeBtn('word', 'Word')}
          {modeBtn('spss', 'SPSS AI')}
          {modeBtn('spss-project', 'עבודת SPSS')}
          {modeBtn('presentation', 'מצגות')}
        </div>
        <i className={`${isSpssMode ? 'ph-fill ph-chart-scatter' : isPresentationsMode ? 'ph-fill ph-presentation-chart' : 'ph-fill ph-file-word'} text-2xl ml-1`}></i>
        <span className="truncate max-w-[7rem] sm:max-w-[12rem] xl:max-w-[16rem]">{isSpssMode ? 'SPSS AI' : isPresentationsMode ? 'Presentation Studio' : `${documentTitle || 'מסמך חדש'} - Word`}</span>
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
        <div className="flex w-auto min-w-0 flex-wrap items-center gap-2 sm:w-full lg:w-auto lg:min-w-[260px] lg:max-w-[560px] lg:flex-1 lg:flex-nowrap">
          {isWordMode && !startScreenActive && (
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
              <span className="hidden sm:inline">{assignmentBriefOpen ? 'הסתר הוראות' : (assignmentBriefAvailable ? 'הוראות המטלה' : 'הוסף הוראות')}</span>
            </button>
          )}
          {!startScreenActive && (
            <div className="hidden md:flex bg-white/20 rounded px-3 py-1 w-full md:w-[320px] lg:w-full flex items-center gap-2">
              <i className="ph ph-magnifying-glass"></i>
              <input
                type="text"
                placeholder="חיפוש והחלפה (Ctrl+F)"
                readOnly
                onFocus={onOpenSearch}
                onClick={onOpenSearch}
                className="bg-transparent border-none text-white outline-none w-full placeholder-white/70 font-[inherit] cursor-pointer"
              />
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 lg:flex-nowrap lg:shrink-0">
        <button
          type="button"
          onClick={() => toggleTheme()}
          title={theme === 'dark' ? 'עבור למצב בהיר' : 'עבור למצב כהה'}
          aria-label="החלפת ערכת נושא (בהיר/כהה)"
          className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/20"
        >
          <i className={`ph ${theme === 'dark' ? 'ph-sun' : 'ph-moon'} text-lg text-amber-100`}></i>
        </button>
        <div className="hidden sm:flex lg:hidden items-center gap-1 rounded-full bg-white/10 p-1">
          {modeBtn('word', 'Word')}
          {modeBtn('spss', 'SPSS AI')}
          {modeBtn('spss-project', 'עבודת SPSS')}
          {modeBtn('presentation', 'מצגות')}
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
                  <span className="hidden sm:inline">{cloudBusy ? 'מסנכרן...' : 'העלה לענן'}</span>
                </button>
                <button
                  type="button"
                  onClick={onCloudPull}
                  disabled={cloudBusy}
                  title="משוך הגדרות ומפתחות API מהענן (למכשיר הזה)"
                  className={`hidden sm:flex items-center gap-2 rounded-full border px-3 py-1.5 transition text-xs font-semibold ${
                    cloudBusy
                      ? 'border-emerald-200/40 bg-emerald-100/10 text-white/70 cursor-wait'
                      : 'border-emerald-200/60 bg-emerald-300/15 text-white hover:bg-emerald-300/25'
                  }`}
                >
                  <i className="ph ph-cloud-arrow-down text-base"></i>
                  <span>משוך מהענן</span>
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
                <span className="hidden sm:inline">התחבר עם Google</span>
              </button>
            )}
            <div className="hidden xl:flex max-w-[18rem] items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[11px] font-semibold text-white/80">
              <i className="ph ph-cloud text-sm"></i>
              <span className="truncate">{cloudStatusLabel || 'Firebase לא מחובר'}</span>
            </div>
          </>
        )}
        {isWordMode && isDesktopApp() && (
          <>
            <button
              onClick={onOpenUpdates}
              title="בדוק אם יש עדכון"
              className="hidden sm:flex items-center gap-2 rounded-full border border-white/30 px-3 py-1.5 hover:bg-white/20 transition text-xs font-semibold"
            >
              <i className="ph ph-arrow-circle-up text-base"></i>
              <span className="hidden sm:inline">עדכונים</span>
            </button>
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
