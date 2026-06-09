import React, { useEffect, useRef, useState } from 'react';

// ─── הודעות מצחיקות בזמן יצירת מסמך ───
const GENERATING_MESSAGES = [
  '🧠 מגייס את צוות הסוכנים...',
  '☕ מגיש קפה למנהל הצוות...',
  '📚 קורא את כל האינטרנט בשבילך...',
  '🤔 הסוכן הראשי חושב בעמוקות...',
  '🚀 משגר רקטה של מילים...',
  '🎭 מכריח את הסוכנים להסכים...',
  '📖 עושה מחקר בספריה הווירטואלית...',
  '✏️ כותב, מוחק, כותב מחדש...',
  '🔮 מייעץ עם Oracle הכתיבה...',
  '🎨 מוסיף נגיעות סגנוניות...',
  '🏗️ בונה קומות על קומות במסמך...',
  '🎯 מלטש עד לברק...',
  '🧪 בודק שלא שכחנו שום דבר...',
  '🥸 הסוכנים מתחפשים לאקדמאים...',
  '🎶 כותב בקצב של ג\'אז...',
];

const WAIT_MESSAGES_SIDEBAR = [
  '🧑‍💻 הצוות בעבודה מלאה...',
  '📖 קורא מקורות...',
  '🖊️ כותב טיוטה ראשונה...',
  '🔁 ביקורת עמיתים פנימית...',
  '🎯 מלטש את הנוסח...',
  '💡 מוסיף רעיונות...',
  '☕ עוד רגע קטן...',
  '🏋️ מרים כמויות...',
];

const CONFETTI_COLORS = ['#6366F1','#F59E0B','#10B981','#F43F5E','#06B6D4','#8B5CF6','#FBBF24','#34D399','#FB923C','#E879F9'];

const useDocumentVisible = () => {
  const [isVisible, setIsVisible] = useState(() => (
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'
  ));

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState !== 'hidden');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return isVisible;
};

// ─── 1. GeneratingOverlay — כשמתחילים לייצר מסמך (StartScreen) ───
export function GeneratingOverlay({ isVisible, prompt = '', prefersReducedMotion = false }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const isDocumentVisible = useDocumentVisible();

  useEffect(() => {
    if (!isVisible) { setMsgIndex(0); setElapsed(0); return; }
    if (!isDocumentVisible) return undefined;
    let pendingTimeout = null;
    const iv = setInterval(() => {
      setFade(false);
      pendingTimeout = setTimeout(() => {
        setMsgIndex((i) => (i + 1) % GENERATING_MESSAGES.length);
        setFade(true);
      }, 280);
    }, 2400);
    const elapsedIv = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => { clearInterval(iv); clearTimeout(pendingTimeout); clearInterval(elapsedIv); };
  }, [isVisible, isDocumentVisible]);

  if (!isVisible) return null;

  const formatElapsed = (s) => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, direction: 'rtl',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 40%, #0C4A6E 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Ambient orbs */}
      {!prefersReducedMotion && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          {[
            { c: '#6366F1', s: 320, x: 15, y: 20, d: 18 },
            { c: '#06B6D4', s: 260, x: 75, y: 10, d: 22 },
            { c: '#8B5CF6', s: 200, x: 35, y: 65, d: 26 },
            { c: '#3B82F6', s: 280, x: 80, y: 60, d: 20 },
            { c: '#10B981', s: 180, x: 55, y: 40, d: 30 },
          ].map((o, i) => (
            <div key={i} style={{
              position: 'absolute',
              borderRadius: '50%',
              background: o.c,
              width: o.s, height: o.s,
              left: `${o.x}%`, top: `${o.y}%`,
              transform: 'translate(-50%,-50%)',
              opacity: 0.10,
              filter: 'blur(60px)',
              animation: `wordaiAmbientDrift ${o.d}s ease-in-out infinite`,
              animationDelay: `${-i * 4}s`,
            }} />
          ))}
        </div>
      )}

      <div style={{ position: 'relative', textAlign: 'center', padding: '0 28px', maxWidth: 580 }}>
        {/* Bouncing pen emoji */}
        <div style={{
          fontSize: 80, marginBottom: 24,
          display: 'inline-block',
          animation: prefersReducedMotion ? 'none' : 'wordaiGeneratingBounce 1.5s ease-in-out infinite',
          filter: 'drop-shadow(0 0 30px rgba(99,102,241,0.7))',
        }}>✍️</div>

        <h2 style={{
          color: 'white', fontSize: 30, fontWeight: 900, marginBottom: 10,
          textShadow: '0 0 40px rgba(99,102,241,0.8)',
          letterSpacing: '-0.5px',
        }}>יוצרים את המסמך שלך</h2>

        {prompt && (
          <p style={{
            color: 'rgba(255,255,255,0.55)', fontSize: 14, marginBottom: 26,
            lineHeight: 1.65, maxWidth: 440, margin: '0 auto 26px',
          }}>
            "{prompt.slice(0, 90)}{prompt.length > 90 ? '...' : ''}"
          </p>
        )}

        {/* Cycling message box */}
        <div style={{
          background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 18,
          padding: '16px 28px', minHeight: 58,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.92)', fontSize: 17, fontWeight: 600,
          transition: prefersReducedMotion ? 'none' : 'opacity 0.28s ease',
          opacity: prefersReducedMotion ? 1 : (fade ? 1 : 0),
          marginBottom: 28,
        }}>
          {GENERATING_MESSAGES[msgIndex]}
        </div>

        {/* Bouncing dots */}
        {!prefersReducedMotion && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 20 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{
                width: 11, height: 11, borderRadius: '50%',
                background: 'rgba(99,102,241,0.85)',
                animation: 'wordaiDotBounce 1.2s ease-in-out infinite',
                animationDelay: `${i * 0.22}s`,
              }} />
            ))}
          </div>
        )}

        {/* Timer */}
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
          {formatElapsed(elapsed)} שחלפו
        </div>
      </div>
    </div>
  );
}

