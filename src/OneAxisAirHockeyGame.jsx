import React, { useEffect, useRef, useState } from 'react';

export default function OneAxisAirHockeyGame({ title = 'הוקי בהמתנה', compact = false, allowPopup = false }) {
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [running, setRunning] = useState(false);
  const [missed, setMissed] = useState(false);
  const [paddleX, setPaddleX] = useState(50);
  const [puck, setPuck] = useState({ x: 50, y: 12 });
  const [popupOpen, setPopupOpen] = useState(false);

  const velocityRef = useRef({ x: 0.35, y: 0.6 });
  const lastTsRef = useRef(0);
  const runningRef = useRef(false);
  const missedRef = useRef(false);
  const paddleXRef = useRef(50);
  const puckRef = useRef({ x: 50, y: 12 });
  const keyStateRef = useRef({ left: false, right: false });
  const canHandleKeyboard = () => (!allowPopup || popupOpen);

  const isTypingTarget = (target) => {
    if (!target || typeof target !== 'object') return false;
    const tagName = String(target.tagName || '').toUpperCase();
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
    return Boolean(target.isContentEditable);
  };

  const setRunningSafe = (value) => {
    runningRef.current = Boolean(value);
    setRunning(Boolean(value));
  };

  const setMissedSafe = (value) => {
    missedRef.current = Boolean(value);
    setMissed(Boolean(value));
  };

  const setPaddleSafe = (nextValue) => {
    const clamped = Math.max(10, Math.min(90, nextValue));
    paddleXRef.current = clamped;
    setPaddleX(clamped);
  };

  const setPuckSafe = (nextPuck) => {
    const safe = {
      x: Math.max(0, Math.min(100, Number(nextPuck?.x ?? 50))),
      y: Math.max(0, Math.min(100, Number(nextPuck?.y ?? 12))),
    };
    puckRef.current = safe;
    setPuck(safe);
  };

  const resetRound = () => {
    setScore(0);
    setPaddleSafe(50);
    setPuckSafe({ x: 50, y: 12 });
    velocityRef.current = { x: 0.35, y: 0.6 };
    setMissedSafe(false);
    setRunningSafe(true);
    lastTsRef.current = 0;
  };

  const movePaddle = (delta) => {
    setPaddleSafe(paddleXRef.current + delta);
    if (!runningRef.current) setRunningSafe(true);
  };

  const handleGameKeyDown = (event) => {
    if (!canHandleKeyboard()) return;
    if (isTypingTarget(event.target)) return;
    if (event.code === 'ArrowLeft') {
      event.preventDefault();
      keyStateRef.current.left = true;
      if (!runningRef.current) setRunningSafe(true);
      return;
    }
    if (event.code === 'ArrowRight') {
      event.preventDefault();
      keyStateRef.current.right = true;
      if (!runningRef.current) setRunningSafe(true);
      return;
    }
    if (event.code === 'Space' && missedRef.current) {
      event.preventDefault();
      resetRound();
    }
  };

  const handleGameKeyUp = (event) => {
    if (!canHandleKeyboard()) return;
    if (event.code === 'ArrowLeft') keyStateRef.current.left = false;
    if (event.code === 'ArrowRight') keyStateRef.current.right = false;
  };

  useEffect(() => {
    if (score > best) setBest(score);
  }, [score, best]);

  useEffect(() => {
    if (allowPopup && !popupOpen) {
      keyStateRef.current = { left: false, right: false };
      setRunningSafe(false);
    }
  }, [popupOpen, allowPopup]);

  useEffect(() => {
    const onKeyDown = (event) => handleGameKeyDown(event);
    const onKeyUp = (event) => handleGameKeyUp(event);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [popupOpen, allowPopup]);

  useEffect(() => {
    let rafId = 0;

    const tick = (timestamp) => {
      const last = lastTsRef.current || timestamp;
      const dt = Math.min(40, timestamp - last);
      lastTsRef.current = timestamp;

      if (runningRef.current && !missedRef.current && (!allowPopup || popupOpen)) {
        const paddleSpeed = 70;
        const leftPressed = keyStateRef.current.left;
        const rightPressed = keyStateRef.current.right;
        if (leftPressed !== rightPressed) {
          const direction = leftPressed ? -1 : 1;
          const nextPaddle = paddleXRef.current + direction * paddleSpeed * (dt / 1000);
          setPaddleSafe(nextPaddle);
        }

        const prev = puckRef.current;
        let nextX = prev.x + velocityRef.current.x * (dt / 16.7);
        let nextY = prev.y + velocityRef.current.y * (dt / 16.7);

        if (nextX <= 3 || nextX >= 97) {
          velocityRef.current.x *= -1;
          nextX = Math.max(3, Math.min(97, nextX));
        }

        if (nextY <= 5) {
          velocityRef.current.y = Math.abs(velocityRef.current.y);
          nextY = 5;
        }

        if (nextY >= 84 && nextY <= 92) {
          const paddleNow = paddleXRef.current;
          const paddleLeft = paddleNow - 11;
          const paddleRight = paddleNow + 11;
          if (nextX >= paddleLeft && nextX <= paddleRight) {
            velocityRef.current.y = -Math.abs(velocityRef.current.y) - 0.045;
            const steer = (nextX - paddleNow) * 0.015;
            velocityRef.current.x = Math.max(-1.2, Math.min(1.2, velocityRef.current.x + steer));
            nextY = 84;
            setScore((prevScore) => prevScore + 1);
          }
        }

        if (nextY > 97) {
          setMissedSafe(true);
          setRunningSafe(false);
        }

        setPuckSafe({ x: nextX, y: nextY });
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const gameBoard = (
    <button
      type="button"
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const relative = ((event.clientX - rect.left) / rect.width) * 100;
        setPaddleSafe(relative);
      }}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const relative = ((event.clientX - rect.left) / rect.width) * 100;
        setPaddleSafe(relative);
        if (missedRef.current) {
          resetRound();
          return;
        }
        if (!runningRef.current) setRunningSafe(true);
      }}
      style={{
        width: '100%',
        height: compact ? 88 : 100,
        borderRadius: 10,
        border: '1px solid #93C5FD',
        background: 'linear-gradient(180deg, #DBEAFE 0%, #BFDBFE 100%)',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, opacity: 0.3, backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.6) 1px, transparent 1px)', backgroundSize: '18px 18px' }} />

      <div
        style={{
          position: 'absolute',
          left: `${paddleX}%`,
          bottom: '8%',
          width: 44,
          height: 8,
          borderRadius: 99,
          background: '#1E3A8A',
          transform: 'translateX(-50%)',
          boxShadow: '0 1px 3px rgba(15,23,42,0.25)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: `${puck.x}%`,
          top: `${puck.y}%`,
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: missed ? '#DC2626' : '#0F172A',
          transform: 'translate(-50%, -50%)',
        }}
      />

      {!running && !missed && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#1E3A8A', fontWeight: 700 }}>
          התחל לשחק
        </div>
      )}

      {missed && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#991B1B', fontWeight: 700 }}>
          פספוס - לחץ לריסט
        </div>
      )}
    </button>
  );

  return (
    <div style={{ marginTop: compact ? 8 : 10, border: '1px solid #BFDBFE', borderRadius: 14, background: 'linear-gradient(180deg, #F8FBFF 0%, #EFF6FF 100%)', padding: compact ? '8px 10px' : '10px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: '#1D4ED8', fontWeight: 700 }}>{title}</span>
        <span style={{ fontSize: 10, color: '#334155' }}>Score {score} | Best {best}</span>
      </div>

      {allowPopup ? (
        <>
          <button
            type="button"
            onClick={() => setPopupOpen(true)}
            style={{
              width: '100%',
              height: 34,
              borderRadius: 10,
              border: '1px solid #93C5FD',
              background: '#EFF6FF',
              color: '#1E3A8A',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            פתח משחק בפופאפ
          </button>

          {popupOpen && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(2,6,23,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <div style={{ width: 'min(520px, 92vw)', background: 'white', borderRadius: 16, border: '1px solid #BFDBFE', boxShadow: '0 20px 60px rgba(15,23,42,0.35)', padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, color: '#1D4ED8', fontWeight: 700 }}>{title}</div>
                  <button
                    type="button"
                    onClick={() => setPopupOpen(false)}
                    style={{ border: '1px solid #CBD5E1', background: 'white', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', color: '#334155' }}
                  >
                    סגור
                  </button>
                </div>
                {gameBoard}
                <div style={{ fontSize: 10, color: '#475569', marginTop: 6, textAlign: 'right' }}>
                  תנועה חלקה: החזק ArrowLeft או ArrowRight, או הזז עכבר מעל המגרש
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        gameBoard
      )}

      <div style={{ fontSize: 10, color: '#475569', marginTop: 6, textAlign: 'right' }}>
        תנועה בציר אחד: ArrowLeft / ArrowRight או לחיצה במקום הרצוי
      </div>
    </div>
  );
}