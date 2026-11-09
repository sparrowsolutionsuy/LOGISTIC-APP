#!/usr/bin/env node
/**
 * URL-stable Apps Script redeploy via clasp 3.x update-deployment only.
 * Requires GAS_DEPLOYMENT_ID. Never creates a new Web App deployment.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deploymentId = process.env.GAS_DEPLOYMENT_ID?.trim();

if (!deploymentId) {
  console.error(
    'gas:deploy refused: GAS_DEPLOYMENT_ID is unset.\n' +
      'Set it to the existing Web App deployment ID (Manage deployments).\n' +
      'This script only runs clasp update-deployment — it will not create a new /exec URL.'
  );
  process.exit(1);
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const short = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).stdout?.trim() || 'local';

run('npm', ['run', 'gas:push']);
run('npx', [
  'clasp',
  'update-deployment',
  deploymentId,
  '-d',
  `harness: ${short}`,
]);
