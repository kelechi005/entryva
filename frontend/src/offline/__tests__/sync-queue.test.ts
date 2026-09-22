import 'fake-indexeddb/auto';

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
  const syncQueueMod = require('../sync-queue') as typeof import('../sync-queue');
  const apiClient = require('@/lib/api-client') as { apiFetch: jest.Mock };
  return { db, ...syncQueueMod, apiFetch: apiClient.apiFetch };
}

describe('buildOfflineEvent', () => {
  it('generates a unique clientEventId per call', async () => {
    const { buildOfflineEvent } = await freshModules();
    const base = { invitationId: 'inv_1', decision: 'ALLOWED' as const, method: 'QR' as const };
    const a = buildOfflineEvent(base);
    const b = buildOfflineEvent(base);
    expect(a.clientEventId).not.toBe(b.clientEventId);
    expect(a.occurredAt).toBeTruthy();
  });
});

describe('flushOfflineQueue', () => {
  it('does nothing and makes no network call when the queue is empty', async () => {
    const { flushOfflineQueue, apiFetch } = await freshModules();
    const result = await flushOfflineQueue('device_1');
    expect(result).toEqual({ synced: 0, failed: [] });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('removes SYNCED and ALREADY_SYNCED events from the local queue and counts them as synced', async () => {
    const { db, enqueueOfflineEvent, flushOfflineQueue, apiFetch } = await freshModules();
    await enqueueOfflineEvent({
      clientEventId: 'evt_1',
      invitationId: 'inv_1',
      decision: 'ALLOWED',
      method: 'QR',
      occurredAt: new Date().toISOString(),
    });
    await enqueueOfflineEvent({
      clientEventId: 'evt_2',
      invitationId: 'inv_2',
      decision: 'DENIED',
      method: 'MANUAL_CODE',
      occurredAt: new Date().toISOString(),
    });

    apiFetch.mockResolvedValueOnce({
      results: [
        { clientEventId: 'evt_1', status: 'SYNCED' },
        { clientEventId: 'evt_2', status: 'ALREADY_SYNCED' },
      ],
    });

    const result = await flushOfflineQueue('device_1');
    expect(result.synced).toBe(2);
    expect(result.failed).toEqual([]);
    expect(await db.getQueuedEvents()).toEqual([]);

    // Sent as one batch, not two separate requests.
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [, init] = apiFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.deviceId).toBe('device_1');
    expect(body.events).toHaveLength(2);
  });

  it('removes FAILED events too (server permanently rejected them) but reports them back to the caller', async () => {
    const { db, enqueueOfflineEvent, flushOfflineQueue, apiFetch } = await freshModules();
    await enqueueOfflineEvent({
      clientEventId: 'evt_x',
      invitationId: 'inv_x',
      decision: 'ALLOWED',
      method: 'QR',
      occurredAt: new Date().toISOString(),
    });

    apiFetch.mockResolvedValueOnce({
      results: [{ clientEventId: 'evt_x', status: 'FAILED', error: 'invitation already consumed online' }],
    });

    const result = await flushOfflineQueue('device_1');
    expect(result.synced).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].clientEventId).toBe('evt_x');
    // Removed locally even though it failed — retrying would only fail again.
    expect(await db.getQueuedEvents()).toEqual([]);
  });
});

describe('pendingSyncCount', () => {
  it('reflects the number of queued, unsynced events', async () => {
    const { enqueueOfflineEvent, pendingSyncCount } = await freshModules();
    expect(await pendingSyncCount()).toBe(0);
    await enqueueOfflineEvent({
      clientEventId: 'evt_1',
      invitationId: 'inv_1',
      decision: 'ALLOWED',
      method: 'QR',
      occurredAt: new Date().toISOString(),
    });
    expect(await pendingSyncCount()).toBe(1);
  });
});
