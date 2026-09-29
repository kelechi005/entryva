import {
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import type { TokenPair } from '../auth/auth.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { EmailService } from '../../common/email/email.service';
import { generateSecureToken, hashSecret } from '../../common/crypto/token.util';
import { StartSignupDto } from './dto/start-signup.dto';

export const SIGNUP_LINK_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
// Re-submitting the form for the same email inside this window is
// accepted but sends nothing — stops the form being used to spam one
// inbox, while still letting a genuine "didn't get it" retry work
// after a minute.
export const SIGNUP_RESEND_COOLDOWN_MS = 60 * 1000;

export interface PublicSignupPreview {
  estateName: string;
  adminName: string;
  email: string;
  expiresAt: string;
}

export interface CompletedSignup extends TokenPair {
  userId: string;
  estateId: string;
}

/**
 * Self-service estate signup: form -> pending row -> emailed one-time
 * link -> (on confirm) Estate + ESTATE_ADMIN created and signed in.
 *
 * Deliberate properties, each covered by signup.service.spec.ts:
 *  - Nothing real (no Estate, no User) exists until the link is used,
 *    so fake/abandoned signups leave only an expiring row.
 *  - startSignup answers identically whether or not the email already
 *    has an account, so the form can't be used to discover who's
 *    registered.
 *  - The raw token is emailed and never stored — only its hash.
 *  - The link is single-use, expires, and GET only previews (email
 *    security scanners pre-fetch links; only the POST consumes it).
 *  - Consuming the link is an atomic claim, so two concurrent clicks
 *    can't create two estates.
 */
@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly auditLogs: AuditLogsService,
    private readonly email: EmailService,
  ) {}

  private buildVerifyUrl(rawToken: string): string {
    return `${process.env.FRONTEND_ORIGIN ?? ''}/signup/verify/${rawToken}`;
  }

  async startSignup(dto: StartSignupDto): Promise<void> {
    // Hash first, unconditionally: bcrypt dominates this request's
    // latency, so doing it only for new emails would make "this email
    // already has an account" measurably faster than the normal path.
    const passwordHash = await this.authService.hashPassword(dto.password);

    // Housekeeping: pending rows carry a password hash, so don't let
    // dead ones (expired/used/superseded, a week past expiry) pile up.
    await this.prisma.pendingSignup
      .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } })
      .catch((err: Error) => this.logger.warn(`Pending signup cleanup failed: ${err.message}`));

    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      await this.auditLogs.log({
        action: 'SIGNUP_REJECTED',
        metadata: { email: dto.email, reason: 'email_already_registered' },
      });
      return;
    }

    const recent = await this.prisma.pendingSignup.findFirst({
      where: {
        email: dto.email,
        status: 'PENDING',
        createdAt: { gt: new Date(Date.now() - SIGNUP_RESEND_COOLDOWN_MS) },
      },
    });
    if (recent) return;

    // One live pending signup per email: a fresh submission replaces
    // (and kills the link of) any earlier one.
    await this.prisma.pendingSignup.updateMany({
      where: { email: dto.email, status: 'PENDING' },
      data: { status: 'SUPERSEDED' },
    });

    const rawToken = generateSecureToken();
    const expiresAt = new Date(Date.now() + SIGNUP_LINK_TTL_MS);

    const pending = await this.prisma.pendingSignup.create({
      data: {
        email: dto.email,
        tokenHash: hashSecret(rawToken),
        passwordHash,
        adminName: dto.adminName,
        adminPhone: dto.adminPhone || null,
        estateName: dto.estateName,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        timezone: dto.timezone,
        contactPhone: dto.contactPhone || null,
        expiresAt,
      },
    });

    const emailStatus = await this.email.sendSignupVerificationEmail({
      to: dto.email,
      adminName: dto.adminName,
      estateName: dto.estateName,
      verifyUrl: this.buildVerifyUrl(rawToken),
      expiresAt,
    });
    if (emailStatus !== 'sent') {
      // The HTTP response stays generic on purpose (see class doc), so
      // a delivery problem has to be visible in logs + audit instead.
      this.logger.error(`Signup verification email not delivered (${emailStatus}) for signup ${pending.id}`);
    }

    await this.auditLogs.log({
      action: 'SIGNUP_STARTED',
      entity: 'PendingSignup',
      entityId: pending.id,
      metadata: { email: dto.email, estateName: dto.estateName, emailStatus },
    });
  }

  async previewByToken(rawToken: string): Promise<PublicSignupPreview> {
    const pending = await this.findLivePending(rawToken);
    return {
      estateName: pending.estateName,
      adminName: pending.adminName,
      email: pending.email,
      expiresAt: pending.expiresAt.toISOString(),
    };
  }

  async completeSignup(rawToken: string): Promise<CompletedSignup> {
    const pending = await this.findLivePending(rawToken);

    // An optional phone that's already on another account must not
    // block activation — drop it rather than fail the whole signup.
    let adminPhone: string | null = pending.adminPhone;
    if (adminPhone) {
      const phoneTaken = await this.prisma.user.findUnique({ where: { phone: adminPhone } });
      if (phoneTaken) adminPhone = null;
    }

    let created: { userId: string; estateId: string };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        // Atomic claim: only one caller can flip PENDING -> VERIFIED,
        // so a double-click or replay can never create a second estate.
        const claimed = await tx.pendingSignup.updateMany({
          where: { id: pending.id, status: 'PENDING', expiresAt: { gt: new Date() } },
          data: { status: 'VERIFIED', verifiedAt: new Date() },
        });
        if (claimed.count !== 1) {
          throw new GoneException('This signup link has already been used or has expired.');
        }

        const estate = await tx.estate.create({
          data: {
            name: pending.estateName,
            address: pending.address,
            city: pending.city,
            state: pending.state,
            country: pending.country,
            timezone: pending.timezone,
            contactPhone: pending.contactPhone,
          },
        });
        const user = await tx.user.create({
          data: {
            email: pending.email,
            phone: adminPhone,
            passwordHash: pending.passwordHash,
            displayName: pending.adminName,
            role: 'ESTATE_ADMIN',
            status: 'ACTIVE',
            adminEstateId: estate.id,
          },
        });
        return { userId: user.id, estateId: estate.id };
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        // Someone else took this email between signup and confirmation
        // (e.g. a resident invite completed). Transaction rolled back,
        // so the pending row is still PENDING and nothing was created.
        throw new ConflictException('An account with this email already exists. Try signing in instead.');
      }
      throw err;
    }

    const tokens = await this.authService.startSession(created.userId);

    await this.auditLogs.log({
      action: 'ESTATE_SIGNUP_COMPLETED',
      userId: created.userId,
      estateId: created.estateId,
      entity: 'Estate',
      entityId: created.estateId,
      metadata: { pendingSignupId: pending.id },
    });

    return { ...tokens, ...created };
  }

  /**
   * 404 = no such link; 410 = the link existed but is dead (used,
   * superseded, or expired) — same convention as resident invites so
   * the frontend can say "expired" vs "never valid".
   */
  private async findLivePending(rawToken: string) {
    const pending = await this.prisma.pendingSignup.findUnique({
      where: { tokenHash: hashSecret(rawToken) },
    });
    if (!pending) throw new NotFoundException('This signup link is invalid.');
    if (pending.status === 'VERIFIED') {
      throw new GoneException('This signup link has already been used. Try signing in.');
    }
    if (pending.status !== 'PENDING' || pending.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('This signup link has expired. Please sign up again.');
    }
    return pending;
  }
}
