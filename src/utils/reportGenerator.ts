import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Client, Cost, MonthlyReportData, Trip } from '../types';
import {
  costUsd,
  enrichTrips,
  formatMonthLongEs,
  getCostsByCategory,
  previousCalendarMonth,
  tripRealizedRevenueMonthKey,
  tripRevenueRealized,
} from './analytics';

function isFinished(t: Trip) {
  return t.estado === 'Completado' || t.estado === 'Cerrado';
}

function sumCostsForTrip(costs: Cost[], tripId: string): number {
  return costs.filter((c) => c.tripId === tripId).reduce((a, c) => a + costUsd(c), 0);
}

interface Snapshot {
  totalRevenue: number;
  totalCosts: number;
  totalTrips: number;
}

function computeSnapshot(month: string, trips: Trip[], costs: Cost[]): Snapshot {
  const inMonth = trips.filter((t) => t.fecha.startsWith(month));
  const revenue = trips
    .filter((t) => tripRealizedRevenueMonthKey(t) === month)
    .reduce((s, t) => s + tripRevenueRealized(t), 0);
  const totalCosts = inMonth.reduce((s, t) => s + sumCostsForTrip(costs, t.id), 0);
  return { totalRevenue: revenue, totalCosts, totalTrips: inMonth.length };
}

