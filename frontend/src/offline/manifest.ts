// Fetches the signed invitation manifest (CLAUDE.md §25) while online and
// caches it for offline use. Every entry's signature is checked against
// the server's public key *before* it's ever written to IndexedDB — an
// entry that fails verification here is dropped rather than cached, so a
// corrupted or tampered response can't poison the offline store in the
// first place. (verify-offline.ts re-checks the signature again on every
// read, since IndexedDB itself isn't trusted storage — this first check
// is just to avoid caching garbage at all.)

import { apiFetch } from '@/lib/api-client';
import { importOfflinePublicKey, verifyManifestEntry } from './crypto';
import { replaceManifest } from './db';
import type { ManifestResponse, SignedOfflineManifestEntry } from './manifest-types';

export interface ManifestRefreshResult {
  cached: number;
  rejected: number;
  issuedAt: string;
}

export async function refreshManifest(): Promise<ManifestRefreshResult> {
  const response = await apiFetch<ManifestResponse>('/offline-sync/manifest');
  const publicKey = await importOfflinePublicKey(response.publicKey);

  const verified: SignedOfflineManifestEntry[] = [];
  let rejected = 0;

  for (const entry of response.entries) {
    const { signature, ...unsigned } = entry;
    // eslint-disable-next-line no-await-in-loop
    const ok = await verifyManifestEntry(unsigned, signature, publicKey);
    if (ok) {
      verified.push(entry);
    } else {
      rejected += 1;
    }
  }

  await replaceManifest(verified, response.publicKey, response.issuedAt);

  return { cached: verified.length, rejected, issuedAt: response.issuedAt };
}
