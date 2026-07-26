<script lang="ts">
  import { t, categoryLabel } from "$lib/stores/i18n";
  import { appState } from "$lib/stores/budget";
  import type { ResolvedCategory } from "$lib/normalize";
  import { formatMoney, formatDateRangeDisplay, numberOrZero, roundCurrency } from "$lib/format";
  import { currentView } from "$lib/stores/router";
  import { monthDateRanges } from "$lib/period";
  import { buildImportRows, parseBalanceHints, stripBalanceHintLines } from "$lib/import/parser";
  import { buildPersistedImportTransactions, mergeTransactions, aggregateImportRows } from "$lib/import/apply";
  import { buildUserRules, promptMerchantRuleChoice } from "$lib/merchantRules";
  import { importStatus, setImportStatus } from "$lib/stores/ui";
  import {
    IMPORT_STATUSES,
    IMPORT_CONFIDENCE,
    createEmptyImportDraft,
    type ImportDraft,
    type ImportRow,
    type ImportStatus,
    type BalanceHints,
    type AggregatedImport,
  } from "$lib/import/types";
  import type { Transaction } from "$shared/types";

  interface Props {
    periodStart: string;
    periodEnd: string;
    monthId: string;
    weekId: string | undefined;
    workspaceId: string;
    existingTransactions: Transaction[];
    periodTotal: number;
    categories: ResolvedCategory[];
    onApply: (totals: AggregatedImport, transactions: Transaction[]) => void;
    onBalanceHints: (hints: BalanceHints) => void;
    onIncludedChange?: (hasIncluded: boolean) => void;
  }
  let {
    periodStart,
    periodEnd,
    monthId,
    weekId,
    workspaceId,
    existingTransactions,
    periodTotal,
    categories,
    onApply,
    onBalanceHints,
    onIncludedChange,
  }: Props = $props();

  let importText = $state("");
  let draft = $state<ImportDraft>(createEmptyImportDraft());
  let lastResetKey = $state("");
  const showStatus = setImportStatus;

  // Reset the draft + textarea when the edited period changes.
  $effect(() => {
    if (lastResetKey !== weekId) {
      lastResetKey = weekId ?? "";
      importText = "";
      draft = createEmptyImportDraft();
    }
  });

  // Clear the paste box when leaving the entry view (app.js switchView behavior).
  $effect(() => {
    if ($currentView !== "entry" && importText) importText = "";
  });

  function monthExistsForImportDate(dateIso: string): boolean {
    const yearMonth = dateIso.slice(0, 7);
    const periodMonths = new Set([periodStart?.slice(0, 7), periodEnd?.slice(0, 7)].filter(Boolean));
    if (periodMonths.has(yearMonth)) return true;
    return Object.values($appState.months).some((month) =>
      monthDateRanges(month).some((item) => dateIso >= item.start && dateIso <= item.end),
    );
  }

  function parse() {
    const source = importText || "";
    if (!source.trim()) {
      showStatus($t("importParseEmpty"));
      return;
    }
    const balanceHints = parseBalanceHints(source);
    onBalanceHints(balanceHints);
    if (!periodStart || !periodEnd) {
      showStatus($t("importNeedsPeriod"));
      return;
    }
    const rows = buildImportRows(source, {
      range: { start: periodStart, end: periodEnd },
      userRules: buildUserRules($appState),
      monthExistsForImportDate,
    });
    draft = { rows, activeTab: IMPORT_STATUSES.INCLUDED, parsed: true, appliedWeekId: "", appliedTransactions: [] };
    void stripBalanceHintLines; // (source already handled inside buildImportRows)
    if (balanceHints.available !== null || balanceHints.unpaid !== null) {
      showStatus($t("importBalancesUpdated"));
    }
  }

  function setTab(tab: ImportStatus) {
    draft = { ...draft, activeTab: tab };
  }

  function includeRow(id: string) {
    draft = {
      ...draft,
      rows: draft.rows.map((row) =>
        row.id === id
          ? {
              ...row,
              status: IMPORT_STATUSES.INCLUDED,
              reason:
                row.reason === "low confidence" || row.reason === "incidentals require confirmation" ? "" : row.reason,
            }
          : row,
      ),
    };
  }

  function changeCategory(row: ImportRow, value: string) {
    const previousCategoryKey = row.categoryKey;
    draft = {
      ...draft,
      rows: draft.rows.map((r) =>
        r.id === row.id
          ? {
              ...r,
              categoryKey: value,
              reason:
                r.status === IMPORT_STATUSES.REVIEW && r.confidence !== IMPORT_CONFIDENCE.LOW && value !== "incidentals"
                  ? ""
                  : r.reason,
            }
          : r,
      ),
    };
    const updated = draft.rows.find((r) => r.id === row.id);
    if (updated) void promptMerchantRuleChoice(updated, previousCategoryKey);
  }

  function applyImport() {
    const included = draft.rows.filter((row) => row.status === IMPORT_STATUSES.INCLUDED);
    if (!included.length) return;
    const totals = aggregateImportRows(included, categories);
    const persisted = buildPersistedImportTransactions(included, {
      monthId,
      periodId: weekId ?? "",
      workspaceId,
    });
    const merged = mergeTransactions(existingTransactions, persisted);
    onApply(totals, merged);
    draft = { ...draft, appliedWeekId: weekId ?? "", appliedTransactions: merged };
    showStatus($t("importApplied", included.length));
  }

  const summary = $derived({
    included: summarize(IMPORT_STATUSES.INCLUDED),
    review: summarize(IMPORT_STATUSES.REVIEW),
    excluded: summarize(IMPORT_STATUSES.EXCLUDED),
  });
  function summarize(status: ImportStatus) {
    const rows = draft.rows.filter((r) => r.status === status);
    return { count: rows.length, amount: roundCurrency(rows.reduce((t2, r) => t2 + numberOrZero(r.expenseAmount), 0)) };
  }

  const visibleRows = $derived(draft.rows.filter((row) => row.status === draft.activeTab));

  // Report included-row presence to the parent (drives the mobile save bar's Apply button).
  $effect(() => {
    const hasPendingIncludedRows =
      draft.parsed &&
      draft.appliedWeekId !== (weekId ?? "") &&
      draft.rows.some((row) => row.status === IMPORT_STATUSES.INCLUDED);
    onIncludedChange?.(hasPendingIncludedRows);
  });

  // importWarningMessages (app.js 5139) — needs the hidden totals off aggregate.
  const warnings = $derived.by(() => {
    if (!draft.parsed) return [] as string[];
    const included = draft.rows.filter((row) => row.status === IMPORT_STATUSES.INCLUDED);
    if (!included.length) return [] as string[];
    const totals = aggregateImportRows(included, categories) as AggregatedImport & {
      importedTotal: number;
      groceryTotal: number;
      nonGroceryTotal: number;
      incidentalsTotal: number;
    };
    const out: string[] = [];
    if (Math.abs(totals.importedTotal - periodTotal) >= 0.01) {
      out.push($t("importBalanceWarning", formatMoney(totals.importedTotal), formatMoney(periodTotal)));
    }
    const residualGrocery = roundCurrency(periodTotal - totals.nonGroceryTotal - totals.incidentalsTotal);
    if (Math.abs(totals.groceryTotal - residualGrocery) >= 0.01) {
      out.push($t("importGroceryWarning", formatMoney(totals.groceryTotal), formatMoney(residualGrocery)));
    }
    return out;
  });

  function confidenceLabel(value: string): string {
    if (value === IMPORT_CONFIDENCE.HIGH) return $t("confidenceHigh");
    if (value === IMPORT_CONFIDENCE.MEDIUM) return $t("confidenceMedium");
    return $t("confidenceLow");
  }
  function reasonLabel(reason: string): string {
    if (!reason) return "-";
    const labels = $t("reasonLabels") as unknown as Record<string, string>;
    return (labels && labels[reason]) || reason;
  }

  const TABS: { key: ImportStatus; label: string }[] = [
    { key: IMPORT_STATUSES.INCLUDED, label: "includedRows" },
    { key: IMPORT_STATUSES.REVIEW, label: "needsReviewRows" },
    { key: IMPORT_STATUSES.EXCLUDED, label: "excludedRows" },
  ];

  export function hasIncludedRows(): boolean {
    return (
      draft.parsed &&
      draft.appliedWeekId !== (weekId ?? "") &&
      draft.rows.some((row) => row.status === IMPORT_STATUSES.INCLUDED)
    );
  }
  export function applyFromParent() {
    applyImport();
  }
