import { apiFetch } from '@/lib/api-client';
import {
  disablePush,
  enablePush,
  isPushSupported,
  needsInstallForPush,
  readPushState,
  urlBase64ToUint8Array,
} from '../push';

jest.mock('@/lib/api-client', () => ({ apiFetch: jest.fn() }));

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1';

let subscription: any;
let registration: any;

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

function setupBrowser({ permission = 'default' as NotificationPermission, existing = null as any } = {}) {
  subscription = existing;
  registration = {
    pushManager: {
      getSubscription: jest.fn(async () => subscription),
      subscribe: jest.fn(async () => {
        subscription = {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } }),
          unsubscribe: jest.fn(async () => true),
        };
        return subscription;
      }),
    },
  };
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: jest.fn(async () => registration), ready: Promise.resolve(registration) },
  });
  (window as any).PushManager = function PushManager() {};
  (window as any).Notification = { permission, requestPermission: jest.fn(async () => 'granted') };
}

function api(config: { enabled: boolean; publicKey: string | null }) {
  (apiFetch as jest.Mock).mockImplementation(async (path: string) => (path === '/push/config' ? config : { success: true }));
}

beforeEach(() => {
  jest.clearAllMocks();
  setUserAgent('Mozilla/5.0 (Linux; Android 14) Chrome/120');
  setupBrowser();
  api({ enabled: true, publicKey: 'BPublicKey_-' });
});

describe('urlBase64ToUint8Array', () => {
  it('turns URL-safe base64 into bytes', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3]);
    // "-" and "_" are the URL-safe forms of "+" and "/"; missing "=" padding is fine.
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255]);
  });
});

describe('support detection', () => {
  it('detects a browser that can do push', () => {
    expect(isPushSupported()).toBe(true);
  });

  it('only asks iPhones to install the app first, not other phones', () => {
    expect(needsInstallForPush()).toBe(false);
    setUserAgent(IPHONE_UA);
    expect(needsInstallForPush()).toBe(true);
    (window.navigator as any).standalone = true; // opened from the Home Screen
    expect(needsInstallForPush()).toBe(false);
    delete (window.navigator as any).standalone;
  });
});

describe('readPushState', () => {
  it('is "install-needed" on an iPhone that has not added the app to the Home Screen', async () => {
    setUserAgent(IPHONE_UA);
    delete (window as any).PushManager; // Safari hides push outside the installed app
    expect(await readPushState()).toBe('install-needed');
  });

  it('is "unsupported" when the browser cannot do push', async () => {
    delete (window as any).PushManager;
    expect(await readPushState()).toBe('unsupported');
  });

  it('is "server-off" when the estate has no push keys (or the config cannot be read)', async () => {
    api({ enabled: false, publicKey: null });
    expect(await readPushState()).toBe('server-off');
    (apiFetch as jest.Mock).mockRejectedValue(new Error('down'));
    expect(await readPushState()).toBe('server-off');
  });

  it('is "blocked" when the person said no in the browser', async () => {
    setupBrowser({ permission: 'denied' });
    expect(await readPushState()).toBe('blocked');
  });

  it('is "off" when possible but not turned on', async () => {
    expect(await readPushState()).toBe('off');
  });

  it('is "on" when this device is subscribed, and quietly re-registers it to the signed-in person', async () => {
    setupBrowser({
      permission: 'granted',
      existing: { endpoint: 'https://fcm.googleapis.com/x', toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p', auth: 'a' } }) },
    });
    expect(await readPushState()).toBe('on');
    expect(apiFetch).toHaveBeenCalledWith(
      '/push/subscriptions',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p', auth: 'a' } }) }),
    );
  });
});

describe('enablePush / disablePush', () => {
  it('asks permission, subscribes with the server key, and tells the server', async () => {
    expect(await enablePush()).toBe('on');

    expect((window as any).Notification.requestPermission).toHaveBeenCalled();
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true, applicationServerKey: expect.anything() }),
    );
    const post = (apiFetch as jest.Mock).mock.calls.find(([p, init]) => p === '/push/subscriptions' && init?.method === 'POST');
    expect(JSON.parse(post[1].body)).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'p', auth: 'a' },
    });
  });

  it('does not subscribe when the person says no', async () => {
    (window as any).Notification.requestPermission = jest.fn(async () => 'denied');
    expect(await enablePush()).toBe('blocked');
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('does nothing when push is not available at all', async () => {
    api({ enabled: false, publicKey: null });
    expect(await enablePush()).toBe('server-off');
    expect((window as any).Notification.requestPermission).not.toHaveBeenCalled();
  });

  it('turning off removes it from the server and the device', async () => {
    const unsubscribe = jest.fn(async () => true);
    setupBrowser({
      permission: 'granted',
      existing: { endpoint: 'https://fcm.googleapis.com/x', toJSON: () => ({}), unsubscribe },
    });

    expect(await disablePush()).toBe('off');

    expect(apiFetch).toHaveBeenCalledWith(
      '/push/subscriptions',
      expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/x' }) }),
    );
    expect(unsubscribe).toHaveBeenCalled();
  });
});
