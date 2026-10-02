// The rules for a recurring pass, as pure functions: no database, no clock of
// its own (the caller passes the server's time), no phone clock ever.
//
// evaluateRecurringScan runs the nine checks in a fixed order and stops at
// the first one that fails, so the guard always sees the earliest reason.
import { createHmac, timingSafeEqual } from 'crypto';

export type RecurringPassStatus = 'ACTIVE' | 'PAUSED' | 'REVOKED' | 'EXPIRED';
export type ScanDirection = 'IN' | 'OUT';
export type ScanDenyReason =
  | 'INVALID_PASS'
  | 'PAUSED'
  | 'REVOKED'
  | 'EXPIRED'
  | 'SKIPPED'
  | 'NOT_SCHEDULED'
  | 'OUTSIDE_HOURS'
  | 'BLACKLISTED'
  | 'CODE_OUTDATED';

/** Nigeria (WAT). Used when an estate has no time zone of its own. */
export const DEFAULT_TIME_ZONE = 'Africa/Lagos';
/** Yesterday's QR code still works for this long after local midnight. */
export const YESTERDAY_CODE_GRACE_MINUTES = 60;
export const MAX_PASS_DAYS = 90;

export interface PassRules {
  status: RecurringPassStatus;
  /** Local dates, 'YYYY-MM-DD'. */
  validFrom: string;
  validUntil: string;
  /** Allowed weekdays: 0 = Sunday ... 6 = Saturday. */
  days: number[];
  /** Daily window, minutes after local midnight (09:00 = 540). */
  startMinute: number;
  endMinute: number;
  graceMinutes: number;
  tokenHash: string;
}

export interface PassException {
  date: string;
  type: 'SKIP' | 'EXTRA';
  /** EXTRA days may carry their own hours. */
  startMinute?: number | null;
  endMinute?: number | null;
}

export interface LocalMoment {
  /** 'YYYY-MM-DD' in the estate's time zone. */
  date: string;
  weekday: number;
  /** Minutes after local midnight. */
  minute: number;
}

export interface ScanInput {
  /** The pass that matched the token, or null if no pass matched. */
  pass: PassRules | null;
  exceptions: PassException[];
  blacklisted: boolean;
  /** The SERVER's current time. */
  now: Date;
  timeZone?: string;
  presentedCode?: string | null;
  /** True once the estate/pass uses the daily rotating code. */
  codeRequired: boolean;
  lastDirection?: ScanDirection | null;
}

