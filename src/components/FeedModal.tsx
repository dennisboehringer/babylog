import { useState } from 'react';
import Modal from './Modal';
import BreastFeedTimer from './BreastFeedTimer';
import BottleFeedModal from './BottleFeedModal';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function FeedModal({ open, onClose, onSaved }: Props) {
  const [mode, setMode] = useState<'choose' | 'breast' | 'bottle'>('choose');

  function handleClose() {
    setMode('choose');
    onClose();
  }

  if (mode === 'breast') {
    return <BreastFeedTimer open={open} onClose={handleClose} onSaved={onSaved} />;
  }

  if (mode === 'bottle') {
    return <BottleFeedModal open={open} onClose={handleClose} onSaved={onSaved} />;
  }

  return (
    <Modal open={open} onClose={handleClose} title="Log Feed">
      <div className="flex gap-3 pb-2">
        <button
          onClick={() => setMode('breast')}
          className="flex-1 flex flex-col items-center justify-center bg-bg-card rounded-2xl py-8 min-h-[120px] active:opacity-70"
        >
          <span className="text-4xl mb-2">🤱</span>
          <span className="text-base font-medium">Breast</span>
          <span className="text-xs text-text-secondary mt-1">With timer</span>
        </button>
        <button
          onClick={() => setMode('bottle')}
          className="flex-1 flex flex-col items-center justify-center bg-bg-card rounded-2xl py-8 min-h-[120px] active:opacity-70"
        >
          <span className="text-4xl mb-2">🍼</span>
          <span className="text-base font-medium">Bottle</span>
          <span className="text-xs text-text-secondary mt-1">Log amount</span>
        </button>
      </div>
    </Modal>
  );
}
