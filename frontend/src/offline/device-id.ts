// A stable identifier for *this browser/device*, not this user session —
// the offline sync batch reports which device a queued event came from
// (OfflineSyncEvent.deviceId), which matters if an estate has several
// gate tablets sharing officer accounts. Persisted in localStorage so it
// survives a page reload but is deliberately not tied to login state.

const DEVICE_ID_KEY = 'evp_device_id';

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
