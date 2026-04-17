import { translations, type TranslationDict } from './translations';

export type Language = 'en' | 'es' | 'zh' | 'hi' | 'fr' | 'de';

export const LANGUAGES: { code: Language; name: string; nativeName: string; flag: string }[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
];

const STORAGE_KEY = 'babylog_language';

export function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LANGUAGES.some(l => l.code === stored)) return stored as Language;
  } catch { /* ignore */ }

  const nav = (navigator.language || '').toLowerCase();
  if (nav.startsWith('es')) return 'es';
  if (nav.startsWith('de')) return 'de';
  if (nav.startsWith('fr')) return 'fr';
  if (nav.startsWith('zh')) return 'zh';
  if (nav.startsWith('hi')) return 'hi';
  return 'en';
}

export function hasStoredLanguage(): boolean {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch { return false; }
}

export function storeLanguage(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch { /* ignore */ }
}

/**
 * Look up a translation key in the chosen language, with English fallback,
 * with final fallback to the raw key. Interpolates {name} placeholders.
 */
export function translate(
  lang: Language,
  key: string,
  params?: Record<string, string | number>,
): string {
  const dict = translations[lang] as TranslationDict;
  const fallback = translations.en as TranslationDict;
  let value = (dict[key] ?? fallback[key] ?? key) as string;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replaceAll(`{${k}}`, String(v));
    }
  }
  return value;
}

export { translations };
