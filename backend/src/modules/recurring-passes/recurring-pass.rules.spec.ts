import {
  DENY_MESSAGES,
  dailyCodeFor,
  evaluateRecurringScan,
  isOverdueInside,
  localMoment,
  validatePassSchedule,
  type PassRules,
  type ScanInput,
} from './recurring-pass.rules';

// 2026-10-05 is a Monday. Lagos (WAT) is UTC+1 all year, so a local time
// is written with a +01:00 offset to make the test independent of the machine's zone.
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+01:00`);

const MON = '2026-10-05';
const SAT = '2026-10-03';

const basePass: PassRules = {
  status: 'ACTIVE',
  validFrom: '2026-10-01',
  validUntil: '2026-12-15',
  days: [1, 2, 3, 4, 5], // Mon-Fri
  startMinute: 9 * 60,
  endMinute: 17 * 60,
  graceMinutes: 30,
  tokenHash: 'hash-abc',
};

function scan(over: Partial<ScanInput> = {}) {
  return evaluateRecurringScan({
    pass: basePass,
    exceptions: [],
    blacklisted: false,
    now: at(MON, '10:00'),
    codeRequired: false,
    ...over,
  });
}

describe('check 1: token matches a pass', () => {
  it('denies an unknown token as Invalid pass', () => {
    const r = scan({ pass: null });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('INVALID_PASS');
    expect(r.message).toBe('Invalid pass');
  });
});

describe('check 2: status must be active', () => {
  it.each([
    ['PAUSED', 'PAUSED'],
    ['REVOKED', 'REVOKED'],
    ['EXPIRED', 'EXPIRED'],
  ] as const)('denies a %s pass', (status, reason) => {
    const r = scan({ pass: { ...basePass, status } });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(reason);
  });
});

describe('check 3: valid-from / valid-until dates', () => {
  it('denies before the valid-from date', () => {
    expect(scan({ now: at('2026-09-30', '10:00') }).reason).toBe('EXPIRED');
  });

  it('denies after the valid-until date', () => {
    expect(scan({ now: at('2026-12-16', '10:00') }).reason).toBe('EXPIRED');
  });

  it('allows on the last valid day', () => {
    expect(scan({ now: at('2026-12-15', '10:00') }).allowed).toBe(true); // a Tuesday
  });
});

describe('check 4: skipped days', () => {
  it('denies a day the resident skipped, even on an allowed weekday', () => {
    const r = scan({ exceptions: [{ date: MON, type: 'SKIP' }] });
    expect(r.reason).toBe('SKIPPED');
    expect(r.message).toBe('Skipped by resident');
  });

  it('only skips that one day', () => {
    expect(scan({ exceptions: [{ date: '2026-10-06', type: 'SKIP' }] }).allowed).toBe(true);
  });
});

describe('check 5: weekday or extra day', () => {
  it('denies a weekday that is not scheduled', () => {
    const r = scan({ now: at(SAT, '10:00') });
    expect(r.reason).toBe('NOT_SCHEDULED');
    expect(r.message).toBe('Not scheduled today');
  });

  it('allows an extra day the resident added', () => {
    expect(scan({ now: at(SAT, '10:00'), exceptions: [{ date: SAT, type: 'EXTRA' }] }).allowed).toBe(true);
  });

  it('uses custom hours on an extra day', () => {
    const extra = { date: SAT, type: 'EXTRA' as const, startMinute: 10 * 60, endMinute: 12 * 60 };
    expect(scan({ now: at(SAT, '11:00'), exceptions: [extra] }).allowed).toBe(true);
    expect(scan({ now: at(SAT, '15:00'), exceptions: [extra] }).reason).toBe('OUTSIDE_HOURS');
  });
});

describe('check 6: time window including grace', () => {
  it('allows inside the window', () => {
    expect(scan({ now: at(MON, '12:00') }).allowed).toBe(true);
  });

  it('denies well before and well after the window', () => {
    expect(scan({ now: at(MON, '07:00') }).reason).toBe('OUTSIDE_HOURS');
    expect(scan({ now: at(MON, '20:00') }).reason).toBe('OUTSIDE_HOURS');
  });

  it('allows exactly 30 minutes early and late, and denies one minute beyond', () => {
    expect(scan({ now: at(MON, '08:30') }).allowed).toBe(true);
    expect(scan({ now: at(MON, '08:29') }).reason).toBe('OUTSIDE_HOURS');
    expect(scan({ now: at(MON, '17:30') }).allowed).toBe(true);
    expect(scan({ now: at(MON, '17:31') }).reason).toBe('OUTSIDE_HOURS');
  });

  it('respects a different grace period', () => {
    const noGrace = { ...basePass, graceMinutes: 0 };
    expect(scan({ pass: noGrace, now: at(MON, '08:59') }).reason).toBe('OUTSIDE_HOURS');
    expect(scan({ pass: noGrace, now: at(MON, '09:00') }).allowed).toBe(true);
  });
});

describe('check 7: estate blacklist', () => {
  it('denies a blocked person', () => {
    const r = scan({ blacklisted: true });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('BLACKLISTED');
  });
});

describe('check 8: rotating code', () => {
  const allDay = { ...basePass, startMinute: 0, endMinute: 1439, graceMinutes: 0 };

  it('accepts today\'s code', () => {
    const code = dailyCodeFor(allDay.tokenHash, MON);
    expect(scan({ pass: allDay, codeRequired: true, presentedCode: code }).allowed).toBe(true);
  });

  it('accepts the code in lower case with spaces around it', () => {
    const code = dailyCodeFor(allDay.tokenHash, MON).toLowerCase();
    expect(scan({ pass: allDay, codeRequired: true, presentedCode: ` ${code} ` }).allowed).toBe(true);
  });

  it('denies a missing, wrong or old code as Code outdated', () => {
    const yesterday = dailyCodeFor(allDay.tokenHash, '2026-10-04');
    expect(scan({ pass: allDay, codeRequired: true, presentedCode: undefined }).reason).toBe('CODE_OUTDATED');
    expect(scan({ pass: allDay, codeRequired: true, presentedCode: 'WRONGCODE1' }).reason).toBe('CODE_OUTDATED');
    expect(scan({ pass: allDay, codeRequired: true, presentedCode: yesterday }).reason).toBe('CODE_OUTDATED');
  });

  it('still accepts yesterday\'s code shortly after midnight, but not later', () => {
    const yesterday = dailyCodeFor(allDay.tokenHash, '2026-10-04');
    expect(scan({ pass: allDay, now: at(MON, '00:20'), codeRequired: true, presentedCode: yesterday }).allowed).toBe(true);
    expect(scan({ pass: allDay, now: at(MON, '02:00'), codeRequired: true, presentedCode: yesterday }).reason).toBe('CODE_OUTDATED');
  });

  it('does not ask for a code when the code is not required', () => {
    expect(scan({ codeRequired: false, presentedCode: null }).allowed).toBe(true);
  });

  it('a code for one pass does not work on another', () => {
    const other = dailyCodeFor('some-other-hash', MON);
    expect(scan({ pass: allDay, codeRequired: true, presentedCode: other }).reason).toBe('CODE_OUTDATED');
  });
});

describe('check 9: allowed, and in/out direction', () => {
  it('first scan is IN, then OUT, then IN again', () => {
    expect(scan({ lastDirection: undefined }).direction).toBe('IN');
    expect(scan({ lastDirection: null }).direction).toBe('IN');
    expect(scan({ lastDirection: 'OUT' }).direction).toBe('IN');
    expect(scan({ lastDirection: 'IN' }).direction).toBe('OUT');
  });

  it('an allowed scan has no deny reason', () => {
    const r = scan();
    expect(r.allowed).toBe(true);
    expect(r.reason).toBeUndefined();
  });
});

describe('order of the checks', () => {
  it('reports the earliest failing check', () => {
    // revoked + skipped + blocked + wrong code: revoked comes first
    expect(
      scan({
        pass: { ...basePass, status: 'REVOKED' },
        exceptions: [{ date: MON, type: 'SKIP' }],
        blacklisted: true,
        codeRequired: true,
      }).reason,
    ).toBe('REVOKED');
  });

  it('skipped comes before outside hours', () => {
    expect(scan({ exceptions: [{ date: MON, type: 'SKIP' }], now: at(MON, '23:00') }).reason).toBe('SKIPPED');
  });

  it('outside hours comes before blacklist, and blacklist before code', () => {
    expect(scan({ blacklisted: true, now: at(MON, '23:00') }).reason).toBe('OUTSIDE_HOURS');
    expect(scan({ blacklisted: true, codeRequired: true, presentedCode: 'x' }).reason).toBe('BLACKLISTED');
  });

  it('every deny reason has a message for the guard', () => {
    for (const message of Object.values(DENY_MESSAGES)) expect(message.length).toBeGreaterThan(0);
  });
});

describe('estate time zone, never the phone or UTC', () => {
  it('treats 23:30 UTC on Sunday as 00:30 Monday in Lagos', () => {
    const now = new Date('2026-10-04T23:30:00Z');
    const local = localMoment(now, 'Africa/Lagos');
    expect(local).toEqual({ date: '2026-10-05', weekday: 1, minute: 30 });

    const mondayOnly = { ...basePass, days: [1], startMinute: 0, endMinute: 1439, graceMinutes: 0 };
    expect(scan({ pass: mondayOnly, now }).allowed).toBe(true);
  });
});

describe('overdue inside', () => {
  const rules = { endMinute: 17 * 60, graceMinutes: 30 };

  it('flags someone still IN after the window and grace', () => {
    expect(isOverdueInside({ lastDirection: 'IN', lastScanDate: MON, pass: rules, now: at(MON, '18:00') })).toBe(true);
  });

  it('does not flag someone inside the window', () => {
    expect(isOverdueInside({ lastDirection: 'IN', lastScanDate: MON, pass: rules, now: at(MON, '16:00') })).toBe(false);
  });

  it('flags someone still IN on a later day', () => {
    expect(isOverdueInside({ lastDirection: 'IN', lastScanDate: MON, pass: rules, now: at('2026-10-06', '08:00') })).toBe(true);
  });

  it('does not flag someone who already left', () => {
    expect(isOverdueInside({ lastDirection: 'OUT', lastScanDate: MON, pass: rules, now: at(MON, '23:00') })).toBe(false);
  });
});

describe('dailyCodeFor', () => {
  it('is stable, 10 characters, and changes with the day and the pass', () => {
    const a = dailyCodeFor('h1', MON);
    expect(a).toMatch(/^[0-9A-F]{10}$/);
    expect(dailyCodeFor('h1', MON)).toBe(a);
    expect(dailyCodeFor('h1', '2026-10-06')).not.toBe(a);
    expect(dailyCodeFor('h2', MON)).not.toBe(a);
  });
});

describe('validatePassSchedule', () => {
  const ok = { days: [1, 3, 5], startMinute: 540, endMinute: 1020, graceMinutes: 30, validFrom: '2026-10-01', validUntil: '2026-12-15' };

  it('accepts a normal schedule', () => {
    expect(validatePassSchedule(ok)).toEqual([]);
  });

  it('allows exactly 90 days and rejects 91', () => {
    expect(validatePassSchedule({ ...ok, validFrom: '2026-10-01', validUntil: '2026-12-29' })).toEqual([]);
    expect(validatePassSchedule({ ...ok, validFrom: '2026-10-01', validUntil: '2026-12-30' })).not.toEqual([]);
  });

  it('rejects empty days, backwards times and a missing valid-until date', () => {
    expect(validatePassSchedule({ ...ok, days: [] })).not.toEqual([]);
    expect(validatePassSchedule({ ...ok, startMinute: 1000, endMinute: 900 })).not.toEqual([]);
    expect(validatePassSchedule({ ...ok, validUntil: '' })).not.toEqual([]);
    expect(validatePassSchedule({ ...ok, validUntil: '2026-09-01' })).not.toEqual([]);
  });
});
