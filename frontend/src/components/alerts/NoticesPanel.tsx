'use client';

// Estate notices and security alerts: everyone reads them; the admin posts
// notices and security alerts; security officers post security alerts only.
// (The server enforces this - the form here just doesn't offer what you
// can't do.)

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { AlertIcon, TrashIcon } from '@/components/ui/icons';
import { apiFetch } from '@/lib/api-client';
import { formatRelativeTime } from '@/lib/format';
import type { Announcement, AnnouncementKind } from '@/types/alerts';

interface Props {
  role: 'RESIDENT' | 'SECURITY_OFFICER' | 'ESTATE_ADMIN';
}

export function NoticesPanel({ role }: Props) {
  const canPost = role === 'ESTATE_ADMIN' || role === 'SECURITY_OFFICER';
  const canDelete = role === 'ESTATE_ADMIN';
  const canPostNotice = role === 'ESTATE_ADMIN'; // officers: security alerts only

  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [composing, setComposing] = useState(false);
  const [kind, setKind] = useState<AnnouncementKind>(canPostNotice ? 'ANNOUNCEMENT' : 'SECURITY_ALERT');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [toDelete, setToDelete] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await apiFetch<Announcement[]>('/announcements'));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load notices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function validate(): boolean {
    if (title.trim().length < 3) {
      setFormError('Give it a short title (at least 3 letters).');
      return false;
    }
    if (!body.trim()) {
      setFormError('Write the message.');
      return false;
    }
    setFormError(null);
    return true;
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    // Everyone in the estate gets a phone alert: always ask first.
    setConfirmSend(true);
  }

  async function send() {
    setSending(true);
    try {
      const created = await apiFetch<Announcement>('/announcements', {
        method: 'POST',
        body: JSON.stringify({ kind, title: title.trim(), body: body.trim() }),
      });
      setItems((prev) => [created, ...prev]);
      setTitle('');
      setBody('');
      setComposing(false);
      setConfirmSend(false);
    } catch (err) {
      setConfirmSend(false);
      setFormError(err instanceof Error ? err.message : 'Could not send. Try again.');
    } finally {
      setSending(false);
    }
  }

  async function remove() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await apiFetch(`/announcements/${toDelete.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((i) => i.id !== toDelete.id));
      setToDelete(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not delete it.');
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {canPost && !composing && (
        <div>
          <Button
            onClick={() => {
              setComposing(true);
              setFormError(null);
            }}
          >
            {canPostNotice ? 'Post a notice or alert' : 'Send a security alert'}
          </Button>
        </div>
      )}

      {canPost && composing && (
        <form onSubmit={submit} className="glass-card flex flex-col gap-4 rounded-card p-5">
          {canPostNotice && (
            <div role="radiogroup" aria-label="Type" className="flex gap-2">
              {(
                [
                  ['ANNOUNCEMENT', 'Estate notice'],
                  ['SECURITY_ALERT', 'Security alert'],
                ] as Array<[AnnouncementKind, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={kind === value}
                  onClick={() => setKind(value)}
                  className={`rounded-pill px-4 py-2 text-sm font-semibold ${
                    kind === value ? 'bg-brass-50 text-brass' : 'border border-ink-100 text-ink-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {kind === 'SECURITY_ALERT' && (
            <p className="text-sm text-ink-400">
              Urgent. Everyone in the estate gets a phone alert straight away, so use it for real warnings (for example a
              suspicious person near the gate).
            </p>
          )}

          <Field
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder={kind === 'SECURITY_ALERT' ? 'e.g. Suspicious person near the gate' : 'e.g. Water shut-off on Saturday'}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-400">Message</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
              rows={4}
              className="w-full rounded-2xl border border-ink-100 bg-white/[0.03] px-4 py-3 text-[15px] text-ink focus:border-brass/60 focus:outline-none focus:ring-2 focus:ring-brass/40 [color-scheme:dark]"
            />
          </label>

          {formError && (
            <p role="alert" className="rounded-lg bg-alert-50 px-4 py-3 text-sm text-alert">
              {formError}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" variant={kind === 'SECURITY_ALERT' ? 'danger' : 'primary'}>
              Review &amp; send
            </Button>
            <Button type="button" variant="ghost" onClick={() => setComposing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {loadError && (
        <p role="alert" className="rounded-lg bg-alert-50 px-4 py-3 text-sm text-alert">
          {loadError}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-ink-400">Loading&hellip;</p>
      ) : items.length === 0 ? (
        <EmptyState title="No notices yet" description="Estate notices and security alerts will appear here." />
      ) : (
        items.map((n) => (
          <article
            key={n.id}
            className={`glass-card flex flex-col gap-2 rounded-card p-5 ${n.kind === 'SECURITY_ALERT' ? 'border border-alert/40' : ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                {n.kind === 'SECURITY_ALERT' && <AlertIcon className="h-4 w-4 shrink-0 text-alert" />}
                <h3 className="font-display text-lg font-semibold text-ink">{n.title}</h3>
              </div>
              {canDelete && (
                <button
                  type="button"
                  aria-label={`Delete ${n.title}`}
                  onClick={() => setToDelete(n)}
                  className="rounded-md p-1.5 text-ink-400 hover:bg-white/[0.06] hover:text-alert"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink">{n.body}</p>
            <p className="text-xs text-ink-400">
              {n.kind === 'SECURITY_ALERT' ? 'Security alert' : 'Notice'} &middot; {n.authorName} &middot;{' '}
              {formatRelativeTime(n.createdAt)}
            </p>
          </article>
        ))
      )}

      <ConfirmDialog
        open={confirmSend}
        title={kind === 'SECURITY_ALERT' ? 'Send this security alert?' : 'Send this notice?'}
        description="Everyone in the estate will be notified now. This can't be un-sent."
        confirmLabel="Send to everyone"
        variant={kind === 'SECURITY_ALERT' ? 'danger' : 'primary'}
        busy={sending}
        onConfirm={() => void send()}
        onCancel={() => setConfirmSend(false)}
      />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete this post?"
        description="It disappears for everyone. People who were already notified keep their notification."
        confirmLabel="Delete"
        variant="danger"
        busy={deleting}
        onConfirm={() => void remove()}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
