import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocationEditor } from '../LocationEditor';
import { apiFetch } from '@/lib/api-client';
import { fetchRoute } from '@/lib/mapbox';
import { getBestFix } from '@/lib/device-location';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('@/lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('@/lib/mapbox', () => ({
  ...jest.requireActual('@/lib/mapbox'),
  getMapboxToken: jest.fn(() => 'pk.test'),
  fetchRoute: jest.fn(),
  searchPlaces: jest.fn(),
}));
jest.mock('@/lib/device-location', () => ({
  ...jest.requireActual('@/lib/device-location'),
  getBestFix: jest.fn(),
}));
// The real map needs a browser; this stub just lets a test "move" the map.
jest.mock('next/dynamic', () => () => {
  const React = jest.requireActual('react');
  return function MapStub(props: any) {
    return React.createElement(
      'div',
      null,
      React.createElement('button', { onClick: () => props.onCenterChange({ lng: 8.5221, lat: 7.7345, zoom: 12 }) }, 'map: far away'),
      React.createElement('button', { onClick: () => props.onCenterChange({ lng: 8.5221, lat: 7.7345, zoom: 18 }) }, 'map: street level'),
      React.createElement('button', { onClick: () => props.onMarkerDragEnd('gate', { lng: 8.5, lat: 7.7 }) }, 'map: drag gate'),
    );
  };
});

const empty = {
  configured: false,
  estateName: 'Emerald Gardens',
  address: null,
  latitude: null,
  longitude: null,
  mainGateName: null,
  mainGateLatitude: null,
  mainGateLongitude: null,
  entranceInstructions: null,
  arrivalRadiusMeters: 100,
};
const configured = {
  ...empty,
  configured: true,
  latitude: 7.7337,
  longitude: 8.5214,
  mainGateName: 'Front Gate',
  mainGateLatitude: 7.7345,
  mainGateLongitude: 8.5221,
  entranceInstructions: 'Beside the filling station',
};

function load(estate: unknown) {
  (apiFetch as jest.Mock).mockImplementation(async (path: string, init?: { method?: string }) =>
    init?.method === 'PUT' ? estate : estate,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  load(empty);
});

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('LocationEditor (full-screen admin map)', () => {
  it('shows what is already saved', async () => {
    load(configured);
    render(<LocationEditor />);

    expect(await screen.findByText(/Main gate: 7\.73450, 8\.52210/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Front Gate')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Beside the filling station')).toBeInTheDocument();
  });

  it('will not set the gate from a far-away map view, only at street level', async () => {
    render(<LocationEditor />);
    await screen.findByText(/Estate pin: not set/);

    act(() => click('map: far away'));
    expect(screen.getByRole('button', { name: 'Set main gate here' })).toBeDisabled();
    expect(screen.getByText(/Zoom in closer/)).toBeInTheDocument();

    act(() => click('map: street level'));
    const setGate = screen.getByRole('button', { name: 'Set main gate here' });
    expect(setGate).toBeEnabled();
    fireEvent.click(setGate);
    expect(screen.getByText(/Main gate: 7\.73450, 8\.52210/)).toBeInTheDocument();
  });

  it('refuses to save until both pins are set, then saves exactly what was placed', async () => {
    render(<LocationEditor />);
    await screen.findByText(/Estate pin: not set/);

    click('Save location');
    expect(await screen.findByRole('alert')).toHaveTextContent('Set the estate pin first.');

    act(() => click('map: street level'));
    click('Set estate pin here');
    click('Save location');
    expect(await screen.findByRole('alert')).toHaveTextContent('Set the main gate on the map first.');

    click('Set main gate here');
    click('Save location');

    await waitFor(() => expect(push).toHaveBeenCalledWith('/estate'));
    const put = (apiFetch as jest.Mock).mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(put[0]).toBe('/admin/estate/location');
    expect(JSON.parse(put[1].body)).toMatchObject({
      latitude: 7.7345,
      longitude: 8.5221,
      mainGateName: 'Main Gate',
      mainGateLatitude: 7.7345,
      mainGateLongitude: 8.5221,
      arrivalRadiusMeters: 100,
    });
  });

  it('rejects a silly arrival distance before calling the server', async () => {
    load(configured);
    render(<LocationEditor />);
    await screen.findByText(/Main gate:/);

    fireEvent.change(screen.getByLabelText(/Arrived.*distance/), { target: { value: '5' } });
    click('Save location');

    expect(await screen.findByRole('alert')).toHaveTextContent(/between 30 and 500 metres/);
    expect((apiFetch as jest.Mock).mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });

  describe('route preview', () => {
    it('warns when the road ends away from the gate pin', async () => {
      load(configured);
      // ends ~111 m north of the gate
      (fetchRoute as jest.Mock).mockResolvedValue({
        distanceM: 2000,
        durationS: 300,
        coordinates: [[8.5, 7.7], [8.5221, 7.7355]],
        steps: [],
      });
      render(<LocationEditor />);
      await screen.findByText(/Main gate:/);
      act(() => click('map: street level'));

      click('Preview route');

      expect(await screen.findByText(/directions would stop short/)).toBeInTheDocument();
    });

    it('confirms when the route ends at the gate', async () => {
      load(configured);
      (fetchRoute as jest.Mock).mockResolvedValue({
        distanceM: 2000,
        durationS: 300,
        coordinates: [[8.5, 7.7], [8.5221, 7.7345]],
        steps: [],
      });
      render(<LocationEditor />);
      await screen.findByText(/Main gate:/);
      act(() => click('map: street level'));

      click('Preview route');

      expect(await screen.findByText('The route ends at your gate.')).toBeInTheDocument();
    });

    it('forgets an old preview once the gate pin is moved', async () => {
      load(configured);
      (fetchRoute as jest.Mock).mockResolvedValue({
        distanceM: 2000,
        durationS: 300,
        coordinates: [[8.5, 7.7], [8.5221, 7.7345]],
        steps: [],
      });
      render(<LocationEditor />);
      await screen.findByText(/Main gate:/);
      act(() => click('map: street level'));
      click('Preview route');
      await screen.findByText('The route ends at your gate.');

      act(() => click('map: drag gate'));

      expect(screen.queryByText('The route ends at your gate.')).not.toBeInTheDocument();
    });
  });

  describe('"Use my location" from the phone GPS (kept from the existing feature)', () => {
    it('sets the gate from a good reading', async () => {
      (getBestFix as jest.Mock).mockResolvedValue({ lat: 7.7345, lng: 8.5221, accuracyM: 12 });
      render(<LocationEditor />);
      await screen.findByText(/Estate pin: not set/);

      click('Use my location as the main gate');

      expect(await screen.findByText(/now set to where you're standing/)).toBeInTheDocument();
      expect(screen.getByText(/Main gate: 7\.73450, 8\.52210/)).toBeInTheDocument();
    });

    it('refuses a rough reading instead of saving a pin that could send visitors astray', async () => {
      (getBestFix as jest.Mock).mockResolvedValue({ lat: 7.7345, lng: 8.5221, accuracyM: 200 });
      render(<LocationEditor />);
      await screen.findByText(/Estate pin: not set/);

      click('Use my location as the main gate');

      expect(await screen.findByText(/isn't accurate enough/)).toBeInTheDocument();
      expect(screen.getByText(/Main gate: not set/)).toBeInTheDocument();
    });
  });
});
