// Browser side of Web Push. Everything that can differ between phones and
// browsers (support, iPhone needing the app installed, a blocked
// permission) is worked out here and returned as ONE plain state, so the
// screens only have to show the right message.

import { apiFetch } from '@/lib/api-client';

export interface PushConfig {
  enabled: boolean;
  publicKey: string | null;
}

export type PushState =
  | 'loading'
  | 'unsupported' // this browser cannot do push at all
  | 'install-needed' // iPhone/iPad: only works once added to the Home Screen
  | 'server-off' // this estate has not switched push on (no server keys)
  | 'blocked' // the person said "block" in the browser
  | 'off' // possible, just not turned on yet
  | 'on';

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** iPhone/iPad Safari only allows push for apps added to the Home Screen. */
export function needsInstallForPush(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!ios) return false;
  const standalone =
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
  return !standalone;
}

/** The server's public key arrives as URL-safe base64; the browser wants raw bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normal);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  // Just opened: give the service worker a moment to register.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);
}

async function postSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  await apiFetch('/push/subscriptions', {
    method: 'POST',
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
}

export async function readPushState(): Promise<PushState> {
  if (!isPushSupported()) return needsInstallForPush() ? 'install-needed' : 'unsupported';
  if (needsInstallForPush()) return 'install-needed';

  let config: PushConfig;
  try {
    config = await apiFetch<PushConfig>('/push/config');
  } catch {
    return 'server-off';
  }
  if (!config.enabled || !config.publicKey) return 'server-off';
  if (Notification.permission === 'denied') return 'blocked';

  const reg = await getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub && Notification.permission === 'granted') {
    // Re-register quietly: if someone else signed in on this phone since, the
    // device now belongs to whoever is signed in here.
    postSubscription(sub).catch(() => undefined);
    return 'on';
  }
  return 'off';
}

export async function enablePush(): Promise<PushState> {
  const state = await readPushState();
  if (state !== 'off') return state;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';

  const config = await apiFetch<PushConfig>('/push/config');
  const reg = await getRegistration();
  if (!reg || !config.publicKey) return 'unsupported';

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey) as unknown as BufferSource,
    }));
  await postSubscription(sub);
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    const endpoint = sub.endpoint;
    await apiFetch('/push/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint }) }).catch(
      () => undefined,
    );
    await sub.unsubscribe();
  }
  return 'off';
}
