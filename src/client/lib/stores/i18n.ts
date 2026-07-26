import { writable, derived, get } from "svelte/store";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_KEY,
  detectPreferredLanguage,
  translate,
  categoryLabelFor,
} from "$lib/i18n";
import type { LanguageTag } from "$lib/i18n/dictionary";

function initialLanguage(): LanguageTag {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (stored === "zh" || stored === "en") return stored;
  }
  return detectPreferredLanguage() || DEFAULT_LANGUAGE;
}

export const language = writable<LanguageTag>(initialLanguage());

// Keep <html lang> in sync and persist the choice (mirrors applyLanguage in app.js).
language.subscribe((lang) => {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", lang === "zh" ? "zh-Hant" : "en");
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LANGUAGE_KEY, lang);
  }
});

export function setLanguage(lang: LanguageTag): void {
  language.set(lang);
}

export function getLanguage(): LanguageTag {
  return get(language);
}

// Reactive translate: `$t("key", ...args)`.
export const t = derived(
  language,
  ($language) =>
    (key: string, ...args: unknown[]): string =>
      translate($language, key, ...args),
);

// Reactive category label: `$categoryLabel("medical")`.
export const categoryLabel = derived(
  language,
  ($language) =>
    (key: string): string =>
      categoryLabelFor($language, key),
);
