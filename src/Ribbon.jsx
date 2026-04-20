import React, { useState, useRef, useEffect } from 'react';
import { getToolLinksConfig } from './services/aiService';

const FONTS = [
  'Alef', 'Heebo', 'Assistant', 'Frank Ruhl Libre', 'Miriam Libre', 'Secular One',
  'Arial', 'Calibri', 'David', 'Georgia', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Verdana',
];
const SIZES = ['8','9','10','11','12','14','16','18','20','24','28','36','48','72'];

const SYMBOL_CATS = {
  'כללי':    ['©','®','™','°','§','¶','†','‡','•','·','…','‰','¡','¿','№','℃','℉','ℓ','℅','′','″'],
  'מטבעות':  ['$','€','£','¥','₪','₽','¢','₿','₩','₣','₤','₦','₨','₫','฿','₴','₵','₮'],
  'מתמטיקה': ['±','×','÷','≠','≤','≥','∞','∑','√','π','∫','∂','∇','≈','∝','∈','∩','∪','∀','∃','¬','μ','σ','Δ','Ω'],
  'חיצים':   ['→','←','↑','↓','↔','↕','⇒','⇐','⇔','⇑','⇓','➤','➡','⬅','⬆','⬇','↩','↪','↺','↻'],
  'פיסוק':   ['"','"','\u2018','\u2019','«','»','‹','›','„','–','—','‐','…','·','∙'],
  'צורות':   ['★','☆','✦','✧','✩','✪','●','○','■','□','▲','△','◆','◇','♥','♦','♣','♠','✓','✗','☐','☑'],
};

const SHAPES_LIST = [
  { char: '■', label: 'ריבוע מלא' }, { char: '□', label: 'ריבוע ריק' },
  { char: '▬', label: 'מלבן' },       { char: '●', label: 'עיגול מלא' },
  { char: '○', label: 'עיגול ריק' },  { char: '▲', label: 'משולש למעלה' },
  { char: '▼', label: 'משולש למטה' }, { char: '◀', label: 'משולש שמאל' },
  { char: '▶', label: 'משולש ימין' }, { char: '◆', label: 'יהלום מלא' },
  { char: '◇', label: 'יהלום ריק' },  { char: '★', label: 'כוכב מלא' },
  { char: '☆', label: 'כוכב ריק' },  { char: '♥', label: 'לב' },
  { char: '➤', label: 'חץ מלא' },    { char: '→', label: 'חץ ימין' },
  { char: '←', label: 'חץ שמאל' },   { char: '↑', label: 'חץ מעלה' },
  { char: '↓', label: 'חץ מטה' },    { char: '↔', label: 'חץ דו-כיווני' },
  { char: '⇒', label: 'חץ כפול' },   { char: '⇔', label: 'חץ כפול דו-סטרי' },
  { char: '⬛', label: 'ריבוע גדול שחור' }, { char: '⬜', label: 'ריבוע גדול לבן' },
];

