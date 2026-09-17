import type { ReportEmailEntry, ReportLogEntry } from '../types';
import { getSavedEmails, isValidEmail } from './savedEmails';

export const MAX_REPORT_EMAILS = 20;
export const REPORT_EMAILS_MIGRATED_KEY = 'gdc_report_emails_migrated_v1';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export { isValidEmail };

export function normalizeEmailAddress(email: unknown): string {
  return String(email ?? '')
    .trim()
    .toLowerCase();
}

export function coerceSheetBoolean(value: unknown, defaultValue = false): boolean {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const s = String(value).trim().toUpperCase();
  if (s === 'TRUE' || s === '1' || s === 'YES' || s === 'SI' || s === 'SÍ') return true;
  if (s === 'FALSE' || s === '0' || s === 'NO') return false;
  return defaultValue;
}

/** Normalize a Sheet / dump row into ReportEmailEntry. */
export function normalizeReportEmail(row: unknown): ReportEmailEntry {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const email = normalizeEmailAddress(r.email);
  const updatedAt = String(r.updatedAt ?? '').trim();
  const createdAt = String(r.createdAt ?? '').trim();
  const createdBy = String(r.createdBy ?? '').trim();
  return {
    email,
    autoMonthly: coerceSheetBoolean(r.autoMonthly, false),
    activo: coerceSheetBoolean(r.activo, true),
    updatedAt,
    ...(createdAt ? { createdAt } : {}),
    ...(createdBy ? { createdBy } : {}),
  };
}

export function isAuthorizedActive(entry: ReportEmailEntry): boolean {
  return entry.activo && EMAIL_RE.test(entry.email);
}

export function activeReportEmails(entries: ReportEmailEntry[]): ReportEmailEntry[] {
  return entries.filter(isAuthorizedActive);
}

export function autoMonthlyRecipients(entries: ReportEmailEntry[]): string[] {
  return activeReportEmails(entries)
    .filter((e) => e.autoMonthly)
    .map((e) => e.email);
}

/**
 * Previous calendar month key (YYYY-MM) relative to `date` in local calendar parts.
 * Matches Apps Script cron when script TZ is America/Montevideo.
 */
export function previousMonthKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-based current
  const prev = new Date(y, m - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

/** True if cron already logged a successful (or partial) send for monthKey. */
export function shouldSkipCronSend(
  logs: Array<Pick<ReportLogEntry, 'monthKey' | 'channel' | 'status'>>,
  monthKey: string
): boolean {
  return logs.some(
    (row) =>
      row.channel === 'cron' &&
      row.monthKey === monthKey &&
      (row.status === 'ok' || row.status === 'partial')
  );
}

export function hasMigratedLocalEmails(): boolean {
  try {
    return localStorage.getItem(REPORT_EMAILS_MIGRATED_KEY) === '1';
  } catch {
    return true;
  }
}

export function markLocalEmailsMigrated(): void {
  try {
    localStorage.setItem(REPORT_EMAILS_MIGRATED_KEY, '1');
  } catch {
    /* ignore */
  }
}

/**
 * Emails from localStorage that are not yet on the sheet (sheet wins on conflict).
 * Returns candidates for one-shot upsert with autoMonthly=false.
 */
export function localEmailsToMigrate(sheetEntries: ReportEmailEntry[]): string[] {
  const sheetSet = new Set(
    sheetEntries.map((e) => normalizeEmailAddress(e.email)).filter((e) => EMAIL_RE.test(e))
  );
  return getSavedEmails()
    .map(normalizeEmailAddress)
    .filter((e) => isValidEmail(e) && !sheetSet.has(e))
    .slice(0, MAX_REPORT_EMAILS);
}
