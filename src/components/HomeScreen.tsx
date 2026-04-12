import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useSync } from '../context/SyncContext';
import { db } from '../db';
import type { FeedEntry, DiaperEntry, PumpEntry, TimelineEntry } from '../types';
import FeedModal from './FeedModal';
import DiaperModal from './DiaperModal';
import PumpModal from './PumpModal';
import GuidanceBanner from './GuidanceBanner';

function getStartOfDay(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatTimeSince(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function HomeScreen() {
  const { activeBaby } = useApp();
  const { syncRemove, setOnRemoteUpdate } = useSync();
  const [feeds, setFeeds] = useState<FeedEntry[]>([]);
  const [diapers, setDiapers] = useState<DiaperEntry[]>([]);
  const [pumps, setPumps] = useState<PumpEntry[]>([]);
  const [now, setNow] = useState(Date.now());
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal state
  const [feedOpen, setFeedOpen] = useState(false);
  const [diaperOpen, setDiaperOpen] = useState(false);
  const [diaperInitialType, setDiaperInitialType] = useState<'wet' | 'stool'>('wet');
  const [pumpOpen, setPumpOpen] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(interval);
  }, []);

  const loadData = useCallback(() => {
    if (!activeBaby) return;
    const start = getStartOfDay();
    Promise.all([
      db.feeds.where('babyId').equals(activeBaby.id).and(f => f.timestamp >= start).toArray(),
      db.diapers.where('babyId').equals(activeBaby.id).and(d => d.timestamp >= start).toArray(),
      db.pumps.where('babyId').equals(activeBaby.id).and(p => p.timestamp >= start).toArray(),
    ]).then(([f, d, p]) => {
      setFeeds(f);
      setDiapers(d);
      setPumps(p);
    });
  }, [activeBaby]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  // Listen for remote sync updates
  useEffect(() => {
    setOnRemoteUpdate(() => () => setRefreshKey(k => k + 1));
    return () => setOnRemoteUpdate(null);
  }, [setOnRemoteUpdate]);

  const handleSaved = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  async function handleDelete(item: TimelineEntry) {
    const collection = item.entryType === 'feed' ? 'feeds' : item.entryType === 'diaper' ? 'diapers' : 'pumps';
    if (item.entryType === 'feed') await db.feeds.delete(item.id);
    else if (item.entryType === 'diaper') await db.diapers.delete(item.id);
    else await db.pumps.delete(item.id);
    syncRemove(collection, item.id);
    handleSaved();
  }

  if (!activeBaby) return null;

  const lastFeed = feeds.length > 0
    ? feeds.reduce((a, b) => a.timestamp > b.timestamp ? a : b)
    : null;
  const timeSinceLastFeed = lastFeed ? now - lastFeed.timestamp : null;
  const reminderMs = activeBaby.reminderIntervalMinutes * 60 * 1000;

  const feedColor = timeSinceLastFeed === null
    ? 'text-text-secondary'
    : timeSinceLastFeed < 2 * 3600000
      ? 'text-accent-green'
      : timeSinceLastFeed < reminderMs
        ? 'text-accent-amber'
        : 'text-accent-red';

  const isOverdue = timeSinceLastFeed !== null && timeSinceLastFeed >= reminderMs;

  const totalFeeds = feeds.length;
  const totalBottleOz = feeds
    .filter(f => f.type === 'bottle' && f.amount)
    .reduce((sum, f) => sum + (f.amount ?? 0), 0);
  const wetDiapers = diapers.filter(d => d.type === 'wet' || d.type === 'both').length;
  const stoolCount = diapers.filter(d => d.type === 'stool' || d.type === 'both').length;
  const pumpSessions = pumps.length;

  const breastFeeds = feeds.filter(f => f.type === 'breast');
  const leftCount = breastFeeds.filter(f => f.lastSide === 'left').length;
  const rightCount = breastFeeds.filter(f => f.lastSide === 'right').length;

  const timeline: TimelineEntry[] = [
    ...feeds.map(f => ({ id: f.id, entryType: 'feed' as const, timestamp: f.timestamp, entry: f })),
    ...diapers.map(d => ({ id: d.id, entryType: 'diaper' as const, timestamp: d.timestamp, entry: d })),
    ...pumps.map(p => ({ id: p.id, entryType: 'pump' as const, timestamp: p.timestamp, entry: p })),
  ].sort((a, b) => b.timestamp - a.timestamp);

  const lastBreastFeed = breastFeeds.length > 0
    ? breastFeeds.reduce((a, b) => a.timestamp > b.timestamp ? a : b)
    : null;

  return (
    <>
      <div className="flex-1 scrollable px-4 pt-4 pb-4">
        {/* Contextual guidance */}
        <GuidanceBanner dob={activeBaby.dob} feedCount={totalFeeds} wetCount={wetDiapers} />

        {/* Time since last feed — HERO */}
        <div className={`bg-bg-card rounded-2xl p-5 mb-4 text-center ${isOverdue ? 'animate-subtle-pulse' : ''}`}>
          <p className="text-text-secondary text-sm mb-1">Time since last feed</p>
          <p className={`text-4xl font-bold tabular-nums ${feedColor}`}>
            {timeSinceLastFeed !== null ? formatTimeSince(timeSinceLastFeed) : '—'}
          </p>
          {lastBreastFeed?.lastSide && (
            <p className="text-text-secondary text-sm mt-1">
              Last side: <span className="text-text-primary font-medium capitalize">{lastBreastFeed.lastSide}</span>
            </p>
          )}
        </div>

        {/* Summary cards */}
        <div className="flex gap-2 mb-4 overflow-x-auto scrollable">
          <SummaryCard label="Feeds" value={totalFeeds} target={8} />
          <SummaryCard label={activeBaby.unitPreference === 'oz' ? 'Bottle oz' : 'Bottle mL'} value={
            activeBaby.unitPreference === 'oz'
              ? +totalBottleOz.toFixed(1)
              : +(totalBottleOz * 29.5735).toFixed(0)
          } />
          <SummaryCard label="Wet" value={wetDiapers} />
          <SummaryCard label="Stools" value={stoolCount} />
          <SummaryCard label="Pumps" value={pumpSessions} />
        </div>

        {/* L/R Balance */}
        {breastFeeds.length > 0 && (
          <div className="bg-bg-card rounded-2xl p-4 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <p className="text-2xl font-bold">L:{leftCount}</p>
              <span className="text-text-muted">/</span>
              <p className="text-2xl font-bold">R:{rightCount}</p>
            </div>
            <p className="text-sm text-text-secondary">
              Next: <span className="text-text-primary font-medium">
                {lastBreastFeed?.lastSide === 'left' ? 'Right' : 'Left'}
              </span>
            </p>
          </div>
        )}

        {/* Quick-add buttons */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <QuickButton label="Feed" icon="🍼" color="bg-accent-blue/20 text-accent-blue" onClick={() => setFeedOpen(true)} />
          <QuickButton label="Wet" icon="💧" color="bg-accent-green/20 text-accent-green" onClick={() => { setDiaperInitialType('wet'); setDiaperOpen(true); }} />
          <QuickButton label="Stool" icon="💩" color="bg-accent-amber/20 text-accent-amber" onClick={() => { setDiaperInitialType('stool'); setDiaperOpen(true); }} />
          <QuickButton label="Pump" icon="🥛" color="bg-[#A371F7]/20 text-[#A371F7]" onClick={() => setPumpOpen(true)} />
        </div>

        {/* Today's log */}
        <div>
          <h3 className="text-sm text-text-secondary font-medium mb-2">Today's Log</h3>
          {timeline.length === 0 ? (
            <p className="text-text-muted text-center py-8">No entries yet today</p>
          ) : (
            <div className="flex flex-col gap-1">
              {timeline.map(item => (
                <TimelineRow key={item.id} item={item} onDelete={() => handleDelete(item)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <FeedModal open={feedOpen} onClose={() => setFeedOpen(false)} onSaved={handleSaved} />
      <DiaperModal open={diaperOpen} onClose={() => setDiaperOpen(false)} onSaved={handleSaved} initialType={diaperInitialType} />
      <PumpModal open={pumpOpen} onClose={() => setPumpOpen(false)} onSaved={handleSaved} />
    </>
  );
}

function SummaryCard({ label, value, target }: { label: string; value: number; target?: number }) {
  const atTarget = target !== undefined && value >= target;
  return (
    <div className="bg-bg-card rounded-xl p-3 min-w-[72px] flex-shrink-0 text-center">
      <p className={`text-xl font-bold tabular-nums ${atTarget ? 'text-accent-green' : ''}`}>
        {value}
        {target !== undefined && (
          <span className={`text-xs font-normal ${atTarget ? 'text-accent-green/70' : 'text-text-muted'}`}>/{target}</span>
        )}
      </p>
      <p className="text-xs text-text-muted mt-0.5">{label}</p>
    </div>
  );
}

function QuickButton({ label, icon, color, onClick }: { label: string; icon: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center rounded-2xl py-4 min-h-[80px] active:opacity-70 ${color}`}>
      <span className="text-2xl mb-1">{icon}</span>
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function TimelineRow({ item, onDelete }: { item: TimelineEntry; onDelete: () => void }) {
  const [showDelete, setShowDelete] = useState(false);

  let icon = '';
  let detail = '';

  if (item.entryType === 'feed') {
    const f = item.entry as FeedEntry;
    icon = f.type === 'breast' ? '🤱' : '🍼';
    if (f.type === 'breast') {
      const parts: string[] = [];
      if (f.leftDurationSec) parts.push(`L:${Math.round(f.leftDurationSec / 60)}m`);
      if (f.rightDurationSec) parts.push(`R:${Math.round(f.rightDurationSec / 60)}m`);
      detail = parts.join(' ') || 'Breast';
    } else {
      detail = f.amount ? `${f.amount} ${f.unit}` : 'Bottle';
    }
  } else if (item.entryType === 'diaper') {
    const d = item.entry as DiaperEntry;
    icon = d.type === 'wet' ? '💧' : d.type === 'stool' ? '💩' : '💧💩';
    detail = d.type.charAt(0).toUpperCase() + d.type.slice(1);
    if (d.stoolColor) detail += ` (${d.stoolColor})`;
  } else {
    const p = item.entry as PumpEntry;
    icon = '🥛';
    detail = p.amount ? `${p.amount} ${p.unit}` : 'Pump';
    if (p.side !== 'both') detail += ` (${p.side})`;
  }

  return (
    <div className="relative">
      <div
        onClick={() => setShowDelete(!showDelete)}
        className="flex items-center bg-bg-card rounded-xl px-3 py-3 gap-3 cursor-pointer"
      >
        <span className="text-lg">{icon}</span>
        <span className="flex-1 text-sm">{detail}</span>
        <span className="text-xs text-text-muted">{formatRelativeTime(item.timestamp)}</span>
      </div>
      {showDelete && (
        <div className="flex justify-end gap-2 mt-1 mb-1">
          <button
            onClick={() => setShowDelete(false)}
            className="px-3 py-1.5 text-xs rounded-lg bg-bg-card text-text-secondary"
          >
            Cancel
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 text-xs rounded-lg bg-accent-red/20 text-accent-red"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
