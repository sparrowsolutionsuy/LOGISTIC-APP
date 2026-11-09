#!/usr/bin/env node
/**
 * URL-stable Apps Script redeploy via clasp 3.x update-deployment only.
 * Requires GAS_DEPLOYMENT_ID (+ loads .env.local) and CONFIRM_GAS_DEPLOY=1.
 * Never creates a new Web App deployment.
 */
import { spawnSync } from 'node:child_process';
import { loadEnvLocal, repoRoot } from './load-env-local.mjs';

loadEnvLocal();

const deploymentId = process.env.GAS_DEPLOYMENT_ID?.trim();
const confirmed = process.env.CONFIRM_GAS_DEPLOY?.trim() === '1';

if (!deploymentId) {
  console.error(
    'gas:deploy refused: GAS_DEPLOYMENT_ID is unset.\n' +
      'Set it in .env.local or the shell to the existing Web App deployment ID (Manage deployments).\n' +
      'This script only runs clasp update-deployment — it will not create a new /exec URL.'
  );
  process.exit(1);
}

if (!confirmed) {
  console.error(
    'gas:deploy refused: CONFIRM_GAS_DEPLOY=1 is required (HITL belt-and-suspenders).\n' +
      'Only set after explicit human approval for this prod update-deployment.\n' +
      'Also confirm Código/basename + live appsscript.json were aligned BEFORE first push.'
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

const short =
  spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).stdout?.trim() || 'local';

console.log(
  'HITL: running gas:push + update-deployment for existing deployment (id length ' +
    String(deploymentId.length) +
    ').'
);

run('npm', ['run', 'gas:push']);
run('npx', [
  'clasp',
  'update-deployment',
  deploymentId,
  '-d',
  `harness: ${short}`,
]);
