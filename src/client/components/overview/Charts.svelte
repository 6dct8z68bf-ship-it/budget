<script lang="ts">
  import { onMount, tick } from "svelte";
  import { get } from "svelte/store";
  import { t as tStore } from "$lib/stores/i18n";
  import { theme } from "$lib/stores/theme";
  import { appState } from "$lib/stores/budget";
  import { currentView } from "$lib/stores/router";
  import { createWeeklyChart, type WeeklyChartController } from "$lib/charts/weeklyChart";
  import { createTrendChart, type TrendChartController } from "$lib/charts/trendChart";
  import { monthlyStatusKind, type WeekComputed, type TrendRow, type StatusKind } from "$lib/overview";
  import { registerWeeklyChart, registerTrendChart } from "$lib/debug";

  interface Props {
    rows: WeekComputed[];
    monthName: string;
    trendRows: TrendRow[];
    currentMonthId: string;
    decisionKind: StatusKind;
    hasCompletedWeeks: boolean;
    onSelectWeek: (weekId: string) => void;
    onSelectMonth: (monthId: string) => void;
  }
  let {
    rows,
    monthName,
    trendRows,
    currentMonthId,
    decisionKind,
    hasCompletedWeeks,
    onSelectWeek,
    onSelectMonth,
  }: Props = $props();

  let weeklyCanvas: HTMLCanvasElement | null = $state(null);
  let weeklyTooltip: HTMLElement | null = $state(null);
  let trendCanvas: HTMLCanvasElement | null = $state(null);
  let trendTooltip: HTMLElement | null = $state(null);
  let trendTable: HTMLTableElement | null = $state(null);
  let weeklyPanel: HTMLElement | null = $state(null);
  let trendPanel: HTMLElement | null = $state(null);

  let weekly: WeeklyChartController | null = null;
  let trend: TrendChartController | null = null;

  const translate = (key: string, ...args: unknown[]): string => get(tStore)(key, ...args);

  function getStatusKindFor(monthId: string): StatusKind {
    if (monthId === currentMonthId) return decisionKind;
    const month = get(appState).months[monthId];
    return month ? monthlyStatusKind(month, get(appState)) : "empty";
  }

  function redraw() {
    if (!hasCompletedWeeks) return;
    weekly?.draw();
    trend?.draw();
  }

  onMount(() => {
    if (weeklyCanvas) {
      weekly = createWeeklyChart({
        canvas: weeklyCanvas,
        tooltipEl: weeklyTooltip,
        getRows: () => rows,
        getMonthName: () => monthName,
        t: translate,
        onSelectWeek: (weekId) => onSelectWeek(weekId),
      });
      registerWeeklyChart(() => weekly?.getBars() ?? []);
    }
    if (trendCanvas) {
      trend = createTrendChart({
        canvas: trendCanvas,
        tableEl: trendTable,
        tooltipEl: trendTooltip,
        getRows: () => trendRows,
        getCurrentMonthId: () => currentMonthId,
        getStatusKindFor,
        t: translate,
        onSelectMonth: (monthId) => onSelectMonth(monthId),
      });
      registerTrendChart(() => trend?.getPoints() ?? []);
    }

    // Redraw on container resize (also fires when the view becomes visible).
    const observer = new ResizeObserver(() => redraw());
    document.querySelectorAll(".chart-wrap").forEach((el) => observer.observe(el));
    const onResize = () => redraw();
    window.addEventListener("resize", onResize);

    void tick().then(redraw);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      weekly?.destroy();
      trend?.destroy();
    };
  });

  // Reactive redraw when data, theme, selection, or view visibility changes.
  $effect(() => {
    // Reference reactive deps so the effect re-runs when any change.
    void rows;
    void trendRows;
    void monthName;
    void currentMonthId;
    void decisionKind;
    void $theme;
    void hasCompletedWeeks;
    if ($currentView === "overview" && hasCompletedWeeks) {
      void tick().then(redraw);
    }
  });

  let weeklyExpanded = $state(false);
  let trendExpanded = $state(false);

  function toggleZoom(which: "weekly" | "trend") {
    const target = which === "weekly" ? weeklyPanel : trendPanel;
    if (which === "weekly") {
      weeklyExpanded = !weeklyExpanded;
      trendExpanded = false;
    } else {
      trendExpanded = !trendExpanded;
      weeklyExpanded = false;
    }
    void tick().then(() => {
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      redraw();
    });
  }
