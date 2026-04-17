import { useState, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';

interface Props {
  dob: string;
  feedCount?: number;
  wetCount: number;
}

interface Guidance {
  key: string;
  message: string;
  type: 'info' | 'warning';
}

export default function GuidanceBanner({ dob, feedCount: _feedCount, wetCount }: Props) {
  const { t } = useLanguage();
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('babylog_dismissed_guidance');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const ageDays = useMemo(() => {
    return Math.floor((Date.now() - new Date(dob).getTime()) / 86400000);
  }, [dob]);

  const guidances = useMemo<Guidance[]>(() => {
    const items: Guidance[] = [];

    if (ageDays <= 2) {
      items.push({ key: 'day1-2', message: t('guidance.day1_2'), type: 'info' });
    }

    if (ageDays >= 2 && ageDays <= 4) {
      items.push({ key: 'day3', message: t('guidance.day3'), type: 'warning' });
    }

    if (ageDays >= 5 && ageDays <= 7) {
      items.push({ key: 'day5-stool', message: t('guidance.day5_stool'), type: 'info' });
    }

    if (ageDays >= 0 && ageDays <= 7) {
      const expectedWet = ageDays <= 1 ? 1 : ageDays <= 3 ? 3 : 6;
      if (wetCount < expectedWet) {
        items.push({
          key: `wet-target-day${ageDays}`,
          message: t('guidance.wetTarget', { day: ageDays + 1, target: expectedWet, current: wetCount }),
          type: 'warning',
        });
      }
    }

    if (ageDays >= 30) {
      items.push({ key: 'month1-stool', message: t('guidance.month1_stool'), type: 'info' });
    }

    return items;
  }, [ageDays, wetCount, t]);

  function dismiss(key: string) {
    const next = new Set(dismissed);
    next.add(key);
    setDismissed(next);
    localStorage.setItem('babylog_dismissed_guidance', JSON.stringify([...next]));
  }

  const visible = guidances.filter(g => !dismissed.has(g.key));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mb-4">
      {visible.map(g => (
        <div
          key={g.key}
          className={`rounded-xl p-3.5 pr-9 relative text-sm font-medium ${
            g.type === 'warning'
              ? 'bg-accent-amber/8 text-accent-amber border border-accent-amber/15'
              : 'bg-accent-blue/8 text-accent-blue border border-accent-blue/12'
          }`}
        >
          {g.message}
          <button
            onClick={() => dismiss(g.key)}
            className="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center rounded-full opacity-50 hover:opacity-80 transition-opacity"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
