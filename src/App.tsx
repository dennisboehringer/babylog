import { useState } from 'react';
import { useApp } from './context/AppContext';
import Onboarding from './components/Onboarding';
import HomeScreen from './components/HomeScreen';
import TrendsScreen from './components/TrendsScreen';
import SettingsScreen from './components/SettingsScreen';
import BottomNav from './components/BottomNav';
import { getEnvironment } from './sync';

type Tab = 'home' | 'trends' | 'settings';

export default function App() {
  const { state, dispatch, activeBaby } = useApp();
  const [tab, setTab] = useState<Tab>('home');
  const [showSwitcher, setShowSwitcher] = useState(false);

  if (!state.loaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
          <span className="text-text-muted text-sm">Loading...</span>
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
            Development Environment · rooms-dev
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
          <h1 className="text-[17px] font-semibold tracking-tight">{activeBaby?.name ?? 'BabyLog'}</h1>
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
      {tab === 'settings' && <SettingsScreen />}

      {/* Bottom nav */}
      <BottomNav tab={tab} onTabChange={setTab} />
    </div>
  );
}
