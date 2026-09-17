import { describe, expect, it } from 'vitest';
import type { Client, Cost, Trip } from '../src/types';
import { calcCombustiblePorKm, tripRevenueUSD } from '../src/utils/analytics';
import {
  FUEL_IMPUTED_CATEGORY,
  buildReconciledCostsByCategory,
  generateReport,
} from '../src/utils/reportData';

const clientA: Client = {
  id: 'c1',
  nombreComercial: 'Agro Sur',
  departamento: 'Montevideo',
  localidad: 'Centro',
  latitud: -34.9,
  longitud: -56.1,
};

const clientB: Client = {
  id: 'c2',
  nombreComercial: 'Logi Norte',
  departamento: 'Salto',
  localidad: 'Centro',
  latitud: -31.4,
  longitud: -57.9,
};

function trip(
  partial: Partial<Trip> & Pick<Trip, 'id' | 'fecha' | 'clientId' | 'kmRecorridos' | 'tarifa' | 'pesoKg'>
): Trip {
  return {
    estado: 'Completado',
    contenido: 'Granos',
    origen: 'Paysandú',
    destino: 'Montevideo',
    moneda: 'USD',
    ...partial,
  };
}

function cost(
  partial: Partial<Cost> & Pick<Cost, 'id' | 'fecha' | 'categoria' | 'montoUSD'>
): Cost {
  const montoUSD = partial.montoUSD ?? 0;
  return {
    tripId: null,
    descripcion: 'test',
    monto: montoUSD,
    moneda: 'USD',
    registradoPor: 'test',
    ...partial,
    montoUSD,
  };
}

describe('reportData — cost category reconciliation (R5)', () => {
  const trips: Trip[] = [
    trip({
      id: 't1',
      fecha: '2026-08-05',
      clientId: 'c1',
      kmRecorridos: 400,
      tarifa: 50,
      pesoKg: 20000,
      facturaCobrada: true,
    }),
    trip({
      id: 't2',
      fecha: '2026-08-12',
      clientId: 'c1',
      kmRecorridos: 300,
      tarifa: 48,
      pesoKg: 18000,
      facturaSolicitada: true,
      facturaCobrada: false,
    }),
    trip({
      id: 't3',
      fecha: '2026-08-20',
      clientId: 'c2',
      kmRecorridos: 250,
      tarifa: 55,
      pesoKg: 16000,
      facturaCobrada: true,
    }),
    // outside month — used for fleet fuel rate
    trip({
      id: 't-jul',
      fecha: '2026-07-10',
      clientId: 'c1',
      kmRecorridos: 500,
      tarifa: 40,
      pesoKg: 15000,
      facturaCobrada: true,
    }),
  ];

  const costs: Cost[] = [
    cost({ id: 'c-fuel-1', fecha: '2026-08-01', categoria: 'Combustible', montoUSD: 1000 }),
    cost({ id: 'c-fuel-2', fecha: '2026-07-15', categoria: 'Combustible', montoUSD: 800 }),
    cost({ id: 'c-maint', fecha: '2026-08-08', categoria: 'Mantenimiento', montoUSD: 200 }),
    cost({ id: 'c-sueldo', fecha: '2026-08-01', categoria: 'Sueldos', montoUSD: 500 }),
    cost({ id: 'c-blue', fecha: '2026-08-18', categoria: 'AD Blue', montoUSD: 50 }),
  ];

  it('sum(costsByCategory.total) === totalCostos (±0.01) and excludes raw Combustible', async () => {
    const report = await generateReport(
      { scope: 'mensual', month: '2026-08' },
      trips,
      costs,
      [clientA, clientB]
    );

    const catSum = report.costsByCategory.reduce((s, r) => s + r.total, 0);
    expect(Math.abs(catSum - report.totalCostos)).toBeLessThanOrEqual(0.01);

    expect(report.costsByCategory.some((r) => r.category === 'Combustible')).toBe(false);
    expect(report.costsByCategory.some((r) => r.category === FUEL_IMPUTED_CATEGORY)).toBe(true);

    const rate = calcCombustiblePorKm(trips, costs);
    const monthTrips = trips.filter((t) => t.fecha.startsWith('2026-08'));
    const fuelImputed = monthTrips.reduce((s, t) => s + t.kmRecorridos * rate, 0);
    const fuelRow = report.costsByCategory.find((r) => r.category === FUEL_IMPUTED_CATEGORY);
    expect(fuelRow?.total).toBeCloseTo(fuelImputed, 6);
  });

  it('buildReconciledCostsByCategory closes with direct + fuel', () => {
    const monthCosts = costs.filter((c) => c.fecha.startsWith('2026-08'));
    const rate = calcCombustiblePorKm(trips, costs);
    const monthTrips = trips.filter((t) => t.fecha.startsWith('2026-08'));
    const fuelImputed = monthTrips.reduce((s, t) => s + t.kmRecorridos * rate, 0);
    const direct = monthCosts
      .filter((c) => c.categoria !== 'Combustible')
      .reduce((s, c) => s + (c.montoUSD ?? 0), 0);
    const rows = buildReconciledCostsByCategory(monthCosts, fuelImputed);
    const sum = rows.reduce((s, r) => s + r.total, 0);
    expect(sum).toBeCloseTo(direct + fuelImputed, 6);
    expect(rows.find((r) => r.category === 'Combustible')).toBeUndefined();
  });

  it('KPI sanity: generado / cobrado / pendiente relationship', async () => {
    const report = await generateReport(
      { scope: 'mensual', month: '2026-08' },
      trips,
      costs,
      [clientA, clientB]
    );

    const monthTrips = trips.filter((t) => t.fecha.startsWith('2026-08'));
    const expectedGen = monthTrips.reduce((s, t) => s + tripRevenueUSD(t), 0);
    expect(report.totalGenerado).toBeCloseTo(expectedGen, 6);
    expect(report.totalCobrado).toBeGreaterThan(0);
    expect(report.totalPendiente).toBeGreaterThan(0);
    expect(report.totalCobrado + report.totalPendiente).toBeLessThanOrEqual(report.totalGenerado + 0.01);
    expect(report.netMargin).toBeCloseTo(report.totalGenerado - report.totalCostos, 6);
  });

  it('fallback summary cites formatted period amounts', async () => {
    const report = await generateReport(
      { scope: 'mensual', month: '2026-08' },
      trips,
      costs,
      [clientA, clientB]
    );

    const fmt = (n: number) =>
      n.toLocaleString('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

    expect(report.aiSummary).toContain(fmt(report.totalGenerado));
    expect(report.aiSummary).toContain(fmt(report.totalCobrado));
    expect(report.aiSummary).toContain(fmt(report.netMargin));
    expect(report.aiSummary).toContain(fmt(report.totalCostos));
    expect(report.aiSummary.length).toBeGreaterThan(40);
  });
});
