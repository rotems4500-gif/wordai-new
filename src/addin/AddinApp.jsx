// AddinApp — מעטפת ה-taskpane: אותה אפליקציה, בתוך Word.
// חשבון (email+password ישירות; Google דרך Office Dialog), סנכרון ענן מלא
// (סגנון אישי, קורסים, הגדרות), וה-AiSidebar האמיתי של האפליקציה מורכב על
// גשר Word: יעדי עריכה = בחירה/פסקה, החלות = track changes.
import React, { useEffect, useRef, useState } from 'react';
import '../../tailwind.css';
import AiSidebar from '../AiSidebar';
import {
  isCloudAvailable,
  onCloudAuthChange,
  cloudSignInWithEmail,
  cloudSignUpWithEmail,
  cloudSignInWithGoogleIdToken,
  cloudSignOut,
  ensureCloudUserProfile,
  describeAuthError,
} from '../firebase/services';
import { handleCloudAuthSuccess, initCloudSyncListeners } from '../services/cloudSyncManager';
import { getWordPreferences, getAssistantBehavior } from '../services/aiService';
import { isWordAvailable, getSelectionContext, onSelectionChanged, buildDocumentSnapshot, insertTextAsTracked } from './wordBridge';
import { buildEditTargetState, applyAssistantEditToWord, applyAssistantEditBatchToWord } from './wordEditBridge';

const noop = () => {};

