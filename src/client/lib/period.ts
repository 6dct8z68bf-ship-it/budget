// Period-range + timeline helpers ported from app.js (1472-1507, 2379-2519, and
// computeCumulativeFromAvailable). Pure functions operating on Month/Week + state.
import type { BudgetState, Month, Week } from "$shared/types";
import type { PeriodRange } from "$lib/format";
import { numberOrZero, numberOrNull, roundCurrency, toIsoDate, parseIsoDateParts, parsePeriodRange } from "$lib/format";
import {
  DEFAULT_PERIOD_LABELS,
  createWeek,
  parseFlexiblePeriodRange,
  inferMonthSortKey,
  validMonthSortKey,
  formatMonthDisplay,
  monthDisplayName,
} from "$lib/normalize";
import { orderedMonths } from "$lib/overview";

// --- range primitives (app.js 1472-1507) ---
export function isCompletePeriodRange(range: PeriodRange | null | undefined): boolean {
  return !!(range?.start && range?.end);
}

function utcDateFromIso(value: string): Date | null {
  const parts = parseIsoDateParts(value);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

export function isOrderedPeriodRange(range: PeriodRange | null | undefined): boolean {
  if (!isCompletePeriodRange(range)) return false;
  const start = utcDateFromIso(range!.start);
  const end = utcDateFromIso(range!.end);
  return !!(start && end && start.getTime() <= end.getTime());
}

export function addDaysToIsoDate(value: string, days: number): string {
  const date = utcDateFromIso(value);
  if (!date || !Number.isFinite(days)) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function inclusivePeriodDurationDays(range: PeriodRange): number {
  if (!isOrderedPeriodRange(range)) return 0;
  const start = utcDateFromIso(range.start)!;
  const end = utcDateFromIso(range.end)!;
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

export function formatPeriodRangeValue(start: string, end: string): string {
  if (start && end) return `${start} - ${end}`;
  return start || end || "";
}

// month period ranges (app.js monthDateRanges 4761) — used by import date checks.
export function monthDateRanges(month: Month): PeriodRange[] {
  const ranges: PeriodRange[] = [];
  month.weeks.forEach((week) => {
    const range = parseFlexiblePeriodRange(week.period, monthDisplayName(month));
    if (range.start && range.end) ranges.push(range);
  });
  return ranges;
}

// --- cumulative (app.js computeCumulativeFromAvailable) ---
export function computeCumulativeFromAvailable(
  week: Pick<Week, "availableBalance" | "unpaidPrevious"> | null | undefined,
  month: Month,
): number | null {
  const available = numberOrNull(week?.availableBalance);
  if (available === null) return null;
  const unpaidPrevious = numberOrZero(week?.unpaidPrevious);
  return Math.max(0, roundCurrency(month.creditLimit - available - unpaidPrevious));
}

// --- default / editing ranges (app.js 2379-2409) ---
export function defaultPeriodRangeForMonth(month: Month, weekIndex: number, totalWeeks: number): PeriodRange {
  const sortKey = inferMonthSortKey(month);
  if (!validMonthSortKey(sortKey)) return { start: "", end: "" };
  const [yearText, monthText] = sortKey.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const startDay = Math.min(lastDay, weekIndex * 7 + 1);
  const endDay = weekIndex >= totalWeeks - 1 ? lastDay : Math.min(lastDay, startDay + 6);
  return { start: toIsoDate(year, monthNumber, startDay), end: toIsoDate(year, monthNumber, endDay) };
}

export function editingRangeForWeek(month: Month, week: Week | undefined, weekIndex: number): PeriodRange {
  const parsed = parseFlexiblePeriodRange(week?.period || "", monthDisplayName(month));
  if (parsed.start || parsed.end) return parsed;
  return defaultPeriodRangeForMonth(month, weekIndex, month.weeks.length);
}

export function weekRangeForIndex(month: Month, weekIndex: number): PeriodRange {
  return editingRangeForWeek(month, month?.weeks?.[weekIndex], weekIndex);
}

function defaultDurationForWeek(month: Month, weekIndex: number): number {
  const existing = inclusivePeriodDurationDays(weekRangeForIndex(month, weekIndex));
  if (existing > 0) return existing;
  const fallback = defaultPeriodRangeForMonth(month, weekIndex, month?.weeks?.length || DEFAULT_PERIOD_LABELS.length);
  return inclusivePeriodDurationDays(fallback) || 7;
}

function previousExistingMonth(state: BudgetState, sortKey: string): Month | null {
  const months = orderedMonths(state).filter((month) => inferMonthSortKey(month) < sortKey);
  return months[months.length - 1] || null;
}

export function suggestedRangesForNewMonth(
  state: BudgetState,
  sortKey: string,
  totalWeeks: number = DEFAULT_PERIOD_LABELS.length,
): PeriodRange[] {
  const draftMonth = {
    id: sortKey,
    sortKey,
    displayName: formatMonthDisplay(sortKey),
    name: formatMonthDisplay(sortKey),
    creditLimit: 0,
    weeks: Array.from({ length: totalWeeks }, (_, index) =>
      createWeek({ period: DEFAULT_PERIOD_LABELS[index] || `Period ${index + 1}` }),
    ),
  } as Month;
  const fallbackRanges = Array.from({ length: totalWeeks }, (_, index) =>
    defaultPeriodRangeForMonth(draftMonth, index, totalWeeks),
  );
  const previousMonth = previousExistingMonth(state, sortKey);
  if (!previousMonth) return fallbackRanges;
  const previousLastRange = weekRangeForIndex(previousMonth, previousMonth.weeks.length - 1);
  if (!isOrderedPeriodRange(previousLastRange)) return fallbackRanges;
  let nextStart = addDaysToIsoDate(previousLastRange.end, 1);
  if (!nextStart) return fallbackRanges;
  return Array.from({ length: totalWeeks }, (_, index) => {
    const duration = defaultDurationForWeek(previousMonth, index);
    const start = nextStart;
    const end = addDaysToIsoDate(start, duration - 1);
    nextStart = addDaysToIsoDate(end, 1);
    return { start, end };
  });
}

// --- timeline safety (app.js 2442-2519) ---
export function weekHasProtectedData(week: Week | undefined, month: Month | undefined): boolean {
  if (!week) return false;
  const hasCategoryValues = Object.values(week.categoryValues || {}).some((value) => numberOrZero(value) !== 0);
  return (
    numberOrNull(week.unpaidPrevious) !== null ||
    numberOrNull(week.cumulativeSpend) !== null ||
    numberOrZero(week.availableBalance) !== numberOrZero(month?.creditLimit) ||
    hasCategoryValues ||
    !!week.notes?.trim()
  );
}

export interface TimelineDiagnostic {
  hasIssues: boolean;
  issues: { type: "missing" | "overlap" | "gap"; weekId: string; index: number }[];
}

export function timelineDiagnostic(month: Month, overrideRanges: Map<string, PeriodRange> = new Map()): TimelineDiagnostic {
  const issues: TimelineDiagnostic["issues"] = [];
  let previousRange: PeriodRange | null = null;
  month.weeks.forEach((week, index) => {
    const range = overrideRanges.get(week.id) || weekRangeForIndex(month, index);
    if (!isCompletePeriodRange(range) || !isOrderedPeriodRange(range)) {
      issues.push({ type: "missing", weekId: week.id, index });
      previousRange = isOrderedPeriodRange(range) ? range : previousRange;
      return;
    }
    if (previousRange) {
      const expectedStart = addDaysToIsoDate(previousRange.end, 1);
      if (range.start < expectedStart) issues.push({ type: "overlap", weekId: week.id, index });
      else if (range.start > expectedStart) issues.push({ type: "gap", weekId: week.id, index });
    }
    previousRange = range;
  });
  return { hasIssues: issues.length > 0, issues };
}

export function applySafePeriodDateCascade(month: Month, startIndex: number): void {
  const editedWeek = month?.weeks?.[startIndex];
  if (!editedWeek) return;
  const editedRange = parsePeriodRange(editedWeek.period);
  if (!isOrderedPeriodRange(editedRange)) return;
  let nextStart = addDaysToIsoDate(editedRange.end, 1);
  for (let index = startIndex + 1; index < month.weeks.length; index += 1) {
    const week = month.weeks[index];
    if (weekHasProtectedData(week, month)) break;
    const duration = defaultDurationForWeek(month, index);
    const start = nextStart;
    const end = addDaysToIsoDate(start, duration - 1);
    if (!start || !end) break;
    week.period = formatPeriodRangeValue(start, end);
    nextStart = addDaysToIsoDate(end, 1);
  }
}
