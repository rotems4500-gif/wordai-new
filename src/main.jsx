import React from 'react';
import ReactDOM from 'react-dom/client';
import '../tailwind.css';
import DocumentEditor from './DocumentEditor';
import Ribbon from './Ribbon';
import AiSidebar from './AiSidebar';
import TopBar from './TopBar';
import FileMenu from './FileMenu';
import MagicWand from './MagicWand';
import StartScreen from './StartScreen';
import OneAxisAirHockeyGame from './OneAxisAirHockeyGame';
import { AppStartupSplash, ConfettiCelebration, LiveGenerationMood } from './WordFlowAnimations';
import { getShortcutsConfig, getAssistantBehavior, getWordPreferences, saveWordPreferences, matchShortcut, getAgentDebugLogs, getLatestAgentRunSummary, getWorkspaceAutomation, getProviderConfig, getToolLinksConfig, buildExternalToolUrl, hydrateAppSettingsFromDisk, hydrateProviderConfigFromDisk, syncPersistedAppSettings, getPersonalStyleProfile, hasMeaningfulPersonalProfileData, getConfiguredProviderChoices, getOrderedRoleAgents, getRoleAgents, getProviderModelChoices, updateCurrentWorkspace } from './services/aiService';
import { buildTemplateSkeleton, generateDocumentFromPrompt, reviseDocumentWithFeedback, reviewDocumentRecommendations, saveDocumentHistory, learnFromDocumentDraft, saveHomeInstructions } from './services/workspaceLearningService';
import { downloadBrowserDocx } from './services/browserDocxExport';
import { COPYLEAKS_CLASSIFICATION_AI, COPYLEAKS_CLASSIFICATION_HUMAN, COPYLEAKS_HELP_LINES, COPYLEAKS_TEXT_MAX_CHARS, COPYLEAKS_TEXT_MIN_CHARS, detectCopyleaksText, getCopyleaksTextStats, getCopyleaksValidationMessage, normalizeCopyleaksConfig } from './services/copyleaksService';

const DOCUMENT_STYLE_PRESETS = {
  academic: { label: 'אקדמי', fontFamily: "'Frank Ruhl Libre', 'Times New Roman', serif", fontSize: '12pt', lineHeight: '1.9', padding: '2.8cm', maxWidth: '21cm', background: '#fffefc', textAlign: 'right' },
  legal: { label: 'משפטי', fontFamily: "'Times New Roman', 'Miriam Libre', serif", fontSize: '12.5pt', lineHeight: '2', padding: '2.6cm 2.9cm', maxWidth: '21cm', background: '#fffefe', textAlign: 'justify' },
  business: { label: 'עסקי', fontFamily: "'Segoe UI', 'Assistant', sans-serif", fontSize: '11.5pt', lineHeight: '1.65', padding: '2.4cm', maxWidth: '21cm', background: '#ffffff', textAlign: 'right' },
  presentation: { label: 'מצגת', fontFamily: "'Heebo', 'Segoe UI', sans-serif", fontSize: '15pt', lineHeight: '1.5', padding: '1.8cm', maxWidth: '25cm', background: 'linear-gradient(180deg,#ffffff 0%,#f8fbff 100%)', textAlign: 'center' },
};

const GENERATION_LABEL_FALLBACKS = {
  blank: 'מסמך חדש',
  academic: 'עבודה אקדמית',
  legal: 'מסמך משפטי',
  report: 'דוח מסודר',
  summary: 'סיכום נושא',
  office: 'מסמך משרדי',
  proposal: 'הצעה',
  letter: 'מכתב רשמי',
};

const MAGIC_WAND_SELECTION_CONTEXT_SIDE = 420;

