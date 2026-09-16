#!/usr/bin/env node
/**
 * Maintenance smoke for Sheets/Drive integration.
 * Aligns with sparrow-harness/procedures/logistic-app-maintenance.md
 *
 * Never prints full VITE_SHEET_URL, passwords, or PII — only lengths / counts / booleans.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const LATENCY_WARN_MS = 8000;
const LATENCY_FAIL_MS = 12000;

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve(root, '.env.local'));
loadEnvFile(resolve(root, '.env'));

const sheetUrl = String(process.env.VITE_SHEET_URL ?? '').trim();
const remitosId = String(process.env.VITE_DRIVE_FOLDER_REMITOS ?? '').trim();
const facturasId = String(process.env.VITE_DRIVE_FOLDER_FACTURAS ?? '').trim();

const schema = JSON.parse(
  readFileSync(resolve(root, 'tests/fixtures/sheet-schema.json'), 'utf8')
);

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

function warn(msg) {
  console.warn(`WARN: ${msg}`);
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function looksLikeHtml(text) {
  const t = text.trimStart();
  return t.startsWith('<!DOCTYPE') || t.startsWith('<html');
}

function headerSet(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return new Set();
  const first = rows[0];
  if (!first || typeof first !== 'object') return new Set();
  return new Set(Object.keys(first));
}

function checkSchema(label, expectedHeaders, rows) {
  const actual = headerSet(rows);
  if (actual.size === 0) {
    warn(`${label}: no rows to compare headers (empty sheet ok if intentional)`);
    return;
  }
  const missing = expectedHeaders.filter((h) => !actual.has(h));
  const extra = [...actual].filter((h) => !expectedHeaders.includes(h));
  if (missing.length) {
    fail(`${label}: missing headers vs fixture: ${missing.join(', ')}`);
  } else {
    ok(`${label}: headers match fixture (${expectedHeaders.length} expected)`);
  }
  if (extra.length) {
    warn(`${label}: extra headers not in fixture: ${extra.join(', ')}`);
  }
}

async function main() {
  console.log('=== logistic-app maintenance smoke ===');
  if (!sheetUrl) {
    fail('VITE_SHEET_URL missing (set env or .env.local)');
    process.exit(1);
  }
  console.log(`VITE_SHEET_URL length: ${sheetUrl.length}`);
  console.log(`Drive remitos id set: ${Boolean(remitosId)} (len=${remitosId.length || 0})`);
  console.log(`Drive facturas id set: ${Boolean(facturasId)} (len=${facturasId.length || 0})`);

  const t0 = Date.now();
  let response;
  try {
    response = await fetch(sheetUrl, { method: 'GET', cache: 'no-store', redirect: 'follow' });
  } catch (err) {
    fail(`GET network error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  const latencyMs = Date.now() - t0;
  const text = await response.text();

  if (!response.ok) {
    fail(`GET HTTP ${response.status}`);
  }
  if (looksLikeHtml(text)) {
    fail('GET returned HTML (redeploy Web App as Anyone)');
    process.exit(1);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    fail('GET body is not JSON');
    process.exit(1);
  }

  console.log(`GET latencyMs: ${latencyMs}`);
  if (latencyMs > LATENCY_FAIL_MS) {
    fail(`latency ${latencyMs}ms exceeds budget ${LATENCY_FAIL_MS}ms`);
  } else if (latencyMs > LATENCY_WARN_MS) {
    warn(`latency ${latencyMs}ms > ${LATENCY_WARN_MS}ms`);
  } else {
    ok(`latency within budget (${latencyMs}ms)`);
  }

  const keys = Object.keys(json || {});
  console.log(`Top-level keys: ${keys.join(', ')}`);
  for (const key of schema.expectedGetKeys) {
    if (!(key in json)) {
      fail(`missing key: ${key}`);
    } else if (!Array.isArray(json[key])) {
      fail(`key ${key} is not an array`);
    } else {
      ok(`${key}: ${json[key].length} rows`);
    }
  }

  checkSchema('clients/DB_Clientes', schema.sheets.DB_Clientes.headers, json.clients);
  checkSchema('trips/DB_Viajes', schema.sheets.DB_Viajes.headers, json.trips);
  checkSchema('costs/DB_Costos', schema.sheets.DB_Costos.headers, json.costs);
  checkSchema(
    'scheduledCostDefinitions/DB_CostosProgramados',
    schema.sheets.DB_CostosProgramados.headers,
    json.scheduledCostDefinitions
  );

  // Optional health POST (Drive probe) — only if folder ids present or always for sheets
  try {
    const healthBody = {
      type: 'health',
      data: {
        ...(remitosId ? { remitosFolderId: remitosId } : {}),
        ...(facturasId ? { facturasFolderId: facturasId } : {}),
      },
    };
    const h0 = Date.now();
    const healthRes = await fetch(sheetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(healthBody),
      redirect: 'follow',
    });
    const healthText = await healthRes.text();
    const healthMs = Date.now() - h0;

    if (looksLikeHtml(healthText)) {
      fail('health POST returned HTML');
    } else {
      let health;
      try {
        health = JSON.parse(healthText);
      } catch {
        fail('health POST not JSON (endpoint may not be redeployed yet)');
        health = null;
      }
      if (health) {
        if (health.status !== 'success') {
          fail(`health status=${health.status} message=${health.message || ''}`);
        } else {
          ok(`health POST ok (${healthMs}ms)`);
        }
        if (health.sheets) {
          for (const [name, info] of Object.entries(health.sheets)) {
            console.log(
              `  sheet ${name}: exists=${info.exists} rows=${info.rows}`
            );
          }
        }
        if (remitosId || facturasId) {
          const drive = health.drive || {};
          if (remitosId) {
            if (!drive.remitos) fail('health missing drive.remitos');
            else if (!drive.remitos.ok) fail(`drive.remitos not ok: ${drive.remitos.error || ''}`);
            else ok('drive.remitos ok');
          }
          if (facturasId) {
            if (!drive.facturas) fail('health missing drive.facturas');
            else if (!drive.facturas.ok)
              fail(`drive.facturas not ok: ${drive.facturas.error || ''}`);
            else ok('drive.facturas ok');
          }
        } else {
          warn('skip Drive ACL probe (no VITE_DRIVE_FOLDER_* set)');
        }
      }
    }
  } catch (err) {
    fail(`health POST error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (process.exitCode && process.exitCode !== 0) {
    console.error('Smoke FAILED');
    process.exit(process.exitCode);
  }
  console.log('Smoke PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