</script>

<section class="panel transaction-import-panel">
  <div class="panel-head">
    <div>
      <h3>{$t("transactionImportTitle")}</h3>
      <p>{$t("transactionImportSub")}</p>
    </div>
  </div>
  <div class="import-period-line">
    <span>{$t("currentPeriod")}</span>
    <strong id="importPeriodLabel">{periodStart && periodEnd ? formatDateRangeDisplay(periodStart, periodEnd) : "-"}</strong>
  </div>
  <label class="field import-input-field">
    <span>{$t("pasteTransactions")}</span>
    <textarea
      id="transactionImportInput"
      rows="5"
      placeholder={'20/06/2026,"-36.35","COLES 7735 DONCASTER VIC",""'}
      bind:value={importText}
    ></textarea>
  </label>
  <div class="import-actions">
    <button id="parseImportBtn" class="secondary-btn" type="button" onclick={parse}>{$t("parseTransactions")}</button>
    <p id="importStatus" class="save-status" class:hidden={!$importStatus} aria-live="polite">{$importStatus}</p>
  </div>

  <div id="importSummary" class="import-summary" class:hidden={!draft.parsed} aria-live="polite">
    <article class="import-summary-item">
      <span>{$t("includedRows")}</span>
      <strong>{$t("importSummaryLine", summary.included.count, formatMoney(summary.included.amount))}</strong>
    </article>
    <article class="import-summary-item">
      <span>{$t("needsReviewRows")}</span>
      <strong>{$t("importSummaryLine", summary.review.count, formatMoney(summary.review.amount))}</strong>
    </article>
    <article class="import-summary-item">
      <span>{$t("excludedRows")}</span>
      <strong>{summary.excluded.count}</strong>
    </article>
  </div>

  <div id="importWarning" class="import-warning" class:hidden={warnings.length === 0} aria-live="polite">
    {#each warnings as warning}<p>{warning}</p>{/each}
  </div>

  <div id="importReview" class="import-review" class:hidden={!draft.parsed}>
    <div class="import-tabs" role="tablist" aria-label="Transaction import review">
      {#each TABS as tab (tab.key)}
        <button
          id={tab.key === "included" ? "importTabIncluded" : tab.key === "review" ? "importTabReview" : "importTabExcluded"}
          class="import-tab"
          class:active={draft.activeTab === tab.key}
          type="button"
          role="tab"
          aria-selected={draft.activeTab === tab.key}
          aria-controls="importRows"
          tabindex={draft.activeTab === tab.key ? 0 : -1}
          data-import-tab={tab.key}
          onclick={() => setTab(tab.key)}
        >
          {$t(tab.label)}
        </button>
      {/each}
    </div>
    <div id="importRows" class="import-rows" role="tabpanel" tabindex="0">
      {#if visibleRows.length === 0}
        <div class="import-empty">{$t("noImportRows")}</div>
      {:else}
        {#each visibleRows as row (row.id)}
          <article
            class="import-row-card"
            class:import-row-review={row.status === "review"}
            class:import-row-excluded={row.status === "excluded"}
            data-import-row-id={row.id}
          >
            <div class="import-cell"><span>{$t("period")}</span><strong>{row.displayDate}</strong></div>
            <div class="import-cell"><span>{$t("merchantDescription")}</span><p>{row.description}</p></div>
            <div class="import-cell">
              <span>{$t("amount")}</span><strong>{formatMoney(row.expenseAmount || Math.abs(row.amount || 0))}</strong>
            </div>
            <div class="import-cell">
              <span>{$t("suggestedCategory")}</span>
              <select
                data-import-category
                disabled={row.status === "excluded"}
                value={row.categoryKey}
                onchange={(e) => changeCategory(row, (e.currentTarget as HTMLSelectElement).value)}
              >
                <option value="grocery">{$t("grocery")}</option>
                {#each categories as category (category.key)}
                  <option value={category.key}>{$categoryLabel(category.key)}</option>
                {/each}
              </select>
            </div>
            <div class="import-cell">
              <span>{$t("confidence")}</span><p>{confidenceLabel(row.confidence)}</p>
              <span>{$t("reason")}</span><p>{reasonLabel(row.reason)}</p>
              {#if row.status === "review"}
                <div class="import-row-actions">
                  <button class="ghost-btn" type="button" data-import-action="include" onclick={() => includeRow(row.id)}>
                    {$t("includeTransaction")}
                  </button>
                </div>
              {/if}
            </div>
          </article>
        {/each}
      {/if}
    </div>
  </div>
</section>
