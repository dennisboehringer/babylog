import { useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

// CPO + AI Lead: every Nth photo-AI meal, ask the parent if the parse was right.
// One tap (👍/👎), no fields. Fed back into a local feedback log we can later
// upload as eval cases (or the user can send manually via Settings).
//
// Show conditions:
//   - Most recent meal save was source === 'photo-ai'
//   - photoAiSaveCount % EVERY === 0 (i.e. every 5th)
//   - Parent has not already answered for this specific meal id

// Per-surface counters + log. Every Nth use of an AI surface, ask the parent
// for a one-tap accuracy vote. Surface defaults: meal=5, report=3.
const COUNT_KEYS = {
  meal:   'babylog_photo_ai_meal_count',
  report: 'babylog_report_ai_count',
} as const;
const FEEDBACK_LOG_KEY = 'babylog_ai_feedback_log';
const EVERY: Record<keyof typeof COUNT_KEYS, number> = {
  meal: 5,
  report: 3,
};

export type AiFeedbackSurface = keyof typeof COUNT_KEYS;

interface FeedbackEntry {
  surface: AiFeedbackSurface;
  refId: string;
  vote: 'up' | 'down';
  at: number;
}

function bump(surface: AiFeedbackSurface): boolean {
  try {
    const cur = Number(localStorage.getItem(COUNT_KEYS[surface]) ?? '0') + 1;
    localStorage.setItem(COUNT_KEYS[surface], String(cur));
    return cur % EVERY[surface] === 0;
  } catch {
    return false;
  }
}

export function recordPhotoAiSave(_mealId: string): boolean {
  return bump('meal');
}
export function recordReportAi(_reportId: string): boolean {
  return bump('report');
}

function appendFeedback(entry: FeedbackEntry) {
  try {
    const raw = localStorage.getItem(FEEDBACK_LOG_KEY);
    const list: FeedbackEntry[] = raw ? JSON.parse(raw) : [];
    list.push(entry);
    localStorage.setItem(FEEDBACK_LOG_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

interface Props {
  /** ID of the thing being voted on (mealId, reportId). Null = prompt hidden. */
  refId: string | null;
  surface: AiFeedbackSurface;
  onClose: () => void;
}

export default function AccuracyFeedbackPrompt({ refId, surface, onClose }: Props) {
  const { t } = useLanguage();
  const [voted, setVoted] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (!refId) return;
    if (voted) {
      const id = setTimeout(onClose, 1200);
      return () => clearTimeout(id);
    }
  }, [voted, onClose, refId]);

  if (!refId) return null;

  function vote(v: 'up' | 'down') {
    if (!refId) return;
    appendFeedback({ surface, refId, vote: v, at: Date.now() });
    setVoted(v);
  }

  const promptKey = surface === 'report' ? 'feedback.prompt.report' : 'feedback.prompt';

  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-[55] bottom-[calc(env(safe-area-inset-bottom)+72px)] w-[min(calc(100%-1.5rem),360px)] animate-slide-up">
      <div className="glass-surface rounded-2xl shadow-xl px-4 py-3.5 border border-border-light">
        {voted ? (
          <p className="text-[13px] font-medium text-center text-text-secondary py-1">
            {t('feedback.thanks')}
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-[13px] font-medium leading-tight">{t(promptKey)}</p>
            <button
              onClick={() => vote('up')}
              className="w-10 h-10 rounded-full bg-accent-green/15 text-accent-green flex items-center justify-center text-lg flex-shrink-0"
              aria-label={t('feedback.up')}
            >
              👍
            </button>
            <button
              onClick={() => vote('down')}
              className="w-10 h-10 rounded-full bg-accent-amber/15 text-accent-amber flex items-center justify-center text-lg flex-shrink-0"
              aria-label={t('feedback.down')}
            >
              👎
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-bg-card text-text-muted flex items-center justify-center flex-shrink-0"
              aria-label={t('btn.cancel')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
