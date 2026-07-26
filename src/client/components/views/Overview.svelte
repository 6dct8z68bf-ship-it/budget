<script lang="ts">
  import { t, categoryLabel } from "$lib/stores/i18n";
  import { appState, currentMonth, currentMonthId, currentWeekId, saveState } from "$lib/stores/budget";
  import { currentView, switchView } from "$lib/stores/router";
  import { computedWeeks, monthlyTrendRows, buildDecision, type StatusKind } from "$lib/overview";
  import { categoryDefinitions, monthDisplayName } from "$lib/normalize";
  import { formatPeriodDisplay } from "$lib/format";
  import { numberOrZero } from "$lib/format";
  import DecisionCard from "$components/overview/DecisionCard.svelte";
  import KpiGrid from "$components/overview/KpiGrid.svelte";
  import PeriodRecords from "$components/overview/PeriodRecords.svelte";
  import Charts from "$components/overview/Charts.svelte";
  import MonthControls from "$components/overview/MonthControls.svelte";
  import { registerDecisionKind } from "$lib/debug";

  const month = $derived($currentMonth);
  const rows = $derived(month ? computedWeeks(month, $appState) : []);
  const completedRows = $derived(rows.filter((r) => r.week.cumulativeSpend !== null));
  const hasCompletedWeeks = $derived(completedRows.length > 0);
  const latest = $derived(completedRows[completedRows.length - 1] || rows[0]);
  const nextEntryRow = $derived(rows.find((r) => r.week.cumulativeSpend === null) || rows[rows.length - 1]);
  const trendRows = $derived(monthlyTrendRows($appState));
  const overviewCategories = $derived(categoryDefinitions($appState.categorySettings, { includeArchived: true }));

  const driverLabel = (key: string) => {
    if (key === "grocery") return $t("grocery");
    const category = overviewCategories.find((item) => item.key === key);
    if (category?.source === "system" && !$appState.categorySettings?.labelOverrides?.[key]) {
      return $categoryLabel(key);
    }
    return category?.label || $categoryLabel(key);
  };
  const decision = $derived(month ? buildDecision($appState, month, rows, $t, driverLabel) : null);
  const decisionKind: StatusKind = $derived(decision?.kind ?? "empty");

  // Publish the current month's decision status kind for the trend chart + e2e diagnostics.
  registerDecisionKind(() => decisionKind);

  const STATUS_TEXT: Record<StatusKind, { title: string; copy: string }> = $derived({
    empty: { title: $t("statusNoData"), copy: $t("statusNoDataCopy") },
    good: { title: $t("statusOnTrack"), copy: $t("statusOnTrackCopy") },
    watch: { title: $t("statusWatch"), copy: $t("statusWatchCopy") },
    over: { title: $t("statusOver"), copy: $t("statusOverCopy") },
  });

  const importPeriodLabel = $derived(
    nextEntryRow
      ? `P${rows.indexOf(nextEntryRow) + 1} · ${formatPeriodDisplay(nextEntryRow.week.period) || $t("unnamedPeriod")}`
      : "-",
  );

  function openEntryForWeek(weekId: string) {
    currentWeekId.set(weekId);
    switchView("entry");
  }

  function openNextEntry() {
    if (nextEntryRow) openEntryForWeek(nextEntryRow.week.id);
  }

  function selectMonth(monthId: string) {
    if (!$appState.months[monthId]) return;
    currentMonthId.set(monthId);
    currentWeekId.set($appState.months[monthId].weeks[0]?.id);
    saveState();
  }
</script>

<section class="view overview-flow-shell" class:active={$currentView === "overview"} id="overviewView">
  <div class="overview-story-intro">
    <div class="overview-story-heading">
      <p class="eyebrow">{$t("overviewAtGlance")}</p>
      <h2>{$t("overviewHeadline")}</h2>
    </div>
    <div class="overview-month-chip">
      <div class="overview-month-label">
        <p class="eyebrow">{$t("currentMonth")}</p>
        <h2 id="overviewTitle" class="visually-hidden">{monthDisplayName(month)}</h2>
      </div>
      <MonthControls />
    </div>
  </div>

  {#if decision}
    <section class="overview-decision" aria-live="polite">
      <DecisionCard
        kind={decisionKind}
        title={STATUS_TEXT[decisionKind].title}
        copy={STATUS_TEXT[decisionKind].copy}
        metricsLine={decision.metricsLine}
        driverLine={decision.driverLine}
        nextAction={decision.nextAction}
        onOpenEntry={openNextEntry}
      />
      <KpiGrid
        limit={month?.creditLimit ?? 0}
        monthSpend={latest?.cumulativeSpend ?? 0}
        available={numberOrZero(latest?.week.availableBalance ?? month?.creditLimit)}
        weekSpend={latest?.weeklyTotal ?? 0}
      />
    </section>
  {/if}

  <section id="overviewPeriodsPanel" class="overview-flow-section overview-periods-panel">
    <div class="panel-head overview-section-head">
      <div>
        <p class="eyebrow">{$t("monthWeeks")}</p>
        <h3>{$t("overviewPeriodsTitle")}</h3>
        <p>{$t("overviewPeriodsSub")}</p>
      </div>
    </div>
    <PeriodRecords {rows} currentWeekId={$currentWeekId} onSelect={openEntryForWeek} />
  </section>

  <section id="overviewImportPanel" class="overview-import-panel overview-flow-section">
    <div class="overview-import-copy">
      <p class="eyebrow">{$t("transactionImportTitle")}</p>
      <h3>{$t("overviewImportTitle")}</h3>
      <p>{$t("transactionImportSub")}</p>
      <div class="overview-import-meta">
        <span>{$t("currentPeriod")}</span>
        <strong id="overviewImportPeriod">{importPeriodLabel}</strong>
      </div>
      <button id="overviewImportBtn" class="primary-btn" type="button" data-overview-action="open-entry" onclick={openNextEntry}>
        {$t("openImportFlow")}
      </button>
    </div>
    <div class="overview-import-steps" aria-label="Transaction import steps">
      <span><b>1</b><span>{$t("overviewImportStepPaste")}</span></span>
      <span><b>2</b><span>{$t("overviewImportStepReview")}</span></span>
      <span><b>3</b><span>{$t("overviewImportStepSave")}</span></span>
    </div>
  </section>

  <Charts
    {rows}
    monthName={monthDisplayName(month)}
    {trendRows}
    currentMonthId={$currentMonthId}
    {decisionKind}
    {hasCompletedWeeks}
    onSelectWeek={openEntryForWeek}
    onSelectMonth={selectMonth}
  />
</section>
