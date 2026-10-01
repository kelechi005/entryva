'use client';

// Lets a visitor choose to show the person who invited them where they are
// on the way to the gate. Nothing is sent until they tap the button. It
// sends only the latest point every few seconds, stops when they arrive or
// press Stop, and the server deletes the stored point.
// It uses the same position feed as the map and the voice guidance.

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { NavPhase, VisitorPosition } from '@/hooks/useVisitorNavigation';
import { MAX_SHARE_ACCURACY_M, SEND_EVERY_MS, nextHeading } from '@/lib/live-share';
import type { LngLat } from '@/lib/voice-guidance';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';

function endpoint(token: string, suffix = ''): string {
  return `${API_BASE}/invitations/public/${encodeURIComponent(token)}/live-location${suffix}`;
}

interface Props {
  token: string;
  position: VisitorPosition | null;
  navPhase: NavPhase;
  /** Starts the shared GPS feed (and the map) if it isn't running yet. */
  onStart: () => void;
}

export function ShareLiveLocation({ token, position, navPhase, onStart }: Props) {
  const [sharing, setSharing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const positionRef = useRef(position);
  positionRef.current = position;
  const anchorRef = useRef<LngLat | null>(null);
  const headingRef = useRef<number | null>(null);
  const firstSentRef = useRef(false);

  async function sendPosition() {
    const cur = positionRef.current;
    if (!cur || cur.accuracyM > MAX_SHARE_ACCURACY_M) return;
    const next = nextHeading(anchorRef.current, cur, headingRef.current);
    anchorRef.current = next.anchor;
    headingRef.current = next.heading;
    try {
      const res = await fetch(endpoint(token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: cur.lat,
          lng: cur.lng,
          heading: next.heading,
          accuracyM: Math.round(cur.accuracyM),
        }),
      });
      if (res.status === 404 || res.status === 410) {
        setSharing(false);
        setNotice('This invitation is no longer active, so sharing has stopped.');
        return;
      }
      if (!res.ok) throw new Error('bad status');
      setProblem(null);
    } catch {
      setProblem("Couldn't reach the server. We'll keep trying.");
    }
  }

  async function stopSharing(message: string | null) {
    setSharing(false);
    setNotice(message);
    setProblem(null);
    firstSentRef.current = false;
    anchorRef.current = null;
    headingRef.current = null;
    try {
      await fetch(endpoint(token), { method: 'DELETE', keepalive: true });
    } catch {
      // Best effort: the server also clears it when the invitation ends.
    }
  }

  function startSharing() {
    setNotice(null);
    setProblem(null);
    firstSentRef.current = false;
    setSharing(true);
    // Turn on the shared GPS feed (and the map) if the visitor hasn't already.
    if (navPhase === 'idle' || navPhase === 'arrived') onStart();
  }

  // Send the latest position every few seconds while sharing.
  useEffect(() => {
    if (!sharing) return;
    const timer = setInterval(() => void sendPosition(), SEND_EVERY_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sendPosition only reads refs
  }, [sharing]);

  // Send right away on the first usable fix instead of waiting for the timer.
  useEffect(() => {
    if (sharing && position && !firstSentRef.current) {
      firstSentRef.current = true;
      void sendPosition();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sendPosition only reads refs
  }, [sharing, position]);

  // Arriving ends sharing and tells the server; the position is deleted there.
  useEffect(() => {
    if (!sharing) return;
    if (navPhase === 'arrived') {
      setSharing(false);
      setNotice("You've arrived. The person who invited you can see that you're at the gate.");
      void fetch(endpoint(token, '/arrived'), { method: 'POST', keepalive: true }).catch(() => undefined);
    } else if (navPhase === 'idle') {
      void stopSharing('Location sharing stopped.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the phase
  }, [sharing, navPhase]);

  return (
    <div className="mt-4 rounded-2xl border border-white/15 bg-white/5 p-4">
      {!sharing ? (
        <>
          <p className="text-sm font-medium">Let the person who invited you follow your arrival</p>
          <p className="mt-0.5 text-xs opacity-70">
            Your live location is sent only to them, only while you&rsquo;re on your way. It stops when you arrive and
            is then deleted.
          </p>
          <div className="mt-3">
            <Button type="button" onClick={startSharing}>
              Share my live location
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs uppercase tracking-wide opacity-70">Live location on</p>
          <p className="mt-1 text-base font-medium">Sharing your location with the person who invited you</p>
          <div className="mt-3">
            <Button type="button" variant="secondary" onClick={() => void stopSharing('Location sharing stopped.')}>
              Stop sharing
            </Button>
          </div>
        </>
      )}
      {notice && !sharing && (
        <p role="status" className="mt-2 text-sm">
          {notice}
        </p>
      )}
      {problem && (
        <p role="alert" className="mt-2 text-sm">
          {problem}
        </p>
      )}
    </div>
  );
}
