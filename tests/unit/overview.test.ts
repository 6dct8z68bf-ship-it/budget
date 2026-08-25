import { describe, expect, it } from "vitest";
import {
  buildDecision,
  computedWeeks,
  monthProgressComparison,
  monthlyStatusKind,
  monthlyTrendRows,
  orderedMonths,
  previousMonthFor,
  samePeriodComparison,
  sumNonGrocery,
  topMonthlySpendingDrivers,
  topPeriodSpendingDrivers,
} from "$lib/overview";
import type { BudgetState, Month, Week } from "$shared/types";

function week(
  id: string,
  cumulativeSpend: number | null,
  categoryValues: Record<string, number> = {},
  period = "",
): Week {
  return {
    id,
    period,
    availableBalance: 15000,
    unpaidPrevious: null,
    cumulativeSpend,
    categoryValues,
    notes: "",
  };
}

function month(id: string, weeks: Week[], creditLimit = 15000): Month {
  return { id, name: id, sortKey: id, creditLimit, weeks };
}

function stateWith(months: Month[]): BudgetState {
  return { currentMonthId: months[0]?.id || "", months: Object.fromEntries(months.map((m) => [m.id, m])) };
}

describe("sumNonGrocery", () => {
  it("sums only non-grocery categories, ignoring incidentals", () => {
    const entry = week("w", null, { medical: 50, shoppingDining: 38.1, incidentals: 5 });
    expect(sumNonGrocery(entry)).toBe(88.1);
  });
});

describe("computedWeeks", () => {
  it("derives weekly totals from cumulative spend deltas", () => {
    const current = month("2026-08", [
      week("w1", 1000, { medical: 100 }),
      week("w2", 2450),
      week("w3", null),
    ]);
    const rows = computedWeeks(current);
    expect(rows[0].weeklyTotal).toBe(1000);
    expect(rows[0].nonGrocery).toBe(100);
    expect(rows[0].grocery).toBe(900);
    expect(rows[1].weeklyTotal).toBe(1450);
    expect(rows[2].weeklyTotal).toBe(0);
    expect(rows[2].cumulativeSpend).toBe(0);
  });
});

describe("orderedMonths / previousMonthFor", () => {
  it("sorts months by sort key", () => {
    const months = [month("2026-02", []), month("2025-12", []), month("2026-01", [])];
    expect(orderedMonths(stateWith(months)).map((m) => m.id)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });

  it("previousMonthFor returns the adjacent earlier month or null", () => {
    const first = month("2026-01", [week("w1", 100)]);
    const second = month("2026-02", [week("w1", 200)]);
    const state = stateWith([first, second]);
    expect(previousMonthFor(state, first)).toBe(null);
    expect(previousMonthFor(state, second)?.id).toBe("2026-01");
  });
});

describe("monthProgressComparison", () => {
  it("compares against the same progress point of the previous month", () => {
    const previous = month("2026-07", [week("p1", 1000)]);
    const current = month("2026-08", [week("c1", 1200), week("c2", null)]);
    const state = stateWith([previous, current]);
    const rows = computedWeeks(current, state);
    const comparison = monthProgressComparison(state, current, rows, 0, rows[0]);
    expect(comparison).toEqual({ amount: 200, ratio: 0.2, scope: "sameProgress" });
  });

  it("returns null when the previous month has no spend data", () => {
    const previous = month("2026-07", [week("p1", null)]);
    const current = month("2026-08", [week("c1", 1200)]);
    const state = stateWith([previous, current]);
    const rows = computedWeeks(current, state);
    expect(monthProgressComparison(state, current, rows, 0, rows[0])).toBe(null);
  });
});

describe("spending drivers", () => {
  it("topMonthlySpendingDrivers aggregates across weeks and sorts descending", () => {
    const current = month("2026-08", [
      week("w1", 300, { medical: 300, transport: 100 }),
      week("w2", 500, { medical: 50 }),
    ]);
    const drivers = topMonthlySpendingDrivers(computedWeeks(current), 2);
    expect(drivers).toEqual([
      { categoryKey: "medical", amount: 350 },
      { categoryKey: "grocery", amount: 150 },
    ]);
  });

  it("topPeriodSpendingDrivers ranks a single week's categories", () => {
    const row = computedWeeks(month("2026-08", [week("w1", 400, { medical: 200, transport: 50 }) ]))[0];
    expect(topPeriodSpendingDrivers(row, 3)).toEqual([
      { categoryKey: "medical", amount: 200 },
      { categoryKey: "grocery", amount: 150 },
      { categoryKey: "transport", amount: 50 },
    ]);
  });
});

describe("samePeriodComparison", () => {
  it("compares weekly totals and returns null without a baseline", () => {
    const previous = month("2026-07", [week("p1", 1000)]);
    const sameRow = computedWeeks(previous, stateWith([previous]))[0];
    expect(samePeriodComparison(1500, sameRow)).toEqual({ amount: 500, ratio: 0.5 });
    expect(samePeriodComparison(1500, null)).toBe(null);
  });
});

describe("monthlyTrendRows", () => {
  it("rolls up totals and falls back to the shared credit limit", () => {
    const current = month("2026-08", [week("w1", 1000, { medical: 100 })], 2000);
    const trend = monthlyTrendRows(stateWith([current]));
    expect(trend).toHaveLength(1);
    expect(trend[0]).toMatchObject({
      id: "2026-08",
      nonGrocery: 100,
      grocery: 900,
      total: 1000,
      creditLimit: 2000,
      sortKey: "2026-08",
    });
  });
});

describe("monthlyStatusKind", () => {
  function statusWith(cumulatives: number[], creditLimit: number): string {
    const weeks = cumulatives.map((cumulative, index) => week(`w${index + 1}`, cumulative));
    return monthlyStatusKind(month("2026-08", weeks, creditLimit));
  }

  it("returns empty when there is no limit or no data", () => {
    expect(statusWith([], 2000)).toBe("empty");
    expect(statusWith([800], 0)).toBe("empty");
  });

  it("classifies good / watch / over by credit usage", () => {
    expect(statusWith([400, 600, 700, 800], 2000)).toBe("good");
    expect(statusWith([400, 600, 700, 1000], 2000)).toBe("watch");
    expect(statusWith([400, 600, 700, 1600], 2000)).toBe("over");
  });
});

describe("buildDecision", () => {
  const t = (key: string, ...args: unknown[]): string => `${key}:${args.join("|")}`;
  const driverLabel = (key: string): string => key;

  it("returns an empty decision when no week has spend data", () => {
    const current = month("2026-08", [week("w1", null), week("w2", null)], 2000);
    const decision = buildDecision(stateWith([current]), current, computedWeeks(current), t, driverLabel);
    expect(decision.kind).toBe("empty");
    expect(decision.drivers).toEqual([]);
  });

  it("flags a month as over when projected spend exceeds the limit", () => {
    const current = month("2026-08", [
      week("w1", 1700),
      week("w2", 1700),
      week("w3", null),
      week("w4", null),
    ], 2000);
    const decision = buildDecision(stateWith([current]), current, computedWeeks(current), t, driverLabel);
    expect(decision.kind).toBe("over");
    expect(decision.drivers[0]).toEqual({ categoryKey: "grocery", amount: 1700 });
  });
});
