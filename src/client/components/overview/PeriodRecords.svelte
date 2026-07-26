<script lang="ts">
  import { t } from "$lib/stores/i18n";
  import { formatMoney, formatPeriodDisplay } from "$lib/format";
  import type { WeekComputed } from "$lib/overview";

  interface Props {
    rows: WeekComputed[];
    currentWeekId: string | undefined;
    onSelect: (weekId: string) => void;
  }
  let { rows, currentWeekId, onSelect }: Props = $props();

  const firstIncompleteIndex = $derived(rows.findIndex((row) => row.week.cumulativeSpend === null));

  function statusKey(index: number, complete: boolean): string {
    if (complete) return "periodComplete";
    return index === firstIncompleteIndex ? "periodNeedsUpdate" : "periodNotStarted";
  }
  function statusModifier(index: number, complete: boolean): string {
    if (complete) return "complete";
    return index === firstIncompleteIndex ? "next" : "future";
  }
</script>

<div id="overviewPeriodRecords" class="overview-period-records" aria-live="polite">
  {#each rows as row, index (row.week.id)}
    {@const complete = row.week.cumulativeSpend !== null}
    <button
      class="overview-period-card"
      class:active={row.week.id === currentWeekId}
      type="button"
      data-overview-period-id={row.week.id}
      onclick={() => onSelect(row.week.id)}
    >
      <span class="overview-period-number">P{index + 1}</span>
      <span class="overview-period-range">{formatPeriodDisplay(row.week.period) || `${$t("period")} ${index + 1}`}</span>
      <strong>{complete ? formatMoney(row.weeklyTotal) : $t(statusKey(index, complete))}</strong>
      <small class="overview-period-status overview-period-status--{statusModifier(index, complete)}">
        {$t(statusKey(index, complete))}
      </small>
    </button>
  {/each}
</div>
