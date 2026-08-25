import { beforeEach, describe, expect, it } from "vitest";
import {
  createId,
  escapeHtml,
  formatBuildTime,
  formatBuildVersion,
  formatCompactMoney,
  formatDateRangeDisplay,
  formatIsoDateDisplay,
  formatMoney,
  formatPercent,
  formatPeriodDisplay,
  formatSignedMoney,
  monthLongName,
  normalizeMerchant,
  normalizeYear,
  numberOrNull,
  numberOrZero,
  parseIsoDateParts,
  parsePeriodRange,
  roundCurrency,
  shortMonthName,
  shortPeriod,
  toIsoDate,
} from "$lib/format";
import { setLanguage } from "$lib/stores/i18n";

beforeEach(() => setLanguage("en"));

describe("numberOrZero", () => {
  it("returns 0 for missing or invalid values", () => {
    expect(numberOrZero(undefined)).toBe(0);
    expect(numberOrZero(null)).toBe(0);
    expect(numberOrZero("not-a-number")).toBe(0);
    expect(numberOrZero(Number.NaN)).toBe(0);
  });

  it("returns the numeric value when valid", () => {
    expect(numberOrZero(0)).toBe(0);
    expect(numberOrZero(5)).toBe(5);
    expect(numberOrZero("5.5")).toBe(5.5);
  });
});

describe("numberOrNull", () => {
  it("returns null for missing or invalid values", () => {
    expect(numberOrNull(undefined)).toBe(null);
    expect(numberOrNull(null)).toBe(null);
    expect(numberOrNull("")).toBe(null);
    expect(numberOrNull("nope")).toBe(null);
  });

  it("returns the number when valid", () => {
    expect(numberOrNull(0)).toBe(0);
    expect(numberOrNull("12.34")).toBe(12.34);
  });
});

describe("roundCurrency", () => {
  it("rounds to two decimals", () => {
    expect(roundCurrency(1.005)).toBe(1.01);
    expect(roundCurrency(10.999)).toBe(11);
    expect(roundCurrency(2.5)).toBe(2.5);
    expect(roundCurrency("3.14159")).toBe(3.14);
  });
});

describe("money formatters", () => {
  it("formatMoney renders AUD currency", () => {
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(1234.5)).toBe("$1,234.50");
  });

  it("formatSignedMoney signs non-zero values only", () => {
    expect(formatSignedMoney(0)).toBe("$0.00");
    expect(formatSignedMoney(5)).toBe("+$5.00");
    expect(formatSignedMoney(-5)).toBe("-$5.00");
  });

  it("formatPercent clamps negatives and scales to 0-100", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(-0.5)).toBe("0%");
  });

  it("formatCompactMoney switches to k above 1000", () => {
    expect(formatCompactMoney(0)).toBe("$0");
    expect(formatCompactMoney(999)).toBe("$999");
    expect(formatCompactMoney(1000)).toBe("$1k");
    expect(formatCompactMoney(1500)).toBe("$1.5k");
  });
});

describe("period string helpers", () => {
  it("shortPeriod normalizes whitespace and the range separator", () => {
    expect(shortPeriod("")).toBe("");
    expect(shortPeriod("2026-08-01 - 2026-08-07")).toBe("2026-08-01-2026-08-07");
    expect(shortPeriod("2026-08-01   -   2026-08-07")).toBe("2026-08-01-2026-08-07");
  });

  it("parsePeriodRange accepts -, to and Chinese separators", () => {
    expect(parsePeriodRange("2026-08-01 - 2026-08-07")).toEqual({
      start: "2026-08-01",
      end: "2026-08-07",
    });
    expect(parsePeriodRange("2026-08-01 to 2026-08-07")).toEqual({
      start: "2026-08-01",
      end: "2026-08-07",
    });
    expect(parsePeriodRange("2026-08-01 至 2026-08-07")).toEqual({
      start: "2026-08-01",
      end: "2026-08-07",
    });
    expect(parsePeriodRange("2026-08-01")).toEqual({ start: "2026-08-01", end: "" });
    expect(parsePeriodRange("garbage")).toEqual({ start: "", end: "" });
  });

  it("formatPeriodDisplay renders a human range in English", () => {
    expect(formatPeriodDisplay("2026-08-01 - 2026-08-07")).toBe("1-7 Aug 2026");
    expect(formatPeriodDisplay("")).toBe("");
  });

  it("shortMonthName collapses whitespace and truncates long names", () => {
    expect(shortMonthName("")).toBe("");
    expect(shortMonthName("  2026 August  ")).toBe("2026 August");
    expect(shortMonthName("x".repeat(20))).toBe(`${"x".repeat(13)}…`);
  });
});

