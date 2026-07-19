import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import { execFile } from 'child_process';

const STYLE_FILE = path.resolve(process.cwd(), 'my_personal_style.json');
const MAX_BODY_BYTES = 65536; // 64 KB hard cap for POST /api/style

// In-memory canonical store — no read-before-write race on concurrent POSTs
let styleDataCache = null;
function getStyleData() {
  if (!styleDataCache) {
    styleDataCache = fs.existsSync(STYLE_FILE)
      ? JSON.parse(fs.readFileSync(STYLE_FILE, 'utf8'))
      : { examples: [] };
  }
  return styleDataCache;
}
function persistStyleData() {
  fs.writeFileSync(STYLE_FILE, JSON.stringify(styleDataCache, null, 2), 'utf8');
}

async function getHttpsOptions() {
  try {
    const certsDir = path.join(os.homedir(), '.office-addin-dev-certs');
    const keyFile = path.join(certsDir, 'localhost.key');
    const certFile = path.join(certsDir, 'localhost.crt');

    if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
      return {
        key: fs.readFileSync(keyFile),
        cert: fs.readFileSync(certFile),
      };
    }
  } catch (e) {
    console.warn("Could not load dev certs. Run 'npx office-addin-dev-certs install' first.");
  }
  return false;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Vite plugin: auto-scan PAST-DOC/ and generate index.json on every change
function pastWorksPlugin() {
  const worksDir = path.resolve(process.cwd(), 'PAST-DOC');

  function generateIndex() {
    if (!fs.existsSync(worksDir)) {
      fs.mkdirSync(worksDir, { recursive: true });
    }
    const files = fs.readdirSync(worksDir)
      .filter(f => /\.(docx|pdf|txt|md)$/i.test(f))
      .map(f => {
        const stat = fs.statSync(path.join(worksDir, f));
        return { name: f, size: stat.size, modified: stat.mtime.toISOString() };
      });
    const payload = JSON.stringify({ files }, null, 2);
    const indexPath = path.join(worksDir, 'index.json');
    fs.writeFileSync(indexPath, payload, 'utf8');

    const publicDir = path.resolve(process.cwd(), 'public', 'PAST-DOC');
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(path.join(publicDir, 'index.json'), payload, 'utf8');

    if (files.length) console.log(`[PAST-DOC] ${files.length} file(s) indexed.`);
  }

  return {
    name: 'past-docs',
    buildStart() { generateIndex(); },
    configureServer(server) {
      generateIndex();
      server.watcher.add(worksDir);
      server.watcher.on('all', (event, filePath) => {
        if (filePath.startsWith(worksDir) && !filePath.endsWith('index.json')) {
          generateIndex();
          // Trigger HMR so the add-in re-fetches index.json
          server.ws.send({ type: 'full-reload' });
        }
      });
    }
  };
}

