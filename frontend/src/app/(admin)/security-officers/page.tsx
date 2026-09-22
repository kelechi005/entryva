'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { CreateSecurityOfficerForm } from '@/components/admin/CreateSecurityOfficerForm';
import { ConfirmPasswordDialog } from '@/components/admin/ConfirmPasswordDialog';
import { AccountStatusBadge } from '@/components/ui/AccountStatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { PencilIcon, TrashIcon, CheckIcon, XIcon, ShieldIcon, PlusIcon } from '@/components/ui/icons';
import { apiFetch } from '@/lib/api-client';
import type { AdminSecurityOfficer } from '@/types/admin';

export default function AdminSecurityOfficersPage() {
  const [officers, setOfficers] = useState<AdminSecurityOfficer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const loadOfficers = useCallback(() => {
    apiFetch<AdminSecurityOfficer[]>('/admin/security-officers')
      .then(setOfficers)
      .catch(() => setError('Could not load security officers.'));
  }, []);

  useEffect(() => {
    loadOfficers();
  }, [loadOfficers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return officers;
    return officers.filter((o) => {
      const haystack = [o.fullName, o.employeeCode, o.user.email ?? '', o.user.phone ?? '']
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [officers, query]);

  function startEdit(officer: AdminSecurityOfficer) {
    setEditingId(officer.id);
    setEditName(officer.fullName);
    setRowError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setRowError(null);
  }

  async function saveEdit(e: FormEvent, officerId: string) {
    e.preventDefault();
    if (!editName.trim()) {
      setRowError('Name cannot be empty.');
      return;
    }
    setRowBusy(officerId);
    setRowError(null);
    try {
      await apiFetch(`/admin/security-officers/${officerId}`, {
        method: 'PATCH',
        body: JSON.stringify({ fullName: editName.trim() }),
      });
      setEditingId(null);
      loadOfficers();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not save the name.');
    } finally {
      setRowBusy(null);
    }
  }

  const [pendingRemoval, setPendingRemoval] = useState<AdminSecurityOfficer | null>(null);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [removalBusy, setRemovalBusy] = useState(false);

  function requestRemoveOfficer(officer: AdminSecurityOfficer) {
    setPendingRemoval(officer);
    setRemovalError(null);
  }

  async function confirmRemoveOfficer(currentPassword: string) {
    if (!pendingRemoval) return;
    setRemovalBusy(true);
    setRemovalError(null);
    try {
      await apiFetch(`/admin/security-officers/${pendingRemoval.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ currentPassword }),
      });
      setPendingRemoval(null);
      loadOfficers();
    } catch (err) {
      // Surfaces the backend's "Incorrect password" 403 (or any other
      // failure) right inside the dialog rather than closing it, so a
      // typo doesn't lose the admin's place.
      setRemovalError(err instanceof Error ? err.message : 'Could not remove the security officer.');
    } finally {
      setRemovalBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Security officers"
        subtitle="Manage who can verify visitors at the gate."
        actions={
          <Button
            variant="secondary"
            className="lg:hidden"
            onClick={() => setFormOpen((v) => !v)}
            aria-expanded={formOpen}
          >
            <PlusIcon className="h-4 w-4" /> {formOpen ? 'Close' : 'Add officer'}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px,1fr] lg:gap-8">
        <div className={`${formOpen ? 'block' : 'hidden'} lg:block`}>
          <CreateSecurityOfficerForm onCreated={loadOfficers} />
        </div>

        <div className="flex flex-col gap-4">
          <SearchInput
            placeholder="Search by name, code, or contact…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="overflow-hidden rounded-2xl border border-ink-100 glass-card">
            {error && <p className="p-6 text-alert">{error}</p>}

            {!error && officers.length === 0 && (
              <EmptyState
                icon={<ShieldIcon className="h-5 w-5" />}
                title="No security officers yet"
                description="Add the first one using the form on this page."
              />
            )}

            {!error && officers.length > 0 && filtered.length === 0 && (
              <EmptyState title="No officers match your search" description={`Nothing found for "${query}".`} />
            )}

            {filtered.length > 0 && (
              <>
                {/* Desktop / wide layout: table */}
                <table className="hidden w-full text-left text-sm lg:table">
                  <thead className="border-b border-ink-100 text-ink-400">
                    <tr>
                      <th className="px-6 py-3 font-medium">Name</th>
                      <th className="px-6 py-3 font-medium">Employee code</th>
                      <th className="px-6 py-3 font-medium">Contact</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((o) => (
                      <tr key={o.id} className="border-b border-ink-100 last:border-0 align-top">
                        <td className="px-6 py-3 font-medium text-ink">
                          {editingId === o.id ? (
                            <form onSubmit={(e) => saveEdit(e, o.id)} className="flex flex-col gap-1.5">
                              <input
                                autoFocus
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-40 rounded-lg border border-ink-100 bg-white/[0.03] px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brass/40 focus:border-brass"
                              />
                              {rowError && <p className="text-xs text-alert">{rowError}</p>}
                              <div className="flex gap-2">
                                <button
                                  type="submit"
                                  disabled={rowBusy === o.id}
                                  aria-label="Save name"
                                  className="rounded-md p-1 text-verified hover:bg-verified-50 disabled:opacity-40"
                                >
                                  <CheckIcon className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  aria-label="Cancel"
                                  className="rounded-md p-1 text-ink-400 hover:bg-white/[0.06]"
                                >
                                  <XIcon className="h-4 w-4" />
                                </button>
                              </div>
                            </form>
                          ) : (
                            <div className="flex items-center gap-3">
                              <Avatar name={o.fullName} size="sm" />
                              {o.fullName}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-3 text-ink-400">{o.employeeCode}</td>
                        <td className="px-6 py-3 text-ink-400">{o.user.email ?? o.user.phone}</td>
                        <td className="px-6 py-3">
                          <AccountStatusBadge status={o.user.status as 'ACTIVE' | 'SUSPENDED'} />
                        </td>
                        <td className="px-6 py-3">
                          {editingId !== o.id && (
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => startEdit(o)}
                                aria-label={`Edit ${o.fullName}`}
                                className="rounded-md p-1.5 text-ink-400 hover:bg-white/[0.06] hover:text-ink"
                              >
                                <PencilIcon />
                              </button>
                              <button
                                onClick={() => requestRemoveOfficer(o)}
                                disabled={rowBusy === o.id}
                                aria-label={`Remove ${o.fullName}`}
                                className="rounded-md p-1.5 text-ink-400 hover:bg-alert-50 hover:text-alert disabled:opacity-40"
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Narrow layout: cards */}
                <ul className="divide-y divide-ink-100 lg:hidden">
                  {filtered.map((o) => (
                    <li key={o.id} className="flex flex-col gap-3 p-4">
                      {editingId === o.id ? (
                        <form onSubmit={(e) => saveEdit(e, o.id)} className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full min-w-0 rounded-lg border border-ink-100 bg-white/[0.03] px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brass/40 focus:border-brass"
                          />
                          <button
                            type="submit"
                            disabled={rowBusy === o.id}
                            aria-label="Save name"
                            className="shrink-0 rounded-md p-1.5 text-verified hover:bg-verified-50 disabled:opacity-40"
                          >
                            <CheckIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            aria-label="Cancel"
                            className="shrink-0 rounded-md p-1.5 text-ink-400 hover:bg-white/[0.06]"
                          >
                            <XIcon className="h-4 w-4" />
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={o.fullName} />
                            <div>
                              <p className="text-sm font-semibold text-ink">{o.fullName}</p>
                              <p className="text-xs text-ink-400">{o.employeeCode}</p>
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              onClick={() => startEdit(o)}
                              aria-label={`Edit ${o.fullName}`}
                              className="rounded-md p-1.5 text-ink-400 hover:bg-white/[0.06] hover:text-ink"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => requestRemoveOfficer(o)}
                              disabled={rowBusy === o.id}
                              aria-label={`Remove ${o.fullName}`}
                              className="rounded-md p-1.5 text-ink-400 hover:bg-alert-50 hover:text-alert disabled:opacity-40"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                      {rowError && editingId === o.id && <p className="text-xs text-alert">{rowError}</p>}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-ink-400">{o.user.email ?? o.user.phone}</span>
                        <AccountStatusBadge status={o.user.status as 'ACTIVE' | 'SUSPENDED'} />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmPasswordDialog
        open={pendingRemoval !== null}
        title={`Remove ${pendingRemoval?.fullName ?? 'security officer'}?`}
        description="They will no longer be able to sign in. Enter your password to confirm."
        busy={removalBusy}
        error={removalError}
        onConfirm={confirmRemoveOfficer}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  );
}
