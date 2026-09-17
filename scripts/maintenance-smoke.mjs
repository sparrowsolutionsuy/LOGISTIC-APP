#!/usr/bin/env node
/**
 * Maintenance smoke for Sheets/Drive integration.
 * Reads VITE_SHEET_URL from env / .env.local — never prints the full URL.
 *
 * Aligns with: sparrow-harness/procedures/logistic-app-maintenance.md
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const LATENCY_BUDGET_MS = Number(process.env.SMOKE_LATENCY_MS || 15000);
const LATENCY_WARN_MS = Number(process.env.SMOKE_LATENCY_WARN_MS || 8000);

function loadEnvFile(name) {
  const path = resolve(ROOT, name);
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
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

loadEnvFile('.env.local');
loadEnvFile('.env');

const SHEET_URL = String(process.env.VITE_SHEET_URL || '').trim();
const REMITOS = String(process.env.VITE_DRIVE_FOLDER_REMITOS || '').trim();
const FACTURAS = String(process.env.VITE_DRIVE_FOLDER_FACTURAS || '').trim();
const DOCUMENTOS = String(process.env.VITE_DRIVE_FOLDER_DOCUMENTOS || '').trim();

const schema = JSON.parse(
  readFileSync(resolve(ROOT, 'tests/fixtures/sheet-schema.json'), 'utf8')
);

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function warn(msg) {
  console.warn(`WARN: ${msg}`);
}

function responseLooksLikeHtml(text) {
  const t = text.trimStart();
  return t.startsWith('<!DOCTYPE') || t.startsWith('<html');
}

function headerSet(obj) {
  if (!obj || typeof obj !== 'object') return new Set();
  return new Set(Object.keys(obj));
}

function assertHeadersMatch(tabName, sampleObj, expectedHeaders) {
  const keys = headerSet(sampleObj);
  const missing = expectedHeaders.filter((h) => !keys.has(h));
  const extra = [...keys].filter((k) => !expectedHeaders.includes(k));
  if (missing.length) {
    fail(`${tabName}: missing keys vs fixture: ${missing.join(', ')}`);
  }
  if (extra.length) {
    warn(`${tabName}: extra keys not in fixture: ${extra.join(', ')}`);
  }
  if (!missing.length) {
    ok(`${tabName}: schema keys match fixture (${expectedHeaders.length} headers)`);
  }
}

async function main() {
  console.log('=== logistic-app maintenance smoke ===');
  if (!SHEET_URL) {
    fail('VITE_SHEET_URL missing (set env or .env.local)');
    return;
  }
  console.log(`VITE_SHEET_URL length: ${SHEET_URL.length} chars (value redacted)`);
  console.log(
    `Drive remitos id set: ${Boolean(REMITOS)}; facturas id set: ${Boolean(FACTURAS)}; documentos id set: ${Boolean(DOCUMENTOS)}`
  );
  console.log(
    `Latency budget: warn >${LATENCY_WARN_MS}ms, fail >${LATENCY_BUDGET_MS}ms ` +
      `(override with SMOKE_LATENCY_WARN_MS / SMOKE_LATENCY_MS)`
  );

  const t0 = Date.now();
  let res;
  try {
    res = await fetch(SHEET_URL, { method: 'GET', cache: 'no-store', redirect: 'follow' });
  } catch (err) {
    fail(`GET network error: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  const latencyMs = Date.now() - t0;
  const text = await res.text();

  if (!res.ok) {
    fail(`GET HTTP ${res.status}`);
  }
  if (responseLooksLikeHtml(text)) {
    fail('GET returned HTML (redeploy Web App as Anyone / check deploy)');
    return;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fail('GET body is not JSON');
    return;
  }

  console.log(`GET latencyMs=${latencyMs}`);
  if (latencyMs > LATENCY_BUDGET_MS) {
    fail(
      `Latency ${latencyMs}ms exceeds fail budget ${LATENCY_BUDGET_MS}ms ` +
        `(target p95 <8s; front timeout 30s)`
    );
  } else if (latencyMs > LATENCY_WARN_MS) {
    warn(
      `Latency ${latencyMs}ms > warn threshold ${LATENCY_WARN_MS}ms ` +
        `(fail budget ${LATENCY_BUDGET_MS}ms)`
    );
  } else {
    ok(`Latency ${latencyMs}ms within warn/fail budgets (${LATENCY_WARN_MS}/${LATENCY_BUDGET_MS}ms)`);
  }

  // Phase B: optional second GET within ScriptCache TTL (45s). Informational only —
  // Apps Script variance means we never fail hard if the second call is not faster.
  try {
    const t1 = Date.now();
    const res2 = await fetch(SHEET_URL, { method: 'GET', cache: 'no-store', redirect: 'follow' });
    const text2 = await res2.text();
    const latencyMs2 = Date.now() - t1;
    if (!res2.ok || responseLooksLikeHtml(text2)) {
      warn(`Second GET skipped comparison (HTTP ${res2.status} / HTML)`);
    } else {
      JSON.parse(text2);
      console.log(
        `GET latencyMs(2nd)=${latencyMs2} (cache hit expected within 45s TTL after Phase B redeploy; ` +
          `cold=${latencyMs}ms — informational, not a hard fail)`
      );
      if (latencyMs2 < latencyMs) {
        ok(`Second GET faster than first (${latencyMs2}ms < ${latencyMs}ms)`);
      } else {
        warn(
          `Second GET not faster (${latencyMs2}ms vs ${latencyMs}ms) — OK if GAS cold/variance or Phase B not redeployed`
        );
      }
    }
  } catch (err) {
    warn(`Second GET error (ignored): ${err instanceof Error ? err.message : String(err)}`);
  }

  const keys = Object.keys(data || {});
  console.log(`Top-level keys: ${keys.join(', ')}`);
  for (const expected of schema.expectedGetKeys) {
    if (!(expected in data)) {
      fail(`Missing top-level key: ${expected}`);
    } else {
      const arr = data[expected];
      const n = Array.isArray(arr) ? arr.length : 'n/a';
      ok(`Key ${expected} present (rows=${n})`);
    }
  }

  const map = [
    ['clients', 'DB_Clientes'],
    ['trips', 'DB_Viajes'],
    ['costs', 'DB_Costos'],
    ['scheduledCostDefinitions', 'DB_CostosProgramados'],
    ['documents', 'DB_Documentos'],
  ];
  for (const [key, tab] of map) {
    const rows = Array.isArray(data[key]) ? data[key] : [];
    if (rows.length === 0) {
      warn(`${tab}: 0 rows — skipping schema sample check`);
      continue;
    }
    assertHeadersMatch(tab, rows[0], schema.sheets[tab].headers);
  }

  // Optional health POST (Drive ACL probe) when folder IDs present
  if (REMITOS || FACTURAS || DOCUMENTOS) {
    const healthBody = {
      type: 'health',
      data: {
        ...(REMITOS ? { remitosFolderId: REMITOS } : {}),
        ...(FACTURAS ? { facturasFolderId: FACTURAS } : {}),
        ...(DOCUMENTOS ? { documentosFolderId: DOCUMENTOS } : {}),
      },
    };
    const ht0 = Date.now();
    let hres;
    try {
      hres = await fetch(SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(healthBody),
        redirect: 'follow',
      });
    } catch (err) {
      fail(`Health POST network error: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    const hText = await hres.text();
    const hLatency = Date.now() - ht0;
    if (responseLooksLikeHtml(hText)) {
      fail('Health POST returned HTML — Apps Script may not include health yet (redeploy)');
      return;
    }
    let health;
    try {
      health = JSON.parse(hText);
    } catch {
      fail('Health POST not JSON');
      return;
    }
    if (health.status !== 'success') {
      fail(`Health status=${health.status} message=${health.message || ''}`);
    } else {
      ok(`Health POST ok (client round-trip ${hLatency}ms, server latencyMs=${health.latencyMs ?? 'n/a'})`);
    }
    if (health.sheets && typeof health.sheets === 'object') {
      for (const [name, info] of Object.entries(health.sheets)) {
        console.log(
          `  sheet ${name}: exists=${info.exists} rows=${info.rows}`
        );
      }
    }
    if (health.drive) {
      for (const [name, info] of Object.entries(health.drive)) {
        if (info && info.ok) {
          ok(`Drive ${name}: ok`);
        } else {
          fail(`Drive ${name}: not ok (${info?.error || 'unknown'})`);
        }
      }
    }
  } else {
    warn('Skipping Drive folder probe details (no VITE_DRIVE_FOLDER_* set); still running health POST');
    // Always hit health when URL present (sheets-only) so redeploy drift is visible.
    try {
      const hres = await fetch(SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ type: 'health', data: {} }),
        redirect: 'follow',
      });
      const hText = await hres.text();
      if (responseLooksLikeHtml(hText)) {
        fail('Health POST returned HTML — Apps Script may not include health yet (redeploy)');
      } else {
        const health = JSON.parse(hText);
        if (health.status !== 'success' || !health.sheets) {
          fail('Health POST missing status/sheets');
        } else {
          ok('Health POST (sheets-only) ok');
        }
      }
    } catch (err) {
      fail(`Health POST error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Non-mutating unknown-type probe (requires redeployed GAS that rejects unknown types).
  try {
    const ures = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: '__smoke_unknown_type__', data: {} }),
      redirect: 'follow',
    });
    const uText = await ures.text();
    if (responseLooksLikeHtml(uText)) {
      fail('Unknown-type POST returned HTML');
    } else {
      const unknownBody = JSON.parse(uText);
      if (unknownBody.status !== 'error') {
        fail(
          `Unknown POST type must return status:error (got ${unknownBody.status}) — redeploy GAS if still success`
        );
      } else if (
        typeof unknownBody.message !== 'string' ||
        !/^Unknown type:/i.test(unknownBody.message)
      ) {
        fail(`Unknown POST type error message unexpected: ${unknownBody.message || '(none)'}`);
      } else {
        ok(`Unknown POST type correctly rejected (${unknownBody.message})`);
      }
    }
  } catch (err) {
    fail(`Unknown-type POST error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (process.exitCode) {
    console.error('=== smoke FAILED ===');
  } else {
    console.log('=== smoke PASSED ===');
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
