import { Params } from 'nestjs-pino';

/**
 * CLAUDE.md §4/§11 call for "structured logging" as v1 infra. Previously
 * the app only used NestJS's default plain-text Logger — this wires in
 * real structured (JSON) logging via nestjs-pino/pino, which:
 * - emits one JSON object per line in production (what a log aggregator
 *   like CloudWatch/Datadog/Loki actually wants), and
 * - pretty-prints to the terminal in development so it's still readable
 *   locally (`pino-pretty`, dev-only — never used in production).
 *
 * `app.useLogger(app.get(Logger))` in main.ts makes this the target for
 * every existing `new Logger(SomeService.name)` call already in the
 * codebase (AuthService, AuditLogsService, etc.) — nothing else needed
 * to change at each call site.
 */
export const loggerConfig: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport:
      process.env.NODE_ENV === 'production'
        ? undefined
        : { target: 'pino-pretty', options: { singleLine: true, colorize: true } },
    // Never let a resident's/visitor's/officer's password, session cookie,
    // or bearer token end up in a log line, even indirectly through
    // request/response header logging.
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
      ],
      censor: '[redacted]',
    },
    // The gate's readiness/liveness checks get polled every few seconds
    // by docker-compose's healthcheck — logging every single one drowns
    // out everything else. Real failures still show up via the 503
    // status code / non-2xx branch pino-http logs regardless.
    autoLogging: {
      ignore: (req) => req.url === '/api/health' || req.url === '/api/health/ready',
    },
  },
};
