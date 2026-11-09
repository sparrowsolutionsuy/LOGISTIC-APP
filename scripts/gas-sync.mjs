#!/usr/bin/env node
/**
 * Sync canonical GOOGLE_APPS_SCRIPT.js → gas/Código.js for clasp push.
 * Source of truth remains GOOGLE_APPS_SCRIPT.js at repo root.
 * Remote basename is Código (Spanish Apps Script default) — keep a single doGet file.
 */
import { copyFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'GOOGLE_APPS_SCRIPT.js');
const destDir = path.join(root, 'gas');
const dest = path.join(destDir, 'Código.js');
const legacyCodeJs = path.join(destDir, 'Code.js');

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
// Avoid dual doGet if an old Code.js is left in gas/
if (existsSync(legacyCodeJs)) {
  unlinkSync(legacyCodeJs);
}
console.log('Synced GOOGLE_APPS_SCRIPT.js → gas/Código.js');