const LIVE_GENERATION_SHELL_MARKER = 'data-wordai-live-generation-shell="true"';
const LIVE_GENERATION_ERROR_PLACEHOLDER_MARKER = 'data-wordai-live-generation-error-placeholder="true"';
const DOCUMENT_ARRIVAL_PULSE_DURATION_MS = 950;
const START_SCREEN_TRANSITION_DURATION_MS = 1800;
const START_SCREEN_TRANSITION_APPROACH_START = 76;
const START_SCREEN_TRANSITION_IMPACT_START = 82;
const START_SCREEN_TRANSITION_IMPACT_CENTER_X = '51%';
const START_SCREEN_TRANSITION_IMPACT_CENTER_Y = '52%';
const START_SCREEN_TRANSITION_IMPACT_START_MS = Math.round(
  START_SCREEN_TRANSITION_DURATION_MS * (START_SCREEN_TRANSITION_IMPACT_START / 100)
);
const START_SCREEN_TRANSITION_ROCKET_SCENE_WIDTH_PX = 240;
const START_SCREEN_TRANSITION_ROCKET_SCENE_HEIGHT_PX = 96;
const START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_X_PX = 228;
const START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_Y_PX = 44;
const START_SCREEN_TRANSITION_ROCKET_START_LEFT = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_X} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_X_PX}px - 75%)`;
const START_SCREEN_TRANSITION_ROCKET_START_TOP = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_Y} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_Y_PX}px + 6%)`;
const START_SCREEN_TRANSITION_ROCKET_MID_LEFT = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_X} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_X_PX}px - 47%)`;
const START_SCREEN_TRANSITION_ROCKET_MID_TOP = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_Y} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_Y_PX}px - 2%)`;
const START_SCREEN_TRANSITION_ROCKET_CRUISE_LEFT = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_X} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_X_PX}px - 23%)`;
const START_SCREEN_TRANSITION_ROCKET_CRUISE_TOP = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_Y} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_Y_PX}px - 12%)`;
const START_SCREEN_TRANSITION_ROCKET_IMPACT_LEFT = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_X} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_X_PX}px)`;
const START_SCREEN_TRANSITION_ROCKET_IMPACT_TOP = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_Y} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_Y_PX}px)`;
const START_SCREEN_TRANSITION_ROCKET_APPROACH_LEFT = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_X} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_X_PX + 76}px)`;
const START_SCREEN_TRANSITION_ROCKET_APPROACH_TOP = `calc(${START_SCREEN_TRANSITION_IMPACT_CENTER_Y} - ${START_SCREEN_TRANSITION_ROCKET_TIP_OFFSET_Y_PX + 72}px)`;
const getStartScreenTransitionDelayMs = (offsetMs = 0) => `${START_SCREEN_TRANSITION_IMPACT_START_MS + offsetMs}ms`;

const getPrefersReducedMotion = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const START_SCREEN_TRANSITION_PARTICLES = [
  { id: 'a', size: 14, left: '50%', top: '50%', angle: '-84deg', distance: '236px', delay: getStartScreenTransitionDelayMs(-22), color: '#FFFFFF' },
  { id: 'b', size: 12, left: '50%', top: '50%', angle: '-52deg', distance: '284px', delay: getStartScreenTransitionDelayMs(-6), color: '#FDE68A' },
  { id: 'c', size: 16, left: '50%', top: '50%', angle: '-18deg', distance: '328px', delay: getStartScreenTransitionDelayMs(6), color: '#FB7185' },
  { id: 'd', size: 13, left: '50%', top: '50%', angle: '18deg', distance: '344px', delay: getStartScreenTransitionDelayMs(18), color: '#FDBA74' },
  { id: 'e', size: 15, left: '50%', top: '50%', angle: '54deg', distance: '286px', delay: getStartScreenTransitionDelayMs(10), color: '#FFFFFF' },
  { id: 'f', size: 14, left: '50%', top: '50%', angle: '92deg', distance: '250px', delay: getStartScreenTransitionDelayMs(-2), color: '#FDBA74' },
  { id: 'g', size: 16, left: '50%', top: '50%', angle: '132deg', distance: '318px', delay: getStartScreenTransitionDelayMs(24), color: '#FDE68A' },
  { id: 'h', size: 13, left: '50%', top: '50%', angle: '174deg', distance: '360px', delay: getStartScreenTransitionDelayMs(32), color: '#F8FAFC' },
  { id: 'i', size: 12, left: '50%', top: '50%', angle: '214deg', distance: '274px', delay: getStartScreenTransitionDelayMs(4), color: '#FB7185' },
  { id: 'j', size: 11, left: '50%', top: '50%', angle: '248deg', distance: '312px', delay: getStartScreenTransitionDelayMs(40), color: '#FDBA74' },
  { id: 'k', size: 13, left: '50%', top: '50%', angle: '286deg', distance: '294px', delay: getStartScreenTransitionDelayMs(16), color: '#FFFFFF' },
  { id: 'l', size: 15, left: '50%', top: '50%', angle: '324deg', distance: '332px', delay: getStartScreenTransitionDelayMs(28), color: '#FDE68A' },
];

function StartScreenTransitionOverlay() {
  return (
    <div
      aria-hidden="true"
      className="wordai-start-transition"
      style={{
        '--wordai-start-transition-duration': `${START_SCREEN_TRANSITION_DURATION_MS}ms`,
        position: 'absolute',
        inset: 0,
        zIndex: 35,
        pointerEvents: 'none',
        overflow: 'hidden',
        isolation: 'isolate',
      }}
    >
      <style>{`
        @keyframes wordai-start-transition-backdrop {
          0% { opacity: 0; transform: scale(1.08); }
          8% { opacity: 1; }
          72% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.98); }
        }
        @keyframes wordai-start-transition-flight {
          0% { opacity: 0; left: ${START_SCREEN_TRANSITION_ROCKET_START_LEFT}; top: ${START_SCREEN_TRANSITION_ROCKET_START_TOP}; transform: rotate(-12deg) scale(0.72); }
          8% { opacity: 1; }
          34% { left: ${START_SCREEN_TRANSITION_ROCKET_MID_LEFT}; top: ${START_SCREEN_TRANSITION_ROCKET_MID_TOP}; transform: rotate(-15deg) scale(0.8); }
          58% { left: ${START_SCREEN_TRANSITION_ROCKET_CRUISE_LEFT}; top: ${START_SCREEN_TRANSITION_ROCKET_CRUISE_TOP}; transform: rotate(-10deg) scale(0.88); }
          ${START_SCREEN_TRANSITION_APPROACH_START}% { opacity: 1; left: ${START_SCREEN_TRANSITION_ROCKET_APPROACH_LEFT}; top: ${START_SCREEN_TRANSITION_ROCKET_APPROACH_TOP}; transform: rotate(8deg) scale(0.96); }
          ${START_SCREEN_TRANSITION_IMPACT_START}% { opacity: 0; left: ${START_SCREEN_TRANSITION_ROCKET_IMPACT_LEFT}; top: ${START_SCREEN_TRANSITION_ROCKET_IMPACT_TOP}; transform: rotate(12deg) scale(0.99); }
          100% { opacity: 0; left: ${START_SCREEN_TRANSITION_ROCKET_IMPACT_LEFT}; top: ${START_SCREEN_TRANSITION_ROCKET_IMPACT_TOP}; transform: rotate(12deg) scale(0.99); }
        }
        @keyframes wordai-start-transition-trail {
          0% { opacity: 0.3; transform: scaleX(0.72); }
          100% { opacity: 0.95; transform: scaleX(1); }
        }
        @keyframes wordai-start-transition-smoke {
          0% { opacity: 0.18; transform: translate(0, 0) scale(0.6); }
          100% { opacity: 0.62; transform: translate(-42px, 4px) scale(1.15); }
        }
        @keyframes wordai-start-transition-flash {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.18); }
          12% { opacity: 1; transform: translate(-50%, -50%) scale(0.8); }
          34% { opacity: 1; transform: translate(-50%, -50%) scale(1.52); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(3.8); }
        }
        @keyframes wordai-start-transition-burst {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.08); }
          18% { opacity: 1; }
          55% { opacity: 0.92; }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(2.55); }
        }
        @keyframes wordai-start-transition-ring {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.12); }
          10% { opacity: 0.98; }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(2.75); }
        }
        @keyframes wordai-start-transition-particle {
          0% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--particle-angle)) translateX(0px) scale(0.25); }
          14% { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--particle-angle)) translateX(var(--particle-distance)) scale(1.18); }
        }
        @keyframes wordai-start-transition-glow {
          0%, 54% { opacity: 0; transform: scale(0.84); }
          74% { opacity: 0.7; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.35); }
        }
        @keyframes wordai-start-transition-screen-flash {
          0% { opacity: 0; transform: scale(0.94); }
          24% { opacity: 0.88; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.04); }
        }
        @keyframes wordai-start-transition-heatwave {
          0% { opacity: 0; transform: scale(0.82); }
          28% { opacity: 0.7; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.18); }
        }
        @keyframes wordai-start-transition-shake {
          0% { transform: translate3d(0, 0, 0); }
          16% { transform: translate3d(-16px, 10px, 0) rotate(-0.5deg); }
          34% { transform: translate3d(14px, -10px, 0) rotate(0.45deg); }
          52% { transform: translate3d(-10px, 8px, 0) rotate(-0.3deg); }
          70% { transform: translate3d(8px, -6px, 0) rotate(0.2deg); }
          100% { transform: translate3d(0, 0, 0); }
        }
      `}</style>

      <div
        className="wordai-start-transition__backdrop"
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at ${START_SCREEN_TRANSITION_IMPACT_CENTER_X} ${START_SCREEN_TRANSITION_IMPACT_CENTER_Y}, rgba(255, 244, 214, 0.36) 0%, rgba(253, 186, 116, 0.26) 9%, rgba(251, 146, 60, 0.14) 18%, rgba(15, 23, 42, 0) 36%), linear-gradient(180deg, rgba(2, 6, 23, 0.08) 0%, rgba(2, 6, 23, 0.62) 100%)`,
          animation: 'wordai-start-transition-backdrop var(--wordai-start-transition-duration) cubic-bezier(0.22, 1, 0.36, 1) both',
        }}
      />

      <div
        className="wordai-start-transition__glow"
        style={{
          position: 'absolute',
          inset: '-24%',
          background: `radial-gradient(circle at ${START_SCREEN_TRANSITION_IMPACT_CENTER_X} ${START_SCREEN_TRANSITION_IMPACT_CENTER_Y}, rgba(255, 255, 255, 0.96) 0%, rgba(255, 244, 214, 0.9) 6%, rgba(253, 186, 116, 0.78) 12%, rgba(251, 146, 60, 0.3) 22%, rgba(255, 255, 255, 0) 40%)`,
          mixBlendMode: 'screen',
          animation: 'wordai-start-transition-glow var(--wordai-start-transition-duration) ease-out both',
        }}
      />

      <div
        className="wordai-start-transition__screen-flash"
        style={{
          position: 'absolute',
          inset: '-18%',
          background: `radial-gradient(circle at ${START_SCREEN_TRANSITION_IMPACT_CENTER_X} ${START_SCREEN_TRANSITION_IMPACT_CENTER_Y}, rgba(255,255,255,0.98) 0%, rgba(255,248,220,0.98) 8%, rgba(253,186,116,0.5) 18%, rgba(255,255,255,0) 40%), linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,248,220,0.08) 28%, rgba(255,255,255,0) 58%)`,
          mixBlendMode: 'screen',
          filter: 'blur(12px)',
          animation: `wordai-start-transition-screen-flash 320ms cubic-bezier(0.22, 1, 0.36, 1) ${getStartScreenTransitionDelayMs(-44)} both`,
        }}
      />

      <div
        className="wordai-start-transition__heatwave"
        style={{
          position: 'absolute',
          inset: '-24%',
          background: `radial-gradient(circle at ${START_SCREEN_TRANSITION_IMPACT_CENTER_X} ${START_SCREEN_TRANSITION_IMPACT_CENTER_Y}, rgba(255,255,255,0.82) 0%, rgba(253,186,116,0.56) 12%, rgba(251,146,60,0.26) 24%, rgba(255,255,255,0) 46%)`,
          mixBlendMode: 'screen',
          filter: 'blur(26px)',
          animation: `wordai-start-transition-heatwave 560ms cubic-bezier(0.16, 1, 0.3, 1) ${getStartScreenTransitionDelayMs(-4)} both`,
        }}
      />

      <div
        className="wordai-start-transition__rocket-wrap"
        style={{
          position: 'absolute',
          left: START_SCREEN_TRANSITION_ROCKET_START_LEFT,
          top: START_SCREEN_TRANSITION_ROCKET_START_TOP,
          width: `${START_SCREEN_TRANSITION_ROCKET_SCENE_WIDTH_PX}px`,
          height: `${START_SCREEN_TRANSITION_ROCKET_SCENE_HEIGHT_PX}px`,
          animation: 'wordai-start-transition-flight var(--wordai-start-transition-duration) cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        <div
          className="wordai-start-transition__rocket-scene"
          style={{
            position: 'relative',
            width: `${START_SCREEN_TRANSITION_ROCKET_SCENE_WIDTH_PX}px`,
            height: `${START_SCREEN_TRANSITION_ROCKET_SCENE_HEIGHT_PX}px`,
          }}
        >
          <div
            className="wordai-start-transition__trail"
            style={{
              position: 'absolute',
              right: '72px',
              top: '42px',
              width: '180px',
              height: '14px',
              borderRadius: '999px',
              background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.12), rgba(251,146,60,0.76), rgba(254,240,138,0.98))',
              filter: 'blur(7px)',
              transformOrigin: 'right center',
              animation: 'wordai-start-transition-trail 150ms ease-in-out infinite alternate',
            }}
          />
          <div
            className="wordai-start-transition__trail-hot"
            style={{
              position: 'absolute',
              right: '86px',
              top: '45px',
              width: '132px',
              height: '8px',
              borderRadius: '999px',
              background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.14), rgba(254,240,138,0.92), rgba(255,255,255,1))',
              filter: 'blur(4px)',
              transformOrigin: 'right center',
              animation: 'wordai-start-transition-trail 120ms ease-in-out infinite alternate-reverse',
            }}
          />
          <span
            style={{
              position: 'absolute',
              right: '182px',
              top: '32px',
              width: '36px',
              height: '36px',
              borderRadius: '999px',
              background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.32) 30%, rgba(255,255,255,0) 72%)',
              filter: 'blur(2px)',
              animation: 'wordai-start-transition-smoke 460ms ease-out infinite alternate',
            }}
          />
          <span
            style={{
              position: 'absolute',
              right: '208px',
              top: '40px',
              width: '52px',
              height: '52px',
              borderRadius: '999px',
              background: 'radial-gradient(circle, rgba(255,255,255,0.62) 0%, rgba(226,232,240,0.22) 40%, rgba(255,255,255,0) 76%)',
              filter: 'blur(4px)',
              animation: 'wordai-start-transition-smoke 620ms ease-out infinite alternate-reverse',
            }}
          />

          <svg
            viewBox="0 0 140 76"
            style={{
              position: 'absolute',
              right: '0',
              top: '6px',
              width: '140px',
              height: '76px',
              overflow: 'visible',
              filter: 'drop-shadow(0 10px 26px rgba(15, 23, 42, 0.34))',
            }}
          >
            <defs>
              <linearGradient id="wordai-start-transition-rocket-body" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#F8FAFC" />
                <stop offset="52%" stopColor="#E2E8F0" />
                <stop offset="100%" stopColor="#CBD5E1" />
              </linearGradient>
              <linearGradient id="wordai-start-transition-rocket-nose" x1="0%" y1="50%" x2="100%" y2="50%">
                <stop offset="0%" stopColor="#F97316" />
                <stop offset="100%" stopColor="#FB7185" />
              </linearGradient>
              <linearGradient id="wordai-start-transition-wing-top" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FB7185" />
                <stop offset="100%" stopColor="#F97316" />
              </linearGradient>
            </defs>
            <ellipse cx="56" cy="38" rx="36" ry="20" fill="url(#wordai-start-transition-rocket-body)" />
            <path d="M82 19 L128 38 L82 57 Z" fill="url(#wordai-start-transition-rocket-nose)" />
            <path d="M28 22 L8 12 L18 32 Z" fill="url(#wordai-start-transition-wing-top)" />
            <path d="M28 54 L8 64 L18 44 Z" fill="#F97316" />
            <path d="M18 30 L0 38 L18 46 Z" fill="#F8FAFC" opacity="0.9" />
            <circle cx="56" cy="38" r="8" fill="#0F172A" opacity="0.86" />
            <circle cx="56" cy="38" r="4" fill="#60A5FA" opacity="0.88" />
            <path d="M66 21 Q82 38 66 55" fill="none" stroke="#94A3B8" strokeWidth="3.5" strokeLinecap="round" opacity="0.7" />
          </svg>
        </div>
      </div>

      <div
        className="wordai-start-transition__impact"
        style={{
          position: 'absolute',
          left: START_SCREEN_TRANSITION_IMPACT_CENTER_X,
          top: START_SCREEN_TRANSITION_IMPACT_CENTER_Y,
          width: 'min(88vw, 820px)',
          height: 'min(88vw, 820px)',
          transform: 'translate(-50%, -50%)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '240px',
            height: '240px',
            borderRadius: '999px',
            background: 'radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,250,240,0.98) 16%, rgba(255,227,168,0.96) 28%, rgba(253,186,116,0.92) 44%, rgba(251,146,60,0.22) 72%, rgba(255,255,255,0) 100%)',
            filter: 'blur(2px)',
            mixBlendMode: 'screen',
            animation: `wordai-start-transition-flash 620ms ease-out ${getStartScreenTransitionDelayMs(-34)} both`,
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '430px',
            height: '430px',
            borderRadius: '999px',
            background: 'radial-gradient(circle, rgba(254,240,138,0.98) 0%, rgba(255,210,118,0.94) 18%, rgba(251,146,60,0.82) 36%, rgba(249,115,22,0.24) 58%, rgba(255,255,255,0) 100%)',
            filter: 'blur(8px)',
            animation: `wordai-start-transition-burst 720ms cubic-bezier(0.22, 1, 0.36, 1) ${getStartScreenTransitionDelayMs(-14)} both`,
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '620px',
            height: '620px',
            borderRadius: '999px',
            background: 'radial-gradient(circle, rgba(255,244,214,0.48) 0%, rgba(253,186,116,0.3) 24%, rgba(251,146,60,0.14) 40%, rgba(255,255,255,0) 72%)',
            filter: 'blur(18px)',
            mixBlendMode: 'screen',
            animation: `wordai-start-transition-burst 820ms cubic-bezier(0.22, 1, 0.36, 1) ${getStartScreenTransitionDelayMs(21)} both`,
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '240px',
            height: '240px',
            borderRadius: '999px',
            border: '3px solid rgba(255,255,255,0.96)',
            boxShadow: '0 0 30px rgba(255,255,255,0.34)',
            animation: `wordai-start-transition-ring 760ms ease-out ${getStartScreenTransitionDelayMs(6)} both`,
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '420px',
            height: '420px',
            borderRadius: '999px',
            border: '3px solid rgba(253,186,116,0.82)',
            boxShadow: '0 0 42px rgba(251,146,60,0.24)',
            animation: `wordai-start-transition-ring 900ms ease-out ${getStartScreenTransitionDelayMs(31)} both`,
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '620px',
            height: '620px',
            borderRadius: '999px',
            border: '2px solid rgba(255,255,255,0.52)',
            animation: `wordai-start-transition-ring 1120ms ease-out ${getStartScreenTransitionDelayMs(61)} both`,
          }}
        />
        {START_SCREEN_TRANSITION_PARTICLES.map((particle) => (
          <span
            key={particle.id}
            style={{
              '--particle-angle': particle.angle,
              '--particle-distance': particle.distance,
              position: 'absolute',
              left: particle.left,
              top: particle.top,
              width: particle.size,
              height: particle.size,
              borderRadius: '999px',
              background: particle.color,
              boxShadow: `0 0 24px ${particle.color}`,
              filter: 'blur(0.35px)',
              animation: `wordai-start-transition-particle 780ms cubic-bezier(0.22, 1, 0.36, 1) ${particle.delay} both`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

const escHtml = (txt) => String(txt ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const normalizeTrackedEditorHtml = (html = '') => String(html || '')
  .replace(/\r\n?/g, '\n')
  .replace(/>\s+</g, '><')
  .trim();

const getLiveGenerationStateMeta = (state = 'running') => {
  if (state === 'success') {
    return {
      label: 'הושלם',
      title: 'המסמך מוכן',
      description: 'התוכן המלא נטען לעורך.',
      tone: '#047857',
      background: '#ECFDF5',
      border: '#A7F3D0',
    };
  }
  if (state === 'warning') {
    return {
      label: 'ממתין לאישור',
      title: 'המסמך מוכן לבדיקה',
      description: 'נוצרה טיוטה בטוחה שממתינה לעדכון או אישור.',
      tone: '#B45309',
      background: '#FFFBEB',
      border: '#FCD34D',
    };
  }
  if (state === 'error') {
    return {
      label: 'שגיאה',
      title: 'אירעה שגיאה בתהליך',
      description: 'ההרצה נעצרה לפני שהמסמך הושלם.',
      tone: '#B91C1C',
      background: '#FEF2F2',
      border: '#FCA5A5',
    };
  }
  return {
    label: 'בתהליך',
    title: 'בונה את המסמך בלייב',
    description: 'העורך מתעדכן כאן בכל פעם שמתקבל שלב או אירוע חדש מההרצה.',
    tone: '#1D4ED8',
    background: '#EFF6FF',
    border: '#BFDBFE',
  };
};

const formatLiveGenerationTime = (value) => {
  if (!value) return '--:--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const buildLiveGenerationStageMarkup = (stages = []) => {
  const recentStages = Array.isArray(stages) ? stages.slice(0, 5) : [];
  if (!recentStages.length) {
    return '<li style="padding:8px 10px;border:1px solid #DBEAFE;border-radius:10px;background:#FFFFFF;">מאתחל שלבי ריצה...</li>';
  }
  return recentStages.map((stage) => {
    const stateLabel = stage?.state === 'success'
      ? 'הושלם'
      : stage?.state === 'error'
        ? 'שגיאה'
        : stage?.state === 'running'
          ? 'רץ עכשיו'
          : 'ממתין';
    const stateColor = stage?.state === 'success'
      ? '#047857'
      : stage?.state === 'error'
        ? '#B91C1C'
        : stage?.state === 'running'
          ? '#1D4ED8'
          : '#64748B';
    return `<li style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:8px 10px;border:1px solid #DBEAFE;border-radius:10px;background:#FFFFFF;"><span style="font-weight:600;color:#0F172A;">${escHtml(stage?.label || 'שלב לא מזוהה')}</span><span style="font-size:12px;font-weight:700;color:${stateColor};white-space:nowrap;">${stateLabel}</span></li>`;
  }).join('');
};

const buildLiveGenerationLogMarkup = (logs = []) => {
  const recentLogs = Array.isArray(logs) ? logs.slice(0, 6) : [];
  if (!recentLogs.length) {
    return '<li style="padding:8px 10px;border:1px solid #E2E8F0;border-radius:10px;background:#FFFFFF;">ממתין לאירועים הראשונים של ההרצה...</li>';
  }
  return recentLogs.map((log, index) => {
    const logTime = formatLiveGenerationTime(log?.timestamp || log?.time || log?.ts);
    const logAgent = escHtml(log?.agentLabel || log?.agentId || 'מערכת');
    const logMessage = escHtml(log?.message || log?.type || 'עודכן סטטוס תהליך');
    return `<li style="padding:8px 10px;border:1px solid #E2E8F0;border-radius:10px;background:#FFFFFF;"><div style="display:flex;justify-content:space-between;gap:12px;font-size:11px;color:#64748B;margin-bottom:4px;"><span style="font-weight:700;color:#334155;">${logAgent}</span><span>${logTime}</span></div><div style="color:#0F172A;line-height:1.55;">${logMessage}</div></li>`;
  }).join('');
};

const buildLiveGenerationShell = ({ titleText = 'מסמך חדש', state = 'running', stages = [], logs = [], runId = '' } = {}) => {
  const stateMeta = getLiveGenerationStateMeta(state);
  const safeRunId = escHtml(runId);
  return `
  <div ${LIVE_GENERATION_SHELL_MARKER} data-wordai-live-generation-run-id="${safeRunId}" data-wordai-live-generation-state="${escHtml(state)}" style="border:1px solid ${stateMeta.border};background:${stateMeta.background};padding:18px;border-radius:16px;margin-bottom:18px;">
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px;">
      <div>
        <p style="margin:0 0 6px 0;font-size:18px;font-weight:700;color:#0F172A;">${stateMeta.title}</p>
        <p style="margin:0;color:#334155;line-height:1.6;">${stateMeta.description}</p>
      </div>
      <div style="padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;color:${stateMeta.tone};background:#FFFFFF;border:1px solid ${stateMeta.border};white-space:nowrap;">${stateMeta.label}</div>
    </div>
    <h1 style="margin:0 0 10px 0;color:#0F172A;">${escHtml(titleText || 'מסמך חדש')}</h1>
    <p style="margin:0 0 14px 0;color:#334155;"><strong>סטטוס:</strong> ${stateMeta.label}</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;align-items:start;">
      <div>
        <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#0F172A;">שלבי הריצה האחרונים</p>
        <ul style="margin:0;padding:0;list-style:none;display:grid;gap:8px;">${buildLiveGenerationStageMarkup(stages)}</ul>
      </div>
      <div>
        <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#0F172A;">אירועים אחרונים</p>
        <ul style="margin:0;padding:0;list-style:none;display:grid;gap:8px;">${buildLiveGenerationLogMarkup(logs)}</ul>
      </div>
    </div>
  </div>
  <p style="margin:0;color:#475569;">התוכן המלא יחליף את ה־shell הזה אוטומטית כשההרצה תסתיים.</p>
`;
};

const isLiveGenerationShellHtml = (html = '', runId = '') => {
  const markup = String(html || '');
  if (!markup.includes(LIVE_GENERATION_SHELL_MARKER)) return false;
  if (!runId) return true;
  return markup.includes(`data-wordai-live-generation-run-id="${escHtml(runId)}"`);
};

const buildLiveGenerationErrorPlaceholder = ({ titleText = 'מסמך חדש', runId = '' } = {}) => {
  const safeRunId = escHtml(runId);
  return `
  <div ${LIVE_GENERATION_ERROR_PLACEHOLDER_MARKER} data-wordai-live-generation-run-id="${safeRunId}">
    <h1>${escHtml(titleText || 'מסמך חדש')}</h1>
    <p>אירעה שגיאה בזמן יצירת המסמך. אפשר לנסות שוב.</p>
  </div>
`;
};

const isLiveGenerationErrorPlaceholderHtml = (html = '', runId = '') => {
  const markup = String(html || '');
  if (!markup.includes(LIVE_GENERATION_ERROR_PLACEHOLDER_MARKER)) return false;
  if (!runId) return true;
  return markup.includes(`data-wordai-live-generation-run-id="${escHtml(runId)}"`);
};

const buildGenerationLabel = ({ promptText = '', instructionsText = '', templateId = 'blank' } = {}) => {
  const cleanPrompt = String(promptText || '').trim();
  if (cleanPrompt) return cleanPrompt;

  const lines = String(instructionsText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const preferredLine = lines.find((line, index) => index > 0 || !/^קובץ\s+הנחיות\s*:/i.test(line)) || lines[0] || '';
  const normalizedLine = preferredLine
    .replace(/^(?:[-*]+|\d+[.)])\s+/, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:!?-]+|[\s,;:!?-]+$/g, '')
    .trim();

  return normalizedLine || GENERATION_LABEL_FALLBACKS[templateId] || GENERATION_LABEL_FALLBACKS.blank;
};

const summarizeInspectorMaterialSelection = (selectedMaterials = []) => (
  (Array.isArray(selectedMaterials) ? selectedMaterials : []).map((item, index) => {
    const previewText = String(item?.previewText || '').trim();
    const rawPreviewChars = Number(item?.previewChars);
    return {
      id: item?.id || item?.file || `material-${index + 1}`,
      title: String(item?.title || item?.file || `material-${index + 1}`).trim(),
      label: String(item?.label || '').trim(),
      hasPreview: Boolean(previewText),
      previewChars: Number.isFinite(rawPreviewChars) && rawPreviewChars >= 0 ? rawPreviewChars : previewText.length,
      previewStatus: String(item?.previewStatus || (previewText ? 'ready' : '')).trim(),
      previewError: String(item?.previewError || '').trim(),
    };
  })
);

const buildStartScreenGenerationInspector = ({
  runId = '',
  actionType = '',
  prompt = '',
  instructions = '',
  selectedMaterials = [],
  templateId = 'blank',
  baseDraft = null,
  selectedProviderId = '',
  selectedProviderModel = '',
  route = 'generateDocumentFromPrompt',
  routeMode = '',
  routeModeReason = '',
} = {}) => {
  const cleanBaseDraftHtml = String(baseDraft?.html || '').trim();
  const cleanBaseDraftText = String(baseDraft?.text || '').trim();
  const hasBaseDraft = Boolean(cleanBaseDraftHtml);

  return {
    actionType: String(actionType || (hasBaseDraft ? 'revise' : 'generate')).trim() || 'generate',
    routeRequested: String(route || 'generateDocumentFromPrompt').trim(),
    routeResolved: String(route || 'generateDocumentFromPrompt').trim(),
    routeMode: String(routeMode || '').trim(),
    routeModeReason: String(routeModeReason || '').trim(),
    runId: String(runId || '').trim(),
    templateId: String(templateId || 'blank').trim() || 'blank',
    promptChars: String(prompt || '').trim().length,
    instructionsChars: String(instructions || '').trim().length,
    requestedProviderId: String(selectedProviderId || '').trim(),
    requestedProviderModel: String(selectedProviderModel || '').trim(),
    selectedMaterials: summarizeInspectorMaterialSelection(selectedMaterials),
    baseDraft: hasBaseDraft ? {
      title: String(baseDraft?.title || baseDraft?.name || '').trim() || 'טיוטת בסיס',
      htmlChars: cleanBaseDraftHtml.length,
      textChars: cleanBaseDraftText.length,
    } : null,
    usedFallback: false,
    errorMessage: '',
    liveState: 'running',
  };
};

const resolveStartScreenGenerationInspectorMeta = ({ summary = null, logs = [] } = {}) => {
  const latestLogs = Array.isArray(logs) ? logs : [];
  const latestStages = Array.isArray(summary?.stages) ? summary.stages : [];
  const requestStartLog = latestLogs.find((log) => log?.type === 'request-start');
  const lastLogMeta = [...latestLogs].reverse().find(
    (log) => String(log?.provider || '').trim() || String(log?.model || '').trim(),
  );
  const lastStageMeta = [...latestStages].reverse().find(
    (stage) => String(stage?.provider || '').trim() || String(stage?.model || '').trim(),
  );
  const resolvedProviderMeta = lastLogMeta || lastStageMeta || {};

  return {
    requestedProviderId: String(resolvedProviderMeta?.provider || '').trim(),
    requestedProviderModel: String(resolvedProviderMeta?.model || '').trim(),
    routeMode: requestStartLog
      ? (requestStartLog.automationSkipped === true ? 'direct' : 'workspace-automation')
      : '',
    routeModeReason: String(requestStartLog?.automationSkipReason || '').trim(),
  };
};

const DEFAULT_BASE_DRAFT_REFINEMENT_REQUEST = 'המשתמש בחר לעדכן את טיוטת הבסיס הקיימת. הטיוטה היא מקור האמת: שמור את התוכן, המבנה, הטענות והמידע שכבר קיימים, ולטש או הרחב אותם במקום רק כשיש צורך. אל תכתוב מסמך חדש מאפס ואל תמחק חלקים קיימים בלי בקשה מפורשת.';

const buildBaseDraftRevisionRequest = ({ promptText = '', instructionsText = '', baseDraftTitle = '', templateId = 'blank' } = {}) => {
  const cleanPrompt = String(promptText || '').trim();
  const cleanInstructions = String(instructionsText || '').trim();
  const resolvedDraftTitle = String(baseDraftTitle || '').trim();

  if (!cleanPrompt && !cleanInstructions) {
    return {
      feedback: DEFAULT_BASE_DRAFT_REFINEMENT_REQUEST,
      title: resolvedDraftTitle ? `${resolvedDraftTitle} · ליטוש טיוטה` : 'ליטוש טיוטה',
      originalPrompt: resolvedDraftTitle || 'טיוטת בסיס',
    };
  }

  const sections = [DEFAULT_BASE_DRAFT_REFINEMENT_REQUEST];
  if (resolvedDraftTitle) sections.push(`שם הטיוטה לעדכון:\n${resolvedDraftTitle}`);
  if (cleanInstructions) sections.push(`הנחיות לעדכון:\n${cleanInstructions}`);
  if (cleanPrompt) sections.push(`מטרה או הקשר:\n${cleanPrompt}`);

  return {
    feedback: sections.join('\n\n'),
    title: buildGenerationLabel({ promptText: cleanPrompt, instructionsText: cleanInstructions, templateId }),
    originalPrompt: cleanPrompt || resolvedDraftTitle || 'טיוטת בסיס',
  };
};

const normalizeDeferredReviewOfferText = (value = '', limit = 220) => {
  const normalizedValue = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalizedValue) return '';
  return normalizedValue.length > limit
    ? `${normalizedValue.slice(0, Math.max(0, limit - 3)).trim()}...`
    : normalizedValue;
};

const buildDeferredReviewOffer = ({ logs = [], additionalReviewRounds = 0, usedFallback = false } = {}) => {
  if (usedFallback || Number(additionalReviewRounds) > 0) return null;

  const revisitLog = (Array.isArray(logs) ? logs : []).find((log) => String(log?.type || '').trim() === 'stage-revisit-required');
  if (!revisitLog) return null;

  const noteText = normalizeDeferredReviewOfferText(revisitLog.message || revisitLog.type || '');
  const decisionText = normalizeDeferredReviewOfferText(revisitLog.decision || '');
  const missingText = normalizeDeferredReviewOfferText(revisitLog.missing || '', 260);
  const confirmSections = [
    'בסוף הסבב מנהל העבודה ביקש סבב בקרת איכות נוסף.',
    noteText ? `הערת הסיום: ${noteText}` : '',
    missingText ? `פערים שזוהו: ${missingText}` : '',
    'להריץ עכשיו סבב נוסף על הטיוטה שכבר נוצרה?',
  ].filter(Boolean);
  const feedbackSections = [
    'מנהל העבודה ביקש עכשיו סבב בקרת איכות נוסף על הטיוטה הקיימת לפני מסירה.',
    'הטיוטה הקיימת היא בסיס העבודה. שמור על המבנה, המידע והחלקים הטובים שכבר קיימים, ותקן רק את הפערים שעלו בסיום הסבב.',
    noteText ? `הערת הסיום של מנהל העבודה:\n${noteText}` : '',
    decisionText ? `החלטת מנהל:\n${decisionText}` : '',
    missingText ? `פערים לטיפול:\n${missingText}` : '',
    'בצע תיקונים ממוקדים, השלם רק מה שחסר, ואל תוסיף מבנה חדש או חלקים שלא נתבקשו.',
  ].filter(Boolean);

  return {
    confirmMessage: confirmSections.join('\n\n'),
    feedback: feedbackSections.join('\n\n'),
  };
};

const shouldAutoOpenOnboarding = (profile = {}) => {
  if (String(profile?.onboardingCompletedAt || '').trim()) return false;
  if (String(profile?.onboardingDismissedAt || '').trim()) return false;
  const snoozedUntil = String(profile?.onboardingSnoozedUntil || '').trim();
  if (snoozedUntil) {
    const snoozeDate = new Date(snoozedUntil);
    if (Number.isNaN(snoozeDate.getTime())) return true;
    return snoozeDate.getTime() <= Date.now();
  }

  return !hasMeaningfulPersonalProfileData(profile);
};

const normalizeStoredDefaultFont = (value = '') => {
  const firstFamily = String(value || '').split(',')[0] || '';
  return firstFamily.replace(/^['"]+|['"]+$/g, '').trim() || 'Alef';
};

const getActiveWorkspaceId = () => String(getWorkspaceAutomation().activeWorkspaceId || '').trim();

const FEEDBACK_OPTION_GROUPS = [
  {
    title: 'לאקדמיה',
    options: [
      'לחדד שפה אקדמית ורשמית יותר',
      'לשפר את מבנה הפרקים והכותרות',
      'לחזק נימוקים, דיון ומסקנות',
      'להוסיף מקום למקורות, אסמכתאות וציטוטים',
    ],
  },
  {
    title: 'לשימוש חופשי',
    options: [
      'לקצר ולתמצת את המסמך',
      'להרחיב ולהעמיק את התוכן',
      'להפוך את הסגנון לברור ופשוט יותר',
      'לתקן ניסוח, שגיאות וזרימה',
    ],
  },
];

const FEEDBACK_MAX_REVISION_ROUNDS = 2;

const normalizeFeedbackExecutionMode = (value = '') => (String(value || '').trim() === 'workspace' ? 'workspace' : 'direct');

const normalizeFeedbackRoundIndex = (value = 1) => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return 1;
  return Math.min(FEEDBACK_MAX_REVISION_ROUNDS + 1, Math.max(1, Math.floor(parsedValue)));
};

const isFeedbackWorkflowAvailable = () => {
  const automation = getWorkspaceAutomation();
  const activeWorkflowAgents = getOrderedRoleAgents(automation?.workflowMode);
  return automation?.enabled === true
    && automation?.autoDispatch !== false
    && Array.isArray(activeWorkflowAgents)
    && activeWorkflowAgents.length > 0;
};

const DEFAULT_FEEDBACK_SURVEY = {
  open: false,
  phase: 'question',
  prompt: '',
  templateId: 'blank',
  selectedMaterials: [],
  selectedModel: '',
  selectedProviderId: '',
  selectedProviderModel: '',
  selectedOptions: [],
  freeText: '',
  executionMode: 'direct',
  roundIndex: 1,
  usedFallback: false,
  submitting: false,
  submissionRequestId: null,
  reviewResult: null,
  reviewFocus: '',
  reviewErrorMessage: '',
};

const DEFAULT_INPUT_DIALOG = {
  open: false,
  title: '',
  description: '',
  fields: [],
  values: {},
  confirmLabel: 'אישור',
  closeOnEscape: true,
  closeOnBackdrop: false,
  submitOnEnter: true,
  submitOnCtrlEnterForTextarea: true,
  resolve: null,
};

const COPYLEAKS_SOURCE_LABELS = {
  selection: 'טקסט מסומן',
  currentBlock: 'פסקה פעילה',
  document: 'כל המסמך',
};

const DEFAULT_COPYLEAKS_DETECTOR = {
  open: false,
  source: 'selection',
  sourceLabel: COPYLEAKS_SOURCE_LABELS.selection,
  text: '',
  submitting: false,
  result: null,
  error: '',
};

const formatCopyleaksPercent = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : '—';
};

const getFeedbackSurveyGenerationContext = (survey = {}, fallback = {}) => {
  const surveyPrompt = String(survey.prompt || '').trim();
  const fallbackPrompt = String(fallback.prompt || '').trim();
  const surveyTemplateId = String(survey.templateId || '').trim();
  const fallbackTemplateId = String(fallback.templateId || '').trim();
  const surveySelectedMaterials = Array.isArray(survey.selectedMaterials) ? survey.selectedMaterials.filter(Boolean) : [];
  const fallbackSelectedMaterials = Array.isArray(fallback.selectedMaterials) ? fallback.selectedMaterials.filter(Boolean) : [];
  const surveySelectedProviderId = String(survey.selectedProviderId || survey.selectedModel || '').trim();
  const fallbackSelectedProviderId = String(fallback.selectedProviderId || fallback.selectedModel || '').trim();
  const surveySelectedProviderModel = String(survey.selectedProviderModel || '').trim();
  const fallbackSelectedProviderModel = String(fallback.selectedProviderModel || '').trim();
  const hasSurveyGenerationContext = Boolean(
    surveyPrompt
    || survey.usedFallback
    || surveySelectedMaterials.length
    || surveySelectedProviderId
    || surveySelectedProviderModel
  );

  return {
    prompt: surveyPrompt || fallbackPrompt,
    templateId: (hasSurveyGenerationContext
      ? (surveyTemplateId || fallbackTemplateId || 'blank')
      : (fallbackTemplateId || surveyTemplateId || 'blank')),
    executionMode: normalizeFeedbackExecutionMode(survey.executionMode || fallback.executionMode || 'direct'),
    roundIndex: normalizeFeedbackRoundIndex(survey.roundIndex || fallback.roundIndex || 1),
    usedFallback: Boolean(survey.usedFallback || fallback.usedFallback),
    selectedMaterials: surveySelectedMaterials.length ? [...surveySelectedMaterials] : [...fallbackSelectedMaterials],
    selectedModel: surveySelectedProviderId || fallbackSelectedProviderId,
    selectedProviderId: surveySelectedProviderId || fallbackSelectedProviderId,
    selectedProviderModel: surveySelectedProviderModel || fallbackSelectedProviderModel,
  };
};

const buildFeedbackSurveyStateWithGenerationContext = (survey = {}, fallback = {}) => ({
  ...DEFAULT_FEEDBACK_SURVEY,
  ...getFeedbackSurveyGenerationContext(survey, fallback),
});

const buildFeedbackSurveyRequestText = ({ selectedOptions = [], freeText = '', includeIntro = true } = {}) => {
  const normalizedOptions = Array.isArray(selectedOptions)
    ? selectedOptions.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const cleanFreeText = String(freeText || '').trim();
  const sections = [];

  if (normalizedOptions.length) sections.push(`נקודות לתיקון:\n- ${normalizedOptions.join('\n- ')}`);
  if (cleanFreeText) sections.push(`בקשה חופשית:\n${cleanFreeText}`);
  if (!sections.length) return '';

  return includeIntro
    ? ['המשתמש ביקש לעדכן את המסמך לפי המשוב הבא:', ...sections].join('\n\n')
    : sections.join('\n\n');
};

const getDraftTitleFromFilePath = (filePath = '') => {
  const filename = String(filePath || '').split(/[\\/]/).filter(Boolean).pop() || '';
  return filename.replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim();
};

const getDraftTitleFromText = (text = '', templateId = 'blank') => {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const normalized = String(lines[0] || '')
    .replace(/^[#*\-\d.)\s]+/, '')
    .trim();

  if (!normalized) {
    return GENERATION_LABEL_FALLBACKS[templateId] || GENERATION_LABEL_FALLBACKS.blank;
  }

  return normalized.length > 72 ? `${normalized.slice(0, 72).trim()}...` : normalized;
};

const EXPORT_DOC_STYLES = `<style>
    body { direction: rtl; font-family: Arial, sans-serif; padding: 40px; line-height: 1.7; }
    [data-type="page-break"] { display: block; height: 0; page-break-after: always; break-after: page; }
    body > p:first-child { text-align: center; font-size: 11pt; font-weight: 700; color: #64748B; letter-spacing: 1px; margin-top: 20px; }
    body > h1:nth-child(2) { text-align: center; font-size: 28pt; color: #2B579A; margin: 0 0 10pt; }
    body > h2:nth-child(3) { text-align: center; font-size: 15pt; color: #475569; margin: 0 0 14pt; }
    body > hr:nth-child(4) { width: 96px; margin: 14px auto; border: none; border-top: 4px solid #93C5FD; }
    body > p:nth-child(5), body > p:nth-child(6) { text-align: center; color: #475569; }
  </style>`;

const isLegacyHomeEnabled = () => {
  try {
    return localStorage.getItem('wordai_legacy_home_enabled') !== 'false';
  } catch {
    return true;
  }
};

const PRIMARY_DOCUMENT_STORAGE_SCOPE_ID = 'primary';
const DOCUMENT_STORAGE_KEYS = Object.freeze({
  draft: 'wordai_document',
  autosave: 'wordai_document_autosave',
  autosaveAt: 'wordai_document_autosave_at',
  activeTemplate: 'wordai_active_template',
});

const DESKTOP_WINDOW_CONTEXT = (() => {
  if (typeof window === 'undefined') {
    return {
      isolatedDocumentSession: false,
      documentStorageScopeId: PRIMARY_DOCUMENT_STORAGE_SCOPE_ID,
      hasPendingOpenDocument: false,
    };
  }
  const rawContext = window.desktopApp?.windowContext;
  if (!rawContext || typeof rawContext !== 'object') {
    return {
      isolatedDocumentSession: false,
      documentStorageScopeId: PRIMARY_DOCUMENT_STORAGE_SCOPE_ID,
      hasPendingOpenDocument: false,
    };
  }

  const scopedId = typeof rawContext.documentStorageScopeId === 'string'
    ? rawContext.documentStorageScopeId.trim()
    : '';

  return {
    isolatedDocumentSession: rawContext.isolatedDocumentSession === true,
    documentStorageScopeId: scopedId || PRIMARY_DOCUMENT_STORAGE_SCOPE_ID,
    hasPendingOpenDocument: rawContext.hasPendingOpenDocument === true,
  };
})();

const DOCUMENT_STORAGE_SCOPE_ID = String(
  DESKTOP_WINDOW_CONTEXT.documentStorageScopeId || PRIMARY_DOCUMENT_STORAGE_SCOPE_ID
).trim() || PRIMARY_DOCUMENT_STORAGE_SCOPE_ID;
const HAS_PENDING_STARTUP_DOCUMENT = DESKTOP_WINDOW_CONTEXT.hasPendingOpenDocument === true;
const SHOULD_FALLBACK_TO_LEGACY_DOCUMENT_STORAGE = DOCUMENT_STORAGE_SCOPE_ID === PRIMARY_DOCUMENT_STORAGE_SCOPE_ID;

const buildScopedDocumentStorageKey = (storageKey) => `wordai_window_scope:${DOCUMENT_STORAGE_SCOPE_ID}:${storageKey}`;

const readDocumentStorageValue = (storageKey, { fallbackToLegacy = false } = {}) => {
  try {
    const scopedValue = localStorage.getItem(buildScopedDocumentStorageKey(storageKey));
    if (scopedValue !== null) return scopedValue;
    if (fallbackToLegacy && SHOULD_FALLBACK_TO_LEGACY_DOCUMENT_STORAGE) {
      return localStorage.getItem(storageKey);
    }
  } catch {}
  return null;
};

const writeDocumentStorageValue = (storageKey, value, { mirrorLegacy = SHOULD_FALLBACK_TO_LEGACY_DOCUMENT_STORAGE } = {}) => {
  try {
    const normalizedValue = String(value ?? '');
    localStorage.setItem(buildScopedDocumentStorageKey(storageKey), normalizedValue);
    if (mirrorLegacy && SHOULD_FALLBACK_TO_LEGACY_DOCUMENT_STORAGE) {
      localStorage.setItem(storageKey, normalizedValue);
    }
  } catch {}
};

const removeDocumentStorageValue = (storageKey, { removeLegacy = SHOULD_FALLBACK_TO_LEGACY_DOCUMENT_STORAGE } = {}) => {
  try {
    localStorage.removeItem(buildScopedDocumentStorageKey(storageKey));
    if (removeLegacy && SHOULD_FALLBACK_TO_LEGACY_DOCUMENT_STORAGE) {
      localStorage.removeItem(storageKey);
    }
  } catch {}
};

const getPersistedDraftHtml = () => {
  const autosaveHtml = readDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosave, { fallbackToLegacy: true });
  if (autosaveHtml) return autosaveHtml;
  return readDocumentStorageValue(DOCUMENT_STORAGE_KEYS.draft, { fallbackToLegacy: true }) || null;
};

const getPersistedDraftSavedAt = () => {
  return readDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosaveAt, { fallbackToLegacy: true }) || '';
};

const clearPersistedAutosaveCache = () => {
  removeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosave);
  removeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosaveAt);
};

const persistAutosaveSnapshot = (html) => {
  writeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosave, html);
  writeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosaveAt, new Date().toISOString());
};

const persistLocalDraftCache = (html) => {
  writeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.draft, html);
  writeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosave, html);
  writeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosaveAt, new Date().toISOString());
};

const clearPersistedDraftCacheStorage = () => {
  removeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.draft);
  removeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosave);
  removeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.autosaveAt);
};

const getPersistedActiveTemplateId = () => {
  return readDocumentStorageValue(DOCUMENT_STORAGE_KEYS.activeTemplate, { fallbackToLegacy: true }) || 'blank';
};

const persistActiveTemplateId = (templateId = 'blank') => {
  writeDocumentStorageValue(DOCUMENT_STORAGE_KEYS.activeTemplate, templateId || 'blank');
};

const getRecentAgentLogs = (limit = 18, filters = {}) => {
  const automation = getWorkspaceAutomation();
  const workspaceId = String(filters.workspaceId || automation?.activeWorkspaceId || 'default-content-studio').trim();
  const runId = String(filters.runId || '').trim();
  return getAgentDebugLogs({ workspaceId, runId, includeUnscoped: false }).slice(-limit).reverse();
};

