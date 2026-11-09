#!/usr/bin/env node
/**
 * Sync canonical GOOGLE_APPS_SCRIPT.js → gas/Code.js for clasp push.
 * Source of truth remains GOOGLE_APPS_SCRIPT.js at repo root.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'GOOGLE_APPS_SCRIPT.js');
const destDir = path.join(root, 'gas');
const dest = path.join(destDir, 'Code.js');

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log('Synced GOOGLE_APPS_SCRIPT.js → gas/Code.js');
