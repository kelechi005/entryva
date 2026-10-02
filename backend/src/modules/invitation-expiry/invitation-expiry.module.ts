import { Module } from '@nestjs/common';
import { InvitationExpiryService } from './invitation-expiry.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [InvitationExpiryService],
})
export class InvitationExpiryModule {}
