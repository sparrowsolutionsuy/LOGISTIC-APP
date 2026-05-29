import type { Client, Cost, KPIData, MonthlyStats, Trip, TripWithMetrics } from '../types';

// ─── Revenue ────────────────────────────────────────────────────────────────

/** Ingreso en USD generado por un viaje (tarifa ya normalizada a USD) */
export function tripRevenueUSD(trip: Trip): number {
  return trip.tarifa * (trip.pesoKg / 1000);
}

/** @deprecated Usar tripRevenueUSD */
export const tripRevenueUsd = tripRevenueUSD;

/** Determina si un viaje ya fue efectivamente cobrado */
export function isCobrado(trip: Trip): boolean {
  return trip.facturaCobrada === true;
}

/** Determina si un viaje está facturado pero pendiente de cobro */
export function isPendienteCobro(trip: Trip): boolean {
  return trip.facturaSolicitada === true && !isCobrado(trip);
}

/** Ingreso contabilizado solo si el viaje está cobrado. */
export function tripRevenueRealized(trip: Trip): number {
  return isCobrado(trip) ? tripRevenueUSD(trip) : 0;
}

/** Mes YYYY-MM para atribuir ingreso cobrado al P&L mensual. */
export function tripRealizedRevenueMonthKey(trip: Trip): string | null {
  if (!isCobrado(trip)) return null;
  const raw = trip.facturaFechaCobro?.trim();
  if (raw && raw.length >= 7) return raw.split('T')[0].slice(0, 7);
  return trip.fecha.slice(0, 7);
}

/** Monto del costo en USD (siempre usar montoUSD normalizado). */
export function costUsd(c: Cost): number {
  return c.montoUSD ?? 0;
}

// ─── Combustible por KM ──────────────────────────────────────────────────────

/**
 * Calcula el costo de combustible por km recorrido en viaje con carga.
 * Se imputa el 70% del combustible total a viajes cargados.
 * El denominador son los km de todos los viajes registrados.
 */
export function calcCombustiblePorKm(trips: Trip[], costs: Cost[]): number {
  const totalCombustibleUSD = costs
    .filter((c) => c.categoria === 'Combustible')
    .reduce((s, c) => s + (c.montoUSD ?? 0), 0);

  const totalKmViajes = trips.reduce((s, t) => s + (t.kmRecorridos ?? 0), 0);

  if (totalKmViajes === 0 || totalCombustibleUSD === 0) return 0;

  // 70% del combustible corresponde a viajes con carga
  return (totalCombustibleUSD * 0.7) / totalKmViajes;
}

// ─── Costos por viaje ────────────────────────────────────────────────────────

/** Suma de costos NO-combustible directamente asociados a un viaje (montoUSD) */
function directCostsForTrip(costs: Cost[], tripId: string): number {
  return costs
    .filter((c) => c.tripId === tripId && c.categoria !== 'Combustible')
    .reduce((s, c) => s + (c.montoUSD ?? 0), 0);
}

/** Costo estimado de combustible para un viaje según km recorridos */
function estimatedFuelCostForTrip(trip: Trip, combustiblePorKm: number): number {
  return (trip.kmRecorridos ?? 0) * combustiblePorKm;
}

// ─── enrich trips ────────────────────────────────────────────────────────────

export function enrichTrips(trips: Trip[], clients: Client[], costs: Cost[]): TripWithMetrics[] {
  const combustiblePorKm = calcCombustiblePorKm(trips, costs);

  return trips.map((trip) => {
    const client = clients.find((c) => c.id === trip.clientId);
    const revenue = tripRevenueUSD(trip);
    const directCosts = directCostsForTrip(costs, trip.id);
    const fuelCost = estimatedFuelCostForTrip(trip, combustiblePorKm);
    const totalCosts = directCosts + fuelCost;
    const netMargin = revenue - totalCosts;
    const marginPct = revenue > 0 ? (netMargin / revenue) * 100 : 0;

    return {
      ...trip,
      clientName: client?.nombreComercial ?? 'Desconocido',
      totalCosts,
      netMargin,
      marginPct,
    };
  });
}

// ─── Month helpers ───────────────────────────────────────────────────────────

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('es-UY', { month: 'short', year: 'numeric' });
}

export function formatMonthLongEs(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString('es-UY', { month: 'long', year: 'numeric' });
}

export function latestYearMonthKey(trips: Trip[], costs: Cost[]): string | null {
  let best: string | null = null;
  const consider = (fecha: string) => {
    const k = fecha.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(k) && (!best || k > best)) best = k;
  };
  trips.forEach((t) => consider(t.fecha));
  costs.forEach((c) => consider(c.fecha));
  return best;
}

