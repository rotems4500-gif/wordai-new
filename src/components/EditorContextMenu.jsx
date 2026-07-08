import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';

// תפריט הקשר בסגנון Word (RTL). קומפוננטת תצוגה בלבד:
// - לא עוטפת את עצמה ב-portal (ה-parent אחראי על ה-portal).
// - לא ממקמת את עצמה (ה-parent שם left/top על ה-wrapper); כאן רק בונים את קופסת התפריט עצמה.
//
// API:
//   <EditorContextMenu editor={editor} items={items} onClose={onClose} />
//
// items: ראה טיפוסים בתיעוד למעלה בקובץ (label/icon/shortcut/disabled/onSelect/submenu/
// separatorBefore/custom/headerLabel).

function isInteractive(item) {
  return item && !item.headerLabel && !item.custom && !item.disabled;
}

function MenuRow({ item, isHighlighted, isSubmenuOpen, onRowClick, onRowEnter, onRowLeave, rowRef }) {
  if (item.custom) {
    return (
      <div className="px-3 py-1.5">
        {item.custom}
      </div>
    );
  }

  if (item.headerLabel) {
    return (
      <div className="px-3 py-1 text-xs font-semibold text-slate-500">
        {item.label}
      </div>
    );
  }

  const Icon = item.icon;
  const hasSubmenu = Array.isArray(item.submenu) && item.submenu.length > 0;

  return (
    <div
      ref={rowRef}
      className={[
        'flex items-center gap-2.5 px-3 py-1.5 cursor-default',
        item.disabled ? 'text-slate-400 pointer-events-none opacity-60' : '',
        isHighlighted || isSubmenuOpen ? 'bg-slate-100' : 'hover:bg-slate-100',
      ].join(' ')}
      onClick={() => onRowClick(item)}
      onMouseEnter={() => onRowEnter(item)}
      onMouseLeave={() => onRowLeave(item)}
    >
      {Icon ? <Icon size={16} className="shrink-0" /> : null}
      {item.label ? <span className="truncate">{item.label}</span> : null}
      <span className="flex-1" />
      {item.shortcut ? (
        <span className="text-slate-400 text-xs shrink-0">{item.shortcut}</span>
      ) : null}
      {hasSubmenu ? <ChevronLeft size={14} className="shrink-0 text-slate-400" /> : null}
    </div>
  );
}

function SubmenuFlipWrapper({ children }) {
  const wrapperRef = useRef(null);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.left < 8) {
      setFlipped(true);
    }
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={[
        'absolute top-0',
        flipped ? 'left-full right-auto' : 'right-full',
      ].join(' ')}
    >
      {children}
    </div>
  );
}

function MenuList({ editor, items, onClose, depth = 0, width = 290 }) {
  const listRef = useRef(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [openSubmenuId, setOpenSubmenuId] = useState(null);
  const closeTimerRef = useRef(null);
  const rowRefs = useRef({});

  const interactiveIndices = useMemo(
    () => items.map((it, idx) => (isInteractive(it) ? idx : -1)).filter((idx) => idx >= 0),
    [items]
  );

  useEffect(() => {
    if (depth === 0) {
      const el = listRef.current;
      if (el) el.focus();
    }
  }, [depth]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleCloseSubmenu = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpenSubmenuId(null);
    }, 150);
  };

  const activateItem = (item) => {
    if (!item || item.disabled || item.headerLabel || item.custom) return;
    const hasSubmenu = Array.isArray(item.submenu) && item.submenu.length > 0;
    if (hasSubmenu) {
      setOpenSubmenuId((prev) => (prev === item.id ? null : item.id));
      return;
    }
    if (typeof item.onSelect === 'function') {
      item.onSelect();
    }
  };

  const handleRowClick = (item) => {
    clearCloseTimer();
    activateItem(item);
  };

  const handleRowEnter = (item) => {
    clearCloseTimer();
    const hasSubmenu = Array.isArray(item.submenu) && item.submenu.length > 0;
    if (hasSubmenu) {
      setOpenSubmenuId(item.id);
    } else {
      setOpenSubmenuId(null);
    }
  };

  const handleRowLeave = (item) => {
    const hasSubmenu = Array.isArray(item.submenu) && item.submenu.length > 0;
    if (hasSubmenu) {
      scheduleCloseSubmenu();
    }
  };

  const moveHighlight = (direction) => {
    if (interactiveIndices.length === 0) return;
    const currentPos = interactiveIndices.indexOf(highlightIndex);
    let nextPos;
    if (currentPos === -1) {
      nextPos = direction > 0 ? 0 : interactiveIndices.length - 1;
    } else {
      nextPos = (currentPos + direction + interactiveIndices.length) % interactiveIndices.length;
    }
    setHighlightIndex(interactiveIndices[nextPos]);
  };

  const handleKeyDown = (e) => {
    const highlighted = highlightIndex >= 0 ? items[highlightIndex] : null;
    const highlightedHasSubmenu = highlighted && Array.isArray(highlighted.submenu) && highlighted.submenu.length > 0;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        moveHighlight(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        moveHighlight(-1);
        break;
      case 'Enter':
        e.preventDefault();
        e.stopPropagation();
        if (highlighted) activateItem(highlighted);
        break;
      case 'ArrowLeft':
        // RTL: ArrowLeft = פותח תת-תפריט (קדימה בכיוון RTL).
        if (highlightedHasSubmenu) {
          e.preventDefault();
          e.stopPropagation();
          setOpenSubmenuId(highlighted.id);
        }
        break;
      case 'ArrowRight':
        // RTL: ArrowRight = סוגר תת-תפריט פתוח.
        if (openSubmenuId) {
          e.preventDefault();
          e.stopPropagation();
          setOpenSubmenuId(null);
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        if (typeof onClose === 'function') onClose();
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={listRef}
      dir="rtl"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={`rounded-lg border border-slate-200 bg-white py-1.5 shadow-2xl text-[13.5px] text-slate-800 select-none outline-none ${width === 290 ? 'w-[290px]' : 'w-[230px]'}`}
    >
      {items.map((item, idx) => {
        const hasSubmenu = Array.isArray(item.submenu) && item.submenu.length > 0;
        const isSubmenuOpen = hasSubmenu && openSubmenuId === item.id;

        return (
          <React.Fragment key={item.id ?? idx}>
            {item.separatorBefore ? <div className="my-1 h-px bg-slate-200" /> : null}
            <div className="relative">
              <MenuRow
                item={item}
                isHighlighted={idx === highlightIndex}
                isSubmenuOpen={isSubmenuOpen}
                onRowClick={handleRowClick}
                onRowEnter={handleRowEnter}
                onRowLeave={handleRowLeave}
                rowRef={(el) => {
                  rowRefs.current[item.id ?? idx] = el;
                }}
              />
              {isSubmenuOpen ? (
                <SubmenuFlipWrapper>
                  <MenuList
                    editor={editor}
                    items={item.submenu}
                    onClose={onClose}
                    depth={depth + 1}
                    width={230}
                  />
                </SubmenuFlipWrapper>
              ) : null}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function EditorContextMenu({ editor, items, onClose }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return <MenuList editor={editor} items={items} onClose={onClose} depth={0} />;
}
