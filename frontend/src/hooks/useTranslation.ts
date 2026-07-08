import { useState, useCallback } from 'react';
import { t as translate, getLocale, setLocale, type Locale } from '@/i18n';

export function useTranslation() {
  const [locale, setLocaleState] = useState<Locale>(getLocale());

  const setLocaleAction = useCallback((newLocale: Locale) => {
    setLocale(newLocale);
    setLocaleState(newLocale);
  }, []);

  const t = useCallback(
    (key: Parameters<typeof translate>[0], params?: Record<string, string | number>) => {
      return translate(key, params);
    },
    [locale]
  );

  return { t, locale, setLocale: setLocaleAction };
}
