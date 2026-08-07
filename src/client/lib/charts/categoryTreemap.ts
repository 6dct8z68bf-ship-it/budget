// Category treemap for the History overview panel. Both modes produce a single
// treemap of categories where tile area (and color depth) encode the amount.
// All-months mode sums the latest 12 months by category; single-month mode sums
// the selected month's completed weeks. A small per-tile floor keeps tiny
// categories visible and hoverable without merging them into "others".
import type { BudgetState, Month } from "$shared/types";
import type { ResolvedCategory } from "$lib/normalize";
import type { WeekComputed } from "$lib/overview";
import { computedWeeks } from "$lib/overview";
import { numberOrZero, roundCurrency } from "$lib/format";
import { inferMonthSortKey, monthDisplayName } from "$lib/normalize";
import { categoryStackColor } from "$lib/charts/categoryPalette";

// Minimum tile share of the chart area (0.6%). Below this a tiny category would
// be invisible/unhoverable; the floor only affects drawing, not reported amounts.
const MIN_TILE_SHARE = 0.006;

export interface CategoryTreemapBreakdown {
  key: string;
  label: string;
  amount: number;
}

export interface CategoryTreemapItem {
  key: string;
  label: string;
  color: string;
  amount: number; // real rounded total
  value: number; // area value used by the layout (amount, floored)
  share: number; // real share of total (0..1)
  breakdown: CategoryTreemapBreakdown[];
}

export interface CategoryTreemapWindowEntry {
  key: string;
  label: string;
}

export interface CategoryTreemapData {
  mode: "all" | "month";
  window: CategoryTreemapWindowEntry[]; // months (all) or weeks (month) in scope
  items: CategoryTreemapItem[];
  total: number;
  max: number;
}

export interface CategoryTreemapOptions {
  mode: "all" | "month";
  categories: ResolvedCategory[];
  getLabel: (key: string) => string;
}

export function buildCategoryTreemap(
  months: Month[],
  state: BudgetState,
  options: CategoryTreemapOptions,
): CategoryTreemapData {
  const { mode, categories, getLabel } = options;
  const trackedKeys = ["grocery", ...categories.map((category) => category.key)];
  const window: CategoryTreemapWindowEntry[] = [];
  const amountsByKey = new Map<string, number>();
  const breakdownByKey = new Map<string, CategoryTreemapBreakdown[]>();

  function addWeekAmounts(row: WeekComputed, amounts: Map<string, number>): void {
    const grocery = Math.max(0, numberOrZero(row.grocery));
    if (grocery > 0) amounts.set("grocery", numberOrZero(amounts.get("grocery")) + grocery);
    categories.forEach((category) => {
      const value = Math.max(0, numberOrZero(row.week.categoryValues?.[category.key]));
      if (value > 0) amounts.set(category.key, numberOrZero(amounts.get(category.key)) + value);
    });
  }

  function pushWindowBreakdown(key: string, label: string, amounts: Map<string, number>): void {
    trackedKeys.forEach((tracked) => {
      const value = roundCurrency(numberOrZero(amounts.get(tracked)));
      if (value <= 0) return;
      amountsByKey.set(tracked, roundCurrency(numberOrZero(amountsByKey.get(tracked)) + value));
      if (!breakdownByKey.has(tracked)) breakdownByKey.set(tracked, []);
      breakdownByKey.get(tracked)!.push({ key, label, amount: value });
    });
  }

  months.forEach((month) => {
    const completed = computedWeeks(month, state).filter((row) => row.week.cumulativeSpend !== null);
    if (mode === "all") {
      const label = shortMonthLabel(month);
      window.push({ key: month.id, label });
      const amounts = new Map<string, number>();
      completed.forEach((row) => addWeekAmounts(row, amounts));
      pushWindowBreakdown(month.id, label, amounts);
    } else {
      completed.forEach((row, index) => {
        const label = `P${index + 1}`;
        window.push({ key: row.week.id, label });
        const amounts = new Map<string, number>();
        addWeekAmounts(row, amounts);
        pushWindowBreakdown(row.week.id, label, amounts);
      });
    }
  });

  const items: CategoryTreemapItem[] = [];
  let total = 0;
  trackedKeys.forEach((key) => {
    const amount = roundCurrency(numberOrZero(amountsByKey.get(key)));
    if (amount <= 0) return;
    total += amount;
    items.push({
      key,
      label: getLabel(key),
      color: categoryStackColor(key),
      amount,
      value: 0,
      share: 0,
      breakdown: breakdownByKey.get(key) ?? [],
    });
  });

  const floor = total * MIN_TILE_SHARE;
  items.forEach((item) => {
    item.share = total > 0 ? item.amount / total : 0;
    item.value = Math.max(item.amount, floor);
  });
  items.sort((a, b) => b.amount - a.amount);

  return {
    mode,
    window,
    items,
    total: roundCurrency(total),
    max: items.length > 0 ? items[0].amount : 0,
  };
}

