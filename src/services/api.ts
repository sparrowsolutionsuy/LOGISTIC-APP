import type { BillingInfo, Client, Cost, ScheduledCostDefinition, Trip, TripStatus, User } from '../types';
import { DEFAULT_EXCHANGE_RATE, MOCK_DATA } from '../constants';

const SHEET_URL = String(import.meta.env.VITE_SHEET_URL ?? '').trim();
const DRIVE_FOLDER_REMITOS = String(import.meta.env.VITE_DRIVE_FOLDER_REMITOS ?? '').trim();
const DRIVE_FOLDER_FACTURAS = String(import.meta.env.VITE_DRIVE_FOLDER_FACTURAS ?? '').trim();

/** Sin URL de Web App en el build → modo mock local. */
export const IS_MOCK = !SHEET_URL;

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

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
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
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: 'follow',
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/** Normaliza fila remota o parcial a `Trip` (sin `any` en la firma pública). */
export function normalizeTrip(row: unknown): Trip {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  return {
    id: String(r.id ?? ''),
    fecha: String(r.fecha ?? ''),
    clientId: String(r.clientId ?? ''),
    estado: (r.estado as TripStatus) ?? 'Pendiente',
    contenido: String(r.contenido ?? ''),
    pesoKg: Number(r.pesoKg) || 0,
    kmRecorridos: Number(r.kmRecorridos) || 0,
    tarifa: Number(r.tarifa) || 0,
    origen: String(r.origen ?? ''),
    destino: String(r.destino ?? ''),
    facturaUrl: r.facturaUrl ? String(r.facturaUrl) : undefined,
    remitoUrl: r.remitoUrl ? String(r.remitoUrl) : undefined,
    asignadoA:
      r.asignadoA != null && String(r.asignadoA).trim() !== ''
        ? String(r.asignadoA).trim()
        : undefined,
    moneda: (r.moneda === 'UYU' ? 'UYU' : 'USD') as 'USD' | 'UYU',
    tipoCambio:
      r.tipoCambio && Number(r.tipoCambio) > 0 ? Number(r.tipoCambio) : undefined,
    ...(Number(r.tarifaUYU) > 0 ? { tarifaUYU: Number(r.tarifaUYU) } : {}),
    ...(normalizeBillingFlags(r) as Partial<Pick<Trip, 'facturaGenerada' | 'facturaSolicitada' | 'facturaCobrada'>>),
    ...(r.facturaFechaSolicitud ? { facturaFechaSolicitud: String(r.facturaFechaSolicitud) } : {}),
    ...(r.facturaFechaCobro ? { facturaFechaCobro: String(r.facturaFechaCobro) } : {}),
  };
}

function normalizeBillingFlags(row: Record<string, unknown>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const truthy = (v: unknown) => v === true || String(v).toUpperCase() === 'TRUE';
  if ('facturaGenerada' in row) {
    out.facturaGenerada = truthy(row.facturaGenerada);
  }
  if ('facturaSolicitada' in row) {
    out.facturaSolicitada = truthy(row.facturaSolicitada);
  }
  if ('facturaCobrada' in row) {
    out.facturaCobrada = truthy(row.facturaCobrada);
  }
  return out;
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
  'Mantenimiento',
  'Peajes',
  'Viáticos',
  'Neumáticos',
  'Seguros',
  'Otros',
];

