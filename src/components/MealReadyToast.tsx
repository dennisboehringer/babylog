import { useState } from 'react';
import { useMealAnalysis } from '../context/MealAnalysisContext';
import { useLanguage } from '../context/LanguageContext';
import MealFlow from './MealFlow';

// Sticky bottom toast above the bottom nav. Shows:
//   - "Analyzing photo…" while a background analysis is running
//   - "Meal ready · Tap to review" when the result lands
//   - "Photo analysis failed · Tap to log manually" on error
//
// Tap → opens MealFlow in confirm mode, pre-populated from the context.
// X    → dismisses the result without saving.
export default function MealReadyToast() {
  const { state, dismiss } = useMealAnalysis();
  const { t } = useLanguage();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (state.status === 'idle') return <ConfirmHost open={confirmOpen} onClose={() => setConfirmOpen(false)} />;

  const tone = state.status === 'analyzing' ? 'analyzing'
             : state.status === 'ready'     ? 'ready'
             :                                'error';
  const text = tone === 'analyzing' ? t('meal.toast.analyzing')
             : tone === 'ready'     ? t('meal.toast.ready')
             :                        t('meal.toast.error');
  const tap = tone !== 'analyzing';

  const bg = tone === 'analyzing' ? 'bg-accent-blue'
           : tone === 'ready'     ? 'bg-accent-green'
           :                        'bg-accent-amber';

  return (
    <>
      <div className="fixed left-1/2 -translate-x-1/2 z-40 bottom-[calc(env(safe-area-inset-bottom)+72px)] w-[min(calc(100%-1.5rem),360px)] animate-slide-up">
        <div className={`flex items-center gap-3 ${bg} text-white rounded-2xl shadow-xl px-4 py-3`}>
          {tone === 'analyzing' && (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin flex-shrink-0" />
          )}
          {tone === 'ready' && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {tone === 'error' && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
          <button
            onClick={() => tap && setConfirmOpen(true)}
            disabled={!tap}
            className="flex-1 text-left text-[14px] font-semibold disabled:cursor-default"
          >
            {text}
          </button>
          {tap && (
            <button
              onClick={dismiss}
              className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center flex-shrink-0"
              aria-label="dismiss"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <ConfirmHost open={confirmOpen} onClose={() => setConfirmOpen(false)} />
    </>
  );
}

// MealFlow needs a babySaved callback; this host owns it and triggers a Home
// refresh via a simple custom event the toddler home listens to.
function ConfirmHost({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <MealFlow
      open={open}
      openInConfirm={open}
      onClose={onClose}
      onSaved={() => window.dispatchEvent(new CustomEvent('babylog:meal-saved'))}
    />
  );
}