function shortMonthLabel(month: Month): string {
  const sortKey = month.sortKey || inferMonthSortKey(month);
  return sortKey ? sortKey.slice(2).replace("-", "/") : monthDisplayName(month);
}

export interface CategoryTreemapRect {
  x: number;
  y: number;
  w: number;
  h: number;
  item: CategoryTreemapItem;
  showText: boolean;
}

// Normalized (0..1) layout for a virtual space that keeps the same aspect ratio
// as the rendered container, so tiles keep their shape on any screen width.
export function layoutTreemap(items: CategoryTreemapItem[], width = 1000, height = 600): CategoryTreemapRect[] {
  if (items.length === 0) return [];
  return squarify(items, 0, 0, width, height).map((rect) => ({
    x: rect.x / width,
    y: rect.y / height,
    w: rect.w / width,
    h: rect.h / height,
    item: rect.item,
    showText: rect.w >= width * 0.08 && rect.h >= height * 0.08,
  }));
}

interface RawTreemapRect {
  x: number;
  y: number;
  w: number;
  h: number;
  item: CategoryTreemapItem;
}

// Squarified treemap layout (Bruls, Huizing & van Wijk). Rows run along the
// longer side of the remaining space; a candidate row is kept while its worst
// aspect ratio does not increase, which keeps tiles close to square.
function squarify(
  items: CategoryTreemapItem[],
  x0: number,
  y0: number,
  w0: number,
  h0: number,
): RawTreemapRect[] {
  const valueTotal = items.reduce((sum, item) => sum + item.value, 0);
  if (valueTotal <= 0 || w0 <= 0 || h0 <= 0) return [];
  // Scale values into area units first so the aspect-ratio math matches the
  // classic formulation (the total value then equals the container area).
  const areaTotal = w0 * h0;
  const scaled = items.map((item) => ({ item, value: (item.value / valueTotal) * areaTotal }));
  const total = scaled.reduce((sum, entry) => sum + entry.value, 0);
  const rects: RawTreemapRect[] = [];
  let x = x0;
  let y = y0;
  let w = w0;
  let h = h0;
  let row: { item: CategoryTreemapItem; value: number }[] = [];
  let rowSum = 0;

  const worst = (candidate: { item: CategoryTreemapItem; value: number }[]): number => {
    const sum = candidate.reduce((acc, entry) => acc + entry.value, 0);
    const side = Math.max(w, h);
    if (sum <= 0 || side <= 0) return Infinity;
    const k = (side * side) / (sum * sum);
    let worstRatio = 0;
    for (const entry of candidate) {
      const ratio = Math.max(entry.value * k, 1 / (entry.value * k));
      if (ratio > worstRatio) worstRatio = ratio;
    }
    return worstRatio;
  };

  const layoutRow = (): void => {
    if (row.length === 0 || rowSum <= 0 || w <= 0 || h <= 0) return;
    if (w >= h) {
      const stripH = Math.min(rowSum / w, h);
      let acc = x;
      row.forEach((entry, index) => {
        const rw = index === row.length - 1 ? x + w - acc : (entry.value / rowSum) * w;
        rects.push({ x: acc, y, w: rw, h: stripH, item: entry.item });
        acc += rw;
      });
      y += stripH;
      h -= stripH;
    } else {
      const stripW = Math.min(rowSum / h, w);
      let acc = y;
      row.forEach((entry, index) => {
        const rh = index === row.length - 1 ? y + h - acc : (entry.value / rowSum) * h;
        rects.push({ x, y: acc, w: stripW, h: rh, item: entry.item });
        acc += rh;
      });
      x += stripW;
      w -= stripW;
    }
    row = [];
    rowSum = 0;
  };

  for (const entry of scaled) {
    if (row.length === 0 || worst([...row, entry]) <= worst(row)) {
      row.push(entry);
      rowSum += entry.value;
    } else {
      layoutRow();
      row.push(entry);
      rowSum = entry.value;
    }
  }
  layoutRow();
  return rects;
}
