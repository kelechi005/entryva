import 'fake-indexeddb/auto';
import { generateTestKeyPair, signEntry } from '@/test-utils/offline-signing';
import type { OfflineManifestEntry } from '../manifest-types';

async function freshModules() {
  const dbMod = require('../db') as typeof import('../db');
  await dbMod.__resetDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('estate-visitor-offline');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
  jest.resetModules();
  const db = require('../db') as typeof import('../db');
  const verifyOfflineMod = require('../verify-offline') as typeof import('../verify-offline');
  return { db, verifyOffline: verifyOfflineMod.verifyOffline };
}

const NOW = Date.now();

function baseEntry(overrides: Partial<OfflineManifestEntry> = {}): OfflineManifestEntry {
  return {
    invitationId: 'inv_1',
    secureTokenHash: '',
    displayCodeHash: '',
    visitorName: 'Jane Visitor',
    residentName: 'Res Ident',
    residentPhone: '+2348000000000',
    apartmentLabel: 'B-204',
    validFrom: new Date(NOW - 60_000).toISOString(),
    validUntil: new Date(NOW + 60_000).toISOString(),
    entryPolicy: 'ONE_TIME',
    status: 'ACTIVE',
    issuedAt: new Date(NOW - 120_000).toISOString(),
    ...overrides,
  };
}

async function seedEntry(
  db: typeof import('../db'),
  privateKeyPem: string,
  publicKeyPem: string,
  overrides: Partial<OfflineManifestEntry> = {},
) {
  const { sha256Hex } = require('../crypto') as typeof import('../crypto');
  const rawToken = overrides.secureTokenHash ? undefined : 'raw-token-value';
  const rawCode = overrides.displayCodeHash ? undefined : 'CODE123';
  const secureTokenHash = overrides.secureTokenHash ?? (await sha256Hex(rawToken!));
  const displayCodeHash = overrides.displayCodeHash ?? (await sha256Hex(rawCode!));
  const unsigned = baseEntry({ ...overrides, secureTokenHash, displayCodeHash });
  const signed = signEntry(unsigned as unknown as Record<string, unknown>, privateKeyPem) as unknown as typeof unsigned & {
    signature: string;
  };
  await db.replaceManifest([signed], publicKeyPem, new Date().toISOString());
  return { rawToken, rawCode, entry: signed };
}