function App() {
  // ביטול טיימר הפולבק לאחר שReact עשה commit ראשון לDOM
  const applyHydratedSettingsState = React.useCallback(() => {
    setShortcuts(getShortcutsConfig());
    setAssistantBehavior(getAssistantBehavior());
    setWordPreferences(getWordPreferences());
    setDocumentStyle(localStorage.getItem('wordai_document_style') || 'academic');
    setActiveTemplateId(getPersistedActiveTemplateId());
  }, []);

  React.useEffect(() => {
    if (window.__mountTimer) clearTimeout(window.__mountTimer);

    let isMounted = true;

    (async () => {
      try {
        await hydrateAppSettingsFromDisk().catch(() => {});
        await hydrateProviderConfigFromDisk().catch(() => {});
        if (!isMounted) return;
        applyHydratedSettingsState();
      } finally {
        if (isMounted) setSettingsHydrated(true);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [applyHydratedSettingsState]);

  React.useEffect(() => {
    const refreshSettingsFromDisk = () => {
      hydrateAppSettingsFromDisk()
        .catch(() => {})
        .then(() => hydrateProviderConfigFromDisk().catch(() => {}))
        .then(() => {
          applyHydratedSettingsState();
        })
        .catch(() => {});
    };

    const handleWindowFocus = () => {
      refreshSettingsFromDisk();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSettingsFromDisk();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [applyHydratedSettingsState]);

  const [editor, setEditor] = React.useState(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [wordCount, setWordCount] = React.useState(0);
  const [pageCount, setPageCount] = React.useState(1);
  const [zoom, setZoom] = React.useState(100);
  const [viewMode, setViewMode] = React.useState('print');
  const [fileMenuOpen, setFileMenuOpen] = React.useState(false);
  const [fileMenuTargetTab, setFileMenuTargetTab] = React.useState(null);
  const [updateCheckToken, setUpdateCheckToken] = React.useState(0);
  const [formatPainterActive, setFormatPainterActive] = React.useState(false);
  const [selectedText, setSelectedText] = React.useState('');
  const [selectionContext, setSelectionContext] = React.useState(null);
  const [currentBlockText, setCurrentBlockText] = React.useState('');
  const [trackChanges, setTrackChanges] = React.useState(false);
  const [shortcuts, setShortcuts] = React.useState(getShortcutsConfig());
  const [assistantBehavior, setAssistantBehavior] = React.useState(getAssistantBehavior());
  const [wordPreferences, setWordPreferences] = React.useState(getWordPreferences());
  const [documentStyle, setDocumentStyle] = React.useState(() => localStorage.getItem('wordai_document_style') || 'academic');
  const [activeTemplateId, setActiveTemplateId] = React.useState(() => getPersistedActiveTemplateId());
  const [pendingStartupDocument, setPendingStartupDocument] = React.useState(HAS_PENDING_STARTUP_DOCUMENT);
  const [showStartScreen, setShowStartScreen] = React.useState(() => {
    if (HAS_PENDING_STARTUP_DOCUMENT) return false;
    if (isLegacyHomeEnabled()) return true;
    return getWordPreferences().showStartExperience !== false;
  });
  const [showSplash, setShowSplash] = React.useState(() => isLegacyHomeEnabled() ? true : getWordPreferences().showStartExperience !== false);
  const [startScreenInstructionsResetToken, setStartScreenInstructionsResetToken] = React.useState(0);
  const [startTransitionPhase, setStartTransitionPhase] = React.useState('idle');
  const [currentFilePath, setCurrentFilePath] = React.useState('');
  const [lastEditorActivityAt, setLastEditorActivityAt] = React.useState(Date.now());
  const [lastManualStyleLearningAt, setLastManualStyleLearningAt] = React.useState(0);
  const [liveGeneration, setLiveGeneration] = React.useState({
    active: false,
    state: 'idle',
    prompt: '',
    summary: getLatestAgentRunSummary(getWorkspaceAutomation()),
    logs: getRecentAgentLogs(),
    runId: '',
    workspaceId: getWorkspaceAutomation().activeWorkspaceId || '',
  });
  const liveGenerationStateRef = React.useRef(null);
  liveGenerationStateRef.current = liveGeneration;
  const [documentArrival, setDocumentArrival] = React.useState({ active: false, tone: 'success' });
  const [lastGenerationAction, setLastGenerationAction] = React.useState(null);
  const [generationRecovery, setGenerationRecovery] = React.useState({
    runId: '',
    agentId: '',
    provider: '',
    model: '',
    pending: false,
    error: '',
  });
  const [feedbackSurvey, setFeedbackSurvey] = React.useState({ ...DEFAULT_FEEDBACK_SURVEY });
  const [inputDialog, setInputDialog] = React.useState({ ...DEFAULT_INPUT_DIALOG });
  const [copyleaksDetector, setCopyleaksDetector] = React.useState({ ...DEFAULT_COPYLEAKS_DETECTOR });
  const [assistantTrigger, setAssistantTrigger] = React.useState('manual');
  const [settingsHydrated, setSettingsHydrated] = React.useState(false);
  const [sidebarCompact, setSidebarCompact] = React.useState(() => (typeof window !== 'undefined' ? window.innerWidth < 1180 : false));
  const activeWorkspaceIdRef = React.useRef(getActiveWorkspaceId());
  const workspaceEpochRef = React.useRef(0);
  const activeGenerationRequestIdRef = React.useRef(0);
  const lastLiveGenerationShellRef = React.useRef({ runId: '', html: '' });
  const lastLiveGenerationPlaceholderRef = React.useRef({ runId: '', html: '' });
  const preLiveGenerationSnapshotRef = React.useRef({ runId: '', html: '' });
  const pendingImportRef = React.useRef(null);
  const startTransitionTimerRef = React.useRef(null);
  const startTransitionRunIdRef = React.useRef(0);
  const pendingStartTransitionFocusRef = React.useRef('start');
  const documentArrivalTimerRef = React.useRef(null);
  const documentArrivalFrameRef = React.useRef(null);
  const clearDocumentArrival = React.useCallback(() => {
    if (documentArrivalFrameRef.current) {
      window.cancelAnimationFrame(documentArrivalFrameRef.current);
      documentArrivalFrameRef.current = null;
    }
    if (documentArrivalTimerRef.current) {
      window.clearTimeout(documentArrivalTimerRef.current);
      documentArrivalTimerRef.current = null;
    }
    setDocumentArrival((prev) => (prev.active ? { ...prev, active: false } : prev));
  }, []);
  const triggerDocumentArrival = React.useCallback((tone = 'success') => {
    clearDocumentArrival();
    documentArrivalFrameRef.current = window.requestAnimationFrame(() => {
      documentArrivalFrameRef.current = null;
      setDocumentArrival({ active: true, tone: tone === 'warning' ? 'warning' : 'success' });
      documentArrivalTimerRef.current = window.setTimeout(() => {
        documentArrivalTimerRef.current = null;
        setDocumentArrival((prev) => (prev.active ? { ...prev, active: false } : prev));
      }, DOCUMENT_ARRIVAL_PULSE_DURATION_MS);
    });
  }, [clearDocumentArrival]);
  React.useEffect(() => () => {
    if (documentArrivalFrameRef.current) {
      window.cancelAnimationFrame(documentArrivalFrameRef.current);
    }
    if (documentArrivalTimerRef.current) {
      window.clearTimeout(documentArrivalTimerRef.current);
    }
  }, []);
  const cancelStartTransition = React.useCallback(() => {
    if (startTransitionTimerRef.current) {
      window.clearTimeout(startTransitionTimerRef.current);
      startTransitionTimerRef.current = null;
    }
    startTransitionRunIdRef.current += 1;
    setStartTransitionPhase('idle');
  }, []);
  React.useEffect(() => () => {
    if (startTransitionTimerRef.current) {
      window.clearTimeout(startTransitionTimerRef.current);
      startTransitionTimerRef.current = null;
    }
  }, []);
  const clearDraftReviewState = React.useCallback(() => {
    const currentLiveGeneration = liveGenerationStateRef.current || {};
    const cancelledRunId = String(
      currentLiveGeneration.runId
      || preLiveGenerationSnapshotRef.current.runId
      || lastLiveGenerationShellRef.current.runId
      || ''
    ).trim();
    const currentHtml = normalizeTrackedEditorHtml(String(editor?.getHTML?.() || ''));
    const preGenerationSnapshot = preLiveGenerationSnapshotRef.current;
    const lastShell = lastLiveGenerationShellRef.current;
    const lastPlaceholder = lastLiveGenerationPlaceholderRef.current;
    const matchesTrackedShell = Boolean(
      cancelledRunId
      && lastShell.runId === cancelledRunId
      && currentHtml === lastShell.html
      && isLiveGenerationShellHtml(currentHtml, cancelledRunId)
    );
    const matchesTrackedPlaceholder = Boolean(
      cancelledRunId
      && lastPlaceholder.runId === cancelledRunId
      && currentHtml === lastPlaceholder.html
      && isLiveGenerationErrorPlaceholderHtml(currentHtml, cancelledRunId)
    );
    const shouldRestorePreGenerationSnapshot = Boolean(
      editor
      && cancelledRunId
      && preGenerationSnapshot.runId === cancelledRunId
      && (matchesTrackedShell || matchesTrackedPlaceholder)
    );

    activeGenerationRequestIdRef.current += 1;
    if (shouldRestorePreGenerationSnapshot) {
      editor.commands.setContent(preGenerationSnapshot.html, false);
    }

    preLiveGenerationSnapshotRef.current = { runId: '', html: '' };
    lastLiveGenerationShellRef.current = { runId: '', html: '' };
    lastLiveGenerationPlaceholderRef.current = { runId: '', html: '' };
    clearDocumentArrival();
    setFeedbackSurvey({ ...DEFAULT_FEEDBACK_SURVEY });
    setLastGenerationAction((prev) => {
      const latestLiveGeneration = liveGenerationStateRef.current || {};
      const latestLiveState = String(latestLiveGeneration.state || '').trim();
      const latestLiveRunId = String(latestLiveGeneration.runId || '').trim();

      if (
        latestLiveState !== 'running'
        || !cancelledRunId
        || (latestLiveRunId && latestLiveRunId !== cancelledRunId)
        || !prev
        || typeof prev !== 'object'
      ) {
        return prev;
      }

      const prevInspector = prev.inspector && typeof prev.inspector === 'object'
        ? prev.inspector
        : null;
      const actionRunId = String(prev.runId || '').trim();
      const inspectorRunId = String(prevInspector?.runId || '').trim();

      if (actionRunId !== cancelledRunId && inspectorRunId !== cancelledRunId) {
        return prev;
      }

      return {
        ...prev,
        inspector: {
          ...(prevInspector || {}),
          runId: inspectorRunId || actionRunId,
          liveState: 'cancelled',
        },
      };
    });
    setLiveGeneration((prev) => ({
      ...prev,
      active: false,
      state: 'idle',
      prompt: '',
      runId: '',
    }));
  }, [clearDocumentArrival, editor]);
  const beginGenerationRequest = (runIdPrefix = 'doc') => {
    const requestId = activeGenerationRequestIdRef.current + 1;
    activeGenerationRequestIdRef.current = requestId;
    return {
      requestId,
      runId: `${runIdPrefix}-${Date.now()}-${requestId}`,
      workspaceEpoch: workspaceEpochRef.current,
      workspaceId: getActiveWorkspaceId(),
    };
  };
  const isGenerationRequestCurrent = (request) => (
    activeGenerationRequestIdRef.current === request.requestId
    && workspaceEpochRef.current === request.workspaceEpoch
    && getActiveWorkspaceId() === request.workspaceId
  );
  const [activeFormats, setActiveFormats] = React.useState({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    bulletList: false,
    orderedList: false,
    alignRight: true,
    alignCenter: false,
    alignLeft: false,
    alignJustify: false,
    dir: 'rtl',
    fontFamily: 'Alef',
    fontSize: '12',
  });
  // פונקציות מברשת עיצוב מה-DocumentEditor
  const formatPainterRef = React.useRef({ copyFormat: null, applyFormat: null });

  const normalizeFontSizeValue = React.useCallback((rawValue) => {
    const raw = String(rawValue || '').trim().toLowerCase();
    const numeric = parseFloat(raw) || 12;
    if (raw.endsWith('px')) return String(Math.max(8, Math.round(numeric * 0.75)));
    return String(Math.max(8, Math.round(numeric)));
  }, []);

  const applyDocumentStyleToEditor = React.useCallback((styleId, currentEditor = editor) => {
    if (!currentEditor?.view?.dom) return;
    const preset = DOCUMENT_STYLE_PRESETS[styleId] || DOCUMENT_STYLE_PRESETS.academic;
    const dom = currentEditor.view.dom;
    let styleOverrides = {};
    try {
      styleOverrides = JSON.parse(localStorage.getItem('wordflow_style_overrides') || '{}');
    } catch {
      styleOverrides = {};
    }
    const currentOverride = styleOverrides?.[styleId] || {};
    const savedFont = String(wordPreferences.defaultFontStack || localStorage.getItem('default-font-stack') || wordPreferences.defaultFontFamily || localStorage.getItem('default-font') || '').trim();
    const savedSizeRaw = String(wordPreferences.defaultFontSize || localStorage.getItem('default-size') || '').trim();
    const savedSize = savedSizeRaw && /px|pt|em|rem$/i.test(savedSizeRaw) ? savedSizeRaw : (savedSizeRaw ? `${savedSizeRaw}pt` : '');
    dom.setAttribute('data-doc-style', styleId);
    dom.style.fontFamily = currentOverride.fontFamily || savedFont || preset.fontFamily;
    dom.style.fontSize = currentOverride.fontSize || savedSize || preset.fontSize;
    dom.style.lineHeight = currentOverride.lineHeight || preset.lineHeight;
    dom.style.padding = dom.dataset.customPadding || preset.padding;
    dom.style.maxWidth = dom.dataset.viewMode === 'print' ? (dom.dataset.customWidth || preset.maxWidth) : dom.style.maxWidth;
    dom.style.background = dom.dataset.customBackground || preset.background;
    dom.style.textAlign = preset.textAlign;
    dom.style.border = dom.dataset.customBorder || dom.style.border;
  }, [editor, wordPreferences]);

  const hasMeaningfulEditorContent = React.useCallback((currentEditor = editor) => {
    if (!currentEditor) return false;
    const html = String(currentEditor.getHTML?.() || '');
    const plain = String(currentEditor.getText?.() || '').trim();
    if (plain.length > 0) return true;
    return /<(img|table|hr|ul|ol|li|blockquote)\b|data-type="page-break"/i.test(html);
  }, [editor]);

  const resolveCurrentDraftFeedbackMeta = React.useCallback(() => {
    const templateId = activeTemplateId || 'blank';
    const editorText = String(editor?.getText?.() || '').trim();
    const prompt = getDraftTitleFromFilePath(currentFilePath)
      || getDraftTitleFromText(editorText, templateId)
      || GENERATION_LABEL_FALLBACKS[templateId]
      || GENERATION_LABEL_FALLBACKS.blank;
    const surveyPrompt = String(feedbackSurvey.prompt || '').trim();
    const surveyTemplateId = String(feedbackSurvey.templateId || '').trim() || 'blank';
    const matchesActiveDraft = Boolean(surveyPrompt)
      && surveyPrompt === prompt
      && surveyTemplateId === templateId;

    return {
      matchesActiveDraft,
      prompt,
      templateId,
      selectedMaterials: matchesActiveDraft && Array.isArray(feedbackSurvey.selectedMaterials)
        ? feedbackSurvey.selectedMaterials.filter(Boolean)
        : [],
      selectedModel: matchesActiveDraft ? String(feedbackSurvey.selectedModel || '').trim() : '',
      selectedProviderId: matchesActiveDraft ? String(feedbackSurvey.selectedProviderId || '').trim() : '',
      selectedProviderModel: matchesActiveDraft ? String(feedbackSurvey.selectedProviderModel || '').trim() : '',
    };
  }, [editor, currentFilePath, feedbackSurvey.prompt, feedbackSurvey.templateId, feedbackSurvey.selectedMaterials, feedbackSurvey.selectedModel, feedbackSurvey.selectedProviderId, feedbackSurvey.selectedProviderModel, activeTemplateId]);

  const openDraftRecommendations = React.useCallback(() => {
    if (feedbackSurvey.submitting || liveGeneration.state === 'running' || !hasMeaningfulEditorContent(editor)) {
      return;
    }

    const currentDraftContext = resolveCurrentDraftFeedbackMeta();
    if (showStartScreen) {
      setShowStartScreen(false);
    }
    setFeedbackSurvey((prev) => ({
      ...buildFeedbackSurveyStateWithGenerationContext(currentDraftContext, currentDraftContext.matchesActiveDraft ? prev : {}),
      open: true,
      phase: 'details',
    }));
  }, [editor, feedbackSurvey.submitting, hasMeaningfulEditorContent, liveGeneration.state, resolveCurrentDraftFeedbackMeta, showStartScreen]);

  const changeDocumentStyle = React.useCallback((styleId) => {
    const nextStyle = DOCUMENT_STYLE_PRESETS[styleId] ? styleId : 'academic';
    setDocumentStyle(nextStyle);
    localStorage.setItem('wordai_document_style', nextStyle);
    syncPersistedAppSettings();
    applyDocumentStyleToEditor(nextStyle);
  }, [applyDocumentStyleToEditor]);

  React.useEffect(() => {
    applyDocumentStyleToEditor(documentStyle);
  }, [documentStyle, wordPreferences.defaultFontFamily, wordPreferences.defaultFontSize, applyDocumentStyleToEditor]);

  const focusEditorSoon = React.useCallback((position = 'end') => {
    window.requestAnimationFrame(() => {
      try {
        editor?.chain().focus(position).run();
      } catch {}
    });
  }, [editor]);

  const completeStartTransition = React.useCallback((runId = startTransitionRunIdRef.current) => {
    if (runId !== startTransitionRunIdRef.current) return;
    if (startTransitionTimerRef.current) {
      window.clearTimeout(startTransitionTimerRef.current);
      startTransitionTimerRef.current = null;
    }
    setStartTransitionPhase('idle');
    setShowStartScreen(false);
    focusEditorSoon(pendingStartTransitionFocusRef.current || 'start');
  }, [focusEditorSoon]);

  const runStartTransition = React.useCallback((applyChange, focusPosition = 'start') => {
    if (!editor) {
      window.alert('העורך עדיין נטען. נסה שוב בעוד רגע.');
      return false;
    }
    applyChange(editor);
    pendingStartTransitionFocusRef.current = focusPosition;

    const runId = startTransitionRunIdRef.current + 1;
    startTransitionRunIdRef.current = runId;

    if (getPrefersReducedMotion() || !showStartScreen) {
      completeStartTransition(runId);
      return true;
    }

    if (startTransitionTimerRef.current) {
      window.clearTimeout(startTransitionTimerRef.current);
      startTransitionTimerRef.current = null;
    }
    setStartTransitionPhase('running');
    startTransitionTimerRef.current = window.setTimeout(() => {
      completeStartTransition(runId);
    }, START_SCREEN_TRANSITION_DURATION_MS);
    return true;
  }, [completeStartTransition, editor, showStartScreen]);

  const openExternalLink = React.useCallback((url) => {
    if (!url) return;
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      window.location.href = url;
    }
  }, []);

  const sanitizeLinkUrl = React.useCallback((rawUrl = '') => {
    const value = String(rawUrl || '').trim();
    if (!value) return '';
    if (/^mailto:/i.test(value)) return value;
    if (/^https?:\/\//i.test(value)) return value;
    return '';
  }, []);

  const requestInputDialog = React.useCallback((config = {}) => new Promise((resolve) => {
    const fields = Array.isArray(config.fields) ? config.fields : [];
    const nextValues = fields.reduce((acc, field) => {
      acc[field.id] = String(field.value ?? '');
      return acc;
    }, {});

    setInputDialog({
      open: true,
      title: config.title || 'השלם פרטים',
      description: config.description || '',
      fields,
      values: nextValues,
      confirmLabel: config.confirmLabel || 'אישור',
      closeOnEscape: config.closeOnEscape !== false,
      closeOnBackdrop: config.closeOnBackdrop === true,
      submitOnEnter: config.submitOnEnter !== false,
      submitOnCtrlEnterForTextarea: config.submitOnCtrlEnterForTextarea !== false,
      resolve,
    });
  }), []);

  const closeInputDialog = React.useCallback((result = null) => {
    setInputDialog((prev) => {
      try {
        prev.resolve?.(result);
      } catch {}
      return { ...DEFAULT_INPUT_DIALOG };
    });
  }, []);

  const submitInputDialog = React.useCallback(() => {
    closeInputDialog(inputDialog.values || {});
  }, [closeInputDialog, inputDialog.values]);

  const closeCopyleaksDetector = React.useCallback(() => {
    setCopyleaksDetector((prev) => (prev.open ? { ...DEFAULT_COPYLEAKS_DETECTOR } : prev));
  }, []);

  const copyPlainTextToClipboard = React.useCallback(async (text = '') => {
    const value = String(text || '');
    if (!value.trim()) return false;

    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        return copied;
      } catch {
        return false;
      }
    }
  }, []);

  const openCopyleaksDetector = React.useCallback((source = 'selection') => {
    const normalizedSource = COPYLEAKS_SOURCE_LABELS[source] ? source : 'selection';
    const nextText = normalizedSource === 'document'
      ? String(editor?.getText?.() || '')
      : normalizedSource === 'currentBlock'
        ? String(currentBlockText || '')
        : String(selectedText || '');

    if (normalizedSource === 'selection' && !nextText.trim()) {
      alert('אין כרגע טקסט מסומן לבדיקה.');
      return;
    }
    if (normalizedSource === 'currentBlock' && !nextText.trim()) {
      alert('לא זוהתה פסקה פעילה לבדיקה.');
      return;
    }
    if (normalizedSource === 'document' && !nextText.trim()) {
      alert('המסמך ריק כרגע.');
      return;
    }

    setCopyleaksDetector({
      ...DEFAULT_COPYLEAKS_DETECTOR,
      open: true,
      source: normalizedSource,
      sourceLabel: COPYLEAKS_SOURCE_LABELS[normalizedSource],
      text: nextText,
    });
  }, [currentBlockText, editor, selectedText]);

  const openCopyleaksSettingsPanel = React.useCallback(() => {
    closeCopyleaksDetector();
    setFileMenuTargetTab('ai');
    setFileMenuOpen(true);
  }, [closeCopyleaksDetector]);

  const submitCopyleaksDetector = React.useCallback(async () => {
    const stats = getCopyleaksTextStats(copyleaksDetector.text);
    const validationMessage = getCopyleaksValidationMessage(copyleaksDetector.text);
    const copyleaksConfig = normalizeCopyleaksConfig(getProviderConfig().copyleaks);

    if (!copyleaksConfig.email || !copyleaksConfig.key) {
      setCopyleaksDetector((prev) => ({
        ...prev,
        submitting: false,
        result: null,
        error: 'לפני שמריצים בדיקה, מלאו בהגדרות את האימייל והמפתח הסודי של Copyleaks.',
      }));
      return;
    }

    if (!stats.isValid) {
      setCopyleaksDetector((prev) => ({
        ...prev,
        submitting: false,
        result: null,
        error: validationMessage || 'הטקסט לא עומד במגבלות Copyleaks.',
      }));
      return;
    }

    setCopyleaksDetector((prev) => ({
      ...prev,
      submitting: true,
      error: '',
      result: null,
    }));

    try {
      const result = await detectCopyleaksText(copyleaksConfig, copyleaksDetector.text);
      setCopyleaksDetector((prev) => ({
        ...prev,
        submitting: false,
        error: '',
        result,
      }));
    } catch (error) {
      setCopyleaksDetector((prev) => ({
        ...prev,
        submitting: false,
        result: null,
        error: error?.message || 'Copyleaks לא הצליח להשלים את הבדיקה.',
      }));
    }
  }, [copyleaksDetector.text]);

  const toggleFeedbackOption = React.useCallback((option) => {
    setFeedbackSurvey((prev) => ({
      ...prev,
      selectedOptions: prev.selectedOptions.includes(option)
        ? prev.selectedOptions.filter((item) => item !== option)
        : [...prev.selectedOptions, option],
    }));
  }, []);

  const submitDocumentFeedback = React.useCallback(async () => {
    const selectedOptions = feedbackSurvey.selectedOptions || [];
    const freeText = String(feedbackSurvey.freeText || '').trim();
    const requestedExecutionMode = normalizeFeedbackExecutionMode(feedbackSurvey.executionMode);
    const workflowAvailable = isFeedbackWorkflowAvailable();
    const executionMode = requestedExecutionMode === 'workspace' && workflowAvailable ? 'workspace' : 'direct';
    const roundIndex = normalizeFeedbackRoundIndex(feedbackSurvey.roundIndex);
    const surveySnapshot = {
      ...feedbackSurvey,
      selectedOptions: [...selectedOptions],
      freeText,
      executionMode,
      roundIndex,
      phase: 'details',
      reviewResult: null,
      reviewFocus: '',
      reviewErrorMessage: '',
    };

    if (roundIndex > FEEDBACK_MAX_REVISION_ROUNDS) {
      alert('מיצית את שני סבבי התיקון הזמינים למסך הזה. אפשר לרענן המלצות או להמשיך לערוך ידנית.');
      return;
    }

    if (!selectedOptions.length && !freeText) {
      alert('בחר לפחות אפשרות אחת או כתוב הערה חופשית.');
      return;
    }

    const feedbackText = buildFeedbackSurveyRequestText({
      selectedOptions,
      freeText,
      includeIntro: true,
    });

    await runDocumentFeedbackRevision({
      kind: 'feedback-revision',
      workspaceId: getActiveWorkspaceId(),
      payload: {
        existingHtml: editor?.getHTML?.() || '',
        originalPrompt: feedbackSurvey.prompt,
        templateId: feedbackSurvey.templateId || activeTemplateId || 'blank',
        feedback: feedbackText,
        selectedMaterials: Array.isArray(feedbackSurvey.selectedMaterials) ? feedbackSurvey.selectedMaterials.filter(Boolean) : [],
        selectedModel: String(feedbackSurvey.selectedModel || '').trim(),
        selectedProviderId: String(feedbackSurvey.selectedProviderId || '').trim(),
        selectedProviderModel: String(feedbackSurvey.selectedProviderModel || '').trim(),
        executionMode,
        roundIndex,
        surveySnapshot,
      },
    });
  }, [activeTemplateId, editor, feedbackSurvey]);

  const requestDocumentRecommendations = React.useCallback(async () => {
    const selectedOptions = feedbackSurvey.selectedOptions || [];
    const freeText = String(feedbackSurvey.freeText || '').trim();
    const reviewFocus = buildFeedbackSurveyRequestText({
      selectedOptions,
      freeText,
      includeIntro: false,
    });
    const surveySnapshot = {
      ...feedbackSurvey,
      selectedOptions: [...selectedOptions],
      freeText,
      phase: 'details',
      reviewResult: null,
      reviewFocus,
      reviewErrorMessage: '',
    };

    await runDocumentRecommendationsReview({
      kind: 'review-recommendations',
      workspaceId: getActiveWorkspaceId(),
      payload: {
        existingHtml: editor?.getHTML?.() || '',
        originalPrompt: feedbackSurvey.prompt,
        templateId: feedbackSurvey.templateId || activeTemplateId || 'blank',
        selectedMaterials: Array.isArray(feedbackSurvey.selectedMaterials) ? feedbackSurvey.selectedMaterials.filter(Boolean) : [],
        selectedModel: String(feedbackSurvey.selectedModel || '').trim(),
        selectedProviderId: String(feedbackSurvey.selectedProviderId || '').trim(),
        selectedProviderModel: String(feedbackSurvey.selectedProviderModel || '').trim(),
        focus: reviewFocus,
        surveySnapshot,
      },
    });
  }, [activeTemplateId, editor, feedbackSurvey]);

  const closeFeedbackSurvey = React.useCallback(() => {
    setFeedbackSurvey((prev) => {
      if (prev.submitting) {
        return prev;
      }

      return {
        ...buildFeedbackSurveyStateWithGenerationContext(prev),
        open: false,
        phase: 'details',
      };
    });
  }, []);

  const openHomeSafely = React.useCallback(() => {
    cancelStartTransition();

    if (typeof document !== 'undefined') {
      const wrapper = document.getElementById('editor-wrapper');
      const activeElement = document.activeElement;

      if (wrapper instanceof HTMLElement && activeElement instanceof HTMLElement && wrapper.contains(activeElement)) {
        activeElement.blur();
      }
    }

    closeInputDialog(null);
    setFeedbackSurvey((prev) => (prev.open ? { ...prev, open: false } : prev));
    setShowStartScreen(true);
  }, [cancelStartTransition, closeInputDialog]);

  const approveFeedbackSurvey = React.useCallback(() => {
    setFeedbackSurvey((prev) => ({
      ...buildFeedbackSurveyStateWithGenerationContext(prev),
      open: false,
      phase: 'details',
    }));
    setLiveGeneration((prev) => ({ ...prev, active: false }));
  }, []);

  const currentWorkspaceId = getActiveWorkspaceId();
  const currentProviderConfig = getProviderConfig();
  const configuredProviderChoices = getConfiguredProviderChoices(currentProviderConfig);
  const feedbackWorkflowAvailable = isFeedbackWorkflowAvailable();
  const feedbackExecutionMode = normalizeFeedbackExecutionMode(feedbackSurvey.executionMode);
  const effectiveFeedbackExecutionMode = feedbackExecutionMode === 'workspace' && feedbackWorkflowAvailable ? 'workspace' : 'direct';
  const feedbackRoundIndex = normalizeFeedbackRoundIndex(feedbackSurvey.roundIndex);
  const feedbackRoundsExhausted = feedbackRoundIndex > FEEDBACK_MAX_REVISION_ROUNDS;
  const feedbackRevisionPending = feedbackSurvey.submitting && String(liveGeneration.runId || '').startsWith('doc-feedback');
  const feedbackSubmitLabel = feedbackRoundsExhausted
    ? 'מוצו סבבי התיקון'
    : effectiveFeedbackExecutionMode === 'workspace'
      ? (feedbackRevisionPending ? 'מעדכן עם צוות הסוכנים...' : 'שלח לעדכון עם צוות הסוכנים')
      : (feedbackRevisionPending ? 'מעדכן...' : 'שלח לעדכון ישיר');
  const liveGenerationStages = Array.isArray(liveGeneration.summary?.stages) ? liveGeneration.summary.stages : [];
  const failedGenerationStage = liveGeneration.state === 'error'
    ? [...liveGenerationStages].reverse().find((stage) => stage?.state === 'error' && stage?.id) || null
    : null;
  const activeWorkspaceAgents = lastGenerationAction?.workspaceId === currentWorkspaceId && liveGeneration.workspaceId === currentWorkspaceId
    ? getRoleAgents()
    : [];
  const failedStageAgentRecord = failedGenerationStage
    ? activeWorkspaceAgents.find((agent) => agent.id === failedGenerationStage.id) || null
    : null;
  const failedStageCurrentProvider = failedStageAgentRecord?.provider || failedGenerationStage?.provider || '';
  const failedStageCurrentModel = failedStageAgentRecord?.model || failedGenerationStage?.model || '';
  const recoveryModelChoices = getProviderModelChoices(
    generationRecovery.provider || failedStageCurrentProvider,
    currentProviderConfig,
    [failedGenerationStage?.model, failedStageAgentRecord?.model].filter(Boolean),
  );
  const canRetryFailedGeneration = Boolean(
    liveGeneration.state === 'error'
    && failedGenerationStage?.id
    && failedStageAgentRecord
    && lastGenerationAction?.payload
    && lastGenerationAction.workspaceId === currentWorkspaceId
    && liveGeneration.workspaceId === currentWorkspaceId
    && configuredProviderChoices.length
  );
  const failedStageProviderLabel = configuredProviderChoices.find((item) => item.id === failedStageCurrentProvider)?.label || failedStageCurrentProvider || 'לא הוגדר';
  const failedStageModelLabel = failedStageCurrentModel || 'לא הוגדר';

  React.useEffect(() => {
    if (!canRetryFailedGeneration) {
      setGenerationRecovery((prev) => (
        prev.runId || prev.agentId || prev.provider || prev.model || prev.error || prev.pending
          ? { runId: '', agentId: '', provider: '', model: '', pending: false, error: '' }
          : prev
      ));
      return;
    }

    const initialProvider = configuredProviderChoices.some((item) => item.id === failedStageCurrentProvider)
      ? failedStageCurrentProvider
      : (configuredProviderChoices[0]?.id || '');
    const initialModels = getProviderModelChoices(initialProvider, currentProviderConfig, [failedGenerationStage?.model, failedStageAgentRecord?.model].filter(Boolean));
    const preferredModel = failedStageCurrentModel && initialModels.includes(failedStageCurrentModel)
      ? failedStageCurrentModel
      : (initialModels[0] || '');

    setGenerationRecovery((prev) => {
      if (prev.runId === liveGeneration.runId && prev.agentId === failedGenerationStage.id) {
        return prev;
      }
      return {
        runId: liveGeneration.runId,
        agentId: failedGenerationStage.id,
        provider: initialProvider,
        model: preferredModel,
        pending: false,
        error: '',
      };
    });
  }, [canRetryFailedGeneration, configuredProviderChoices, currentProviderConfig, failedGenerationStage, failedStageAgentRecord, failedStageCurrentModel, failedStageCurrentProvider, liveGeneration.runId]);

  const handleRecoveryProviderChange = React.useCallback((event) => {
    const nextProvider = String(event.target.value || '').trim();
    const nextModels = getProviderModelChoices(nextProvider, getProviderConfig(), [failedGenerationStage?.model, failedStageAgentRecord?.model].filter(Boolean));
    setGenerationRecovery((prev) => ({
      ...prev,
      provider: nextProvider,
      model: nextModels[0] || '',
      error: '',
    }));
  }, [failedGenerationStage, failedStageAgentRecord]);

  const handleRecoveryModelChange = React.useCallback((event) => {
    const nextModel = String(event.target.value || '').trim();
    setGenerationRecovery((prev) => ({
      ...prev,
      model: nextModel,
      error: '',
    }));
  }, []);

  const retryFailedGenerationWithUpdatedAgent = React.useCallback(async () => {
    if (!canRetryFailedGeneration || generationRecovery.pending) return;

    const nextProvider = String(generationRecovery.provider || '').trim();
    const nextModel = String(generationRecovery.model || '').trim();
    if (!nextProvider || !nextModel) {
      setGenerationRecovery((prev) => ({ ...prev, error: 'בחר provider ומודל תקפים לפני ההרצה מחדש.' }));
      return;
    }

    const latestEditorHtml = editor?.getHTML?.() || '';
    const agents = getRoleAgents();
    const targetAgent = agents.find((agent) => agent.id === failedGenerationStage.id);
    if (!targetAgent) {
      setGenerationRecovery((prev) => ({ ...prev, error: 'לא מצאתי את הסוכן שנכשל בסביבת העבודה הפעילה.' }));
      return;
    }

    const updated = updateCurrentWorkspace({
      agents: agents.map((agent) => (agent.id === targetAgent.id ? { ...agent, provider: nextProvider, model: nextModel } : agent)),
    });
    if (!updated) {
      setGenerationRecovery((prev) => ({ ...prev, error: 'לא הצלחתי לעדכן את הסוכן בסביבת העבודה הפעילה.' }));
      return;
    }

    setGenerationRecovery((prev) => ({ ...prev, pending: true, error: '' }));
    try {
      const started = await runStoredGenerationAction({
        ...lastGenerationAction,
        workspaceId: currentWorkspaceId,
        payload: {
          ...(lastGenerationAction?.payload || {}),
          ...((lastGenerationAction?.kind === 'feedback-revision' || lastGenerationAction?.kind === 'review-recommendations')
            ? { existingHtml: latestEditorHtml }
            : {}),
        },
      }, { skipConfirmReplace: true });
      if (!started) {
        setGenerationRecovery((prev) => ({ ...prev, error: 'לא הצלחתי להפעיל מחדש את הפעולה האחרונה.' }));
      }
    } finally {
      setGenerationRecovery((prev) => ({ ...prev, pending: false }));
    }
  }, [canRetryFailedGeneration, currentWorkspaceId, editor, failedGenerationStage, generationRecovery.model, generationRecovery.pending, generationRecovery.provider, lastGenerationAction]);

  const updateActiveFormats = React.useCallback((currentEditor) => {
    if (!currentEditor) return;
    const textStyleAttrs = currentEditor.getAttributes('textStyle') || {};
    const rawFontFamily = String(textStyleAttrs.fontFamily || window.getComputedStyle(currentEditor.view.dom).fontFamily || 'Alef');
    const fontFamily = rawFontFamily.split(',')[0].replace(/["']/g, '').trim() || 'Alef';
    const rawFontSize = String(textStyleAttrs.fontSize || window.getComputedStyle(currentEditor.view.dom).fontSize || '12pt');
    const fontSize = normalizeFontSizeValue(rawFontSize);

    setActiveFormats({
      bold: currentEditor.isActive('bold'),
      italic: currentEditor.isActive('italic'),
      underline: currentEditor.isActive('underline'),
      strike: currentEditor.isActive('strike'),
      bulletList: currentEditor.isActive('bulletList'),
      orderedList: currentEditor.isActive('orderedList'),
      alignRight: currentEditor.isActive({ textAlign: 'right' }),
      alignCenter: currentEditor.isActive({ textAlign: 'center' }),
      alignLeft: currentEditor.isActive({ textAlign: 'left' }),
      alignJustify: currentEditor.isActive({ textAlign: 'justify' }),
      dir: currentEditor.getAttributes('paragraph')?.dir || 'rtl',
      fontFamily,
      fontSize,
    });
  }, []);

  React.useEffect(() => {
    const syncLiveGeneration = (event) => {
      const nextAutomation = getWorkspaceAutomation();
      const nextWorkspaceId = getActiveWorkspaceId();
      const previousWorkspaceId = activeWorkspaceIdRef.current;
      const isWorkspaceChange = event?.type === 'wordai-workspace-changed';
      const hasWorkspaceSwitched = isWorkspaceChange && previousWorkspaceId !== nextWorkspaceId;
      if (hasWorkspaceSwitched) {
        workspaceEpochRef.current += 1;
        setFeedbackSurvey({ ...DEFAULT_FEEDBACK_SURVEY });
      }
      setLiveGeneration((prev) => {
        const scopedRunId = hasWorkspaceSwitched ? '' : String(prev.runId || '').trim();
        const scopedWorkspaceId = nextWorkspaceId || previousWorkspaceId;
        return {
          ...(hasWorkspaceSwitched
            ? { active: false, state: 'idle', prompt: '', runId: '' }
            : prev),
          summary: getLatestAgentRunSummary(nextAutomation, scopedRunId),
          logs: getRecentAgentLogs(18, { workspaceId: scopedWorkspaceId, runId: scopedRunId }),
          runId: scopedRunId,
          workspaceId: scopedWorkspaceId,
        };
      });
      activeWorkspaceIdRef.current = nextWorkspaceId || previousWorkspaceId;
    };

    syncLiveGeneration();
    window.addEventListener('wordai-agent-logs-updated', syncLiveGeneration);
    window.addEventListener('wordai-workspace-changed', syncLiveGeneration);
    return () => {
      window.removeEventListener('wordai-agent-logs-updated', syncLiveGeneration);
      window.removeEventListener('wordai-workspace-changed', syncLiveGeneration);
    };
  }, []);

  React.useEffect(() => {
    if (!editor) return;
    if (liveGeneration.state !== 'running') {
      lastLiveGenerationShellRef.current = { runId: '', html: '' };
      return;
    }

    const currentHtml = normalizeTrackedEditorHtml(String(editor.getHTML?.() || ''));
    const lastShell = lastLiveGenerationShellRef.current;
    if (!lastShell.html || lastShell.runId !== liveGeneration.runId || currentHtml !== lastShell.html) {
      lastLiveGenerationShellRef.current = { runId: '', html: '' };
      return;
    }
    if (!isLiveGenerationShellHtml(currentHtml, liveGeneration.runId)) {
      lastLiveGenerationShellRef.current = { runId: '', html: '' };
      return;
    }

    const nextShell = buildLiveGenerationShell({
      titleText: liveGeneration.prompt || 'מסמך חדש',
      state: liveGeneration.state,
      stages: liveGeneration.summary?.stages || [],
      logs: liveGeneration.logs || [],
      runId: liveGeneration.runId,
    });

    if (currentHtml === nextShell) return;
    editor.commands.setContent(nextShell, false);
    lastLiveGenerationShellRef.current = {
      runId: liveGeneration.runId,
      html: normalizeTrackedEditorHtml(String(editor.getHTML?.() || nextShell)),
    };
  }, [editor, liveGeneration.state, liveGeneration.prompt, liveGeneration.summary, liveGeneration.logs, liveGeneration.runId]);

  // Ref allows the keyboard shortcut effect to call handleCommand without
  // adding it to the dependency array (which would cause a TDZ error since
  // handleCommand is defined later in the component body).
  const handleCommandRef = React.useRef(null);

  React.useEffect(() => {
    const handler = (e) => {
      if (matchShortcut(e, shortcuts.toggleAssistant)) {
        e.preventDefault();
        setAssistantTrigger('manual');
        setLastEditorActivityAt(Date.now());
        setSidebarOpen(v => !v);
        return;
      }

      if (matchShortcut(e, shortcuts.openFileMenu)) {
        e.preventDefault();
        setFileMenuTargetTab(null);
        setFileMenuOpen(true);
        return;
      }

      if (matchShortcut(e, shortcuts.saveLocal)) {
        e.preventDefault();
        handleCommandRef.current?.('saveLocal');
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [shortcuts, editor]);

  React.useEffect(() => {
    const isInputDialogVisible = inputDialog.open;
    const isCopyleaksDetectorVisible = copyleaksDetector.open && !showStartScreen;
    const isFeedbackSurveyVisible = feedbackSurvey.open && !showStartScreen;
    const topmostOverlay = fileMenuOpen
      ? ''
      : isInputDialogVisible && inputDialog.closeOnEscape !== false
        ? 'input-dialog'
        : isCopyleaksDetectorVisible
          ? 'copyleaks-detector'
        : isFeedbackSurveyVisible
          ? 'feedback-survey'
          : sidebarOpen && !showStartScreen
            ? 'ai-sidebar'
            : '';
    if (!topmostOverlay) return;

    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;

      if (topmostOverlay === 'input-dialog') {
        event.preventDefault();
        closeInputDialog(null);
        return;
      }

      if (topmostOverlay === 'copyleaks-detector') {
        event.preventDefault();
        closeCopyleaksDetector();
        return;
      }

      if (topmostOverlay === 'feedback-survey') {
        event.preventDefault();
        closeFeedbackSurvey();
        return;
      }

      event.preventDefault();
      closeAssistantPopup();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [
    inputDialog.open,
    inputDialog.closeOnEscape,
    copyleaksDetector.open,
    feedbackSurvey.open,
    sidebarOpen,
    fileMenuOpen,
    showStartScreen,
    closeInputDialog,
    closeCopyleaksDetector,
    closeFeedbackSurvey,
  ]);

  const initializedDocRef = React.useRef(false);

  const openUpdatesPanel = React.useCallback(() => {
    setFileMenuTargetTab('updates');
    setFileMenuOpen(true);
    setUpdateCheckToken((prev) => prev + 1);
  }, []);

  const handleEditorReady = React.useCallback((ed, helpers) => {
    setEditor(ed);
    updateActiveFormats(ed);
    if (helpers) {
      formatPainterRef.current = helpers;
      setFormatPainterActive(helpers.formatPainterActive);
    }
  }, [updateActiveFormats]);

  // מעקב אחר בחירת טקסט + מצב עיצוב פעיל
  React.useEffect(() => {
    if (!editor) return;
    let frameId = null;

    const syncState = (includePages = false) => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const { doc, selection } = editor.state;
        const { from, to, empty } = selection;
        const selectionText = empty ? '' : doc.textBetween(from, to, ' ');
        const docEnd = doc.content.size;
        setSelectedText(selectionText);
        setSelectionContext(empty ? null : {
          before: doc.textBetween(Math.max(0, from - MAGIC_WAND_SELECTION_CONTEXT_SIDE), from, ' ').trim(),
          selection: selectionText,
          after: doc.textBetween(to, Math.min(docEnd, to + MAGIC_WAND_SELECTION_CONTEXT_SIDE), ' ').trim(),
        });
        setCurrentBlockText(editor.state.selection.$from.parent?.textContent || '');
        setLastEditorActivityAt(Date.now());
        if (includePages) {
          let markers = 0;
          editor.state.doc.descendants((node) => {
            if (node.type?.name === 'pageBreak') markers += 1;
          });
          setPageCount(markers + 1);
        }
        updateActiveFormats(editor);
      });
    };

    const handleSelection = () => syncState(false);
    const handleUpdate = () => syncState(true);
    const markManualEdit = () => setLastManualStyleLearningAt(Date.now());
    const dom = editor.view?.dom;

    syncState(true);
    editor.on('selectionUpdate', handleSelection);
    editor.on('update', handleUpdate);
    dom?.addEventListener('input', markManualEdit);
    dom?.addEventListener('paste', markManualEdit);
    dom?.addEventListener('drop', markManualEdit);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      editor.off('selectionUpdate', handleSelection);
      editor.off('update', handleUpdate);
      dom?.removeEventListener('input', markManualEdit);
      dom?.removeEventListener('paste', markManualEdit);
      dom?.removeEventListener('drop', markManualEdit);
    };
  }, [editor, updateActiveFormats]);

  React.useEffect(() => {
    if (editor) applyDocumentStyleToEditor(documentStyle, editor);
  }, [editor, documentStyle, applyDocumentStyleToEditor]);

  React.useEffect(() => {
    if (!editor || initializedDocRef.current || !settingsHydrated || pendingStartupDocument) return;

    const shouldShowHome = isLegacyHomeEnabled() ? true : wordPreferences.showStartExperience !== false;
    const savedDraft = wordPreferences.keepLastAutosavedVersion === false
      ? null
      : getPersistedDraftHtml();
    const profile = getPersonalStyleProfile();

    if (shouldShowHome) {
      setShowStartScreen(true);
    } else if (savedDraft && editor.isEmpty) {
      editor.commands.setContent(savedDraft);
      focusEditorSoon('end');
    } else {
      setShowStartScreen(false);
      focusEditorSoon('start');
    }

    if (shouldAutoOpenOnboarding(profile)) {
      setFileMenuTargetTab('onboarding');
      setFileMenuOpen(true);
    }

    initializedDocRef.current = true;
  }, [editor, settingsHydrated, wordPreferences, focusEditorSoon, pendingStartupDocument]);

  React.useEffect(() => {
    if (!editor) return;
    const page = document.querySelector('.ProseMirror');
    if (!page) return;
    page.setAttribute('spellcheck', wordPreferences.checkSpellingAsYouType === false ? 'false' : 'true');
    page.setAttribute('autocorrect', 'on');
    page.setAttribute('autocomplete', 'on');
  }, [editor, wordPreferences]);

  React.useEffect(() => {
    if (wordPreferences.keepLastAutosavedVersion === false) {
      clearPersistedAutosaveCache();
    }
  }, [wordPreferences.keepLastAutosavedVersion]);

  React.useEffect(() => {
    if (!editor || !lastManualStyleLearningAt) return;

    const timer = window.setTimeout(() => {
      try {
        const html = String(editor.getHTML?.() || '');
        learnFromDocumentDraft({
          html,
          title: currentFilePath || 'המסמך הפעיל',
        });
      } catch {}
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [editor, lastManualStyleLearningAt, currentFilePath]);

  React.useEffect(() => {
    if (!editor || wordPreferences.autoSave === false) return;

    const saveSnapshot = () => {
      if (wordPreferences.keepLastAutosavedVersion === false) return;
      if (!hasMeaningfulEditorContent(editor)) return;
      const html = editor.getHTML();
      persistAutosaveSnapshot(html);
    };

    const interval = window.setInterval(
      saveSnapshot,
      Math.max(1, Number(wordPreferences.autoSaveMinutes || 10)) * 60 * 1000,
    );

    window.addEventListener('beforeunload', saveSnapshot);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('beforeunload', saveSnapshot);
    };
  }, [editor, wordPreferences]);

  React.useEffect(() => {
    if (!editor || sidebarOpen || assistantBehavior.autoPopup === false) return;
    const hasText = editor.getText().trim().length > 0;
    if (!hasText) return;

    const timer = window.setTimeout(() => {
      const activeInEditor = document.activeElement?.closest?.('.ProseMirror');
      if (activeInEditor && !sidebarOpen) {
        setAssistantTrigger('idle');
        setSidebarCompact(false);
        setSidebarOpen(true);
      }
    }, Math.max(3, Number(assistantBehavior.idleSeconds || 5)) * 1000);

    return () => window.clearTimeout(timer);
  }, [editor, lastEditorActivityAt, sidebarOpen, assistantBehavior]);

  const closeAssistantPopup = React.useCallback(() => {
    setSidebarOpen(false);
    setAssistantTrigger('manual');
    setLastEditorActivityAt(Date.now());
  }, []);

  const hasMeaningfulContent = React.useCallback(() => {
    return hasMeaningfulEditorContent(editor);
  }, [editor, hasMeaningfulEditorContent]);

  const confirmReplaceCurrentDocument = React.useCallback(() => {
    if (!hasMeaningfulContent()) return true;
    return window.confirm('יש במסמך תוכן קיים. להחליף אותו?');
  }, [hasMeaningfulContent]);

  const downloadFile = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const persistLocalCache = React.useCallback((html) => {
    persistLocalDraftCache(html);
  }, []);

  const executeStartScreenGeneration = React.useCallback(async (action, options = {}) => {
    const payload = action?.payload || {};
    if (!editor) {
      window.alert('העורך עדיין נטען. נסה שוב בעוד רגע.');
      return false;
    }
    if (!options.skipConfirmReplace && !confirmReplaceCurrentDocument()) return false;

    const resolvedAction = {
      ...action,
      kind: 'start-screen-generate',
      workspaceId: action?.workspaceId || getActiveWorkspaceId(),
    };

    const prompt = String(payload.prompt || '').trim();
    const templateId = String(payload.templateId || 'blank').trim() || 'blank';
    const instructions = String(payload.instructions || '').trim();
    const selectedMaterials = Array.isArray(payload.selectedMaterials) ? payload.selectedMaterials.filter(Boolean) : [];
    const selectedProviderId = String(payload.selectedProviderId || payload.selectedModel || '').trim();
    const selectedProviderModel = String(payload.selectedProviderModel || '').trim();
    const selectedModel = selectedProviderId;
    const requestedStyle = String(payload.documentStyle || '').trim();
    const baseDraft = payload.baseDraft && typeof payload.baseDraft === 'object' ? { ...payload.baseDraft } : null;
    const additionalReviewRounds = Math.max(0, Math.min(2, Number(payload.additionalReviewRounds) || 0));
    const suppressDeferredReviewOffer = payload.suppressDeferredReviewOffer === true;
    const forceDirectMode = payload.forceDirectMode === true;
    const preserveCurrentDocumentOnError = payload.preserveCurrentDocumentOnError === true;

    setCurrentFilePath('');
  persistActiveTemplateId(templateId);
    syncPersistedAppSettings();
    setActiveTemplateId(templateId);
    setFeedbackSurvey({ ...DEFAULT_FEEDBACK_SURVEY });
    changeDocumentStyle(requestedStyle || documentStyle);
    setAssistantTrigger('autopilot');
    setSidebarCompact(false);
    setSidebarOpen(true);

    const generationRequest = beginGenerationRequest('doc');
    const originWorkspaceId = generationRequest.workspaceId;
    const hasBaseDraft = Boolean(String(baseDraft?.html || '').trim());
    const baseDraftTitle = String(baseDraft?.title || baseDraft?.name || '').trim();
    const generationRoute = hasBaseDraft ? 'reviseDocumentWithFeedback' : 'generateDocumentFromPrompt';
    const revisionRequest = hasBaseDraft
      ? buildBaseDraftRevisionRequest({
          promptText: prompt,
          instructionsText: instructions,
          baseDraftTitle,
          templateId,
        })
      : null;
    const inspectorPrompt = hasBaseDraft
      ? String(revisionRequest?.originalPrompt || baseDraftTitle || 'טיוטת בסיס').trim()
      : prompt;
    const inspectorInstructions = hasBaseDraft
      ? String(revisionRequest?.feedback || DEFAULT_BASE_DRAFT_REFINEMENT_REQUEST).trim()
      : instructions;
    const isKnownDirectStartScreenRoute = String(resolvedAction.workspaceId || '').trim() === '__no-workspace__'
      && Boolean(selectedProviderId);
    const generationLabel = hasBaseDraft
      ? String(revisionRequest?.title || baseDraftTitle || 'טיוטת בסיס').trim() || 'טיוטת בסיס'
      : buildGenerationLabel({ promptText: prompt, instructionsText: instructions, templateId });
    setLastGenerationAction({
      ...resolvedAction,
      runId: generationRequest.runId,
      inspector: buildStartScreenGenerationInspector({
        runId: generationRequest.runId,
        prompt: inspectorPrompt,
        instructions: inspectorInstructions,
        selectedMaterials,
        templateId,
        baseDraft,
        selectedProviderId,
        selectedProviderModel,
        route: generationRoute,
        routeMode: isKnownDirectStartScreenRoute ? 'direct' : '',
        routeModeReason: isKnownDirectStartScreenRoute ? 'providerOverride' : '',
      }),
    });
    const initialSummary = getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId);
    const initialLogs = getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId });

    setLiveGeneration({
      active: true,
      state: 'running',
      prompt: generationLabel,
      summary: initialSummary,
      logs: initialLogs,
      runId: generationRequest.runId,
      workspaceId: originWorkspaceId,
    });

    const initialShell = buildLiveGenerationShell({
      titleText: generationLabel,
      state: 'running',
      stages: initialSummary?.stages || [],
      logs: initialLogs,
      runId: generationRequest.runId,
    });
    preLiveGenerationSnapshotRef.current = {
      runId: generationRequest.runId,
      html: normalizeTrackedEditorHtml(String(editor.getHTML?.() || '')),
    };
    const didStartTransition = await runStartTransition(async (activeEditor) => {
      activeEditor.commands.setContent(initialShell);
      lastLiveGenerationShellRef.current = {
        runId: generationRequest.runId,
        html: normalizeTrackedEditorHtml(String(activeEditor.getHTML?.() || initialShell)),
      };
    }, 'start');
    if (!didStartTransition) return false;

    try {
      const result = hasBaseDraft
        ? await reviseDocumentWithFeedback({
            existingHtml: baseDraft.html,
            originalPrompt: revisionRequest?.originalPrompt || baseDraftTitle || 'טיוטת בסיס',
            templateId,
            feedback: revisionRequest?.feedback || DEFAULT_BASE_DRAFT_REFINEMENT_REQUEST,
            selectedMaterials,
            selectedModel,
            selectedProviderId,
            selectedProviderModel,
            additionalReviewRounds,
            forceDirectMode,
            runId: generationRequest.runId,
            returnMeta: true,
          })
        : await generateDocumentFromPrompt({ prompt, templateId, instructions, selectedMaterials, selectedModel, selectedProviderId, selectedProviderModel, additionalReviewRounds, runId: generationRequest.runId, returnMeta: true });
      const resolvedTitle = hasBaseDraft
        ? String(generationLabel || baseDraftTitle || 'טיוטת בסיס').trim()
        : String(result?.title || generationLabel || 'מסמך חדש').trim();
      const generated = result?.html || (hasBaseDraft
        ? String(baseDraft?.html || '').trim() || `<h1>${escHtml(resolvedTitle)}</h1><p>לא נוצר תוכן.</p>`
        : `<h1>${escHtml(resolvedTitle)}</h1><p>לא נוצר תוכן.</p>`);
      const usedFallback = Boolean(result?.usedFallback);
      if (!isGenerationRequestCurrent(generationRequest)) return true;
      const latestSummary = getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId);
      const latestLogs = getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId });
      const resolvedInspectorMeta = resolveStartScreenGenerationInspectorMeta({ summary: latestSummary, logs: latestLogs });

      lastLiveGenerationShellRef.current = { runId: '', html: '' };
      lastLiveGenerationPlaceholderRef.current = { runId: '', html: '' };
      editor.commands.setContent(generated);
      triggerDocumentArrival(usedFallback ? 'warning' : 'success');
      saveDocumentHistory({ title: resolvedTitle, content: generated, templateId, source: 'start-screen' });
      persistLocalCache(generated);
      setLiveGeneration((prev) => ({ ...prev, active: true, state: usedFallback ? 'warning' : 'success', prompt: usedFallback ? 'נוצרה טיוטה בטוחה לבדיקה ושיפור' : resolvedTitle, summary: latestSummary, logs: latestLogs, runId: generationRequest.runId, workspaceId: originWorkspaceId }));
      setLastGenerationAction((prev) => (prev?.runId !== generationRequest.runId ? prev : {
        ...prev,
        inspector: {
          ...(prev?.inspector || {}),
          requestedProviderId: resolvedInspectorMeta.requestedProviderId || String(prev?.inspector?.requestedProviderId || '').trim(),
          requestedProviderModel: resolvedInspectorMeta.requestedProviderModel || String(prev?.inspector?.requestedProviderModel || '').trim(),
          routeMode: resolvedInspectorMeta.routeMode || String(prev?.inspector?.routeMode || '').trim(),
          routeModeReason: resolvedInspectorMeta.routeModeReason || String(prev?.inspector?.routeModeReason || '').trim(),
          usedFallback,
          errorMessage: String(result?.errorMessage || '').trim(),
          liveState: usedFallback ? 'warning' : 'success',
          routeResolved: generationRoute,
        },
      }));
      setFeedbackSurvey({
        ...buildFeedbackSurveyStateWithGenerationContext({}, {
          prompt: resolvedTitle,
          templateId,
          usedFallback,
          selectedMaterials,
          selectedModel,
          selectedProviderId,
          selectedProviderModel,
        }),
        open: false,
        phase: 'details',
      });

      const deferredReviewOffer = suppressDeferredReviewOffer
        ? null
        : buildDeferredReviewOffer({
            logs: latestLogs,
            additionalReviewRounds,
            usedFallback,
          });

      if (deferredReviewOffer && window.confirm(deferredReviewOffer.confirmMessage)) {
        const followUpInstructions = [
          String(instructions || '').trim(),
          deferredReviewOffer.feedback,
        ].filter(Boolean).join('\n\n');

        return executeStartScreenGeneration({
          ...resolvedAction,
          payload: {
            prompt,
            templateId,
            instructions: followUpInstructions,
            selectedMaterials,
            selectedModel,
            selectedProviderId,
            selectedProviderModel,
            baseDraft: {
              html: generated,
              title: resolvedTitle,
            },
            additionalReviewRounds: 1,
            suppressDeferredReviewOffer: true,
            forceDirectMode: resolvedInspectorMeta.routeMode === 'direct',
            preserveCurrentDocumentOnError: true,
          },
        }, {
          ...options,
          skipConfirmReplace: true,
        });
      }
    } catch (error) {
      if (!isGenerationRequestCurrent(generationRequest)) return true;
      const latestSummary = getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId);
      const latestLogs = getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId });
      const resolvedInspectorMeta = resolveStartScreenGenerationInspectorMeta({ summary: latestSummary, logs: latestLogs });
      setLiveGeneration((prev) => ({ ...prev, active: true, state: 'error', prompt: hasBaseDraft ? 'עדכון טיוטת הבסיס נכשל' : 'יצירת המסמך נכשלה', summary: latestSummary, logs: latestLogs, runId: generationRequest.runId, workspaceId: originWorkspaceId }));
      setLastGenerationAction((prev) => (prev?.runId !== generationRequest.runId ? prev : {
        ...prev,
        inspector: {
          ...(prev?.inspector || {}),
          requestedProviderId: resolvedInspectorMeta.requestedProviderId || String(prev?.inspector?.requestedProviderId || '').trim(),
          requestedProviderModel: resolvedInspectorMeta.requestedProviderModel || String(prev?.inspector?.requestedProviderModel || '').trim(),
          routeMode: resolvedInspectorMeta.routeMode || String(prev?.inspector?.routeMode || '').trim(),
          routeModeReason: resolvedInspectorMeta.routeModeReason || String(prev?.inspector?.routeModeReason || '').trim(),
          usedFallback: false,
          errorMessage: String(error?.message || latestSummary?.lastError || '').trim(),
          liveState: 'error',
          routeResolved: generationRoute,
        },
      }));
      lastLiveGenerationShellRef.current = { runId: '', html: '' };
      const fallbackDraftHtml = preserveCurrentDocumentOnError ? String(baseDraft?.html || '').trim() : '';
      if (fallbackDraftHtml) {
        editor.commands.setContent(fallbackDraftHtml);
        lastLiveGenerationPlaceholderRef.current = { runId: '', html: '' };
      } else {
        const errorPlaceholder = buildLiveGenerationErrorPlaceholder({
          titleText: generationLabel,
          runId: generationRequest.runId,
        });
        editor.commands.setContent(errorPlaceholder);
        lastLiveGenerationPlaceholderRef.current = {
          runId: generationRequest.runId,
          html: normalizeTrackedEditorHtml(String(editor.getHTML?.() || errorPlaceholder)),
        };
      }
    }

    return true;
  }, [beginGenerationRequest, changeDocumentStyle, clearDocumentArrival, confirmReplaceCurrentDocument, documentStyle, editor, isGenerationRequestCurrent, persistLocalCache, runStartTransition, triggerDocumentArrival]);

  const runDocumentFeedbackRevision = React.useCallback(async (action) => {
    const payload = action?.payload || {};
    const resolvedAction = {
      ...action,
      kind: 'feedback-revision',
      workspaceId: action?.workspaceId || getActiveWorkspaceId(),
    };

    const surveySnapshot = payload.surveySnapshot && typeof payload.surveySnapshot === 'object'
      ? { ...payload.surveySnapshot }
      : { ...DEFAULT_FEEDBACK_SURVEY };
    const workflowAvailable = isFeedbackWorkflowAvailable();
    const requestedExecutionMode = normalizeFeedbackExecutionMode(payload.executionMode || surveySnapshot.executionMode);
    const executionMode = requestedExecutionMode === 'workspace' && workflowAvailable ? 'workspace' : 'direct';
    const roundIndex = normalizeFeedbackRoundIndex(payload.roundIndex || surveySnapshot.roundIndex);
    const templateId = String(payload.templateId || activeTemplateId || 'blank').trim() || 'blank';
    const selectedMaterials = Array.isArray(payload.selectedMaterials) ? payload.selectedMaterials.filter(Boolean) : [];
    const selectedProviderId = String(payload.selectedProviderId || payload.selectedModel || '').trim();
    const selectedProviderModel = String(payload.selectedProviderModel || '').trim();
    const selectedModel = selectedProviderId;
    const existingHtml = payload.existingHtml || editor?.getHTML?.() || '';
    const generationRequest = beginGenerationRequest('doc-feedback');
    const originWorkspaceId = generationRequest.workspaceId;
    setLastGenerationAction({
      ...resolvedAction,
      runId: generationRequest.runId,
      inspector: buildStartScreenGenerationInspector({
        runId: generationRequest.runId,
        actionType: 'revise',
        prompt: String(payload.originalPrompt || '').trim(),
        instructions: String(payload.feedback || '').trim(),
        selectedMaterials,
        templateId,
        selectedProviderId,
        selectedProviderModel,
        route: 'reviseDocumentWithFeedback',
        routeMode: executionMode === 'workspace' ? 'workspace-automation' : 'direct',
        routeModeReason: executionMode === 'workspace' ? '' : 'feedback-direct',
      }),
    });
    clearDocumentArrival();
    setFeedbackSurvey((prev) => ({
      ...prev,
      open: false,
      phase: 'details',
      submitting: true,
      submissionRequestId: generationRequest.requestId,
    }));
    setAssistantTrigger('manual');
    setSidebarOpen(true);
    setLiveGeneration({
      active: true,
      state: 'running',
      prompt: executionMode === 'workspace' ? 'מעדכן את המסמך עם צוות הסוכנים הפעיל' : 'מעדכן את המסמך לפי המשוב שלך',
      summary: getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId),
      logs: getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId }),
      runId: generationRequest.runId,
      workspaceId: originWorkspaceId,
    });

    const clearHiddenFeedbackSubmittingAfterStale = () => {
      setFeedbackSurvey((prev) => {
        if (prev.submissionRequestId !== generationRequest.requestId || prev.open || !prev.submitting) {
          return prev;
        }

        return {
          ...prev,
          submitting: false,
          submissionRequestId: null,
        };
      });
    };

    try {
      const result = await reviseDocumentWithFeedback({
        existingHtml,
        originalPrompt: payload.originalPrompt,
        templateId,
        feedback: payload.feedback || '',
        selectedMaterials,
        selectedModel,
        selectedProviderId,
        selectedProviderModel,
        forceDirectMode: executionMode !== 'workspace',
        runId: generationRequest.runId,
        returnMeta: true,
      });

      const revisedHtml = result?.html || existingHtml;
      const usedFallback = Boolean(result?.usedFallback);
      const consumedRevisionRound = !usedFallback || String(revisedHtml || '').trim() !== String(existingHtml || '').trim();
      if (!isGenerationRequestCurrent(generationRequest)) {
        clearHiddenFeedbackSubmittingAfterStale();
        return true;
      }

      if (editor && revisedHtml) {
        lastLiveGenerationShellRef.current = { runId: '', html: '' };
        editor.commands.setContent(revisedHtml);
        triggerDocumentArrival(usedFallback ? 'warning' : 'success');
      }

      persistLocalCache(revisedHtml);
      saveDocumentHistory({
        title: `${payload.originalPrompt || 'מסמך'} · תיקון לפי משוב`,
        content: revisedHtml,
        templateId,
        source: 'feedback-revision',
      });

      setLiveGeneration({
        active: true,
        state: usedFallback ? 'warning' : 'success',
        prompt: usedFallback ? 'נשמרה הגרסה הקודמת כי העדכון לא הושלם במלואו' : 'המסמך עודכן לפי המשוב שלך',
        summary: getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId),
        logs: getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId }),
        runId: generationRequest.runId,
        workspaceId: originWorkspaceId,
      });
      const latestSummary = getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId);
      const latestLogs = getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId });
      const resolvedInspectorMeta = resolveStartScreenGenerationInspectorMeta({ summary: latestSummary, logs: latestLogs });
      setLastGenerationAction((prev) => (prev?.runId !== generationRequest.runId ? prev : {
        ...prev,
        inspector: {
          ...(prev?.inspector || {}),
          requestedProviderId: resolvedInspectorMeta.requestedProviderId || String(prev?.inspector?.requestedProviderId || '').trim(),
          requestedProviderModel: resolvedInspectorMeta.requestedProviderModel || String(prev?.inspector?.requestedProviderModel || '').trim(),
          routeMode: resolvedInspectorMeta.routeMode || String(prev?.inspector?.routeMode || '').trim(),
          routeModeReason: resolvedInspectorMeta.routeModeReason || String(prev?.inspector?.routeModeReason || '').trim(),
          usedFallback,
          errorMessage: String(result?.errorMessage || '').trim(),
          liveState: usedFallback ? 'warning' : 'success',
          routeResolved: 'reviseDocumentWithFeedback',
        },
      }));

      setFeedbackSurvey({
        ...buildFeedbackSurveyStateWithGenerationContext(surveySnapshot, {
          prompt: payload.originalPrompt,
          templateId,
          usedFallback,
          selectedMaterials,
          selectedModel,
          selectedProviderId,
          selectedProviderModel,
        }),
        open: false,
        phase: 'details',
        executionMode,
        roundIndex: consumedRevisionRound ? normalizeFeedbackRoundIndex(roundIndex + 1) : roundIndex,
        usedFallback,
      });

      if (usedFallback && result?.errorMessage) {
        alert(`לא הצלחתי ליישם את כל ההערות: ${result.errorMessage}`);
      }
    } catch (error) {
      if (!isGenerationRequestCurrent(generationRequest)) {
        clearHiddenFeedbackSubmittingAfterStale();
        return true;
      }
      setFeedbackSurvey({
        ...surveySnapshot,
        open: true,
        phase: 'details',
        submitting: false,
      });
      const latestSummary = getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId);
      const latestLogs = getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId });
      const resolvedInspectorMeta = resolveStartScreenGenerationInspectorMeta({ summary: latestSummary, logs: latestLogs });
      setLiveGeneration({
        active: true,
        state: 'error',
        prompt: 'עדכון המסמך נכשל',
        summary: latestSummary,
        logs: latestLogs,
        runId: generationRequest.runId,
        workspaceId: originWorkspaceId,
      });
      setLastGenerationAction((prev) => (prev?.runId !== generationRequest.runId ? prev : {
        ...prev,
        inspector: {
          ...(prev?.inspector || {}),
          requestedProviderId: resolvedInspectorMeta.requestedProviderId || String(prev?.inspector?.requestedProviderId || '').trim(),
          requestedProviderModel: resolvedInspectorMeta.requestedProviderModel || String(prev?.inspector?.requestedProviderModel || '').trim(),
          routeMode: resolvedInspectorMeta.routeMode || String(prev?.inspector?.routeMode || '').trim(),
          routeModeReason: resolvedInspectorMeta.routeModeReason || String(prev?.inspector?.routeModeReason || '').trim(),
          usedFallback: false,
          errorMessage: String(error?.message || '').trim(),
          liveState: 'error',
          routeResolved: 'reviseDocumentWithFeedback',
        },
      }));
      alert(error?.message || 'לא הצלחתי לעדכן את המסמך לפי המשוב.');
    }

    return true;
  }, [activeTemplateId, beginGenerationRequest, clearDocumentArrival, editor, isGenerationRequestCurrent, persistLocalCache, triggerDocumentArrival]);

  const runDocumentRecommendationsReview = React.useCallback(async (action) => {
    const payload = action?.payload || {};
    const resolvedAction = {
      ...action,
      kind: 'review-recommendations',
      workspaceId: action?.workspaceId || getActiveWorkspaceId(),
    };

    const surveySnapshot = payload.surveySnapshot && typeof payload.surveySnapshot === 'object'
      ? { ...payload.surveySnapshot }
      : { ...DEFAULT_FEEDBACK_SURVEY };
    const templateId = String(payload.templateId || activeTemplateId || 'blank').trim() || 'blank';
    const selectedMaterials = Array.isArray(payload.selectedMaterials) ? payload.selectedMaterials.filter(Boolean) : [];
    const selectedProviderId = String(payload.selectedProviderId || payload.selectedModel || '').trim();
    const selectedProviderModel = String(payload.selectedProviderModel || '').trim();
    const selectedModel = selectedProviderId;
    const reviewFocus = String(payload.focus || '').trim();
    const generationRequest = beginGenerationRequest('doc-review');
    const originWorkspaceId = generationRequest.workspaceId;
    setLastGenerationAction({
      ...resolvedAction,
      runId: generationRequest.runId,
      inspector: buildStartScreenGenerationInspector({
        runId: generationRequest.runId,
        actionType: 'review',
        prompt: String(payload.originalPrompt || '').trim(),
        instructions: reviewFocus,
        selectedMaterials,
        templateId,
        selectedProviderId,
        selectedProviderModel,
        route: 'reviewDocumentRecommendations',
        routeMode: 'direct',
        routeModeReason: 'review-direct',
      }),
    });
    setFeedbackSurvey((prev) => ({
      ...prev,
      open: true,
      phase: 'review',
      submitting: true,
      submissionRequestId: generationRequest.requestId,
      reviewResult: null,
      reviewFocus,
      reviewErrorMessage: '',
    }));
    setAssistantTrigger('manual');
    setSidebarOpen(true);
    setLiveGeneration({
      active: true,
      state: 'running',
      prompt: 'מכין המלצות עריכה למסמך',
      summary: getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId),
      logs: getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId }),
      runId: generationRequest.runId,
      workspaceId: originWorkspaceId,
    });

    const clearHiddenReviewSubmittingAfterStale = () => {
      setFeedbackSurvey((prev) => {
        if (prev.submissionRequestId !== generationRequest.requestId || !prev.submitting) {
          return prev;
        }

        return {
          ...prev,
          submitting: false,
          submissionRequestId: null,
        };
      });
    };

    try {
      const result = await reviewDocumentRecommendations({
        existingHtml: payload.existingHtml || editor?.getHTML?.() || '',
        originalPrompt: payload.originalPrompt,
        templateId,
        selectedMaterials,
        selectedModel,
        selectedProviderId,
        selectedProviderModel,
        focus: reviewFocus,
        runId: generationRequest.runId,
        returnMeta: true,
      });

      if (!isGenerationRequestCurrent(generationRequest)) {
        clearHiddenReviewSubmittingAfterStale();
        return true;
      }

      setFeedbackSurvey((prev) => {
        if (prev.submissionRequestId !== generationRequest.requestId) return prev;

        return {
          ...prev,
          phase: 'review',
          submitting: false,
          submissionRequestId: null,
          reviewFocus,
          reviewErrorMessage: String(result?.errorMessage || '').trim(),
          reviewResult: {
            summary: String(result?.summary || '').trim(),
            suggestions: Array.isArray(result?.suggestions) ? result.suggestions : [],
            usedFallback: Boolean(result?.usedFallback),
          },
        };
      });

      const latestSummary = getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId);
      const latestLogs = getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId });
      const latestStages = Array.isArray(latestSummary?.stages) ? latestSummary.stages : [];
      const requestStartLog = latestLogs.find((log) => log?.type === 'request-start');
      const lastLogMeta = [...latestLogs].reverse().find(
        (log) => String(log?.provider || '').trim() || String(log?.model || '').trim(),
      );
      const lastStageMeta = [...latestStages].reverse().find(
        (stage) => String(stage?.provider || '').trim() || String(stage?.model || '').trim(),
      );
      const resolvedProviderMeta = lastLogMeta || lastStageMeta || {};
      const resolvedProviderId = String(resolvedProviderMeta?.provider || '').trim();
      const resolvedProviderModel = String(resolvedProviderMeta?.model || '').trim();
      const resolvedRouteMode = requestStartLog
        ? (requestStartLog.automationSkipped === true ? 'direct' : 'workspace-automation')
        : '';
      const resolvedRouteModeReason = String(requestStartLog?.automationSkipReason || '').trim();

      setLastGenerationAction((prev) => (prev?.runId !== generationRequest.runId ? prev : {
        ...prev,
        inspector: {
          ...(prev?.inspector || {}),
          requestedProviderId: resolvedProviderId || String(prev?.inspector?.requestedProviderId || '').trim(),
          requestedProviderModel: resolvedProviderModel || String(prev?.inspector?.requestedProviderModel || '').trim(),
          routeMode: resolvedRouteMode || String(prev?.inspector?.routeMode || '').trim(),
          routeModeReason: resolvedRouteModeReason || String(prev?.inspector?.routeModeReason || '').trim(),
          usedFallback: Boolean(result?.usedFallback),
          errorMessage: String(result?.errorMessage || '').trim(),
          liveState: Boolean(result?.usedFallback) ? 'warning' : 'success',
          routeResolved: 'reviewDocumentRecommendations',
        },
      }));
      setLiveGeneration((prev) => (prev.runId !== generationRequest.runId ? prev : {
        ...prev,
        active: false,
        state: 'idle',
        prompt: '',
        summary: latestSummary,
        logs: latestLogs,
        runId: '',
        workspaceId: originWorkspaceId,
      }));
    } catch (error) {
      if (!isGenerationRequestCurrent(generationRequest)) {
        clearHiddenReviewSubmittingAfterStale();
        return true;
      }

      setFeedbackSurvey({
        ...surveySnapshot,
        open: true,
        phase: 'details',
        submitting: false,
        submissionRequestId: null,
        reviewResult: null,
        reviewErrorMessage: '',
      });
      setLiveGeneration({
        active: true,
        state: 'error',
        prompt: 'הכנת המלצות העריכה נכשלה',
        summary: getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId),
        logs: getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId }),
        runId: generationRequest.runId,
        workspaceId: originWorkspaceId,
      });
      setLastGenerationAction((prev) => (prev?.runId !== generationRequest.runId ? prev : {
        ...prev,
        inspector: {
          ...(prev?.inspector || {}),
          usedFallback: false,
          errorMessage: String(error?.message || '').trim(),
          liveState: 'error',
          routeResolved: 'reviewDocumentRecommendations',
        },
      }));
      alert(error?.message || 'לא הצלחתי להכין המלצות עריכה למסמך.');
    }

    return true;
  }, [activeTemplateId, beginGenerationRequest, editor, isGenerationRequestCurrent]);

  const runStoredGenerationAction = React.useCallback(async (action, options = {}) => {
    if (!action?.kind) return false;
    if (action.kind === 'start-screen-generate') return executeStartScreenGeneration(action, options);
    if (action.kind === 'feedback-revision') return runDocumentFeedbackRevision(action);
    if (action.kind === 'review-recommendations') return runDocumentRecommendationsReview(action);
    return false;
  }, [executeStartScreenGeneration, runDocumentFeedbackRevision, runDocumentRecommendationsReview]);

  const clearPersistedDraftCache = React.useCallback(() => {
    clearPersistedDraftCacheStorage();
  }, []);

  const getCurrentBlockElement = React.useCallback(() => {
    const selection = window.getSelection?.();
    const anchorNode = selection?.anchorNode;
    const baseElement = anchorNode?.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode;
    return baseElement?.closest?.('p, h1, h2, h3, h4, h5, h6, blockquote, li, ul, ol') || null;
  }, []);

  const applyImportedDocument = React.useCallback((payload = {}) => {
    if (!editor) return;
    if (payload?.ok === false || payload?.error) {
      setPendingStartupDocument(false);
      alert(payload?.error || 'לא ניתן לפתוח את הקובץ שנבחר.');
      return;
    }
    const importedHtml = String(payload.html || '').trim() || '<p></p>';
    if (!confirmReplaceCurrentDocument()) {
      setPendingStartupDocument(false);
      return;
    }

    clearDraftReviewState();
    editor.commands.setContent(importedHtml);
    editor.setEditable(true);
    setViewMode('print');
    if (editor.view?.dom) {
      editor.view.dom.contentEditable = 'true';
      editor.view.dom.dataset.viewMode = 'print';
    }
    applyDocumentStyleToEditor(documentStyle, editor);
    setCurrentFilePath(String(payload.filePath || ''));
    persistActiveTemplateId('blank');
    syncPersistedAppSettings();
    setActiveTemplateId('blank');
    saveDocumentHistory({
      title: String(payload.title || 'מסמך שנפתח מהמחשב').trim(),
      content: importedHtml,
      templateId: 'blank',
      source: 'opened-file',
    });
    persistLocalCache(importedHtml);
    setPendingStartupDocument(false);
    initializedDocRef.current = true;
    setLastEditorActivityAt(Date.now());
    setShowStartScreen(false);
    focusEditorSoon('start');
  }, [editor, confirmReplaceCurrentDocument, clearDraftReviewState, focusEditorSoon, persistLocalCache, applyDocumentStyleToEditor, documentStyle]);

  React.useEffect(() => {
    if (!window.desktopApp?.onOpenExternalDocument) return;
    return window.desktopApp.onOpenExternalDocument((payload) => {
      if (window.desktopApp?.consumePendingOpenDocument) {
        Promise.resolve(window.desktopApp.consumePendingOpenDocument()).catch(() => {});
      }
      if (!editor) {
        setPendingStartupDocument(true);
        pendingImportRef.current = payload;
        return;
      }
      applyImportedDocument(payload);
    });
  }, [editor, applyImportedDocument]);

  React.useEffect(() => {
    if (!window.desktopApp?.onOpenSettings) return;
    return window.desktopApp.onOpenSettings((payload) => {
      if (window.desktopApp?.consumePendingOpenSettings) {
        Promise.resolve(window.desktopApp.consumePendingOpenSettings()).catch(() => {});
      }
      const tab = payload?.tab || 'ai';
      setFileMenuTargetTab(tab);
      setFileMenuOpen(true);
    });
  }, []);

  React.useEffect(() => {
    if (!editor) return;

    const applyPending = async () => {
      if (pendingImportRef.current) {
        const payload = pendingImportRef.current;
        pendingImportRef.current = null;
        applyImportedDocument(payload);
      } else if (window.desktopApp?.consumePendingOpenDocument) {
        const payload = await window.desktopApp.consumePendingOpenDocument();
        if (payload && !payload.canceled) {
          applyImportedDocument(payload);
        } else {
          setPendingStartupDocument(false);
        }
      } else {
        setPendingStartupDocument(false);
      }

      if (window.desktopApp?.consumePendingOpenSettings) {
        const payload = await window.desktopApp.consumePendingOpenSettings();
        if (payload?.tab) {
          setFileMenuTargetTab(payload.tab);
          setFileMenuOpen(true);
        }
      }
    };

    applyPending();
  }, [editor, applyImportedDocument]);

  React.useEffect(() => {
    if (!fileMenuOpen) return;
    setCopyleaksDetector((prev) => (prev.open ? { ...DEFAULT_COPYLEAKS_DETECTOR } : prev));
  }, [fileMenuOpen]);

  const buildDesktopSavePayload = React.useCallback((preferredExtension = 'docx') => {
    const currentPreset = DOCUMENT_STYLE_PRESETS[documentStyle] || DOCUMENT_STYLE_PRESETS.academic;
    const html = editor?.getHTML?.() || '';
    const text = editor?.getText?.() || '';
    const fontStack = String(
      wordPreferences.defaultFontStack
      || localStorage.getItem('default-font-stack')
      || wordPreferences.defaultFontFamily
      || localStorage.getItem('default-font')
      || currentPreset.fontFamily
      || ''
    ).trim();
    const fontSize = String(
      wordPreferences.defaultFontSize
      || localStorage.getItem('default-size')
      || currentPreset.fontSize
      || '12pt'
    ).trim();

    return {
      title: text.trim().slice(0, 60) || 'מסמך',
      html,
      text,
      preferredExtension,
      exportOptions: {
        documentStyle,
        fontStack,
        fontSize,
        language: 'he-IL',
        disableProofing: false,
      },
    };
  }, [documentStyle, editor, wordPreferences.defaultFontFamily, wordPreferences.defaultFontSize, wordPreferences.defaultFontStack]);

  const downloadBrowserDocxOrAlert = React.useCallback(async (preferredExtension = 'docx') => {
    try {
      return await downloadBrowserDocx(buildDesktopSavePayload(preferredExtension));
    } catch (error) {
      console.error('Browser DOCX export failed:', error);
      window.alert(error?.message || 'לא הצלחתי לשמור את קובץ ה-Word בדפדפן.');
      return { handled: false, canceled: false, error };
    }
  }, [buildDesktopSavePayload]);



  const handleCommand = async (cmd, value) => {
    const safeCommands = ['zoom','exportHTML','exportText','focusMode','toggleWatermark',
      'setPageColor','togglePageBorders','toggleRuler','toggleGrid','formatPainter','openFile','openCopyleaksSettings'];
    if (!editor && !safeCommands.includes(cmd)) return;

    switch (cmd) {
      case 'bold': editor.chain().focus().toggleBold().run(); break;
      case 'italic': editor.chain().focus().toggleItalic().run(); break;
      case 'underline': editor.chain().focus().toggleUnderline?.().run(); break;
      case 'strike': editor.chain().focus().toggleStrike().run(); break;
      case 'subscript': editor.chain().focus().toggleSubscript().run(); break;
      case 'superscript': editor.chain().focus().toggleSuperscript().run(); break;
      case 'clearFormatting': editor.chain().focus().unsetAllMarks().unsetTextAlign().run(); break;
      case 'bulletList': editor.chain().focus().toggleBulletList().run(); break;
      case 'orderedList': editor.chain().focus().toggleOrderedList().run(); break;
      case 'alignRight': editor.chain().focus().setTextAlign('right').run(); break;
      case 'alignLeft': editor.chain().focus().setTextAlign('left').run(); break;
      case 'alignCenter': editor.chain().focus().setTextAlign('center').run(); break;
      case 'alignJustify': editor.chain().focus().setTextAlign('justify').run(); break;
      case 'indent': editor.chain().focus().sinkListItem('listItem').run(); break;
      case 'outdent': editor.chain().focus().liftListItem('listItem').run(); break;
      case 'heading': editor.chain().focus().toggleHeading({ level: value }).run(); break;
      case 'paragraph': editor.chain().focus().setParagraph().run(); break;
      case 'blockquote': editor.chain().focus().toggleBlockquote().run(); break;
      case 'codeBlock': editor.chain().focus().toggleCodeBlock().run(); break;
      case 'insertHR': editor.chain().focus().setHorizontalRule().run(); break;
      case 'fontFamily': {
        editor.chain().focus().setFontFamily(value).run();
        updateActiveFormats(editor);
        break;
      }
      case 'fontSize': {
        editor.chain().focus().setFontSize(value).run();
        updateActiveFormats(editor);
        break;
      }
      case 'fontSizeInc': {
        const rawSize = String(editor.getAttributes('textStyle').fontSize || window.getComputedStyle(editor.view.dom).fontSize || '12pt');
        const next = Number(normalizeFontSizeValue(rawSize) || 12) + 1;
        editor.chain().focus().setFontSize(`${next}pt`).run();
        updateActiveFormats(editor);
        break;
      }
      case 'fontSizeDec': {
        const rawSize = String(editor.getAttributes('textStyle').fontSize || window.getComputedStyle(editor.view.dom).fontSize || '12pt');
        const next = Math.max(8, Number(normalizeFontSizeValue(rawSize) || 12) - 1);
        editor.chain().focus().setFontSize(`${next}pt`).run();
        updateActiveFormats(editor);
        break;
      }
      case 'lineHeight': editor.chain().focus().setLineHeight(value).run(); break;
      case 'applyParagraphSpacing': {
        const spacing = value || {};
        const block = getCurrentBlockElement();
        if (spacing.lineHeight) editor.chain().focus().setLineHeight(spacing.lineHeight).run();
        if (block) {
          if (spacing.before != null) block.style.marginTop = `${Math.max(0, Number(spacing.before) || 0)}pt`;
          if (spacing.after != null) block.style.marginBottom = `${Math.max(0, Number(spacing.after) || 0)}pt`;
        }
        break;
      }
      case 'saveDefaultTypography': {
        const currentFontStack = String(editor.getAttributes('textStyle')?.fontFamily || window.getComputedStyle(editor.view.dom).fontFamily || 'Alef').trim();
        const currentFont = normalizeStoredDefaultFont(currentFontStack);
        const currentSize = editor.getAttributes('textStyle')?.fontSize || window.getComputedStyle(editor.view.dom).fontSize || '12pt';
        localStorage.setItem('default-font', currentFont);
        localStorage.setItem('default-font-stack', currentFontStack || currentFont);
        localStorage.setItem('default-size', currentSize);
        saveWordPreferences({
          ...wordPreferences,
          defaultFontFamily: currentFont,
          defaultFontStack: currentFontStack || currentFont,
          defaultFontSize: currentSize,
        });
        setWordPreferences((prev) => ({
          ...prev,
          defaultFontFamily: currentFont,
          defaultFontStack: currentFontStack || currentFont,
          defaultFontSize: currentSize,
        }));
        applyDocumentStyleToEditor(documentStyle);
        alert(`ברירת המחדל נשמרה: ${currentFont} · ${currentSize}`);
        break;
      }
      case 'applyDocumentStyle':
        changeDocumentStyle(value || 'academic');
        break;

      // --- כיווניות RTL / LTR ברמת הבלוק ---
      case 'setDirRTL': {
        editor.chain().focus().updateAttributes('paragraph', { dir: 'rtl' }).run();
        editor.chain().focus().updateAttributes('heading', { dir: 'rtl' }).run();
        break;
      }
      case 'setDirLTR': {
        editor.chain().focus().updateAttributes('paragraph', { dir: 'ltr' }).run();
        editor.chain().focus().updateAttributes('heading', { dir: 'ltr' }).run();
        break;
      }

      // --- מברשת עיצוב ---
      case 'formatPainter': {
        if (!formatPainterRef.current.copyFormat) return;
        if (formatPainterActive) {
          formatPainterRef.current.applyFormat?.();
          setFormatPainterActive(false);
        } else {
          formatPainterRef.current.copyFormat?.();
          setFormatPainterActive(true);
        }
        break;
      }

      case 'insertTable':
        editor.chain().focus().insertTable({ rows: value?.rows ?? 3, cols: value?.cols ?? 3, withHeaderRow: true }).run();
        break;
      case 'insertImage': editor.chain().focus().setImage({ src: value }).run(); break;
      case 'insertImageUrl': {
        const result = await requestInputDialog({
          title: 'הוספת תמונה מקישור',
          description: 'הדבק כתובת תמונה מלאה.',
          fields: [
            { id: 'url', label: 'כתובת תמונה', placeholder: 'https://example.com/image.png' },
          ],
          confirmLabel: 'הוסף תמונה',
        });
        if (result?.url) editor.chain().focus().setImage({ src: String(result.url).trim() }).run();
        break;
      }
      case 'insertLink': {
        const href = sanitizeLinkUrl(value);
        if (href) editor.chain().focus().setLink({ href }).run();
        break;
      }
      case 'insertLinkDialog': {
        const result = await requestInputDialog({
          title: 'הוספת קישור מהיר',
          description: 'הדבק כתובת. אפשר להגדיר גם טקסט להצגה במקום הכתובת.',
          fields: [
            { id: 'url', label: 'כתובת URL', placeholder: 'https://...' },
            { id: 'text', label: 'טקסט להצגה (אופציונלי)', placeholder: 'למשל: מקור אקדמי מלא' },
          ],
          confirmLabel: 'הוסף קישור',
        });
        const href = sanitizeLinkUrl(result?.url || '');
        const text = String(result?.text || '').trim();
        if (!href) break;
        if (!editor.state.selection.empty) {
          editor.chain().focus().setLink({ href }).run();
          break;
        }
        const content = text || href;
        editor.chain().focus().insertContent(`<a href="${escHtml(href)}" target="_blank" rel="noopener noreferrer">${escHtml(content)}</a>`).run();
        break;
      }
      case 'insertBookmarkDialog': {
        const result = await requestInputDialog({
          title: 'יצירת סימניה',
          fields: [
            { id: 'name', label: 'שם הסימניה', placeholder: 'למשל: מבוא או מקורות' },
          ],
          confirmLabel: 'צור סימניה',
        });
        if (result?.name) editor.chain().focus().insertContent(`<a id="${escHtml(String(result.name).trim())}" name="${escHtml(String(result.name).trim())}" style="color:inherit;text-decoration:none;">⚓ ${escHtml(String(result.name).trim())}</a>`).run();
        break;
      }
      case 'openGoogleSearch': {
        const config = getProviderConfig();
        const googleUrlTemplate = String(getToolLinksConfig(config)?.googleSearch?.url || '');
        if (googleUrlTemplate && !googleUrlTemplate.includes('{query}')) {
          const url = buildExternalToolUrl('googleSearch', '', config);
          if (url) openExternalLink(url);
          break;
        }

        const initial = String(selectedText || currentBlockText || '').trim();
        const result = await requestInputDialog({
          title: 'חיפוש בגוגל',
          fields: [
            { id: 'query', label: 'מה לחפש?', placeholder: 'נושא, מושג או שאלה', value: initial },
          ],
          confirmLabel: 'פתח חיפוש',
        });
        if (result?.query) {
          const url = buildExternalToolUrl('googleSearch', String(result.query).trim(), config);
          if (url) openExternalLink(url);
        }
        break;
      }
      case 'searchScholar': {
        const config = getProviderConfig();
        const scholarUrlTemplate = String(getToolLinksConfig(config)?.scholar?.url || '');
        if (scholarUrlTemplate && !scholarUrlTemplate.includes('{query}')) {
          const url = buildExternalToolUrl('scholar', '', config);
          if (url) openExternalLink(url);
          break;
        }

        const initial = String(selectedText || currentBlockText || '').trim();
        const result = await requestInputDialog({
          title: 'חיפוש ב-Google Scholar',
          description: 'אפשר לחפש נושא, מאמר, חוקר או מילות מפתח.',
          fields: [
            { id: 'query', label: 'מונח חיפוש', placeholder: 'למשל: legal writing pedagogy', value: initial },
          ],
          confirmLabel: 'פתח Scholar',
        });
        if (result?.query) {
          const url = buildExternalToolUrl('scholar', String(result.query).trim(), config);
          if (url) openExternalLink(url);
        }
        break;
      }
      case 'openOrbit': {
        const url = buildExternalToolUrl('orbit', '', getProviderConfig());
        if (url) openExternalLink(url);
        break;
      }
      case 'openModelHub': {
        const url = buildExternalToolUrl('modelHub', '', getProviderConfig());
        if (url) openExternalLink(url);
        break;
      }
      case 'openCopyleaksDetector': {
        openCopyleaksDetector(typeof value === 'string' ? value : value?.source);
        break;
      }
      case 'openCopyleaksSettings': {
        openCopyleaksSettingsPanel();
        break;
      }
      case 'setColor': editor.chain().focus().setColor(value).run(); break;
      case 'setHighlight': editor.chain().focus().toggleHighlight({ color: value }).run(); break;
      case 'insertTaskList': editor.chain().focus().toggleTaskList().run(); break;
      case 'pageBreak':
        editor.chain().focus().setPageBreak().run();
        break;
      case 'insertDate': {
        const d = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
        editor.chain().focus().insertContent(d).run(); break;
      }
      case 'insertMath': editor.chain().focus().insertContent(' ∑ ').run(); break;
      case 'insertSymbol': editor.chain().focus().insertContent(value).run(); break;
      case 'addComment': editor.chain().focus().toggleHighlight({ color: '#FCE100' }).run(); break;
      case 'removeComment': editor.chain().focus().unsetHighlight().run(); break;

      case 'copySelection': {
        const { from, to, empty } = editor.state.selection;
        if (empty) {
          alert('בחר טקסט להעתקה.');
          break;
        }
        const text = editor.state.doc.textBetween(from, to, ' ');
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          document.execCommand('copy');
        }
        break;
      }
      case 'copyCurrentParagraph': {
        const paragraphText = String(currentBlockText || '').trim();
        if (!paragraphText) {
          alert('לא זוהתה פסקה פעילה להעתקה.');
          break;
        }
        const copied = await copyPlainTextToClipboard(paragraphText);
        if (!copied) {
          alert('לא הצלחתי להעתיק את הפסקה הפעילה.');
          break;
        }
        alert('הפסקה הפעילה הועתקה ללוח.');
        break;
      }
      case 'cutSelection': {
        const { from, to, empty } = editor.state.selection;
        if (empty) {
          alert('בחר טקסט לגזירה.');
          break;
        }
        const text = editor.state.doc.textBetween(from, to, ' ');
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          document.execCommand('cut');
        }
        editor.chain().focus().deleteSelection().run();
        break;
      }
      case 'pasteClipboard': {
        try {
          const text = await navigator.clipboard.readText();
          if (text) editor.chain().focus().insertContent(escHtml(text).replace(/\n/g, '<br />')).run();
        } catch {
          alert('הדבקה אוטומטית נחסמה על ידי המערכת. אפשר להשתמש גם ב־Ctrl+V.');
        }
        break;
      }
      case 'wordCount': {
        const txt = editor.getText();
        const wc = txt.trim() ? txt.trim().split(/\s+/).length : 0;
        alert(`ספירת מילים: ${wc}`); break;
      }
      case 'charCount': {
        const cc = editor.getText().length;
        alert(`ספירת תווים: ${cc}`); break;
      }

      // --- תוכן עניינים אמיתי (מוזרק לתוך העורך) ---
      case 'generateTOC': {
        const headings = [];
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'heading') {
            const id = `heading-${pos}`;
            headings.push({ level: node.attrs.level, text: node.textContent, id });
          }
        });
        if (!headings.length) { alert('לא נמצאו כותרות במסמך'); break; }
        const tocItems = headings
          .map((h) => `<li style="padding-right:${(h.level - 1) * 16}px"><a href="#${h.id}">${h.text}</a></li>`)
          .join('');
        const tocHtml = `<p><strong>תוכן עניינים</strong></p><ul style="list-style:none;padding:0">${tocItems}</ul><hr/>`;
        editor.chain().focus().insertContentAt(1, tocHtml).run();
        break;
      }

      // --- הערת שוליים ---
      case 'insertFootnote': {
        const result = await requestInputDialog({
          title: 'הוספת הערת שוליים',
          fields: [
            { id: 'footnote', label: 'טקסט הערת שוליים', placeholder: 'הקלד כאן את ההערה' },
          ],
          confirmLabel: 'הוסף הערה',
        });
        const footnoteText = String(result?.footnote || '').trim();
        if (!footnoteText) break;
        const existingFootnotes = document.querySelectorAll('.footnote-ref').length;
        const num = existingFootnotes + 1;
        const safeFnText = escHtml(footnoteText);
        editor.chain().focus().insertContent(
          `<sup class="footnote-ref" id="fnref-${num}" style="color:#2B579A;cursor:pointer" title="${safeFnText}">[${num}]</sup>`
        ).run();
        // הוסף הערה בתחתית הדף
        editor.chain().focus().insertContentAt(
          editor.state.doc.content.size,
          `<p><small id="fn-${num}"><sup>${num}</sup> ${safeFnText}</small></p>`
        ).run();
        break;
      }

      case 'aiSpellCheck': alert('בדיקת איות AI: סמן טקסט ולחץ "תיקון" ב-BubbleMenu.'); break;

      // --- פקודות File Menu ---
      case 'newDoc': {
        if (window.confirm('האם למחוק את תוכן המסמך הנוכחי ולפתוח מסמך חדש?')) {
          const shouldShowStartExperience = isLegacyHomeEnabled() ? true : wordPreferences.showStartExperience !== false;
          clearDraftReviewState();
          editor.chain().focus().clearContent().run();
          clearPersistedDraftCache();
          saveHomeInstructions('');
          setStartScreenInstructionsResetToken((prev) => prev + 1);
          setCurrentFilePath('');
          persistActiveTemplateId('blank');
          syncPersistedAppSettings();
          setActiveTemplateId('blank');
          setShowStartScreen(shouldShowStartExperience);
        }
        break;
      }
      case 'saveLocal': {
        const html = editor.getHTML();
        const text = editor.getText();
        persistLocalCache(html);

        if (window.desktopApp?.saveDocumentDialog) {
          const ext = String(currentFilePath || '').toLowerCase().split('.').pop();
          const canSaveDirectly = Boolean(currentFilePath) && ['txt', 'html', 'htm', 'docx'].includes(ext);
          const result = await window.desktopApp.saveDocumentDialog({
            ...buildDesktopSavePayload(ext === 'txt' ? 'txt' : 'docx'),
            filePath: canSaveDirectly ? currentFilePath : '',
          });

          if (!result?.canceled && result?.filePath) {
            setCurrentFilePath(String(result.filePath));
            saveDocumentHistory({
              title: editor.getText().trim().slice(0, 60) || 'מסמך שמור',
              content: html,
              templateId: activeTemplateId || 'blank',
              source: 'save-local',
            });
            alert(canSaveDirectly ? 'המסמך נשמר בהצלחה במחשב.' : `המסמך נשמר בהצלחה ב:\n${result.filePath}`);
          }
          break;
        }

        const browserSaveResult = await downloadBrowserDocxOrAlert('docx');
        if (browserSaveResult?.handled && !browserSaveResult.canceled) {
          saveDocumentHistory({
            title: editor.getText().trim().slice(0, 60) || 'מסמך שמור',
            content: html,
            templateId: activeTemplateId || 'blank',
            source: 'save-local',
          });
        }
        break;
      }
      case 'openFile': {
        if (window.desktopApp?.openDocumentDialog) {
          const result = await window.desktopApp.openDocumentDialog();
          if (!result?.canceled) applyImportedDocument(result);
          break;
        }

        const picker = document.createElement('input');
        picker.type = 'file';
        picker.accept = '.txt,.md,.markdown,.html,.htm';
        picker.onchange = async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const text = await file.text();
          const html = /<(html|body|p|h1|h2|div|span|br|ul|ol|li)\b/i.test(text)
            ? text
            : text.split(/\n{2,}/).map((block) => `<p>${escHtml(block).replace(/\n/g, '<br />')}</p>`).join('');
          applyImportedDocument({ title: file.name, html });
        };
        picker.click();
        break;
      }
      case 'saveAs': {
        const html = editor.getHTML();
        const title = editor.getText().trim().slice(0, 60) || 'מסמך שמור';

        if (window.desktopApp?.saveDocumentDialog) {
          const result = await window.desktopApp.saveDocumentDialog(buildDesktopSavePayload('docx'));

          if (!result?.canceled) {
            setCurrentFilePath(String(result.filePath || ''));
            persistLocalCache(html);
            saveDocumentHistory({
              title,
              content: html,
              templateId: activeTemplateId || 'blank',
              source: 'save-as',
            });
            alert(`המסמך נשמר בהצלחה ב:\n${result.filePath}`);
          }
          break;
        }

        const browserSaveResult = await downloadBrowserDocxOrAlert('docx');
        if (browserSaveResult?.handled && !browserSaveResult.canceled) {
          persistLocalCache(html);
          saveDocumentHistory({
            title,
            content: html,
            templateId: activeTemplateId || 'blank',
            source: 'save-as',
          });
        }
        break;
      }
      case 'exportDocx': {
        if (window.desktopApp?.saveDocumentDialog) {
          const result = await window.desktopApp.saveDocumentDialog(buildDesktopSavePayload('docx'));
          if (!result?.canceled && result?.filePath) setCurrentFilePath(String(result.filePath));
          break;
        }
        await downloadBrowserDocxOrAlert('docx');
        break;
      }
      case 'print': {
        setFileMenuOpen(false);
        window.setTimeout(() => window.print(), 60);
        break;
      }

      case 'zoom': setZoom(value); break;
      case 'focusMode': setSidebarOpen(false); break;
      case 'toggleWatermark': {
        const el = document.querySelector('.ProseMirror');
        if (el) el.style.backgroundImage = el.style.backgroundImage
          ? '' : 'repeating-linear-gradient(-45deg, transparent, transparent 100px, rgba(200,200,200,0.1) 100px, rgba(200,200,200,0.1) 200px)';
        break;
      }
      case 'setPageColor': {
        const el = document.querySelector('.ProseMirror');
        if (el) {
          el.dataset.customBackground = value;
          el.style.background = value;
        }
        break;
      }
      case 'togglePageBorders': {
        const el = document.querySelector('.ProseMirror');
        if (el) {
          const nextBorder = el.dataset.customBorder ? '' : '2px solid var(--word-blue)';
          el.dataset.customBorder = nextBorder;
          el.style.border = nextBorder || '';
        }
        break;
      }
      case 'exportHTML': {
        const htmlCtx = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8" /><title>WordFlow AI Document</title>${EXPORT_DOC_STYLES}</head><body>${editor.getHTML()}</body></html>`;
        downloadFile(htmlCtx, 'my-document.html', 'text/html');
        break;
      }
      case 'exportText':
        downloadFile(editor.getText(), 'my-document.txt', 'text/plain');
        break;

      /* ---- פקודות פריסה ---- */
      case 'setMargins': {
        const marginMap = { normal: '2.54cm', narrow: '1.27cm', moderate: '1.91cm', wide: '3.81cm', centered: '5cm' };
        const m = marginMap[value] || '2.54cm';
        const page = document.querySelector('.ProseMirror');
        if (page) {
          page.dataset.customPadding = m;
          page.style.padding = m;
        }
        break;
      }
      case 'setOrientation': {
        const page2 = document.querySelector('.ProseMirror');
        if (!page2) break;
        if (value === 'landscape') {
          page2.dataset.customWidth = '29.7cm';
          page2.dataset.customMinHeight = '21cm';
        } else {
          page2.dataset.customWidth = '21cm';
          page2.dataset.customMinHeight = '29.7cm';
        }
        if ((page2.dataset.viewMode || viewMode) === 'print') {
          applyDocumentStyleToEditor(documentStyle);
        }
        break;
      }
      case 'setPageSize': {
        const sizes = { a4: ['21cm','29.7cm'], a3: ['29.7cm','42cm'], letter: ['21.59cm','27.94cm'], legal: ['21.59cm','35.56cm'] };
        const [pw, ph] = sizes[value] || sizes.a4;
        const pg = document.querySelector('.ProseMirror');
        if (pg) {
          pg.dataset.customWidth = pw;
          pg.dataset.customMinHeight = ph;
          if ((pg.dataset.viewMode || viewMode) === 'print') {
            applyDocumentStyleToEditor(documentStyle);
          }
        }
        break;
      }
      case 'setColumns': {
        const pg2 = document.querySelector('.ProseMirror');
        if (pg2) { pg2.style.columnCount = value > 1 ? String(value) : ''; pg2.style.columnGap = value > 1 ? '2em' : ''; }
        break;
      }
      case 'setMarginBefore': {
        const block = getCurrentBlockElement();
        if (block) block.style.marginRight = `${Math.max(0, Number(value) || 0)}cm`;
        break;
      }
      case 'setMarginAfter': {
        const block = getCurrentBlockElement();
        if (block) block.style.marginLeft = `${Math.max(0, Number(value) || 0)}cm`;
        break;
      }
      case 'setSpacingBefore': {
        const block = getCurrentBlockElement();
        if (block) block.style.marginTop = `${Math.max(0, Number(value) || 0)}pt`;
        break;
      }
      case 'setSpacingAfter': {
        const block = getCurrentBlockElement();
        if (block) block.style.marginBottom = `${Math.max(0, Number(value) || 0)}pt`;
        break;
      }

      /* ---- פקודות הוספה ---- */
      case 'insertHTML':
        editor.chain().focus().insertContent(value).run();
        break;
      case 'insertBookmark':
        editor.chain().focus().insertContent(`<a id="${value}" name="${value}" style="color:inherit;text-decoration:none;">⚓ ${value}</a>`).run();
        break;
      case 'insertSignature':
        editor.chain().focus().insertContent(
          `<div style="margin-top:40px;border-top:1px solid #333;width:200px;padding-top:4px;font-size:12px;color:#555;">חתימה</div>`
        ).run();
        break;
      case 'insertHeader': {
        const headerMap = {
          'ריק': '<div style="border-bottom:1px solid #ccc;padding-bottom:6px;margin-bottom:12px;color:#555;font-size:12px">&nbsp;</div>',
          'שם מסמך': '<div style="border-bottom:1px solid #ccc;padding-bottom:6px;margin-bottom:12px;color:#555;font-size:12px;text-align:center"><strong>כותרת מסמך</strong></div>',
          'תאריך + שם': `<div style="border-bottom:1px solid #ccc;padding-bottom:6px;margin-bottom:12px;color:#555;font-size:12px;display:flex;justify-content:space-between"><span><strong>שם המסמך</strong></span><span>${new Date().toLocaleDateString('he-IL')}</span></div>`,
          'מספר עמוד': '<div style="border-bottom:1px solid #ccc;padding-bottom:6px;margin-bottom:12px;color:#555;font-size:12px;text-align:left">עמוד 1</div>',
        };
        editor.chain().focus().insertContentAt(1, headerMap[value] || headerMap['ריק']).run();
        break;
      }
      case 'insertFooter': {
        const footerMap = {
          'ריק': '<div style="border-top:1px solid #ccc;padding-top:6px;margin-top:20px;color:#555;font-size:12px">&nbsp;</div>',
          'שם מסמך': '<div style="border-top:1px solid #ccc;padding-top:6px;margin-top:20px;color:#555;font-size:12px;text-align:center"><strong>שם המסמך</strong></div>',
          'מספר עמוד': '<div style="border-top:1px solid #ccc;padding-top:6px;margin-top:20px;color:#555;font-size:12px;text-align:left">עמוד 1</div>',
          'תאריך': `<div style="border-top:1px solid #ccc;padding-top:6px;margin-top:20px;color:#555;font-size:12px">${new Date().toLocaleDateString('he-IL')}</div>`,
        };
        const pos = editor.state.doc.content.size;
        editor.chain().focus().insertContentAt(pos, footerMap[value] || footerMap['ריק']).run();
        break;
      }
      case 'insertPageNum':
        editor.chain().focus().insertContent(`<span style="border:1px solid #ccc;padding:1px 6px;border-radius:3px;font-size:11px;color:#555">[עמוד]</span>`).run();
        break;
      case 'insertTextBox': {
        const tbMap = {
          'פשוט': 'border:1px solid #ccc;padding:12px;margin:8px 0;min-height:60px',
          'עם כותרת': 'border:1px solid #2B579A;padding:12px;margin:8px 0;min-height:60px',
          'ציטוט': 'border-right:4px solid #2B579A;padding:8px 16px;margin:8px 0;color:#555;font-style:italic',
          'הדגשה': 'background:#f3f4f6;border:none;padding:12px;margin:8px 0;border-radius:4px',
        };
        editor.chain().focus().insertContent(`<div style="${tbMap[value] || tbMap['פשוט']}">לחץ לעריכה...</div>`).run();
        break;
      }
      case 'insertWordArt': {
        const { text: waText, style: waStyle } = value || {};
        if (waText && waStyle) editor.chain().focus().insertContent(`<span style="${waStyle}">${waText}</span>`).run();
        break;
      }
      case 'insertSmartArt': {
        const result = await requestInputDialog({
          title: 'יצירת SmartArt',
          description: 'הפרד בין הפריטים בפסיקים.',
          fields: [
            { id: 'items', label: 'פריטים', placeholder: 'למשל: מבוא, שיטה, ממצאים, מסקנה' },
          ],
          confirmLabel: 'צור מבנה',
        });
        const items = String(result?.items || '').split(',').map(s => s.trim()).filter(Boolean);
        if (!items.length) break;
        const smartMap = {
          list: `<ul style="padding-right:20px">${items.map(i => `<li>${i}</li>`).join('')}</ul>`,
          process: `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${items.map((it, idx) => `<span style="background:#2B579A;color:white;padding:6px 12px;border-radius:4px">${it}</span>${idx < items.length - 1 ? '<span>→</span>' : ''}`).join('')}</div>`,
          cycle: `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${items.map((it, idx) => `<span style="background:#217346;color:white;padding:6px 12px;border-radius:20px">${it}</span>${idx < items.length - 1 ? '<span>↻</span>' : ''}`).join('')}</div>`,
          hierarchy: `<div style="text-align:center"><div style="background:#2B579A;color:white;padding:6px 20px;display:inline-block;margin-bottom:12px">${items[0] || ''}</div><div style="display:flex;gap:12px;justify-content:center">${items.slice(1).map(it => `<div style="background:#DEECF9;border:1px solid #2B579A;padding:6px 12px">${it}</div>`).join('')}</div></div>`,
          matrix: `<table style="border-collapse:collapse;width:100%">${items.map((it, i) => i % 2 === 0 ? `<tr><td style="border:1px solid #ccc;padding:8px;background:#f3f4f6">${it}</td><td style="border:1px solid #ccc;padding:8px">${items[i + 1] || ''}</td></tr>` : '').join('')}</table>`,
        };
        editor.chain().focus().insertContent(smartMap[value] || smartMap.list).run();
        break;
      }
      case 'insertChart': {
        const result = await requestInputDialog({
          title: 'בניית תרשים',
          description: 'הקלד זוגות של שם וערך בפורמט שם:ערך, מופרדים בפסיקים.',
          fields: [
            { id: 'chartData', label: 'נתונים', placeholder: 'ינואר:45, פברואר:72, מרץ:60' },
          ],
          confirmLabel: 'צור תרשים',
        });
        const chartData = String(result?.chartData || '');
        const rows = chartData.split(',').map(r => r.trim().split(':').map(s => s.trim())).filter(r => r.length === 2);
        if (!rows.length) break;
        const max = Math.max(...rows.map(r => parseFloat(r[1]) || 0)) || 1;
        const barChart = `<div style="padding:12px;background:#f9f9f9;border:1px solid #ddd;border-radius:4px;margin:8px 0"><div style="font-weight:bold;margin-bottom:8px;text-align:center">תרשים</div>${rows.map(([lbl, val]) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span style="width:70px;font-size:12px;text-align:right">${lbl}</span><div style="flex:1;background:#e5e7eb;border-radius:2px;height:18px;position:relative"><div style="width:${Math.round((parseFloat(val) / max) * 100)}%;background:#2B579A;height:100%;border-radius:2px;display:flex;align-items:center;padding-right:4px"><span style="font-size:11px;color:white">${val}</span></div></div></div>`).join('')}</div>`;
        editor.chain().focus().insertContent(barChart).run();
        break;
      }

      /* ---- פקודות עמודים ---- */
      case 'insertCoverPage': {
        const styleType = value || 'classic';
        const initialTitle = editor.getText().trim().split('\n').find(Boolean) || 'כותרת המסמך';
        const result = await requestInputDialog({
          title: 'פרטי עמוד שער',
          description: 'אם כבר קיים עמוד שער קודם, הוא יוחלף בצורה בטוחה.',
          fields: [
            { id: 'title', label: 'כותרת המסמך', value: initialTitle },
            { id: 'subtitle', label: 'כותרת משנה', value: 'כותרת משנה' },
            { id: 'author', label: 'שם המחבר', value: '________________' },
          ],
          confirmLabel: 'החל עמוד שער',
        });
        if (!result) break;
        const title = String(result.title || 'כותרת המסמך').trim() || 'כותרת המסמך';
        const sub = String(result.subtitle || 'כותרת משנה').trim() || 'כותרת משנה';
        const author = String(result.author || '________________').trim() || '________________';
        const date = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long' });
        const safeTitle = escHtml(title);
        const safeSub = escHtml(sub);
        const safeAuthor = escHtml(author);
        const safeDate = escHtml(date);

        const coverTemplates = {
          classic: `<div data-cover-page="true"><p>מסמך רשמי</p><h1>${safeTitle}</h1><h2>${safeSub}</h2><hr /><p>נכתב על ידי ${safeAuthor}</p><p>${safeDate}</p></div>`,
          modern: `<div data-cover-page="true"><p>WordFlow AI</p><h1>${safeTitle}</h1><h2>${safeSub}</h2><hr /><p>${safeAuthor}</p><p>${safeDate}</p></div>`,
          academic: `<div data-cover-page="true"><p>עבודה אקדמית</p><h1>${safeTitle}</h1><h2>${safeSub}</h2><hr /><p>מגיש/ה: ${safeAuthor}</p><p>${safeDate}</p></div>`,
          bold: `<div data-cover-page="true"><p>דוח / מצגת / מסמך</p><h1>${safeTitle}</h1><h2>${safeSub}</h2><hr /><p>${safeAuthor}</p><p>${safeDate}</p></div>`,
        };

  persistActiveTemplateId('cover');
        syncPersistedAppSettings();
        setActiveTemplateId('cover');
        const existingHtml = String(editor.getHTML() || '').replace(/<div data-cover-page="true">[\s\S]*?<\/div>\s*(<div data-type="page-break"><\/div>)?/i, '').trim();
        const cover = `${coverTemplates[styleType] || coverTemplates.classic}<div data-type="page-break"></div>${existingHtml || '<h1>כותרת פרק</h1><p></p>'}`;
        editor.commands.setContent(cover);
        break;
      }
      case 'insertBlankPage': {
        const blankPageHtml = `<div data-type="page-break"></div>${'<p>&nbsp;</p>'.repeat(14)}<div data-type="page-break"></div><p></p>`;
        editor.chain().focus().insertContent(blankPageHtml).run();
        break;
      }

      /* ---- פקודות סקירה ---- */
      case 'toggleComments': {
        const marks = document.querySelectorAll('.ProseMirror mark');
        marks.forEach(m => { m.style.display = m.style.display === 'none' ? '' : 'none'; });
        break;
      }
      case 'toggleTracking': {
        const newVal = !trackChanges;
        setTrackChanges(newVal);
        alert(newVal ? 'מעקב שינויים: פעיל' : 'מעקב שינויים: כבוי');
        break;
      }
      case 'acceptAllChanges': {
        const html = editor.getHTML();
        const div = document.createElement('div');
        div.innerHTML = html;
        div.querySelectorAll('[data-ai-suggestion="true"]').forEach(el => {
          el.replaceWith(...Array.from(el.childNodes));
        });
        editor.commands.setContent(div.innerHTML);
        break;
      }
      case 'rejectAllChanges': {
        const html2 = editor.getHTML();
        const div2 = document.createElement('div');
        div2.innerHTML = html2;
        div2.querySelectorAll('[data-ai-suggestion="true"]').forEach(el => {
          const origHtml = el.getAttribute('data-original-html');
          if (origHtml) {
            const holder = document.createElement('div');
            holder.innerHTML = origHtml;
            el.replaceWith(...Array.from(holder.childNodes));
            return;
          }
          const orig = el.getAttribute('data-original-text') || '';
          const span = document.createElement('span');
          span.textContent = orig;
          el.replaceWith(span);
        });
        editor.commands.setContent(div2.innerHTML);
        break;
      }

      /* ---- פקודות ציטוטים ---- */
      case 'insertCitation': {
        const result = await requestInputDialog({
          title: 'הוספת ציטוט',
          fields: [
            { id: 'author', label: 'שם המחבר', placeholder: 'למשל: Cohen' },
            { id: 'year', label: 'שנה', value: String(new Date().getFullYear()) },
            { id: 'title', label: 'כותרת המקור', placeholder: 'שם מאמר או ספר' },
          ],
          confirmLabel: 'הוסף ציטוט',
        });
        const author = String(result?.author || '').trim();
        const year = String(result?.year || new Date().getFullYear()).trim();
        const title = String(result?.title || '').trim();
        if (!author) break;
        const citStyle = localStorage.getItem('citation-style') || 'APA';
        const citText = citStyle === 'APA'
          ? `(${escHtml(author)}, ${escHtml(String(year))})`
          : citStyle === 'MLA'
            ? `(${escHtml(author)} ${escHtml(String(year))})`
            : `${escHtml(author)} (${escHtml(String(year))})`;
        const titleTip = escHtml(`${author} (${year}). ${title}`);
        const src = { author, year, title };
        let sources = [];
        try { sources = JSON.parse(localStorage.getItem('bib-sources') || '[]'); } catch { sources = []; }
        sources.push(src);
        localStorage.setItem('bib-sources', JSON.stringify(sources));
        syncPersistedAppSettings();
        editor.chain().focus().insertContent(`<sup style="color:#2B579A;cursor:pointer" title="${titleTip}">${citText}</sup>`).run();
        break;
      }
      case 'setCitationStyle':
        localStorage.setItem('citation-style', value);
        syncPersistedAppSettings();
        break;
      case 'manageSources': {
        let srcs = [];
        try { srcs = JSON.parse(localStorage.getItem('bib-sources') || '[]'); } catch { srcs = []; }
        if (!srcs.length) { alert('אין מקורות שמורים עדיין.'); break; }
        alert('מקורות שמורים:\n\n' + srcs.map((s, i) => `${i + 1}. ${s.author} (${s.year}). ${s.title}`).join('\n'));
        break;
      }
      case 'insertBibliography': {
        let srcs2 = [];
        try { srcs2 = JSON.parse(localStorage.getItem('bib-sources') || '[]'); } catch { srcs2 = []; }
        const style = localStorage.getItem('citation-style') || 'APA';
        if (!srcs2.length) { alert('אין מקורות לביבליוגרפיה. הוסף ציטוטים תחילה.'); break; }
        const bibItems = srcs2.map(s => {
          const a = escHtml(s.author), y = escHtml(String(s.year)), t = escHtml(s.title);
          if (style === 'APA') return `<li>${a} (${y}). <em>${t}</em>.</li>`;
          if (style === 'MLA') return `<li>${a}. "<em>${t}</em>." ${y}.</li>`;
          return `<li>${a}, "${t}" (${y}).</li>`;
        }).join('');
        editor.chain().focus().insertContent(`<div style="margin-top:24px"><h2 style="font-size:16px;font-weight:bold;border-bottom:1px solid #ccc;padding-bottom:4px">ביבליוגרפיה</h2><ol style="padding-right:20px;line-height:2">${bibItems}</ol></div>`).run();
        break;
      }

      /* ---- פקודות תצוגה ---- */
      case 'setViewMode': {
        const pg = document.querySelector('.ProseMirror');
        if (!pg) break;
        const nextViewMode = value || 'print';
        pg.dataset.viewMode = nextViewMode;
        setViewMode(nextViewMode);
        switch (nextViewMode) {
          case 'read':
            editor.setEditable(false);
            pg.style.background = '#FAFAFA';
            pg.style.fontFamily = 'Georgia, serif';
            pg.style.fontSize = '17px';
            pg.style.lineHeight = '1.8';
            pg.style.maxWidth = '700px';
            break;
          case 'web':
            pg.style.maxWidth = '100%';
            pg.style.padding = '20px 40px';
            pg.style.background = 'white';
            pg.style.boxShadow = 'none';
            editor.setEditable(true);
            break;
          case 'outline':
            editor.setEditable(true);
            pg.style.fontFamily = 'monospace';
            pg.style.fontSize = '13px';
            pg.style.lineHeight = '1.4';
            break;
          case 'draft':
            pg.style.maxWidth = '100%';
            pg.style.background = 'white';
            pg.style.boxShadow = 'none';
            pg.style.border = 'none';
            editor.setEditable(true);
            break;
          default: // print
            editor.setEditable(true);
            pg.contentEditable = 'true';
            pg.style.maxWidth = '21cm';
            pg.style.background = 'white';
            pg.style.fontFamily = '';
            pg.style.fontSize = '';
            pg.style.lineHeight = '';
            applyDocumentStyleToEditor(documentStyle);
        }
        break;
      }
      case 'toggleRuler': {
        const wrapper = document.querySelector('#editor-wrapper');
        if (!wrapper) break;
        const shouldShow = typeof value === 'boolean' ? value : !wrapper.classList.contains('show-ruler');
        wrapper.classList.toggle('show-ruler', shouldShow);
        break;
      }
      case 'toggleGrid': {
        const wrapper = document.querySelector('#editor-wrapper');
        if (!wrapper) break;
        const shouldShow = typeof value === 'boolean' ? value : !wrapper.classList.contains('show-grid');
        wrapper.classList.toggle('show-grid', shouldShow);
        break;
      }
      case 'splitWindow':
        alert('הפצל אינו נתמך בדפדפן. פתח חלון נוסף עם Ctrl+T.');
        break;

      default: break;
    }
  };
  handleCommandRef.current = handleCommand;

  const hasPendingUserApproval = Boolean(feedbackSurvey.prompt || feedbackSurvey.usedFallback)
    && (liveGeneration.state === 'success' || liveGeneration.state === 'warning');
  const shouldShowProgressOnlyPanel = liveGeneration.active
    && (liveGeneration.state === 'running' || feedbackSurvey.open || hasPendingUserApproval);
  const progressLogs = Array.isArray(liveGeneration.logs) ? liveGeneration.logs : [];
  const feedbackReviewSuggestions = Array.isArray(feedbackSurvey.reviewResult?.suggestions)
    ? feedbackSurvey.reviewResult.suggestions
    : [];
  const feedbackReviewSummary = String(feedbackSurvey.reviewResult?.summary || '').trim();
  const canOpenDraftRecommendations = !feedbackSurvey.submitting
    && liveGeneration.state !== 'running'
    && hasMeaningfulEditorContent(editor);
  const isStartTransitionRunning = startTransitionPhase === 'running';
  const prefersReducedMotion = getPrefersReducedMotion();
  const isInputDialogVisible = inputDialog.open;
  const isCopyleaksDetectorVisible = copyleaksDetector.open && !showStartScreen;
  const isFeedbackSurveyVisible = feedbackSurvey.open && !showStartScreen;
  const copyleaksConfig = normalizeCopyleaksConfig(getProviderConfig().copyleaks);
  const copyleaksTextStats = getCopyleaksTextStats(copyleaksDetector.text);
  const copyleaksValidationMessage = getCopyleaksValidationMessage(copyleaksDetector.text);
  const isCopyleaksConfigured = Boolean(copyleaksConfig.email && copyleaksConfig.key);
  const canSubmitCopyleaks = Boolean(!copyleaksDetector.submitting && isCopyleaksConfigured && copyleaksTextStats.isValid);
  const shouldHideEditorWrapper = showStartScreen && !isInputDialogVisible;
  const canCreateDesktopWindow = Boolean(window.desktopApp?.createAppWindow);
  return (
    <div className="flex flex-col h-screen bg-[var(--page-bg,#E1DFDD)] text-[var(--text-color,#323130)] overflow-hidden" dir="rtl">
      {showSplash && <AppStartupSplash onDone={() => setShowSplash(false)} />}
      <ConfettiCelebration active={documentArrival.active && documentArrival.tone === 'success'} />
      <TopBar
        onOpenUpdates={openUpdatesPanel}
        onOpen={() => handleCommand('openFile')}
        onNew={() => handleCommand('newDoc')}
        onNewWindow={() => {
          if (!window.desktopApp?.createAppWindow) return;
          Promise.resolve(window.desktopApp.createAppWindow()).catch(() => {});
        }}
        newWindowDisabled={!canCreateDesktopWindow}
        onSave={() => handleCommand('saveLocal')}
        onSaveAs={() => handleCommand('saveAs')}
        onUndo={() => editor?.chain().focus().undo().run()}
        onRedo={() => editor?.chain().focus().redo().run()}
        onHome={openHomeSafely}
        onOpenDraftRecommendations={openDraftRecommendations}
        draftRecommendationsDisabled={!canOpenDraftRecommendations}
      />
      <Ribbon
        onCommand={handleCommand}
        documentStyle={documentStyle}
        onToggleTaskpane={() => {
          setAssistantTrigger('manual');
          setSidebarOpen((v) => {
            const next = !v;
            if (next) setSidebarCompact(false);
            return next;
          });
          setLastEditorActivityAt(Date.now());
        }}
        zoom={zoom}
        onOpenFileMenu={() => {
          setFileMenuTargetTab(null);
          setFileMenuOpen(true);
        }}
        formatPainterActive={formatPainterActive}
        activeFormats={activeFormats}
        shortcuts={shortcuts}
        assistantOpen={sidebarOpen}
      />
      
      <main id="workspace" className="flex flex-1 overflow-hidden relative">
        {!showStartScreen && sidebarOpen && (
          <aside
            className="order-last h-full min-h-0 shrink-0 border-r border-slate-300 bg-[#F8FAFC] z-20 transition-all duration-200 shadow-[8px_0_24px_rgba(15,23,42,0.06)] flex flex-col overflow-hidden"
            style={{ width: sidebarCompact ? 'min(340px, 36vw)' : 'min(460px, 44vw)', minWidth: sidebarCompact ? 280 : 340, maxWidth: sidebarCompact ? '38vw' : '520px' }}
          >
            {liveGeneration.active && (
              <div className={`${shouldShowProgressOnlyPanel ? 'h-full min-h-0 p-4' : 'border-b border-slate-200 bg-white px-3 py-3'}`}>
                <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${shouldShowProgressOnlyPanel ? 'h-full min-h-0 flex flex-col overflow-hidden p-4' : 'p-3'}`}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="text-base font-bold text-slate-900">
                        {liveGeneration.state === 'success' ? 'המסמך מוכן' : liveGeneration.state === 'warning' ? 'המסמך מוכן לבדיקה' : liveGeneration.state === 'error' ? 'אירעה שגיאה בתהליך' : 'יוצר מסמך עכשיו'}
                      </div>
                      <div className="text-xs text-slate-600 mt-1 truncate">{liveGeneration.prompt || 'מעבד את הבקשה שלך...'}</div>
                    </div>
                    <div className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${liveGeneration.state === 'success' ? 'bg-emerald-100 text-emerald-700' : liveGeneration.state === 'warning' ? 'bg-amber-100 text-amber-700' : liveGeneration.state === 'error' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                      {liveGeneration.state === 'success' ? 'הושלם' : liveGeneration.state === 'warning' ? 'ממתין לאישור' : liveGeneration.state === 'error' ? 'שגיאה' : 'בתהליך'}
                    </div>
                  </div>

                  <div className={`${shouldShowProgressOnlyPanel ? 'flex-1 min-h-0 overflow-y-auto pr-1 pb-1' : ''}`}>
                    <LiveGenerationMood state={liveGeneration.state} />
                    <div className="space-y-2">
                      {(liveGeneration.summary?.stages || []).slice(0, 6).map((stage) => (
                        <div key={stage.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-xs bg-slate-50">
                          <span className="font-medium text-slate-700 truncate pr-2">{stage.label}</span>
                          <span className={`font-bold ${stage.state === 'success' ? 'text-emerald-600' : stage.state === 'error' ? 'text-red-600' : stage.state === 'running' ? 'text-blue-600' : 'text-slate-400'}`}>
                            {stage.state === 'success' ? '✓' : stage.state === 'error' ? '✗' : stage.state === 'running' ? '...' : '•'}
                          </span>
                        </div>
                      ))}
                    </div>

                    {liveGeneration.state === 'running' && (
                      <OneAxisAirHockeyGame title="Arcade בזמן שהצוות עובד" compact allowPopup />
                    )}

                      {(liveGeneration.state === 'running' || liveGeneration.state === 'error') && (
                      <div className={`mt-3 rounded-xl border p-3 ${liveGeneration.state === 'running' ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-slate-50/80'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[11px] leading-4 text-slate-700">
                            {liveGeneration.state === 'running'
                              ? 'אם ההרצה נראית תקועה, אפשר לנקות את המצב ולהתחיל מחדש.'
                              : 'אפשר לסגור את מצב השגיאה ולחזור לעבודה.'}
                          </div>
                          <button
                            type="button"
                            className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                            onClick={clearDraftReviewState}
                          >
                            {liveGeneration.state === 'running' ? 'שחרר מצב תקוע' : 'נקה מצב שגיאה'}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5">
                      <div className="text-[11px] font-bold text-slate-700 mb-2">לוג חי של ההרצה</div>
                      <div className={`${shouldShowProgressOnlyPanel ? 'max-h-[34vh]' : 'max-h-32'} overflow-auto space-y-1.5 pr-1`}>
                        {progressLogs.length ? progressLogs.map((log, index) => {
                          const logTimeValue = log?.timestamp || log?.time || log?.ts;
                          const logTime = logTimeValue ? new Date(logTimeValue).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';
                          const logAgent = String(log?.agentLabel || log?.agentId || 'מערכת');
                          const logMessage = String(log?.message || log?.type || 'עודכן סטטוס תהליך');
                          return (
                            <div key={`${logTime}-${logAgent}-${index}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                              <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 mb-0.5">
                                <span className="font-semibold text-slate-600 truncate">{logAgent}</span>
                                <span>{logTime}</span>
                              </div>
                              <div className="text-[11px] text-slate-700 leading-4">{logMessage}</div>
                            </div>
                          );
                        }) : (
                          <div className="text-[11px] text-slate-500 px-1 py-1">הלוגים יופיעו כאן בזמן אמת...</div>
                        )}
                      </div>
                    </div>

                    {canRetryFailedGeneration && (
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50/80 p-3">
                        <div className="text-[11px] font-bold text-red-700">הסוכן שנכשל: {failedGenerationStage?.label || failedStageAgentRecord?.name || 'לא זוהה'}</div>
                        <div className="mt-1 text-[11px] leading-4 text-slate-700">
                          ההרצה נעצרה ב־{failedStageProviderLabel} / {failedStageModelLabel}. אפשר לעדכן רק את הסוכן הזה ולהפעיל מחדש את אותה פעולה מההתחלה.
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <label className="block text-[11px] text-slate-700">
                            <span className="mb-1 block font-semibold">Provider חלופי</span>
                            <select
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[12px] text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                              value={generationRecovery.provider}
                              onChange={handleRecoveryProviderChange}
                              disabled={generationRecovery.pending}
                            >
                              {configuredProviderChoices.map((provider) => (
                                <option key={provider.id} value={provider.id}>{provider.label}</option>
                              ))}
                            </select>
                          </label>

                          <label className="block text-[11px] text-slate-700">
                            <span className="mb-1 block font-semibold">מודל חלופי</span>
                            <select
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[12px] text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                              value={generationRecovery.model}
                              onChange={handleRecoveryModelChange}
                              disabled={generationRecovery.pending || !recoveryModelChoices.length}
                            >
                              {recoveryModelChoices.map((model) => (
                                <option key={model} value={model}>{model}</option>
                              ))}
                            </select>
                          </label>
                        </div>

                        {generationRecovery.error && (
                          <div className="mt-2 text-[11px] font-medium text-red-700">{generationRecovery.error}</div>
                        )}

                        <button
                          className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-red-600 px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                          onClick={retryFailedGenerationWithUpdatedAgent}
                          disabled={generationRecovery.pending || !generationRecovery.provider || !generationRecovery.model}
                        >
                          {generationRecovery.pending ? 'מעדכן סוכן ומריץ מחדש...' : 'החלף מודל והרץ מחדש'}
                        </button>
                      </div>
                    )}

                    {(liveGeneration.state === 'success' || liveGeneration.state === 'warning') && (feedbackSurvey.prompt || feedbackSurvey.usedFallback) && (
                      <div className="mt-3 flex gap-2">
                        <button
                          className="btn btn-sm btn-primary flex-1"
                          onClick={() => setFeedbackSurvey((prev) => ({ ...prev, open: true, phase: 'details' }))}
                        >
                          בקש תיקונים
                        </button>
                        <button
                          className="btn btn-sm btn-ghost flex-1"
                          onClick={() => setLiveGeneration((prev) => ({ ...prev, active: false }))}
                        >
                          אשר והמשך לערוך
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!shouldShowProgressOnlyPanel && (
              <AiSidebar
                mode="sidebar"
                compactMode={sidebarCompact}
                onToggleCompact={() => setSidebarCompact((prev) => !prev)}
                reason={assistantTrigger}
                documentContext={() => editor ? editor.getText().slice(0, 9000) : ''}
                selectedText={selectedText}
                currentBlockText={currentBlockText}
                wordPreferences={wordPreferences}
                onInsert={(text) => {
                  if (editor) editor.chain().focus().insertContent(`\n\n${text}\n\n`).run();
                }}
                onClose={closeAssistantPopup}
              />
            )}
          </aside>
        )}

        <div
          id="editor-wrapper"
          className="flex flex-1 min-w-0 overflow-y-auto overflow-x-auto p-8 justify-center items-start bg-[#E1DFDD] relative"
          style={{
            opacity: shouldHideEditorWrapper ? 0 : 1,
            transform: prefersReducedMotion
              ? 'none'
              : (shouldHideEditorWrapper ? 'translateY(24px) scale(0.985)' : 'translateY(0px) scale(1)'),
            filter: prefersReducedMotion ? 'none' : (shouldHideEditorWrapper ? 'blur(12px)' : 'blur(0px)'),
            transition: prefersReducedMotion
              ? 'none'
              : 'opacity 320ms ease-out, transform 420ms cubic-bezier(0.22, 1, 0.36, 1), filter 260ms ease-out',
            pointerEvents: shouldHideEditorWrapper ? 'none' : 'auto',
          }}
          aria-hidden={shouldHideEditorWrapper}
          inert={shouldHideEditorWrapper ? true : undefined}
        >
          {isInputDialogVisible && (
            <div
              className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 transition-all duration-300"
              dir="rtl"
              onMouseDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (inputDialog.closeOnBackdrop) closeInputDialog(null);
              }}
            >
              <div className="w-[520px] max-w-[96%] rounded-[24px] bg-white shadow-2xl border border-slate-200 p-6 md:p-8 transform transition-all scale-100 opacity-100 flex flex-col gap-6">
                
                {/* Header */}
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="flex-1 text-right">
                    <h3 className="text-2xl font-bold text-slate-800 tracking-tight">{inputDialog.title || 'השלם פרטים'}</h3>
                    {inputDialog.description ? <p className="text-sm text-slate-500 mt-2 leading-relaxed">{inputDialog.description}</p> : null}
                  </div>
                  <button 
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors flex-shrink-0" 
                    onClick={() => closeInputDialog(null)}
                    title="סגור"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                {/* Body */}
                <div className="space-y-5">
                  {(inputDialog.fields || []).map((field, idx) => (
                    <label key={field.id} className="block text-right group">
                      <div className="text-sm font-semibold text-slate-700 mb-2">{field.label}</div>
                      {field.type === 'textarea' ? (
                        <textarea
                          autoFocus={idx === 0}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none min-h-[120px] resize-y"
                          placeholder={field.placeholder || ''}
                          value={inputDialog.values?.[field.id] || ''}
                          onChange={(e) => setInputDialog((prev) => ({
                            ...prev,
                            values: { ...prev.values, [field.id]: e.target.value },
                          }))}
                          onKeyDown={(e) => {
                            if (inputDialog.submitOnCtrlEnterForTextarea && e.key === 'Enter' && e.ctrlKey) {
                              e.preventDefault();
                              submitInputDialog();
                            }
                          }}
                        />
                      ) : (
                        <input
                          type={field.type || 'text'}
                          autoFocus={idx === 0}
                          dir="rtl"
                          className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl ${field.id === 'url' ? 'text-left dir-ltr font-mono text-sm' : 'text-slate-800'} placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none`}
                          placeholder={field.placeholder || ''}
                          value={inputDialog.values?.[field.id] || ''}
                          onChange={(e) => setInputDialog((prev) => ({
                            ...prev,
                            values: { ...prev.values, [field.id]: e.target.value },
                          }))}
                          onKeyDown={(e) => {
                            if (inputDialog.submitOnEnter && e.key === 'Enter') {
                              e.preventDefault();
                              submitInputDialog();
                            }
                          }}
                        />
                      )}
                    </label>
                  ))}
                </div>

                {/* Footer */}
                <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                  <button 
                    className="px-6 py-2.5 rounded-xl font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors" 
                    onClick={() => closeInputDialog(null)}
                  >
                    ביטול
                  </button>
                  <button 
                    className="px-8 py-2.5 rounded-xl font-semibold text-white bg-[#0066cc] hover:bg-blue-700 shadow-sm hover:shadow transition-all active:scale-[0.98]" 
                    onClick={submitInputDialog}
                  >
                    {inputDialog.confirmLabel || 'אישור'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {isCopyleaksDetectorVisible && (
            <div
              className="fixed inset-0 z-[101] bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4"
              dir="rtl"
              onMouseDown={(event) => {
                if (event.target !== event.currentTarget) return;
                closeCopyleaksDetector();
              }}
            >
              <div className="w-[1180px] max-w-[98%] max-h-[92vh] overflow-hidden rounded-[28px] bg-white shadow-2xl border border-slate-200 flex flex-col">
                <div className="flex items-start justify-between gap-4 px-6 py-5 md:px-8 border-b border-slate-100 bg-slate-50/70">
                  <div className="min-w-0 flex-1 text-right">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold text-blue-700">Copyleaks</span>
                      <span className="inline-flex items-center rounded-full bg-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-700">{copyleaksDetector.sourceLabel}</span>
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${isCopyleaksConfigured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {isCopyleaksConfigured ? 'ההגדרות מוכנות' : 'צריך למלא הגדרות'}
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-slate-800 tracking-tight">זיהוי AI עם Copyleaks</h3>
                    <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                      הכלי הזה בודק טקסט קיים דרך Copyleaks כדי להעריך אם הוא נראה אנושי או נראה כתוכן שנוצר בעזרת AI. הוא לא כותב טקסט ולא משנה את מנוע הכתיבה שלכם.
                    </p>
                  </div>
                  <button
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors flex-shrink-0"
                    onClick={closeCopyleaksDetector}
                    title="סגור"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[1.15fr,0.85fr] gap-0 min-h-0 flex-1 overflow-hidden">
                  <div className="p-6 md:p-8 overflow-y-auto border-b xl:border-b-0 xl:border-l border-slate-100 space-y-5">
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">רגישות: {copyleaksConfig.sensitivity}</span>
                      <span className={`inline-flex items-center rounded-full px-3 py-1 font-semibold ${copyleaksConfig.explain ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>פירוט נוסף: {copyleaksConfig.explain ? 'פעיל' : 'כבוי'}</span>
                      <span className={`inline-flex items-center rounded-full px-3 py-1 font-semibold ${copyleaksConfig.sandbox ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>מצב הדגמה: {copyleaksConfig.sandbox ? 'פעיל' : 'כבוי'}</span>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">שפה: {copyleaksConfig.language || 'אוטומטי'}</span>
                    </div>

                    <label className="block text-right">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="text-sm font-semibold text-slate-700">טקסט לבדיקה</span>
                        <span className={`text-xs font-semibold ${copyleaksTextStats.isValid ? 'text-emerald-700' : copyleaksTextStats.length ? 'text-amber-700' : 'text-slate-400'}`}>
                          {copyleaksTextStats.length.toLocaleString('he-IL')} תווים
                        </span>
                      </div>
                      <textarea
                        dir="auto"
                        className="w-full min-h-[240px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none resize-y leading-7"
                        placeholder={`הדביקו כאן טקסט לבדיקה בטווח ${COPYLEAKS_TEXT_MIN_CHARS}-${COPYLEAKS_TEXT_MAX_CHARS} תווים`}
                        value={copyleaksDetector.text}
                        onChange={(event) => setCopyleaksDetector((prev) => ({
                          ...prev,
                          text: event.target.value,
                          error: '',
                          result: null,
                        }))}
                      />
                    </label>

                    <div className={`rounded-2xl border px-4 py-3 text-sm ${copyleaksTextStats.isValid ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                      {copyleaksTextStats.isValid
                        ? `הטקסט מוכן לשליחה. Copyleaks יקבל ${copyleaksTextStats.length.toLocaleString('he-IL')} תווים לבדיקה.`
                        : (copyleaksValidationMessage || `Copyleaks דורש ${COPYLEAKS_TEXT_MIN_CHARS}-${COPYLEAKS_TEXT_MAX_CHARS} תווים לבדיקה.`)}
                    </div>

                    {!isCopyleaksConfigured && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 leading-7">
                        כדי להריץ בדיקה אמיתית, פתחו את הגדרות Copyleaks ומלאו אימייל ומפתח סודי. אפשר גם לבדוק חיבור כדי לוודא שהפרטים נכונים. ההגדרה הזו נפרדת ממנוע הכתיבה הפעיל.
                      </div>
                    )}

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-sm font-bold text-slate-800 mb-2">מה חשוב לדעת</div>
                      <div className="space-y-2 text-sm leading-7 text-slate-600">
                        {COPYLEAKS_HELP_LINES.map((line) => (
                          <div key={line}>• {line}</div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-3 justify-end">
                      <button
                        className="px-4 py-2.5 rounded-xl font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors"
                        onClick={openCopyleaksSettingsPanel}
                      >
                        פתח הגדרות Copyleaks
                      </button>
                      <button
                        className="px-4 py-2.5 rounded-xl font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                        onClick={closeCopyleaksDetector}
                      >
                        סגור
                      </button>
                      <button
                        className={`px-6 py-2.5 rounded-xl font-semibold text-white shadow-sm transition-all ${canSubmitCopyleaks ? 'bg-[#0066cc] hover:bg-blue-700 hover:shadow active:scale-[0.98]' : 'bg-slate-300 cursor-not-allowed'}`}
                        onClick={submitCopyleaksDetector}
                        disabled={!canSubmitCopyleaks}
                      >
                        {copyleaksDetector.submitting ? 'מריץ בדיקת Copyleaks...' : 'הרץ בדיקה'}
                      </button>
                    </div>
                  </div>

                  <div className="p-6 md:p-8 overflow-y-auto space-y-5 bg-white">
                    {copyleaksDetector.error && (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 leading-7">
                        {copyleaksDetector.error}
                      </div>
                    )}

                    {copyleaksDetector.result ? (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="text-xs font-bold tracking-[0.16em] text-slate-400 mb-2">נראה כ-AI</div>
                            <div className="text-2xl font-bold text-slate-900">{formatCopyleaksPercent(copyleaksDetector.result.summary.ai)}</div>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="text-xs font-bold tracking-[0.16em] text-slate-400 mb-2">נראה אנושי</div>
                            <div className="text-2xl font-bold text-slate-900">{formatCopyleaksPercent(copyleaksDetector.result.summary.human)}</div>
                          </div>
                          <div className={`rounded-2xl border px-4 py-4 ${copyleaksDetector.result.classificationCode === COPYLEAKS_CLASSIFICATION_AI ? 'border-rose-200 bg-rose-50' : copyleaksDetector.result.classificationCode === COPYLEAKS_CLASSIFICATION_HUMAN ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                            <div className="text-xs font-bold tracking-[0.16em] text-slate-400 mb-2">הערכה כללית</div>
                            <div className={`text-lg font-bold ${copyleaksDetector.result.classificationCode === COPYLEAKS_CLASSIFICATION_AI ? 'text-rose-700' : copyleaksDetector.result.classificationCode === COPYLEAKS_CLASSIFICATION_HUMAN ? 'text-emerald-700' : 'text-slate-700'}`}>
                              {copyleaksDetector.result.classificationLabel}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="text-sm font-bold text-slate-800 mb-3">פרטי הבדיקה</div>
                          <div className="flex flex-wrap gap-2 text-[12px] text-slate-600">
                            {copyleaksDetector.result.modelVersion && <span className="inline-flex items-center rounded-full bg-white px-3 py-1 border border-slate-200">גרסת מנוע: {copyleaksDetector.result.modelVersion}</span>}
                            {copyleaksDetector.result.scannedDocument?.wordCount != null && <span className="inline-flex items-center rounded-full bg-white px-3 py-1 border border-slate-200">מילים: {Number(copyleaksDetector.result.scannedDocument.wordCount).toLocaleString('he-IL')}</span>}
                            {copyleaksDetector.result.scannedDocument?.credits != null && <span className="inline-flex items-center rounded-full bg-white px-3 py-1 border border-slate-200">קרדיטים: {Number(copyleaksDetector.result.scannedDocument.credits).toLocaleString('he-IL')}</span>}
                            {(copyleaksDetector.result.scannedDocument?.language || copyleaksDetector.result.requestMeta?.language) && <span className="inline-flex items-center rounded-full bg-white px-3 py-1 border border-slate-200">שפה: {copyleaksDetector.result.scannedDocument?.language || copyleaksDetector.result.requestMeta?.language}</span>}
                            {copyleaksDetector.result.requestMeta?.sandbox && <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">תוצאות הדגמה פעילות</span>}
                            {copyleaksDetector.result.requestMeta?.explain && <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 font-semibold text-indigo-700">פירוט נוסף פעיל</span>}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                          <div className="text-sm font-bold text-slate-800 mb-3">קטעים שסומנו</div>
                          {copyleaksDetector.result.results.length ? (
                            <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                              {copyleaksDetector.result.results.map((entry, index) => (
                                <div key={`${entry.id}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <div className="text-sm font-semibold text-slate-800">{entry.classificationLabel}</div>
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                      {entry.score != null && <span>ציון: {formatCopyleaksPercent(entry.score)}</span>}
                                      {entry.ai != null && <span>נראה כ-AI: {formatCopyleaksPercent(entry.ai)}</span>}
                                      {entry.human != null && <span>נראה אנושי: {formatCopyleaksPercent(entry.human)}</span>}
                                      {(entry.startIndex != null || entry.endIndex != null) && <span>טווח: {entry.startIndex ?? '?'}-{entry.endIndex ?? '?'}</span>}
                                    </div>
                                  </div>
                                  <div className="text-sm leading-7 text-slate-600 whitespace-pre-wrap">{entry.preview || 'Copyleaks לא החזיר טקסט מקטע מפורט עבור פריט זה.'}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-slate-500 leading-7">לא הוחזרו תתי-מקטעים מפורטים עבור הבדיקה הזו.</div>
                          )}
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                          <div className="text-sm font-bold text-slate-800 mb-3">פירוט נוסף</div>
                          {copyleaksDetector.result.explainPatterns.length ? (
                            <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                              {copyleaksDetector.result.explainPatterns.map((pattern) => (
                                <div key={pattern.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <div className="text-sm font-semibold text-slate-800">{pattern.title}</div>
                                    {pattern.score != null && <div className="text-[11px] font-semibold text-indigo-700">{formatCopyleaksPercent(pattern.score)}</div>}
                                  </div>
                                  <div className="text-sm leading-7 text-slate-600">{pattern.text || 'Copyleaks ציין pattern בלי תיאור טקסטואלי נוסף.'}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-slate-500 leading-7">לא הוחזר פירוט נוסף. אם צריך הסבר מפורט יותר, הפעילו את האפשרות "פירוט נוסף" בהגדרות Copyleaks והריצו שוב.</div>
                          )}
                        </div>
                      </>
                    ) : !copyleaksDetector.error ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm text-slate-500 leading-7">
                        Copyleaks יציג כאן אחוזים, הערכה כללית, גרסת מנוע, פרטי הבדיקה, קטעים שסומנו ופירוט נוסף כשזמינים. במצב הדגמה יוצגו תוצאות הדגמה לצורכי בדיקה בלבד.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )}

          {isFeedbackSurveyVisible && (
            <div className="absolute inset-0 z-40 bg-slate-900/35 flex items-center justify-center p-4">
              <div className="w-[760px] max-w-[96%] rounded-[28px] bg-white shadow-2xl border border-slate-200 p-5 md:p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">{feedbackSurvey.phase === 'question' ? 'איך יצא המסמך?' : feedbackSurvey.phase === 'review' ? 'המלצות לעריכה בטיוטה' : 'מה לתקן במסמך?'}</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      {feedbackSurvey.phase === 'question'
                        ? 'אפשר לאשר שהכול מצוין, או לבקש תיקון ישיר של המסמך.'
                        : feedbackSurvey.phase === 'review'
                          ? (feedbackSurvey.submitting ? 'בודק את הטיוטה ומכין המלצות לא מחייבות בלבד.' : 'אלו המלצות עריכה בלבד. המסמך עצמו לא שונה.')
                          : 'בחר את הנקודות החשובות לך, כתוב חופשי מה לשפר, או בקש קודם המלצות בלבד.'}
                    </p>
                  </div>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={closeFeedbackSurvey}
                  >
                    סגור
                  </button>
                </div>

                {feedbackSurvey.usedFallback && (
                  <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    נוצרה כרגע טיוטה בטוחה. אפשר לאשר אותה או לשלוח עכשיו הערות לעדכון ישיר של המסמך.
                  </div>
                )}

                {feedbackSurvey.phase === 'question' ? (
                  <div className="flex flex-col md:flex-row gap-3">
                    <button
                      className="btn btn-primary flex-1"
                      onClick={approveFeedbackSurvey}
                    >
                      כן, המסמך מוכן
                    </button>
                    <button
                      className="btn btn-outline flex-1"
                      onClick={() => {
                        setFeedbackSurvey((prev) => ({ ...prev, phase: 'details' }));
                        setLiveGeneration((prev) => ({ ...prev, active: false }));
                      }}
                    >
                      לא, צריך תיקונים
                    </button>
                  </div>
                ) : feedbackSurvey.phase === 'review' ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-sm font-bold text-slate-800">
                        {feedbackSurvey.submitting ? 'בודק ומכין המלצות לעריכת המסמך...' : (feedbackReviewSummary || 'אלו כמה המלצות לעריכה ממוקדת בטיוטה.')}
                      </div>
                      <div className="mt-2 text-xs leading-6 text-slate-500 whitespace-pre-wrap">
                        {feedbackSurvey.reviewFocus || 'המיקוד לבדיקה לא הוגדר ולכן נבדקה הטיוטה בכללותה.'}
                      </div>
                    </div>

                    {feedbackSurvey.reviewErrorMessage && (
                      <div className={`rounded-2xl px-4 py-3 text-sm ${feedbackReviewUsedFallback ? 'border border-amber-200 bg-amber-50 text-amber-800' : 'border border-rose-200 bg-rose-50 text-rose-700'}`}>
                        {feedbackReviewUsedFallback
                          ? `חלק מההמלצות לא הושלמו במלואן${feedbackSurvey.reviewErrorMessage ? `: ${feedbackSurvey.reviewErrorMessage}` : '.'}`
                          : feedbackSurvey.reviewErrorMessage}
                      </div>
                    )}

                    {feedbackSurvey.submitting ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                        ההמלצות נבנות עכשיו לפי המיקוד שביקשת, בלי לשנות עדיין את המסמך עצמו.
                      </div>
                    ) : feedbackReviewSuggestions.length ? (
                      <div className="space-y-3 max-h-[48vh] overflow-y-auto pr-1">
                        {feedbackReviewSuggestions.map((suggestion, index) => (
                          <div key={`${suggestion.title || 'review'}-${index}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                            <div className="text-base font-bold text-slate-800">{suggestion.title || `המלצה ${index + 1}`}</div>
                            <div className="mt-2 text-sm leading-6 text-slate-600">{suggestion.reason}</div>
                            <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-3">
                              <div className="text-[11px] font-bold tracking-[0.16em] text-slate-400">ניסוח מוצע</div>
                              <div className="mt-1 text-sm leading-6 text-slate-700">{suggestion.suggestedChange}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                        לא נוצרו המלצות ממוקדות. אפשר לנסות שוב, או לשלוח הערות מדויקות כדי שנבצע תיקון ישיר.
                      </div>
                    )}

                    <div className="flex flex-col md:flex-row gap-3 justify-end">
                      <button
                        className="btn btn-ghost"
                        onClick={() => setFeedbackSurvey((prev) => ({ ...prev, phase: 'details', submitting: false, submissionRequestId: null }))}
                        disabled={feedbackSurvey.submitting}
                      >
                        שנה מיקוד
                      </button>
                      <button
                        className={`btn btn-outline ${feedbackSurvey.submitting ? 'btn-disabled' : ''}`}
                        onClick={requestDocumentRecommendations}
                        disabled={feedbackSurvey.submitting}
                      >
                        {feedbackSurvey.submitting ? 'מכין המלצות...' : 'רענן המלצות'}
                      </button>
                      <button
                        className={`btn btn-primary ${(feedbackSurvey.submitting || feedbackRoundsExhausted) ? 'btn-disabled' : ''}`}
                        onClick={submitDocumentFeedback}
                        disabled={feedbackSurvey.submitting || feedbackRoundsExhausted}
                      >
                        {feedbackSubmitLabel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      {FEEDBACK_OPTION_GROUPS.map((group) => (
                        <div key={group.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="font-bold text-slate-800 mb-3">{group.title}</div>
                          <div className="space-y-2">
                            {group.options.map((option) => (
                              <label key={option} className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="checkbox checkbox-sm mt-0.5"
                                  checked={feedbackSurvey.selectedOptions.includes(option)}
                                  onChange={() => toggleFeedbackOption(option)}
                                />
                                <span>{option}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <div className="font-bold text-slate-800 mb-2">הערה חופשית</div>
                      <textarea
                        className="textarea textarea-bordered w-full min-h-[120px]"
                        placeholder="למשל: חזקי יותר את הטיעון המרכזי, הוסיפי מקור עדכני, קצרי את הפתיחה, או בדקי שוב את ניסוח הסיכום..."
                        value={feedbackSurvey.freeText}
                        onChange={(e) => setFeedbackSurvey((prev) => ({ ...prev, freeText: e.target.value }))}
                      />
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                      <div className="font-bold text-slate-800">איך להריץ את סבב התיקון?</div>
                      <div className="grid md:grid-cols-2 gap-3">
                        <label className={`rounded-2xl border p-3 cursor-pointer transition ${effectiveFeedbackExecutionMode === 'direct' ? 'border-blue-300 bg-blue-50/70' : 'border-slate-200 bg-slate-50'}`}>
                          <div className="flex items-start gap-3">
                            <input
                              type="radio"
                              name="feedback-execution-mode"
                              className="radio radio-sm mt-1"
                              checked={effectiveFeedbackExecutionMode === 'direct'}
                              onChange={() => setFeedbackSurvey((prev) => ({ ...prev, executionMode: 'direct' }))}
                            />
                            <div className="space-y-1">
                              <div className="font-semibold text-slate-800">תיקון ישיר</div>
                              <div className="text-xs text-slate-500">סבב מהיר מול מודל אחד, בלי להריץ את צוות הסוכנים.</div>
                            </div>
                          </div>
                        </label>
                        <label className={`rounded-2xl border p-3 transition ${effectiveFeedbackExecutionMode === 'workspace' ? 'border-emerald-300 bg-emerald-50/70' : 'border-slate-200 bg-slate-50'} ${feedbackWorkflowAvailable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                          <div className="flex items-start gap-3">
                            <input
                              type="radio"
                              name="feedback-execution-mode"
                              className="radio radio-sm mt-1"
                              checked={effectiveFeedbackExecutionMode === 'workspace'}
                              disabled={!feedbackWorkflowAvailable}
                              onChange={() => setFeedbackSurvey((prev) => ({ ...prev, executionMode: 'workspace' }))}
                            />
                            <div className="space-y-1">
                              <div className="font-semibold text-slate-800">תיקון עם צוות הסוכנים</div>
                              <div className="text-xs text-slate-500">מריץ את ה-workflow הפעיל וממשיך להציג לוגים חיים לאורך הסבב.</div>
                            </div>
                          </div>
                        </label>
                      </div>
                      <div className={`text-xs ${feedbackRoundsExhausted ? 'text-amber-700' : 'text-slate-500'}`}>
                        {feedbackRoundsExhausted
                          ? 'מיצית את שני סבבי התיקון הזמינים למסך הזה. אפשר עדיין לרענן המלצות או להמשיך לערוך ידנית.'
                          : `סבב תיקון ${Math.min(feedbackRoundIndex, FEEDBACK_MAX_REVISION_ROUNDS)} מתוך ${FEEDBACK_MAX_REVISION_ROUNDS}. אחרי הסבב הזה ${feedbackRoundIndex < FEEDBACK_MAX_REVISION_ROUNDS ? 'יישאר עוד סבב אחד מאותו מסך.' : 'לא יישאר סבב נוסף מאותו מסך.'}`}
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-3 justify-end">
                      <button
                        className="btn btn-ghost"
                        onClick={() => setFeedbackSurvey((prev) => ({ ...prev, phase: 'question' }))}
                        disabled={feedbackSurvey.submitting}
                      >
                        חזור
                      </button>
                      <button
                        className={`btn btn-outline ${feedbackSurvey.submitting ? 'btn-disabled' : ''}`}
                        onClick={requestDocumentRecommendations}
                        disabled={feedbackSurvey.submitting}
                      >
                        קבל המלצות בלבד
                      </button>
                      <button
                        className={`btn btn-primary ${(feedbackSurvey.submitting || feedbackRoundsExhausted) ? 'btn-disabled' : ''}`}
                        onClick={submitDocumentFeedback}
                        disabled={feedbackSurvey.submitting || feedbackRoundsExhausted}
                      >
                        {feedbackSubmitLabel}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className={`wordai-document-stage relative w-full flex justify-center ${documentArrival.active ? `wordai-document-arrival wordai-document-arrival--${documentArrival.tone}` : ''}`} style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', transition: 'transform 0.2s' }}>
            <DocumentEditor
              documentStyle={documentStyle}
              viewMode={viewMode}
              activeTemplateId={activeTemplateId}
              onReady={handleEditorReady}
              onWordCountChange={setWordCount}
              onCommand={handleCommand}
              wordPreferences={wordPreferences}
              onOpenAssistant={() => {
                setAssistantTrigger('manual');
                setLastEditorActivityAt(Date.now());
                setSidebarOpen(true);
              }}
            />
          </div>

        </div>

        {showStartScreen && (
          <div
            className="absolute inset-0 z-30 overflow-y-auto"
            style={{
              opacity: 1,
              transform: prefersReducedMotion ? 'none' : (isStartTransitionRunning ? 'scale(0.992)' : 'scale(1)'),
              filter: prefersReducedMotion ? 'none' : (isStartTransitionRunning ? 'brightness(0.74) saturate(0.84)' : 'none'),
              transition: prefersReducedMotion ? 'none' : 'transform 240ms ease-out, filter 220ms linear',
              pointerEvents: isStartTransitionRunning ? 'none' : 'auto',
            }}
          >
            <div
              style={{
                minHeight: '100%',
                animation: prefersReducedMotion || !isStartTransitionRunning
                  ? 'none'
                  : `wordai-start-transition-shake 360ms cubic-bezier(0.22, 1, 0.36, 1) ${getStartScreenTransitionDelayMs(-4)} both`,
                transformOrigin: 'center center',
                willChange: isStartTransitionRunning ? 'transform' : undefined,
              }}
            >
              <StartScreen
                instructionsResetToken={startScreenInstructionsResetToken}
                onInstructionsResetConsumed={() => setStartScreenInstructionsResetToken(0)}
                documentStyle={documentStyle}
                onDocumentStyleChange={changeDocumentStyle}
                escapeBlocked={fileMenuOpen || isInputDialogVisible || isCopyleaksDetectorVisible || isFeedbackSurveyVisible}
                onClose={() => {
                  runStartTransition(() => {}, 'start');
                }}
                hasDraft={wordPreferences.keepLastAutosavedVersion !== false && Boolean(getPersistedDraftHtml())}
                lastSavedAt={getPersistedDraftSavedAt()}
                onCreateBlank={() => {
                  if (!confirmReplaceCurrentDocument()) return;
                  clearPersistedDraftCache();
                  clearDraftReviewState();
                  runStartTransition((activeEditor) => {
                    activeEditor.commands.clearContent();
                    setCurrentFilePath('');
                    persistActiveTemplateId('blank');
                    syncPersistedAppSettings();
                    setActiveTemplateId('blank');
                  }, 'start');
                }}
                onCreateTemplate={(template) => {
                  if (!confirmReplaceCurrentDocument()) return;
                  const templateId = typeof template === 'string' ? template : template?.id;
                  const templateExamples = Array.isArray(template?.examples) ? template.examples : [];
                  clearPersistedDraftCache();
                  clearDraftReviewState();
                  runStartTransition((activeEditor) => {
                    setCurrentFilePath('');
                    persistActiveTemplateId(templateId || 'blank');
                    syncPersistedAppSettings();
                    setActiveTemplateId(templateId || 'blank');
                    const recommendedStyle = {
                      academic: 'academic',
                      legal: 'legal',
                      report: 'business',
                      summary: 'presentation',
                      office: 'business',
                      proposal: 'business',
                      letter: 'legal',
                    };
                    changeDocumentStyle(recommendedStyle[templateId] || documentStyle);
                    activeEditor.commands.setContent(buildTemplateSkeleton(templateId, '', templateExamples));
                  }, 'start');
                }}
                onOpenDocument={() => handleCommand('openFile')}
                onOpenLastDraft={() => {
                  if (!confirmReplaceCurrentDocument()) return;
                  const savedDraft = wordPreferences.keepLastAutosavedVersion === false
                    ? null
                    : getPersistedDraftHtml();
                  clearDraftReviewState();
                  runStartTransition((activeEditor) => {
                    if (savedDraft) activeEditor.commands.setContent(savedDraft);
                    setCurrentFilePath('');
                    setActiveTemplateId(getPersistedActiveTemplateId());
                  }, 'end');
                }}
                onOpenSettings={(targetTab = 'guide') => {
                  setFileMenuTargetTab(targetTab || 'guide');
                  setFileMenuOpen(true);
                }}
                onGenerateFromPrompt={(payload) => executeStartScreenGeneration({
                  kind: 'start-screen-generate',
                  workspaceId: getActiveWorkspaceId(),
                  payload,
                })}
              />
            </div>
          </div>
        )}

        {/* עט קסמים צף */}
        {!showStartScreen && <MagicWand
          sidebarOpen={sidebarOpen}
          escapeBlocked={fileMenuOpen || isInputDialogVisible || isCopyleaksDetectorVisible || isFeedbackSurveyVisible || sidebarOpen}
          documentContext={() => editor ? editor.getText().slice(0, 7000) : ''}
          selectedText={selectedText}
          selectionContext={selectionContext}
          shortcuts={shortcuts}
          onInsert={(text) => {
            if (editor) editor.chain().focus().insertContent(text).run();
          }}
        />}

        {isStartTransitionRunning && <StartScreenTransitionOverlay />}
      </main>
      <footer id="status-bar" className="h-6 bg-[#2B579A] text-white flex items-center justify-between px-4 text-[11px] shrink-0 z-30">
        <div className="flex items-center gap-4">
          <span>עמוד 1 מתוך {pageCount}</span>
          <span>{wordCount} מילים</span>
          <span><i className="ph ph-check text-green-400"></i> עברית (ישראל)</span>
        </div>
        <div className="flex items-center gap-4">
          <span>מצב הדפסה</span>
          <span>{zoom}%</span>
        </div>
      </footer>

      {/* File Menu Backstage */}
      {fileMenuOpen && (
        <FileMenu
          initialSettingsTab={fileMenuTargetTab}
          updateCheckToken={updateCheckToken}
          onClose={() => {
            setFileMenuOpen(false);
            setFileMenuTargetTab(null);
            setUpdateCheckToken(0);
          }}
          onCommand={(cmd, value) => handleCommand(cmd, value)}
          shortcuts={shortcuts}
          onShortcutsChange={setShortcuts}
          assistantBehavior={assistantBehavior}
          onAssistantBehaviorChange={setAssistantBehavior}
          wordPreferences={wordPreferences}
          onWordPreferencesChange={setWordPreferences}
          lastGenerationAction={lastGenerationAction}
          liveGeneration={liveGeneration}
        />
      )}
    </div>
  );
}

const rootElement = document.getElementById('app');
if (rootElement) {
  class ErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { error: null }; }
    static getDerivedStateFromError(error) { return { error }; }
    componentDidCatch(error, info) {
      console.error('[ErrorBoundary]', error, info);
      if (window.__showCrashOverlay) window.__showCrashOverlay(error?.message || String(error));
    }
    render() {
      if (this.state.error) return null; // ה-overlay הוצג מ-componentDidCatch
      return this.props.children;
    }
  }
  const appRoot = rootElement.__wordflowReactRoot || ReactDOM.createRoot(rootElement);
  rootElement.__wordflowReactRoot = appRoot;
  appRoot.render(
    <ErrorBoundary><App /></ErrorBoundary>
  );
}

export default App;
