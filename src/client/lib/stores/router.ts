// History-API router ported from app.js (2011-2191). Kept lean and reactive: it owns
// the route stores and URL sync; view components react to the stores (chart redraws,
// import-textarea clearing, etc.) instead of the router touching the DOM directly.
import { writable, derived, get } from "svelte/store";
import { authState, accountState, APP_ROUTE_PREFIX } from "$lib/stores/auth";

export type ViewName = "overview" | "entry" | "history" | "settings";
export type SettingsSection = "profile" | "data" | "workspace" | "security" | "admin";
export type HistorySection = "overview" | "transactions";

export const VIEW_ROUTE_CONFIG: Record<ViewName, { slug: string }> = {
  overview: { slug: "overview" },
  entry: { slug: "weekly-entry" },
  history: { slug: "history" },
  settings: { slug: "settings" },
};

export const SETTINGS_SECTION_CONFIG: Record<SettingsSection, { slug: string }> = {
  profile: { slug: "profile" },
  data: { slug: "data" },
  workspace: { slug: "workspace" },
  security: { slug: "security" },
  admin: { slug: "admin" },
};

export const currentView = writable<ViewName>("overview");
export const currentSettingsSection = writable<SettingsSection>("data");
export const currentHistorySection = writable<HistorySection>("overview");

export function normalizeView(view: string): ViewName {
  return (VIEW_ROUTE_CONFIG as Record<string, unknown>)[view] ? (view as ViewName) : "overview";
}

export function normalizeSettingsSection(section: string): SettingsSection {
  return (SETTINGS_SECTION_CONFIG as Record<string, unknown>)[section] ? (section as SettingsSection) : "data";
}

export function normalizeHistorySection(section: string): HistorySection {
  return section === "transactions" ? "transactions" : "overview";
}

// availableSettingsSections() from app.js:2015 — reactive to auth + account state.
export const availableSettingsSections = derived(
  [authState, accountState],
  ([$auth, $account]): SettingsSection[] => {
    const available: SettingsSection[] = ["data"];
    if (Array.isArray($account?.workspaces) && $account.workspaces.length > 0) available.push("workspace");
    if ($account?.account || $account?.user) available.push("security");
    if ($account?.account?.isDefaultUser === true) available.push("admin");
    return Array.from(new Set(available));
  },
);

export function ensureValidSettingsSection(section: string = get(currentSettingsSection)): SettingsSection {
  const available = get(availableSettingsSections);
  const normalized = normalizeSettingsSection(section);
  if (normalized === "profile") return available.includes("security") ? "security" : available[0] || "data";
  return available.includes(normalized) ? normalized : available[0] || "data";
}

export interface ParsedRoute {
  view: ViewName;
  settingsSection: SettingsSection;
  canonicalPath: string;
}

export function parseRoute(pathname: string = window.location.pathname): ParsedRoute {
  const normalizedPath = String(pathname || "").replace(/\/+$/, "") || APP_ROUTE_PREFIX;
  if (!normalizedPath.startsWith(APP_ROUTE_PREFIX)) {
    return {
      view: "overview",
      settingsSection: "data",
      canonicalPath: `${APP_ROUTE_PREFIX}/${VIEW_ROUTE_CONFIG.overview.slug}`,
    };
  }
  const suffix = normalizedPath.slice(APP_ROUTE_PREFIX.length).replace(/^\/+/, "");
  const [viewSlug = "", settingsSlug = ""] = suffix ? suffix.split("/") : [];
  const view =
    (Object.entries(VIEW_ROUTE_CONFIG).find(([, config]) => config.slug === viewSlug)?.[0] as ViewName) ||
    "overview";
  const settingsSection =
    view === "settings"
      ? ensureValidSettingsSection(
          (Object.entries(SETTINGS_SECTION_CONFIG).find(([, config]) => config.slug === settingsSlug)?.[0] as
            | SettingsSection
            | undefined) || "data",
        )
      : get(currentSettingsSection);
  return { view, settingsSection, canonicalPath: buildPathForRoute(view, settingsSection) };
}

export function buildPathForRoute(
  view: ViewName = get(currentView),
  settingsSection: SettingsSection = get(currentSettingsSection),
): string {
  const normalizedView = normalizeView(view);
  if (normalizedView === "settings") {
    const normalizedSection = ensureValidSettingsSection(settingsSection);
    return `${APP_ROUTE_PREFIX}/${VIEW_ROUTE_CONFIG.settings.slug}/${SETTINGS_SECTION_CONFIG[normalizedSection].slug}`;
  }
  return `${APP_ROUTE_PREFIX}/${VIEW_ROUTE_CONFIG[normalizedView].slug}`;
}

export type HistoryMode = "push" | "replace" | "none";

export function syncHistoryForRoute(view: ViewName, settingsSection: SettingsSection, mode: HistoryMode = "push"): void {
  if (mode === "none") return;
  const nextPath = buildPathForRoute(view, settingsSection);
  const currentPath = `${window.location.pathname}${window.location.search || ""}`;
  if (currentPath === nextPath) return;
  const method = mode === "replace" ? "replaceState" : "pushState";
  window.history[method]({ view, settingsSection }, "", nextPath);
}

export function switchView(
  view: string,
  { history = "push", settingsSection }: { history?: HistoryMode; settingsSection?: string } = {},
): void {
  const nextView = normalizeView(view);
  const nextSection = ensureValidSettingsSection(settingsSection ?? get(currentSettingsSection));
  currentView.set(nextView);
  currentSettingsSection.set(nextSection);
  syncHistoryForRoute(nextView, nextSection, history);
}

export function switchSettingsSection(section: string, { history = "push" }: { history?: HistoryMode } = {}): void {
  const next = ensureValidSettingsSection(section);
  currentSettingsSection.set(next);
  syncHistoryForRoute("settings", next, history);
}

export function switchHistorySection(section: string): void {
  currentHistorySection.set(normalizeHistorySection(section));
}

export function applyRouteFromLocation({ history = "replace" }: { history?: HistoryMode } = {}): void {
  const route = parseRoute();
  switchView(route.view, { history, settingsSection: route.settingsSection });
}

export function initRouter(): void {
  window.addEventListener("popstate", () => {
    const route = parseRoute();
    switchView(route.view, { history: "none", settingsSection: route.settingsSection });
  });
}
