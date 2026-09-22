export type Status = 'active' | 'pending' | 'used' | 'expired' | 'revoked' | 'cancelled';

// Invitation statuses from the API are uppercase (mirrors the Prisma
// enum); this badge's style map is keyed lowercase. One shared converter
// so call sites don't each re-derive it slightly differently.
export function toStatusBadgeKey(status: string): Status {
  return status.toLowerCase() as Status;
}

const statusStyles: Record<Status, string> = {
  active: 'bg-verified-50 text-verified',
  pending: 'bg-brass-50 text-brass',
  used: 'bg-white/10 text-ink-400',
  expired: 'bg-white/10 text-ink-400',
  revoked: 'bg-alert-50 text-alert',
  cancelled: 'bg-alert-50 text-alert',
};

const statusDot: Record<Status, string> = {
  active: 'bg-verified',
  pending: 'bg-brass',
  used: 'bg-ink-400',
  expired: 'bg-ink-400',
  revoked: 'bg-alert',
  cancelled: 'bg-alert',
};

const statusLabels: Record<Status, string> = {
  active: 'Active',
  pending: 'Scheduled',
  used: 'Used',
  expired: 'Expired',
  revoked: 'Revoked',
  cancelled: 'Cancelled',
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-xs font-semibold ${statusStyles[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${statusDot[status]}`} />
      {statusLabels[status]}
    </span>
  );
}
