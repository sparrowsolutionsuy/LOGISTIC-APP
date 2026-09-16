import { describe, expect, it } from 'vitest';
import {
  normalizeClient,
  normalizeCost,
  normalizeScheduledCostDefinition,
  normalizeTrip,
} from '../src/services/api';
import schema from './fixtures/sheet-schema.json';

describe('normalizeTrip', () => {
  it('maps fixture row including scheduledCostId and moneda', () => {
    const row = schema.sheets.DB_Viajes.sampleRows[0];
    const trip = normalizeTrip(row);
    expect(trip.id).toBe('trip-fixture-1');
    expect(trip.clientId).toBe('client-fixture-1');
    expect(trip.estado).toBe('Completado');
    expect(trip.moneda).toBe('USD');
    expect(trip.tarifa).toBe(150);
    expect(trip.tarifaUYU).toBe(6000);
    expect(trip.facturaGenerada).toBe(false);
    expect(trip.scheduledCostId).toBeUndefined();
  });

  it('parses scheduledCostId when present', () => {
    const trip = normalizeTrip({
      ...schema.sheets.DB_Viajes.sampleRows[0],
      scheduledCostId: 'sched-fixture-1',
    });
    expect(trip.scheduledCostId).toBe('sched-fixture-1');
  });
});

describe('normalizeClient', () => {
  it('maps fixture client without inventing billing', () => {
    const client = normalizeClient(schema.sheets.DB_Clientes.sampleRows[0]);
    expect(client.id).toBe('client-fixture-1');
    expect(client.nombreComercial).toBe('Cliente Fixture SA');
    expect(client.email).toBe('fixture@example.test');
    expect(client.facturacion).toBeUndefined();
  });
});

describe('normalizeCost', () => {
  it('maps USD trip cost', () => {
    const cost = normalizeCost(schema.sheets.DB_Costos.sampleRows[0]);
    expect(cost.id).toBe('cost-fixture-1');
    expect(cost.tripId).toBe('trip-fixture-1');
    expect(cost.categoria).toBe('Combustible');
    expect(cost.moneda).toBe('USD');
    expect(cost.montoUSD).toBe(80);
    expect(cost.isScheduled).toBe(false);
  });

  it('maps scheduled UYU cost and coerces empty tripId to null', () => {
    const cost = normalizeCost(schema.sheets.DB_Costos.sampleRows[1]);
    expect(cost.tripId).toBeNull();
    expect(cost.moneda).toBe('UYU');
    expect(cost.montoUSD).toBe(40);
    expect(cost.isScheduled).toBe(true);
    expect(cost.scheduleId).toBe('sched-fixture-1');
  });
});

describe('normalizeScheduledCostDefinition', () => {
  it('maps fixture definition', () => {
    const def = normalizeScheduledCostDefinition(schema.sheets.DB_CostosProgramados.sampleRows[0]);
    expect(def.id).toBe('sched-fixture-1');
    expect(def.categoria).toBe('Alquiler');
    expect(def.dayOfMonth).toBe(1);
    expect(def.active).toBe(true);
    expect(def.currency).toBe('UYU');
    expect(def.tripId).toBeUndefined();
  });
});
