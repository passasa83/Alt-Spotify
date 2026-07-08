import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SynchronizedLyrics from '../SynchronizedLyrics';
import type { LyricsLine } from '@/types';

const lyrics: LyricsLine[] = [
  { time_seconds: 0, text: 'First line' },
  { time_seconds: 5, text: 'Second line' },
  { time_seconds: 10, text: 'Third line' },
];

beforeEach(() => {
  Element.prototype.scrollTo = vi.fn();
});

describe('SynchronizedLyrics', () => {
  it('renders no lyrics message', () => {
    render(<SynchronizedLyrics lyrics={[]} currentTime={0} />);
    expect(screen.getByText('No lyrics available')).toBeInTheDocument();
  });

  it('renders lyrics lines', () => {
    render(<SynchronizedLyrics lyrics={lyrics} currentTime={0} />);
    expect(screen.getByText('First line')).toBeInTheDocument();
    expect(screen.getByText('Second line')).toBeInTheDocument();
    expect(screen.getByText('Third line')).toBeInTheDocument();
  });

  it('highlights active line', () => {
    render(<SynchronizedLyrics lyrics={lyrics} currentTime={7} />);
    const secondLine = screen.getByText('Second line');
    expect(secondLine.className).toContain('text-white');
  });

  it('clicking line calls onSeek', () => {
    const onSeek = vi.fn();
    render(<SynchronizedLyrics lyrics={lyrics} currentTime={0} onSeek={onSeek} />);
    fireEvent.click(screen.getByText('Third line'));
    expect(onSeek).toHaveBeenCalledWith(10);
  });
});
