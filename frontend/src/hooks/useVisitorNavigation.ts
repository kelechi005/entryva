'use client';

// All the logic behind the visitor's "Navigate to Estate" flow, kept out
// of the screen so it can be tested on its own (ENTRYVA.md rule 8):
//   ask for GPS -> follow the visitor -> ONE route request -> decide
//   whether they have arrived.
//
// The visitor's position stays in this browser. It is never sent to our
// server (only to Mapbox, to draw the route, when they tap Navigate).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ARRIVAL_CONFIRMATIONS,
  evaluateArrival,
  haversineMeters,
  type ArrivalState,
} from '@/lib/geo';
import { MapboxError, fetchRoute, getMapboxToken, type RouteResult } from '@/lib/mapbox';
import type { LatLng, PublicEntrance } from '@/types/location';

export type NavPhase = 'idle' | 'locating' | 'navigating' | 'arrived';

export type NavProblem =
  | 'unsupported' // browser has no GPS API
  | 'permission-denied' // visitor said no (or has it blocked)
  | 'no-signal'; // GPS can't get a fix right now

export type RouteProblem = 'offline' | 'unavailable' | 'failed';

export interface VisitorPosition extends LatLng {
  accuracyM: number;
}

export function useVisitorNavigation(entrance: PublicEntrance) {
  const [phase, setPhase] = useState<NavPhase>('idle');
  const [problem, setProblem] = useState<NavProblem | null>(null);
  const [position, setPosition] = useState<VisitorPosition | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeProblem, setRouteProblem] = useState<RouteProblem | null>(null);
  const [online, setOnline] = useState(true);

  const watchId = useRef<number | null>(null);
  const arrivedStreak = useRef(0);
  const routeRequested = useRef(false);
  const routeAbort = useRef<AbortController | null>(null);
  const positionRef = useRef<VisitorPosition | null>(null);

  const gate = useMemo<LatLng>(
    () => ({ lat: entrance.latitude, lng: entrance.longitude }),
    [entrance.latitude, entrance.longitude],
  );

  // Online / offline awareness.
  useEffect(() => {
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const stopWatching = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
  }, []);

  // Never leave GPS running after the visitor leaves the page.
  useEffect(
    () => () => {
      stopWatching();
      routeAbort.current?.abort();
    },
    [stopWatching],
  );

  const requestRoute = useCallback(
    async (from: LatLng) => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setRouteProblem('offline');
        return;
      }
      if (!getMapboxToken()) {
        setRouteProblem('unavailable');
        return;
      }
      routeAbort.current?.abort();
      const controller = new AbortController();
      routeAbort.current = controller;
      setRouteLoading(true);
      setRouteProblem(null);
      try {
        const result = await fetchRoute(from, gate, controller.signal);
        if (controller.signal.aborted) return;
        setRoute(result);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setRouteProblem(err instanceof MapboxError && err.kind === 'no-token' ? 'unavailable' : 'failed');
      } finally {
        if (!controller.signal.aborted) setRouteLoading(false);
      }
    },
    [gate],
  );

  const handleFix = useCallback(
    (fix: GeolocationPosition) => {
      const next: VisitorPosition = {
        lat: fix.coords.latitude,
        lng: fix.coords.longitude,
        accuracyM: fix.coords.accuracy,
      };
      positionRef.current = next;
      setPosition(next);
      setProblem(null);
      setPhase((p) => (p === 'locating' || p === 'idle' ? 'navigating' : p));

      // Exactly one automatic route request, on the first fix.
      if (!routeRequested.current) {
        routeRequested.current = true;
        void requestRoute(next);
      }

      const state = evaluateArrival({
        distanceM: haversineMeters(next, gate),
        accuracyM: next.accuracyM,
        radiusM: entrance.arrivalRadiusMeters,
      });
      arrivedStreak.current = state === 'arrived' ? arrivedStreak.current + 1 : 0;
      if (arrivedStreak.current >= ARRIVAL_CONFIRMATIONS) {
        stopWatching();
        setPhase('arrived');
      }
    },
    [entrance.arrivalRadiusMeters, gate, requestRoute, stopWatching],
  );

  const handleError = useCallback((err: GeolocationPositionError) => {
    if (err.code === 1) {
      setProblem('permission-denied');
      setPhase('idle');
    } else {
      // POSITION_UNAVAILABLE / TIMEOUT: keep watching, GPS often recovers.
      setProblem('no-signal');
    }
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setProblem('unsupported');
      return;
    }
    stopWatching();
    arrivedStreak.current = 0;
    routeRequested.current = false;
    setProblem(null);
    setRoute(null);
    setRouteProblem(null);
    setPhase('locating');
    watchId.current = navigator.geolocation.watchPosition(handleFix, handleError, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 20_000,
    });
  }, [handleError, handleFix, stopWatching]);

  /** Visitor-initiated re-route (e.g. after a wrong turn). Costs one request. */
  const refreshRoute = useCallback(() => {
    if (positionRef.current) void requestRoute(positionRef.current);
  }, [requestRoute]);

  /** Fallback when GPS can't confirm arrival: the visitor says so themselves. */
  const confirmArrivedManually = useCallback(() => {
    stopWatching();
    setPhase('arrived');
  }, [stopWatching]);

  const stop = useCallback(() => {
    stopWatching();
    routeAbort.current?.abort();
    setPhase('idle');
  }, [stopWatching]);

  const distanceM = position ? haversineMeters(position, gate) : null;
  const arrivalState: ArrivalState | null =
    position && distanceM !== null
      ? evaluateArrival({
          distanceM,
          accuracyM: position.accuracyM,
          radiusM: entrance.arrivalRadiusMeters,
        })
      : null;

  return {
    phase,
    problem,
    position,
    gate,
    distanceM,
    arrivalState,
    route,
    routeLoading,
    routeProblem,
    online,
    start,
    stop,
    refreshRoute,
    confirmArrivedManually,
  };
}
