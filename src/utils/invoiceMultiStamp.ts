import type { Trip } from '../types';

export type InvoiceSelectionError =
  | 'empty'
  | 'mixed_client'
  | 'mixed_currency';

export type InvoiceSelectionValidation =
  | { ok: true; tripIds: string[]; clientId: string; moneda: Trip['moneda'] }
  | { ok: false; reason: InvoiceSelectionError; message: string };

/** Normalize singular / plural trip id inputs into a de-duplicated list. */
export function normalizeInvoiceTripIds(
  tripId?: string | null,
  tripIds?: string[] | null
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const id = String(raw).trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  if (Array.isArray(tripIds)) {
    for (const id of tripIds) push(String(id));
  }
  if (tripId != null && String(tripId).trim() !== '') {
    push(String(tripId));
  }
  return out;
}

/**
 * D-F3 / D-F4: selection must be non-empty, same client, same currency.
 * Missing moneda is treated as USD for comparison (legacy rows).
 */
export function validateInvoiceSelection(trips: Trip[]): InvoiceSelectionValidation {
  if (!trips.length) {
    return {
      ok: false,
      reason: 'empty',
      message: 'Seleccioná al menos un viaje.',
    };
  }
  const clientId = trips[0].clientId;
  const moneda = trips[0].moneda ?? 'USD';
  for (const t of trips) {
    if (t.clientId !== clientId) {
      return {
        ok: false,
        reason: 'mixed_client',
        message: 'Todos los viajes deben ser del mismo cliente.',
      };
    }
    const m = t.moneda ?? 'USD';
    if (m !== moneda) {
      return {
        ok: false,
        reason: 'mixed_currency',
        message: 'Todos los viajes deben tener la misma moneda.',
      };
    }
  }
  return {
    ok: true,
    tripIds: trips.map((t) => t.id),
    clientId,
    moneda,
  };
}

/** Build POST `data` for uploadInvoice (singular tripId kept for 1-id compat). */
export function buildUploadInvoiceData(options: {
  tripIds: string[];
  fileData: string;
  fileName: string;
  mimeType: string;
  folderId: string;
}): Record<string, unknown> {
  const tripIds = normalizeInvoiceTripIds(undefined, options.tripIds);
  const base: Record<string, unknown> = {
    fileData: options.fileData,
    fileName: options.fileName,
    mimeType: options.mimeType,
    folderId: options.folderId,
    tripIds,
  };
  if (tripIds.length === 1) {
    base.tripId = tripIds[0];
  }
  return base;
}

export interface InvoiceUploadSuccessFields {
  url: string;
  updatedIds: string[];
  missingIds: string[];
}

/** Extract multi-stamp fields from a successful Apps Script JSON body. */
export function parseInvoiceUploadSuccessBody(body: {
  url?: string;
  updatedIds?: unknown;
  missingIds?: unknown;
  tripId?: unknown;
}): InvoiceUploadSuccessFields | null {
  if (!body.url) return null;
  const updatedIds = Array.isArray(body.updatedIds)
    ? body.updatedIds.map((id) => String(id)).filter(Boolean)
    : body.tripId != null && String(body.tripId).trim() !== ''
      ? [String(body.tripId)]
      : [];
  const missingIds = Array.isArray(body.missingIds)
    ? body.missingIds.map((id) => String(id)).filter(Boolean)
    : [];
  return {
    url: String(body.url),
    updatedIds,
    missingIds,
  };
}