export default function Ribbon({ onCommand = () => {}, onToggleTaskpane = () => {}, zoom = 100, onOpenFileMenu = () => {}, formatPainterActive = false, activeFormats = {}, shortcuts = {}, assistantOpen = false, documentStyle = 'academic' }) {
  const [activeTab, setActiveTab] = useState('');
  const [tableHover, setTableHover] = useState({ row: 0, col: 0 });
  const [fixedDrop, setFixedDrop] = useState(null); // { type, x, y }
  const [symbolCat, setSymbolCat] = useState('כללי');
  const toolLinks = getToolLinksConfig();
  const dropRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!fixedDrop) return;
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setFixedDrop(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [fixedDrop]);

  const openDrop = (type, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const estimatedWidth = 340;
    const x = Math.max(8, Math.min(rect.left, window.innerWidth - estimatedWidth - 8));
    const y = Math.max(8, Math.min(rect.bottom + 2, window.innerHeight - 420));
    setFixedDrop({ type, x, y });
  };
  const closeDrop = () => setFixedDrop(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onCommand('insertImage', ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleInsertLink = () => {
    onCommand('insertLinkDialog');
  };

  const handleInsertTable = (rows, cols) => {
    onCommand('insertTable', { rows, cols });
    closeDrop();
    setTableHover({ row: 0, col: 0 });
  };

  const handleScholar = () => {
    onCommand('searchScholar');
  };

  const handleZoom = (val) => {
    onCommand('zoom', val);
  };

  const activeStyle = (flag) => (flag ? {
    background: '#DBEAFE',
    borderColor: '#93C5FD',
    color: '#1D4ED8',
    boxShadow: 'inset 0 0 0 1px #60A5FA'
  } : {});

  /* ---- Fixed-position dropdown renderer ---- */
  const renderFixedDrop = () => {
    if (!fixedDrop) return null;
    const ms = {
      position: 'fixed', left: fixedDrop.x, top: fixedDrop.y,
      background: 'white', border: '1px solid #C8C6C4',
      boxShadow: '0 6px 20px rgba(0,0,0,0.18)', borderRadius: '2px',
      zIndex: 9999, direction: 'rtl', maxHeight: '70vh', overflowY: 'auto',
    };
    switch (fixedDrop.type) {

      case 'coverpage': return (
        <div ref={dropRef} style={{ ...ms, padding: '10px 12px', minWidth: '260px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#323130', marginBottom: '8px' }}>בחר סגנון עמוד שער</div>
          {[
            { id: 'classic', label: 'קלאסי', preview: 'כותרת רשמית עם קו מפריד' },
            { id: 'modern', label: 'מודרני', preview: 'כותרת גדולה עם תגית עליונה' },
            { id: 'academic', label: 'אקדמי', preview: 'מסגרת נקייה ומראה פורמלי' },
            { id: 'bold', label: 'נועז', preview: 'מראה צבעוני ומודגש' },
          ].map((cover) => (
            <button
              key={cover.id}
              className="r-btn"
              style={{ width: '100%', justifyContent: 'space-between', padding: '9px 12px', marginBottom: '4px', borderRadius: 8, border: '1px solid #E5E7EB' }}
              onClick={() => { onCommand('insertCoverPage', cover.id); closeDrop(); }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <span style={{ fontSize: '12px', fontWeight: 700 }}>{cover.label}</span>
                <span style={{ fontSize: '10px', color: '#64748B' }}>{cover.preview}</span>
              </div>
              <div style={{ width: 34, height: 42, borderRadius: 6, background: 'linear-gradient(180deg,#EFF6FF 0%, #FFFFFF 100%)', border: '1px solid #BFDBFE', padding: 4, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ height: 4, borderRadius: 999, background: cover.id === 'modern' ? '#1D4ED8' : '#93C5FD', width: '70%', alignSelf: 'center' }} />
                <div style={{ height: 3, borderRadius: 999, background: '#CBD5E1', width: '85%', alignSelf: 'center' }} />
                <div style={{ height: 2, borderRadius: 999, background: '#E2E8F0', width: '60%', alignSelf: 'center' }} />
                <div style={{ height: 6, borderRadius: 3, background: cover.id === 'bold' ? '#DBEAFE' : '#F8FAFC', border: '1px solid #E2E8F0' }} />
              </div>
            </button>
          ))}
        </div>
      );

      case 'table': return (
        <div ref={dropRef} style={{ ...ms, padding: '12px', width: 'auto' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#323130', marginBottom: '8px' }}>הוספת טבלה</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 18px)', gap: '2px', direction: 'ltr' }}
               onMouseLeave={() => setTableHover({ row: 0, col: 0 })}>
            {Array.from({ length: 8 }, (_, r) => Array.from({ length: 10 }, (_, c) => (
              <div key={`${r}-${c}`}
                style={{ width: 18, height: 18, cursor: 'pointer',
                  border: r < tableHover.row && c < tableHover.col ? '1px solid #2B579A' : '1px solid #C8C6C4',
                  background: r < tableHover.row && c < tableHover.col ? '#DEECF9' : 'white' }}
                onMouseEnter={() => setTableHover({ row: r + 1, col: c + 1 })}
                onClick={() => handleInsertTable(r + 1, c + 1)} />
            )))}
          </div>
          <div style={{ textAlign: 'center', fontSize: '12px', color: '#605E5C', marginTop: '6px', height: '16px' }}>
            {tableHover.row > 0 ? `${tableHover.row}×${tableHover.col} טבלה` : ''}
          </div>
          <hr style={{ margin: '6px 0', border: 'none', borderTop: '1px solid #E1DFDD' }} />
          <button className="r-btn r-btn-medium" style={{ width: '100%' }} onClick={() => handleInsertTable(3, 3)}>טבלה 3×3</button>
          <button className="r-btn r-btn-medium" style={{ width: '100%', marginTop: 2 }} onClick={() => handleInsertTable(5, 5)}>טבלה 5×5</button>
        </div>
      );

      case 'symbols': return (
        <div ref={dropRef} style={{ ...ms, padding: '12px', width: '320px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#323130', marginBottom: '8px' }}>הוספת סמל</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', marginBottom: '8px' }}>
            {Object.keys(SYMBOL_CATS).map(cat => (
              <button key={cat} onClick={() => setSymbolCat(cat)}
                style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '2px', cursor: 'pointer',
                  border: '1px solid #C8C6C4', background: symbolCat === cat ? '#DEECF9' : 'white',
                  color: symbolCat === cat ? '#2B579A' : '#323130' }}>{cat}</button>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
            {SYMBOL_CATS[symbolCat].map((sym, i) => (
              <button key={i} title={sym}
                style={{ width: 30, height: 30, border: '1px solid #C8C6C4', borderRadius: '2px', background: 'white', cursor: 'pointer', fontSize: '17px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => { onCommand('insertSymbol', sym); closeDrop(); }}>{sym}</button>
            ))}
          </div>
        </div>
      );

      case 'shapes': return (
        <div ref={dropRef} style={{ ...ms, padding: '12px', width: '248px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#323130', marginBottom: '8px' }}>הוספת צורה</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px' }}>
            {SHAPES_LIST.map((s, i) => (
              <button key={i} title={s.label}
                style={{ width: 36, height: 36, border: '1px solid #C8C6C4', borderRadius: '2px', background: 'white', cursor: 'pointer', fontSize: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => { onCommand('insertSymbol', s.char); closeDrop(); }}>{s.char}</button>
            ))}
          </div>
        </div>
      );

      case 'margins': return (
        <div ref={dropRef} style={{ ...ms, padding: '4px 0', minWidth: '210px' }}>
          {[
            { label: 'רגיל',   desc: '2.54 ס"מ מכל צד',       value: 'normal' },
            { label: 'צר',     desc: '1.27 ס"מ מכל צד',       value: 'narrow' },
            { label: 'בינוני', desc: 'שמאל/ימין: 1.91 ס"מ',   value: 'moderate' },
            { label: 'רחב',    desc: '3.81 ס"מ שמאל/ימין',    value: 'wide' },
            { label: 'ממורכז', desc: '5 ס"מ שמאל/ימין',       value: 'centered' },
          ].map(m => (
            <button key={m.value} className="r-btn" onClick={() => { onCommand('setMargins', m.value); closeDrop(); }}
              style={{ width: '100%', flexDirection: 'column', alignItems: 'flex-start', padding: '8px 14px', borderRadius: 0, gap: 0 }}>
              <span style={{ fontWeight: '600', fontSize: '12px' }}>{m.label}</span>
              <span style={{ fontSize: '10px', color: '#605E5C' }}>{m.desc}</span>
            </button>
          ))}
        </div>
      );

      case 'orientation': return (
        <div ref={dropRef} style={{ ...ms, padding: '4px 0', minWidth: '170px' }}>
          <button className="r-btn r-btn-medium" style={{ width: '100%', padding: '8px 12px' }}
            onClick={() => { onCommand('setOrientation', 'portrait'); closeDrop(); }}>
            <i className="ph-fill ph-file"></i> לאורך (Portrait)
          </button>
          <button className="r-btn r-btn-medium" style={{ width: '100%', padding: '8px 12px' }}
            onClick={() => { onCommand('setOrientation', 'landscape'); closeDrop(); }}>
            <i className="ph-fill ph-file" style={{ transform: 'rotate(90deg)', display: 'inline-block' }}></i> לרוחב (Landscape)
          </button>
        </div>
      );

      case 'pagesize': return (
        <div ref={dropRef} style={{ ...ms, padding: '4px 0', minWidth: '200px' }}>
          {[
            { label: 'A4',     desc: '21 × 29.7 ס"מ',     value: 'a4' },
            { label: 'A3',     desc: '29.7 × 42 ס"מ',      value: 'a3' },
            { label: 'Letter', desc: '21.59 × 27.94 ס"מ',  value: 'letter' },
            { label: 'Legal',  desc: '21.59 × 35.56 ס"מ',  value: 'legal' },
          ].map(s => (
            <button key={s.value} className="r-btn" onClick={() => { onCommand('setPageSize', s.value); closeDrop(); }}
              style={{ width: '100%', flexDirection: 'column', alignItems: 'flex-start', padding: '8px 14px', borderRadius: 0, gap: 0 }}>
              <span style={{ fontWeight: '600', fontSize: '12px' }}>{s.label}</span>
              <span style={{ fontSize: '10px', color: '#605E5C' }}>{s.desc}</span>
            </button>
          ))}
        </div>
      );

      case 'columns': return (
        <div ref={dropRef} style={{ ...ms, padding: '10px 12px', minWidth: '210px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#323130', marginBottom: '8px' }}>מספר טורים</div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            {[1, 2, 3].map(n => (
              <button key={n} onClick={() => { onCommand('setColumns', n); closeDrop(); }}
                style={{ width: 54, height: 62, border: '1px solid #C8C6C4', borderRadius: '2px', background: 'white', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '11px', color: '#323130' }}>
                <div style={{ display: 'flex', gap: '2px', height: '30px' }}>
                  {Array.from({ length: n }, (_, i) => (
                    <div key={i} style={{ width: n === 1 ? 26 : n === 2 ? 11 : 7, height: '100%', background: '#C8C6C4', borderRadius: '1px' }} />
                  ))}
                </div>
                {n === 1 ? 'אחד' : n === 2 ? 'שניים' : 'שלושה'}
              </button>
            ))}
          </div>
        </div>
      );

      case 'header': return (
        <div ref={dropRef} style={{ ...ms, padding: '4px 0', minWidth: '190px' }}>
          <div style={{ padding: '6px 12px', fontSize: '11px', color: '#605E5C', borderBottom: '1px solid #E1DFDD', marginBottom: '2px' }}>כותרת עליונה</div>
          {['ריק','שם מסמך','תאריך + שם','מספר עמוד'].map(t => (
            <button key={t} className="r-btn r-btn-medium" style={{ width: '100%', padding: '6px 12px' }}
              onClick={() => { onCommand('insertHeader', t); closeDrop(); }}>{t}</button>
          ))}
        </div>
      );

      case 'footer': return (
        <div ref={dropRef} style={{ ...ms, padding: '4px 0', minWidth: '190px' }}>
          <div style={{ padding: '6px 12px', fontSize: '11px', color: '#605E5C', borderBottom: '1px solid #E1DFDD', marginBottom: '2px' }}>כותרת תחתונה</div>
          {['ריק','שם מסמך','מספר עמוד','תאריך'].map(t => (
            <button key={t} className="r-btn r-btn-medium" style={{ width: '100%', padding: '6px 12px' }}
              onClick={() => { onCommand('insertFooter', t); closeDrop(); }}>{t}</button>
          ))}
        </div>
      );

      case 'pagenum': return (
        <div ref={dropRef} style={{ ...ms, padding: '4px 0', minWidth: '170px' }}>
          {['תחילת עמוד','תחתית עמוד','מיקום נוכחי'].map(t => (
            <button key={t} className="r-btn r-btn-medium" style={{ width: '100%', padding: '6px 12px' }}
              onClick={() => { onCommand('insertPageNum', t); closeDrop(); }}>{t}</button>
          ))}
        </div>
      );

      case 'textbox': return (
        <div ref={dropRef} style={{ ...ms, padding: '4px 0', minWidth: '170px' }}>
          {['פשוט','עם כותרת','ציטוט','הדגשה'].map(t => (
            <button key={t} className="r-btn r-btn-medium" style={{ width: '100%', padding: '6px 12px' }}
              onClick={() => { onCommand('insertTextBox', t); closeDrop(); }}>{t}</button>
          ))}
        </div>
      );

      case 'smartart': return (
        <div ref={dropRef} style={{ ...ms, padding: '8px 12px', minWidth: '220px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#323130', marginBottom: '8px' }}>סוג SmartArt</div>
          {[
            { type: 'list',      label: 'רשימה בסיסית', icon: 'ph-list-bullets' },
            { type: 'process',   label: 'תהליך שלבי',   icon: 'ph-flow-arrow' },
            { type: 'cycle',     label: 'מחזור',         icon: 'ph-arrow-clockwise' },
            { type: 'hierarchy', label: 'היררכיה',       icon: 'ph-tree-structure' },
            { type: 'matrix',    label: 'מטריצה 2×2',   icon: 'ph-grid-four' },
          ].map(s => (
            <button key={s.type} className="r-btn r-btn-medium" style={{ width: '100%', marginBottom: '2px' }}
              onClick={() => { onCommand('insertSmartArt', s.type); closeDrop(); }}>
              <i className={`ph-fill ${s.icon} text-blue-600`}></i> {s.label}
            </button>
          ))}
        </div>
      );

      case 'chart': return (
        <div ref={dropRef} style={{ ...ms, padding: '8px 12px', minWidth: '200px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#323130', marginBottom: '8px' }}>סוג תרשים</div>
          {[
            { type: 'bar',   label: 'עמודות', icon: 'ph-chart-bar' },
            { type: 'line',  label: 'קווים',  icon: 'ph-chart-line' },
            { type: 'pie',   label: 'עוגה',   icon: 'ph-chart-pie-slice' },
            { type: 'table', label: 'נתונים (טבלה)', icon: 'ph-table' },
          ].map(c => (
            <button key={c.type} className="r-btn r-btn-medium" style={{ width: '100%', marginBottom: '2px' }}
              onClick={() => { onCommand('insertChart', c.type); closeDrop(); }}>
              <i className={`ph-fill ${c.icon} text-green-600`}></i> {c.label}
            </button>
          ))}
        </div>
      );

      case 'screenshot': return (
        <div ref={dropRef} style={{ ...ms, padding: '8px 12px', minWidth: '220px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#323130', marginBottom: '8px' }}>הוסף תמונה</div>
          <button className="r-btn r-btn-medium" style={{ width: '100%', marginBottom: '4px' }}
            onClick={async () => {
              closeDrop();
              try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
                const video = document.createElement('video');
                video.srcObject = stream;
                video.muted = true;
                await video.play();
                await new Promise((resolve) => {
                  if (video.readyState >= 2) resolve();
                  else video.onloadedmetadata = () => resolve();
                });
                const cv = document.createElement('canvas');
                cv.width = video.videoWidth || 1920;
                cv.height = video.videoHeight || 1080;
                const ctx = cv.getContext('2d');
                ctx?.drawImage(video, 0, 0, cv.width, cv.height);
                stream.getTracks().forEach((track) => track.stop());
                onCommand('insertImage', cv.toDataURL('image/png'));
              } catch (err) {
                alert('צילום המסך לא נתמך כרגע במצב הזה. אפשר לבחור תמונה מקובץ במקום זאת.');
              }
            }}>
            <i className="ph-fill ph-monitor text-blue-600"></i> שתף מסך וצלם
          </button>
          <button className="r-btn r-btn-medium" style={{ width: '100%' }}
            onClick={() => { closeDrop(); imgRef.current?.click(); }}>
            <i className="ph-fill ph-image text-gray-600"></i> בחר תמונה מקובץ
          </button>
        </div>
      );

      case 'paragraphSpacing': return (
        <div ref={dropRef} style={{ ...ms, padding: '10px 12px', minWidth: '240px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#323130', marginBottom: '8px' }}>בחר מרווח בין פסקאות</div>
          {[
            { label: 'צפוף', lineHeight: '1.15', before: 0, after: 4 },
            { label: 'רגיל', lineHeight: '1.5', before: 0, after: 8 },
            { label: 'מרווח', lineHeight: '2', before: 0, after: 14 },
          ].map((item) => (
            <button
              key={item.label}
              className="r-btn r-btn-medium"
              style={{ width: '100%', marginBottom: '4px' }}
              onClick={() => { onCommand('applyParagraphSpacing', item); closeDrop(); }}
            >
              <i className="ph-fill ph-list-dashes text-gray-600"></i> {item.label}
            </button>
          ))}
          <div style={{ fontSize: '10px', color: '#64748B', marginTop: '6px' }}>ההחלה מתבצעת על הפסקה הפעילה.</div>
        </div>
      );

      case 'wordart': return (
        <div ref={dropRef} style={{ ...ms, padding: '8px 12px', width: '230px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#323130', marginBottom: '8px' }}>סגנון WordArt</div>
          {[
            { label: 'כחול מודגש',       preview: { color: '#2B579A', fontWeight: 'bold', fontSize: '15px' },
              style: 'color:#2B579A;font-size:28px;font-weight:bold' },
            { label: 'גרדיאנט אדום-כתום', preview: { background: 'linear-gradient(90deg,#c0392b,#e67e22)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 'bold', fontSize: '15px' },
              style: 'background:linear-gradient(90deg,#c0392b,#e67e22);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:28px;font-weight:bold' },
            { label: 'זהב',               preview: { color: '#d4a017', fontWeight: 'bold', fontSize: '15px', textShadow: '1px 1px 2px #aaa' },
              style: 'color:#d4a017;font-size:28px;font-weight:bold;text-shadow:1px 1px 2px #aaa' },
            { label: 'ירוק',              preview: { color: '#27ae60', fontWeight: 'bold', fontSize: '15px' },
              style: 'color:#27ae60;font-size:28px;font-weight:bold' },
            { label: 'עם מסגרת כחולה',   preview: { border: '2px solid #2B579A', padding: '1px 6px', borderRadius: '3px', color: '#2B579A', fontWeight: 'bold', fontSize: '13px', display: 'inline-block' },
              style: 'font-size:24px;font-weight:bold;border:3px solid #2B579A;padding:4px 12px;border-radius:4px;color:#2B579A;display:inline-block' },
          ].map((s, i) => (
            <button key={i} className="r-btn" style={{ width: '100%', justifyContent: 'flex-start', padding: '5px 8px', marginBottom: '3px' }}
              onClick={() => {
                onCommand('insertWordArt', { text: 'טקסט מעוצב', style: s.style });
                closeDrop();
              }}>
              <span style={s.preview}>{s.label}</span>
            </button>
          ))}
        </div>
      );

      case 'themeColors': return (
        <div ref={dropRef} style={{ ...ms, padding: '10px 12px', minWidth: '220px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#323130', marginBottom: '8px' }}>ערכת צבעים</div>
          {[
            { name: 'כחול Office', primary: '#2B579A', accent: '#106EBE' },
            { name: 'ירוק טבע',    primary: '#217346', accent: '#107C41' },
            { name: 'אדום-כתום',   primary: '#C55A11', accent: '#E36C09' },
            { name: 'כהה (Dark)',  primary: '#1F1F1F', accent: '#4B4B4B' },
            { name: 'סגול קלאסי', primary: '#6B2E8F', accent: '#9B4DB7' },
          ].map(theme => (
            <button key={theme.name} className="r-btn" style={{ width: '100%', padding: '6px 10px', gap: '8px', marginBottom: '2px' }}
              onClick={() => {
                document.documentElement.style.setProperty('--word-blue', theme.primary);
                document.documentElement.style.setProperty('--word-accent', theme.accent);
                closeDrop();
              }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: theme.primary }} />
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: theme.accent }} />
              </div>
              <span style={{ fontSize: '12px' }}>{theme.name}</span>
            </button>
          ))}
        </div>
      );

      case 'themeFonts': return (
        <div ref={dropRef} style={{ ...ms, padding: '10px 12px', minWidth: '220px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#323130', marginBottom: '8px' }}>ערכת גופנים</div>
          {[
            { name: 'Office (Calibri)', heading: 'Calibri', body: 'Calibri' },
            { name: 'עברית (Heebo)',    heading: 'Heebo',   body: 'Heebo' },
            { name: 'פורמלי (David)',   heading: 'David',   body: 'David' },
            { name: 'קלאסי (Georgia)',  heading: 'Georgia', body: 'Georgia' },
            { name: 'מודרני (Assistant)', heading: 'Assistant', body: 'Assistant' },
          ].map(f => (
            <button key={f.name} className="r-btn" style={{ width: '100%', padding: '6px 10px', marginBottom: '2px', flexDirection: 'column', alignItems: 'flex-start' }}
              onClick={() => { onCommand('fontFamily', f.body); closeDrop(); }}>
              <span style={{ fontFamily: f.heading, fontWeight: 'bold', fontSize: '14px' }}>{f.name}</span>
              <span style={{ fontFamily: f.body, fontSize: '11px', color: '#605E5C' }}>Aa Bb עברית</span>
            </button>
          ))}
        </div>
      );

      case 'textEffects': return (
        <div ref={dropRef} style={{ ...ms, padding: '10px 12px', minWidth: '220px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#323130', marginBottom: '8px' }}>אפקטי טקסט</div>
          {[
            { label: 'צל', style: { textShadow: '2px 2px 4px rgba(0,0,0,0.4)' }, cmd: 'textShadow' },
            { label: 'זוהר (Glow)', style: { textShadow: '0 0 8px #2B579A', color: '#2B579A' }, cmd: 'textGlow' },
            { label: 'קו תחתי כפול', style: { textDecoration: 'underline double' }, cmd: 'underlineDouble' },
            { label: 'מחוק + קו תחתי', style: { textDecoration: 'line-through underline' }, cmd: 'strikeUnderline' },
            { label: 'טקסט מסגרת', style: { border: '1px solid currentColor', padding: '0 4px', borderRadius: '2px' }, cmd: 'textBorder' },
          ].map(e => (
            <button key={e.cmd} className="r-btn r-btn-medium" style={{ width: '100%', marginBottom: '2px' }}
              onClick={() => { onCommand('insertWordArt', { text: window.getSelection()?.toString() || 'טקסט', style: Object.entries(e.style).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`).join(';') }); closeDrop(); }}>
              <span style={e.style}>{e.label}</span>
            </button>
          ))}
        </div>
      );

      default: return null;
    }
  };

  return (
    <nav id="ribbon-container">
      {renderFixedDrop()}
        <ul id="tabs-row">
            <li className="tab-btn file-tab" onClick={() => onOpenFileMenu()} title={`קיצור: ${shortcuts.openFileMenu || 'Alt+F'}`}>קובץ</li>
            <li className={`tab-btn ${activeTab === "home" ? "active" : ""}`} onClick={() => setActiveTab(activeTab === "home" ? "" : "home")}>בית</li>
            <li className={`tab-btn ${activeTab === "insert" ? "active" : ""}`} onClick={() => setActiveTab(activeTab === "insert" ? "" : "insert")}>הוספה</li>
            <li className={`tab-btn ${activeTab === "design" ? "active" : ""}`} onClick={() => setActiveTab(activeTab === "design" ? "" : "design")}>עיצוב</li>
            <li className={`tab-btn ${activeTab === "layout" ? "active" : ""}`} onClick={() => setActiveTab(activeTab === "layout" ? "" : "layout")}>פריסה</li>
            <li className={`tab-btn ${activeTab === "references" ? "active" : ""}`} onClick={() => setActiveTab(activeTab === "references" ? "" : "references")}>הפניות</li>
            <li className={`tab-btn ${activeTab === "review" ? "active" : ""}`} onClick={() => setActiveTab(activeTab === "review" ? "" : "review")}>סקירה</li>
            <li className={`tab-btn ${activeTab === "view" ? "active" : ""}`} onClick={() => setActiveTab(activeTab === "view" ? "" : "view")}>תצוגה</li>
            <li className="tab-btn" style={{ color: "var(--word-blue)", fontWeight: "bold" }} onClick={() => onToggleTaskpane()} title={`קיצור: ${shortcuts.toggleAssistant || 'Ctrl+Shift+A'}`}>WordFlow AI</li>
        </ul>

        {/*  */}
        <div id="panel-home" className={`toolbar-panel ${activeTab === "home" ? "active" : ""}`}>
            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <button className="r-btn r-btn-large" title="הדבק (Ctrl+V)" onClick={() => onCommand('pasteClipboard')}><i className="ph-fill ph-clipboard text-gray-700"></i><span>הדבק</span></button>
                    <div className="flex flex-col gap-1">
                        <button className="r-btn r-btn-small" onClick={() => onCommand('cutSelection')} title="גזור (Ctrl+X)"><i className="ph ph-scissors"></i></button>
                        <button className="r-btn r-btn-small" onClick={() => onCommand('copySelection')} title="העתק (Ctrl+C)"><i className="ph ph-copy"></i></button>
                        <button
                          className={`r-btn r-btn-small ${formatPainterActive ? 'bg-blue-100 border-blue-400' : ''}`}
                          title="מברשת עיצוב"
                          onClick={() => onCommand('formatPainter')}
                          style={formatPainterActive ? { background: '#dbeafe', borderColor: '#60a5fa' } : {}}
                        >
                          <i className="ph-fill ph-paint-brush" style={formatPainterActive ? { color: '#2563eb' } : {}}></i>
                        </button>
                    </div>
                </div>
                <div className="toolbar-group-label">לוח גזירים</div>
            </div>
            <div className="toolbar-group">
                <div className="toolbar-group-items flex-col items-start gap-1">
                    <div className="flex gap-1">
                        <select
                          className="r-select"
                          style={{ width: '130px' }}
                          value={activeFormats.fontFamily || 'Alef'}
                          onChange={(e) => onCommand('fontFamily', e.target.value)}
                        >
                          {!FONTS.includes(activeFormats.fontFamily || 'Alef') && (
                            <option value={activeFormats.fontFamily || 'Alef'}>{activeFormats.fontFamily || 'Alef'}</option>
                          )}
                          {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                        <select
                          className="r-select"
                          style={{ width: '58px' }}
                          value={String(activeFormats.fontSize || '12')}
                          onChange={(e) => onCommand('fontSize', e.target.value + 'pt')}
                        >
                          {!SIZES.includes(String(activeFormats.fontSize || '12')) && (
                            <option value={String(activeFormats.fontSize || '12')}>{activeFormats.fontSize || '12'}</option>
                          )}
                          {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button className="r-btn r-btn-small" onClick={() => onCommand('fontSizeInc')} title="הגדל גופן" style={{fontSize:'11px',padding:'0 3px'}}>A+</button>
                        <button className="r-btn r-btn-small" onClick={() => onCommand('fontSizeDec')} title="קטן גופן" style={{fontSize:'11px',padding:'0 3px'}}>A-</button>
                    </div>
                    <div className="flex gap-1">
                        <button className={`r-btn r-btn-small font-bold ${activeFormats.bold ? 'is-active' : ''}`} style={activeStyle(activeFormats.bold)} onClick={() => onCommand('bold')}>B</button>
                        <button className={`r-btn r-btn-small italic ${activeFormats.italic ? 'is-active' : ''}`} style={activeStyle(activeFormats.italic)} onClick={() => onCommand('italic')}>I</button>
                        <button className={`r-btn r-btn-small underline ${activeFormats.underline ? 'is-active' : ''}`} style={activeStyle(activeFormats.underline)} onClick={() => onCommand('underline')}>U</button>
                        <button className={`r-btn r-btn-small line-through ${activeFormats.strike ? 'is-active' : ''}`} style={activeStyle(activeFormats.strike)} onClick={() => onCommand('strike')}>ab</button>
                        <button className="r-btn r-btn-small" title="כתב תחתי" onClick={() => onCommand('subscript')}>X<sub>2</sub></button>
                        <button className="r-btn r-btn-small" title="כתב עילי" onClick={() => onCommand('superscript')}>X<sup>2</sup></button>
                        <button className="r-btn r-btn-small" title="נקה עיצוב" onClick={() => onCommand('clearFormatting')}><i className="ph ph-eraser"></i></button>
                        <input type="color" onChange={(e) => onCommand('setColor', e.target.value)} style={{ width: '20px', height: '20px', border: 'none', padding: '0', cursor: 'pointer' }} title="צבע טקסט" />
                        <input type="color" defaultValue="#ffff00" onChange={(e) => onCommand('setHighlight', e.target.value)} style={{ width: '20px', height: '20px', border: 'none', padding: '0', cursor: 'pointer' }} title="סימון" />
                    </div>
                </div>
                <div className="toolbar-group-label">גופן</div>
            </div>
            <div className="toolbar-group">
                <div className="toolbar-group-items flex-col items-start gap-1">
                    <div className="flex gap-1">
                        <button className={`r-btn r-btn-small ${activeFormats.bulletList ? 'is-active' : ''}`} style={activeStyle(activeFormats.bulletList)} onClick={() => onCommand('bulletList')} title="רשימת נקודות"><i className="ph ph-list-bullets"></i></button>
                        <button className={`r-btn r-btn-small ${activeFormats.orderedList ? 'is-active' : ''}`} style={activeStyle(activeFormats.orderedList)} onClick={() => onCommand('orderedList')} title="רשימה ממוספרת"><i className="ph ph-list-numbers"></i></button>
                        <button className="r-btn r-btn-small" onClick={() => onCommand('insertTaskList')} title="רשימת משימות"><i className="ph ph-check-square"></i></button>
                        <div style={{ width: '1px', height: '16px', background: '#E1DFDD', margin: '0 2px' }}></div>
                        <button className="r-btn r-btn-small" onClick={() => onCommand('outdent')} title="הקטן כניסה"><i className="ph ph-text-outdent"></i></button>
                        <button className="r-btn r-btn-small" onClick={() => onCommand('indent')} title="הגדל כניסה"><i className="ph ph-text-indent"></i></button>
                    </div>
                    <div className="flex gap-1">
                        <button className={`r-btn r-btn-small ${activeFormats.alignRight ? 'is-active' : ''}`} style={activeStyle(activeFormats.alignRight)} onClick={() => onCommand('alignRight')} title="יישור לימין"><i className="ph ph-text-align-right"></i></button>
                        <button className={`r-btn r-btn-small ${activeFormats.alignCenter ? 'is-active' : ''}`} style={activeStyle(activeFormats.alignCenter)} onClick={() => onCommand('alignCenter')} title="מרכוז"><i className="ph ph-text-align-center"></i></button>
                        <button className={`r-btn r-btn-small ${activeFormats.alignLeft ? 'is-active' : ''}`} style={activeStyle(activeFormats.alignLeft)} onClick={() => onCommand('alignLeft')} title="יישור לשמאל"><i className="ph ph-text-align-left"></i></button>
                        <button className={`r-btn r-btn-small ${activeFormats.alignJustify ? 'is-active' : ''}`} style={activeStyle(activeFormats.alignJustify)} onClick={() => onCommand('alignJustify')} title="יישור"><i className="ph ph-text-align-justify"></i></button>
                        <div style={{ width: '1px', height: '16px', background: '#E1DFDD', margin: '0 2px' }}></div>
                        <button className={`r-btn r-btn-small ${activeFormats.dir === 'rtl' ? 'is-active' : ''}`} style={activeStyle(activeFormats.dir === 'rtl')} onClick={() => onCommand('setDirRTL')} title="כיוון RTL (עברית)"><span style={{ fontWeight: 'bold', fontSize: '11px' }}>RTL</span></button>
                        <button className={`r-btn r-btn-small ${activeFormats.dir === 'ltr' ? 'is-active' : ''}`} style={activeStyle(activeFormats.dir === 'ltr')} onClick={() => onCommand('setDirLTR')} title="כיוון LTR (אנגלית)"><span style={{ fontWeight: 'bold', fontSize: '11px' }}>LTR</span></button>
                        <div style={{ width: '1px', height: '16px', background: '#E1DFDD', margin: '0 2px' }}></div>
                        <select className="r-select" style={{ width: '50px' }} onChange={(e) => onCommand('lineHeight', e.target.value)} title="ריווח שורות">
                            <option value="1">1.0</option>
                            <option value="1.15">1.15</option>
                            <option value="1.5">1.5</option>
                            <option value="2.0">2.0</option>
                        </select>
                    </div>
                </div>
                <div className="toolbar-group-label">פסקה</div>
            </div>
            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <div className="styles-gallery" style={{ maxWidth: '620px' }}>
                        {[
                          ['academic', 'אקדמי', { fontSize: '13px', fontWeight: '700', color: '#1E3A8A' }],
                          ['legal', 'משפטי', { fontSize: '13px', fontFamily: 'Times New Roman, serif', color: '#111827' }],
                          ['business', 'עסקי', { fontSize: '13px', fontWeight: '700', color: '#0F766E' }],
                          ['presentation', 'מצגת', { fontSize: '15px', fontWeight: '700', color: '#7C3AED' }],
                        ].map(([id, label, sample]) => (
                          <div key={id} className="style-item" style={documentStyle === id ? { background: '#EEF4FF', borderColor: '#93C5FD' } : {}} onClick={() => onCommand('applyDocumentStyle', id)}>
                            <span style={sample}>AaBb</span><span>{label}</span>
                          </div>
                        ))}
                        <div className="style-item" onClick={() => onCommand('paragraph')}><span style={{ fontSize: '13px' }}>AaBb</span><span>רגיל</span></div>
                        <div className="style-item" onClick={() => onCommand('heading', 1)}><span style={{ fontSize: '14px', fontWeight: 'bold', color: '#2B579A' }}>AaBb</span><span>כותרת 1</span></div>
                        <div className="style-item" onClick={() => onCommand('blockquote')}><span style={{ fontSize: '12px', borderRight: '3px solid #2B579A', paddingRight: '4px', color: '#605E5C' }}>AaBb</span><span>ציטוט</span></div>
                    </div>
                </div>
                <div className="toolbar-group-label">סגנונות</div>
            </div>
        </div>

        {/*  */}
        <div id="panel-insert" className={`toolbar-panel ${activeTab === "insert" ? "active" : ""}`}>
            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <button className="r-btn r-btn-large" onClick={(e) => openDrop('coverpage', e)}>
                        <i className="ph-fill ph-file"></i><span>עמוד שער <i className="ph-fill ph-caret-down text-[8px]"></i></span>
                    </button>
                    <div className="btn-column">
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('insertBlankPage')}><i className="ph-fill ph-file-blank"></i> עמוד ריק</button>
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('pageBreak')}><i className="ph-fill ph-file-dashed"></i> מעבר עמוד</button>
                    </div>
                </div>
                <div className="toolbar-group-label">עמודים</div>
            </div>
            
            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <button className="r-btn r-btn-large" onClick={(e) => openDrop('table', e)}>
                        <i className="ph-fill ph-table"></i><span>טבלה <i className="ph-fill ph-caret-down text-[8px]"></i></span>
                    </button>
                </div>
                <div className="toolbar-group-label">טבלאות</div>
            </div>
            
            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <input ref={imgRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
                    <button className="r-btn r-btn-large" onClick={() => imgRef.current?.click()}>
                        <i className="ph-fill ph-image"></i><span>תמונות <i className="ph-fill ph-caret-down text-[8px]"></i></span>
                    </button>
                    <div className="btn-column">
                        <button className="r-btn r-btn-medium" onClick={(e) => openDrop('shapes', e)}><i className="ph-fill ph-shapes"></i> צורות <i className="ph-fill ph-caret-down text-[8px] ml-auto"></i></button>
                        <button className="r-btn r-btn-medium" onClick={(e) => openDrop('symbols', e)}><i className="ph-fill ph-at"></i> סמלים</button>
                        <button className="r-btn r-btn-medium" onClick={(e) => openDrop('screenshot', e)}><i className="ph-fill ph-camera"></i> צילום מסך <i className="ph-fill ph-caret-down text-[8px] ml-auto"></i></button>
                    </div>
                    <div className="btn-column">
                        <button className="r-btn r-btn-medium" onClick={(e) => openDrop('smartart', e)}><i className="ph-fill ph-tree-structure text-green-600"></i> SmartArt</button>
                        <button className="r-btn r-btn-medium" onClick={(e) => openDrop('chart', e)}><i className="ph-fill ph-chart-bar"></i> תרשים</button>
                        <button className="r-btn r-btn-medium" onClick={() => imgRef.current?.click()}><i className="ph-fill ph-cube"></i> מודלים / תמונה</button>
                    </div>
                </div>
                <div className="toolbar-group-label">איורים</div>
            </div>

            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <button className="r-btn r-btn-large" onClick={handleScholar}>
                        <i className="ph-fill ph-graduation-cap text-blue-600"></i><span>{toolLinks.scholar?.label || 'Google Scholar'}</span>
                    </button>
                    <div className="btn-column">
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('openGoogleSearch')}><i className="ph-fill ph-google-logo text-red-500"></i> {toolLinks.googleSearch?.label || 'חיפוש גוגל'}</button>
                        <button className="r-btn r-btn-medium" onClick={handleScholar}><i className="ph-fill ph-globe text-gray-600"></i> {toolLinks.scholar?.label || 'Google Scholar'}</button>
                    </div>
                    <div className="btn-column">
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('openModelHub')}><i className="ph-fill ph-cpu text-indigo-600"></i> {toolLinks.modelHub?.label || 'מודל'}</button>
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('openOrbit')}><i className="ph-fill ph-planet text-sky-600"></i> {toolLinks.orbit?.label || 'Orbit'}</button>
                    </div>
                </div>
                <div className="toolbar-group-label">תוספות</div>
            </div>

            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <button className="r-btn r-btn-large" onClick={handleInsertLink}>
                        <i className="ph-fill ph-link text-gray-500"></i><span>קישור <i className="ph-fill ph-caret-down text-[8px]"></i></span>
                    </button>
                    <div className="btn-column">
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('insertBookmarkDialog')}><i className="ph-fill ph-bookmark-simple"></i> סימניה</button>
                        <button className="r-btn r-btn-medium" onClick={handleInsertLink}><i className="ph-fill ph-arrows-merge"></i> הפניה מקושרת</button>
                    </div>
                </div>
                <div className="toolbar-group-label">קישורים</div>
            </div>

            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <button className="r-btn r-btn-large" onClick={() => onCommand('addComment')}>
                        <i className="ph-fill ph-chat-circle-text text-yellow-500"></i><span>הערה</span>
                    </button>
                    <div className="btn-column">
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('insertDate')}><i className="ph-fill ph-calendar-blank"></i> תאריך ושעה</button>
                    </div>
                </div>
                <div className="toolbar-group-label">הערות</div>
            </div>

            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <div className="btn-column">
                        <button className="r-btn r-btn-medium" onClick={(e) => openDrop('header', e)}><i className="ph-fill ph-browser"></i> כותרת עליונה <i className="ph-fill ph-caret-down text-[8px] ml-auto"></i></button>
                        <button className="r-btn r-btn-medium" onClick={(e) => openDrop('footer', e)}><i className="ph-fill ph-layout"></i> כותרת תחתונה <i className="ph-fill ph-caret-down text-[8px] ml-auto"></i></button>
                        <button className="r-btn r-btn-medium" onClick={(e) => openDrop('pagenum', e)}><i className="ph-fill ph-hash"></i> מספר עמוד <i className="ph-fill ph-caret-down text-[8px] ml-auto"></i></button>
                    </div>
                </div>
                <div className="toolbar-group-label">כותרת עליונה ותחתונה</div>
            </div>
            
            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <button className="r-btn r-btn-large" onClick={(e) => openDrop('textbox', e)}><i className="ph-fill ph-textbox"></i><span>תיבת טקסט <i className="ph-fill ph-caret-down text-[8px]"></i></span></button>
                    <div className="btn-column">
                        <button className="r-btn r-btn-medium" onClick={(e) => openDrop('wordart', e)}><i className="ph-fill ph-text-t"></i> WordArt <i className="ph-fill ph-caret-down text-[8px] ml-auto"></i></button>
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('insertSignature')}><i className="ph-fill ph-signature"></i> שורת חתימה</button>
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('insertDate')}><i className="ph-fill ph-calendar-blank"></i> תאריך ושעה</button>
                    </div>
                </div>
                <div className="toolbar-group-label">טקסט</div>
            </div>
            
            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <div className="btn-column">
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('insertMath')}><i className="ph-fill ph-math-operations"></i> משוואה <i className="ph-fill ph-caret-down text-[8px] ml-auto"></i></button>
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('insertSymbol', '©')}><i className="ph-fill ph-copyright"></i> ©</button>
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('insertSymbol', '₪')}><i className="ph-fill ph-currency-circle-dollar"></i> ₪</button>
                    </div>
                </div>
                <div className="toolbar-group-label">סמלים</div>
            </div>
        </div>

        {/*  */}
        <div id="panel-design" className={`toolbar-panel ${activeTab === "design" ? "active" : ""}`}>
            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <button className="r-btn r-btn-large" onClick={(e) => openDrop('themeColors', e)}><i className="ph-fill ph-swatches text-blue-700"></i><span>ערכות<br />נושא <i className="ph-fill ph-caret-down text-[8px]"></i></span></button>
                    
                    <div className="styles-gallery" style={{ height: '64px', maxWidth: '480px', margin: '0 8px' }}>
                        <div className="style-item" style={{ border: '1px solid #C8C6C4', background: '#F3F2F1' }} onClick={() => onCommand('paragraph')}><span style={{ fontSize: '14px', color: '#323130' }}>כותרת טקסט</span><span style={{ color: '#605E5C' }}>בסיסי</span></div>
                        <div className="style-item" onClick={() => onCommand('heading', 1)}><span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--word-blue)' }}>כותרת טקסט</span><span style={{ color: '#605E5C' }}>כותרת 1</span></div>
                        <div className="style-item" onClick={() => onCommand('heading', 2)}><span style={{ fontSize: '12px', fontWeight: 'bold', color: '#2B579A', borderBottom: '1px solid #2B579A' }}>כותרת טקסט</span><span style={{ color: '#605E5C' }}>כותרת 2</span></div>
                        <div className="style-item" onClick={() => onCommand('heading', 3)}><span style={{ fontSize: '12px', fontWeight: 'bold', color: '#404040' }}>כותרת טקסט</span><span style={{ color: '#605E5C' }}>כותרת 3</span></div>
                        <div className="style-item" onClick={() => onCommand('blockquote')}><span style={{ fontSize: '12px', fontStyle: 'italic', color: '#605E5C', borderRight: '3px solid #2B579A', paddingRight: '3px' }}>ציטוט</span><span style={{ color: '#605E5C' }}>ציטוט</span></div>
                    </div>

                    <div className="btn-column justify-center gap-1">
                        <button className="r-btn r-btn-medium" onClick={(e) => openDrop('themeColors', e)}><i className="ph-fill ph-palette text-blue-600"></i> צבעים <i className="ph-fill ph-caret-down text-[8px] ml-auto"></i></button>
                        <button className="r-btn r-btn-medium" onClick={(e) => openDrop('themeFonts', e)}><i className="ph-fill ph-text-a-underline text-blue-600"></i> גופנים <i className="ph-fill ph-caret-down text-[8px] ml-auto"></i></button>
                    </div>

                    <div className="btn-column justify-center gap-1 ml-2 pl-2 border-l border-gray-200">
                        <button className="r-btn r-btn-medium" onClick={(e) => openDrop('paragraphSpacing', e)}><i className="ph-fill ph-list-dashes text-gray-600"></i> מרווח בין פסקאות <i className="ph-fill ph-caret-down text-[8px] ml-auto"></i></button>
                        <button className="r-btn r-btn-medium" onClick={(e) => openDrop('textEffects', e)}><i className="ph-fill ph-intersect text-gray-500"></i> אפקטים <i className="ph-fill ph-caret-down text-[8px] ml-auto"></i></button>
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('saveDefaultTypography')}><i className="ph-fill ph-check-circle text-green-600"></i> קבע כברירת מחדל</button>
                    </div>
                </div>
                <div className="toolbar-group-label">עיצוב מסמכים</div>
            </div>
            
            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <button className="r-btn r-btn-large" onClick={() => onCommand('toggleWatermark')}><i className="ph-fill ph-text-a-underline text-red-400"></i><span>סימן<br />מים <i className="ph-fill ph-caret-down text-[8px]"></i></span></button>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px' }} className="r-btn r-btn-large">
                        <input type="color" onChange={(e) => onCommand('setPageColor', e.target.value)} defaultValue="#ffffff" style={{ cursor: 'pointer', marginBottom: '2px', width: '20px', height: '16px', padding: '0', border: '1px solid #ccc' }} />
                        <span style={{ fontSize: '11px', color: 'var(--text-color)', marginTop: '2px' }}>צבע<br />עמוד <i className="ph-fill ph-caret-down text-[8px]"></i></span>
                    </div>
                    <button className="r-btn r-btn-large" onClick={() => onCommand('togglePageBorders')}><i className="ph-fill ph-square text-orange-500"></i><span>גבולות<br />עמוד</span></button>
                </div>
                <div className="toolbar-group-label">רקע עמוד</div>
            </div>
        </div>

        {/*  */}
        <div id="panel-layout" className={`toolbar-panel ${activeTab === "layout" ? "active" : ""}`}>
            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <button className="r-btn r-btn-large" onClick={(e) => openDrop('margins', e)}><i className="ph-fill ph-arrows-in-line-vertical"></i><span>שוליים</span></button>
                    <button className="r-btn r-btn-large" onClick={(e) => openDrop('orientation', e)}><i className="ph-fill ph-rectangle"></i><span>כיוון</span></button>
                    <button className="r-btn r-btn-large" onClick={(e) => openDrop('pagesize', e)}><i className="ph-fill ph-file"></i><span>גודל</span></button>
                    <button className="r-btn r-btn-large" onClick={(e) => openDrop('columns', e)}><i className="ph-fill ph-columns"></i><span>טורים</span></button>
                </div>
                <div className="toolbar-group-label">הגדרת עמוד</div>
            </div>
            <div className="toolbar-group">
                <div className="toolbar-group-items flex gap-2">
                    <div className="input-group">
                        <span style={{ fontWeight: '600', marginBottom: '2px' }}>כניסה</span>
                        <div className="input-row">לפני: <input type="number" defaultValue="0" onBlur={(e) => onCommand('setMarginBefore', e.target.value)} /> ס"מ</div>
                        <div className="input-row">אחרי: <input type="number" defaultValue="0" onBlur={(e) => onCommand('setMarginAfter', e.target.value)} /> ס"מ</div>
                    </div>
                    <div style={{ width: '1px', height: '40px', background: '#E1DFDD', margin: '0 4px' }}></div>
                    <div className="input-group">
                        <span style={{ fontWeight: '600', marginBottom: '2px' }}>מרווח</span>
                        <div className="input-row">לפני: <input type="number" defaultValue="0" onBlur={(e) => onCommand('setSpacingBefore', e.target.value)} /> נק'</div>
                        <div className="input-row">אחרי: <input type="number" defaultValue="8" onBlur={(e) => onCommand('setSpacingAfter', e.target.value)} /> נק'</div>
                    </div>
                </div>
                <div className="toolbar-group-label">פסקה</div>
            </div>
        </div>

        {/*  */}
        <div id="panel-references" className={`toolbar-panel ${activeTab === "references" ? "active" : ""}`}>
            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <button className="r-btn r-btn-large" onClick={() => onCommand('generateTOC')}><i className="ph-fill ph-list-dashes"></i><span>תוכן עניינים <i className="ph-fill ph-caret-down text-[8px]"></i></span></button>
                    <div className="btn-column">
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('heading', 2)}><i className="ph-fill ph-plus"></i> הוסף כותרת</button>
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('generateTOC')}><i className="ph-fill ph-arrows-clockwise"></i> עדכן תוכן עניינים</button>
                    </div>
                </div>
                <div className="toolbar-group-label">תוכן עניינים</div>
            </div>
            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <button className="r-btn r-btn-large" onClick={() => onCommand('insertFootnote')}><i className="ph-fill ph-text-superscript"></i><span>הוסף הערת<br />שוליים</span></button>
                </div>
                <div className="toolbar-group-label">הערות שוליים</div>
            </div>
            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <button className="r-btn r-btn-large" onClick={() => onCommand('insertCitation')}><i className="ph-fill ph-quotes"></i><span>הוסף ציטוט <i className="ph-fill ph-caret-down text-[8px]"></i></span></button>
                    <div className="btn-column">
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('manageSources')}><i className="ph-fill ph-books"></i> נהל מקורות</button>
                        <div className="flex items-center gap-1 text-[11px] px-2">סגנון: <select className="r-select w-16" onChange={(e) => onCommand('setCitationStyle', e.target.value)}><option value="APA">APA</option><option value="MLA">MLA</option><option value="Chicago">Chicago</option></select></div>
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('insertBibliography')}><i className="ph-fill ph-book-bookmark"></i> ביבליוגרפיה</button>
                    </div>
                </div>
                <div className="toolbar-group-label">ציטוטים וביבליוגרפיה</div>
            </div>
        </div>

        {/*  */}
        <div id="panel-review" className={`toolbar-panel ${activeTab === "review" ? "active" : ""}`}>
            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <button className="r-btn r-btn-large" onClick={() => onCommand('aiSpellCheck')}><i className="ph-fill ph-check-circle text-blue-600"></i><span>בדיקת<br />איות AI</span></button>
                    <div className="btn-column">
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('wordCount')}><i className="ph-fill ph-text-t"></i> ספירת מילים</button>
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('charCount')}><i className="ph-fill ph-hash"></i> ספירת תווים</button>
                    </div>
                </div>
                <div className="toolbar-group-label">הגהה</div>
            </div>
            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <button className="r-btn r-btn-large" onClick={() => onCommand('addComment')}><i className="ph-fill ph-chat-circle-text text-yellow-500"></i><span>הערה חדשה</span></button>
                    <div className="btn-column">
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('removeComment')}><i className="ph-fill ph-trash text-red-500"></i> מחק הערה</button>
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('toggleComments')}><i className="ph-fill ph-chats"></i> הצג הערות</button>
                    </div>
                </div>
                <div className="toolbar-group-label">הערות</div>
            </div>
            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <button className="r-btn r-btn-large" style={{ backgroundColor: '#E1DFDD' }} onClick={() => onCommand('toggleTracking')}><i className="ph-fill ph-pencil-simple-line text-blue-600"></i><span>עקוב אחר<br />שינויים <i className="ph-fill ph-caret-down text-[8px]"></i></span></button>
                    <div className="btn-column">
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('acceptAllChanges')}><i className="ph-fill ph-check text-green-500"></i> קבל</button>
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('rejectAllChanges')}><i className="ph-fill ph-x text-red-500"></i> דחה</button>
                    </div>
                </div>
                <div className="toolbar-group-label">מעקב ושינויים</div>
            </div>
            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <button className="r-btn r-btn-large" onClick={() => onCommand('exportHTML')}><i className="ph-fill ph-file-html text-orange-600"></i><span>ייצוא<br />HTML</span></button>
                    <div className="btn-column">
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('exportText')}><i className="ph-fill ph-file-text"></i> ייצוא טקסט</button>
                        <button className="r-btn r-btn-medium" onClick={() => window.print()}><i className="ph-fill ph-printer"></i> הדפסה</button>
                    </div>
                </div>
                <div className="toolbar-group-label">שמירה וייצוא</div>
            </div>
        </div>

        {/*  */}
        <div id="panel-view" className={`toolbar-panel ${activeTab === "view" ? "active" : ""}`}>
            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <div className="btn-column">
                        <button className="r-btn r-btn-medium" style={{ backgroundColor: '#E1DFDD' }} onClick={() => onCommand('setViewMode', 'print')}><i className="ph-fill ph-file-text"></i> פריסת הדפסה</button>
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('setViewMode', 'read')}><i className="ph-fill ph-book-open"></i> מצב קריאה</button>
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('setViewMode', 'web')}><i className="ph-fill ph-globe"></i> פריסת אינטרנט</button>
                    </div>
                    <div className="btn-column">
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('setViewMode', 'outline')}><i className="ph-fill ph-list"></i> מתאר</button>
                        <button className="r-btn r-btn-medium" onClick={() => onCommand('setViewMode', 'draft')}><i className="ph-fill ph-file-dashed"></i> טיוטה</button>
                    </div>
                    <button className="r-btn r-btn-large" onClick={() => onCommand('focusMode')}><i className="ph-fill ph-scan"></i><span>מיקוד</span></button>
                </div>
                <div className="toolbar-group-label">תצוגות</div>
            </div>

            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <div className="checkbox-group">
                        <label className="checkbox-row"><input type="checkbox" onChange={(e) => onCommand('toggleRuler', e.target.checked)} /> סרגל</label>
                        <label className="checkbox-row"><input type="checkbox" onChange={(e) => onCommand('toggleGrid', e.target.checked)} /> קווי רשת</label>
                        <label className="checkbox-row"><input type="checkbox" checked={assistantOpen} onChange={() => onToggleTaskpane()} /> AI Assistant</label>
                    </div>
                </div>
                <div className="toolbar-group-label">הצגה</div>
            </div>

            <div className="toolbar-group">
                <div className="toolbar-group-items flex-col gap-1">
                    <div className="flex items-center gap-1">
                        <button className="r-btn r-btn-small" onClick={() => handleZoom(Math.max(25, zoom - 10))}><i className="ph ph-minus"></i></button>
                        <input type="range" min="25" max="200" step="5" value={zoom}
                            onChange={(e) => handleZoom(Number(e.target.value))}
                            style={{ width: '80px', accentColor: 'var(--word-blue)' }} />
                        <button className="r-btn r-btn-small" onClick={() => handleZoom(Math.min(200, zoom + 10))}><i className="ph ph-plus"></i></button>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--word-blue)', minWidth: '32px' }}>{zoom}%</span>
                    </div>
                    <div className="flex gap-1">
                        {[50, 75, 100, 125, 150].map(z => (
                            <button key={z} className="r-btn r-btn-small"
                                style={{ fontSize: '10px', padding: '1px 4px', background: zoom === z ? '#E1DFDD' : 'transparent', border: zoom === z ? '1px solid #C8C6C4' : '1px solid transparent' }}
                                onClick={() => handleZoom(z)}>{z}%</button>
                        ))}
                    </div>
                </div>
                <div className="toolbar-group-label">שינוי גודל תצוגה</div>
            </div>

            <div className="toolbar-group">
                <div className="toolbar-group-items">
                    <button className="r-btn r-btn-large" onClick={() => window.open(window.location.href, '_blank')}><i className="ph-fill ph-plus-square"></i><span>חלון<br />חדש</span></button>
                    <button className="r-btn r-btn-large" onClick={() => onCommand('splitWindow')}><i className="ph-fill ph-split-horizontal"></i><span>פצל</span></button>
                </div>
                <div className="toolbar-group-label">חלון</div>
            </div>
        </div>

    </nav>
  );
}
