import type { Transaction } from "$shared/types";
import type { PeriodRange } from "$lib/format";

export const IMPORT_STATUSES = {
  INCLUDED: "included",
  REVIEW: "review",
  EXCLUDED: "excluded",
} as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[keyof typeof IMPORT_STATUSES];

export const IMPORT_CONFIDENCE = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;
export type ImportConfidence = (typeof IMPORT_CONFIDENCE)[keyof typeof IMPORT_CONFIDENCE];

export interface ImportRow {
  id: string;
  sourceLine: string;
  dateIso: string;
  displayDate: string;
  amount: number;
  expenseAmount: number;
  description: string;
  normalizedMerchant: string;
  categoryKey: string;
  confidence: ImportConfidence;
  reason: string;
  status: ImportStatus;
}

export interface ImportDraft {
  rows: ImportRow[];
  activeTab: ImportStatus;
  parsed: boolean;
  appliedWeekId: string;
  appliedTransactions: Transaction[];
}

export interface BalanceHints {
  available: number | null;
  unpaid: number | null;
}

export interface ClassifyResult {
  categoryKey: string;
  confidence: ImportConfidence;
  reason: string;
  requiresReview: boolean;
}

// A user-defined merchant category rule (workspace-scoped, stored on appState.merchantRules).
export interface MerchantRule {
  merchantKey: string;
  categoryKey: string;
  [key: string]: unknown;
}

// Context the parser needs, injected by the caller so the parser stays state-free.
export interface ParseContext {
  range: PeriodRange;
  userRules: MerchantRule[];
  // True when the ISO date falls inside an already-existing month's period ranges
  // OTHER than the one being imported (mirrors monthExistsForImportDate).
  monthExistsForImportDate: (dateIso: string) => boolean;
}

export interface ApplyContext {
  monthId: string;
  periodId: string;
  workspaceId: string;
}

export interface AggregatedImport {
  categoryValues: Record<string, number>;
  incidentalNotes: string[];
}

export function createEmptyImportDraft(): ImportDraft {
  return { rows: [], activeTab: IMPORT_STATUSES.INCLUDED, parsed: false, appliedWeekId: "", appliedTransactions: [] };
}
