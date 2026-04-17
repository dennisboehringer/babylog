import { useState, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import { useSync } from '../context/SyncContext';
import type { PumpEntry } from '../types';
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
  entry?: PumpEntry | null;
}

export default function PumpModal({ open, onClose, onSaved, entry }: Props) {
  const { activeBaby } = useApp();
  const { syncPush } = useSync();
  const { t } = useLanguage();
  const isEdit = !!entry;
  const [side, setSide] = useState<'left' | 'right' | 'both'>('both');
  const [unit, setUnit] = useState<'oz' | 'mL'>(activeBaby?.unitPreference ?? 'oz');
  const [amount, setAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [timestamp, setTimestamp] = useState(Date.now());
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    if (entry) {
      setSide(entry.side);
      setUnit(entry.unit);
      const presets = entry.unit === 'oz' ? OZ_PRESETS : ML_PRESETS;
      if (entry.amount !== null && presets.includes(entry.amount)) {
        setAmount(entry.amount);
        setCustomAmount('');
      } else {
        setAmount(null);
        setCustomAmount(entry.amount !== null ? String(entry.amount) : '');
      }
      setTimestamp(entry.timestamp);
      setNotes(entry.notes ?? '');
    } else {
      setSide('both');
      setUnit(activeBaby?.unitPreference ?? 'oz');
      setAmount(null);
      setCustomAmount('');
      setTimestamp(Date.now());
      setNotes('');
    }
  }, [open, entry, activeBaby]);

  const presets = unit === 'oz' ? OZ_PRESETS : ML_PRESETS;
  const effectiveAmount = amount ?? (customAmount ? parseFloat(customAmount) : null);

  async function handleSave() {
    if (!activeBaby) return;

    const now = Date.now();
    const saved: PumpEntry = {
      id: entry?.id ?? uuid(),
      babyId: entry?.babyId ?? activeBaby.id,
      timestamp,
      side,
      amount: effectiveAmount,
      unit,
      durationSec: entry?.durationSec ?? null,
      notes: notes || null,
      createdAt: entry?.createdAt ?? now,
      modifiedAt: now,
      loggedBy: entry?.loggedBy ?? getCaregiverName(),
    };

    if (isEdit) {
      await db.pumps.put(saved);
    } else {
      await db.pumps.add(saved);
    }
    syncPush('pumps', saved.id, saved);
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t(isEdit ? 'modal.pump.edit' : 'modal.pump.new')}>
      {/* Side */}
      <div className="flex gap-2 mb-4">
        {(['left', 'right', 'both'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`flex-1 py-3 rounded-xl text-sm font-medium ${
              side === s ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-secondary'
            }`}
          >
            {t(`option.${s}`)}
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
        className="w-full py-4 rounded-2xl btn-success text-white font-semibold text-lg"
      >
        {t(isEdit ? 'btn.saveChanges' : 'btn.save')}
      </button>
    </Modal>
  );
}
