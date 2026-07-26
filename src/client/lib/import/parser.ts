// FAITHFUL port of the transaction-import parser + classifier from app.js
// (parseBalanceHints ~4561, stripBalanceHintLines ~4599, parseTransactionRows 4534,
// parseLooseTransactionText 4614, parseCsvLine 4664, parseImportDate/parseImportAmount
// 4687-4740, importExclusionReason 4742, normalizeMerchantForKey 4804,
// classifyTransaction 4834, buildImportRows 4483). Parsing regexes/heuristics are
// preserved verbatim; global state access is replaced with an injected ParseContext.
import { roundCurrency, normalizeMerchant, toIsoDate } from "$lib/format";
import { IMPORT_CONFIDENCE, IMPORT_STATUSES } from "./types";
import type { BalanceHints, ClassifyResult, ImportRow, MerchantRule, ParseContext } from "./types";
import { BUILTIN_MERCHANT_RULES } from "./merchant-data";

// Intermediate row shape produced by the raw row/loose-text parsers, before
// classification and exclusion mapping in buildImportRows.
interface ParsedRow {
  sourceLine: string;
  rawDate?: string;
  dateIso: string;
  amount: number;
  description: string;
  error?: string;
}

// The `base` skeleton buildImportRows constructs before classification. Mirrors the
// ImportRow shape (importExclusionReason only reads dateIso + amount off it).
interface BaseRow extends ImportRow {}

// === balance hints ===
export function parseBalanceHints(source: string): BalanceHints {
  const lines = source.split(/\r?\n/).map((line) => line.trim());
  return lines.reduce<BalanceHints>(
    (hints, line, index) => {
      const label = line.toLowerCase();
      if (label.includes("available")) {
        const amount = parseLooseAmount(line);
        const nextAmount = Number.isNaN(amount) ? parseLooseAmount(nextNonEmptyLine(lines, index)) : amount;
        if (!Number.isNaN(nextAmount)) hints.available = Math.abs(nextAmount);
      }
      if (label.includes("total owing") || label.includes("unpaid")) {
        const amount = parseLooseAmount(line);
        const nextAmount = Number.isNaN(amount) ? parseLooseAmount(nextNonEmptyLine(lines, index)) : amount;
        if (!Number.isNaN(nextAmount)) hints.unpaid = Math.abs(nextAmount);
      }
      return hints;
    },
    { available: null, unpaid: null },
  );
}

function nextNonEmptyLine(lines: string[], index: number): string {
  return lines.slice(index + 1).find((line) => line.trim()) || "";
}

export function stripBalanceHintLines(source: string): string {
  const lines = source.split(/\r?\n/);
  const skip = new Set<number>();
  lines.forEach((line, index) => {
    const label = line.trim().toLowerCase();
    if (!label.includes("available") && !label.includes("total owing") && !label.includes("unpaid")) return;
    skip.add(index);
    if (Number.isNaN(parseLooseAmount(line))) {
      const nextIndex = lines.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate.trim());
      if (nextIndex > index) skip.add(nextIndex);
    }
  });
  return lines.filter((_, index) => !skip.has(index)).join("\n");
}

// === row parsing ===
function parseTransactionRows(source: string): ParsedRow[] {
  const transactionSource = stripBalanceHintLines(source);
  const looseRows = parseLooseTransactionText(transactionSource);
  if (looseRows.length) return looseRows;

  return transactionSource
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const columns = parseCsvLine(line);
      if (columns.length < 3) {
        return { sourceLine: line, error: "unsupported row format", rawDate: columns[0] || "", amount: 0, description: line, dateIso: "" };
      }
      const dateIso = parseImportDate(columns[0]);
      const amount = parseImportAmount(columns[1]);
      return {
        sourceLine: line,
        rawDate: columns[0],
        dateIso,
        amount,
        description: columns[2] || columns[3] || line,
        error: Number.isNaN(amount) ? "unsupported row format" : "",
      };
    });
}

