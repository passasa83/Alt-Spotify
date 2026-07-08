import en, { type TranslationKey } from './en';
import fr from './fr';

export type Locale = 'en' | 'fr';

const translations: Record<Locale, Record<TranslationKey, string>> = { en, fr };

const STORAGE_KEY = 'alt-spotify-locale';

function getBrowserLocale(): Locale {
  const lang = navigator.language.split('-')[0];
  return lang === 'fr' ? 'fr' : 'en';
}

function getStoredLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'fr') return stored;
  } catch {}
  return null;
}

export function getLocale(): Locale {
  return getStoredLocale() || getBrowserLocale();
}

export function setLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {}
  document.documentElement.lang = locale;
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const locale = getLocale();
  let text = translations[locale][key] || translations.en[key] || key;

  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    });
  }

  return text;
}

export function initLocale(): void {
  const locale = getLocale();
  document.documentElement.lang = locale;
}
