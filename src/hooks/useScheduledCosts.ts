import { useState, useEffect, useCallback } from 'react';
import type { ScheduledCost, Cost } from '../types';
import { DEFAULT_EXCHANGE_RATE } from '../constants';

const STORAGE_KEY = 'gdc_scheduled_costs';

function loadFromStorage(): ScheduledCost[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScheduledCost[]) : [];
  } catch {
    return [];
  }
}

function saveToStorage(items: ScheduledCost[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function useScheduledCosts() {
  const [scheduledCosts, setScheduledCosts] = useState<ScheduledCost[]>(loadFromStorage);

  useEffect(() => {
    saveToStorage(scheduledCosts);
  }, [scheduledCosts]);

  const addScheduledCost = useCallback(
    (sc: Omit<ScheduledCost, 'id' | 'creadoEn' | 'ultimaEjecucion'>) => {
      const newSc: ScheduledCost = {
        ...sc,
        id: `SC${Date.now()}`,
        creadoEn: new Date().toISOString().split('T')[0],
        ultimaEjecucion: null,
      };
      setScheduledCosts((prev) => [...prev, newSc]);
      return newSc;
    },
    []
  );

  const updateScheduledCost = useCallback((id: string, updates: Partial<ScheduledCost>) => {
    setScheduledCosts((prev) => prev.map((sc) => (sc.id === id ? { ...sc, ...updates } : sc)));
  }, []);

  const deleteScheduledCost = useCallback((id: string) => {
    setScheduledCosts((prev) => prev.filter((sc) => sc.id !== id));
  }, []);

  const toggleActive = useCallback((id: string) => {
    setScheduledCosts((prev) => prev.map((sc) => (sc.id === id ? { ...sc, activo: !sc.activo } : sc)));
  }, []);

  const getPendingScheduledCosts = useCallback(
    (existingCosts: Cost[]): Array<{ cost: Omit<Cost, 'id'>; scheduledCostId: string }> => {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

      return scheduledCosts
        .filter((sc) => sc.activo)
        .filter((sc) => {
          const alreadyThisMonth = existingCosts.some(
            (c) => c.scheduledCostId === sc.id && c.fecha.startsWith(currentMonth)
          );
          if (alreadyThisMonth) {
            return false;
          }
          return today.getDate() >= sc.diaDelMes;
        })
        .map((sc) => {
          const moneda = sc.moneda === 'UYU' ? 'UYU' : 'USD';
          const tipoCambio = sc.tipoCambioReferencia ?? DEFAULT_EXCHANGE_RATE;
          const montoUSD = moneda === 'UYU' ? sc.monto / tipoCambio : sc.monto;
          return {
            scheduledCostId: sc.id,
            cost: {
              fecha: todayStr,
              tripId: sc.tripId,
              categoria: sc.categoria,
              descripcion: `[AUTO] ${sc.descripcion}`,
              monto: sc.monto,
              moneda,
              tipoCambio,
              montoUSD,
              scheduledCostId: sc.id,
              registradoPor: 'sistema',
            },
          };
        });
    },
    [scheduledCosts]
  );

  const nextDueDate = useCallback((): string | null => {
    const active = scheduledCosts.filter((sc) => sc.activo);
    if (active.length === 0) {
      return null;
    }

    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();

    let nearest: Date | null = null;
    for (const sc of active) {
      let dueDate = new Date(y, m, sc.diaDelMes);
      if (dueDate < today) {
        dueDate = new Date(y, m + 1, sc.diaDelMes);
      }
      if (!nearest || dueDate < nearest) {
        nearest = dueDate;
      }
    }

    return nearest ? nearest.toISOString().split('T')[0] : null;
  }, [scheduledCosts]);

  return {
    scheduledCosts,
    addScheduledCost,
    updateScheduledCost,
    deleteScheduledCost,
    toggleActive,
    getPendingScheduledCosts,
    nextDueDate,
  };
}

