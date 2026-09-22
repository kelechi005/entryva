import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from '../prisma/prisma.module';
import { loggerConfig } from './logger.config';
import { envValidationSchema } from './config/env.validation';

import { AuthModule } from './modules/auth/auth.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { VerificationModule } from './modules/verification/verification.module';
import { EntryExitModule } from './modules/entry-exit/entry-exit.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { OfflineSyncModule } from './modules/offline-sync/offline-sync.module';
import { AdministrationModule } from './modules/administration/administration.module';
import { ResidentInvitesModule } from './modules/resident-invites/resident-invites.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      // Fail on the first missing/invalid var with every problem listed
      // at once, rather than one at a time across repeated restarts.
      validationOptions: { abortEarly: false },
    }),
    LoggerModule.forRoot(loggerConfig),
    // Global default: 100 req/min per IP. Individual routes (login, the
    // public invitation lookup) set stricter per-route limits via @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    InvitationsModule,
    VerificationModule,
    EntryExitModule,
    NotificationsModule,
    AuditLogsModule,
    OfflineSyncModule,
    AdministrationModule,
    ResidentInvitesModule,
    RealtimeModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
