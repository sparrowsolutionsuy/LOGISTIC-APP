import { describe, expect, it } from 'vitest';
import {
  autoMonthlyRecipients,
  coerceSheetBoolean,
  normalizeEmailAddress,
  normalizeReportEmail,
  previousMonthKey,
  shouldSkipCronSend,
} from '../src/utils/reportEmails';
import { isValidEmail } from '../src/utils/savedEmails';
import schema from './fixtures/sheet-schema.json';

describe('reportEmails helpers', () => {
  it('normalizes email to lowercase trimmed', () => {
    expect(normalizeEmailAddress('  Reports@Example.COM ')).toBe('reports@example.com');
  });

  it('validates emails like savedEmails', () => {
    expect(isValidEmail('reports@example.com')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
  });

  it('coerces Sheet TRUE/FALSE strings', () => {
    expect(coerceSheetBoolean('TRUE')).toBe(true);
    expect(coerceSheetBoolean('FALSE')).toBe(false);
    expect(coerceSheetBoolean(true)).toBe(true);
    expect(coerceSheetBoolean('', true)).toBe(true);
    expect(coerceSheetBoolean(undefined, false)).toBe(false);
  });

  it('normalizeReportEmail maps fixture rows', () => {
    const active = normalizeReportEmail(schema.sheets.DB_ReportEmails.sampleRows[0]);
    expect(active.email).toBe('reports@example.com');
    expect(active.autoMonthly).toBe(true);
    expect(active.activo).toBe(true);

    const stringBools = normalizeReportEmail(schema.sheets.DB_ReportEmails.sampleRows[1]);
    expect(stringBools.autoMonthly).toBe(false);
    expect(stringBools.activo).toBe(true);
  });

  it('previousMonthKey handles year boundary and day 5', () => {
    expect(previousMonthKey(new Date(2026, 8, 5))).toBe('2026-08'); // Sep 5 → Aug
    expect(previousMonthKey(new Date(2026, 0, 5))).toBe('2025-12'); // Jan 5 → Dec
    expect(previousMonthKey(new Date(2026, 0, 1))).toBe('2025-12');
  });

  it('shouldSkipCronSend when ok or partial cron exists for month', () => {
    const logs = [
      { monthKey: '2026-08', channel: 'cron' as const, status: 'ok' as const },
      { monthKey: '2026-07', channel: 'cron' as const, status: 'error' as const },
      { monthKey: '2026-06', channel: 'ondemand' as const, status: 'ok' as const },
    ];
    expect(shouldSkipCronSend(logs, '2026-08')).toBe(true);
    expect(shouldSkipCronSend(logs, '2026-07')).toBe(false);
    expect(shouldSkipCronSend(logs, '2026-06')).toBe(false);
    expect(
      shouldSkipCronSend(
        [{ monthKey: '2026-08', channel: 'cron', status: 'partial' }],
        '2026-08'
      )
    ).toBe(true);
  });

  it('autoMonthlyRecipients filters activo + autoMonthly', () => {
    const entries = schema.sheets.DB_ReportEmails.sampleRows.map((r) => normalizeReportEmail(r));
    expect(autoMonthlyRecipients(entries)).toEqual(['reports@example.com']);
  });
});
