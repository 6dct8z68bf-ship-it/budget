<script lang="ts">
  import { t, categoryLabel } from "$lib/stores/i18n";
  import { appState } from "$lib/stores/budget";
  import { accountState } from "$lib/stores/auth";
  import { currentView, currentHistorySection, switchHistorySection } from "$lib/stores/router";
  import { computedWeeks, orderedMonths, type WeekComputed } from "$lib/overview";
  import { categoryDefinitions, monthDisplayName, normalizeTransactions } from "$lib/normalize";
  import { formatMoney, formatIsoDateDisplay, formatPeriodDisplay, numberOrZero, normalizeMerchant } from "$lib/format";

  const SECTIONS: { key: "overview" | "transactions"; label: string }[] = [
    { key: "overview", label: "historyOverviewTab" },
    { key: "transactions", label: "historyTransactionsTab" },
  ];

  // --- overview panel filters ---
  let historyMonth = $state("all");
  let historyCategory = $state("all");
  let historySearch = $state("");
  let historyMin = $state("");

  const months = $derived(orderedMonths($appState));
  const historyCategories = $derived(categoryDefinitions($appState.categorySettings, { includeArchived: true }));

  function historyCategoryLabel(category: (typeof historyCategories)[number]): string {
    const override = $appState.categorySettings?.labelOverrides?.[category.key];
    if (override) return override;
    const label = category.source === "system" ? $categoryLabel(category.key) : category.label;
    return category.archived ? `${label} (${$t("categoryArchivedStatus")})` : label;
  }

  function historyEntries(row: WeekComputed) {
    return [
      { key: "weeklyTotal", label: $t("weeklyTotal"), amount: row.weeklyTotal },
      { key: "nonGrocery", label: $t("nonGrocery"), amount: row.nonGrocery },
      { key: "grocery", label: $t("grocery"), amount: row.grocery },
      ...historyCategories.map((c) => ({
        key: c.key,
        label: historyCategoryLabel(c),
        amount: c.key === "incidentals" ? row.incidentals : numberOrZero(row.week.categoryValues[c.key]),
      })),
    ];
  }

  const historyRows = $derived.by(() => {
    const search = historySearch.trim().toLowerCase();
    const min = numberOrZero(historyMin);
    const out: { monthName: string; period: string; label: string; amount: number; notes: string }[] = [];
    months.forEach((month) => {
      if (historyMonth !== "all" && month.id !== historyMonth) return;
      computedWeeks(month, $appState).forEach((row) => {
        historyEntries(row).forEach((entry) => {
          if (historyCategory !== "all" && entry.key !== historyCategory) return;
          if (Math.abs(entry.amount) < 0.005) return;
          if (Math.abs(entry.amount) < min) return;
          const haystack = `${monthDisplayName(month)} ${row.week.period} ${entry.label} ${row.week.notes}`.toLowerCase();
          if (search && !haystack.includes(search)) return;
          out.push({
            monthName: monthDisplayName(month),
            period: row.week.period || "",
            label: entry.label,
            amount: entry.amount,
            notes: entry.key === "incidentals" ? row.week.notes || "" : "",
          });
        });
      });
    });
    return out;
  });

  // --- transaction panel filters ---
  let txnMerchant = $state("");
  let txnStart = $state("");
  let txnEnd = $state("");
  let txnMonth = $state("all");
  let txnPeriod = $state("all");
  let txnCategory = $state("all");
  let txnMin = $state("");

  const workspaceName = $derived($accountState?.currentWorkspace?.name || $accountState?.currentWorkspace?.id || "-");

  const allTxnRows = $derived.by(() => {
    const rows: {
      dateIso: string;
      description: string;
      normalizedMerchant: string;
      expenseAmount: number;
      categoryKey: string;
      categoryLabelText: string;
      monthId: string;
      monthName: string;
      periodId: string;
      periodLabel: string;
      periodDisplay: string;
      notes: string;
    }[] = [];
    months.forEach((month) => {
      month.weeks.forEach((week, weekIndex) => {
        const periodLabel = `P${weekIndex + 1}`;
        const periodDisplay = formatPeriodDisplay(week.period) || week.period || $t("unnamedPeriod");
        normalizeTransactions(week.transactions).forEach((transaction) => {
          if (transaction.expenseAmount <= 0) return;
          rows.push({
            dateIso: transaction.dateIso,
            description: transaction.description,
            normalizedMerchant: transaction.normalizedMerchant,
            expenseAmount: transaction.expenseAmount,
            categoryKey: transaction.categoryKey,
            categoryLabelText:
              transaction.categoryKey === "grocery" ? $t("grocery") : $categoryLabel(transaction.categoryKey),
            monthId: month.id,
            monthName: monthDisplayName(month),
            periodId: week.id,
            periodLabel,
            periodDisplay,
            notes: transaction.categoryKey === "incidentals" ? String(week.notes || "").trim() : "",
          });
        });
      });
    });
    return rows;
  });

  const txnPeriodOptions = $derived.by(() => {
    const seen = new Set<string>();
    const options: { key: string; label: string }[] = [];
    allTxnRows.forEach((row) => {
      const key = `${row.monthId}::${row.periodId}`;
      if (seen.has(key)) return;
      seen.add(key);
      options.push({ key, label: $t("transactionContextLine", row.monthName, row.periodLabel) });
    });
    return options;
  });

  const txnRows = $derived.by(() => {
    const merchantSearch = normalizeMerchant(txnMerchant);
    const min = numberOrZero(txnMin);
    return allTxnRows.filter((row) => {
      if (txnMonth !== "all" && row.monthId !== txnMonth) return false;
      if (txnPeriod !== "all" && `${row.monthId}::${row.periodId}` !== txnPeriod) return false;
      if (txnCategory !== "all" && row.categoryKey !== txnCategory) return false;
      if (row.expenseAmount < min) return false;
      if (txnStart && row.dateIso < txnStart) return false;
      if (txnEnd && row.dateIso > txnEnd) return false;
      if (merchantSearch) {
        const haystack = normalizeMerchant(`${row.description} ${row.normalizedMerchant} ${row.notes}`);
        if (!haystack.includes(merchantSearch)) return false;
      }
      return true;
    });
  });
