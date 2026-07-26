// Port of normalizeState + its month/period/transaction helper tree from app.js
// (1402-1470, 2264-2377, 4761-4789). This is the single client-side normalizer that
// the POST /api/state round-trip depends on, so keep the shape identical.
import { BUDGET_DATA, CREDIT_LIMIT } from "$shared/budget-data";
import type { BudgetState, Category, CategorySettings, Month, Week, Transaction } from "$shared/types";
import type { PeriodRange } from "$lib/format";
import {
  numberOrZero,
  numberOrNull,
  roundCurrency,
  parsePeriodRange,
  toIsoDate,
  normalizeYear,
  normalizeMerchant,
  monthLongName,
  createId,
} from "$lib/format";

export const DEFAULT_PERIOD_LABELS = ["Period 1", "Period 2", "Period 3", "Period 4"];

export const DEFAULT_CATEGORY_SETTINGS: CategorySettings = {
  version: 1,
  customCategories: [],
  archivedCategoryKeys: [],
  labelOverrides: {},
  hintOverrides: {},
};

const CATEGORY_KEY_PATTERN = /^[a-z][a-zA-Z0-9_]*$/;
const RESERVED_CATEGORY_KEYS = new Set(["grocery"]);

export function isValidCustomCategoryKey(value: unknown): boolean {
  return CATEGORY_KEY_PATTERN.test(String(value || "").trim());
}

export function normalizeCategorySettings(input: unknown): CategorySettings {
  const raw = input && typeof input === "object" ? (input as Partial<CategorySettings>) : {};
  const systemKeys = new Set(BUDGET_DATA.categories.map((category) => category.key));
  const customCategories: Category[] = [];
  const customKeys = new Set<string>();

  if (Array.isArray(raw.customCategories)) {
    raw.customCategories.forEach((candidate) => {
      if (!candidate || typeof candidate !== "object") return;
      const category = candidate as Partial<Category>;
      const key = String(category.key || "").trim();
      const label = String(category.label || "").trim();
      const type = category.type === "incidental" ? "incidental" : category.type === "nonGrocery" ? "nonGrocery" : "";
      if (
        !isValidCustomCategoryKey(key) ||
        systemKeys.has(key) ||
        RESERVED_CATEGORY_KEYS.has(key) ||
        customKeys.has(key) ||
        !label ||
        !type
      ) return;
      customKeys.add(key);
      customCategories.push({ key, label, type, hint: String(category.hint || "").trim() });
    });
  }

  const knownKeys = new Set([...systemKeys, ...customKeys]);
  const archivedCategoryKeys = Array.isArray(raw.archivedCategoryKeys)
    ? Array.from(new Set(raw.archivedCategoryKeys.map((key) => String(key || "").trim()).filter((key) => knownKeys.has(key))))
    : [];

  const normalizeOverrides = (value: unknown): Record<string, string> => {
    if (!value || typeof value !== "object") return {};
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((result, [key, text]) => {
      const normalizedKey = String(key || "").trim();
      const normalizedText = String(text || "").trim();
      if (knownKeys.has(normalizedKey) && normalizedText) result[normalizedKey] = normalizedText;
      return result;
    }, {});
  };

  return {
    version: 1,
    customCategories,
    archivedCategoryKeys,
    labelOverrides: normalizeOverrides(raw.labelOverrides),
    hintOverrides: normalizeOverrides(raw.hintOverrides),
  };
}

export interface ResolvedCategory extends Category {
  source: "system" | "custom";
  archived: boolean;
}

export function categoryDefinitions(
  settings: CategorySettings | undefined,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): ResolvedCategory[] {
  const normalized = normalizeCategorySettings(settings);
  const archived = new Set(normalized.archivedCategoryKeys);
  const resolve = (category: Category, source: "system" | "custom"): ResolvedCategory => ({
    ...category,
    label: normalized.labelOverrides[category.key] || category.label,
    hint: normalized.hintOverrides[category.key] || category.hint,
    source,
    archived: archived.has(category.key),
  });
  const all = [
    ...BUDGET_DATA.categories.map((category) => resolve(category, "system")),
    ...normalized.customCategories.map((category) => resolve(category, "custom")),
  ];
  return includeArchived ? all : all.filter((category) => !category.archived);
}

