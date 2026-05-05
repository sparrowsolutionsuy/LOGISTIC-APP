import type { Cost, ScheduledCostDefinition } from '../types';
import { DEFAULT_EXCHANGE_RATE } from '../constants';
import { saveCostToSheet } from '../services/api';

function currentMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function hasScheduledCostForMonth(costs: Cost[], scheduleId: string, monthKey: string): boolean {
  return costs.some(
    (c) =>
      c.isScheduled === true &&
      (c.scheduleId === scheduleId || c.scheduledCostId === scheduleId) &&
      c.fecha.length >= 7 &&
      c.fecha.slice(0, 7) === monthKey
  );
}

/**
 * Tras cargar datos desde Sheets: una vez por mes y por definición activa,
 * inserta en DB_Costos un costo automático si corresponde (sin timers).
 */
export async function checkAndExecuteScheduledCosts(
  definitions: ScheduledCostDefinition[],
  existingCosts: Cost[],
  executedKeysRef: Set<string>
): Promise<Cost[]> {
  const today = new Date();
  const monthKey = currentMonthKey(today);
  const dayOfMonth = today.getDate();
  const fechaIso = today.toISOString().split('T')[0];
  const generated: Cost[] = [];

  for (const def of definitions) {
    if (!def.active) {
      continue;
    }
    if (dayOfMonth < def.dayOfMonth) {
      continue;
    }
    const sessionKey = `${def.id}|${monthKey}`;
    if (executedKeysRef.has(sessionKey)) {
      continue;
    }
    if (hasScheduledCostForMonth(existingCosts, def.id, monthKey)) {
      continue;
    }
    if (hasScheduledCostForMonth(generated, def.id, monthKey)) {
      continue;
    }

    const monto = def.monto;
    const cur: 'USD' | 'UYU' = def.currency === 'UYU' ? 'UYU' : 'USD';
    const tipoCambio = cur === 'UYU' ? DEFAULT_EXCHANGE_RATE : 1;
    const montoUSD = cur === 'USD' ? monto : monto / (tipoCambio > 0 ? tipoCambio : 1);
    const cost: Cost = {
      id: `K${Date.now()}_${def.id}_${Math.random().toString(36).slice(2, 8)}`,
      fecha: fechaIso,
      tripId: def.tripId ?? null,
      categoria: def.categoria,
      descripcion: `[AUTO] ${def.descripcion}`,
      monto,
      moneda: cur,
      currency: cur,
      tipoCambio,
      montoUSD,
      isScheduled: true,
      scheduledDay: def.dayOfMonth,
      scheduleId: def.id,
      registradoPor: 'sistema',
    };

    const ok = await saveCostToSheet(cost);
    if (ok) {
      executedKeysRef.add(sessionKey);
      generated.push(cost);
      existingCosts = [cost, ...existingCosts];
    }
  }

  return generated;
}
