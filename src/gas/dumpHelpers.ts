/**
 * Pure helpers mirrored in GOOGLE_APPS_SCRIPT.js (Phase B dump / cache / include).
 * Keep behavior in sync when changing either side.
 */

export const DUMP_KEYS = [
  'clients',
  'trips',
  'costs',
  'scheduledCostDefinitions',
] as const;

export type DumpKey = (typeof DUMP_KEYS)[number];

export const DUMP_SHEET_BY_KEY: Record<DumpKey, string> = {
  clients: 'DB_Clientes',
  trips: 'DB_Viajes',
  costs: 'DB_Costos',
  scheduledCostDefinitions: 'DB_CostosProgramados',
};

export const DUMP_CACHE_TTL_SEC = 45;
export const DUMP_CACHE_PREFIX = 'gdc_dump_v1';

/** Parse `?include=` (comma-separated). Empty / missing → all keys. Unknown tokens ignored. */
export function parseIncludeParam(raw: string | undefined | null): DumpKey[] {
  if (raw == null || String(raw).trim() === '') {
    return [...DUMP_KEYS];
  }
  const allowed = new Set<string>(DUMP_KEYS);
  const parts = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && allowed.has(s)) as DumpKey[];
  return parts.length > 0 ? parts : [...DUMP_KEYS];
}

/** Cache key includes epoch (invalidation) + sorted include set. */
export function buildDumpCacheKey(epoch: string, includeKeys: readonly string[]): string {
  const sorted = [...includeKeys].slice().sort();
  return `${DUMP_CACHE_PREFIX}:${epoch || '0'}:${sorted.join(',')}`;
}

/** Map sheet values (header row + data) to objects. Empty / header-only → []. */
export function sheetValuesToObjects(data: unknown[][]): Record<string, unknown>[] {
  if (!data || data.length < 2) return [];
  const headers = data[0] as unknown[];
  const rows = data.slice(1);
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let index = 0; index < headers.length; index++) {
      const header = headers[index];
      if (header == null || header === '') continue;
      let value = row[index];
      if (value instanceof Date) {
        value = value.toISOString().split('T')[0];
      }
      obj[String(header)] = value;
    }
    return obj;
  });
}

/** Whether lastRow/lastCol describe a sheet with at least one data row. */
export function isEmptySheetBounds(lastRow: number, lastCol: number): boolean {
  return lastRow < 2 || lastCol < 1;
}
