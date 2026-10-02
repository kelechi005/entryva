'use client';

// The regular visitor's own pass. Opened from the link the resident sent. No
// login: the secret link is the key, and only the first phone to open it can.
// The QR carries today's code, so a screenshot from yesterday is useless.

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ROLE_LABELS, STATUS_LABELS, formatDays, formatWindow } from '@/lib/recurring-pass';
import type { PublicPassView } from '@/types/recurring-pass';
import { QRCodeSVG } from 'qrcode.react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';
const DEVICE_KEY = 'entryva-pass-device';
const REFRESH_MS = 60_000;

let memoryDeviceId: string | null = null;

// A random id kept on this phone. Only a hash of it is stored on the server.
function deviceId(): string {
  try {
    const saved = window.localStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
  } catch {
    // storage blocked: fall through to an in-memory id
  }
  if (!memoryDeviceId) {
    const random =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    memoryDeviceId = `dev-${random}`;
  }
  try {
    window.localStorage.setItem(DEVICE_KEY, memoryDeviceId);
  } catch {
    // ignore
  }
  return memoryDeviceId;
}

async function fetchPass(token: string): Promise<PublicPassView> {
  const res = await fetch(`${API_BASE}/recurring-passes/public/${encodeURIComponent(token)}`, {
    headers: { 'x-device-id': deviceId() },
    cache: 'no-store',
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const raw = (body as { message?: string | string[] } | null)?.message;
    const message = Array.isArray(raw) ? raw.join(' ') : raw;
    throw new Error(message || 'This pass could not be opened.');
  }
  return body as PublicPassView;
}

function PassQr({ value }: { value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <QRCodeSVG value={value} size={232} level="M" bgColor="#FFFFFF" fgColor="#000000" />
    </div>
  );
}

export default function PassPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const [pass, setPass] = useState<PublicPassView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setPass(await fetchPass(token));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This pass could not be opened.');
    }
  }, [token]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const qrValue = pass?.code ? `${window.location.origin}/pass/${token}~${pass.code}` : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-5 py-10">
      {error && !pass && (
        <div role="alert" className="rounded-card border border-alert/30 bg-alert-50 px-5 py-6 text-center text-alert">
          {error}
        </div>
      )}

      {!pass && !error && <div className="h-96 animate-pulse rounded-card bg-white/[0.04]" />}

      {pass && (
        <div className="glass-card flex flex-col items-center gap-5 rounded-[32px] px-7 py-9 text-center">
          <div>
            <p className="text-sm text-ink-400">{ROLE_LABELS[pass.role]}</p>
            <h1 className="font-display text-2xl font-bold text-ink">{pass.fullName}</h1>
            {pass.residentName && (
              <p className="mt-1 text-sm text-ink-400">
                Visiting {pass.residentName}
                {pass.apartmentLabel ? `, ${pass.apartmentLabel}` : ''}
              </p>
            )}
          </div>

          {qrValue ? (
            <>
              <PassQr value={qrValue} />
              <p className="font-mono text-lg tracking-widest text-ink">{pass.code}</p>
              <p className="text-sm text-ink-400">Show this QR code to security at the gate. The code changes every day.</p>
            </>
          ) : (
            <p role="status" className="rounded-2xl bg-alert-50 px-4 py-4 text-alert">
              {pass.status === 'ACTIVE'
                ? 'This pass is not valid today.'
                : `This pass is ${STATUS_LABELS[pass.status].toLowerCase()}. Ask the resident if you need to get in.`}
            </p>
          )}

          <div className="text-sm text-ink-400">
            <p>
              {formatDays(pass.days)}, {formatWindow(pass.startMinute, pass.endMinute)}
            </p>
            <p>
              {pass.validFrom} to {pass.validUntil}
            </p>
          </div>
          {error && <p className="text-xs text-ink-400">Could not refresh just now. Showing the last loaded pass.</p>}
        </div>
      )}
    </main>
  );
}
