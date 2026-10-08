import { Module } from '@nestjs/common';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { EmergencyController } from './emergency.controller';
import { EmergencyService } from './emergency.service';
import { ArrivalAlertsService } from './arrival-alerts.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuditLogsModule, NotificationsModule],
  controllers: [AnnouncementsController, EmergencyController],
  providers: [AnnouncementsService, EmergencyService, ArrivalAlertsService],
  exports: [ArrivalAlertsService],
})
export class AlertsModule {}