export default function AddinApp({ officeHost = 'none' }) {
  const isWordHost = officeHost === 'word' && isWordAvailable();
  const [cloudUser, setCloudUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(!isCloudAvailable());
  const [accountOpen, setAccountOpen] = useState(false);
  const [documentContext, setDocumentContext] = useState('');
  const [selectionCtx, setSelectionCtx] = useState({ selectedText: '', blockText: '' });
  const targetStateRef = useRef(buildEditTargetState('', ''));
  const snapshotTimerRef = useRef(0);

  // --- חשבון ענן: מאזין auth + bootstrap סנכרון (זהה לאפליקציה) ---
  useEffect(() => {
    if (!isCloudAvailable()) return undefined;
    return onCloudAuthChange((nextUser) => {
      setCloudUser(nextUser);
      setAuthChecked(true);
      if (nextUser) {
        ensureCloudUserProfile(nextUser).catch(noop);
        handleCloudAuthSuccess(nextUser).catch(noop);
      }
    });
  }, []);

  useEffect(() => {
    if (cloudUser) return initCloudSyncListeners(cloudUser);
    return undefined;
  }, [cloudUser]);

  // --- קונטקסט מסמך: בחירה + פסקה בכל שינוי, snapshot מלא עם throttle ---
  useEffect(() => {
    if (!isWordHost) return undefined;

    const refreshSnapshot = async () => {
      try {
        const snapshot = await buildDocumentSnapshot();
        setDocumentContext(snapshot.excerptText || '');
      } catch { /* המסמך עסוק — ננסה בסיבוב הבא */ }
    };

    const stop = onSelectionChanged(async () => {
      try {
        const ctx = await getSelectionContext();
        setSelectionCtx(ctx);
        targetStateRef.current = buildEditTargetState(ctx.selectedText, ctx.blockText);
      } catch { /* ignore */ }
      // snapshot מלא לכל היותר פעם ב-5 שניות — קריאת body שלמה יקרה
      const now = Date.now();
      if (now - snapshotTimerRef.current > 5000) {
        snapshotTimerRef.current = now;
        refreshSnapshot();
      }
    });
    refreshSnapshot();
    return stop;
  }, [isWordHost]);

  const currentFilePath = isWordHost
    ? (typeof Office !== 'undefined' && Office?.context?.document?.url) || 'word-addin-document'
    : 'word-addin-browser';

  return (
    <div dir="rtl" className="flex h-[100dvh] w-full flex-col overflow-hidden bg-gray-50 text-gray-900" style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}>
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-1.5 shadow-sm">
        <div className="flex items-center gap-2">
          <img src="/addin/icon-32.png" alt="" className="h-5 w-5 rounded" />
          <span className="text-[13px] font-bold">WordFlow AI</span>
          {!isWordHost && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">מצב דפדפן</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setAccountOpen((open) => !open)}
          className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-200"
        >
          {cloudUser
            ? <><span className="h-2 w-2 rounded-full bg-green-500" />{cloudUser.displayName || cloudUser.email}</>
            : <><span className="h-2 w-2 rounded-full bg-gray-400" />התחבר לחשבון</>}
        </button>
      </header>

      {accountOpen && (
        <AccountPanel
          cloudUser={cloudUser}
          isWordHost={isWordHost}
          onClose={() => setAccountOpen(false)}
        />
      )}

      <div className="min-h-0 flex-1">
        {authChecked ? (
          <AiSidebar
            mode="sidebar"
            reason="word-addin"
            onClose={noop}
            documentContext={documentContext}
            currentFilePath={currentFilePath}
            selectedText={selectionCtx.selectedText}
            currentBlockText={selectionCtx.blockText}
            editTarget={targetStateRef.current?.active || null}
            getCurrentEditTarget={() => targetStateRef.current}
            resolveEditTargetFromPrompt={() => null}
            resolveEditTargetsFromPrompt={null}
            onInsert={(text) => insertTextAsTracked(text)}
            onApplyEdit={isWordHost ? applyAssistantEditToWord : null}
            onApplyEditBatch={isWordHost ? applyAssistantEditBatchToWord : null}
            onStreamStart={noop}
            onStreamChunk={noop}
            onStreamEnd={noop}
            wordPreferences={getWordPreferences()}
            assistantBehavior={getAssistantBehavior()}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">מתחבר לחשבון...</div>
        )}
      </div>
    </div>
  );
}

function AccountPanel({ cloudUser, isWordHost, onClose }) {
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const cloudReady = isCloudAvailable();

  const runAuth = async (fn) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await fn();
      onClose();
    } catch (err) {
      setError(describeAuthError(err) || err?.message || 'ההתחברות נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = () => {
    if (!email.trim() || !password) {
      setError('מלא אימייל וסיסמה');
      return;
    }
    runAuth(() => (mode === 'signup'
      ? cloudSignUpWithEmail(email.trim(), password)
      : cloudSignInWithEmail(email.trim(), password)));
  };

  // Google דרך Office Dialog — popup לא עובד ב-webview של taskpane
  const handleGoogleSignIn = () => {
    if (!isWordHost || !Office?.context?.ui?.displayDialogAsync) {
      setError('התחברות Google זמינה רק בתוך Word. השתמש באימייל+סיסמה.');
      return;
    }
    setBusy(true);
    setError('');
    const dialogUrl = `${window.location.origin}/auth-dialog.html`;
    Office.context.ui.displayDialogAsync(dialogUrl, { height: 65, width: 35, promptBeforeOpen: false }, (result) => {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        setBusy(false);
        setError(result.error?.message || 'פתיחת חלון ההתחברות נכשלה');
        return;
      }
      const dialog = result.value;
      dialog.addEventHandler(Office.EventType.DialogMessageReceived, async (arg) => {
        try {
          const payload = JSON.parse(arg.message || '{}');
          if (payload.type === 'google-auth-success') {
            dialog.close();
            await cloudSignInWithGoogleIdToken(payload.googleIdToken, payload.googleAccessToken);
            setBusy(false);
            onClose();
          } else if (payload.type === 'google-auth-error') {
            dialog.close();
            setBusy(false);
            setError(payload.message || 'ההתחברות נכשלה');
          }
        } catch {
          dialog.close();
          setBusy(false);
          setError('תשובת ההתחברות לא הובנה');
        }
      });
      dialog.addEventHandler(Office.EventType.DialogEventReceived, () => setBusy(false));
    });
  };

  if (!cloudReady) {
    return (
      <div className="border-b border-gray-200 bg-white px-3 py-2 text-[12px] text-gray-500">
        סנכרון ענן לא מוגדר בסביבה הזו. אפשר לעבוד מקומית — מפתחות והגדרות נשמרים במחשב.
        <button type="button" onClick={onClose} className="mr-2 text-indigo-600">סגור</button>
      </div>
    );
  }

  if (cloudUser) {
    return (
      <div className="space-y-1.5 border-b border-gray-200 bg-white px-3 py-2 text-[12px]">
        <div className="flex items-center justify-between">
          <span className="text-gray-700">מחובר: <b>{cloudUser.email}</b></span>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <p className="text-[11px] text-gray-500">הסגנון האישי, הקורסים וההגדרות מסונכרנים מהחשבון. מפתחות API נשארים מקומיים בלבד.</p>
        <button
          type="button"
          onClick={() => { cloudSignOut().catch(noop); onClose(); }}
          className="rounded bg-gray-100 px-2 py-1 text-gray-700 hover:bg-gray-200"
        >
          התנתק
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 border-b border-gray-200 bg-white px-3 py-2 text-[12px]">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-gray-700">{mode === 'signup' ? 'יצירת חשבון' : 'התחברות לחשבון WordFlow'}</span>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
      </div>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="אימייל"
        dir="ltr"
        className="w-full rounded border border-gray-300 px-2 py-1 text-left"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleEmailSubmit(); }}
        placeholder="סיסמה"
        dir="ltr"
        className="w-full rounded border border-gray-300 px-2 py-1 text-left"
      />
      {error && <div className="text-[11px] text-red-600">{error}</div>}
      {info && <div className="text-[11px] text-green-600">{info}</div>}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={handleEmailSubmit}
          disabled={busy}
          className="rounded bg-indigo-600 px-2.5 py-1 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? '...' : mode === 'signup' ? 'צור חשבון' : 'התחבר'}
        </button>
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={busy}
          className="rounded border border-gray-300 bg-white px-2.5 py-1 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Google
        </button>
        <button
          type="button"
          onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); }}
          className="text-[11px] text-indigo-600"
        >
          {mode === 'signup' ? 'יש לי חשבון' : 'אין לי חשבון — הרשמה'}
        </button>
      </div>
      <p className="text-[11px] text-gray-400">התחברות מסנכרנת סגנון אישי, קורסים וחומרים מהאפליקציה. אפשר גם לעבוד בלי חשבון.</p>
    </div>
  );
}
