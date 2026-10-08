import { render, screen, waitFor } from '@testing-library/react';
import { OpenEmergencyBanner } from '../OpenEmergencyBanner';
import { AlertsBar } from '../AlertsBar';
import { apiFetch } from '@/lib/api-client';
import { usePathname } from 'next/navigation';

jest.mock('next/navigation', () => ({ usePathname: jest.fn(() => '/gate') }));
jest.mock('@/lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('@/hooks/usePushStatus', () => ({
  usePushStatus: () => ({ state: 'server-off', busy: false, error: null, enable: jest.fn(), disable: jest.fn() }),
}));

const row = (over: Record<string, unknown>) => ({
  id: 'a1',
  kind: 'FIRE',
  note: null,
  status: 'OPEN',
  apartmentLabel: 'Block A \u00b7 3',
  raisedByName: 'Ada',
  createdAt: '2026-10-05T10:00:00.000Z',
  acknowledgedByName: null,
  acknowledgedAt: null,
  resolvedByName: null,
  resolvedAt: null,
  callPhone: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  (usePathname as jest.Mock).mockReturnValue('/gate');
});

describe('OpenEmergencyBanner', () => {
  it('shows a red alert with a Respond link while an emergency is open', async () => {
    (apiFetch as jest.Mock).mockResolvedValue([row({})]);
    render(<OpenEmergencyBanner />);

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('Emergency: Fire \u2014 Block A \u00b7 3');
    expect(screen.getByRole('link', { name: 'Respond' })).toHaveAttribute('href', '/alerts?tab=emergencies');
    expect(apiFetch).toHaveBeenCalledWith('/emergency-alerts');
  });

  it('stays quiet when nothing is waiting (handled and closed ones do not count)', async () => {
    (apiFetch as jest.Mock).mockResolvedValue([row({ status: 'ACKNOWLEDGED' }), row({ id: 'a2', status: 'RESOLVED' })]);
    const { container } = render(<OpenEmergencyBanner />);

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('counts several open emergencies', async () => {
    (apiFetch as jest.Mock).mockResolvedValue([
      row({ id: 'a1', createdAt: '2026-10-05T09:00:00.000Z' }),
      row({ id: 'a2', kind: 'MEDICAL', apartmentLabel: 'Block B \u00b7 1', createdAt: '2026-10-05T10:00:00.000Z' }),
    ]);
    render(<OpenEmergencyBanner />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Medical \u2014 Block B \u00b7 1 (+1 more)');
  });

  it('does not repeat itself on the alerts page, and does not even ask the server there', async () => {
    (usePathname as jest.Mock).mockReturnValue('/alerts');
    (apiFetch as jest.Mock).mockResolvedValue([row({})]);
    const { container } = render(<OpenEmergencyBanner />);

    expect(container).toBeEmptyDOMElement();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('does not break the screen if the server cannot be reached', async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new Error('offline'));
    const { container } = render(<OpenEmergencyBanner />);

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('AlertsBar', () => {
  it('residents never poll for the estate\u2019s emergencies', async () => {
    const { container } = render(<AlertsBar role="resident" />);
    expect(container.firstChild).toBeEmptyDOMElement();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('staff get the emergency banner', async () => {
    (apiFetch as jest.Mock).mockResolvedValue([row({})]);
    render(<AlertsBar role="staff" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Fire');
  });
});
