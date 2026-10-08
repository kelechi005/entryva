// The server POSTs to whatever address a device registers. If any address
// were accepted, a user could register an internal one and make our server
// call it (server-side request forgery). So only the real browser push
// services are allowed: Chrome/Android/Samsung/Edge (Google's FCM), Firefox,
// Safari/iPhone (Apple) and old Edge (Windows). All must be plain https.

const ALLOWED_HOST_SUFFIXES = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];

export function isAllowedPushEndpoint(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
