const fs = require('fs');
let content = fs.readFileSync('src/FileMenu.jsx', 'utf8');

const splitPoint = "      ],\n    },\n  ];";
const additionalQuestions = `
    {
      id: 'vocabulary',
      title: 'באיזה סגנון של מילות קישור כדאי להשתמש?',
      options: [
        { id: 'formal_connectors', label: 'אפשרות א', text: 'לאור זאת אישרנו את הפרויקט, לפיכך נתחיל מחר.', insight: 'מעדיף מילות קישור רשמיות ומדויקות ("לאור זאת", "לפיכך").', avoid: 'מילות קישור יומיומיות ושפת רחוב' },
        { id: 'casual_connectors', label: 'אפשרות ב', text: 'אז אישרנו את הפרויקט, ובגלל זה נתחיל כבר מחר.', insight: 'מעדיף מילות קישור קלילות וטבעיות ("אז", "בגלל ש").', avoid: 'עודף מילות קישור כבדות ומשפטיות' },
      ],
    },
    {
      id: 'emotion',
      title: 'עד כמה אתה רוצה שהטקסט יביע רגש והתלהבות?',
      options: [
        { id: 'objective', label: 'אפשרות א', text: 'התוצאות מצביעות על עלייה של 20% בביצועים ברבעון האחרון.', insight: 'מעדיף כתיבה עניינית, יבשה ואובייקטיבית.', avoid: 'ביטויים רגשיים, סימני קריאה והתלהבות יתר' },
        { id: 'enthusiastic', label: 'אפשרות ב', text: 'הגענו לתוצאות מדהימות! הגדלנו הכנסות ב-20% ברבעון האחרון.', insight: 'מעדיף שפה נלהבת, חיובית ואנרגטית.', avoid: 'טקסט יבש, מרוחק ומשעמם' },
      ],
    },
    {
      id: 'voice',
      title: 'משפטים בגוף ראשון או שפה עקיפה?',
      options: [
        { id: 'passive', label: 'אפשרות א', text: 'המסמך קריטי מאוד ולכן מומלץ לעבור עליו לעומק.', insight: 'מעדיף שפה עקיפה / סבילה (Passive) וריחוק מסוים.', avoid: 'מעורבות אישית מדי ("אני כותב", "לדעתי")' },
        { id: 'active', label: 'אפשרות ב', text: 'חשוב לי שתעברו על המסמך לעומק כי זה קריטי.', insight: 'מעדיף שפה חיה, ישירה ולספר בגוף ראשון ("אנחנו", "אני").', avoid: 'משפטים עקיפים וכבדים (Passive)' },
      ],
    },`;

content = content.replace(splitPoint, additionalQuestions + '\n' + splitPoint);
fs.writeFileSync('src/FileMenu.jsx', content);
console.log('Patched FileMenu.jsx successfully via splitPoint');
