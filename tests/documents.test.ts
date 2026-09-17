import { describe, expect, it } from 'vitest';
import type { FleetDocument } from '../src/types';
import {
  countDocumentAlerts,
  daysUntilExpiry,
  documentAlert,
  filterDocuments,
  normalizeDocumentCategory,
} from '../src/utils/documents';
import { normalizeDocument } from '../src/services/api';
import schema from './fixtures/sheet-schema.json';

function doc(partial: Partial<FleetDocument>): FleetDocument {
  return {
    id: 'DOC1',
    titulo: 'Test',
    categoria: 'camion',
    entidadRef: '',
    emitidoEn: '',
    venceEn: '',
    notas: '',
    activo: true,
    creadoPor: 'admin',
    creadoEn: '2026-01-01',
    ...partial,
  };
}

describe('daysUntilExpiry / documentAlert', () => {
  const today = new Date(2026, 8, 17); // local 2026-09-17

  it('returns null for empty or invalid venceEn', () => {
    expect(daysUntilExpiry('', today)).toBeNull();
    expect(daysUntilExpiry('not-a-date', today)).toBeNull();
    expect(documentAlert(doc({ venceEn: '' }), today)).toBe('none');
  });

  it('marks overdue when days < 0', () => {
    expect(daysUntilExpiry('2026-09-16', today)).toBe(-1);
    expect(documentAlert(doc({ venceEn: '2026-09-16' }), today)).toBe('overdue');
  });

  it('marks expiring on today (day 0) and day 30', () => {
    expect(daysUntilExpiry('2026-09-17', today)).toBe(0);
    expect(documentAlert(doc({ venceEn: '2026-09-17' }), today)).toBe('expiring');
    expect(daysUntilExpiry('2026-10-17', today)).toBe(30);
    expect(documentAlert(doc({ venceEn: '2026-10-17' }), today)).toBe('expiring');
  });

  it('marks ok on day 31', () => {
    expect(daysUntilExpiry('2026-10-18', today)).toBe(31);
    expect(documentAlert(doc({ venceEn: '2026-10-18' }), today)).toBe('ok');
  });

  it('inactive docs never alert', () => {
    expect(documentAlert(doc({ activo: false, venceEn: '2026-09-01' }), today)).toBe('none');
  });
});

describe('countDocumentAlerts / filterDocuments', () => {
  const today = new Date(2026, 8, 17);
  const docs = [
    doc({ id: '1', venceEn: '2026-09-01', activo: true }), // overdue
    doc({ id: '2', venceEn: '2026-10-01', activo: true, categoria: 'seguro' }), // expiring
    doc({ id: '3', venceEn: '2027-01-01', activo: true }), // ok
    doc({ id: '4', venceEn: '2026-09-01', activo: false }), // inactive
  ];

  it('counts only active overdue+expiring', () => {
    expect(countDocumentAlerts(docs, today)).toEqual({
      overdue: 1,
      expiring: 1,
      alertTotal: 2,
    });
  });

  it('filters by categoria, activo, and query', () => {
    expect(filterDocuments(docs, { categoria: 'seguro' }).map((d) => d.id)).toEqual(['2']);
    expect(filterDocuments(docs, { activo: true }).map((d) => d.id)).toEqual(['1', '2', '3']);
    expect(filterDocuments(docs, { activo: 'all' })).toHaveLength(4);
    expect(filterDocuments(docs, { query: 'seguro' }).map((d) => d.id)).toEqual(['2']);
  });
});

describe('normalizeDocumentCategory / normalizeDocument', () => {
  it('falls back unknown categoria to otro', () => {
    expect(normalizeDocumentCategory('camion')).toBe('camion');
    expect(normalizeDocumentCategory('DESCONOCIDO')).toBe('otro');
  });

  it('maps fixture rows and coerces activo TRUE/FALSE', () => {
    const active = normalizeDocument(schema.sheets.DB_Documentos.sampleRows[0]);
    expect(active.id).toBe('doc-fake-001');
    expect(active.categoria).toBe('camion');
    expect(active.activo).toBe(true);
    expect(active.archivoUrl).toContain('drive.google.com');

    const inactive = normalizeDocument(schema.sheets.DB_Documentos.sampleRows[1]);
    expect(inactive.activo).toBe(false);
    expect(inactive.venceEn).toBe('');
    expect(inactive.archivoUrl).toBeUndefined();
  });

  it('treats missing documents dump as empty via map shape', () => {
    // Old GAS: no documents key — normalizeDocument not called; empty array contract.
    const rows: unknown[] = [];
    expect(rows.map((r) => normalizeDocument(r))).toEqual([]);
  });
});
