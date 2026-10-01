// Pure helpers for spoken turn-by-turn guidance. No React, no browser
// speech here - just maths and parsing, so it can be unit tested.
//
// Mapbox Directions returns, for every step, a list of voice instructions.
// Each has `distanceAlongGeometry`: speak it once the distance still left in
// that step drops to this value or below.

export interface LngLat {
  lng: number;
  lat: number;
}

export interface VoiceInstruction {
  distanceAlongGeometry: number;
  announcement: string;
}

export interface GuidanceStep {
  /** Where this step's manoeuvre happens. */
  maneuverAt: LngLat;
  /** Where the step ends (the next manoeuvre, or the destination). */
  endsAt: LngLat;
  line: LngLat[];
  instruction: string;
  voice: VoiceInstruction[];
}

export interface GuidanceRoute {
  steps: GuidanceStep[];
  distanceM: number;
  durationS: number;
}

export interface WakeLockLike {
  release(): Promise<void>;
}

/** Closer than this to the gate counts as arrived. */
export const ARRIVED_WITHIN_M = 30;
/** Further than this from the route line counts as off route. */
export const OFF_ROUTE_M = 60;

export function haversineM(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function buildDirectionsUrl(from: LngLat, to: LngLat, token: string): string {
  const params = new URLSearchParams({
    access_token: token,
    steps: 'true',
    geometries: 'geojson',
    overview: 'false',
    voice_instructions: 'true',
    voice_units: 'metric',
    language: 'en',
  });
  return (
    `https://api.mapbox.com/directions/v5/mapbox/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}?${params.toString()}`
  );
}

interface RawStep {
  maneuver?: { location?: number[]; instruction?: string };
  geometry?: { coordinates?: number[][] };
  voiceInstructions?: Array<{ distanceAlongGeometry?: number; announcement?: string }>;
}

interface RawRoute {
  distance?: number;
  duration?: number;
  legs?: Array<{ steps?: RawStep[] }>;
}

export function parseRoute(json: unknown): GuidanceRoute | null {
  const route = (json as { routes?: RawRoute[] } | null)?.routes?.[0];
  const raw = route?.legs?.[0]?.steps;
  if (!route || !Array.isArray(raw) || raw.length === 0) return null;

  const toPoint = (c: number[]): LngLat => ({ lng: c[0], lat: c[1] });
  const steps: GuidanceStep[] = [];

  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    const at = s.maneuver?.location;
    if (!Array.isArray(at) || at.length < 2) return null;
    const coords = s.geometry?.coordinates?.length ? s.geometry.coordinates : [at];
    const line = coords.map(toPoint);
    const nextAt = raw[i + 1]?.maneuver?.location;
    const endsAt = Array.isArray(nextAt) && nextAt.length >= 2 ? toPoint(nextAt) : line[line.length - 1];
    const voice: VoiceInstruction[] = (s.voiceInstructions ?? []).flatMap((v) =>
      typeof v.distanceAlongGeometry === 'number' && typeof v.announcement === 'string'
        ? [{ distanceAlongGeometry: v.distanceAlongGeometry, announcement: v.announcement }]
        : [],
    );
    steps.push({
      maneuverAt: toPoint(at),
      endsAt,
      line,
      instruction: s.maneuver?.instruction ?? '',
      voice,
    });
  }

  return { steps, distanceM: route.distance ?? 0, durationS: route.duration ?? 0 };
}

/**
 * Finds which step the visitor is on (never going backwards from `fromStep`)
 * and how far they are from the route line.
 */
export function locateOnRoute(
  route: GuidanceRoute,
  pos: LngLat,
  fromStep = 0,
): { stepIndex: number; offRouteM: number } {
  const start = Math.min(Math.max(fromStep, 0), route.steps.length - 1);
  let best = { stepIndex: start, offRouteM: Infinity };

  for (let i = start; i < route.steps.length; i++) {
    const line = route.steps[i].line;
    for (let j = 0; j < line.length; j++) {
      const d = haversineM(pos, line[j]);
      if (d < best.offRouteM) best = { stepIndex: i, offRouteM: d };
      if (j > 0) {
        const mid = { lng: (line[j - 1].lng + line[j].lng) / 2, lat: (line[j - 1].lat + line[j].lat) / 2 };
        const dm = haversineM(pos, mid);
        if (dm < best.offRouteM) best = { stepIndex: i, offRouteM: dm };
      }
    }
  }
  return best;
}

/**
 * Picks the instruction to speak now: the most specific one that is due and
 * not yet spoken. Every due instruction is returned in `keys` so the caller
 * can mark them all as spoken (an older, vaguer one is skipped, not repeated).
 */
export function pickAnnouncement(
  step: GuidanceStep,
  remainingM: number,
  spoken: Set<string>,
  stepIndex: number,
): { text: string; keys: string[] } | null {
  const due = step.voice
    .map((v, i) => ({ v, key: `${stepIndex}:${i}` }))
    .filter(({ v, key }) => v.distanceAlongGeometry >= remainingM && !spoken.has(key));
  if (due.length === 0) return null;
  due.sort((a, b) => a.v.distanceAlongGeometry - b.v.distanceAlongGeometry);
  return { text: due[0].v.announcement, keys: due.map((d) => d.key) };
}

/** Asks the phone to keep the screen on while guiding. Null if unsupported. */
export async function acquireWakeLock(): Promise<WakeLockLike | null> {
  try {
    const nav = navigator as unknown as { wakeLock?: { request(type: 'screen'): Promise<WakeLockLike> } };
    return nav.wakeLock ? await nav.wakeLock.request('screen') : null;
  } catch {
    return null;
  }
}
