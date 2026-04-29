import React, { useEffect, useRef, useState } from 'react';

const ARCADE_GAMES = [
  {
    id: 'air-hockey',
    label: 'הוקי',
    subtitle: 'החזר את הדיסקית והישאר בשליטה.',
    hotkeys: 'ArrowLeft / ArrowRight',
    accent: '#1D4ED8',
  },
  {
    id: 'lane-dodger',
    label: 'נתיב חמקנות',
    subtitle: 'התחמק ממכשולים יורדים בארבעה נתיבים.',
    hotkeys: 'ArrowLeft / ArrowRight',
    accent: '#EA580C',
  },
  {
    id: 'grid-collector',
    label: 'צייד ניצוצות',
    subtitle: 'אסוף מטרות על הלוח לפני שהטיימר נגמר.',
    hotkeys: 'Arrow keys',
    accent: '#059669',
  },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const isTypingTarget = (target) => {
  if (!target || typeof target !== 'object') return false;
  const tagName = String(target.tagName || '').toUpperCase();
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  return Boolean(target.isContentEditable);
};

const createSurfaceStyle = ({ focused = false, height = 240, background = 'linear-gradient(180deg, #DBEAFE 0%, #BFDBFE 100%)', borderColor = '#93C5FD' } = {}) => ({
  width: '100%',
  height,
  borderRadius: 16,
  border: `1px solid ${focused ? '#2563EB' : borderColor}`,
  background,
  position: 'relative',
  overflow: 'hidden',
  cursor: 'pointer',
  padding: 0,
  outline: 'none',
  boxShadow: focused ? '0 0 0 3px rgba(59,130,246,0.24)' : 'inset 0 1px 0 rgba(255,255,255,0.35)',
  transition: 'box-shadow 140ms ease, border-color 140ms ease',
});

function AirHockeyArcadeGame({ title = 'הוקי בציר אחד', compact = false }) {
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [running, setRunning] = useState(false);
  const [missed, setMissed] = useState(false);
  const [paddleX, setPaddleX] = useState(50);
  const [puck, setPuck] = useState({ x: 50, y: 12 });
  const [focused, setFocused] = useState(false);

  const boardRef = useRef(null);
  const velocityRef = useRef({ x: 0.35, y: 0.6 });
  const lastTsRef = useRef(0);
  const runningRef = useRef(false);
  const missedRef = useRef(false);
  const paddleXRef = useRef(50);
  const puckRef = useRef({ x: 50, y: 12 });
  const keyStateRef = useRef({ left: false, right: false });

  const setRunningSafe = (value) => {
    const safeValue = Boolean(value);
    runningRef.current = safeValue;
    setRunning(safeValue);
  };

  const setMissedSafe = (value) => {
    const safeValue = Boolean(value);
    missedRef.current = safeValue;
    setMissed(safeValue);
  };

  const setPaddleSafe = (nextValue) => {
    const clampedValue = clamp(nextValue, 10, 90);
    paddleXRef.current = clampedValue;
    setPaddleX(clampedValue);
  };

  const setPuckSafe = (nextPuck) => {
    const safePuck = {
      x: clamp(Number(nextPuck?.x ?? 50), 0, 100),
      y: clamp(Number(nextPuck?.y ?? 12), 0, 100),
    };
    puckRef.current = safePuck;
    setPuck(safePuck);
  };

  const resetRound = () => {
    setScore(0);
    setPaddleSafe(50);
    setPuckSafe({ x: 50, y: 12 });
    velocityRef.current = { x: 0.35, y: 0.6 };
    keyStateRef.current = { left: false, right: false };
    setMissedSafe(false);
    setRunningSafe(true);
    lastTsRef.current = 0;
  };

  useEffect(() => {
    if (score > best) setBest(score);
  }, [score, best]);

  useEffect(() => {
    boardRef.current?.focus();
  }, []);

  useEffect(() => {
    let rafId = 0;

    const tick = (timestamp) => {
      const last = lastTsRef.current || timestamp;
      const dt = Math.min(40, timestamp - last);
      lastTsRef.current = timestamp;

      if (runningRef.current && !missedRef.current) {
        const paddleSpeed = 70;
        const leftPressed = keyStateRef.current.left;
        const rightPressed = keyStateRef.current.right;

        if (leftPressed !== rightPressed) {
          const direction = leftPressed ? -1 : 1;
          setPaddleSafe(paddleXRef.current + direction * paddleSpeed * (dt / 1000));
        }

        const previousPuck = puckRef.current;
        let nextX = previousPuck.x + velocityRef.current.x * (dt / 16.7);
        let nextY = previousPuck.y + velocityRef.current.y * (dt / 16.7);

        if (nextX <= 3 || nextX >= 97) {
          velocityRef.current.x *= -1;
          nextX = clamp(nextX, 3, 97);
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
            velocityRef.current.x = clamp(velocityRef.current.x + steer, -1.2, 1.2);
            nextY = 84;
            setScore((previousScore) => previousScore + 1);
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

  const focusBoard = () => {
    boardRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (isTypingTarget(event.target)) return;

    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight' || (event.code === 'Space' && missedRef.current)) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (event.code === 'Space' && missedRef.current) {
      resetRound();
      return;
    }

    if (missedRef.current) return;

    if (event.code === 'ArrowLeft') {
      keyStateRef.current.left = true;
      if (!runningRef.current) setRunningSafe(true);
      return;
    }

    if (event.code === 'ArrowRight') {
      keyStateRef.current.right = true;
      if (!runningRef.current) setRunningSafe(true);
      return;
    }
  };

  const handleKeyUp = (event) => {
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
    }
    if (event.code === 'ArrowLeft') keyStateRef.current.left = false;
    if (event.code === 'ArrowRight') keyStateRef.current.right = false;
  };

  return (
    <div style={{ border: '1px solid #BFDBFE', borderRadius: 18, background: 'linear-gradient(180deg, #F8FBFF 0%, #EFF6FF 100%)', padding: compact ? '10px 12px' : '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: '#1D4ED8', fontWeight: 800 }}>{title}</div>
          <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>תנועה חלקה עם חיצים או עם העכבר.</div>
        </div>
        <div style={{ fontSize: 11, color: '#334155', fontWeight: 700 }}>Score {score} | Best {best}</div>
      </div>

      <div
        ref={boardRef}
        role="application"
        tabIndex={0}
        data-arcade-surface="true"
        aria-label="מגרש הוקי"
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          keyStateRef.current = { left: false, right: false };
        }}
        onMouseDown={focusBoard}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const relativeX = ((event.clientX - rect.left) / rect.width) * 100;
          setPaddleSafe(relativeX);
        }}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const relativeX = ((event.clientX - rect.left) / rect.width) * 100;
          setPaddleSafe(relativeX);
          if (missedRef.current) {
            resetRound();
            return;
          }
          if (!runningRef.current) setRunningSafe(true);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        style={createSurfaceStyle({ focused, height: compact ? 176 : 240 })}
      >
        <div style={{ position: 'absolute', inset: 0, opacity: 0.3, backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.6) 1px, transparent 1px)', backgroundSize: '18px 18px' }} />

        <div
          style={{
            position: 'absolute',
            left: `${paddleX}%`,
            bottom: '8%',
            width: 50,
            height: 10,
            borderRadius: 99,
            background: '#1E3A8A',
            transform: 'translateX(-50%)',
            boxShadow: '0 4px 12px rgba(15,23,42,0.18)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            left: `${puck.x}%`,
            top: `${puck.y}%`,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: missed ? '#DC2626' : '#0F172A',
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 2px 8px rgba(15,23,42,0.22)',
          }}
        />

        {!running && !missed && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#1E3A8A', fontWeight: 800, textAlign: 'center', padding: 12 }}>
            לחץ חץ או לחץ על המגרש כדי להתחיל
          </div>
        )}

        {missed && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#991B1B', fontWeight: 800, textAlign: 'center', padding: 12, background: 'rgba(255,255,255,0.2)' }}>
            פספוס. Space או קליק להתחלה מחדש
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8, fontSize: 10, color: '#475569' }}>
        <span>{focused ? 'פוקוס מקלדת פעיל' : 'לחץ על המגרש כדי להחזיר פוקוס'}</span>
        <span>ArrowLeft / ArrowRight</span>
      </div>
    </div>
  );
}

