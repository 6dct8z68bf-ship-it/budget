// Shared budget domain types. The Node server (CommonJS, untyped) round-trips this
// exact shape through GET/POST /api/state, so keep it in sync with the server's
// normalizeState output and the seed in budget-data.json.

export type CategoryType = "nonGrocery" | "incidental";

export interface Category {
  key: string;
  label: string;
  type: CategoryType;
  hint: string;
}

export interface CategorySettings {
  version: 1;
  customCategories: Category[];
  archivedCategoryKeys: string[];
  labelOverrides: Record<string, string>;
  hintOverrides: Record<string, string>;
}

// Shape produced by normalizeTransactions() in the original app.js.
export interface Transaction {
  id: string;
  dateIso: string;
  amount: number;
  expenseAmount: number;
  description: string;
  normalizedMerchant: string;
  categoryKey: string;
  periodId: string;
  monthId: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  source: string;
}

export interface Week {
  id: string;
  period: string;
  availableBalance: number | null;
  unpaidPrevious: number | null;
  cumulativeSpend: number | null;
  categoryValues: Record<string, number>;
  notes: string;
  transactions?: Transaction[];
}

export interface Month {
  id: string;
  name: string;
  creditLimit: number;
  weeks: Week[];
  // Derived metadata added by ensureMonthMetadata().
  sortKey?: string;
  displayName?: string;
}

// User-defined merchant category rule stored on appState.merchantRules (app.js
// saveMerchantRule). classifyTransaction matches on merchantNormalized.
export interface MerchantRule {
  id: string;
  merchantRawExample: string;
  merchantNormalized: string;
  categoryKey: string;
  matchType: string;
  createdFromTransactionId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BudgetState {
  currentMonthId: string;
  months: Record<string, Month>;
  categorySettings?: CategorySettings;
  merchantRules?: MerchantRule[];
}

export interface BudgetData {
  creditLimit: number;
  categories: Category[];
  initialState: BudgetState;
}
