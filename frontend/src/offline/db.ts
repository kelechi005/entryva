// CLAUDE.md §3 ("Client-side offline storage: IndexedDB, Service
// Worker/PWA caching, a deliberate synchronization queue") and §25/§26.
// Thin wrapper around `idb` (already a declared dependency) — two
// object stores:
//
//   manifest  — the signed invitation cache from GET /offline-sync/manifest,
//               keyed by invitationId. Replaced wholesale on every
//               successful refresh (see manifest.ts) rather than merged,
//               so an invitation the server no longer lists (revoked,
//               deleted, expired) simply disappears on next sync — the
//               closest an offline device can get to "learning" about a
//               revocation it missed while disconnected.
//   syncQueue — offline ALLOWED/DENIED decisions waiting to be reported
//               back to the server, keyed by clientEventId (the
//               idempotency key). Also consulted locally so a repeat
//               scan of a ONE_TIME invitation while still offline
//               correctly reports ALREADY_USED instead of VALID again.
//   meta      — small key/value store: the manifest's public key (PEM)
//               and issuedAt, so a cold app load can verify cached
//               entries without a network round trip.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SignedOfflineManifestEntry } from './manifest-types';
import type { OfflineVerificationEvent } from './sync-queue';

interface OfflineDBSchema extends DBSchema {
  manifest: {
    key: string; // invitationId
    value: SignedOfflineManifestEntry;
  };
  syncQueue: {
    key: string; // clientEventId
    value: OfflineVerificationEvent;
  };
  meta: {
    key: string;
    value: string;
  };
}

const DB_NAME = 'estate-visitor-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<OfflineDBSchema>> | null = null;

/** Test-only escape hatch: closes the cached connection and clears the
 * module-level promise so a fresh openDB() call (and, if the caller also
 * deletes the underlying database) starts from a clean slate. Never
 * called from application code — production never needs to reconnect,
 * it just keeps the one connection for the life of the tab. */
export async function __resetDbForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
}

function getDb(): Promise<IDBPDatabase<OfflineDBSchema>> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment.'));
  }
  if (!dbPromise) {
    dbPromise = openDB<OfflineDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('manifest')) {
          db.createObjectStore('manifest', { keyPath: 'invitationId' });
        }
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'clientEventId' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta');
        }
      },
    });
  }
  return dbPromise;
}

// --- manifest -----------------------------------------------------------

export async function replaceManifest(
  entries: SignedOfflineManifestEntry[],
  publicKeyPem: string,
  issuedAt: string,
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['manifest', 'meta'], 'readwrite');
  await tx.objectStore('manifest').clear();
  for (const entry of entries) {
    await tx.objectStore('manifest').put(entry);
  }
  await tx.objectStore('meta').put(publicKeyPem, 'publicKey');
  await tx.objectStore('meta').put(issuedAt, 'issuedAt');
  await tx.done;
}

export async function getAllManifestEntries(): Promise<SignedOfflineManifestEntry[]> {
  const db = await getDb();
  return db.getAll('manifest');
}

export async function getManifestMeta(): Promise<{
  publicKeyPem: string | null;
  issuedAt: string | null;
}> {
  const db = await getDb();
  const [publicKeyPem, issuedAt] = await Promise.all([
    db.get('meta', 'publicKey'),
    db.get('meta', 'issuedAt'),
  ]);
  return { publicKeyPem: publicKeyPem ?? null, issuedAt: issuedAt ?? null };
}

// --- sync queue -----------------------------------------------------------

export async function enqueueEvent(event: OfflineVerificationEvent): Promise<void> {
  const db = await getDb();
  await db.put('syncQueue', event);
}

export async function getQueuedEvents(): Promise<OfflineVerificationEvent[]> {
  const db = await getDb();
  return db.getAll('syncQueue');
}

export async function removeQueuedEvent(clientEventId: string): Promise<void> {
  const db = await getDb();
  await db.delete('syncQueue', clientEventId);
}

/** Has this device already recorded an ALLOWED decision for this
 * invitation while offline? Used so a second scan of the same ONE_TIME
 * invitation, still offline, reports ALREADY_USED locally instead of
 * VALID a second time. */
export async function hasQueuedAllow(invitationId: string): Promise<boolean> {
  const events = await getQueuedEvents();
  return events.some((e) => e.invitationId === invitationId && e.decision === 'ALLOWED');
}
