import { render, screen, waitFor } from '@testing-library/react';
import { NavigateToEstate } from '../NavigateToEstate';
import { apiFetch } from '@/lib/api-client';

jest.mock('@/lib/api-client', () => ({ apiFetch: jest.fn() }));

const entrance = {
  estateName: 'Emerald Gardens',
  gateName: 'Main Gate',
  latitude: 7.7345,
  longitude: 8.5221,
  instructions: 'Beside the filling station',
  arrivalRadiusMeters: 100,
};

beforeEach(() => {
  jest.clearAllMocks();
  (apiFetch as jest.Mock).mockResolvedValue(entrance);
});

describe('NavigateToEstate (pass-page card)', () => {
  it('renders nothing when the estate has no entrance configured', async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new Error('404'));
    const { container } = render(<NavigateToEstate token="tok" />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the entrance and the estate tip, and links to the full-screen map', async () => {
    render(<NavigateToEstate token="tok" />);

    expect(await screen.findByText('Main Gate')).toBeInTheDocument();
    expect(screen.getByText('Beside the filling station')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Navigate to Estate' })).toHaveAttribute('href', '/invite/tok/navigate');
    expect(apiFetch).toHaveBeenCalledWith('/invitations/public/tok/location');
  });
});
