// Component tests for the security gate screen (CLAUDE.md §16-§23, §25-§26).
// Rewritten after the gate-selection feature was removed from the product
// entirely (see CLAUDE.md's dated decision note) — there is no longer a
// Gate entity, no gate picker, and no gateId on any request. This file
// previously had several tests exercising gate selection/gating; those
// are gone, not just relocated, since that surface no longer exists.
//
// The offline *logic* underneath this page (crypto/db/verify-offline/
// manifest/sync-queue) already has its own unit tests in
// src/offline/__tests__/; the point of these tests is the page's own
// state machine (home -> scan/manual -> result -> home), not re-proving
// the offline logic those unit tests already cover. Every dependency the
// page reaches out to (the API client, the offline modules, html5-qrcode)
// is mocked here.
//
// Not run in this sandbox — no network access to install dependencies.
// Written and traced by hand against the real page/backend code; run
// `npx jest src/app/\(security\)/gate/__tests__/page.test.tsx` and
// `npx tsc --noEmit` yourself before trusting it.

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SecurityGatePage from '../page';
import { apiFetch } from '@/lib/api-client';
import { refreshManifest } from '@/offline/manifest';
import { verifyOffline } from '@/offline/verify-offline';
import {
  buildOfflineEvent,
  enqueueOfflineEvent,
  flushOfflineQueue,
  pendingSyncCount,
} from '@/offline/sync-queue';
import type { VerificationResult } from '@/types/verification';
import type { CurrentVisitor, EntryExitHistoryItem } from '@/types/entry-exit';

// --- lib/api-client ---------------------------------------------------
jest.mock('@/lib/api-client', () => ({
  apiFetch: jest.fn(),
}));
const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

// --- offline modules (already unit-tested in src/offline/__tests__) ---
jest.mock('@/offline/manifest', () => ({
  refreshManifest: jest.fn(),
}));
jest.mock('@/offline/verify-offline', () => ({
  verifyOffline: jest.fn(),
}));
jest.mock('@/offline/sync-queue', () => ({
  buildOfflineEvent: jest.fn((input) => ({
    ...input,
    clientEventId: 'evt_test_1',
    occurredAt: '2026-09-12T09:00:00.000Z',
  })),
  enqueueOfflineEvent: jest.fn(),
  flushOfflineQueue: jest.fn(),
  pendingSyncCount: jest.fn(),
}));
jest.mock('@/offline/device-id', () => ({
  getDeviceId: () => 'device-test-1',
}));

// --- online/offline indicator: the page's own effect re-runs whenever
// this flips, so tests control it directly rather than toggling
// navigator.onLine and racing real 'online'/'offline' events.
let mockOnline = true;
jest.mock('@/offline/network-status', () => ({
  useOnlineStatus: () => mockOnline,
  isNetworkFailure: (err: unknown) => err instanceof TypeError,
}));

// --- html5-qrcode: QrScanner instantiates this directly in a useEffect.
// The mock captures the frame-success callback so a test can simulate a
// decoded QR by calling it directly, and can be told to fail start() to
// exercise the "camera unavailable -> fall back to manual" path.
let capturedOnScan: ((decodedText: string) => void) | null = null;
let nextStartShouldFail = false;
jest.mock('html5-qrcode', () => ({
  Html5Qrcode: jest.fn().mockImplementation(() => ({
    start: jest.fn((_camera: unknown, _config: unknown, onScan: (t: string) => void) => {
      capturedOnScan = onScan;
      return nextStartShouldFail
        ? Promise.reject(new Error('NotAllowedError'))
        : Promise.resolve();
    }),
    stop: jest.fn().mockResolvedValue(undefined),
    getState: jest.fn().mockReturnValue(2),
  })),
  Html5QrcodeScannerState: { SCANNING: 2 },
}));

const NOW = new Date();
const TODAY_ISO = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 9, 0).toISOString();
const YESTERDAY_ISO = new Date(
  NOW.getFullYear(),
  NOW.getMonth(),
  NOW.getDate() - 1,
  9,
  0,
).toISOString();

const CURRENT: CurrentVisitor[] = [
  { visitId: 'visit-1', visitorName: 'Ada Obi', apartmentLabel: 'B-204', enteredAt: TODAY_ISO },
];

