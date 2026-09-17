import type {
  BillingInfo,
  Client,
  Cost,
  FleetDocument,
  ReportEmailEntry,
  ScheduledCostDefinition,
  Trip,
  TripStatus,
  User,
} from '../types';
import { MOCK_DATA } from '../constants';
import { normalizeDocumentCategory } from '../utils/documents';
import { MAX_REPORT_EMAILS, normalizeReportEmail } from '../utils/reportEmails';

const SHEET_URL = String(import.meta.env.VITE_SHEET_URL ?? '').trim();
const DRIVE_FOLDER_REMITOS = String(import.meta.env.VITE_DRIVE_FOLDER_REMITOS ?? '').trim();
const DRIVE_FOLDER_FACTURAS = String(import.meta.env.VITE_DRIVE_FOLDER_FACTURAS ?? '').trim();
const DRIVE_FOLDER_DOCUMENTOS = String(import.meta.env.VITE_DRIVE_FOLDER_DOCUMENTOS ?? '').trim();

/**
 * Mock data is allowed only in development or Vitest — never in production builds.
 * `VITE_ALLOW_MOCK` is intentionally ignored in PROD (and does not unlock mock when a Sheet URL is set).
 */
export function isMockEnvironment(env: {
  DEV?: boolean;
  PROD?: boolean;
  MODE?: string;
} = import.meta.env): boolean {
  if (env.PROD) return false;
  return Boolean(env.DEV) || env.MODE === 'test';
}

/** Sin URL de Web App y entorno DEV/test → modo mock local. Nunca en PROD. */
export const IS_MOCK = !SHEET_URL && isMockEnvironment();

if (import.meta.env.DEV) {
  console.info('[GDC API] SHEET_URL configurada:', SHEET_URL ? '✅ SÍ' : '❌ NO (modo mock)');
  console.info(
    '[GDC API] GEMINI_KEY configurada:',
    import.meta.env.VITE_GEMINI_API_KEY ? '✅ SÍ' : '❌ NO'
  );
}

let logisticsFetchUsedMock = false;

export function lastLogisticsFetchWasMock(): boolean {
  return logisticsFetchUsedMock;
}

const MOCK_DELAY_MS = 300;

/** En modo mock, definiciones de costos programados persisten en memoria del módulo. */
let mockScheduledCostDefinitionsCache: ScheduledCostDefinition[] | null = null;
/** En modo mock, documentos de flota persisten en memoria del módulo. */
let mockDocumentsCache: FleetDocument[] | null = null;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });

const APPS_SCRIPT_PLAIN_HEADERS = { 'Content-Type': 'text/plain' } as const;

function responseLooksLikeHtml(text: string): boolean {
  const t = text.trimStart();
  return t.startsWith('<!DOCTYPE') || t.startsWith('<html');
}

/** Subidas base64 a Apps Script pueden superar 20s en redes lentas o imágenes grandes. */
const UPLOAD_FETCH_TIMEOUT_MS = 180_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: 'follow',
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

/** Decision helper for tests / ops: never mock when PROD or when a Sheet URL is configured. */
export function shouldCloneMockOnFetchFailure(options: {
  prod: boolean;
  sheetUrl: string;
  /** Ignored when prod=true or sheetUrl is set. */
  viteAllowMock?: boolean;
}): boolean {
  if (options.prod) return false;
  if (String(options.sheetUrl ?? '').trim()) return false;
  // No URL + non-prod: initial IS_MOCK path uses mock; failure path should not be reached.
  return false;
}

/** Normaliza fila remota o parcial a `Trip` (sin `any` en la firma pública). */
export function normalizeTrip(row: unknown): Trip {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;

  // Helper para parsear booleanos que vienen como 0/1/true/false/null
  const parseBool = (v: unknown): boolean => {
    if (v === null || v === undefined || v === '' || v === 'NaN') return false;
    return Number(v) === 1 || v === true || v === 'true' || v === '1';
  };

  // Helper para parsear fecha (puede venir como Date, string ISO, o vacío)
  const parseDate = (v: unknown): string | undefined => {
    if (!v || v === 'NaN' || v === 'NaT') return undefined;
    if (v instanceof Date) return v.toISOString().split('T')[0];
    const s = String(v).trim();
    if (!s || s === 'NaN' || s === 'NaT' || s === 'Invalid Date') return undefined;
    // Si tiene formato ISO, tomar solo la parte de fecha
    return s.split('T')[0];
  };

  const monedaRaw = r.moneda != null ? String(r.moneda).trim() : 'USD';
  const moneda: 'USD' | 'UYU' = monedaRaw === 'UYU' ? 'UYU' : 'USD';
  const tipoCambio = Number(r.tipoCambio) > 0 ? Number(r.tipoCambio) : 1;

  // La tarifa se conserva en su moneda original; la conversión a USD la hace tripRevenueUSD
  const tarifa = Number(r.tarifa) || 0;

  return {
    id: String(r.id ?? ''),
    fecha: String(r.fecha ?? '').split('T')[0],
    clientId: String(r.clientId ?? ''),
    estado: (r.estado as TripStatus) ?? 'Pendiente',
    contenido: String(r.contenido ?? ''),
    pesoKg: Number(r.pesoKg) || 0,
    kmRecorridos: Number(r.kmRecorridos) || 0,
    tarifa, // siempre en USD
    tarifaUYU: Number(r.tarifaUYU) || undefined,
    moneda,
    tipoCambio,
    origen: String(r.origen ?? ''),
    destino: String(r.destino ?? ''),
    facturaUrl: r.facturaUrl ? String(r.facturaUrl) : undefined,
    remitoUrl: r.remitoUrl ? String(r.remitoUrl) : undefined,
    asignadoA:
      r.asignadoA != null && String(r.asignadoA).trim() !== '' && String(r.asignadoA).trim() !== 'NaN'
        ? String(r.asignadoA).trim()
        : undefined,
    facturaGenerada: parseBool(r.facturaGenerada),
    facturaSolicitada: parseBool(r.facturaSolicitada),
    facturaFechaSolicitud: parseDate(r.facturaFechaSolicitud),
    facturaCobrada: parseBool(r.facturaCobrada),
    facturaFechaCobro: parseDate(r.facturaFechaCobro),
    scheduledCostId:
      r.scheduledCostId != null &&
      String(r.scheduledCostId).trim() !== '' &&
      String(r.scheduledCostId).trim() !== 'NaN'
        ? String(r.scheduledCostId)
        : undefined,
  };
}

