// Type contract for the ported i18n dictionaries. The original app.js `i18n` object
// mixes plain strings, parameterized functions, and a nested `categoryLabels` map.
export type TranslationFn = (...args: any[]) => string;

export type TranslationValue = string | TranslationFn | Record<string, string>;

export type Dictionary = Record<string, TranslationValue>;

export type LanguageTag = "en" | "zh";
