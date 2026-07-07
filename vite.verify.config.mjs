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
    : process.env.WORDAI_VERIFY_ENTRY === 'lab'
      ? 'tools/test-bench/lab-entry.mjs'          // full LAB — bundles all real modules for the test-bench server
      : 'tools/test-bench/source-pipeline-harness.mjs';
// LAB build → own dir so it never clobbers the retrieval harness output.
const OUT_DIR = process.env.WORDAI_VERIFY_ENTRY === 'lab' ? 'out-lab' : 'out-sf';
export default defineConfig({
  root: PROJECT, configFile: false, logLevel: 'warn',
  resolve: { alias: {
    aiservice: path.join(PROJECT, 'src/services/aiService.js'),
    agentcfg: path.join(PROJECT, 'src/agentConfig.js'),
    sqb: path.join(PROJECT, 'src/services/sourceQueryBuilder.js'),
    wls: path.join(PROJECT, 'src/services/workspaceLearningService.js'),
    srcretr: path.join(PROJECT, 'src/services/sourceRetrieval/index.js'),
    styleauth: path.join(PROJECT, 'src/services/styleAuthenticityService.js'),
    spss: path.join(PROJECT, 'src/services/spssSyntaxService.js'),
  } },
  ssr: { noExternal: true },
  build: {
    ssr: true, target: 'node18', minify: false,
    outDir: path.join(SCRATCH, OUT_DIR), emptyOutDir: true,
    rollupOptions: { input: path.join(PROJECT, ENTRY), output: { entryFileNames: 'sf.mjs', format: 'es' } },
  },
});
