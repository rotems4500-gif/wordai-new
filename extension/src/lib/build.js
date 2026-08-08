// מונה build של התוסף — עולה ב-1 בכל מסירה, גם כשגרסת המניפסט לא זזה.
// מוצג בתחתית ה-popup ונרשם ללוג של ה-service worker, כדי שאפשר יהיה לדעת
// אחרי reload ב-chrome://extensions אם מה שנטען הוא באמת הקוד החדש.
export const CLIPPER_BUILD = 1;

export const CLIPPER_BUILD_LABEL = `b${CLIPPER_BUILD}`;