describe('verifyOffline', () => {
  it('reports NOT_FOUND when no manifest has ever synced (no public key cached)', async () => {
    const { verifyOffline } = await freshModules();
    const result = await verifyOffline('anything', 'QR');
    expect(result).toEqual({ outcome: 'NOT_FOUND', offline: true });
  });

  it('reports NOT_FOUND for a QR token with no matching cached entry', async () => {
    const { db, verifyOffline } = await freshModules();
    const { publicKeyPem } = generateTestKeyPair();
    await db.replaceManifest([], publicKeyPem, new Date().toISOString());
    const result = await verifyOffline('unknown-token', 'QR');
    expect(result.outcome).toBe('NOT_FOUND');
  });

  it('resolves VALID for a currently-active, correctly signed entry via QR', async () => {
    const { db, verifyOffline } = await freshModules();
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    const { rawToken } = await seedEntry(db, privateKeyPem, publicKeyPem);

    const result = await verifyOffline(rawToken!, 'QR');
    expect(result.outcome).toBe('VALID');
    expect(result.invitation?.invitationId).toBe('inv_1');
    expect(result.offline).toBe(true);
  });

  it('resolves VALID via manual code, case-insensitively', async () => {
    const { db, verifyOffline } = await freshModules();
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    const { rawCode } = await seedEntry(db, privateKeyPem, publicKeyPem);

    const result = await verifyOffline(rawCode!.toLowerCase(), 'MANUAL_CODE');
    expect(result.outcome).toBe('VALID');
  });

  it('resolves EXPIRED when validUntil is in the past', async () => {
    const { db, verifyOffline } = await freshModules();
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    const { rawToken } = await seedEntry(db, privateKeyPem, publicKeyPem, {
      validFrom: new Date(NOW - 200_000).toISOString(),
      validUntil: new Date(NOW - 100_000).toISOString(),
    });

    const result = await verifyOffline(rawToken!, 'QR');
    expect(result.outcome).toBe('EXPIRED');
  });

  it('resolves NOT_YET_VALID when validFrom is in the future', async () => {
    const { db, verifyOffline } = await freshModules();
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    const { rawToken } = await seedEntry(db, privateKeyPem, publicKeyPem, {
      validFrom: new Date(NOW + 100_000).toISOString(),
      validUntil: new Date(NOW + 200_000).toISOString(),
    });

    const result = await verifyOffline(rawToken!, 'QR');
    expect(result.outcome).toBe('NOT_YET_VALID');
  });

  it.each(['REVOKED', 'CANCELLED'])('resolves REVOKED for status=%s', async (status) => {
    const { db, verifyOffline } = await freshModules();
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    const { rawToken } = await seedEntry(db, privateKeyPem, publicKeyPem, { status });

    const result = await verifyOffline(rawToken!, 'QR');
    expect(result.outcome).toBe('REVOKED');
  });

  it('resolves ALREADY_USED for a ONE_TIME invitation already marked USED in the manifest', async () => {
    const { db, verifyOffline } = await freshModules();
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    const { rawToken } = await seedEntry(db, privateKeyPem, publicKeyPem, {
      entryPolicy: 'ONE_TIME',
      status: 'USED',
    });

    const result = await verifyOffline(rawToken!, 'QR');
    expect(result.outcome).toBe('ALREADY_USED');
  });

  it('resolves ALREADY_USED for a ONE_TIME invitation allowed once already, offline, in this session', async () => {
    const { db, verifyOffline } = await freshModules();
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    const { rawToken } = await seedEntry(db, privateKeyPem, publicKeyPem, { entryPolicy: 'ONE_TIME' });

    // First scan: still VALID (status in manifest is still ACTIVE).
    const first = await verifyOffline(rawToken!, 'QR');
    expect(first.outcome).toBe('VALID');

    // Officer allows entry -> gate page enqueues an ALLOWED offline event.
    await db.enqueueEvent({
      clientEventId: 'evt_1',
      invitationId: 'inv_1',
      decision: 'ALLOWED',
      method: 'QR',
      occurredAt: new Date().toISOString(),
    });

    // Second scan, still offline, same device: must not say VALID again.
    const second = await verifyOffline(rawToken!, 'QR');
    expect(second.outcome).toBe('ALREADY_USED');
  });

  it('allows repeated VALID scans for a MULTI_ENTRY invitation even after a queued ALLOWED', async () => {
    const { db, verifyOffline } = await freshModules();
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    const { rawToken } = await seedEntry(db, privateKeyPem, publicKeyPem, { entryPolicy: 'MULTI_ENTRY' });

    await db.enqueueEvent({
      clientEventId: 'evt_1',
      invitationId: 'inv_1',
      decision: 'ALLOWED',
      method: 'QR',
      occurredAt: new Date().toISOString(),
    });

    const result = await verifyOffline(rawToken!, 'QR');
    expect(result.outcome).toBe('VALID');
  });

  it('treats a tampered cached entry (edited directly in IndexedDB) as NOT_FOUND, not VALID', async () => {
    const { db, verifyOffline } = await freshModules();
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    const { entry } = await seedEntry(db, privateKeyPem, publicKeyPem, { status: 'REVOKED' });

    // Simulate someone editing IndexedDB directly (e.g. via devtools) to
    // flip a REVOKED invitation back to ACTIVE without a valid signature
    // for the new content.
    const tampered = { ...entry, status: 'ACTIVE' };
    await db.replaceManifest([tampered], publicKeyPem, new Date().toISOString());

    const rawToken = 'raw-token-value';
    const result = await verifyOffline(rawToken, 'QR');
    expect(result.outcome).toBe('NOT_FOUND');
  });

  it('rejects an entry signed with a different key than the one currently cached as trusted', async () => {
    const { db, verifyOffline } = await freshModules();
    const attackerKeys = generateTestKeyPair();
    const realServerKeys = generateTestKeyPair();

    // Manifest metadata says "trust realServerKeys.publicKeyPem", but the
    // entry itself was signed by a different (attacker) key.
    const { entry } = await seedEntry(db, attackerKeys.privateKeyPem, realServerKeys.publicKeyPem);
    await db.replaceManifest([entry], realServerKeys.publicKeyPem, new Date().toISOString());

    const result = await verifyOffline('raw-token-value', 'QR');
    expect(result.outcome).toBe('NOT_FOUND');
  });
});
