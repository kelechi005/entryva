'use client';

// Security Gate screen — mockups 6, 7, 14 (CLAUDE.md §16-§23, §25-§26). This
// is the officer's whole workday in one screen: gate context, the two
// verification entry points, the result/action step, who's currently
// inside, and — new in this pass — offline verification. No separate
// "security dashboard" route exists — this page is that dashboard, per
// the login redirect in (auth)/login/page.tsx sending officers to /gate.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { QrScanner } from '@/components/security/QrScanner';
import { ManualCodeEntry } from '@/components/security/ManualCodeEntry';
import { VerificationResultCard } from '@/components/security/VerificationResultCard';
import { StatCard } from '@/components/ui/StatCard';
import { apiFetch } from '@/lib/api-client';
import { formatRelativeTime } from '@/lib/format';
import type { VerificationResult } from '@/types/verification';
import type { CurrentVisitor, EntryExitHistoryItem } from '@/types/entry-exit';
import type { AuthenticatedUser } from '@/types/auth';
import { refreshManifest } from '@/offline/manifest';
import { verifyOffline } from '@/offline/verify-offline';
import {
  buildOfflineEvent,
  enqueueOfflineEvent,
  flushOfflineQueue,
  pendingSyncCount,
} from '@/offline/sync-queue';
import { useOnlineStatus, isNetworkFailure } from '@/offline/network-status';
import { getDeviceId } from '@/offline/device-id';
import {
  ScanIcon,
  KeypadIcon,
  VisitorsIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  WifiIcon,
  WifiOffIcon,
} from '@/components/ui/icons';

type Mode = 'home' | 'scan' | 'manual' | 'result';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Small "< Title" back-bar used on the scan / manual / result steps, so
// leaving a step never relies on scrolling to a ghost button at the
// bottom (mirrors the mockup's back-chevron screen headers).
function StepHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink-100 bg-white/[0.03] text-ink-400 transition-colors duration-150 ease-premium hover:bg-white/[0.06] hover:text-ink"
      >
        <ChevronRightIcon className="h-4 w-4 rotate-180" />
      </button>
      <h1 className="font-display text-xl font-semibold text-ink">{title}</h1>
    </div>
  );
}

