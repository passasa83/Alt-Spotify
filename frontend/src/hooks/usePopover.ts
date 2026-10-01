import { useEffect, type RefObject } from 'react';
import { usePopoverStore } from '@/stores/popoverStore';

/**
 * State of one popover in the shared "one open at a time" store. Pass the
 * refs that belong to it (trigger + panel) to close it on outside clicks.
 */
export function usePopover(id: string, refs: RefObject<HTMLElement | null>[] = []) {
  const isOpen = usePopoverStore((s) => s.openId === id);
  const { toggle, open, close } = usePopoverStore.getState();

  useEffect(() => {
    if (!isOpen || refs.length === 0) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (refs.some((r) => r.current?.contains(target))) return;
      // Its own trigger toggles it: closing here would reopen it on click.
      if ((target as Element).closest?.(`[data-popover-trigger="${CSS.escape(id)}"]`)) return;
      close(id);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
    // refs are stable ref objects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, id]);

  return {
    isOpen,
    toggle: () => toggle(id),
    open: () => open(id),
    close: () => close(id),
  };
}