export function normalizeClient(row: unknown): Client {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  let facturacion: BillingInfo | undefined;
  let tieneFacturacionDiferente = false;
  if (r.tieneFacturacionDiferente === true || r.tieneFacturacionDiferente === 'TRUE') {
    tieneFacturacionDiferente = true;
  }
  if (r.facturacion) {
    try {
      const parsed = typeof r.facturacion === 'string' ? JSON.parse(r.facturacion) : r.facturacion;
      if (parsed && typeof parsed === 'object') {
        facturacion = parsed as BillingInfo;
      }
    } catch {
      facturacion = undefined;
    }
  }
  const base: Client = {
    id: String(r.id ?? ''),
    nombreComercial: String(r.nombreComercial ?? ''),
    departamento: String(r.departamento ?? ''),
    localidad: String(r.localidad ?? ''),
    latitud: Number(r.latitud) || 0,
    longitud: Number(r.longitud) || 0,
  };
  const rut = r.rut != null ? String(r.rut).trim() : '';
  const email = r.email != null ? String(r.email).trim() : '';
  const telefono = r.telefono != null ? String(r.telefono).trim() : '';
  return {
    ...base,
    ...(rut ? { rut } : {}),
    ...(email ? { email } : {}),
    ...(telefono ? { telefono } : {}),
    ...(tieneFacturacionDiferente ? { tieneFacturacionDiferente } : {}),
    ...(facturacion ? { facturacion } : {}),
  };
}

const COST_CATEGORIES: Cost['categoria'][] = [
  'Combustible',
  'Sueldos',
  'Alquiler',
  'Cuota Banco',
  'Service',
  'Mantenimiento',
  'AD Blue',
  'Otros',
];

function normalizeCostCategory(value: unknown): Cost['categoria'] {
  const s = String(value ?? '').trim();
  // Mapeos de categorías legacy a las nuevas
  const legacyMap: Record<string, Cost['categoria']> = {
    Peajes: 'Otros',
    Viáticos: 'Otros',
    Neumáticos: 'Mantenimiento',
    Seguros: 'Otros',
  };
  if (legacyMap[s]) return legacyMap[s];
  return COST_CATEGORIES.includes(s as Cost['categoria']) ? (s as Cost['categoria']) : 'Otros';
}