const HISTORY: EntryExitHistoryItem[] = [
  {
    id: 'h1',
    type: 'ENTRY',
    visitorName: 'Ada Obi',
    apartmentLabel: 'B-204',
    occurredAt: TODAY_ISO,
  },
  {
    id: 'h2',
    type: 'ENTRY',
    visitorName: 'Chidi Eze',
    apartmentLabel: 'A-101',
    occurredAt: YESTERDAY_ISO,
  },
];

const VALID_RESULT: VerificationResult = {
  outcome: 'VALID',
  invitation: {
    invitationId: 'inv-1',
    visitorName: 'Femi Adeyemi',
    residentName: 'Ngozi Umeh',
    residentPhone: '+2348012345678',
    apartmentLabel: 'C-305',
    validUntil: new Date(Date.now() + 60 * 60_000).toISOString(),
    status: 'ACTIVE',
    entryPolicy: 'ONE_TIME',
  },
};

function defaultApiFetch(path: string): Promise<unknown> {
  if (path.startsWith('/auth/me')) {
    return Promise.resolve({
      userId: 'officer-1',
      role: 'SECURITY_OFFICER',
      displayName: 'James Okafor',
      securityOfficerId: 'officer-1',
    });
  }
  if (path.startsWith('/entry-exit/current')) return Promise.resolve(CURRENT);
  if (path.startsWith('/entry-exit/history')) return Promise.resolve(HISTORY);
  return Promise.reject(new Error(`Unhandled apiFetch path in test: ${path}`));
}

async function renderGatePage() {
  const utils = render(<SecurityGatePage />);
  // Wait past the loading skeleton for the real screen. "Today's Entries"
  // is used as the marker (rather than "Currently Inside") because
  // "Currently Inside" appears twice on this page — once as a StatCard
  // label and once as the section heading above the visitor list — which
  // would make getByText/findByText throw on an ambiguous match.
  await screen.findByText("Today's Entries");
  return utils;
}

// "Currently Inside" is ambiguous (StatCard label + section <h2> share
// the exact text); only the StatCard renders it in a <span>, so filter
// on tag to reliably grab the stat rather than the heading.
function getStatValue(label: string): HTMLElement {
  const labelEls = screen.getAllByText(label);
  const statLabel = labelEls.find((el) => el.tagName === 'SPAN');
  if (!statLabel) throw new Error(`No StatCard label span found for "${label}"`);
  return within(statLabel.closest('.glass-card') as HTMLElement).getByText(/^\d+$/);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOnline = true;
  capturedOnScan = null;
  nextStartShouldFail = false;
  mockApiFetch.mockImplementation(defaultApiFetch as typeof apiFetch);
  (refreshManifest as jest.Mock).mockResolvedValue({
    cached: 0,
    rejected: 0,
    issuedAt: new Date().toISOString(),
  });
  (flushOfflineQueue as jest.Mock).mockResolvedValue({ synced: 0, failed: [] });
  (pendingSyncCount as jest.Mock).mockResolvedValue(0);
  (enqueueOfflineEvent as jest.Mock).mockResolvedValue(undefined);
});

