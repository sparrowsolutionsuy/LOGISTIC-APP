import { describe, expect, it } from 'vitest';
import type { Client, Cost, Trip } from '../src/types';
import {
  buildKPIData,
  calcCombustiblePorKm,
  enrichTrips,
  tripRevenueUSD,
} from '../src/utils/analytics';

const client: Client = {
  id: 'c1',
  nombreComercial: 'Cliente Demo',
  departamento: 'Montevideo',
  localidad: 'Centro',
  latitud: -34.9,
  longitud: -56.1,
};

function trip(partial: Partial<Trip> & Pick<Trip, 'id' | 'fecha' | 'kmRecorridos' | 'tarifa' | 'pesoKg'>): Trip {
  return {
    clientId: 'c1',
    estado: 'Completado',
    contenido: 'Granos',
    origen: 'A',
    destino: 'B',
    moneda: 'USD',
    ...partial,
  };
}

function fuelCost(partial: Partial<Cost> & Pick<Cost, 'id' | 'fecha' | 'montoUSD'>): Cost {
  const montoUSD = partial.montoUSD ?? 0;
  return {
    tripId: null,
    categoria: 'Combustible',
    descripcion: 'Carga combustible',
    monto: montoUSD,
    moneda: 'USD',
    registradoPor: 'test',
    ...partial,
    montoUSD,
  };
}

describe('policy A — combustiblePorKm tasa flota global (trip-level only)', () => {
  // Many trips across months; fuel loaded in different months (periodic, not per trip).
  const allTrips: Trip[] = [
    trip({ id: 't-jan-1', fecha: '2026-01-10', kmRecorridos: 400, tarifa: 45, pesoKg: 20000 }),
    trip({ id: 't-jan-2', fecha: '2026-01-20', kmRecorridos: 350, tarifa: 50, pesoKg: 18000 }),
    trip({ id: 't-feb-1', fecha: '2026-02-05', kmRecorridos: 500, tarifa: 48, pesoKg: 22000 }),
    trip({ id: 't-feb-2', fecha: '2026-02-18', kmRecorridos: 300, tarifa: 42, pesoKg: 15000 }),
    trip({ id: 't-mar-1', fecha: '2026-03-08', kmRecorridos: 450, tarifa: 55, pesoKg: 20000 }),
    // Sparse month with few km — previously blew up rate when used as denominator alone
    trip({ id: 't-apr-1', fecha: '2026-04-12', kmRecorridos: 200, tarifa: 60, pesoKg: 16000 }),
  ];

  const allCosts: Cost[] = [
    fuelCost({ id: 'f1', fecha: '2026-01-05', montoUSD: 800 }),
    fuelCost({ id: 'f2', fecha: '2026-02-01', montoUSD: 900 }),
    fuelCost({ id: 'f3', fecha: '2026-03-01', montoUSD: 700 }),
    fuelCost({ id: 'f4', fecha: '2026-04-01', montoUSD: 600 }),
  ];

  const allKm = allTrips.reduce((s, t) => s + t.kmRecorridos, 0);
  const allFuel = allCosts.reduce((s, c) => s + (c.montoUSD ?? 0), 0);
  const expectedGlobalRate = (allFuel * 0.7) / allKm;

  it('calcCombustiblePorKm uses the trips universe passed in', () => {
    expect(calcCombustiblePorKm(allTrips, allCosts)).toBeCloseTo(expectedGlobalRate, 10);
  });

  it('enriching one month with all costs must NOT use allFuel / monthKm', () => {
    const aprilTrips = allTrips.filter((t) => t.fecha.startsWith('2026-04'));
    const monthKm = aprilTrips.reduce((s, t) => s + t.kmRecorridos, 0);
    const buggyRate = (allFuel * 0.7) / monthKm;

    // Bug reproduction: same call signature as old FinancialDashboard
    const buggyImplied = calcCombustiblePorKm(aprilTrips, allCosts);
    expect(buggyImplied).toBeCloseTo(buggyRate, 10);
    expect(buggyRate).toBeGreaterThan(expectedGlobalRate * 5);

    const enriched = enrichTrips(aprilTrips, [client], allCosts, {
      rateTrips: allTrips,
      rateCosts: allCosts,
    });

    const rateUsed = enriched[0].fuelCostEst / enriched[0].kmRecorridos;
    expect(rateUsed).toBeCloseTo(expectedGlobalRate, 10);
    expect(rateUsed).not.toBeCloseTo(buggyRate, 2);
  });

  it('month-filtered enrichment is not systematically deeply negative with realistic revenue/km', () => {
    const aprilTrips = allTrips.filter((t) => t.fecha.startsWith('2026-04'));
    const enriched = enrichTrips(aprilTrips, [client], allCosts, {
      rateTrips: allTrips,
      rateCosts: allCosts,
    });

    for (const row of enriched) {
      const rev = tripRevenueUSD(row);
      expect(rev).toBeGreaterThan(0);
      // With ~0.9 USD/km fleet rate vs ~$960 revenue on 200km, margin stays healthy
      expect(row.marginPct).toBeGreaterThan(50);
      expect(row.fuelCostEst).toBeCloseTo(row.kmRecorridos * expectedGlobalRate, 8);
      expect(row.directCosts).toBe(0);
      expect(row.totalCosts).toBeCloseTo(row.fuelCostEst, 8);
    }

    // Contrast: buggy rate would crush margins
    const buggyEnriched = enrichTrips(aprilTrips, [client], allCosts);
    expect(buggyEnriched.every((r) => r.marginPct < 0)).toBe(true);
  });

  it('includes trip-linked non-fuel direct costs and keeps estimated revenue (pending collection ok)', () => {
    const aprilTrips = allTrips.filter((t) => t.fecha.startsWith('2026-04'));
    const pending = {
      ...aprilTrips[0],
      facturaSolicitada: true,
      facturaCobrada: false,
    };
    const direct: Cost = {
      id: 'd1',
      fecha: '2026-04-12',
      tripId: pending.id,
      categoria: 'AD Blue',
      descripcion: 'AD Blue viaje',
      monto: 40,
      moneda: 'USD',
      montoUSD: 40,
      registradoPor: 'test',
    };

    const enriched = enrichTrips([pending], [client], [...allCosts, direct], {
      rateTrips: allTrips,
      rateCosts: allCosts,
    });

    expect(enriched[0].directCosts).toBe(40);
    expect(enriched[0].fuelCostEst).toBeCloseTo(pending.kmRecorridos * expectedGlobalRate, 8);
    expect(enriched[0].totalCosts).toBeCloseTo(enriched[0].fuelCostEst + 40, 8);
    // Revenue is generated, not cobrado-only
    expect(tripRevenueUSD(enriched[0])).toBe(pending.tarifa * (pending.pesoKg / 1000));
    expect(enriched[0].netMargin).toBeCloseTo(
      tripRevenueUSD(enriched[0]) - enriched[0].totalCosts,
      8
    );
  });

  it('accepts precomputed combustiblePorKm', () => {
    const aprilTrips = allTrips.filter((t) => t.fecha.startsWith('2026-04'));
    const rate = calcCombustiblePorKm(allTrips, allCosts);
    const enriched = enrichTrips(aprilTrips, [client], allCosts, { combustiblePorKm: rate });
    expect(enriched[0].fuelCostEst).toBeCloseTo(aprilTrips[0].kmRecorridos * rate, 10);
  });
});

