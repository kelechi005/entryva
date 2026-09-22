import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';

/**
 * Converts a resident-entered visit date + start/end time — which are
 * always wall-clock values *in the estate's own timezone*, never UTC or
 * the browser's timezone (CLAUDE.md §8) — into the correct absolute
 * instants to store.
 *
 * Why this matters concretely: a resident in a Lagos (Africa/Lagos,
 * UTC+1) estate who picks "2:00 PM" means 2:00 PM in Lagos. If the
 * backend naively does `new Date("...T14:00:00")` with no timezone
 * attached, JS/Node interprets that "14:00" using the *server's* local
 * timezone setting — which for most hosting providers defaults to UTC,
 * not WAT. That would silently store the invitation as valid an hour
 * later than the resident actually meant, and the gate would reject a
 * visitor who shows up exactly when they were told to.
 *
 * `estateTimezone` must be a valid IANA zone name (e.g. "Africa/Lagos",
 * "UTC") — this is enforced at estate-creation time (see
 * IsIanaTimezone), but this function still validates defensively rather
 * than trusting the caller, since a bad zone name would otherwise
 * silently succeed and store the wrong instant instead of failing.
 */
export function resolveVisitWindow(
  estateTimezone: string,
  visitDate: string,
  startTime: string,
  endTime: string,
): { validFrom: Date; validUntil: Date } {
  const from = DateTime.fromISO(`${visitDate}T${startTime}`, { zone: estateTimezone });
  const until = DateTime.fromISO(`${visitDate}T${endTime}`, { zone: estateTimezone });

  if (!from.isValid) {
    throw new BadRequestException(
      `Could not interpret the visit start time: ${from.invalidReason} — ${from.invalidExplanation}`,
    );
  }
  if (!until.isValid) {
    throw new BadRequestException(
      `Could not interpret the visit end time: ${until.invalidReason} — ${until.invalidExplanation}`,
    );
  }
  if (until <= from) {
    // Deliberately not supporting overnight windows (endTime "past
    // midnight" on the same visitDate) — a resident who needs that can
    // just pick the next day's date as endTime's date. Keeping this
    // strict avoids silently accepting a zero-or-negative-length window.
    throw new BadRequestException('endTime must be after startTime on the same visit date.');
  }

  return { validFrom: from.toJSDate(), validUntil: until.toJSDate() };
}
