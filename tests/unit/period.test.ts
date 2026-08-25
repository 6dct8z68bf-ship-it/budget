import { describe, expect, it } from "vitest";
import {
  addDaysToIsoDate,
  applySafePeriodDateCascade,
  computeCumulativeFromAvailable,
  defaultPeriodRangeForMonth,
  editingRangeForWeek,
  formatPeriodRangeValue,
  inclusivePeriodDurationDays,
  isCompletePeriodRange,
  isOrderedPeriodRange,
  suggestedRangesForNewMonth,
  timelineDiagnostic,
  weekRangeForIndex,
} from "$lib/period";
import type { BudgetState, Month } from "$shared/types";

function monthWithWeeks(sortKey: string, periods: string[], creditLimit = 2000): Month {
  return {
    id: sortKey,
    name: sortKey,
    sortKey,
    creditLimit,
    weeks: periods.map((period, index) => ({
      id: `${sortKey}-w${index + 1}`,
      period,
      availableBalance: creditLimit,
      unpaidPrevious: null,
      cumulativeSpend: null,
      categoryValues: {},
      notes: "",
    })),
  };
}

describe("addDaysToIsoDate", () => {
  it("adds days within a month", () => {
    expect(addDaysToIsoDate("2026-08-15", 3)).toBe("2026-08-18");
  });

  it("rolls into the next month", () => {
    expect(addDaysToIsoDate("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("rolls into the next year", () => {
    expect(addDaysToIsoDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles negative days", () => {
    expect(addDaysToIsoDate("2026-08-01", -1)).toBe("2026-07-31");
  });

  it("returns an empty string for invalid input", () => {
    expect(addDaysToIsoDate("not-a-date", 1)).toBe("");
    expect(addDaysToIsoDate("2026-08-15", Number.NaN)).toBe("");
  });
});

describe("period range validation", () => {
  it("isCompletePeriodRange requires both endpoints", () => {
    expect(isCompletePeriodRange({ start: "2026-08-01", end: "2026-08-07" })).toBe(true);
    expect(isCompletePeriodRange({ start: "2026-08-01", end: "" })).toBe(false);
    expect(isCompletePeriodRange(null)).toBe(false);
  });

  it("isOrderedPeriodRange rejects inverted ranges", () => {
    expect(isOrderedPeriodRange({ start: "2026-08-01", end: "2026-08-07" })).toBe(true);
    expect(isOrderedPeriodRange({ start: "2026-08-07", end: "2026-08-01" })).toBe(false);
    expect(isOrderedPeriodRange({ start: "", end: "" })).toBe(false);
  });

  it("inclusivePeriodDurationDays counts both endpoints", () => {
    expect(inclusivePeriodDurationDays({ start: "2026-08-01", end: "2026-08-07" })).toBe(7);
    expect(inclusivePeriodDurationDays({ start: "2026-08-01", end: "2026-08-01" })).toBe(1);
    expect(inclusivePeriodDurationDays({ start: "", end: "" })).toBe(0);
  });

  it("formatPeriodRangeValue joins or falls back to a single side", () => {
    expect(formatPeriodRangeValue("2026-08-01", "2026-08-07")).toBe("2026-08-01 - 2026-08-07");
    expect(formatPeriodRangeValue("2026-08-01", "")).toBe("2026-08-01");
    expect(formatPeriodRangeValue("", "")).toBe("");
  });
});

describe("defaultPeriodRangeForMonth", () => {
  it("splits August 2026 into four contiguous weeks", () => {
    const month = monthWithWeeks("2026-08", ["", "", "", ""]);
    expect(defaultPeriodRangeForMonth(month, 0, 4)).toEqual({ start: "2026-08-01", end: "2026-08-07" });
    expect(defaultPeriodRangeForMonth(month, 1, 4)).toEqual({ start: "2026-08-08", end: "2026-08-14" });
    expect(defaultPeriodRangeForMonth(month, 2, 4)).toEqual({ start: "2026-08-15", end: "2026-08-21" });
    expect(defaultPeriodRangeForMonth(month, 3, 4)).toEqual({ start: "2026-08-22", end: "2026-08-31" });
  });

  it("clamps February to its actual length", () => {
    const february = monthWithWeeks("2026-02", ["", "", "", ""]);
    expect(defaultPeriodRangeForMonth(february, 0, 4)).toEqual({ start: "2026-02-01", end: "2026-02-07" });
    expect(defaultPeriodRangeForMonth(february, 3, 4)).toEqual({ start: "2026-02-22", end: "2026-02-28" });
  });
});

describe("weekRangeForIndex / editingRangeForWeek", () => {
  it("parses an existing period and falls back to the default", () => {
    const month = monthWithWeeks("2026-08", ["2026-08-01 - 2026-08-07", "", "", ""]);
    expect(weekRangeForIndex(month, 0)).toEqual({ start: "2026-08-01", end: "2026-08-07" });
    expect(weekRangeForIndex(month, 1)).toEqual({ start: "2026-08-08", end: "2026-08-14" });
    expect(editingRangeForWeek(month, undefined, 1)).toEqual({ start: "2026-08-08", end: "2026-08-14" });
  });
});

describe("computeCumulativeFromAvailable", () => {
  const month = { id: "2026-08", name: "2026-08", creditLimit: 2000, weeks: [] } as Month;

  it("computes the remaining credit after unpaid carry-over", () => {
    expect(computeCumulativeFromAvailable({ availableBalance: 1500, unpaidPrevious: 100 }, month)).toBe(400);
    expect(computeCumulativeFromAvailable({ availableBalance: 2100, unpaidPrevious: 0 }, month)).toBe(0);
  });

  it("returns null when the week has no available balance", () => {
    expect(computeCumulativeFromAvailable(null, month)).toBe(null);
    expect(computeCumulativeFromAvailable({ availableBalance: null, unpaidPrevious: null }, month)).toBe(null);
  });
});

describe("suggestedRangesForNewMonth", () => {
  it("continues from the previous month's last period", () => {
    const previous = monthWithWeeks("2026-08", [
      "2026-08-01 - 2026-08-07",
      "2026-08-08 - 2026-08-14",
      "2026-08-15 - 2026-08-21",
      "2026-08-22 - 2026-08-31",
    ]);
    const state: BudgetState = { currentMonthId: "2026-08", months: { "2026-08": previous } };
    expect(suggestedRangesForNewMonth(state, "2026-09", 4)).toEqual([
      { start: "2026-09-01", end: "2026-09-07" },
      { start: "2026-09-08", end: "2026-09-14" },
      { start: "2026-09-15", end: "2026-09-21" },
      { start: "2026-09-22", end: "2026-10-01" },
    ]);
  });

  it("falls back to calendar defaults when there is no previous month", () => {
    const state: BudgetState = { currentMonthId: "2026-01", months: {} };
    const ranges = suggestedRangesForNewMonth(state, "2026-01", 4);
    expect(ranges[0]).toEqual({ start: "2026-01-01", end: "2026-01-07" });
    expect(ranges[3]).toEqual({ start: "2026-01-22", end: "2026-01-31" });
  });
});

describe("timelineDiagnostic", () => {
  it("flags overlaps, gaps and missing ranges", () => {
    const month = monthWithWeeks("2026-08", [
      "2026-08-01 - 2026-08-07",
      "2026-08-07 - 2026-08-14", // overlap: starts a day early
      "2026-08-16 - 2026-08-23", // gap: starts a day late
      "", // missing
    ]);
    const overrideRanges = new Map([["2026-08-w4", { start: "", end: "" }]]);
    const diagnostic = timelineDiagnostic(month, overrideRanges);
    expect(diagnostic.hasIssues).toBe(true);
    expect(diagnostic.issues.map((issue) => issue.type)).toEqual(["overlap", "gap", "missing"]);
  });

  it("reports no issues for contiguous ranges", () => {
    const month = monthWithWeeks("2026-08", [
      "2026-08-01 - 2026-08-07",
      "2026-08-08 - 2026-08-14",
      "2026-08-15 - 2026-08-21",
      "2026-08-22 - 2026-08-31",
    ]);
    expect(timelineDiagnostic(month).hasIssues).toBe(false);
  });
});

describe("applySafePeriodDateCascade", () => {
  it("rewrites unprotected following weeks and stops at protected data", () => {
    const month = monthWithWeeks("2026-08", [
      "2026-08-01 - 2026-08-07",
      "", // will be cascaded
      "", // protected by notes
      "",
    ]);
    month.weeks[2].notes = "keep me";
    applySafePeriodDateCascade(month, 0);
    expect(month.weeks[1].period).toBe("2026-08-08 - 2026-08-14");
    expect(month.weeks[2].period).toBe("");
    expect(month.weeks[3].period).toBe("");
  });
});
