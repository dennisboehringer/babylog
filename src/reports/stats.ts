// Deterministic stats computation for the AI-assisted one-pager report.
// This module never calls Claude. It turns raw DB entries into the numbers
// that the HTML template renders and that get handed to Claude as grounded
// context for prose generation.

import { db } from '../db';
import type { BabyProfile, FeedEntry, DiaperEntry, PumpEntry } from '../types';

const ML_PER_OZ = 29.5735;

export interface DayStats {
  dateISO: string;        // YYYY-MM-DD
  label: string;          // "Apr 14"
  dayOfLife: number;      // DOL — 1-indexed days since DOB
  feedCount: number;
  totalVolumeMl: number;  // total bottle volume in mL (breast feed volume is not tracked)
  breastFeedCount: number;
  bottleFeedCount: number;
  wetCount: number;
  stoolCount: number;
  pumpCount: number;
  stoolDescriptions: string[]; // e.g. ["brown seedy", "yellow"]
  feeds: FeedEventLite[];      // for the per-feed timeline
}

export interface FeedEventLite {
  timestamp: number;
  type: 'breast' | 'bottle';
  volumeMl: number | null; // null for breast feeds with no measured volume
  timeOfDay: string;       // "12:30p"
}

export interface ReportStats {
  baby: {
    name: string;
    dob: string;
    ageDaysAtReport: number;
  };
  range: {
    startISO: string;
    endISO: string;
    startLabel: string;  // "Apr 12, 2026"
    endLabel: string;
    dayCount: number;
  };
  totals: {
    feedCount: number;
    bottleFeedCount: number;
    breastFeedCount: number;
    totalVolumeMl: number;     // sum of bottle feed volumes
    avgPerFeedMl: number;      // over bottle feeds only
    peakFeedMl: number;
    peakFeedWhen: string | null; // e.g. "Apr 14 12:30p"
    wetCount: number;
    stoolCount: number;
    pumpCount: number;
  };
  days: DayStats[];
  // Feeding model classification used in the Executive Summary
  feedingModel: 'exclusive-breast' | 'exclusive-bottle' | 'mixed' | 'breast-with-bottle-supplement';
  // AAP minimum wet diapers by day of life (DOL) — used to flag hydration
  wetDiaperThresholds: { dayOfLife: number; minRequired: number; actual: number; met: boolean }[];
  // Stool color progression derived from diaper entries
  stoolProgression: { dateISO: string; label: string; dayOfLife: number; description: string; classification: 'transitional' | 'normal' | 'favorable' | 'concerning' }[];
  // Volume trend vector for the chart
  volumeTrend: { label: string; volumeMl: number; feedCount: number }[];
  // Pump sessions — included for context only, not interpreted as supply
  pumpSessions: { dateISO: string; sessions: number; totalMl: number }[];
}

function feedVolumeMl(f: FeedEntry): number {
  if (f.type !== 'bottle' || f.amount == null) return 0;
  return f.unit === 'mL' ? f.amount : f.amount * ML_PER_OZ;
}

function pumpVolumeMl(p: PumpEntry): number {
  if (p.amount == null) return 0;
  return p.unit === 'mL' ? p.amount : p.amount * ML_PER_OZ;
}

function dateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateLabel(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function longDateLabel(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeOfDay(ts: number): string {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'p' : 'a';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')}${ampm}`;
}

function dayOfLife(dob: string, ts: number): number {
  // DOL 1 = day of birth. Counts calendar days from DOB.
  const birth = new Date(dob + 'T00:00:00');
  const target = new Date(ts);
  target.setHours(0, 0, 0, 0);
  birth.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((target.getTime() - birth.getTime()) / 86400000);
  return diffDays + 1;
}

function describeStool(d: DiaperEntry): string {
  const parts: string[] = [];
  if (d.stoolConsistency) parts.push(d.stoolConsistency);
  if (d.stoolColor) parts.push(d.stoolColor);
  return parts.join(' ').trim() || 'unspecified';
}

function classifyStool(dol: number, colors: Set<string>, consistencies: Set<string>): 'transitional' | 'normal' | 'favorable' | 'concerning' {
  // Concerning: black or white stool after DOL 3, or red (not tracked here but guard anyway)
  if (colors.has('black') && dol > 3) return 'concerning';
  // Favorable: yellow stool present — indicates successful transition to milk stool
  if (colors.has('yellow')) return 'favorable';
  // Transitional: seedy or mixed green/brown in first few days
  if (dol <= 3 && (consistencies.has('seedy') || colors.has('green'))) return 'transitional';
  return 'normal';
}

// AAP hydration minimums by DOL (wet diapers per day)
// Source widely cited: 1 on DOL 1, 2 on DOL 2, 3 on DOL 3, 4 on DOL 4, 5 on DOL 5, 6+ thereafter
function wetMinimumForDol(dol: number): number {
  if (dol <= 0) return 1;
  if (dol >= 6) return 6;
  return dol;
}

function classifyFeedingModel(feeds: FeedEntry[], pumps: PumpEntry[]): ReportStats['feedingModel'] {
  const breastFeeds = feeds.filter(f => f.type === 'breast').length;
  const bottleFeeds = feeds.filter(f => f.type === 'bottle').length;
  const breastmilkBottles = feeds.filter(f => f.type === 'bottle' && f.milkType === 'breastmilk').length;
  const hasPumps = pumps.length > 0;

  if (bottleFeeds === 0 && breastFeeds > 0) return 'exclusive-breast';
  if (breastFeeds === 0 && bottleFeeds > 0) {
    // Could be expressed-breastmilk-via-bottle, which is a meaningful distinction
    if (hasPumps && breastmilkBottles >= bottleFeeds * 0.5) {
      return 'breast-with-bottle-supplement';
    }
    return 'exclusive-bottle';
  }
  return 'mixed';
}

export async function computeReportStats(
  baby: BabyProfile,
  rangeStartMs: number,
  rangeEndMs: number,
): Promise<ReportStats> {
  const [allFeeds, allDiapers, allPumps] = await Promise.all([
    db.feeds.where('babyId').equals(baby.id).and(f => f.timestamp >= rangeStartMs && f.timestamp <= rangeEndMs).toArray(),
    db.diapers.where('babyId').equals(baby.id).and(d => d.timestamp >= rangeStartMs && d.timestamp <= rangeEndMs).toArray(),
    db.pumps.where('babyId').equals(baby.id).and(p => p.timestamp >= rangeStartMs && p.timestamp <= rangeEndMs).toArray(),
  ]);

  allFeeds.sort((a, b) => a.timestamp - b.timestamp);
  allDiapers.sort((a, b) => a.timestamp - b.timestamp);
  allPumps.sort((a, b) => a.timestamp - b.timestamp);

  // Build per-day buckets
  const dayMap = new Map<string, DayStats>();
  function getBucket(ts: number): DayStats {
    const key = dateKey(ts);
    let bucket = dayMap.get(key);
    if (!bucket) {
      bucket = {
        dateISO: key,
        label: dateLabel(ts),
        dayOfLife: dayOfLife(baby.dob, ts),
        feedCount: 0,
        totalVolumeMl: 0,
        breastFeedCount: 0,
        bottleFeedCount: 0,
        wetCount: 0,
        stoolCount: 0,
        pumpCount: 0,
        stoolDescriptions: [],
        feeds: [],
      };
      dayMap.set(key, bucket);
    }
    return bucket;
  }

  let peakFeedMl = 0;
  let peakFeedTs: number | null = null;

  for (const f of allFeeds) {
    const b = getBucket(f.timestamp);
    b.feedCount++;
    if (f.type === 'breast') b.breastFeedCount++;
    else b.bottleFeedCount++;
    const vol = feedVolumeMl(f);
    b.totalVolumeMl += vol;
    if (vol > peakFeedMl) {
      peakFeedMl = vol;
      peakFeedTs = f.timestamp;
    }
    b.feeds.push({
      timestamp: f.timestamp,
      type: f.type,
      volumeMl: f.type === 'bottle' && f.amount != null ? vol : null,
      timeOfDay: timeOfDay(f.timestamp),
    });
  }

  for (const d of allDiapers) {
    const b = getBucket(d.timestamp);
    if (d.type === 'wet' || d.type === 'both') b.wetCount++;
    if (d.type === 'stool' || d.type === 'both') {
      b.stoolCount++;
      b.stoolDescriptions.push(describeStool(d));
    }
  }

  for (const p of allPumps) {
    const b = getBucket(p.timestamp);
    b.pumpCount++;
  }

  // Ensure all calendar days in range exist, even if empty
  const startDay = new Date(rangeStartMs);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(rangeEndMs);
  endDay.setHours(0, 0, 0, 0);
  for (let d = new Date(startDay); d.getTime() <= endDay.getTime(); d.setDate(d.getDate() + 1)) {
    getBucket(d.getTime());
  }

  const days = Array.from(dayMap.values()).sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  // Totals
  const bottleFeeds = allFeeds.filter(f => f.type === 'bottle');
  const totalVolumeMl = bottleFeeds.reduce((s, f) => s + feedVolumeMl(f), 0);
  const bottleFeedsWithVolume = bottleFeeds.filter(f => f.amount != null);
  const avgPerFeedMl = bottleFeedsWithVolume.length > 0
    ? totalVolumeMl / bottleFeedsWithVolume.length
    : 0;

  const wetCount = allDiapers.filter(d => d.type === 'wet' || d.type === 'both').length;
  const stoolCount = allDiapers.filter(d => d.type === 'stool' || d.type === 'both').length;

  // Wet diaper thresholds per day
  const wetDiaperThresholds = days.map(d => {
    const minRequired = wetMinimumForDol(d.dayOfLife);
    return {
      dayOfLife: d.dayOfLife,
      minRequired,
      actual: d.wetCount,
      met: d.wetCount >= minRequired,
    };
  });

  // Stool progression — one row per day with any stool events
  const stoolProgression: ReportStats['stoolProgression'] = [];
  for (const d of days) {
    if (d.stoolCount === 0) continue;
    const dayDiapers = allDiapers.filter(
      dp => dateKey(dp.timestamp) === d.dateISO && (dp.type === 'stool' || dp.type === 'both'),
    );
    const colors = new Set(dayDiapers.map(dp => dp.stoolColor).filter(Boolean) as string[]);
    const consistencies = new Set(dayDiapers.map(dp => dp.stoolConsistency).filter(Boolean) as string[]);
    const descParts: string[] = [];
    if (consistencies.size > 0) descParts.push(Array.from(consistencies).join(' + '));
    if (colors.size > 0) descParts.push(Array.from(colors).join(' → '));
    const description = descParts.join(' · ') || 'unspecified';
    stoolProgression.push({
      dateISO: d.dateISO,
      label: d.label,
      dayOfLife: d.dayOfLife,
      description,
      classification: classifyStool(d.dayOfLife, colors, consistencies),
    });
  }

  // Volume trend (one bar per day)
  const volumeTrend = days.map(d => ({
    label: d.label,
    volumeMl: Math.round(d.totalVolumeMl),
    feedCount: d.feedCount,
  }));

  // Pump sessions
  const pumpSessions = days.map(d => {
    const dayPumps = allPumps.filter(p => dateKey(p.timestamp) === d.dateISO);
    return {
      dateISO: d.dateISO,
      sessions: dayPumps.length,
      totalMl: Math.round(dayPumps.reduce((s, p) => s + pumpVolumeMl(p), 0)),
    };
  });

  const ageDaysAtReport = Math.floor((rangeEndMs - new Date(baby.dob + 'T00:00:00').getTime()) / 86400000) + 1;

  return {
    baby: {
      name: baby.name,
      dob: baby.dob,
      ageDaysAtReport,
    },
    range: {
      startISO: dateKey(rangeStartMs),
      endISO: dateKey(rangeEndMs),
      startLabel: longDateLabel(rangeStartMs),
      endLabel: longDateLabel(rangeEndMs),
      dayCount: days.length,
    },
    totals: {
      feedCount: allFeeds.length,
      bottleFeedCount: bottleFeeds.length,
      breastFeedCount: allFeeds.length - bottleFeeds.length,
      totalVolumeMl: Math.round(totalVolumeMl),
      avgPerFeedMl: Math.round(avgPerFeedMl),
      peakFeedMl: Math.round(peakFeedMl),
      peakFeedWhen: peakFeedTs ? `${dateLabel(peakFeedTs)} ${timeOfDay(peakFeedTs)}` : null,
      wetCount,
      stoolCount,
      pumpCount: allPumps.length,
    },
    days,
    feedingModel: classifyFeedingModel(allFeeds, allPumps),
    wetDiaperThresholds,
    stoolProgression,
    volumeTrend,
    pumpSessions,
  };
}
