import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  // bufferLogs: true holds any log calls made during module init until
  // the real (pino) logger below is attached, so nothing gets silently
  // dropped or falls back to the plain-text default in that window.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Makes every existing `new Logger(SomeService.name)` call in the
  // codebase (AuthService, AuditLogsService, etc.) route through pino —
  // see src/logger.config.ts for the structured-logging rationale.
  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);

  app.use(helmet());
  // Access/refresh tokens travel as httpOnly cookies, not localStorage —
  // avoids exposing them to XSS. See auth.controller.ts.
  app.use(cookieParser());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
    credentials: true,
  });

  // Behind a reverse proxy / load balancer (the normal production
  // topology), Express needs to trust the proxy's X-Forwarded-* headers
  // to see the real client IP — otherwise every request appears to come
  // from the proxy's own address, which silently breaks per-IP rate
  // limiting (ThrottlerGuard) by bucketing every user together. Set
  // TRUST_PROXY=1 (one hop, e.g. a single nginx/ALB in front) or a
  // specific value per Express's `trust proxy` docs; leave unset/"false"
  // for local dev with no proxy in front.
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy && trustProxy !== 'false') {
    const httpAdapter = app.getHttpAdapter().getInstance();
    const numeric = Number(trustProxy);
    httpAdapter.set('trust proxy', Number.isNaN(numeric) ? trustProxy : numeric);
  }

  // Without this, Nest's OnModuleDestroy hooks (PrismaService's
  // $disconnect among them) never run on SIGTERM/SIGINT — the process
  // just dies mid-request instead of finishing in-flight work and
  // closing the DB pool cleanly. This is the difference between a clean
  // rolling deploy/restart and dropped connections + a Postgres warning
  // about unclosed sessions every time the container recycles.
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  logger.log(`Backend listening on port ${port}`);
}

bootstrap();