function monthsEndingAt(endKey: string, count: number): string[] {
  const [ys, ms] = endKey.split('-');
  let y = Number(ys);
  let mo = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return [];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.unshift(`${y}-${String(mo).padStart(2, '0')}`);
    mo -= 1;
    if (mo === 0) {
      mo = 12;
      y -= 1;
    }
  }
  return out;
}

function monthsFromToAscending(startKey: string, endKey: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(startKey) || !/^\d{4}-\d{2}$/.test(endKey) || startKey > endKey) {
    return [];
  }
  const out: string[] = [];
  let [y, m] = startKey.split('-').map(Number) as [number, number];
  const [ey, em] = endKey.split('-').map(Number) as [number, number];
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (y === ey && m === em) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// ─── buildMonthlyStats ───────────────────────────────────────────────────────

export function buildMonthlyStats(
  trips: Trip[],
  costs: Cost[],
  months = 6,
  filterMonth?: string | null,
  allTime?: boolean
): MonthlyStats[] {
  if (allTime) {
    const available = getAvailableMonths(trips, costs);
    if (available.length === 0) return [];
    const keys = monthsFromToAscending(available[available.length - 1], available[0]);
    return keys.map((month) => buildMonthlyStats(trips, costs, 1, month)[0]).filter(Boolean);
  }

  const endKey = filterMonth ?? latestYearMonthKey(trips, costs);
  if (!endKey) return [];
  const keys = filterMonth ? [filterMonth] : monthsEndingAt(endKey, months);
  const combustiblePorKm = calcCombustiblePorKm(trips, costs);

  return keys.map((month) => {
    const monthTrips = trips.filter((t) => t.fecha.startsWith(month));

    const totalGenerado = monthTrips.reduce((s, t) => s + tripRevenueUSD(t), 0);
    const totalCobrado = monthTrips.filter(isCobrado).reduce((s, t) => s + tripRevenueUSD(t), 0);
    const totalPendienteCobro = monthTrips
      .filter(isPendienteCobro)
      .reduce((s, t) => s + tripRevenueUSD(t), 0);

    const directCostsMonth = costs
      .filter((c) => c.fecha.startsWith(month) && c.categoria !== 'Combustible')
      .reduce((s, c) => s + (c.montoUSD ?? 0), 0);
    const fuelCostMonth = monthTrips.reduce(
      (s, t) => s + estimatedFuelCostForTrip(t, combustiblePorKm),
      0
    );
    const totalCosts = directCostsMonth + fuelCostMonth;

    const margin = totalGenerado - totalCosts;
    const marginPct = totalGenerado > 0 ? (margin / totalGenerado) * 100 : 0;
    const tonsTransported = monthTrips.reduce((s, t) => s + t.pesoKg / 1000, 0);
    const kmRecorridos = monthTrips.reduce((s, t) => s + (t.kmRecorridos ?? 0), 0);

    return {
      month,
      label: monthLabel(month),
      totalGenerado,
      totalCobrado,
      totalPendienteCobro,
      costs: totalCosts,
      margin,
      marginPct,
      tripCount: monthTrips.length,
      tonsTransported,
      kmRecorridos,
    };
  });
}

// ─── buildKPIData ────────────────────────────────────────────────────────────

