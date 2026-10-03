import type React from 'react';

// Taps on these keep their own meaning (menu, like button...).
const INTERACTIVE = 'a, button, input, select, textarea, label, [role="menu"], [role="menuitem"]';

export const isCoarsePointer = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/**
 * Touch screens: tapping anywhere on a track row plays it, like the mobile
 * apps (the mouse keeps double-click, so a click can still select text).
 * Title and artist links are made non-interactive on touch screens with
 * `pointer-coarse:pointer-events-none`; the row menu offers "Go to...".
 */
export const rowTapHandler = (play: () => void) => (e: React.MouseEvent) => {
  if (!isCoarsePointer()) return;
  if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
  play();
};