// How often to refresh the offline manifest while online, so a device
// that goes offline unexpectedly is never working from wildly stale data
// (CLAUDE.md §25's "recently synchronized" is doing real work here).
const MANIFEST_REFRESH_INTERVAL_MS = 2 * 60_000;

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function SecurityGatePage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [current, setCurrent] = useState<CurrentVisitor[]>([]);
  const [history, setHistory] = useState<EntryExitHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>('home');
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [lastMethod, setLastMethod] = useState<'QR' | 'MANUAL_CODE'>('QR');
  const [actionPending, setActionPending] = useState(false);
  const [exitingVisitId, setExitingVisitId] = useState<string | null>(null);

  const online = useOnlineStatus();
  const [pendingSync, setPendingSync] = useState(0);
  const deviceId = useMemo(() => getDeviceId(), []);

  const refreshOperationalData = useCallback(async () => {
    const [currentList, historyList] = await Promise.all([
      apiFetch<CurrentVisitor[]>('/entry-exit/current'),
      apiFetch<EntryExitHistoryItem[]>('/entry-exit/history?limit=100'),
    ]);
    setCurrent(currentList);
    setHistory(historyList);
  }, []);

  const syncNow = useCallback(async () => {
    try {
      const { synced, failed } = await flushOfflineQueue(deviceId);
      if (synced > 0) {
        setBanner(`Synced ${synced} offline event${synced === 1 ? '' : 's'} to the server.`);
        await refreshOperationalData();
      }
      if (failed.length > 0) {
        setError(
          `${failed.length} offline event${failed.length === 1 ? '' : 's'} could not be synced ` +
            '(likely already resolved online). See the browser console for detail.',
        );
        // eslint-disable-next-line no-console
        failed.forEach((f) => console.error('Offline sync rejected', f));
      }
    } catch (err) {
      // Connectivity dropped again mid-flush, or the batch request
      // itself failed — leave everything queued and just try again on
      // the next 'online' event or manual retry.
      // eslint-disable-next-line no-console
      console.warn('Offline queue flush failed, will retry later', err);
    } finally {
      setPendingSync(await pendingSyncCount().catch(() => 0));
    }
  }, [deviceId, refreshOperationalData]);

  // Initial load: current/history, and how many offline events (if any,
  // e.g. from a previous session that never got back online) are
  // already waiting to sync.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [me] = await Promise.all([apiFetch<AuthenticatedUser>('/auth/me'), refreshOperationalData()]);
        if (!cancelled) setUser(me);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load gate data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    pendingSyncCount()
      .then((count) => {
        if (!cancelled) setPendingSync(count);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [refreshOperationalData]);

  // Keep the offline manifest fresh while online, and flush/re-sync the
  // moment connectivity returns. CLAUDE.md §25: "If the gate loses
  // internet temporarily, security should still be able to verify
  // recently synchronized valid invitations" — "recently" is doing the
  // work this effect exists for.
  useEffect(() => {
    if (!online) return;
    refreshManifest().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('Offline manifest refresh failed', err);
    });
    syncNow();
    const interval = setInterval(() => {
      refreshManifest().catch(() => undefined);
    }, MANIFEST_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  function backToHome() {
    setMode('home');
    setResult(null);
    setCameraUnavailable(false);
  }

  async function handleVerifyQr(token: string) {
    try {
      const res = await apiFetch<VerificationResult>('/verification/qr', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      setLastMethod('QR');
      setResult(res);
      setMode('result');
    } catch (err) {
      if (isNetworkFailure(err)) {
        try {
          const offlineResult = await verifyOffline(token, 'QR');
          setLastMethod('QR');
          setResult(offlineResult);
          setMode('result');
          return;
        } catch (offlineErr) {
          setError(
            offlineErr instanceof Error
              ? offlineErr.message
              : 'No network, and no offline data is cached on this device yet.',
          );
          backToHome();
          return;
        }
      }
      setError(err instanceof Error ? err.message : 'Could not verify that QR code.');
      backToHome();
    }
  }

  async function handleVerifyCode(code: string) {
    try {
      const res = await apiFetch<VerificationResult>('/verification/code', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      setLastMethod('MANUAL_CODE');
      setResult(res);
      setMode('result');
    } catch (err) {
      if (isNetworkFailure(err)) {
        const offlineResult = await verifyOffline(code, 'MANUAL_CODE');
        setLastMethod('MANUAL_CODE');
        setResult(offlineResult);
        setMode('result');
        return;
      }
      throw err;
    }
  }

  async function handleAllowEntry() {
    if (!result?.invitation) return;
    setActionPending(true);
    try {
      if (result.offline) {
        // No server round trip is possible right now — record the
        // decision locally (with its own idempotency key) and let the
        // sync effect above report it once connectivity returns.
        const event = buildOfflineEvent({
          invitationId: result.invitation.invitationId,
          decision: 'ALLOWED',
          method: lastMethod,
        });
        await enqueueOfflineEvent(event);
        setPendingSync(await pendingSyncCount());
        setBanner(`${result.invitation.visitorName} was let in (offline, will sync automatically).`);
        backToHome();
        return;
      }
      await apiFetch('/entry-exit/entry', {
        method: 'POST',
        body: JSON.stringify({ invitationId: result.invitation.invitationId }),
      });
      setBanner(`${result.invitation.visitorName} was let in.`);
      await refreshOperationalData();
      backToHome();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record entry.');
    } finally {
      setActionPending(false);
    }
  }

  async function handleDenyEntry() {
    if (!result?.invitation) return;
    setActionPending(true);
    try {
      if (result.offline) {
        const event = buildOfflineEvent({
          invitationId: result.invitation.invitationId,
          decision: 'DENIED',
          method: lastMethod,
        });
        await enqueueOfflineEvent(event);
        setPendingSync(await pendingSyncCount());
        setBanner(`Entry denied for ${result.invitation.visitorName} (offline, will sync automatically).`);
        backToHome();
        return;
      }
      await apiFetch('/entry-exit/deny', {
        method: 'POST',
        body: JSON.stringify({ invitationId: result.invitation.invitationId }),
      });
      setBanner(`Entry denied for ${result.invitation.visitorName}.`);
      backToHome();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record denial.');
    } finally {
      setActionPending(false);
    }
  }

  // No in-app calling — this just opens the officer's own phone dialer
  // with the resident's number pre-filled. Not offered offline or when
  // the resident has no phone on file.
  function handleCallResident() {
    const phone = result?.invitation?.residentPhone;
    if (!phone) return;
    window.location.href = `tel:${phone}`;
  }

  async function handleRecordExit(visitId: string, visitorName: string) {
    setExitingVisitId(visitId);
    try {
      await apiFetch('/entry-exit/exit', {
        method: 'POST',
        body: JSON.stringify({ visitId }),
      });
      setBanner(`${visitorName} was recorded as exited.`);
      await refreshOperationalData();
    } catch (err) {
      setError(
        isNetworkFailure(err)
          ? 'Recording an exit requires a connection. Offline mode only supports entry/deny.'
          : err instanceof Error
            ? err.message
            : 'Could not record exit.',
      );
    } finally {
      setExitingVisitId(null);
    }
  }

  const todaysEntries = history.filter((h) => h.type === 'ENTRY' && isToday(h.occurredAt)).length;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      {loading ? (
        <div className="flex flex-col gap-6">
          <div className="h-9 w-56 animate-pulse rounded-lg bg-ink-100/60" />
          <div className="grid grid-cols-2 gap-4 lg:max-w-md">
            <div className="h-28 animate-pulse rounded-card bg-ink-100/60" />
            <div className="h-28 animate-pulse rounded-card bg-ink-100/60" />
          </div>
          <div className="h-24 animate-pulse rounded-card bg-ink-100/60" />
        </div>
      ) : (
        <>
          {/* CLAUDE.md §25: "The UI must clearly indicate when
              verification is offline" — a persistent, always-visible
              indicator, not just something shown after a scan, so this
              sits above every mode rather than only the home screen. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span
              className={`flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-xs font-semibold ${
                online ? 'bg-verified-50 text-verified' : 'bg-alert-50 text-alert'
              }`}
            >
              {online ? <WifiIcon className="h-3.5 w-3.5" /> : <WifiOffIcon className="h-3.5 w-3.5" />}
              {online ? 'Online' : 'Offline, using last synced data'}
            </span>
            {pendingSync > 0 && (
              <span className="flex items-center gap-2 rounded-pill bg-brass-50 px-3.5 py-1.5 text-xs font-semibold text-brass">
                {pendingSync} event{pendingSync === 1 ? '' : 's'} waiting to sync
                {online && (
                  <button type="button" onClick={syncNow} className="underline underline-offset-2">
                    Sync now
                  </button>
                )}
              </span>
            )}
          </div>

          {banner && (
            <p className="rounded-2xl border border-verified/30 bg-verified-50/40 px-4 py-3 text-sm text-verified">
              {banner}
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-2xl border border-alert/30 bg-alert-50/40 px-4 py-3 text-sm text-alert">
              {error}
            </p>
          )}

          {mode === 'home' && (
            <div className="flex flex-col gap-8 animate-fade-up">
              <header>
                <h1 className="font-display text-[32px] font-bold leading-tight text-ink">
                  {greeting()}
                  {user ? `, ${user.displayName}` : ''}
                </h1>
                <p className="mt-1 text-[15px] text-ink-400">Here&rsquo;s what&rsquo;s happening right now.</p>
              </header>

              <div className="grid grid-cols-2 gap-4 lg:max-w-md">
                <StatCard
                  label="Currently Inside"
                  value={current.length}
                  icon={<VisitorsIcon className="h-4 w-4" />}
                  tone="accent"
                />
                <StatCard
                  label="Today's Entries"
                  value={todaysEntries}
                  icon={<CheckCircleIcon className="h-4 w-4" />}
                  tone="success"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <button
                  type="button"
                  aria-label="Scan QR Code"
                  onClick={() => {
                    setError(null);
                    setBanner(null);
                    setCameraUnavailable(false);
                    setMode('scan');
                  }}
                  className="group flex items-center justify-between gap-4 rounded-card bg-gradient-to-b from-brass to-[#3B82F6] px-6 py-6 text-left shadow-floating transition-all duration-150 ease-premium hover:scale-[1.02] active:scale-[0.97]"
                >
                  <span className="flex items-center gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white">
                      <ScanIcon className="h-6 w-6" />
                    </span>
                    <span>
                      <span className="block text-base font-semibold text-white">Scan QR Code</span>
                      <span className="block text-sm text-white/80">Verify visitor pass instantly</span>
                    </span>
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-white/80 transition-transform duration-150 ease-premium group-hover:translate-x-1" />
                </button>

                <button
                  type="button"
                  aria-label="Enter Code Manually"
                  onClick={() => {
                    setError(null);
                    setBanner(null);
                    setMode('manual');
                  }}
                  className="group flex items-center justify-between gap-4 rounded-card glass-card px-6 py-6 text-left transition-all duration-150 ease-premium hover:scale-[1.02] hover:bg-white/[0.06] active:scale-[0.97]"
                >
                  <span className="flex items-center gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-brass">
                      <KeypadIcon className="h-6 w-6" />
                    </span>
                    <span>
                      <span className="block text-base font-semibold text-ink">Enter Code Manually</span>
                      <span className="block text-sm text-ink-400">Type the visitor&rsquo;s code</span>
                    </span>
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-400 transition-transform duration-150 ease-premium group-hover:translate-x-1" />
                </button>
              </div>

              <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl font-semibold text-ink">Currently Inside</h2>
                  <span className="text-sm text-ink-400">
                    {current.length} visitor{current.length === 1 ? '' : 's'}
                  </span>
                </div>
                {current.length === 0 ? (
                  <div className="rounded-card border border-dashed border-ink-100 px-6 py-10 text-center">
                    <p className="text-ink-400">No visitors currently inside.</p>
                  </div>
                ) : (
                  <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                    {current.map((visitor) => (
                      <li
                        key={visitor.visitId}
                        className="flex items-center justify-between gap-4 rounded-card glass-card px-5 py-4 transition-transform duration-150 ease-premium hover:scale-[1.01]"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-sm font-semibold text-ink">
                            {initials(visitor.visitorName)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">{visitor.visitorName}</p>
                            <p className="truncate text-sm text-ink-400">
                              Flat {visitor.apartmentLabel} &middot; Entered{' '}
                              {formatRelativeTime(visitor.enteredAt)}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          onClick={() => handleRecordExit(visitor.visitId, visitor.visitorName)}
                          disabled={exitingVisitId === visitor.visitId}
                          className="shrink-0"
                        >
                          {exitingVisitId === visitor.visitId ? 'Recording\u2026' : 'Record Exit'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {mode === 'scan' && (
            <div className="mx-auto flex w-full max-w-sm flex-col gap-5 animate-fade-up">
              <StepHeader title="Scan Visitor Pass" onBack={backToHome} />
              <QrScanner
                onScan={handleVerifyQr}
                onCameraUnavailable={() => {
                  setCameraUnavailable(true);
                  setMode('manual');
                }}
              />
            </div>
          )}

          {mode === 'manual' && (
            <div className="mx-auto flex w-full max-w-sm flex-col gap-5 animate-fade-up">
              <StepHeader title="Enter Visitor Code" onBack={backToHome} />
              <ManualCodeEntry onSubmit={handleVerifyCode} cameraUnavailableNotice={cameraUnavailable} />
            </div>
          )}

          {mode === 'result' && result && (
            <div className="animate-fade-up">
              <VerificationResultCard
                result={result}
                onAllowEntry={handleAllowEntry}
                onDenyEntry={handleDenyEntry}
                onCallResident={handleCallResident}
                onDismiss={backToHome}
                actionPending={actionPending}
              />
            </div>
          )}
        </>
      )}
    </main>
  );
}