export interface ScanDecision {
  allowed: boolean;
  reason?: ScanDenyReason;
  /** What the guard sees. */
  message: string;
  direction?: ScanDirection;
  local: LocalMoment;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const DENY_MESSAGES: Record<ScanDenyReason, string> = {
  INVALID_PASS: 'Invalid pass',
  PAUSED: 'Pass paused',
  REVOKED: 'Pass revoked',
  EXPIRED: 'Pass expired',
  SKIPPED: 'Skipped by resident',
  NOT_SCHEDULED: 'Not scheduled today',
  OUTSIDE_HOURS: 'Outside allowed hours',
  BLACKLISTED: 'Not allowed by estate',
  CODE_OUTDATED: 'Code outdated',
};

/** The date, weekday and time of day in the estate's own time zone. */
export function localMoment(now: Date, timeZone: string = DEFAULT_TIME_ZONE): LocalMoment {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAYS.indexOf(get('weekday')),
    minute: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

export function previousDateKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The code shown in the pass's QR for one local day. Derived from the stored
 * token hash, so the server needs no extra secret and a leaked old QR is
 * useless the next day.
 */
export function dailyCodeFor(tokenHash: string, dateKey: string): string {
  return createHmac('sha256', tokenHash).update(`entryva-pass:${dateKey}`).digest('hex').slice(0, 10).toUpperCase();
}

function codesMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function codeIsCurrent(tokenHash: string, presented: string | null | undefined, local: LocalMoment): boolean {
  if (!presented) return false;
  const code = presented.trim().toUpperCase();
  if (codesMatch(code, dailyCodeFor(tokenHash, local.date))) return true;
  return (
    local.minute < YESTERDAY_CODE_GRACE_MINUTES &&
    codesMatch(code, dailyCodeFor(tokenHash, previousDateKey(local.date)))
  );
}

function deny(reason: ScanDenyReason, local: LocalMoment): ScanDecision {
  return { allowed: false, reason, message: DENY_MESSAGES[reason], local };
}

export function evaluateRecurringScan(input: ScanInput): ScanDecision {
  const local = localMoment(input.now, input.timeZone ?? DEFAULT_TIME_ZONE);
  const { pass } = input;

  // 1. Does the token match a pass?
  if (!pass) return deny('INVALID_PASS', local);

  // 2. Is the pass active?
  if (pass.status === 'PAUSED') return deny('PAUSED', local);
  if (pass.status === 'REVOKED') return deny('REVOKED', local);
  if (pass.status !== 'ACTIVE') return deny('EXPIRED', local);

  // 3. Is today inside the valid-from / valid-until dates?
  if (local.date < pass.validFrom || local.date > pass.validUntil) return deny('EXPIRED', local);

  // 4. Did the resident skip today?
  if (input.exceptions.some((e) => e.date === local.date && e.type === 'SKIP')) return deny('SKIPPED', local);

  // 5. Is today an allowed weekday, or an extra allowed day?
  const extra = input.exceptions.find((e) => e.date === local.date && e.type === 'EXTRA');
  if (!extra && !pass.days.includes(local.weekday)) return deny('NOT_SCHEDULED', local);

  // 6. Is the time inside the window, including the grace period?
  const start = extra?.startMinute ?? pass.startMinute;
  const end = extra?.endMinute ?? pass.endMinute;
  if (local.minute < start - pass.graceMinutes || local.minute > end + pass.graceMinutes) {
    return deny('OUTSIDE_HOURS', local);
  }

  // 7. Is the person blocked by the estate?
  if (input.blacklisted) return deny('BLACKLISTED', local);

  // 8. Does the rotating code match today's (or yesterday's just after midnight)?
  if (input.codeRequired && !codeIsCurrent(pass.tokenHash, input.presentedCode, local)) {
    return deny('CODE_OUTDATED', local);
  }

  // 9. Allowed. In after out, out after in.
  return {
    allowed: true,
    message: 'Allowed',
    direction: input.lastDirection === 'IN' ? 'OUT' : 'IN',
    local,
  };
}

/**
 * Still marked IN after the window (plus grace) ended, or on a later day.
 * The guard is warned and the resident is told.
 */
export function isOverdueInside(args: {
  lastDirection: ScanDirection | null | undefined;
  /** Local date of that last IN scan, 'YYYY-MM-DD'. */
  lastScanDate: string | null;
  pass: Pick<PassRules, 'endMinute' | 'graceMinutes'>;
  now: Date;
  timeZone?: string;
}): boolean {
  if (args.lastDirection !== 'IN' || !args.lastScanDate) return false;
  const local = localMoment(args.now, args.timeZone ?? DEFAULT_TIME_ZONE);
  if (local.date > args.lastScanDate) return true;
  return local.date === args.lastScanDate && local.minute > args.pass.endMinute + args.pass.graceMinutes;
}

/** Checks a new or edited schedule. Returns a list of problems (empty = fine). */
export function validatePassSchedule(s: {
  days: number[];
  startMinute: number;
  endMinute: number;
  graceMinutes: number;
  validFrom: string;
  validUntil: string;
}): string[] {
  const errors: string[] = [];
  if (s.days.length === 0 || new Set(s.days).size !== s.days.length || s.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    errors.push('Choose at least one weekday.');
  }
  if (!Number.isInteger(s.startMinute) || s.startMinute < 0 || s.startMinute > 1439) errors.push('Start time is not valid.');
  if (!Number.isInteger(s.endMinute) || s.endMinute < 1 || s.endMinute > 1439) errors.push('End time is not valid.');
  if (s.endMinute <= s.startMinute) errors.push('End time must be after the start time.');
  if (!Number.isInteger(s.graceMinutes) || s.graceMinutes < 0 || s.graceMinutes > 120) {
    errors.push('Grace period must be between 0 and 120 minutes.');
  }
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(s.validFrom) || !datePattern.test(s.validUntil)) {
    errors.push('Valid from and valid until dates are required.');
  } else {
    const spanDays = Math.round(
      (Date.parse(`${s.validUntil}T00:00:00Z`) - Date.parse(`${s.validFrom}T00:00:00Z`)) / 86_400_000,
    );
    if (spanDays < 0) errors.push('Valid until must not be before valid from.');
    else if (spanDays + 1 > MAX_PASS_DAYS) errors.push(`A pass can last at most ${MAX_PASS_DAYS} days. Renew it to continue.`);
  }
  return errors;
}
