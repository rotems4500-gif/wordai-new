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

export const SENTENCE_GRAMMAR_VERSION = 1;

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
        { id: 'claim_important', t: ['חשוב להדגיש כי', '@clause', '.'], reg: 2 },
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
      ],
    },
    quoteIntro: {
      frames: [
        { id: 'q_asWritten', t: ['כפי שנכתב אצל', '@author', ':', '@quote', '@cite', '.'], reg: 2 },
        { id: 'q_inWords', t: ['הדברים מנוסחים אצל', '@author', 'כך:', '@quote', '@cite', '.'], reg: 2 },
        { id: 'q_direct', t: ['וכך נאמר שם:', '@quote', '@cite', '.'], reg: 2 },
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
      ],
    },
  },
};
