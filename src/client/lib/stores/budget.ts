import { writable, derived, get } from "svelte/store";
import type { BudgetState, Month, Week } from "$shared/types";
import { BUDGET_DATA } from "$shared/budget-data";
import { normalizeState } from "$lib/normalize";
import { postState } from "$lib/api";
import { authState } from "$lib/stores/auth";

export const appState = writable<BudgetState>(normalizeState(structuredClone(BUDGET_DATA.initialState)));
export const currentMonthId = writable<string>(get(appState).currentMonthId);
export const currentWeekId = writable<string | undefined>(
  get(appState).months[get(appState).currentMonthId]?.weeks[0]?.id,
);

export const currentMonth = derived(
  [appState, currentMonthId],
  ([$state, $monthId]): Month | undefined => $state.months[$monthId],
);

export const currentWeek = derived(
  [currentMonth, currentWeekId],
  ([$month, $weekId]): Week | undefined => $month?.weeks.find((w) => w.id === $weekId),
);

// Replace the whole document (used after GET /api/state) and reset the selection
// pointers, mirroring loadState() in app.js.
export function setBudgetState(raw: unknown): void {
  const normalized = normalizeState(raw);
  const selectedWeekId = get(currentWeekId);
  const selectedMonth = normalized.months[normalized.currentMonthId];
  appState.set(normalized);
  currentMonthId.set(normalized.currentMonthId);
  currentWeekId.set(
    selectedMonth?.weeks.some((week) => week.id === selectedWeekId)
      ? selectedWeekId
      : selectedMonth?.weeks[0]?.id,
  );
}

// Persist the current document. Callers that navigate immediately after a
// data-changing action can await this so a reload cannot abort the POST.
export async function saveState(): Promise<void> {
  const auth = get(authState);
  if (auth.authEnabled && !auth.authenticated) return;
  const state = get(appState);
  state.currentMonthId = get(currentMonthId);
  try {
    await postState(state);
  } catch (error) {
    console.error("Unable to save budget data", error);
  }
}
