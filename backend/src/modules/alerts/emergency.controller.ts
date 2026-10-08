import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { EmergencyService } from './emergency.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RaiseEmergencyDto } from './dto/raise-emergency.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('emergency-alerts')
export class EmergencyController {
  constructor(private readonly service: EmergencyService) {}

  // Residents see their own alerts; officers and the admin see the estate's.
  @Roles('RESIDENT', 'SECURITY_OFFICER', 'ESTATE_ADMIN')
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user);
  }

  // Throttled so a stuck button or a script cannot flood the whole estate.
  @Roles('RESIDENT')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  raise(@CurrentUser() user: AuthenticatedUser, @Body() dto: RaiseEmergencyDto) {
    return this.service.raise(user, dto);
  }

  @Roles('SECURITY_OFFICER', 'ESTATE_ADMIN')
  @Post(':id/acknowledge')
  acknowledge(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.acknowledge(user, id);
  }

  @Roles('RESIDENT', 'SECURITY_OFFICER', 'ESTATE_ADMIN')
  @Post(':id/resolve')
  resolve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.resolve(user, id);
  }
}
