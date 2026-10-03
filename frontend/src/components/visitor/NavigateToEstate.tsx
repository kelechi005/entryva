'use client';

// Small card on the visitor's pass page. It only announces the entrance
// and opens the full-screen map (/invite/<token>/navigate). Renders
// NOTHING if the estate hasn't set up an entrance or the link isn't live,
// so the pass page looks exactly as before in that case.

import Link from 'next/link';
import { MapPinIcon } from '@/components/ui/icons';
import { usePublicEntrance } from '@/hooks/usePublicEntrance';

export function NavigateToEstate({ token }: { token: string }) {
  const state = usePublicEntrance(token);
  if (state.status !== 'ready') return null;
  const { entrance } = state;

  return (
    <section className="glass-card mx-auto mb-6 flex w-full max-w-sm flex-col gap-4 rounded-ticket p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brass-50 text-brass">
          <MapPinIcon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Use this entrance</p>
          <p className="font-display text-lg font-semibold text-ink">{entrance.gateName}</p>
          <p className="text-sm text-ink-400">{entrance.estateName}</p>
          {entrance.instructions && <p className="mt-1 text-sm text-ink">{entrance.instructions}</p>}
        </div>
      </div>
      <Link
        href={`/invite/${token}/navigate`}
        className="inline-flex w-full items-center justify-center gap-2 rounded-[28px] bg-gradient-to-b from-brass to-[#3B82F6] px-5 py-3.5 text-sm font-semibold text-white shadow-[0px_10px_30px_rgba(93,168,255,0.35)] hover:brightness-110 active:scale-[0.97]"
      >
        Navigate to Estate
      </Link>
    </section>
  );
}
