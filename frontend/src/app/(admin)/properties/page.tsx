'use client';

// Admin: buildings & apartments (CLAUDE.md §6.3 — "Create/manage buildings,
// apartments" for Estate Admin). Without this page, the API already
// supports building/apartment CRUD but there was no way to reach it short
// of calling the API directly — and the resident-creation form needs at
// least one apartment to exist before it can onboard anyone.

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { CreateBuildingForm } from '@/components/admin/CreateBuildingForm';
import { CreateApartmentForm } from '@/components/admin/CreateApartmentForm';
import { ConfirmPasswordDialog } from '@/components/admin/ConfirmPasswordDialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { PencilIcon, CheckIcon, XIcon, TrashIcon, BuildingIcon, PlusIcon } from '@/components/ui/icons';
import { apiFetch } from '@/lib/api-client';
import type { AdminApartment, AdminBuilding } from '@/types/admin';

export default function AdminPropertiesPage() {
  const [buildings, setBuildings] = useState<AdminBuilding[]>([]);
  const [apartments, setApartments] = useState<AdminApartment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const [editingBuildingId, setEditingBuildingId] = useState<string | null>(null);
  const [editBuildingName, setEditBuildingName] = useState('');
  const [buildingRowError, setBuildingRowError] = useState<string | null>(null);
  const [buildingRowBusy, setBuildingRowBusy] = useState<string | null>(null);

  const [editingApartmentId, setEditingApartmentId] = useState<string | null>(null);
  const [editFlatNumber, setEditFlatNumber] = useState('');
  const [apartmentRowError, setApartmentRowError] = useState<string | null>(null);
  const [apartmentRowBusy, setApartmentRowBusy] = useState<string | null>(null);

  const [pendingBuildingRemoval, setPendingBuildingRemoval] = useState<AdminBuilding | null>(null);
  const [buildingRemovalError, setBuildingRemovalError] = useState<string | null>(null);
  const [buildingRemovalBusy, setBuildingRemovalBusy] = useState(false);

  const load = useCallback(() => {
    apiFetch<AdminBuilding[]>('/admin/buildings')
      .then(setBuildings)
      .catch(() => setError('Could not load buildings.'));
    apiFetch<AdminApartment[]>('/admin/apartments')
      .then(setApartments)
      .catch(() => setError('Could not load apartments.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const apartmentsByBuilding = useMemo(() => {
    const q = query.trim().toLowerCase();
    return buildings
      .map((building) => ({
        building,
        apartments: apartments.filter((a) => a.building.id === building.id),
      }))
      .map(({ building, apartments: aptsInBuilding }) => {
        if (!q) return { building, apartments: aptsInBuilding, buildingMatched: true };
        const buildingMatched = building.name.toLowerCase().includes(q);
        const matchedApartments = buildingMatched
          ? aptsInBuilding
          : aptsInBuilding.filter((a) => a.flatNumber.toLowerCase().includes(q));
        return { building, apartments: matchedApartments, buildingMatched };
      })
      .filter(({ buildingMatched, apartments: matchedApartments }) => !query.trim() || buildingMatched || matchedApartments.length > 0);
  }, [buildings, apartments, query]);

  function startEditBuilding(building: AdminBuilding) {
    setEditingBuildingId(building.id);
    setEditBuildingName(building.name);
    setBuildingRowError(null);
  }

  function cancelEditBuilding() {
    setEditingBuildingId(null);
    setBuildingRowError(null);
  }

  async function saveBuildingEdit(e: FormEvent, buildingId: string) {
    e.preventDefault();
    if (!editBuildingName.trim()) {
      setBuildingRowError('Name cannot be empty.');
      return;
    }
    setBuildingRowBusy(buildingId);
    setBuildingRowError(null);
    try {
      await apiFetch(`/admin/buildings/${buildingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editBuildingName.trim() }),
      });
      setEditingBuildingId(null);
      load();
    } catch (err) {
      setBuildingRowError(err instanceof Error ? err.message : 'Could not save the building name.');
    } finally {
      setBuildingRowBusy(null);
    }
  }

  function startEditApartment(apartment: AdminApartment) {
    setEditingApartmentId(apartment.id);
    setEditFlatNumber(apartment.flatNumber);
    setApartmentRowError(null);
  }

  function cancelEditApartment() {
    setEditingApartmentId(null);
    setApartmentRowError(null);
  }

  async function saveApartmentEdit(e: FormEvent, apartmentId: string) {
    e.preventDefault();
    if (!editFlatNumber.trim()) {
      setApartmentRowError('Flat number cannot be empty.');
      return;
    }
    setApartmentRowBusy(apartmentId);
    setApartmentRowError(null);
    try {
      await apiFetch(`/admin/apartments/${apartmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ flatNumber: editFlatNumber.trim() }),
      });
      setEditingApartmentId(null);
      load();
    } catch (err) {
      // Surfaces the backend's "already exists in this building" 409 verbatim.
      setApartmentRowError(err instanceof Error ? err.message : 'Could not save the flat number.');
    } finally {
      setApartmentRowBusy(null);
    }
  }

  function requestRemoveBuilding(building: AdminBuilding) {
    setPendingBuildingRemoval(building);
    setBuildingRemovalError(null);
  }

  async function confirmRemoveBuilding(currentPassword: string) {
    if (!pendingBuildingRemoval) return;
    setBuildingRemovalBusy(true);
    setBuildingRemovalError(null);
    try {
      await apiFetch(`/admin/buildings/${pendingBuildingRemoval.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ currentPassword }),
      });
      setPendingBuildingRemoval(null);
      load();
    } catch (err) {
      // Surfaces the backend's "Incorrect password" 403, or the "still
      // has N apartments" 409, right inside the dialog.
      setBuildingRemovalError(err instanceof Error ? err.message : 'Could not remove the building.');
    } finally {
      setBuildingRemovalBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Buildings & apartments"
        subtitle="The estate's physical structure. Add a building first, then apartments within it. Residents can only be onboarded into an apartment that already exists here."
        actions={
          <Button
            variant="secondary"
            className="lg:hidden"
            onClick={() => setFormOpen((v) => !v)}
            aria-expanded={formOpen}
          >
            <PlusIcon className="h-4 w-4" /> {formOpen ? 'Close' : 'Add'}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px,1fr] lg:gap-8">
        <div className={`flex-col gap-6 ${formOpen ? 'flex' : 'hidden'} lg:flex`}>
          <CreateBuildingForm onCreated={load} />
          <CreateApartmentForm buildings={buildings} onCreated={load} />
        </div>

        <div className="flex flex-col gap-4">
          <SearchInput
            placeholder="Search by building or flat number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {error && <p className="text-alert">{error}</p>}
          {!error && buildings.length === 0 && (
            <div className="rounded-2xl border border-ink-100 glass-card">
              <EmptyState
                icon={<BuildingIcon className="h-5 w-5" />}
                title="No buildings yet"
                description="Add the first one using the form on this page."
              />
            </div>
          )}
          {!error && buildings.length > 0 && apartmentsByBuilding.length === 0 && (
            <div className="rounded-2xl border border-ink-100 glass-card">
              <EmptyState title="Nothing matches your search" description={`No building or apartment found for "${query}".`} />
            </div>
          )}

          {apartmentsByBuilding.map(({ building, apartments: aptsInBuilding }) => {
            const occupiedCount = aptsInBuilding.filter((a) => a.status === 'OCCUPIED').length;
            return (
              <div key={building.id} className="rounded-2xl border border-ink-100 glass-card p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  {editingBuildingId === building.id ? (
                    <form
                      onSubmit={(e) => saveBuildingEdit(e, building.id)}
                      className="flex flex-1 items-center gap-2"
                    >
                      <input
                        autoFocus
                        value={editBuildingName}
                        onChange={(e) => setEditBuildingName(e.target.value)}
                        className="w-48 rounded-lg border border-ink-100 bg-white/[0.03] px-2.5 py-1.5 text-base font-display text-ink focus:outline-none focus:ring-2 focus:ring-brass/40 focus:border-brass"
                      />
                      <button
                        type="submit"
                        disabled={buildingRowBusy === building.id}
                        aria-label="Save building name"
                        className="rounded-md p-1 text-verified hover:bg-verified-50 disabled:opacity-40"
                      >
                        <CheckIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditBuilding}
                        aria-label="Cancel"
                        className="rounded-md p-1 text-ink-400 hover:bg-white/[0.06]"
                      >
                        <XIcon className="h-4 w-4" />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-lg text-ink">{building.name}</h3>
                      <button
                        onClick={() => startEditBuilding(building)}
                        aria-label={`Edit ${building.name}`}
                        className="rounded-md p-1 text-ink-400 hover:bg-white/[0.06] hover:text-ink"
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => requestRemoveBuilding(building)}
                        aria-label={`Remove ${building.name}`}
                        className="rounded-md p-1 text-ink-400 hover:bg-alert-50 hover:text-alert"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    {building.code && editingBuildingId !== building.id && (
                      <span className="text-sm text-ink-400">{building.code}</span>
                    )}
                    {aptsInBuilding.length > 0 && (
                      <span className="text-xs font-medium text-ink-400">
                        {occupiedCount}/{aptsInBuilding.length} occupied
                      </span>
                    )}
                  </div>
                </div>
                {editingBuildingId === building.id && buildingRowError && (
                  <p className="mt-1 text-xs text-alert">{buildingRowError}</p>
                )}

                <div className="mt-4 border-t border-ink-100 pt-4">
                  {aptsInBuilding.length === 0 ? (
                    <p className="text-sm text-ink-400">No apartments in this building yet.</p>
                  ) : (
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {aptsInBuilding.map((apt) =>
                        editingApartmentId === apt.id ? (
                          <li key={apt.id} className="rounded-lg bg-mist px-3 py-2">
                            <form onSubmit={(e) => saveApartmentEdit(e, apt.id)} className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-1.5">
                                <input
                                  autoFocus
                                  value={editFlatNumber}
                                  onChange={(e) => setEditFlatNumber(e.target.value)}
                                  className="w-full min-w-0 rounded-md border border-ink-100 bg-white/[0.05] px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brass/40 focus:border-brass"
                                />
                                <button
                                  type="submit"
                                  disabled={apartmentRowBusy === apt.id}
                                  aria-label="Save flat number"
                                  className="shrink-0 rounded-md p-1 text-verified hover:bg-verified-50 disabled:opacity-40"
                                >
                                  <CheckIcon className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditApartment}
                                  aria-label="Cancel"
                                  className="shrink-0 rounded-md p-1 text-ink-400 hover:bg-white/[0.08]"
                                >
                                  <XIcon className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              {apartmentRowError && <p className="text-xs text-alert">{apartmentRowError}</p>}
                            </form>
                          </li>
                        ) : (
                          <li
                            key={apt.id}
                            className="group flex items-center justify-between gap-2 rounded-lg bg-mist px-3 py-2 text-sm text-ink"
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  apt.status === 'OCCUPIED' ? 'bg-verified' : 'bg-ink-400'
                                }`}
                                aria-hidden="true"
                              />
                              {apt.flatNumber}
                            </span>
                            <button
                              onClick={() => startEditApartment(apt)}
                              aria-label={`Edit apartment ${apt.flatNumber}`}
                              className="shrink-0 rounded-md p-0.5 text-ink-400 opacity-0 group-hover:opacity-100 hover:bg-white/[0.1] hover:text-ink"
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ConfirmPasswordDialog
        open={pendingBuildingRemoval !== null}
        title={`Remove ${pendingBuildingRemoval?.name ?? 'building'}?`}
        description="This can't be undone. Enter your password to confirm."
        busy={buildingRemovalBusy}
        error={buildingRemovalError}
        onConfirm={confirmRemoveBuilding}
        onCancel={() => setPendingBuildingRemoval(null)}
      />
    </div>
  );
}
