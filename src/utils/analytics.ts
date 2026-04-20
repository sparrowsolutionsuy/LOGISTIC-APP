import type { Client, Cost, KPIData, MonthlyStats, Trip, TripWithMetrics } from '../types';
import { DEFAULT_EXCHANGE_RATE } from '../constants';

/** Monto del costo en USD (histórico). */
export function costUsd(c: Cost): number {
  if (c.montoUSD != null && Number.isFinite(c.montoUSD)) {
    return c.montoUSD;
  }
  const mon = c.moneda === 'UYU' ? 'UYU' : 'USD';
  const tc = c.tipoCambio ?? DEFAULT_EXCHANGE_RATE;
  return mon === 'UYU' ? c.monto / tc : c.monto;
}

/** Ingreso bruto del viaje en USD (tarifa × tonelada, con TC histórico si la tarifa está en UYU). */
export function tripRevenueUsd(trip: Trip): number {
  if (trip.moneda === 'UYU') {
    const tc = trip.tipoCambio ?? DEFAULT_EXCHANGE_RATE;
    return (trip.tarifa * (trip.pesoKg / 1000)) / tc;
  }
  return trip.tarifa * (trip.pesoKg / 1000);
}

/** Ingreso contabilizado en KPIs: solo si el viaje está marcado como cobrado. */
export function tripRevenueRealized(trip: Trip): number {
  return trip.facturaCobrada === true ? tripRevenueUsd(trip) : 0;
}

function isFinishedTrip(t: Trip): boolean {
  return t.estado === 'Completado' || t.estado === 'Cerrado';
}

/** Mes YYYY-MM usado para atribuir ingreso realizado (cobro) al P&L mensual. */
function realizedMonthKey(trip: Trip): string | null {
  if (trip.facturaCobrada !== true) {
    return null;
  }
  const raw = trip.facturaFechaCobro?.trim();
  if (raw && raw.length >= 7) {
    return raw.slice(0, 7);
  }
  return trip.fecha.slice(0, 7);
}

function sumCostsForTrip(costs: Cost[], tripId: string): number {
  return costs.filter((c) => c.tripId === tripId).reduce((acc, c) => acc + costUsd(c), 0);
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) {
    return ym;
  }
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('es-UY', { month: 'short', year: 'numeric' });
}

/** Último mes YYYY-MM presente en viajes o costos (determinístico, sin reloj del sistema). */
function latestYearMonthKey(trips: Trip[], costs: Cost[]): string | null {
  let best: string | null = null;
  const consider = (fecha: string) => {
    const k = fecha.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(k) && (!best || k > best)) {
      best = k;
    }
  };
  trips.forEach((t) => consider(t.fecha));
  costs.forEach((c) => consider(c.fecha));
  trips.forEach((t) => {
    if (t.facturaFechaCobro) {
      consider(t.facturaFechaCobro);
    }
  });
  return best;
}

function monthsEndingAtYearMonth(endKey: string, count: number): string[] {
  const [ys, ms] = endKey.split('-');
  let y = Number(ys);
  let mo = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) {
    return [];
  }
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    out.unshift(`${y}-${String(mo).padStart(2, '0')}`);
    mo -= 1;
    if (mo === 0) {
      mo = 12;
      y -= 1;
    }
  }
  return out;
}

const EMPTY_KPI: KPIData = {
  totalRevenueMTD: 0,
  totalCostsMTD: 0,
  netMarginMTD: 0,
  marginPctMTD: 0,
  activeTrips: 0,
  pendingTrips: 0,
  avgRevenuePerTrip: 0,
  topClient: null,
  pendingRevenue: 0,
  realizedRevenue: 0,
};

export function enrichTrips(trips: Trip[], clients: Client[], costs: Cost[]): TripWithMetrics[] {
  return trips.map((trip) => {
    const client = clients.find((c) => c.id === trip.clientId);
    const revenueRealized = tripRevenueRealized(trip);
    const totalCosts = sumCostsForTrip(costs, trip.id);
    const netMargin = revenueRealized - totalCosts;
    const marginPct = revenueRealized > 0 ? (netMargin / revenueRealized) * 100 : 0;
    return {
      ...trip,
      clientName: client?.nombreComercial ?? 'Desconocido',
      totalCosts,
      revenueRealized,
      netMargin,
      marginPct,
    };
  });
}

