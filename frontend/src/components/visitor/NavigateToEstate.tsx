'use client';

// Visitor-facing "Navigate to Estate" card on the invitation page.
// Answers the five questions from ENTRYVA.md section 16: where am I, where
// am I going, which entrance, have I arrived, what do I show the guard.
//
// Renders NOTHING if the estate hasn't set up an entrance (or the link is
// no longer live) - the invitation page then looks exactly as before.

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { AlertIcon, CheckCircleIcon, MapPinIcon, WifiOffIcon } from '@/components/ui/icons';
import { apiFetch } from '@/lib/api-client';
import { externalDirectionsUrl, formatDistance, formatDuration } from '@/lib/geo';
import { getMapboxToken } from '@/lib/mapbox';
import { useVisitorNavigation } from '@/hooks/useVisitorNavigation';
import type { PublicEntrance } from '@/types/location';

// mapbox-gl needs `window`, so it is only ever loaded in the browser, and
// only once the visitor actually starts navigating.
const MapView = dynamic(() => import('@/components/location/MapView'), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-2xl bg-white/10" />,
});

interface Props {
  token: string;
  /** Called when the visitor taps "Show Visitor Pass". */
  onShowPass: () => void;
}

export function NavigateToEstate({ token, onShowPass }: Props) {
  const [entrance, setEntrance] = useState<PublicEntrance | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<PublicEntrance>(`/invitations/public/${token}/location`)
      .then((e) => {
        if (!cancelled) setEntrance(e);
      })
      .catch(() => {
        // Not set up / link not live: stay invisible rather than show an error.
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!entrance) return null;
  return <NavigationCard entrance={entrance} onShowPass={onShowPass} />;
}

function NavigationCard({ entrance, onShowPass }: { entrance: PublicEntrance; onShowPass: () => void }) {
  const nav = useVisitorNavigation(entrance);
  const hasMapToken = Boolean(getMapboxToken());
  const externalUrl = externalDirectionsUrl(nav.gate);

  const markers = useMemo(() => {
    const list = [{ id: 'gate', lng: nav.gate.lng, lat: nav.gate.lat, color: '#22C55E' }];
    if (nav.position) list.push({ id: 'me', lng: nav.position.lng, lat: nav.position.lat, color: '#3B82F6' });
    return list;
  }, [nav.gate, nav.position]);

  const fitTo = useMemo<Array<[number, number]>>(
    () => (nav.position ? [[nav.position.lng, nav.position.lat], [nav.gate.lng, nav.gate.lat]] : []),
    // Only re-fit when the route (re)loads or the first fix arrives, not on every GPS tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nav.route, Boolean(nav.position)],
  );

  const wrapper = 'glass-card mx-auto mb-6 flex w-full max-w-sm flex-col gap-4 rounded-ticket p-6';

  // ---- Arrived ----
  if (nav.phase === 'arrived') {
    return (
      <section className={`${wrapper} items-center text-center`} aria-live="polite">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-verified-50 text-verified">
          <CheckCircleIcon className="h-8 w-8" />
        </span>
        <div>
          <p className="font-display text-xl font-bold text-ink">You&rsquo;ve arrived at {entrance.gateName}</p>
          <p className="mt-1 text-ink-400">Show your pass to the security officer at the gate.</p>
        </div>
        <Button fullWidth onClick={onShowPass}>
          Show Visitor Pass
        </Button>
        <button onClick={nav.start} className="text-xs text-ink-400 underline">
          Not at the gate yet? Navigate again
        </button>
      </section>
    );
  }

  // ---- Idle ----
  if (nav.phase === 'idle') {
    return (
      <section className={wrapper}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brass-50 text-brass">
            <MapPinIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Use this entrance</p>
            <p className="font-display text-lg font-semibold text-ink">{entrance.gateName}</p>
            <p className="text-sm text-ink-400">{entrance.estateName}</p>
            {entrance.instructions && <p className="mt-1 text-sm text-ink">{entrance.instructions}</p>}
          </div>
        </div>

        {nav.problem && <ProblemNotice problem={nav.problem} />}

        <Button fullWidth onClick={nav.start}>
          Navigate to Estate
        </Button>
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-center text-sm text-brass underline"
        >
          Open in Google Maps instead
        </a>
      </section>
    );
  }

  // ---- Locating / navigating ----
  const weak = nav.arrivalState === 'weak-gps';
  const near = nav.arrivalState === 'near';

  return (
    <section className={wrapper} aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brass-50 text-brass">
          <MapPinIcon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Heading to</p>
          <p className="font-display text-lg font-semibold text-ink">{entrance.gateName}</p>
          {entrance.instructions && <p className="text-sm text-ink-400">{entrance.instructions}</p>}
        </div>
      </div>

      {nav.phase === 'locating' && !nav.position && (
        <p className="text-sm text-ink-400">Finding your location&hellip;</p>
      )}
      {nav.problem && <ProblemNotice problem={nav.problem} />}

      {!nav.online && (
        <p className="flex items-center gap-2 rounded-xl bg-warn-50 px-3 py-2 text-sm text-warn">
          <WifiOffIcon className="h-4 w-4 shrink-0" />
          You&rsquo;re offline, so the map and route may not load. Your distance to the gate still updates.
        </p>
      )}

      {nav.distanceM !== null && (
        <div>
          <p className="font-display text-3xl font-bold text-ink">{formatDistance(nav.distanceM)}</p>
          <p className="text-sm text-ink-400">
            from the gate (straight line)
            {nav.route ? ` \u00b7 ${formatDistance(nav.route.distanceM)} by road \u00b7 ${formatDuration(nav.route.durationS)}` : ''}
          </p>
        </div>
      )}

      {weak && (
        <p className="flex items-start gap-2 rounded-xl bg-warn-50 px-3 py-2 text-sm text-warn">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          Your GPS signal is weak. Move to an open area. If you&rsquo;re already at the gate, tap &ldquo;I&rsquo;m at the gate&rdquo;.
        </p>
      )}
      {near && !weak && (
        <p className="rounded-xl bg-verified-50 px-3 py-2 text-sm text-verified">
          Almost there &mdash; look for the {entrance.gateName}.
        </p>
      )}

      {hasMapToken && nav.position && (
        <MapView
          center={[nav.gate.lng, nav.gate.lat]}
          zoom={15}
          markers={markers}
          route={nav.route?.coordinates ?? null}
          fitTo={fitTo}
          fitKey={`${nav.route ? 'route' : 'fix'}`}
          className="h-64 w-full"
        />
      )}

      {nav.routeLoading && <p className="text-sm text-ink-400">Loading route&hellip;</p>}
      {nav.routeProblem && !nav.routeLoading && (
        <p className="text-sm text-ink-400">
          {nav.routeProblem === 'offline'
            ? 'No internet, so we can\u2019t draw the route.'
            : 'We couldn\u2019t load the route.'}{' '}
          Follow the distance above, or{' '}
          <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="text-brass underline">
            open Google Maps
          </a>
          .
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
        <Button fullWidth variant="secondary" onClick={nav.confirmArrivedManually}>
          I&rsquo;m at the gate
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={nav.refreshRoute} disabled={!nav.position || nav.routeLoading}>
            Refresh route
          </Button>
          <Button variant="ghost" className="flex-1" onClick={nav.stop}>
            Stop
          </Button>
        </div>
      </div>
    </section>
  );
}

function ProblemNotice({ problem }: { problem: 'unsupported' | 'permission-denied' | 'no-signal' }) {
  const text =
    problem === 'permission-denied'
      ? 'Location is turned off for this page. To navigate, allow location access for this site in your browser or phone settings, then tap Navigate again. You can also use Google Maps below.'
      : problem === 'unsupported'
        ? 'This browser can\u2019t share your location. Use Google Maps below to find the entrance.'
        : 'We can\u2019t get a GPS signal right now. Move to an open area \u2014 we\u2019ll keep trying.';
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-warn-50 px-3 py-2 text-sm text-warn">
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      {text}
    </p>
  );
}
