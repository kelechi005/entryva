'use client';

// First-run guide for a newly registered estate. Every step is derived
// from real counts already returned by /admin/overview — nothing is
// stored, so it can never drift from reality. Disappears on its own
// once all four steps are done.

import Link from 'next/link';
import { CheckCircleIcon, ChevronRightIcon } from '@/components/ui/icons';
import type { AdminOverview } from '@/types/admin';

export function GettingStartedChecklist({ overview }: { overview: AdminOverview }) {
  const steps = [
    { label: 'Add your first building', href: '/properties', done: overview.totalBuildings > 0 },
    { label: 'Add apartments to it', href: '/properties', done: overview.totalApartments > 0 },
    { label: 'Invite your first resident', href: '/residents', done: overview.totalResidents > 0 },
    { label: 'Add a security officer', href: '/security-officers', done: overview.totalSecurityOfficers > 0 },
  ];
  const completed = steps.filter((s) => s.done).length;
  if (completed === steps.length) return null;

  return (
    <div className="glass-card rounded-card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">Getting started</h2>
        <span className="text-xs font-semibold text-ink-400">
          {completed} of {steps.length} done
        </span>
      </div>
      <ul className="mt-4 flex flex-col divide-y divide-ink-100">
        {steps.map((step) => (
          <li key={step.label}>
            <Link
              href={step.href}
              className="flex items-center justify-between gap-3 py-3 text-sm font-medium text-ink hover:text-brass"
            >
              <span className="flex items-center gap-3">
                <CheckCircleIcon className={`h-5 w-5 ${step.done ? 'text-verified' : 'text-ink-400/50'}`} />
                <span className={step.done ? 'text-ink-400 line-through' : ''}>{step.label}</span>
              </span>
              {!step.done && <ChevronRightIcon className="h-4 w-4 text-ink-400" />}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
