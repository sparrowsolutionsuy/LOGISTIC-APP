import type { Client, Cost, Trip, User } from '../types';
import { MOCK_DATA } from '../constants';

const DEFAULT_SHEET_URL =
  'https://script.google.com/macros/s/AKfycbzyHGmjxKLdhufG0TPCITPL1Lxkf6jM3F43NyM5SFnUfhPAUH-S9_-G8Hg-1IeVZ7d_/exec';

export function isSheetUrlConfigured(): boolean {
  const v = import.meta.env.VITE_SHEET_URL;
  return typeof v === 'string' && v.trim().length > 0;
}

function resolveApiUrl(): string {
  if (isSheetUrlConfigured()) {
    return (import.meta.env.VITE_SHEET_URL as string).trim();
  }
  return DEFAULT_SHEET_URL;
}

const API_URL = (): string => resolveApiUrl();

export interface LogisticsPayload {
  clients: Client[];
  trips: Trip[];
  costs: Cost[];
  offline: boolean;
}

function mockPayload(offline: boolean): LogisticsPayload {
  return {
    clients: [...MOCK_DATA.clients],
    trips: [...MOCK_DATA.trips],
    costs: [...MOCK_DATA.costs],
    offline,
  };
}

export const fetchLogisticsData = async (): Promise<LogisticsPayload> => {
  if (!isSheetUrlConfigured()) {
    return mockPayload(true);
  }

  try {
    const response = await fetch(API_URL());
    if (!response.ok) {
      throw new Error('Error en red');
    }
    const data: unknown = await response.json();
    const record = data as { clients?: unknown; trips?: unknown; costs?: unknown };
    return {
      clients: (Array.isArray(record.clients) ? record.clients : []) as Client[],
      trips: (Array.isArray(record.trips) ? record.trips : []) as Trip[],
      costs: (Array.isArray(record.costs) ? record.costs : [...MOCK_DATA.costs]) as Cost[],
      offline: false,
    };
  } catch (error) {
    console.error('Error fetch:', error);
    return mockPayload(true);
  }
};

export const saveClientToSheet = async (client: Client): Promise<boolean> => {
  if (!isSheetUrlConfigured()) {
    return true;
  }
  try {
    await fetch(API_URL(), {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: 'client', data: client }),
    });
    return true;
  } catch {
    return false;
  }
};

export const saveTripToSheet = async (trip: Trip): Promise<boolean> => {
  if (!isSheetUrlConfigured()) {
    return true;
  }
  try {
    await fetch(API_URL(), {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: 'trip', data: trip }),
    });
    return true;
  } catch {
    return false;
  }
};

export const updateTripInSheet = async (trip: Trip): Promise<boolean> => {
  if (!isSheetUrlConfigured()) {
    return true;
  }
  try {
    await fetch(API_URL(), {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: 'updateTrip', data: trip }),
    });
    return true;
  } catch {
    return false;
  }
};

export const deleteTripInSheet = async (tripId: string): Promise<boolean> => {
  if (!isSheetUrlConfigured()) {
    return true;
  }
  try {
    await fetch(API_URL(), {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: 'deleteTrip', data: { id: tripId } }),
    });
    return true;
  } catch {
    return false;
  }
};

export const uploadInvoice = async (
  tripId: string,
  clientName: string,
  file: File
): Promise<string | null> => {
  if (!isSheetUrlConfigured()) {
    return null;
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const resultRaw = reader.result;
        if (typeof resultRaw !== 'string') {
          resolve(null);
          return;
        }
        const base64Data = resultRaw.split(',')[1];
        if (!base64Data) {
          resolve(null);
          return;
        }
        const fileName = `Factura_${tripId}_${clientName.replace(/\s+/g, '')}.pdf`;

        const response = await fetch(API_URL(), {
          method: 'POST',
          body: JSON.stringify({
            type: 'uploadInvoice',
            data: {
              tripId,
              fileData: base64Data,
              fileName,
              mimeType: file.type,
            },
          }),
        });

        const result = (await response.json()) as { status?: string; url?: string };
        resolve(result.status === 'success' && result.url ? result.url : null);
      } catch (error) {
        console.error('Error upload:', error);
        resolve(null);
      }
    };
  });
};

const MOCK_ADMIN: User = { username: 'admin', nombre: 'Administrador Maestro', role: 'admin' };
const MOCK_OPERATIVO: User = {
  username: 'operativo',
  nombre: 'Usuario Operativo',
  role: 'operativo',
};

export const loginUser = async (username: string, password: string): Promise<User | null> => {
  if (username === 'admin' && password === 'admin123') {
    return MOCK_ADMIN;
  }
  if (username === 'operativo' && password === 'op123') {
    return MOCK_OPERATIVO;
  }

  if (!isSheetUrlConfigured()) {
    return null;
  }

  try {
    const response = await fetch(API_URL(), {
      method: 'POST',
      body: JSON.stringify({ type: 'login', data: { username, password } }),
    });
    const result = (await response.json()) as {
      status?: string;
      user?: User;
    };
    return result.status === 'success' && result.user ? result.user : null;
  } catch {
    return null;
  }
};