export function buildKPIData(
  trips: Trip[],
  clients: Client[],
  costs: Cost[],
  filterMonth?: string
): KPIData {
  const monthFilter =
    filterMonth && filterMonth !== 'all' && /^\d{4}-\d{2}$/.test(filterMonth)
      ? filterMonth
      : undefined;

  const scopeTrips = monthFilter ? trips.filter((t) => t.fecha.startsWith(monthFilter)) : trips;

  const scopeCosts = monthFilter ? costs.filter((c) => c.fecha.startsWith(monthFilter)) : costs;

  const combustiblePorKm = calcCombustiblePorKm(trips, costs);

  const totalGenerado = scopeTrips.reduce((s, t) => s + tripRevenueUSD(t), 0);
  const totalCobrado = scopeTrips.filter(isCobrado).reduce((s, t) => s + tripRevenueUSD(t), 0);
  const totalPendienteCobro = scopeTrips
    .filter(isPendienteCobro)
    .reduce((s, t) => s + tripRevenueUSD(t), 0);

  const directCosts = scopeCosts
    .filter((c) => c.categoria !== 'Combustible')
    .reduce((s, c) => s + (c.montoUSD ?? 0), 0);

  const fuelCostsInScope = scopeCosts
    .filter((c) => c.categoria === 'Combustible')
    .reduce((s, c) => s + (c.montoUSD ?? 0), 0);

  const totalCombustibleAtribuible = monthFilter
    ? fuelCostsInScope * 0.7
    : scopeTrips.reduce((s, t) => s + estimatedFuelCostForTrip(t, combustiblePorKm), 0);

  const totalCostos = directCosts + totalCombustibleAtribuible;
  const margenNeto = totalGenerado - totalCostos;
  const margenPct = totalGenerado > 0 ? (margenNeto / totalGenerado) * 100 : 0;

  const viajesRealizados = scopeTrips.filter(
    (t) => t.estado === 'Completado' || t.estado === 'Cerrado'
  ).length;
  const viajesActivos = trips.filter((t) => t.estado === 'En Tránsito').length;
  const viajesPendientes = trips.filter((t) => t.estado === 'Pendiente').length;
  const kmRecorridos = scopeTrips.reduce((s, t) => s + (t.kmRecorridos ?? 0), 0);
  const toneladasTransportadas = scopeTrips.reduce((s, t) => s + t.pesoKg / 1000, 0);

  const revenueByClient = new Map<string, number>();
  scopeTrips.forEach((t) => {
    const rev = tripRevenueUSD(t);
    revenueByClient.set(t.clientId, (revenueByClient.get(t.clientId) ?? 0) + rev);
  });
  let topCliente: { name: string; revenue: number } | null = null;
  revenueByClient.forEach((revenue, clientId) => {
    const name = clients.find((c) => c.id === clientId)?.nombreComercial ?? clientId;
    if (!topCliente || revenue > topCliente.revenue) topCliente = { name, revenue };
  });

  return {
    totalGenerado,
    totalCobrado,
    totalPendienteCobro,
    totalCostos,
    margenNeto,
    margenPct,
    viajesRealizados,
    viajesActivos,
    viajesPendientes,
    kmRecorridos,
    toneladasTransportadas,
    topCliente,
  };
}

// ─── Helpers para otros módulos ──────────────────────────────────────────────

export function getTopRoutes(
  trips: Trip[],
  limit = 5
): { route: string; count: number; revenue: number }[] {
  const map = new Map<string, { count: number; revenue: number }>();
  trips.forEach((t) => {
    const route = `${t.origen} → ${t.destino}`;
    const rev = tripRevenueUSD(t);
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
    const usd = c.montoUSD ?? 0;
    totals.set(cat, (totals.get(cat) ?? 0) + usd);
    grand += usd;
  });
  return Array.from(totals.entries())
    .map(([category, total]) => ({ category, total, pct: grand > 0 ? (total / grand) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);
}

/** Genera lista de YYYY-MM disponibles en el dataset para usar en filtros */
export function getAvailableMonths(trips: Trip[], costs: Cost[]): string[] {
  const set = new Set<string>();
  trips.forEach((t) => {
    const k = t.fecha.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(k)) set.add(k);
  });
  costs.forEach((c) => {
    const k = c.fecha.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(k)) set.add(k);
  });
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

/** @deprecated Usar getAvailableMonths */
export const collectAvailableMonthKeys = getAvailableMonths;

export function previousCalendarMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  let mo = m - 1;
  let yr = y;
  if (mo < 1) {
    mo = 12;
    yr -= 1;
  }
  return `${yr}-${String(mo).padStart(2, '0')}`;
}

export type WeeklyBucket = { label: string; ingresos: number; costos: number };

/** Ingresos generados y costos por semana calendario dentro del mes YYYY-MM. */
export function buildWeeklyBucketsInMonth(
  trips: Trip[],
  costs: Cost[],
  monthKey: string
): WeeklyBucket[] {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return [];
  const [y, m] = monthKey.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const ranges: [number, number][] = [
    [1, 7],
    [8, 14],
    [15, 21],
    [22, lastDay],
  ];
  const combustiblePorKm = calcCombustiblePorKm(trips, costs);

  return ranges.map(([d0, d1], i) => {
    const weekTrips = trips.filter((t) => {
      if (!t.fecha.startsWith(monthKey)) return false;
      const day = Number(t.fecha.slice(8, 10));
      return day >= d0 && day <= d1;
    });
    const ingresos = weekTrips.reduce((s, t) => s + tripRevenueUSD(t), 0);
    const directCosts = costs
      .filter((c) => {
        if (!c.fecha.startsWith(monthKey) || c.categoria === 'Combustible') return false;
        const day = Number(c.fecha.slice(8, 10));
        return day >= d0 && day <= d1;
      })
      .reduce((s, c) => s + (c.montoUSD ?? 0), 0);
    const fuelCost = weekTrips.reduce(
      (s, t) => s + estimatedFuelCostForTrip(t, combustiblePorKm),
      0
    );
    return {
      label: `Sem. ${i + 1} (${d0}–${Math.min(d1, lastDay)})`,
      ingresos,
      costos: directCosts + fuelCost,
    };
  });
}
