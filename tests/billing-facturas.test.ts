import { describe, expect, it } from 'vitest';
import type { Trip } from '../src/types';
import {
  filterFacturasCatalog,
  tripInFacturasCatalog,
} from '../src/utils/billingFacturas';

function trip(partial: Partial<Trip> & Pick<Trip, 'id'>): Trip {
  return {
    fecha: '2026-03-15',
    clientId: 'c1',
    estado: 'Completado',
    contenido: 'Granos',
    pesoKg: 20000,
    kmRecorridos: 100,
    tarifa: 50,
    origen: 'A',
    destino: 'B',
    moneda: 'USD',
    ...partial,
  };
}

describe('tripInFacturasCatalog (D1)', () => {
  it('includes trips with facturaUrl', () => {
    expect(
      tripInFacturasCatalog(trip({ id: 't1', facturaUrl: 'https://drive.example/f' }))
    ).toBe(true);
  });

  it('includes trips with facturaGenerada true even without URL', () => {
    expect(tripInFacturasCatalog(trip({ id: 't2', facturaGenerada: true }))).toBe(true);
  });

  it('includes trips with both URL and generada', () => {
    expect(
      tripInFacturasCatalog(
        trip({ id: 't3', facturaUrl: 'https://x', facturaGenerada: true })
      )
    ).toBe(true);
  });

  it('excludes trips with neither URL nor generada', () => {
    expect(tripInFacturasCatalog(trip({ id: 't4' }))).toBe(false);
    expect(tripInFacturasCatalog(trip({ id: 't5', facturaGenerada: false }))).toBe(false);
    expect(tripInFacturasCatalog(trip({ id: 't6', facturaUrl: '   ' }))).toBe(false);
  });
});

describe('filterFacturasCatalog', () => {
  const rows: Trip[] = [
    trip({
      id: 'V-001',
      clientId: 'c1',
      fecha: '2026-01-10',
      facturaGenerada: true,
      facturaSolicitada: true,
      facturaFechaSolicitud: '2026-01-12',
    }),
    trip({
      id: 'V-002',
      clientId: 'c2',
      fecha: '2026-02-05',
      facturaUrl: 'https://drive.example/2',
      facturaGenerada: true,
      facturaCobrada: true,
      facturaFechaCobro: '2026-02-20',
    }),
    trip({
      id: 'V-003',
      clientId: 'c1',
      fecha: '2026-02-18',
      // pendiente — must be excluded by D1
    }),
    trip({
      id: 'V-004',
      clientId: 'c1',
      fecha: '2026-03-01',
      facturaGenerada: true,
    }),
  ];

  const names: Record<string, string> = {
    c1: 'Acme Logística',
    c2: 'Beta Cargas',
  };

  it('applies D1 before other filters', () => {
    const out = filterFacturasCatalog(rows);
    expect(out.map((t) => t.id).sort()).toEqual(['V-001', 'V-002', 'V-004']);
  });

  it('filters by clientId', () => {
    const out = filterFacturasCatalog(rows, { clientId: 'c2' });
    expect(out.map((t) => t.id)).toEqual(['V-002']);
  });

  it('filters by billing status', () => {
    const cobrada = filterFacturasCatalog(rows, { status: 'cobrada' });
    expect(cobrada.map((t) => t.id)).toEqual(['V-002']);

    const solicitada = filterFacturasCatalog(rows, { status: 'solicitada' });
    expect(solicitada.map((t) => t.id)).toEqual(['V-001']);

    const generada = filterFacturasCatalog(rows, { status: 'generada' });
    expect(generada.map((t) => t.id)).toEqual(['V-004']);
  });

  it('filters by month on trip fecha', () => {
    const out = filterFacturasCatalog(rows, { month: '2026-02' });
    expect(out.map((t) => t.id).sort()).toEqual(['V-002']);
  });

  it('searches by id and client name', () => {
    const byId = filterFacturasCatalog(rows, {
      search: 'v-004',
      clientNameOf: (id) => names[id] ?? '',
    });
    expect(byId.map((t) => t.id)).toEqual(['V-004']);

    const byName = filterFacturasCatalog(rows, {
      search: 'beta',
      clientNameOf: (id) => names[id] ?? '',
    });
    expect(byName.map((t) => t.id)).toEqual(['V-002']);
  });

  it('combines filters (AND)', () => {
    const out = filterFacturasCatalog(rows, {
      clientId: 'c1',
      month: '2026-01',
      status: 'solicitada',
      search: '001',
      clientNameOf: (id) => names[id] ?? '',
    });
    expect(out.map((t) => t.id)).toEqual(['V-001']);
  });
});
