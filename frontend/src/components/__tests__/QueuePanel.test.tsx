import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueueContent } from '../QueuePanel';
import { usePlayerStore } from '@/stores/playerStore';
import type { Track } from '@/types';

const createTrack = (id: string, title: string, duration_seconds: number): Track => ({
  id,
  title,
  artist_id: 'artist-1',
  artist: { id: 'artist-1', name: 'Band', created_at: '' },
  file_url: `local:/test/${id}.flac`,
  duration_seconds,
  play_count: 0,
  is_explicit: false,
  created_at: '',
});

const renderContent = () => {
  render(
    <MemoryRouter>
      <QueueContent />
    </MemoryRouter>,
  );
};

describe('QueueContent', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      currentTrack: null,
      queue: [],
      autoQueuedIds: [],
      context: null,
      history: [],
    });
  });

  it('shows the empty message when nothing is queued', () => {
    renderContent();
    expect(screen.getByText('Nothing queued yet: similar tracks will follow.')).toBeInTheDocument();
  });

  it('sections the queue into user picks, rest of selection and autoplay', () => {
    const now = createTrack('now', 'Current Song', 200);
    const mine = createTrack('u1', 'My Pick', 60);
    const c1 = createTrack('c1', 'Playlist Next', 120);
    const c2 = createTrack('c2', 'Playlist Later', 180);
    const s1 = createTrack('s1', 'Similar One', 240);
    usePlayerStore.setState({
      currentTrack: now,
      queue: [mine, c1, c2, s1],
      autoQueuedIds: ['c1', 'c2', 's1'],
      context: [now, c1, c2],
    });

    renderContent();

    expect(screen.getByText('Current Song')).toBeInTheDocument();
    expect(screen.getByText('Your picks (1)')).toBeInTheDocument();
    expect(screen.getByText('Rest of the selection (2)')).toBeInTheDocument();
    expect(screen.getByText('Autoplay (1)')).toBeInTheDocument();

    // Continuous position numbers across sections.
    for (const n of ['1', '2', '3', '4']) {
      expect(screen.getByText(n)).toBeInTheDocument();
    }

    // Total: 60 + 120 + 180 + 240 = 600 s.
    expect(screen.getByText('4 tracks · 10m')).toBeInTheDocument();
  });

  it('uses the singular when a single track is queued', () => {
    const now = createTrack('now', 'Current Song', 200);
    const s1 = createTrack('s1', 'Similar One', 240);
    usePlayerStore.setState({
      currentTrack: now,
      queue: [s1],
      autoQueuedIds: ['s1'],
      context: null,
    });

    renderContent();

    expect(screen.queryByText('Your picks (1)')).not.toBeInTheDocument();
    expect(screen.getByText('Autoplay (1)')).toBeInTheDocument();
    expect(screen.getByText('1 track · 4m')).toBeInTheDocument();
  });
});
