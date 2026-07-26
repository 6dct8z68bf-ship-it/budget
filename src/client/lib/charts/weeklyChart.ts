// Weekly stacked-bar + cumulative-line Canvas chart, ported faithfully from
// app.js (prepareCanvas 5632-5643, drawChart 5645-5675, animateWeeklyChart
// 5677-5696, interpolateBarValues 5698-5708, renderWeeklyChartFrame 5710-5838,
// drawSegmentLabel 5840-5861, drawCalendarBadge 5862-5896, drawMonthBadge
// 5897-5927, drawLegend 5928-5975, drawCumulativeLine 5976-6065,
// showChartTooltip 6624-6641, selectWeekFromChart 6643-6650, chartPoint
// 6652-6659, positionTooltipWithinChart 6660-6668). Drawing/animation/pixel
// math preserved verbatim; only input access is adapted (globals -> deps).
import type { WeekComputed } from "$lib/overview";
import { formatMoney, formatCompactMoney, formatPeriodDisplay, escapeHtml } from "$lib/format";
import {
  chartColors,
  CATEGORY_CHART_COLORS,
  CATEGORY_CHART_GRADIENTS,
  REDUCED_MOTION,
} from "$lib/charts/palette";

export interface WeeklyChartDeps {
  canvas: HTMLCanvasElement;
  tooltipEl: HTMLElement | null; // #chartTooltip
  getRows: () => WeekComputed[]; // computedWeeks(currentMonth); only rows with cumulativeSpend !== null are drawn as in the source
  getMonthName: () => string;
  t: (key: string, ...args: unknown[]) => string;
  onSelectWeek: (weekId: string) => void; // click a bar -> open that period
}

export interface WeeklyChartController {
  draw(): void;
  handlePointerMove(event: MouseEvent): void;
  handlePointerLeave(event?: MouseEvent): void;
  handleClick(event: MouseEvent): void;
  getBars(): any[]; // expose the internal chartBars array (for e2e diagnostics)
  destroy(): void; // cancel any pending rAF
}

interface WeeklyChartAnim {
  frame: number;
  from: any[] | null;
  to: any[] | null;
  start: number;
  duration: number;
}

