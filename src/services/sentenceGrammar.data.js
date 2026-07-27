// sentenceGrammar.data.js — מסגרות משפט לפי מהלך רטורי. Seed v1 (ידני).
// יורחב ע"י tools/sentence-grammar-build (Flash) — אבל ה-seed הוא הקאנון:
// כל frame כאן נבדק ידנית לתקינות דקדוקית.
//
// עקרון בטיחות מגדרית: כמעט כל המסגרות הן פסוקיות ("... כי <פסוקית>") או
// אימפרסונליות ("על פי <מקור>, ...") — אף מילה במסגרת לא צריכה להסכים במין/מספר
// עם התוכן. מסגרות שדורשות הסכמה מסומנות needsAgreement והשירות מדלג עליהן
// אלא אם קיבל {g,n} מפורשים.
//
// אסימוני מסגרת:
//   מחרוזת            — טקסט מילולי (הקאנון; רווחים מנוהלים ע"י השירות)
//   "@clause"          — פסוקית תוכן (בלי "ש" מובילה — המסגרת מספקת את המשלים)
//   "@topic"           — צירוף שמני של הנושא
//   "@author"          — שם המקור (למשל "כהן ולוי")
//   "@cite"            — סימון מראה-מקום "(כהן, 2019, עמ' 12)"
//   "@quote"           — ציטוט מילולי במרכאות
//   {"slot":"connector"} — קישור אופציונלי ממאגר openerGrammar.shared
//
// מהלכים: claim, evidence, quoteIntro, explain, contrast, concede, transition, wrap.

// v2 (יולי 2026) — נמדד מול קורפוס הכתיבה של המשתמש דרך styleFingerprintService:
//   «כי »  z+5.94   — המנוע מפוצץ ב"כי"
//   @subordination z−5.19 — הרבה פחות משפטים מורכבים מהמשתמש
// הסיבה נספרה בקוד: 19 מ-40 המסגרות הכילו "כי", וב-claim/evidence/concede זה היה
// 6/7, 5/7 ו-4/4 — כלומר למנוע לא הייתה ברירה. ובמקביל **אף מסגרת** לא נשאה
// אשר/כאשר/למרות-ש/מכיוון-ש, ולכן המסגרות תרמו אפס שעבוד.
// v2 מוסיפה חלופות שפותרות את שניהם יחד: משלים ב-ש- במקום ב-כי, ומילות שעבוד
// אמיתיות. ⚠️ המסגרות הישנות נשמרות — היעד הוא התפלגות, לא איסור.
export const SENTENCE_GRAMMAR_VERSION = 2;

