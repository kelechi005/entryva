'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClockIcon } from '@/components/ui/icons';
import { apiFetch } from '@/lib/api-client';
import { describeAuditLog } from '@/lib/audit-log-descriptions';
import type { AdminAuditLog } from '@/types/admin';

// Purely cosmetic grouping label. Every value here still comes straight
// from createdAt, nothing invented.
function dayLabel(date: Date, today: Date): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(date)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    apiFetch<AdminAuditLog[]>('/audit-logs')
      .then(setLogs)
      .catch(() => setError('Could not load audit logs.'));
  }, []);

  // Each log is described once here (not once per render pass further
  // down) so filtering and rendering both search the same plain-language
  // text the admin actually sees, not the raw action code underneath it.
  const described = useMemo(() => logs.map((log) => ({ log, text: describeAuditLog(log) })), [logs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return described;
    return described.filter(({ text }) => `${text.summary} ${text.detail ?? ''}`.toLowerCase().includes(q));
  }, [described, query]);

  const groups = useMemo(() => {
    const now = new Date();
    const map = new Map<string, typeof filtered>();
    for (const entry of filtered) {
      const label = dayLabel(new Date(entry.log.createdAt), now);
      const bucket = map.get(label);
      if (bucket) bucket.push(entry);
      else map.set(label, [entry]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Audit logs"
        subtitle="A plain-language record of what happened in your estate: admin changes, sign-ins, visitor passes, and gate activity."
      />

      <SearchInput
        placeholder="Search, for example a name or 'removed'"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="overflow-hidden rounded-2xl border border-ink-100 glass-card">
        {error && <p className="p-6 text-alert">{error}</p>}

        {!error && logs.length === 0 && (
          <EmptyState icon={<ClockIcon className="h-5 w-5" />} title="No activity recorded yet" />
        )}

        {!error && logs.length > 0 && filtered.length === 0 && (
          <EmptyState title="Nothing matches your search" description={`No activity found for "${query}".`} />
        )}

        {filtered.length > 0 && (
          <>
            {/* Desktop / wide layout: table, grouped by day */}
            <div className="hidden lg:block">
              {groups.map(([label, groupEntries]) => (
                <table key={label} className="w-full text-left text-sm">
                  <thead className="border-b border-ink-100 text-ink-400">
                    <tr>
                      <th className="px-6 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide" colSpan={2}>
                        {label}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupEntries.map(({ log, text }) => (
                      <tr key={log.id} className="border-b border-ink-100 last:border-0">
                        <td className="px-6 py-3">
                          <p className="font-medium text-ink">{text.summary}</p>
                          {text.detail && <p className="text-xs text-ink-400">{text.detail}</p>}
                        </td>
                        <td className="px-6 py-3 text-right text-ink-400">
                          {new Date(log.createdAt).toLocaleTimeString(undefined, {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>

            {/* Narrow layout: grouped cards */}
            <div className="lg:hidden">
              {groups.map(([label, groupEntries]) => (
                <div key={label}>
                  <p className="border-b border-ink-100 bg-white/[0.02] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                    {label}
                  </p>
                  <ul className="divide-y divide-ink-100">
                    {groupEntries.map(({ log, text }) => (
                      <li key={log.id} className="flex items-start gap-3 px-4 py-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-ink-400">
                          <ClockIcon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">{text.summary}</p>
                          {text.detail && <p className="truncate text-xs text-ink-400">{text.detail}</p>}
                        </div>
                        <span className="shrink-0 text-xs text-ink-400">
                          {new Date(log.createdAt).toLocaleTimeString(undefined, {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
