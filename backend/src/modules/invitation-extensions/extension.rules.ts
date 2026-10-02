// Rules for extending a visitor pass, as pure functions (no database, no
// clock of their own). The server passes in its own time, so a phone's clock
// never matters. Checks run in a fixed order and the first failure wins.
import { localMoment } from '../recurring-passes/recurring-pass.rules';

/** A pass that expired longer ago than this can't be extended: make a new one. */
export const LONG_EXPIRED_MINUTES = 120;

export interface ExtensionRules {
  enabled: boolean;
  maxExtendMinutes: number;
  /** Longest a pass may last in total, counted from its start. */
  maxTotalMinutes: number;
  /** Quiet hours in minutes after local midnight. Both null = no quiet hours. */
  quietFromMinute: number | null;
  quietToMinute: number | null;
}

export interface ExtensionTarget {
  status: string;
  entryPolicy: 'ONE_TIME' | 'MULTI_ENTRY';
  validFrom: Date;
  validUntil: Date;
}

export type ExtensionDenyCode =
  | 'DISABLED'
  | 'REVOKED'
  | 'ALREADY_USED'
  | 'EXPIRED_TOO_LONG'
  | 'INVALID_AMOUNT'
  | 'TOO_LONG_REQUEST'
  | 'TOO_LONG_TOTAL'
  | 'QUIET_HOURS';

export type ExtensionDecision =
  | { ok: true; newValidUntil: Date; minutes: number }
  | { ok: false; code: ExtensionDenyCode; message: string };

function inQuietHours(minute: number, from: number | null, to: number | null): boolean {
  if (from === null || to === null || from === to) return false;
  // A window like 22:00-05:00 wraps past midnight.
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

function clock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function describeMinutes(total: number): string {
  return total % 60 === 0 ? `${total / 60} hour${total === 60 ? '' : 's'}` : `${total} minutes`;
}

const deny = (code: ExtensionDenyCode, message: string): ExtensionDecision => ({ ok: false, code, message });

export function evaluateExtension(args: {
  target: ExtensionTarget;
  rules: ExtensionRules;
  requestedMinutes: number;
  now: Date;
  timeZone: string;
}): ExtensionDecision {
  const { target, rules, requestedMinutes, now, timeZone } = args;

  if (!rules.enabled) return deny('DISABLED', 'This estate does not allow pass extensions.');
  if (target.status === 'REVOKED' || target.status === 'CANCELLED') {
    return deny('REVOKED', 'A revoked pass cannot be extended.');
  }
  if (target.entryPolicy === 'ONE_TIME' && target.status === 'USED') {
    return deny('ALREADY_USED', 'This one-time pass has already been used.');
  }
  if (now.getTime() - target.validUntil.getTime() > LONG_EXPIRED_MINUTES * 60_000) {
    return deny('EXPIRED_TOO_LONG', 'This pass expired a while ago. Please create a new one.');
  }
  if (!Number.isInteger(requestedMinutes) || requestedMinutes < 1) {
    return deny('INVALID_AMOUNT', 'Choose how many minutes to add.');
  }
  if (requestedMinutes > rules.maxExtendMinutes) {
    return deny('TOO_LONG_REQUEST', `You can add at most ${describeMinutes(rules.maxExtendMinutes)} at a time.`);
  }

  // From the later of the old expiry and now, so a pass that just ran out
  // doesn't get a new expiry that is already in the past.
  const base = Math.max(target.validUntil.getTime(), now.getTime());
  const newValidUntil = new Date(base + requestedMinutes * 60_000);

  if (newValidUntil.getTime() - target.validFrom.getTime() > rules.maxTotalMinutes * 60_000) {
    return deny('TOO_LONG_TOTAL', `A pass can last at most ${describeMinutes(rules.maxTotalMinutes)} in total.`);
  }

  const quietMessage =
    rules.quietFromMinute !== null && rules.quietToMinute !== null
      ? `Passes can't be extended between ${clock(rules.quietFromMinute)} and ${clock(rules.quietToMinute)}.`
      : '';
  if (
    inQuietHours(localMoment(now, timeZone).minute, rules.quietFromMinute, rules.quietToMinute) ||
    inQuietHours(localMoment(newValidUntil, timeZone).minute, rules.quietFromMinute, rules.quietToMinute)
  ) {
    return deny('QUIET_HOURS', quietMessage);
  }

  return { ok: true, newValidUntil, minutes: requestedMinutes };
}
