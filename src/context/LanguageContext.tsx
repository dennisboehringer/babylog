import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { detectLanguage, hasStoredLanguage, storeLanguage, translate, type Language } from '../i18n';

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  hasSelectedLanguage: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
  hasSelectedLanguage: false,
  t: (key: string) => key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => detectLanguage());
  const [hasSelectedLanguage, setHasSelectedLanguage] = useState<boolean>(() => hasStoredLanguage());

  // Keep <html lang="..."> in sync for accessibility + browser hints.
  useEffect(() => {
    try { document.documentElement.lang = language; } catch { /* noop */ }
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    storeLanguage(lang);
    setLanguageState(lang);
    setHasSelectedLanguage(true);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(language, key, params),
    [language],
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, hasSelectedLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
