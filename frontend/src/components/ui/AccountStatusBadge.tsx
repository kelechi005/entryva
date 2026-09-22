export function AccountStatusBadge({ status }: { status: 'ACTIVE' | 'SUSPENDED' | 'PENDING' }) {
  const styles =
    status === 'ACTIVE'
      ? 'bg-verified-50 text-verified'
      : status === 'PENDING'
        ? 'bg-brass-50 text-brass'
        : 'bg-alert-50 text-alert';
  const dot = status === 'ACTIVE' ? 'bg-verified' : status === 'PENDING' ? 'bg-brass' : 'bg-alert';
  const label = status === 'ACTIVE' ? 'Active' : status === 'PENDING' ? 'Pending' : 'Suspended';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-xs font-semibold ${styles}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
