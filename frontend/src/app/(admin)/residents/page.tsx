'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { CreateResidentForm } from '@/components/admin/CreateResidentForm';
import { PendingInvitesPanel } from '@/components/admin/PendingInvitesPanel';
import { ConfirmPasswordDialog } from '@/components/admin/ConfirmPasswordDialog';
import { AccountStatusBadge } from '@/components/ui/AccountStatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { PencilIcon, TrashIcon, CheckIcon, XIcon, UserIcon, PlusIcon } from '@/components/ui/icons';
import { apiFetch } from '@/lib/api-client';
import type { AdminResident } from '@/types/admin';

export default function AdminResidentsPage() {
  const [residents, setResidents] = useState<AdminResident[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [invitesRefreshKey, setInvitesRefreshKey] = useState(0);
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const loadResidents = useCallback(() => {
    apiFetch<AdminResident[]>('/admin/residents')
      .then(setResidents)
      .catch(() => setError('Could not load residents.'));
  }, []);

  useEffect(() => {
    loadResidents();
  }, [loadResidents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return residents;
    return residents.filter((r) => {
      const haystack = [
        r.displayName,
        r.apartment.building.name,
        r.apartment.flatNumber,
        r.user.email ?? '',
        r.user.phone ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [residents, query]);

  function startEdit(resident: AdminResident) {
    setEditingId(resident.id);
    setEditName(resident.displayName);
    setRowError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setRowError(null);
  }

  async function saveEdit(e: FormEvent, residentId: string) {
    e.preventDefault();
    if (!editName.trim()) {
      setRowError('Name cannot be empty.');
      return;
    }
    setRowBusy(residentId);
    setRowError(null);
    try {
      await apiFetch(`/admin/residents/${residentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ displayName: editName.trim() }),
      });
      setEditingId(null);
      loadResidents();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not save the name.');
    } finally {
      setRowBusy(null);
    }
  }

  const [pendingRemoval, setPendingRemoval] = useState<AdminResident | null>(null);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [removalBusy, setRemovalBusy] = useState(false);

  function requestRemoveResident(resident: AdminResident) {
    setPendingRemoval(resident);
    setRemovalError(null);
  }

  async function confirmRemoveResident(currentPassword: string) {
    if (!pendingRemoval) return;
    setRemovalBusy(true);
    setRemovalError(null);
    try {
      await apiFetch(`/admin/residents/${pendingRemoval.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ currentPassword }),
      });
      setPendingRemoval(null);
      loadResidents();
    } catch (err) {
      // Surfaces the backend's "Incorrect password" 403 (or any other
      // failure) right inside the dialog rather than closing it, so a
      // typo doesn't lose the admin's place.
      setRemovalError(err instanceof Error ? err.message : 'Could not remove the resident.');
    } finally {
      setRemovalBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Residents"
        subtitle="Manage who lives in the estate and where."
        actions={
          <Button
            variant="secondary"
            className="lg:hidden"
            onClick={() => setFormOpen((v) => !v)}
            aria-expanded={formOpen}
          >
            <PlusIcon className="h-4 w-4" /> {formOpen ? 'Close' : 'Add resident'}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px,1fr] lg:gap-8">
        <div className={`flex-col gap-6 ${formOpen ? 'flex' : 'hidden'} lg:flex`}>
          <CreateResidentForm
            onCreated={() => {
              setInvitesRefreshKey((k) => k + 1);
              loadResidents();
            }}
          />
          <PendingInvitesPanel refreshKey={invitesRefreshKey} />
        </div>

        <div className="flex flex-col gap-4">
          <SearchInput
            placeholder="Search by name, apartment, or contact…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="overflow-hidden rounded-2xl border border-ink-100 glass-card">
            {error && <p className="p-6 text-alert">{error}</p>}

            {!error && residents.length === 0 && (
              <EmptyState
                icon={<UserIcon className="h-5 w-5" />}
                title="No residents yet"
                description="Add the first one using the form on this page."
              />
            )}

            {!error && residents.length > 0 && filtered.length === 0 && (
              <EmptyState title="No residents match your search" description={`Nothing found for "${query}".`} />
            )}

            {filtered.length > 0 && (
              <>
                {/* Desktop / wide layout: table */}
                <table className="hidden w-full text-left text-sm lg:table">
                  <thead className="border-b border-ink-100 text-ink-400">
                    <tr>
                      <th className="px-6 py-3 font-medium">Name</th>
                      <th className="px-6 py-3 font-medium">Apartment</th>
                      <th className="px-6 py-3 font-medium">Contact</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} className="border-b border-ink-100 last:border-0 align-top">
                        <td className="px-6 py-3 font-medium text-ink">
                          {editingId === r.id ? (
                            <form onSubmit={(e) => saveEdit(e, r.id)} className="flex flex-col gap-1.5">
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
                                  disabled={rowBusy === r.id}
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
                              <Avatar name={r.displayName} size="sm" />
                              {r.displayName}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-3 text-ink-400">
                          {r.apartment.building.name} &middot; {r.apartment.flatNumber}
                        </td>
                        <td className="px-6 py-3 text-ink-400">{r.user.email ?? r.user.phone}</td>
                        <td className="px-6 py-3">
                          <AccountStatusBadge status={r.user.status as 'ACTIVE' | 'SUSPENDED'} />
                        </td>
                        <td className="px-6 py-3">
                          {editingId !== r.id && (
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => startEdit(r)}
                                aria-label={`Edit ${r.displayName}`}
                                className="rounded-md p-1.5 text-ink-400 hover:bg-white/[0.06] hover:text-ink"
                              >
                                <PencilIcon />
                              </button>
                              <button
                                onClick={() => requestRemoveResident(r)}
                                disabled={rowBusy === r.id}
                                aria-label={`Remove ${r.displayName}`}
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
                  {filtered.map((r) => (
                    <li key={r.id} className="flex flex-col gap-3 p-4">
                      {editingId === r.id ? (
                        <form onSubmit={(e) => saveEdit(e, r.id)} className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full min-w-0 rounded-lg border border-ink-100 bg-white/[0.03] px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brass/40 focus:border-brass"
                          />
                          <button
                            type="submit"
                            disabled={rowBusy === r.id}
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
                            <Avatar name={r.displayName} />
                            <div>
                              <p className="text-sm font-semibold text-ink">{r.displayName}</p>
                              <p className="text-xs text-ink-400">
                                {r.apartment.building.name} &middot; {r.apartment.flatNumber}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              onClick={() => startEdit(r)}
                              aria-label={`Edit ${r.displayName}`}
                              className="rounded-md p-1.5 text-ink-400 hover:bg-white/[0.06] hover:text-ink"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => requestRemoveResident(r)}
                              disabled={rowBusy === r.id}
                              aria-label={`Remove ${r.displayName}`}
                              className="rounded-md p-1.5 text-ink-400 hover:bg-alert-50 hover:text-alert disabled:opacity-40"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                      {rowError && editingId === r.id && <p className="text-xs text-alert">{rowError}</p>}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-ink-400">{r.user.email ?? r.user.phone}</span>
                        <AccountStatusBadge status={r.user.status as 'ACTIVE' | 'SUSPENDED'} />
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
        title={`Remove ${pendingRemoval?.displayName ?? 'resident'}?`}
        description="They will no longer be able to sign in. Enter your password to confirm."
        busy={removalBusy}
        error={removalError}
        onConfirm={confirmRemoveResident}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  );
}
