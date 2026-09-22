'use client';

// Shown when an invite was created/resent but the email failed to send
// (see EmailService — delivery failures are deliberately non-fatal to
// the invite itself). The raw token only ever exists for the life of
// this API response — it's never stored, only its hash is — so this is
// the admin's one chance to grab the link and share it by hand.

import { useEffect, useRef, useState } from 'react';
import { AlertIcon, CheckIcon, CopyIcon } from '@/components/ui/icons';

// 'failed': Resend rejected it or the request errored — a real delivery
// problem, possibly transient.
// 'not_configured': no email provider is set up on the backend at all
// (RESEND_API_KEY unset) — nothing was even attempted. Different enough
// from 'failed' that showing the same "couldn't be sent" message for
// both would send an admin chasing a delivery bug that doesn't exist.
export function CopyLinkBox({ url, status = 'failed' }: { url: string; status?: 'failed' | 'not_configured' }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Without this, an unfocused readOnly <input> can end up scrolled to
  // show the tail of a long value instead of the start — the domain
  // (the part that actually identifies what this link is) scrolls out
  // of view and all that's visible is the meaningless end of the token.
  // The Copy button is unaffected either way since it reads `url`
  // directly, never the input's displayed/scrolled text.
  useEffect(() => {
    if (inputRef.current) inputRef.current.scrollLeft = 0;
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (older browser, non-HTTPS
      // context) — the link is still selectable/visible in the input
      // below, so there's a working fallback even if this silently
      // no-ops.
    }
  }

  const message =
    status === 'not_configured'
      ? "Email sending isn't set up yet on this server, so nothing was sent. Copy this link and share it directly for now."
      : "The invite was created, but the email couldn't be sent. Copy this link and share it directly.";

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-warn-50 px-4 py-3 text-sm text-warn">
      <p className="flex items-center gap-1.5 font-medium">
        <AlertIcon className="h-4 w-4 shrink-0" />
        {message}
      </p>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full min-w-0 rounded-md border border-warn/30 bg-white/[0.04] px-2.5 py-1.5 text-xs text-ink focus:outline-none"
        />
        <button
          type="button"
          onClick={copy}
          className="flex shrink-0 items-center gap-1 rounded-md bg-warn/15 px-2.5 py-1.5 text-xs font-medium text-warn hover:bg-warn/25"
        >
          {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
