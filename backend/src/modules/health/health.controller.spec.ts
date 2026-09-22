import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('liveness always returns ok without touching the database', async () => {
    const prisma = { $queryRaw: jest.fn() };
    const controller = new HealthController(prisma as any);
    expect(controller.liveness()).toEqual({ status: 'ok', version: 'unknown' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('liveness reports GIT_SHA when the deploy set it', () => {
    const prevValue = process.env.GIT_SHA;
    process.env.GIT_SHA = 'abc1234';
    try {
      const controller = new HealthController({ $queryRaw: jest.fn() } as any);
      expect(controller.liveness()).toEqual({ status: 'ok', version: 'abc1234' });
    } finally {
      // Never leaves a mutated env var behind for later tests in this
      // process to trip over.
      if (prevValue === undefined) delete process.env.GIT_SHA;
      else process.env.GIT_SHA = prevValue;
    }
  });

  it('readiness returns ok when the database responds', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const controller = new HealthController(prisma as any);
    await expect(controller.readiness()).resolves.toEqual({ status: 'ok' });
  });

  it('readiness throws ServiceUnavailableException when the database is unreachable', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('connection refused')) };
    const controller = new HealthController(prisma as any);
    await expect(controller.readiness()).rejects.toThrow(ServiceUnavailableException);
  });
});
