// Reads the position of THIS device (phone/laptop GPS) so an admin can
// stand at the gate and tap a button instead of finding the spot on a map
// or typing coordinates. Runs entirely in the browser: the position is only
// used to fill in the form, and is saved only when the admin presses Save.
//
// Needs HTTPS and the user's permission (the browser asks).

export interface DeviceFix {
  lat: number;
  lng: number;
  /** GPS's own estimate of its error, as a radius in metres. Smaller is better. */
  accuracyM: number;
}

export class DeviceLocationError extends Error {
  constructor(
    public readonly kind: 'unsupported' | 'denied' | 'unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'DeviceLocationError';
  }
}

// The gate is the point visitors are guided to, so it has to be tight.
// The estate pin is only a rough centre, so it can be looser.
export const MAX_ACCURACY_GATE_M = 50;
export const MAX_ACCURACY_ESTATE_M = 150;

interface BestFixOptions {
  /** Stop waiting and give back the best reading after this long. */
  maxWaitMs?: number;
  /** Stop early as soon as a reading is at least this accurate (metres). */
  goodEnoughM?: number;
  /** Called with the best accuracy so far, so the screen can show progress. */
  onProgress?: (bestAccuracyM: number) => void;
}

/**
 * The first GPS reading is often rough (a phone starts with cell/Wi-Fi
 * position and sharpens as satellites lock). So this keeps listening for a
 * few seconds and returns the most accurate reading it saw, stopping early
 * once one is good enough. Always stops the GPS before it finishes.
 */
export function getBestFix(options: BestFixOptions = {}): Promise<DeviceFix> {
  const { maxWaitMs = 15_000, goodEnoughM = 20, onProgress } = options;

  return new Promise<DeviceFix>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new DeviceLocationError('unsupported', 'This browser cannot share your location.'));
      return;
    }

    let best: DeviceFix | null = null;
    let finished = false;
    let watchId: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (settle: () => void) => {
      if (finished) return;
      finished = true;
      if (timer !== undefined) clearTimeout(timer);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      settle();
    };

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const reading: DeviceFix = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: position.coords.accuracy,
        };
        if (best === null || reading.accuracyM < best.accuracyM) best = reading;
        onProgress?.(best.accuracyM);
        if (best.accuracyM <= goodEnoughM) {
          const result = best;
          finish(() => resolve(result));
        }
      },
      (error) => {
        // 1 = permission denied: no point waiting. Anything else (signal
        // lost, timeout) is usually temporary, so keep listening.
        if (error.code === 1) {
          finish(() => reject(new DeviceLocationError('denied', 'Location permission was denied.')));
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs },
    );
    // If a reading arrived (and finished us) before watchId was assigned.
    if (finished) navigator.geolocation.clearWatch(watchId);

    timer = setTimeout(() => {
      finish(() => {
        if (best) resolve(best);
        else reject(new DeviceLocationError('unavailable', 'Could not get a GPS reading.'));
      });
    }, maxWaitMs);
  });
}