describe("ISO date helpers", () => {
  it("parseIsoDateParts only accepts zero-padded ISO dates", () => {
    expect(parseIsoDateParts("2026-08-15")).toEqual({ year: 2026, month: 8, day: 15 });
    expect(parseIsoDateParts("2026-8-15")).toBe(null);
    expect(parseIsoDateParts("")).toBe(null);
    expect(parseIsoDateParts(null)).toBe(null);
  });

  it("toIsoDate rejects impossible dates", () => {
    expect(toIsoDate(2026, 8, 15)).toBe("2026-08-15");
    expect(toIsoDate(2026, 13, 1)).toBe("");
    expect(toIsoDate(2026, 2, 29)).toBe(""); // 2026 is not a leap year
    expect(toIsoDate(2028, 2, 29)).toBe("2028-02-29");
  });

  it("formatIsoDateDisplay switches between English and Chinese", () => {
    expect(formatIsoDateDisplay("2026-08-15")).toBe("15 Aug 2026");
    setLanguage("zh");
    expect(formatIsoDateDisplay("2026-08-15")).toBe("2026/08/15");
    setLanguage("en");
    expect(formatIsoDateDisplay("garbage")).toBe("garbage");
  });

  it("formatDateRangeDisplay handles same-day, same-month and cross-year ranges", () => {
    expect(formatDateRangeDisplay("2026-08-15", "2026-08-15")).toBe("15 Aug 2026");
    expect(formatDateRangeDisplay("2026-08-15", "2026-08-21")).toBe("15-21 Aug 2026");
    expect(formatDateRangeDisplay("2026-12-30", "2027-01-02")).toBe("30 Dec 2026 - 2 Jan 2027");
    setLanguage("zh");
    expect(formatDateRangeDisplay("2026-08-15", "2026-08-21")).toBe("2026/08/15-21");
    expect(formatDateRangeDisplay("2026-12-30", "2027-01-02")).toBe("2026/12/30-2027/01/02");
    setLanguage("en");
  });

  it("normalizeYear maps two-digit years into the 2000s", () => {
    expect(normalizeYear("23", 2000)).toBe(2023);
    expect(normalizeYear("2026", 2000)).toBe(2026);
    expect(normalizeYear("", 1999)).toBe(1999);
    expect(normalizeYear(null, 1999)).toBe(1999);
  });

  it("monthLongName maps months to English names", () => {
    expect(monthLongName(1)).toBe("January");
    expect(monthLongName(12)).toBe("December");
    expect(monthLongName(13)).toBe("");
  });
});

describe("string helpers", () => {
  it("escapeHtml escapes all HTML-significant characters", () => {
    expect(escapeHtml(`<b>"hi" & 'there'</b>`)).toBe(
      "&lt;b&gt;&quot;hi&quot; &amp; &#039;there&#039;&lt;/b&gt;",
    );
  });

  it("normalizeMerchant strips PayPal prefixes, notes and collapses whitespace", () => {
    expect(normalizeMerchant("PayPal *FOO BAR")).toBe("FOO BAR");
    expect(normalizeMerchant("  cafe   takeaway  ")).toBe("CAFE TAKEAWAY");
    expect(normalizeMerchant("ABC ##note")).toBe("ABC");
  });
});

describe("build metadata", () => {
  it("formatBuildTime renders local time and falls back gracefully", () => {
    expect(formatBuildTime("")).toBe("-");
    expect(formatBuildTime("not-a-date")).toBe("not-a-date");
    expect(formatBuildTime(new Date(2026, 7, 15, 3, 4))).toBe("2026-08-15 03:04");
  });

  it("formatBuildVersion shortens sha256 digests", () => {
    expect(formatBuildVersion("")).toBe("");
    expect(formatBuildVersion("latest")).toBe("latest");
    expect(formatBuildVersion("sha256:abcdef1234567890")).toBe("sha256:abcdef123456");
    expect(formatBuildVersion("docker.io/x@sha256:abcdef1234567890")).toBe("sha256:abcdef123456");
  });

  it("createId returns a non-empty string", () => {
    const id = createId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });
});