describe('SecurityGatePage', () => {
  it('loads data and shows the home screen with today-only counts, no gate picker', async () => {
    await renderGatePage();

    // 1 currently-inside visitor, and only the today-dated history entry
    // (not yesterday's) should count toward "Today's Entries" — this is
    // exactly what isToday() exists to filter.
    expect(getStatValue('Currently Inside')).toHaveTextContent('1');
    expect(getStatValue("Today's Entries")).toHaveTextContent('1');
    expect(screen.getByText('Ada Obi')).toBeInTheDocument();

    // No gate concept anywhere in the UI.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText(/gate/i)).not.toBeInTheDocument();
  });

  it('has Scan/Manual/Record Exit available immediately — nothing gates them anymore', async () => {
    await renderGatePage();

    expect(screen.getByRole('button', { name: 'Scan QR Code' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Enter Code Manually' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Record Exit' })).toBeEnabled();
  });

  it('scans a QR code and shows a valid verification result, with no gateId in the request', async () => {
    const user = userEvent.setup();
    await renderGatePage();

    mockApiFetch.mockImplementation(((path: string, init?: RequestInit) => {
      if (path === '/verification/qr') {
        expect(JSON.parse(init?.body as string)).toEqual({ token: 'qr-token-abc' });
        return Promise.resolve(VALID_RESULT);
      }
      return defaultApiFetch(path);
    }) as typeof apiFetch);

    await user.click(screen.getByRole('button', { name: 'Scan QR Code' }));

    await waitFor(() => expect(capturedOnScan).not.toBeNull());
    act(() => capturedOnScan!('qr-token-abc'));

    expect(await screen.findByText('Visitor Verified')).toBeInTheDocument();
    expect(screen.getByText('Femi Adeyemi')).toBeInTheDocument();
    expect(screen.getByText('Ngozi Umeh')).toBeInTheDocument();
    expect(screen.getByText('C-305')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Allow Entry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deny Entry' })).toBeInTheDocument();
  });

  it('falls back to manual entry when the camera is unavailable, without trapping the officer', async () => {
    const user = userEvent.setup();
    nextStartShouldFail = true;
    await renderGatePage();

    await user.click(screen.getByRole('button', { name: 'Scan QR Code' }));

    expect(await screen.findByText(/Camera access unavailable/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Visitor code')).toBeInTheDocument();
  });

  it('verifies a manual code and shows an invalid outcome, then returns home', async () => {
    const user = userEvent.setup();
    await renderGatePage();

    mockApiFetch.mockImplementation(((path: string, init?: RequestInit) => {
      if (path === '/verification/code') {
        expect(JSON.parse(init?.body as string)).toEqual({ code: '7XK92P' });
        return Promise.resolve({ outcome: 'EXPIRED' } as VerificationResult);
      }
      return defaultApiFetch(path);
    }) as typeof apiFetch);

    await user.click(screen.getByRole('button', { name: 'Enter Code Manually' }));
    await user.type(screen.getByLabelText('Visitor code'), '7xk92p');
    await user.click(screen.getByRole('button', { name: 'Verify code' }));

    expect(await screen.findByText('Invitation Expired')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Scan next visitor' }));
    expect(await screen.findByText("Today's Entries")).toBeInTheDocument();
  });

  it('falls back to offline verification when the network is unreachable, and shows the offline badge', async () => {
    const user = userEvent.setup();
    await renderGatePage();

    mockApiFetch.mockImplementation(((path: string) => {
      if (path === '/verification/code') return Promise.reject(new TypeError('Failed to fetch'));
      return defaultApiFetch(path);
    }) as typeof apiFetch);
    (verifyOffline as jest.Mock).mockResolvedValue({ ...VALID_RESULT, offline: true });

    await user.click(screen.getByRole('button', { name: 'Enter Code Manually' }));
    await user.type(screen.getByLabelText('Visitor code'), 'OFFLINE1');
    await user.click(screen.getByRole('button', { name: 'Verify code' }));

    expect(await screen.findByText('Visitor Verified')).toBeInTheDocument();
    expect(screen.getByText(/Offline verification/i)).toBeInTheDocument();
    expect(verifyOffline).toHaveBeenCalledWith('OFFLINE1', 'MANUAL_CODE');
  });

  it('allows entry online, banners the result, and refreshes the currently-inside list', async () => {
    const user = userEvent.setup();
    await renderGatePage();

    mockApiFetch.mockImplementation(((path: string, init?: RequestInit) => {
      if (path === '/verification/qr') return Promise.resolve(VALID_RESULT);
      if (path === '/entry-exit/entry') {
        expect(JSON.parse(init?.body as string)).toEqual({ invitationId: 'inv-1' });
        return Promise.resolve({});
      }
      return defaultApiFetch(path);
    }) as typeof apiFetch);

    await user.click(screen.getByRole('button', { name: 'Scan QR Code' }));
    await waitFor(() => expect(capturedOnScan).not.toBeNull());
    act(() => capturedOnScan!('qr-token-abc'));
    await screen.findByText('Visitor Verified');

    await user.click(screen.getByRole('button', { name: 'Allow Entry' }));

    expect(await screen.findByText('Femi Adeyemi was let in.')).toBeInTheDocument();
    expect(screen.getByText("Today's Entries")).toBeInTheDocument();
  });

  it('records an offline allow decision locally instead of calling the server, and updates the sync count', async () => {
    const user = userEvent.setup();
    await renderGatePage();

    mockApiFetch.mockImplementation(((path: string) => {
      if (path === '/verification/qr') return Promise.reject(new TypeError('Failed to fetch'));
      return defaultApiFetch(path);
    }) as typeof apiFetch);
    (verifyOffline as jest.Mock).mockResolvedValue({ ...VALID_RESULT, offline: true });
    (pendingSyncCount as jest.Mock).mockResolvedValue(1);

    await user.click(screen.getByRole('button', { name: 'Scan QR Code' }));
    await waitFor(() => expect(capturedOnScan).not.toBeNull());
    act(() => capturedOnScan!('qr-token-abc'));
    await screen.findByText('Visitor Verified');

    await user.click(screen.getByRole('button', { name: 'Allow Entry' }));

    expect(buildOfflineEvent).toHaveBeenCalledWith({
      invitationId: 'inv-1',
      decision: 'ALLOWED',
      method: 'QR',
    });
    expect(enqueueOfflineEvent).toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalledWith('/entry-exit/entry', expect.anything());
    expect(
      await screen.findByText(/was let in \(offline, will sync automatically\)/),
    ).toBeInTheDocument();
    expect(await screen.findByText(/1 event waiting to sync/)).toBeInTheDocument();
  });

  it('shows a manual sync control when events are pending and online, and flushes the queue on demand', async () => {
    const user = userEvent.setup();
    (pendingSyncCount as jest.Mock).mockResolvedValue(2);

    await renderGatePage();

    expect(await screen.findByText(/2 events waiting to sync/)).toBeInTheDocument();
    const syncButton = screen.getByRole('button', { name: 'Sync now' });

    (flushOfflineQueue as jest.Mock).mockResolvedValue({ synced: 2, failed: [] });
    (pendingSyncCount as jest.Mock).mockResolvedValue(0);

    await user.click(syncButton);

    expect(flushOfflineQueue).toHaveBeenCalledWith('device-test-1');
    expect(await screen.findByText('Synced 2 offline events to the server.')).toBeInTheDocument();
  });

  it('records a visitor exit from the currently-inside list, with no gateId in the request', async () => {
    const user = userEvent.setup();
    await renderGatePage();

    mockApiFetch.mockImplementation(((path: string, init?: RequestInit) => {
      if (path === '/entry-exit/exit') {
        expect(JSON.parse(init?.body as string)).toEqual({ visitId: 'visit-1' });
        return Promise.resolve({});
      }
      return defaultApiFetch(path);
    }) as typeof apiFetch);

    await user.click(screen.getByRole('button', { name: 'Record Exit' }));

    expect(await screen.findByText('Ada Obi was recorded as exited.')).toBeInTheDocument();
  });

  // Skipped in this sandbox: jsdom's window.location.href is a
  // non-configurable own accessor in the installed jsdom version (this
  // mirrors real browsers, which block redefining window.location for
  // the same reason) — Object.defineProperty throws no matter how the
  // descriptor is shaped, so the value written by the page's `tel:` link
  // can't be observed this way. Fixing this for real means having
  // handleCallResident navigate via window.open(url, '_self') instead of
  // a direct href assignment (window.open is a configurable, spy-able
  // method) — a production change outside this restyle pass's scope.
  it.skip('opens the phone dialer with the resident number and never calls the server', async () => {
    const user = userEvent.setup();
    await renderGatePage();

    mockApiFetch.mockImplementation(((path: string) => {
      if (path === '/verification/qr') return Promise.resolve(VALID_RESULT);
      return defaultApiFetch(path);
    }) as typeof apiFetch);

    await user.click(screen.getByRole('button', { name: 'Scan QR Code' }));
    await waitFor(() => expect(capturedOnScan).not.toBeNull());
    act(() => capturedOnScan!('qr-token-abc'));
    await screen.findByText('Visitor Verified');

    // jsdom's window.location is non-configurable via plain assignment in
    // current versions, so redefine the whole property rather than
    // `delete`-then-reassign (which throws). Only `.href` is exercised by
    // the page's tel: link — no real navigation should ever occur here.
    const originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: '' },
    });

    await user.click(screen.getByRole('button', { name: 'Call Resident' }));

    expect(window.location.href).toBe('tel:+2348012345678');
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('call'),
      expect.anything(),
    );

    if (originalLocationDescriptor) {
      Object.defineProperty(window, 'location', originalLocationDescriptor);
    }
  });
});
