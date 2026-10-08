'use client';

// Turn phone notifications on or off for THIS device.

import { Button } from '@/components/ui/Button';
import { BellIcon } from '@/components/ui/icons';
import { usePushStatus } from '@/hooks/usePushStatus';

const COPY: Record<string, string> = {
  unsupported: "This browser can't receive push notifications. Alerts will still appear inside the app.",
  'install-needed':
    'On iPhone, first add Entryva to your Home Screen (tap Share, then "Add to Home Screen"), open it from there, and come back here to turn notifications on.',
  'server-off':
    "Phone notifications haven't been switched on for this estate yet. Alerts will still appear inside the app.",
  blocked:
    'Notifications are blocked for this site. Allow them in your browser or phone settings, then reload this page.',
};

export function PushToggle() {
  const { state, busy, error, enable, disable } = usePushStatus();
  if (state === 'loading') return null;

  return (
    <div className="glass-card flex flex-col gap-3 rounded-card p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brass-50 text-brass">
          <BellIcon className="h-5 w-5" />
        </span>
        <div>
          <p className="font-display text-base font-semibold text-ink">Phone notifications</p>
          {state === 'on' && (
            <p className="text-sm text-ink-400">
              On for this device. You&rsquo;ll be told about estate notices, security alerts, emergencies and your
              visitors&rsquo; arrivals, even when the app is closed.
            </p>
          )}
          {state === 'off' && (
            <p className="text-sm text-ink-400">
              Get estate notices, security alerts, emergencies and visitor arrivals on your phone, even when the app is
              closed.
            </p>
          )}
          {COPY[state] && <p className="text-sm text-ink-400">{COPY[state]}</p>}
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-alert-50 px-3 py-2 text-sm text-alert">
          {error}
        </p>
      )}
      {state === 'off' && (
        <div>
          <Button onClick={() => void enable()} disabled={busy}>
            {busy ? 'Turning on\u2026' : 'Turn on notifications'}
          </Button>
        </div>
      )}
      {state === 'on' && (
        <div>
          <Button variant="ghost" onClick={() => void disable()} disabled={busy}>
            {busy ? 'Turning off\u2026' : 'Turn off on this device'}
          </Button>
        </div>
      )}
    </div>
  );
}
