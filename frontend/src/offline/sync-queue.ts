// Deliberate synchronization queue for offline verification at the gate
// (CLAUDE.md §26). A decision made while offline (allow/deny) is written
// here immediately, with a client-generated idempotency key, then
// flushed to POST /api/offline-sync once connectivity returns. The
// server treats a retried clientEventId as a no-op, so flushing is safe
// to call opportunistically and repeatedly (on an 'online' event, on
// interval, on next successful online scan) without risking duplicates.

import { apiFetch } from '@/lib/api-client';
import { enqueueEvent, getQueuedEvents, removeQueuedEvent } from './db';

export interface OfflineVerificationEvent {
  clientEventId: string; // idempotency key
  invitationId: string;
  decision: 'ALLOWED' | 'DENIED';
  method: 'QR' | 'MANUAL_CODE';
  occurredAt: string; // ISO timestamp, device clock
  reason?: string;
}

function generateClientEventId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Fallback for older browsers without crypto.randomUUID.
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function buildOfflineEvent(
  input: Omit<OfflineVerificationEvent, 'clientEventId' | 'occurredAt'>,
): OfflineVerificationEvent {
  return {
    ...input,
    clientEventId: generateClientEventId(),
    occurredAt: new Date().toISOString(),
  };
}

export async function enqueueOfflineEvent(event: OfflineVerificationEvent): Promise<void> {
  await enqueueEvent(event);
}

interface SyncBatchResult {
  clientEventId: string;
  status: 'SYNCED' | 'ALREADY_SYNCED' | 'FAILED';
  error?: string;
}

/**
 * Sends every queued event to the server in one batch. Successfully
 * processed events (SYNCED or ALREADY_SYNCED) are removed from the local
 * queue. FAILED events are also removed — the server has permanently
 * rejected them (e.g. the invitation was consumed online in the
 * meantime) and retrying would only ever fail again — but the caller
 * gets the failure list back so the UI can surface it rather than
 * silently dropping it.
 */
export async function flushOfflineQueue(deviceId: string): Promise<{
  synced: number;
  failed: SyncBatchResult[];
}> {
  const queued = await getQueuedEvents();
  if (queued.length === 0) return { synced: 0, failed: [] };

  const { results } = await apiFetch<{ results: SyncBatchResult[] }>('/offline-sync', {
    method: 'POST',
    body: JSON.stringify({ deviceId, events: queued }),
  });

  const failed: SyncBatchResult[] = [];
  let synced = 0;
  for (const result of results) {
    await removeQueuedEvent(result.clientEventId);
    if (result.status === 'FAILED') {
      failed.push(result);
    } else {
      synced += 1;
    }
  }
  return { synced, failed };
}

export async function pendingSyncCount(): Promise<number> {
  const queued = await getQueuedEvents();
  return queued.length;
}
