<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { t as tStore } from "$lib/stores/i18n";
  import { appState } from "$lib/stores/budget";
  import type { Month } from "$shared/types";
  import type { ResolvedCategory } from "$lib/normalize";
  import { escapeHtml, formatCompactMoney, formatMoney, formatPercent } from "$lib/format";
  import {
    buildCategoryTreemap,
    layoutTreemap,
    type CategoryTreemapItem,
    type CategoryTreemapRect,
  } from "$lib/charts/categoryTreemap";
  import { registerCategoryTreemap } from "$lib/debug";

  interface Props {
    months: Month[]; // already windowed: latest 12 months, or the selected month
    singleMonth: boolean;
    categories: ResolvedCategory[];
    getLabel: (key: string) => string;
  }
  let { months, singleMonth, categories, getLabel }: Props = $props();

  let tooltip: HTMLElement | null = $state(null);
  let activeItem: CategoryTreemapItem | null = $state(null);

  const data = $derived(
    buildCategoryTreemap(months, $appState, {
      mode: singleMonth ? "month" : "all",
      categories,
      getLabel,
    }),
  );
  const hasData = $derived(data.items.length > 0);
  const rects = $derived(layoutTreemap(data.items));

  const translate = (key: string, ...args: unknown[]): string => get(tStore)(key, ...args);

  // Color depth follows the amount share (sqrt scale so small tiles keep a
  // visible step); tile area itself remains the primary size encoding. The
  // dark theme uses a lighter overlay so tiles stay distinct on dark surfaces.
  function tileDim(item: CategoryTreemapItem): string {
    return (0.08 + 0.5 * Math.sqrt(item.share)).toFixed(3);
  }

  function tileDimDark(item: CategoryTreemapItem): string {
    return (0.05 + 0.35 * Math.sqrt(item.share)).toFixed(3);
  }

  function showDetail(item: CategoryTreemapItem): void {
    activeItem = item;
    if (!tooltip) return;
    const t = translate;
    const breakdown = item.breakdown
      .map(
        (entry) => `
          <div class="chart-detail-metric">
            <span>${escapeHtml(entry.label)}</span>
            <strong>${formatMoney(entry.amount)}</strong>
          </div>`,
      )
      .join("");
    tooltip.innerHTML = `
      <div class="chart-detail-primary">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(t("amount"))} · ${formatPercent(item.share)}</span>
      </div>
      ${breakdown}
    `;
    tooltip.classList.remove("hidden");
  }

  function hideDetail(): void {
    activeItem = null;
    tooltip?.classList.add("hidden");
  }

  onMount(() => {
    registerCategoryTreemap(() => ({ ...data, rects }));
    return () => registerCategoryTreemap(() => null);
  });
</script>

<section id="historyCategoryChartPanel" class="panel history-category-chart-panel" aria-label={$tStore("historyCategoryChartTitle")}>
  <div class="panel-head">
    <div>
      <h3>{$tStore("historyCategoryChartTitle")}</h3>
      <p>{$tStore("historyCategoryChartSub")}</p>
    </div>
  </div>

  {#if hasData}
    <div
      id="historyCategoryTreemap"
      class="category-treemap-wrap"
      role="group"
      aria-label={$tStore("historyCategoryChartTitle")}
      onmouseleave={hideDetail}
    >
      {#each rects as rect (rect.item.key)}
        <div
          class="category-treemap-tile"
          class:category-treemap-tile-active={activeItem?.key === rect.item.key}
          style={`left: ${(rect.x * 100).toFixed(3)}%; top: ${(rect.y * 100).toFixed(3)}%; width: ${(rect.w * 100).toFixed(3)}%; height: ${(rect.h * 100).toFixed(3)}%; --tile-color: ${rect.item.color}; --tile-dim: ${tileDim(rect.item)}; --tile-dim-dark: ${tileDimDark(rect.item)};`}
          tabindex="0"
          role="button"
          aria-label={`${rect.item.label} · ${formatCompactMoney(rect.item.amount)}`}
          onmouseenter={() => showDetail(rect.item)}
          onfocus={() => showDetail(rect.item)}
          onblur={hideDetail}
        >
          {#if rect.showText}
            <div class="category-treemap-tile-inner">
              <span class="category-treemap-tile-label">{rect.item.label}</span>
              <span class="category-treemap-tile-amount">{formatCompactMoney(rect.item.amount)}</span>
            </div>
          {/if}
        </div>
      {/each}
    </div>
    <div class="category-treemap-legend" aria-hidden="true">
      {#each data.items as item (item.key)}
        <span>
          <i class="category-legend-swatch" style={`background-color: ${item.color};`} aria-hidden="true"></i>
          {item.label}
        </span>
      {/each}
    </div>
  {:else}
    <div id="historyCategoryChartEmpty" class="chart-empty">{$tStore("emptyChartCopy")}</div>
  {/if}

  <div
    id="historyChartTooltip"
    class="category-chart-detail hidden"
    data-placeholder={$tStore("chartTrendDetailHint")}
    role="status"
    aria-live="polite"
    bind:this={tooltip}
  ></div>
</section>
