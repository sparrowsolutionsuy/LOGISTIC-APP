import type { Client, Cost, Trip, TripStatus, User } from '../types';
import { MOCK_DATA } from '../constants';

const SHEET_URL = import.meta.env.VITE_SHEET_URL ?? '';
export const IS_MOCK = !SHEET_URL;

let logisticsFetchUsedMock = false;

export function lastLogisticsFetchWasMock(): boolean {
  return logisticsFetchUsedMock;
}

const MOCK_DELAY_MS = 300;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

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
  };
}

export function normalizeClient(row: unknown): Client {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
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

export function normalizeCost(row: unknown): Cost {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const tripIdRaw = r.tripId;
  const tripId =
    tripIdRaw === null || tripIdRaw === undefined || String(tripIdRaw) === ''
      ? null
      : String(tripIdRaw);

  return {
    id: String(r.id ?? ''),
    fecha: String(r.fecha ?? ''),
    tripId,
    categoria: normalizeCostCategory(r.categoria),
    descripcion: String(r.descripcion ?? ''),
    monto: Number(r.monto) || 0,
    comprobante:
      r.comprobante !== undefined && r.comprobante !== null ? String(r.comprobante) : undefined,
    registradoPor: String(r.registradoPor ?? ''),
  };
}

export interface LogisticsData {
  clients: Client[];
  trips: Trip[];
  costs: Cost[];
}

function cloneMockData(): LogisticsData {
  return {
    clients: MOCK_DATA.clients.map((c) => normalizeClient(c)),
    trips: MOCK_DATA.trips.map((t) => normalizeTrip(t)),
    costs: MOCK_DATA.costs.map((c) => normalizeCost(c)),
  };
}

export async function fetchLogisticsData(): Promise<LogisticsData> {
  if (IS_MOCK) {
    logisticsFetchUsedMock = true;
    console.info('[GDC API] IS_MOCK: usando MOCK_DATA (sin SHEET_URL).');
    return cloneMockData();
  }

  try {
    const response = await fetch(SHEET_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data: unknown = await response.json();
    const record = data as { clients?: unknown; trips?: unknown; costs?: unknown };

    const clientsRaw = Array.isArray(record.clients) ? record.clients : [];
    const tripsRaw = Array.isArray(record.trips) ? record.trips : [];
    const costsRaw = Array.isArray(record.costs) ? record.costs : [];

    logisticsFetchUsedMock = false;
    return {
      clients: clientsRaw.map((row) => normalizeClient(row)),
      trips: tripsRaw.map((row) => normalizeTrip(row)),
      costs: costsRaw.map((row) => normalizeCost(row)),
    };
  } catch (error) {
    console.error('[GDC API] fetchLogisticsData falló, usando MOCK_DATA.', error);
    logisticsFetchUsedMock = true;
    return cloneMockData();
  }
}

async function postSheet(type: string, data: unknown): Promise<void> {
  if (IS_MOCK) {
    await delay(MOCK_DELAY_MS);
    return;
  }
  try {
    await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data }),
    });
  } catch (error) {
    console.error(`[GDC API] POST ${type} error:`, error);
  }
}

const MOCK_ADMIN: User = { username: 'admin', nombre: 'Administrador Maestro', role: 'admin' };
const MOCK_OPERATIVO: User = {
  username: 'operativo',
  nombre: 'Usuario Operativo',
  role: 'operativo',
};

export async function loginUser(username: string, password: string): Promise<User | null> {
  if (username === 'admin' && password === 'admin123') {
    return MOCK_ADMIN;
  }
  if (username === 'operativo' && password === 'op123') {
    return MOCK_OPERATIVO;
  }

  if (IS_MOCK) {
    return null;
  }

  try {
    const response = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'login', data: { username, password } }),
    });
    const result = (await response.json()) as { status?: string; user?: User };
    return result.status === 'success' && result.user ? result.user : null;
  } catch (error) {
    console.error('[GDC API] loginUser error:', error);
    return null;
  }
}

export async function saveTripToSheet(trip: Trip): Promise<void> {
  await postSheet('trip', trip);
}

export async function updateTripInSheet(trip: Trip): Promise<void> {
  await postSheet('updateTrip', trip);
}

export async function deleteTripFromSheet(id: string): Promise<void> {
  await postSheet('deleteTrip', { id });
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
    const response = await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'uploadInvoice',
        data: { tripId, fileData, fileName, mimeType },
      }),
    });
    const result = (await response.json()) as { status?: string; url?: string };
    if (result.status === 'success' && result.url) {
      return String(result.url);
    }
    return '';
  } catch (error) {
    console.error('[GDC API] uploadInvoice error:', error);
    return '';
  }
}

export async function saveClientToSheet(client: Client): Promise<void> {
  await postSheet('client', client);
}

export async function saveCostToSheet(cost: Cost): Promise<void> {
  await postSheet('cost', cost);
}

export async function updateCostInSheet(cost: Cost): Promise<void> {
  await postSheet('updateCost', cost);
}

export async function deleteCostFromSheet(id: string): Promise<void> {
  await postSheet('deleteCost', { id });
}
