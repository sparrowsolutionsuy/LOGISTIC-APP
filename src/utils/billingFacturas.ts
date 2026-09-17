import type { BillingStatus, Trip } from '../types';
import { getBillingStatus } from './billing';

/** D1: catalog rows = trips with facturaUrl OR facturaGenerada. */
export function tripInFacturasCatalog(trip: Trip): boolean {
  const hasUrl = typeof trip.facturaUrl === 'string' && trip.facturaUrl.trim().length > 0;
  return hasUrl || trip.facturaGenerada === true;
}

export interface FacturasCatalogFilters {
  clientId?: string;
  status?: BillingStatus | 'todos';
  search?: string;
  /** YYYY-MM prefix on trip.fecha */
  month?: string;
  /** Resolve client display name for search matching */
  clientNameOf?: (clientId: string) => string;
}

export function filterFacturasCatalog(
  trips: Trip[],
  filters: FacturasCatalogFilters = {}
): Trip[] {
  const {
    clientId = '',
    status = 'todos',
    search = '',
    month = '',
    clientNameOf,
  } = filters;
  const q = search.trim().toLowerCase();

  return trips.filter((t) => {
    if (!tripInFacturasCatalog(t)) {
      return false;
    }
    if (clientId && t.clientId !== clientId) {
      return false;
    }
    if (month && !t.fecha.startsWith(month)) {
      return false;
    }
    if (status !== 'todos' && getBillingStatus(t) !== status) {
      return false;
    }
    if (q) {
      const name = (clientNameOf?.(t.clientId) ?? '').toLowerCase();
      const blob = `${t.id} ${name}`.toLowerCase();
      if (!blob.includes(q)) {
        return false;
      }
    }
    return true;
  });
}
