// FAITHFUL port of the import persistence + aggregation helpers from app.js
// (buildPersistedImportTransactions 4405, mergeTransactions 4429, aggregateImportRows
// 5156). Global state access (accountState/month/week) is replaced by an injected
// ApplyContext; all numeric/dedup/sort logic is preserved verbatim.
import { numberOrZero, roundCurrency, normalizeMerchant, createId, formatMoney } from "$lib/format";
import { normalizeTransactions } from "$lib/normalize";
import type { Category, Transaction } from "$shared/types";
import type { AggregatedImport, ApplyContext, ImportRow } from "./types";

export function buildPersistedImportTransactions(rows: ImportRow[], ctx: ApplyContext): Transaction[] {
  const workspaceId = ctx.workspaceId || "";
  const monthId = ctx.monthId || "";
  const periodId = ctx.periodId || "";
  const now = new Date().toISOString();
  return rows
    .filter((row) => numberOrZero(row.expenseAmount) > 0)
    .map((row) => ({
      id: row.id || createId(),
      dateIso: row.dateIso,
      amount: row.amount,
      expenseAmount: roundCurrency(row.expenseAmount),
      description: row.description || "",
      normalizedMerchant: row.normalizedMerchant || normalizeMerchant(row.description || ""),
      categoryKey: row.categoryKey || "",
      periodId,
      monthId,
      workspaceId,
      createdAt: now,
      updatedAt: now,
      source: "import",
    }));
}

export function mergeTransactions(existingTransactions: Transaction[], incomingTransactions: Transaction[]): Transaction[] {
  const merged: Transaction[] = [];
  const seenIds = new Set<string>();
  [...normalizeTransactions(existingTransactions), ...normalizeTransactions(incomingTransactions)].forEach((transaction) => {
    // Different real transactions may share the same date, merchant, and amount.
    // Only the stable transaction id identifies the same record.
    if (seenIds.has(transaction.id)) return;
    seenIds.add(transaction.id);
    merged.push(transaction);
  });
  return merged.sort((left, right) => {
    if (left.dateIso !== right.dateIso) return left.dateIso.localeCompare(right.dateIso);
    return left.description.localeCompare(right.description);
  });
}

// Accumulator shape from the original reduce. AggregatedImport exposes only
// categoryValues + incidentalNotes; the extra totals are computed exactly as before
// and remain available on the returned (structurally wider) object.
interface ImportTotals extends AggregatedImport {
  importedTotal: number;
  groceryTotal: number;
  nonGroceryTotal: number;
  incidentalsTotal: number;
}

export function aggregateImportRows(rows: ImportRow[], categories: Category[]): AggregatedImport {
  return rows.reduce<ImportTotals>(
    (totals, row) => {
      const amount = numberOrZero(row.expenseAmount);
      totals.importedTotal = roundCurrency(totals.importedTotal + amount);
      if (row.categoryKey === "grocery") {
        totals.groceryTotal = roundCurrency(totals.groceryTotal + amount);
      } else if (categories.find((category) => category.key === row.categoryKey)?.type === "incidental") {
        totals.incidentalsTotal = roundCurrency(totals.incidentalsTotal + amount);
        totals.categoryValues[row.categoryKey] = roundCurrency(numberOrZero(totals.categoryValues[row.categoryKey]) + amount);
        totals.incidentalNotes.push(`${row.displayDate} ${row.description} ${formatMoney(amount)}`);
      } else if (categories.some((category) => category.key === row.categoryKey)) {
        totals.nonGroceryTotal = roundCurrency(totals.nonGroceryTotal + amount);
        totals.categoryValues[row.categoryKey] = roundCurrency(numberOrZero(totals.categoryValues[row.categoryKey]) + amount);
      }
      return totals;
    },
    { importedTotal: 0, groceryTotal: 0, nonGroceryTotal: 0, incidentalsTotal: 0, categoryValues: {}, incidentalNotes: [] },
  );
}