</script>

<section class="view" class:active={$currentView === "history"} id="historyView">
  <div class="page-head">
    <div>
      <p class="eyebrow">{$t("searchEyebrow")}</p>
      <h2>{$t("pastRecords")}</h2>
    </div>
  </div>

  <nav id="historySectionNav" class="history-section-nav" aria-label="History sections">
    {#each SECTIONS as section (section.key)}
      <button
        class="history-section-tab"
        class:active={$currentHistorySection === section.key}
        type="button"
        data-history-section={section.key}
        aria-current={$currentHistorySection === section.key ? "page" : undefined}
        onclick={() => switchHistorySection(section.key)}
      >
        {$t(section.label)}
      </button>
    {/each}
  </nav>

  <section id="historyOverviewPanel" class="panel history-panel" class:hidden={$currentHistorySection !== "overview"}>
    <div class="filters">
      <label class="field">
        <span>{$t("month")}</span>
        <select id="historyMonthFilter" bind:value={historyMonth}>
          <option value="all">{$t("allMonths")}</option>
          {#each months as month (month.id)}<option value={month.id}>{monthDisplayName(month)}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>{$t("category")}</span>
        <select id="historyCategoryFilter" bind:value={historyCategory}>
          <option value="all">{$t("allCategories")}</option>
          <option value="weeklyTotal">{$t("weeklyTotal")}</option>
          <option value="nonGrocery">{$t("nonGrocery")}</option>
          <option value="grocery">{$t("grocery")}</option>
          {#each historyCategories as c (c.key)}<option value={c.key}>{historyCategoryLabel(c)}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>{$t("keyword")}</span>
        <input id="historySearchInput" type="search" placeholder={$t("keywordPlaceholder")} bind:value={historySearch} />
      </label>
      <label class="field">
        <span>{$t("minAmount")}</span>
        <input id="historyMinInput" type="number" min="0" step="0.01" bind:value={historyMin} />
      </label>
    </div>
    <div class="table-scroll">
      <table id="historyTable">
        <thead>
          <tr>
            <th>{$t("month")}</th><th>{$t("period")}</th><th>{$t("category")}</th>
            <th class="amount">{$t("amount")}</th><th>{$t("notes")}</th>
          </tr>
        </thead>
        <tbody>
          {#if historyRows.length}
            {#each historyRows as row}
              <tr>
                <td data-label={$t("month")}>{row.monthName}</td>
                <td data-label={$t("period")}>{row.period}</td>
                <td data-label={$t("category")}>{row.label}</td>
                <td class="amount" data-label={$t("amount")}>{formatMoney(row.amount)}</td>
                <td data-label={$t("notes")}>{row.notes}</td>
              </tr>
            {/each}
          {:else}
            <tr><td colspan="5">{$t("noRecords")}</td></tr>
          {/if}
        </tbody>
      </table>
    </div>
  </section>

  <section id="historyTransactionsPanel" class="panel history-panel" class:hidden={$currentHistorySection !== "transactions"}>
    <div class="history-workspace-line">
      <span>{$t("workspace")}</span>
      <strong id="transactionWorkspaceValue">{workspaceName}</strong>
    </div>
    <div class="filters">
      <label class="field"><span>{$t("merchant")}</span><input id="transactionMerchantInput" type="search" placeholder={$t("merchantPlaceholder")} bind:value={txnMerchant} /></label>
      <label class="field"><span>{$t("startDate")}</span><input id="transactionStartDateInput" type="date" bind:value={txnStart} /></label>
      <label class="field"><span>{$t("endDate")}</span><input id="transactionEndDateInput" type="date" bind:value={txnEnd} /></label>
      <label class="field">
        <span>{$t("month")}</span>
        <select id="transactionMonthFilter" bind:value={txnMonth}>
          <option value="all">{$t("allMonths")}</option>
          {#each months as month (month.id)}<option value={month.id}>{monthDisplayName(month)}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>{$t("period")}</span>
        <select id="transactionPeriodFilter" bind:value={txnPeriod}>
          <option value="all">{$t("allPeriods")}</option>
          {#each txnPeriodOptions as opt (opt.key)}<option value={opt.key}>{opt.label}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>{$t("category")}</span>
        <select id="transactionCategoryFilter" bind:value={txnCategory}>
          <option value="all">{$t("allCategories")}</option>
          <option value="grocery">{$t("grocery")}</option>
          {#each historyCategories as c (c.key)}<option value={c.key}>{historyCategoryLabel(c)}</option>{/each}
        </select>
      </label>
      <label class="field"><span>{$t("minAmount")}</span><input id="transactionMinAmountInput" type="number" min="0" step="0.01" bind:value={txnMin} /></label>
    </div>
    <div class="table-scroll">
      <table id="transactionHistoryTable">
        <thead>
          <tr>
            <th>{$t("transactionDate")}</th><th>{$t("merchantDescription")}</th><th>{$t("category")}</th>
            <th class="amount">{$t("amount")}</th><th>{$t("transactionContext")}</th>
          </tr>
        </thead>
        <tbody>
          {#if txnRows.length}
            {#each txnRows as row}
              <tr>
                <td data-label={$t("transactionDate")}>{formatIsoDateDisplay(row.dateIso)}</td>
                <td data-label={$t("merchantDescription")}>{row.description || row.normalizedMerchant || "-"}</td>
                <td data-label={$t("category")}>{row.categoryLabelText || row.categoryKey || "-"}</td>
                <td class="amount" data-label={$t("amount")}>{formatMoney(row.expenseAmount)}</td>
                <td data-label={$t("transactionContext")}>{`${row.monthName} / ${row.periodLabel} / ${row.periodDisplay}`}</td>
              </tr>
            {/each}
          {:else}
            <tr><td colspan="5">{$t("noTransactions")}</td></tr>
          {/if}
        </tbody>
      </table>
    </div>
  </section>
</section>
