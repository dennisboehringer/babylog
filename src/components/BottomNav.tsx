import { useLanguage } from '../context/LanguageContext';

type TabKey = 'home' | 'trends' | 'reports' | 'chat' | 'settings';

interface Props {
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

export default function BottomNav({ tab, onTabChange }: Props) {
  const { t } = useLanguage();
  const tabs = [
    { key: 'home' as const, label: t('nav.home'), icon: HomeIcon },
    { key: 'trends' as const, label: t('nav.trends'), icon: TrendsIcon },
    { key: 'chat' as const, label: t('nav.chat'), icon: ChatIcon },
    { key: 'reports' as const, label: t('nav.reports'), icon: ReportsIcon },
    { key: 'settings' as const, label: t('nav.settings'), icon: SettingsIcon },
  ];

  return (
    <nav className="glass-surface flex items-center justify-around border-t border-border py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {tabs.map(t => {
        const isActive = tab === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            className={`flex flex-col items-center gap-0.5 px-3 py-2 min-h-[48px] relative transition-colors ${
              isActive ? 'text-accent-blue' : 'text-text-muted'
            }`}
          >
            {isActive && (
              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full bg-accent-blue" />
            )}
            <t.icon active={isActive} />
            <span className={`text-[10px] font-medium ${isActive ? '' : 'opacity-80'}`}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function TrendsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function ReportsIcon({ active }: { active: boolean }) {
  // Document with folded corner — suggests a printable report / one-pager.
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function ChatIcon({ active }: { active: boolean }) {
  // Speech bubble — suggests conversation / Q&A.
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  );
}

function SettingsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}
