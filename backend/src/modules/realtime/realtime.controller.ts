import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RealtimeService } from './realtime.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SECURITY_OFFICER')
@Controller('realtime')
export class RealtimeController {
  constructor(private readonly service: RealtimeService) {}

  // Fetched fresh right before starting or accepting a call (see
  // useCallManager) rather than once and cached — the credential expires,
  // and a call that starts near the end of a stale credential's window
  // shouldn't risk failing mid-call.
  @Get('ice-servers')
  getIceServers(@CurrentUser() user: AuthenticatedUser) {
    return this.service.buildIceServers(user);
  }
}
