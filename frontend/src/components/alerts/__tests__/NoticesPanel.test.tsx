import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NoticesPanel } from '../NoticesPanel';
import { apiFetch } from '@/lib/api-client';

jest.mock('@/lib/api-client', () => ({ apiFetch: jest.fn() }));

const existing = [
  { id: 'n1', kind: 'ANNOUNCEMENT', title: 'Water shut-off', body: 'Saturday 9am to noon.', authorName: 'Admin', createdAt: '2026-10-05T09:00:00.000Z' },
];

beforeEach(() => {
  jest.clearAllMocks();
  (apiFetch as jest.Mock).mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
    if (path === '/announcements' && init?.method === 'POST') {
      const b = JSON.parse(init.body as string);
      return { id: 'new', authorName: 'Me', createdAt: '2026-10-05T10:00:00.000Z', ...b };
    }
    if (init?.method === 'DELETE') return { deleted: true };
    return existing;
  });
});

describe('NoticesPanel', () => {
  it('lets a resident read but not post or delete', async () => {
    render(<NoticesPanel role="RESIDENT" />);

    expect(await screen.findByText('Water shut-off')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Post a notice|Send a security alert/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  });

  it('lets a security officer send security alerts only, never a notice', async () => {
    render(<NoticesPanel role="SECURITY_OFFICER" />);
    await screen.findByText('Water shut-off');

    fireEvent.click(screen.getByRole('button', { name: 'Send a security alert' }));

    expect(screen.queryByRole('radio', { name: 'Estate notice' })).not.toBeInTheDocument();
    expect(screen.getByText(/Everyone in the estate gets a phone alert/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  });

  it('lets the admin choose notice or security alert, and delete', async () => {
    render(<NoticesPanel role="ESTATE_ADMIN" />);
    await screen.findByText('Water shut-off');

    fireEvent.click(screen.getByRole('button', { name: 'Post a notice or alert' }));

    expect(screen.getByRole('radio', { name: 'Estate notice' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Security alert' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Water shut-off' })).toBeInTheDocument();
  });

  it('checks the form before anything is sent', async () => {
    render(<NoticesPanel role="ESTATE_ADMIN" />);
    await screen.findByText('Water shut-off');
    fireEvent.click(screen.getByRole('button', { name: 'Post a notice or alert' }));

    fireEvent.click(screen.getByRole('button', { name: /Review & send/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('short title');

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Gate repairs' } });
    fireEvent.click(screen.getByRole('button', { name: /Review & send/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Write the message');
    expect((apiFetch as jest.Mock).mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('always asks before notifying everyone, then posts and shows it at the top', async () => {
    render(<NoticesPanel role="ESTATE_ADMIN" />);
    await screen.findByText('Water shut-off');
    fireEvent.click(screen.getByRole('button', { name: 'Post a notice or alert' }));

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Gate repairs' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Main gate closed Monday.' } });
    fireEvent.click(screen.getByRole('button', { name: /Review & send/ }));

    // Nothing sent yet: this is the "are you sure" step.
    expect(await screen.findByText('Send this notice?')).toBeInTheDocument();
    expect((apiFetch as jest.Mock).mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Send to everyone' }));

    await waitFor(() => expect(screen.getByText('Gate repairs')).toBeInTheDocument());
    const post = (apiFetch as jest.Mock).mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post[1].body)).toEqual({ kind: 'ANNOUNCEMENT', title: 'Gate repairs', body: 'Main gate closed Monday.' });
  });

  it('cancelling the confirmation sends nothing', async () => {
    render(<NoticesPanel role="ESTATE_ADMIN" />);
    await screen.findByText('Water shut-off');
    fireEvent.click(screen.getByRole('button', { name: 'Post a notice or alert' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Gate repairs' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Closed.' } });
    fireEvent.click(screen.getByRole('button', { name: /Review & send/ }));

    await screen.findByText('Send this notice?');
    // Two "Cancel" buttons exist (the form's and the dialog's); the dialog is rendered last.
    const cancels = screen.getAllByRole('button', { name: 'Cancel' });
    fireEvent.click(cancels[cancels.length - 1]);

    await waitFor(() => expect(screen.queryByText('Send this notice?')).not.toBeInTheDocument());
    expect((apiFetch as jest.Mock).mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('deletes only after confirming', async () => {
    render(<NoticesPanel role="ESTATE_ADMIN" />);
    await screen.findByText('Water shut-off');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Water shut-off' }));
    expect(await screen.findByText('Delete this post?')).toBeInTheDocument();
    expect((apiFetch as jest.Mock).mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Water shut-off')).not.toBeInTheDocument());
  });
});