</script>

<section class="overview-insights-grid" aria-label="Budget insights">
  <section id="weeklyChartPanel" class="panel overview-insight-card" class:chart-expanded={weeklyExpanded} bind:this={weeklyPanel}>
    <div class="panel-head">
      <div>
        <h3>{$tStore("weeklyComposition")}</h3>
        <p>{$tStore("weeklyCompositionSub")}</p>
      </div>
      <button
        class="chart-zoom-btn"
        type="button"
        data-chart-zoom
        aria-controls="weeklyChartPanel"
        aria-expanded={weeklyExpanded}
        onclick={() => toggleZoom("weekly")}
      >
        {weeklyExpanded ? $tStore("chartRestore") : $tStore("chartZoom")}
      </button>
    </div>
    <div class="chart-wrap">
      <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
      <canvas
        id="weeklyChart"
        height="360"
        role="img"
        class:hidden={!hasCompletedWeeks}
        aria-label={$tStore("weeklyComposition")}
        bind:this={weeklyCanvas}
        onpointermove={(e) => weekly?.handlePointerMove(e)}
        onpointerleave={(e) => weekly?.handlePointerLeave(e)}
        onclick={(e) => weekly?.handleClick(e)}
      ></canvas>
      <div id="weeklyChartEmpty" class="chart-empty" class:hidden={hasCompletedWeeks}>{$tStore("emptyChartCopy")}</div>
    </div>
    <div
      id="chartTooltip"
      class="chart-detail hidden"
      data-placeholder={$tStore("chartWeeklyDetailHint")}
      role="status"
      aria-live="polite"
      bind:this={weeklyTooltip}
    ></div>
  </section>

  <section id="monthlyTrendPanel" class="panel overview-insight-card overview-result-panel" class:chart-expanded={trendExpanded} bind:this={trendPanel}>
    <div class="panel-head">
      <div>
        <h3>{$tStore("monthlyTrend")}</h3>
        <p>{$tStore("monthlyTrendSub")}</p>
      </div>
      <button
        class="chart-zoom-btn"
        type="button"
        data-chart-zoom
        aria-controls="monthlyTrendPanel"
        aria-expanded={trendExpanded}
        onclick={() => toggleZoom("trend")}
      >
        {trendExpanded ? $tStore("chartRestore") : $tStore("chartZoom")}
      </button>
    </div>
    <div class="chart-wrap">
      <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
      <canvas
        id="monthlyTrendChart"
        height="340"
        role="img"
        class:hidden={!hasCompletedWeeks}
        aria-label={$tStore("monthlyTrend")}
        bind:this={trendCanvas}
        onpointermove={(e) => trend?.handlePointerMove(e)}
        onpointerleave={(e) => trend?.handlePointerLeave(e)}
        onclick={(e) => trend?.handleClick(e)}
      ></canvas>
      <div id="monthlyTrendEmpty" class="chart-empty" class:hidden={hasCompletedWeeks}>{$tStore("emptyChartCopy")}</div>
    </div>
    <div
      id="trendTooltip"
      class="chart-detail hidden"
      data-placeholder={$tStore("chartTrendDetailHint")}
      role="status"
      aria-live="polite"
      bind:this={trendTooltip}
    ></div>
    <div class="visually-hidden">
      <table id="monthlyTrendTable" bind:this={trendTable}></table>
    </div>
  </section>
</section>
