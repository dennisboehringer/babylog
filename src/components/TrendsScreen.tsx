import { useState, useEffect, useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from 'chart.js';
import { useApp } from '../context/AppContext';
import { db } from '../db';
import type { FeedEntry, DiaperEntry, PumpEntry } from '../types';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

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
  const [range, setRange] = useState<Range>(7);
  const [feeds, setFeeds] = useState<FeedEntry[]>([]);
  const [diapers, setDiapers] = useState<DiaperEntry[]>([]);
  const [_pumps, setPumps] = useState<PumpEntry[]>([]);

  useEffect(() => {
    if (!activeBaby) return;
    const cutoff = Date.now() - range * 86400000;
    Promise.all([
      db.feeds.where('babyId').equals(activeBaby.id).and(f => f.timestamp >= cutoff).toArray(),
      db.diapers.where('babyId').equals(activeBaby.id).and(d => d.timestamp >= cutoff).toArray(),
      db.pumps.where('babyId').equals(activeBaby.id).and(p => p.timestamp >= cutoff).toArray(),
    ]).then(([f, d, p]) => {
      setFeeds(f);
      setDiapers(d);
      setPumps(p);
    });
  }, [activeBaby, range]);

  const days = useMemo(() => getDaysArray(range), [range]);
  const labels = days.map(d => d.key);

  const feedsPerDay = days.map(d => feeds.filter(f => f.timestamp >= d.start && f.timestamp < d.end).length);
  const volumePerDay = days.map(d => {
    const dayFeeds = feeds.filter(f => f.timestamp >= d.start && f.timestamp < d.end && f.type === 'bottle' && f.amount);
    return +(dayFeeds.reduce((s, f) => s + (f.amount ?? 0), 0)).toFixed(1);
  });
  const wetPerDay = days.map(d => diapers.filter(di => di.timestamp >= d.start && di.timestamp < d.end && (di.type === 'wet' || di.type === 'both')).length);
  const stoolPerDay = days.map(d => diapers.filter(di => di.timestamp >= d.start && di.timestamp < d.end && (di.type === 'stool' || di.type === 'both')).length);

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

  const unit = activeBaby?.unitPreference ?? 'oz';

  if (!activeBaby) return null;

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
            {r}d
          </button>
        ))}
      </div>

      {/* Feeds per day */}
      <ChartCard title="Feeds per day" targetLine={8}>
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

      {/* Volume per day */}
      <ChartCard title={`Bottle volume (${unit}/day)`}>
        <Bar
          data={{
            labels,
            datasets: [{
              data: unit === 'oz' ? volumePerDay : volumePerDay.map(v => +(v * 29.5735).toFixed(0)),
              backgroundColor: '#F0B42960',
              borderRadius: 6,
              borderSkipped: false,
            }],
          }}
          options={chartOpts}
        />
      </ChartCard>

      {/* Wet diapers */}
      <ChartCard title="Wet diapers per day">
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
      <ChartCard title="Stools per day">
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
    </div>
  );
}

function ChartCard({ title, children, targetLine }: { title: string; children: React.ReactNode; targetLine?: number }) {
  return (
    <div className="glass-card rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-text-secondary">{title}</h3>
        {targetLine && (
          <span className="text-xs text-accent-green font-medium">Target: {targetLine}</span>
        )}
      </div>
      <div className="h-[160px]">
        {children}
      </div>
    </div>
  );
}
