<script lang="ts">
  import { tick } from "svelte";
  import { t, categoryLabel } from "$lib/stores/i18n";
  import { appState, currentMonth, currentWeek, currentMonthId, currentWeekId, saveState } from "$lib/stores/budget";
  import { accountState } from "$lib/stores/auth";
  import { currentView, switchView } from "$lib/stores/router";
  import { categoryDefinitions, createWeek, monthDisplayName } from "$lib/normalize";
  import type { ResolvedCategory } from "$lib/normalize";
  import { computedWeeks, sumNonGrocery, samePeriodComparison, samePeriodComparisonRow, topPeriodSpendingDrivers } from "$lib/overview";
  import {
    computeCumulativeFromAvailable,
    editingRangeForWeek,
    applySafePeriodDateCascade,
    timelineDiagnostic,
    formatPeriodRangeValue,
  } from "$lib/period";
  import { formatMoney, numberOrZero, numberOrNull, valueForInput } from "$lib/format";
  import { confirmDialog } from "$lib/stores/modal";
  import { setImportStatus } from "$lib/stores/ui";
  import type { AggregatedImport, BalanceHints } from "$lib/import/types";
  import type { Transaction, Week } from "$shared/types";
  import ImportPanel from "$components/entry/ImportPanel.svelte";

  // --- form state ---
  let availableBalance = $state("");
  let unpaidPrevious = $state("");
  let notes = $state("");
  let periodStart = $state("");
  let periodEnd = $state("");
  let categoryValues = $state<Record<string, string>>({});
  let incidentalsOpen = $state(false);
  let appliedTransactions = $state<Transaction[]>([]);
  let appliedWeekId = $state("");
  let loadedWeekId = $state<string | null>(null);
  let importPanel = $state<ImportPanel | null>(null);
  let categorySection = $state<HTMLElement | null>(null);
  let saveToast = $state("");
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  const month = $derived($currentMonth);
  const week = $derived($currentWeek);
  const weekIndex = $derived(month ? month.weeks.findIndex((w) => w.id === $currentWeekId) : -1);
  const workspaceId = $derived($accountState?.currentWorkspace?.id ?? "");
  const allCategories = $derived(categoryDefinitions($appState.categorySettings, { includeArchived: true }));
  const activeCategories = $derived(allCategories.filter((category) => !category.archived));
  const visibleCategories = $derived(
    allCategories.filter(
      (category) =>
        !category.archived ||
        numberOrZero(week?.categoryValues?.[category.key]) !== 0 ||
        (week?.transactions || []).some((transaction) => transaction.categoryKey === category.key),
    ),
  );

  function categoryLabelFor(category: ResolvedCategory): string {
    const override = $appState.categorySettings?.labelOverrides?.[category.key];
    if (override) return override;
    return category.source === "system" ? $categoryLabel(category.key) : category.label;
  }

  function loadWeekForm(weekId: string | undefined): void {
    const m = $appState.months[$currentMonthId];
    const w = m?.weeks.find((candidate) => candidate.id === weekId);
    if (!w || !m) return;
    const index = m.weeks.findIndex((candidate) => candidate.id === w.id);
    loadedWeekId = w.id;
    const range = editingRangeForWeek(m, w, Math.max(0, index));
    periodStart = range.start;
    periodEnd = range.end;
    availableBalance = valueForInput(w.availableBalance);
    unpaidPrevious = valueForInput(w.unpaidPrevious);
    notes = w.notes || "";
    const cv: Record<string, string> = {};
    allCategories.forEach((c) => (cv[c.key] = valueForInput(w.categoryValues?.[c.key])));
    categoryValues = cv;
    incidentalsOpen = incidentalsOpen || !!w.notes;
    appliedTransactions = [];
    appliedWeekId = "";
  }

  // Load form fields from the selected week (once per week id). The explicit
  // loader in onWeekSelect avoids waiting for a derived-store flush after a
  // native select change.
  $effect(() => {
    const selectedWeekId = $currentWeekId;
    if (!selectedWeekId || loadedWeekId === selectedWeekId) return;
    loadWeekForm(selectedWeekId);
  });

  // --- live totals ---
  const cumulative = $derived(
    month
      ? computeCumulativeFromAvailable(
          { availableBalance: numberOrNull(availableBalance), unpaidPrevious: numberOrNull(unpaidPrevious) },
          month,
        )
      : null,
  );
  const prevCumulative = $derived(numberOrZero(month?.weeks[weekIndex - 1]?.cumulativeSpend));
  const weeklyTotal = $derived(cumulative === null ? 0 : weekIndex <= 0 ? cumulative : cumulative - prevCumulative);

  function numericCategoryValues(): Record<string, number> {
    const o: Record<string, number> = {};
    allCategories.forEach((c) => (o[c.key] = numberOrZero(categoryValues[c.key])));
    return o;
  }
  const nonGroceryForm = $derived(
    allCategories.filter((c) => c.type === "nonGrocery").reduce((s, c) => s + numberOrZero(categoryValues[c.key]), 0),
  );
  const incidentalForm = $derived(
    allCategories.filter((c) => c.type === "incidental").reduce((s, c) => s + numberOrZero(categoryValues[c.key]), 0),
  );
  const previewGrocery = $derived(weeklyTotal - nonGroceryForm - incidentalForm);

  // --- period comparison (renderEntryPeriodComparison) ---
  const periodLabel = $derived(weekIndex >= 0 ? `Period ${weekIndex + 1}` : week?.period || $t("unnamedPeriod"));
  const samePeriodRow = $derived(month ? samePeriodComparisonRow($appState, month, weekIndex) : null);
  const comparison = $derived(samePeriodComparison(weeklyTotal, samePeriodRow));
  const previewDrivers = $derived(
    topPeriodSpendingDrivers(
      { week: { categoryValues: numericCategoryValues() }, grocery: previewGrocery } as never,
      2,
      allCategories,
    ),
  );
  const driverLabel = (key: string) => {
    if (key === "grocery") return $t("grocery");
    const category = allCategories.find((item) => item.key === key);
    return category ? categoryLabelFor(category) : $categoryLabel(key);
  };
  const driversLine = $derived(
    previewDrivers.length
      ? $t("topDriversLine", ...previewDrivers.map((d) => `${driverLabel(d.categoryKey)} ${formatMoney(d.amount)}`))
      : $t("noPeriodDriverYet"),
  );
  const comparisonKind = $derived(
    !comparison ? "empty" : comparison.ratio > 0.15 ? "over" : comparison.ratio > 0 ? "watch" : "good",
  );
  const comparisonCopy = $derived.by(() => {
    if (!comparison) return $t("periodComparisonUnavailable");
    const change = formatMoney(Math.abs(comparison.amount));
    return comparison.amount > 0
      ? $t("periodComparisonHigher", change)
      : comparison.amount < 0
        ? $t("periodComparisonLower", change)
        : $t("periodComparisonFlat");
  });
  const comparisonPill = $derived(
    comparisonKind === "over"
      ? $t("statusOver")
      : comparisonKind === "watch"
        ? $t("statusWatch")
        : comparisonKind === "good"
          ? $t("statusOnTrack")
          : $t("statusNoData"),
  );

  // --- timeline warning ---
  const timelineWarn = $derived.by(() => {
    if (!month || !week) return false;
    const override = new Map([[week.id, { start: periodStart, end: periodEnd }]]);
    return timelineDiagnostic(month, override).hasIssues;
  });

  // Show the "editing existing period" banner when the selected week already has data.
  const editingExisting = $derived.by(() => {
    const w = week;
    if (!w) return false;
    const hasCategoryValues = Object.values(w.categoryValues || {}).some((v) => numberOrZero(v) !== 0);
    return (
      numberOrNull(w.availableBalance) !== null ||
      numberOrNull(w.cumulativeSpend) !== null ||
      numberOrNull(w.unpaidPrevious) !== null ||
      hasCategoryValues ||
      !!w.notes?.trim()
    );
  });

  const existingTransactions = $derived(
    appliedWeekId === $currentWeekId && appliedTransactions.length ? appliedTransactions : (week?.transactions ?? []),
  );

  // --- actions ---
  function onWeekSelect(event: Event) {
    const nextWeekId = (event.currentTarget as HTMLSelectElement).value;
    loadedWeekId = null;
    currentWeekId.set(nextWeekId);
    loadWeekForm(nextWeekId);
  }

  function applyImportResult(totals: AggregatedImport, transactions: Transaction[]) {
    const cv = { ...categoryValues };
    allCategories.forEach((c) => {
      if (totals.categoryValues[c.key] !== undefined) cv[c.key] = valueForInput(totals.categoryValues[c.key]);
    });
    categoryValues = cv;
    const incidentalNotes = totals.incidentalNotes.join("\n");
    if (incidentalNotes) {
      notes = notes.trim() ? `${notes.trim()}\n${incidentalNotes}` : incidentalNotes;
      incidentalsOpen = true;
    }
    appliedTransactions = transactions;
    appliedWeekId = $currentWeekId ?? "";
    requestAnimationFrame(() => categorySection?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function applyBalanceHints(hints: BalanceHints) {
    if (hints.available !== null) availableBalance = String(hints.available);
    if (hints.unpaid !== null) unpaidPrevious = String(hints.unpaid);
  }

  function buildPreviewWeek(): Week {
    const period = formatPeriodRangeValue(periodStart, periodEnd) || week?.period || "";
    return createWeek({
      id: $currentWeekId,
      period,
      availableBalance: numberOrNull(availableBalance),
      unpaidPrevious: numberOrNull(unpaidPrevious),
      cumulativeSpend: cumulative,
      categoryValues: numericCategoryValues(),
      notes: notes.trim(),
      transactions: existingTransactions,
    });
  }

  async function saveWeek() {
    if (!month || hasIncludedRows) return;
    const idx = month.weeks.findIndex((w) => w.id === $currentWeekId);
    const next = buildPreviewWeek();
    appState.update((s) => {
      const m = s.months[$currentMonthId];
      const nextWeeks = [...m.weeks];
      if (idx >= 0) nextWeeks[idx] = next;
      else nextWeeks.push(next);
      const nextMonth = { ...m, weeks: nextWeeks };
      applySafePeriodDateCascade(nextMonth, Math.max(idx, 0));
      return { ...s, months: { ...s.months, [$currentMonthId]: nextMonth } };
    });
    currentWeekId.set(next.id);
    loadedWeekId = null; // allow reload if we come back
    await saveState();
    // Detailed save feedback (app.js saveWeekFromForm → saveSuccessDetailed).
    const savedRow = computedWeeks($appState.months[$currentMonthId], $appState).find((r) => r.week.id === next.id);
    const periodText = idx >= 0 ? `Period ${idx + 1}` : next.period || $t("unnamedPeriod");
    showToast(
      $t("saveSuccessDetailed", periodText, formatMoney(savedRow?.weeklyTotal ?? 0), formatMoney(savedRow?.grocery ?? 0)),
    );
    switchView("overview");
    focusOverviewWeeklyChart();
  }

  // Mirror focusOverviewWeeklyChart (app.js): scroll the weekly chart into view and
  // briefly highlight it after a save.
  function focusOverviewWeeklyChart() {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const panel = document.getElementById("weeklyChartPanel");
        if (!panel) return;
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
        panel.classList.add("panel-highlight");
        setTimeout(() => panel.classList.remove("panel-highlight"), 1800);
      }),
    );
  }

  async function clearPeriod() {
    if (!month || !week) return;
    const label = `Period ${month.weeks.indexOf(week) + 1}`;
    if (!(await confirmDialog($t("clearPeriodConfirm", label)))) return;
    appState.update((s) => {
      const m = s.months[$currentMonthId];
      const i = m.weeks.findIndex((w) => w.id === week.id);
      if (i >= 0)
        m.weeks[i] = createWeek({
          id: week.id,
          period: week.period,
          availableBalance: null,
          unpaidPrevious: null,
          cumulativeSpend: null,
          categoryValues: {},
          notes: "",
          transactions: [],
        });
      return s;
    });
    loadedWeekId = null;
    await saveState();
    setImportStatus($t("periodCleared", label));
    await tick();
    switchView("overview");
  }

  function showToast(message: string) {
    saveToast = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (saveToast = ""), 2200);
  }

  let hasIncludedRows = $state(false);
