'use client';

// One small thing each role's layout drops in at the top of its content:
//   everyone    -> the "turn on phone notifications" reminder
//   staff       -> plus the red emergency bar (security officers + admin)

import { OpenEmergencyBanner } from '@/components/alerts/OpenEmergencyBanner';
import { PushPrompt } from '@/components/alerts/PushPrompt';

export function AlertsBar({ role, inset = false }: { role: 'resident' | 'staff'; inset?: boolean }) {
  return (
    <div className={`flex flex-col gap-3 empty:hidden ${inset ? 'px-5 pt-4 lg:px-8' : ''}`}>
      <PushPrompt />
      {role === 'staff' && <OpenEmergencyBanner />}
    </div>
  );
}
