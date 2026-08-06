// areaSelectOverlay.js — שכבת בחירת אזור על גבי כל המסך (viewport)
// גרירה מציירת מלבן; Esc מבטל. בסיום שולח הודעה ל-background עם קואורדינטות ה-CSS pixels + devicePixelRatio,
// וה-background חותך אותן מתוך צילום המסך המלא (captureVisibleTab).

(function areaSelectOverlay() {
  // מניעת הזרקה כפולה אם המשתמש לוחץ שוב לפני שהקודמת נסגרה
  if (document.getElementById('wordflow-area-select-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'wordflow-area-select-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    cursor: 'crosshair',
    background: 'rgba(0,0,0,0.15)',
    direction: 'rtl',
  });

  const hint = document.createElement('div');
  hint.textContent = 'גררו לבחירת אזור להעתקה · Esc לביטול';
  Object.assign(hint.style, {
    position: 'fixed',
    top: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#1f2937',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: '8px',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    fontSize: '13px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    pointerEvents: 'none',
  });

  const rectEl = document.createElement('div');
  Object.assign(rectEl.style, {
    position: 'fixed',
    border: '2px solid #6366f1',
    background: 'rgba(99,102,241,0.15)',
    display: 'none',
    pointerEvents: 'none',
  });

  overlay.appendChild(hint);
  overlay.appendChild(rectEl);
  document.documentElement.appendChild(overlay);

  let startX = 0;
  let startY = 0;
  let dragging = false;

  function cleanup() {
    document.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
      chrome.runtime.sendMessage({ type: 'wordflow-area-select-cancelled' });
    }
  }

  function updateRect(x1, y1, x2, y2) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    Object.assign(rectEl.style, {
      display: 'block',
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
    return { left, top, width, height };
  }

  overlay.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    updateRect(startX, startY, startX, startY);
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    updateRect(startX, startY, e.clientX, e.clientY);
  });

  overlay.addEventListener('mouseup', (e) => {
    if (!dragging) return;
    dragging = false;
    const { left, top, width, height } = updateRect(startX, startY, e.clientX, e.clientY);
    cleanup();

    if (width < 4 || height < 4) {
      chrome.runtime.sendMessage({ type: 'wordflow-area-select-cancelled' });
      return;
    }

    chrome.runtime.sendMessage({
      type: 'wordflow-area-select-done',
      rect: {
        x: left,
        y: top,
        width,
        height,
        devicePixelRatio: window.devicePixelRatio || 1,
      },
    });
  });

  document.addEventListener('keydown', onKeyDown, true);
})();
