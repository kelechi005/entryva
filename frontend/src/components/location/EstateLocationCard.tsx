'use client';

// Admin: set where the estate is and which entrance visitors should use.
//
// How the admin works (no map expertise needed):
//   1. Search for the estate (or just pan/zoom the satellite map to it).
//   2. Put the crosshair on the middle of the estate -> "Set estate pin here".
//   3. Zoom right in on the visitor entrance -> "Set main gate here".
//   4. Name the gate, optionally add a tip, Save.
// Fastest way: open this page on a phone, stand at the gate and tap "Use my
// location as the main gate" - the device's GPS fills it in, no map needed.
// Pins can be dragged to fine-tune. If the map can't find the estate or
// isn't available, the exact coordinates can be typed in instead.

import dynamic from 'next/dynamic';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { AlertIcon, CheckIcon, MapPinIcon, PencilIcon, SearchIcon, XIcon } from '@/components/ui/icons';
import { apiFetch } from '@/lib/api-client';
import {
  DeviceLocationError,
  MAX_ACCURACY_ESTATE_M,
  MAX_ACCURACY_GATE_M,
  getBestFix,
} from '@/lib/device-location';
import { getMapboxToken, searchPlaces, type PlaceResult } from '@/lib/mapbox';
import type { EstateLocation, LatLng } from '@/types/location';

const MapView = dynamic(() => import('@/components/location/MapView'), {
  ssr: false,
  loading: () => <div className="h-80 w-full animate-pulse rounded-2xl bg-white/10" />,
});

// Only the opening view of the map when nothing is set yet (roughly the
// middle of Nigeria). Never saved, never used for navigation.
const DEFAULT_CENTER: [number, number] = [8.675, 9.082];
const DEFAULT_ZOOM = 5;

const ESTATE_COLOR = '#5DA8FF';
const GATE_COLOR = '#22C55E';

