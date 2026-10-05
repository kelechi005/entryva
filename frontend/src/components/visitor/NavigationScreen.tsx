'use client';

// The visitor's full-screen map (/invite/<token>/navigate). The map fills
// the phone; a bottom panel answers: how far, which entrance, have I
// arrived, what next. It carries everything the old inline card had - the
// follow-me map, spoken directions and (opt-in) live sharing - so nothing
// was lost by moving it to its own page.
//
// GPS starts automatically (the visitor already tapped "Navigate to
// Estate" to get here). Their position stays in this browser; it goes to
// Mapbox once to draw the route, and to the person who invited them ONLY
// if they tap "Share my live location".

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { AlertIcon, CheckCircleIcon, ChevronRightIcon, WifiOffIcon } from '@/components/ui/icons';
import { ShareLiveLocation } from '@/components/visitor/ShareLiveLocation';
import { VoiceGuidance } from '@/components/visitor/VoiceGuidance';
import { usePublicEntrance } from '@/hooks/usePublicEntrance';
import { useVisitorNavigation } from '@/hooks/useVisitorNavigation';
import { appleMapsUrl, externalDirectionsUrl, formatDistance, formatDuration, wazeUrl } from '@/lib/geo';
import { MAP_COLORS, getMapboxToken } from '@/lib/mapbox';
import type { MapMarker, MapZone } from '@/components/location/MapView';
import type { PublicEntrance } from '@/types/location';

const MapView = dynamic(() => import('@/components/location/MapView'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-white/5" />,
});

const panelClass =
  'absolute inset-x-0 bottom-0 z-10 mx-auto flex max-h-[58dvh] w-full max-w-lg flex-col gap-3 overflow-y-auto ' +
  'rounded-t-3xl border border-white/10 bg-black/80 px-5 pt-5 backdrop-blur-xl';
