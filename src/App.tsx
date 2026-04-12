import { useState } from 'react';
import { useApp } from './context/AppContext';
import Onboarding from './components/Onboarding';
import HomeScreen from './components/HomeScreen';
import TrendsScreen from './components/TrendsScreen';
import SettingsScreen from './components/SettingsScreen';
import BottomNav from './components/BottomNav';

type Tab = 'home' | 'trends' | 'settings';

export default function App() {
  const { state, dispatch, activeBaby } = useApp();
  const [tab, setTab] = useState<Tab>('home');
  const [showSwitcher, setShowSwitcher] = useState(false);

  if (!state.loaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-muted">Loading...</div>
      </div>
    );
  }

  if (state.babies.length === 0) {
    return <Onboarding />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-bg-surface border-b border-border relative">
        <button
          onClick={() => state.babies.length > 1 && setShowSwitcher(!showSwitcher)}
          className="flex items-center gap-2 min-h-[36px]"
        >
          <h1 className="text-lg font-semibold">{activeBaby?.name ?? 'BabyLog'}</h1>
          {state.babies.length > 1 && (
            <span className="text-text-muted text-xs">▼</span>
          )}
        </button>
        <div
          className="w-8 h-8 rounded-full"
          style={{ backgroundColor: activeBaby?.themeColor ?? '#388BFD' }}
        />

        {/* Baby switcher dropdown */}
        {showSwitcher && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowSwitcher(false)} />
            <div className="absolute top-full left-4 mt-1 bg-bg-card rounded-xl shadow-lg z-50 min-w-[200px] py-1 border border-border">
              {state.babies.map(baby => (
                <button
                  key={baby.id}
                  onClick={() => {
                    dispatch({ type: 'SET_ACTIVE_BABY', id: baby.id });
                    setShowSwitcher(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 min-h-[48px] ${
                    baby.id === state.activeBabyId ? 'bg-accent-blue/10' : ''
                  }`}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ backgroundColor: baby.themeColor + '33', color: baby.themeColor }}
                  >
                    {baby.name.charAt(0)}
                  </div>
                  <span className="text-sm">{baby.name}</span>
                  {baby.id === state.activeBabyId && (
                    <span className="ml-auto text-accent-blue text-sm">✓</span>
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
