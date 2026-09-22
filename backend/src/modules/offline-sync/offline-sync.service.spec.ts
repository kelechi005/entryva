import { generateKeyPairSync } from 'crypto';

// OfflineSyncService signs manifest entries via signing.util's real crypto
// (not injected), so a real keypair must exist before it's exercised.
const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
process.env.OFFLINE_SIGNING_PRIVATE_KEY_B64 = Buffer.from(privateKey).toString('base64');
process.env.OFFLINE_SIGNING_PUBLIC_KEY_B64 = Buffer.from(publicKey).toString('base64');

import { OfflineSyncService } from './offline-sync.service';
import { verifyOfflineManifestEntrySignature, canonicalizeForSigning } from '../../common/crypto/signing.util';
import type { SecurityContext } from '../verification/verification.service';

function makeCtx(overrides: Partial<SecurityContext> = {}): SecurityContext {
  return { securityOfficerId: 'officer-1', estateId: 'estate-1', ...overrides };
}

describe('OfflineSyncService', () => {
  let prisma: any;
  let auditLogs: any;
  let entryExit: any;
  let service: OfflineSyncService;

  beforeEach(() => {
    prisma = {
      invitation: { findMany: jest.fn().mockResolvedValue([]) },
      offlineSyncEvent: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({}) },
    };
    auditLogs = { log: jest.fn().mockResolvedValue(undefined) };
    entryExit = { recordEntry: jest.fn(), denyEntry: jest.fn() };
    service = new OfflineSyncService(prisma, auditLogs, entryExit);
  });

  describe('getManifest', () => {
    it('scopes cached invitations to the officer\'s own estate and unexpired only', async () => {
      await service.getManifest(makeCtx({ estateId: 'estate-9' }));
      expect(prisma.invitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            estateId: 'estate-9',
            validUntil: { gte: expect.any(Date) },
          }),
        }),
      );
    });

    it('never includes plaintext tokens/codes — only their hashes', async () => {
      prisma.invitation.findMany.mockResolvedValue([
        {
          id: 'inv1',
          secureTokenHash: 'hash-of-token',
          displayCodeHash: 'hash-of-code',
          visitor: { fullName: 'Vic' },
          resident: { displayName: 'Rita', phone: '+123' },
          apartment: { flatNumber: 'B-204' },
          validFrom: new Date(),
          validUntil: new Date(Date.now() + 60_000),
          entryPolicy: 'ONE_TIME',
          status: 'ACTIVE',
        },
      ]);

      const manifest = await service.getManifest(makeCtx());

      expect(manifest.entries).toHaveLength(1);
      const entry = manifest.entries[0];
      expect(entry.secureTokenHash).toBe('hash-of-token');
      expect(entry.displayCodeHash).toBe('hash-of-code');
      // No field on the entry should ever be the plaintext secret.
      expect(Object.values(entry)).not.toContain('token');
    });

    it('signs every entry so a device can detect local tampering (CLAUDE.md §25)', async () => {
      prisma.invitation.findMany.mockResolvedValue([
        {
          id: 'inv1',
          secureTokenHash: 'hash-of-token',
          displayCodeHash: 'hash-of-code',
          visitor: { fullName: 'Vic' },
          resident: { displayName: 'Rita', phone: null },
          apartment: { flatNumber: 'B-204' },
          validFrom: new Date(),
          validUntil: new Date(Date.now() + 60_000),
          entryPolicy: 'ONE_TIME',
          status: 'ACTIVE',
        },
      ]);

      const manifest = await service.getManifest(makeCtx());
      const { signature, ...unsigned } = manifest.entries[0];

      expect(verifyOfflineManifestEntrySignature(canonicalizeForSigning(unsigned), signature)).toBe(
        true,
      );
    });

    it('a tampered field (e.g. status ACTIVE -> flipped after caching) fails signature verification', async () => {
      prisma.invitation.findMany.mockResolvedValue([
        {
          id: 'inv1',
          secureTokenHash: 'hash-of-token',
          displayCodeHash: 'hash-of-code',
          visitor: { fullName: 'Vic' },
          resident: { displayName: 'Rita', phone: null },
          apartment: { flatNumber: 'B-204' },
          validFrom: new Date(),
          validUntil: new Date(Date.now() + 60_000),
          entryPolicy: 'ONE_TIME',
          status: 'USED',
        },
      ]);

      const manifest = await service.getManifest(makeCtx());
      const { signature, ...unsigned } = manifest.entries[0];
      const tampered = { ...unsigned, status: 'ACTIVE' };

      expect(verifyOfflineManifestEntrySignature(canonicalizeForSigning(tampered), signature)).toBe(
        false,
      );
    });
  });

  describe('syncBatch idempotency (CLAUDE.md §26)', () => {
    const baseEvent = {
      clientEventId: 'client-evt-1',
      invitationId: 'inv1',
      decision: 'ALLOWED' as const,
      method: 'QR' as const,
      occurredAt: new Date().toISOString(),
    };

    it('processes a new event by delegating to EntryExitService.recordEntry through the same ctx', async () => {
      prisma.offlineSyncEvent.findUnique.mockResolvedValue(null);
      entryExit.recordEntry.mockResolvedValue({ visitId: 'v1', enteredAt: new Date() });
      const ctx = makeCtx();

      const { results } = await service.syncBatch(ctx, { deviceId: 'dev1', events: [baseEvent] });

      expect(entryExit.recordEntry).toHaveBeenCalledWith(ctx, {
        invitationId: 'inv1',
      });
      expect(results[0]).toEqual({ clientEventId: 'client-evt-1', status: 'SYNCED' });
    });

    it('returns ALREADY_SYNCED without reprocessing a retried clientEventId', async () => {
      prisma.offlineSyncEvent.findUnique.mockResolvedValue({
        clientEventId: 'client-evt-1',
        status: 'SYNCED',
      });

      const { results } = await service.syncBatch(makeCtx(), {
        deviceId: 'dev1',
        events: [baseEvent],
      });

      expect(entryExit.recordEntry).not.toHaveBeenCalled();
      expect(results[0]).toEqual({
        clientEventId: 'client-evt-1',
        status: 'ALREADY_SYNCED',
        priorStatus: 'SYNCED',
      });
    });

    it('records (and does not throw out of) a FAILED sync — e.g. a one-time invitation already used online', async () => {
      prisma.offlineSyncEvent.findUnique.mockResolvedValue(null);
      entryExit.recordEntry.mockRejectedValue(new Error('This one-time invitation has already been used.'));

      const { results } = await service.syncBatch(makeCtx(), {
        deviceId: 'dev1',
        events: [baseEvent],
      });

      expect(results[0]).toEqual({
        clientEventId: 'client-evt-1',
        status: 'FAILED',
        error: 'This one-time invitation has already been used.',
      });
      expect(prisma.offlineSyncEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
      );
    });

    it('processes each event independently — one FAILED event does not block the rest of the batch', async () => {
      prisma.offlineSyncEvent.findUnique.mockResolvedValue(null);
      entryExit.recordEntry
        .mockRejectedValueOnce(new Error('conflict'))
        .mockResolvedValueOnce({ visitId: 'v2', enteredAt: new Date() });

      const secondEvent = { ...baseEvent, clientEventId: 'client-evt-2', invitationId: 'inv2' };

      const { results } = await service.syncBatch(makeCtx(), {
        deviceId: 'dev1',
        events: [baseEvent, secondEvent],
      });

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('FAILED');
      expect(results[1].status).toBe('SYNCED');
    });

    it('routes a DENIED decision to denyEntry, not recordEntry', async () => {
      prisma.offlineSyncEvent.findUnique.mockResolvedValue(null);
      entryExit.denyEntry.mockResolvedValue(undefined);
      const deniedEvent = { ...baseEvent, decision: 'DENIED' as const, reason: 'no ID' };

      await service.syncBatch(makeCtx(), { deviceId: 'dev1', events: [deniedEvent] });

      expect(entryExit.denyEntry).toHaveBeenCalledWith(expect.any(Object), {
        invitationId: 'inv1',
        reason: 'no ID',
      });
      expect(entryExit.recordEntry).not.toHaveBeenCalled();
    });
  });
});
