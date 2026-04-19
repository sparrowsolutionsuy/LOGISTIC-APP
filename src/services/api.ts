import type { Client, Trip, User } from '../types';
import { MOCK_DATA } from '../constants';

const DEFAULT_SHEET_URL =
  'https://script.google.com/macros/s/AKfycbzyHGmjxKLdhufG0TPCITPL1Lxkf6jM3F43NyM5SFnUfhPAUH-S9_-G8Hg-1IeVZ7d_/exec';

const envSheet = import.meta.env.VITE_SHEET_URL;
const API_URL =
  typeof envSheet === 'string' && envSheet.trim().length > 0 ? envSheet : DEFAULT_SHEET_URL;

export interface LogisticsPayload {
  clients: Client[];
  trips: Trip[];
}

// 1. OBTENER DATOS (GET)
export const fetchLogisticsData = async (): Promise<LogisticsPayload> => {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error('Error en red');
    }
    const data: unknown = await response.json();
    const record = data as { clients?: unknown; trips?: unknown };
    return {
      clients: (Array.isArray(record.clients) ? record.clients : []) as Client[],
      trips: (Array.isArray(record.trips) ? record.trips : []) as Trip[],
    };
  } catch (error) {
    console.error('Error fetch:', error);
    return {
      clients: [...MOCK_DATA.clients],
      trips: [...MOCK_DATA.trips],
    };
  }
};

// 2. GUARDAR CLIENTE
export const saveClientToSheet = async (client: Client): Promise<boolean> => {
  try {
    await fetch(API_URL, {
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

// 3. GUARDAR VIAJE
export const saveTripToSheet = async (trip: Trip): Promise<boolean> => {
  try {
    await fetch(API_URL, {
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

// 4. ACTUALIZAR VIAJE
export const updateTripInSheet = async (trip: Trip): Promise<boolean> => {
  try {
    await fetch(API_URL, {
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

// 5. BORRAR VIAJE
export const deleteTripInSheet = async (tripId: string): Promise<boolean> => {
  try {
    await fetch(API_URL, {
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

// 6. SUBIR FACTURA
export const uploadInvoice = async (
  tripId: string,
  clientName: string,
  file: File
): Promise<string | null> => {
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

        const response = await fetch(API_URL, {
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

// 7. LOGIN
export const loginUser = async (
  username: string,
  password: string
): Promise<User | null> => {
  if (username === 'admin' && password === 'admin123') {
    return { username: 'admin', nombre: 'Administrador Maestro', role: 'admin' };
  }
  if (username === 'operativo' && password === 'op123') {
    return { username: 'operativo', nombre: 'Usuario Operativo', role: 'operativo' };
  }
  try {
    const response = await fetch(API_URL, {
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
