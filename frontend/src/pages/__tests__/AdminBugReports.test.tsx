import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminBugReports from '../AdminBugReports';
import { getBugReports, deleteBugReport } from '@/api/bugReports';

vi.mock('@/api/bugReports', () => ({
  getBugReports: vi.fn(),
  updateBugReport: vi.fn(),
  deleteBugReport: vi.fn(),
}));

const report = {
  id: 'rep-1',
  category: 'playback' as const,
  description: 'Nothing plays after clicking an artist',
  page_url: '/artist/123',
  user_agent: 'TestBrowser/1.0',
  context: null,
  status: 'new' as const,
  admin_note: null,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
  reporter: { id: 'u1', pseudo: 'testuser', email: 'test@example.com' },
};

const listing = {
  items: [report],
  total: 1,
  page: 1,
  pages: 1,
  counts: { new: 1, in_progress: 0, resolved: 0, wont_fix: 0 },
};

describe('AdminBugReports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBugReports).mockResolvedValue(listing as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists the reports of the active tab', async () => {
    render(<AdminBugReports />);

    expect(await screen.findByText('Nothing plays after clicking an artist')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete this report')).toBeInTheDocument();
  });

  it('deletes a report when the admin confirms', async () => {
    vi.mocked(deleteBugReport).mockResolvedValue({ deleted: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<AdminBugReports />);
    await screen.findByText('Nothing plays after clicking an artist');

    await userEvent.click(screen.getByLabelText('Delete this report'));

    await waitFor(() => expect(deleteBugReport).toHaveBeenCalledWith('rep-1'));
    await waitFor(() => expect(screen.queryByText('Nothing plays after clicking an artist')).not.toBeInTheDocument());
    expect(screen.getByText('No report here.')).toBeInTheDocument();
  });

  it('keeps the report when the admin cancels the confirmation', async () => {
    vi.mocked(deleteBugReport).mockResolvedValue({ deleted: true });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<AdminBugReports />);
    await screen.findByText('Nothing plays after clicking an artist');

    await userEvent.click(screen.getByLabelText('Delete this report'));

    expect(deleteBugReport).not.toHaveBeenCalled();
    expect(screen.getByText('Nothing plays after clicking an artist')).toBeInTheDocument();
  });
});
