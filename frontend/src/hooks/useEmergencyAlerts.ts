'use client';

// Loads the emergency alerts this person may see and keeps them fresh.
// There is no live socket (CLAUDE.md section 4): push wakes the phone, and
// while a screen is open it simply asks again every few seconds. It only
// asks while the page is visible, so a phone in a pocket stays quiet.

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { EmergencyAlertView } from '@/types/alerts';

export function useEmergencyAlerts(intervalMs = 20_000, enabled = true) {
  const [alerts, setAlerts] = useState<EmergencyAlertView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const rows = await apiFetch<EmergencyAlertView[]>('/emergency-alerts');
      if (!mounted.current) return;
      setAlerts(rows);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : 'Could not load alerts.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) {
      setLoading(false);
      return () => {
        mounted.current = false;
      };
    }
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, intervalMs, refresh]);

  return { alerts, setAlerts, loading, error, refresh };
}
