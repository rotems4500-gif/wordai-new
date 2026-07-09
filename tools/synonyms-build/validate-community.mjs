#!/usr/bin/env node
// ============================================================================
// tools/synonyms-build/validate-community.mjs
//
// Admin script: validate pending community synonym contributions in Firestore.
// Uses Gemini + REST API (Firebase JS SDK from node_modules).
//
// Usage:
//   node validate-community.mjs [--dry-run]
//
// Env vars:
//   WORDAI_ADMIN_EMAIL / WORDAI_ADMIN_PASSWORD — admin auth
//   GEMINI_API_KEY / GOOGLE_API_KEY / WORDAI_CFG — Gemini key (auto-resolved)
// ============================================================================

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  connectAuthEmulator,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveGeminiApiKey, callGemini, stripJsonFences, sleep } from './lib.mjs';

const CHUNK_SIZE = 25;
const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(DIR, '..', '..');

// Firebase config — from process.env or the project's .env.local / .env
// (same VITE_FIREBASE_* vars the app itself uses; no hardcoded values here).
async function loadFirebaseConfig() {
  const env = { ...process.env };
  for (const file of ['.env.local', '.env']) {
    try {
      const raw = await readFile(path.join(PROJECT, file), 'utf8');
      for (const line of raw.split('\n')) {
        const m = line.match(/^\s*(VITE_FIREBASE_[A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
        if (m && !env[m[1]]) env[m[1]] = m[2];
      }
    } catch { /* file missing — fine */ }
  }
  const cfg = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  const missing = ['apiKey', 'authDomain', 'projectId', 'appId'].filter((k) => !cfg[k]);
  if (missing.length) {
    console.error(`❌ Missing Firebase config values: ${missing.join(', ')} (set VITE_FIREBASE_* in env or .env.local)`);
    process.exit(1);
  }
  return cfg;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`🔍 Validating community synonyms${dryRun ? ' (DRY RUN)' : ''}...`);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const adminEmail = process.env.WORDAI_ADMIN_EMAIL;
  const adminPassword = process.env.WORDAI_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.error('❌ Missing WORDAI_ADMIN_EMAIL or WORDAI_ADMIN_PASSWORD');
    process.exit(1);
  }

  // ── Gemini key ────────────────────────────────────────────────────────────
  const { key: geminiKey, source: keySource } = await resolveGeminiApiKey();
  if (!geminiKey) {
    console.error('❌ No Gemini API key found');
    process.exit(1);
  }
  console.log(`✓ Gemini key resolved from: ${keySource}`);

  // ── Initialize Firebase ───────────────────────────────────────────────────
  const app = initializeApp(await loadFirebaseConfig());
  const auth = getAuth(app);
  const db = getFirestore(app);

  // Optional: connect to local emulators if running
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log('ℹ Using Firestore emulator');
  }
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    console.log('ℹ Using Auth emulator');
  }

  // ── Sign in ───────────────────────────────────────────────────────────────
  console.log(`\n🔑 Signing in as ${adminEmail}...`);
  try {
    await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
  } catch (err) {
    console.error(`❌ Auth failed: ${err.message}`);
    process.exit(1);
  }
  console.log('✓ Signed in');

  // ── Query pending synonyms ────────────────────────────────────────────────
  console.log('\n📚 Querying pending contributions...');
  const q = query(
    collection(db, 'synonymContributions'),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'asc'),
    limit(500)
  );

  let allPending = [];
  try {
    const snap = await getDocs(q);
    allPending = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
  } catch (err) {
    console.error(`❌ Query failed: ${err.message}`);
    process.exit(1);
  }

  if (allPending.length === 0) {
    console.log('✓ No pending contributions');
    process.exit(0);
  }

  console.log(`✓ Found ${allPending.length} pending contributions`);

  // ── Process in chunks ─────────────────────────────────────────────────────
  const chunks = [];
  for (let i = 0; i < allPending.length; i += CHUNK_SIZE) {
    chunks.push(allPending.slice(i, i + CHUNK_SIZE));
  }

  let totalApproved = 0;
  let totalRejected = 0;

  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const chunk = chunks[chunkIdx];
    console.log(`\n📝 Chunk ${chunkIdx + 1}/${chunks.length} (${chunk.length} items):`);

    // Build Hebrew prompt — כולל את ה-id של כל רשומה כדי שהמודל יחזיר אותו
    const pairs = chunk
      .map((item) => `{"id": ${JSON.stringify(item.id)}, "מילה": ${JSON.stringify(item.lemma || item.word || '')}, "נרדפת_מוצעת": ${JSON.stringify(item.synonym || '')}}`)
      .join('\n');

    const prompt = `אתה מומחה בעברית. לכל זוג (מילה, מילה נרדפת מוצעת) קבע אם זו מילה נרדפת תקינה ושימושית בעברית:
- אותה משמעות בסיסית?
- אותו חלק דיבר?
- טבעית ומשמשת בשימוש?

${pairs}

החזר JSON בלבד: מערך [{"id": "...", "verdict": "approve"|"reject", "note": "סיבה קצרה"}]
חובה לכלול את כל ה-id-ים מהרשימה, בדיוק כפי שהופיעו.`;

    let verdicts = [];
    try {
      const response = await callGemini(geminiKey, prompt);
      const cleaned = stripJsonFences(response);
      verdicts = JSON.parse(cleaned);
      if (!Array.isArray(verdicts)) {
        throw new Error('Response is not an array');
      }
    } catch (err) {
      console.warn(`⚠️  Gemini parse failed: ${err.message}, skipping chunk`);
      continue;
    }

    // Log verdicts
    const approved = verdicts.filter((v) => v.verdict === 'approve').length;
    const rejected = verdicts.filter((v) => v.verdict === 'reject').length;
    console.log(`  ✓ Approved: ${approved}, Rejected: ${rejected}`);

    // Dry run: just print
    if (dryRun) {
      console.log('  (DRY RUN — no writes)');
      verdicts.forEach((v) => {
        console.log(`    - ${v.id}: ${v.verdict} (${v.note})`);
      });
      totalApproved += approved;
      totalRejected += rejected;
    } else {
      // Write batch updates
      const batch = writeBatch(db);
      let batchCount = 0;

      for (const verdict of verdicts) {
        const item = chunk.find((c) => c.id === verdict.id);
        if (!item) continue;

        const ref = doc(db, 'synonymContributions', verdict.id);
        batch.update(ref, {
          status: verdict.verdict === 'approve' ? 'approved' : 'rejected',
          validatedAt: serverTimestamp(),
          validationNote: verdict.note || '',
        });
        batchCount++;
      }

      if (batchCount > 0) {
        try {
          await batch.commit();
          console.log(`  ✓ Wrote ${batchCount} updates`);
          totalApproved += approved;
          totalRejected += rejected;
        } catch (err) {
          console.error(`  ❌ Batch write failed: ${err.message}`);
        }
      }
    }

    // Sleep between chunks
    if (chunkIdx < chunks.length - 1) {
      await sleep(1000);
    }
  }

  // ── Update synonymsMeta/global ────────────────────────────────────────────
  if (!dryRun) {
    console.log('\n🔄 Updating synonymsMeta/global...');
    try {
      const metaRef = doc(db, 'synonymsMeta', 'global');
      const metaSnap = await getDoc(metaRef);
      const currentMeta = metaSnap.exists() ? metaSnap.data() : {};
      const currentPending = Number(currentMeta?.pendingCount || 0);
      const processedCount = totalApproved + totalRejected;

      const batch = writeBatch(db);
      batch.set(
        metaRef,
        {
          pendingCount: Math.max(0, currentPending - processedCount),
          // lastUpdatedAt הוא שדה הגרסה שה-cache בלקוחות משווה מולו — חובה לעדכן
          lastUpdatedAt: serverTimestamp(),
          lastValidatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await batch.commit();
      console.log(`✓ Updated pendingCount: ${currentPending} → ${Math.max(0, currentPending - processedCount)}`);
    } catch (err) {
      console.error(`⚠️  Meta update failed: ${err.message}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n✅ Done!`);
  console.log(`  Total Approved: ${totalApproved}`);
  console.log(`  Total Rejected: ${totalRejected}`);
  if (dryRun) {
    console.log('  (DRY RUN — no data written)');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