// Vite plugin: local style bank REST endpoints + DOI validation proxy
function styleBankPlugin() {
  return {
    name: 'style-bank',
    configureServer(server) {

      server.middlewares.use('/api/materials/upload', (req, res) => {
        if (req.method === 'OPTIONS') { res.writeHead(204, CORS_HEADERS); res.end(); return; }
        if (req.method !== 'POST') {
          res.writeHead(405, CORS_HEADERS);
          res.end();
          return;
        }

        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const {
              name,
              title,
              dataBase64,
              uploadKind,
              label,
              category,
              templateId,
              learningHint,
              previewText,
              previewChars,
              previewStatus,
              previewSource,
              previewError,
              extractedChars,
              extractionStatus,
              extractionMessage,
              extractionTruncated,
            } = JSON.parse(body || '{}');
            const safeName = path.basename(String(name || 'material.bin')).replace(/[^\w\u0590-\u05FF .()\-]/g, '_');
            if (!safeName || !dataBase64) {
              res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'name and dataBase64 are required' }));
              return;
            }

            const materialsDir = path.resolve(process.cwd(), 'public', 'project-materials');
            if (!fs.existsSync(materialsDir)) fs.mkdirSync(materialsDir, { recursive: true });

            const filePath = path.join(materialsDir, safeName);
            fs.writeFileSync(filePath, Buffer.from(dataBase64, 'base64'));

            const indexPath = path.join(materialsDir, 'index.json');
            let existing = [];
            try { existing = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch {}
            const nextEntry = {
              id: safeName,
              title: String(title || safeName),
              file: safeName,
              type: path.extname(safeName).replace(/^\./, ''),
              source: 'materials',
              uploadKind: String(uploadKind || 'general'),
              label: String(label || 'קובץ עזר כללי'),
              category: String(category || 'general'),
              templateId: String(templateId || 'blank'),
              learningHint: String(learningHint || ''),
              previewText: String(previewText || '').trim(),
              previewChars: Math.max(0, Number(previewChars) || 0),
              previewStatus: String(previewStatus || '').trim(),
              previewSource: String(previewSource || '').trim(),
              previewError: String(previewError || '').trim(),
              extractedChars: Math.max(0, Number(extractedChars) || 0),
              extractionStatus: String(extractionStatus || '').trim(),
              extractionMessage: String(extractionMessage || '').trim(),
              extractionTruncated: extractionTruncated === true,
              uploadedAt: new Date().toISOString(),
            };
            const merged = [...(Array.isArray(existing) ? existing.filter((item) => item.file !== safeName) : []), nextEntry];
            fs.writeFileSync(indexPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');

            res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, file: safeName, entry: nextEntry }));
          } catch (error) {
            res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message || 'upload failed' }));
          }
        });
      });

      server.middlewares.use('/api/storage-sync', (req, res) => {
        if (req.method === 'OPTIONS') { res.writeHead(204, CORS_HEADERS); res.end(); return; }

        if (req.method !== 'POST') {
          res.writeHead(405, CORS_HEADERS);
          res.end();
          return;
        }

        let body = '';
        let bodyBytes = 0;
        req.on('data', chunk => {
          bodyBytes += chunk.length;
          if (bodyBytes > MAX_BODY_BYTES) {
            req.destroy();
            if (!res.headersSent) {
              res.writeHead(413, CORS_HEADERS);
              res.end(JSON.stringify({ error: 'payload too large' }));
            }
            return;
          }
          body += chunk;
        });
        req.on('end', () => {
          try {
            const { source } = JSON.parse(body || '{}');
            const trimmedSource = String(source || '').trim();
            if (!trimmedSource) {
              res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'source is required' }));
              return;
            }

            execFile(
              process.execPath,
              [path.resolve(process.cwd(), 'scripts', 'sync-storage-to-local.mjs'), trimmedSource, '--json'],
              { cwd: process.cwd(), timeout: 120000, maxBuffer: 1024 * 1024 },
              (error, stdout, stderr) => {
                if (error) {
                  res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ ok: false, error: stderr || stdout || error.message }));
                  return;
                }
                const parsed = JSON.parse(stdout || '{}');
                res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, data: parsed }));
              }
            );
          } catch (e) {
            res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e.message }));
          }
        });
      });

      // ── /api/validate-doi?doi=10.xxxx/yyy  (server-side HEAD, no CORS) ──
      server.middlewares.use('/api/validate-doi', (req, res) => {
        if (req.method === 'OPTIONS') { res.writeHead(204, CORS_HEADERS); res.end(); return; }
        const url = new URL(req.url, 'https://localhost');
        const doi = url.searchParams.get('doi');
        if (!doi || !/^10\.\d{4,}\/\S+/.test(doi)) {
          res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid doi' }));
          return;
        }
        const doiUrl = `https://doi.org/${doi}`;
        const doiReq = https.request(doiUrl, { method: 'HEAD', timeout: 5000 }, (doiRes) => {
          const ok = doiRes.statusCode < 400 || doiRes.statusCode === 301 || doiRes.statusCode === 302;
          res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok }));
        });
        doiReq.on('timeout', () => { doiReq.destroy(); res.writeHead(200, CORS_HEADERS); res.end(JSON.stringify({ ok: null })); });
        doiReq.on('error', () => { if (!res.headersSent) { res.writeHead(200, CORS_HEADERS); res.end(JSON.stringify({ ok: null })); } });
        doiReq.end();
      });

      // ── /api/style  GET + POST ───────────────────────────────────────────
      server.middlewares.use('/api/style', (req, res) => {
        if (req.method === 'OPTIONS') { res.writeHead(204, CORS_HEADERS); res.end(); return; }

        if (req.method === 'GET') {
          res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
          res.end(JSON.stringify(getStyleData()));
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          let bodyBytes = 0;
          req.on('data', chunk => {
            bodyBytes += chunk.length;
            if (bodyBytes > MAX_BODY_BYTES) {
              req.destroy();
              if (!res.headersSent) { res.writeHead(413, CORS_HEADERS); res.end(JSON.stringify({ error: 'payload too large' })); }
              return;
            }
            body += chunk;
          });
          req.on('end', () => {
            try {
              const { text } = JSON.parse(body);
              if (!text || typeof text !== 'string' || text.trim().length < 10) {
                res.writeHead(400, CORS_HEADERS);
                res.end(JSON.stringify({ error: 'text must be at least 10 chars' }));
                return;
              }
              const sanitized = text.trim().slice(0, 2000);
              const data = getStyleData();
              data.examples.push({ savedAt: new Date().toISOString(), text: sanitized });
              persistStyleData();
              res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, total: data.examples.length }));
            } catch (e) {
              res.writeHead(500, CORS_HEADERS);
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }

        res.writeHead(405, CORS_HEADERS);
        res.end();
      });
    }
  };
}

