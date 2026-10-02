// Small helpers shared by the recurring-pass screens.
import { minutesToHHMM } from '@/lib/time-of-day';
import { toInternationalDigits } from '@/lib/share-pass';
import type { RecurringPassStatus, RecurringRole } from '@/types/recurring-pass';

export const ROLE_LABELS: Record<RecurringRole, string> = {
  HOUSE_HELP: 'House help',
  DRIVER: 'Driver',
  CLEANER: 'Cleaner',
  DELIVERY: 'Regular delivery',
  OTHER: 'Other',
};

export const STATUS_LABELS: Record<RecurringPassStatus, string> = {
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  REVOKED: 'Revoked',
  EXPIRED: 'Expired',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // show Monday first

export function weekdayLabel(day: number): string {
  return WEEKDAYS[day] ?? '';
}

/** "Every day", "Mon to Fri" or "Mon, Wed, Fri". */
export function formatDays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Every day';
  if (sorted.join() === '1,2,3,4,5') return 'Mon to Fri';
  return WEEKDAY_ORDER.filter((d) => sorted.includes(d))
    .map(weekdayLabel)
    .join(', ');
}

export function formatWindow(startMinute: number, endMinute: number): string {
  return `${minutesToHHMM(startMinute)} to ${minutesToHHMM(endMinute)}`;
}

/** A recurring pass's QR holds "<token>~<code>"; the ~ marks it. */
export function isRecurringQr(value: string): boolean {
  return value.includes('~');
}

export function passLink(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/pass/${token}`;
}

export function passWhatsAppUrl(args: {
  name: string;
  phone: string | null;
  link: string;
  residentName?: string;
}): string {
  const first = args.name.trim().split(/\s+/)[0] || 'there';
  const from = args.residentName ? ` from ${args.residentName}` : '';
  const text =
    `Hi ${first}, this is your entry pass${from}. Open it on your phone: ${args.link}\n` +
    'Show the QR code to security at the gate. Open it on one phone only.';
  const number = toInternationalDigits(args.phone);
  return `https://wa.me/${number ?? ''}?text=${encodeURIComponent(text)}`;
}

/** Today's date as YYYY-MM-DD on this device, only to pre-fill forms. The server decides what is valid. */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Mon, 5 Oct" from a YYYY-MM-DD key, without the device's time zone shifting the day. */
export function formatDateKey(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
