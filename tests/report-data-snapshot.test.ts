import { describe, expect, it } from 'vitest';
import type { Client, Cost, Trip } from '../src/types';
import { calcCombustiblePorKm, tripRevenueUSD } from '../src/utils/analytics';
import {
  FUEL_IMPUTED_CATEGORY,
  FUEL_IMPUTED_REF_LABEL,
  buildReconciledCostsByCategory,
  fmtPerKm,
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

describe('reportData — registered period costs (policy D)', () => {
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
    // outside month — used for fleet fuel rate (trip margin / fuelImputedRef only)
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

  it('totalCostos = Combustible + Mant. (+ other) at 100%; no ×0.7 on period total', async () => {
    const report = await generateReport(
      { scope: 'mensual', month: '2026-08' },
      trips,
      costs,
      [clientA, clientB]
    );

    // August registered: fuel 1000 + maint 200 + sueldos 500 + AD Blue 50
    expect(report.totalCostos).toBeCloseTo(1750, 6);
    // Must NOT be hybrid: non-fuel 750 + (monthKm × rate × implies 0.7 in rate)
    const rate = calcCombustiblePorKm(trips, costs);
    const monthKm = trips
      .filter((t) => t.fecha.startsWith('2026-08'))
      .reduce((s, t) => s + t.kmRecorridos, 0);
    const hybridOld = 750 + monthKm * rate;
    expect(report.totalCostos).not.toBeCloseTo(hybridOld, 0);
    // Raw Combustible fully included (not ×0.7)
    expect(report.totalCostos).toBeGreaterThan(1000 + 200 + 500 + 50 - 0.01);
  });

  it('sum(costsByCategory.total) === totalCostos (±0.01) and includes raw Combustible', async () => {
    const report = await generateReport(
      { scope: 'mensual', month: '2026-08' },
      trips,
      costs,
      [clientA, clientB]
    );

    const catSum = report.costsByCategory.reduce((s, r) => s + r.total, 0);
    expect(Math.abs(catSum - report.totalCostos)).toBeLessThanOrEqual(0.01);

    const fuelRow = report.costsByCategory.find((r) => r.category === 'Combustible');
    expect(fuelRow?.total).toBeCloseTo(1000, 6);
    expect(report.costsByCategory.some((r) => r.category === 'Mantenimiento')).toBe(true);
    expect(
      report.costsByCategory.some(
        (r) => r.category === FUEL_IMPUTED_CATEGORY || r.category === 'Combustible (imputado km)'
      )
    ).toBe(false);

    // Q1 ref line: Policy A estimate present but does not drive totalCostos
    expect(report.fuelImputedRef).toBeGreaterThan(0);
    expect(report.fuelImputedRef).not.toBeCloseTo(report.totalCostos, 0);
  });

  it('buildReconciledCostsByCategory closes with registered sum', () => {
    const monthCosts = costs.filter((c) => c.fecha.startsWith('2026-08'));
    const registered = monthCosts.reduce((s, c) => s + (c.montoUSD ?? 0), 0);
    const rows = buildReconciledCostsByCategory(monthCosts);
    const sum = rows.reduce((s, r) => s + r.total, 0);
    expect(sum).toBeCloseTo(registered, 6);
    expect(rows.find((r) => r.category === 'Combustible')?.total).toBeCloseTo(1000, 6);
    expect(rows.find((r) => r.category === FUEL_IMPUTED_REF_LABEL)).toBeUndefined();
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
    expect(report.aiCommentary.trim().length).toBeGreaterThan(40);
    expect(report.aiCommentary.split(/\n\n+/).length).toBeGreaterThanOrEqual(2);
    expect(report.aiCommentary).toContain(FUEL_IMPUTED_REF_LABEL);
  });

  it('fmtPerKm keeps cost/km ≠ revenue/km when values differ; margin/km correct', async () => {
    const report = await generateReport(
      { scope: 'mensual', month: '2026-08' },
      trips,
      costs,
      [clientA, clientB]
    );

    expect(report.totalKm).toBeGreaterThan(0);
    expect(report.costPerKm).toBeCloseTo(report.totalCostos / report.totalKm, 8);
    expect(report.costPerKm).not.toBeCloseTo(report.revenuePerKm, 2);
    expect(report.marginPerKm).toBeCloseTo(report.revenuePerKm - report.costPerKm, 8);

    const costFmt = fmtPerKm(report.costPerKm);
    const revFmt = fmtPerKm(report.revenuePerKm);
    const marginFmt = fmtPerKm(report.marginPerKm);

    expect(costFmt).not.toEqual(revFmt);
    expect(marginFmt).toBe(fmtPerKm(report.revenuePerKm - report.costPerKm));

    // Aggregate fmt (0 decimals) would falsely equate nearby per-km rates
    const aggregateFmt = (n: number) =>
      n.toLocaleString('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    // Known case: values that round to the same whole dollar must still differ at 2 dp
    const a = 1.24;
    const b = 1.41;
    expect(aggregateFmt(a)).toEqual(aggregateFmt(b));
    expect(fmtPerKm(a)).not.toEqual(fmtPerKm(b));

    expect(report.aiCommentary).toContain(costFmt);
    expect(report.aiCommentary).toContain(revFmt);
    expect(report.aiCommentary).toContain(marginFmt);
  });
});
