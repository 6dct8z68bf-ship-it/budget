import { writable, get } from "svelte/store";

export type Theme = "light" | "dark";
export const THEME_KEY = "family-budget-theme";

export function detectPreferredTheme(): Theme {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  }
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

// Apply as early as possible to avoid a flash of the wrong theme (mirrors the
// applyThemeEarly IIFE in app.js). Safe to call before any component mounts.
export function applyThemeEarly(): void {
  if (typeof document === "undefined") return;
  const theme = detectPreferredTheme();
  document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
}

export const theme = writable<Theme>(detectPreferredTheme());

// Keep <html data-theme> in sync + persist whenever the store changes.
theme.subscribe((value) => {
  const resolved: Theme = value === "dark" ? "dark" : "light";
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", resolved);
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(THEME_KEY, resolved);
  }
});

export function toggleTheme(): void {
  theme.update((current) => (current === "dark" ? "light" : "dark"));
}

export function isDarkMode(): boolean {
  return get(theme) === "dark";
}
