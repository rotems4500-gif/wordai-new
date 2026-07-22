import { defineConfig } from 'vite';
import path from 'node:path';
const PROJECT = "C:/Users/rotem/Projects/'wordai new";
const SCRATCH = process.env.WORDAI_VERIFY_SCRATCH
  || "C:/Users/rotem/AppData/Local/Temp/claude/C--Users-rotem-Projects--wordai-new/41ab5a23-649e-4489-9e04-a23e60b45aea/scratchpad/verify";
// WORDAI_VERIFY_ENTRY=unit → בדיקות offline של sourceRetrieval; ברירת מחדל → harness המקורות המלא.
const ENTRY = process.env.WORDAI_VERIFY_ENTRY === 'unit'
  ? 'tools/test-bench/source-retrieval-unit.mjs'
  : process.env.WORDAI_VERIFY_ENTRY === 'api'
    ? 'tools/test-bench/v3-api-unit.mjs'
  : process.env.WORDAI_VERIFY_ENTRY === 'smoke'
    ? 'tools/test-bench/v3-live-smoke.mjs'
  : process.env.WORDAI_VERIFY_ENTRY === 'ws'
    ? 'tools/test-bench/v3-workspaces-integration.mjs'
  : process.env.WORDAI_VERIFY_ENTRY === 'retr'
    ? 'tools/test-bench/source-retrieval-live.mjs'
  : process.env.WORDAI_VERIFY_ENTRY === 'assign'
    ? 'tools/test-bench/assignment-ai-harness.mjs'
  : process.env.WORDAI_VERIFY_ENTRY === 'gap'
    ? 'tools/test-bench/gap-source-harness.mjs'
  : process.env.WORDAI_VERIFY_ENTRY === 'whole'
    ? 'tools/test-bench/whole-work-harness.mjs'
  : process.env.WORDAI_VERIFY_ENTRY === 'quota'
    ? 'tools/test-bench/quota-probe.mjs'
  : process.env.WORDAI_VERIFY_ENTRY === 'review'
    ? 'tools/test-bench/review-unit.mjs'
  : process.env.WORDAI_VERIFY_ENTRY === 'e2e'
    ? 'tools/test-bench/e2e-assignment.mjs'
  : process.env.WORDAI_VERIFY_ENTRY === 'devkey'
    ? 'tools/test-bench/device-key-unit.mjs'
  : process.env.WORDAI_VERIFY_ENTRY === 'realinstr'
    ? 'tools/test-bench/real-instructions-probe.mjs'
  : process.env.WORDAI_VERIFY_ENTRY === 'preview'
    ? 'tools/test-bench/scaffold-preview.mjs'
  : process.env.WORDAI_VERIFY_ENTRY === 'openers'
    ? 'tools/test-bench/openers-real-corpus.mjs'
  : process.env.WORDAI_VERIFY_ENTRY === 'labelset'
    ? 'tools/test-bench/openers-labelset.mjs'
  : process.env.WORDAI_VERIFY_ENTRY === 'compose'
    ? 'tools/test-bench/openers-compose.mjs'
  : process.env.WORDAI_VERIFY_ENTRY === 'oprofile'
    ? 'tools/test-bench/opener-profile.mjs'
  : process.env.WORDAI_VERIFY_ENTRY === 'speccov'
    ? 'tools/test-bench/spec-coverage.mjs'
    : process.env.WORDAI_VERIFY_ENTRY === 'lab'
      ? 'tools/test-bench/lab-entry.mjs'          // full LAB — bundles all real modules for the test-bench server
      : process.env.WORDAI_VERIFY_ENTRY === 'styletag'
        ? 'tools/test-bench/style-tag-route-unit.mjs'
        : 'tools/test-bench/source-pipeline-harness.mjs';
