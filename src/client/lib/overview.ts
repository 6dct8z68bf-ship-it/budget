// Pure overview/trend computations ported from app.js (4229 computedWeeks, 4057-4212
// decision + drivers, 6066-6099 trend rows/status). No i18n here — components localize
// labels reactively. Driver functions return category keys, not localized labels.
import type { BudgetState, Category, Month, Week } from "$shared/types";
import { categories, CREDIT_LIMIT } from "$shared/budget-data";
import { numberOrZero, numberOrNull, roundCurrency, formatMoney, formatPercent } from "$lib/format";
import { categoryDefinitions, compareMonths, monthDisplayName, inferMonthSortKey } from "$lib/normalize";

export interface WeekComputed {
  week: Week;
  cumulativeSpend: number;
  weeklyTotal: number;
  nonGrocery: number;
  grocery: number;
  incidentals: number;
}

export interface Driver {
  categoryKey: string; // a category key, or "grocery"
  amount: number;
}

export interface MonthComparison {
  amount: number;
  ratio: number;
  scope: "full" | "sameProgress";
}

export interface TrendRow {
  id: string;
  name: string;
  nonGrocery: number;
  grocery: number;
  incidentals: number;
  total: number;
  creditLimit: number;
  sortKey: string;
}

export type StatusKind = "empty" | "good" | "watch" | "over";

export function sumNonGrocery(week: Week, state?: BudgetState): number {
  return categoryDefinitions(state?.categorySettings, { includeArchived: true })
    .filter((category) => category.type === "nonGrocery")
    .reduce((sum, category) => sum + numberOrZero(week.categoryValues?.[category.key]), 0);
}

function sumIncidentals(week: Week, state?: BudgetState): number {
  return categoryDefinitions(state?.categorySettings, { includeArchived: true })
    .filter((category) => category.type === "incidental")
    .reduce((sum, category) => sum + numberOrZero(week.categoryValues?.[category.key]), 0);
}

export function computedWeeks(month: Month, state?: BudgetState): WeekComputed[] {
  return month.weeks.map((week, index) => {
    const previous = month.weeks[index - 1];
    const previousCumulative = numberOrZero(previous?.cumulativeSpend);
    const cumulativeSpend = numberOrNull(week.cumulativeSpend);
    const weeklyTotal =
      cumulativeSpend === null ? 0 : index === 0 ? cumulativeSpend : cumulativeSpend - previousCumulative;
    const nonGrocery = sumNonGrocery(week, state);
    const incidentals = sumIncidentals(week, state);
    const grocery = weeklyTotal === 0 ? 0 : weeklyTotal - nonGrocery - incidentals;
    return {
      week,
      cumulativeSpend: cumulativeSpend || 0,
      weeklyTotal: roundCurrency(weeklyTotal),
      nonGrocery: roundCurrency(nonGrocery),
      grocery: roundCurrency(grocery),
      incidentals: roundCurrency(incidentals),
    };
  });
}

export function orderedMonths(state: BudgetState): Month[] {
  return Object.values(state.months).slice().sort(compareMonths);
}

export function previousMonthFor(state: BudgetState, month: Month): Month | null {
  const months = orderedMonths(state);
  const currentIndex = months.findIndex((item) => item.id === month.id);
  return currentIndex > 0 ? months[currentIndex - 1] : null;
}

export function monthProgressComparison(
  state: BudgetState,
  month: Month,
  rows: WeekComputed[],
  latestIndex: number,
  latest: WeekComputed,
): MonthComparison | null {
  const previousMonth = previousMonthFor(state, month);
  if (!previousMonth) return null;
  const previousRows = computedWeeks(previousMonth, state);
  const monthComplete = latestIndex >= rows.length - 1;
  const previousRow = monthComplete ? previousRows[previousRows.length - 1] : previousRows[latestIndex];
  if (!previousRow || previousRow.week.cumulativeSpend === null) return null;

  const currentAmount = numberOrZero(latest.cumulativeSpend);
  const previousAmount = numberOrZero(previousRow.cumulativeSpend);
  if (previousAmount <= 0) return null;
  const change = currentAmount - previousAmount;
  return {
    amount: roundCurrency(change),
    ratio: change / previousAmount,
    scope: monthComplete ? "full" : "sameProgress",
  };
}