function parseLooseTransactionText(source: string): ParsedRow[] {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows: ParsedRow[] = [];
  let current: {
    rawDate: string;
    dateIso: string;
    amount: number;
    descriptionParts: string[];
    sourceLines: string[];
  } | null = null;

  const flush = () => {
    if (!current) return;
    const description = cleanLooseDescription(current.descriptionParts.join(" "));
    rows.push({
      sourceLine: current.sourceLines.join(" "),
      rawDate: current.rawDate,
      dateIso: current.dateIso,
      amount: current.amount,
      description: description || current.sourceLines.join(" "),
      error: Number.isNaN(current.amount) ? "unsupported row format" : "",
    });
    current = null;
  };

  lines.forEach((line) => {
    const dateIso = parseImportDate(line);
    if (dateIso) {
      flush();
      current = {
        rawDate: line,
        dateIso,
        amount: NaN,
        descriptionParts: [],
        sourceLines: [line],
      };
      return;
    }

    if (!current) return;
    current.sourceLines.push(line);
    const amount = parseLooseAmount(line);
    if (!Number.isNaN(amount)) {
      current.amount = amount;
      return;
    }
    current.descriptionParts.push(line);
  });

  flush();
  return rows.filter((row) => row.dateIso || row.description || !Number.isNaN(row.amount));
}

