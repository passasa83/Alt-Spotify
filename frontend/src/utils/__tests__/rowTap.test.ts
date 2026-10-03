import { describe, it, expect, vi, afterEach } from 'vitest';
import { rowTapHandler } from '../rowTap';

const setPointer = (coarse: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: coarse && query === '(pointer: coarse)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as any;
};

const tapOn = (element: HTMLElement) => ({ target: element }) as unknown as React.MouseEvent;

describe('rowTapHandler', () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it('plays when a touch screen user taps the row itself', () => {
    setPointer(true);
    const play = vi.fn();
    const row = document.createElement('div');
    rowTapHandler(play)(tapOn(row));
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('leaves buttons and links of the row alone', () => {
    setPointer(true);
    const play = vi.fn();
    const row = document.createElement('div');
    const menu = document.createElement('button');
    const icon = document.createElement('span');
    menu.appendChild(icon);
    row.appendChild(menu);
    rowTapHandler(play)(tapOn(icon));
    expect(play).not.toHaveBeenCalled();
  });

  it('does nothing with a mouse (double-click plays there)', () => {
    setPointer(false);
    const play = vi.fn();
    rowTapHandler(play)(tapOn(document.createElement('div')));
    expect(play).not.toHaveBeenCalled();
  });
});
