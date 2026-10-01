// Small pure helpers for sharing a visitor's live position.
import { haversineM, type LngLat } from '@/lib/voice-guidance';

/** How often the visitor's phone reports its position while sharing. */
export const SEND_EVERY_MS = 5000;
/** Below this movement the direction of travel is just GPS noise. */
export const MIN_MOVE_FOR_HEADING_M = 8;
/** A reading rougher than this is not worth sending. */
export const MAX_SHARE_ACCURACY_M = 200;

/** Compass bearing from one point to another, in degrees (0 = north). */
export function bearingDeg(from: LngLat, to: LngLat): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLng = rad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(rad(to.lat));
  const x = Math.cos(rad(from.lat)) * Math.sin(rad(to.lat)) - Math.sin(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Keeps the last known direction while standing still, and only turns the
 * car once the visitor has actually moved a few metres.
 */
export function nextHeading(
  anchor: LngLat | null,
  current: LngLat,
  last: number | null,
): { heading: number | null; anchor: LngLat } {
  if (!anchor) return { heading: last, anchor: current };
  if (haversineM(anchor, current) < MIN_MOVE_FOR_HEADING_M) return { heading: last, anchor };
  return { heading: bearingDeg(anchor, current), anchor: current };
}
