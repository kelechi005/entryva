import { Module } from '@nestjs/common';
import { InvitationExtensionsController, PassRulesController } from './invitation-extensions.controller';
import { InvitationExtensionsService } from './invitation-extensions.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [NotificationsModule, AuditLogsModule],
  controllers: [InvitationExtensionsController, PassRulesController],
  providers: [InvitationExtensionsService],
})
export class InvitationExtensionsModule {}
