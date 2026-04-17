import { useState, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';

interface Props {
  milkOz: number;
  waterOz: number;
  kcal: number;
  kcalTarget: number;
}

interface Guidance {
  key: string;
  message: string;
  type: 'info' | 'warning';
}

// Toddler banner — calm, non-prescriptive nudges. Never says "your child has
// eaten enough" or "not enough." Frames everything as conventions, not advice.
export default function ToddlerGuidanceBanner({ milkOz, waterOz, kcal, kcalTarget }: Props) {
  const { t } = useLanguage();
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('babylog_dismissed_guidance_toddler');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const guidances = useMemo<Guidance[]>(() => {
    const items: Guidance[] = [];
    const hour = new Date().getHours();

    // Hydration nudge after 2pm if water log is empty.
    if (hour >= 14 && waterOz === 0) {
      items.push({ key: 'water-afternoon', message: t('toddler.guidance.waterAfternoon'), type: 'info' });
    }

    // Milk above 24oz/day — gentle "many toddlers do well with less" nudge.
    if (milkOz > 24) {
      items.push({ key: 'milk-high', message: t('toddler.guidance.milkAbove24'), type: 'info' });
    }

    // After dinner-time, if kcal is well below target — calm reminder, not alarm.
    if (hour >= 19 && kcalTarget > 0 && kcal < kcalTarget * 0.5) {
      items.push({ key: 'kcal-evening-low', message: t('toddler.guidance.kcalEveningLow'), type: 'info' });
    }

    return items;
  }, [milkOz, waterOz, kcal, kcalTarget, t]);

  function dismiss(key: string) {
    const next = new Set(dismissed);
    next.add(key);
    setDismissed(next);
    localStorage.setItem('babylog_dismissed_guidance_toddler', JSON.stringify([...next]));
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