describe('period KPI — registered costs (policy D)', () => {
  const trips: Trip[] = [
    trip({ id: 't1', fecha: '2026-08-10', kmRecorridos: 400, tarifa: 50, pesoKg: 20000 }),
    trip({ id: 't2', fecha: '2026-07-10', kmRecorridos: 500, tarifa: 40, pesoKg: 15000 }),
  ];

  const costs: Cost[] = [
    fuelCost({ id: 'f-aug', fecha: '2026-08-01', montoUSD: 1000 }),
    {
      id: 'm-aug',
      fecha: '2026-08-05',
      tripId: null,
      categoria: 'Mantenimiento',
      descripcion: 'Service',
      monto: 300,
      moneda: 'USD',
      montoUSD: 300,
      registradoPor: 'test',
    },
    fuelCost({ id: 'f-jul', fecha: '2026-07-01', montoUSD: 800 }),
  ];

  it('buildKPIData includes Combustible + Mant. at 100%; no ×0.7 on period total', () => {
    const kpi = buildKPIData(trips, [client], costs, '2026-08');
    expect(kpi.totalCostos).toBeCloseTo(1300, 6);

    const rate = calcCombustiblePorKm(trips, costs);
    const hybridOld = 300 + 400 * rate;
    expect(kpi.totalCostos).not.toBeCloseTo(hybridOld, 0);
    // 0.7 would make fuel contribution 700 if wrongly applied to period invoice
    expect(kpi.totalCostos).not.toBeCloseTo(700 + 300, 0);
  });
});
