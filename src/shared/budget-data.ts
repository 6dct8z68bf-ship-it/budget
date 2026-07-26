import raw from "./budget-data.json";
import type { BudgetData } from "./types";

// The source of truth for system category defaults, credit limit, and the seed/example
// state. Workspace-specific category settings are layered on by normalizeState(). The
// server reads the same budget-data.json directly (loadExampleState) so /api/reset and
// E2E reset stay in sync with the client.
export const BUDGET_DATA = raw as unknown as BudgetData;

export const CREDIT_LIMIT = BUDGET_DATA.creditLimit;
export const categories = BUDGET_DATA.categories;