// LAB build → own dir so it never clobbers the retrieval harness output.
const OUT_DIR = process.env.WORDAI_VERIFY_ENTRY === 'lab' ? 'out-lab'
  : process.env.WORDAI_VERIFY_ENTRY === 'assign' ? 'out-assign'
    : process.env.WORDAI_VERIFY_ENTRY === 'gap' ? 'out-gap'
      : process.env.WORDAI_VERIFY_ENTRY === 'whole' ? 'out-whole'
        : process.env.WORDAI_VERIFY_ENTRY === 'quota' ? 'out-quota'
          : process.env.WORDAI_VERIFY_ENTRY === 'review' ? 'out-review'
            : process.env.WORDAI_VERIFY_ENTRY === 'e2e' ? 'out-e2e'
              : process.env.WORDAI_VERIFY_ENTRY === 'devkey' ? 'out-devkey'
                : process.env.WORDAI_VERIFY_ENTRY === 'realinstr' ? 'out-realinstr'
                  : process.env.WORDAI_VERIFY_ENTRY === 'preview' ? 'out-preview'
                    : process.env.WORDAI_VERIFY_ENTRY === 'openers' ? 'out-openers'
                      : process.env.WORDAI_VERIFY_ENTRY === 'labelset' ? 'out-labelset'
                        : process.env.WORDAI_VERIFY_ENTRY === 'compose' ? 'out-compose'
                          : process.env.WORDAI_VERIFY_ENTRY === 'oprofile' ? 'out-oprofile'
                            : process.env.WORDAI_VERIFY_ENTRY === 'speccov' ? 'out-speccov' : 'out-sf';
export default defineConfig({
  root: PROJECT, configFile: false, logLevel: 'warn',
  resolve: { alias: {
    aiservice: path.join(PROJECT, 'src/services/aiService.js'),
    agentcfg: path.join(PROJECT, 'src/agentConfig.js'),
    sqb: path.join(PROJECT, 'src/services/sourceQueryBuilder.js'),
    wls: path.join(PROJECT, 'src/services/workspaceLearningService.js'),
    srcretr: path.join(PROJECT, 'src/services/sourceRetrieval/index.js'),
    assignai: path.join(PROJECT, 'src/services/assignmentAiService.js'),
    gapsource: path.join(PROJECT, 'src/services/gapSourceService.js'),
    matstore: path.join(PROJECT, 'src/services/materialChunkStore.js'),
    evmatch: path.join(PROJECT, 'src/services/evidenceMatchService.js'),
    prepsvc: path.join(PROJECT, 'src/services/assignmentPrepService.js'),
    pagetext: path.join(PROJECT, 'src/services/pageTextFetch.js'),
    scaffolddoc: path.join(PROJECT, 'src/services/assignmentScaffoldDoc.js'),
    review: path.join(PROJECT, 'src/services/assignmentReviewService.js'),
    specsvc: path.join(PROJECT, 'src/services/assignmentSpecService.js'),
    cryptosession: path.join(PROJECT, 'src/services/cloudCryptoSession.js'),
    openersvc: path.join(PROJECT, 'src/services/styleOpenerService.js'),
    hebrewlex: path.join(PROJECT, 'src/services/hebrewLexiconService.js'),
    cloudcrypto: path.join(PROJECT, 'src/services/cloudCrypto.js'),
    styleauth: path.join(PROJECT, 'src/services/styleAuthenticityService.js'),
    // Personal Style Engine services (LAB style-engine endpoints).
    styleprofile: path.join(PROJECT, 'src/services/styleProfileService.js'),
    stylesamples: path.join(PROJECT, 'src/services/styleSampleStore.js'),
    styleingest: path.join(PROJECT, 'src/services/styleIngestService.js'),
    styleretrieval: path.join(PROJECT, 'src/services/styleRetrievalService.js'),
    stylejudge: path.join(PROJECT, 'src/services/styleJudgeService.js'),
    spss: path.join(PROJECT, 'src/services/spssSyntaxService.js'),
    // .sav parsing in the LAB (tools/test-bench/lab-entry.mjs) — same alias as
    // vite.config.js: SavReader core without SavBufferReader's browser-only
    // stream.Readable.from. Node's real Readable.from() feeds it directly.
    'sav-reader-core': path.join(PROJECT, 'node_modules', 'sav-reader', 'dist', 'SavReader.js'),
  } },
  ssr: { noExternal: true },
  build: {
    ssr: true, target: 'node18', minify: false,
    outDir: path.join(SCRATCH, OUT_DIR), emptyOutDir: true,
    rollupOptions: { input: path.join(PROJECT, ENTRY), output: { entryFileNames: 'sf.mjs', format: 'es' } },
  },
});
