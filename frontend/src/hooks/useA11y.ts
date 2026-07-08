import { useCallback, useEffect, useRef } from 'react';

export function useA11y() {
  const liveRegionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const region = document.createElement('div');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    region.className = 'sr-only';
    document.body.appendChild(region);
    liveRegionRef.current = region;

    return () => {
      document.body.removeChild(region);
    };
  }, []);

  const announce = useCallback((message: string) => {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = message;
      setTimeout(() => {
        if (liveRegionRef.current) {
          liveRegionRef.current.textContent = '';
        }
      }, 1000);
    }
  }, []);

  const trapFocus = useCallback((element: HTMLElement) => {
    const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusableElements = element.querySelectorAll<HTMLElement>(focusableSelectors);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    element.addEventListener('keydown', handleKeyDown);
    firstElement?.focus();

    return () => {
      element.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const useFocusReturn = useCallback(() => {
    const previousFocusRef = useRef<HTMLElement | null>(null);

    const capture = useCallback(() => {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }, []);

    const restore = useCallback(() => {
      previousFocusRef.current?.focus();
    }, []);

    return { capture, restore };
  }, []);

  return { announce, trapFocus, useFocusReturn };
}
