// ============================================================================
// tools/synonyms-build/lib.mjs
//
// Shared utilities extracted from build.mjs: API key resolution, Gemini calls,
// text normalization, constants. Usable by build.mjs, gen-wordlist.mjs, etc.
// ============================================================================
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import path from 'node:path';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(DIR, '..', '..');
const LOCAL_KEYS_PATH = path.join(DIR, '..', 'test-bench', 'keys.local.json');

const MODEL = 'gemini-2.5-flash';
const GENAI_ENDPOINT = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;

const NIKUD_RE = /[֑-ׇ]/g;
const HEBREW_WORD_RE = /^[א-ת]+$/;

// Copied from src/services/styleAuthenticityService.js:37
const STOP_WORDS = new Set(['של', 'על', 'עם', 'זה', 'זאת', 'היא', 'הוא', 'הם', 'הן', 'אני', 'אתה', 'את', 'אנחנו', 'גם', 'אבל', 'או', 'אם', 'כי', 'כל', 'לא', 'כן', 'כך', 'מאוד', 'עוד', 'רק', 'כדי', 'היה', 'היו', 'יש', 'אין', 'אל', 'מן', 'אלו', 'אלה', 'אשר', 'כאשר', 'בין', 'לפי', 'תוך', 'אצל', 'מתוך', 'בו', 'בה', 'בהם']);

// ── Helper utilities ──────────────────────────────────────────────────────
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { ...opts, shell: true });
    let out = '', err = '';
    p.stdout?.on('data', (d) => { out += d; });
    p.stderr?.on('data', (d) => { err += d; });
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err || out || `exit ${code}`))));
    p.on('error', reject);
  });
}

// ── Text normalization ────────────────────────────────────────────────────
function stripNikud(s) {
  return String(s || '').replace(NIKUD_RE, '');
}

function normalizeLemmaKey(s) {
  return stripNikud(String(s || '')).trim();
}

function stripJsonFences(text) {
  return String(text || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```\s*$/, '')
    .trim();
}

// ── API key resolution ────────────────────────────────────────────────────
// Precedence (same pattern as tools/test-bench/server.mjs):
//   1. env GEMINI_API_KEY / GOOGLE_API_KEY
//   2. env WORDAI_CFG (JSON string, provider-config shape)
//   3. DPAPI-decrypt %APPDATA%/com.wordai.assistant/ai-provider-config.json
//   4. tools/test-bench/keys.local.json

async function decryptDpapiFile(fileName) {
  const filePath = path.join(process.env.APPDATA || '', 'com.wordai.assistant', fileName);
  try {
    const raw = await readFile(filePath);
    const magic = Buffer.from('DPAPI1\n', 'ascii');
    if (!raw.subarray(0, magic.length).equals(magic)) throw new Error('unexpected secure-file header');
  } catch (e) {
    console.warn(`DPAPI read failed (${fileName}):`, e.message);
    return '';
  }
  // ה-blob המוצפן גדול ממגבלת שורת הפקודה של cmd — לכן PowerShell קורא את הקובץ
  // בעצמו במקום לקבל את ה-base64 כארגומנט.
  const ps = [
    'Add-Type -AssemblyName System.Security',
    `$raw=[IO.File]::ReadAllBytes(${JSON.stringify(filePath)})`,
    '$blob=$raw[7..($raw.Length-1)]',
    '$dec=[Security.Cryptography.ProtectedData]::Unprotect($blob,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)',
    '[Console]::Out.Write([Text.Encoding]::UTF8.GetString($dec))',
  ].join('\n');
  const encoded = Buffer.from(ps, 'utf16le').toString('base64');
  try {
    const out = await run('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
    return out.trim();
  } catch (e) {
    console.warn(`DPAPI decrypt failed (${fileName}):`, e.message);
    return '';
  }
}

function extractGeminiKeyFromConfigJson(raw) {
  if (!raw) return '';
  let parsed;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return ''; }
  const source = parsed?.providerConfig || parsed?.aiProviderConfig || parsed?.ai_provider_config || parsed;
  const direct = source?.gemini;
  if (typeof direct === 'string') return direct.trim();
  if (direct && typeof direct === 'object') {
    const key = String(direct.key || direct.apiKey || '').trim();
    if (key) return key;
  }
  const envKey = source?.GEMINI_API_KEY || source?.GOOGLE_API_KEY;
  if (envKey) return String(envKey).trim();
  return '';
}

async function readLocalKeysGeminiKey() {
  if (!(await exists(LOCAL_KEYS_PATH))) return '';
  try {
    const raw = await readFile(LOCAL_KEYS_PATH, 'utf8');
    return extractGeminiKeyFromConfigJson(raw);
  } catch (e) {
    console.warn('keys.local.json load failed:', e.message);
    return '';
  }
}

async function resolveGeminiApiKey() {
  if (process.env.GEMINI_API_KEY) return { key: process.env.GEMINI_API_KEY.trim(), source: 'env GEMINI_API_KEY' };
  if (process.env.GOOGLE_API_KEY) return { key: process.env.GOOGLE_API_KEY.trim(), source: 'env GOOGLE_API_KEY' };
  if (process.env.WORDAI_CFG) {
    const key = extractGeminiKeyFromConfigJson(process.env.WORDAI_CFG);
    if (key) return { key, source: 'env WORDAI_CFG' };
  }
  const dpapiJson = await decryptDpapiFile('ai-provider-config.json');
  if (dpapiJson) {
    const key = extractGeminiKeyFromConfigJson(dpapiJson);
    if (key) return { key, source: 'app encrypted config (DPAPI)' };
  }
  const localKey = await readLocalKeysGeminiKey();
  if (localKey) return { key: localKey, source: 'keys.local.json' };
  return { key: '', source: 'missing' };
}

// ── Gemini call with retry ────────────────────────────────────────────────
async function callGemini(apiKey, prompt, { retried = false } = {}) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    // thinkingBudget: 0 — gemini-2.5-flash מפעיל "חשיבה" כברירת מחדל, וטוקני
    // החשיבה אוכלים מתקציב הפלט → ה-JSON נחתך באמצע (~45% דילוג באצוות דומיין).
    // ביטול החשיבה מחזיר את כל התקציב לפלט (ומזרז/מוזיל). למשימת רשימת נרדפות
    // אין ערך לחשיבה.
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 32768,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  let res;
  try {
    res = await fetch(GENAI_ENDPOINT(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (!retried) { await sleep(20000); return callGemini(apiKey, prompt, { retried: true }); }
    throw e;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if ((res.status === 429 || res.status >= 500) && !retried) {
      console.warn(`  HTTP ${res.status} — retrying once after 20s backoff`);
      await sleep(20000);
      return callGemini(apiKey, prompt, { retried: true });
    }
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  return text;
}

// ── Exports ───────────────────────────────────────────────────────────────
export {
  LOCAL_KEYS_PATH,
  MODEL,
  GENAI_ENDPOINT,
  NIKUD_RE,
  HEBREW_WORD_RE,
  STOP_WORDS,
  exists,
  sleep,
  run,
  stripNikud,
  normalizeLemmaKey,
  stripJsonFences,
  decryptDpapiFile,
  extractGeminiKeyFromConfigJson,
  readLocalKeysGeminiKey,
  resolveGeminiApiKey,
  callGemini,
};
