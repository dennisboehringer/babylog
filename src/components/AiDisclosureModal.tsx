import { useLanguage } from '../context/LanguageContext';
import { AiDisclosureContent } from './AiDisclosure';

const ACK_KEY = 'babylog_ai_disclosure_acknowledged';

// Returns true the first time the user is about to use the photo-meal flow.
// Subsequent calls return false. Settings has a "View again" entry that does
// NOT clear the flag — the modal only shows on first photo-flow attempt.
export function shouldShowAiDisclosure(): boolean {
  try {
    return !localStorage.getItem(ACK_KEY);
  } catch {
    return false;
  }
}

export function markAiDisclosureSeen() {
  try { localStorage.setItem(ACK_KEY, '1'); } catch { /* ignore */ }
}

interface Props {
  open: boolean;
  onAcknowledge: () => void;
  onCancel: () => void;
}

// First-use disclosure shown before any photo-meal flow runs. Pediatric Safety
// + AI Lead joint veto: the photo flow does not exist for the user until they
// have seen this once.
export default function AiDisclosureModal({ open, onAcknowledge, onCancel }: Props) {
  const { t } = useLanguage();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative glass-surface rounded-3xl max-w-[400px] w-full max-h-[85vh] flex flex-col border border-border-light animate-scale-in">
        <div className="px-5 pt-5 pb-3 border-b border-border-light">
          <h2 className="text-[18px] font-semibold">{t('ai.disclosure.title')}</h2>
        </div>
        <div className="px-5 py-4 overflow-y-auto scrollable">
          <AiDisclosureContent />
        </div>
        <div className="px-5 py-4 border-t border-border-light flex flex-col gap-2">
          <button
            onClick={onAcknowledge}
            className="w-full py-3.5 rounded-xl bg-accent-blue text-white font-semibold text-base"
          >
            {t('ai.disclosure.continue')}
          </button>
          <button
            onClick={onCancel}
            className="w-full py-3 rounded-xl bg-bg-card text-text-secondary font-medium text-sm"
          >
            {t('btn.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
