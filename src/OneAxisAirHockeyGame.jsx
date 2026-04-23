import React, { useEffect, useRef, useState } from 'react';

export default function OneAxisAirHockeyGame({ title = 'הוקי בהמתנה', compact = false }) {
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [running, setRunning] = useState(false);
  const [missed, setMissed] = useState(false);
  const [paddleX, setPaddleX] = useState(50);
  const [puck, setPuck] = useState({ x: 50, y: 12 });

  const velocityRef = useRef({ x: 0.35, y: 0.6 });
  const lastTsRef = useRef(0);

  const resetRound = () => {
    setScore(0);
    setPaddleX(50);
    setPuck({ x: 50, y: 12 });
    velocityRef.current = { x: 0.35, y: 0.6 };
    setMissed(false);
    setRunning(true);
  };

  const movePaddle = (delta) => {
    setPaddleX((prev) => Math.max(10, Math.min(90, prev + delta)));
    if (!running) setRunning(true);
  };

  const handleGameKeyDown = (event) => {
    if (event.code === 'ArrowLeft') {
      event.preventDefault();
      movePaddle(-6);
      return;
    }
    if (event.code === 'ArrowRight') {
      event.preventDefault();
      movePaddle(6);
      return;
    }
    if (event.code === 'Space' && missed) {
      event.preventDefault();
      resetRound();
    }
  };

  useEffect(() => {
    if (score > best) setBest(score);
  }, [score, best]);

  useEffect(() => {
    let rafId = 0;

    const tick = (timestamp) => {
      const last = lastTsRef.current || timestamp;
      const dt = Math.min(40, timestamp - last);
      lastTsRef.current = timestamp;

      if (running && !missed) {
        setPuck((prev) => {
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
            const paddleLeft = paddleX - 11;
            const paddleRight = paddleX + 11;
            if (nextX >= paddleLeft && nextX <= paddleRight) {
              velocityRef.current.y = -Math.abs(velocityRef.current.y) - 0.045;
              const steer = (nextX - paddleX) * 0.015;
              velocityRef.current.x = Math.max(-1.2, Math.min(1.2, velocityRef.current.x + steer));
              nextY = 84;
              setScore((prevScore) => prevScore + 1);
            }
          }

          if (nextY > 97) {
            setMissed(true);
            setRunning(false);
          }

          return { x: nextX, y: nextY };
        });
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [missed, paddleX, running]);

  return (
    <div style={{ marginTop: compact ? 8 : 10, border: '1px solid #BFDBFE', borderRadius: 14, background: 'linear-gradient(180deg, #F8FBFF 0%, #EFF6FF 100%)', padding: compact ? '8px 10px' : '10px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: '#1D4ED8', fontWeight: 700 }}>{title}</span>
        <span style={{ fontSize: 10, color: '#334155' }}>Score {score} | Best {best}</span>
      </div>

      <button
        type="button"
        onKeyDown={handleGameKeyDown}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const relative = ((event.clientX - rect.left) / rect.width) * 100;
          setPaddleX(Math.max(10, Math.min(90, relative)));
          if (missed) {
            resetRound();
            return;
          }
          if (!running) setRunning(true);
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

      <div style={{ fontSize: 10, color: '#475569', marginTop: 6, textAlign: 'right' }}>
        תנועה בציר אחד: ArrowLeft / ArrowRight או לחיצה במקום הרצוי
      </div>
    </div>
  );
}