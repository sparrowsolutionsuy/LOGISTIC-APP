import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  Client,
  Cost,
  GeneralReportData,
  ReportScope,
  ReportSeriesPoint,
  Trip,
  TripWithMetrics,
} from '../types';
import {
  calcCombustiblePorKm,
  enrichTrips,
  getCostsByCategory,
  isCobrado,
  isPendienteCobro,
  monthLabel,
  tripRevenueUSD,
} from './analytics';

export interface ReportParams {
  scope: ReportScope;
  /** YYYY-MM para 'mensual' y 'semanal'. */
  month?: string;
  /** Índice de semana 0-3 para 'semanal'. */
  weekIndex?: number;
}

const WEEK_RANGES: [number, number][] = [
  [1, 7],
  [8, 14],
  [15, 21],
  [22, 31],
];

function fmtUsd(n: number): string {
  return n.toLocaleString('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function isFinished(t: Trip): boolean {
  return t.estado === 'Completado' || t.estado === 'Cerrado';
}

function pctDelta(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

function dayOf(fecha: string): number {
  return Number(fecha.slice(8, 10));
}

/** Filtra una lista por el rango del reporte. */
function inScope<T extends { fecha: string }>(items: T[], params: ReportParams): T[] {
  if (params.scope === 'historico') return items.slice();
  const month = params.month ?? '';
  if (params.scope === 'mensual') {
    return items.filter((x) => x.fecha.startsWith(month));
  }
  // semanal
  const wi = params.weekIndex ?? 0;
  const [d0, d1] = WEEK_RANGES[wi] ?? WEEK_RANGES[0];
  return items.filter((x) => {
    if (!x.fecha.startsWith(month)) return false;
    const d = dayOf(x.fecha);
    return d >= d0 && d <= d1;
  });
}

interface Snapshot {
  totalGenerado: number;
  totalCobrado: number;
  totalPendiente: number;
  totalCostos: number;
  totalTrips: number;
  totalKm: number;
}

/** Modelo de costos coherente con el resto de la app: costos no-combustible del rango + combustible imputado por km. */
function computeSnapshot(
  tripsR: Trip[],
  costsR: Cost[],
  combustiblePorKm: number
): Snapshot {
  const totalGenerado = tripsR.reduce((s, t) => s + tripRevenueUSD(t), 0);
  const totalCobrado = tripsR.filter(isCobrado).reduce((s, t) => s + tripRevenueUSD(t), 0);
  const totalPendiente = tripsR.filter(isPendienteCobro).reduce((s, t) => s + tripRevenueUSD(t), 0);
  const directCosts = costsR
    .filter((c) => c.categoria !== 'Combustible')
    .reduce((s, c) => s + (c.montoUSD ?? 0), 0);
  const fuelCost = tripsR.reduce((s, t) => s + (t.kmRecorridos ?? 0) * combustiblePorKm, 0);
  return {
    totalGenerado,
    totalCobrado,
    totalPendiente,
    totalCostos: directCosts + fuelCost,
    totalTrips: tripsR.length,
    totalKm: tripsR.reduce((s, t) => s + (t.kmRecorridos ?? 0), 0),
  };
}

function monthsEndingAt(endKey: string, count: number): string[] {
  const [y, m] = endKey.split('-').map(Number);
  if (!y || !m) return [];
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function monthsBetweenAscending(startKey: string, endKey: string): string[] {
  const [ys, ms] = startKey.split('-').map(Number);
  const [ye, me] = endKey.split('-').map(Number);
  if (!ys || !ye) return [];
  const out: string[] = [];
  let y = ys;
  let m = ms;
  // límite de seguridad
  for (let i = 0; i < 240; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (y === ye && m === me) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Construye la serie temporal (mensual o semanal) que alimenta los gráficos del reporte. */
function buildSeries(
  trips: Trip[],
  costs: Cost[],
  params: ReportParams,
  combustiblePorKm: number
): { series: ReportSeriesPoint[]; kind: 'mensual' | 'semanal' } {
  if (params.scope === 'semanal') {
    const month = params.month ?? '';
    const [y, m] = month.split('-').map(Number);
    const lastDay = y && m ? new Date(y, m, 0).getDate() : 31;
    const series = WEEK_RANGES.map(([d0, d1], i) => {
      const wt = trips.filter(
        (t) => t.fecha.startsWith(month) && dayOf(t.fecha) >= d0 && dayOf(t.fecha) <= d1
      );
      const wc = costs.filter(
        (c) => c.fecha.startsWith(month) && dayOf(c.fecha) >= d0 && dayOf(c.fecha) <= d1
      );
      const snap = computeSnapshot(wt, wc, combustiblePorKm);
      return {
        key: `${month}-w${i + 1}`,
        label: `Sem ${i + 1}`,
        ingresos: snap.totalGenerado,
        cobrado: snap.totalCobrado,
        costos: snap.totalCostos,
        margen: snap.totalGenerado - snap.totalCostos,
        highlight: i === (params.weekIndex ?? 0),
      } satisfies ReportSeriesPoint;
    });
    return { series, kind: 'semanal' };
  }

  let keys: string[];
  if (params.scope === 'historico') {
    const months = new Set<string>();
    trips.forEach((t) => /^\d{4}-\d{2}$/.test(t.fecha.slice(0, 7)) && months.add(t.fecha.slice(0, 7)));
    costs.forEach((c) => /^\d{4}-\d{2}$/.test(c.fecha.slice(0, 7)) && months.add(c.fecha.slice(0, 7)));
    const sorted = Array.from(months).sort();
    keys = sorted.length ? monthsBetweenAscending(sorted[0], sorted[sorted.length - 1]) : [];
    if (keys.length > 18) keys = keys.slice(keys.length - 18);
  } else {
    keys = monthsEndingAt(params.month ?? '', 6);
  }

  const series = keys.map((k) => {
    const mt = trips.filter((t) => t.fecha.startsWith(k));
    const mc = costs.filter((c) => c.fecha.startsWith(k));
    const snap = computeSnapshot(mt, mc, combustiblePorKm);
    return {
      key: k,
      label: monthLabel(k),
      ingresos: snap.totalGenerado,
      cobrado: snap.totalCobrado,
      costos: snap.totalCostos,
      margen: snap.totalGenerado - snap.totalCostos,
      highlight: params.scope === 'mensual' ? k === params.month : false,
    } satisfies ReportSeriesPoint;
  });
  return { series, kind: 'mensual' };
}

function periodLabelFor(params: ReportParams): { title: string; periodLabel: string } {
  if (params.scope === 'historico') {
    return { title: 'Reporte histórico', periodLabel: 'Toda la operativa' };
  }
  if (params.scope === 'semanal') {
    const month = params.month ?? '';
    const wi = params.weekIndex ?? 0;
    const [d0, d1] = WEEK_RANGES[wi] ?? WEEK_RANGES[0];
    const [y, m] = month.split('-').map(Number);
    const lastDay = y && m ? new Date(y, m, 0).getDate() : 31;
    return {
      title: 'Reporte semanal',
      periodLabel: `Semana ${wi + 1} (${d0}–${Math.min(d1, lastDay)}) · ${monthLabel(month)}`,
    };
  }
  return { title: 'Reporte mensual', periodLabel: monthLabel(params.month ?? '') };
}

function buildComparison(
  trips: Trip[],
  costs: Cost[],
  params: ReportParams,
  combustiblePorKm: number,
  cur: Snapshot,
  curMarginPct: number
): GeneralReportData['comparison'] {
  const none: GeneralReportData['comparison'] = {
    available: false,
    label: '',
    revenueDelta: 0,
    costsDelta: 0,
    marginDelta: 0,
    marginPctDeltaPp: 0,
    tripsDelta: 0,
  };
  if (params.scope === 'historico') return none;

  let prevTrips: Trip[];
  let prevCosts: Cost[];
  let label: string;
  if (params.scope === 'mensual') {
    const [y, m] = (params.month ?? '').split('-').map(Number);
    if (!y || !m) return none;
    const pd = new Date(y, m - 2, 1);
    const prevKey = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`;
    prevTrips = trips.filter((t) => t.fecha.startsWith(prevKey));
    prevCosts = costs.filter((c) => c.fecha.startsWith(prevKey));
    label = 'vs mes anterior';
  } else {
    const wi = params.weekIndex ?? 0;
    if (wi <= 0) return none;
    const prevParams: ReportParams = { ...params, weekIndex: wi - 1 };
    prevTrips = inScope(trips, prevParams);
    prevCosts = inScope(costs, prevParams);
    label = 'vs semana anterior';
  }

  const prev = computeSnapshot(prevTrips, prevCosts, combustiblePorKm);
  const prevMarginPct =
    prev.totalGenerado > 0 ? ((prev.totalGenerado - prev.totalCostos) / prev.totalGenerado) * 100 : 0;
  return {
    available: true,
    label,
    revenueDelta: pctDelta(cur.totalGenerado, prev.totalGenerado),
    costsDelta: pctDelta(cur.totalCostos, prev.totalCostos),
    marginDelta: pctDelta(cur.totalGenerado - cur.totalCostos, prev.totalGenerado - prev.totalCostos),
    marginPctDeltaPp: curMarginPct - prevMarginPct,
    tripsDelta: pctDelta(cur.totalTrips, prev.totalTrips),
  };
}

function buildFallbackAi(
  data: Omit<GeneralReportData, 'aiSummary' | 'aiAlerts' | 'aiRecommendations'>
): Pick<GeneralReportData, 'aiSummary' | 'aiAlerts' | 'aiRecommendations'> {
  const cmp = data.comparison.available
    ? data.comparison.revenueDelta > 2
      ? ` Los ingresos crecieron ${data.comparison.revenueDelta.toFixed(1)}% ${data.comparison.label}.`
      : data.comparison.revenueDelta < -2
        ? ` Los ingresos cayeron ${Math.abs(data.comparison.revenueDelta).toFixed(1)}% ${data.comparison.label}.`
        : ` El nivel de ingresos se mantuvo estable ${data.comparison.label}.`
    : '';
  const aiSummary =
    `En ${data.periodLabel}, GDC generó ${fmtUsd(data.totalGenerado)} en ingresos ` +
    `(${fmtUsd(data.totalCobrado)} cobrados, ${data.collectionRate.toFixed(0)}% de cobranza) con ${data.totalTrips} viajes ` +
    `y un margen operativo del ${data.marginPct.toFixed(1)}% (${fmtUsd(data.netMargin)}).${cmp}`;

  const aiAlerts: string[] = [];
  if (data.marginPct < 15) aiAlerts.push(`Margen operativo del ${data.marginPct.toFixed(1)}%, por debajo del 15% objetivo.`);
  if (data.collectionRate < 70 && data.totalGenerado > 0)
    aiAlerts.push(`Solo se cobró el ${data.collectionRate.toFixed(0)}% de lo generado; hay ${fmtUsd(data.totalPendiente)} pendientes.`);
  if (data.worstMarginTrip.marginPct < 0)
    aiAlerts.push(`El viaje ${data.worstMarginTrip.id} (${data.worstMarginTrip.client}) operó con margen negativo (${data.worstMarginTrip.marginPct.toFixed(1)}%).`);
  const topShare = data.totalGenerado > 0 ? (data.topClient.revenue / data.totalGenerado) * 100 : 0;
  if (topShare > 55)
    aiAlerts.push(`${data.topClient.name} concentra el ${topShare.toFixed(0)}% de los ingresos: riesgo de dependencia.`);

  const aiRecommendations: string[] = [];
  if (topShare > 55)
    aiRecommendations.push(`Diversificá la cartera: reforzá contratos con clientes secundarios para reducir la dependencia de ${data.topClient.name}.`);
  const topCat = data.costsByCategory[0];
  if (topCat && topCat.pct > 45)
    aiRecommendations.push(`${topCat.category} representa el ${topCat.pct.toFixed(0)}% de los costos; renegociá proveedores o revisá eficiencia en esa categoría.`);
  if (data.collectionRate < 80 && data.totalPendiente > 0)
    aiRecommendations.push(`Acelerá la cobranza de ${fmtUsd(data.totalPendiente)} pendientes para mejorar el flujo de caja.`);
  if (data.topRoute.count > 0)
    aiRecommendations.push(`La ruta ${data.topRoute.route} es la de mayor ingreso; evaluá retornos con carga y consolidación para subir el margen.`);
  if (data.costPerKm > 0)
    aiRecommendations.push(`Costo por km en ${fmtUsd(data.costPerKm)}; monitoreá combustible y mantenimiento, principales palancas de eficiencia.`);

  return {
    aiSummary,
    aiAlerts: aiAlerts.slice(0, 4),
    aiRecommendations: aiRecommendations.slice(0, 4),
  };
}

export async function generateReport(
  params: ReportParams,
  trips: Trip[],
  costs: Cost[],
  clients: Client[],
  geminiApiKey?: string
): Promise<GeneralReportData> {
  const combustiblePorKm = calcCombustiblePorKm(trips, costs);
  const tripsR = inScope(trips, params);
  const costsR = inScope(costs, params);
  const cur = computeSnapshot(tripsR, costsR, combustiblePorKm);

  const netMargin = cur.totalGenerado - cur.totalCostos;
  const marginPct = cur.totalGenerado > 0 ? (netMargin / cur.totalGenerado) * 100 : 0;
  const collectionRate = cur.totalGenerado > 0 ? (cur.totalCobrado / cur.totalGenerado) * 100 : 0;

  const completedTrips = tripsR.filter(isFinished).length;
  const pendingTrips = tripsR.filter((t) => t.estado === 'Pendiente').length;
  const totalTons = tripsR.reduce((s, t) => s + t.pesoKg / 1000, 0);

  const avgTicket = cur.totalTrips > 0 ? cur.totalGenerado / cur.totalTrips : 0;
  const avgCostPerTrip = cur.totalTrips > 0 ? cur.totalCostos / cur.totalTrips : 0;
  const avgMarginPerTrip = cur.totalTrips > 0 ? netMargin / cur.totalTrips : 0;
  const costPerKm = cur.totalKm > 0 ? cur.totalCostos / cur.totalKm : 0;
  const revenuePerKm = cur.totalKm > 0 ? cur.totalGenerado / cur.totalKm : 0;

  // Top cliente
  const byClient = new Map<string, { revenue: number; trips: number }>();
  tripsR.forEach((t) => {
    const r = tripRevenueUSD(t);
    const c = byClient.get(t.clientId) ?? { revenue: 0, trips: 0 };
    byClient.set(t.clientId, { revenue: c.revenue + r, trips: c.trips + 1 });
  });
  const clientBreakdown = Array.from(byClient.entries())
    .map(([id, v]) => ({
      name: clients.find((c) => c.id === id)?.nombreComercial ?? id,
      revenue: v.revenue,
      trips: v.trips,
    }))
    .sort((a, b) => b.revenue - a.revenue);
  const topClient = clientBreakdown[0] ?? { name: '—', revenue: 0, trips: 0 };

  // Top ruta
  const byRoute = new Map<string, { revenue: number; count: number }>();
  tripsR.forEach((t) => {
    const key = `${t.origen} → ${t.destino}`;
    const r = tripRevenueUSD(t);
    const c = byRoute.get(key) ?? { revenue: 0, count: 0 };
    byRoute.set(key, { revenue: c.revenue + r, count: c.count + 1 });
  });
  let topRoute = { route: '—', revenue: 0, count: 0 };
  byRoute.forEach((v, route) => {
    if (v.revenue > topRoute.revenue) topRoute = { route, revenue: v.revenue, count: v.count };
  });

  // Top producto
  const byProduct = new Map<string, { revenue: number; tons: number }>();
  tripsR.forEach((t) => {
    const key = t.contenido?.trim() || 'Sin especificar';
    const r = tripRevenueUSD(t);
    const c = byProduct.get(key) ?? { revenue: 0, tons: 0 };
    byProduct.set(key, { revenue: c.revenue + r, tons: c.tons + t.pesoKg / 1000 });
  });
  let topProduct = { name: '—', revenue: 0, tons: 0 };
  byProduct.forEach((v, name) => {
    if (v.revenue > topProduct.revenue) topProduct = { name, revenue: v.revenue, tons: v.tons };
  });

  // Mejor / peor margen
  const enriched = enrichTrips(tripsR, clients, costs);
  let bestMarginTrip = { id: '—', client: '—', marginPct: 0 };
  let worstMarginTrip = { id: '—', client: '—', marginPct: 0 };
  let bestPct = -Infinity;
  let worstPct = Infinity;
  enriched.forEach((row) => {
    if (tripRevenueUSD(row) <= 0) return;
    if (row.marginPct > bestPct) {
      bestPct = row.marginPct;
      bestMarginTrip = { id: row.id, client: row.clientName, marginPct: row.marginPct };
    }
    if (row.marginPct < worstPct) {
      worstPct = row.marginPct;
      worstMarginTrip = { id: row.id, client: row.clientName, marginPct: row.marginPct };
    }
  });
  if (bestPct === -Infinity) bestMarginTrip = { id: '—', client: '—', marginPct: 0 };
  if (worstPct === Infinity) worstMarginTrip = { id: '—', client: '—', marginPct: 0 };

  const costsByCategory = getCostsByCategory(costsR);
  const { series, kind } = buildSeries(trips, costs, params, combustiblePorKm);
  const comparison = buildComparison(trips, costs, params, combustiblePorKm, cur, marginPct);
  const { title, periodLabel } = periodLabelFor(params);

  const tripsSorted: TripWithMetrics[] = enriched
    .slice()
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));

  const rangeStart = params.scope === 'historico' ? (series[0]?.key ?? '') : params.month ?? '';
  const rangeEnd = params.scope === 'historico' ? (series[series.length - 1]?.key ?? '') : params.month ?? '';

  const base: Omit<GeneralReportData, 'aiSummary' | 'aiAlerts' | 'aiRecommendations'> = {
    scope: params.scope,
    title,
    periodLabel,
    rangeStart,
    rangeEnd,
    generatedAt: new Date().toISOString(),
    totalGenerado: cur.totalGenerado,
    totalCobrado: cur.totalCobrado,
    totalPendiente: cur.totalPendiente,
    totalCostos: cur.totalCostos,
    netMargin,
    marginPct,
    collectionRate,
    totalTrips: cur.totalTrips,
    completedTrips,
    pendingTrips,
    totalKm: cur.totalKm,
    totalTons,
    avgTicket,
    avgCostPerTrip,
    avgMarginPerTrip,
    costPerKm,
    revenuePerKm,
    topClient,
    topRoute,
    topProduct,
    bestMarginTrip,
    worstMarginTrip,
    costsByCategory,
    series,
    seriesKind: kind,
    clientBreakdown: clientBreakdown.slice(0, 8),
    trips: tripsSorted,
    comparison,
  };

  const fallback = buildFallbackAi(base);
  const key = geminiApiKey?.trim();
  if (!key) return { ...base, ...fallback };

  try {
    const genAI = new GoogleGenerativeAI(key);
    const modelId =
      (import.meta.env.VITE_GEMINI_TEXT_MODEL as string | undefined)?.trim() || 'gemini-2.0-flash';
    const model = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: { responseMimeType: 'application/json' },
    });
    const prompt = `Sos analista financiero de GDC, empresa de transporte de carga en Uruguay.
Analizá los datos del período "${periodLabel}" (${title}) y generá un análisis para inversores/gerencia.
1. Un párrafo ejecutivo (3-5 oraciones en español, claro y orientado a decisiones).
2. Hasta 4 alertas o riesgos concretos.
3. Hasta 4 recomendaciones accionables y oportunidades de mejora.

Datos: ${JSON.stringify({
      periodLabel,
      totalGenerado: cur.totalGenerado,
      totalCobrado: cur.totalCobrado,
      totalPendiente: cur.totalPendiente,
      totalCostos: cur.totalCostos,
      netMargin,
      marginPct,
      collectionRate,
      totalTrips: cur.totalTrips,
      costPerKm,
      avgTicket,
      topClient,
      topRoute,
      topProduct,
      costsByCategory: costsByCategory.slice(0, 5),
      comparison,
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
      aiSummary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary : fallback.aiSummary,
      aiAlerts: Array.isArray(parsed.alerts) && parsed.alerts.length ? parsed.alerts.slice(0, 4) : fallback.aiAlerts,
      aiRecommendations:
        Array.isArray(parsed.recommendations) && parsed.recommendations.length
          ? parsed.recommendations.slice(0, 4)
          : fallback.aiRecommendations,
    };
  } catch (e) {
    console.warn('[reportData] Gemini error, usando fallback:', e);
    return { ...base, ...fallback };
  }
}
