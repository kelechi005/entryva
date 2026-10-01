'use client';

// Spoken turn-by-turn directions for a visitor driving to the estate gate.
// It does NOT run its own GPS: it listens to the same position feed that
// moves the dot on the map (from useVisitorNavigation), so the map, the
// distance and the voice always agree. Speech can only start after a tap, so
// the visitor presses "Start voice guidance".

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { NavPhase, VisitorPosition } from '@/hooks/useVisitorNavigation';
import { getMapboxToken } from '@/lib/mapbox';
import {
  ARRIVED_WITHIN_M,
  OFF_ROUTE_M,
  acquireWakeLock,
  buildDirectionsUrl,
  haversineM,
  locateOnRoute,
  parseRoute,
  pickAnnouncement,
  type GuidanceRoute,
  type LngLat,
  type WakeLockLike,
} from '@/lib/voice-guidance';

interface Props {
  destination: LngLat;
  gateName: string;
  /** Live position from the shared navigation feed (null until the first fix). */
  position: VisitorPosition | null;
  navPhase: NavPhase;
  /** Starts the shared GPS feed (and the map) if it isn't running yet. */
  onStart: () => void;
}

export function VoiceGuidance({ destination, gateName, position, navPhase, onStart }: Props) {
  const [active, setActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [line, setLine] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutedRef = useRef(false);
  const destRef = useRef(destination);
  const nameRef = useRef(gateName);
  const routeRef = useRef<GuidanceRoute | null>(null);
  const stepRef = useRef(0);
  const spokenRef = useRef<Set<string>>(new Set());
  const wakeRef = useRef<WakeLockLike | null>(null);
  const offCountRef = useRef(0);
  const fetchingRef = useRef(false);
  const lastFetchRef = useRef(0);
  destRef.current = destination;
  nameRef.current = gateName;

  function speak(text: string) {
    setLine(text);
    if (mutedRef.current || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en';
    window.speechSynthesis.speak(utterance);
  }

  function stop(cancelSpeech = true) {
    if (cancelSpeech && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    void wakeRef.current?.release().catch(() => undefined);
    wakeRef.current = null;
    setActive(false);
  }

  async function fetchRoute(from: LngLat) {
    const token = getMapboxToken();
    if (!token || fetchingRef.current) return;
    fetchingRef.current = true;
    lastFetchRef.current = Date.now();
    try {
      const res = await fetch(buildDirectionsUrl(from, destRef.current, token));
      if (!res.ok) throw new Error('bad status');
      const route = parseRoute(await res.json());
      if (!route) throw new Error('no route');
      routeRef.current = route;
      stepRef.current = 0;
      spokenRef.current = new Set();
      offCountRef.current = 0;
      setError(null);
      handleFix(from);
    } catch {
      routeRef.current = null;
      setError("Couldn't get directions. Check your connection - we'll keep trying.");
    } finally {
      fetchingRef.current = false;
    }
  }

  function handleFix(pos: LngLat) {
    if (haversineM(pos, destRef.current) <= ARRIVED_WITHIN_M) {
      arrive();
      return;
    }

    const route = routeRef.current;
    if (!route) {
      if (!fetchingRef.current && Date.now() - lastFetchRef.current > 5000) void fetchRoute(pos);
      return;
    }

    const loc = locateOnRoute(route, pos, stepRef.current);
    stepRef.current = loc.stepIndex;

    if (loc.offRouteM > OFF_ROUTE_M) offCountRef.current += 1;
    else offCountRef.current = 0;

    if (offCountRef.current >= 2 && !fetchingRef.current && Date.now() - lastFetchRef.current > 15000) {
      setLine('Re-routing...');
      void fetchRoute(pos);
      return;
    }

    const step = route.steps[loc.stepIndex];
    const pick = pickAnnouncement(step, haversineM(pos, step.endsAt), spokenRef.current, loc.stepIndex);
    if (pick) {
      pick.keys.forEach((k) => spokenRef.current.add(k));
      speak(pick.text);
    }
  }

  function arrive() {
    speak(`You have arrived at ${nameRef.current}.`);
    setArrived(true);
    stop(false);
  }

  function start() {
    setError(null);
    setArrived(false);
    // Speaking inside the tap unlocks audio on phones.
    speak('Voice guidance on.');
    routeRef.current = null;
    stepRef.current = 0;
    spokenRef.current = new Set();
    offCountRef.current = 0;
    setActive(true);
    void acquireWakeLock().then((lock) => {
      wakeRef.current = lock;
    });
    // Turn on the shared GPS feed (and the map) if the visitor hasn't already.
    if (navPhase === 'idle' || navPhase === 'arrived') onStart();
  }

  function toggleMute() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  // Every new position from the shared feed drives the guidance.
  useEffect(() => {
    if (!active || !position || position.accuracyM > 100) return;
    handleFix({ lng: position.lng, lat: position.lat });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleFix only reads refs
  }, [position, active]);

  // Shared feed stopped (visitor pressed Stop, or location was refused).
  useEffect(() => {
    if (active && navPhase === 'idle') stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the phase
  }, [active, navPhase]);

  // The map's own arrival check can fire first; still say it out loud.
  useEffect(() => {
    if (active && navPhase === 'arrived') arrive();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the phase
  }, [active, navPhase]);

  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => () => stopRef.current(), []);

  // The phone releases the screen lock when the page is hidden; take it again.
  useEffect(() => {
    if (!active) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void acquireWakeLock().then((lock) => {
          wakeRef.current = lock;
        });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [active]);

  const supported =
    typeof window !== 'undefined' && 'speechSynthesis' in window && Boolean(getMapboxToken());
  if (!supported) return null;

  return (
    <div className="mt-4 rounded-2xl border border-white/15 bg-white/5 p-4">
      {!active ? (
        <>
          <p className="text-sm font-medium">{arrived ? line : 'Want spoken directions?'}</p>
          <p className="mt-0.5 text-xs opacity-70">
            Keep this page open and your screen on. Allow location when your phone asks.
          </p>
          <div className="mt-3">
            <Button type="button" onClick={start}>
              {arrived ? 'Start again' : 'Start voice guidance'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs uppercase tracking-wide opacity-70">Voice guidance on</p>
          <p className="mt-1 text-base font-medium" aria-live="polite">
            {line || 'Finding your position...'}
          </p>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="secondary" onClick={toggleMute}>
              {muted ? 'Unmute' : 'Mute'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => stop()}>
              Stop
            </Button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
