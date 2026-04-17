import { useState, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import { useSync } from '../context/SyncContext';
import { useLanguage } from '../context/LanguageContext';
import type { DrinkEntry, DrinkKind } from '../types';
import Modal from './Modal';
import DateTimeInput from './DateTimeInput';
import NotesInput from './NotesInput';
import { getCaregiverName } from '../caregiver';

const MILK_KINDS: DrinkKind[] = ['milk', 'milk-cow', 'milk-breast', 'milk-formula', 'milk-oat', 'milk-soy', 'milk-other'];
const OTHER_KINDS: DrinkKind[] = ['water', 'juice', 'other'];

const OZ_PRESETS = [4, 6, 8, 10, 12];
const ML_PRESETS = [120, 180, 240, 300, 360];

const LAST_AMOUNT_KEY = 'babylog_drink_last_amount';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialKind: DrinkKind;
  entry?: DrinkEntry | null;
}

export default function DrinkQuickAddSheet({ open, onClose, onSaved, initialKind, entry }: Props) {
  const { activeBaby } = useApp();
  const { syncPush } = useSync();
  const { t } = useLanguage();
  const isEdit = !!entry;

  const [kind, setKind] = useState<DrinkKind>(initialKind);
  const [unit, setUnit] = useState<'oz' | 'mL'>(activeBaby?.unitPreference ?? 'oz');
  const [amount, setAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [timestamp, setTimestamp] = useState(Date.now());
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    if (entry) {
      setKind(entry.kind);
      setUnit(entry.unit);
      const presets = entry.unit === 'oz' ? OZ_PRESETS : ML_PRESETS;
      if (presets.includes(entry.amount)) {
        setAmount(entry.amount);
        setCustomAmount('');
      } else {
        setAmount(null);
        setCustomAmount(String(entry.amount));
      }
      setTimestamp(entry.timestamp);
      setNotes(entry.notes ?? '');
    } else {
      setKind(initialKind);
      setUnit(activeBaby?.unitPreference ?? 'oz');
      // Pre-fill with last-used amount for this kind, falling back to a sensible default.
      const lastByKind = readLastAmounts();
      const last = lastByKind[initialKind];
      const defaultAmount = last ?? (initialKind === 'water' ? 4 : 8);
      const presets = (activeBaby?.unitPreference ?? 'oz') === 'oz' ? OZ_PRESETS : ML_PRESETS;
      if (presets.includes(defaultAmount)) {
        setAmount(defaultAmount);
        setCustomAmount('');
      } else {
        setAmount(null);
        setCustomAmount(String(defaultAmount));
      }
      setTimestamp(Date.now());
      setNotes('');
    }
  }, [open, entry, initialKind, activeBaby]);

  const presets = unit === 'oz' ? OZ_PRESETS : ML_PRESETS;
  const effectiveAmount = amount ?? (customAmount ? parseFloat(customAmount) : null);
  const canSave = effectiveAmount !== null && !isNaN(effectiveAmount) && effectiveAmount > 0;

  async function handleSave() {
    if (!activeBaby || !canSave) return;
    const now = Date.now();
    const saved: DrinkEntry = {
      id: entry?.id ?? uuid(),
      babyId: entry?.babyId ?? activeBaby.id,
      timestamp,
      kind,
      amount: effectiveAmount!,
      unit,
      notes: notes || null,
      createdAt: entry?.createdAt ?? now,
      modifiedAt: now,
      loggedBy: entry?.loggedBy ?? getCaregiverName(),
    };
    if (isEdit) await db.drinks.put(saved);
    else await db.drinks.add(saved);
    syncPush('drinks', saved.id, saved);
    rememberAmount(kind, effectiveAmount!);
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t(isEdit ? 'modal.drink.edit' : 'modal.drink.new')}>
      {/* Kind */}
      <label className="text-text-secondary text-sm mb-2 block">{t('label.drinkKind')}</label>
      <div className="flex flex-wrap gap-2 mb-3">
        {MILK_KINDS.map(k => (
          <KindChip key={k} kind={k} active={kind === k} onClick={() => setKind(k)} t={t} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {OTHER_KINDS.map(k => (
          <KindChip key={k} kind={k} active={kind === k} onClick={() => setKind(k)} t={t} />
        ))}
      </div>

      {/* Unit */}
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

      {/* Amount presets */}
      <label className="text-text-secondary text-sm mb-2 block">{t('label.amount')}</label>
      <div className="grid grid-cols-5 gap-2 mb-3">
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

      {/* Custom amount */}
      <div className="mb-4">
        <input
          type="number"
          step={unit === 'oz' ? '0.5' : '10'}
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

function KindChip({
  kind, active, onClick, t,
}: {
  kind: DrinkKind;
  active: boolean;
  onClick: () => void;
  t: (k: string) => string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-2 rounded-full text-sm font-medium ${
        active ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-secondary'
      }`}
    >
      {t(`drink.kind.${kind}`)}
    </button>
  );
}

function readLastAmounts(): Partial<Record<DrinkKind, number>> {
  try {
    const raw = localStorage.getItem(LAST_AMOUNT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function rememberAmount(kind: DrinkKind, amount: number) {
  try {
    const all = readLastAmounts();
    all[kind] = amount;
    localStorage.setItem(LAST_AMOUNT_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}
