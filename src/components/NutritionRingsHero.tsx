import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

interface RingValue {
  current: number;
  target: number;
}

interface Props {
  kcal: RingValue;
  milk: RingValue;
  water: RingValue;
  unit: 'oz' | 'mL';
}

// Concentric rings, Apple-Watch style. Three nested arcs, each fills toward
// its daily target. Tap the hero to expand the breakdown panel.
//
// Colors:
//   kcal  — green outer ring   (largest, most prominent)
//   milk  — blue middle ring
//   water — cyan inner ring
//
// Over-target (>110%) recolors that ring to amber. Never red — nudge, not warn.
export default function NutritionRingsHero({ kcal, milk, water, unit }: Props) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  const rings: Array<{ key: 'kcal' | 'milk' | 'water'; v: RingValue; r: number; baseColor: string; label: string; valueText: string; targetText: string }> = [
    {
      key: 'kcal',
      v: kcal, r: 78, baseColor: '#3FCF8E',
      label: t('toddler.ring.kcal'),
      valueText: Math.round(kcal.current).toString(),
      targetText: `/${kcal.target}`,
    },
    {
      key: 'milk',
      v: milk, r: 60, baseColor: '#4A9EFF',
      label: t('toddler.ring.milk'),
      valueText: fmtAmount(milk.current, unit),
      targetText: `/${fmtAmount(milk.target, unit)}`,
    },
    {
      key: 'water',
      v: water, r: 42, baseColor: '#33C2D6',
      label: t('toddler.ring.water'),
      valueText: fmtAmount(water.current, unit),
      targetText: `/${fmtAmount(water.target, unit)}`,
    },
  ];

  return (
    <div className="glass-card rounded-3xl p-5 mb-4">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-5"
        aria-label={t('toddler.ring.expand')}
      >
        {/* Concentric rings */}
        <div className="relative flex-shrink-0" style={{ width: 180, height: 180 }}>
          <svg width="180" height="180" viewBox="0 0 180 180">
            {rings.map(({ key, v, r, baseColor }) => {
              const pct = v.target > 0 ? Math.min(v.current / v.target, 1.4) : 0;
              const over = pct > 1.1;
              const stroke = over ? '#F5A524' : baseColor;
              const C = 2 * Math.PI * r;
              const filled = Math.min(pct, 1) * C;
              const remaining = C - filled;
              return (
                <g key={key} transform="rotate(-90 90 90)">
                  {/* Track */}
                  <circle
                    cx="90" cy="90" r={r}
                    fill="none"
                    stroke={stroke}
                    strokeOpacity="0.18"
                    strokeWidth="14"
                  />
                  {/* Filled arc */}
                  <circle
                    cx="90" cy="90" r={r}
                    fill="none"
                    stroke={stroke}
                    strokeWidth="14"
                    strokeLinecap="round"
                    strokeDasharray={`${filled} ${remaining}`}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex-1 min-w-0 flex flex-col gap-2.5 text-left">
          {rings.map(({ key, v, baseColor, label, valueText, targetText }) => {
            const pct = v.target > 0 ? v.current / v.target : 0;
            const over = pct > 1.1;
            const color = over ? '#F5A524' : baseColor;
            return (
              <div key={key} className="flex items-center gap-2.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[12px] uppercase tracking-wider text-text-muted font-semibold flex-shrink-0 w-14">
                  {label}
                </span>
                <span className="text-[22px] font-bold tabular-nums leading-none" style={{ color }}>
                  {valueText}
                </span>
                <span className="text-[13px] text-text-muted tabular-nums">
                  {targetText}
                </span>
              </div>
            );
          })}
        </div>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border-light text-[12px] text-text-muted text-center animate-fade-in">
          {t('toddler.ring.targetsHint')}
        </div>
      )}
    </div>
  );
}

function fmtAmount(oz: number, unit: 'oz' | 'mL'): string {
  if (unit === 'mL') return Math.round(oz * 29.5735).toString();
  return (Math.round(oz * 10) / 10).toString();
}
