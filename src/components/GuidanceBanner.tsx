import { useState, useMemo } from 'react';

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
      items.push({
        key: 'day1-2',
        message: 'Baby may be sleepy. Wake to feed every 2-3 hours.',
        type: 'info',
      });
    }

    if (ageDays >= 2 && ageDays <= 4) {
      items.push({
        key: 'day3',
        message: 'Hungry Day — target 8+ feeds/24h. Milk is transitioning.',
        type: 'warning',
      });
    }

    if (ageDays >= 5 && ageDays <= 7) {
      items.push({
        key: 'day5-stool',
        message: 'Stools should be yellow, runny, and seedy by now.',
        type: 'info',
      });
    }

    if (ageDays >= 0 && ageDays <= 7) {
      const expectedWet = ageDays <= 1 ? 1 : ageDays <= 3 ? 3 : 6;
      if (wetCount < expectedWet) {
        items.push({
          key: `wet-target-day${ageDays}`,
          message: `Day ${ageDays + 1}: aim for ${expectedWet}+ wet diapers today (currently ${wetCount}).`,
          type: 'warning',
        });
      }
    }

    if (ageDays >= 30) {
      items.push({
        key: 'month1-stool',
        message: 'After 1 month, baby may stool once every 7-10 days — this is normal.',
        type: 'info',
      });
    }

    return items;
  }, [ageDays, wetCount]);

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
          className={`rounded-xl p-3 pr-8 relative text-sm ${
            g.type === 'warning'
              ? 'bg-accent-amber/15 text-accent-amber border border-accent-amber/20'
              : 'bg-accent-blue/10 text-accent-blue border border-accent-blue/15'
          }`}
        >
          {g.message}
          <button
            onClick={() => dismiss(g.key)}
            className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-xs opacity-60"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
