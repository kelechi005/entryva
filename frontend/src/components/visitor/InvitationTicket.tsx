'use client';

import { QRCodeSVG } from 'qrcode.react';
import { formatVisitWindow } from '@/lib/format';
import { StatusBadge, toStatusBadgeKey } from '@/components/ui/StatusBadge';
import { BuildingIcon, ClockIcon, CalendarIcon } from '@/components/ui/icons';
import type { CreatedInvitation, PublicInvitation } from '@/types/invitation';

interface InvitationTicketProps {
  invitation: CreatedInvitation | PublicInvitation;
  qrValue: string;
  /** The resident's view gets copy/share actions; the visitor's own link does not. */
  actions?: React.ReactNode;
}

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * The invitation rendered as a Visitor Pass — an Apple Wallet-style card:
 * identity + status up top, a glass QR block anchoring the bottom, all on
 * a soft blue-to-transparent gradient. This is the single most important
 * screen in the app per the design system, so it gets the richest surface
 * (gradient + glow) rather than the flat glass used elsewhere.
 */
export function InvitationTicket({ invitation, qrValue, actions }: InvitationTicketProps) {
  return (
    <div className="mx-auto w-full max-w-sm">
      <div
        className="relative overflow-hidden rounded-ticket border border-white/[0.14] px-7 pb-7 pt-7 shadow-glow"
        style={{
          background:
            'linear-gradient(135deg, rgba(93,168,255,0.22), rgba(255,255,255,0.03))',
        }}
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brass/20 blur-[70px]" />

        {/* Header: brand + status */}
        <div className="relative mb-6 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
              Visitor Pass
            </p>
            <p className="text-sm font-semibold text-ink">
              {'estateName' in invitation ? invitation.estateName : 'Victoria Gardens Estate'}
            </p>
          </div>
          <StatusBadge status={toStatusBadgeKey(invitation.status)} />
        </div>

        {/* Visitor identity */}
        <div className="relative mb-6 flex items-center gap-3.5">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/[0.08] text-lg font-bold text-ink">
            {initials(invitation.visitorName)}
          </span>
          <div>
            <p className="text-lg font-bold leading-tight text-ink">{invitation.visitorName}</p>
            <p className="text-sm text-ink-400">Guest</p>
          </div>
        </div>

        {/* Visit meta */}
        <div className="relative mb-6 grid grid-cols-3 gap-3 border-y border-white/[0.10] py-4">
          <MetaItem icon={CalendarIcon} label="Date" value={formatVisitWindow(invitation.validFrom, invitation.validUntil).split(' \u00b7 ')[0]} />
          <MetaItem
            icon={ClockIcon}
            label="Time"
            value={formatVisitWindow(invitation.validFrom, invitation.validUntil).split(' \u00b7 ')[1]}
          />
          <MetaItem icon={BuildingIcon} label="Apartment" value={invitation.apartmentLabel} />
        </div>

        {/* QR block */}
        <div className="relative flex flex-col items-center gap-3">
          <div className="rounded-[20px] bg-white p-4 shadow-card">
            <QRCodeSVG value={qrValue} size={168} fgColor="#050505" bgColor="#FFFFFF" />
          </div>
          {/*
            Only CreatedInvitation ever has a real display code — it's a
            one-time secret shown to the resident at creation and never
            recoverable afterward (see backend InvitationsService), so
            PublicInvitation (this link, opened later by anyone) has no
            'displayCode' field at all. Previously this rendered a
            hardcoded '\u2022\u2022\u2022\u2022\u2022\u2022' placeholder
            unconditionally, which looked like a real (if oddly styled)
            code with nothing behind it.
          */}
          {'displayCode' in invitation && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
                Or share this code
              </span>
              <span className="text-2xl font-bold tracking-[0.2em] text-ink">
                {invitation.displayCode}
              </span>
            </div>
          )}
        </div>
      </div>

      {actions && <div className="mt-6 flex flex-col gap-3">{actions}</div>}
    </div>
  );
}

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: (props: { className?: string }) => JSX.Element;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="flex items-center gap-1 text-[11px] font-medium text-ink-400">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}
