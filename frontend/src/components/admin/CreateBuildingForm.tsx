'use client';

import { FormEvent, useState } from 'react';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { apiFetch } from '@/lib/api-client';

interface CreateBuildingFormProps {
  onCreated: () => void;
}

export function CreateBuildingForm({ onCreated }: CreateBuildingFormProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Give the building a name.');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/admin/buildings', {
        method: 'POST',
        body: JSON.stringify({ name, code: code.trim() || undefined }),
      });
      setName('');
      setCode('');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the building.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 glass-card rounded-2xl p-6">
      <h2 className="font-display text-xl text-ink">Add a building</h2>

      <Field label="Name" placeholder="e.g. Tower A" value={name} onChange={(e) => setName(e.target.value)} />
      <Field
        label="Code (optional)"
        placeholder="e.g. A"
        hint="A short internal reference, if this estate uses one."
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />

      {error && <p className="rounded-lg bg-alert-50 px-4 py-3 text-sm text-alert">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? 'Adding\u2026' : 'Add building'}
      </Button>
    </form>
  );
}