function normalizeCostCategory(value: unknown): Cost['categoria'] {
  const s = String(value ?? '');
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

export function normalizeCost(row: unknown): Cost {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const tripIdRaw = r.tripId;
  const tripId =
    tripIdRaw === null || tripIdRaw === undefined || String(tripIdRaw) === ''
      ? null
      : String(tripIdRaw);

  const montoRaw = Number(r.monto) || 0;
  const currency: 'USD' | 'UYU' =
    r.currency === 'UYU' || r.moneda === 'UYU' ? 'UYU' : 'USD';
  const moneda = currency;
  const tipoCambio = Number(r.tipoCambio) || DEFAULT_EXCHANGE_RATE;
  const montoUSD =
    r.montoUSD != null && String(r.montoUSD).trim() !== ''
      ? Number(r.montoUSD)
      : moneda === 'UYU'
        ? montoRaw / (tipoCambio > 0 ? tipoCambio : 1)
        : montoRaw;

  const scheduleIdCol =
    r.scheduleId != null && String(r.scheduleId).trim() !== '' ? String(r.scheduleId).trim() : undefined;
  const legacyScheduledId =
    r.scheduledCostId != null && String(r.scheduledCostId).trim() !== ''
      ? String(r.scheduledCostId).trim()
      : undefined;
  const desc = String(r.descripcion ?? '');
  const explicitIsScheduled =
    r.isScheduled === true || String(r.isScheduled).toUpperCase() === 'TRUE';
  const explicitNotScheduled =
    r.isScheduled === false || String(r.isScheduled).toUpperCase() === 'FALSE';
  const migratedAuto =
    !explicitNotScheduled &&
    !explicitIsScheduled &&
    legacyScheduledId !== undefined &&
    desc.startsWith('[AUTO]');
  const isScheduled = explicitNotScheduled ? false : explicitIsScheduled || migratedAuto;

  const scheduleId =
    scheduleIdCol ?? (isScheduled ? legacyScheduledId : undefined);

  const scheduledDayRaw = Number(r.scheduledDay);
  const scheduledDay =
    Number.isFinite(scheduledDayRaw) && scheduledDayRaw >= 1 && scheduledDayRaw <= 28
      ? Math.floor(scheduledDayRaw)
      : undefined;

  const scheduledMonths = parseScheduledMonths(r.scheduledMonths);

  return {
    id: String(r.id ?? ''),
    fecha: String(r.fecha ?? ''),
    tripId,
    categoria: normalizeCostCategory(r.categoria),
    descripcion: desc,
    monto: montoRaw,
    moneda,
    currency,
    tipoCambio,
    montoUSD,
    isScheduled,
    ...(scheduleId ? { scheduleId } : {}),
    ...(legacyScheduledId ? { scheduledCostId: legacyScheduledId } : {}),
    ...(scheduledDay !== undefined ? { scheduledDay } : {}),
    ...(scheduledMonths !== undefined ? { scheduledMonths } : {}),
    comprobante:
      r.comprobante !== undefined && r.comprobante !== null ? String(r.comprobante) : undefined,
    registradoPor: String(r.registradoPor ?? ''),
  };
}

export interface LogisticsData {
  clients: Client[];
  trips: Trip[];
  costs: Cost[];
  scheduledCostDefinitions: ScheduledCostDefinition[];
}

function cloneMockData(): LogisticsData {
  return {
    clients: MOCK_DATA.clients.map((c) => normalizeClient(c)),
    trips: MOCK_DATA.trips.map((t) => normalizeTrip(t)),
    costs: MOCK_DATA.costs.map((c) => normalizeCost(c)),
    scheduledCostDefinitions: getMockScheduledDefinitions().map((d) => ({ ...d })),
  };
}

export async function fetchLogisticsData(): Promise<LogisticsData> {
  if (IS_MOCK) {
    logisticsFetchUsedMock = true;
    console.info('[GDC API] Modo mock activo — VITE_SHEET_URL no configurada');
    return cloneMockData();
  }

  try {
    const response = await fetchWithTimeout(
      SHEET_URL,
      { method: 'GET', cache: 'no-store' },
      15000
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();

    if (responseLooksLikeHtml(text)) {
      console.error(
        '[GDC API] Apps Script devolvió HTML en lugar de JSON — verificar permisos de deploy'
      );
      throw new Error('Apps Script devolvió HTML — re-deployar como "Cualquier persona"');
    }

    const data = JSON.parse(text) as {
      clients?: unknown;
      trips?: unknown;
      costs?: unknown;
      scheduledCostDefinitions?: unknown;
    };

    logisticsFetchUsedMock = false;
    return {
      clients: Array.isArray(data.clients) ? data.clients.map(normalizeClient) : [],
      trips: Array.isArray(data.trips) ? data.trips.map(normalizeTrip) : [],
      costs: Array.isArray(data.costs) ? data.costs.map(normalizeCost) : [],
      scheduledCostDefinitions: Array.isArray(data.scheduledCostDefinitions)
        ? data.scheduledCostDefinitions.map(normalizeScheduledCostDefinition)
        : [],
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[GDC API] Timeout al conectar con Google Sheets (15s)');
    } else {
      console.error('[GDC API] fetchLogisticsData falló:', error);
    }
    logisticsFetchUsedMock = true;
    return cloneMockData();
  }
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

export async function saveTripToSheet(trip: Trip): Promise<boolean> {
  return postSheet('trip', trip);
}

export async function updateTripInSheet(trip: Trip): Promise<boolean> {
  return postSheet('updateTrip', trip);
}

export async function deleteTripFromSheet(id: string): Promise<boolean> {
  return postSheet('deleteTrip', { id });
}

export async function uploadInvoice(
  tripId: string,
  fileData: string,
  fileName: string,
  mimeType: string
): Promise<string> {
  if (IS_MOCK) {
    await delay(MOCK_DELAY_MS);
    return `https://mock-invoice.local/${encodeURIComponent(tripId)}/${encodeURIComponent(fileName)}`;
  }
  try {
    const response = await fetchWithTimeout(
      SHEET_URL,
      {
        method: 'POST',
        headers: APPS_SCRIPT_PLAIN_HEADERS,
        body: JSON.stringify({
          type: 'uploadInvoice',
          data: {
            tripId,
            fileData,
            fileName,
            mimeType,
            folderId: DRIVE_FOLDER_FACTURAS,
          },
        }),
      },
      UPLOAD_FETCH_TIMEOUT_MS
    );
    if (!response.ok) {
      console.error('[GDC API] uploadInvoice — HTTP', response.status, response.statusText);
      return '';
    }
    const text = await response.text();
    if (responseLooksLikeHtml(text)) {
      console.error('[GDC API] uploadInvoice — Apps Script devolvió HTML');
      return '';
    }
    let result: { status?: string; url?: string; message?: string };
    try {
      result = JSON.parse(text) as { status?: string; url?: string; message?: string };
    } catch {
      console.error('[GDC API] uploadInvoice — respuesta no es JSON');
      return '';
    }
    if (result.status === 'error') {
      console.error('[GDC API] uploadInvoice — servidor:', result.message);
      return '';
    }
    if (result.status === 'success' && result.url) {
      return String(result.url);
    }
    return '';
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.error('[GDC API] uploadInvoice error:', error);
    }
    return '';
  }
}

/** Sube imagen de remito a Drive vía Apps Script (`type: uploadRemito`) y devuelve la URL pública. */
export async function uploadRemitoImage(
  tripId: string,
  fileData: string,
  fileName: string,
  mimeType: string
): Promise<string> {
  if (IS_MOCK) {
    await delay(MOCK_DELAY_MS);
    console.info('[GDC API] Mock uploadRemitoImage:', fileName);
    return `https://drive.google.com/mock-remito/${encodeURIComponent(tripId)}/${encodeURIComponent(fileName)}`;
  }
  try {
    const response = await fetchWithTimeout(
      SHEET_URL,
      {
        method: 'POST',
        headers: APPS_SCRIPT_PLAIN_HEADERS,
        body: JSON.stringify({
          type: 'uploadRemito',
          data: {
            tripId,
            fileData,
            fileName,
            mimeType,
            folderId: DRIVE_FOLDER_REMITOS,
          },
        }),
      },
      UPLOAD_FETCH_TIMEOUT_MS
    );
    if (!response.ok) {
      console.error('[GDC API] uploadRemitoImage — HTTP', response.status, response.statusText);
      return '';
    }
    const text = await response.text();
    if (responseLooksLikeHtml(text)) {
      console.error('[GDC API] uploadRemitoImage — Apps Script devolvió HTML');
      return '';
    }
    let result: { status?: string; url?: string; message?: string };
    try {
      result = JSON.parse(text) as { status?: string; url?: string; message?: string };
    } catch {
      console.error('[GDC API] uploadRemitoImage — respuesta no es JSON');
      return '';
    }
    if (result.status === 'error') {
      console.error('[GDC API] uploadRemitoImage — servidor:', result.message);
      return '';
    }
    if (result.status === 'success' && result.url) {
      return String(result.url);
    }
    return '';
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.error('[GDC API] uploadRemitoImage error:', error);
    }
    return '';
  }
}

export async function saveClientToSheet(client: Client): Promise<void> {
  await postSheet('client', client);
}

export async function saveCostToSheet(cost: Cost): Promise<boolean> {
  return postSheet('cost', cost);
}

export async function updateCostInSheet(cost: Cost): Promise<boolean> {
  return postSheet('updateCost', cost);
}

export async function deleteCostFromSheet(id: string): Promise<boolean> {
  return postSheet('deleteCost', { id });
}

export async function fetchScheduledCostDefinitions(): Promise<ScheduledCostDefinition[]> {
  const d = await fetchLogisticsData();
  return d.scheduledCostDefinitions;
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
