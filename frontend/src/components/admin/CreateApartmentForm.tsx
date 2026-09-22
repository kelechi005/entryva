'use client';

import { FormEvent, useState } from 'react';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { apiFetch } from '@/lib/api-client';
import type { AdminBuilding } from '@/types/admin';

interface CreateApartmentFormProps {
  buildings: AdminBuilding[];
  onCreated: () => void;
}

export function CreateApartmentForm({ buildings, onCreated }: CreateApartmentFormProps) {
  const [buildingId, setBuildingId] = useState('');
  const [flatNumber, setFlatNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!buildingId || !flatNumber.trim()) {
      setError('Choose a building and give the apartment a flat number.');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/admin/apartments', {
        method: 'POST',
        body: JSON.stringify({ buildingId, flatNumber }),
      });
      setFlatNumber('');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the apartment.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 glass-card rounded-2xl p-6">
      <h2 className="font-display text-xl text-ink">Add an apartment</h2>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink-700">Building</label>
        <select
          value={buildingId}
          onChange={(e) => setBuildingId(e.target.value)}
          className="w-full rounded-lg border border-ink-100 bg-white/[0.03] px-3.5 py-2.5 text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-brass/40 focus:border-brass"
        >
          {/* See CreateResidentForm's apartment <select> for why these
              options get explicit colors instead of inheriting text-ink. */}
          <option value="" style={{ color: '#111111', backgroundColor: '#FFFFFF' }}>
            Select a building&hellip;
          </option>
          {buildings.map((b) => (
            <option key={b.id} value={b.id} style={{ color: '#111111', backgroundColor: '#FFFFFF' }}>
              {b.name}
            </option>
          ))}
        </select>
        {buildings.length === 0 && (
          <p className="text-sm text-ink-400">No buildings yet. Add one first.</p>
        )}
      </div>

      <Field
        label="Flat number"
        placeholder="e.g. B-204"
        hint="Free text. Doesn't have to be numeric."
        value={flatNumber}
        onChange={(e) => setFlatNumber(e.target.value)}
      />

      {error && <p className="rounded-lg bg-alert-50 px-4 py-3 text-sm text-alert">{error}</p>}

      <Button type="submit" disabled={submitting || buildings.length === 0}>
        {submitting ? 'Adding\u2026' : 'Add apartment'}
      </Button>
    </form>
  );
}
