const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function hasValue(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function fail(message) {
  console.error(`[dist:publish guard] ${message}`);
  process.exit(1);
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: process.env,
  });

  if (typeof result.status === 'number' && result.status !== 0) {
    return '';
  }

  if (result.error) {
    throw result.error;
  }

  return String(result.stdout || '').trim();
}

const allowLocalPublish = process.env.ALLOW_LOCAL_PUBLISH;
const allowDirtyLocalPublish = process.env.ALLOW_DIRTY_LOCAL_PUBLISH;
const hasGenericSigning = hasValue(process.env.CSC_LINK) && hasValue(process.env.CSC_KEY_PASSWORD);
const hasWindowsSigning = hasValue(process.env.WIN_CSC_LINK) && hasValue(process.env.WIN_CSC_KEY_PASSWORD);
const hasGitHubToken = hasValue(process.env.GH_TOKEN) || hasValue(process.env.GITHUB_TOKEN);

if (allowLocalPublish !== '1') {
  fail('Refusing local publish. Set ALLOW_LOCAL_PUBLISH=1 to continue.');
}

if (!hasGenericSigning && !hasWindowsSigning) {
  fail('Refusing local publish. Missing signing secrets. Set WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD, or CSC_LINK and CSC_KEY_PASSWORD.');
}

if (!hasGitHubToken) {
  fail('Refusing local publish. Missing GitHub release token. Set GH_TOKEN or GITHUB_TOKEN.');
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const gitCommand = process.platform === 'win32' ? 'git.exe' : 'git';

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const expectedTag = `v${String(packageJson.version || '').trim()}`;
const exactTag = capture(gitCommand, ['describe', '--tags', '--exact-match']);

if (!expectedTag || expectedTag === 'v') {
  fail('Refusing local publish. package.json is missing a valid version.');
}

if (!exactTag) {
  fail(`Refusing local publish. HEAD must be checked out at exact tag ${expectedTag}.`);
}

if (!exactTag.startsWith('v')) {
  fail(`Refusing local publish. Exact tag must start with v, got: ${exactTag}`);
}

if (exactTag !== expectedTag) {
  fail(`Refusing local publish. Exact tag ${exactTag} does not match package.json version ${expectedTag}.`);
}

if (allowDirtyLocalPublish !== '1') {
  const workingTreeStatus = capture(gitCommand, ['status', '--porcelain']);
  if (workingTreeStatus) {
    fail('Refusing local publish. Working tree must be clean. Commit or stash changes first, or set ALLOW_DIRTY_LOCAL_PUBLISH=1 to override.');
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
  });

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }

  if (result.error) {
    throw result.error;
  }
}

run(npmCommand, ['run', 'build']);
run(npxCommand, ['electron-builder', '--win', 'nsis', '--publish', 'always', '--config.win.signAndEditExecutable=true']);