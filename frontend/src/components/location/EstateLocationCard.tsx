'use client';

// Dashboard card: shows whether visitor navigation is set up, and opens
// the full-screen map editor (/estate-location) to set or change it.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertIcon, MapPinIcon } from '@/components/ui/icons';
import { apiFetch } from '@/lib/api-client';
import type { EstateLocation } from '@/types/location';

const linkClass =
  'inline-flex items-center justify-center gap-2 rounded-[28px] bg-gradient-to-b from-brass to-[#3B82F6] px-5 py-3.5 text-sm font-semibold text-white shadow-[0px_10px_30px_rgba(93,168,255,0.35)] hover:brightness-110 active:scale-[0.97]';

export function EstateLocationCard() {
  const [loc, setLoc] = useState<EstateLocation | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    apiFetch<EstateLocation>('/admin/estate/location')
      .then(setLoc)
      .catch(() => setLoadError(true));
  }, []);

  if (loadError) {
    return (
      <div className="glass-card rounded-card p-5 sm:p-6">
        <p className="text-sm text-alert">Could not load the estate location.</p>
      </div>
    );
  }
  if (!loc) return null;

  return (
    <div className="glass-card rounded-card p-5 sm:p-6">
      <h2 className="font-display text-lg font-semibold text-ink">Location &amp; entrance</h2>

      {loc.configured ? (
        <div className="mt-4 flex flex-col gap-5">
          <dl className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-ink-400">Visitor entrance</dt>
              <dd className="mt-1 text-sm font-medium text-ink">{loc.mainGateName}</dd>
              {loc.entranceInstructions && <dd className="mt-0.5 text-xs text-ink-400">{loc.entranceInstructions}</dd>}
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-400">Gate coordinates</dt>
              <dd className="mt-1 text-sm font-medium text-ink">
                {loc.mainGateLatitude?.toFixed(5)}, {loc.mainGateLongitude?.toFixed(5)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-400">&ldquo;Arrived&rdquo; distance</dt>
              <dd className="mt-1 text-sm font-medium text-ink">{loc.arrivalRadiusMeters} m from the gate</dd>
            </div>
          </dl>
          <div>
            <Link href="/estate-location" className={linkClass}>
              <MapPinIcon className="h-4 w-4" /> Open full-screen map
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <p className="flex items-start gap-2 text-sm text-ink-400">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            Visitors can&rsquo;t navigate to your estate yet. Set where the estate is and which gate visitors should use.
          </p>
          <div>
            <Link href="/estate-location" className={linkClass}>
              <MapPinIcon className="h-4 w-4" /> Set up location
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
