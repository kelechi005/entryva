import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AnnouncementsService } from './announcements.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  // Anyone in the estate can read; the service scopes it to their own estate.
  @Roles('RESIDENT', 'SECURITY_OFFICER', 'ESTATE_ADMIN')
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('kind') kind?: string) {
    const safeKind = kind === 'ANNOUNCEMENT' || kind === 'SECURITY_ALERT' ? kind : undefined;
    return this.service.list(user, safeKind);
  }

  // Residents can never post. Officers are limited to security alerts in the service.
  @Roles('SECURITY_OFFICER', 'ESTATE_ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAnnouncementDto) {
    return this.service.create(user, dto);
  }

  @Roles('ESTATE_ADMIN')
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
