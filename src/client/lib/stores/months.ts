// Month CRUD ported from app.js (addMonth 5520, deleteCurrentMonth 5557,
// saveMonthSettings 5583). Mutates appState + selection pointers, then persists.
import { get } from "svelte/store";
import { appState, currentMonthId, currentWeekId, saveState } from "$lib/stores/budget";
import { CREDIT_LIMIT } from "$shared/budget-data";
import {
  createWeek,
  DEFAULT_PERIOD_LABELS,
  formatMonthDisplay,
  inferMonthSortKey,
  validMonthSortKey,
  monthDisplayName,
} from "$lib/normalize";
import { suggestedRangesForNewMonth, formatPeriodRangeValue, computeCumulativeFromAvailable } from "$lib/period";
import { orderedMonths } from "$lib/overview";
import { confirmDialog, alertDialog } from "$lib/stores/modal";
import { translate } from "$lib/i18n";
import { getLanguage } from "$lib/stores/i18n";
import type { BudgetState } from "$shared/types";

const t = (key: string, ...args: unknown[]) => translate(getLanguage(), key, ...args);

function monthIdForSortKey(state: BudgetState, sortKey: string): string {
  return orderedMonths(state).find((m) => inferMonthSortKey(m) === sortKey)?.id || "";
}

export function addMonthBySortKey(sortKey: string): boolean {
  if (!validMonthSortKey(sortKey)) return false;
  const state = get(appState);
  const existingId = monthIdForSortKey(state, sortKey);
  if (existingId) {
    currentMonthId.set(existingId);
    currentWeekId.set(state.months[existingId].weeks[0]?.id);
    saveState();
    return true;
  }
  const displayName = formatMonthDisplay(sortKey);
  const id = sortKey;
  const ranges = suggestedRangesForNewMonth(state, sortKey, DEFAULT_PERIOD_LABELS.length);
  appState.update((s) => {
    s.months[id] = {
      id,
      sortKey,
      displayName,
      name: displayName,
      creditLimit: CREDIT_LIMIT,
      weeks: DEFAULT_PERIOD_LABELS.map((period, index) =>
        createWeek({
          period: formatPeriodRangeValue(ranges[index]?.start || "", ranges[index]?.end || "") || period,
          availableBalance: CREDIT_LIMIT,
          unpaidPrevious: null,
        }),
      ),
    };
    return s;
  });
  currentMonthId.set(id);
  currentWeekId.set(get(appState).months[id].weeks[0].id);
  saveState();
  return true;
}

export async function deleteCurrentMonth(): Promise<void> {
  const state = get(appState);
  const monthIds = orderedMonths(state).map((m) => m.id);
  if (monthIds.length <= 1) {
    await alertDialog(t("deleteOnlyMonth"));
    return;
  }
  const cmid = get(currentMonthId);
  const month = state.months[cmid];
  if (!(await confirmDialog(t("deleteConfirm", monthDisplayName(month))))) return;
  const currentIndex = monthIds.indexOf(cmid);
  appState.update((s) => {
    delete s.months[cmid];
    return s;
  });
  const remaining = orderedMonths(get(appState)).map((m) => m.id);
  const next = remaining[Math.max(0, Math.min(currentIndex, remaining.length - 1))];
  currentMonthId.set(next);
  currentWeekId.set(get(appState).months[next].weeks[0]?.id);
  saveState();
}

// Used by the Settings › Data month panel (M6).
export function saveMonthSettings(nextName: string, nextLimit: number | null): void {
  const cmid = get(currentMonthId);
  appState.update((s) => {
    const month = s.months[cmid];
    if (!month) return s;
    const name = nextName.trim();
    if (name) {
      month.displayName = name;
      month.name = name;
    } else {
      month.displayName = formatMonthDisplay(inferMonthSortKey(month));
      month.name = month.displayName;
    }
    if (nextLimit !== null && nextLimit > 0) month.creditLimit = nextLimit;
    month.weeks = month.weeks.map((week) => ({
      ...week,
      cumulativeSpend: computeCumulativeFromAvailable(week, month),
    }));
    return s;
  });
  saveState();
}
