import { fireEvent, render, screen } from '@testing-library/react';
import { PushToggle } from '../PushToggle';
import { PushPrompt } from '../PushPrompt';
import { usePushStatus } from '@/hooks/usePushStatus';

jest.mock('@/hooks/usePushStatus', () => ({ usePushStatus: jest.fn() }));

function status(state: string, extra: Record<string, unknown> = {}) {
  const enable = jest.fn();
  const disable = jest.fn();
  (usePushStatus as jest.Mock).mockReturnValue({ state, busy: false, error: null, enable, disable, ...extra });
  return { enable, disable };
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe('PushToggle', () => {
  it('offers to turn notifications on', () => {
    const { enable } = status('off');
    render(<PushToggle />);

    fireEvent.click(screen.getByRole('button', { name: 'Turn on notifications' }));
    expect(enable).toHaveBeenCalled();
  });

  it('offers to turn them off when on', () => {
    const { disable } = status('on');
    render(<PushToggle />);

    expect(screen.getByText(/On for this device/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Turn off on this device' }));
    expect(disable).toHaveBeenCalled();
  });

  it.each([
    ['install-needed', /add Entryva to your Home Screen/],
    ['blocked', /blocked for this site/],
    ['unsupported', /can't receive push notifications/],
    ['server-off', /haven't been switched on for this estate/],
  ])('explains the "%s" case instead of showing a button that cannot work', (state, text) => {
    status(state);
    render(<PushToggle />);

    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Turn on notifications/ })).not.toBeInTheDocument();
  });

  it('shows nothing while still checking', () => {
    status('loading');
    const { container } = render(<PushToggle />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a problem if turning on failed', () => {
    status('off', { error: 'Could not turn on notifications.' });
    render(<PushToggle />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not turn on');
  });
});

describe('PushPrompt', () => {
  it('only appears when push can actually be turned on', () => {
    for (const s of ['loading', 'unsupported', 'install-needed', 'server-off', 'blocked', 'on']) {
      status(s);
      const { container, unmount } = render(<PushPrompt />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it('"Turn on" enables push', async () => {
    const { enable } = status('off');
    render(<PushPrompt />);

    fireEvent.click(await screen.findByRole('button', { name: 'Turn on' }));
    expect(enable).toHaveBeenCalled();
  });

  it('"Not now" hides it, and it stays hidden for a while', async () => {
    status('off');
    const first = render(<PushPrompt />);

    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();

    const second = render(<PushPrompt />);
    expect(second.container).toBeEmptyDOMElement();
  });

  it('comes back after a week', async () => {
    status('off');
    localStorage.setItem('entryva-push-prompt-dismissed', String(Date.now() - 8 * 24 * 60 * 60 * 1000));
    render(<PushPrompt />);
    expect(await screen.findByRole('button', { name: 'Turn on' })).toBeInTheDocument();
  });
});