function parseScheduledMonths(raw: unknown): string[] | undefined {
  if (raw == null || String(raw).trim() === '') {
    return undefined;
  }
  if (Array.isArray(raw)) {
    const arr = raw.filter((x): x is string => typeof x === 'string' && /^\d{4}-\d{2}$/.test(x));
    return arr.length > 0 ? arr : undefined;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const arr = parsed.filter((x): x is string => typeof x === 'string' && /^\d{4}-\d{2}$/.test(x));
        return arr.length > 0 ? arr : undefined;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function normalizeScheduledCostDefinition(row: unknown): ScheduledCostDefinition {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const tripRaw = r.tripId;
  const tripId =
    tripRaw === null || tripRaw === undefined || String(tripRaw).trim() === ''
      ? undefined
      : String(tripRaw).trim();
  const dm = Number(r.dayOfMonth);
  const dayOfMonth = Number.isFinite(dm) ? Math.min(28, Math.max(1, Math.floor(dm))) : 1;
  const defCurrency: 'USD' | 'UYU' = r.currency === 'UYU' ? 'UYU' : 'USD';
  return {
    id: String(r.id ?? ''),
    categoria: normalizeCostCategory(r.categoria),
    descripcion: String(r.descripcion ?? ''),
    monto: Number(r.monto) || 0,
    dayOfMonth,
    active: r.active === true || String(r.active).toUpperCase() === 'TRUE',
    creadoPor: String(r.creadoPor ?? ''),
    creadoEn: String(r.creadoEn ?? ''),
    currency: defCurrency,
    ...(tripId !== undefined ? { tripId } : {}),
  };
}

function getMockScheduledDefinitions(): ScheduledCostDefinition[] {
  if (mockScheduledCostDefinitionsCache === null) {
    mockScheduledCostDefinitionsCache = MOCK_DATA.scheduledCostDefinitions.map(
      normalizeScheduledCostDefinition
    );
  }
  return mockScheduledCostDefinitionsCache;
}

export function normalizeDocument(row: unknown): FleetDocument {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const parseDateOnly = (v: unknown): string => {
    if (v == null || v === '' || v === 'NaN' || v === 'NaT') return '';
    if (v instanceof Date) return v.toISOString().split('T')[0];
    const s = String(v).trim();
    if (!s || s === 'NaN' || s === 'NaT' || s === 'Invalid Date') return '';
    return s.split('T')[0];
  };
  const archivoRaw = r.archivoUrl;
  const archivoUrl =
    archivoRaw != null && String(archivoRaw).trim() !== '' && String(archivoRaw).trim() !== 'NaN'
      ? String(archivoRaw).trim()
      : undefined;
  const actualizado = parseDateOnly(r.actualizadoEn);
  return {
    id: String(r.id ?? ''),
    titulo: String(r.titulo ?? ''),
    categoria: normalizeDocumentCategory(r.categoria),
    entidadRef: String(r.entidadRef ?? ''),
    emitidoEn: parseDateOnly(r.emitidoEn),
    venceEn: parseDateOnly(r.venceEn),
    ...(archivoUrl ? { archivoUrl } : {}),
    notas: String(r.notas ?? ''),
    activo: r.activo === true || String(r.activo).toUpperCase() === 'TRUE',
    creadoPor: String(r.creadoPor ?? ''),
    creadoEn: parseDateOnly(r.creadoEn) || String(r.creadoEn ?? ''),
    ...(actualizado ? { actualizadoEn: actualizado } : {}),
  };
}

function getMockDocuments(): FleetDocument[] {
  if (mockDocumentsCache === null) {
    mockDocumentsCache = MOCK_DATA.documents.map((d) => normalizeDocument(d));
  }
  return mockDocumentsCache;
}

let mockReportEmailsCache: ReportEmailEntry[] | null = null;

function getMockReportEmails(): ReportEmailEntry[] {
  if (mockReportEmailsCache === null) {
    mockReportEmailsCache = MOCK_DATA.reportEmails.map((e) => normalizeReportEmail(e));
  }
  return mockReportEmailsCache;
}

export function normalizeCost(row: unknown): Cost {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const tripIdRaw = r.tripId;
  const tripId =
    tripIdRaw === null ||
    tripIdRaw === undefined ||
    String(tripIdRaw).trim() === '' ||
    String(tripIdRaw).trim() === 'NaN'
      ? null
      : String(tripIdRaw);

  const monedaRaw = r.moneda ?? r.currency;
  // Default a 'USD' (más seguro: en caso de duda no dividimos por tipo de cambio)
  const moneda: 'USD' | 'UYU' = String(monedaRaw ?? 'USD').trim() === 'UYU' ? 'UYU' : 'USD';
  const tipoCambio = Number(r.tipoCambio) > 0 ? Number(r.tipoCambio) : 40;

  // montoUSD viene precalculado del backend; si no, calcularlo
  let montoUSD: number;
  if (Number(r.montoUSD) > 0) {
    montoUSD = Number(r.montoUSD);
  } else if (moneda === 'USD') {
    montoUSD = Number(r.monto) || 0;
  } else {
    montoUSD = (Number(r.monto) || 0) / tipoCambio;
  }

  return {
    id: String(r.id ?? ''),
    fecha: String(r.fecha ?? '').split('T')[0],
    tripId,
    categoria: normalizeCostCategory(r.categoria),
    descripcion: String(r.descripcion ?? ''),
    monto: Number(r.monto) || 0,
    moneda,
    tipoCambio,
    montoUSD,
    comprobante:
      r.comprobante !== undefined &&
      r.comprobante !== null &&
      String(r.comprobante).trim() !== '' &&
      String(r.comprobante).trim() !== 'NaN'
        ? String(r.comprobante)
        : undefined,
    registradoPor: String(r.registradoPor ?? ''),
    isScheduled: Boolean(r.isScheduled),
    scheduleId:
      r.scheduleId != null && String(r.scheduleId).trim() !== '' && String(r.scheduleId).trim() !== 'NaN'
        ? String(r.scheduleId)
        : undefined,
  };
}

export interface LogisticsData {
  clients: Client[];
  trips: Trip[];
  costs: Cost[];
  /** Present on the same GET dump as clients/trips/costs (Apps Script already sends the key). */
  scheduledCostDefinitions: ScheduledCostDefinition[];
  /** Fleet documents; empty array if old GAS omits the key. */
  documents: FleetDocument[];
  /** Authorized report emails; empty array if old GAS omits the key. */
  reportEmails: ReportEmailEntry[];
}

/** GET dump timeout — aligned to observed Apps Script p95 (often 8–22s). */
export const LOGISTICS_GET_TIMEOUT_MS = 30_000;
const LOGISTICS_GET_MAX_ATTEMPTS = 3;
const LOGISTICS_GET_RETRY_BACKOFF_MS = [400, 1000] as const;

export type LogisticsGetFailureKind = 'http' | 'html' | 'invalid_json' | 'network' | 'timeout';

export interface LogisticsGetAttemptFailure {
  kind: LogisticsGetFailureKind;
  message: string;
  httpStatus?: number;
}

/** Whether a classified logistics GET failure should be retried (404 / HTML / network flakes). */
export function isRetryableLogisticsGetFailure(failure: LogisticsGetAttemptFailure): boolean {
  if (failure.kind === 'http') {
    const status = failure.httpStatus;
    return status === 404 || (typeof status === 'number' && status >= 500);
  }
  return (
    failure.kind === 'html' ||
    failure.kind === 'network' ||
    failure.kind === 'timeout' ||
    failure.kind === 'invalid_json'
  );
}

function cloneMockData(): LogisticsData {
  return {
    clients: MOCK_DATA.clients.map((c) => normalizeClient(c)),
    trips: MOCK_DATA.trips.map((t) => normalizeTrip(t)),
    costs: MOCK_DATA.costs.map((c) => normalizeCost(c)),
    scheduledCostDefinitions: getMockScheduledDefinitions().map((d) => ({ ...d })),
    documents: getMockDocuments().map((d) => ({ ...d })),
    reportEmails: getMockReportEmails().map((e) => ({ ...e })),
  };
}

function mapLogisticsRecord(record: {
  clients?: unknown;
  trips?: unknown;
  costs?: unknown;
  scheduledCostDefinitions?: unknown;
  documents?: unknown;
  reportEmails?: unknown;
}): LogisticsData {
  const clientsRaw = Array.isArray(record.clients) ? record.clients : [];
  const tripsRaw = Array.isArray(record.trips) ? record.trips : [];
  const costsRaw = Array.isArray(record.costs) ? record.costs : [];
  const defsRaw = Array.isArray(record.scheduledCostDefinitions)
    ? record.scheduledCostDefinitions
    : [];
  // Old GAS without documents / reportEmails key → empty array (do not throw).
  const docsRaw = Array.isArray(record.documents) ? record.documents : [];
  const emailsRaw = Array.isArray(record.reportEmails) ? record.reportEmails : [];
  return {
    clients: clientsRaw.map((row) => normalizeClient(row)),
    trips: tripsRaw.map((row) => normalizeTrip(row)),
    costs: costsRaw.map((row) => normalizeCost(row)),
    scheduledCostDefinitions: defsRaw.map((row) => normalizeScheduledCostDefinition(row)),
    documents: docsRaw.map((row) => normalizeDocument(row)),
    reportEmails: emailsRaw.map((row) => normalizeReportEmail(row)),
  };
}

async function attemptLogisticsGet(
  url: string
): Promise<{ ok: true; data: LogisticsData } | { ok: false; failure: LogisticsGetAttemptFailure }> {
  try {
    const response = await fetchWithTimeout(
      url,
      { method: 'GET', cache: 'no-store' },
      LOGISTICS_GET_TIMEOUT_MS
    );

    if (!response.ok) {
      return {
        ok: false,
        failure: {
          kind: 'http',
          message: `HTTP ${response.status}: ${response.statusText}`,
          httpStatus: response.status,
        },
      };
    }

    const text = await response.text();

    if (responseLooksLikeHtml(text)) {
      return {
        ok: false,
        failure: {
          kind: 'html',
          message: 'Apps Script devolvió HTML — re-deployar como "Cualquier persona"',
        },
      };
    }

    let record: {
      clients?: unknown;
      trips?: unknown;
      costs?: unknown;
      scheduledCostDefinitions?: unknown;
      documents?: unknown;
      reportEmails?: unknown;
    };
    try {
      record = JSON.parse(text) as typeof record;
    } catch {
      return {
        ok: false,
        failure: { kind: 'invalid_json', message: 'Respuesta GET no es JSON' },
      };
    }

    return { ok: true, data: mapLogisticsRecord(record) };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        ok: false,
        failure: {
          kind: 'timeout',
          message: `Timeout al conectar con Google Sheets (${LOGISTICS_GET_TIMEOUT_MS / 1000}s)`,
        },
      };
    }
    return {
      ok: false,
      failure: {
        kind: 'network',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Core GET loader. Prefer `fetchLogisticsData()` in app code.
 * Exported for regression tests (configured URL + failure must not return mock rows).
 * Includes scheduledCostDefinitions from the same payload (no second GET).
 */
export async function fetchLogisticsDataFromUrl(
  sheetUrl: string,
  options?: { treatAsProd?: boolean }
): Promise<LogisticsData> {
  const url = String(sheetUrl ?? '').trim();
  const treatAsProd = options?.treatAsProd ?? Boolean(import.meta.env.PROD);

  if (!url) {
    if (treatAsProd || !isMockEnvironment()) {
      logisticsFetchUsedMock = false;
      throw new Error('VITE_SHEET_URL no configurada en producción');
    }
    logisticsFetchUsedMock = true;
    console.info('[GDC API] Modo mock activo — VITE_SHEET_URL no configurada');
    return cloneMockData();
  }

  let lastFailure: LogisticsGetAttemptFailure | null = null;

  for (let attempt = 1; attempt <= LOGISTICS_GET_MAX_ATTEMPTS; attempt++) {
    const result = await attemptLogisticsGet(url);
    if (result.ok) {
      logisticsFetchUsedMock = false;
      return result.data;
    }

    lastFailure = result.failure;
    const retryable = isRetryableLogisticsGetFailure(result.failure);
    const canRetry = retryable && attempt < LOGISTICS_GET_MAX_ATTEMPTS;

    console.error('[GDC API] fetchLogisticsData intento falló:', {
      attempt,
      kind: result.failure.kind,
      httpStatus: result.failure.httpStatus,
      message: result.failure.message.slice(0, 200),
      retrying: canRetry,
    });

    if (!canRetry) {
      break;
    }

    const backoff = LOGISTICS_GET_RETRY_BACKOFF_MS[attempt - 1] ?? 1000;
    await delay(backoff);
  }

  // Real backend URL configured: never substitute cloneMockData()
  logisticsFetchUsedMock = false;
  throw new Error(lastFailure?.message ?? 'fetchLogisticsData falló');
}

export async function fetchLogisticsData(): Promise<LogisticsData> {
  return fetchLogisticsDataFromUrl(SHEET_URL);
}

async function postSheet(type: string, data: unknown): Promise<boolean> {
  if (IS_MOCK) {
    await delay(MOCK_DELAY_MS);
    if (type === 'saveScheduledCost') {
      getMockScheduledDefinitions().push(normalizeScheduledCostDefinition(data));
      return true;
    }
    if (type === 'updateScheduledCost') {
      const def = normalizeScheduledCostDefinition(data);
      const arr = getMockScheduledDefinitions();
      const idx = arr.findIndex((d) => d.id === def.id);
      if (idx >= 0) {
        arr[idx] = def;
      }
      return true;
    }
    if (type === 'deleteScheduledCost') {
      const rec = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
      const id = String(rec.id ?? '');
      const filtered = getMockScheduledDefinitions().filter((d) => d.id !== id);
      mockScheduledCostDefinitionsCache = filtered;
      return true;
    }
    if (type === 'document') {
      getMockDocuments().push(normalizeDocument(data));
      return true;
    }
    if (type === 'updateDocument') {
      const doc = normalizeDocument(data);
      const arr = getMockDocuments();
      const idx = arr.findIndex((d) => d.id === doc.id);
      if (idx >= 0) {
        arr[idx] = doc;
      }
      return true;
    }
    if (type === 'deleteDocument') {
      const rec = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
      const id = String(rec.id ?? '');
      const arr = getMockDocuments();
      const idx = arr.findIndex((d) => d.id === id);
      if (idx >= 0) {
        arr[idx] = {
          ...arr[idx],
          activo: false,
          actualizadoEn: new Date().toISOString().split('T')[0],
        };
      }
      return true;
    }
    if (type === 'reportEmail') {
      const entry = normalizeReportEmail(data);
      if (!entry.email) return false;
      const arr = getMockReportEmails();
      const idx = arr.findIndex((e) => e.email === entry.email);
      if (idx >= 0) {
        // Upsert: do not overwrite autoMonthly if sheet already has the email (migrate path).
        const incoming = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
        const keepAuto =
          incoming.preserveAutoMonthly === true || incoming.preserveAutoMonthly === 'TRUE';
        arr[idx] = {
          ...arr[idx],
          ...entry,
          autoMonthly: keepAuto ? arr[idx].autoMonthly : entry.autoMonthly,
          activo: true,
        };
      } else {
        if (arr.filter((e) => e.activo).length >= MAX_REPORT_EMAILS) return false;
        arr.push({ ...entry, activo: true });
      }
      return true;
    }
    if (type === 'updateReportEmail') {
      const entry = normalizeReportEmail(data);
      const arr = getMockReportEmails();
      const idx = arr.findIndex((e) => e.email === entry.email);
      if (idx >= 0) {
        arr[idx] = { ...arr[idx], ...entry };
      }
      return true;
    }
    if (type === 'deleteReportEmail') {
      const rec = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
      const email = String(rec.email ?? '')
        .trim()
        .toLowerCase();
      const arr = getMockReportEmails();
      const idx = arr.findIndex((e) => e.email === email);
      if (idx >= 0) {
        arr[idx] = {
          ...arr[idx],
          activo: false,
          updatedAt: new Date().toISOString().split('T')[0],
        };
      }
      return true;
    }
    return true;
  }
  try {
    const response = await fetchWithTimeout(
      SHEET_URL,
      {
        method: 'POST',
        headers: APPS_SCRIPT_PLAIN_HEADERS,
        body: JSON.stringify({ type, data }),
      },
      20000
    );

    if (!response.ok) {
      console.error(`[GDC API] POST ${type} — HTTP ${response.status} ${response.statusText}`);
      return false;
    }

    const text = await response.text();

    if (responseLooksLikeHtml(text)) {
      console.error(`[GDC API] POST ${type} — Apps Script devolvió HTML`);
      return false;
    }

    let result: { status?: string; message?: string };
    try {
      result = JSON.parse(text) as { status?: string; message?: string };
    } catch {
      console.error(`[GDC API] POST ${type} — respuesta no es JSON válido`);
      return false;
    }
    if (result.status === 'error') {
      console.error(`[GDC API] POST ${type} — error del servidor:`, result.message);
      return false;
    }
    return true;
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.error(`[GDC API] POST ${type} error:`, error);
    }
    return false;
  }
}

const MOCK_ADMIN: User = { username: 'admin', nombre: 'Administrador Maestro', role: 'admin' };
const MOCK_OPERATIVO: User = {
  username: 'operativo',
  nombre: 'Usuario Operativo',
  role: 'operativo',
};

export async function loginUser(username: string, password: string): Promise<User | null> {
  if (IS_MOCK) {
    if (username === 'admin' && password === 'admin123') {
      return MOCK_ADMIN;
    }
    if (username === 'operativo' && password === 'op123') {
      return MOCK_OPERATIVO;
    }
    return null;
  }

  try {
    const response = await fetchWithTimeout(
      SHEET_URL,
      {
        method: 'POST',
        headers: APPS_SCRIPT_PLAIN_HEADERS,
        body: JSON.stringify({ type: 'login', data: { username, password } }),
      },
      10000
    );

    const text = await response.text();

    if (responseLooksLikeHtml(text)) {
      console.warn('[GDC API] Login — fallback a credenciales locales');
      if (username === 'admin' && password === 'admin123') {
        return MOCK_ADMIN;
      }
      if (username === 'operativo' && password === 'op123') {
        return MOCK_OPERATIVO;
      }
      return null;
    }

    const result = JSON.parse(text) as { status?: string; user?: User };
    return result.status === 'success' && result.user ? result.user : null;
  } catch (error) {
    console.error('[GDC API] loginUser error:', error);
    if (username === 'admin' && password === 'admin123') {
      return MOCK_ADMIN;
    }
    if (username === 'operativo' && password === 'op123') {
      return MOCK_OPERATIVO;
    }
    return null;
  }
}

function tripPayloadForSheet(trip: Trip) {
  return {
    ...trip,
    moneda: trip.moneda ?? 'USD',
    tipoCambio: trip.tipoCambio ?? 1,
    tarifaUYU: trip.tarifaUYU,
    facturaGenerada: trip.facturaGenerada,
    facturaSolicitada: trip.facturaSolicitada,
    facturaFechaSolicitud: trip.facturaFechaSolicitud,
    facturaCobrada: trip.facturaCobrada,
    facturaFechaCobro: trip.facturaFechaCobro,
  };
}

export async function saveTripToSheet(trip: Trip): Promise<boolean> {
  return postSheet('trip', tripPayloadForSheet(trip));
}

export async function updateTripInSheet(trip: Trip): Promise<boolean> {
  return postSheet('updateTrip', tripPayloadForSheet(trip));
}

export async function deleteTripFromSheet(id: string): Promise<boolean> {
  return postSheet('deleteTrip', { id });
}

/** Result of a Drive upload (remito / invoice) via Apps Script. */
export interface DriveUploadResult {
  ok: boolean;
  url?: string;
  message?: string;
}

const UPLOAD_MAX_ATTEMPTS = 3;
const UPLOAD_RETRY_BACKOFF_MS = [500, 1200] as const;

export type DriveUploadFailureKind =
  | 'http'
  | 'html'
  | 'invalid_json'
  | 'empty_url'
  | 'server_error'
  | 'network';

export interface DriveUploadAttemptFailure {
  kind: DriveUploadFailureKind;
  message: string;
  httpStatus?: number;
  serverMessage?: string;
}

/** True when Apps Script `status:error` message looks transient (safe to retry). */
export function isTransientAppsScriptErrorMessage(message?: string): boolean {
  if (!message) return false;
  return /timeout|temporar|unavailable|try again|reintent|503|502|429|rate.?limit|service error|internal error|network/i.test(
    message
  );
}

/** Whether a classified upload failure should be retried. */
export function isRetryableUploadFailure(failure: DriveUploadAttemptFailure): boolean {
  if (failure.kind === 'server_error') {
    return isTransientAppsScriptErrorMessage(failure.serverMessage ?? failure.message);
  }
  if (failure.kind === 'http') {
    const status = failure.httpStatus;
    // Intermittent Apps Script 404s are the main flake; also retry 5xx.
    return status === 404 || (typeof status === 'number' && status >= 500);
  }
  return (
    failure.kind === 'html' ||
    failure.kind === 'invalid_json' ||
    failure.kind === 'empty_url' ||
    failure.kind === 'network'
  );
}

/** Parse Apps Script upload JSON into success URL or failure (unit-testable). */
export function parseDriveUploadResponse(text: string):
  | { ok: true; url: string }
  | { ok: false; failure: DriveUploadAttemptFailure } {
  if (responseLooksLikeHtml(text)) {
    return {
      ok: false,
      failure: {
        kind: 'html',
        message: 'Apps Script devolvió HTML en lugar de JSON',
      },
    };
  }
  let result: { status?: string; url?: string; message?: string };
  try {
    result = JSON.parse(text) as { status?: string; url?: string; message?: string };
  } catch {
    return {
      ok: false,
      failure: {
        kind: 'invalid_json',
        message: 'Respuesta no es JSON',
      },
    };
  }
  if (result.status === 'error') {
    const serverMessage = result.message ? String(result.message) : 'Error del servidor';
    return {
      ok: false,
      failure: {
        kind: 'server_error',
        message: serverMessage,
        serverMessage,
      },
    };
  }
  if (result.status === 'success' && result.url) {
    return { ok: true, url: String(result.url) };
  }
  return {
    ok: false,
    failure: {
      kind: 'empty_url',
      message: 'Respuesta sin URL de archivo',
      serverMessage: result.message ? String(result.message) : undefined,
    },
  };
}

function logUploadDiag(
  label: string,
  attempt: number,
  detail: { httpStatus?: number; kind?: string; message?: string }
): void {
  // Never log folder IDs or file bytes — only status / attempt / redacted message.
  console.error(`[GDC API] ${label}`, {
    attempt,
    httpStatus: detail.httpStatus,
    kind: detail.kind,
    message: detail.message ? String(detail.message).slice(0, 200) : undefined,
  });
}

async function postDriveUpload(options: {
  label: string;
  type: 'uploadInvoice' | 'uploadRemito' | 'uploadDocument';
  /** tripId for remito/invoice; documentId for documents. */
  entityId: string;
  idField: 'tripId' | 'documentId';
  fileData: string;
  fileName: string;
  mimeType: string;
  folderId: string;
}): Promise<DriveUploadResult> {
  let lastMessage = 'No se pudo subir el archivo';

  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const idPayload =
        options.idField === 'documentId'
          ? { documentId: options.entityId }
          : { tripId: options.entityId };
      const response = await fetchWithTimeout(
        SHEET_URL,
        {
          method: 'POST',
          headers: APPS_SCRIPT_PLAIN_HEADERS,
          body: JSON.stringify({
            type: options.type,
            data: {
              ...idPayload,
              fileData: options.fileData,
              fileName: options.fileName,
              mimeType: options.mimeType,
              folderId: options.folderId,
            },
          }),
        },
        UPLOAD_FETCH_TIMEOUT_MS
      );

      if (!response.ok) {
        const failure: DriveUploadAttemptFailure = {
          kind: 'http',
          message: `HTTP ${response.status}`,
          httpStatus: response.status,
        };
        lastMessage = failure.message;
        logUploadDiag(options.label, attempt, {
          httpStatus: response.status,
          kind: failure.kind,
          message: failure.message,
        });
        if (attempt < UPLOAD_MAX_ATTEMPTS && isRetryableUploadFailure(failure)) {
          await delay(UPLOAD_RETRY_BACKOFF_MS[attempt - 1] ?? 1500);
          continue;
        }
        return { ok: false, message: lastMessage };
      }

      const text = await response.text();
      const parsed = parseDriveUploadResponse(text);
      if (parsed.ok) {
        return { ok: true, url: parsed.url };
      }

      lastMessage = parsed.failure.message;
      logUploadDiag(options.label, attempt, {
        httpStatus: response.status,
        kind: parsed.failure.kind,
        message: parsed.failure.message,
      });

      if (attempt < UPLOAD_MAX_ATTEMPTS && isRetryableUploadFailure(parsed.failure)) {
        await delay(UPLOAD_RETRY_BACKOFF_MS[attempt - 1] ?? 1500);
        continue;
      }
      return { ok: false, message: lastMessage };
    } catch (error) {
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const failure: DriveUploadAttemptFailure = {
        kind: 'network',
        message: isAbort
          ? 'Tiempo de espera agotado al subir'
          : error instanceof Error
            ? error.message || 'Error de red'
            : 'Error de red',
      };
      lastMessage = failure.message;
      logUploadDiag(options.label, attempt, { kind: failure.kind, message: failure.message });
      if (attempt < UPLOAD_MAX_ATTEMPTS && isRetryableUploadFailure(failure)) {
        await delay(UPLOAD_RETRY_BACKOFF_MS[attempt - 1] ?? 1500);
        continue;
      }
      return { ok: false, message: lastMessage };
    }
  }

  return { ok: false, message: lastMessage };
}

export async function uploadInvoice(
  tripId: string,
  fileData: string,
  fileName: string,
  mimeType: string
): Promise<DriveUploadResult> {
  if (IS_MOCK) {
    await delay(MOCK_DELAY_MS);
    return {
      ok: true,
      url: `https://mock-invoice.local/${encodeURIComponent(tripId)}/${encodeURIComponent(fileName)}`,
    };
  }
  return postDriveUpload({
    label: 'uploadInvoice',
    type: 'uploadInvoice',
    entityId: tripId,
    idField: 'tripId',
    fileData,
    fileName,
    mimeType,
    folderId: DRIVE_FOLDER_FACTURAS,
  });
}

/** Sube imagen de remito a Drive vía Apps Script (`type: uploadRemito`). */
export async function uploadRemitoImage(
  tripId: string,
  fileData: string,
  fileName: string,
  mimeType: string
): Promise<DriveUploadResult> {
  if (IS_MOCK) {
    await delay(MOCK_DELAY_MS);
    console.info('[GDC API] Mock uploadRemitoImage:', fileName);
    return {
      ok: true,
      url: `https://drive.google.com/mock-remito/${encodeURIComponent(tripId)}/${encodeURIComponent(fileName)}`,
    };
  }
  return postDriveUpload({
    label: 'uploadRemitoImage',
    type: 'uploadRemito',
    entityId: tripId,
    idField: 'tripId',
    fileData,
    fileName,
    mimeType,
    folderId: DRIVE_FOLDER_REMITOS,
  });
}

/** Sube archivo de documento a Drive (`type: uploadDocument`). */
export async function uploadDocumentFile(
  documentId: string,
  fileData: string,
  fileName: string,
  mimeType: string
): Promise<DriveUploadResult> {
  if (IS_MOCK) {
    await delay(MOCK_DELAY_MS);
    const url = `https://drive.google.com/mock-documento/${encodeURIComponent(documentId)}/${encodeURIComponent(fileName)}`;
    const arr = getMockDocuments();
    const idx = arr.findIndex((d) => d.id === documentId);
    if (idx >= 0) {
      arr[idx] = {
        ...arr[idx],
        archivoUrl: url,
        actualizadoEn: new Date().toISOString().split('T')[0],
      };
    }
    return { ok: true, url };
  }
  return postDriveUpload({
    label: 'uploadDocumentFile',
    type: 'uploadDocument',
    entityId: documentId,
    idField: 'documentId',
    fileData,
    fileName,
    mimeType,
    folderId: DRIVE_FOLDER_DOCUMENTOS,
  });
}

export interface SendReportEmailParams {
  to: string;
  subject: string;
  message: string;
  pdfBase64: string;
  fileName: string;
  /** Optional YYYY-MM for DB_ReportLog audit. */
  monthKey?: string;
}

export interface SendReportEmailResult {
  ok: boolean;
  error?: string;
}

/** Envía el reporte PDF por email vía Apps Script (`type: sendReportEmail`). */
export async function sendReportByEmail(params: SendReportEmailParams): Promise<SendReportEmailResult> {
  if (IS_MOCK) {
    await delay(MOCK_DELAY_MS);
    console.info('[GDC API] Mock sendReportByEmail →', params.to, params.fileName);
    return { ok: true };
  }
  try {
    const response = await fetchWithTimeout(
      SHEET_URL,
      {
        method: 'POST',
        headers: APPS_SCRIPT_PLAIN_HEADERS,
        body: JSON.stringify({
          type: 'sendReportEmail',
          data: {
            to: params.to,
            subject: params.subject,
            message: params.message,
            fileData: params.pdfBase64,
            fileName: params.fileName,
            mimeType: 'application/pdf',
            monthKey: params.monthKey || '',
          },
        }),
      },
      UPLOAD_FETCH_TIMEOUT_MS
    );
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }
    const text = await response.text();
    if (responseLooksLikeHtml(text)) {
      return { ok: false, error: 'El backend devolvió HTML (re-deployá el Apps Script).' };
    }
    let result: { status?: string; message?: string };
    try {
      result = JSON.parse(text) as { status?: string; message?: string };
    } catch {
      return { ok: false, error: 'Respuesta del servidor no válida.' };
    }
    if (result.status === 'error') {
      return { ok: false, error: result.message ?? 'Error del servidor.' };
    }
    return { ok: true };
  } catch (error) {
    const msg =
      error instanceof Error && error.name === 'AbortError'
        ? 'Tiempo de espera agotado.'
        : error instanceof Error
          ? error.message
          : 'Error de red.';
    return { ok: false, error: msg };
  }
}

