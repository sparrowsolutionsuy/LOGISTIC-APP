import type { BillingStatus, Trip } from '../types';

export function getBillingStatus(trip: Trip): BillingStatus {
  if (trip.facturaCobrada) {
    return 'cobrada';
  }
  if (trip.facturaSolicitada) {
    return 'solicitada';
  }
  if (trip.facturaGenerada) {
    return 'generada';
  }
  return 'pendiente';
}

export function getBillingStatusLabel(status: BillingStatus): string {
  const labels: Record<BillingStatus, string> = {
    pendiente: 'Sin factura',
    generada: 'Factura generada',
    solicitada: 'Pago solicitado',
    cobrada: 'Cobrado',
  };
  return labels[status];
}

/** Días enteros entre dos fechas ISO (solo fecha, mediodía local). Si `to` omite, usa hoy. */
export function calcDaysDiff(from: string, to?: string): number {
  const start = new Date(`${from.split('T')[0]}T12:00:00`).getTime();
  const end = to
    ? new Date(`${to.split('T')[0]}T12:00:00`).getTime()
    : new Date(new Date().toISOString().slice(0, 10) + 'T12:00:00').getTime();
  return Math.floor((end - start) / 86400000);
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function tripSubtotalUsd(t: Trip): number {
  return t.tarifa * (t.pesoKg / 1000);
}

export function tripIvaUsd(t: Trip): number {
  return roundMoney(tripSubtotalUsd(t) * 0.22);
}

export function tripGrandTotalUsd(t: Trip): number {
  return roundMoney(tripSubtotalUsd(t) + tripIvaUsd(t));
}

export function formatDateUY(iso: string): string {
  const d = iso.split('T')[0];
  const parts = d.split('-');
  if (parts.length !== 3) {
    return iso;
  }
  const [y, m, day] = parts;
  return `${day}/${m}/${y}`;
}
