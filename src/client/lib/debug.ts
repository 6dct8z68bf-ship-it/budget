// Deliberate, typed debug/diagnostics surface for the Playwright e2e suite. The reverted
// React migration exposed internals via ad-hoc bridges that broke; this is the single
// sanctioned replacement. In addition to window.__budgetDebug, we expose the same
// read-only ambient globals the vanilla build had (appState, currentMonthId,
// currentMonth(), monthlyTrendRows(), monthlyStatusKind(), trendPoints, chartBars,
// CATEGORY_CHART_COLORS) so existing page.evaluate() diagnostics keep working unchanged.
import { get } from "svelte/store";
import { appState, currentMonthId, currentMonth } from "$lib/stores/budget";
import { monthlyTrendRows, monthlyStatusKind, type StatusKind } from "$lib/overview";
import { CATEGORY_CHART_COLORS } from "$lib/charts/palette";
import type { Month } from "$shared/types";

let barsProvider: () => unknown[] = () => [];
let pointsProvider: () => unknown[] = () => [];
let decisionKindProvider: () => StatusKind = () => "empty";

export function registerWeeklyChart(getBars: () => unknown[]): void {
  barsProvider = getBars;
}
export function registerTrendChart(getPoints: () => unknown[]): void {
  pointsProvider = getPoints;
}
// The Overview decision card publishes the current month's status kind (mirrors the
// vanilla setOverviewStatus writing month._barStatusKind).
export function registerDecisionKind(getKind: () => StatusKind): void {
  decisionKindProvider = getKind;
}

function currentMonthWithStatus(): (Month & { _barStatusKind?: StatusKind }) | undefined {
  const month = get(currentMonth);
  if (!month) return undefined;
  return { ...month, _barStatusKind: decisionKindProvider() };
}

function currentImportPeriodRange(): { start: string; end: string } {
  const start = (document.getElementById("periodStartInput") as HTMLInputElement | null)?.value || "";
  const end = (document.getElementById("periodEndInput") as HTMLInputElement | null)?.value || "";
  return { start, end };
}

function statusKindFor(monthOrId: string | Month): string {
  const state = get(appState);
  const month = typeof monthOrId === "string" ? state.months[monthOrId] : monthOrId;
  return month ? monthlyStatusKind(month, state) : "empty";
}

export function installDebugApi(): void {
  const api = {
    get appState() {
      return get(appState);
    },
    get currentMonthId() {
      return get(currentMonthId);
    },
    currentMonth: currentMonthWithStatus,
    monthlyTrendRows: () => monthlyTrendRows(get(appState)),
    monthlyStatusKind: statusKindFor,
    get trendPoints() {
      return pointsProvider();
    },
    get chartBars() {
      return barsProvider();
    },
    currentImportPeriodRange,
    CATEGORY_CHART_COLORS,
  };
  const w = window as unknown as Record<string, unknown>;
  Object.defineProperty(w, "__budgetDebug", { configurable: true, value: api });
  // Ambient globals for the e2e suite's bare-identifier diagnostics.
  Object.defineProperties(w, {
    appState: { configurable: true, get: () => get(appState) },
    currentMonthId: { configurable: true, get: () => get(currentMonthId) },
    trendPoints: { configurable: true, get: () => pointsProvider() },
    chartBars: { configurable: true, get: () => barsProvider() },
    currentMonth: { configurable: true, value: currentMonthWithStatus },
    monthlyTrendRows: { configurable: true, value: () => monthlyTrendRows(get(appState)) },
    monthlyStatusKind: { configurable: true, value: statusKindFor },
    currentImportPeriodRange: { configurable: true, value: currentImportPeriodRange },
    CATEGORY_CHART_COLORS: { configurable: true, value: CATEGORY_CHART_COLORS },
  });
}