export async function saveClientToSheet(client: Client): Promise<void> {
  await postSheet('client', client);
}

export async function saveCostToSheet(cost: Cost): Promise<boolean> {
  return postSheet('cost', {
    ...cost,
    moneda: cost.moneda ?? 'USD',
    tipoCambio: cost.tipoCambio ?? 1,
    montoUSD: cost.montoUSD ?? cost.monto,
  });
}

export async function updateCostInSheet(cost: Cost): Promise<boolean> {
  return postSheet('updateCost', {
    ...cost,
    moneda: cost.moneda ?? 'USD',
    tipoCambio: cost.tipoCambio ?? 1,
    montoUSD: cost.montoUSD ?? cost.monto,
  });
}

export async function deleteCostFromSheet(id: string): Promise<boolean> {
  return postSheet('deleteCost', { id });
}

/** Prefer defs from `fetchLogisticsData()` when already loaded; this helper keeps a standalone path for other callers. */
export async function fetchScheduledCostDefinitions(): Promise<ScheduledCostDefinition[]> {
  if (IS_MOCK) {
    return getMockScheduledDefinitions().map((d) => ({ ...d }));
  }

  try {
    const data = await fetchLogisticsData();
    return data.scheduledCostDefinitions;
  } catch (error) {
    console.error('[GDC API] fetchScheduledCostDefinitions falló:', error);
    // Same rule as fetchLogisticsData: no silent mock when talking to a real backend.
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export interface HealthSheetStatus {
  exists: boolean;
  rows: number;
}

export interface HealthDriveStatus {
  ok: boolean;
  error?: string;
}

export interface HealthResponse {
  status: 'success' | 'error';
  sheets: Record<string, HealthSheetStatus>;
  drive: {
    remitos?: HealthDriveStatus;
    facturas?: HealthDriveStatus;
    documentos?: HealthDriveStatus;
  };
  latencyMs?: number;
  message?: string;
}

/** Parse Apps Script POST JSON `{ status, message? }` (unknown-type contract). */
export function parseAppsScriptStatusResponse(body: unknown): {
  status: string;
  message?: string;
  isError: boolean;
} {
  if (!body || typeof body !== 'object') {
    return { status: 'error', message: 'invalid response', isError: true };
  }
  const rec = body as Record<string, unknown>;
  const status = String(rec.status ?? '');
  const message = rec.message != null ? String(rec.message) : undefined;
  return { status, message, isError: status !== 'success' };
}

/** True when body matches unknown-type error contract from GAS doPost. */
export function isUnknownTypeErrorResponse(body: unknown): boolean {
  const parsed = parseAppsScriptStatusResponse(body);
  return (
    parsed.isError &&
    typeof parsed.message === 'string' &&
    /^Unknown type:/i.test(parsed.message)
  );
}

/** Contract check for health probe JSON (unit-testable; no live GAS). */
export function isValidHealthResponse(value: unknown): value is HealthResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.status !== 'success' && v.status !== 'error') return false;
  if (!v.sheets || typeof v.sheets !== 'object' || Array.isArray(v.sheets)) return false;
  for (const info of Object.values(v.sheets as Record<string, unknown>)) {
    if (!info || typeof info !== 'object') return false;
    const row = info as Record<string, unknown>;
    if (typeof row.exists !== 'boolean') return false;
    if (typeof row.rows !== 'number') return false;
  }
  if (v.drive != null) {
    if (typeof v.drive !== 'object' || Array.isArray(v.drive)) return false;
    for (const info of Object.values(v.drive as Record<string, unknown>)) {
      if (info == null) continue;
      if (typeof info !== 'object') return false;
      if (typeof (info as Record<string, unknown>).ok !== 'boolean') return false;
    }
  }
  if (v.latencyMs != null && typeof v.latencyMs !== 'number') return false;
  return true;
}

