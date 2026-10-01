import { DeviceLocationError, getBestFix } from '../device-location';

let onSuccess: (p: unknown) => void;
let onError: (e: unknown) => void;
const clearWatch = jest.fn();

function installGeolocation(value: unknown) {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value });
}

const reading = (accuracy: number, latitude = 7.7, longitude = 8.5) => ({
  coords: { latitude, longitude, accuracy },
});

beforeEach(() => {
  jest.useFakeTimers();
  clearWatch.mockClear();
  installGeolocation({
    watchPosition: jest.fn((success, error) => {
      onSuccess = success;
      onError = error;
      return 7;
    }),
    clearWatch,
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('getBestFix', () => {
  it('resolves as soon as a reading is accurate enough, and stops the GPS', async () => {
    const promise = getBestFix({ goodEnoughM: 20 });
    onSuccess(reading(60));
    onSuccess(reading(12, 7.71, 8.51));

    await expect(promise).resolves.toEqual({ lat: 7.71, lng: 8.51, accuracyM: 12 });
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it('returns the most accurate reading seen when time runs out', async () => {
    const promise = getBestFix({ maxWaitMs: 10_000 });
    onSuccess(reading(80));
    onSuccess(reading(45, 7.72, 8.52));
    onSuccess(reading(200));
    jest.advanceTimersByTime(10_000);

    await expect(promise).resolves.toMatchObject({ lat: 7.72, lng: 8.52, accuracyM: 45 });
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it('reports the best accuracy so far as it improves', async () => {
    const progress = jest.fn();
    const promise = getBestFix({ goodEnoughM: 20, onProgress: progress });
    onSuccess(reading(90));
    onSuccess(reading(150));
    onSuccess(reading(15));
    await promise;

    expect(progress.mock.calls.map((c) => c[0])).toEqual([90, 90, 15]);
  });

  it('rejects as denied when the user refuses permission', async () => {
    const promise = getBestFix();
    onError({ code: 1 });

    await expect(promise).rejects.toMatchObject({ kind: 'denied' });
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it('keeps waiting through a temporary GPS error', async () => {
    const promise = getBestFix({ goodEnoughM: 20 });
    onError({ code: 2 });
    onSuccess(reading(10));

    await expect(promise).resolves.toMatchObject({ accuracyM: 10 });
  });

  it('rejects as unavailable when no reading ever arrives', async () => {
    const promise = getBestFix({ maxWaitMs: 5_000 });
    const assertion = expect(promise).rejects.toMatchObject({ kind: 'unavailable' });
    jest.advanceTimersByTime(5_000);

    await assertion;
  });

  it('rejects as unsupported when the browser has no geolocation', async () => {
    installGeolocation(undefined);

    await expect(getBestFix()).rejects.toBeInstanceOf(DeviceLocationError);
    await expect(getBestFix()).rejects.toMatchObject({ kind: 'unsupported' });
  });
});
