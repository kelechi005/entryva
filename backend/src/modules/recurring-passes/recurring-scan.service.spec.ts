import { createHash } from 'crypto';
import { RecurringScanService } from './recurring-scan.service';
import { dailyCodeFor } from './recurring-pass.rules';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const TOKEN = 'abcdefghijklmnopqrstuvwx12345678';
const TOKEN_HASH = sha(TOKEN);

// Monday 5 Oct 2026, 12:00 in Lagos (UTC+1, all year).
const NOW = new Date('2026-10-05T12:00:00+01:00');
const TODAY = '2026-10-05';
const day = (key: string) => new Date(`${key}T00:00:00Z`);
const ctx = { securityOfficerId: 'o1', estateId: 'e1' };
const qr = (code: string) => `https://entryva.tech/pass/${TOKEN}~${code}`;
const goodCode = () => dailyCodeFor(TOKEN_HASH, TODAY);

interface Scan {
  passId: string;
  result: string;
  direction: string | null;
  scannedAt: Date;
}

function setup(over: Record<string, unknown> = {}, scans: Scan[] = [], blocked: { phone: string }[] = []) {
  const pass = {
    id: 'p1',
    estateId: 'e1',
    residentId: 'r1',
    apartmentId: 'a1',
    fullName: 'Mama Ngozi',
    phone: '0801 234 5678',
    role: 'HOUSE_HELP',
    days: [1, 3, 5],
    startMinute: 9 * 60,
    endMinute: 16 * 60,
    validFrom: day('2026-10-01'),
    validUntil: day('2026-10-31'),
    graceMinutes: 30,
    status: 'ACTIVE',
    tokenHash: TOKEN_HASH,
    exceptions: [] as { date: Date; type: string; startMinute: number | null; endMinute: number | null }[],
    ...over,
  };
  const created: Record<string, unknown>[] = [];
  const stored = [...scans];
  const prisma = {
    recurringPass: { findUnique: jest.fn().mockImplementation(async ({ where }) => (where.tokenHash === TOKEN_HASH ? pass : null)) },
    estate: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Africa/Lagos' }) },
    estateBlockedPerson: { findMany: jest.fn().mockResolvedValue(blocked) },
    recurringPassScan: {
      findFirst: jest.fn().mockImplementation(async () => [...stored].sort((a, b) => b.scannedAt.getTime() - a.scannedAt.getTime())[0] ?? null),
      create: jest.fn().mockImplementation(async ({ data }) => {
        created.push(data);
      }),
    },
    residentProfile: { findUnique: jest.fn().mockResolvedValue({ userId: 'u1', displayName: 'Ada Eze' }) },
    apartment: { findUnique: jest.fn().mockResolvedValue({ flatNumber: 'B-204' }) },
  };
  const auditLogs = { log: jest.fn().mockResolvedValue(undefined) };
  const notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };
  const service = new RecurringScanService(prisma as never, auditLogs as never, notifications as never);
  return { service, created, notifications, auditLogs };
}

describe('RecurringScanService.scan', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('lets a scheduled person in, records it and tells the resident', async () => {
    const { service, created, notifications } = setup();
    const r = await service.scan(ctx, qr(goodCode()), 'officer-user');
    expect(r).toMatchObject({ allowed: true, direction: 'IN', pass: { fullName: 'Mama Ngozi', apartmentLabel: 'B-204' } });
    expect(created).toEqual([expect.objectContaining({ passId: 'p1', result: 'ALLOWED', direction: 'IN' })]);
    expect(notifications.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'RECURRING_PASS_ENTERED' }));
  });

  it('records OUT after IN', async () => {
    const earlier = new Date(NOW.getTime() - 3 * 3600_000);
    const { service, notifications } = setup({}, [{ passId: 'p1', result: 'ALLOWED', direction: 'IN', scannedAt: earlier }]);
    const r = await service.scan(ctx, qr(goodCode()));
    expect(r.direction).toBe('OUT');
    expect(notifications.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'RECURRING_PASS_EXITED' }));
  });

  it('does not flip IN to OUT when the same person is scanned twice in seconds', async () => {
    const justNow = new Date(NOW.getTime() - 3000);
    const { service, created, notifications } = setup({}, [{ passId: 'p1', result: 'ALLOWED', direction: 'IN', scannedAt: justNow }]);
    const r = await service.scan(ctx, qr(goodCode()));
    expect(r).toMatchObject({ allowed: true, duplicate: true, direction: 'IN' });
    expect(created).toHaveLength(0);
    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('denies a wrong or old code and still records the attempt', async () => {
    const { service, created, notifications } = setup();
    const r = await service.scan(ctx, qr('AAAAAAAAAA'));
    expect(r).toMatchObject({ allowed: false, reason: 'CODE_OUTDATED' });
    expect(created).toEqual([expect.objectContaining({ result: 'DENIED', reason: 'CODE_OUTDATED', direction: null })]);
    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('treats another estate\'s pass as not found and records no scan', async () => {
    const { service, created } = setup();
    const r = await service.scan({ ...ctx, estateId: 'other' }, qr(goodCode()));
    expect(r).toMatchObject({ allowed: false, reason: 'INVALID_PASS' });
    expect(r.pass).toBeUndefined();
    expect(created).toHaveLength(0);
  });

  it('treats junk and plain invitation tokens as invalid', async () => {
    const { service } = setup();
    expect((await service.scan(ctx, 'not-a-pass-at-all')).reason).toBe('INVALID_PASS');
    expect((await service.scan(ctx, qr('x'))).reason).toBe('INVALID_PASS');
  });

  it('applies the schedule: skipped day, other weekday, extra day, outside hours, paused, expired', async () => {
    const skip = [{ date: day(TODAY), type: 'SKIP', startMinute: null, endMinute: null }];
    const extra = [{ date: day(TODAY), type: 'EXTRA', startMinute: null, endMinute: null }];
    expect((await setup({ exceptions: skip }).service.scan(ctx, qr(goodCode()))).reason).toBe('SKIPPED');
    expect((await setup({ days: [2, 4] }).service.scan(ctx, qr(goodCode()))).reason).toBe('NOT_SCHEDULED');
    expect((await setup({ days: [2, 4], exceptions: extra }).service.scan(ctx, qr(goodCode()))).allowed).toBe(true);
    expect((await setup({ startMinute: 18 * 60, endMinute: 20 * 60, graceMinutes: 0 }).service.scan(ctx, qr(goodCode()))).reason).toBe('OUTSIDE_HOURS');
    expect((await setup({ status: 'PAUSED' }).service.scan(ctx, qr(goodCode()))).reason).toBe('PAUSED');
    expect((await setup({ validUntil: day('2026-10-04') }).service.scan(ctx, qr(goodCode()))).reason).toBe('EXPIRED');
  });

  it('refuses a person the estate has blocked, however the number is written', async () => {
    const { service } = setup({}, [], [{ phone: '+234 801 234 5678' }]);
    expect((await service.scan(ctx, qr(goodCode()))).reason).toBe('BLACKLISTED');
  });

  it('treats a visit left open on an earlier day as new arrival and warns the resident', async () => {
    const yesterday = new Date(NOW.getTime() - 26 * 3600_000);
    const { service, notifications } = setup({}, [{ passId: 'p1', result: 'ALLOWED', direction: 'IN', scannedAt: yesterday }]);
    const r = await service.scan(ctx, qr(goodCode()));
    expect(r).toMatchObject({ allowed: true, direction: 'IN', previousVisitOpen: true });
    expect(notifications.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'RECURRING_PASS_OVERDUE' }));
  });
});