/** Probe Sheets tabs + Drive folder ACLs via Apps Script `type: health`. */
export async function fetchHealth(): Promise<HealthResponse> {
  if (!SHEET_URL) {
    throw new Error('VITE_SHEET_URL no configurada');
  }
  const data: Record<string, string> = {};
  if (DRIVE_FOLDER_REMITOS) data.remitosFolderId = DRIVE_FOLDER_REMITOS;
  if (DRIVE_FOLDER_FACTURAS) data.facturasFolderId = DRIVE_FOLDER_FACTURAS;
  if (DRIVE_FOLDER_DOCUMENTOS) data.documentosFolderId = DRIVE_FOLDER_DOCUMENTOS;

  const response = await fetchWithTimeout(
    SHEET_URL,
    {
      method: 'POST',
      headers: APPS_SCRIPT_PLAIN_HEADERS,
      body: JSON.stringify({ type: 'health', data }),
    },
    20000
  );

  if (!response.ok) {
    throw new Error(`Health HTTP ${response.status}: ${response.statusText}`);
  }

  const text = await response.text();
  if (responseLooksLikeHtml(text)) {
    throw new Error('Health devolvió HTML — re-deployar Apps Script');
  }

  const parsed = JSON.parse(text) as HealthResponse;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Health: respuesta inválida');
  }
  return {
    status: parsed.status === 'error' ? 'error' : 'success',
    sheets: parsed.sheets && typeof parsed.sheets === 'object' ? parsed.sheets : {},
    drive: parsed.drive && typeof parsed.drive === 'object' ? parsed.drive : {},
    latencyMs: typeof parsed.latencyMs === 'number' ? parsed.latencyMs : undefined,
    message: parsed.message,
  };
}

