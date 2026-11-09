#!/usr/bin/env node
/**
 * Sync SoT → gas/Código.js then clasp push --force.
 * Refuses the committed stub appsscript.json unless overridden.
 * Live logistic-app manifest may omit oauthScopes but includes webapp — that is not a stub.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadEnvLocal, repoRoot } from './load-env-local.mjs';

loadEnvLocal();

const manifestPath = path.join(repoRoot, 'gas', 'appsscript.json');
if (!existsSync(manifestPath)) {
  console.error('gas:push refused: missing gas/appsscript.json');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const hasOauthScopes =
  Array.isArray(manifest.oauthScopes) && manifest.oauthScopes.length > 0;
const hasWebapp = manifest.webapp != null && typeof manifest.webapp === 'object';
const looksLikeStub = !hasOauthScopes && !hasWebapp;

if (looksLikeStub && process.env.ALLOW_STUB_GAS_PUSH?.trim() !== '1') {
  console.error(
    'gas:push refused: gas/appsscript.json looks like the committed stub (no oauthScopes/webapp).\n' +
      'Before the first push: clasp pull (or copy live appsscript.json into gas/), keep the live manifest,\n' +
      'then npm run gas:sync (writes gas/Código.js) and retry.\n' +
      'Escape hatch (not for prod): ALLOW_STUB_GAS_PUSH=1'
  );
  process.exit(1);
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: repoRoot, stdio: 'inherit', shell: false });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('npm', ['run', 'gas:sync']);
run('npx', ['clasp', 'push', '--force']);
