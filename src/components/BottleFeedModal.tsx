import { useState, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import { useSync } from '../context/SyncContext';
import type { FeedEntry } from '../types';
import Modal from './Modal';
import DateTimeInput from './DateTimeInput';
import NotesInput from './NotesInput';

const OZ_PRESETS = [0.5, 1, 1.5, 2, 2.5, 3, 4];
const ML_PRESETS = [15, 30, 45, 60, 75, 90, 120];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function BottleFeedModal({ open, onClose, onSaved }: Props) {
  const { activeBaby } = useApp();
  const { syncPush } = useSync();
  const [unit, setUnit] = useState<'oz' | 'mL'>(activeBaby?.unitPreference ?? 'oz');
  const [amount, setAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [timestamp, setTimestamp] = useState(Date.now());
  const [notes, setNotes] = useState('');

  useEffect(() => { if (open) setTimestamp(Date.now()); }, [open]);

  const presets = unit === 'oz' ? OZ_PRESETS : ML_PRESETS;
  const effectiveAmount = amount ?? (customAmount ? parseFloat(customAmount) : null);

  async function handleSave() {
    if (!activeBaby || effectiveAmount === null) return;

    const entry: FeedEntry = {
      id: uuid(),
      babyId: activeBaby.id,
      type: 'bottle',
      timestamp,
      leftDurationSec: null,
      rightDurationSec: null,
      leftOz: null,
      rightOz: null,
      lastSide: null,
      amount: effectiveAmount,
      unit,
      notes: notes || null,
      createdAt: Date.now(),
    };

    await db.feeds.add(entry);
    syncPush('feeds', entry.id, entry);
    setAmount(null);
    setCustomAmount('');
    setNotes('');
    setTimestamp(Date.now());
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Bottle Feed">
      {/* Unit toggle */}
      <div className="flex gap-2 mb-4">
        {(['oz', 'mL'] as const).map(u => (
          <button
            key={u}
            onClick={() => { setUnit(u); setAmount(null); setCustomAmount(''); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${
              unit === u ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-secondary'
            }`}
          >
            {u}
          </button>
        ))}
      </div>

      {/* Presets */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {presets.map(p => (
          <button
            key={p}
            onClick={() => { setAmount(p); setCustomAmount(''); }}
            className={`py-3 rounded-xl text-base font-medium ${
              amount === p ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-primary'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Custom */}
      <div className="mb-4">
        <label className="text-text-secondary text-sm mb-1 block">Custom amount</label>
        <input
          type="number"
          step={unit === 'oz' ? '0.1' : '1'}
          value={customAmount}
          onChange={e => { setCustomAmount(e.target.value); setAmount(null); }}
          placeholder={`Enter ${unit}`}
          className="w-full px-4 py-3 rounded-xl bg-bg-input text-text-primary text-base outline-none focus:ring-2 focus:ring-accent-blue"
        />
      </div>

      <DateTimeInput value={timestamp} onChange={setTimestamp} />
      <NotesInput value={notes} onChange={setNotes} />

      <button
        onClick={handleSave}
        disabled={effectiveAmount === null || isNaN(effectiveAmount)}
        className="w-full py-4 rounded-2xl btn-success text-white font-semibold text-lg"
      >
        Save
      </button>
    </Modal>
  );
}
