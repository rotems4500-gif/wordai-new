// addinAgents — תת-הקבוצה של סוכני האפליקציה שזמינה בתוסף ה-Word (v1).
// הקונפיג עצמו מגיע מ-agentConfig.js — אפס כפילות. סוכן עם taskpaneSkipApply
// מחזיר אבחון לצ'אט ולא כותב למסמך (למשל fix במצב GAP REVIEWER).

import { AGENTS_CONFIG } from '../agentConfig';

const ADDIN_AGENT_IDS = ['fix', 'humanize', 'academic', 'summary', 'continue', 'sources'];

// סוכנים שהפלט שלהם לעולם לא מוחל אוטומטית על המסמך (anti-hallucination:
// מקורות נשארים בצ'אט לבדיקת המשתמש).
const CHAT_ONLY_AGENT_IDS = new Set(['sources']);

export const getAddinAgents = () => ADDIN_AGENT_IDS
  .filter((id) => AGENTS_CONFIG[id])
  .map((id) => {
    const conf = AGENTS_CONFIG[id];
    const skipApply = conf.taskpaneSkipApply === true || CHAT_ONLY_AGENT_IDS.has(id);
    return {
      id,
      label: conf.label,
      placeholder: conf.placeholder || '',
      // בתוסף מעדיפים את הפרסונה הייעודית ל-taskpane כשקיימת
      systemCtx: conf.taskpaneSystemCtx || conf.systemCtx || '',
      inline: conf.inline === true && !skipApply,
      skipApply,
    };
  });

export const getAddinAgent = (agentId) => getAddinAgents().find((agent) => agent.id === agentId) || null;
