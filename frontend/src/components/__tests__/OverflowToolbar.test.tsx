import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListMusic, Mic2, Sliders, Radio } from 'lucide-react';
import OverflowToolbar, { type ToolbarItem } from '../OverflowToolbar';
import { usePopoverStore } from '@/stores/popoverStore';

const items = (onClick = vi.fn()): ToolbarItem[] => [
  { key: 'a', label: 'Queue', icon: ListMusic, onClick },
  { key: 'b', label: 'Lyrics', icon: Mic2, onClick },
  { key: 'c', label: 'Equalizer', icon: Sliders, onClick },
  { key: 'd', label: 'Jam', icon: Radio, onClick },
];

const mockLayout = (containerWidth: number, itemWidth: number) => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(containerWidth);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(itemWidth);
};

afterEach(() => {
  usePopoverStore.setState({ openId: null });
});

describe('OverflowToolbar', () => {
  it('shows every button when they fit', () => {
    mockLayout(500, 28);
    render(<OverflowToolbar items={items()} moreLabel="More" />);
    for (const label of ['Queue', 'Lyrics', 'Equalizer', 'Jam']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
  });

  it('moves what does not fit into the "more" menu instead of overlapping', async () => {
    // 4 x 28px + gaps = 136px > 100px: two buttons + "more" fit.
    mockLayout(100, 28);
    const onClick = vi.fn();
    render(<OverflowToolbar items={items(onClick)} moreLabel="More" />);

    expect(screen.getByRole('button', { name: 'Queue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lyrics' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Equalizer' })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'More' }));
    const hidden = screen.getAllByRole('menuitem').map((el) => el.textContent);
    expect(hidden).toEqual(['Equalizer', 'Jam']);

    await user.click(screen.getByRole('menuitem', { name: 'Jam' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes its menu when another popover opens', async () => {
    mockLayout(100, 28);
    render(<OverflowToolbar items={items()} moreLabel="More" />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    usePopoverStore.getState().open('notifications');
    expect(await screen.findByRole('button', { name: 'More' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
