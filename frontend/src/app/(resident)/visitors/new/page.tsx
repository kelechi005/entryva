'use client';

// Create Visitor Invitation. On mobile this is a single continuous flow
// (form replaces itself with the generated pass). On desktop the form
// stays put on the left while a live preview panel on the right shows a
// placeholder pass until one is generated, then the real one — closer to
// the "form + pass" split shown in the desktop dashboard mockup.

import { useEffect, useState } from 'react';
import { CreateVisitorForm } from '@/components/visitor/CreateVisitorForm';
import { InvitationTicket } from '@/components/visitor/InvitationTicket';
import { Button } from '@/components/ui/Button';
import { apiFetch } from '@/lib/api-client';
import { frequentVisitors, type FrequentVisitor } from '@/lib/frequent-visitors';
import { buildSmsUrl, buildWhatsAppUrl } from '@/lib/share-pass';
import { CheckCircleIcon, ShareIcon, CopyIcon } from '@/components/ui/icons';
import type { CreateInvitationInput, CreatedInvitation, InvitationHistoryItem } from '@/types/invitation';

export default function CreateVisitorPage() {
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);
  const [prefill, setPrefill] = useState<{ visitorName: string; visitorPhone: string; n: number } | null>(null);
  const [frequent, setFrequent] = useState<FrequentVisitor[]>([]);

  // "Invite again" links arrive as /visitors/new?name=...&phone=...
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const name = q.get('name');
    if (name) setPrefill({ visitorName: name, visitorPhone: q.get('phone') ?? '', n: 1 });
  }, []);

  // People this resident has invited before, most frequent first.
  useEffect(() => {
    let cancelled = false;
    apiFetch<InvitationHistoryItem[]>('/invitations')
      .then((list) => {
        if (!cancelled) setFrequent(frequentVisitors(list));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(input: CreateInvitationInput) {
    const invitation = await apiFetch<CreatedInvitation>('/invitations', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setCreated(invitation);
  }

  async function handleCopyLink() {
    if (!created) return;
    await navigator.clipboard.writeText(created.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (!created) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Visitor Pass', url: created.shareUrl });
        return;
      } catch {
        // fall through to copy
      }
    }
    handleCopyLink();
  }

  const whatsappHref = created ? buildWhatsAppUrl(created) : '#';
  const smsHref = created ? buildSmsUrl(created) : '#';

  const passActions = (
    <>
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-base font-semibold text-black transition-transform duration-150 active:scale-[0.98]"
      >
        Send on WhatsApp
      </a>
      <div className="flex gap-3">
        <Button onClick={handleShare} className="flex-1 gap-2">
          <ShareIcon className="h-4 w-4" /> Share Pass
        </Button>
        <Button variant="secondary" onClick={handleCopyLink} className="flex-1 gap-2">
          <CopyIcon className="h-4 w-4" /> {copied ? 'Copied' : 'Copy Link'}
        </Button>
      </div>
      <a href={smsHref} className="text-center text-sm text-brass underline">
        No data? Send as SMS
      </a>
      <Button variant="ghost" fullWidth onClick={() => setCreated(null)}>
        Invite another visitor
      </Button>
    </>
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-[32px] font-bold text-ink">Invite a visitor</h1>
        <p className="text-[15px] text-ink-400">
          Tell us who&rsquo;s coming and when. We&rsquo;ll generate a pass to share with
          them.
        </p>
      </header>

      {!created && frequent.length > 0 && (
        <section aria-label="Invite again" className="flex flex-col gap-2">
          <p className="text-[13px] font-medium text-ink-400">Invite again</p>
          <div className="flex flex-wrap gap-2">
            {frequent.map((v) => (
              <button
                key={`${v.name}|${v.phone}`}
                type="button"
                onClick={() =>
                  setPrefill((p) => ({ visitorName: v.name, visitorPhone: v.phone, n: (p?.n ?? 0) + 1 }))
                }
                className="glass-card rounded-pill px-4 py-2 text-sm font-medium text-ink transition-colors duration-150 ease-premium hover:bg-white/[0.06]"
              >
                {v.name}
                {v.count > 1 && <span className="ml-1.5 text-ink-400">&times;{v.count}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Mobile: single flow, form OR pass */}
      <div className="lg:hidden">
        {!created ? (
          <CreateVisitorForm initial={prefill ?? undefined} onSubmit={handleCreate} />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-1 text-center animate-fade-up">
              <CheckCircleIcon className="mb-1 h-8 w-8 text-verified" />
              <h2 className="text-xl font-semibold text-ink">Invitation created</h2>
              <p className="text-ink-400">Share the pass below with your visitor.</p>
            </div>
            <InvitationTicket invitation={created} qrValue={created.shareUrl} actions={passActions} />
          </div>
        )}
      </div>

      {/* Desktop: form + live preview, side by side */}
      <div className="hidden gap-10 lg:grid lg:grid-cols-[1fr_420px]">
        <CreateVisitorForm initial={prefill ?? undefined} onSubmit={handleCreate} />

        <div className="sticky top-10 flex flex-col gap-4">
          {created ? (
            <>
              <div className="flex items-center gap-2 text-verified">
                <CheckCircleIcon className="h-5 w-5" />
                <span className="text-sm font-semibold">Pass generated</span>
              </div>
              <InvitationTicket invitation={created} qrValue={created.shareUrl} actions={passActions} />
            </>
          ) : (
            <div className="glass-card flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-ticket border-dashed px-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.06] text-ink-400">
                <ShareIcon className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-ink">Your pass preview appears here</p>
              <p className="text-xs text-ink-400">
                Fill in the visitor&rsquo;s details and generate a pass. It&rsquo;ll show
                up on this side, ready to share.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