export function createWeeklyChart(deps: WeeklyChartDeps): WeeklyChartController {
  const { canvas } = deps;

  // === per-instance state (was module-level globals in app.js) ===
  let chartBars: any[] = [];
  const weeklyChartAnim: WeeklyChartAnim = {
    frame: 0,
    from: null, // [{ nonGrocery, grocery, incidentals }] per bar
    to: null,
    start: 0,
    duration: 360,
  };

  function prepareCanvas(fallbackHeight: number): {
    ctx: CanvasRenderingContext2D | null;
    width: number;
    height: number;
  } {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, rect.width);
    const height = canvas.clientHeight || fallbackHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ctx, width, height };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height };
  }

  function draw(): void {
    // Cancel any in-flight animation FIRST so we can safely read its state.
    if (weeklyChartAnim.frame) {
      cancelAnimationFrame(weeklyChartAnim.frame);
      weeklyChartAnim.frame = 0;
    }
    // Capture the CURRENT interpolated state as `from` for smooth interruption.
    // If we were mid-animation, chartBars holds the last interpolated _interp values.
    // If we were static, chartBars holds the final _interp values (= previous `to`).
    // If this is the first render, chartBars is empty -> from = null -> no animation.
    if (chartBars.length && chartBars[0]?._interp) {
      weeklyChartAnim.from = chartBars.map((bar) => ({ ...bar._interp }));
    } else {
      weeklyChartAnim.from = weeklyChartAnim.to ? weeklyChartAnim.to.slice() : null;
    }
    if (REDUCED_MOTION || !weeklyChartAnim.from) {
      // No animation — render the final state immediately.
      weeklyChartAnim.from = null;
      renderWeeklyChartFrame(1);
      return;
    }
    // Render the FROM state immediately (progress=0) so there is no 1-frame
    // flicker where the chart briefly shows the final TO state before the
    // animation snaps it back to FROM.
    renderWeeklyChartFrame(0, true);
    weeklyChartAnim.start = performance.now();
    weeklyChartAnim.frame = requestAnimationFrame(animateWeeklyChart);
  }

  function animateWeeklyChart(now: number): void {
    // Guard: if `from` was cleared (e.g. by a REDUCED_MOTION change mid-flight), stop.
    if (!weeklyChartAnim.from) {
      weeklyChartAnim.frame = 0;
      renderWeeklyChartFrame(1);
      return;
    }
    const elapsed = now - weeklyChartAnim.start;
    const progress = Math.min(1, elapsed / weeklyChartAnim.duration);
    // ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    renderWeeklyChartFrame(eased, /* useFrom */ true);
    if (progress < 1) {
      weeklyChartAnim.frame = requestAnimationFrame(animateWeeklyChart);
    } else {
      weeklyChartAnim.frame = 0;
      // Ensure the final frame is rendered at exactly progress=1 (eased=1).
      renderWeeklyChartFrame(1, true);
    }
  }

  function interpolateBarValues(from: any[] | null, to: any[] | null, idx: number, eased: number): any {
    // Returns interpolated { nonGrocery, grocery, incidentals, cumulativeSpend } for bar idx.
    const f = from?.[idx] || { nonGrocery: 0, grocery: 0, incidentals: 0, cumulativeSpend: 0 };
    const tt = to?.[idx] || { nonGrocery: 0, grocery: 0, incidentals: 0, cumulativeSpend: 0 };
    return {
      nonGrocery: f.nonGrocery + (tt.nonGrocery - f.nonGrocery) * eased,
      grocery: f.grocery + (tt.grocery - f.grocery) * eased,
      incidentals: f.incidentals + (tt.incidentals - f.incidentals) * eased,
      cumulativeSpend: f.cumulativeSpend + (tt.cumulativeSpend - f.cumulativeSpend) * eased,
    };
  }

  function renderWeeklyChartFrame(progress: number = 1, useFrom: boolean = false): void {
    const { ctx, width, height } = prepareCanvas(360);
    if (!ctx) return;
    const t = deps.t;
    const rows = deps.getRows();
    const maxValue = Math.max(
      100,
      ...rows.map((row) => Math.max(row.weeklyTotal, row.nonGrocery + row.grocery + row.incidentals)),
    );
    const top = 28;
    const compact = width < 460;
    const right = compact ? 12 : 20;
    const bottom = 60;
    const left = compact ? 54 : 76;
    const chartWidth = Math.max(1, width - left - right);
    const chartHeight = Math.max(1, height - top - bottom);

    // === Background ===
    ctx.clearRect(0, 0, width, height);
    const cc = chartColors();
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, cc.bgTop);
    bgGrad.addColorStop(1, cc.bgBot);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // === Gridlines ===
    ctx.strokeStyle = cc.gridLine;
    ctx.fillStyle = cc.axisLabel;
    ctx.font = "12px Inter, Microsoft JhengHei, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const value = (maxValue / 4) * i;
      const y = top + chartHeight - (value / maxValue) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.fillText(formatCompactMoney(value), left - 10, y);
    }

    // === Bars ===
    chartBars = [];
    const gap = compact ? 10 : 26;
    const minBarWidth = compact ? 20 : 34;
    const barWidth = Math.max(minBarWidth, (chartWidth - gap * (rows.length + 1)) / Math.max(rows.length, 1));
    const colors = CATEGORY_CHART_COLORS;
    const gradients = CATEGORY_CHART_GRADIENTS;

    // Snapshot the "to" values for animation. We always snapshot, even on the
    // very first draw, so the next draw has a "from" to interpolate from.
    const toSnapshot = rows.map((row) => ({
      nonGrocery: row.nonGrocery,
      grocery: Math.max(0, row.grocery),
      incidentals: row.incidentals,
      cumulativeSpend: row.cumulativeSpend,
    }));
    weeklyChartAnim.to = toSnapshot;

    rows.forEach((row, index) => {
      const x = left + gap + index * (barWidth + gap);
      // The interpolated values for this frame.
      const interp = useFrom
        ? interpolateBarValues(weeklyChartAnim.from, toSnapshot, index, progress)
        : toSnapshot[index];
      let yBase = top + chartHeight;
      const segments: [string, string, number, string, string][] = [
        ["nonGrocery", t("nonGrocery"), interp.nonGrocery, gradients.nonGroceryTop, gradients.nonGroceryBot],
        ["grocery", t("grocery"), interp.grocery, gradients.groceryTop, gradients.groceryBot],
        ["incidentals", t("incidentals"), interp.incidentals, gradients.incidentalsTop, gradients.incidentalsBot],
      ];

      const isTopOfStack = (segIdx: number) => segIdx === segments.length - 1;
      segments.forEach(([key, label, value, gTop, gBot], segIdx) => {
        const h = (value / maxValue) * chartHeight;
        if (h <= 0.5) return; // skip near-zero segments
        const segmentX = x;
        const segmentY = yBase - h;
        ctx.save();
        // Gradient fill — top of segment brighter, bottom softer
        const segGrad = ctx.createLinearGradient(0, segmentY, 0, segmentY + h);
        segGrad.addColorStop(0, gTop);
        segGrad.addColorStop(1, gBot);
        ctx.fillStyle = segGrad;
        // Soft drop shadow under each segment for depth
        ctx.shadowColor = cc.shadowColor;
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 1;
        // Rounded top corners only when this is the topmost segment of the stack
        // CanvasRenderingContext2D.roundRect accepts an array of radii [tl, tr, br, bl]
        // in modern browsers (Chrome 99+, Safari 16+, Firefox 113+).
        const radius: number[] | number = isTopOfStack(segIdx) ? [6, 6, 2, 2] : 2;
        ctx.beginPath();
        if (Array.isArray(radius)) {
          // Manual rounded-rect path for array radii (safer across browsers)
          const [tl, tr, br, bl] = radius;
          ctx.moveTo(segmentX + tl, segmentY);
          ctx.lineTo(segmentX + barWidth - tr, segmentY);
          ctx.arcTo(segmentX + barWidth, segmentY, segmentX + barWidth, segmentY + tr, tr);
          ctx.lineTo(segmentX + barWidth, segmentY + h - br);
          ctx.arcTo(segmentX + barWidth, segmentY + h, segmentX + barWidth - br, segmentY + h, br);
          ctx.lineTo(segmentX + bl, segmentY + h);
          ctx.arcTo(segmentX, segmentY + h, segmentX, segmentY + h - bl, bl);
          ctx.lineTo(segmentX, segmentY + tl);
          ctx.arcTo(segmentX, segmentY, segmentX + tl, segmentY, tl);
        } else {
          ctx.roundRect(segmentX, segmentY, barWidth, h, radius);
        }
        ctx.fill();
        // Subtle inner highlight on top edge
        ctx.shadowColor = "transparent";
        ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
        ctx.fillRect(segmentX, segmentY, barWidth, 1);
        ctx.restore();
        // Label only when animation is mostly done so text doesn't jitter
        if (progress > 0.6) {
          drawSegmentLabel(ctx, label, value, segmentX, segmentY, barWidth, h);
        }
        yBase -= h;
      });

      drawCalendarBadge(ctx, x + barWidth / 2, top + chartHeight + 14, `P${index + 1}`, colors.nonGrocery, compact ? 0.9 : 1);

      chartBars.push({ x, y: top, width: barWidth, height: chartHeight, row, _interp: interp });
    });

    if (rows.length) drawCumulativeLine(ctx, chartBars, top, chartHeight, progress);
    drawLegend(ctx, width, colors);
  }

  function drawSegmentLabel(
    ctx: CanvasRenderingContext2D,
    label: string,
    value: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    if (value <= 0 || height < 28 || width < 42) return;
    ctx.save();
    // White text works on both light (colored bar) and dark (colored bar) — bars are always saturated colors
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 12px Inter, Microsoft JhengHei, sans-serif";
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const text = height >= 48 ? `${label}\n${formatCompactMoney(value)}` : label;
    const lines = width < 72 ? [formatCompactMoney(value)] : text.split("\n");
    if (lines.length === 1) {
      ctx.fillText(lines[0], centerX, centerY);
    } else {
      ctx.fillText(lines[0], centerX, centerY - 8);
      ctx.font = "700 11px Inter, Microsoft JhengHei, sans-serif";
      ctx.fillText(lines[1], centerX, centerY + 9);
    }
    ctx.restore();
  }

  function drawCalendarBadge(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    topY: number,
    label: string,
    accentColor: string,
    scale: number = 1,
  ): void {
    const width = 34 * scale;
    const height = 30 * scale;
    const x = centerX - width / 2;
    const y = topY;
    const radius = 7 * scale;
    const cc = chartColors();

    ctx.save();
    ctx.shadowColor = cc.shadowColor;
    ctx.shadowBlur = 8 * scale;
    ctx.shadowOffsetY = 2 * scale;
    ctx.fillStyle = cc.badgeBg;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.roundRect(x, y, width, 9 * scale, radius);
    ctx.fill();

    ctx.strokeStyle = cc.badgeBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

    ctx.fillStyle = cc.badgeText;
    ctx.font = `700 ${11 * scale}px Inter, Microsoft JhengHei, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, centerX, y + 20 * scale);
    ctx.restore();
  }

  // Retained from app.js (drawMonthBadge 5897-5927) for a faithful port even
  // though the weekly chart uses drawCalendarBadge for its axis badges.
  function drawMonthBadge(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    topY: number,
    label: string,
    accentColor: string,
    selected: boolean,
  ): void {
    const radius = selected ? 15 : 13;
    const cc = chartColors();

    ctx.save();
    ctx.shadowColor = selected ? "rgba(124, 92, 255, 0.32)" : cc.shadowColor;
    ctx.shadowBlur = selected ? 12 : 6;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = selected ? cc.badgeSelectedBg : cc.badgeBg;
    ctx.beginPath();
    ctx.arc(centerX, topY + radius, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.strokeStyle = selected ? accentColor : cc.badgeBorder;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.stroke();

    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(centerX, topY + 6, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = cc.badgeText;
    ctx.font = "700 11px Inter, Microsoft JhengHei, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, centerX, topY + radius + 2);
    ctx.restore();
  }

  function drawLegend(ctx: CanvasRenderingContext2D, width: number, colors: typeof CATEGORY_CHART_COLORS): void {
    const t = deps.t;
    const items: [string, string][] = [
      [t("nonGrocery"), colors.nonGrocery],
      [t("grocery"), colors.grocery],
      [t("incidentals"), colors.incidentals],
    ];
    let x = Math.max(8, width - 250);
    const cc = chartColors();
    ctx.save();
    ctx.font = "700 11.5px Inter, Microsoft JhengHei, sans-serif";
    items.forEach(([label, color]) => {
      // Rounded square swatch with subtle inner highlight
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, 7, 12, 12, 3);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.fillRect(x, 7, 12, 1);
      ctx.fillStyle = cc.axisLabel;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + 18, 14);
      x += 76;
    });
    // Cumulative line swatch — left-aligned, distinct from the bar swatches
    const lx = 8,
      ly = 13;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = cc.cumulativeLine;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + 14, ly);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(lx + 7, ly, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = cc.cumulativeLine;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lx + 7, ly, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = cc.dotFill;
    ctx.fill();
    ctx.fillStyle = cc.axisLabel;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(t("cumulative"), lx + 20, ly);
    ctx.restore();
  }

  function drawCumulativeLine(
    ctx: CanvasRenderingContext2D,
    bars: any[],
    top: number,
    chartHeight: number,
    progress: number,
  ): void {
    if (!bars.length) return;
    const vals = bars.map((b) => b._interp?.cumulativeSpend || 0);
    if (vals.every((v: number) => v === 0)) return;
    const maxCumulative = Math.max(1, ...vals);
    const points = bars.map((bar, i) => ({
      x: bar.x + bar.width / 2,
      y: top + chartHeight - (vals[i] / maxCumulative) * chartHeight,
      v: vals[i],
    }));
    const cc = chartColors();
    ctx.save();

    // Subtle area fill beneath the line
    ctx.beginPath();
    ctx.moveTo(points[0].x, top + chartHeight);
    ctx.lineTo(points[0].x, points[0].y);
    if (points.length > 1) {
      for (let i = 1; i < points.length; i++) {
        const cpx = (points[i - 1].x + points[i].x) / 2;
        ctx.bezierCurveTo(cpx, points[i - 1].y, cpx, points[i].y, points[i].x, points[i].y);
      }
    }
    ctx.lineTo(points[points.length - 1].x, top + chartHeight);
    ctx.closePath();
    const areaGrad = ctx.createLinearGradient(0, top, 0, top + chartHeight);
    areaGrad.addColorStop(0, cc.cumulativeArea);
    areaGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // Smooth bezier line
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = cc.cumulativeLine;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = cc.shadowColor;
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;
    ctx.beginPath();
    points.forEach((pt, i) => {
      if (i === 0) {
        ctx.moveTo(pt.x, pt.y);
      } else {
        const cpx = (points[i - 1].x + pt.x) / 2;
        ctx.bezierCurveTo(cpx, points[i - 1].y, cpx, pt.y, pt.x, pt.y);
      }
    });
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Dots and value bubbles at each period
    points.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = cc.cumulativeLine;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = cc.dotFill;
      ctx.fill();

      if (progress > 0.65 && pt.v > 0) {
        const text = formatCompactMoney(pt.v);
        ctx.font = "700 10px Inter, Microsoft JhengHei, sans-serif";
        const tw = ctx.measureText(text).width;
        const padH = 5;
        const bubbleW = tw + padH * 2;
        const bubbleH = 16;
        const bubbleX = pt.x - bubbleW / 2;
        const bubbleY = pt.y - 10 - bubbleH;
        ctx.fillStyle = cc.valueBubbleBg;
        ctx.strokeStyle = cc.valueBubbleBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = cc.cumulativeLine;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, pt.x, bubbleY + bubbleH / 2);
      }
    });

    ctx.restore();
  }

  function chartPoint(event: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function handlePointerMove(event: MouseEvent): void {
    const t = deps.t;
    const tooltip = deps.tooltipEl;
    if ((event as PointerEvent).pointerType === "touch") return;
    const point = chartPoint(event);
    const bar = chartBars.find((item) => point.x >= item.x && point.x <= item.x + item.width);
    if (!bar) {
      if (tooltip) tooltip.classList.add("hidden");
      return;
    }

    if (tooltip) {
      tooltip.innerHTML = `
    <div class="chart-detail-primary">
      <strong>${escapeHtml(formatPeriodDisplay(bar.row.week.period) || t("unnamedPeriod"))}</strong>
      <span>${escapeHtml(t("weeklyTotal"))} · ${formatMoney(bar.row.weeklyTotal)}</span>
    </div>
    <div class="chart-detail-metric"><span>${escapeHtml(t("nonGrocery"))}</span><strong>${formatMoney(bar.row.nonGrocery)}</strong></div>
    <div class="chart-detail-metric"><span>${escapeHtml(t("grocery"))}</span><strong>${formatMoney(bar.row.grocery)}</strong></div>
    <div class="chart-detail-metric"><span>${escapeHtml(t("incidentals"))}</span><strong>${formatMoney(bar.row.incidentals)}</strong></div>
  `;
      tooltip.classList.remove("hidden");
    }
  }

  function handlePointerLeave(event?: MouseEvent): void {
    if (event && (event as PointerEvent).pointerType === "touch") return;
    if (deps.tooltipEl) deps.tooltipEl.classList.add("hidden");
  }

  function handleClick(event: MouseEvent): void {
    const point = chartPoint(event);
    const bar = chartBars.find((item) => point.x >= item.x && point.x <= item.x + item.width);
    if (!bar) return;
    if (deps.tooltipEl) {
      const t = deps.t;
      deps.tooltipEl.innerHTML = `
    <div class="chart-detail-primary">
      <strong>${escapeHtml(formatPeriodDisplay(bar.row.week.period) || t("unnamedPeriod"))}</strong>
      <span>${escapeHtml(t("weeklyTotal"))} · ${formatMoney(bar.row.weeklyTotal)}</span>
    </div>
    <div class="chart-detail-metric"><span>${escapeHtml(t("nonGrocery"))}</span><strong>${formatMoney(bar.row.nonGrocery)}</strong></div>
    <div class="chart-detail-metric"><span>${escapeHtml(t("grocery"))}</span><strong>${formatMoney(bar.row.grocery)}</strong></div>
    <div class="chart-detail-metric"><span>${escapeHtml(t("incidentals"))}</span><strong>${formatMoney(bar.row.incidentals)}</strong></div>
  `;
      deps.tooltipEl.classList.remove("hidden");
    }
    deps.onSelectWeek(bar.row.week.id);
  }

  function getBars(): any[] {
    return chartBars;
  }

  function destroy(): void {
    if (weeklyChartAnim.frame) {
      cancelAnimationFrame(weeklyChartAnim.frame);
      weeklyChartAnim.frame = 0;
    }
  }

  // Reference retained helpers so the faithful port keeps them without TS
  // "unused" errors; drawMonthBadge/getMonthName mirror the original file.
  void drawMonthBadge;
  void deps.getMonthName;

  return {
    draw,
    handlePointerMove,
    handlePointerLeave,
    handleClick,
    getBars,
    destroy,
  };
}
