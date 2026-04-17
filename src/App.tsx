import { useState, useEffect } from 'react';
import { useApp } from './context/AppContext';
import { useLanguage } from './context/LanguageContext';
import Onboarding from './components/Onboarding';
import HomeScreen from './components/HomeScreen';
import TrendsScreen from './components/TrendsScreen';
import ReportsScreen from './components/ReportsScreen';
import ChatScreen from './components/ChatScreen';
import SettingsScreen from './components/SettingsScreen';
import BottomNav from './components/BottomNav';
import LanguagePicker from './components/LanguagePicker';
import MealReadyToast from './components/MealReadyToast';
import AccuracyFeedbackPrompt from './components/AccuracyFeedbackPrompt';
import { getEnvironment } from './sync';
import { effectiveStage } from './types';

type Tab = 'home' | 'trends' | 'reports' | 'chat' | 'settings';

export default function App() {
  const { state, dispatch, activeBaby } = useApp();
  const { t, hasSelectedLanguage, setLanguage, language } = useLanguage();
  const [tab, setTab] = useState<Tab>('home');
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [languageConfirmed, setLanguageConfirmed] = useState(hasSelectedLanguage);
  const [feedback, setFeedback] = useState<{ refId: string; surface: 'meal' | 'report' } | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ refId: string; surface: 'meal' | 'report' }>).detail;
      if (detail?.refId) setFeedback({ refId: detail.refId, surface: detail.surface });
    };
    window.addEventListener('babylog:feedback-prompt', handler);
    return () => window.removeEventListener('babylog:feedback-prompt', handler);
  }, []);

  // First-use language prompt: shown before Onboarding and before main UI
  // if the user has never picked a language. We pre-fill with the detected
  // language so pressing Next confirms the default.
  if (!languageConfirmed) {
    return (
      <LanguagePicker
        variant="modal"
        onDone={() => {
          setLanguage(language);
          setLanguageConfirmed(true);
        }}
      />
    );
  }

  if (!state.loaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
          <span className="text-text-muted text-sm">{t('app.loading')}</span>
        </div>
      </div>
    );
  }

  if (state.babies.length === 0) {
    return <Onboarding />;
  }

  const isDev = getEnvironment() === 'development';

  return (
    <div className="flex flex-col h-full">
      {/* Dev environment banner */}
      {isDev && (
        <div className="bg-accent-amber/15 border-b border-accent-amber/30 px-3 py-1 text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-accent-amber">
            {t('app.devBanner')}
          </span>
        </div>
      )}

      {/* Header */}
      <header className="glass-header flex items-center justify-between px-5 py-3 border-b border-border relative z-10">
        <button
          onClick={() => state.babies.length > 1 && setShowSwitcher(!showSwitcher)}
          className="flex items-center gap-2.5 min-h-[36px]"
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
            style={{
              backgroundColor: (activeBaby?.themeColor ?? '#4A9EFF') + '20',
              color: activeBaby?.themeColor ?? '#4A9EFF',
            }}
          >
            {activeBaby?.name?.charAt(0)?.toUpperCase() ?? 'B'}
          </div>
          <h1 className="text-[17px] font-semibold tracking-tight">{activeBaby?.name ?? t('app.name')}</h1>
          {activeBaby && <StageBadge stage={effectiveStage(activeBaby)} t={t} />}
          {state.babies.length > 1 && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-text-muted ml-0.5">
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {/* Baby switcher dropdown */}
        {showSwitcher && (
          <>
            <div className="fixed inset-0 z-40 animate-fade-in" onClick={() => setShowSwitcher(false)} />
            <div className="absolute top-full left-4 mt-2 bg-bg-card rounded-2xl shadow-2xl z-50 min-w-[220px] py-2 border border-border-light animate-scale-in">
              {state.babies.map(baby => (
                <button
                  key={baby.id}
                  onClick={() => {
                    dispatch({ type: 'SET_ACTIVE_BABY', id: baby.id });
                    setShowSwitcher(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 min-h-[48px] transition-colors ${
                    baby.id === state.activeBabyId ? 'bg-accent-blue/8' : 'active:bg-bg-card-hover'
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ backgroundColor: baby.themeColor + '20', color: baby.themeColor }}
                  >
                    {baby.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[15px] font-medium">{baby.name}</span>
                  {baby.id === state.activeBabyId && (
                    <svg className="ml-auto text-accent-blue" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </header>

      {/* Content */}
      {tab === 'home' && <HomeScreen />}
      {tab === 'trends' && <TrendsScreen />}
      {tab === 'chat' && <ChatScreen />}
      {tab === 'reports' && <ReportsScreen />}
      {tab === 'settings' && <SettingsScreen />}

      {/* Background meal-photo analysis toast — sits above the bottom nav */}
      <MealReadyToast />

      {/* Accuracy feedback prompt (meal: every 5th, report: every 3rd) */}
      <AccuracyFeedbackPrompt
        refId={feedback?.refId ?? null}
        surface={feedback?.surface ?? 'meal'}
        onClose={() => setFeedback(null)}
      />

      {/* Bottom nav */}
      <BottomNav tab={tab} onTabChange={setTab} />
    </div>
  );
}

// Caretaker Systems veto: caregivers must always know which child + stage
// they're logging against. Compact chip next to the active baby's name.
function StageBadge({
  stage, t,
}: {
  stage: 'newborn' | 'weaning' | 'toddler' | 'preschool';
  t: (k: string) => string;
}) {
  const colors: Record<string, string> = {
    newborn:   'bg-accent-blue/12 text-accent-blue',
    weaning:   'bg-accent-amber/12 text-accent-amber',
    toddler:   'bg-accent-green/12 text-accent-green',
    preschool: 'bg-accent-purple/12 text-accent-purple',
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-[12px] font-semibold ${colors[stage]}`}>
      {t(`stage.badge.${stage}`)}
    </span>
  );
}
