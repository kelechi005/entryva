import { Module } from '@nestjs/common';
import {
  RecurringPassesController,
  RecurringPublicController,
  RecurringScanController,
} from './recurring-passes.controller';
import { RecurringPassesService } from './recurring-passes.service';
import { RecurringScanService } from './recurring-scan.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuditLogsModule, NotificationsModule],
  controllers: [RecurringPassesController, RecurringScanController, RecurringPublicController],
  providers: [RecurringPassesService, RecurringScanService],
})
export class RecurringPassesModule {}
