import 'fake-indexeddb/auto';
import { generateTestKeyPair, signEntry } from '@/test-utils/offline-signing';
import type { OfflineManifestEntry } from '../manifest-types';

jest.mock('@/lib/api-client', () => ({ apiFetch: jest.fn() }));

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
  const manifestMod = require('../manifest') as typeof import('../manifest');
  const apiClient = require('@/lib/api-client') as { apiFetch: jest.Mock };
  return { db, refreshManifest: manifestMod.refreshManifest, apiFetch: apiClient.apiFetch };
}

function unsignedEntry(overrides: Partial<OfflineManifestEntry> = {}): OfflineManifestEntry {
  return {
    invitationId: 'inv_1',
    secureTokenHash: 'hash-a',
    displayCodeHash: 'hash-b',
    visitorName: 'Jane Visitor',
    residentName: 'Res Ident',
    residentPhone: null,
    apartmentLabel: 'B-204',
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 3_600_000).toISOString(),
    entryPolicy: 'ONE_TIME',
    status: 'ACTIVE',
    issuedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('refreshManifest', () => {
  it('caches every entry that verifies against the published public key', async () => {
    const { db, refreshManifest, apiFetch } = await freshModules();
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    const good1 = signEntry(unsignedEntry({ invitationId: 'inv_1' }) as unknown as Record<string, unknown>, privateKeyPem);
    const good2 = signEntry(unsignedEntry({ invitationId: 'inv_2' }) as unknown as Record<string, unknown>, privateKeyPem);

    apiFetch.mockResolvedValueOnce({
      issuedAt: '2026-01-01T00:00:00.000Z',
      publicKey: publicKeyPem,
      entries: [good1, good2],
    });

    const result = await refreshManifest();
    expect(result).toEqual({ cached: 2, rejected: 0, issuedAt: '2026-01-01T00:00:00.000Z' });

    const cached = await db.getAllManifestEntries();
    expect(cached.map((e) => e.invitationId).sort()).toEqual(['inv_1', 'inv_2']);
  });

  it('drops entries whose signature does not verify, without caching them', async () => {
    const { db, refreshManifest, apiFetch } = await freshModules();
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    const good = signEntry(unsignedEntry({ invitationId: 'inv_good' }) as unknown as Record<string, unknown>, privateKeyPem);
    const bad = signEntry(unsignedEntry({ invitationId: 'inv_bad' }) as unknown as Record<string, unknown>, privateKeyPem);
    // Corrupt the payload post-signing, as if the response were tampered
    // with in transit or by a malicious intermediary.
    (bad as any).status = 'REVOKED_BUT_NOT_REALLY';

    apiFetch.mockResolvedValueOnce({
      issuedAt: '2026-01-01T00:00:00.000Z',
      publicKey: publicKeyPem,
      entries: [good, bad],
    });

    const result = await refreshManifest();
    expect(result.cached).toBe(1);
    expect(result.rejected).toBe(1);

    const cached = await db.getAllManifestEntries();
    expect(cached.map((e) => e.invitationId)).toEqual(['inv_good']);
  });

  it('replaces the previous cache wholesale even if the new fetch returns fewer entries', async () => {
    const { db, refreshManifest, apiFetch } = await freshModules();
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    const entryA = signEntry(unsignedEntry({ invitationId: 'inv_a' }) as unknown as Record<string, unknown>, privateKeyPem);
    const entryB = signEntry(unsignedEntry({ invitationId: 'inv_b' }) as unknown as Record<string, unknown>, privateKeyPem);

    apiFetch.mockResolvedValueOnce({ issuedAt: 't1', publicKey: publicKeyPem, entries: [entryA, entryB] });
    await refreshManifest();

    apiFetch.mockResolvedValueOnce({ issuedAt: 't2', publicKey: publicKeyPem, entries: [entryA] });
    await refreshManifest();

    const cached = await db.getAllManifestEntries();
    expect(cached.map((e) => e.invitationId)).toEqual(['inv_a']);
  });
});
