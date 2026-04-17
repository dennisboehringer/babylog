import { useState, useEffect } from 'react';
import { db } from '../db';
import { useSync } from '../context/SyncContext';
import type { FeedEntry } from '../types';
import Modal from './Modal';
import DateTimeInput from './DateTimeInput';
import NotesInput from './NotesInput';
import { useLanguage } from '../context/LanguageContext';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  entry: FeedEntry | null;
}

function secToMin(sec: number | null): string {
  if (sec === null) return '';
  return String(Math.round(sec / 60));
}

export default function EditBreastFeedModal({ open, onClose, onSaved, entry }: Props) {
  const { syncPush } = useSync();
  const { t } = useLanguage();
  const [leftMin, setLeftMin] = useState('');
  const [rightMin, setRightMin] = useState('');
  const [leftOz, setLeftOz] = useState('');
  const [rightOz, setRightOz] = useState('');
  const [lastSide, setLastSide] = useState<'left' | 'right' | null>(null);
  const [timestamp, setTimestamp] = useState(Date.now());
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open || !entry) return;
    setLeftMin(secToMin(entry.leftDurationSec));
    setRightMin(secToMin(entry.rightDurationSec));
    setLeftOz(entry.leftOz !== null ? String(entry.leftOz) : '');
    setRightOz(entry.rightOz !== null ? String(entry.rightOz) : '');
    setLastSide(entry.lastSide);
    setTimestamp(entry.timestamp);
    setNotes(entry.notes ?? '');
  }, [open, entry]);

  async function handleSave() {
    if (!entry) return;
    const leftSec = leftMin ? Math.round(parseFloat(leftMin) * 60) : null;
    const rightSec = rightMin ? Math.round(parseFloat(rightMin) * 60) : null;

    const updated: FeedEntry = {
      ...entry,
      leftDurationSec: leftSec !== null && !isNaN(leftSec) && leftSec > 0 ? leftSec : null,
      rightDurationSec: rightSec !== null && !isNaN(rightSec) && rightSec > 0 ? rightSec : null,
      leftOz: leftOz ? parseFloat(leftOz) : null,
      rightOz: rightOz ? parseFloat(rightOz) : null,
      lastSide,
      timestamp,
      notes: notes || null,
      modifiedAt: Date.now(),
    };

    await db.feeds.put(updated);
    syncPush('feeds', updated.id, updated);
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t('modal.breastFeed.edit')}>
      <div className="flex gap-3 mb-4">
        <div className="flex-1">
          <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">{t('label.leftMinutes')}</label>
          <input
            type="number"
            step="0.1"
            value={leftMin}
            onChange={e => setLeftMin(e.target.value)}
            placeholder="0"
            className="w-full px-3 py-2.5 rounded-xl bg-bg-input text-text-primary outline-none focus:ring-2 focus:ring-accent-blue"
          />
        </div>
        <div className="flex-1">
          <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">{t('label.rightMinutes')}</label>
          <input
            type="number"
            step="0.1"
            value={rightMin}
            onChange={e => setRightMin(e.target.value)}
            placeholder="0"
            className="w-full px-3 py-2.5 rounded-xl bg-bg-input text-text-primary outline-none focus:ring-2 focus:ring-accent-blue"
          />
        </div>
      </div>

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

      <label className="text-text-secondary text-sm mb-2 block">{t('label.lastSide')}</label>
      <div className="flex gap-2 mb-4">
        {([
          { value: null, label: t('option.none') },
          { value: 'left' as const, label: t('option.left') },
          { value: 'right' as const, label: t('option.right') },
        ]).map((s, idx) => (
          <button
            key={idx}
            onClick={() => setLastSide(s.value)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${
              lastSide === s.value ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-secondary'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <DateTimeInput value={timestamp} onChange={setTimestamp} />
      <NotesInput value={notes} onChange={setNotes} />

      <button
        onClick={handleSave}
        className="w-full py-4 rounded-2xl btn-success text-white font-semibold text-lg"
      >
        {t('btn.saveChanges')}
      </button>
    </Modal>
  );
}
