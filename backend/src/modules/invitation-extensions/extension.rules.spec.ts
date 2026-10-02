import { LONG_EXPIRED_MINUTES, evaluateExtension, type ExtensionRules, type ExtensionTarget } from './extension.rules';

// Lagos (WAT) is UTC+1 all year.
const at = (iso: string) => new Date(`${iso}+01:00`);
const NOW = at('2026-10-05T12:00:00');
const TZ = 'Africa/Lagos';

const rules: ExtensionRules = {
  enabled: true,
  maxExtendMinutes: 120,
  maxTotalMinutes: 720,
  quietFromMinute: null,
  quietToMinute: null,
};

const target: ExtensionTarget = {
  status: 'ACTIVE',
  entryPolicy: 'ONE_TIME',
  validFrom: at('2026-10-05T10:00:00'),
  validUntil: at('2026-10-05T14:00:00'),
};

function run(over: { target?: Partial<ExtensionTarget>; rules?: Partial<ExtensionRules>; minutes?: number; now?: Date } = {}) {
  return evaluateExtension({
    target: { ...target, ...over.target },
    rules: { ...rules, ...over.rules },
    requestedMinutes: over.minutes ?? 60,
    now: over.now ?? NOW,
    timeZone: TZ,
  });
}

describe('evaluateExtension', () => {
  it('adds the minutes to the current expiry', () => {
    const r = run({ minutes: 60 });
    expect(r).toEqual({ ok: true, newValidUntil: at('2026-10-05T15:00:00'), minutes: 60 });
  });

  it('counts from now when the pass has just run out', () => {
    const r = run({ target: { validUntil: at('2026-10-05T11:30:00') }, minutes: 60 });
    expect(r).toMatchObject({ ok: true, newValidUntil: at('2026-10-05T13:00:00') });
  });

  it('refuses when the estate has switched extensions off', () => {
    expect(run({ rules: { enabled: false } })).toMatchObject({ ok: false, code: 'DISABLED' });
  });

  it('refuses revoked and cancelled passes', () => {
    expect(run({ target: { status: 'REVOKED' } })).toMatchObject({ ok: false, code: 'REVOKED' });
    expect(run({ target: { status: 'CANCELLED' } })).toMatchObject({ ok: false, code: 'REVOKED' });
  });

  it('refuses a one-time pass that was already used, but not a multi-entry one', () => {
    expect(run({ target: { status: 'USED' } })).toMatchObject({ ok: false, code: 'ALREADY_USED' });
    expect(run({ target: { status: 'USED', entryPolicy: 'MULTI_ENTRY' } }).ok).toBe(true);
  });

  it('allows a recently expired pass and refuses one that expired long ago', () => {
    const justExpired = at('2026-10-05T10:30:00'); // 90 minutes before NOW
    expect(run({ target: { status: 'EXPIRED', validUntil: justExpired } }).ok).toBe(true);
    const longAgo = new Date(NOW.getTime() - (LONG_EXPIRED_MINUTES + 1) * 60_000);
    expect(run({ target: { status: 'EXPIRED', validUntil: longAgo } })).toMatchObject({
      ok: false,
      code: 'EXPIRED_TOO_LONG',
    });
  });

  it('rejects zero, negative and fractional amounts', () => {
    for (const minutes of [0, -30, 1.5]) {
      expect(run({ minutes })).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' });
    }
  });

  it('limits one request to the estate maximum', () => {
    expect(run({ minutes: 120 }).ok).toBe(true);
    expect(run({ minutes: 121 })).toMatchObject({ ok: false, code: 'TOO_LONG_REQUEST' });
  });

  it('limits the total length of the pass', () => {
    // starts 10:00, so 12 hours ends 22:00. Valid until 21:30 + 30 = 22:00 is fine, +31 is not.
    const late = { validUntil: at('2026-10-05T21:30:00') };
    const rulesNoQuiet = { maxTotalMinutes: 720 };
    expect(run({ target: late, rules: rulesNoQuiet, minutes: 30, now: at('2026-10-05T21:00:00') }).ok).toBe(true);
    expect(run({ target: late, rules: rulesNoQuiet, minutes: 31, now: at('2026-10-05T21:00:00') })).toMatchObject({
      ok: false,
      code: 'TOO_LONG_TOTAL',
    });
  });

  describe('quiet hours', () => {
    const night = { quietFromMinute: 22 * 60, quietToMinute: 5 * 60, maxTotalMinutes: 2880 }; // 22:00-05:00, wraps midnight

    it('blocks a request made during quiet hours', () => {
      const r = run({ rules: night, now: at('2026-10-05T23:00:00'), target: { validUntil: at('2026-10-05T23:30:00') } });
      expect(r).toMatchObject({ ok: false, code: 'QUIET_HOURS' });
      expect(r.ok === false && r.message).toContain('22:00');
      expect(r.ok === false && r.message).toContain('05:00');
    });

    it('blocks an extension that would end inside quiet hours', () => {
      const r = run({ rules: night, minutes: 120, now: at('2026-10-05T20:30:00'), target: { validUntil: at('2026-10-05T21:00:00') } });
      expect(r).toMatchObject({ ok: false, code: 'QUIET_HOURS' });
    });

    it('allows an extension that ends before quiet hours start', () => {
      const r = run({ rules: night, minutes: 60, now: at('2026-10-05T19:00:00'), target: { validUntil: at('2026-10-05T20:00:00') } });
      expect(r.ok).toBe(true);
    });

    it('works for a window that does not wrap midnight', () => {
      const lunch = { quietFromMinute: 12 * 60, quietToMinute: 14 * 60 };
      expect(run({ rules: lunch, now: at('2026-10-05T12:30:00') })).toMatchObject({ ok: false, code: 'QUIET_HOURS' });
    });

    it('does nothing when quiet hours are not set', () => {
      expect(run({ rules: { maxTotalMinutes: 2880 }, now: at('2026-10-05T23:00:00'), target: { validUntil: at('2026-10-05T23:30:00') } }).ok).toBe(true);
    });

    it('uses the estate time zone, not UTC', () => {
      // 21:30 UTC is 22:30 in Lagos, which is inside 22:00-05:00
      const r = run({ rules: night, now: new Date('2026-10-05T21:30:00Z'), target: { validUntil: new Date('2026-10-05T22:00:00Z') } });
      expect(r).toMatchObject({ ok: false, code: 'QUIET_HOURS' });
    });
  });

  it('reports the earliest failing check', () => {
    expect(run({ rules: { enabled: false }, target: { status: 'REVOKED' }, minutes: 9999 })).toMatchObject({
      code: 'DISABLED',
    });
    expect(run({ target: { status: 'REVOKED' }, minutes: 9999 })).toMatchObject({ code: 'REVOKED' });
  });
});