function pctDelta(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

function buildFallbackAi(
  data: Omit<MonthlyReportData, 'aiSummary' | 'aiAlerts' | 'aiRecommendations'>,
  prevMarginPct: number
): Pick<MonthlyReportData, 'aiSummary' | 'aiAlerts' | 'aiRecommendations'> {
  const { monthLabel, totalTrips, totalRevenue, marginPct, vsLastMonth } = data;
  const revFmt = totalRevenue.toLocaleString('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const cmp =
    vsLastMonth.revenueDelta > 2
      ? `Los ingresos cobrados subieron aproximadamente ${vsLastMonth.revenueDelta.toFixed(1)}% respecto al mes anterior.`
      : vsLastMonth.revenueDelta < -2
        ? `Los ingresos cobrados cayeron aproximadamente ${Math.abs(vsLastMonth.revenueDelta).toFixed(1)}% respecto al mes anterior.`
        : 'El nivel de ingresos cobrados se mantuvo estable frente al mes anterior.';
  const aiSummary = `En ${monthLabel}, GDC registró ${totalTrips} viajes con ingresos cobrados totales de ${revFmt} y un margen neto del ${marginPct.toFixed(1)}%. ${cmp}`;

  const aiAlerts: string[] = [];
  if (marginPct < 15) aiAlerts.push('Margen por debajo del 15% objetivo');
  if (data.pendingTrips > 3) aiAlerts.push(`${data.pendingTrips} viajes pendientes sin resolver`);
  if (data.worstMarginTrip.marginPct < 0) {
    aiAlerts.push(`Viaje ${data.worstMarginTrip.id} con margen negativo`);
  }

  const aiRecommendations: string[] = [];
  const topShare =
    data.totalRevenue > 0 ? (data.topClientByRevenue.revenue / data.totalRevenue) * 100 : 0;
  if (topShare > 60) {
    aiRecommendations.push(
      `El cliente ${data.topClientByRevenue.name} concentra más del 60% de los ingresos: diversificá cartera o reforzá contratos.`
    );
  }
  const topCat = data.costsByCategory[0];
  if (topCat && topCat.pct > 50) {
    aiRecommendations.push(
      `La categoría ${topCat.category} supera el 50% de los costos: revisá negociación con proveedores.`
    );
  }
  if (data.topRoute.count > 0) {
    aiRecommendations.push(
      `La ruta ${data.topRoute.route} es la más frecuente: evaluá retornos y consolidación de cargas.`
    );
  }

  if (prevMarginPct > 0 && marginPct + 5 < prevMarginPct) {
    aiAlerts.push('El margen % cayó de forma notable frente al mes anterior');
  }

  return {
    aiSummary,
    aiAlerts: aiAlerts.slice(0, 3),
    aiRecommendations: aiRecommendations.slice(0, 3),
  };
}

export async function generateMonthlyReport(
  month: string,
  trips: Trip[],
  costs: Cost[],
  clients: Client[],
  geminiApiKey?: string
): Promise<MonthlyReportData> {
  const monthLabel = formatMonthLongEs(month);
  const prev = previousCalendarMonth(month);
  const curSnap = computeSnapshot(month, trips, costs);
  const prevSnap = computeSnapshot(prev, trips, costs);

  const tripsInMonth = trips.filter((t) => t.fecha.startsWith(month));
  const costsInMonth = costs.filter((c) => c.fecha.startsWith(month));

  const totalRevenue = curSnap.totalRevenue;
  const totalCosts = tripsInMonth.reduce((s, t) => s + sumCostsForTrip(costs, t.id), 0);
  const netMargin = totalRevenue - totalCosts;
  const marginPct = totalRevenue > 0 ? (netMargin / totalRevenue) * 100 : 0;

  const completedTrips = tripsInMonth.filter((t) => isFinished(t)).length;
  const pendingTrips = tripsInMonth.filter((t) => t.estado === 'Pendiente').length;
  const cancelledTrips = 0;
  const totalKm = tripsInMonth.reduce((s, t) => s + t.kmRecorridos, 0);
  const totalTons = tripsInMonth.reduce((s, t) => s + t.pesoKg / 1000, 0);
  const cobradosInMonth = trips.filter((t) => tripRealizedRevenueMonthKey(t) === month);
  const avgRevenuePerTrip =
    cobradosInMonth.length > 0 ? totalRevenue / cobradosInMonth.length : 0;
  const avgCostPerTrip = tripsInMonth.length > 0 ? totalCosts / tripsInMonth.length : 0;
  const avgMarginPerTrip = tripsInMonth.length > 0 ? netMargin / tripsInMonth.length : 0;

  const byClient = new Map<string, { revenue: number; trips: number }>();
  cobradosInMonth.forEach((t) => {
    const r = tripRevenueRealized(t);
    const cur = byClient.get(t.clientId) ?? { revenue: 0, trips: 0 };
    byClient.set(t.clientId, { revenue: cur.revenue + r, trips: cur.trips + 1 });
  });
  let topClientId = '';
  let topRev = 0;
  let topTrips = 0;
  byClient.forEach((v, id) => {
    if (v.revenue > topRev) {
      topRev = v.revenue;
      topClientId = id;
      topTrips = v.trips;
    }
  });
  const topClientByRevenue = {
    name: (clients.find((c) => c.id === topClientId)?.nombreComercial ?? topClientId) || '—',
    revenue: topRev,
    trips: topTrips,
  };

  const byRoute = new Map<string, { revenue: number; count: number }>();
  cobradosInMonth.forEach((t) => {
    const key = `${t.origen} → ${t.destino}`;
    const r = tripRevenueRealized(t);
    const cur = byRoute.get(key) ?? { revenue: 0, count: 0 };
    byRoute.set(key, { revenue: cur.revenue + r, count: cur.count + 1 });
  });
  let topRoute = { route: '—', revenue: 0, count: 0 };
  byRoute.forEach((v, route) => {
    if (v.revenue > topRoute.revenue) topRoute = { route, revenue: v.revenue, count: v.count };
  });

  const byProduct = new Map<string, { revenue: number; tons: number }>();
  cobradosInMonth.forEach((t) => {
    const key = t.contenido?.trim() || 'Sin especificar';
    const r = tripRevenueRealized(t);
    const cur = byProduct.get(key) ?? { revenue: 0, tons: 0 };
    byProduct.set(key, { revenue: cur.revenue + r, tons: cur.tons + t.pesoKg / 1000 });
  });
  let topProduct = { name: '—', revenue: 0, tons: 0 };
  byProduct.forEach((v, name) => {
    if (v.revenue > topProduct.revenue) topProduct = { name, revenue: v.revenue, tons: v.tons };
  });

  const enriched = enrichTrips(tripsInMonth, clients, costs);
  let worstMarginTrip = { id: '—', client: '—', marginPct: 0 };
  let bestMarginTrip = { id: '—', client: '—', marginPct: 0 };
  let bestPct = -Infinity;
  let worstPct = Infinity;
  enriched.forEach((row) => {
    if (row.revenueRealized <= 0) return;
    const p = row.marginPct;
    if (p > bestPct) {
      bestPct = p;
      bestMarginTrip = { id: row.id, client: row.clientName, marginPct: p };
    }
    if (p < worstPct) {
      worstPct = p;
      worstMarginTrip = { id: row.id, client: row.clientName, marginPct: p };
    }
  });
  if (bestPct === -Infinity) bestMarginTrip = { id: '—', client: '—', marginPct: 0 };
  if (worstPct === Infinity) worstMarginTrip = { id: '—', client: '—', marginPct: 0 };

  const costsByCategory = getCostsByCategory(costsInMonth);

  const prevMarginPctSnap =
    prevSnap.totalRevenue > 0
      ? ((prevSnap.totalRevenue - prevSnap.totalCosts) / prevSnap.totalRevenue) * 100
      : 0;

  const vsLastMonth = {
    revenueDelta: pctDelta(curSnap.totalRevenue, prevSnap.totalRevenue),
    costsDelta: pctDelta(curSnap.totalCosts, prevSnap.totalCosts),
    marginDelta: pctDelta(
      curSnap.totalRevenue - curSnap.totalCosts,
      prevSnap.totalRevenue - prevSnap.totalCosts
    ),
    tripsDelta: pctDelta(curSnap.totalTrips, prevSnap.totalTrips),
    marginPctDeltaPp: marginPct - prevMarginPctSnap,
  };

  const base: Omit<MonthlyReportData, 'aiSummary' | 'aiAlerts' | 'aiRecommendations'> = {
    month,
    monthLabel,
    totalRevenue,
    totalCosts,
    netMargin,
    marginPct,
    totalTrips: tripsInMonth.length,
    completedTrips,
    pendingTrips,
    cancelledTrips,
    totalKm,
    totalTons,
    avgRevenuePerTrip,
    avgCostPerTrip,
    avgMarginPerTrip,
    topClientByRevenue,
    topRoute,
    topProduct,
    worstMarginTrip,
    bestMarginTrip,
    costsByCategory,
    vsLastMonth,
  };

  const fallback = buildFallbackAi(base, prevMarginPctSnap);
  const key = geminiApiKey?.trim();
  if (!key) {
    return { ...base, ...fallback };
  }

  try {
    const genAI = new GoogleGenerativeAI(key);
    const modelId =
      (import.meta.env.VITE_GEMINI_TEXT_MODEL as string | undefined)?.trim() || 'gemini-2.0-flash';
    const model = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: { responseMimeType: 'application/json' },
    });
    const prompt = `Sos analista de una empresa de transporte de carga en Uruguay (GDC).
Analizá estos datos del mes ${monthLabel} (${month}) y generá:
1. Un párrafo ejecutivo resumiendo el rendimiento (3-4 oraciones en español)
2. Hasta 3 alertas o riesgos (formato JSON array de strings)
3. Hasta 3 recomendaciones accionables (formato JSON array de strings)

Datos: ${JSON.stringify({
      monthLabel,
      totalRevenue,
      totalCosts,
      netMargin,
      marginPct,
      totalTrips: tripsInMonth.length,
      completedTrips,
      pendingTrips,
      vsLastMonth,
      topClientByRevenue,
      topRoute,
      topProduct,
    })}

Respondé SOLO con JSON válido:
{"summary": string, "alerts": string[], "recommendations": string[]}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text) as {
      summary?: string;
      alerts?: string[];
      recommendations?: string[];
    };
    return {
      ...base,
      aiSummary: typeof parsed.summary === 'string' ? parsed.summary : fallback.aiSummary,
      aiAlerts: Array.isArray(parsed.alerts) ? parsed.alerts.slice(0, 3) : fallback.aiAlerts,
      aiRecommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.slice(0, 3)
        : fallback.aiRecommendations,
    };
  } catch (e) {
    console.warn('[reportGenerator] Gemini error, usando fallback:', e);
    return { ...base, ...fallback };
  }
}
