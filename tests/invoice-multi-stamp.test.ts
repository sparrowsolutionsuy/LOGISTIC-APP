import { describe, expect, it } from 'vitest';
import type { Trip } from '../src/types';
import { parseDriveUploadResponse } from '../src/services/api';
import {
  buildUploadInvoiceData,
  normalizeInvoiceTripIds,
  parseInvoiceUploadSuccessBody,
  validateInvoiceSelection,
} from '../src/utils/invoiceMultiStamp';

function trip(partial: Partial<Trip> & Pick<Trip, 'id' | 'clientId'>): Trip {
  return {
    fecha: '2026-03-15',
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

describe('normalizeInvoiceTripIds', () => {
  it('keeps singular tripId as one-element list', () => {
    expect(normalizeInvoiceTripIds('V1')).toEqual(['V1']);
  });

  it('dedupes tripIds and merges singular', () => {
    expect(normalizeInvoiceTripIds('V1', ['V2', 'V1', 'V3'])).toEqual(['V2', 'V1', 'V3']);
  });

  it('ignores blanks', () => {
    expect(normalizeInvoiceTripIds('  ', ['', 'V9'])).toEqual(['V9']);
  });
});

describe('validateInvoiceSelection (D-F3 / D-F4)', () => {
  it('rejects empty', () => {
    const r = validateInvoiceSelection([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty');
  });

  it('rejects mixed clients', () => {
    const r = validateInvoiceSelection([
      trip({ id: 'a', clientId: 'c1' }),
      trip({ id: 'b', clientId: 'c2' }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('mixed_client');
  });

  it('rejects mixed currency', () => {
    const r = validateInvoiceSelection([
      trip({ id: 'a', clientId: 'c1', moneda: 'USD' }),
      trip({ id: 'b', clientId: 'c1', moneda: 'UYU' }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('mixed_currency');
  });

  it('accepts same client and currency', () => {
    const r = validateInvoiceSelection([
      trip({ id: 'a', clientId: 'c1', moneda: 'UYU' }),
      trip({ id: 'b', clientId: 'c1', moneda: 'UYU' }),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tripIds).toEqual(['a', 'b']);
      expect(r.clientId).toBe('c1');
      expect(r.moneda).toBe('UYU');
    }
  });

  it('treats missing moneda as USD', () => {
    const r = validateInvoiceSelection([
      trip({ id: 'a', clientId: 'c1', moneda: undefined }),
      trip({ id: 'b', clientId: 'c1', moneda: 'USD' }),
    ]);
    expect(r.ok).toBe(true);
  });
});

describe('buildUploadInvoiceData', () => {
  it('sends tripIds and singular tripId for one id', () => {
    const data = buildUploadInvoiceData({
      tripIds: ['V1'],
      fileData: 'abc',
      fileName: 'f.pdf',
      mimeType: 'application/pdf',
      folderId: 'folder',
    });
    expect(data.tripIds).toEqual(['V1']);
    expect(data.tripId).toBe('V1');
  });

  it('sends only tripIds for multi (no accidental singular from first)', () => {
    const data = buildUploadInvoiceData({
      tripIds: ['V1', 'V2', 'V3'],
      fileData: 'abc',
      fileName: 'f.pdf',
      mimeType: 'application/pdf',
      folderId: 'folder',
    });
    expect(data.tripIds).toEqual(['V1', 'V2', 'V3']);
    expect(data.tripId).toBeUndefined();
  });
});

describe('parseInvoiceUploadSuccessBody / multi stamp contract', () => {
  it('parses updatedIds and missingIds', () => {
    const fields = parseInvoiceUploadSuccessBody({
      url: 'https://drive.google.com/file/d/x',
      updatedIds: ['V1', 'V2'],
      missingIds: ['V9'],
    });
    expect(fields).toEqual({
      url: 'https://drive.google.com/file/d/x',
      updatedIds: ['V1', 'V2'],
      missingIds: ['V9'],
    });
  });

  it('parseDriveUploadResponse surfaces multi fields', () => {
    const parsed = parseDriveUploadResponse(
      JSON.stringify({
        status: 'success',
        url: 'https://drive.google.com/file/d/abc',
        updatedIds: ['A', 'B'],
        missingIds: ['Z'],
      })
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.url).toContain('drive.google.com');
      expect(parsed.updatedIds).toEqual(['A', 'B']);
      expect(parsed.missingIds).toEqual(['Z']);
    }
  });

  it('legacy success without updatedIds still ok', () => {
    const parsed = parseDriveUploadResponse(
      JSON.stringify({ status: 'success', url: 'https://drive.google.com/file/d/legacy' })
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.updatedIds).toBeUndefined();
    }
  });
});
