import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Cost, Trip } from '../types';
import { collectAvailableMonthKeys, latestYearMonthKey } from '../utils/analytics';

export interface PeriodFilterResult {
  selectedMonth: string;
  setSelectedMonth: (m: string) => void;
  availableMonths: string[];
  isAllTime: boolean;
  filteredTrips: Trip[];
  filteredCosts: Cost[];
}

export function usePeriodFilter(trips: Trip[], costs: Cost[]): PeriodFilterResult {
  const availableMonths = useMemo(() => collectAvailableMonthKeys(trips, costs), [trips, costs]);

  const [selectedMonth, setSelectedMonthState] = useState<string>(() => {
    const l = latestYearMonthKey(trips, costs);
    return l ?? 'all';
  });

  useEffect(() => {
    const latest = latestYearMonthKey(trips, costs) ?? 'all';
    setSelectedMonthState((prev) => {
      if (prev === 'all') return 'all';
      if (availableMonths.includes(prev)) return prev;
      return latest;
    });
  }, [trips, costs, availableMonths]);

  const setSelectedMonth = useCallback((m: string) => {
    setSelectedMonthState(m);
  }, []);

  const isAllTime = selectedMonth === 'all';

  const filteredTrips = useMemo(() => {
    if (isAllTime) return trips;
    return trips.filter((t) => t.fecha.startsWith(selectedMonth));
  }, [trips, selectedMonth, isAllTime]);

  const filteredCosts = useMemo(() => {
    if (isAllTime) return costs;
    return costs.filter((c) => c.fecha.startsWith(selectedMonth));
  }, [costs, selectedMonth, isAllTime]);

  return {
    selectedMonth,
    setSelectedMonth,
    availableMonths,
    isAllTime,
    filteredTrips,
    filteredCosts,
  };
}
