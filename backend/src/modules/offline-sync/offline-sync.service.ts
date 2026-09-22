import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { EntryExitService } from '../entry-exit/entry-exit.service';
import type { SecurityContext } from '../verification/verification.service';
import {
  canonicalizeForSigning,
  getOfflineSigningPublicKeyPem,
  signOfflineManifestEntry,
} from '../../common/crypto/signing.util';
import { OfflineSyncBatchDto, OfflineSyncEventDto } from './dto/offline-sync-batch.dto';

export interface OfflineManifestEntry {
  invitationId: string;
  secureTokenHash: string;
  displayCodeHash: string;
  visitorName: string;
  residentName: string;
  residentPhone: string | null;
  apartmentLabel: string;
  validFrom: string;
  validUntil: string;
  entryPolicy: string;
  status: string;
  issuedAt: string;
}

export interface SignedOfflineManifestEntry extends OfflineManifestEntry {
  signature: string;
}

export type OfflineSyncEventResult =
  | { clientEventId: string; status: 'SYNCED' }
  | { clientEventId: string; status: 'ALREADY_SYNCED'; priorStatus: string }
  | { clientEventId: string; status: 'FAILED'; error: string };

/**
 * Implements CLAUDE.md §25/§26. Two responsibilities, kept in one module
 * because they're two halves of the same offline story:
 *
 *  - getManifest(): what a gate device is allowed to cache locally so it
 *    can verify a scan without the server (only hashes, never plaintext
 *    tokens; only estate-scoped invitations; every record signed so the
 *    device can detect local tampering later).
 *  - syncBatch(): what a device reports back once it reconnects, replayed
 *    through the exact same EntryExitService the online path uses, so
 *    the one-time-use compare-and-swap guarantee (CLAUDE.md §52) applies
 *    identically whether the original decision was made online or off.
 */
@Injectable()
export class OfflineSyncService {
  private readonly logger = new Logger(OfflineSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly entryExit: EntryExitService,
  ) {}

  /**
   * Cache only what CLAUDE.md §25 lists as the minimum: invitation
   * identifier, signature data for local verification (the two hashes —
   * never the plaintext token/code, which the server never even stores),
   * visitor name, resident display name, apartment label, validity
   * window, entry policy, current state. Bounded to invitations whose
   * validUntil hasn't already passed — anything further gone is dead
   * weight the device doesn't need and shouldn't hold onto.
   */
  async getManifest(ctx: SecurityContext): Promise<{
    issuedAt: string;
    publicKey: string;
    entries: SignedOfflineManifestEntry[];
  }> {
    const invitations = await this.prisma.invitation.findMany({
      where: {
        estateId: ctx.estateId,
        validUntil: { gte: new Date() },
      },
      include: { visitor: true, resident: true, apartment: true },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });

    const issuedAt = new Date().toISOString();
    const entries: SignedOfflineManifestEntry[] = invitations.map((inv) => {
      const unsigned: OfflineManifestEntry = {
        invitationId: inv.id,
        secureTokenHash: inv.secureTokenHash,
        displayCodeHash: inv.displayCodeHash,
        visitorName: inv.visitor.fullName,
        residentName: inv.resident.displayName,
        residentPhone: inv.resident.phone ?? null,
        apartmentLabel: inv.apartment.flatNumber,
        validFrom: inv.validFrom.toISOString(),
        validUntil: inv.validUntil.toISOString(),
        entryPolicy: inv.entryPolicy,
        status: inv.status,
        issuedAt,
      };
      return { ...unsigned, signature: signOfflineManifestEntry(canonicalizeForSigning(unsigned)) };
    });

    return { issuedAt, publicKey: getOfflineSigningPublicKeyPem(), entries };
  }

  /**
   * CLAUDE.md §26: idempotent, retryable, ordered where necessary,
   * authenticated, audited. `ctx` here comes from a verified access
   * token via SecurityContextGuard exactly as it does online — a device
   * doesn't get to claim a different officer/estate just because it was
   * offline for a while. Each event is processed independently so one
   * bad event in a batch (e.g. an invitation someone else already
   * consumed online in the meantime) doesn't block the rest.
   */
  async syncBatch(
    ctx: SecurityContext,
    dto: OfflineSyncBatchDto,
  ): Promise<{ results: OfflineSyncEventResult[] }> {
    const results: OfflineSyncEventResult[] = [];
    for (const event of dto.events) {
      results.push(await this.syncOne(ctx, dto.deviceId, event));
    }
    return { results };
  }

  private async syncOne(
    ctx: SecurityContext,
    deviceId: string,
    event: OfflineSyncEventDto,
  ): Promise<OfflineSyncEventResult> {
    const existing = await this.prisma.offlineSyncEvent.findUnique({
      where: { clientEventId: event.clientEventId },
    });
    if (existing) {
      // A retried submission of the same clientEventId must resolve to
      // what actually happened the first time, never be reprocessed —
      // CLAUDE.md §26 "do not create duplicate entry records if a
      // synchronization request is retried."
      return {
        clientEventId: event.clientEventId,
        status: 'ALREADY_SYNCED',
        priorStatus: existing.status,
      };
    }

    const eventType = event.decision === 'ALLOWED' ? 'ENTRY' : 'DENY';

    try {
      if (event.decision === 'ALLOWED') {
        await this.entryExit.recordEntry(ctx, {
          invitationId: event.invitationId,
        });
      } else {
        await this.entryExit.denyEntry(ctx, {
          invitationId: event.invitationId,
          reason: event.reason,
        });
      }

      await this.prisma.offlineSyncEvent.create({
        data: {
          estateId: ctx.estateId,
          securityOfficerId: ctx.securityOfficerId,
          deviceId,
          eventType,
          payload: { ...event } as any,
          status: 'SYNCED',
          occurredAt: new Date(event.occurredAt),
          clientEventId: event.clientEventId,
        },
      });

      await this.auditLogs.log({
        action: 'OFFLINE_EVENT_SYNCED',
        estateId: ctx.estateId,
        entity: 'Invitation',
        entityId: event.invitationId,
        metadata: {
          deviceId,
          decision: event.decision,
          method: event.method,
          occurredAt: event.occurredAt,
        },
      });

      return { clientEventId: event.clientEventId, status: 'SYNCED' };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      // A failed sync is still recorded (and still consumes the
      // idempotency key) — CLAUDE.md §26 "audited" applies to rejected
      // events too, and it stops the device from retrying forever an
      // event the server will never accept (e.g. a one-time invitation
      // someone else already used online while this device was offline).
      await this.prisma.offlineSyncEvent.create({
        data: {
          estateId: ctx.estateId,
          securityOfficerId: ctx.securityOfficerId,
          deviceId,
          eventType,
          payload: { ...event } as any,
          status: 'FAILED',
          errorMessage,
          occurredAt: new Date(event.occurredAt),
          clientEventId: event.clientEventId,
        },
      });

      this.logger.warn(`Offline sync event ${event.clientEventId} failed: ${errorMessage}`);

      return { clientEventId: event.clientEventId, status: 'FAILED', error: errorMessage };
    }
  }
}
