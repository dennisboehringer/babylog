import { useState, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import { useSync } from '../context/SyncContext';
import type { FeedEntry, MilkType } from '../types';
import Modal from './Modal';
import DateTimeInput from './DateTimeInput';
import NotesInput from './NotesInput';
import { useLanguage } from '../context/LanguageContext';
import { getCaregiverName } from '../caregiver';

const OZ_PRESETS = [0.5, 1, 1.5, 2, 2.5, 3, 4];
const ML_PRESETS = [15, 30, 45, 60, 75, 90, 120];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  entry?: FeedEntry | null;
}

export default function BottleFeedModal({ open, onClose, onSaved, entry }: Props) {
  const { activeBaby } = useApp();
  const { syncPush } = useSync();
  const { t } = useLanguage();
  const isEdit = !!entry;

  const [unit, setUnit] = useState<'oz' | 'mL'>(activeBaby?.unitPreference ?? 'oz');
  const [amount, setAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [milkType, setMilkType] = useState<MilkType | null>(null);
  const [timestamp, setTimestamp] = useState(Date.now());
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    if (entry) {
      // Hydrate from existing entry
      setUnit(entry.unit);
      const presets = entry.unit === 'oz' ? OZ_PRESETS : ML_PRESETS;
      if (entry.amount !== null && presets.includes(entry.amount)) {
        setAmount(entry.amount);
        setCustomAmount('');
      } else {
        setAmount(null);
        setCustomAmount(entry.amount !== null ? String(entry.amount) : '');
      }
      setMilkType(entry.milkType ?? null);
      setTimestamp(entry.timestamp);
      setNotes(entry.notes ?? '');
    } else {
      setUnit(activeBaby?.unitPreference ?? 'oz');
      setAmount(null);
      setCustomAmount('');
      setMilkType(null);
      setTimestamp(Date.now());
      setNotes('');
    }
  }, [open, entry, activeBaby]);

  const presets = unit === 'oz' ? OZ_PRESETS : ML_PRESETS;
  const effectiveAmount = amount ?? (customAmount ? parseFloat(customAmount) : null);
  const canSave = effectiveAmount !== null && !isNaN(effectiveAmount) && milkType !== null;

  async function handleSave() {
    if (!activeBaby || !canSave) return;

    const now = Date.now();
    const saved: FeedEntry = {
      id: entry?.id ?? uuid(),
      babyId: entry?.babyId ?? activeBaby.id,
      type: 'bottle',
      timestamp,
      leftDurationSec: null,
      rightDurationSec: null,
      leftOz: null,
      rightOz: null,
      lastSide: null,
      amount: effectiveAmount,
      unit,
      milkType,
      notes: notes || null,
      createdAt: entry?.createdAt ?? now,
      modifiedAt: now,
      loggedBy: entry?.loggedBy ?? getCaregiverName(),
    };

    if (isEdit) {
      await db.feeds.put(saved);
    } else {
      await db.feeds.add(saved);
    }
    syncPush('feeds', saved.id, saved);
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t(isEdit ? 'modal.bottleFeed.edit' : 'modal.bottleFeed.new')}>
      {/* Milk type */}
      <label className="text-text-secondary text-sm mb-2 block">{t('label.milkType')}</label>
      <div className="flex gap-2 mb-4">
        {([
          { value: 'breastmilk' as const, label: t('milk.breastmilk') },
          { value: 'formula' as const, label: t('milk.formula') },
        ]).map(m => (
          <button
            key={m.value}
            onClick={() => setMilkType(m.value)}
            className={`flex-1 py-3 rounded-xl text-sm font-medium ${
              milkType === m.value ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-secondary'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

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
        <label className="text-text-secondary text-sm mb-1 block">{t('label.customAmount')}</label>
        <input
          type="number"
          step={unit === 'oz' ? '0.1' : '1'}
          value={customAmount}
          onChange={e => { setCustomAmount(e.target.value); setAmount(null); }}
          placeholder={t('label.enterUnit', { unit })}
          className="w-full px-4 py-3 rounded-xl bg-bg-input text-text-primary text-base outline-none focus:ring-2 focus:ring-accent-blue"
        />
      </div>

      <DateTimeInput value={timestamp} onChange={setTimestamp} />
      <NotesInput value={notes} onChange={setNotes} />

      <button
        onClick={handleSave}
        disabled={!canSave}
        className="w-full py-4 rounded-2xl btn-success text-white font-semibold text-lg disabled:opacity-50"
      >
        {t(isEdit ? 'btn.saveChanges' : 'btn.save')}
      </button>
    </Modal>
  );
}
