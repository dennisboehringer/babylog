import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import type { NutritionTotals, NutritionTargets } from '../types';

interface Props {
  totals: NutritionTotals;
  targets: Required<NutritionTargets>;
  // Sugar is informational only — surfaced when expanded, never targeted.
  sugar_g: number;
}

// Compact 3x2 grid of macros + micros below the rings hero. Each tile shows
// current value, optional target, and a thin progress bar when targeted.
// Tap the card to expand a fuller breakdown including sugar (informational).
export default function NutritionBreakdownCard({ totals, targets, sugar_g }: Props) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  // Pediatric Safety: targets are conventions, not prescriptions. Tile copy
  // never says "you need" or "should hit" — just shows the current value
  // and a soft fill toward the convention.
  const tiles: Tile[] = [
    { key: 'protein',  label: t('nutrition.protein'),  value: totals.protein_g,  target: targets.protein_g,  unit: 'g',  accent: '#3FCF8E' },
    { key: 'fat',      label: t('nutrition.fat'),      value: totals.fat_g,      target: targets.fat_g,      unit: 'g',  accent: '#F5A524' },
    { key: 'carbs',    label: t('nutrition.carbs'),    value: totals.carbs_g,    target: targets.carbs_g,    unit: 'g',  accent: '#4A9EFF' },
    { key: 'fiber',    label: t('nutrition.fiber'),    value: totals.fiber_g,    target: targets.fiber_g,    unit: 'g',  accent: '#B180F7' },
    { key: 'iron',     label: t('nutrition.iron'),     value: totals.iron_mg,    target: targets.iron_mg,    unit: 'mg', accent: '#E5484D' },
    { key: 'calcium',  label: t('nutrition.calcium'),  value: totals.calcium_mg, target: targets.calcium_mg, unit: 'mg', accent: '#33C2D6' },
  ];

  return (
    <div className="glass-card rounded-2xl p-4 mb-4">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between mb-3"
      >
        <h3 className="text-xs text-text-muted font-medium uppercase tracking-wider">
          {t('nutrition.title')}
        </h3>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <div className="grid grid-cols-3 gap-2">
        {tiles.map(tile => (
          <NutrientTile
            key={tile.key}
            label={tile.label}
            value={tile.value}
            target={tile.target}
            unit={tile.unit}
            accent={tile.accent}
          />
        ))}
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border-light animate-fade-in">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <NutrientTile
              label={t('nutrition.vitD')}
              value={totals.vitD_iu}
              target={targets.vitD_iu}
              unit="IU"
              accent="#FFD60A"
            />
            <InfoTile
              label={t('nutrition.sugar')}
              value={sugar_g}
              unit="g"
              hint={t('nutrition.sugarHint')}
            />
          </div>
          <p className="text-[11px] text-text-muted text-center leading-relaxed">
            {t('nutrition.disclaimer')}
          </p>
        </div>
      )}
    </div>
  );
}

interface Tile {
  key: string;
  label: string;
  value: number;
  target: number;
  unit: string;
  accent: string;
}

type TileProps = Omit<Tile, 'key'>;

function NutrientTile({ label, value, target, unit, accent }: TileProps) {
  const pct = target > 0 ? Math.min(value / target, 1.4) : 0;
  const over = pct > 1.1;
  const fillColor = over ? '#F5A524' : accent;
  const valueColor = over ? '#F5A524' : 'inherit';
  const fillWidth = `${Math.min(pct, 1) * 100}%`;
  const display = formatValue(value);
  const targetDisplay = target > 0 ? formatValue(target) : null;

  return (
    <div className="bg-bg-card rounded-xl p-2.5">
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-[17px] font-bold tabular-nums leading-none" style={{ color: valueColor }}>
          {display}
        </span>
        <span className="text-[11px] text-text-muted">{unit}</span>
        {targetDisplay && (
          <span className="text-[11px] text-text-muted ml-auto tabular-nums">/{targetDisplay}</span>
        )}
      </div>
      <p className="text-[11px] text-text-muted uppercase tracking-wider font-medium mb-1.5">{label}</p>
      {target > 0 && (
        <div className="h-1 rounded-full bg-border-light overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: fillWidth, backgroundColor: fillColor }} />
        </div>
      )}
    </div>
  );
}

function InfoTile({ label, value, unit, hint }: { label: string; value: number; unit: string; hint: string }) {
  return (
    <div className="bg-bg-card rounded-xl p-2.5 col-span-2">
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-[16px] font-bold tabular-nums leading-none">{formatValue(value)}</span>
        <span className="text-[10px] text-text-muted">{unit}</span>
      </div>
      <p className="text-[11px] text-text-muted uppercase tracking-wider font-medium mb-1">{label}</p>
      <p className="text-[10px] text-text-muted leading-tight">{hint}</p>
    </div>
  );
}

function formatValue(v: number): string {
  if (v === 0) return '0';
  if (v < 1) return v.toFixed(1);
  if (v < 10) return (Math.round(v * 10) / 10).toString();
  return Math.round(v).toString();
}
