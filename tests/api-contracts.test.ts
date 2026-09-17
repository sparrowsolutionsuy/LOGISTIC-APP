import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchLogisticsDataFromUrl,
  isMockEnvironment,
  isRetryableLogisticsGetFailure,
  isUnknownTypeErrorResponse,
  isValidHealthResponse,
  lastLogisticsFetchWasMock,
  LOGISTICS_GET_TIMEOUT_MS,
  parseAppsScriptStatusResponse,
  shouldCloneMockOnFetchFailure,
  type LogisticsGetAttemptFailure,
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

describe('logistics GET retry classification', () => {
  it('retries http 404 and 5xx, not other 4xx', () => {
    expect(
      isRetryableLogisticsGetFailure({ kind: 'http', message: 'HTTP 404', httpStatus: 404 })
    ).toBe(true);
    expect(
      isRetryableLogisticsGetFailure({ kind: 'http', message: 'HTTP 503', httpStatus: 503 })
    ).toBe(true);
    expect(
      isRetryableLogisticsGetFailure({ kind: 'http', message: 'HTTP 403', httpStatus: 403 })
    ).toBe(false);
  });

  it('retries html, network, timeout, invalid_json', () => {
    const kinds: LogisticsGetAttemptFailure['kind'][] = [
      'html',
      'network',
      'timeout',
      'invalid_json',
    ];
    for (const kind of kinds) {
      expect(isRetryableLogisticsGetFailure({ kind, message: 'x' })).toBe(true);
    }
  });

  it('exports 30s GET timeout constant', () => {
    expect(LOGISTICS_GET_TIMEOUT_MS).toBe(30_000);
  });
});

describe('fetchLogisticsDataFromUrl with configured URL', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('throws on failed fetch and does not return mock clients/trips/costs (PROD + VITE_ALLOW_MOCK)', async () => {
    vi.useFakeTimers();
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
    const pending = (async () => {
      result = await fetchLogisticsDataFromUrl('https://example.invalid/macros/s/regression/exec', {
        treatAsProd: true,
      });
    })();
    const expectation = expect(pending).rejects.toThrow(/HTTP 503/);
    await vi.advanceTimersByTimeAsync(5000);
    await expectation;

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

  it('parses scheduledCostDefinitions from the same GET payload', async () => {
    const payload = {
      clients: [{ id: 'c1', nombre: 'Acme', rut: '', contacto: '', telefono: '', email: '' }],
      trips: [],
      costs: [],
      scheduledCostDefinitions: [
        {
          id: 'sc1',
          categoria: 'Fijo',
          descripcion: 'Alquiler',
          monto: 100,
          dayOfMonth: 1,
          active: true,
          creadoPor: 'admin',
          creadoEn: '2026-01-01',
          currency: 'USD',
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(payload),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLogisticsDataFromUrl(
      'https://example.invalid/macros/s/phase-a/exec',
      { treatAsProd: true }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.clients).toHaveLength(1);
    expect(result.clients[0]?.id).toBe('c1');
    expect(result.scheduledCostDefinitions).toHaveLength(1);
    expect(result.scheduledCostDefinitions[0]?.id).toBe('sc1');
    expect(result.scheduledCostDefinitions[0]?.descripcion).toBe('Alquiler');
    expect(result.documents).toEqual([]);
    expect(lastLogisticsFetchWasMock()).toBe(false);
  });

  it('parses documents from GET dump and defaults missing key to []', async () => {
    const withDocs = {
      clients: [],
      trips: [],
      costs: [],
      scheduledCostDefinitions: [],
      documents: [
        {
          id: 'DOC1',
          titulo: 'Libreta',
          categoria: 'camion',
          entidadRef: 'ABC',
          emitidoEn: '2026-01-01',
          venceEn: '2026-12-31',
          activo: true,
          creadoPor: 'admin',
          creadoEn: '2026-01-01',
          notas: '',
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify(withDocs),
      })
    );
    const withResult = await fetchLogisticsDataFromUrl(
      'https://example.invalid/macros/s/docs/exec',
      { treatAsProd: true }
    );
    expect(withResult.documents).toHaveLength(1);
    expect(withResult.documents[0]?.id).toBe('DOC1');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () =>
          JSON.stringify({
            clients: [],
            trips: [],
            costs: [],
            scheduledCostDefinitions: [],
          }),
      })
    );
    const oldGas = await fetchLogisticsDataFromUrl(
      'https://example.invalid/macros/s/old-gas/exec',
      { treatAsProd: true }
    );
    expect(oldGas.documents).toEqual([]);
  });

  it('retries once on HTTP 404 then succeeds', async () => {
    vi.useFakeTimers();
    const payload = {
      clients: [],
      trips: [],
      costs: [],
      scheduledCostDefinitions: [{ id: 'sc-ok', categoria: 'Fijo', descripcion: 'x', monto: 1 }],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'missing',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify(payload),
      });
    vi.stubGlobal('fetch', fetchMock);

    const pending = fetchLogisticsDataFromUrl('https://example.invalid/macros/s/retry/exec', {
      treatAsProd: true,
    });
    await vi.advanceTimersByTimeAsync(500);
    const result = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.scheduledCostDefinitions[0]?.id).toBe('sc-ok');
  });

  it('does not retry forever on persistent 404', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'missing',
    });
    vi.stubGlobal('fetch', fetchMock);

    const pending = fetchLogisticsDataFromUrl('https://example.invalid/macros/s/flake/exec', {
      treatAsProd: true,
    });
    const expectation = expect(pending).rejects.toThrow(/HTTP 404/);
    await vi.advanceTimersByTimeAsync(5000);
    await expectation;
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3);
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
