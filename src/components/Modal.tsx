import { type ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function Modal({ open, onClose, title, children }: Props) {
  // iOS Safari body-scroll lock: `overflow: hidden` alone is not enough —
  // the page still rubber-bands. The canonical fix is to fix `body` in
  // place at the current scroll position, and restore on close. This is
  // what Headless UI, Radix, etc. all do internally.
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

  // CRITICAL: portal to document.body. The previous fixes failed because the
  // Modal was rendered INSIDE the App's `flex flex-col h-full` tree. Even with
  // `position: fixed`, iOS Safari + dvh + ancestor flex/transform combinations
  // were constraining the modal's effective height — that's why the sheet
  // appeared shorter than the viewport with the bottom nav peeking through.
  // Portaling escapes all of that.
  const sheet = (
    <div
      className="fixed inset-0 z-[100] flex flex-col justify-end"
      // Touch handlers prevent any touch on the BACKDROP from scrolling the
      // body underneath. Inner sheet stops propagation so its scroll works.
      onTouchMove={e => e.preventDefault()}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 animate-fade-in"
        onClick={onClose}
      />

      {/* Sheet — explicit calc keeps a 2rem buffer below the safe-area-bottom
          so Save is always visible above iOS home indicator + dynamic URL bar. */}
      <div
        className="relative glass-surface rounded-t-3xl flex flex-col max-w-[420px] w-full mx-auto animate-slide-up border-t border-border-light"
        style={{
          maxHeight: 'calc(100dvh - 2rem)',
          marginBottom: 'env(safe-area-inset-bottom)',
        }}
        onTouchMove={e => e.stopPropagation()}
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

        {/* Scrollable content */}
        <div
          className="flex-1 min-h-0 px-5 pb-6 overflow-y-auto overscroll-contain touch-pan-y scrollable"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {children}
        </div>
      </div>
    </div>
  );

  // Portal — render directly under document.body so no ancestor flex column,
  // transform, filter, or `h-full` can constrain the modal's positioning.
  return createPortal(sheet, document.body);
}
