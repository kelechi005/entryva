import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EmergencyButton } from '../EmergencyButton';
import { apiFetch } from '@/lib/api-client';

jest.mock('@/lib/api-client', () => ({ apiFetch: jest.fn() }));

const alertRow = {
  id: 'a1',
  kind: 'FIRE',
  note: 'Smoke in the kitchen',
  status: 'OPEN',
  apartmentLabel: 'Block A \u00b7 3',
  raisedByName: 'Ada',
  createdAt: '2026-10-05T10:00:00.000Z',
  acknowledgedByName: null,
  acknowledgedAt: null,
  resolvedByName: null,
  resolvedAt: null,
  callPhone: null,
};

beforeEach(() => jest.clearAllMocks());

describe('EmergencyButton', () => {
  it('sends nothing on the first press: it only opens the choice screen', () => {
    render(<EmergencyButton onRaised={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Emergency/ }));

    expect(screen.getByText('What is happening?')).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('will not send until a kind is chosen', () => {
    render(<EmergencyButton onRaised={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Emergency/ }));

    expect(screen.getByRole('button', { name: 'Send emergency alert' })).toBeDisabled();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('cancelling closes it without sending anything', () => {
    render(<EmergencyButton onRaised={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Emergency/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('What is happening?')).not.toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('sends the chosen kind and note, and reassures when security was told', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ alert: alertRow, notifiedCount: 3, duplicate: false });
    const onRaised = jest.fn();
    render(<EmergencyButton onRaised={onRaised} />);

    fireEvent.click(screen.getByRole('button', { name: /Emergency/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Fire/ }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Smoke in the kitchen'), { target: { value: ' Smoke in the kitchen ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send emergency alert' }));

    await waitFor(() => expect(onRaised).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith('/emergency-alerts', {
      method: 'POST',
      body: JSON.stringify({ kind: 'FIRE', note: 'Smoke in the kitchen' }),
    });
    expect(screen.getByRole('status')).toHaveTextContent('Security has been alerted');
  });

  it('warns clearly when nobody could be notified', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ alert: alertRow, notifiedCount: 0, duplicate: false });
    render(<EmergencyButton onRaised={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Emergency/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Medical/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send emergency alert' }));

    expect(await screen.findByRole('status')).toHaveTextContent('no security officer could be notified');
    expect(screen.getByRole('status')).toHaveTextContent('112');
  });

  it('says so when it was the same alert pressed twice', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ alert: alertRow, notifiedCount: 0, duplicate: true });
    render(<EmergencyButton onRaised={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Emergency/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Fire/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send emergency alert' }));

    expect(await screen.findByRole('status')).toHaveTextContent('already sent this alert');
  });

  it('if sending fails it keeps the form and tells them to call security or 112', async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new Error('Network down'));
    render(<EmergencyButton onRaised={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Emergency/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Security threat/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send emergency alert' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('call your estate security or 112');
    expect(screen.getByText('What is happening?')).toBeInTheDocument(); // not lost
  });
});