export function topMonthlySpendingDrivers(rows: WeekComputed[], count: number, categoryList: Category[] = categories): Driver[] {
  const categoryTotals = new Map<string, number>(categoryList.map((category) => [category.key, 0]));
  let groceryTotal = 0;
  rows.forEach((row) => {
    groceryTotal += Math.max(0, numberOrZero(row.grocery));
    categoryList.forEach((category) => {
      categoryTotals.set(
        category.key,
        numberOrZero(categoryTotals.get(category.key)) +
          Math.max(0, numberOrZero(row.week.categoryValues?.[category.key])),
      );
    });
  });
  const drivers: Driver[] = [
    { categoryKey: "grocery", amount: roundCurrency(groceryTotal) },
    ...categoryList.map((category) => ({
      categoryKey: category.key,
      amount: roundCurrency(numberOrZero(categoryTotals.get(category.key))),
    })),
  ];
  return drivers
    .filter((driver) => driver.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, count);
}

export function topPeriodSpendingDrivers(row: WeekComputed, count: number, categoryList: Category[] = categories): Driver[] {
  const drivers: Driver[] = [
    { categoryKey: "grocery", amount: Math.max(0, numberOrZero(row.grocery)) },
    ...categoryList.map((category) => ({
      categoryKey: category.key,
      amount: Math.max(0, numberOrZero(row.week.categoryValues?.[category.key])),
    })),
  ];
  return drivers
    .filter((driver) => driver.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, count);
}

export function samePeriodComparisonRow(state: BudgetState, month: Month, weekIndex: number): WeekComputed | null {
  const previousMonth = previousMonthFor(state, month);
  if (!previousMonth) return null;
  return computedWeeks(previousMonth, state)[weekIndex] || null;
}

export function samePeriodComparison(
  weeklyTotal: number,
  samePeriodRow: WeekComputed | null,
): { amount: number; ratio: number } | null {
  if (!samePeriodRow || samePeriodRow.week.cumulativeSpend === null) return null;
  const previousAmount = numberOrZero(samePeriodRow.weeklyTotal);
  if (previousAmount <= 0) return null;
  const change = weeklyTotal - previousAmount;
  return { amount: roundCurrency(change), ratio: change / previousAmount };
}

export function monthlyTrendRows(state: BudgetState): TrendRow[] {
  return orderedMonths(state).map((month) => {
    const rows = computedWeeks(month, state);
    const nonGrocery = rows.reduce((sum, row) => sum + numberOrZero(row.nonGrocery), 0);
    const grocery = rows.reduce((sum, row) => sum + Math.max(0, numberOrZero(row.grocery)), 0);
    const incidentals = rows.reduce((sum, row) => sum + numberOrZero(row.incidentals), 0);
    return {
      id: month.id,
      name: monthDisplayName(month),
      nonGrocery: roundCurrency(nonGrocery),
      grocery: roundCurrency(grocery),
      incidentals: roundCurrency(incidentals),
      total: roundCurrency(nonGrocery + grocery + incidentals),
      creditLimit: month.creditLimit || CREDIT_LIMIT,
      sortKey: inferMonthSortKey(month),
    };
  });
}

export interface DecisionVM {
  kind: StatusKind;
  metricsLine: string;
  driverLine: string;
  nextAction: string;
  drivers: Driver[];
}

type TFn = (key: string, ...args: unknown[]) => string;

function monthComparisonLabel(comparison: MonthComparison | null, monthComplete: boolean, t: TFn): string {
  if (!comparison) return monthComplete ? t("lastMonthUnavailable") : t("sameProgressUnavailable");
  const value = formatPercent(Math.abs(comparison.ratio));
  const displayValue = comparison.amount < 0 ? `-${value}` : value;
  if (comparison.scope === "full") {
    return comparison.amount > 0 ? t("lastMonthHigher", value) : t("lastMonthLower", displayValue);
  }
  return comparison.amount > 0 ? t("sameProgressHigher", value) : t("sameProgressLower", displayValue);
}

