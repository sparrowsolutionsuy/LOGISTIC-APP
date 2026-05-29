const STORAGE_KEY = 'gdc_report_emails';
const MAX_EMAILS = 20;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export function getSavedEmails(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

export function addSavedEmail(email: string): string[] {
  const clean = email.trim().toLowerCase();
  if (!isValidEmail(clean)) return getSavedEmails();
  const current = getSavedEmails().filter((e) => e.toLowerCase() !== clean);
  const next = [clean, ...current].slice(0, MAX_EMAILS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* almacenamiento no disponible */
  }
  return next;
}

export function removeSavedEmail(email: string): string[] {
  const clean = email.trim().toLowerCase();
  const next = getSavedEmails().filter((e) => e.toLowerCase() !== clean);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* almacenamiento no disponible */
  }
  return next;
}
