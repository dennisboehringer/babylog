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

  const feedStatus = timeSinceLastFeed === null
    ? 'neutral'
    : timeSinceLastFeed < 2 * 3600000
      ? 'green'
      : timeSinceLastFeed < reminderMs
        ? 'amber'
        : 'red';

  const feedColor = {
    neutral: 'text-text-secondary',
    green: 'text-accent-green',
    amber: 'text-accent-amber',
    red: 'text-accent-red',
  }[feedStatus];

  const heroClass = {
    neutral: 'hero-neutral',
    green: 'hero-green',
    amber: 'hero-amber',
    red: 'hero-red',
  }[feedStatus];

  const isOverdue = feedStatus === 'red';

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
        <div className={`rounded-2xl p-5 mb-4 text-center ${heroClass} ${isOverdue ? 'animate-glow-pulse' : ''}`}>
          <p className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-1.5">Time since last feed</p>
          <p className={`text-[42px] font-bold tabular-nums leading-none ${feedColor}`}>
            {timeSinceLastFeed !== null ? formatTimeSince(timeSinceLastFeed) : '—'}
          </p>
          {lastBreastFeed?.lastSide && (
            <p className="text-text-secondary text-sm mt-2">
              Last side: <span className="text-text-primary font-medium capitalize">{lastBreastFeed.lastSide}</span>
            </p>
          )}
        </div>

        {/* Summary cards */}
        <div className="flex gap-2 mb-4 overflow-x-auto scrollable pb-1">
          <SummaryCard label="Feeds" value={totalFeeds} target={8} accent="green" />
          <SummaryCard label={activeBaby.unitPreference === 'oz' ? 'Bottle oz' : 'Bottle mL'} value={
            activeBaby.unitPreference === 'oz'
              ? +totalBottleOz.toFixed(1)
              : +(totalBottleOz * 29.5735).toFixed(0)
          } accent="blue" />
          <SummaryCard label="Wet" value={wetDiapers} accent="green" />
          <SummaryCard label="Stools" value={stoolCount} accent="amber" />
          <SummaryCard label="Pumps" value={pumpSessions} accent="purple" />
        </div>

        {/* L/R Balance */}
        {breastFeeds.length > 0 && (
          <div className="glass-card rounded-2xl p-4 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="text-center">
                <p className="text-xs text-text-muted font-medium uppercase tracking-wider mb-0.5">Left</p>
                <p className="text-2xl font-bold tabular-nums">{leftCount}</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="text-center">
                <p className="text-xs text-text-muted font-medium uppercase tracking-wider mb-0.5">Right</p>
                <p className="text-2xl font-bold tabular-nums">{rightCount}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-muted mb-0.5">Next side</p>
              <p className="text-base font-semibold text-accent-blue">
                {lastBreastFeed?.lastSide === 'left' ? 'Right' : 'Left'}
              </p>
            </div>
          </div>
        )}

        {/* Quick-add buttons */}
        <div className="grid grid-cols-4 gap-2.5 mb-5">
          <QuickButton
            label="Feed"
            icon={<FeedIcon />}
            bgClass="bg-accent-blue/10 hover:bg-accent-blue/15"
            textClass="text-accent-blue"
            onClick={() => setFeedOpen(true)}
          />
          <QuickButton
            label="Wet"
            icon={<WetIcon />}
            bgClass="bg-accent-green/10 hover:bg-accent-green/15"
            textClass="text-accent-green"
            onClick={() => { setDiaperInitialType('wet'); setDiaperOpen(true); }}
          />
          <QuickButton
            label="Stool"
            icon={<StoolIcon />}
            bgClass="bg-accent-amber/10 hover:bg-accent-amber/15"
            textClass="text-accent-amber"
            onClick={() => { setDiaperInitialType('stool'); setDiaperOpen(true); }}
          />
          <QuickButton
            label="Pump"
            icon={<PumpIcon />}
            bgClass="bg-accent-purple/10 hover:bg-accent-purple/15"
            textClass="text-accent-purple"
            onClick={() => setPumpOpen(true)}
          />
        </div>

        {/* Today's log */}
        <div>
          <h3 className="text-xs text-text-muted font-medium uppercase tracking-wider mb-2.5">Today's Log</h3>
          {timeline.length === 0 ? (
            <p className="text-text-muted text-center py-8 text-sm">No entries yet today</p>
          ) : (
            <div className="flex flex-col gap-1.5">
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

function SummaryCard({ label, value, target, accent }: { label: string; value: number; target?: number; accent: string }) {
  const atTarget = target !== undefined && value >= target;
  const accentColors: Record<string, string> = {
    green: 'border-accent-green/20',
    blue: 'border-accent-blue/20',
    amber: 'border-accent-amber/20',
    purple: 'border-[#B180F7]/20',
  };
  return (
    <div className={`glass-card rounded-xl p-3 min-w-[76px] flex-shrink-0 text-center border ${accentColors[accent] ?? 'border-border'}`}>
      <p className={`text-xl font-bold tabular-nums ${atTarget ? 'text-accent-green' : 'text-text-primary'}`}>
        {value}
        {target !== undefined && (
          <span className={`text-xs font-normal ${atTarget ? 'text-accent-green/60' : 'text-text-muted'}`}>/{target}</span>
        )}
      </p>
      <p className="text-[10px] text-text-muted mt-0.5 font-medium uppercase tracking-wider">{label}</p>
    </div>
  );
}

function QuickButton({ label, icon, bgClass, textClass, onClick }: {
  label: string;
  icon: React.ReactNode;
  bgClass: string;
  textClass: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center rounded-2xl py-4 min-h-[80px] transition-all active:scale-95 ${bgClass} ${textClass}`}
    >
      <div className="mb-1.5">{icon}</div>
      <span className="text-xs font-semibold">{label}</span>
    </button>
  );
}

// SVG icons for quick-add buttons (replacing emojis for premium feel)
function FeedIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2v6a6 6 0 0012 0V2" />
      <path d="M12 8v13" />
      <path d="M8 21h8" />
    </svg>
  );
}

function WetIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" />
    </svg>
  );
}

function StoolIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

function PumpIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2h8" />
      <path d="M9 2v3.5a5 5 0 005 0V2" />
      <rect x="7" y="10" width="10" height="12" rx="2" />
      <line x1="12" y1="14" x2="12" y2="18" />
    </svg>
  );
}

function TimelineRow({ item, onDelete }: { item: TimelineEntry; onDelete: () => void }) {
  const [showDelete, setShowDelete] = useState(false);

  let icon: React.ReactNode;
  let detail = '';
  let accentColor = '';

  if (item.entryType === 'feed') {
    const f = item.entry as FeedEntry;
    accentColor = 'text-accent-blue';
    icon = (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2v6a6 6 0 0012 0V2" />
        <path d="M12 8v13" />
      </svg>
    );
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
    accentColor = d.type === 'wet' ? 'text-accent-green' : 'text-accent-amber';
    icon = d.type === 'wet' || d.type === 'both' ? (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" />
      </svg>
    ) : (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      </svg>
    );
    detail = d.type.charAt(0).toUpperCase() + d.type.slice(1);
    if (d.stoolColor) detail += ` (${d.stoolColor})`;
  } else {
    const p = item.entry as PumpEntry;
    accentColor = 'text-accent-purple';
    icon = (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="7" y="10" width="10" height="12" rx="2" />
        <line x1="12" y1="14" x2="12" y2="18" />
      </svg>
    );
    detail = p.amount ? `${p.amount} ${p.unit}` : 'Pump';
    if (p.side !== 'both') detail += ` (${p.side})`;
  }

  return (
    <div>
      <div
        onClick={() => setShowDelete(!showDelete)}
        className="flex items-center glass-card rounded-xl px-3.5 py-3 gap-3 cursor-pointer transition-colors active:bg-bg-card-hover"
      >
        <span className={`${accentColor} flex-shrink-0`}>{icon}</span>
        <span className="flex-1 text-sm font-medium">{detail}</span>
        <span className="text-xs text-text-muted tabular-nums">{formatRelativeTime(item.timestamp)}</span>
      </div>
      {showDelete && (
        <div className="flex justify-end gap-2 mt-1.5 mb-1 animate-scale-in">
          <button
            onClick={() => setShowDelete(false)}
            className="px-4 py-2 text-xs rounded-xl bg-bg-card text-text-secondary font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onDelete}
            className="px-4 py-2 text-xs rounded-xl bg-accent-red/15 text-accent-red font-medium"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
