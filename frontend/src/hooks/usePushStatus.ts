'use client';

import { useCallback, useEffect, useState } from 'react';
import { disablePush, enablePush, readPushState, type PushState } from '@/lib/push';

export function usePushStatus() {
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    readPushState()
      .then((s) => !cancelled && setState(s))
      .catch(() => !cancelled && setState('unsupported'));
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setState(await enablePush());
    } catch {
      setError('Could not turn on notifications. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setState(await disablePush());
    } catch {
      setError('Could not turn off notifications. Try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, error, enable, disable };
}
