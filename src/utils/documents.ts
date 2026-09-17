import type { DocumentCategory, FleetDocument } from '../types';
import { DOCUMENT_CATEGORIES } from '../types';

export type DocumentAlert = 'ok' | 'expiring' | 'overdue' | 'none';

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  camion: 'Camión',
  funcionario: 'Funcionario',
  seguro: 'Seguro',
  otro: 'Otro',
};

/** Days from today (local) until venceEn. Negative = overdue. null = no date. */
export function daysUntilExpiry(venceEn: string, today = new Date()): number | null {
  const s = String(venceEn ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const end = new Date(y, m - 1, d);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export function documentAlert(doc: FleetDocument, today = new Date()): DocumentAlert {
  if (!doc.activo) return 'none';
  const days = daysUntilExpiry(doc.venceEn, today);
  if (days == null) return 'none';
  if (days < 0) return 'overdue';
  if (days <= 30) return 'expiring';
  return 'ok';
}

export function countDocumentAlerts(
  docs: FleetDocument[],
  today = new Date()
): { overdue: number; expiring: number; alertTotal: number } {
  let overdue = 0;
  let expiring = 0;
  for (const doc of docs) {
    const alert = documentAlert(doc, today);
    if (alert === 'overdue') overdue += 1;
    else if (alert === 'expiring') expiring += 1;
  }
  return { overdue, expiring, alertTotal: overdue + expiring };
}

export function normalizeDocumentCategory(value: unknown): DocumentCategory {
  const s = String(value ?? '').trim().toLowerCase();
  return DOCUMENT_CATEGORIES.includes(s as DocumentCategory)
    ? (s as DocumentCategory)
    : 'otro';
}

export function filterDocuments(
  docs: FleetDocument[],
  options: {
    categoria?: DocumentCategory | 'all';
    /** Default true: only activo. Pass 'all' to include inactive. */
    activo?: boolean | 'all';
    query?: string;
  } = {}
): FleetDocument[] {
  const categoria = options.categoria ?? 'all';
  const activoFilter = options.activo === undefined ? true : options.activo;
  const q = String(options.query ?? '')
    .trim()
    .toLowerCase();

  return docs.filter((doc) => {
    if (activoFilter !== 'all' && doc.activo !== activoFilter) return false;
    if (categoria !== 'all' && doc.categoria !== categoria) return false;
    if (!q) return true;
    const hay = `${doc.titulo} ${doc.entidadRef} ${doc.notas} ${doc.categoria}`.toLowerCase();
    return hay.includes(q);
  });
}
