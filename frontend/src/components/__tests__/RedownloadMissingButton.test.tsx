import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RedownloadMissingButton from '../RedownloadMissingButton';
import { redownloadMissing } from '@/api/admin';

vi.mock('@/api/admin', () => ({
  redownloadMissing: vi.fn(),
}));

const mocked = vi.mocked(redownloadMissing);

describe('RedownloadMissingButton', () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('counts first, asks, then queues the downloads', async () => {
    mocked
      .mockResolvedValueOnce({ count: 42, queued: 0, running: false })
      .mockResolvedValueOnce({ count: 42, queued: 42, running: true });
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    render(<RedownloadMissingButton />);

    fireEvent.click(await screen.findByRole('button', { name: /Download again the 42 missing files/ }));
    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(mocked).toHaveBeenLastCalledWith(false));
    expect(screen.getByText(/being downloaded in the background/)).toBeInTheDocument();
  });

  it('stays hidden when no file is missing', async () => {
    mocked.mockResolvedValue({ count: 0, queued: 0, running: false });
    render(<RedownloadMissingButton />);
    await waitFor(() => expect(mocked).toHaveBeenCalled());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does nothing when the admin cancels', async () => {
    mocked.mockResolvedValue({ count: 42, queued: 0, running: false });
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    render(<RedownloadMissingButton />);

    fireEvent.click(await screen.findByRole('button', { name: /42 missing files/ }));
    await waitFor(() => expect(mocked).toHaveBeenCalledTimes(1)); // the dry run only
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