// === month sort keys / display ===
export function validMonthSortKey(value: unknown): boolean {
  return /^\d{4}-\d{2}$/.test(String(value || ""));
}

function formatMonthSortKey(year: number, month: number): string {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return "";
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthTokenToNumber(token: unknown): number {
  const text = String(token || "").trim();
  if (!text) return 0;
  if (/^\d{1,2}$/.test(text)) {
    const value = Number(text);
    return value >= 1 && value <= 12 ? value : 0;
  }
  const short = text.slice(0, 3).toLowerCase();
  return (
    { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 } as Record<string, number>
  )[short] || 0;
}

export function formatMonthDisplay(sortKey: string): string {
  if (!validMonthSortKey(sortKey)) return "";
  const [yearText, monthText] = sortKey.split("-");
  return `${yearText} ${monthLongName(Number(monthText))}`;
}

function isLegacyGeneratedMonthName(value: unknown): boolean {
  const text = String(value || "").trim();
  return (
    /^\d{4}\s+\d{1,2}(?:-\d{1,2})?$/.test(text) ||
    /^\d{4}\s+[A-Za-z]+(?:-[A-Za-z]+)?$/.test(text)
  );
}

export function parseFlexiblePeriodRange(period: string, monthName: string): PeriodRange {
  const iso = parsePeriodRange(period);
  if (iso.start && iso.end) return iso;
  const match = String(period || "").match(
    /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:-|to|至)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i,
  );
  if (!match) return { start: "", end: "" };
  const fallbackYear = Number(String(monthName || "").match(/20\d{2}/)?.[0]) || new Date().getFullYear();
  const startYear = normalizeYear(match[3], fallbackYear);
  let endYear = normalizeYear(match[6], startYear);
  if (!match[6] && Number(match[5]) < Number(match[2])) endYear += 1;
  return {
    start: toIsoDate(startYear, Number(match[2]), Number(match[1])),
    end: toIsoDate(endYear, Number(match[5]), Number(match[4])),
  };
}

export function monthDisplayName(month: Partial<Month> | null | undefined): string {
  return (
    month?.displayName?.trim() ||
    month?.name?.trim() ||
    formatMonthDisplay(inferMonthSortKey(month)) ||
    ""
  );
}

function monthDateRanges(month: Month): PeriodRange[] {
  const ranges: PeriodRange[] = [];
  month.weeks.forEach((week) => {
    const range = parseFlexiblePeriodRange(week.period, monthDisplayName(month));
    if (range.start && range.end) ranges.push(range);
  });
  return ranges;
}

export function inferMonthSortKey(month: Partial<Month> | null | undefined): string {
  if (validMonthSortKey(month?.sortKey)) return month!.sortKey as string;
  if (validMonthSortKey(month?.displayName)) return month!.displayName as string;

  const label = String(month?.displayName || month?.name || "").trim();
  let match = label.match(/^(\d{4})\s+([A-Za-z]+)(?:\s*-\s*([A-Za-z]+))?$/);
  if (match) {
    const year = Number(match[1]);
    const monthNumber = monthTokenToNumber(match[3] || match[2]);
    return formatMonthSortKey(year, monthNumber);
  }
  match = label.match(/^(\d{4})\s+(\d{1,2})(?:-(\d{1,2}))?$/);
  if (match) {
    const year = Number(match[1]);
    const monthNumber = Number(match[3] || match[2]);
    return formatMonthSortKey(year, monthNumber);
  }

  const idText = String(month?.id || "");
  match = idText.match(/^(\d{4})-(\d{2})$/);
  if (match) return formatMonthSortKey(Number(match[1]), Number(match[2]));
  match = idText.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:-|$)/);
  if (match) return formatMonthSortKey(Number(match[1]), Number(match[3]));

  const ranges = month?.weeks ? monthDateRanges(month as Month) : [];
  const latestRange = ranges[ranges.length - 1];
  if (latestRange?.end) return latestRange.end.slice(0, 7);

  const today = new Date();
  return formatMonthSortKey(today.getFullYear(), today.getMonth() + 1);
}

