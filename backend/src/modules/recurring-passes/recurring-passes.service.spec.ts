import { createHash } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RecurringPassesService } from './recurring-passes.service';
import { dailyCodeFor } from './recurring-pass.rules';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const NOW = new Date('2026-10-05T12:00:00+01:00');
const TODAY = '2026-10-05';
const ctx = { userId: 'u1', residentId: 'r1', estateId: 'e1', apartmentId: 'a1', displayName: 'Ada Eze' };

const dto = (over: Record<string, unknown> = {}) => ({
  fullName: 'Mama Ngozi',
  role: 'HOUSE_HELP' as const,
  days: [1, 3, 5],
  startMinute: 540,
  endMinute: 960,
  validFrom: TODAY,
  validUntil: '2026-11-04',
  ...over,
});

function setup() {
  const passes: Record<string, any>[] = [];
  const exceptions: Record<string, unknown>[] = [];
  const prisma = {
    estate: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Africa/Lagos' }) },
    recurringPass: {
      create: jest.fn().mockImplementation(async ({ data }) => {
        const p = { id: `p${passes.length + 1}`, phone: null, linkedDeviceHash: null, linkedAt: null, status: 'ACTIVE', createdAt: new Date(), ...data };
        passes.push(p);
        return p;
      }),
      findFirst: jest.fn().mockImplementation(async ({ where }) => passes.find((p) => p.id === where.id && p.residentId === where.residentId && p.estateId === where.estateId) ?? null),
      findUnique: jest.fn().mockImplementation(async ({ where }) => passes.find((p) => (where.tokenHash ? p.tokenHash === where.tokenHash : p.id === where.id)) ?? null),
      updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
        const p = passes.find((x) => x.id === where.id);
        if (!p) return { count: 0 };
        if (where.status?.in && !where.status.in.includes(p.status)) return { count: 0 };
        if (where.status?.not && p.status === where.status.not) return { count: 0 };
        if ('linkedDeviceHash' in where && p.linkedDeviceHash !== where.linkedDeviceHash) return { count: 0 };
        Object.assign(p, data);
        return { count: 1 };
      }),
      update: jest.fn().mockImplementation(async ({ where, data }) => Object.assign(passes.find((x) => x.id === where.id)!, data)),
    },
    recurringPassException: {
      upsert: jest.fn().mockImplementation(async ({ create }) => {
        exceptions.push(create);
      }),
    },
    residentProfile: { findUnique: jest.fn().mockResolvedValue({ displayName: 'Ada Eze' }) },
    apartment: { findUnique: jest.fn().mockResolvedValue({ flatNumber: 'B-204' }) },
  };
  const auditLogs = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new RecurringPassesService(prisma as never, auditLogs as never);
  return { service, passes, exceptions, auditLogs };
}

describe('RecurringPassesService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a pass, stores only the hash of the link token and returns the token once', async () => {
    const { service, passes, auditLogs } = setup();
    const r = await service.create(ctx, dto());
    expect(r.shareToken.length).toBeGreaterThanOrEqual(30);
    expect(passes[0].tokenHash).toBe(sha(r.shareToken));
    expect(JSON.stringify(passes[0])).not.toContain(r.shareToken);
    expect(r).toMatchObject({ days: [1, 3, 5], status: 'ACTIVE' });
    expect(auditLogs.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'RECURRING_PASS_CREATED' }));
  });

  it('rejects a bad schedule, a past window and an account with no apartment', async () => {
    const { service } = setup();
    await expect(service.create(ctx, dto({ endMinute: 500 }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(ctx, dto({ validUntil: '2027-03-01' }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(ctx, dto({ validFrom: '2026-09-01', validUntil: '2026-09-20' }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...ctx, apartmentId: undefined }, dto())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('pauses, resumes and revokes in the allowed order only', async () => {
    const { service } = setup();
    const p = await service.create(ctx, dto());
    await expect(service.resume(ctx, p.id)).rejects.toBeInstanceOf(ConflictException);
    expect((await service.pause(ctx, p.id)).status).toBe('PAUSED');
    await expect(service.pause(ctx, p.id)).rejects.toBeInstanceOf(ConflictException);
    expect((await service.resume(ctx, p.id)).status).toBe('ACTIVE');
    expect((await service.revoke(ctx, p.id)).status).toBe('REVOKED');
    await expect(service.revoke(ctx, p.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.renew(ctx, p.id, 30)).rejects.toBeInstanceOf(ConflictException);
  });

  it('only lets the owner touch a pass', async () => {
    const { service } = setup();
    const p = await service.create(ctx, dto());
    await expect(service.pause({ ...ctx, residentId: 'r2' }, p.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('checks the dates for skipped and extra days', async () => {
    const { service, exceptions } = setup();
    const p = await service.create(ctx, dto());
    await service.skipDay(ctx, p.id, '2026-10-07');
    await expect(service.skipDay(ctx, p.id, '2026-10-04')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.skipDay(ctx, p.id, '2026-12-01')).rejects.toBeInstanceOf(BadRequestException);
    await service.addExtraDay(ctx, p.id, { date: '2026-10-08', startMinute: 600, endMinute: 700 });
    await expect(service.addExtraDay(ctx, p.id, { date: '2026-10-08', startMinute: 600 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.addExtraDay(ctx, p.id, { date: '2026-10-08', startMinute: 700, endMinute: 600 })).rejects.toBeInstanceOf(BadRequestException);
    expect(exceptions).toHaveLength(2);
  });

  it('renews from today', async () => {
    const { service } = setup();
    const p = await service.create(ctx, dto());
    expect(await service.renew(ctx, p.id, 14)).toMatchObject({ validFrom: TODAY, validUntil: '2026-10-18' });
  });

  describe('the person\'s own pass page', () => {
    const A = 'device-aaaaaaaaaaaaaaaa';
    const B = 'device-bbbbbbbbbbbbbbbb';

    it('links the first phone and refuses a second one until the resident resets it', async () => {
      const { service } = setup();
      const p = await service.create(ctx, dto());
      const v = await service.publicView(p.shareToken, A);
      expect(v).toMatchObject({ residentName: 'Ada Eze', apartmentLabel: 'B-204' });
      expect(v.code).toBe(dailyCodeFor(sha(p.shareToken), TODAY));
      await service.publicView(p.shareToken, A);
      await expect(service.publicView(p.shareToken, B)).rejects.toBeInstanceOf(ForbiddenException);
      await service.resetPhone(ctx, p.id);
      expect((await service.publicView(p.shareToken, B)).code).toBeTruthy();
    });

    it('gives no code to a paused pass, and refuses missing or malformed input', async () => {
      const { service, passes } = setup();
      const p = await service.create(ctx, dto());
      await service.publicView(p.shareToken, A);
      passes[0].status = 'PAUSED';
      expect((await service.publicView(p.shareToken, A)).code).toBeNull();
      await expect(service.publicView(p.shareToken, undefined)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.publicView('short', A)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.publicView('x'.repeat(30), A)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
