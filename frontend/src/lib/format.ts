export function formatVisitWindow(validFrom: string, validUntil: string): string {
  const from = new Date(validFrom);
  const until = new Date(validUntil);
  const dateLabel = from.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const timeFmt = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${dateLabel} · ${timeFmt(from)} – ${timeFmt(until)}`;
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/** "3:45 PM" -- used for individual message timestamps in a chat thread,
 * where absolute time reads better than "5m ago" once you're scrolling
 * through a whole conversation. */
export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "just now" / "5m ago" / "3h ago" / falls back to formatShortDate beyond a day. */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return formatShortDate(iso);
}


function shortTime(d: Date): string {
  // "4 PM" on the hour, "4:30 PM" otherwise, in the person's own locale.
  return d.toLocaleTimeString(
    undefined,
    d.getMinutes() === 0 ? { hour: 'numeric' } : { hour: 'numeric', minute: '2-digit' },
  );
}

function shortDayLabel(d: Date): string {
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(d) - startOfDay(new Date())) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Today · 4 PM – 8 PM" or "Sat, Sep 12 · 4 PM – 8 PM" - the compact form for lists on Home. */
export function formatShortVisitWindow(validFrom: string, validUntil: string): string {
  const from = new Date(validFrom);
  const until = new Date(validUntil);
  return `${shortDayLabel(from)} \u00b7 ${shortTime(from)} \u2013 ${shortTime(until)}`;
}
