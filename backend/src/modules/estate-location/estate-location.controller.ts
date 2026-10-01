import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { EstateLocationService } from './estate-location.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UpdateEstateLocationDto } from './dto/update-estate-location.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
@Controller('admin/estate/location')
export class EstateLocationController {
  constructor(private readonly service: EstateLocationService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser, @Query('estateId') estateId?: string) {
    return this.service.getLocation(user, estateId);
  }

  @Put()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Query('estateId') estateId: string | undefined,
    @Body() dto: UpdateEstateLocationDto,
  ) {
    return this.service.updateLocation(user, estateId, dto);
  }
}

// No session: the secret link itself is the credential, exactly like
// GET /invitations/public/:token.
@Controller('invitations/public')
export class PublicEstateLocationController {
  constructor(private readonly service: EstateLocationService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':token/location')
  entrance(@Param('token') token: string) {
    return this.service.getEntranceForInvitation(token);
  }
}
