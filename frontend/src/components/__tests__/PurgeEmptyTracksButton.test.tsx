import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PurgeEmptyTracksButton from '../PurgeEmptyTracksButton';
import { purgeUnplayableTracks } from '@/api/admin';

vi.mock('@/api/admin', () => ({
  purgeUnplayableTracks: vi.fn(),
}));

const mocked = vi.mocked(purgeUnplayableTracks);

describe('PurgeEmptyTracksButton', () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it('counts first, asks, then deletes tracks and empty albums/artists', async () => {
    mocked
      .mockResolvedValueOnce({ count: 20, deleted: 0, orphan_albums: 245, orphan_artists: 363 })
      .mockResolvedValueOnce({ count: 20, deleted: 20, orphan_albums: 245, orphan_artists: 363 })
      .mockResolvedValueOnce({ count: 0, deleted: 0, orphan_albums: 0, orphan_artists: 0 });
    const onDone = vi.fn();
    render(<PurgeEmptyTracksButton onDone={onDone} />);

    // Dry run with every option: nothing is deleted just by opening the page.
    fireEvent.click(await screen.findByRole('button', { name: /Delete the 20 tracks without audio/ }));
    expect(mocked).toHaveBeenLastCalledWith(true, true, true);
    expect(screen.getByRole('alertdialog')).toHaveTextContent('245 albums and 363 artists');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mocked).toHaveBeenCalledWith(false, true, true);
    expect(await screen.findByText('No track without audio to delete.')).toBeInTheDocument();
  });

  it('can be cancelled without deleting anything', async () => {
    mocked.mockResolvedValue({ count: 3, deleted: 0, orphan_albums: 0, orphan_artists: 0 });
    render(<PurgeEmptyTracksButton />);

    fireEvent.click(await screen.findByRole('button', { name: /Delete the 3 tracks/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mocked).not.toHaveBeenCalledWith(false, true, true);
  });
});
