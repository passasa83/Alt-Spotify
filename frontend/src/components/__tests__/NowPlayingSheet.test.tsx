import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NowPlayingSheet from '../NowPlayingSheet';
import { usePlayerStore } from '@/stores/playerStore';

vi.mock('@/components/SynchronizedLyrics', () => ({
  default: () => <div>lyrics view</div>,
}));

const track = {
  id: 't1',
  title: 'Song',
  artist_id: 'a1',
  artist: { id: 'a1', name: 'Band', created_at: '' },
  file_url: 'x',
  duration_seconds: 200,
  play_count: 0,
  is_explicit: false,
  created_at: '',
};

const renderSheet = (overrides = {}) => {
  const props = {
    onClose: vi.fn(),
    onNavigate: vi.fn(),
    progress: 30,
    duration: 200,
    onSeek: vi.fn(),
    isLiked: false,
    onToggleLike: vi.fn(),
    actions: [],
    ...overrides,
  };
  render(
    <MemoryRouter>
      <NowPlayingSheet {...props} />
    </MemoryRouter>,
  );
  return props;
};

describe('NowPlayingSheet', () => {
  const togglePlay = vi.fn();
  const next = vi.fn();

  beforeEach(() => {
    togglePlay.mockClear();
    next.mockClear();
    usePlayerStore.setState({ currentTrack: track as any, isPlaying: true, queue: [], lyrics: [], togglePlay, next });
  });

  it('shows the track and drives the player', () => {
    const props = renderSheet();
    expect(screen.getByText('Song')).toBeInTheDocument();
    expect(screen.getByText('0:30')).toBeInTheDocument();
    expect(screen.getByText('3:20')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(togglePlay).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(next).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Position in the track'), { target: { value: '90' } });
    expect(props.onSeek).toHaveBeenCalledWith(90);
    fireEvent.click(screen.getByRole('button', { name: 'Add to Liked Songs' }));
    expect(props.onToggleLike).toHaveBeenCalled();
  });

  it('switches between cover, queue and lyrics', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Lyrics' }));
    expect(screen.getByText('No lyrics for this track.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Queue' }));
    expect(screen.getByText(/Next up/i)).toBeInTheDocument();
  });

  it('closes with Escape and with a long swipe down, not a short one', () => {
    const props = renderSheet();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);

    const header = screen.getByRole('button', { name: 'Close the player' }).parentElement!;
    const swipe = (dy: number) => {
      fireEvent.touchStart(header, { touches: [{ clientY: 100 }] });
      fireEvent.touchMove(header, { touches: [{ clientY: 100 + dy }] });
      fireEvent.touchEnd(header, { touches: [] });
    };
    swipe(40);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    swipe(200);
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });
});
