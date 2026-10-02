'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Field } from '@/components/ui/Field';
import { TimeField } from '@/components/ui/TimeField';
import { Button } from '@/components/ui/Button';
import type { CreateInvitationInput } from '@/types/invitation';

interface CreateVisitorFormProps {
  onSubmit: (input: CreateInvitationInput) => Promise<void>;
  /** Fills in the visitor when the resident picks someone to invite again. */
  initial?: { visitorName?: string; visitorPhone?: string };
}

const emptyForm: CreateInvitationInput = {
  visitorName: '',
  visitorPhone: '',
  visitDate: new Date().toISOString().slice(0, 10),
  startTime: '',
  endTime: '',
  notes: '',
};

export function CreateVisitorForm({ onSubmit, initial }: CreateVisitorFormProps) {
  const [form, setForm] = useState<CreateInvitationInput>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof CreateInvitationInput, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Picking a past visitor fills in their name and phone and keeps the date and times.
  useEffect(() => {
    if (!initial) return;
    setForm((prev) => ({
      ...prev,
      visitorName: initial.visitorName ?? prev.visitorName,
      visitorPhone: initial.visitorPhone ?? prev.visitorPhone,
    }));
  }, [initial]);

  function update<K extends keyof CreateInvitationInput>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const next: typeof errors = {};
    if (!form.visitorName.trim()) next.visitorName = 'Enter the visitor\u2019s name.';
    if (!form.visitDate) next.visitDate = 'Choose a visit date.';
    if (!form.startTime) next.startTime = 'Choose a start time.';
    if (!form.endTime) next.endTime = 'Choose an end time.';
    if (form.startTime && form.endTime && form.endTime <= form.startTime) {
      next.endTime = 'End time must be after start time.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Could not create the invitation. Try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card flex flex-col gap-5 rounded-card p-6 sm:p-7">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brass">Step 1 of 1</p>
        <h2 className="text-lg font-semibold text-ink">Who&rsquo;s visiting?</h2>
      </div>

      <Field
        label="Visitor name"
        placeholder="e.g. John Doe"
        value={form.visitorName}
        onChange={(e) => update('visitorName', e.target.value)}
        error={errors.visitorName}
        autoComplete="off"
      />
      <Field
        label="Phone number (optional)"
        type="tel"
        placeholder="+234 801 234 5678"
        value={form.visitorPhone}
        onChange={(e) => update('visitorPhone', e.target.value)}
      />

      <div className="h-px bg-ink-100" />

      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-ink">Visit details</h2>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Field
          label="Visit date"
          type="date"
          value={form.visitDate}
          onChange={(e) => update('visitDate', e.target.value)}
          error={errors.visitDate}
        />
        <TimeField
          label="Start time"
          value={form.startTime}
          onChange={(v) => update('startTime', v)}
          error={errors.startTime}
        />
        <TimeField
          label="End time"
          value={form.endTime}
          onChange={(v) => update('endTime', v)}
          error={errors.endTime}
        />
      </div>

      <Field
        label="Additional notes (optional)"
        placeholder="e.g. Bring the delivery to the side gate"
        value={form.notes}
        onChange={(e) => update('notes', e.target.value)}
      />

      {submitError && (
        <p role="alert" className="rounded-2xl border border-alert/30 bg-alert-50 px-4 py-3 text-sm text-alert">
          {submitError}
        </p>
      )}

      <Button type="submit" fullWidth disabled={submitting} className="h-[54px] text-base">
        {submitting ? 'Generating pass\u2026' : 'Generate Pass'}
      </Button>
    </form>
  );
}
