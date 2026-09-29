import { Module } from '@nestjs/common';
import { SignupController } from './signup.controller';
import { SignupService } from './signup.service';
import { AuthModule } from '../auth/auth.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { EmailModule } from '../../common/email/email.module';

@Module({
  imports: [AuthModule, AuditLogsModule, EmailModule],
  controllers: [SignupController],
  providers: [SignupService],
})
export class SignupModule {}