const panelPadBottom = { paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' };

const linkButton =
  'inline-flex w-full items-center justify-center gap-2 rounded-[28px] bg-gradient-to-b from-brass to-[#3B82F6] px-5 py-3.5 text-sm font-semibold text-white shadow-[0px_10px_30px_rgba(93,168,255,0.35)] hover:brightness-110 active:scale-[0.97]';

export function NavigationScreen({ token }: { token: string }) {
  const entranceState = usePublicEntrance(token);
  const passHref = `/invite/${token}`;

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg">
      {entranceState.status === 'ready' ? (
        <ActiveNavigation entrance={entranceState.entrance} token={token} passHref={passHref} />
      ) : (
        <>
          <TopBar passHref={passHref} />
          <section className={panelClass} style={panelPadBottom}>
            {entranceState.status === 'loading' ? (
              <p className="text-ink-400">Loading directions&hellip;</p>
            ) : (
              <>
                <p className="font-display text-lg font-semibold text-ink">Navigation isn&rsquo;t available</p>
                <p className="text-sm text-ink-400">
                  This estate hasn&rsquo;t set up directions, or this invitation is no longer active. Your pass still
                  works.
                </p>
                <Link href={passHref} className={linkButton}>
                  Back to my pass
                </Link>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function TopBar({ passHref }: { passHref: string }) {
  return (
    <header
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-3 pb-3"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <Link
        href={passHref}
        className="pointer-events-auto glass-surface inline-flex items-center gap-1 rounded-full px-4 py-2.5 text-sm font-medium text-ink"
      >
        <ChevronRightIcon className="h-4 w-4 rotate-180" /> My pass
      </Link>
    </header>
  );
}

function ActiveNavigation({
  entrance,
  token,
  passHref,
}: {
  entrance: PublicEntrance;
  token: string;
  passHref: string;
}) {
  const nav = useVisitorNavigation(entrance);
  const hasMapToken = Boolean(getMapboxToken());
  const startedRef = useRef(false);

  // The bottom panel can be shrunk to one line so more of the map shows.
  const [collapsed, setCollapsed] = useState(false);

  // The map follows the visitor as they move, until they drag it themselves.
  const [following, setFollowing] = useState(true);
  useEffect(() => {
    if (nav.phase === 'locating') setFollowing(true);
  }, [nav.phase]);

  // Arriving is the one moment the panel must be fully visible again.
  useEffect(() => {
    if (nav.phase === 'arrived') setCollapsed(false);
  }, [nav.phase]);

  // Begin as soon as the page opens (once).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    nav.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once on open
  }, []);

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [
      { id: 'gate', lng: nav.gate.lng, lat: nav.gate.lat, color: MAP_COLORS.gate, kind: 'gate', label: entrance.gateName },
    ];
    if (nav.position) {
      list.push({ id: 'me', lng: nav.position.lng, lat: nav.position.lat, color: MAP_COLORS.me, kind: 'me' });
    }
    return list;
  }, [nav.gate, nav.position, entrance.gateName]);

  // Green ring = the "arrived" zone. Blue ring = how sure the GPS is.
  const zones = useMemo<MapZone[]>(() => {
    const list: MapZone[] = [
      {
        id: 'arrival',
        lng: nav.gate.lng,
        lat: nav.gate.lat,
        radiusM: entrance.arrivalRadiusMeters,
        color: MAP_COLORS.gate,
        dashed: true,
      },
    ];
    if (nav.position) {
      list.push({
        id: 'accuracy',
        lng: nav.position.lng,
        lat: nav.position.lat,
        radiusM: Math.min(nav.position.accuracyM, 500),
        color: MAP_COLORS.me,
      });
    }
    return list;
  }, [nav.gate, nav.position, entrance.arrivalRadiusMeters]);

  const fitTo = useMemo<Array<[number, number]>>(
    () => (nav.position ? [[nav.position.lng, nav.position.lat], [nav.gate.lng, nav.gate.lat]] : []),
    // Only re-fit when the route (re)loads or the first fix arrives, not on every GPS tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nav.route, Boolean(nav.position)],
  );

  const gateCoords = nav.gate;
  const weak = nav.arrivalState === 'weak-gps';
  const near = nav.arrivalState === 'near';

  return (
    <>
      <div className="absolute inset-0">
        {hasMapToken ? (
          <MapView
            center={[gateCoords.lng, gateCoords.lat]}
            zoom={16}
            theme="dark"
            markers={markers}
            zones={zones}
            route={nav.route?.coordinates ?? null}
            fitTo={following ? undefined : fitTo}
            fitKey={nav.route ? 'route' : 'fix'}
            fitPadding={{ top: 90, bottom: 320, left: 40, right: 40 }}
            follow={following && nav.position ? [nav.position.lng, nav.position.lat] : null}
            followZoom={17}
            onUserMove={() => setFollowing(false)}
            className="h-full w-full rounded-none"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center text-sm text-ink-400">
            The map isn&rsquo;t available right now. Use the distance below or open your maps app.
          </div>
        )}
      </div>

      <TopBar passHref={passHref} />

      <section className={panelClass} style={panelPadBottom} aria-live="polite">
        {nav.phase === 'arrived' ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-verified-50 text-verified">
              <CheckCircleIcon className="h-8 w-8" />
            </span>
            <div>
              <p className="font-display text-xl font-bold text-ink">You&rsquo;ve arrived at {entrance.gateName}</p>
              <p className="mt-1 text-sm text-ink-400">Show your pass to the security officer at the gate.</p>
            </div>
            <Link href={passHref} className={linkButton}>
              Show Visitor Pass
            </Link>
            <button onClick={nav.start} className="text-xs text-ink-400 underline">
              Not at the gate yet? Navigate again
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Show directions panel' : 'Hide directions panel'}
              className="flex w-full items-start justify-between gap-3 text-left"
            >
              <span>
                <span className="block text-xs font-medium uppercase tracking-wide text-ink-400">Heading to</span>
                <span className="block font-display text-lg font-semibold text-ink">
                  {entrance.gateName}{' '}
                  <span className="text-sm font-normal text-ink-400">&middot; {entrance.estateName}</span>
                </span>
                {entrance.instructions && !collapsed && (
                  <span className="block text-sm text-ink-400">{entrance.instructions}</span>
                )}
              </span>
              <ChevronRightIcon
                className={`mt-2 h-5 w-5 shrink-0 text-ink-400 transition-transform ${collapsed ? '-rotate-90' : 'rotate-90'}`}
              />
            </button>

            {/* Collapsed: just the distance (and any problem), so the map stays in view. */}
            {collapsed && nav.distanceM !== null && (
              <p className="text-sm text-ink-400">
                <span className="font-display text-xl font-bold text-ink">{formatDistance(nav.distanceM)}</span> from
                the gate{nav.route ? ` \u00b7 ${formatDuration(nav.route.durationS)}` : ''}
              </p>
            )}
            {collapsed && nav.problem && <ProblemNotice problem={nav.problem} />}

            {/* Everything else folds away but stays mounted, so voice and sharing keep working. */}
            <div hidden={collapsed} className={collapsed ? 'hidden' : 'flex flex-col gap-3'}>
              {nav.phase === 'locating' && !nav.position && !nav.problem && (
                <p className="text-sm text-ink-400">Finding your location&hellip;</p>
              )}

              {nav.problem && <ProblemNotice problem={nav.problem} />}

              {!nav.online && (
                <p className="flex items-center gap-2 rounded-xl bg-warn-50 px-3 py-2 text-sm text-warn">
                  <WifiOffIcon className="h-4 w-4 shrink-0" />
                  You&rsquo;re offline, so the map and route may not load. Your distance still updates.
                </p>
              )}

              {nav.distanceM !== null && (
                <div>
                  <p className="font-display text-3xl font-bold text-ink">{formatDistance(nav.distanceM)}</p>
                  <p className="text-sm text-ink-400">
                    from the gate (straight line)
                    {nav.route
                      ? ` \u00b7 ${formatDistance(nav.route.distanceM)} by road \u00b7 ${formatDuration(nav.route.durationS)}`
                      : ''}
                  </p>
                </div>
              )}

              {weak && (
                <p className="flex items-start gap-2 rounded-xl bg-warn-50 px-3 py-2 text-sm text-warn">
                  <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  Your GPS signal is weak. Move to an open area. If you&rsquo;re already at the gate, tap
                  &ldquo;I&rsquo;m at the gate&rdquo;.
                </p>
              )}
              {near && !weak && (
                <p className="rounded-xl bg-verified-50 px-3 py-2 text-sm text-verified">
                  Almost there &mdash; look for the {entrance.gateName}.
                </p>
              )}

              {nav.routeLoading && <p className="text-sm text-ink-400">Loading route&hellip;</p>}
              {nav.routeProblem && !nav.routeLoading && (
                <p className="text-sm text-ink-400">
                  {nav.routeProblem === 'offline'
                    ? 'No internet, so we can\u2019t draw the route.'
                    : 'We couldn\u2019t load the route.'}{' '}
                  Follow the distance above, or open your maps app below.
                </p>
              )}

              {nav.route && nav.route.steps.length > 0 && (
                <details className="rounded-xl border border-ink-100 px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-medium text-ink">Step-by-step directions</summary>
                  <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-ink-400">
                    {nav.route.steps.map((s, i) => (
                      <li key={i}>
                        {s.instruction}
                        {s.distanceM > 0 && <span className="text-ink-600"> ({formatDistance(s.distanceM)})</span>}
                      </li>
                    ))}
                  </ol>
                </details>
              )}

              <div className="flex flex-col gap-2">
                {nav.phase === 'idle' && (
                  <Button fullWidth onClick={nav.start}>
                    Try again
                  </Button>
                )}
                {nav.phase !== 'idle' && (
                  <Button fullWidth variant="secondary" onClick={nav.confirmArrivedManually}>
                    I&rsquo;m at the gate
                  </Button>
                )}
                {hasMapToken && nav.position && !following && (
                  <Button fullWidth variant="secondary" onClick={() => setFollowing(true)}>
                    Recentre on me
                  </Button>
                )}
                {nav.phase !== 'idle' && (
                  <Button variant="ghost" fullWidth onClick={nav.refreshRoute} disabled={!nav.position || nav.routeLoading}>
                    Refresh route
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-ink-400">Open in:</span>
                <a href={externalDirectionsUrl(gateCoords)} target="_blank" rel="noopener noreferrer" className="text-brass underline">
                  Google Maps
                </a>
                <a href={wazeUrl(gateCoords)} target="_blank" rel="noopener noreferrer" className="text-brass underline">
                  Waze
                </a>
                <a href={appleMapsUrl(gateCoords)} target="_blank" rel="noopener noreferrer" className="text-brass underline">
                  Apple Maps
                </a>
              </div>
            </div>
          </>
        )}

        {/* Always mounted, in every phase (even collapsed): they react to arrival and keep speaking / sharing. */}
        <div hidden={collapsed} className={collapsed ? 'hidden' : 'flex flex-col'}>
          <VoiceGuidance
            destination={{ lng: entrance.longitude, lat: entrance.latitude }}
            gateName={entrance.gateName}
            position={nav.position}
            navPhase={nav.phase}
            onStart={nav.start}
          />
          <ShareLiveLocation token={token} position={nav.position} navPhase={nav.phase} onStart={nav.start} />
        </div>
      </section>
    </>
  );
}

function ProblemNotice({ problem }: { problem: 'unsupported' | 'permission-denied' | 'no-signal' }) {
  const text =
    problem === 'permission-denied'
      ? 'Location is turned off for this page. Allow location access for this site in your browser or phone settings, then tap Try again. Or open your maps app below.'
      : problem === 'unsupported'
        ? 'This browser can\u2019t share your location. Open your maps app below to find the entrance.'
        : 'We can\u2019t get a GPS signal right now. Move to an open area \u2014 we\u2019ll keep trying.';
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-warn-50 px-3 py-2 text-sm text-warn">
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      {text}
    </p>
  );
}
