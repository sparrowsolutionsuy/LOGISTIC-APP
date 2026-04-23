import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Client, Trip } from '../types';

function countByEstado(trips: Trip[]): Record<string, number> {
  return trips.reduce<Record<string, number>>((acc, t) => {
    acc[t.estado] = (acc[t.estado] ?? 0) + 1;
    return acc;
  }, {});
}

function topRoutesSummary(trips: Trip[], n: number): string {
  const map = new Map<string, number>();
  trips.forEach((t) => {
    const k = `${t.origen} → ${t.destino}`;
    map.set(k, (map.get(k) ?? 0) + 1);
  });
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([r, c]) => `${r} (${c})`)
    .join('; ');
}

function hardcodedInsightsEs(trips: Trip[], clients: Client[]): string[] {
  const n = trips.length;
  const activeClients = new Set(trips.map((t) => t.clientId)).size;
  const byEstado = countByEstado(trips);
  const pend = byEstado['Pendiente'] ?? 0;
  const transit = byEstado['En Tránsito'] ?? 0;
  const routes = topRoutesSummary(trips, 3);

  const out: string[] = [];
  out.push(
    `Con ${n} viajes y ${activeClients} clientes activos en datos, priorizá cerrar la planificación de los ${pend} viajes pendientes antes de abrir nuevas ventanas de carga.`
  );
  out.push(
    `Hay ${transit} viajes en tránsito: coordiná tiempos de descarga y documentación para evitar demoras en destino y costos de espera.`
  );
  out.push(
    `Rutas más frecuentes: ${routes || 'sin suficiente historia'}. Evaluá consolidar retornos y backhaul desde esos destinos hacia la base operativa.`
  );
  return out.slice(0, 3);
}

export async function generateLogisticsInsights(
  trips: Trip[],
  clients: Client[]
): Promise<string[]> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

  if (!apiKey?.trim()) {
    console.info('[GDC Gemini] Sin VITE_GEMINI_API_KEY: insights locales en español.');
    return hardcodedInsightsEs(trips, clients);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const modelId =
      (import.meta.env.VITE_GEMINI_TEXT_MODEL as string | undefined)?.trim() || 'gemini-2.0-flash';
    const model = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const byEstado = countByEstado(trips);
    const activeClients = new Set(trips.map((t) => t.clientId)).size;
    const routes = topRoutesSummary(trips, 5);

    const prompt = `Sos analista logístico para transporte de carga en Uruguay (GDC).
Datos:
- Cantidad de viajes: ${trips.length}
- Clientes con al menos un viaje: ${activeClients}
- Clientes totales en directorio: ${clients.length}
- Viajes por estado (JSON): ${JSON.stringify(byEstado)}
- Rutas más frecuentes (texto): ${routes}

Generá como máximo 3 frases concretas y accionables en español (sin markdown).
Respondé SOLO un JSON array de strings, ejemplo: ["texto1","texto2"]`;

    const result = await model.generateContent(prompt);
    const text = (await result.response).text();
    if (!text) {
      return hardcodedInsightsEs(trips, clients);
    }
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) {
      return hardcodedInsightsEs(trips, clients);
    }
    const strings = parsed
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((s) => s.trim())
      .slice(0, 3);
    return strings.length > 0 ? strings : hardcodedInsightsEs(trips, clients);
  } catch (error) {
    console.error('[GDC Gemini] Error:', error);
    return hardcodedInsightsEs(trips, clients);
  }
}
