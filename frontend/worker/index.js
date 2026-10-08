// Runs inside the service worker (the part of the app that stays alive when
// the app is closed). The PWA tool picks this file up automatically and adds
// it to the generated sw.js. It does exactly two things:
//   1. a push message arrives  -> show it on the phone
//   2. the person taps it      -> open / focus the app on the right page

self.addEventListener('push', (event) => {
  let data = {};
  try {
    const parsed = event.data ? event.data.json() : {};
    // "null", a number or an array is valid JSON but not a message.
    data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    data = { title: 'Entryva', body: event.data ? event.data.text() : '' };
  }

  const urgent = Boolean(data.urgent);
  const url = typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//') ? data.url : '/';

  event.waitUntil(
    self.registration.showNotification(data.title || 'Entryva', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Same tag = replaces the earlier one instead of piling up.
      tag: data.tag || undefined,
      renotify: Boolean(data.tag) && urgent,
      // Emergencies stay on screen until someone deals with them.
      requireInteraction: urgent,
      vibrate: urgent ? [300, 150, 300, 150, 600] : [120],
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Already open somewhere? Bring it forward and take it to the right page.
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.focus().then((focused) => ('navigate' in focused ? focused.navigate(target) : focused));
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
