/**
 * WebWaka Civic — i18n Configuration
 * Multi-language support (English, Yoruba, Igbo, Hausa)
 */

import en from './en.json';
import yo from './yo.json';
import ig from './ig.json';
import ha from './ha.json';

export type Language = 'en' | 'yo' | 'ig' | 'ha';

export interface I18nConfig {
  defaultLanguage: Language;
  supportedLanguages: Language[];
  translations: Record<Language, typeof en>;
}

export const i18nConfig: I18nConfig = {
  defaultLanguage: 'en',
  supportedLanguages: ['en', 'yo', 'ig', 'ha'],
  translations: {
    en,
    yo,
    ig,
    ha,
  },
};

/**
 * Get translation value by key path
 * @example t('elections.title') → "Elections"
 */
export const getTranslation = (
  key: string,
  language: Language = i18nConfig.defaultLanguage
): string => {
  const keys = key.split('.');
  let value: any = i18nConfig.translations[language];

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      // Fallback to English if translation not found
      value = i18nConfig.translations.en;
      for (const fallbackKey of keys) {
        if (value && typeof value === 'object' && fallbackKey in value) {
          value = value[fallbackKey];
        } else {
          return key; // Return key if not found
        }
      }
      break;
    }
  }

  return typeof value === 'string' ? value : key;
};

/**
 * Format currency with language-specific formatting
 */
export const formatCurrency = (amount: number, language: Language = 'en'): string => {
  const currencyMap: Record<Language, { currency: string; locale: string }> = {
    en: { currency: 'NGN', locale: 'en-NG' },
    yo: { currency: 'NGN', locale: 'en-NG' },
    ig: { currency: 'NGN', locale: 'en-NG' },
    ha: { currency: 'NGN', locale: 'en-NG' },
  };

  const { currency, locale } = currencyMap[language];
  return (amount / 100).toLocaleString(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  });
};

/**
 * Format date with language-specific formatting
 */
export const formatDate = (
  timestamp: number,
  language: Language = 'en',
  format: 'short' | 'long' = 'short'
): string => {
  const date = new Date(timestamp);
  const localeMap: Record<Language, string> = {
    en: 'en-US',
    yo: 'en-NG',
    ig: 'en-NG',
    ha: 'en-NG',
  };

  const locale = localeMap[language];
  const options: Intl.DateTimeFormatOptions =
    format === 'short'
      ? { year: 'numeric', month: 'short', day: 'numeric' }
      : { year: 'numeric', month: 'long', day: 'numeric' };

  return date.toLocaleDateString(locale, options);
};

/**
 * Format time with language-specific formatting
 */
export const formatTime = (timestamp: number, language: Language = 'en'): string => {
  const date = new Date(timestamp);
  const localeMap: Record<Language, string> = {
    en: 'en-US',
    yo: 'en-NG',
    ig: 'en-NG',
    ha: 'en-NG',
  };

  const locale = localeMap[language];
  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Get language name in that language
 */
export const getLanguageName = (language: Language): string => {
  const names: Record<Language, string> = {
    en: 'English',
    yo: 'Yorùbá',
    ig: 'Igbo',
    ha: 'Hausa',
  };
  return names[language];
};

/**
 * Get language flag emoji
 */
export const getLanguageFlag = (language: Language): string => {
  const flags: Record<Language, string> = {
    en: '🇬🇧',
    yo: '🇳🇬',
    ig: '🇳🇬',
    ha: '🇳🇬',
  };
  return flags[language];
};

/**
 * Check if language is RTL (right-to-left)
 */
export const isRTL = (language: Language): boolean => {
  return false; // All supported languages are LTR
};

/**
 * Get language direction
 */
export const getLanguageDirection = (language: Language): 'ltr' | 'rtl' => {
  return isRTL(language) ? 'rtl' : 'ltr';
};

export default i18nConfig;
