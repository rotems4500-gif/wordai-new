// AddinApp — מעטפת ה-taskpane: header, מצב מארח, סיידבר צ'אט והגדרות.
import React, { useEffect, useState } from 'react';
import '../../tailwind.css';
import AddinSidebar from './AddinSidebar';

export default function AddinApp({ officeHost = 'none' }) {
  const isWordHost = officeHost === 'word';

  return (
    <div dir="rtl" className="flex h-[100dvh] w-full flex-col bg-gray-50 text-gray-900" style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}>
      <header className="flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          <img src="/addin/icon-32.png" alt="" className="h-6 w-6 rounded" />
          <span className="text-sm font-bold">WordFlow AI</span>
        </div>
        {!isWordHost && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            מצב דפדפן — אין חיבור ל-Word
          </span>
        )}
      </header>
      <div className="min-h-0 flex-1">
        <AddinSidebar isWordHost={isWordHost} />
      </div>
    </div>
  );
}
