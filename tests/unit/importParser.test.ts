import { describe, expect, it } from "vitest";
import { buildImportRows, parseBalanceHints } from "$lib/import/parser";
import type { ParseContext } from "$lib/import/types";

const ctx: ParseContext = {
  range: { start: "2026-11-01", end: "2026-11-30" },
  userRules: [],
  monthExistsForImportDate: () => true,
};

function rowsFrom(lines: string[]) {
  return buildImportRows(lines.join("\n"), ctx);
}

describe("bank CSV with a header row", () => {
  it("maps date, description, amount and ignores the balance column", () => {
    const rows = rowsFrom([
      '"Transaction Date","Description","Amount","Balance"',
      '"23/11/2026","VicRoads","-482.15","0"',
      '"23/11/2026","The Don Deli (Tunstall Square)","-134.95","0"',
      '"22/11/2026","Woolworths (Forest Hill Chase)","-9","0"',
    ]);

    // The header must not become an excluded "invalid date" row.
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      dateIso: "2026-11-23",
      displayDate: "2026-11-23",
      amount: -482.15,
      expenseAmount: 482.15,
      description: "VicRoads",
    });
    expect(rows[1]).toMatchObject({ amount: -134.95, description: "The Don Deli (Tunstall Square)" });
    // Integers without decimals still parse as currency amounts.
    expect(rows[2]).toMatchObject({ amount: -9, expenseAmount: 9 });
    rows.forEach((row) => expect(row.status).not.toBe("excluded"));
  });

  it("parses a real new-format export without dropping rows", () => {
    const rows = rowsFrom([
      '"Transaction Date","Description","Amount","Balance"',
      '"23/11/2026","VicRoads","-482.15","0"',
      '"23/11/2026","The Don Deli (Tunstall Square)","-134.95","0"',
      '"22/11/2026","Woolworths (Forest Hill Chase)","-9","0"',
      '"21/11/2026","McDonald\'s (Footscray)","-19","0"',
    ]);

    expect(rows.map((row) => row.description)).toEqual([
      "VicRoads",
      "The Don Deli (Tunstall Square)",
      "Woolworths (Forest Hill Chase)",
      "McDonald's (Footscray)",
    ]);
    expect(rows.map((row) => row.amount)).toEqual([-482.15, -134.95, -9, -19]);
    expect(rows.every((row) => row.dateIso.startsWith("2026-11-"))).toBe(true);
  });

  it("keeps commas inside quoted descriptions", () => {
    const rows = rowsFrom([
      '"Transaction Date","Description","Amount","Balance"',
      '"24/11/2026","Smith, Jones & Co","-10.00","0"',
    ]);

    expect(rows[0].description).toBe("Smith, Jones & Co");
    expect(rows[0].amount).toBe(-10);
  });

  it("supports separate debit and credit columns", () => {
    const rows = rowsFrom([
      '"Date","Description","Debit","Credit"',
      '"20/11/2026","Coffee","12.50",""',
      '"21/11/2026","Refund","","25.00"',
    ]);

    expect(rows[0]).toMatchObject({ amount: -12.5, expenseAmount: 12.5 });
    expect(rows[1].amount).toBe(25);
    expect(rows[1].reason).toBe("positive amount / payment / refund");
  });
});

describe("headerless pastes", () => {
  it("still parses the legacy date,amount,description layout", () => {
    const rows = rowsFrom(['13/06/2026,"-36.35","COLES 7735 DONCASTER VIC",""']);

    expect(rows[0]).toMatchObject({ amount: -36.35, description: "COLES 7735 DONCASTER VIC" });
  });

  it("detects the new date,description,amount order without a header", () => {
    const rows = rowsFrom(['13/06/2026,"COLES 7735","-36.35","0"']);

    expect(rows[0]).toMatchObject({ amount: -36.35, description: "COLES 7735" });
  });
});

describe("copyable statement view", () => {
  const paste = [
    "Available",
    "$9,026.87",
    "",
    "Total owing from last statement",
    "$4,604.78",
    "",
    "Wed 25 Nov 2026\tAmount",
    "",
    "PENDING: BP AA (Doncaster)",
    "-90.81 dollars-$90.81",
    "",
    "PENDING: Woolworths (Blackburn North)",
    "-16.70 dollars-$16.70",
    "Tue 24 Nov 2026\tAmount",
    "",
    "PENDING: BIG W (Westfield Doncaster)",
    "-8.25 dollars-$8.25",
    "Mon 23 Nov 2026\tAmount",
    "",
    "VicRoads",
    "-482.15 dollars-$482.15",
    "The Don Deli (Tunstall Square)",
    "-134.95 dollars-$134.95",
    "",
    "PENDING: Public Transport Victoria",
    "-1.00 dollars-$1.00",
    "Sun 22 Nov 2026\tAmount",
    "",
    "Woolworths (Forest Hill Chase)",
    "-9.00 dollars-$9.00",
    "McDonald's (Footscray)",
    "-19.00 dollars-$19.00",
  ].join("\n");

  it("keeps every transaction separate within a day", () => {
    const rows = buildImportRows(paste, ctx);

    expect(rows).toHaveLength(8);
    expect(rows.map((row) => row.description)).toEqual([
      "BP AA (Doncaster)",
      "Woolworths (Blackburn North)",
      "BIG W (Westfield Doncaster)",
      "VicRoads",
      "The Don Deli (Tunstall Square)",
      "Public Transport Victoria",
      "Woolworths (Forest Hill Chase)",
      "McDonald's (Footscray)",
    ]);
    expect(rows.map((row) => row.amount)).toEqual([-90.81, -16.7, -8.25, -482.15, -134.95, -1, -9, -19]);
    expect(rows.map((row) => row.dateIso)).toEqual([
      "2026-11-25",
      "2026-11-25",
      "2026-11-24",
      "2026-11-23",
      "2026-11-23",
      "2026-11-23",
      "2026-11-22",
      "2026-11-22",
    ]);
  });

  it("creates one row per transaction, none excluded", () => {
    const rows = buildImportRows(paste, ctx);

    expect(rows.filter((row) => row.status === "excluded")).toEqual([]);
  });

  it("still reads the balance block above the copied statement", () => {
    expect(parseBalanceHints(paste)).toEqual({ available: 9026.87, unpaid: 4604.78 });
  });
});

describe("statement balance block", () => {
  const source = [
    "Available",
    "$9,026.87",
    "",
    '"Transaction Date","Description","Amount","Balance"',
    '"23/11/2026","VicRoads","-482.15","0"',
    '"22/11/2026","Woolworths (Forest Hill Chase)","-9","0"',
    "",
    "Total owing from last statement",
    "$4,604.78",
  ].join("\n");

  it("reads available balance and total owing from label/value pairs", () => {
    expect(parseBalanceHints(source)).toEqual({ available: 9026.87, unpaid: 4604.78 });
  });

  it("does not treat a transaction description containing a hint word as a balance hint", () => {
    const withFee = [
      '"Transaction Date","Description","Amount","Balance"',
      '"24/11/2026","UNPAID ITEM FEE","-15.00","0"',
    ].join("\n");

    expect(parseBalanceHints(withFee)).toEqual({ available: null, unpaid: null });
    const rows = buildImportRows(withFee, ctx);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ description: "UNPAID ITEM FEE", amount: -15 });
  });

  it("removes the balance block so it does not become transaction rows", () => {
    const rows = buildImportRows(source, ctx);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.description)).toEqual(["VicRoads", "Woolworths (Forest Hill Chase)"]);
    expect(rows.some((row) => row.reason === "invalid date" || row.reason === "unsupported row format")).toBe(false);
  });
});
