import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { VerificationService, SecurityContext } from './verification.service';
import { VerifyQrDto } from './dto/verify-qr.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SecurityContextGuard } from '../../common/guards/security-context.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentSecurityContext } from '../../common/decorators/current-security-context.decorator';

@UseGuards(JwtAuthGuard, RolesGuard, SecurityContextGuard)
@Roles('SECURITY_OFFICER')
@Controller('verification')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('qr')
  async verifyQr(@CurrentSecurityContext() ctx: SecurityContext, @Body() dto: VerifyQrDto) {
    return this.verificationService.verifyByQr(ctx, dto);
  }

  // Rate-limited per CLAUDE.md §38 ("A visitor code must not be
  // brute-forceable") — this is on top of the code's own entropy.
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('code')
  async verifyCode(@CurrentSecurityContext() ctx: SecurityContext, @Body() dto: VerifyCodeDto) {
    return this.verificationService.verifyByCode(ctx, dto);
  }
}
