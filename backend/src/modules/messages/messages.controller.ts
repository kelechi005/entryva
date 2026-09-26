import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { CallsGateway } from '../realtime/calls.gateway';

/**
 * Officer-to-officer text messaging -- the WhatsApp-style counterpart to
 * CallsGateway's voice calls. Sending goes through REST (this
 * controller), not a socket event, so a message is durably saved even
 * if the recipient (or the sender, mid-request) is offline; the socket
 * is used only afterward, to push it live to whoever's connected.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SECURITY_OFFICER')
@Controller('messages')
export class MessagesController {
  constructor(
    private readonly messages: MessagesService,
    private readonly callsGateway: CallsGateway,
  ) {}

  @Get('threads')
  async listThreads(@CurrentUser() user: AuthenticatedUser) {
    return this.messages.listThreadSummaries(user.estateId!, user.userId);
  }

  @Get('thread/:userId')
  async getThread(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') otherUserId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.messages.getThread(user.estateId!, user.userId, otherUserId, cursor);
  }

  @Post('thread/:userId')
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') otherUserId: string,
    @Body() dto: SendMessageDto,
  ) {
    const message = await this.messages.send(user.estateId!, user.userId, otherUserId, dto.body);
    this.callsGateway.pushMessage(user.estateId!, otherUserId, message);
    return message;
  }

  @Post('thread/:userId/read')
  async markRead(@CurrentUser() user: AuthenticatedUser, @Param('userId') otherUserId: string) {
    await this.messages.markThreadRead(user.estateId!, user.userId, otherUserId);
    return { ok: true };
  }
}