// Port of renderOverviewDecision (app.js:4057). Returns the status kind + localized
// lines; the caller renders them and passes `kind` to the trend chart for the current
// month (mirrors setOverviewStatus writing month._barStatusKind).
export function buildDecision(
  state: BudgetState,
  month: Month,
  rows: WeekComputed[],
  t: TFn,
  driverLabel: (categoryKey: string) => string,
): DecisionVM {
  const completedRows = rows.filter((row) => row.week.cumulativeSpend !== null);
  const latest = completedRows[completedRows.length - 1];
  const limit = numberOrZero(month.creditLimit || CREDIT_LIMIT);

  if (!latest) {
    return {
      kind: "empty",
      metricsLine: t("spendingPace", formatPercent(0), formatMoney(0), t("sameProgressUnavailable")),
      driverLine: t("noMonthlyDriverYet"),
      nextAction: t("nextActionUpdate"),
      drivers: [],
    };
  }

  const latestIndex = rows.findIndex((row) => row.week.id === latest.week.id);
  const elapsedShare = Math.min(1, Math.max((latestIndex + 1) / Math.max(rows.length, 1), 0));
  const cumulative = numberOrZero(latest.cumulativeSpend);
  const usedShare = limit > 0 ? cumulative / limit : 0;
  const projected = elapsedShare > 0 ? cumulative / elapsedShare : cumulative;
  const paceRatio = elapsedShare > 0 && limit > 0 ? usedShare / elapsedShare : 0;
  const monthComplete = latestIndex >= rows.length - 1;
  const comparison = monthProgressComparison(state, month, rows, latestIndex, latest);
  const drivers = topMonthlySpendingDrivers(completedRows, 2, categoryDefinitions(state.categorySettings, { includeArchived: true }));
  const mainDriver = drivers[0];

  let kind: StatusKind;
  if ((comparison && comparison.ratio > 0.15) || (!comparison && projected > limit)) {
    kind = "over";
  } else if ((comparison && comparison.ratio > 0) || (!comparison && (paceRatio >= 0.9 || usedShare >= 0.85))) {
    kind = "watch";
  } else {
    kind = "good";
  }

  const averagePerPeriod = cumulative / Math.max(latestIndex + 1, 1);
  const metricsLine = t(
    "spendingPace",
    formatPercent(usedShare),
    formatMoney(averagePerPeriod),
    monthComparisonLabel(comparison, monthComplete, t),
  );

  const driverLine = drivers.length
    ? t(
        "topMonthlyDriversLine",
        ...drivers.map((d) => `${driverLabel(d.categoryKey)} ${formatMoney(d.amount)}`),
      )
    : t("noMonthlyDriverYet");

  const nextAction =
    mainDriver && ((comparison && comparison.ratio > 0) || paceRatio >= 0.9)
      ? t("nextActionReview", driverLabel(mainDriver.categoryKey))
      : t("nextActionUpdate");

  return { kind, metricsLine, driverLine, nextAction, drivers };
}

export function monthlyStatusKind(month: Month, state?: BudgetState): StatusKind {
  const limit = numberOrZero(month.creditLimit);
  const allRows = computedWeeks(month, state);
  const rows = allRows.filter((r) => r.week.cumulativeSpend !== null);
  if (!limit || rows.length === 0) return "empty";

  const latest = rows[rows.length - 1];
  const latestIndex = allRows.findIndex((row) => row.week.id === latest.week.id);
  const elapsedShare = Math.min(1, Math.max((latestIndex + 1) / Math.max(allRows.length, 1), 0));
  const cumulative = numberOrZero(latest.cumulativeSpend);
  const usedShare = cumulative / limit;
  const projected = elapsedShare > 0 ? cumulative / elapsedShare : cumulative;
  const paceRatio = elapsedShare > 0 ? usedShare / elapsedShare : 0;
  const comparison = state ? monthProgressComparison(state, month, allRows, latestIndex, latest) : null;

  // Keep trend-bar colors aligned with the Overview status card, including
  // same-period comparisons that can mark a month over pace before it reaches
  // 80% of its absolute credit limit.
  if ((comparison && comparison.ratio > 0.15) || projected > limit || usedShare >= 0.8) return "over";
  if ((comparison && comparison.ratio > 0) || paceRatio >= 0.9 || usedShare >= 0.5) return "watch";
  return "good";
}
