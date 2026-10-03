'use client';

// Full-screen map where the admin sets the estate pin and the visitor
// entrance (main gate).
//
// Fastest way: open this page on a phone, stand in the gateway and tap
// "Use my location as the main gate" - the device's GPS fills it in.
// Otherwise:
//   1. Search for the estate (or pan/zoom the satellite map to it).
//   2. Centre the circle on the estate -> "Set estate pin here".
//   3. Zoom right in on the visitor entrance -> "Set main gate here".
//   4. Preview the route to check the road really reaches the gate.
//   5. Name the gate, add an optional tip, Save.
//
// Accuracy guards: the gate can only be set from the map at street-level
// zoom; a rough GPS reading is refused; the dashed green ring shows what
// "arrived" will mean; and the route preview warns when the road ends away
// from the gate pin.

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { AlertIcon, CheckIcon, ChevronRightIcon, SearchIcon } from '@/components/ui/icons';
import { apiFetch } from '@/lib/api-client';
import {
  DeviceLocationError,
  MAX_ACCURACY_ESTATE_M,
  MAX_ACCURACY_GATE_M,
  getBestFix,
} from '@/lib/device-location';
import { MIN_GATE_ZOOM, formatDistance, formatDuration, routeEndGapM } from '@/lib/geo';
import { MAP_COLORS, fetchRoute, getMapboxToken, searchPlaces, type PlaceResult, type RouteResult } from '@/lib/mapbox';
import type { MapMarker, MapZone } from '@/components/location/MapView';
import type { EstateLocation, LatLng } from '@/types/location';

const MapView = dynamic(() => import('@/components/location/MapView'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-white/5" />,
});

// Only the opening view when nothing is set yet (roughly the middle of
// Nigeria). Never saved, never used for navigation.
const DEFAULT_CENTER: [number, number] = [8.675, 9.082];
const DEFAULT_ZOOM = 5;

// A gap bigger than this between the end of the road and the gate pin
// means directions would stop short of the gate.
const ROUTE_GAP_WARN_M = 40;

