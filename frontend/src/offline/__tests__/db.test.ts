import 'fake-indexeddb/auto';
import type { SignedOfflineManifestEntry } from '../manifest-types';
import type { OfflineVerificationEvent } from '../sync-queue';

// db.ts caches its IndexedDB connection in a module-scoped `dbPromise`, and
// fake-indexeddb persists the actual database across a whole test file. To
// keep each test independent (matching how a real device would only ever
// have one live app instance, not leftover state from a previous test), we
// delete the underlying database and re-import a fresh copy of db.ts before
// every test.
async function freshDb() {
  const current = require('../db') as typeof import('../db');
  // Close any connection left open by a previous test *before* deleting —
  // IndexedDB's deleteDatabase blocks forever waiting for open connections
  // to close, it doesn't force them shut.
  await current.__resetDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('estate-visitor-offline');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
  jest.resetModules();
  return require('../db') as typeof import('../db');
}

function makeEntry(overrides: Partial<SignedOfflineManifestEntry> = {}): SignedOfflineManifestEntry {
  return {
    invitationId: 'inv_1',
    secureTokenHash: 'token-hash',
    displayCodeHash: 'code-hash',
    visitorName: 'Jane Visitor',
    residentName: 'Res Ident',
    residentPhone: '+2348000000000',
    apartmentLabel: 'B-204',
    validFrom: new Date(Date.now() - 60_000).toISOString(),
    validUntil: new Date(Date.now() + 60_000).toISOString(),
    entryPolicy: 'ONE_TIME',
    status: 'ACTIVE',
    issuedAt: new Date().toISOString(),
    signature: 'sig',
    ...overrides,
  };
}

function makeEvent(overrides: Partial<OfflineVerificationEvent> = {}): OfflineVerificationEvent {
  return {
    clientEventId: 'evt_1',
    invitationId: 'inv_1',
    decision: 'ALLOWED',
    method: 'QR',
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('offline db — manifest store', () => {
  it('replaceManifest stores entries and meta together', async () => {
    const db = await freshDb();
    const entry = makeEntry();
    await db.replaceManifest([entry], 'PEM_PUBLIC_KEY', '2026-01-01T00:00:00.000Z');

    const all = await db.getAllManifestEntries();
    expect(all).toHaveLength(1);
    expect(all[0].invitationId).toBe('inv_1');

    const meta = await db.getManifestMeta();
    expect(meta.publicKeyPem).toBe('PEM_PUBLIC_KEY');
    expect(meta.issuedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('replaceManifest wholesale-replaces rather than merging — a dropped invitation disappears', async () => {
    const db = await freshDb();
    await db.replaceManifest(
      [makeEntry({ invitationId: 'inv_1' }), makeEntry({ invitationId: 'inv_2' })],
      'KEY',
      'a',
    );
    let all = await db.getAllManifestEntries();
    expect(all.map((e) => e.invitationId).sort()).toEqual(['inv_1', 'inv_2']);

    // Server no longer lists inv_2 (revoked/expired/deleted) on next sync.
    await db.replaceManifest([makeEntry({ invitationId: 'inv_1' })], 'KEY', 'b');
    all = await db.getAllManifestEntries();
    expect(all.map((e) => e.invitationId)).toEqual(['inv_1']);
  });

  it('getManifestMeta returns nulls before any manifest has been cached', async () => {
    const db = await freshDb();
    const meta = await db.getManifestMeta();
    expect(meta.publicKeyPem).toBeNull();
    expect(meta.issuedAt).toBeNull();
  });
});

describe('offline db — sync queue', () => {
  it('enqueues and lists events', async () => {
    const db = await freshDb();
    await db.enqueueEvent(makeEvent());
    const queued = await db.getQueuedEvents();
    expect(queued).toHaveLength(1);
    expect(queued[0].clientEventId).toBe('evt_1');
  });

  it('removes an event by clientEventId', async () => {
    const db = await freshDb();
    await db.enqueueEvent(makeEvent({ clientEventId: 'evt_a' }));
    await db.enqueueEvent(makeEvent({ clientEventId: 'evt_b' }));
    await db.removeQueuedEvent('evt_a');
    const queued = await db.getQueuedEvents();
    expect(queued.map((e) => e.clientEventId)).toEqual(['evt_b']);
  });

  it('hasQueuedAllow is true only for a queued ALLOWED decision on that invitation', async () => {
    const db = await freshDb();
    await db.enqueueEvent(makeEvent({ clientEventId: 'evt_deny', invitationId: 'inv_x', decision: 'DENIED' }));
    expect(await db.hasQueuedAllow('inv_x')).toBe(false);

    await db.enqueueEvent(makeEvent({ clientEventId: 'evt_allow', invitationId: 'inv_x', decision: 'ALLOWED' }));
    expect(await db.hasQueuedAllow('inv_x')).toBe(true);

    // Different invitation, unaffected.
    expect(await db.hasQueuedAllow('inv_y')).toBe(false);
  });

  it('re-queuing the same clientEventId overwrites rather than duplicates (put semantics)', async () => {
    const db = await freshDb();
    await db.enqueueEvent(makeEvent({ clientEventId: 'evt_1', decision: 'ALLOWED' }));
    await db.enqueueEvent(makeEvent({ clientEventId: 'evt_1', decision: 'DENIED' }));
    const queued = await db.getQueuedEvents();
    expect(queued).toHaveLength(1);
    expect(queued[0].decision).toBe('DENIED');
  });
});
