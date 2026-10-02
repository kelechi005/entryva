import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { InvitationExtensionsService } from './invitation-extensions.service';
import { ExtendInvitationDto } from './dto/extend-invitation.dto';
import { UpdatePassRulesDto } from './dto/update-pass-rules.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

// The resident who made the pass extends it.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RESIDENT')
@Controller('invitations')
export class InvitationExtensionsController {
  constructor(private readonly service: InvitationExtensionsService) {}

  @Post(':id/extend')
  extend(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ExtendInvitationDto) {
    return this.service.extend(
      {
        userId: user.userId,
        residentId: user.residentId!,
        estateId: user.estateId!,
        displayName: user.displayName,
      },
      id,
      dto.minutes,
    );
  }
}

// The estate admin sets the rules.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
@Controller('admin/estate/pass-rules')
export class PassRulesController {
  constructor(private readonly service: InvitationExtensionsService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser, @Query('estateId') estateId?: string) {
    return this.service.getRules(user.userId, estateId);
  }

  @Put()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Query('estateId') estateId: string | undefined,
    @Body() dto: UpdatePassRulesDto,
  ) {
    return this.service.updateRules(user.userId, estateId, dto);
  }
}
