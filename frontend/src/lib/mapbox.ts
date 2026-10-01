// The only file that talks to Mapbox's web APIs (search + directions).
// The token is a PUBLIC Mapbox token (starts with "pk."): it is meant to
// ship in the browser, so protect it in the Mapbox dashboard by
// restricting it to your own website URL - never put a secret "sk." token
// anywhere in the frontend.
//
// Cost control (ENTRYVA.md section 38): nothing here polls. A route is
// requested once per tap, a search once per tap.

import type { LatLng } from '@/types/location';

export class MapboxError extends Error {
  constructor(
    public readonly kind: 'no-token' | 'request-failed' | 'no-route',
    message: string,
  ) {
    super(message);
    this.name = 'MapboxError';
  }
}

// Must be written exactly like this: Next.js only inlines NEXT_PUBLIC_*
// values into the browser bundle when they are accessed by literal name.
export function getMapboxToken(): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  return token && token.startsWith('pk.') ? token : null;
}

export interface PlaceResult {
  label: string;
  lat: number;
  lng: number;
}

/**
 * Finds places by name/address. Used ONLY to move the admin's map to the
 * right area; the coordinates we save are the ones the admin places on
 * the map themselves, not the search result (Mapbox's default search
 * results may not be stored).
 */
export async function searchPlaces(query: string, near?: LatLng, signal?: AbortSignal): Promise<PlaceResult[]> {
  const token = getMapboxToken();
  if (!token) throw new MapboxError('no-token', 'Map search is not configured.');
  const q = query.trim();
  if (q.length < 3) return [];

  const params = new URLSearchParams({ q, limit: '5', access_token: token });
  if (near) params.set('proximity', `${near.lng},${near.lat}`);

  let res: Response;
  try {
    res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params}`, { signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new MapboxError('request-failed', 'Could not reach map search. Check your connection.');
  }
  if (!res.ok) throw new MapboxError('request-failed', 'Map search failed. Try again.');

  const body = (await res.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: { full_address?: string; name?: string; place_formatted?: string };
    }>;
  };

  const results: PlaceResult[] = [];
  for (const f of body.features ?? []) {
    const coords = f.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    const p = f.properties ?? {};
    const label = p.full_address || [p.name, p.place_formatted].filter(Boolean).join(', ') || 'Unnamed place';
    results.push({ label, lng: coords[0], lat: coords[1] });
  }
  return results;
}

export interface RouteStep {
  instruction: string;
  distanceM: number;
}

export interface RouteResult {
  distanceM: number;
  durationS: number;
  /** [lng, lat] pairs, in GeoJSON order. */
  coordinates: Array<[number, number]>;
  steps: RouteStep[];
}

/** One driving route from -> to. Call once per user action, never in a loop. */
export async function fetchRoute(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<RouteResult> {
  const token = getMapboxToken();
  if (!token) throw new MapboxError('no-token', 'Map routing is not configured.');

  const params = new URLSearchParams({
    geometries: 'geojson',
    overview: 'full',
    steps: 'true',
    access_token: token,
  });
  const path = `${from.lng},${from.lat};${to.lng},${to.lat}`;

  let res: Response;
  try {
    res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${path}?${params}`, { signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new MapboxError('request-failed', 'Could not reach the route service. Check your connection.');
  }
  if (!res.ok) throw new MapboxError('request-failed', 'Could not load the route.');

  const body = (await res.json()) as {
    routes?: Array<{
      distance: number;
      duration: number;
      geometry?: { coordinates?: Array<[number, number]> };
      legs?: Array<{ steps?: Array<{ distance: number; maneuver?: { instruction?: string } }> }>;
    }>;
  };
  const route = body.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (!route || !coordinates || coordinates.length < 2) {
    throw new MapboxError('no-route', 'No driving route was found to the gate.');
  }

  const steps: RouteStep[] = [];
  for (const leg of route.legs ?? []) {
    for (const s of leg.steps ?? []) {
      if (s.maneuver?.instruction) steps.push({ instruction: s.maneuver.instruction, distanceM: s.distance });
    }
  }

  return { distanceM: route.distance, durationS: route.duration, coordinates, steps };
}
