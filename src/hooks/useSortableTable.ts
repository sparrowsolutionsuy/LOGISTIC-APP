import { useState, useMemo } from 'react';

export type SortDirection = 'asc' | 'desc' | null;

export interface SortState<K extends string> {
  column: K | null;
  direction: SortDirection;
}

export function useSortableTable<T extends object, K extends string>(
  data: T[],
  defaultSort?: { column: K; direction: SortDirection }
) {
  const [sort, setSort] = useState<SortState<K>>(defaultSort ?? { column: null, direction: null });

  const handleSort = (column: K) => {
    setSort((prev) => {
      if (prev.column !== column) return { column, direction: 'asc' };
      if (prev.direction === 'asc') return { column, direction: 'desc' };
      return { column: null, direction: null };
    });
  };

  const sorted = useMemo(() => {
    if (!sort.column || !sort.direction) return data;
    return [...data].sort((a, b) => {
      const key = sort.column as unknown as keyof T;
      const valA = a[key] as unknown;
      const valB = b[key] as unknown;

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sort.direction === 'asc' ? valA - valB : valB - valA;
      }
      if (typeof valA === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valA) && typeof valB === 'string') {
        const diff = new Date(valA).getTime() - new Date(valB).getTime();
        return sort.direction === 'asc' ? diff : -diff;
      }
      const strA = String(valA ?? '').toLowerCase();
      const strB = String(valB ?? '').toLowerCase();
      const cmp = strA.localeCompare(strB, 'es');
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }, [data, sort]);

  return { sorted, sort, handleSort };
}
