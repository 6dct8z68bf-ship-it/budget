<script lang="ts">
  import { t } from "$lib/stores/i18n";
  import type { StatusKind } from "$lib/overview";

  interface Props {
    kind: StatusKind;
    title: string;
    copy: string;
    metricsLine: string;
    driverLine: string;
    nextAction: string;
    onOpenEntry: () => void;
  }
  let { kind, title, copy, metricsLine, driverLine, nextAction, onOpenEntry }: Props = $props();
  const statusClass = $derived(kind === "empty" ? "empty" : kind);
</script>

<article class="decision-status-card">
  <div class="decision-status-main">
    <p class="eyebrow">{$t("monthlyStatus")}</p>
    <div class="decision-title-row">
      <span id="overviewStatusDot" class="status-dot status-{statusClass}" aria-hidden="true"></span>
      <h3 id="overviewStatusTitle">{title}</h3>
    </div>
    <p id="overviewStatusCopy">{copy}</p>
  </div>
  <span id="overviewStatusPill" class="status-pill status-{statusClass}">{title}</span>
  <div class="decision-summary-lines">
    <p id="statusMetricsLine">{metricsLine}</p>
    <p id="overviewDriverLine">{driverLine}</p>
    <p class="decision-next-line">
      <span>{$t("nextAction")}</span>
      <strong id="nextActionValue">{nextAction}</strong>
      <button id="overviewActionBtn" class="ghost-btn" type="button" data-overview-action="open-entry" onclick={onOpenEntry}>
        {$t("openWeeklyEntry")}
      </button>
    </p>
  </div>
</article>
