import { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import { useSync } from '../context/SyncContext';
import type { FeedEntry } from '../types';
import DateTimeInput from './DateTimeInput';
import NotesInput from './NotesInput';
import { getCaregiverName } from '../caregiver';
import { useLanguage } from '../context/LanguageContext';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface TimerState {
  activeSide: 'left' | 'right' | null;
  leftAccumulated: number;
  rightAccumulated: number;
  startedAt: number | null;
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
  const { t } = useLanguage();
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

  useEffect(() => {
    if (timer.activeSide) {
      tickRef.current = window.setInterval(() => setNow(Date.now()), 1000);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [timer.activeSide]);

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
      const updated = { ...prev, activeSide: side, startedAt: nowTs } as TimerState;
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

    let finalLeft = timer.leftAccumulated;
    let finalRight = timer.rightAccumulated;
    if (timer.activeSide && timer.startedAt) {
      const elapsed = Date.now() - timer.startedAt;
      if (timer.activeSide === 'left') finalLeft += elapsed;
      else finalRight += elapsed;
    }

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
      milkType: null,
      notes: notes || null,
      createdAt: Date.now(),
      loggedBy: getCaregiverName(),
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
    <div className="fixed inset-0 z-50 flex flex-col bg-bg-primary max-w-[420px] mx-auto animate-fade-in">
      {/* Header — pt respects the iPhone notch safe area */}
      <div className="flex items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button onClick={onClose} className="text-text-secondary text-sm min-h-[48px] px-2 font-medium">
          {t('btn.back')}
        </button>
        <span className="text-[17px] font-semibold">{t('modal.breastFeed.title')}</span>
        <button
          onClick={handleReset}
          className="text-accent-red text-sm min-h-[48px] px-2 font-medium"
        >
          {t('btn.reset')}
        </button>
      </div>

      {/* Total time */}
      <div className="text-center py-3">
        <p className="text-xs text-text-muted font-medium uppercase tracking-wider mb-1">{t('timer.total')}</p>
        <p className="text-3xl font-bold tabular-nums">{formatMs(totalMs)}</p>
      </div>

      {/* L/R buttons */}
      <div className="flex gap-4 px-4 py-4 flex-1 max-h-[300px]">
        <button
          onClick={() => tapSide('left')}
          className={`flex-1 rounded-3xl flex flex-col items-center justify-center min-h-[120px] transition-all ${
            timer.activeSide === 'left'
              ? 'bg-gradient-to-b from-accent-blue to-[#3070E0] text-white shadow-[0_4px_24px_rgba(74,158,255,0.3)]'
              : 'glass-card text-text-primary active:scale-[0.98]'
          }`}
        >
          <span className="text-lg font-semibold mb-2">{t('timer.left')}</span>
          <span className="text-4xl font-bold tabular-nums">{formatMs(leftMs)}</span>
          {timer.activeSide === 'left' && (
            <span className="text-sm mt-2 opacity-70">{t('timer.tapToPause')}</span>
          )}
        </button>

        <button
          onClick={() => tapSide('right')}
          className={`flex-1 rounded-3xl flex flex-col items-center justify-center min-h-[120px] transition-all ${
            timer.activeSide === 'right'
              ? 'bg-gradient-to-b from-accent-blue to-[#3070E0] text-white shadow-[0_4px_24px_rgba(74,158,255,0.3)]'
              : 'glass-card text-text-primary active:scale-[0.98]'
          }`}
        >
          <span className="text-lg font-semibold mb-2">{t('timer.right')}</span>
          <span className="text-4xl font-bold tabular-nums">{formatMs(rightMs)}</span>
          {timer.activeSide === 'right' && (
            <span className="text-sm mt-2 opacity-70">{t('timer.tapToPause')}</span>
          )}
        </button>
      </div>

      {/* Extras */}
      <div className="px-4 flex-1 scrollable">
        {!showExtras ? (
          <button
            onClick={() => setShowExtras(true)}
            className="w-full py-3 text-sm text-text-muted font-medium"
          >
            {t('timer.addExtras')}
          </button>
        ) : (
          <>
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">{t('label.leftOz', { unit: 'oz' })}</label>
                <input
                  type="number"
                  step="0.1"
                  value={leftOz}
                  onChange={e => setLeftOz(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 rounded-xl bg-bg-input text-text-primary outline-none focus:ring-2 focus:ring-accent-blue"
                />
              </div>
              <div className="flex-1">
                <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">{t('label.rightOz', { unit: 'oz' })}</label>
                <input
                  type="number"
                  step="0.1"
                  value={rightOz}
                  onChange={e => setRightOz(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 rounded-xl bg-bg-input text-text-primary outline-none focus:ring-2 focus:ring-accent-blue"
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
          className="w-full py-4 rounded-2xl btn-success text-white font-semibold text-lg"
        >
          {t('btn.done')}
        </button>
      </div>
    </div>
  );
}
