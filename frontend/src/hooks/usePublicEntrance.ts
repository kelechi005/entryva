'use client';

// Loads the visitor-facing entrance (gate) for an invitation link.
// 'unavailable' covers every "no navigation here" case: not set up by the
// estate, invitation no longer live, network error. Callers just hide or
// explain; they never need to tell these apart.

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { PublicEntrance } from '@/types/location';

export type EntranceState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; entrance: PublicEntrance };

export function usePublicEntrance(token: string): EntranceState {
  const [state, setState] = useState<EntranceState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    apiFetch<PublicEntrance>(`/invitations/public/${token}/location`)
      .then((entrance) => {
        if (!cancelled) setState({ status: 'ready', entrance });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'unavailable' });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return state;
}
