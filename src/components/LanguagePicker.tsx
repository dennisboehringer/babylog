import { useLanguage } from '../context/LanguageContext';
import { LANGUAGES, type Language } from '../i18n';

interface Props {
  /** When true, renders a full-screen first-use prompt. When false, renders an inline list for Settings. */
  variant?: 'modal' | 'inline';
  onDone?: () => void;
}

/**
 * Language picker. In `modal` variant it's a full-screen gate shown on first use
 * with a "Continue" button. In `inline` variant it's a compact list of tappable
 * rows suitable for embedding inside Settings.
 */
export default function LanguagePicker({ variant = 'inline', onDone }: Props) {
  const { language, setLanguage, t } = useLanguage();

  if (variant === 'modal') {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-bg-primary max-w-[420px] mx-auto animate-fade-in">
        <div className="flex-1 overflow-y-auto px-6 pt-12 pb-4">
          <div className="w-16 h-16 rounded-2xl bg-accent-blue/15 flex items-center justify-center mb-5 mx-auto">
            <span className="text-3xl">🌐</span>
          </div>
          <h1 className="text-2xl font-bold text-center mb-2">{t('onboarding.language.title')}</h1>
          <p className="text-text-secondary text-center text-sm mb-8 max-w-xs mx-auto">
            {t('onboarding.language.description')}
          </p>

          <div className="space-y-2">
            {LANGUAGES.map(l => (
              <LangRow
                key={l.code}
                code={l.code}
                nativeName={l.nativeName}
                englishName={l.name}
                flag={l.flag}
                selected={language === l.code}
                onSelect={() => setLanguage(l.code)}
              />
            ))}
          </div>
        </div>

        <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => onDone?.()}
            className="w-full py-4 rounded-2xl bg-accent-blue text-white font-semibold text-lg active:opacity-80"
          >
            {t('btn.next')}
          </button>
        </div>
      </div>
    );
  }

  // Inline variant — for Settings
  return (
    <div className="space-y-2">
      {LANGUAGES.map(l => (
        <LangRow
          key={l.code}
          code={l.code}
          nativeName={l.nativeName}
          englishName={l.name}
          flag={l.flag}
          selected={language === l.code}
          onSelect={() => setLanguage(l.code)}
        />
      ))}
    </div>
  );
}

function LangRow({
  code,
  nativeName,
  englishName,
  flag,
  selected,
  onSelect,
}: {
  code: Language;
  nativeName: string;
  englishName: string;
  flag: string;
  selected: boolean;
  onSelect: () => void;
}) {
  void code;
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 py-3 px-4 rounded-xl transition-colors min-h-[48px] ${
        selected ? 'bg-accent-blue/10 border border-accent-blue/30' : 'bg-bg-card border border-transparent active:bg-bg-card-hover'
      }`}
    >
      <span className="text-2xl" aria-hidden="true">{flag}</span>
      <span className="flex-1 text-left">
        <span className="block text-[15px] font-medium text-text-primary">{nativeName}</span>
        {nativeName !== englishName && (
          <span className="block text-xs text-text-muted">{englishName}</span>
        )}
      </span>
      {selected && (
        <svg className="text-accent-blue" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}
