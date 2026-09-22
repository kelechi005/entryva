import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InvitationsService, ResidentContext } from './invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

function toResidentContext(user: AuthenticatedUser): ResidentContext {
  // Guarded by @Roles('RESIDENT') below, so these fields are always
  // present by the time we get here (see JwtStrategy.validate()).
  return {
    userId: user.userId,
    residentId: user.residentId!,
    estateId: user.estateId!,
    apartmentId: user.apartmentId!,
    displayName: user.displayName,
  };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RESIDENT')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInvitationDto) {
    return this.invitationsService.createInvitation(toResidentContext(user), dto);
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.invitationsService.listForResident(toResidentContext(user));
  }

  @Get('overview')
  async overview(@CurrentUser() user: AuthenticatedUser) {
    return this.invitationsService.getResidentOverview(toResidentContext(user));
  }

  @Delete(':id')
  async revoke(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.invitationsService.revoke(id, toResidentContext(user));
    return { revoked: true };
  }
}

// The public lookup has no resident/session context at all, so it lives
// in its own controller with no guards — keeps "authenticated resident
// actions" and "anyone with a valid link" clearly separated.
@Controller('invitations/public')
export class PublicInvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  // Rate-limited per CLAUDE.md section 58 ("Attacker guesses visitor code") —
  // tokens are high-entropy so brute force isn't realistic, but this still
  // caps enumeration/scraping attempts cheaply.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':token')
  async getPublic(@Param('token') token: string) {
    return this.invitationsService.findPublicByToken(token);
  }
}
