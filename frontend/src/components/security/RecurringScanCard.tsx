'use client';

// What the guard sees after scanning a recurring pass (house help, driver,
// cleaner...). The server has already decided and recorded the scan; this
// card only shows the result. No "allow" button: an allowed scan is final.

import { Button } from '@/components/ui/Button';
import { BuildingIcon, CheckIcon, ClockIcon, UserIcon, XIcon } from '@/components/ui/icons';
import { ROLE_LABELS, formatWindow } from '@/lib/recurring-pass';
import type { RecurringScanResponse } from '@/types/recurring-pass';

interface Props {
  result: RecurringScanResponse;
  onDismiss: () => void;
}

export function RecurringScanCard({ result, onDismiss }: Props) {
  const { pass } = result;
  const title = result.allowed
    ? result.direction === 'OUT'
      ? 'Allowed out'
      : 'Allowed in'
    : result.message;

  const warnings: string[] = [];
  if (result.duplicate) warnings.push('Already scanned a moment ago. Nothing new was recorded.');
  if (result.previousVisitOpen) warnings.push('Their last visit was never marked as left. The resident has been told.');
  else if (result.overdue) warnings.push('Still inside after their allowed hours. The resident has been told.');

  return (
    <div
      className={`mx-auto flex w-full max-w-sm flex-col gap-6 rounded-[32px] border bg-gradient-to-b to-white/[0.02] px-7 py-9 shadow-card ${
        result.allowed ? 'border-verified/30 from-verified/[0.10]' : 'border-alert/30 from-alert/[0.08]'
      }`}
    >
      <div className="flex flex-col items-center gap-2.5 text-center">
        <span
          className={`flex h-16 w-16 items-center justify-center rounded-full ${
            result.allowed ? 'bg-verified-50 text-verified' : 'bg-alert-50 text-alert'
          }`}
        >
          {result.allowed ? <CheckIcon className="h-7 w-7" /> : <XIcon className="h-7 w-7" />}
        </span>
        <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
        {!result.allowed && <p className="text-sm text-ink-400">Do not let this person in.</p>}
      </div>

      {pass && (
        <div className="flex flex-col gap-4 rounded-2xl border border-ink-100 bg-white/[0.03] px-5 py-5">
          <div>
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-400">
              <UserIcon className="h-3.5 w-3.5" /> {ROLE_LABELS[pass.role] ?? 'Recurring pass'}
            </p>
            <p className="mt-0.5 text-base font-semibold text-ink">{pass.fullName}</p>
          </div>
          <div className="h-px bg-ink-100" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink-400">Visiting</p>
              <p className="mt-0.5 truncate text-base font-medium text-ink">{pass.residentName ?? 'Resident'}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="flex items-center justify-end gap-1.5 text-[13px] font-medium text-ink-400">
                <BuildingIcon className="h-3.5 w-3.5" /> Apartment
              </p>
              <p className="mt-0.5 text-base font-medium text-ink">{pass.apartmentLabel ?? '-'}</p>
            </div>
          </div>
          <div className="h-px bg-ink-100" />
          <div>
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-400">
              <ClockIcon className="h-3.5 w-3.5" /> Allowed hours
            </p>
            <p className="mt-0.5 text-base text-ink">{formatWindow(pass.startMinute, pass.endMinute)}</p>
          </div>
        </div>
      )}

      {warnings.map((w) => (
        <p key={w} role="alert" className="rounded-2xl border border-brass/30 bg-brass-50 px-4 py-3 text-sm text-brass">
          {w}
        </p>
      ))}

      <Button variant="secondary" fullWidth onClick={onDismiss}>
        Scan next visitor
      </Button>
    </div>
  );
}
