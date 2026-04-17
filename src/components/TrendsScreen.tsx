import { useState, useEffect, useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { db } from '../db';
import { effectiveStage } from '../types';
import type { FeedEntry, DiaperEntry, PumpEntry, MealEntry, DrinkEntry } from '../types';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type Range = 7 | 14 | 30;

function getDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getDaysArray(range: Range): { key: string; start: number; end: number }[] {
  const days = [];
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const start = d.getTime();
    const end = start + 86400000;
    days.push({ key: getDayKey(start), start, end });
  }
  return days;
}

export default function TrendsScreen() {
  const { activeBaby } = useApp();
  const { t } = useLanguage();
  const [range, setRange] = useState<Range>(7);
  const [feeds, setFeeds] = useState<FeedEntry[]>([]);
  const [diapers, setDiapers] = useState<DiaperEntry[]>([]);
  const [_pumps, setPumps] = useState<PumpEntry[]>([]);
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [drinks, setDrinks] = useState<DrinkEntry[]>([]);

  useEffect(() => {
    if (!activeBaby) return;
    const cutoff = Date.now() - range * 86400000;
    Promise.all([
      db.feeds.where('babyId').equals(activeBaby.id).and(f => f.timestamp >= cutoff).toArray(),
      db.diapers.where('babyId').equals(activeBaby.id).and(d => d.timestamp >= cutoff).toArray(),
      db.pumps.where('babyId').equals(activeBaby.id).and(p => p.timestamp >= cutoff).toArray(),
      db.meals.where('babyId').equals(activeBaby.id).and(m => m.timestamp >= cutoff).toArray(),
      db.drinks.where('babyId').equals(activeBaby.id).and(d => d.timestamp >= cutoff).toArray(),
    ]).then(([f, d, p, m, dr]) => {
      setFeeds(f);
      setDiapers(d);
      setPumps(p);
      setMeals(m);
      setDrinks(dr);
    });
  }, [activeBaby, range]);

  const days = useMemo(() => getDaysArray(range), [range]);
  const labels = days.map(d => d.key);
  const unit = activeBaby?.unitPreference ?? 'oz';

  const feedsPerDay = days.map(d => feeds.filter(f => f.timestamp >= d.start && f.timestamp < d.end).length);

  // Bottle volume split by milk type. Amounts are stored in each entry's own unit,
  // so normalize to oz first, then convert to display unit at render time.
  function sumOz(dayStart: number, dayEnd: number, predicate: (f: FeedEntry) => boolean): number {
    return feeds
      .filter(f => f.timestamp >= dayStart && f.timestamp < dayEnd && f.type === 'bottle' && f.amount && predicate(f))
      .reduce((s, f) => s + (f.unit === 'mL' ? (f.amount ?? 0) / 29.5735 : (f.amount ?? 0)), 0);
  }
  const breastMilkOzPerDay = days.map(d => sumOz(d.start, d.end, f => f.milkType === 'breastmilk'));
  const formulaOzPerDay = days.map(d => sumOz(d.start, d.end, f => f.milkType === 'formula'));
  const unspecifiedOzPerDay = days.map(d => sumOz(d.start, d.end, f => f.milkType !== 'breastmilk' && f.milkType !== 'formula'));
  const hasUnspecified = unspecifiedOzPerDay.some(v => v > 0);

  const toUnit = (oz: number) => unit === 'oz' ? +oz.toFixed(1) : +(oz * 29.5735).toFixed(0);
  const breastMilkPerDay = breastMilkOzPerDay.map(toUnit);
  const formulaPerDay = formulaOzPerDay.map(toUnit);
  const unspecifiedPerDay = unspecifiedOzPerDay.map(toUnit);
  const wetPerDay = days.map(d => diapers.filter(di => di.timestamp >= d.start && di.timestamp < d.end && (di.type === 'wet' || di.type === 'both')).length);
  const stoolPerDay = days.map(d => diapers.filter(di => di.timestamp >= d.start && di.timestamp < d.end && (di.type === 'stool' || di.type === 'both')).length);

  // Toddler-stage trends
  const ozFromDrink = (d: DrinkEntry) => d.unit === 'mL' ? d.amount / 29.5735 : d.amount;
  const kcalPerDay = days.map(d =>
    Math.round(meals.filter(m => m.timestamp >= d.start && m.timestamp < d.end)
      .reduce((s, m) => s + (m.totals?.kcal ?? 0), 0)));
  const milkOzPerDay = days.map(d => toUnit(
    drinks.filter(dr => dr.timestamp >= d.start && dr.timestamp < d.end && (dr.kind === 'milk' || dr.kind.startsWith('milk-')))
      .reduce((s, dr) => s + ozFromDrink(dr), 0)));
  const waterOzPerDay = days.map(d => toUnit(
    drinks.filter(dr => dr.timestamp >= d.start && dr.timestamp < d.end && dr.kind === 'water')
      .reduce((s, dr) => s + ozFromDrink(dr), 0)));
  const mealsPerDay = days.map(d => meals.filter(m => m.timestamp >= d.start && m.timestamp < d.end).length);

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        ticks: { color: '#556070', font: { size: 10 }, maxRotation: 0 },
        grid: { display: false },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: { color: '#556070', font: { size: 10 }, stepSize: 1 },
        grid: { color: '#262E3A' },
        border: { display: false },
      },
    },
  } as const;

  const stackedChartOpts = {
    ...chartOpts,
    plugins: { legend: { display: true, position: 'bottom' as const, labels: { color: '#8A94A6', font: { size: 10 }, boxWidth: 10, boxHeight: 10 } } },
    scales: {
      ...chartOpts.scales,
      x: { ...chartOpts.scales.x, stacked: true },
      y: { ...chartOpts.scales.y, stacked: true },
    },
  } as const;

  // (unit already computed above)

  if (!activeBaby) return null;
  // Stage-aware: render the right set of charts per stage so toddler users
  // don't see empty newborn charts (and vice versa).
  const stage = effectiveStage(activeBaby);
  const isToddlerLike = stage === 'toddler' || stage === 'preschool';

  return (
    <div className="flex-1 scrollable px-4 pt-4 pb-4">
      {/* Range selector */}
      <div className="flex gap-2 mb-5 bg-bg-card rounded-xl p-1">
        {([7, 14, 30] as Range[]).map(r => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              range === r ? 'bg-accent-blue text-white shadow-sm' : 'text-text-secondary'
            }`}
          >
            {t(`trends.range.${r}`)}
          </button>
        ))}
      </div>

      {isToddlerLike && (
        <>
          <ChartCard title={t('trends.chart.kcalPerDay')}>
            <Bar
              data={{
                labels,
                datasets: [{
                  data: kcalPerDay,
                  backgroundColor: '#3FCF8E80',
                  borderRadius: 6,
                  borderSkipped: false,
                }],
              }}
              options={chartOpts}
            />
          </ChartCard>

          <ChartCard title={unit === 'oz' ? t('trends.chart.drinksPerDayOz') : t('trends.chart.drinksPerDayMl')}>
            <Bar
              data={{
                labels,
                datasets: [
                  {
                    label: t('drink.kind.milk'),
                    data: milkOzPerDay,
                    backgroundColor: '#4A9EFF99',
                    borderRadius: 6,
                    borderSkipped: false,
                    stack: 'liq',
                  },
                  {
                    label: t('drink.kind.water'),
                    data: waterOzPerDay,
                    backgroundColor: '#33C2D699',
                    borderRadius: 6,
                    borderSkipped: false,
                    stack: 'liq',
                  },
                ],
              }}
              options={stackedChartOpts}
            />
          </ChartCard>

          <ChartCard title={t('trends.chart.mealsPerDay')}>
            <Bar
              data={{
                labels,
                datasets: [{
                  data: mealsPerDay,
                  backgroundColor: '#3FCF8E60',
                  borderRadius: 6,
                  borderSkipped: false,
                }],
              }}
              options={chartOpts}
            />
          </ChartCard>
        </>
      )}

      {!isToddlerLike && (
        <>
      {/* Feeds per day */}
      <ChartCard title={t('trends.chart.feedsPerDay')} targetLabel={t('trends.chart.target', { n: 8 })}>
        <Bar
          data={{
            labels,
            datasets: [{
              data: feedsPerDay,
              backgroundColor: feedsPerDay.map(v => v >= 8 ? '#34D05880' : '#4A9EFF60'),
              borderRadius: 6,
              borderSkipped: false,
            }],
          }}
          options={chartOpts}
        />
      </ChartCard>

      {/* Volume per day — stacked by milk type */}
      <ChartCard title={unit === 'oz' ? t('trends.chart.bottleVolumeOz') : t('trends.chart.bottleVolumeMl')}>
        <Bar
          data={{
            labels,
            datasets: [
              {
                label: t('milk.breastmilk'),
                data: breastMilkPerDay,
                backgroundColor: '#4A9EFF99',
                borderRadius: 6,
                borderSkipped: false,
                stack: 'vol',
              },
              {
                label: t('milk.formula'),
                data: formulaPerDay,
                backgroundColor: '#F0B42999',
                borderRadius: 6,
                borderSkipped: false,
                stack: 'vol',
              },
              ...(hasUnspecified ? [{
                label: t('milk.unspecified'),
                data: unspecifiedPerDay,
                backgroundColor: '#55607099',
                borderRadius: 6,
                borderSkipped: false,
                stack: 'vol',
              }] : []),
            ],
          }}
          options={stackedChartOpts}
        />
      </ChartCard>

      {/* Wet diapers */}
      <ChartCard title={t('trends.chart.wetDiapersPerDay')}>
        <Bar
          data={{
            labels,
            datasets: [{
              data: wetPerDay,
              backgroundColor: '#34D05860',
              borderRadius: 6,
              borderSkipped: false,
            }],
          }}
          options={chartOpts}
        />
      </ChartCard>

      {/* Stools */}
      <ChartCard title={t('trends.chart.stoolsPerDay')}>
        <Bar
          data={{
            labels,
            datasets: [{
              data: stoolPerDay,
              backgroundColor: '#F0B42960',
              borderRadius: 6,
              borderSkipped: false,
            }],
          }}
          options={chartOpts}
        />
      </ChartCard>
        </>
      )}
    </div>
  );
}

function ChartCard({ title, children, targetLabel }: { title: string; children: React.ReactNode; targetLabel?: string }) {
  return (
    <div className="glass-card rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-text-secondary">{title}</h3>
        {targetLabel && (
          <span className="text-xs text-accent-green font-medium">{targetLabel}</span>
        )}
      </div>
      <div className="h-[160px]">
        {children}
      </div>
    </div>
  );
}