</script>

<section class="view" class:active={$currentView === "entry"} id="entryView">
  <div class="page-head">
    <div>
      <p class="eyebrow">{$t("entryEyebrow")}</p>
      <h2>{$t("entryTitle")}</h2>
    </div>
  </div>

  <div class="entry-layout">
    <section class="panel weekly-update-panel">
      <div class="panel-head">
        <div>
          <h3>{$t("updateThisWeek")}</h3>
          <p>{$t("updateThisWeekSub")}</p>
        </div>
      </div>
      <div id="entryEditBanner" class="entry-edit-banner" class:hidden={!editingExisting}>
        {editingExisting ? $t("editingExistingPeriod") : ""}
      </div>

      <div class="entry-summary-strip" aria-live="polite">
        <article class="entry-summary-card">
          <span class="entry-summary-label">{$t("currentMonth")}</span>
          <strong id="entryMonthKpi">{monthDisplayName(month)}</strong>
        </article>
        <article class="entry-summary-card">
          <span class="entry-summary-label">{$t("thisPeriodSpend")}</span>
          <strong id="entryPeriodSpendKpi">{formatMoney(weeklyTotal)}</strong>
        </article>
        <article class="entry-summary-card">
          <span class="entry-summary-label">{$t("entryMonthSpend")}</span>
          <strong id="entryMonthSpendKpi">{cumulative === null ? "-" : formatMoney(cumulative)}</strong>
        </article>
      </div>

      <section id="entryPeriodComparison" class="entry-period-comparison status-{comparisonKind}" aria-live="polite">
        <div>
          <p class="eyebrow">{$t("selectedPeriodComparison")}</p>
          <h3 id="entryPeriodComparisonTitle">{periodLabel}</h3>
          <p id="entryPeriodComparisonCopy">{comparisonCopy}</p>
          <p id="entryPeriodDrivers">{driversLine}</p>
        </div>
        <span id="entryPeriodComparisonPill" class="status-pill status-{comparisonKind}">{comparisonPill}</span>
      </section>

      <div class="weekly-entry-grid">
        <div class="form-grid weekly-basics-grid">
          <label class="field">
            <span>{$t("editPeriod")}</span>
            <select id="weekSelect" value={$currentWeekId} onchange={onWeekSelect}>
              {#each month?.weeks ?? [] as w, i (w.id)}
                <option value={w.id}>Period {i + 1}</option>
              {/each}
            </select>
          </label>
          <button id="clearPeriodBtn" class="danger-btn period-clear-btn" type="button" onclick={clearPeriod}>
            {$t("clearPeriod")}
          </button>
          <label class="field period-range-field">
            <span>{$t("period")}</span>
            <div class="date-range-inputs">
              <input id="periodStartInput" type="date" bind:value={periodStart} />
              <span class="date-range-separator">{$t("to")}</span>
              <input id="periodEndInput" type="date" bind:value={periodEnd} />
            </div>
            <input id="periodInput" type="hidden" value={periodStart && periodEnd ? `${periodStart} - ${periodEnd}` : ""} />
          </label>
          <div id="periodTimelineWarning" class="period-timeline-warning" class:hidden={!timelineWarn} aria-live="polite">
            {timelineWarn ? $t("periodTimelineWarning") : ""}
          </div>
          <label class="field">
            <span>{$t("availableBalance")}</span>
            <input id="availableInput" type="number" min="0" step="0.01" bind:value={availableBalance} />
          </label>
          <label class="field">
            <span>{$t("unpaidPrevious")}</span>
            <input id="unpaidInput" type="number" min="0" step="0.01" bind:value={unpaidPrevious} />
          </label>
        </div>

        <aside class="live-summary-card" aria-live="polite">
          <div>
            <p class="eyebrow">{$t("liveSummary")}</p>
            <h3>{$t("calculatedTotals")}</h3>
          </div>
          <p class="summary-copy">{$t("liveSummaryCopy")}</p>
        </aside>
      </div>
    </section>

    <section class="panel" bind:this={categorySection}>
      <div class="panel-head">
        <div>
          <h3>{$t("categoryAmounts")}</h3>
          <p>{$t("categoryAmountsSub")}</p>
          <p class="grocery-explainer">{$t("groceryExplainer")}</p>
        </div>
      </div>
      <div id="categoryInputs" class="category-grid">
        {#each visibleCategories as category (category.key)}
          <label class="field category-input-card" class:category-input-card-rare={category.key === "incidentals"} class:category-input-card-archived={category.archived}>
            <span>{categoryLabelFor(category)}{category.archived ? ` (${$t("categoryArchivedStatus")})` : ""}</span>
            <input data-category={category.key} type="number" min="0" step="0.01" disabled={category.archived} bind:value={categoryValues[category.key]} />
            {#if category.key === "incidentals"}<small class="category-hint">{$t("incidentalsRareHint")}</small>{/if}
          </label>
        {/each}
      </div>
    </section>

    <details id="incidentalsDetails" class="panel incidentals-panel" bind:open={incidentalsOpen}>
      <summary>
        <span class="incidentals-summary-title">
          <span>{$t("incidentalsDetailsTitle")}</span>
        </span>
        <small>{$t("incidentalsDetailsSub")}</small>
      </summary>
      <label class="field note-field">
        <span>{$t("notes")}</span>
        <textarea id="notesInput" rows="3" placeholder={$t("notesPlaceholder")} bind:value={notes}></textarea>
      </label>
    </details>

    <ImportPanel
      bind:this={importPanel}
      {periodStart}
      {periodEnd}
      monthId={$currentMonthId}
      weekId={$currentWeekId}
      {workspaceId}
      {existingTransactions}
      periodTotal={weeklyTotal}
      categories={activeCategories}
      onApply={applyImportResult}
      onBalanceHints={applyBalanceHints}
      onIncludedChange={(v) => (hasIncludedRows = v)}
    />
  </div>

  <div id="mobileEntrySaveBar" class="mobile-entry-savebar" aria-live="polite">
    <p id="mobileEntrySaveLabel" class="mobile-entry-save-copy">{$t("mobileSaveSummary")}</p>
    <div class="entry-savebar-actions">
      {#if hasIncludedRows}
        <button id="stickyApplyImportBtn" class="secondary-btn entry-savebar-apply-btn" type="button" onclick={() => importPanel?.applyFromParent()}>
          {$t("applyConfirmedRows")}
        </button>
      {/if}
      <button
        id="mobileSaveWeekBtn"
        class="primary-btn mobile-entry-save-btn"
        type="button"
        disabled={hasIncludedRows}
        onclick={saveWeek}
      >
        {$t("saveWeek")}
      </button>
    </div>
  </div>

  {#if saveToast}<div id="saveToast" class="save-toast" role="status" aria-live="polite">{saveToast}</div>{/if}
</section>
