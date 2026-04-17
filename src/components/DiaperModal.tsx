import { useState, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import { useSync } from '../context/SyncContext';
import type { DiaperEntry } from '../types';
import Modal from './Modal';
import DateTimeInput from './DateTimeInput';
import NotesInput from './NotesInput';
import { useLanguage } from '../context/LanguageContext';
import { getCaregiverName } from '../caregiver';

const STOOL_COLORS = [
  { value: 'yellow' as const, tKey: 'stool.color.yellow', hex: '#D4A72C' },
  { value: 'green' as const, tKey: 'stool.color.green', hex: '#2EA043' },
  { value: 'brown' as const, tKey: 'stool.color.brown', hex: '#8B6914' },
  { value: 'black' as const, tKey: 'stool.color.black', hex: '#3D3D3D' },
];

const CONSISTENCIES = ['seedy', 'runny', 'formed', 'mucousy'] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialType?: 'wet' | 'stool' | 'both';
  entry?: DiaperEntry | null;
}

export default function DiaperModal({ open, onClose, onSaved, initialType, entry }: Props) {
  const { activeBaby } = useApp();
  const { syncPush } = useSync();
  const { t } = useLanguage();
  const isEdit = !!entry;
  const [type, setType] = useState<'wet' | 'stool' | 'both'>(initialType ?? 'wet');
  const [stoolColor, setStoolColor] = useState<DiaperEntry['stoolColor']>(null);
  const [stoolConsistency, setStoolConsistency] = useState<DiaperEntry['stoolConsistency']>(null);
  const [timestamp, setTimestamp] = useState(Date.now());
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    if (entry) {
      setType(entry.type);
      setStoolColor(entry.stoolColor);
      setStoolConsistency(entry.stoolConsistency);
      setTimestamp(entry.timestamp);
      setNotes(entry.notes ?? '');
    } else {
      setType(initialType ?? 'wet');
      setStoolColor(null);
      setStoolConsistency(null);
      setTimestamp(Date.now());
      setNotes('');
    }
  }, [open, entry, initialType]);

  const showStoolDetails = type === 'stool' || type === 'both';

  // Alert for black stool after day 5
  const babyAgeDays = activeBaby
    ? Math.floor((Date.now() - new Date(activeBaby.dob).getTime()) / 86400000)
    : 0;
  const showBlackAlert = stoolColor === 'black' && babyAgeDays >= 5;

  async function handleSave() {
    if (!activeBaby) return;

    const now = Date.now();
    const saved: DiaperEntry = {
      id: entry?.id ?? uuid(),
      babyId: entry?.babyId ?? activeBaby.id,
      timestamp,
      type,
      stoolColor: showStoolDetails ? stoolColor : null,
      stoolConsistency: showStoolDetails ? stoolConsistency : null,
      notes: notes || null,
      createdAt: entry?.createdAt ?? now,
      modifiedAt: now,
      loggedBy: entry?.loggedBy ?? getCaregiverName(),
    };

    if (isEdit) {
      await db.diapers.put(saved);
    } else {
      await db.diapers.add(saved);
    }
    syncPush('diapers', saved.id, saved);
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t(isEdit ? 'modal.diaper.edit' : 'modal.diaper.new')}>
      {/* Type selector */}
      <div className="flex gap-2 mb-4">
        {(['wet', 'stool', 'both'] as const).map(dt => (
          <button
            key={dt}
            onClick={() => setType(dt)}
            className={`flex-1 py-3 rounded-xl text-sm font-medium ${
              type === dt ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-secondary'
            }`}
          >
            {t(`diaper.type.${dt}`)}
          </button>
        ))}
      </div>

      {/* Stool details */}
      {showStoolDetails && (
        <>
          <label className="text-text-secondary text-sm mb-2 block">{t('label.stoolColor')}</label>
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
                <span className="text-xs text-text-secondary">{t(c.tKey)}</span>
              </button>
            ))}
          </div>

          {showBlackAlert && (
            <div className="bg-accent-red/15 border border-accent-red/30 rounded-xl p-3 mb-4">
              <p className="text-sm text-accent-red">
                {t('diaper.alert.blackStool')}
              </p>
            </div>
          )}

          <label className="text-text-secondary text-sm mb-2 block">{t('label.consistency')}</label>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {CONSISTENCIES.map(c => (
              <button
                key={c}
                onClick={() => setStoolConsistency(c)}
                className={`py-3 rounded-xl text-sm font-medium ${
                  stoolConsistency === c ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-secondary'
                }`}
              >
                {t(`stool.consistency.${c}`)}
              </button>
            ))}
          </div>
        </>
      )}

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
