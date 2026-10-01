import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NavigateToEstate } from '../NavigateToEstate';
import { apiFetch } from '@/lib/api-client';
import { fetchRoute } from '@/lib/mapbox';

jest.mock('next/dynamic', () => () => () => null); // the map itself is not under test
jest.mock('@/lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('@/lib/mapbox', () => ({
  ...jest.requireActual('@/lib/mapbox'),
  getMapboxToken: jest.fn(() => 'pk.test'),
  fetchRoute: jest.fn(),
}));

const entrance = {
  estateName: 'Emerald Gardens',
  gateName: 'Main Gate',
  latitude: 7.7345,
  longitude: 8.5221,
  instructions: 'Beside the filling station',
  arrivalRadiusMeters: 100,
};

let onFix: (p: any) => void;
let onGpsError: (e: any) => void;
const clearWatch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (apiFetch as jest.Mock).mockResolvedValue(entrance);
  (fetchRoute as jest.Mock).mockResolvedValue({
    distanceM: 3400,
    durationS: 540,
    coordinates: [[8.5, 7.7], [8.52, 7.73]],
    steps: [{ instruction: 'Turn left onto Estate Road', distanceM: 200 }],
  });
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: jest.fn((s, e) => {
        onFix = s;
        onGpsError = e;
        return 42;
      }),
      clearWatch,
    },
  });
});

// Async act so the (mocked) route request settles inside the act scope.
const fix = (latitude: number, longitude: number, accuracy = 15) =>
  act(async () => {
    onFix({ coords: { latitude, longitude, accuracy } });
  });

async function startNavigation(onShowPass = jest.fn()) {
  const view = render(<NavigateToEstate token="tok" onShowPass={onShowPass} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Navigate to Estate' }));
  return { onShowPass, unmount: view.unmount };
}

describe('NavigateToEstate', () => {
  it('renders nothing when the estate has no entrance configured', async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new Error('404'));
    const { container } = render(<NavigateToEstate token="tok" onShowPass={jest.fn()} />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the entrance to use, the estate tip, and a prominent Navigate button', async () => {
    render(<NavigateToEstate token="tok" onShowPass={jest.fn()} />);
    expect(await screen.findByText('Main Gate')).toBeInTheDocument();
    expect(screen.getByText('Beside the filling station')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Navigate to Estate' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Google Maps/ })).toHaveAttribute(
      'href',
      expect.stringContaining('destination=7.7345,8.5221'),
    );
    expect(apiFetch).toHaveBeenCalledWith('/invitations/public/tok/location');
  });

  it('explains how to fix a blocked location permission instead of breaking', async () => {
    await startNavigation();
    await act(async () => { onGpsError({ code: 1 }); });
    expect(await screen.findByRole('alert')).toHaveTextContent(/allow location access/i);
    expect(screen.getByRole('button', { name: 'Navigate to Estate' })).toBeInTheDocument();
  });

  it('shows distance and requests exactly one route on the first fix', async () => {
    await startNavigation();
    await fix(7.76, 8.55);
    await fix(7.7601, 8.5501);
    await fix(7.7602, 8.5502);

    expect(await screen.findByText(/km$/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/9 min/)).toBeInTheDocument());
    expect(fetchRoute).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/You.ve arrived/)).not.toBeInTheDocument();
  });

  it('does not claim arrival on one lucky reading, but does on two in a row', async () => {
    const { onShowPass } = await startNavigation();
    await fix(7.7346, 8.5221); // ~10 m from the gate
    expect(screen.queryByText(/You.ve arrived/)).not.toBeInTheDocument();
    await fix(7.7346, 8.5221);

    expect(await screen.findByText(/You.ve arrived at Main Gate/)).toBeInTheDocument();
    expect(clearWatch).toHaveBeenCalledWith(42); // GPS stops once arrived

    fireEvent.click(screen.getByRole('button', { name: 'Show Visitor Pass' }));
    expect(onShowPass).toHaveBeenCalledTimes(1);
  });

  it('resets the arrival count if the visitor drifts out between readings', async () => {
    await startNavigation();
    await fix(7.7346, 8.5221);
    await fix(7.76, 8.55); // far
    await fix(7.7346, 8.5221);
    expect(screen.queryByText(/You.ve arrived/)).not.toBeInTheDocument();
  });

  it('will not decide on a weak GPS fix, and offers a manual "I\'m at the gate"', async () => {
    await startNavigation();
    await fix(7.7346, 8.5221, 400);
    await fix(7.7346, 8.5221, 400);

    expect(await screen.findByText(/GPS signal is weak/)).toBeInTheDocument();
    expect(screen.queryByText(/You.ve arrived/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /I.m at the gate/ }));
    expect(await screen.findByText(/You.ve arrived at Main Gate/)).toBeInTheDocument();
  });

  it('falls back to distance + Google Maps when the route cannot load', async () => {
    (fetchRoute as jest.Mock).mockRejectedValue(new Error('boom'));
    await startNavigation();
    await fix(7.76, 8.55);

    expect(await screen.findByText(/couldn.t load the route/i)).toBeInTheDocument();
    expect(screen.getByText(/km$/)).toBeInTheDocument();
  });

  it('stops GPS when the visitor leaves the page', async () => {
    const { unmount } = await startNavigation();
    await fix(7.76, 8.55);
    expect(clearWatch).not.toHaveBeenCalled();
    unmount();
    expect(clearWatch).toHaveBeenCalledWith(42);
  });

  it('stops GPS when the visitor taps Stop, and returns to the start screen', async () => {
    await startNavigation();
    await fix(7.76, 8.55);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(clearWatch).toHaveBeenCalledWith(42);
    expect(screen.getByRole('button', { name: 'Navigate to Estate' })).toBeInTheDocument();
  });
});
