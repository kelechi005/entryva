import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * No auth, no @Roles — these are infrastructure endpoints (Docker
 * healthcheck, load balancer, uptime monitor), not application routes.
 * @SkipThrottle so an orchestrator polling every few seconds never trips
 * the global 100 req/min limiter.
 *
 * Deliberately no @nestjs/terminus dependency for two routes this simple
 * — same "don't add infrastructure before it's needed" reasoning as
 * CLAUDE.md §4 on Redis.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness: is the process up and handling requests at all? Includes
   * which commit is actually running — GIT_SHA is set by the CD
   * workflow at deploy time (see .github/workflows/ci.yml and
   * docker-compose.prod.yml), not baked into the image at build time,
   * so the same image reports whatever commit the deploy script passed
   * it. Without this there was no way to confirm from outside the
   * server which of several pushes was actually live after a deploy —
   * exactly the kind of thing that matters once updates are routine
   * rather than a one-off launch.
   */
  @Get()
  @HttpCode(200)
  liveness() {
    return { status: 'ok', version: process.env.GIT_SHA ?? 'unknown' };
  }

  /**
   * Readiness: is the process actually able to serve real requests right
   * now — specifically, can it reach the database? A process can be
   * "alive" (liveness passes) while its DB connection is down; an
   * orchestrator should stop routing traffic to it in that case, which
   * is exactly what a 503 here signals.
   */
  @Get('ready')
  @HttpCode(200)
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch (err) {
      throw new ServiceUnavailableException({
        status: 'error',
        detail: 'Database is not reachable.',
      });
    }
  }
}
