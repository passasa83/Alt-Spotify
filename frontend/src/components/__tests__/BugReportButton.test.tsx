import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BugReportButton from '../BugReportButton';
import { sendBugReport } from '@/api/bugReports';
import { usePlayerStore } from '@/stores/playerStore';
import { recordError } from '@/utils/diagnostics';

vi.mock('@/api/bugReports', () => ({
  sendBugReport: vi.fn().mockResolvedValue({ id: 'r1' }),
}));

const openForm = () => {
  render(
    <MemoryRouter initialEntries={['/artist/a1']}>
      <BugReportButton />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Report a bug' }));
};

describe('BugReportButton', () => {
  beforeEach(() => {
    vi.mocked(sendBugReport).mockClear();
    usePlayerStore.setState({
      currentTrack: { id: 't1', title: 'Song', artist_id: 'a1', file_url: 'x', duration_seconds: 60, play_count: 0, is_explicit: false, created_at: '' },
      isPlaying: true,
      progress: 12.4,
    });
  });

  it('sends the description with the page and the technical context', async () => {
    recordError('HTTP 404 GET /tracks/t1/stream');
    openForm();

    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Display' }));
    fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: 'Cover art is blurry' } });
    fireEvent.click(send);

    await waitFor(() => expect(sendBugReport).toHaveBeenCalledTimes(1));
    const body = vi.mocked(sendBugReport).mock.calls[0]![0];
    expect(body.category).toBe('display');
    expect(body.description).toBe('Cover art is blurry');
    expect(body.page_url).toBe('/artist/a1');
    expect((body.context as any).track).toMatchObject({ id: 't1', title: 'Song', is_playing: true, position: 12 });
    expect((body.context as any).errors.at(-1).message).toBe('HTTP 404 GET /tracks/t1/stream');
    // The form closes once sent.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('leaves the technical context out when unchecked', async () => {
    openForm();
    fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: 'Something odd' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(sendBugReport).toHaveBeenCalledTimes(1));
    expect(vi.mocked(sendBugReport).mock.calls[0]![0].context).toBeUndefined();
  });
});