function parseCoord(text: string, min: number, max: number): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function EstateLocationCard() {
  const [loc, setLoc] = useState<EstateLocation | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [estatePin, setEstatePin] = useState<LatLng | null>(null);
  const [gatePin, setGatePin] = useState<LatLng | null>(null);
  const [gateName, setGateName] = useState('Main Gate');
  const [instructions, setInstructions] = useState('');
  const [radius, setRadius] = useState('100');
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{ lng: number; lat: number; zoom?: number } | null>(null);
  const [flyKey, setFlyKey] = useState(0);

  const [manual, setManual] = useState({ estLat: '', estLng: '', gateLat: '', gateLng: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // "Use my location" (this device's GPS) state.
  const [locating, setLocating] = useState<'estate' | 'gate' | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsNotice, setGpsNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const hasMap = Boolean(getMapboxToken());

  useEffect(() => {
    apiFetch<EstateLocation>('/admin/estate/location')
      .then(setLoc)
      .catch(() => setLoadError('Could not load the estate location.'));
  }, []);

  function startEditing() {
    if (!loc) return;
    setEstatePin(loc.latitude !== null && loc.longitude !== null ? { lat: loc.latitude, lng: loc.longitude } : null);
    setGatePin(
      loc.mainGateLatitude !== null && loc.mainGateLongitude !== null
        ? { lat: loc.mainGateLatitude, lng: loc.mainGateLongitude }
        : null,
    );
    setGateName(loc.mainGateName ?? 'Main Gate');
    setInstructions(loc.entranceInstructions ?? '');
    setRadius(String(loc.arrivalRadiusMeters));
    setQuery(loc.address ?? '');
    setResults([]);
    setSearchError(null);
    setFormError(null);
    setManual({ estLat: '', estLng: '', gateLat: '', gateLng: '' });
    setEditing(true);
  }

  // Where the map opens: existing gate, else estate pin, else the default.
  const initialView = useMemo(() => {
    const start = gatePin ?? estatePin;
    return start
      ? { center: [start.lng, start.lat] as [number, number], zoom: 17 }
      : { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- computed once when editing starts
  }, [editing]);

  const markers = useMemo(() => {
    const list = [];
    if (estatePin) list.push({ id: 'estate', lng: estatePin.lng, lat: estatePin.lat, color: ESTATE_COLOR, draggable: true });
    if (gatePin) list.push({ id: 'gate', lng: gatePin.lng, lat: gatePin.lat, color: GATE_COLOR, draggable: true });
    return list;
  }, [estatePin, gatePin]);

  const onCenterChange = useCallback((c: { lng: number; lat: number }) => setMapCenter({ lat: c.lat, lng: c.lng }), []);

  const onMarkerDragEnd = useCallback((id: string, p: { lng: number; lat: number }) => {
    if (id === 'estate') setEstatePin({ lat: p.lat, lng: p.lng });
    if (id === 'gate') setGatePin({ lat: p.lat, lng: p.lng });
  }, []);

  async function runSearch() {
    setSearchError(null);
    setSearching(true);
    try {
      const found = await searchPlaces(query, mapCenter ?? undefined);
      setResults(found);
      if (found.length === 0) {
        setSearchError('No match. Pan the map to the estate yourself, or type the coordinates below.');
      }
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

  function applyManual() {
    const estLat = parseCoord(manual.estLat, -90, 90);
    const estLng = parseCoord(manual.estLng, -180, 180);
    const gateLat = parseCoord(manual.gateLat, -90, 90);
    const gateLng = parseCoord(manual.gateLng, -180, 180);
    if ((manual.estLat || manual.estLng) && (estLat === null || estLng === null)) {
      setFormError('Estate latitude must be between -90 and 90 and longitude between -180 and 180.');
      return;
    }
    if ((manual.gateLat || manual.gateLng) && (gateLat === null || gateLng === null)) {
      setFormError('Gate latitude must be between -90 and 90 and longitude between -180 and 180.');
      return;
    }
    setFormError(null);
    if (estLat !== null && estLng !== null) setEstatePin({ lat: estLat, lng: estLng });
    if (gateLat !== null && gateLng !== null) {
      setGatePin({ lat: gateLat, lng: gateLng });
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
      if (target === 'gate') setGatePin(point);
      else setEstatePin(point);
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

  async function save(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!estatePin) return setFormError('Set the estate pin first.');
    if (!gatePin) return setFormError('Set the main gate on the map first.');
    if (gateName.trim().length < 2) return setFormError('Give the gate a name, e.g. "Main Gate".');
    const radiusNum = Number(radius);
    if (!Number.isInteger(radiusNum) || radiusNum < 30 || radiusNum > 500) {
      return setFormError('Arrival distance must be a whole number between 30 and 500 metres.');
    }

    setSaving(true);
    try {
      const updated = await apiFetch<EstateLocation>('/admin/estate/location', {
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
      setLoc(updated);
      setEditing(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the location.');
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="glass-card rounded-card p-5 sm:p-6">
        <p className="text-sm text-alert">{loadError}</p>
      </div>
    );
  }
  if (!loc) return null;

  return (
    <div className="glass-card rounded-card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">Location &amp; entrance</h2>
        {!editing && loc.configured && (
          <button
            onClick={startEditing}
            aria-label="Edit estate location"
            className="rounded-md p-1.5 text-ink-400 hover:bg-white/[0.06] hover:text-ink"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ---- Read-only view ---- */}
      {!editing && !loc.configured && (
        <div className="mt-4 flex flex-col gap-4">
          <p className="flex items-start gap-2 text-sm text-ink-400">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            Visitors can&rsquo;t navigate to your estate yet. Set where the estate is and which gate visitors should use.
          </p>
          <div>
            <Button onClick={startEditing}>
              <MapPinIcon className="h-4 w-4" /> Set up location
            </Button>
          </div>
        </div>
      )}

      {!editing && loc.configured && (
        <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-ink-400">Visitor entrance</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{loc.mainGateName}</dd>
            {loc.entranceInstructions && <dd className="mt-0.5 text-xs text-ink-400">{loc.entranceInstructions}</dd>}
          </div>
          <div>
            <dt className="text-xs font-medium text-ink-400">Gate coordinates</dt>
            <dd className="mt-1 text-sm font-medium text-ink">
              {loc.mainGateLatitude?.toFixed(5)}, {loc.mainGateLongitude?.toFixed(5)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ink-400">&ldquo;Arrived&rdquo; distance</dt>
            <dd className="mt-1 text-sm font-medium text-ink">{loc.arrivalRadiusMeters} m from the gate</dd>
          </div>
        </dl>
      )}

      {/* ---- Editor ---- */}
      {editing && (
        <form onSubmit={save} className="mt-5 flex flex-col gap-5">
          <div className="flex flex-col gap-3 rounded-2xl border border-ink-100 p-4">
            <div>
              <p className="text-sm font-medium text-ink">Let this device find the spot</p>
              <p className="mt-0.5 text-xs text-ink-400">
                Open this page on your phone, stand in the gateway (outdoors, clear sky) and tap the button. No map or
                typing needed.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                disabled={locating !== null}
                onClick={() => void captureFromDevice('gate')}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: GATE_COLOR }} />
                {locating === 'gate' ? 'Finding your location\u2026' : 'Use my location as the main gate'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={locating !== null}
                onClick={() => void captureFromDevice('estate')}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: ESTATE_COLOR }} />
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
              <button
                type="button"
                onClick={() => setEstatePin(gatePin)}
                className="self-start text-sm text-brass underline"
              >
                Use the gate position for the estate pin too
              </button>
            )}
          </div>

          {hasMap ? (
            <>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Field
                      label="Find your estate"
                      placeholder="Estate name or address"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        // Enter here means "search", never "save the whole form".
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void runSearch();
                        }
                      }}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="button" variant="secondary" onClick={() => void runSearch()} disabled={searching}>
                      <SearchIcon className="h-4 w-4" /> {searching ? 'Searching\u2026' : 'Search'}
                    </Button>
                  </div>
                </div>
                {searchError && <p className="text-sm text-ink-400">{searchError}</p>}
                {results.length > 0 && (
                  <ul className="flex flex-col divide-y divide-ink-100 rounded-2xl border border-ink-100">
                    {results.map((r, i) => (
                      <li key={`${r.lat},${r.lng},${i}`}>
                        <button
                          type="button"
                          onClick={() => goTo(r)}
                          className="w-full px-4 py-3 text-left text-sm text-ink hover:bg-white/[0.05]"
                        >
                          {r.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="relative">
                <MapView
                  center={initialView.center}
                  zoom={initialView.zoom}
                  markers={markers}
                  satellite
                  flyTo={flyTo}
                  flyKey={flyKey}
                  onCenterChange={onCenterChange}
                  onMarkerDragEnd={onMarkerDragEnd}
                  className="h-80 w-full"
                />
                {/* Crosshair: "Set ... here" uses exactly this point. */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-6 w-6 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.5)]" />
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!mapCenter}
                  onClick={() => mapCenter && setEstatePin(mapCenter)}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: ESTATE_COLOR }} />
                  Set estate pin here
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!mapCenter}
                  onClick={() => mapCenter && setGatePin(mapCenter)}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: GATE_COLOR }} />
                  Set main gate here
                </Button>
              </div>
              <p className="text-xs text-ink-400">
                Move the map so the circle sits where you want the pin, then press the button. Zoom right in for the
                gate &mdash; visitors are guided to the <em>gate</em>, not the middle of the estate. You can also drag
                a pin to fine-tune it.
              </p>
            </>
          ) : (
            <p className="flex items-start gap-2 rounded-xl bg-warn-50 px-3 py-2 text-sm text-warn">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              The map isn&rsquo;t switched on for this app yet (missing map key). You can still type the coordinates
              below.
            </p>
          )}

          <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <li className="flex items-center gap-2 text-ink-400">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: ESTATE_COLOR }} />
              Estate pin: {estatePin ? `${estatePin.lat.toFixed(5)}, ${estatePin.lng.toFixed(5)}` : 'not set'}
            </li>
            <li className="flex items-center gap-2 text-ink-400">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: GATE_COLOR }} />
              Main gate: {gatePin ? `${gatePin.lat.toFixed(5)}, ${gatePin.lng.toFixed(5)}` : 'not set'}
            </li>
          </ul>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Gate name" placeholder="Main Gate" value={gateName} onChange={(e) => setGateName(e.target.value)} />
            <Field
              label="&ldquo;Arrived&rdquo; distance (metres)"
              type="number"
              inputMode="numeric"
              min={30}
              max={500}
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              hint="Visitors are told they've arrived this close to the gate. 100 works for most estates."
            />
          </div>
          <Field
            label="Tip for visitors (optional)"
            placeholder="e.g. Beside the Total filling station, green gate"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={240}
          />

          <details className="rounded-xl border border-ink-100 px-4 py-3 text-sm">
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
            <Button type="submit" disabled={saving}>
              <CheckIcon className="h-4 w-4" /> {saving ? 'Saving\u2026' : 'Save location'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              <XIcon className="h-4 w-4" /> Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
