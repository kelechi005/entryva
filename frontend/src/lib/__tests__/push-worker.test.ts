/**
 * Tests the service-worker code in frontend/worker/index.js (the part that
 * receives a push message and handles the tap on it). It is loaded the way a
 * real worker would run it, with a stand-in for the worker's `self`.
 */
import fs from 'fs';
import path from 'path';

type Listener = (event: any) => void;

function loadWorker() {
  const listeners: Record<string, Listener> = {};
  const shown: Array<{ title: string; options: any }> = [];
  const opened: string[] = [];
  const focused: string[] = [];
  const navigated: string[] = [];
  let openWindows: Array<{ url: string }> = [];

  const makeClient = (url: string) => ({
    url,
    focus: async () => {
      focused.push(url);
      return { navigate: async (target: string) => navigated.push(target) };
    },
  });

  const fakeSelf = {
    location: { origin: 'https://entryva.tech' },
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = fn;
    },
    registration: {
      showNotification: async (title: string, options: any) => {
        shown.push({ title, options });
      },
    },
    clients: {
      matchAll: async () => openWindows.map((w) => makeClient(w.url)),
      openWindow: async (url: string) => {
        opened.push(url);
      },
    },
  };

  const code = fs.readFileSync(path.join(process.cwd(), 'worker', 'index.js'), 'utf8');
  new Function('self', code)(fakeSelf);

  const waits: Promise<unknown>[] = [];
  const event = (extra: object) => ({ ...extra, waitUntil: (p: Promise<unknown>) => waits.push(p) });

  return {
    push: async (data: unknown, raw?: string) => {
      const ev = event({
        data: { json: () => data, text: () => raw ?? '' },
      });
      listeners['push'](ev);
      await Promise.all(waits);
    },
    pushBroken: async (text: string) => {
      const ev = event({
        data: {
          json: () => {
            throw new Error('not json');
          },
          text: () => text,
        },
      });
      listeners['push'](ev);
      await Promise.all(waits);
    },
    click: async (url: unknown) => {
      let closed = false;
      const ev = event({ notification: { data: url === undefined ? undefined : { url }, close: () => (closed = true) } });
      listeners['notificationclick'](ev);
      await Promise.all(waits);
      return closed;
    },
    setOpenWindows: (urls: string[]) => (openWindows = urls.map((url) => ({ url }))),
    shown,
    opened,
    focused,
    navigated,
    listeners,
  };
}

describe('service worker push handler', () => {
  it('registers exactly the two handlers it needs', () => {
    const w = loadWorker();
    expect(Object.keys(w.listeners).sort()).toEqual(['notificationclick', 'push']);
  });

  it('shows a normal notification quietly', async () => {
    const w = loadWorker();
    await w.push({ title: 'Estate notice', body: 'Water shut-off', url: '/alerts?tab=notices', tag: 'announcement-1', urgent: false });

    expect(w.shown).toHaveLength(1);
    expect(w.shown[0].title).toBe('Estate notice');
    expect(w.shown[0].options).toMatchObject({
      body: 'Water shut-off',
      tag: 'announcement-1',
      requireInteraction: false,
      renotify: false,
      data: { url: '/alerts?tab=notices' },
    });
  });

  it('makes an emergency stay on screen, buzz, and replace an older one', async () => {
    const w = loadWorker();
    await w.push({ title: 'Emergency: Fire', body: 'Block A \u00b7 3 \u2014 Ada', url: '/alerts?tab=emergencies', tag: 'emergency-9', urgent: true });

    expect(w.shown[0].options).toMatchObject({ requireInteraction: true, renotify: true, tag: 'emergency-9' });
    expect(w.shown[0].options.vibrate.length).toBeGreaterThan(1);
  });

  it('still shows something if the message is empty or not JSON', async () => {
    const w = loadWorker();
    await w.push(undefined);
    await w.pushBroken('Plain text message');

    expect(w.shown[0].title).toBe('Entryva');
    expect(w.shown[1]).toMatchObject({ title: 'Entryva', options: { body: 'Plain text message' } });
  });

  it('only ever links inside the app: anything else becomes the home page', async () => {
    const w = loadWorker();
    for (const bad of ['https://evil.example/phish', '//evil.example', 'javascript:alert(1)', 123, undefined]) {
      await w.push({ title: 'x', body: 'y', url: bad });
    }
    await w.push({ title: 'ok', body: 'y', url: '/alerts?tab=notices' });

    expect(w.shown.slice(0, 5).map((s) => s.options.data.url)).toEqual(['/', '/', '/', '/', '/']);
    expect(w.shown[5].options.data.url).toBe('/alerts?tab=notices');
  });
});

describe('service worker notification tap', () => {
  it('closes the notification and opens the app on the right page when it is not open', async () => {
    const w = loadWorker();

    expect(await w.click('/alerts?tab=emergencies')).toBe(true);

    expect(w.opened).toEqual(['https://entryva.tech/alerts?tab=emergencies']);
  });

  it('brings an already-open app forward and takes it to the right page', async () => {
    const w = loadWorker();
    w.setOpenWindows(['https://entryva.tech/gate']);

    await w.click('/alerts?tab=emergencies');

    expect(w.focused).toEqual(['https://entryva.tech/gate']);
    expect(w.navigated).toEqual(['https://entryva.tech/alerts?tab=emergencies']);
    expect(w.opened).toEqual([]);
  });

  it('ignores windows from other sites', async () => {
    const w = loadWorker();
    w.setOpenWindows(['https://other.example/']);

    await w.click('/alerts');

    expect(w.focused).toEqual([]);
    expect(w.opened).toEqual(['https://entryva.tech/alerts']);
  });

  it('falls back to the home page if the notification carries no link', async () => {
    const w = loadWorker();
    await w.click(undefined);
    expect(w.opened).toEqual(['https://entryva.tech/']);
  });
});
