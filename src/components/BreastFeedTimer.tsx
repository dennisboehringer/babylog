import { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import { useSync } from '../context/SyncContext';
import type { FeedEntry } from '../types';
import DateTimeInput from './DateTimeInput';
import NotesInput from './NotesInput';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface TimerState {
  activeSide: 'left' | 'right' | null;
  leftAccumulated: number; // ms accumulated before current run
  rightAccumulated: number;
  startedAt: number | null; // when current side started (timestamp)
  feedStartTimestamp: number;
}

const TIMER_KEY = 'babylog_timer';

function loadTimer(): TimerState | null {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveTimer(state: TimerState) {
  localStorage.setItem(TIMER_KEY, JSON.stringify(state));
}

function clearTimer() {
  localStorage.removeItem(TIMER_KEY);
}

export default function BreastFeedTimer({ open, onClose, onSaved }: Props) {
  const { activeBaby } = useApp();
  const { syncPush } = useSync();
  const [timer, setTimer] = useState<TimerState>(() => {
    return loadTimer() ?? {
      activeSide: null,
      leftAccumulated: 0,
      rightAccumulated: 0,
      startedAt: null,
      feedStartTimestamp: Date.now(),
    };
  });
  const [now, setNow] = useState(Date.now());
  const [notes, setNotes] = useState('');
  const [leftOz, setLeftOz] = useState('');
  const [rightOz, setRightOz] = useState('');
  const [showExtras, setShowExtras] = useState(false);
  const [timestamp, setTimestamp] = useState(Date.now());
  const tickRef = useRef<number>(undefined);

  // Tick every second while timer is active
  useEffect(() => {
    if (timer.activeSide) {
      tickRef.current = window.setInterval(() => setNow(Date.now()), 1000);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [timer.activeSide]);

  // Persist timer state
  useEffect(() => {
    saveTimer(timer);
  }, [timer]);

  const getElapsed = useCallback((side: 'left' | 'right') => {
    const acc = side === 'left' ? timer.leftAccumulated : timer.rightAccumulated;
    if (timer.activeSide === side && timer.startedAt) {
      return acc + (now - timer.startedAt);
    }
    return acc;
  }, [timer, now]);

  const leftMs = getElapsed('left');
  const rightMs = getElapsed('right');
  const totalMs = leftMs + rightMs;

  function formatMs(ms: number): string {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function tapSide(side: 'left' | 'right') {
    setTimer(prev => {
      const nowTs = Date.now();
      // If tapping the already active side, pause it
      if (prev.activeSide === side) {
        const elapsed = prev.startedAt ? nowTs - prev.startedAt : 0;
        return {
          ...prev,
          activeSide: null,
          startedAt: null,
          [side === 'left' ? 'leftAccumulated' : 'rightAccumulated']:
            (side === 'left' ? prev.leftAccumulated : prev.rightAccumulated) + elapsed,
        };
      }
      // Switch or start
      const updated = { ...prev, activeSide: side, startedAt: nowTs } as TimerState;
      // Pause the other side if active
      if (prev.activeSide && prev.startedAt) {
        const otherSide = prev.activeSide;
        const elapsed = nowTs - prev.startedAt;
        const key = otherSide === 'left' ? 'leftAccumulated' : 'rightAccumulated';
        (updated as any)[key] = (prev as any)[key] + elapsed;
      }
      return updated;
    });
  }

  async function handleDone() {
    if (!activeBaby) return;

    // Finalize any running timer
    let finalLeft = timer.leftAccumulated;
    let finalRight = timer.rightAccumulated;
    if (timer.activeSide && timer.startedAt) {
      const elapsed = Date.now() - timer.startedAt;
      if (timer.activeSide === 'left') finalLeft += elapsed;
      else finalRight += elapsed;
    }

    // Determine last side
    let lastSide: 'left' | 'right' | null = null;
    if (timer.activeSide) {
      lastSide = timer.activeSide;
    } else if (finalLeft > 0 || finalRight > 0) {
      lastSide = finalRight >= finalLeft ? 'right' : 'left';
    }

    const entry: FeedEntry = {
      id: uuid(),
      babyId: activeBaby.id,
      type: 'breast',
      timestamp: timestamp,
      leftDurationSec: finalLeft > 0 ? Math.round(finalLeft / 1000) : null,
      rightDurationSec: finalRight > 0 ? Math.round(finalRight / 1000) : null,
      leftOz: leftOz ? parseFloat(leftOz) : null,
      rightOz: rightOz ? parseFloat(rightOz) : null,
      lastSide,
      amount: null,
      unit: activeBaby.unitPreference,
      notes: notes || null,
      createdAt: Date.now(),
    };

    await db.feeds.add(entry);
    syncPush('feeds', entry.id, entry);
    clearTimer();
    setTimer({
      activeSide: null,
      leftAccumulated: 0,
      rightAccumulated: 0,
      startedAt: null,
      feedStartTimestamp: Date.now(),
    });
    setNotes('');
    setLeftOz('');
    setRightOz('');
    setShowExtras(false);
    onSaved();
    onClose();
  }

  function handleReset() {
    clearTimer();
    setTimer({
      activeSide: null,
      leftAccumulated: 0,
      rightAccumulated: 0,
      startedAt: null,
      feedStartTimestamp: Date.now(),
    });
    setTimestamp(Date.now());
  }

  if (!open) return null;

  const isRunning = timer.activeSide !== null;
  const hasAnyTime = totalMs > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black max-w-[420px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={onClose} className="text-text-secondary text-sm min-h-[48px] px-2">
          Back
        </button>
        <span className="text-lg font-semibold">Breast Feed</span>
        <button
          onClick={handleReset}
          className="text-accent-red text-sm min-h-[48px] px-2"
        >
          Reset
        </button>
      </div>

      {/* Total time */}
      <div className="text-center py-2">
        <p className="text-text-secondary text-sm">Total</p>
        <p className="text-3xl font-bold tabular-nums">{formatMs(totalMs)}</p>
      </div>

      {/* L/R buttons */}
      <div className="flex gap-4 px-4 py-4 flex-1 max-h-[300px]">
        <button
          onClick={() => tapSide('left')}
          className={`flex-1 rounded-3xl flex flex-col items-center justify-center min-h-[120px] transition-colors ${
            timer.activeSide === 'left'
              ? 'bg-accent-blue text-white'
              : 'bg-bg-card text-text-primary'
          }`}
        >
          <span className="text-lg font-medium mb-2">LEFT</span>
          <span className="text-4xl font-bold tabular-nums">{formatMs(leftMs)}</span>
          {timer.activeSide === 'left' && (
            <span className="text-sm mt-2 opacity-80">Tap to pause</span>
          )}
        </button>

        <button
          onClick={() => tapSide('right')}
          className={`flex-1 rounded-3xl flex flex-col items-center justify-center min-h-[120px] transition-colors ${
            timer.activeSide === 'right'
              ? 'bg-accent-blue text-white'
              : 'bg-bg-card text-text-primary'
          }`}
        >
          <span className="text-lg font-medium mb-2">RIGHT</span>
          <span className="text-4xl font-bold tabular-nums">{formatMs(rightMs)}</span>
          {timer.activeSide === 'right' && (
            <span className="text-sm mt-2 opacity-80">Tap to pause</span>
          )}
        </button>
      </div>

      {/* Extras */}
      <div className="px-4 flex-1 scrollable">
        {!showExtras ? (
          <button
            onClick={() => setShowExtras(true)}
            className="w-full py-3 text-sm text-text-secondary"
          >
            + Add weight, time, or notes
          </button>
        ) : (
          <>
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="text-text-secondary text-sm mb-1 block">Left oz</label>
                <input
                  type="number"
                  step="0.1"
                  value={leftOz}
                  onChange={e => setLeftOz(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 rounded-xl bg-bg-input text-text-primary outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="text-text-secondary text-sm mb-1 block">Right oz</label>
                <input
                  type="number"
                  step="0.1"
                  value={rightOz}
                  onChange={e => setRightOz(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 rounded-xl bg-bg-input text-text-primary outline-none"
                />
              </div>
            </div>
            <DateTimeInput value={timestamp} onChange={setTimestamp} />
            <NotesInput value={notes} onChange={setNotes} />
          </>
        )}
      </div>

      {/* Done button */}
      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          onClick={handleDone}
          disabled={!hasAnyTime && !isRunning}
          className="w-full py-4 rounded-2xl bg-accent-green text-white font-semibold text-lg disabled:opacity-40 active:opacity-80"
        >
          Done
        </button>
      </div>
    </div>
  );
}
