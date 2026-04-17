import { useState } from 'react';
import Modal from './Modal';
import BreastFeedTimer from './BreastFeedTimer';
import BottleFeedModal from './BottleFeedModal';
import { useLanguage } from '../context/LanguageContext';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function FeedModal({ open, onClose, onSaved }: Props) {
  const { t } = useLanguage();
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
    <Modal open={open} onClose={handleClose} title={t('modal.logFeed')}>
      <div className="flex gap-3 pb-2">
        <button
          onClick={() => setMode('breast')}
          className="flex-1 flex flex-col items-center justify-center glass-card rounded-2xl py-8 min-h-[120px] active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-2xl bg-accent-blue/10 flex items-center justify-center mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4A9EFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z" />
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
            </svg>
          </div>
          <span className="text-[15px] font-semibold">{t('feed.choose.breast')}</span>
          <span className="text-xs text-text-muted mt-1">{t('feed.choose.breastDesc')}</span>
        </button>
        <button
          onClick={() => setMode('bottle')}
          className="flex-1 flex flex-col items-center justify-center glass-card rounded-2xl py-8 min-h-[120px] active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-2xl bg-accent-amber/10 flex items-center justify-center mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F0B429" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2v6a6 6 0 0012 0V2" />
              <path d="M12 8v13" />
              <path d="M8 21h8" />
            </svg>
          </div>
          <span className="text-[15px] font-semibold">{t('feed.choose.bottle')}</span>
          <span className="text-xs text-text-muted mt-1">{t('feed.choose.bottleDesc')}</span>
        </button>
      </div>
    </Modal>
  );
}
