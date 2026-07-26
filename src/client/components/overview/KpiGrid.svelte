<script lang="ts">
  import { t } from "$lib/stores/i18n";
  import { formatMoney } from "$lib/format";

  interface Props {
    limit: number;
    monthSpend: number;
    available: number;
    weekSpend: number;
  }
  let { limit, monthSpend, available, weekSpend }: Props = $props();
</script>

<div class="kpi-grid">
  <article class="kpi">
    <span>{$t("creditLimit")}</span>
    <strong id="limitKpi">{formatMoney(limit)}</strong>
  </article>
  <article class="kpi">
    <span>{$t("monthSpend")}</span>
    <strong id="monthSpendKpi">{formatMoney(monthSpend)}</strong>
  </article>
  <article class="kpi">
    <span>{$t("latestAvailable")}</span>
    <strong id="availableKpi">{formatMoney(available)}</strong>
  </article>
  <article class="kpi">
    <span>{$t("latestWeekSpend")}</span>
    <strong id="weekSpendKpi">{formatMoney(weekSpend)}</strong>
  </article>
</div>
