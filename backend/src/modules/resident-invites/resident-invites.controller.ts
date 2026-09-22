import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ResidentInvitesService } from './resident-invites.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateResidentInviteDto } from './dto/create-resident-invite.dto';
import { CompleteResidentInviteDto } from './dto/complete-resident-invite.dto';
import { CancelResidentInviteDto } from './dto/cancel-resident-invite.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
@Controller('admin/resident-invites')
export class ResidentInvitesController {
  constructor(private readonly service: ResidentInvitesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Query('estateId') estateId: string | undefined,
    @Body() dto: CreateResidentInviteDto,
  ) {
    return this.service.createInvite(user, estateId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('estateId') estateId?: string) {
    return this.service.listInvites(user, estateId);
  }

  @Post(':id/resend')
  resend(
    @CurrentUser() user: AuthenticatedUser,
    @Query('estateId') estateId: string | undefined,
    @Param('id') id: string,
  ) {
    return this.service.resendInvite(user, estateId, id);
  }

  @Delete(':id')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Query('estateId') estateId: string | undefined,
    @Param('id') id: string,
    @Body() dto: CancelResidentInviteDto,
  ) {
    return this.service.cancelInvite(user, estateId, id, dto);
  }
}

// No session context at all — same separation as
// InvitationsController / PublicInvitationsController.
@Controller('resident-invites/public')
export class PublicResidentInvitesController {
  constructor(private readonly service: ResidentInvitesService) {}

  // Tokens are high-entropy so brute force isn't realistic, but this
  // still caps enumeration/scraping cheaply — same limit as the visitor
  // public-invitation lookup.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':token')
  preview(@Param('token') token: string) {
    return this.service.previewByToken(token);
  }

  // Tighter limit than the read-only preview: this one creates an
  // account. 10/min is generous for a genuine resident (who will only
  // ever submit this once) while still bounding brute-force attempts
  // against a guessed/leaked-but-not-yet-used token.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':token')
  complete(@Param('token') token: string, @Body() dto: CompleteResidentInviteDto) {
    return this.service.completeInvite(token, dto);
  }
}
