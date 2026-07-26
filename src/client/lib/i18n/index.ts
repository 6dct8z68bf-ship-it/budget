import { zh } from "./zh";
import { en } from "./en";
import type { Dictionary, LanguageTag, TranslationFn } from "./dictionary";

export const dictionaries: Record<LanguageTag, Dictionary> = { zh, en };

export const DEFAULT_LANGUAGE: LanguageTag = "en";
export const LANGUAGE_KEY = "family-budget-language";

export function isTraditionalChineseLanguageTag(tag: string): boolean {
  const normalized = String(tag || "").toLowerCase();
  return (
    normalized.startsWith("zh-hant") ||
    normalized.startsWith("zh-tw") ||
    normalized.startsWith("zh-hk") ||
    normalized.startsWith("zh-mo")
  );
}

export function detectPreferredLanguage(): LanguageTag {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const candidates =
    nav && Array.isArray(nav.languages) && nav.languages.length
      ? nav.languages
      : [nav?.language || ""];
  return candidates.some(isTraditionalChineseLanguageTag) ? "zh" : DEFAULT_LANGUAGE;
}

// Mirrors app.js t(): current-language value, then zh fallback, then the key itself.
// Function-valued entries are invoked with the passed args.
export function translate(lang: LanguageTag, key: string, ...args: unknown[]): string {
  const raw = dictionaries[lang]?.[key] ?? dictionaries.zh[key] ?? key;
  if (typeof raw === "function") {
    return (raw as TranslationFn)(...args);
  }
  return raw as string;
}

export function categoryLabelFor(lang: LanguageTag, key: string): string {
  const labels = (dictionaries[lang]?.categoryLabels ?? dictionaries.zh.categoryLabels) as
    | Record<string, string>
    | undefined;
  return labels?.[key] ?? key;
}
