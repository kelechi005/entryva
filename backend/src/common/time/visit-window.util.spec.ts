import { BadRequestException } from '@nestjs/common';
import { resolveVisitWindow } from './visit-window.util';

describe('resolveVisitWindow', () => {
  it('interprets the visit date/time as wall-clock time in the given estate timezone (Africa/Lagos, UTC+1)', () => {
    const { validFrom, validUntil } = resolveVisitWindow(
      'Africa/Lagos',
      '2026-06-15',
      '14:00',
      '16:00',
    );
    expect(validFrom.toISOString()).toBe('2026-06-15T13:00:00.000Z');
    expect(validUntil.toISOString()).toBe('2026-06-15T15:00:00.000Z');
  });

  it('gives a different absolute instant for the same wall-clock time in a different timezone', () => {
    const lagos = resolveVisitWindow('Africa/Lagos', '2026-06-15', '14:00', '16:00');
    const newYork = resolveVisitWindow('America/New_York', '2026-06-15', '14:00', '16:00');
    // Same "2pm", different real-world moments — this is exactly the bug
    // naive `new Date(...)` parsing used to produce by accident.
    expect(lagos.validFrom.getTime()).not.toBe(newYork.validFrom.getTime());
  });

  it('treats UTC as a plain passthrough (no offset applied)', () => {
    const { validFrom } = resolveVisitWindow('UTC', '2026-06-15', '14:00', '16:00');
    expect(validFrom.toISOString()).toBe('2026-06-15T14:00:00.000Z');
  });

  it('rejects an end time that is not after the start time', () => {
    expect(() => resolveVisitWindow('Africa/Lagos', '2026-06-15', '16:00', '14:00')).toThrow(
      BadRequestException,
    );
  });

  it('rejects an end time equal to the start time (zero-length window)', () => {
    expect(() => resolveVisitWindow('Africa/Lagos', '2026-06-15', '14:00', '14:00')).toThrow(
      BadRequestException,
    );
  });

  it('rejects an unrecognized/garbage timezone rather than silently producing a wrong instant', () => {
    expect(() =>
      resolveVisitWindow('Not/A_Real_Zone', '2026-06-15', '14:00', '16:00'),
    ).toThrow(BadRequestException);
  });

  it('is correct across a DST transition for a zone that observes it (America/New_York)', () => {
    // 2026-03-08 is the US spring-forward date; 2:30 AM doesn't exist
    // that day, but 1:00 PM is unambiguous and a good sanity check that
    // luxon (not naive Date math) is doing this conversion.
    const { validFrom } = resolveVisitWindow(
      'America/New_York',
      '2026-03-08',
      '13:00',
      '15:00',
    );
    // EDT (UTC-4) is already in effect by 1pm on transition day.
    expect(validFrom.toISOString()).toBe('2026-03-08T17:00:00.000Z');
  });
});