// ─── 2. ConfettiCelebration — כשמסמך מוכן ───
const generateConfettiPieces = () => Array.from({ length: 70 }, (_, i) => ({
  id: i,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  left: Math.random() * 100,
  delay: Math.random() * 700,
  duration: 1500 + Math.random() * 1200,
  size: 6 + Math.random() * 9,
  rotate: Math.random() * 360,
  shape: ['rect', 'circle', 'square'][i % 3],
  drift: (Math.random() - 0.5) * 160,
}));

export function ConfettiCelebration({ active }) {
  const [pieces, setPieces] = useState(null);

  useEffect(() => {
    if (active) {
      setPieces(generateConfettiPieces());
    } else {
      setPieces(null);
    }
  }, [active]);

  if (!active || !pieces) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9998, overflow: 'hidden' }}>
      {pieces.map((p) => (
        <div key={p.id} style={{
          position: 'absolute',
          top: '-20px',
          left: `${p.left}%`,
          width: p.shape === 'rect' ? p.size * 2 : p.size,
          height: p.shape === 'rect' ? p.size * 0.5 : p.size,
          background: p.color,
          borderRadius: p.shape === 'circle' ? '50%' : 2,
          transform: `rotate(${p.rotate}deg)`,
          animation: `wordaiConfettiFall ${p.duration}ms ease-in forwards`,
          animationDelay: `${p.delay}ms`,
          opacity: 0,
          '--confetti-drift': `${p.drift}px`,
        }} />
      ))}
    </div>
  );
}

// ─── 3. AppStartupSplash — מסך פתיחה קצר ───
export function AppStartupSplash({ onDone }) {
  const [phase, setPhase] = useState('in');
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 500);
    const t2 = setTimeout(() => setPhase('out'), 1600);
    const t3 = setTimeout(() => { setPhase('gone'); onDoneRef.current?.(); }, 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  if (phase === 'gone') return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 55%, #0C4A6E 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      transition: 'opacity 0.55s ease, transform 0.55s ease',
      opacity: phase === 'out' ? 0 : 1,
      transform: phase === 'out' ? 'scale(1.04)' : 'scale(1)',
      pointerEvents: phase === 'out' ? 'none' : 'all',
    }}>
      {/* Ambient orbs */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {[
          { c: '#6366F1', s: 400, x: 20, y: 30 },
          { c: '#06B6D4', s: 300, x: 75, y: 20 },
          { c: '#8B5CF6', s: 250, x: 50, y: 70 },
        ].map((o, i) => (
          <div key={i} style={{
            position: 'absolute', borderRadius: '50%', background: o.c,
            width: o.s, height: o.s, left: `${o.x}%`, top: `${o.y}%`,
            transform: 'translate(-50%,-50%)', opacity: 0.12, filter: 'blur(70px)',
          }} />
        ))}
      </div>

      <div style={{
        textAlign: 'center', direction: 'rtl',
        animation: 'wordaiRevealIn 600ms cubic-bezier(0.22,1,0.36,1) both',
      }}>
        <div style={{
          fontSize: 72, marginBottom: 18,
          filter: 'drop-shadow(0 0 40px rgba(99,102,241,0.9))',
          animation: 'wordaiGeneratingBounce 2s ease-in-out infinite',
          display: 'inline-block',
        }}>✍️</div>
        <div style={{
          color: 'white', fontSize: 36, fontWeight: 900, letterSpacing: '-1px',
          textShadow: '0 0 50px rgba(99,102,241,0.9)',
          marginBottom: 8,
        }}>WordFlow AI</div>
        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>
          מכין את הסביבה שלך...
        </div>
      </div>
    </div>
  );
}

// ─── 4. LiveGenerationMood — הודעה חיה בסיידבר ───
export function LiveGenerationMood({ state, prefersReducedMotion = false }) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [fade, setFade] = useState(true);
  const isDocumentVisible = useDocumentVisible();

  useEffect(() => {
    if (state !== 'running' || !isDocumentVisible) return;
    let pendingTimeout = null;
    const iv = setInterval(() => {
      setFade(false);
      pendingTimeout = setTimeout(() => { setMsgIdx((i) => (i + 1) % WAIT_MESSAGES_SIDEBAR.length); setFade(true); }, 250);
    }, 2600);
    return () => { clearInterval(iv); clearTimeout(pendingTimeout); };
  }, [state, isDocumentVisible]);

  if (state === 'success') {
    return (
      <div style={{
        textAlign: 'center', padding: '8px 0', fontSize: 26,
        animation: prefersReducedMotion ? 'none' : 'wordaiGeneratingBounce 0.7s ease both',
      }}>🎉 המסמך מוכן!</div>
    );
  }
  if (state !== 'running') return null;

  return (
    <div style={{
      padding: '9px 14px', borderRadius: 12, marginBottom: 10,
      background: 'linear-gradient(135deg, #EFF6FF, #F5F3FF)',
      border: '1px solid #BFDBFE', textAlign: 'center',
      color: '#4338CA', fontSize: 12, fontWeight: 600,
      transition: prefersReducedMotion ? 'none' : 'opacity 0.25s',
      opacity: prefersReducedMotion ? 1 : (fade ? 1 : 0),
    }}>
      {WAIT_MESSAGES_SIDEBAR[msgIdx]}
    </div>
  );
}