export function buildMonthlyStats(trips: Trip[], costs: Cost[], months = 6): MonthlyStats[] {
  const endKey = latestYearMonthKey(trips, costs);
  if (!endKey) {
    return [];
  }
  const keys = monthsEndingAtYearMonth(endKey, months);
  const tripIdsByMonth = new Map<string, Set<string>>();
  keys.forEach((k) => tripIdsByMonth.set(k, new Set()));

  trips.forEach((t) => {
    const key = t.fecha.slice(0, 7);
    if (tripIdsByMonth.has(key)) {
      tripIdsByMonth.get(key)?.add(t.id);
    }
  });

  return keys.map((month) => {
    const monthTrips = trips.filter((t) => t.fecha.startsWith(month));
    const revenue = trips
      .filter((t) => realizedMonthKey(t) === month)
      .reduce((acc, t) => acc + tripRevenueRealized(t), 0);

    const pendingRevenue = monthTrips
      .filter((t) => isFinishedTrip(t) && t.facturaCobrada !== true)
      .reduce((acc, t) => acc + tripRevenueUsd(t), 0);

    const ids = tripIdsByMonth.get(month) ?? new Set<string>();
    const costSum = costs
      .filter((c) => c.fecha.startsWith(month) && (c.tripId === null || ids.has(c.tripId)))
      .reduce((acc, c) => acc + costUsd(c), 0);
    const margin = revenue - costSum;
    const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
    const tonsTransported = monthTrips.reduce((acc, t) => acc + t.pesoKg / 1000, 0);

    return {
      month,
      label: monthLabel(month),
      revenue,
      pendingRevenue,
      costs: costSum,
      margin,
      marginPct,
      tripCount: monthTrips.length,
      tonsTransported,
    };
  });
}

export function buildKPIData(trips: Trip[], clients: Client[], costs: Cost[]): KPIData {
  const mtdKey = latestYearMonthKey(trips, costs);
  if (!mtdKey) {
    return { ...EMPTY_KPI };
  }

  const mtdTrips = trips.filter((t) => t.fecha.startsWith(mtdKey));
  const tripIds = new Set(mtdTrips.map((t) => t.id));
  const totalCostsMTD = costs
    .filter((c) => c.tripId !== null && tripIds.has(c.tripId))
    .reduce((acc, c) => acc + costUsd(c), 0);

  const cobradosMtd = trips.filter((t) => realizedMonthKey(t) === mtdKey);
  const totalRevenueMTD = cobradosMtd.reduce((acc, t) => acc + tripRevenueRealized(t), 0);
  const realizedRevenue = totalRevenueMTD;

  const pendingRevenue = trips
    .filter((t) => isFinishedTrip(t) && t.facturaCobrada !== true)
    .reduce((acc, t) => acc + tripRevenueUsd(t), 0);

  const netMarginMTD = totalRevenueMTD - totalCostsMTD;
  const marginPctMTD = totalRevenueMTD > 0 ? (netMarginMTD / totalRevenueMTD) * 100 : 0;

  const activeTrips = trips.filter((t) => t.estado === 'En Tránsito').length;
  const pendingTrips = trips.filter((t) => t.estado === 'Pendiente').length;

  const avgRevenuePerTrip =
    cobradosMtd.length > 0 ? totalRevenueMTD / cobradosMtd.length : 0;

  const revenueByClient = new Map<string, number>();
  cobradosMtd.forEach((t) => {
    const rev = tripRevenueRealized(t);
    revenueByClient.set(t.clientId, (revenueByClient.get(t.clientId) ?? 0) + rev);
  });

  let topClient: { name: string; revenue: number } | null = null;
  revenueByClient.forEach((revenue, clientId) => {
    const name = clients.find((c) => c.id === clientId)?.nombreComercial ?? clientId;
    if (!topClient || revenue > topClient.revenue) {
      topClient = { name, revenue };
    }
  });

  return {
    totalRevenueMTD,
    totalCostsMTD,
    netMarginMTD,
    marginPctMTD,
    activeTrips,
    pendingTrips,
    avgRevenuePerTrip,
    topClient,
    pendingRevenue,
    realizedRevenue,
  };
}

export function getTopRoutes(
  trips: Trip[],
  limit = 5
): { route: string; count: number; revenue: number }[] {
  const map = new Map<string, { count: number; revenue: number }>();
  trips.forEach((t) => {
    const route = `${t.origen} → ${t.destino}`;
    const rev = tripRevenueRealized(t);
    const cur = map.get(route) ?? { count: 0, revenue: 0 };
    map.set(route, { count: cur.count + 1, revenue: cur.revenue + rev });
  });
  return Array.from(map.entries())
    .map(([route, v]) => ({ route, count: v.count, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function getCostsByCategory(
  costs: Cost[]
): { category: string; total: number; pct: number }[] {
  const totals = new Map<string, number>();
  let grand = 0;
  costs.forEach((c) => {
    const cat = c.categoria;
    const u = costUsd(c);
    totals.set(cat, (totals.get(cat) ?? 0) + u);
    grand += u;
  });
  return Array.from(totals.entries())
    .map(([category, total]) => ({
      category,
      total,
      pct: grand > 0 ? (total / grand) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}
