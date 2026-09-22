import { Injectable, Logger } from '@nestjs/common';

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * 'sent': actually handed to Resend and accepted.
 * 'failed': Resend rejected it or the request errored.
 * 'not_configured': no RESEND_API_KEY set — nothing was attempted at
 * all. This used to collapse into a boolean (true also meant "stub
 * mode"), which is exactly the kind of misleading "success" this whole
 * result type exists to eliminate: a real deploy running with this key
 * unset would report every invite as delivered while sending nothing.
 */
export type EmailSendResult = 'sent' | 'failed' | 'not_configured';

/**
 * Outbound email via Resend (https://resend.com) — chosen for cost: a
 * free tier (3,000/month) that comfortably covers this app's volume
 * (invite + resend emails only), then $20/mo for 50k with no minimum
 * commitment, and a plain HTTPS JSON API so no SMTP client dependency
 * is needed — Node 18+'s built-in fetch is enough.
 *
 * If RESEND_API_KEY isn't set, this falls back to the original dev
 * behavior (logs instead of sending) so local development never needs
 * real credentials. Swapping providers later means changing sendViaResend()
 * alone — nothing that calls sendResidentInviteEmail() needs to know or
 * care which provider is behind it.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey = process.env.RESEND_API_KEY;
  private readonly from = process.env.EMAIL_FROM ?? 'no-reply@example.com';

  async sendResidentInviteEmail(params: {
    to: string;
    apartmentLabel: string;
    estateName: string;
    inviteUrl: string;
    expiresAt: Date;
  }): Promise<EmailSendResult> {
    const expiresLabel = params.expiresAt.toUTCString();
    const subject = `You're invited to join ${params.estateName}`;

    const text =
      `You've been added as a resident of ${params.apartmentLabel} at ${params.estateName}.\n\n` +
      `Set up your account (name + password) here:\n${params.inviteUrl}\n\n` +
      `This link works once and expires ${expiresLabel}. If it expires before you use it, ` +
      `ask your estate admin to resend it.\n\n` +
      `If you weren't expecting this, you can safely ignore this email.`;

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
        <p style="font-size:16px;line-height:1.5">
          You've been added as a resident of <strong>${escapeHtml(params.apartmentLabel)}</strong>
          at <strong>${escapeHtml(params.estateName)}</strong>.
        </p>
        <p style="font-size:16px;line-height:1.5">
          Set up your account — choose your own name and password — using the button below.
        </p>
        <p style="margin:28px 0">
          <a href="${params.inviteUrl}"
             style="background:#111827;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
            Set up my account
          </a>
        </p>
        <p style="font-size:13px;color:#6b7280;line-height:1.5">
          This link works once and expires ${escapeHtml(expiresLabel)}. If it expires before you use
          it, ask your estate admin to resend it.
        </p>
        <p style="font-size:13px;color:#6b7280;line-height:1.5">
          If you weren't expecting this, you can safely ignore this email.
        </p>
        <p style="margin-top:24px;font-size:12px;color:#9ca3af">Sent via Entryva</p>
      </div>`;

    return this.send({ to: params.to, subject, text, html });
  }

  async sendResidentInviteCancelledEmail(params: {
    to: string;
    apartmentLabel: string;
    estateName: string;
    reason?: string;
  }): Promise<EmailSendResult> {
    const subject = `Your invite to ${params.estateName} was cancelled`;
    const reasonLine = params.reason ? `\n\nReason given: ${params.reason}` : '';

    const text =
      `Your invite to set up a resident account for ${params.apartmentLabel} at ` +
      `${params.estateName} has been cancelled by your estate admin.${reasonLine}\n\n` +
      `The link you were sent no longer works. If you believe this is a mistake, contact ` +
      `your estate admin directly.`;

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
        <p style="font-size:16px;line-height:1.5">
          Your invite to set up a resident account for <strong>${escapeHtml(params.apartmentLabel)}</strong>
          at <strong>${escapeHtml(params.estateName)}</strong> has been cancelled by your estate admin.
        </p>
        ${params.reason ? `<p style="font-size:14px;color:#374151;line-height:1.5"><strong>Reason given:</strong> ${escapeHtml(params.reason)}</p>` : ''}
        <p style="font-size:13px;color:#6b7280;line-height:1.5">
          The link you were sent no longer works. If you believe this is a mistake, contact your
          estate admin directly.
        </p>
        <p style="margin-top:24px;font-size:12px;color:#9ca3af">Sent via Entryva</p>
      </div>`;

    return this.send({ to: params.to, subject, text, html });
  }

  /**
   * A failed send must never throw into the caller's transaction — same
   * reasoning as NotificationsService.dispatch(). Resend (the "resend
   * invite" action, not the provider) exists precisely so a delivery
   * failure isn't a dead end for the admin: they see it didn't arrive
   * and can retry, rather than the whole invite-creation request failing.
   */
  private async send(params: { to: string; subject: string; text: string; html: string }): Promise<EmailSendResult> {
    if (!this.apiKey) {
      // warn, not debug: at the default LOG_LEVEL=info this must be
      // visible. It was previously logged at debug and silently
      // invisible at the default level — the exact reason a real
      // deploy running with no RESEND_API_KEY set looked, from the
      // logs alone, indistinguishable from one where email was working.
      this.logger.warn(
        `[email:not sent, RESEND_API_KEY is not set] To: ${params.to} | Subject: ${params.subject}\n${params.text}`,
      );
      return 'not_configured';
    }

    try {
      const res = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: params.to,
          subject: params.subject,
          html: params.html,
          text: params.text,
        }),
      });

      if (!res.ok) {
        // Include Resend's own error reason (e.g. "You can only send
        // testing emails to your own email address" — the exact sandbox
        // restriction that explains a 403 when RESEND_API_KEY belongs to
        // an account with no verified sending domain yet) so this is
        // diagnosable from logs alone. Never log the API key or the full
        // raw body — Resend error payloads can otherwise echo back
        // request details.
        let reason = '';
        try {
          const body = (await res.json()) as { message?: string };
          if (body?.message) reason = ` — ${body.message}`;
        } catch {
          // Body wasn't JSON or was empty; the status code alone still
          // gets logged below.
        }
        this.logger.error(`Resend API returned ${res.status} sending to ${params.to}${reason}`);
        return 'failed';
      }
      return 'sent';
    } catch (err) {
      this.logger.error(`Failed to send email to ${params.to}: ${(err as Error).message}`);
      return 'failed';
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
