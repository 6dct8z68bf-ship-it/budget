// Merchant-rule memory ported from app.js (5040-5130). Rules live on
// appState.merchantRules (workspace-scoped, persisted). classifyTransaction matches on
// merchantNormalized; the parser context uses {merchantKey, categoryKey}.
import { get } from "svelte/store";
import { appState, saveState } from "$lib/stores/budget";
import { createId } from "$lib/format";
import { normalizeMerchantForKey } from "$lib/import/parser";
import { categoryDefinitions } from "$lib/normalize";
import { confirmDialog } from "$lib/stores/modal";
import { translate } from "$lib/i18n";
import { getLanguage, categoryLabel as categoryLabelStore } from "$lib/stores/i18n";
import type { BudgetState, MerchantRule } from "$shared/types";
import type { MerchantRule as CtxMerchantRule, ImportRow } from "$lib/import/types";

const t = (key: string, ...args: unknown[]) => translate(getLanguage(), key, ...args);

function categoryKeyLabel(key: string): string {
  if (key === "grocery") return t("grocery");
  const category = categoryDefinitions(get(appState).categorySettings, { includeArchived: true }).find((item) => item.key === key);
  if (category) {
    const override = get(appState).categorySettings?.labelOverrides?.[key];
    const label = override || (category.source === "system" ? get(categoryLabelStore)(key) : category.label);
    return category.archived ? `${label} (${t("categoryArchivedStatus")})` : label;
  }
  return get(categoryLabelStore)(key);
}

// Map stored rules → the {merchantKey, categoryKey} shape the parser context expects.
export function buildUserRules(state: BudgetState): CtxMerchantRule[] {
  const rules = Array.isArray(state.merchantRules) ? state.merchantRules : [];
  return rules.map((rule) => ({ merchantKey: rule.merchantNormalized, categoryKey: rule.categoryKey }));
}

export function findUserMerchantRule(state: BudgetState, description: string): MerchantRule | null {
  const rules = Array.isArray(state.merchantRules) ? state.merchantRules : [];
  const key = normalizeMerchantForKey(description);
  return rules.find((rule) => rule.merchantNormalized === key) || null;
}

export async function saveMerchantRule(input: {
  merchantRawExample: string;
  categoryKey: string;
  createdFromTransactionId?: string;
}): Promise<MerchantRule> {
  const now = new Date().toISOString();
  const rule: MerchantRule = {
    id: createId(),
    merchantRawExample: String(input.merchantRawExample || "").trim(),
    merchantNormalized: normalizeMerchantForKey(input.merchantRawExample),
    categoryKey: String(input.categoryKey || ""),
    matchType: "normalized",
    createdFromTransactionId: String(input.createdFromTransactionId || ""),
    createdAt: now,
    updatedAt: now,
  };
  appState.update((s) => {
    if (!Array.isArray(s.merchantRules)) s.merchantRules = [];
    s.merchantRules.push(rule);
    return s;
  });
  await saveState();
  return rule;
}

export async function updateMerchantRuleCategory(ruleId: string, categoryKey: string): Promise<void> {
  appState.update((s) => {
    const rule = s.merchantRules?.find((r) => r.id === ruleId);
    if (rule) {
      rule.categoryKey = String(categoryKey || "");
      rule.updatedAt = new Date().toISOString();
    }
    return s;
  });
  await saveState();
}

export async function deleteMerchantRule(ruleId: string): Promise<void> {
  appState.update((s) => {
    if (Array.isArray(s.merchantRules)) s.merchantRules = s.merchantRules.filter((r) => r.id !== ruleId);
    return s;
  });
  await saveState();
}

// Offer to remember/update a merchant→category rule when the user re-categorizes an
// import row (app.js promptMerchantRuleChoice).
export async function promptMerchantRuleChoice(row: ImportRow, previousCategoryKey: string): Promise<string | null> {
  if (!row?.description || !row.categoryKey) return null;
  if (row.categoryKey === previousCategoryKey) return null;
  const state = get(appState);
  const existingRule = findUserMerchantRule(state, row.description);
  const newCategoryLabel = categoryKeyLabel(row.categoryKey);

  if (existingRule) {
    if (existingRule.categoryKey === row.categoryKey) return null;
    const oldCategoryLabel = categoryKeyLabel(existingRule.categoryKey);
    const merchantDisplay = existingRule.merchantRawExample || row.description;
    const update = await confirmDialog(
      t("merchantRulesUpdateMessage", merchantDisplay, oldCategoryLabel, newCategoryLabel),
      { title: t("merchantRulesUpdateTitle"), tone: "default", confirmLabel: t("merchantRulesUpdate") },
    );
    if (update) await updateMerchantRuleCategory(existingRule.id, row.categoryKey);
    return update ? "remember" : null;
  }

  const remember = await confirmDialog(
    t("merchantRulesRememberMessage", row.description, newCategoryLabel),
    { title: t("merchantRulesRememberTitle"), tone: "default", confirmLabel: t("merchantRulesRemember") },
  );
  if (remember) {
    await saveMerchantRule({
      merchantRawExample: row.description,
      categoryKey: row.categoryKey,
      createdFromTransactionId: row.id,
    });
  }
  return remember ? "remember" : "only-this";
}
