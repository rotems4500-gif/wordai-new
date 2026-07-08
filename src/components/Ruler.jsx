import React, { useEffect, useRef, useState, useCallback } from "react";

// סרגל אופקי בסגנון Word, RTL: 0 בקצה הימני, המספרים גדלים שמאלה.
// מוצג רק כאשר #editor-wrapper מחזיק class="show-ruler" (נשלט ב-CSS, ראה tailwind.css).
const PX_PER_CM = 96 / 2.54;
const CM_TO_PX = (cm) => cm * PX_PER_CM;
const PX_TO_CM = (px) => px / PX_PER_CM;

const clampCm = (cm, maxCm) => Math.max(0, Math.min(maxCm, cm));

export default function Ruler() {
  const rulerRef = useRef(null);
  const dragRef = useRef(null);
  const [metrics, setMetrics] = useState(null); // { widthPx, paddingLeftPx, paddingRightPx }
  const [dragSide, setDragSide] = useState(null); // 'right' | 'left' | null

  const measure = useCallback(() => {
    const pmEl = document.querySelector(".ProseMirror");
    if (!pmEl) return;
    const rect = pmEl.getBoundingClientRect();
    const cs = window.getComputedStyle(pmEl);
    const paddingLeftPx = parseFloat(cs.paddingLeft) || 0;
    const paddingRightPx = parseFloat(cs.paddingRight) || 0;
    setMetrics({ widthPx: rect.width, paddingLeftPx, paddingRightPx });
  }, []);

  useEffect(() => {
    measure();
    const pmEl = document.querySelector(".ProseMirror");
    let ro = null;
    if (pmEl && window.ResizeObserver) {
      ro = new window.ResizeObserver(measure);
      ro.observe(pmEl);
    }
    window.addEventListener("resize", measure);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const startDrag = useCallback(
    (side) => (e) => {
      e.preventDefault();
      const pmEl = document.querySelector(".ProseMirror");
      if (!pmEl || !metrics) return;
      const startX = e.clientX;
      const startPaddingCm =
        side === "right"
          ? PX_TO_CM(metrics.paddingRightPx)
          : PX_TO_CM(metrics.paddingLeftPx);
      const widthCm = PX_TO_CM(metrics.widthPx);
      const maxCm = Math.max(0, widthCm - 1); // תמיד להשאיר לפחות ~1 ס"מ טקסט

      dragRef.current = { side, startX, startPaddingCm, maxCm };
      setDragSide(side);

      const onMove = (ev) => {
        const d = dragRef.current;
        if (!d) return;
        const deltaXCm = PX_TO_CM(ev.clientX - d.startX);
        const nextCm =
          d.side === "right"
            ? clampCm(d.startPaddingCm - deltaXCm, d.maxCm)
            : clampCm(d.startPaddingCm + deltaXCm, d.maxCm);
        const el = document.querySelector(".ProseMirror");
        if (el) {
          if (d.side === "right") el.style.paddingRight = `${nextCm}cm`;
          else el.style.paddingLeft = `${nextCm}cm`;
        }
        d.lastCm = nextCm;
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        const d = dragRef.current;
        setDragSide(null);
        dragRef.current = null;
        measure();
        if (d && typeof d.lastCm === "number") {
          const el = document.querySelector(".ProseMirror");
          const cs = el ? window.getComputedStyle(el) : null;
          const rightCm = cs ? PX_TO_CM(parseFloat(cs.paddingRight) || 0) : undefined;
          const leftCm = cs ? PX_TO_CM(parseFloat(cs.paddingLeft) || 0) : undefined;
          window.dispatchEvent(
            new CustomEvent("wordflow:ruler-margins", {
              detail: { rightCm, leftCm },
            })
          );
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [metrics, measure]
  );

  if (!metrics || !metrics.widthPx) return <div ref={rulerRef} className="editor-ruler" aria-hidden="true" />;

  const { widthPx, paddingLeftPx, paddingRightPx } = metrics;
  const widthCm = PX_TO_CM(widthPx);

  const ticks = [];
  for (let q = 0; q * 0.25 <= widthCm + 0.001; q++) {
    const cm = Math.round(q * 0.25 * 100) / 100;
    if (cm > widthCm) break;
    const isMajor = Math.abs(cm - Math.round(cm)) < 0.001;
    ticks.push({ cm, isMajor });
  }

  return (
    <div
      ref={rulerRef}
      className="editor-ruler"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 5,
        width: widthPx,
        height: 22,
        margin: "0 auto 8px",
        background: "#F1F5F9",
        border: "1px solid #CBD5E1",
        borderRadius: 4,
        boxSizing: "border-box",
        userSelect: "none",
        direction: "ltr", // מיקום מוחלט לפי right/left ידני, לא תלוי בכיווניות דפדפן
      }}
      title="סרגל עמוד"
    >
      {/* אזור שוליים ימני (מוצל) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: paddingRightPx,
          background: "rgba(148,163,184,0.35)",
          borderRadius: "4px 0 0 4px",
        }}
        aria-hidden="true"
      />
      {/* אזור שוליים שמאלי (מוצל) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: paddingLeftPx,
          background: "rgba(148,163,184,0.35)",
          borderRadius: "0 4px 4px 0",
        }}
        aria-hidden="true"
      />

      {/* קווי סימון */}
      {ticks.map(({ cm, isMajor }) => (
        <div
          key={cm}
          style={{
            position: "absolute",
            right: CM_TO_PX(cm),
            bottom: 0,
            width: 1,
            height: isMajor ? 10 : 5,
            background: "#94A3B8",
          }}
          aria-hidden="true"
        />
      ))}

      {/* תוויות מספר כל 1 ס"מ */}
      {ticks
        .filter((t) => t.isMajor && t.cm > 0 && t.cm < widthCm)
        .map(({ cm }) => (
          <span
            key={`label-${cm}`}
            style={{
              position: "absolute",
              right: CM_TO_PX(cm) - 8,
              top: 1,
              fontSize: 9,
              color: "#64748B",
              width: 16,
              textAlign: "center",
              pointerEvents: "none",
              fontFamily: "inherit",
            }}
          >
            {Math.round(cm)}
          </span>
        ))}

      {/* ידית שוליים ימנית */}
      <div
        onMouseDown={startDrag("right")}
        title={`שוליים ימניים: ${PX_TO_CM(paddingRightPx).toFixed(2)} ס"מ (גרור לשינוי)`}
        style={{
          position: "absolute",
          right: Math.max(0, paddingRightPx - 5),
          top: 0,
          width: 10,
          height: "100%",
          cursor: "ew-resize",
          zIndex: 6,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 4,
            top: 3,
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "7px solid " + (dragSide === "right" ? "#6C5CE7" : "#475569"),
          }}
        />
      </div>

      {/* ידית שוליים שמאלית */}
      <div
        onMouseDown={startDrag("left")}
        title={`שוליים שמאליים: ${PX_TO_CM(paddingLeftPx).toFixed(2)} ס"מ (גרור לשינוי)`}
        style={{
          position: "absolute",
          left: Math.max(0, paddingLeftPx - 5),
          top: 0,
          width: 10,
          height: "100%",
          cursor: "ew-resize",
          zIndex: 6,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 4,
            top: 3,
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "7px solid " + (dragSide === "left" ? "#6C5CE7" : "#475569"),
          }}
        />
      </div>
    </div>
  );
}
