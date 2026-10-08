'use client';

// For security officers and the estate admin: a red bar, on every screen,
// whenever an emergency is still waiting for someone to respond.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertIcon } from '@/components/ui/icons';
import { useEmergencyAlerts } from '@/hooks/useEmergencyAlerts';
import { bannerText, openAlerts } from '@/lib/alerts';

export function OpenEmergencyBanner() {
  const pathname = usePathname();
  const onAlertsPage = pathname?.startsWith('/alerts') ?? false;
  // The alerts page already shows the full list.
  const { alerts } = useEmergencyAlerts(20_000, !onAlertsPage);
  const open = openAlerts(alerts);

  if (onAlertsPage || open.length === 0) return null;

  return (
    <div role="alert" className="flex items-center gap-3 rounded-2xl bg-alert px-4 py-3 text-white shadow-card">
      <AlertIcon className="h-5 w-5 shrink-0" />
      <p className="flex-1 text-sm font-semibold">Emergency: {bannerText(open)}</p>
      <Link href="/alerts?tab=emergencies" className="rounded-full bg-white/20 px-4 py-1.5 text-sm font-semibold hover:bg-white/30">
        Respond
      </Link>
    </div>
  );
}