export function ensureMonthMetadata(month: Month): void {
  month.sortKey = inferMonthSortKey(month);
  month.displayName = month.displayName?.trim() || formatMonthDisplay(month.sortKey);
  if (!month.name || isLegacyGeneratedMonthName(month.name)) {
    month.name = month.displayName;
  }
}

export function compareMonths(a: Month, b: Month): number {
  const aKey = inferMonthSortKey(a);
  const bKey = inferMonthSortKey(b);
  if (aKey !== bKey) return aKey.localeCompare(bKey);
  return monthDisplayName(a).localeCompare(monthDisplayName(b));
}

// === period label / week / transactions ===
export function normalizePeriodLabel(period: unknown, index: number): string {
  const text = String(period || "").trim();
  if (!text) return DEFAULT_PERIOD_LABELS[index] || "";
  if (/^(week|period)\s*\d+$/i.test(text) || /^第[一二三四1234]週$/.test(text)) {
    return DEFAULT_PERIOD_LABELS[index] || text;
  }
  return text;
}

export function normalizeTransactions(transactions: unknown): Transaction[] {
  if (!Array.isArray(transactions)) return [];
  return transactions
    .map((transaction) => {
      const expenseAmount = roundCurrency(
        Math.abs(numberOrZero(transaction?.expenseAmount) || numberOrZero(transaction?.amount)),
      );
      return {
        id: transaction?.id || createId(),
        dateIso: String(transaction?.dateIso || "").trim(),
        amount: numberOrZero(transaction?.amount),
        expenseAmount,
        description: String(transaction?.description || "").trim(),
        normalizedMerchant: normalizeMerchant(transaction?.normalizedMerchant || transaction?.description || ""),
        categoryKey: String(transaction?.categoryKey || "").trim(),
        periodId: String(transaction?.periodId || "").trim(),
        monthId: String(transaction?.monthId || "").trim(),
        workspaceId: String(transaction?.workspaceId || "").trim(),
        createdAt: String(transaction?.createdAt || "").trim(),
        updatedAt: String(transaction?.updatedAt || "").trim(),
        source: String(transaction?.source || "import").trim(),
      } satisfies Transaction;
    })
    .filter((transaction) => transaction.dateIso && transaction.expenseAmount > 0);
}

export function createWeek(input: Partial<Week> = {}): Week {
  return {
    id: input.id || createId(),
    period: input.period || "",
    availableBalance: numberOrNull(input.availableBalance),
    unpaidPrevious: numberOrNull(input.unpaidPrevious),
    cumulativeSpend: numberOrNull(input.cumulativeSpend),
    categoryValues: { ...(input.categoryValues || {}) },
    notes: input.notes || "",
    transactions: normalizeTransactions(input.transactions),
  };
}

export function normalizeState(state: unknown): BudgetState {
  const fallback = structuredClone(BUDGET_DATA.initialState);
  const next: BudgetState =
    state && (state as BudgetState).months ? (state as BudgetState) : fallback;
  Object.values(next.months).forEach((month) => {
    ensureMonthMetadata(month);
    month.creditLimit = numberOrZero(month.creditLimit) || CREDIT_LIMIT;
    month.weeks = Array.isArray(month.weeks)
      ? month.weeks.map((week, index) =>
          createWeek({ ...week, period: normalizePeriodLabel(week.period, index) }),
        )
      : [];
    if (month.weeks.length === 0) {
      month.weeks = DEFAULT_PERIOD_LABELS.map((period) =>
        createWeek({ period, availableBalance: month.creditLimit }),
      );
    }
  });
  if (!next.currentMonthId || !next.months[next.currentMonthId]) {
    next.currentMonthId = Object.values(next.months).sort(compareMonths)[0]?.id;
  }
  next.categorySettings = normalizeCategorySettings(next.categorySettings);
  if (!Array.isArray(next.merchantRules)) next.merchantRules = [];
  return next;
}
