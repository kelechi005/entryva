import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { SignupService } from './signup.service';
import { StartSignupDto } from './dto/start-signup.dto';

// Same cookie shape as AuthController.setAuthCookies — completing a
// signup is a login, so the admin lands on their dashboard signed in.
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
};

// No session context at all: every route here is public.
@Controller('signup')
export class SignupController {
  constructor(private readonly service: SignupService) {}

  // Tightest limit in the app: this endpoint sends email to an
  // arbitrary address and runs bcrypt. 5 per hour per IP is plenty for
  // a real person (typo, retry) and bounds abuse. The per-email
  // cooldown in SignupService bounds a single inbox on top of this.
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @HttpCode(202)
  @Post()
  async start(@Body() dto: StartSignupDto) {
    await this.service.startSignup(dto);
    // Identical for new, duplicate and cooldown cases — see SignupService.
    return { status: 'check_your_email' };
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('verify/:token')
  preview(@Param('token') token: string) {
    return this.service.previewByToken(token);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('verify/:token')
  async verify(@Param('token') token: string, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, userId, estateId } = await this.service.completeSignup(token);
    res.cookie('access_token', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    res.cookie('refresh_token', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
    return { userId, estateId };
  }
}
