import { useLayoutEffect, useRef, useState, useId, type ReactNode } from 'react';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { usePopover } from '@/hooks/usePopover';

export interface ToolbarItem {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  /** Extra text shown next to the label in the overflow menu (e.g. "1.5x"). */
  hint?: string;
  /** Id of the popover this button toggles (see usePopover). */
  popover?: string;
}

interface OverflowToolbarProps {
  items: ToolbarItem[];
  /** Label of the overflow button ("More"). */
  moreLabel: string;
  /** Opens upward (player bar) or downward (top bar). */
  placement?: 'top' | 'bottom';
  className?: string;
  /** Rendered after the buttons, never collapsed (e.g. a volume slider). */
  trailing?: ReactNode;
}

const GAP = 8; // matches gap-2

/**
 * Icon buttons that never overlap: the ones that don't fit in the available
 * width move into a "⋯" menu, in order, so every action stays reachable.
 */
const OverflowToolbar = ({ items, moreLabel, placement = 'top', className = '', trailing }: OverflowToolbarProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const trailingRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);
  const popoverId = `toolbar-${useId()}`;
  const { isOpen, toggle, close } = usePopover(popoverId, [menuRef]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const compute = () => {
      const widths = Array.from(measure.children).map((el) => (el as HTMLElement).offsetWidth);
      const moreWidth = widths.pop() ?? 32; // last measured child is the "more" button
      const trailingWidth = trailingRef.current ? trailingRef.current.offsetWidth + GAP : 0;
      const available = container.clientWidth - trailingWidth;

      const total = widths.reduce((sum, w) => sum + w + GAP, 0) - GAP;
      if (total <= available) {
        setVisibleCount(widths.length);
        return;
      }
      // Keep room for the "more" button.
      let used = moreWidth;
      let count = 0;
      for (const w of widths) {
        if (used + GAP + w > available) break;
        used += GAP + w;
        count += 1;
      }
      setVisibleCount(count);
    };

    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [items.length]);

  const visible = items.slice(0, visibleCount);
  const hidden = items.slice(visibleCount);

  const button = (item: ToolbarItem) => {
    const Icon = item.icon;
    return (
      <button
        key={item.key}
        onClick={item.onClick}
        disabled={item.disabled}
        className={`flex-shrink-0 p-1 disabled:opacity-40 ${item.active ? 'text-green-500' : 'text-gray-400 hover:text-white'}`}
        aria-label={item.label}
        aria-pressed={item.active}
        title={item.label}
        data-popover-trigger={item.popover}
      >
        <Icon size={20} />
      </button>
    );
  };

  return (
    <div ref={containerRef} className={`relative flex min-w-0 items-center justify-end gap-2 ${className}`}>
      {/* Invisible copy used only to measure the buttons' natural widths. */}
      <div ref={measureRef} className="pointer-events-none invisible absolute flex gap-2" aria-hidden="true">
        {items.map((item) => (
          <span key={item.key} className="p-1"><item.icon size={20} /></span>
        ))}
        <span className="p-1"><MoreHorizontal size={20} /></span>
      </div>

      {visible.map(button)}

      {hidden.length > 0 && (
        <div ref={menuRef} className="relative flex-shrink-0">
          <button
            onClick={toggle}
            className={`p-1 ${isOpen || hidden.some((i) => i.active) ? 'text-green-500' : 'text-gray-400 hover:text-white'}`}
            aria-label={moreLabel}
            title={moreLabel}
            aria-haspopup="menu"
            aria-expanded={isOpen}
          >
            <MoreHorizontal size={20} />
          </button>
          {isOpen && (
            <div
              role="menu"
              className={`absolute right-0 z-50 w-56 max-w-[calc(100vw-1.5rem)] rounded-lg bg-gray-800 py-1 shadow-xl ring-1 ring-white/10 ${
                placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
              }`}
            >
              {hidden.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    role="menuitem"
                    disabled={item.disabled}
                    data-popover-trigger={item.popover}
                    onClick={() => {
                      close();
                      item.onClick();
                    }}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-700 disabled:opacity-40 ${
                      item.active ? 'text-green-400' : 'text-gray-200'
                    }`}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span className="flex-1">{item.label}</span>
                    {item.hint && <span className="text-xs text-gray-400">{item.hint}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {trailing && <div ref={trailingRef} className="flex flex-shrink-0 items-center gap-2">{trailing}</div>}
    </div>
  );
};

export default OverflowToolbar;
