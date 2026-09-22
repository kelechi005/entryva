import { Module } from '@nestjs/common';
import { ResidentInvitesController, PublicResidentInvitesController } from './resident-invites.controller';
import { ResidentInvitesService } from './resident-invites.service';
import { AuthModule } from '../auth/auth.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { EmailModule } from '../../common/email/email.module';

@Module({
  imports: [AuthModule, AuditLogsModule, EmailModule],
  controllers: [ResidentInvitesController, PublicResidentInvitesController],
  providers: [ResidentInvitesService],
  exports: [ResidentInvitesService],
})
export class ResidentInvitesModule {}
