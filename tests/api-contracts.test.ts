import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchLogisticsDataFromUrl,
  isMockEnvironment,
  isUnknownTypeErrorResponse,
  isValidHealthResponse,
  lastLogisticsFetchWasMock,
  parseAppsScriptStatusResponse,
  shouldCloneMockOnFetchFailure,
} from '../src/services/api';
import { MOCK_DATA } from '../src/constants';

describe('isMockEnvironment', () => {
  it('is false in production even if MODE looks like test', () => {
    expect(isMockEnvironment({ PROD: true, DEV: false, MODE: 'test' })).toBe(false);
    expect(isMockEnvironment({ PROD: true, DEV: true, MODE: 'development' })).toBe(false);
  });

  it('is true in DEV or Vitest MODE=test when not PROD', () => {
    expect(isMockEnvironment({ PROD: false, DEV: true, MODE: 'development' })).toBe(true);
    expect(isMockEnvironment({ PROD: false, DEV: false, MODE: 'test' })).toBe(true);
  });
});

describe('shouldCloneMockOnFetchFailure', () => {
  it('never returns mock when prod=true (VITE_ALLOW_MOCK ignored)', () => {
    expect(
      shouldCloneMockOnFetchFailure({
        prod: true,
        sheetUrl: 'https://example.invalid/exec',
        viteAllowMock: true,
      })
    ).toBe(false);
  });

  it('never returns mock when a Sheet URL is configured', () => {
    expect(
      shouldCloneMockOnFetchFailure({
        prod: false,
        sheetUrl: 'https://example.invalid/exec',
        viteAllowMock: true,
      })
    ).toBe(false);
  });
});

describe('fetchLogisticsDataFromUrl with configured URL', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws on failed fetch and does not return mock clients/trips/costs (PROD + VITE_ALLOW_MOCK)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Unavailable',
        text: async () => 'unavailable',
      })
    );

    let result: unknown = null;
    await expect(
      (async () => {
        result = await fetchLogisticsDataFromUrl('https://example.invalid/macros/s/regression/exec', {
          treatAsProd: true,
        });
      })()
    ).rejects.toThrow(/HTTP 503/);

    expect(result).toBeNull();
    expect(lastLogisticsFetchWasMock()).toBe(false);
    // Guard: mock catalog must not have been returned as operational data
    expect(result).not.toEqual(
      expect.objectContaining({
        clients: expect.arrayContaining([
          expect.objectContaining({ id: MOCK_DATA.clients[0]?.id }),
        ]),
      })
    );
  });
});

describe('Apps Script POST status contract', () => {
  it('unknown type responses parse as status error', () => {
    const body = { status: 'error', message: 'Unknown type: __healthcheck__' };
    const parsed = parseAppsScriptStatusResponse(body);
    expect(parsed.status).toBe('error');
    expect(parsed.isError).toBe(true);
    expect(isUnknownTypeErrorResponse(body)).toBe(true);
  });

  it('success is not treated as unknown-type error', () => {
    expect(isUnknownTypeErrorResponse({ status: 'success' })).toBe(false);
  });
});

describe('health response shape contract', () => {
  it('accepts status + sheets and optional drive', () => {
    expect(
      isValidHealthResponse({
        status: 'success',
        sheets: {
          DB_Viajes: { exists: true, rows: 85 },
          DB_Clientes: { exists: true, rows: 8 },
        },
        drive: {
          remitos: { ok: true },
          facturas: { ok: false, error: 'not found' },
        },
        latencyMs: 120,
      })
    ).toBe(true);
  });

  it('accepts sheets-only (no drive)', () => {
    expect(
      isValidHealthResponse({
        status: 'success',
        sheets: { DB_Usuarios: { exists: true, rows: 5 } },
      })
    ).toBe(true);
  });

  it('rejects missing sheets or bad status', () => {
    expect(isValidHealthResponse({ status: 'success' })).toBe(false);
    expect(isValidHealthResponse({ status: 'ok', sheets: {} })).toBe(false);
    expect(
      isValidHealthResponse({
        status: 'success',
        sheets: { DB_Viajes: { exists: 'yes', rows: 1 } },
      })
    ).toBe(false);
  });
});
