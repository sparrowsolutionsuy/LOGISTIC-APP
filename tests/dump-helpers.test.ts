import { describe, expect, it } from 'vitest';
import {
  DUMP_CACHE_PREFIX,
  DUMP_CACHE_TTL_SEC,
  DUMP_KEYS,
  buildDumpCacheKey,
  isEmptySheetBounds,
  parseIncludeParam,
  sheetValuesToObjects,
} from '../src/gas/dumpHelpers';

describe('parseIncludeParam', () => {
  it('defaults to all dump keys when missing or blank', () => {
    expect(parseIncludeParam(undefined)).toEqual([...DUMP_KEYS]);
    expect(parseIncludeParam(null)).toEqual([...DUMP_KEYS]);
    expect(parseIncludeParam('')).toEqual([...DUMP_KEYS]);
    expect(parseIncludeParam('  ')).toEqual([...DUMP_KEYS]);
  });

  it('parses comma-separated subset and ignores unknown tokens', () => {
    expect(parseIncludeParam('clients,trips')).toEqual(['clients', 'trips']);
    expect(parseIncludeParam('clients, bogus, costs')).toEqual(['clients', 'costs']);
    expect(parseIncludeParam('documents')).toEqual(['documents']);
  });

  it('falls back to all keys when only unknown tokens', () => {
    expect(parseIncludeParam('foo,bar')).toEqual([...DUMP_KEYS]);
  });
});

describe('buildDumpCacheKey', () => {
  it('includes prefix, epoch, and sorted include set', () => {
    expect(buildDumpCacheKey('42', ['trips', 'clients'])).toBe(
      `${DUMP_CACHE_PREFIX}:42:clients,trips`
    );
  });

  it('uses 0 for empty epoch', () => {
    expect(buildDumpCacheKey('', [...DUMP_KEYS])).toBe(
      `${DUMP_CACHE_PREFIX}:0:clients,costs,documents,scheduledCostDefinitions,trips`
    );
  });

  it('documents 45s TTL constant', () => {
    expect(DUMP_CACHE_TTL_SEC).toBe(45);
  });
});

describe('sheetValuesToObjects', () => {
  it('returns [] for empty or header-only', () => {
    expect(sheetValuesToObjects([])).toEqual([]);
    expect(sheetValuesToObjects([['id', 'nombre']])).toEqual([]);
  });

  it('maps rows to objects by header', () => {
    expect(
      sheetValuesToObjects([
        ['id', 'nombre'],
        ['c1', 'Acme'],
        ['c2', 'Beta'],
      ])
    ).toEqual([
      { id: 'c1', nombre: 'Acme' },
      { id: 'c2', nombre: 'Beta' },
    ]);
  });
});

describe('isEmptySheetBounds', () => {
  it('treats lastRow < 2 as empty', () => {
    expect(isEmptySheetBounds(0, 5)).toBe(true);
    expect(isEmptySheetBounds(1, 5)).toBe(true);
    expect(isEmptySheetBounds(2, 5)).toBe(false);
    expect(isEmptySheetBounds(2, 0)).toBe(true);
  });
});
