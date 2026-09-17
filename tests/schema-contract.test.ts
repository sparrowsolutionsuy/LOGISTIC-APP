import { describe, expect, it } from 'vitest';
import schema from './fixtures/sheet-schema.json';

describe('GET payload contract', () => {
  it('expects documents among top-level keys', () => {
    expect(schema.expectedGetKeys).toContain('clients');
    expect(schema.expectedGetKeys).toContain('trips');
    expect(schema.expectedGetKeys).toContain('costs');
    expect(schema.expectedGetKeys).toContain('scheduledCostDefinitions');
    expect(schema.expectedGetKeys).toContain('documents');
  });
});

describe('Sheet header fixtures', () => {
  it('DB_Viajes includes scheduledCostId', () => {
    expect(schema.sheets.DB_Viajes.headers).toContain('scheduledCostId');
    expect(schema.sheets.DB_Viajes.headers).toContain('tarifaUYU');
  });

  it('DB_CostosProgramados has definition headers', () => {
    const headers = schema.sheets.DB_CostosProgramados.headers;
    expect(headers).toEqual(
      expect.arrayContaining([
        'id',
        'categoria',
        'descripcion',
        'monto',
        'dayOfMonth',
        'active',
        'currency',
      ])
    );
  });

  it('DB_Documentos has document headers', () => {
    const headers = schema.sheets.DB_Documentos.headers;
    expect(headers).toEqual([
      'id',
      'titulo',
      'categoria',
      'entidadRef',
      'emitidoEn',
      'venceEn',
      'archivoUrl',
      'notas',
      'activo',
      'creadoPor',
      'creadoEn',
      'actualizadoEn',
    ]);
  });

  it('sample rows only use declared headers (no password leaks in non-user sheets)', () => {
    for (const [name, sheet] of Object.entries(schema.sheets)) {
      if (name === 'DB_Usuarios') continue;
      for (const row of sheet.sampleRows) {
        for (const key of Object.keys(row)) {
          expect(sheet.headers).toContain(key);
        }
        expect(JSON.stringify(row).toLowerCase()).not.toMatch(/admin123|op123/);
      }
    }
  });

  it('DB_Usuarios fixture redacts password', () => {
    const row = schema.sheets.DB_Usuarios.sampleRows[0];
    expect(row.password).toBe('REDACTED');
  });
});