function parseCsvLine(line: string): string[] {
  const columns: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
    if (character === '"' && next === '"' && inQuotes) {
      current += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === "," && !inQuotes) {
      columns.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  columns.push(current.trim());
  return columns.map((value) => value.replace(/^"|"$/g, "").trim());
}

// === date / amount parsers ===
function parseImportDate(value: string): string {
  const trimmed = String(value || "").trim();
  const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return toIsoDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const named = trimmed.match(/^(\d{1,2})\s+([a-z]{3,9})\s+(\d{4})$/i);
  if (named) return toIsoDate(Number(named[3]), monthNameToNumber(named[2]), Number(named[1]));
  return "";
}

function monthNameToNumber(value: string): number {
  const key = String(value || "").slice(0, 3).toLowerCase();
  return (
    {
      jan: 1,
      feb: 2,
      mar: 3,
      apr: 4,
      may: 5,
      jun: 6,
      jul: 7,
      aug: 8,
      sep: 9,
      oct: 10,
      nov: 11,
      dec: 12,
    } as Record<string, number>
  )[key] || 0;
}

function parseImportAmount(value: string): number {
  const cleaned = String(value || "").replace(/[$,\s"]/g, "");
  if (!cleaned) return NaN;
  const bracketed = cleaned.match(/^\((.+)\)$/);
  return Number(bracketed ? `-${bracketed[1]}` : cleaned);
}

function parseLooseAmount(value: string): number {
  const match = String(value || "").match(/[+-]?\$?\s*\d[\d,]*(?:\.\d{2})?/);
  return match ? parseImportAmount(match[0]) : NaN;
}

function cleanLooseDescription(value: string): string {
  return String(value || "")
    .replace(/Open transaction details/gi, "")
    .replace(/\bPENDING\s*-\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// === exclusion ===
// The original monthExistsForImportDate(dateIso, range) / currentWeek() global lookups
// are replaced by ctx.monthExistsForImportDate(dateIso) and ctx.range. All other
// exclusion reasons (bad format, non-expense/credit, missing date, out of range) are
// preserved verbatim.
function importExclusionReason(base: BaseRow, row: ParsedRow, ctx: ParseContext): string {
  if (row.error) return row.error;
  if (!base.dateIso) return "invalid date";
  if (!Number.isFinite(base.amount)) return "unsupported row format";
  if (base.amount >= 0) return "positive amount / payment / refund";
  if (!ctx.monthExistsForImportDate(base.dateIso)) return "month not created";
  if (!ctx.range.start || !ctx.range.end) return "no matching existing period";
  if (base.dateIso < ctx.range.start || base.dateIso > ctx.range.end) return "outside selected period";
  return "";
}

// === merchant normalize / classify ===
// Layer 1: user-defined merchant category memory.
// Conservative normalisation for the user-rule lookup key.
// Strips: payment prefixes, store numbers (4+ digits), Australian state codes,
// trailing "AUS"/"AU", repeated spaces. Preserves merchant identity words.
export function normalizeMerchantForKey(value: string): string {
  return String(value || "")
    .toLowerCase()
    // strip leading payment / noise prefixes
    .replace(/^paypal\s*\*+\s*/i, "")
    .replace(/^sq\s*\*+\s*/i, "")
    .replace(/^pending\s*-\s*/i, "")
    .replace(/^open transaction details\s*/i, "")
    // strip trailing "##..." suffix
    .replace(/##.*$/, "")
    // strip standalone 4+ digit store numbers (e.g. "3931", "7735")
    .replace(/\b\d{4,}\b/g, "")
    // strip Australian state codes when they appear as standalone tokens
    .replace(/\b(vic|nsw|qld|sa|wa|tas|act|nt)\b/g, "")
    // strip trailing country token
    .replace(/\baus?$/g, "")
    // collapse repeated spaces + trim
    .replace(/\s+/g, " ")
    .trim();
}

// Find a user-saved merchant rule for the given raw description.
// Returns the rule object or null. Lookup is exact-match on the normalised key.
function findUserMerchantRule(rawDescription: string, ctx: ParseContext): MerchantRule | null {
  const key = normalizeMerchantForKey(rawDescription);
  if (!key) return null;
  const rules = Array.isArray(ctx.userRules) ? ctx.userRules : [];
  return rules.find((rule) => rule.merchantKey === key) || null;
}

export function classifyTransaction(normalizedMerchant: string, rawDescription: string, ctx: ParseContext): ClassifyResult {
  // Layer 1: user-defined merchant rules (highest priority)
  if (rawDescription) {
    const userRule = findUserMerchantRule(rawDescription, ctx);
    if (userRule) {
      return {
        categoryKey: userRule.categoryKey,
        confidence: IMPORT_CONFIDENCE.HIGH,
        reason: "user rule",
        requiresReview: false,
      };
    }
  }
  // Layer 2: built-in rule-based categorisation
  const rule = BUILTIN_MERCHANT_RULES.find((item) => normalizedMerchant.includes(normalizeMerchant(item.pattern)));
  if (!rule) {
    return {
      categoryKey: "shoppingDining",
      confidence: IMPORT_CONFIDENCE.LOW,
      reason: "low confidence",
      requiresReview: true,
    };
  }
  return {
    categoryKey: rule.categoryKey,
    confidence: rule.confidence,
    reason: rule.pattern,
    requiresReview: !!rule.requiresReview || rule.categoryKey === "incidentals",
  };
}

// === row assembly ===
export function buildImportRows(source: string, ctx: ParseContext): ImportRow[] {
  const parsedRows = parseTransactionRows(source);
  const duplicateKeys = new Set<string>();
  return parsedRows.map((row, index) => {
    const base: BaseRow = {
      id: `import-${Date.now()}-${index}`,
      sourceLine: row.sourceLine,
      dateIso: row.dateIso,
      displayDate: row.dateIso || row.rawDate || "-",
      amount: row.amount,
      expenseAmount: row.amount < 0 ? roundCurrency(Math.abs(row.amount)) : 0,
      description: row.description || row.sourceLine,
      normalizedMerchant: normalizeMerchant(row.description || row.sourceLine),
      categoryKey: "",
      confidence: IMPORT_CONFIDENCE.LOW,
      reason: "",
      status: IMPORT_STATUSES.EXCLUDED,
    };

    const exclusionReason = importExclusionReason(base, row, ctx);
    if (exclusionReason) {
      return { ...base, reason: exclusionReason };
    }

    const duplicateKey = `${base.dateIso}|${base.normalizedMerchant}|${base.expenseAmount}`;
    const duplicateReason = duplicateKeys.has(duplicateKey) ? "duplicate candidate" : "";
    duplicateKeys.add(duplicateKey);

    const classification = classifyTransaction(base.normalizedMerchant, base.description, ctx);
    const status =
      classification.requiresReview || classification.confidence === IMPORT_CONFIDENCE.LOW
        ? IMPORT_STATUSES.REVIEW
        : IMPORT_STATUSES.INCLUDED;
    const reason =
      classification.requiresReview && classification.categoryKey === "incidentals"
        ? "incidentals require confirmation"
        : duplicateReason ||
          (classification.confidence === IMPORT_CONFIDENCE.LOW
            ? "low confidence"
            : classification.reason);

    return {
      ...base,
      categoryKey: classification.categoryKey,
      confidence: classification.confidence,
      reason,
      status,
    };
  });
}