export const SENTENCE_GRAMMAR = {
  moves: {
    claim: {
      frames: [
        { id: 'claim_can', t: [{ slot: 'connector', opt: true }, 'ניתן לטעון כי', '@clause', '.'], reg: 2 },
        { id: 'claim_seems', t: ['נראה כי', '@clause', '.'], reg: 2 },
        { id: 'claim_evident', t: ['מן הדברים עולה כי', '@clause', '.'], reg: 2 },
        { id: 'claim_central', t: ['נקודה מרכזית בהקשר זה היא ש', '@clause', '.'], reg: 2, cliticJoin: true },
        { id: 'claim_argue', t: ['טענה מרכזית העולה מן החומר היא כי', '@clause', '.'], reg: 2 },
        { id: 'claim_topic', t: ['בכל הנוגע ל', '@topic', ', ניתן לומר כי', '@clause', '.'], reg: 2, cliticJoin: true },
        // ⚠️ עד 27.7 זו הייתה **מסגרת הנושא היחידה** מתוך עשר, ולכן במטלת יישום
        // (שבה הנושא הוא שם הצד מהשאלה) הסיכוי לנקוב בשמו היה ~10%. נמדד:
        // 1/10 ישויות מהשאלה בכל העבודה. שלוש נוספות כדי ששישה סעיפים לא ייפתחו
        // באותה מסגרת — התנגשות שובך-יונים כבר הפילה את CASE_FRAMES פעם אחת.
        // כולן **בטוחות-מגדר**: "אשר לדליה" ו"אשר ליקיר" תקינות באותה מידה.
        { id: 'claim_asFor', t: ['אשר ל', '@topic', ',', '@clause', '.'], reg: 2, cliticJoin: true },
        { id: 'claim_inCaseOf', t: ['במקרה של', '@topic', ',', '@clause', '.'], reg: 2 },
        { id: 'claim_regarding', t: ['ביחס ל', '@topic', ', נראה כי', '@clause', '.'], reg: 2, cliticJoin: true },
        { id: 'claim_important', t: ['חשוב להדגיש כי', '@clause', '.'], reg: 2 },
        // v2 — בלי "כי", עם שעבוד
        { id: 'claim_pointTo', t: ['ניתן להצביע על כך ש', '@clause', '.'], reg: 2, cliticJoin: true },
        { id: 'claim_finding', t: ['הממצא אשר עולה מן החומר הוא ש', '@clause', '.'], reg: 2, cliticJoin: true },
        { id: 'claim_whenExamined', t: ['כאשר בוחנים את הסוגיה מתברר ש', '@clause', '.'], reg: 2, cliticJoin: true },
      ],
    },
    evidence: {
      frames: [
        { id: 'ev_perSource', t: ['על פי', '@author', ',', '@clause', '@cite', '.'], reg: 2 },
        { id: 'ev_atSource', t: ['במחקר של', '@author', 'נטען כי', '@clause', '@cite', '.'], reg: 2 },
        { id: 'ev_emerges', t: ['מן החומר עולה כי', '@clause', '@cite', '.'], reg: 2 },
        { id: 'ev_described', t: ['בספרות מתואר כי', '@clause', '@cite', '.'], reg: 2 },
        { id: 'ev_accord', t: ['בהתאם לדברים המובאים אצל', '@author', ',', '@clause', '@cite', '.'], reg: 2 },
        { id: 'ev_pointed', t: ['עוד צוין כי', '@clause', '@cite', '.'], reg: 2 },
        { id: 'ev_source_shows', t: ['החומר שנסקר מלמד כי', '@clause', '@cite', '.'], reg: 2 },
        // v2 — בלי "כי", עם שעבוד
        { id: 'ev_whichShows', t: ['החומר אשר נסקר מראה ש', '@clause', '@cite', '.'], reg: 2, cliticJoin: true },
        { id: 'ev_asEmerges', t: ['כפי שעולה מן המקורות, מתברר ש', '@clause', '@cite', '.'], reg: 2, cliticJoin: true },
        // ⚠️ הגרסה הראשונה הייתה ['אצל', '@author', 'מצוין ש', ...] — **שני** גבולות
        // הדבקה במסגרת אחת, ו-cliticJoin הדביק את הראשון: "אצלתקציר שיעור…".
        // מסגרת עם cliticJoin חייבת גבול הדבקה יחיד, בסופה.
        { id: 'ev_authorNotes', t: ['במקור צוין ש', '@clause', '@cite', '.'], reg: 2, cliticJoin: true },
        // ---- קשירת הצד שבשאלה ----
        // ⚠️ מהלך ה-claim הוא **מותנה** — הוא מדלג על עצמו כשאין משפט ראיה הנוגע
        // במונחי הסעיף, כלומר דווקא בסעיפים החלשים. לכן קשירת הצד רק שם השאירה
        // את הישויות על 11%. evidence רץ תמיד, ולכן הקשירה חייבת להיות גם כאן.
        // בטוחות-מגדר: "אשר לדליה" ו"אשר ליקיר" תקינות באותה מידה.
        // ⚠️ **"מסגרות מדללות" — נוסו ונפסלו (27.7). אין לחזור.**
        // הרעיון היה נכון מכנית: `copiedWordShare` הוא יחס של מילות-תוכן שמופיעות
        // במקור, ומילות מסגרת אינן נספרות כפיגום (`scaffoldWordShare` סופר רק
        // משפטים בלי ראיה כלל) — ולכן מסגרת בת 7-9 מילים במקום 3-4 מדללת את
        // ההעתקה "בחינם". נוספו ארבע: «מן החומר שנסקר לצורך הדיון עולה כי» ·
        // «הספרות שנסקרה בסוגיה זו מלמדת כי» · «העמדה המובאת במקורות שנבחנו היא
        // כי» · «כפי שמנוסח הדבר במקור שנבחן לעיל».
        //
        // נמדד: **בנצ' 93→98, וציון הסגנון 41→20.**
        //
        // כלומר 5 נקודות בנצ' תמורת 21 נקודות סגנון. וגם הרווח עצמו מדומה:
        // ההעתקה של sec_4 ירדה 0.86→**0.85** בלבד, כלומר עברה את השער (>0.85)
        // על הגבול המדויק; הקפיצה בציון כולה מהיפוך אינווריאנטות (60% מהמשקל),
        // לא מפתרון ההעתקה. «כפי שמנוסח הדבר במקור» הופיע ארבע פעמים בעבודה אחת.
        //
        // המסקנה: **את copy-budget אי אפשר לקנות במסגור.** הורדת העתקה אמיתית
        // דורשת פרפרזה, כלומר מודל — וזה נמדד: מסלול הניסוח מגיע ל-0.29-0.38
        // מול 0.65-0.68 של מסלול הכללים.
        { id: 'ev_forParty', t: ['אשר ל', '@topic', ', מן החומר עולה כי', '@clause', '@cite', '.'], reg: 2, cliticJoin: true },
        { id: 'ev_inCaseOf', t: ['במקרה של', '@topic', ',', '@clause', '@cite', '.'], reg: 2 },
        { id: 'ev_onMatterOf', t: ['בעניין', '@topic', 'נמצא כי', '@clause', '@cite', '.'], reg: 2 },
      ],
    },
    quoteIntro: {
      frames: [
        { id: 'q_asWritten', t: ['כפי שנכתב אצל', '@author', ':', '@quote', '@cite', '.'], reg: 2 },
        { id: 'q_inWords', t: ['הדברים מנוסחים אצל', '@author', 'כך:', '@quote', '@cite', '.'], reg: 2 },
        { id: 'q_direct', t: ['וכך נאמר שם:', '@quote', '@cite', '.'], reg: 2 },
        // v2 — ציטוט בלי @author. נדרש כשהמקור אינו נושא שם מחבר (סיכום שיעור,
        // מצגת): שתי המסגרות הראשונות משתלות שם-קובץ בתוך המשפט, ו-q_direct
        // מותרת רק כשהמקור זהה לקודם — בלי חלופה כזו הסעיף נותר בלי מסגרת כלל.
        { id: 'q_source', t: ['במקור נכתב:', '@quote', '@cite', '.'], reg: 2 },
        { id: 'q_stated', t: ['בחומר שנסקר מובא:', '@quote', '@cite', '.'], reg: 2 },
      ],
    },
    explain: {
      frames: [
        { id: 'ex_meaning', t: ['משמעות הדברים היא ש', '@clause', '.'], reg: 2, cliticJoin: true },
        { id: 'ex_thatIs', t: ['כלומר,', '@clause', '.'], reg: 2 },
        { id: 'ex_learn', t: ['הדבר מלמד כי', '@clause', '.'], reg: 2 },
        { id: 'ex_understand', t: ['ניתן להבין מכך ש', '@clause', '.'], reg: 2, cliticJoin: true },
        { id: 'ex_practical', t: ['במילים אחרות,', '@clause', '.'], reg: 2 },
        { id: 'ex_implication', t: ['מכאן נובע כי', '@clause', '.'], reg: 2 },
        { id: 'ex_derives', t: ['מכאן ש', '@clause', '.'], reg: 2, cliticJoin: true },
      ],
    },
    contrast: {
      frames: [
        { id: 'ct_however', t: ['עם זאת,', '@clause', '.'], reg: 2 },
        { id: 'ct_opposed', t: ['לעומת זאת,', '@clause', '.'], reg: 2 },
        { id: 'ct_counter', t: ['מנגד,', '@clause', '.'], reg: 2 },
        { id: 'ct_although', t: ['אף על פי כן,', '@clause', '.'], reg: 2 },
        { id: 'ct_otherHand', t: ['מן העבר השני,', '@clause', '.'], reg: 2 },
      ],
    },
    concede: {
      frames: [
        { id: 'cc_qualify', t: ['יש לסייג ולומר כי', '@clause', '.'], reg: 2 },
        { id: 'cc_remember', t: ['עם זאת, ראוי לזכור כי', '@clause', '.'], reg: 2 },
        { id: 'cc_note', t: ['בהקשר זה יש לציין כי', '@clause', '.'], reg: 2 },
        { id: 'cc_limit', t: ['חשוב לציין כי', '@clause', '.'], reg: 2 },
        // v2 — המהלך הזה היה 4/4 עם "כי". בלי חלופה, כל הסתייגות נשאה אותו.
        { id: 'cc_despite', t: ['למרות האמור, ראוי לציין ש', '@clause', '.'], reg: 2, cliticJoin: true },
        { id: 'cc_qualifyThat', t: ['יש לסייג ולומר ש', '@clause', '.'], reg: 2, cliticJoin: true },
      ],
    },
    transition: {
      frames: [
        { id: 'tr_next', t: ['על רקע זאת, יש לבחון את', '@topic', '.'], reg: 2 },
        { id: 'tr_further', t: ['נקודה נוספת הראויה לדיון היא', '@topic', '.'], reg: 2 },
        { id: 'tr_moveTo', t: ['מכאן נעבור לעסוק ב', '@topic', '.'], reg: 2, cliticJoin: true },
        { id: 'tr_related', t: ['היבט קשור לכך נוגע ל', '@topic', '.'], reg: 2, cliticJoin: true },
      ],
    },
    wrap: {
      frames: [
        { id: 'wr_above', t: ['מן האמור לעיל עולה כי', '@clause', '.'], reg: 2 },
        { id: 'wr_partSum', t: ['בסיכומו של חלק זה ניתן לומר כי', '@clause', '.'], reg: 2 },
        { id: 'wr_overall', t: ['בראייה כוללת,', '@clause', '.'], reg: 2 },
        { id: 'wr_therefore', t: ['לפיכך,', '@clause', '.'], reg: 2 },
        { id: 'wr_whichEmerges', t: ['התמונה אשר עולה מן הדברים היא ש', '@clause', '.'], reg: 2, cliticJoin: true },
      ],
    },
  },
};
