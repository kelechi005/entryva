'use client';

import { FormEvent, useState } from 'react';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { apiFetch } from '@/lib/api-client';

interface CreateSecurityOfficerFormProps {
  onCreated: () => void;
}

export function CreateSecurityOfficerForm({ onCreated }: CreateSecurityOfficerFormProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !email.trim() || !employeeCode.trim() || temporaryPassword.length < 8) {
      setError('Fill in name, email, employee code, and a password of at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/admin/security-officers', {
        method: 'POST',
        body: JSON.stringify({ fullName, email, phone, employeeCode, temporaryPassword }),
      });
      setFullName('');
      setEmail('');
      setPhone('');
      setEmployeeCode('');
      setTemporaryPassword('');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the security officer.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 glass-card rounded-2xl p-6">
      <h2 className="font-display text-xl text-ink">Add a security officer</h2>

      <Field label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <Field
        label="Employee code"
        placeholder="e.g. SEC-014"
        value={employeeCode}
        onChange={(e) => setEmployeeCode(e.target.value)}
      />
      <Field
        label="Temporary password"
        hint="Share this with the officer directly; they aren't emailed automatically yet."
        value={temporaryPassword}
        onChange={(e) => setTemporaryPassword(e.target.value)}
      />

      {error && <p className="rounded-lg bg-alert-50 px-4 py-3 text-sm text-alert">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? 'Adding\u2026' : 'Add security officer'}
      </Button>
    </form>
  );
}
