// ═══════════════════════════════════════════════════════════════
// themes/index.js — צובר את כל משפחות ה-themes.
// FAMILIES = [core, ...families]. deckThemes.js משטח (flat) ומנרמל.
// ═══════════════════════════════════════════════════════════════
import core from './core.js';
import darklux from './family-darklux.js';
import light from './family-light.js';
import tech from './family-tech.js';
import brutal from './family-brutal.js';
import retro from './family-retro.js';
import cyber from './family-cyber.js';
import organic from './family-organic.js';

// core תמיד ראשון — קובע את סדר ברירת המחדל וה-6 המקוריים.
export const FAMILIES = [core, darklux, light, tech, brutal, retro, cyber, organic];

// סדר תצוגה של קבוצות ה-family ב-picker (id של family).
export const FAMILY_ORDER = [
  // ה-6 המקוריים מקובצים תחת 'קלאסי' ב-picker; ה-family id שלהם נשמר לתיוג.
  'tech-corporate',
  'tech-gradient',
  'warm-editorial',
  'light-editorial',
  'print-editorial',
  'neon-pop',
  // משפחות עתידיות
  'dark-lux',
  'light-swiss',
  'glassmorphism',
  'brutalist',
  'neo-memphis',
  'cyber',
  'code',
  'organic-warm',
  'soft-pastel',
  'monochrome',
  'corporate-clean',
  'art-deco',
];

// תוויות עברית ל-picker — מפה שטוחה id→label, מכסה כל family id בשימוש
// (כולל אלה שהסטאבים ישתמשו בהם בהמשך).
export const FAMILY_LABELS = {
  // 6 המקוריים
  'tech-corporate': 'טכנולוגי',
  'tech-gradient': 'גרדיאנט',
  'warm-editorial': 'קולנועי חם',
  'light-editorial': 'אקדמי בהיר',
  'print-editorial': 'מגזין',
  'neon-pop': 'ניאון',
  // משפחות עתידיות
  'dark-lux': 'יוקרה כהה',
  'light-swiss': 'שוויצרי',
  'glassmorphism': 'זכוכית',
  'brutalist': 'ברוטליסטי',
  'neo-memphis': 'ממפיס',
  'cyber': 'סייבר',
  'code': 'קוד',
  'organic-warm': 'אורגני',
  'soft-pastel': 'פסטל',
  'monochrome': 'מונוכרום',
  'corporate-clean': 'קורפורטיבי',
  'art-deco': 'ארט דקו',
};
