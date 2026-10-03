// Pure location maths + the arrival rules. No browser or Mapbox code in
// here on purpose, so every rule can be unit-tested (ENTRYVA.md section 41).

import type { LatLng } from '@/types/location';

const EARTH_RADIUS_M = 6_371_000;

// GPS reports how sure it is ("accuracy" = a radius in metres). Above this
// we do not trust the reading enough to say someone has or hasn't arrived.
export const POOR_ACCURACY_M = 100;

// How many readings in a row must say "arrived" before we believe it, so a
// single GPS jump near the gate can't trigger it.
export const ARRIVAL_CONFIRMATIONS = 2;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type ArrivalState =
  | 'weak-gps' // reading too uncertain to decide
  | 'far' // still on the way
  | 'near' // close - within three times the arrival radius
  | 'arrived'; // inside the arrival zone

export function evaluateArrival(input: { distanceM: number; accuracyM: number; radiusM: number }): ArrivalState {
  const { distanceM, accuracyM, radiusM } = input;
  if (!Number.isFinite(distanceM) || !Number.isFinite(accuracyM)) return 'weak-gps';
  if (accuracyM > POOR_ACCURACY_M) return 'weak-gps';
  if (distanceM <= radiusM) return 'arrived';
  if (distanceM <= radiusM * 3) return 'near';
  return 'far';
}

/** "85 m" under a kilometre, otherwise "3.4 km". */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.max(5, Math.round(meters / 5) * 5)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

/** "9 min", "1 h 5 min". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '';
  const totalMin = Math.max(1, Math.round(seconds / 60));
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * A link that opens the visitor's own maps app with the gate as the
 * destination. Free, needs no token, and is the safety net when our own
 * route can't load (no network for tiles, API error, etc.).
 */
export function externalDirectionsUrl(dest: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`;
}

/**
 * A circle on the map, as a closed ring of [lng, lat] points. Used to draw
 * the "arrived" zone around the gate and the GPS accuracy ring around the
 * visitor, so what the app decides is something people can see.
 */
export function circlePolygon(center: LatLng, radiusM: number, steps = 64): Array<[number, number]> {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(center.lat);
  const lng1 = toRad(center.lng);
  const delta = radiusM / EARTH_RADIUS_M; // angle covered along the surface
  const ring: Array<[number, number]> = [];
  for (let i = 0; i < steps; i += 1) {
    const bearing = (2 * Math.PI * i) / steps;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(delta) + Math.cos(lat1) * Math.sin(delta) * Math.cos(bearing));
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(delta) * Math.cos(lat1),
        Math.cos(delta) - Math.sin(lat1) * Math.sin(lat2),
      );
    ring.push([toDeg(lng2), toDeg(lat2)]);
  }
  ring.push(ring[0]); // close the ring
  return ring;
}

/** Other navigation apps, for visitors who prefer them. Same destination: the gate. */
export function wazeUrl(dest: LatLng): string {
  return `https://waze.com/ul?ll=${dest.lat},${dest.lng}&navigate=yes`;
}

export function appleMapsUrl(dest: LatLng): string {
  return `https://maps.apple.com/?daddr=${dest.lat},${dest.lng}&dirflg=d`;
}

// A gate placed from far away can be hundreds of metres off. The admin
// must zoom to roughly street level before the gate can be set.
export const MIN_GATE_ZOOM = 16;

/**
 * How far the end of a driving route is from the gate pin. Routes end on
 * the nearest ROAD, so a big gap means the pin is off the road network
 * and visitors' directions would stop short of the gate.
 */
export function routeEndGapM(coordinates: Array<[number, number]>, gate: LatLng): number | null {
  const last = coordinates[coordinates.length - 1];
  if (!last) return null;
  return haversineMeters({ lat: last[1], lng: last[0] }, gate);
}
