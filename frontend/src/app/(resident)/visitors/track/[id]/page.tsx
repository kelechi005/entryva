'use client';

// Resident view: where is my visitor right now? A car that moves on the
// map, the time and distance still to go, and a clear "arrived" message.
// A position only exists while the visitor is choosing to share it.

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { MapMarker } from '@/components/location/MapView';
import { apiFetch } from '@/lib/api-client';
import { formatDistance, formatDuration } from '@/lib/geo';
import { fetchRoute, getMapboxToken, type RouteResult } from '@/lib/mapbox';
import { haversineM } from '@/lib/voice-guidance';
import type { LiveLocationResponse } from '@/types/live-location';

const MapView = dynamic(() => import('@/components/location/MapView'), {
  ssr: false,
  loading: () => <div className="h-72 w-full animate-pulse rounded-2xl bg-white/10" />,
});

const POLL_MS = 5000;
const ROUTE_EVERY_MS = 30000;
const STALE_AFTER_S = 45;

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
}

export default function TrackVisitorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [data, setData] = useState<LiveLocationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [following, setFollowing] = useState(true);
  const lastRouteAt = useRef(0);
  const routeAbort = useRef<AbortController | null>(null);
  const hasMap = Boolean(getMapboxToken());

  // Ask the server for the latest position every few seconds.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await apiFetch<LiveLocationResponse>(`/invitations/${id}/live-location`);
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the live location.');
      }
    }
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id]);

  // Road distance and time to the gate, refreshed every 30 seconds.
  useEffect(() => {
    if (!data?.position || !data.gate || !hasMap) return;
    if (Date.now() - lastRouteAt.current < ROUTE_EVERY_MS) return;
    lastRouteAt.current = Date.now();
    routeAbort.current?.abort();
    const controller = new AbortController();
    routeAbort.current = controller;
    fetchRoute(
      { lat: data.position.lat, lng: data.position.lng },
      { lat: data.gate.lat, lng: data.gate.lng },
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setRoute(result);
      })
      .catch(() => undefined);
  }, [data, hasMap]);

  useEffect(() => () => routeAbort.current?.abort(), []);

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [];
    if (data?.gate) list.push({ id: 'gate', lng: data.gate.lng, lat: data.gate.lat, color: '#22C55E' });
    if (data?.position) {
      list.push({
        id: 'car',
        lng: data.position.lng,
        lat: data.position.lat,
        color: '#3B82F6',
        icon: 'car',
        heading: data.position.heading ?? 0,
      });
    }
    return list;
  }, [data]);

  const gateName = data?.gate?.name ?? 'the gate';
  const position = data?.position ?? null;
  const straightM =
    position && data?.gate ? haversineM({ lat: position.lat, lng: position.lng }, data.gate) : null;
  const stale = position !== null && position.ageSeconds > STALE_AFTER_S;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8 sm:px-8 lg:py-10">
      <header>
        <Link href="/visitors/history" className="text-sm text-brass underline">
          &larr; Visitor history
        </Link>
        <h1 className="mt-2 font-display text-[32px] font-bold text-ink">Track arrival</h1>
      </header>

      {error && (
        <p role="alert" className="rounded-2xl border border-alert/30 bg-alert-50 px-4 py-3 text-sm text-alert">
          {error}
        </p>
      )}
      {!data && !error && <p className="text-ink-400">Loading&hellip;</p>}

      {data && (
        <section className="glass-card flex flex-col gap-4 rounded-card p-5">
          {data.arrived ? (
            <div>
              <p className="font-display text-xl font-bold text-ink">Your visitor has arrived</p>
              <p className="mt-1 text-ink-400">They&rsquo;re at {gateName}.</p>
            </div>
          ) : !data.invitationActive ? (
            <p className="text-ink-400">This invitation is no longer active.</p>
          ) : !data.sharing ? (
            <div>
              <p className="font-display text-xl font-bold text-ink">Waiting for your visitor</p>
              <p className="mt-1 text-ink-400">
                They appear here once they open their invite link and tap &ldquo;Share my live location&rdquo;.
                Sharing is their choice, so this may stay empty.
              </p>
            </div>
          ) : (
            <div>
              <p className="font-display text-xl font-bold text-ink">
                {stale ? `Last seen ${formatAge(position!.ageSeconds)}` : 'On the way'}
              </p>
              <p className="mt-1 text-ink-400">
                {route
                  ? `${formatDuration(route.durationS)} \u00b7 ${formatDistance(route.distanceM)} by road to ${gateName}`
                  : straightM !== null
                    ? `${formatDistance(straightM)} from ${gateName} (straight line)`
                    : ''}
              </p>
              {stale && (
                <p className="mt-2 rounded-xl bg-warn-50 px-3 py-2 text-sm text-warn">
                  Their phone hasn&rsquo;t reported for a while. They may be out of signal or have locked their
                  screen.
                </p>
              )}
            </div>
          )}

          {hasMap && data.gate && position && (
            <>
              <MapView
                center={[data.gate.lng, data.gate.lat]}
                zoom={15}
                markers={markers}
                route={route?.coordinates ?? null}
                follow={following ? [position.lng, position.lat] : null}
                followZoom={15}
                onUserMove={() => setFollowing(false)}
                className="h-72 w-full"
              />
              {!following && (
                <Button fullWidth variant="secondary" onClick={() => setFollowing(true)}>
                  Follow the car
                </Button>
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}
