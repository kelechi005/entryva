'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { AppNotification } from '@/types/notification';

const POLL_INTERVAL_MS = 30_000;

/**
 * No WebSocket/push channel exists yet (see backend README — the
 * Notifications module is in-app/poll-based only for V1), so "live"
 * here means polling GET /notifications on an interval. Swapping this
 * for a socket subscription later shouldn't need to change anything
 * that consumes this hook.
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await apiFetch<AppNotification[]>('/notifications');
      setNotifications(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  const markRead = useCallback(async (id: string) => {
    // Optimistic update — a failed request just gets corrected on the
    // next poll rather than blocking the UI.
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)),
    );
    try {
      await apiFetch(`/notifications/${id}/read`, { method: 'PATCH' });
    } catch {
      refresh();
    }
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    try {
      await apiFetch('/notifications/read-all', { method: 'PATCH' });
    } catch {
      refresh();
    }
  }, [refresh]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return { notifications, unreadCount, loading, error, markRead, markAllRead, refresh };
}
