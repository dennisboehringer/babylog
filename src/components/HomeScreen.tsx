import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useSync } from '../context/SyncContext';
import { useLanguage } from '../context/LanguageContext';
import { db } from '../db';
import { effectiveStage } from '../types';
import type { FeedEntry, DiaperEntry, PumpEntry, TimelineEntry } from '../types';
import FeedModal from './FeedModal';
import BottleFeedModal from './BottleFeedModal';
import EditBreastFeedModal from './EditBreastFeedModal';
import DiaperModal from './DiaperModal';
import PumpModal from './PumpModal';
import GuidanceBanner from './GuidanceBanner';
import ToddlerHome from './ToddlerHome';
import StageTransitionPrompt from './StageTransitionPrompt';
import { formatEntryTime, formatRelativeShort } from '../timeFormat';

type TFn = (key: string, params?: Record<string, string | number>) => string;

function getStartOfDay(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatTimeSince(ms: number, t: TFn): string {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return t('time.shortHoursMinutes', { h, m });
  return t('time.shortMinutes', { n: m });
}

// formatRelativeTime moved to ../timeFormat.ts as formatRelativeShort.
// Used by both newborn (this file) and toddler timelines.

export default function HomeScreen() {
  const { activeBaby } = useApp();

  // Route by stage: toddler+ gets the new Toddler home; newborn/weaning keep
  // the existing feed-timing UX below. Existing newborn code is unchanged.
  if (activeBaby) {
    const stage = effectiveStage(activeBaby);
    if (stage === 'toddler' || stage === 'preschool') {
      return (
        <>
          <ToddlerHome />
          <StageTransitionPrompt />
        </>
      );
    }
  }

  return (
    <>
      <NewbornHome />
      <StageTransitionPrompt />
    </>
  );
}

function NewbornHome() {
  const { activeBaby } = useApp();
  const { syncRemove, setOnRemoteUpdate } = useSync();
  const { t } = useLanguage();
  const [feeds, setFeeds] = useState<FeedEntry[]>([]);
  const [diapers, setDiapers] = useState<DiaperEntry[]>([]);
  const [pumps, setPumps] = useState<PumpEntry[]>([]);
  // Hero uses the most recent entry across ALL time, not just today, so the
  // "time since last feed" / "last pump" / "last side" don't reset at midnight.
  const [lastFeedOverall, setLastFeedOverall] = useState<FeedEntry | null>(null);
  const [lastBreastFeedOverall, setLastBreastFeedOverall] = useState<FeedEntry | null>(null);
  const [lastPumpOverall, setLastPumpOverall] = useState<PumpEntry | null>(null);
  const [now, setNow] = useState(Date.now());
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal state
  const [feedOpen, setFeedOpen] = useState(false);
  const [diaperOpen, setDiaperOpen] = useState(false);
  const [diaperInitialType, setDiaperInitialType] = useState<'wet' | 'stool'>('wet');
  const [pumpOpen, setPumpOpen] = useState(false);

  // Edit modal state
  const [editBottle, setEditBottle] = useState<FeedEntry | null>(null);
  const [editBreast, setEditBreast] = useState<FeedEntry | null>(null);
  const [editDiaper, setEditDiaper] = useState<DiaperEntry | null>(null);
  const [editPump, setEditPump] = useState<PumpEntry | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10000);
    // Also tick immediately when the PWA returns to the foreground — iOS suspends
    // setInterval while the app is backgrounded, so without this the hero can show
    // a stale "time since last feed" for up to 10s after resume.
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const loadData = useCallback(() => {
    if (!activeBaby) return;
    const start = getStartOfDay();
    Promise.all([
      db.feeds.where('babyId').equals(activeBaby.id).and(f => f.timestamp >= start).toArray(),
      db.diapers.where('babyId').equals(activeBaby.id).and(d => d.timestamp >= start).toArray(),
      db.pumps.where('babyId').equals(activeBaby.id).and(p => p.timestamp >= start).toArray(),
      // All-time "most recent" lookups for the hero. Separate from today's list so
      // the hero keeps showing "3h 42m since last feed" at 00:01 even if the last
      // feed was yesterday evening.
      db.feeds.where('babyId').equals(activeBaby.id).toArray(),
      db.pumps.where('babyId').equals(activeBaby.id).toArray(),
    ]).then(([f, d, p, allFeeds, allPumps]) => {
      // Belt-and-braces: normalize any bottle feed missing milkType to 'formula'.
      // Handles devices whose stored Dexie version is above v2 (so the upgrade hook
      // never ran), and any data that slipped past the sync boundary defense.
      const normalize = (feed: FeedEntry) =>
        feed.type === 'bottle' && (feed.milkType === null || feed.milkType === undefined)
          ? { ...feed, milkType: 'formula' as const }
          : feed;
      setFeeds(f.map(normalize));
      setDiapers(d);
      setPumps(p);
      const normalizedAll = allFeeds.map(normalize);
      setLastFeedOverall(
        normalizedAll.length > 0
          ? normalizedAll.reduce((a, b) => a.timestamp > b.timestamp ? a : b)
          : null
      );
      const breastAll = normalizedAll.filter(feed => feed.type === 'breast');
      setLastBreastFeedOverall(
        breastAll.length > 0
          ? breastAll.reduce((a, b) => a.timestamp > b.timestamp ? a : b)
          : null
      );
      setLastPumpOverall(
        allPumps.length > 0
          ? allPumps.reduce((a, b) => a.timestamp > b.timestamp ? a : b)
          : null
      );
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

  function handleEdit(item: TimelineEntry) {
    if (item.entryType === 'feed') {
      const f = item.entry as FeedEntry;
      if (f.type === 'bottle') setEditBottle(f);
      else setEditBreast(f);
    } else if (item.entryType === 'diaper') {
      setEditDiaper(item.entry as DiaperEntry);
    } else {
      setEditPump(item.entry as PumpEntry);
    }
  }

  if (!activeBaby) return null;

  // Hero reads from the all-time "most recent" state so the counter survives midnight.
  const lastFeed = lastFeedOverall;
  // Use Date.now() inline (not the `now` state) so the hero is always accurate on
  // render even if the interval-driven state hasn't ticked yet — e.g. right after
  // the PWA resumes from background. `now` still exists to trigger periodic re-renders.
  void now;
  const timeSinceLastFeed = lastFeed ? Date.now() - lastFeed.timestamp : null;
  const reminderMs = activeBaby.reminderIntervalMinutes * 60 * 1000;
  const reminderEnabled = activeBaby.reminderIntervalMinutes > 0;

  // When reminders are off (toddler/preschool stages, or newborn parents who
  // opted out), the hero stays calm regardless of elapsed time — no overdue.
  const feedStatus = !reminderEnabled
    ? 'neutral'
    : timeSinceLastFeed === null
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

  const totalFeeds = feeds.length;
  // Per-entry amounts are stored in each feed's own `unit`. Normalize to oz first,
  // otherwise a mL-stored feed gets inflated ~30x when the display unit is mL
  // (and underreports when display unit is oz). TrendsScreen does the same.
  const totalBottleOz = feeds
    .filter(f => f.type === 'bottle' && f.amount)
    .reduce((sum, f) => sum + (f.unit === 'mL' ? (f.amount ?? 0) / 29.5735 : (f.amount ?? 0)), 0);
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

  // For the "Last side" hint and the split-pump hero we also want the all-time
  // latest, not just today, so both pieces of the header agree across midnight.
  const lastBreastFeed = lastBreastFeedOverall;
  const lastPump = lastPumpOverall;
  const timeSinceLastPump = lastPump ? Date.now() - lastPump.timestamp : null;

  // Describe what the hero is tracking so hero-vs-timeline mismatches are self-diagnosing.
  function describeFeed(f: FeedEntry | null): string {
    if (!f) return t('home.feed.noFeeds');
    if (f.type === 'breast') {
      const parts: string[] = [];
      if (f.leftDurationSec) parts.push(`L:${Math.round(f.leftDurationSec / 60)}m`);
      if (f.rightDurationSec) parts.push(`R:${Math.round(f.rightDurationSec / 60)}m`);
      return `${t('home.feed.type.breast')} · ${parts.join(' ') || '—'}`;
    }
    const amt = f.amount ? `${f.amount} ${f.unit}` : '—';
    const milk = f.milkType === 'breastmilk' ? t('milk.breastmilk') : t('milk.formula');
    return `${t('home.feed.type.bottle')} · ${amt} · ${milk}`;
  }
  function describePump(p: PumpEntry | null): string {
    if (!p) return t('home.pump.noPumps');
    const amt = p.amount ? `${p.amount} ${p.unit}` : '—';
    const side = p.side === 'both' ? '' : ` · ${t(`option.${p.side}`)}`;
    return `${t('home.pump.label')} · ${amt}${side}`;
  }

  // Premium = restraint: infer split-hero mode from real pump activity in the
  // last 7 days, instead of exposing the layout as a Settings toggle.
  const SEVEN_DAYS = 7 * 86400000;
  const recentPumps = lastPump ? Date.now() - lastPump.timestamp < SEVEN_DAYS : false;
  const showPumpHero = recentPumps;
  // IBCLC: only suggest "next side" when the parent is alternating (default).
  // Single-side-per-feed pairs see totals only.
  const showNextSide = activeBaby.alternateSides !== false;

  return (
    <>
      <div className="flex-1 scrollable px-4 pt-4 pb-4">
        {/* Contextual guidance */}
        <GuidanceBanner dob={activeBaby.dob} feedCount={totalFeeds} wetCount={wetDiapers} />

        {/* Quick-add buttons — Florencia: action above the fold (mirror toddler reorder) */}
        <div className="grid grid-cols-4 gap-2.5 mb-4">
          <QuickButton
            label={t('home.quickAdd.feed')}
            icon={<FeedIcon />}
            bgClass="bg-accent-blue/10 hover:bg-accent-blue/15"
            textClass="text-accent-blue"
            onClick={() => setFeedOpen(true)}
          />
          <QuickButton
            label={t('home.quickAdd.wet')}
            icon={<WetIcon />}
            bgClass="bg-accent-green/10 hover:bg-accent-green/15"
            textClass="text-accent-green"
            onClick={() => { setDiaperInitialType('wet'); setDiaperOpen(true); }}
          />
          <QuickButton
            label={t('home.quickAdd.stool')}
            icon={<StoolIcon />}
            bgClass="bg-accent-amber/10 hover:bg-accent-amber/15"
            textClass="text-accent-amber"
            onClick={() => { setDiaperInitialType('stool'); setDiaperOpen(true); }}
          />
          <QuickButton
            label={t('home.quickAdd.pump')}
            icon={<PumpIcon />}
            bgClass="bg-accent-purple/10 hover:bg-accent-purple/15"
            textClass="text-accent-purple"
            onClick={() => setPumpOpen(true)}
          />
        </div>

        {/* Hero — single (feed only) or split 50/50 (feed + pump) */}
        {showPumpHero ? (
          <div className="flex gap-2 mb-4">
            <div className={`flex-1 min-w-0 rounded-2xl p-4 text-center ${heroClass}`}>
              <p className="text-text-secondary text-[10px] font-medium tracking-wide mb-1">{t('home.hero.lastFeed')}</p>
              <p className={`text-[30px] font-bold tabular-nums leading-none ${feedColor}`}>
                {timeSinceLastFeed !== null ? formatTimeSince(timeSinceLastFeed, t) : '—'}
              </p>
              <p className="text-text-muted text-[11px] mt-2 truncate">{describeFeed(lastFeed)}</p>
            </div>
            <div className="flex-1 min-w-0 rounded-2xl p-4 text-center hero-neutral">
              <p className="text-text-secondary text-[10px] font-medium tracking-wide mb-1">{t('home.hero.lastPump')}</p>
              <p className="text-[30px] font-bold tabular-nums leading-none text-accent-purple">
                {timeSinceLastPump !== null ? formatTimeSince(timeSinceLastPump, t) : '—'}
              </p>
              <p className="text-text-muted text-[11px] mt-2 truncate">{describePump(lastPump)}</p>
            </div>
          </div>
        ) : (
          <div className={`rounded-2xl p-5 mb-4 text-center ${heroClass}`}>
            <p className="text-text-secondary text-xs font-medium tracking-wide mb-1.5">{t('home.hero.timeSinceLastFeed')}</p>
            <p className={`text-[42px] font-bold tabular-nums leading-none ${feedColor}`}>
              {timeSinceLastFeed !== null ? formatTimeSince(timeSinceLastFeed, t) : '—'}
            </p>
            <p className="text-text-muted text-xs mt-2">{describeFeed(lastFeed)}</p>
            {lastBreastFeed?.lastSide && lastFeed?.type === 'breast' && (
              <p className="text-text-secondary text-sm mt-1">
                {t('label.lastSide')}: <span className="text-text-primary font-medium">{t(`option.${lastBreastFeed.lastSide}`)}</span>
              </p>
            )}
          </div>
        )}

        {/* Summary cards */}
        <div className="flex gap-2 mb-4 overflow-x-auto scrollable pb-1">
          <SummaryCard label={t('home.summary.feeds')} value={totalFeeds} target={8} accent="green" />
          <SummaryCard label={activeBaby.unitPreference === 'oz' ? t('home.summary.bottleOz') : t('home.summary.bottleMl')} value={
            activeBaby.unitPreference === 'oz'
              ? +totalBottleOz.toFixed(1)
              : +(totalBottleOz * 29.5735).toFixed(0)
          } accent="blue" />
          <SummaryCard label={t('home.summary.wet')} value={wetDiapers} accent="green" />
          <SummaryCard label={t('home.summary.stools')} value={stoolCount} accent="amber" />
          <SummaryCard label={t('home.summary.pumps')} value={pumpSessions} accent="purple" />
        </div>

        {/* Side balance — Brand: mixed-case, calmer */}
        {breastFeeds.length > 0 && showNextSide && (
          <div className="glass-card rounded-2xl p-4 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="text-center">
                <p className="text-[12px] text-text-muted font-medium mb-0.5">{t('home.balance.left')}</p>
                <p className="text-2xl font-bold tabular-nums">{leftCount}</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="text-center">
                <p className="text-[12px] text-text-muted font-medium mb-0.5">{t('home.balance.right')}</p>
                <p className="text-2xl font-bold tabular-nums">{rightCount}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[12px] text-text-muted mb-0.5">{t('home.balance.nextSide')}</p>
              <p className="text-base font-semibold text-accent-blue">
                {lastBreastFeed?.lastSide === 'left' ? t('home.balance.right') : t('home.balance.left')}
              </p>
            </div>
          </div>
        )}
        {/* When alternate-sides is off, show a compact totals row only (no "next side" advice) */}
        {breastFeeds.length > 0 && !showNextSide && (
          <div className="glass-card rounded-2xl p-4 mb-4 flex items-center justify-around">
            <div className="text-center">
              <p className="text-[12px] text-text-muted font-medium mb-0.5">{t('home.balance.left')}</p>
              <p className="text-2xl font-bold tabular-nums">{leftCount}</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <p className="text-[12px] text-text-muted font-medium mb-0.5">{t('home.balance.right')}</p>
              <p className="text-2xl font-bold tabular-nums">{rightCount}</p>
            </div>
          </div>
        )}

        {/* Today's log */}
        <div>
          <h3 className="text-xs text-text-muted font-medium uppercase tracking-wider mb-2.5">{t('home.todaysLog.title')}</h3>
          {timeline.length === 0 ? (
            <p className="text-text-muted text-center py-8 text-sm">{t('home.todaysLog.empty')}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {timeline.map(item => (
                <TimelineRow
                  key={item.id}
                  item={item}
                  onDelete={() => handleDelete(item)}
                  onEdit={() => handleEdit(item)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <FeedModal open={feedOpen} onClose={() => setFeedOpen(false)} onSaved={handleSaved} />
      <DiaperModal open={diaperOpen} onClose={() => setDiaperOpen(false)} onSaved={handleSaved} initialType={diaperInitialType} />
      <PumpModal open={pumpOpen} onClose={() => setPumpOpen(false)} onSaved={handleSaved} />

      {/* Edit modals */}
      <BottleFeedModal
        open={editBottle !== null}
        onClose={() => setEditBottle(null)}
        onSaved={handleSaved}
        entry={editBottle}
      />
      <EditBreastFeedModal
        open={editBreast !== null}
        onClose={() => setEditBreast(null)}
        onSaved={handleSaved}
        entry={editBreast}
      />
      <DiaperModal
        open={editDiaper !== null}
        onClose={() => setEditDiaper(null)}
        onSaved={handleSaved}
        entry={editDiaper}
      />
      <PumpModal
        open={editPump !== null}
        onClose={() => setEditPump(null)}
        onSaved={handleSaved}
        entry={editPump}
      />
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
      <p className="text-[11px] text-text-muted mt-0.5 font-medium uppercase tracking-wider">{label}</p>
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

// SVG icons for quick-add buttons (flat-vector style, theme-aware via currentColor)
function FeedIcon() {
  // Baby bottle: nipple + collar + body with measurement ticks.
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {/* Nipple tip */}
      <path d="M10.5 2.5h3v2h-3z" />
      {/* Collar ring */}
      <path d="M9.5 4.5h5v2h-5z" />
      {/* Bottle body (left shoulder → down → rounded bottom → up → right shoulder) */}
      <path d="M9.5 6.5c-.5.8-1 1.5-1 2.5V20a2 2 0 002 2h3a2 2 0 002-2V9c0-1-.5-1.7-1-2.5" />
      {/* Volume ticks */}
      <line x1="10.5" y1="11" x2="12.5" y2="11" />
      <line x1="10.5" y1="14" x2="12.5" y2="14" />
      <line x1="10.5" y1="17" x2="12.5" y2="17" />
    </svg>
  );
}

function WetIcon() {
  // Diaper silhouette — flat waistband, curved sides, rounded bottom — with two offset drops.
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {/* Flat waistband + sides curving down to rounded bottom */}
      <path d="M4 6.5h16v4c0 5-3.5 9.5-8 9.5s-8-4.5-8-9.5z" />
      {/* Upper-left drop */}
      <path d="M10 10.5c-1.3 1.7-2.1 3-2.1 3.9a2.1 2.1 0 004.2 0c0-.9-.8-2.2-2.1-3.9z" />
      {/* Lower-right drop (offset so they don't read as eyes) */}
      <path d="M14.8 13.8c-1 1.3-1.6 2.3-1.6 3.1a1.6 1.6 0 003.2 0c0-.8-.6-1.8-1.6-3.1z" />
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
  // Breast pump: motor/display on left, tube, flange (funnel), collection bottle.
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {/* Motor / display unit */}
      <rect x="2" y="7.5" width="7" height="9" rx="1" />
      <line x1="3.5" y1="10" x2="7.5" y2="10" />
      <circle cx="5.5" cy="13.5" r="0.9" />
      {/* Tube */}
      <path d="M9 12c1.5 0 2.7.5 3.5 1.5" />
      {/* Flange */}
      <path d="M12.5 13.5c0-1.5 1-2.5 2.5-2.5h4c1.5 0 2.5 1 2.5 2.5L20.5 15h-7z" />
      {/* Bottle */}
      <path d="M14.5 15v5.5a1.5 1.5 0 001.5 1.5h2a1.5 1.5 0 001.5-1.5V15" />
    </svg>
  );
}

function TimelineRow({ item, onDelete, onEdit }: { item: TimelineEntry; onDelete: () => void; onEdit: () => void }) {
  const [showActions, setShowActions] = useState(false);
  const { t } = useLanguage();

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
      detail = `${t('home.feed.type.breast')} · ${parts.join(' ') || '—'}`;
    } else {
      const amountStr = f.amount ? `${f.amount} ${f.unit}` : '—';
      const milkLabel = f.milkType === 'breastmilk' ? t('milk.breastmilk') : t('milk.formula');
      detail = `${t('home.feed.type.bottle')} · ${amountStr} · ${milkLabel}`;
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
    detail = t(`timeline.diaper.${d.type === 'both' ? 'both' : d.type}`);
    if (d.stoolColor) detail += ` (${t(`stool.color.${d.stoolColor}`)})`;
  } else {
    const p = item.entry as PumpEntry;
    accentColor = 'text-accent-purple';
    icon = (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="7" y="10" width="10" height="12" rx="2" />
        <line x1="12" y1="14" x2="12" y2="18" />
      </svg>
    );
    const amt = p.amount ? `${p.amount} ${p.unit}` : '—';
    detail = `${t('home.pump.label')} · ${amt}`;
    if (p.side !== 'both') detail += ` · ${t(`option.${p.side}`)}`;
  }

  // Caretaker Systems: surface "who logged this" on expand. Same display
  // pattern as the toddler timeline.
  const loggedBy = (item.entry as { loggedBy?: string }).loggedBy;

  return (
    <div>
      <div
        onClick={() => setShowActions(!showActions)}
        className="flex items-center glass-card rounded-xl px-3.5 py-3 gap-3 cursor-pointer transition-colors active:bg-bg-card-hover"
      >
        <span className={`${accentColor} flex-shrink-0`}>{icon}</span>
        <span className="flex-1 text-sm font-medium min-w-0 truncate">{detail}</span>
        <span className="flex flex-col items-end flex-shrink-0">
          <span className="text-xs font-medium tabular-nums text-text-secondary">{formatEntryTime(item.timestamp, t)}</span>
          <span className="text-[10px] text-text-muted tabular-nums">{formatRelativeShort(item.timestamp, t)}</span>
        </span>
      </div>
      {showActions && (
        <div className="flex items-center justify-between gap-2 mt-1.5 mb-1 animate-scale-in">
          {loggedBy
            ? <span className="text-[11px] text-text-muted px-1">{t('timeline.loggedBy', { name: loggedBy })}</span>
            : <span />}
          <div className="flex gap-2">
          <button
            onClick={() => setShowActions(false)}
            className="px-4 py-2 text-xs rounded-xl bg-bg-card text-text-secondary font-medium"
          >
            {t('btn.cancel')}
          </button>
          <button
            onClick={() => { setShowActions(false); onEdit(); }}
            className="px-4 py-2 text-xs rounded-xl bg-accent-blue/15 text-accent-blue font-medium"
          >
            {t('btn.edit')}
          </button>
          <button
            onClick={onDelete}
            className="px-4 py-2 text-xs rounded-xl bg-accent-red/15 text-accent-red font-medium"
          >
            {t('btn.delete')}
          </button>
          </div>
        </div>
      )}
    </div>
  );
}