export async function saveScheduledCostDefinition(def: ScheduledCostDefinition): Promise<void> {
  const ok = await postSheet('saveScheduledCost', def);
  if (!ok) {
    throw new Error('No se pudo guardar la definición de costo programado');
  }
}

export async function updateScheduledCostDefinition(def: ScheduledCostDefinition): Promise<void> {
  const ok = await postSheet('updateScheduledCost', def);
  if (!ok) {
    throw new Error('No se pudo actualizar la definición de costo programado');
  }
}

export async function deleteScheduledCostDefinition(id: string): Promise<void> {
  const ok = await postSheet('deleteScheduledCost', { id });
  if (!ok) {
    throw new Error('No se pudo eliminar la definición de costo programado');
  }
}

export async function saveDocumentToSheet(doc: FleetDocument): Promise<boolean> {
  return postSheet('document', doc);
}

export async function updateDocumentInSheet(doc: FleetDocument): Promise<boolean> {
  return postSheet('updateDocument', doc);
}

/** Soft-delete: sets activo=FALSE in Sheets. */
export async function deleteDocumentFromSheet(id: string): Promise<boolean> {
  return postSheet('deleteDocument', {
    id,
    actualizadoEn: new Date().toISOString().split('T')[0],
  });
}

/** Upsert authorized report email (DB_ReportEmails). */
export async function saveReportEmailToSheet(
  entry: ReportEmailEntry & { preserveAutoMonthly?: boolean }
): Promise<boolean> {
  return postSheet('reportEmail', entry);
}

export async function updateReportEmailInSheet(entry: ReportEmailEntry): Promise<boolean> {
  return postSheet('updateReportEmail', entry);
}

/** Soft-delete: sets activo=FALSE. */
export async function deleteReportEmailFromSheet(email: string): Promise<boolean> {
  return postSheet('deleteReportEmail', {
    email: String(email).trim().toLowerCase(),
    updatedAt: new Date().toISOString().split('T')[0],
  });
}
