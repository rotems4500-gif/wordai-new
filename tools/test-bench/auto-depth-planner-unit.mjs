// auto-depth-planner-unit.mjs — בדיקת יחידה למתכנן הדטרמיניסטי של מצב "אוטומטי".
// **אפס קריאות API ואפס I/O** — planAutoDepth הוא פונקציה טהורה על קוד האפליקציה האמיתי.
//
// הרצה: node tools/test-bench/run-auto-depth-planner-unit.mjs
// (בונה bundle דרך vite.verify.config.mjs עם WORDAI_VERIFY_ENTRY=autodepth)

globalThis.window = globalThis;
globalThis.self = globalThis;

let netCalls = 0;
{
  const real = globalThis.fetch;
  globalThis.fetch = async (...args) => { netCalls += 1; return real(...args); };
}

const { planAutoDepth, selectRelevantExcerpts } = await import('autodepth');
const { getModelContextWindow, estimateTokenCount, estimateContextBudget } = await import('modelcaps');
const { extractContextMatchTerms } = await import('lexrel');

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
};

const HEB_PARA = 'השפעת הרפורמה המשפטית על עצמאות מערכת המשפט בישראל היא סוגיה מרכזית בשיח הציבורי והאקדמי. ';
const longMaterial = (id, repeats) => ({
  id,
  title: `מקור ${id}`,
  label: 'חומר קורס',
  text: HEB_PARA.repeat(repeats),
});

console.log('— modelCapabilities —');
check('gemini window 1M', getModelContextWindow('gemini-2.5-pro', 'gemini') === 1_000_000);
check('claude window 200k', getModelContextWindow('claude-opus-4-7', 'claude') === 200_000);
check('gpt-4o window 128k', getModelContextWindow('gpt-4o', 'openai') === 128_000);
check('ollama ceiling 8192', getModelContextWindow('llama3.2', 'ollama') === 8_192);
check('unknown model → fallback 32k', getModelContextWindow('mystery-model-9', '') === 32_000);
check('hebrew ~2 chars/token', Math.abs(estimateTokenCount('א'.repeat(1000), 'claude') - 500) <= 1);
check('gemini hebrew ~2.5 chars/token', Math.abs(estimateTokenCount('א'.repeat(1000), 'gemini') - 400) <= 1);
check('budget below window', estimateContextBudget({ model: 'gpt-4o', providerId: 'openai' }) < 128_000);

console.log('— planAutoDepth: routing —');
{
  const plan = planAutoDepth({ promptText: 'מהי דמוקרטיה', materials: [], model: 'gpt-4o', providerId: 'openai' });
  check('בלי חומרים + קצר → single-call', plan.mode === 'single-call');
  check('...וגם fast', plan.resolvedStyleDepth === 'fast', `got ${plan.resolvedStyleDepth}`);
}
{
  // 10 חומרים × ~50k תווים ≈ 250k טוקנים — גדול מ-96k של gpt-4o
  const materials = Array.from({ length: 10 }, (_, i) => longMaterial(`m${i}`, 550));
  const plan = planAutoDepth({ promptText: 'עבודה על הרפורמה המשפטית', materials, model: 'gpt-4o', providerId: 'openai' });
  check('10×50k על gpt-4o → brief-then-write', plan.mode === 'brief-then-write', `got ${plan.mode} (${plan.estimatedPromptTokens} vs ${plan.contextBudget})`);
  check('יש חומרים שסומנו brief', plan.materialPlan.some((e) => e.action === 'brief'));
  const sameOnGemini = planAutoDepth({ promptText: 'עבודה על הרפורמה המשפטית', materials, model: 'gemini-2.5-pro', providerId: 'gemini' });
  check('אותם חומרים על gemini → single-call', sameOnGemini.mode === 'single-call', `got ${sameOnGemini.mode}`);
  check('...וכל החומרים inline', sameOnGemini.materialPlan.every((e) => e.action === 'inline'));
}
{
  const materials = [longMaterial('m1', 300), longMaterial('m2', 300), longMaterial('m3', 300)];
  const plan = planAutoDepth({ promptText: 'סיכום קצר', materials, model: 'llama3.2', providerId: 'ollama' });
  check('ollama (8k) עם 3 חומרים → brief-then-write', plan.mode === 'brief-then-write', `got ${plan.mode}`);
}

console.log('— planAutoDepth: tier —');
{
  const longBrief = 'כתוב עבודה אקדמית מקיפה על הרפורמה המשפטית. '.repeat(40) + 'נדרשים 15 מקורות וביבליוגרפיה מלאה.';
  const materials = Array.from({ length: 5 }, (_, i) => longMaterial(`m${i}`, 400));
  const plan = planAutoDepth({ promptText: longBrief, materials, model: 'gemini-2.5-pro', providerId: 'gemini' });
  check('מטלה כבדה → deep', plan.resolvedStyleDepth === 'deep', `score=${plan.deepScore}`);
}
{
  const plan = planAutoDepth({ promptText: 'כתוב מסמך על השפעת הרשתות החברתיות על בני נוער בישראל, בהיקף בינוני, בטון ענייני', materials: [longMaterial('m1', 30)], model: 'gemini-2.5-pro', providerId: 'gemini' });
  check('משימה רגילה → normal', plan.resolvedStyleDepth === 'normal', `score=${plan.deepScore}`);
}

console.log('— selectRelevantExcerpts —');
{
  const terms = new Set(extractContextMatchTerms('הרפורמה המשפטית בישראל'));
  const text = `${'פסקה על מזג האוויר בחורף. '.repeat(60)}\n\nהרפורמה המשפטית שינתה את מערכת האיזונים בישראל.\n\n${'עוד פסקה לא קשורה בכלל. '.repeat(60)}`;
  const excerpt = selectRelevantExcerpts(text, terms, 600);
  check('הקטע הרלוונטי נבחר', excerpt.includes('הרפורמה המשפטית שינתה'));
  check('קטעים לא רלוונטיים לא נכנסו', !excerpt.includes('מזג האוויר'));
  check('מכבד תקציב תווים', excerpt.length <= 700);
}

check('אפס קריאות רשת', netCalls === 0, `netCalls=${netCalls}`);

console.log(`\nauto-depth-planner-unit: ${pass} עברו, ${fail} נכשלו`);
if (fail > 0) process.exit(1);
