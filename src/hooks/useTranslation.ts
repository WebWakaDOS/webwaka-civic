/**
 * WebWaka Civic — useTranslation Hook
 * React hook for accessing translations and language settings
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Language,
  getTranslation,
  formatCurrency,
  formatDate,
  formatTime,
  getLanguageName,
  getLanguageFlag,
  getLanguageDirection,
  i18nConfig,
} from '../i18n';

interface UseTranslationReturn {
  t: (key: string) => string;
  language: Language;
  setLanguage: (lang: Language) => void;
  formatCurrency: (amount: number) => string;
  formatDate: (timestamp: number, format?: 'short' | 'long') => string;
  formatTime: (timestamp: number) => string;
  getLanguageName: (lang?: Language) => string;
  getLanguageFlag: (lang?: Language) => string;
  getLanguageDirection: (lang?: Language) => 'ltr' | 'rtl';
  supportedLanguages: Language[];
}

/**
 * useTranslation Hook
 * Provides translation and localization utilities
 *
 * @example
 * const { t, language, setLanguage } = useTranslation();
 * return <h1>{t('elections.title')}</h1>;
 */
export const useTranslation = (): UseTranslationReturn => {
  const [language, setLanguageState] = useState<Language>(() => {
    // Try to get language from localStorage
    const stored = localStorage.getItem('language');
    if (stored && i18nConfig.supportedLanguages.includes(stored as Language)) {
      return stored as Language;
    }

    // Try to detect browser language
    const browserLang = navigator.language.split('-')[0];
    if (i18nConfig.supportedLanguages.includes(browserLang as Language)) {
      return browserLang as Language;
    }

    return i18nConfig.defaultLanguage;
  });

  // Save language preference to localStorage
  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = getLanguageDirection(lang);
  }, []);

  // Set initial document language
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = getLanguageDirection(language);
  }, [language]);

  // Translation function
  const t = useCallback(
    (key: string): string => {
      return getTranslation(key, language);
    },
    [language]
  );

  // Currency formatting
  const formatCurrencyLocalized = useCallback(
    (amount: number): string => {
      return formatCurrency(amount, language);
    },
    [language]
  );

  // Date formatting
  const formatDateLocalized = useCallback(
    (timestamp: number, format: 'short' | 'long' = 'short'): string => {
      return formatDate(timestamp, language, format);
    },
    [language]
  );

  // Time formatting
  const formatTimeLocalized = useCallback(
    (timestamp: number): string => {
      return formatTime(timestamp, language);
    },
    [language]
  );

  // Get language name
  const getLanguageNameLocalized = useCallback(
    (lang?: Language): string => {
      return getLanguageName(lang || language);
    },
    [language]
  );

  // Get language flag
  const getLanguageFlagLocalized = useCallback(
    (lang?: Language): string => {
      return getLanguageFlag(lang || language);
    },
    [language]
  );

  // Get language direction
  const getLanguageDirectionLocalized = useCallback(
    (lang?: Language): 'ltr' | 'rtl' => {
      return getLanguageDirection(lang || language);
    },
    [language]
  );

  return {
    t,
    language,
    setLanguage,
    formatCurrency: formatCurrencyLocalized,
    formatDate: formatDateLocalized,
    formatTime: formatTimeLocalized,
    getLanguageName: getLanguageNameLocalized,
    getLanguageFlag: getLanguageFlagLocalized,
    getLanguageDirection: getLanguageDirectionLocalized,
    supportedLanguages: i18nConfig.supportedLanguages,
  };
};

export default useTranslation;