export default async () => defineConfig({
  base: './',
  plugins: [react(), pastWorksPlugin(), styleBankPlugin()],
  resolve: {
    // Force a single React instance. Without this, dev (optimizer + react-refresh)
    // can wire some modules to a second React copy → "Invalid hook call" /
    // "can't detect preamble" crashes (e.g. ProfileOnboarding's SyllabusListTextarea).
    dedupe: ['react', 'react-dom'],
    alias: {
      'sav-reader': path.resolve(process.cwd(), 'node_modules', 'sav-reader', 'dist', 'SavBufferReader.js'),
      // SavReader core (without SavBufferReader's broken `stream.Readable.from`).
      // We feed it a Readable we build ourselves — see spssDataIngest.js.
      'sav-reader-core': path.resolve(process.cwd(), 'node_modules', 'sav-reader', 'dist', 'SavReader.js'),
      events: 'events',
      stream: 'stream-browserify',
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    // transformers.js (+onnxruntime-web WASM) — נטען dynamic-import בלבד (styleEmbeddingService);
    // exclude מ-pre-bundle מונע בעיות עם ה-WASM assets/worker של onnxruntime.
    exclude: ['@huggingface/transformers'],
  },
  define: {
    global: 'globalThis',
    __APP_VERSION__: JSON.stringify(
      (() => {
        try {
          return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')).version || '';
        } catch {
          return '';
        }
      })()
    ),
  },
  server: {
    port: 3001,
    strictPort: true,
    // VITE_NO_HTTPS=1 משבית HTTPS לצורך בדיקה אוטומטית בדפדפן (cert עצמי נדחה ע"י preview). לא משפיע על dev רגיל.
    https: process.env.VITE_NO_HTTPS ? false : await getHttpsOptions(),
    proxy: {
      '/api/local-article-check': {
        target: 'http://127.0.0.1:4317',
        changeOrigin: true,
        secure: false,
        rewrite: (requestPath) => requestPath.replace(/^\/api\/local-article-check/, ''),
      },
    },
  }
});
