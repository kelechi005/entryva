import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NavigationScreen } from '../NavigationScreen';
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
const watchPosition = jest.fn();
const clearWatch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (global as any).fetch = jest.fn();
  (apiFetch as jest.Mock).mockResolvedValue(entrance);
  (fetchRoute as jest.Mock).mockResolvedValue({
    distanceM: 3400,
    durationS: 540,
    coordinates: [[8.5, 7.7], [8.52, 7.73]],
    steps: [{ instruction: 'Turn left onto Estate Road', distanceM: 200 }],
  });
  watchPosition.mockImplementation((s, e) => {
    onFix = s;
    onGpsError = e;
    return 42;
  });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition, clearWatch } });
  // Voice guidance only shows when the browser can speak.
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: { cancel: jest.fn(), speak: jest.fn(), getVoices: () => [] },
  });
});

// Async act so the (mocked) route request settles inside the act scope.
const fix = (latitude: number, longitude: number, accuracy = 15) =>
  act(async () => {
    onFix({ coords: { latitude, longitude, accuracy } });
  });

async function openScreen() {
  const view = render(<NavigationScreen token="tok" />);
  await waitFor(() => expect(watchPosition).toHaveBeenCalled()); // GPS starts by itself
  return view;
}

describe('NavigationScreen (full-screen map)', () => {
  it('explains when navigation is not available and links back to the pass', async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new Error('404'));
    render(<NavigationScreen token="tok" />);

    expect(await screen.findByText(/Navigation isn.t available/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to my pass' })).toHaveAttribute('href', '/invite/tok');
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it('starts GPS on its own and shows the entrance, tip and other map apps', async () => {
    await openScreen();

    expect(screen.getAllByText('Main Gate').length).toBeGreaterThan(0);
    expect(screen.getByText('Beside the filling station')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Google Maps' })).toHaveAttribute(
      'href',
      expect.stringContaining('destination=7.7345,8.5221'),
    );
    expect(screen.getByRole('link', { name: 'Waze' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Apple Maps' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /My pass/ })).toHaveAttribute('href', '/invite/tok');
  });

  it('explains a blocked location permission, and Try again asks again', async () => {
    await openScreen();
    await act(async () => {
      onGpsError({ code: 1 });
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/allow location access/i);
    expect(watchPosition).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(watchPosition).toHaveBeenCalledTimes(2);
  });

  it('shows distance and requests exactly one route on the first fix', async () => {
    await openScreen();
    await fix(7.76, 8.55);
    await fix(7.7601, 8.5501);
    await fix(7.7602, 8.5502);

    expect(await screen.findByText(/km$/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/9 min/)).toBeInTheDocument());
    expect(fetchRoute).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/You.ve arrived/)).not.toBeInTheDocument();
  });

  it('does not claim arrival on one lucky reading, but does on two in a row', async () => {
    await openScreen();
    await fix(7.7346, 8.5221); // ~10 m from the gate
    expect(screen.queryByText(/You.ve arrived/)).not.toBeInTheDocument();
    await fix(7.7346, 8.5221);

    expect(await screen.findByText(/You.ve arrived at Main Gate/)).toBeInTheDocument();
    expect(clearWatch).toHaveBeenCalledWith(42); // GPS stops once arrived
    expect(screen.getByRole('link', { name: 'Show Visitor Pass' })).toHaveAttribute('href', '/invite/tok');
  });

  it('resets the arrival count if the visitor drifts out between readings', async () => {
    await openScreen();
    await fix(7.7346, 8.5221);
    await fix(7.76, 8.55); // far
    await fix(7.7346, 8.5221);
    expect(screen.queryByText(/You.ve arrived/)).not.toBeInTheDocument();
  });

  it('will not decide on a weak GPS fix, and offers a manual "I\'m at the gate"', async () => {
    await openScreen();
    await fix(7.7346, 8.5221, 400);
    await fix(7.7346, 8.5221, 400);

    expect(await screen.findByText(/GPS signal is weak/)).toBeInTheDocument();
    expect(screen.queryByText(/You.ve arrived/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /I.m at the gate/ }));
    expect(await screen.findByText(/You.ve arrived at Main Gate/)).toBeInTheDocument();
  });

  it('falls back to distance + other map apps when the route cannot load', async () => {
    (fetchRoute as jest.Mock).mockRejectedValue(new Error('boom'));
    await openScreen();
    await fix(7.76, 8.55);

    expect(await screen.findByText(/couldn.t load the route/i)).toBeInTheDocument();
    expect(screen.getByText(/km$/)).toBeInTheDocument();
  });

  it('keeps voice guidance and the opt-in live-location share on the full-screen page', async () => {
    await openScreen();

    expect(screen.getByRole('button', { name: 'Start voice guidance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share my live location' })).toBeInTheDocument();
    // Nothing is shared until the visitor taps.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('keeps them mounted after arrival, so arrival can still be announced / shared', async () => {
    await openScreen();
    await fix(7.7346, 8.5221);
    await fix(7.7346, 8.5221);

    expect(await screen.findByText(/You.ve arrived at Main Gate/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /voice guidance|Start again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share my live location' })).toBeInTheDocument();
  });

  it('stops GPS when the visitor leaves the page', async () => {
    const { unmount } = await openScreen();
    await fix(7.76, 8.55);
    expect(clearWatch).not.toHaveBeenCalled();
    unmount();
    expect(clearWatch).toHaveBeenCalledWith(42);
  });
});
