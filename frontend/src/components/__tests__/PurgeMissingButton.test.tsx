import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PurgeMissingButton from '../PurgeMissingButton';
import { purgeMissingTracks } from '@/api/admin';

vi.mock('@/api/admin', () => ({
  purgeMissingTracks: vi.fn(),
}));

const mocked = vi.mocked(purgeMissingTracks);

describe('PurgeMissingButton', () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it('counts first, asks, then deletes the tracks whose file is gone', async () => {
    mocked
      .mockResolvedValueOnce({ count: 7, deleted: 0, orphan_albums: 1, orphan_artists: 2 })
      .mockResolvedValueOnce({ count: 7, deleted: 7, orphan_albums: 1, orphan_artists: 2 })
      .mockResolvedValueOnce({ count: 0, deleted: 0 });
    const onDone = vi.fn();
    render(<PurgeMissingButton onDone={onDone} />);

    // Dry run with every option: nothing is deleted just by opening the page.
    fireEvent.click(await screen.findByRole('button', { name: /Delete the 7 tracks whose file is gone/ }));
    expect(mocked).toHaveBeenLastCalledWith(true, true, true);
    expect(screen.getByRole('alertdialog')).toHaveTextContent('1 albums and 2 artists');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mocked).toHaveBeenCalledWith(false, true, true, false);
    // Nothing left to delete: the button steps aside, the health check speaks.
    await waitFor(() => expect(screen.queryByRole('button')).not.toBeInTheDocument());
  });

  it('stays hidden while there is no unplayable missing track', async () => {
    mocked.mockResolvedValue({ count: 0, deleted: 0 });
    render(<PurgeMissingButton />);
    await waitFor(() => expect(mocked).toHaveBeenCalled());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('proposes the HLS-backed tracks when nothing unplayable is left', async () => {
    mocked
      .mockResolvedValueOnce({ count: 0, deleted: 0 })
      .mockResolvedValueOnce({ count: 5, deleted: 0, orphan_albums: 0, orphan_artists: 1 })
      .mockResolvedValueOnce({ count: 5, deleted: 5, orphan_albums: 0, orphan_artists: 1 })
      .mockResolvedValue({ count: 0, deleted: 0 });
    const onDone = vi.fn();
    render(<PurgeMissingButton onDone={onDone} />);

    // First preview (unplayable only) is empty: the HLS variant takes over.
    fireEvent.click(await screen.findByRole('button', { name: /Delete the 5 tracks whose original file is gone/ }));
    expect(mocked).toHaveBeenLastCalledWith(true, true, true, true);
    expect(screen.getByRole('alertdialog')).toHaveTextContent('still play through HLS');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mocked).toHaveBeenCalledWith(false, true, true, true);
    await waitFor(() => expect(screen.queryByRole('button')).not.toBeInTheDocument());
  });

  it('can be cancelled without deleting anything', async () => {
    mocked.mockResolvedValue({ count: 3, deleted: 0, orphan_albums: 0, orphan_artists: 0 });
    render(<PurgeMissingButton />);

    fireEvent.click(await screen.findByRole('button', { name: /Delete the 3 tracks/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mocked).not.toHaveBeenCalledWith(false, true, true);
  });
});