function parseCoord(text: string, min: number, max: number): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function LocationEditor() {
  const router = useRouter();
  const [loc, setLoc] = useState<EstateLocation | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [estatePin, setEstatePin] = useState<LatLng | null>(null);
  const [gatePin, setGatePin] = useState<LatLng | null>(null);
  const [gateName, setGateName] = useState('Main Gate');
  const [instructions, setInstructions] = useState('');
  const [radius, setRadius] = useState('100');
  const [view, setView] = useState<{ lat: number; lng: number; zoom: number } | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{ lng: number; lat: number; zoom?: number } | null>(null);
  const [flyKey, setFlyKey] = useState(0);

  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // "Use my location" (this device's GPS) state.
  const [locating, setLocating] = useState<'estate' | 'gate' | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsNotice, setGpsNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const [manual, setManual] = useState({ estLat: '', estLng: '', gateLat: '', gateLng: '' });
  const [panelOpen, setPanelOpen] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hasMap = Boolean(getMapboxToken());

  useEffect(() => {
    apiFetch<EstateLocation>('/admin/estate/location')
      .then((l) => {
        setLoc(l);
        if (l.latitude !== null && l.longitude !== null) setEstatePin({ lat: l.latitude, lng: l.longitude });
        if (l.mainGateLatitude !== null && l.mainGateLongitude !== null) {
          setGatePin({ lat: l.mainGateLatitude, lng: l.mainGateLongitude });
        }
        if (l.mainGateName) setGateName(l.mainGateName);
        setInstructions(l.entranceInstructions ?? '');
        setRadius(String(l.arrivalRadiusMeters));
        setQuery(l.address ?? '');
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load the estate location.'));
  }, []);

  // Opening view: existing gate, else estate pin, else the default.
  const initialView = useMemo(() => {
    const start = gatePin ?? estatePin;
    return start
      ? { center: [start.lng, start.lat] as [number, number], zoom: 17 }
      : { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- computed once, when the estate loads
  }, [loc]);

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [];
    if (estatePin) {
      list.push({ id: 'estate', lng: estatePin.lng, lat: estatePin.lat, color: MAP_COLORS.estate, kind: 'estate', draggable: true });
    }
    if (gatePin) {
      list.push({
        id: 'gate',
        lng: gatePin.lng,
        lat: gatePin.lat,
        color: MAP_COLORS.gate,
        kind: 'gate',
        label: gateName || 'Gate',
        draggable: true,
      });
    }
    return list;
  }, [estatePin, gatePin, gateName]);

  const radiusNum = Number(radius);
  const radiusValid = Number.isInteger(radiusNum) && radiusNum >= 30 && radiusNum <= 500;
  const zones = useMemo<MapZone[]>(
    () =>
      gatePin && radiusValid
        ? [{ id: 'arrival', lng: gatePin.lng, lat: gatePin.lat, radiusM: radiusNum, color: MAP_COLORS.gate, dashed: true }]
        : [],
    [gatePin, radiusNum, radiusValid],
  );

  const onCenterChange = useCallback((v: { lng: number; lat: number; zoom: number }) => setView(v), []);

  // Any change to the gate makes an earlier route preview stale.
  const clearRoute = () => {
    setRoute(null);
    setRouteError(null);
  };
  const onMarkerDragEnd = useCallback((id: string, p: { lng: number; lat: number }) => {
    if (id === 'estate') setEstatePin({ lat: p.lat, lng: p.lng });
    if (id === 'gate') {
      setGatePin({ lat: p.lat, lng: p.lng });
      setRoute(null);
      setRouteError(null);
    }
  }, []);

  const closeEnoughForGate = (view?.zoom ?? 0) >= MIN_GATE_ZOOM;

  async function runSearch() {
    setSearchError(null);
    setSearching(true);
    try {
      const found = await searchPlaces(query, view ?? undefined);
      setResults(found);
      if (found.length === 0) setSearchError('No match. Pan the map to the estate yourself, or type the coordinates below.');
    } catch (err) {
      setResults([]);
      setSearchError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  }

  function goTo(place: PlaceResult) {
    setFlyTo({ lng: place.lng, lat: place.lat, zoom: 17 });
    setFlyKey((k) => k + 1);
    setResults([]);
  }

  async function previewRoute() {
    if (!gatePin || !view) return;
    setRouteLoading(true);
    setRouteError(null);
    try {
      // From wherever the map is centred: move the map to where a visitor
      // would come from (e.g. the main road), then preview.
      setRoute(await fetchRoute({ lat: view.lat, lng: view.lng }, gatePin));
    } catch (err) {
      setRoute(null);
      setRouteError(err instanceof Error ? err.message : 'Could not load the route.');
    } finally {
      setRouteLoading(false);
    }
  }

  function applyManual() {
    const estLat = parseCoord(manual.estLat, -90, 90);
    const estLng = parseCoord(manual.estLng, -180, 180);
    const gateLat = parseCoord(manual.gateLat, -90, 90);
    const gateLng = parseCoord(manual.gateLng, -180, 180);
    if ((manual.estLat || manual.estLng) && (estLat === null || estLng === null)) {
      return setFormError('Estate latitude must be between -90 and 90 and longitude between -180 and 180.');
    }
    if ((manual.gateLat || manual.gateLng) && (gateLat === null || gateLng === null)) {
      return setFormError('Gate latitude must be between -90 and 90 and longitude between -180 and 180.');
    }
    setFormError(null);
    if (estLat !== null && estLng !== null) setEstatePin({ lat: estLat, lng: estLng });
    if (gateLat !== null && gateLng !== null) {
      setGatePin({ lat: gateLat, lng: gateLng });
      clearRoute();
      setFlyTo({ lng: gateLng, lat: gateLat, zoom: 17 });
      setFlyKey((k) => k + 1);
    }
  }

  // Fill a pin from this device's GPS. Refuses a rough reading rather than
  // silently saving a pin that could send visitors to the wrong spot.
  async function captureFromDevice(target: 'estate' | 'gate') {
    setFormError(null);
    setGpsNotice(null);
    setGpsAccuracy(null);
    setLocating(target);
    const limit = target === 'gate' ? MAX_ACCURACY_GATE_M : MAX_ACCURACY_ESTATE_M;
    const label = target === 'gate' ? 'main gate' : 'estate pin';
    try {
      const fix = await getBestFix({ onProgress: setGpsAccuracy });
      const rounded = Math.round(fix.accuracyM);
      if (fix.accuracyM > limit) {
        setGpsNotice({
          tone: 'warn',
          text:
            `Your device could only find you to within about ${rounded} m, which isn't accurate enough for the ${label} ` +
            `(it needs ${limit} m or better). Step outside into the open, wait a few seconds and try again` +
            `${hasMap ? ', or place the pin on the map' : ', or type the coordinates below'}.`,
        });
        return;
      }
      const point = { lat: fix.lat, lng: fix.lng };
      if (target === 'gate') {
        setGatePin(point);
        clearRoute();
      } else {
        setEstatePin(point);
      }
      setFlyTo({ lng: fix.lng, lat: fix.lat, zoom: 18 });
      setFlyKey((k) => k + 1);
      setGpsNotice({
        tone: 'ok',
        text: `The ${label} is now set to where you're standing (accurate to about ${rounded} m).`,
      });
    } catch (err) {
      const kind = err instanceof DeviceLocationError ? err.kind : 'unavailable';
      setGpsNotice({
        tone: 'warn',
        text:
          kind === 'denied'
            ? 'Location is blocked for this site. Allow location access in your browser or phone settings, then try again.'
            : kind === 'unsupported'
              ? "This browser can't share its location. Use a phone, or place the pin another way."
              : "Couldn't get a GPS reading. Step outside into the open and try again.",
      });
    } finally {
      setLocating(null);
      setGpsAccuracy(null);
    }
  }

  async function save() {
    setFormError(null);
    if (!estatePin) return setFormError('Set the estate pin first.');
    if (!gatePin) return setFormError('Set the main gate on the map first.');
    if (gateName.trim().length < 2) return setFormError('Give the gate a name, e.g. "Main Gate".');
    if (!radiusValid) return setFormError('Arrival distance must be a whole number between 30 and 500 metres.');

    setSaving(true);
    try {
      await apiFetch<EstateLocation>('/admin/estate/location', {
        method: 'PUT',
        body: JSON.stringify({
          latitude: estatePin.lat,
          longitude: estatePin.lng,
          mainGateName: gateName.trim(),
          mainGateLatitude: gatePin.lat,
          mainGateLongitude: gatePin.lng,
          entranceInstructions: instructions.trim(),
          arrivalRadiusMeters: radiusNum,
        }),
      });
      router.push('/estate');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the location.');
      setSaving(false);
    }
  }

  const routeGap = route && gatePin ? routeEndGapM(route.coordinates, gatePin) : null;

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg">
      {/* Map */}
      <div className="absolute inset-0">
        {hasMap ? (
          <>
            <MapView
              center={initialView.center}
              zoom={initialView.zoom}
              satellite
              markers={markers}
              zones={zones}
              route={route?.coordinates ?? null}
              flyTo={flyTo}
              flyKey={flyKey}
              onCenterChange={onCenterChange}
              onMarkerDragEnd={onMarkerDragEnd}
              className="h-full w-full rounded-none"
            />
            {/* Crosshair: the "Set ... here" buttons use exactly this point. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-7 w-7 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.55)]" />
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center text-sm text-ink-400">
            The map isn&rsquo;t switched on for this app yet (missing map key). You can still use your phone&rsquo;s
            GPS or type coordinates in the panel below.
          </div>
        )}
      </div>

      {/* Top bar: back + search */}
      <header
        className="absolute inset-x-0 top-0 z-10 flex flex-col gap-2 px-3 pb-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2">
          <Link href="/estate" className="glass-surface inline-flex items-center gap-1 rounded-full px-4 py-2.5 text-sm font-medium text-ink">
            <ChevronRightIcon className="h-4 w-4 rotate-180" /> Dashboard
          </Link>
          {hasMap && (
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-white/15 bg-black/70 px-4 py-2 backdrop-blur-xl">
              <SearchIcon className="h-4 w-4 shrink-0 text-ink-400" />
              <input
                aria-label="Find your estate"
                placeholder="Find your estate"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void runSearch();
                }}
                className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-600 focus:outline-none"
              />
              <button
                onClick={() => void runSearch()}
                disabled={searching}
                className="shrink-0 text-sm font-semibold text-brass disabled:opacity-50"
              >
                {searching ? '\u2026' : 'Go'}
              </button>
            </div>
          )}
        </div>
        {(results.length > 0 || searchError) && (
          <div className="rounded-2xl border border-white/15 bg-black/85 backdrop-blur-xl">
            {searchError && <p className="px-4 py-3 text-sm text-ink-400">{searchError}</p>}
            {results.map((r, i) => (
              <button
                key={`${r.lat},${r.lng},${i}`}
                onClick={() => goTo(r)}
                className="block w-full border-t border-white/10 px-4 py-3 text-left text-sm text-ink first:border-t-0 hover:bg-white/[0.05]"
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Bottom panel */}
      <section
        className="absolute inset-x-0 bottom-0 z-10 mx-auto flex max-h-[62dvh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-t-3xl border border-white/10 bg-black/80 px-5 pt-4 backdrop-blur-xl"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={() => setPanelOpen((o) => !o)}
          className="mx-auto h-1.5 w-12 shrink-0 rounded-full bg-white/25"
          aria-label={panelOpen ? 'Collapse panel' : 'Expand panel'}
        />

        {loadError && <p role="alert" className="rounded-lg bg-alert-50 px-4 py-3 text-sm text-alert">{loadError}</p>}

        {panelOpen && !loadError && (
          <>
            <h1 className="font-display text-lg font-semibold text-ink">Estate location &amp; visitor entrance</h1>

            {/* Fastest + most accurate: stand at the gate with a phone. */}
            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 p-4">
              <div>
                <p className="text-sm font-medium text-ink">Let this device find the spot</p>
                <p className="mt-0.5 text-xs text-ink-400">
                  Open this page on your phone, stand in the gateway (outdoors, clear sky) and tap the button. No map or
                  typing needed.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="secondary" disabled={locating !== null} onClick={() => void captureFromDevice('gate')}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: MAP_COLORS.gate }} />
                  {locating === 'gate' ? 'Finding your location\u2026' : 'Use my location as the main gate'}
                </Button>
                <Button type="button" variant="secondary" disabled={locating !== null} onClick={() => void captureFromDevice('estate')}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: MAP_COLORS.estate }} />
                  {locating === 'estate' ? 'Finding your location\u2026' : 'Use my location as the estate pin'}
                </Button>
              </div>
              {locating !== null && (
                <p className="text-xs text-ink-400" aria-live="polite">
                  Waiting for a good GPS signal
                  {gpsAccuracy !== null ? ` \u2014 currently accurate to about ${Math.round(gpsAccuracy)} m` : ''}
                  &hellip;
                </p>
              )}
              {gpsNotice && (
                <p
                  role="status"
                  className={`rounded-lg px-3 py-2 text-sm ${
                    gpsNotice.tone === 'ok' ? 'bg-verified-50 text-verified' : 'bg-warn-50 text-warn'
                  }`}
                >
                  {gpsNotice.text}
                </p>
              )}
              {gatePin && !estatePin && (
                <button type="button" onClick={() => setEstatePin(gatePin)} className="self-start text-sm text-brass underline">
                  Use the gate position for the estate pin too
                </button>
              )}
            </div>

            {hasMap && (
              <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!view}
                    onClick={() => view && (setEstatePin({ lat: view.lat, lng: view.lng }), clearRoute())}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: MAP_COLORS.estate }} />
                    Set estate pin here
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!view || !closeEnoughForGate}
                    onClick={() => view && (setGatePin({ lat: view.lat, lng: view.lng }), clearRoute())}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: MAP_COLORS.gate }} />
                    Set main gate here
                  </Button>
                </div>
                {!closeEnoughForGate && (
                  <p className="text-xs text-warn">
                    Zoom in closer (to street level) to set the gate from the map &mdash; this keeps it accurate to a
                    few metres.
                  </p>
                )}
                <p className="text-xs text-ink-400">
                  Move the map so the circle sits on the spot, then press the button. Visitors are guided to the{' '}
                  <em>gate</em>, not the middle of the estate. Pins can be dragged to fine-tune. The dashed green ring
                  is the &ldquo;arrived&rdquo; zone.
                </p>
              </>
            )}

            <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              <li className="flex items-center gap-2 text-ink-400">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: MAP_COLORS.estate }} />
                Estate pin: {estatePin ? `${estatePin.lat.toFixed(5)}, ${estatePin.lng.toFixed(5)}` : 'not set'}
              </li>
              <li className="flex items-center gap-2 text-ink-400">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: MAP_COLORS.gate }} />
                Main gate: {gatePin ? `${gatePin.lat.toFixed(5)}, ${gatePin.lng.toFixed(5)}` : 'not set'}
              </li>
            </ul>

            {hasMap && gatePin && (
              <div className="flex flex-col gap-2 rounded-xl border border-white/10 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-ink">Check the road reaches your gate</p>
                  <Button type="button" variant="ghost" onClick={() => void previewRoute()} disabled={routeLoading || !view}>
                    {routeLoading ? 'Checking\u2026' : 'Preview route'}
                  </Button>
                </div>
                <p className="text-xs text-ink-400">
                  Move the map to where a visitor would come from (e.g. the main road), then preview. It shows the
                  route visitors will be given.
                </p>
                {route && (
                  <p className="text-sm text-ink">
                    {formatDistance(route.distanceM)} &middot; {formatDuration(route.durationS)} by road.
                  </p>
                )}
                {route && routeGap !== null && routeGap > ROUTE_GAP_WARN_M && (
                  <p className="flex items-start gap-2 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn">
                    <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    The road ends about {formatDistance(routeGap)} from your gate pin, so directions would stop short.
                    Drag the gate pin onto the road at the entrance.
                  </p>
                )}
                {route && routeGap !== null && routeGap <= ROUTE_GAP_WARN_M && (
                  <p className="text-sm text-verified">The route ends at your gate.</p>
                )}
                {routeError && <p className="text-sm text-alert">{routeError}</p>}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Gate name" placeholder="Main Gate" value={gateName} onChange={(e) => setGateName(e.target.value)} />
              <Field
                label={'\u201cArrived\u201d distance (metres)'}
                type="number"
                inputMode="numeric"
                min={30}
                max={500}
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
              />
            </div>
            <Field
              label="Tip for visitors (optional)"
              placeholder="e.g. Beside the Total filling station, green gate"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={240}
            />

            <details className="rounded-xl border border-white/10 px-4 py-3 text-sm">
              <summary className="cursor-pointer font-medium text-ink">Can&rsquo;t find it? Enter coordinates instead</summary>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <Field label="Estate latitude" inputMode="decimal" value={manual.estLat} onChange={(e) => setManual({ ...manual, estLat: e.target.value })} />
                <Field label="Estate longitude" inputMode="decimal" value={manual.estLng} onChange={(e) => setManual({ ...manual, estLng: e.target.value })} />
                <Field label="Gate latitude" inputMode="decimal" value={manual.gateLat} onChange={(e) => setManual({ ...manual, gateLat: e.target.value })} />
                <Field label="Gate longitude" inputMode="decimal" value={manual.gateLng} onChange={(e) => setManual({ ...manual, gateLng: e.target.value })} />
              </div>
              <div className="mt-4">
                <Button type="button" variant="secondary" onClick={applyManual}>
                  Use these coordinates
                </Button>
              </div>
            </details>

            {formError && (
              <p role="alert" className="rounded-lg bg-alert-50 px-4 py-3 text-sm text-alert">
                {formError}
              </p>
            )}

            <div className="flex gap-2">
              <Button type="button" onClick={() => void save()} disabled={saving || !loc}>
                <CheckIcon className="h-4 w-4" /> {saving ? 'Saving\u2026' : 'Save location'}
              </Button>
              <Link href="/estate" className="inline-flex items-center justify-center rounded-[28px] border border-ink-100 px-5 py-3.5 text-sm font-semibold text-ink hover:bg-white/[0.04]">
                Cancel
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
