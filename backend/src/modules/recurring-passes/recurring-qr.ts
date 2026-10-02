// A recurring pass's QR carries "<secret token>~<today's code>". The ~ is what
// tells the gate it is a recurring pass and not a one-off invitation.
export const RECURRING_QR_SEPARATOR = '~';

export function isRecurringQr(raw: string): boolean {
  return raw.includes(RECURRING_QR_SEPARATOR);
}

/** Accepts the bare "token~code" or the full link ending in it. */
export function parseRecurringQr(raw: string): { token: string; code: string } | null {
  const last = raw.includes('/') ? (raw.split('/').filter(Boolean).pop() ?? '') : raw;
  const at = last.indexOf(RECURRING_QR_SEPARATOR);
  if (at <= 0 || at === last.length - 1) return null;
  const token = last.slice(0, at);
  const code = last.slice(at + 1);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return null;
  if (!/^[A-Za-z0-9]{6,16}$/.test(code)) return null;
  return { token, code };
}

/** 0801 234 5678, +234 801 234 5678 and 234801... all give the same key. */
export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-9) : null;
}

export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dateKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}