function LaneDodgerGame({ title = 'נתיב חמקנות' }) {
  const laneCount = 4;
  const rowCount = 6;
  const [playerLane, setPlayerLane] = useState(1);
  const [obstacles, setObstacles] = useState([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [started, setStarted] = useState(false);
  const [crashed, setCrashed] = useState(false);
  const [focused, setFocused] = useState(false);

  const boardRef = useRef(null);
  const obstacleIdRef = useRef(0);
  const playerLaneRef = useRef(1);

  const resetRound = () => {
    playerLaneRef.current = 1;
    setPlayerLane(1);
    setObstacles([]);
    setScore(0);
    setStarted(false);
    setCrashed(false);
  };

  useEffect(() => {
    if (score > best) setBest(score);
  }, [score, best]);

  useEffect(() => {
    boardRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!started || crashed) return undefined;

    const intervalId = window.setInterval(() => {
      let escapedCount = 0;

      setObstacles((currentObstacles) => {
        const movedObstacles = currentObstacles
          .map((obstacle) => ({ ...obstacle, row: obstacle.row + 1 }))
          .filter((obstacle) => {
            if (obstacle.row >= rowCount) {
              escapedCount += 1;
              return false;
            }
            return true;
          });

        const collision = movedObstacles.some((obstacle) => obstacle.row === rowCount - 1 && obstacle.lane === playerLaneRef.current);
        if (collision) {
          setStarted(false);
          setCrashed(true);
          return movedObstacles;
        }

        if (Math.random() < 0.72) {
          obstacleIdRef.current += 1;
          movedObstacles.push({ id: obstacleIdRef.current, lane: Math.floor(Math.random() * laneCount), row: 0 });
        }

        return movedObstacles;
      });

      if (escapedCount > 0) {
        setScore((previousScore) => previousScore + escapedCount);
      }
    }, 360);

    return () => window.clearInterval(intervalId);
  }, [started, crashed]);

  const focusBoard = () => {
    boardRef.current?.focus();
  };

  const movePlayer = (delta) => {
    setStarted(true);
    setPlayerLane((previousLane) => {
      const nextLane = clamp(previousLane + delta, 0, laneCount - 1);
      playerLaneRef.current = nextLane;
      return nextLane;
    });
  };

  const handleKeyDown = (event) => {
    if (isTypingTarget(event.target)) return;

    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight' || (event.code === 'Space' && crashed)) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (crashed) {
      if (event.code === 'Space') resetRound();
      return;
    }

    if (event.code === 'ArrowLeft') {
      movePlayer(-1);
      return;
    }

    if (event.code === 'ArrowRight') {
      movePlayer(1);
      return;
    }
  };

  const obstacleLookup = new Set(obstacles.map((obstacle) => `${obstacle.lane}-${obstacle.row}`));

  return (
    <div style={{ border: '1px solid #FED7AA', borderRadius: 18, background: 'linear-gradient(180deg, #FFF7ED 0%, #FFFBEB 100%)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, color: '#C2410C', fontWeight: 800 }}>{title}</div>
          <div style={{ fontSize: 10, color: '#7C2D12', marginTop: 2 }}>הזז את הרכב בין הנתיבים ושרוד כמה שיותר.</div>
        </div>
        <div style={{ fontSize: 11, color: '#7C2D12', fontWeight: 700 }}>Score {score} | Best {best}</div>
      </div>

      <div
        ref={boardRef}
        role="application"
        tabIndex={0}
        data-arcade-surface="true"
        aria-label="נתיב חמקנות"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onMouseDown={focusBoard}
        onClick={focusBoard}
        onKeyDown={handleKeyDown}
        style={createSurfaceStyle({ focused, height: 240, background: 'linear-gradient(180deg, #FFF7ED 0%, #FFEDD5 100%)', borderColor: '#FDBA74' })}
      >
        <div style={{ position: 'absolute', inset: 0, display: 'grid', direction: 'ltr', gridTemplateColumns: `repeat(${laneCount}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))`, gap: 6, padding: 12 }}>
          {Array.from({ length: rowCount * laneCount }).map((_, index) => {
            const lane = index % laneCount;
            const row = Math.floor(index / laneCount);
            const cellKey = `${lane}-${row}`;
            const hasObstacle = obstacleLookup.has(cellKey);
            const hasPlayer = row === rowCount - 1 && lane === playerLane;

            return (
              <div
                key={cellKey}
                style={{
                  borderRadius: 12,
                  border: '1px solid rgba(251,146,60,0.25)',
                  background: hasObstacle ? '#F97316' : hasPlayer ? '#0F172A' : 'rgba(255,255,255,0.55)',
                  boxShadow: hasObstacle ? '0 4px 14px rgba(249,115,22,0.28)' : 'none',
                  transition: 'background 120ms ease',
                }}
              />
            );
          })}
        </div>

        {!started && !crashed && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#9A3412', fontWeight: 800, textAlign: 'center', padding: 18 }}>
            לחץ חץ שמאלה או ימינה כדי להתחיל
          </div>
        )}

        {crashed && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#7F1D1D', fontWeight: 800, textAlign: 'center', padding: 18, background: 'rgba(255,255,255,0.32)' }}>
            התרסקת. לחץ Space לסיבוב חדש
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8, fontSize: 10, color: '#7C2D12' }}>
        <span>{focused ? 'פוקוס מקלדת פעיל' : 'לחץ על הלוח כדי להחזיר פוקוס'}</span>
        <span>ArrowLeft / ArrowRight</span>
      </div>
    </div>
  );
}

