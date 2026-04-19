import type { Client, Cost, KPIData, Trip, TripWithMetrics } from '../types';

const monthPrefix = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export const tripRevenueUsd = (trip: Trip): number =>
  trip.tarifa * (trip.pesoKg / 1000);

export const sumCostsForTrip = (costs: Cost[], tripId: string): number =>
  costs
    .filter((c) => c.tripId === tripId)
    .reduce((acc, c) => acc + c.monto, 0);

export const buildTripWithMetrics = (
  trip: Trip,
  clients: Client[],
  costs: Cost[]
): TripWithMetrics => {
  const client = clients.find((c) => c.id === trip.clientId);
  const revenue = tripRevenueUsd(trip);
  const totalCosts = sumCostsForTrip(costs, trip.id);
  const netMargin = revenue - totalCosts;
  const marginPct = revenue > 0 ? (netMargin / revenue) * 100 : 0;

  return {
    ...trip,
    clientName: client?.nombreComercial ?? 'Desconocido',
    totalCosts,
    netMargin,
    marginPct,
  };
};

export const computeKPIData = (
  trips: Trip[],
  clients: Client[],
  costs: Cost[],
  referenceDate: Date = new Date()
): KPIData => {
  const prefix = monthPrefix(referenceDate);
  const mtdTrips = trips.filter((t) => t.fecha.startsWith(prefix));

  const totalRevenueMTD = mtdTrips.reduce((acc, t) => acc + tripRevenueUsd(t), 0);
  const tripIds = new Set(mtdTrips.map((t) => t.id));
  const totalCostsMTD = costs
    .filter((c) => c.tripId !== null && tripIds.has(c.tripId))
    .reduce((acc, c) => acc + c.monto, 0);

  const netMarginMTD = totalRevenueMTD - totalCostsMTD;
  const marginPctMTD =
    totalRevenueMTD > 0 ? (netMarginMTD / totalRevenueMTD) * 100 : 0;

  const activeTrips = trips.filter((t) => t.estado === 'En Tránsito').length;
  const pendingTrips = trips.filter((t) => t.estado === 'Pendiente').length;

  const avgRevenuePerTrip =
    mtdTrips.length > 0 ? totalRevenueMTD / mtdTrips.length : 0;

  const revenueByClient = new Map<string, number>();
  for (const t of mtdTrips) {
    const rev = tripRevenueUsd(t);
    revenueByClient.set(t.clientId, (revenueByClient.get(t.clientId) ?? 0) + rev);
  }

  let top: { name: string; revenue: number } | null = null;
  for (const [clientId, revenue] of revenueByClient.entries()) {
    const name =
      clients.find((c) => c.id === clientId)?.nombreComercial ?? clientId;
    if (!top || revenue > top.revenue) {
      top = { name, revenue };
    }
  }

  return {
    totalRevenueMTD,
    totalCostsMTD,
    netMarginMTD,
    marginPctMTD,
    activeTrips,
    pendingTrips,
    avgRevenuePerTrip,
    topClient: top,
  };
};
