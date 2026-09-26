'use client';

// Sits alongside useCallManager (voice) rather than inside it -- messaging
// and calling are two features that happen to share one authenticated
// socket connection (see CallManager.socket), not one feature. Sending a
// message goes through REST (apiFetch), not the socket: a message must
// be durably saved even if the recipient is offline right now, so REST
// (backed by the database, see MessagesController) is the source of
// truth. The socket is used only to hear about messages that arrive
// *while this hook is mounted* -- 'message:new' -- so the thread list and
// an open thread update live without polling.

import { useCallback, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { apiFetch } from '@/lib/api-client';
import type { OfficerMessage, ThreadSummary } from '@/types/messaging';

export function useThreadSummaries(socket: Socket | null, ownUserId: string | null) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    apiFetch<ThreadSummary[]>('/messages/threads')
      .then(setThreads)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // A live message bumps that officer's row to the top with the new
  // preview and an incremented unread count, the same way a real chat
  // app's conversation list behaves -- without this, the list would only
  // ever update on next page load.
  useEffect(() => {
    if (!socket) return;
    function handleNew(message: OfficerMessage) {
      const otherUserId = message.fromUserId === ownUserId ? message.toUserId : message.fromUserId;
      setThreads((prev) => {
        const idx = prev.findIndex((t) => t.officer.userId === otherUserId);
        if (idx === -1) return prev; // officer not in our estate's list (shouldn't happen) -- ignore rather than guess their name
        const updated: ThreadSummary = {
          ...prev[idx],
          lastMessage: message,
          unreadCount: message.fromUserId === ownUserId ? prev[idx].unreadCount : prev[idx].unreadCount + 1,
        };
        return [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
    }
    socket.on('message:new', handleNew);
    return () => {
      socket.off('message:new', handleNew);
    };
  }, [socket, ownUserId]);

  return { threads, loading, reload };
}

export function useThread(socket: Socket | null, ownUserId: string | null, otherUserId: string) {
  const [messages, setMessages] = useState<OfficerMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<OfficerMessage[]>(`/messages/thread/${otherUserId}`)
      .then((history) => {
        if (cancelled) return;
        // Backend returns newest-first (pagination order); the thread
        // itself reads top-to-bottom oldest-first, same as every chat UI.
        setMessages([...history].reverse());
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    apiFetch(`/messages/thread/${otherUserId}/read`, { method: 'POST' }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [otherUserId]);

  useEffect(() => {
    if (!socket) return;
    function handleNew(message: OfficerMessage) {
      const belongsHere =
        (message.fromUserId === otherUserId && message.toUserId === ownUserId) ||
        (message.fromUserId === ownUserId && message.toUserId === otherUserId);
      if (!belongsHere) return;
      setMessages((prev) => [...prev, message]);
      if (message.fromUserId === otherUserId) {
        apiFetch(`/messages/thread/${otherUserId}/read`, { method: 'POST' }).catch(() => undefined);
      }
    }
    socket.on('message:new', handleNew);
    return () => {
      socket.off('message:new', handleNew);
    };
  }, [socket, ownUserId, otherUserId]);

  const send = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return;
      setSending(true);
      try {
        const message = await apiFetch<OfficerMessage>(`/messages/thread/${otherUserId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: trimmed }),
        });
        // Optimistic-enough: the REST call already round-tripped, so this
        // is the server's real record (real id/createdAt), not a guess --
        // append directly rather than waiting for our own 'message:new'
        // (the backend only pushes that to the *recipient*, not back to
        // the sender's own other sockets/tabs).
        setMessages((prev) => [...prev, message]);
      } finally {
        setSending(false);
      }
    },
    [otherUserId],
  );

  return { messages, loading, sending, send };
}
