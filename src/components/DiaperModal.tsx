import { useState, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import { useSync } from '../context/SyncContext';
import type { DiaperEntry } from '../types';
import Modal from './Modal';
import DateTimeInput from './DateTimeInput';
import NotesInput from './NotesInput';

const STOOL_COLORS = [
  { value: 'yellow' as const, label: 'Yellow', hex: '#D4A72C' },
  { value: 'green' as const, label: 'Green', hex: '#2EA043' },
  { value: 'brown' as const, label: 'Brown', hex: '#8B6914' },
  { value: 'black' as const, label: 'Black', hex: '#3D3D3D' },
];

const CONSISTENCIES = ['seedy', 'runny', 'formed', 'mucousy'] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialType?: 'wet' | 'stool' | 'both';
}

export default function DiaperModal({ open, onClose, onSaved, initialType }: Props) {
  const { activeBaby } = useApp();
  const { syncPush } = useSync();
  const [type, setType] = useState<'wet' | 'stool' | 'both'>(initialType ?? 'wet');
  const [stoolColor, setStoolColor] = useState<DiaperEntry['stoolColor']>(null);
  const [stoolConsistency, setStoolConsistency] = useState<DiaperEntry['stoolConsistency']>(null);
  const [timestamp, setTimestamp] = useState(Date.now());
  const [notes, setNotes] = useState('');

  useEffect(() => { if (open) setTimestamp(Date.now()); }, [open]);

  const showStoolDetails = type === 'stool' || type === 'both';

  // Alert for black stool after day 5
  const babyAgeDays = activeBaby
    ? Math.floor((Date.now() - new Date(activeBaby.dob).getTime()) / 86400000)
    : 0;
  const showBlackAlert = stoolColor === 'black' && babyAgeDays >= 5;

  async function handleSave() {
    if (!activeBaby) return;

    const entry: DiaperEntry = {
      id: uuid(),
      babyId: activeBaby.id,
      timestamp,
      type,
      stoolColor: showStoolDetails ? stoolColor : null,
      stoolConsistency: showStoolDetails ? stoolConsistency : null,
      notes: notes || null,
      createdAt: Date.now(),
    };

    await db.diapers.add(entry);
    syncPush('diapers', entry.id, entry);
    setType(initialType ?? 'wet');
    setStoolColor(null);
    setStoolConsistency(null);
    setNotes('');
    setTimestamp(Date.now());
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Diaper">
      {/* Type selector */}
      <div className="flex gap-2 mb-4">
        {(['wet', 'stool', 'both'] as const).map(t => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`flex-1 py-3 rounded-xl text-sm font-medium capitalize ${
              type === t ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-secondary'
            }`}
          >
            {t === 'both' ? 'Both' : t === 'wet' ? 'Wet' : 'Stool'}
          </button>
        ))}
      </div>

      {/* Stool details */}
      {showStoolDetails && (
        <>
          <label className="text-text-secondary text-sm mb-2 block">Color</label>
          <div className="flex gap-3 mb-4">
            {STOOL_COLORS.map(c => (
              <button
                key={c.value}
                onClick={() => setStoolColor(c.value)}
                className={`flex flex-col items-center gap-1 flex-1`}
              >
                <div
                  className="w-10 h-10 rounded-full border-2"
                  style={{
                    backgroundColor: c.hex,
                    borderColor: stoolColor === c.value ? '#E1E4E8' : 'transparent',
                  }}
                />
                <span className="text-xs text-text-secondary">{c.label}</span>
              </button>
            ))}
          </div>

          {showBlackAlert && (
            <div className="bg-accent-red/15 border border-accent-red/30 rounded-xl p-3 mb-4">
              <p className="text-sm text-accent-red">
                Day 5+: dark stools may need attention — contact your provider.
              </p>
            </div>
          )}

          <label className="text-text-secondary text-sm mb-2 block">Consistency</label>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {CONSISTENCIES.map(c => (
              <button
                key={c}
                onClick={() => setStoolConsistency(c)}
                className={`py-3 rounded-xl text-sm font-medium capitalize ${
                  stoolConsistency === c ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-secondary'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </>
      )}

      <DateTimeInput value={timestamp} onChange={setTimestamp} />
      <NotesInput value={notes} onChange={setNotes} />

      <button
        onClick={handleSave}
        className="w-full py-4 rounded-2xl bg-accent-green text-white font-semibold text-lg active:opacity-80"
      >
        Save
      </button>
    </Modal>
  );
}
