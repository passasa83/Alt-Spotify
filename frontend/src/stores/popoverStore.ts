import { create } from 'zustand';

/**
 * One popover / dropdown / panel open at a time across the whole UI, so menus
 * and panels never stack on top of each other: opening one closes the other.
 */
interface PopoverState {
  openId: string | null;
  open: (id: string) => void;
  close: (id?: string) => void;
  toggle: (id: string) => void;
}

export const usePopoverStore = create<PopoverState>((set, get) => ({
  openId: null,
  open: (id) => set({ openId: id }),
  // Without id: close whatever is open. With id: only if that one is open.
  close: (id) => {
    if (id === undefined || get().openId === id) set({ openId: null });
  },
  toggle: (id) => set({ openId: get().openId === id ? null : id }),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') usePopoverStore.getState().close();
  });
}
