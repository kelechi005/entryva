import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { EntryExitController } from './entry-exit.controller';
import { EntryExitService } from './entry-exit.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [AuditLogsModule, NotificationsModule],
  controllers: [EntryExitController],
  providers: [EntryExitService],
  exports: [EntryExitService],
})
export class EntryExitModule {}
