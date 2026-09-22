import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { LoginDto } from './dto/login.dto';

const BCRYPT_ROUNDS = 12;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async login(dto: LoginDto): Promise<TokenPair & { userId: string }> {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.identifier }, { phone: dto.identifier }] },
    });

    // Constant-shape response whether the user exists or the password is
    // wrong — don't let a bad request reveal which one it was. The audit
    // trail is still allowed to know more than the HTTP response does:
    // CLAUDE.md §33 lists "Failed login" explicitly, and recording *which*
    // identifier was attempted (not a password, never a password) is the
    // whole point of a security audit log, even for a user that doesn't
    // exist.
    if (!user || !user.passwordHash) {
      await this.auditLogs.log({
        action: 'LOGIN_FAILED',
        metadata: { identifier: dto.identifier, reason: 'no_such_account_or_no_password' },
      });
      throw new UnauthorizedException('Incorrect email/phone or password.');
    }
    const estateId = await this.resolveEstateIdForUser(user);
    if (user.status !== 'ACTIVE') {
      await this.auditLogs.log({
        action: 'LOGIN_FAILED',
        userId: user.id,
        estateId,
        metadata: { identifier: dto.identifier, reason: 'account_not_active' },
      });
      throw new UnauthorizedException('This account is not active.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      await this.auditLogs.log({
        action: 'LOGIN_FAILED',
        userId: user.id,
        estateId,
        metadata: { identifier: dto.identifier, reason: 'wrong_password' },
      });
      throw new UnauthorizedException('Incorrect email/phone or password.');
    }

    const tokens = await this.issueTokens(user.id);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), refreshTokenHash: this.hashToken(tokens.refreshToken) },
    });

    await this.auditLogs.log({
      action: 'LOGIN',
      userId: user.id,
      estateId,
      entity: 'User',
      entityId: user.id,
    });

    return { ...tokens, userId: user.id };
  }

  /**
   * Best-effort estate resolution purely for audit-log tagging — never
   * used for authorization (that's JwtStrategy's job on every subsequent
   * request). SUPER_ADMIN has no estate by design; a lookup failure here
   * must never block login, so this never throws.
   */
  private async resolveEstateIdForUser(user: {
    id: string;
    role: string;
    adminEstateId: string | null;
  }): Promise<string | null> {
    if (user.role === 'ESTATE_ADMIN') return user.adminEstateId;
    if (user.role === 'RESIDENT') {
      const profile = await this.prisma.residentProfile.findUnique({ where: { userId: user.id } });
      return profile?.estateId ?? null;
    }
    if (user.role === 'SECURITY_OFFICER') {
      const profile = await this.prisma.securityOfficerProfile.findUnique({
        where: { userId: user.id },
      });
      return profile?.estateId ?? null;
    }
    return null;
  }

  async refresh(userId: string, presentedRefreshToken: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.refreshTokenHash) {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    const presentedHash = this.hashToken(presentedRefreshToken);
    if (presentedHash !== user.refreshTokenHash) {
      // Refresh token reuse detected (e.g. a stolen, already-rotated
      // token) — invalidate the session entirely rather than issuing
      // new tokens.
      await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    // Rotate on every use.
    const tokens = await this.issueTokens(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: this.hashToken(tokens.refreshToken) },
    });
    return tokens;
  }

  /** Decodes (without verifying) a JWT to read its subject — used only to
   * find *which* user's refresh token is being presented, before the
   * hash comparison in `refresh()` does the actual verification. */
  decodeSubject(token: string): string | null {
    const decoded = this.jwt.decode(token) as { sub?: string } | null;
    return decoded?.sub ?? null;
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
  }

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  }

  /**
   * Re-checks a user's own current password against what's on file —
   * "step-up auth" for destructive actions taken *while already logged
   * in* (e.g. an admin removing a resident/security officer). This is
   * deliberately separate from login: it never issues tokens, never
   * touches refreshTokenHash, and a wrong password here does not lock
   * the account out — it just means the caller should refuse to
   * proceed with whatever it was about to do.
   *
   * Always returns a boolean rather than throwing, so a missing user or
   * an account with no password (should be impossible for an active
   * admin, but never assume) safely resolves to "not verified" instead
   * of leaking which case it was.
   */
  async verifyPassword(userId: string, plainPassword: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) return false;
    return bcrypt.compare(plainPassword, user.passwordHash);
  }

  private async issueTokens(userId: string): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      { expiresIn: process.env.AUTH_ACCESS_TOKEN_TTL ?? '15m' },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, typ: 'refresh' },
      { expiresIn: process.env.AUTH_REFRESH_TOKEN_TTL ?? '7d' },
    );
    return { accessToken, refreshToken };
  }

  // Refresh tokens are opaque JWTs from the client's point of view but we
  // still only ever store their hash, matching the "never store a raw
  // secret unnecessarily" rule applied elsewhere (CLAUDE.md section 7.9).
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
