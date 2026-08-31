import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface InfoTooltipProps {
  children: ReactNode;
  label?: string;
}

/**
 * A small (i) icon that reveals help text on hover/focus instead of it sitting on the page all
 * the time. Portaled to document.body rather than positioned relative to its trigger: the
 * inspector sidebar is only 290px wide and its `overflow-y: auto` makes the browser resolve
 * overflow-x to auto too, so anything wider than the remaining space would get clipped before a
 * reader could see it.
 */
export function InfoTooltip({ children, label = 'More info' }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number; openBelow: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  // Tracks whether the current `open` cycle rendered above and still needs the fit check below --
  // read instead of `pos` inside the layout effect so the effect can stay keyed on `open` alone.
  const pendingFitCheckRef = useRef(false);

  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Default to opening above; corrected below in a layout effect once the bubble's real height
    // is known -- a long note (board-preset provenance text, easily 15+ lines) can be taller than
    // the trigger has room for above it, and guessing that from the trigger's position alone isn't
    // reliable (content length varies per instance, not the icon's position on screen).
    pendingFitCheckRef.current = true;
    setPos({ top: rect.top - 8, right: window.innerWidth - rect.right, openBelow: false });
    setOpen(true);
  };
  const hide = () => setOpen(false);

  useLayoutEffect(() => {
    if (!open || !pendingFitCheckRef.current) return;
    pendingFitCheckRef.current = false;
    const bubble = bubbleRef.current;
    const trigger = triggerRef.current;
    if (!bubble || !trigger) return;
    const bubbleHeight = bubble.getBoundingClientRect().height;
    const triggerRect = trigger.getBoundingClientRect();
    if (triggerRect.top - 8 - bubbleHeight < 8) {
      setPos({ top: triggerRect.bottom + 8, right: window.innerWidth - triggerRect.right, openBelow: true });
    }
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="info-tooltip-trigger"
        aria-label={label}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            hide();
            triggerRef.current?.blur();
          }
        }}
      >
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      {open && pos
        ? createPortal(
            <span
              ref={bubbleRef}
              className="info-tooltip-bubble"
              role="tooltip"
              style={{
                top: pos.top,
                right: pos.right,
                transform: pos.openBelow ? 'none' : 'translate(0, -100%)',
              }}
            >
              {children}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
