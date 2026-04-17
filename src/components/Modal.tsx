import { type ReactNode, useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function Modal({ open, onClose, title, children }: Props) {
  // iOS Safari body-scroll lock: `overflow: hidden` is not enough — the page
  // still rubber-bands. The canonical fix is to fix `body` in place at the
  // current scroll position, and restore on close. This is what Headless UI,
  // Radix, etc. all do internally.
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const original = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = original.overflow;
      document.body.style.position = original.position;
      document.body.style.top = original.top;
      document.body.style.width = original.width;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  if (!open) return null;

  return (
    // 100dvh = dynamic viewport height. On iOS Safari the URL bar
    // expands/collapses on scroll, so the static `100vh` overshoots
    // the visible area and pushes the bottom of the sheet (and its
    // Save button) below the home indicator.
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ height: '100dvh' }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 animate-fade-in" onClick={onClose} />

      {/* Sheet — `max-h-[90dvh]` (not 90vh) so it tracks the visible viewport
          on iOS. `overscroll-contain` on the inner scroll area is what
          actually prevents touch swipes from leaking through to the page
          underneath ("scrolling the background"). */}
      <div
        className="relative glass-surface rounded-t-3xl flex flex-col max-w-[420px] w-full mx-auto animate-slide-up border-t border-border-light"
        style={{ maxHeight: '90dvh' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-9 h-1 rounded-full bg-border-light" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-bg-card text-text-muted hover:text-text-secondary transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content — overscroll-contain stops momentum scroll from passing
            through to the page underneath. touch-pan-y permits vertical
            scroll without horizontal hijacking. */}
        <div
          className="flex-1 min-h-0 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain touch-pan-y scrollable"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