function GridCollectorGame({ title = 'צייד ניצוצות' }) {
  const gridSize = 5;
  const initialPlayer = { x: 2, y: 2 };
  const [player, setPlayer] = useState(initialPlayer);
  const [target, setTarget] = useState({ x: 4, y: 1 });
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [focused, setFocused] = useState(false);

  const boardRef = useRef(null);
  const targetRef = useRef({ x: 4, y: 1 });

  const pickNextTarget = (playerPosition) => {
    let nextTarget = playerPosition;
    while (nextTarget.x === playerPosition.x && nextTarget.y === playerPosition.y) {
      nextTarget = {
        x: Math.floor(Math.random() * gridSize),
        y: Math.floor(Math.random() * gridSize),
      };
    }
    return nextTarget;
  };

  const resetRound = () => {
    const nextPlayer = { ...initialPlayer };
    const nextTarget = pickNextTarget(nextPlayer);
    targetRef.current = nextTarget;
    setPlayer(nextPlayer);
    setTarget(nextTarget);
    setScore(0);
    setTimeLeft(20);
    setStarted(false);
    setFinished(false);
  };

  useEffect(() => {
    if (score > best) setBest(score);
  }, [score, best]);

  useEffect(() => {
    boardRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!started || finished) return undefined;

    const intervalId = window.setInterval(() => {
      setTimeLeft((previousTime) => {
        if (previousTime <= 1) {
          setStarted(false);
          setFinished(true);
          return 0;
        }
        return previousTime - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [started, finished]);

  const focusBoard = () => {
    boardRef.current?.focus();
  };

  const handleMove = (deltaX, deltaY) => {
    setStarted(true);
    setPlayer((previousPlayer) => {
      const nextPlayer = {
        x: clamp(previousPlayer.x + deltaX, 0, gridSize - 1),
        y: clamp(previousPlayer.y + deltaY, 0, gridSize - 1),
      };

      if (nextPlayer.x === targetRef.current.x && nextPlayer.y === targetRef.current.y) {
        setScore((previousScore) => previousScore + 1);
        const nextTarget = pickNextTarget(nextPlayer);
        targetRef.current = nextTarget;
        setTarget(nextTarget);
      }

      return nextPlayer;
    });
  };

  const handleKeyDown = (event) => {
    if (isTypingTarget(event.target)) return;

    const handledCodes = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (handledCodes.includes(event.code) || (event.code === 'Space' && finished)) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (finished) {
      if (event.code === 'Space') resetRound();
      return;
    }

    if (event.code === 'ArrowLeft') handleMove(-1, 0);
    if (event.code === 'ArrowRight') handleMove(1, 0);
    if (event.code === 'ArrowUp') handleMove(0, -1);
    if (event.code === 'ArrowDown') handleMove(0, 1);
  };

  return (
    <div style={{ border: '1px solid #A7F3D0', borderRadius: 18, background: 'linear-gradient(180deg, #ECFDF5 0%, #F0FDFA 100%)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, color: '#047857', fontWeight: 800 }}>{title}</div>
          <div style={{ fontSize: 10, color: '#065F46', marginTop: 2 }}>נווט על הלוח ותפוס כל ניצוץ לפני שהזמן נגמר.</div>
        </div>
        <div style={{ fontSize: 11, color: '#065F46', fontWeight: 700 }}>Score {score} | Best {best} | {timeLeft}s</div>
      </div>

      <div
        ref={boardRef}
        role="application"
        tabIndex={0}
        data-arcade-surface="true"
        aria-label="צייד ניצוצות"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onMouseDown={focusBoard}
        onClick={focusBoard}
        onKeyDown={handleKeyDown}
        style={createSurfaceStyle({ focused, height: 240, background: 'linear-gradient(180deg, #ECFDF5 0%, #D1FAE5 100%)', borderColor: '#6EE7B7' })}
      >
        <div style={{ position: 'absolute', inset: 0, display: 'grid', direction: 'ltr', gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${gridSize}, minmax(0, 1fr))`, gap: 8, padding: 16 }}>
          {Array.from({ length: gridSize * gridSize }).map((_, index) => {
            const x = index % gridSize;
            const y = Math.floor(index / gridSize);
            const isPlayer = player.x === x && player.y === y;
            const isTarget = target.x === x && target.y === y;

            return (
              <div
                key={`${x}-${y}`}
                style={{
                  borderRadius: 12,
                  border: '1px solid rgba(16,185,129,0.22)',
                  background: isPlayer ? '#0F172A' : isTarget ? '#10B981' : 'rgba(255,255,255,0.58)',
                  boxShadow: isTarget ? '0 0 0 3px rgba(16,185,129,0.16)' : 'none',
                  transition: 'background 120ms ease, box-shadow 120ms ease',
                }}
              />
            );
          })}
        </div>

        {!started && !finished && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#047857', fontWeight: 800, textAlign: 'center', padding: 18 }}>
            התחל לזוז עם החיצים כדי לאסוף ניצוצות
          </div>
        )}

        {finished && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#065F46', fontWeight: 800, textAlign: 'center', padding: 18, background: 'rgba(255,255,255,0.32)' }}>
            הזמן נגמר. לחץ Space כדי להתחיל מחדש
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8, fontSize: 10, color: '#065F46' }}>
        <span>{focused ? 'פוקוס מקלדת פעיל' : 'לחץ על הלוח כדי להחזיר פוקוס'}</span>
        <span>Arrow keys</span>
      </div>
    </div>
  );
}

const renderArcadeGame = (activeGameId) => {
  if (activeGameId === 'lane-dodger') {
    return <LaneDodgerGame />;
  }

  if (activeGameId === 'grid-collector') {
    return <GridCollectorGame />;
  }

  return <AirHockeyArcadeGame />;
};

export default function OneAxisAirHockeyGame({ title, compact = false, allowPopup = false }) {
  const [popupOpen, setPopupOpen] = useState(false);
  const [activeGameId, setActiveGameId] = useState('air-hockey');
  const [gameHasFocus, setGameHasFocus] = useState(false);

  const launcherButtonRef = useRef(null);
  const overlayPanelRef = useRef(null);

  const panelTitle = title || (allowPopup ? 'Arcade בזמן המתנה' : 'הוקי בזמן המתנה');
  const activeGame = ARCADE_GAMES.find((game) => game.id === activeGameId) || ARCADE_GAMES[0];

  const closePopup = () => {
    setPopupOpen(false);
    setGameHasFocus(false);
    window.requestAnimationFrame(() => {
      launcherButtonRef.current?.focus();
    });
  };

  useEffect(() => {
    if (!popupOpen) return undefined;

    const rafId = window.requestAnimationFrame(() => {
      const surface = overlayPanelRef.current?.querySelector('[data-arcade-surface="true"]');
      if (surface instanceof HTMLElement) surface.focus();
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [popupOpen, activeGameId]);

  if (!allowPopup) {
    return <AirHockeyArcadeGame title={panelTitle} compact={compact} />;
  }

  return (
    <>
      <div style={{ marginTop: compact ? 8 : 10, border: '1px solid #BFDBFE', borderRadius: 18, background: 'linear-gradient(180deg, #F8FBFF 0%, #EFF6FF 100%)', padding: compact ? '10px 12px' : '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 13, color: '#1D4ED8', fontWeight: 800 }}>{panelTitle}</div>
            <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>Arcade עם ניווט מקלדת ממוקד רק כשהחלון פתוח ומפוקס.</div>
          </div>
          <div style={{ fontSize: 10, color: '#334155', fontWeight: 700 }}>{ARCADE_GAMES.length} משחקים</div>
        </div>

        <div style={{ border: '1px solid #DBEAFE', borderRadius: 14, background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FBFF 100%)', padding: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {ARCADE_GAMES.map((game) => (
              <span
                key={game.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 999,
                  padding: '5px 9px',
                  background: `${game.accent}14`,
                  color: game.accent,
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: game.accent }} />
                {game.label}
              </span>
            ))}
          </div>

          <div style={{ fontSize: 11, color: '#334155', lineHeight: 1.5, marginBottom: 10 }}>
            הארקייד נפתח כ־overlay עם פוקוס ברור, selector פנימי, וחיצים פעילים רק בתוך חלון המשחק.
          </div>

          <button
            ref={launcherButtonRef}
            type="button"
            onClick={() => setPopupOpen(true)}
            style={{
              width: '100%',
              height: 38,
              borderRadius: 12,
              border: '1px solid #93C5FD',
              background: 'linear-gradient(180deg, #EFF6FF 0%, #DBEAFE 100%)',
              color: '#1E3A8A',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            פתח Arcade
          </button>

          <div style={{ fontSize: 10, color: '#64748B', marginTop: 8, textAlign: 'right' }}>
            Tip: אחרי הפתיחה, החיצים והרווח נשארים תחומים לארקייד בלבד.
          </div>
        </div>
      </div>

      {popupOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(2,6,23,0.52)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePopup();
          }}
        >
          <div
            ref={overlayPanelRef}
            role="dialog"
            aria-modal="true"
            aria-label={panelTitle}
            onKeyDownCapture={(event) => {
              if (event.key !== 'Escape') return;
              event.preventDefault();
              event.stopPropagation();
              closePopup();
            }}
            style={{ width: 'min(760px, 96vw)', maxHeight: '92vh', overflow: 'auto', background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)', borderRadius: 24, border: '1px solid #BFDBFE', boxShadow: '0 24px 80px rgba(15,23,42,0.36)', padding: 18 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 18, color: '#0F172A', fontWeight: 900 }}>{panelTitle}</div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{activeGame.subtitle}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: gameHasFocus ? '#0F766E' : '#92400E', background: gameHasFocus ? '#CCFBF1' : '#FEF3C7', borderRadius: 999, padding: '6px 10px', whiteSpace: 'nowrap' }}>
                  {gameHasFocus ? 'פוקוס מקלדת בארקייד פעיל' : 'לחץ על המשחק כדי להחזיר פוקוס'}
                </span>
                <button
                  type="button"
                  onClick={closePopup}
                  style={{ border: '1px solid #CBD5E1', background: 'white', borderRadius: 10, padding: '7px 12px', cursor: 'pointer', color: '#334155', fontWeight: 700 }}
                >
                  סגור
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {ARCADE_GAMES.map((game) => {
                const isActive = game.id === activeGameId;
                return (
                  <button
                    key={game.id}
                    type="button"
                    onClick={() => {
                      setActiveGameId(game.id);
                      setGameHasFocus(false);
                    }}
                    style={{
                      border: `1px solid ${isActive ? game.accent : '#CBD5E1'}`,
                      background: isActive ? `${game.accent}14` : 'white',
                      color: isActive ? game.accent : '#334155',
                      borderRadius: 12,
                      padding: '9px 12px',
                      cursor: 'pointer',
                      minWidth: 140,
                      textAlign: 'right',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 800 }}>{game.label}</div>
                    <div style={{ fontSize: 10, marginTop: 3, opacity: 0.86 }}>{game.hotkeys}</div>
                  </button>
                );
              })}
            </div>

            <div
              onFocusCapture={() => setGameHasFocus(true)}
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setGameHasFocus(false);
                }
              }}
            >
              {renderArcadeGame(activeGameId)}
            </div>

            <div style={{ fontSize: 11, color: '#64748B', marginTop: 12, textAlign: 'right' }}>
              Esc סוגר את ה־overlay. חיצים ורווח נלכדים רק בתוך משטח המשחק המפוקס.
            </div>
          </div>
        </div>
      )}
    </>
  );
}