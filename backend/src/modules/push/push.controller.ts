import { Body, Controller, Delete, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PushService } from './push.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SubscribePushDto, UnsubscribePushDto } from './dto/subscribe-push.dto';

// Every route acts only on the signed-in person's own devices.
@UseGuards(JwtAuthGuard)
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  /** Whether push is switched on, and the public key the browser needs to subscribe. */
  @Get('config')
  config() {
    return this.push.getConfig();
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('subscriptions')
  async subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubscribePushDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<{ success: true }> {
    await this.push.subscribe(user.userId, dto, userAgent);
    // A body (not 204): the frontend's apiFetch always reads JSON, like every other endpoint here.
    return { success: true };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Delete('subscriptions')
  async unsubscribe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UnsubscribePushDto): Promise<{ success: true }> {
    await this.push.unsubscribe(user.userId, dto.endpoint);
    return { success: true };
  }
}
