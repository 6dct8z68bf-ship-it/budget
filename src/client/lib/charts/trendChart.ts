// Monthly trend multi-line + status-bar Canvas chart, ported faithfully from
// app.js (renderMonthlyTrendAccessibleView 6101-6137, drawMonthlyTrendChart
// 6139-6148, animateTrendChart 6150-6170, interpolateTrendValues 6171-6181,
// renderTrendChartFrame 6182-6392, drawTrendLineAnimated 6394-6483, drawTrendLine
// 6485-6540, drawTrendLegend 6542-6566, selectMonthFromTrend 6568-6591,
// showTrendTooltip 6593-6622, plus the shared chartPoint / positionTooltipWithinChart
// helpers 6652-6668 and monthAxisLabel 7124-7129). Drawing/animation/pixel math
// preserved verbatim; only input access is adapted (globals -> deps).
import type { TrendRow, StatusKind } from "$lib/overview";
import {
  formatMoney,
  formatCompactMoney,
  escapeHtml,
  shortMonthName,
} from "$lib/format";
import {
  chartColors,
  CATEGORY_CHART_COLORS,
  CATEGORY_CHART_LABEL_COLORS,
} from "$lib/charts/palette";

export interface TrendChartDeps {
  canvas: HTMLCanvasElement;
  tableEl: HTMLElement | null; // #monthlyTrendTable (accessible mirror)
  tooltipEl: HTMLElement | null; // #trendTooltip
  getRows: () => TrendRow[]; // monthlyTrendRows(state)
  getCurrentMonthId: () => string;
  getStatusKindFor: (monthId: string) => StatusKind; // replaces `_barStatusKind || monthlyStatusKind(month)`
  t: (key: string, ...args: unknown[]) => string;
  onSelectMonth: (monthId: string) => void;
}

export interface TrendChartController {
  draw(): void;
  handlePointerMove(event: MouseEvent): void;
  handlePointerLeave(event?: MouseEvent): void;
  handleClick(event: MouseEvent): void;
  getPoints(): any[]; // expose internal trendPoints array (for e2e diagnostics)
  destroy(): void;
}

interface TrendChartAnim {
  frame: number;
  from: any[] | null;
  to: any[] | null;
  start: number;
  duration: number;
}

export function createTrendChart(deps: TrendChartDeps): TrendChartController {
  const { canvas } = deps;

  // === per-instance state (was module-level globals in app.js) ===
  let trendPoints: any[] = [];
  const trendChartAnim: TrendChartAnim = {
    frame: 0,
    from: null, // [{ nonGrocery, grocery, incidentals }] per row
    to: null,
    start: 0,
    duration: 480,
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

  function monthAxisLabel(row: any): string {
    const sortKey = row?.sortKey || row?.id || "";
    const match = String(sortKey).match(/^\d{4}-(\d{2})$/);
    if (match) return match[1];
    return shortMonthName(row?.name || "").slice(0, 2).toUpperCase();
  }

  function renderMonthlyTrendAccessibleView(rows: TrendRow[]): void {
    const t = deps.t;
    if (canvas) {
      const summary = rows
        .map(
          (row) =>
            `${row.name}: ${t("nonGrocery")} ${formatMoney(row.nonGrocery)}, ${t("grocery")} ${formatMoney(
              row.grocery,
            )}, ${t("incidentals")} ${formatMoney(row.incidentals)}`,
        )
        .join("; ");
      canvas.setAttribute("aria-label", `${t("monthlyTrend")}. ${summary}`);
    }
    const table = deps.tableEl;
    if (!table) return;
    if (!rows.length) {
      table.innerHTML = "";
      return;
    }
    const head = `<caption>${escapeHtml(t("monthlyTrend"))}</caption>
    <thead><tr>
      <th scope="col">${escapeHtml(t("month"))}</th>
      <th scope="col">${escapeHtml(t("nonGrocery"))}</th>
      <th scope="col">${escapeHtml(t("grocery"))}</th>
      <th scope="col">${escapeHtml(t("incidentals"))}</th>
      <th scope="col">${escapeHtml(t("total"))}</th>
    </tr></thead>`;
    const body = rows
      .map(
        (row) =>
          `<tr><th scope="row">${escapeHtml(row.name)}</th><td>${escapeHtml(formatMoney(row.nonGrocery))}</td><td>${escapeHtml(
            formatMoney(row.grocery),
          )}</td><td>${escapeHtml(formatMoney(row.incidentals))}</td><td>${escapeHtml(formatMoney(row.total))}</td></tr>`,
      )
      .join("");
    table.innerHTML = `${head}<tbody>${body}</tbody>`;
  }

  function draw(): void {
    if (trendChartAnim.frame) {
      cancelAnimationFrame(trendChartAnim.frame);
      trendChartAnim.frame = 0;
    }
    trendChartAnim.from = null;
    renderTrendChartFrame(1);
  }

  function animateTrendChart(now: number): void {
    // Guard: if `from` was cleared mid-flight, stop and render the final state.
    if (!trendChartAnim.from) {
      trendChartAnim.frame = 0;
      renderTrendChartFrame(1);
      return;
    }
    const elapsed = now - trendChartAnim.start;
    const progress = Math.min(1, elapsed / trendChartAnim.duration);
    // ease-out quint for a more "drawn-in" feel
    const eased = 1 - Math.pow(1 - progress, 5);
    renderTrendChartFrame(eased, /* useFrom */ true);
    if (progress < 1) {
      trendChartAnim.frame = requestAnimationFrame(animateTrendChart);
    } else {
      trendChartAnim.frame = 0;
      // Ensure the final frame is rendered at exactly progress=1 (eased=1).
      renderTrendChartFrame(1, true);
    }
  }

  function interpolateTrendValues(from: any[] | null, to: any[] | null, idx: number, eased: number): any {
    const f = from?.[idx] || { nonGrocery: 0, grocery: 0, incidentals: 0, total: 0 };
    const tt = to?.[idx] || { nonGrocery: 0, grocery: 0, incidentals: 0, total: 0 };
    return {
      nonGrocery: f.nonGrocery + (tt.nonGrocery - f.nonGrocery) * eased,
      grocery: f.grocery + (tt.grocery - f.grocery) * eased,
      incidentals: f.incidentals + (tt.incidentals - f.incidentals) * eased,
      total: f.total + (tt.total - f.total) * eased,
    };
  }

  function renderTrendChartFrame(progress: number = 1, useFrom: boolean = false): void {
    const { ctx, width, height } = prepareCanvas(340);
    if (!ctx) return;
    const t = deps.t;
    const currentMonthId = deps.getCurrentMonthId();
    const rows = deps.getRows();
    renderMonthlyTrendAccessibleView(rows);
    const top = 34;
    const compact = width < 460;
    const right = compact ? 12 : 24;
    const bottom = 66;
    const left = compact ? 54 : 76;
    const chartWidth = Math.max(1, width - left - right);
    const chartHeight = Math.max(1, height - top - bottom);
    const colors = CATEGORY_CHART_COLORS;
    const labelColors = CATEGORY_CHART_LABEL_COLORS;

    // === Background ===
    ctx.clearRect(0, 0, width, height);
    const cc = chartColors();
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, cc.bgTop);
    bgGrad.addColorStop(1, cc.bgBot);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    if (rows.length < 2) {
      ctx.fillStyle = cc.axisLabel;
      ctx.font = "700 14px Inter, Microsoft JhengHei, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t("needTwoMonths"), width / 2, height / 2);
      trendPoints = [];
      drawTrendLegend(ctx, width, colors);
      return;
    }

    const maxValue = Math.max(
      100,
      ...rows.flatMap((row) => [row.nonGrocery, row.grocery, row.incidentals, row.total]),
    );

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

    const xForIndex = (index: number) => left + (chartWidth / Math.max(rows.length - 1, 1)) * index;
    const yForValue = (value: number) => top + chartHeight - (value / maxValue) * chartHeight;

    // === Snapshot "to" for animation ===
    const toSnapshot = rows.map((row) => ({
      nonGrocery: row.nonGrocery,
      grocery: row.grocery,
      incidentals: row.incidentals,
      total: row.total,
    }));
    trendChartAnim.to = toSnapshot;

    // === Highlight current month ===
    var currentMonthTrendIndex = rows.findIndex(function (r) {
      return r.id === currentMonthId;
    });
    if (currentMonthTrendIndex >= 0) {
      var highlightX: number, highlightW: number;
      if (rows.length === 1) {
        highlightX = left;
        highlightW = chartWidth;
      } else {
        var spacing = chartWidth / (rows.length - 1);
        highlightX = xForIndex(currentMonthTrendIndex) - spacing / 2;
        highlightW = spacing;
      }
      ctx.save();
      // Soft highlighter band (theme-aware)
      const hgrad = ctx.createLinearGradient(0, top, 0, top + chartHeight);
      hgrad.addColorStop(0, cc.highlightBand);
      hgrad.addColorStop(1, cc.highlightBand);
      ctx.fillStyle = hgrad;
      ctx.fillRect(highlightX, top, highlightW, chartHeight);
      // Vertical accent line on left edge of highlight band
      ctx.strokeStyle = cc.highlightEdge;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(highlightX, top);
      ctx.lineTo(highlightX, top + chartHeight);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(highlightX + highlightW, top);
      ctx.lineTo(highlightX + highlightW, top + chartHeight);
      ctx.stroke();
      ctx.restore();
    }

    // === Build interpolated trendPoints (for hit-testing + drawing) ===
    trendPoints = rows.map((row, index) => {
      const interp = useFrom
        ? interpolateTrendValues(trendChartAnim.from, toSnapshot, index, progress)
        : toSnapshot[index];
      return {
        row,
        x: xForIndex(index),
        nonGroceryY: yForValue(interp.nonGrocery),
        groceryY: yForValue(interp.grocery),
        incidentalsY: yForValue(interp.incidentals),
        _interp: interp,
      };
    });

    // === Monthly total bars (drawn behind the lines) ===
    const statusBarColors: Record<string, string> = {
      good: "rgba(31, 143, 111, 0.62)",
      watch: "rgba(217, 119, 52, 0.62)",
      over: "rgba(197, 65, 61, 0.62)",
      empty: "rgba(102, 115, 107, 0.24)",
    };
    const statusBarGradTop: Record<string, string> = {
      good: "rgba(31, 143, 111, 0.78)",
      watch: "rgba(217, 119, 52, 0.78)",
      over: "rgba(197, 65, 61, 0.78)",
      empty: "rgba(102, 115, 107, 0.32)",
    };

    rows.forEach((row, index) => {
      const kind = deps.getStatusKindFor(row.id);
      const interp = trendPoints[index]._interp;
      const barValue = interp.total;
      const barTop = yForValue(barValue);
      const barBottom = top + chartHeight;
      const barWidth = rows.length > 1 ? (chartWidth / (rows.length - 1)) * 0.45 : chartWidth * 0.35;
      const barX = xForIndex(index) - barWidth / 2;

      ctx.save();
      // Gradient fill on the status bar
      const bgrad = ctx.createLinearGradient(0, barTop, 0, barBottom);
      bgrad.addColorStop(0, statusBarGradTop[kind] || statusBarGradTop.empty);
      bgrad.addColorStop(1, statusBarColors[kind] || statusBarColors.empty);
      ctx.fillStyle = bgrad;
      ctx.shadowColor = "rgba(20, 38, 31, 0.08)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1;
      ctx.beginPath();
      ctx.roundRect(barX, barTop, barWidth, barBottom - barTop, 4);
      ctx.fill();
      ctx.restore();
    });

    // === Trend lines (with progressive draw-in animation) ===
    // When progress < 1, only draw the line up to (progress * length) of the way.
    drawTrendLineAnimated(ctx, trendPoints, "nonGroceryY", colors.nonGrocery, progress, top, chartHeight);
    drawTrendLineAnimated(ctx, trendPoints, "groceryY", colors.grocery, progress, top, chartHeight);
    drawTrendLineAnimated(ctx, trendPoints, "incidentalsY", colors.incidentals, progress, top, chartHeight);

    // === Value indicators for selected month (only when animation is mostly done) ===
    if (currentMonthTrendIndex >= 0 && trendPoints[currentMonthTrendIndex] && progress > 0.7) {
      const pt = trendPoints[currentMonthTrendIndex];
      const cats: { y: number; value: number | undefined; color: string; key: keyof typeof labelColors }[] = [
        { y: pt.nonGroceryY, value: rows[currentMonthTrendIndex]?.nonGrocery, color: colors.nonGrocery, key: "nonGrocery" },
        { y: pt.groceryY, value: rows[currentMonthTrendIndex]?.grocery, color: colors.grocery, key: "grocery" },
        { y: pt.incidentalsY, value: rows[currentMonthTrendIndex]?.incidentals, color: colors.incidentals, key: "incidentals" },
      ];
      cats.forEach((cat) => {
        if (!cat.value || cat.value <= 0) return;
        ctx.save();
        ctx.font = "700 11px Inter, Microsoft JhengHei, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        const label = formatCompactMoney(cat.value);
        const txtX = pt.x;
        const txtY = cat.y - 8;
        const metrics = ctx.measureText(label);
        const pad = 5;
        const bw = metrics.width + pad * 2;
        const bh = 18;
        const bx = txtX - bw / 2;
        const by = txtY - bh;
        // Glow effect on the value bubble
        ctx.shadowColor = cc.shadowColor;
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = cc.valueBubbleBg;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 6);
        ctx.fill();
        ctx.shadowColor = "transparent";
        // Subtle accent border on the bubble
        ctx.strokeStyle = cat.color;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = labelColors[cat.key];
        ctx.fillText(label, txtX, txtY);
        ctx.restore();
      });
    }

    rows.forEach((row, index) => {
      drawMonthBadge(ctx, xForIndex(index), top + chartHeight + 14, monthAxisLabel(row), colors.nonGrocery, row.id === currentMonthId);
    });

    drawTrendLegend(ctx, width, colors);
  }

  function drawTrendLineAnimated(
    ctx: CanvasRenderingContext2D,
    points: any[],
    yKey: string,
    color: string,
    progress: number,
    top: number,
    chartHeight: number,
  ): void {
    if (!points || points.length === 0) return;
    const clampedProgress = Math.max(0, Math.min(1, progress));
    const cc = chartColors();
    ctx.save();

    const totalSegs = points.length - 1;
    const segProgress = clampedProgress * totalSegs;
    const fullSegs = Math.max(0, Math.floor(segProgress));
    const partialFrac = segProgress - fullSegs;
    const maxIndex = Math.min(points.length - 1, fullSegs + (partialFrac > 0 ? 1 : 0));

    // === Area fill beneath the line ===
    if (top !== undefined && chartHeight !== undefined && maxIndex >= 0) {
      const chartBottom = top + chartHeight;
      ctx.beginPath();
      ctx.moveTo(points[0].x, chartBottom);
      ctx.lineTo(points[0].x, points[0][yKey]);
      for (let i = 1; i <= maxIndex; i++) {
        const prev = points[i - 1];
        const pt = points[i];
        const isLastPartial = i === fullSegs + 1 && partialFrac > 0 && partialFrac < 1;
        const endX = isLastPartial ? prev.x + (pt.x - prev.x) * partialFrac : pt.x;
        const endY = isLastPartial ? prev[yKey] + (pt[yKey] - prev[yKey]) * partialFrac : pt[yKey];
        const cpx = (prev.x + endX) / 2;
        ctx.bezierCurveTo(cpx, prev[yKey], cpx, endY, endX, endY);
        if (isLastPartial) break;
      }
      const lastPt = points[Math.min(maxIndex, fullSegs + (partialFrac > 0 ? 1 : 0))];
      const lastX =
        partialFrac > 0 && maxIndex > fullSegs
          ? points[fullSegs].x + (lastPt.x - points[fullSegs].x) * partialFrac
          : lastPt.x;
      ctx.lineTo(lastX, chartBottom);
      ctx.closePath();
      const areaColor = color.replace(/[\d.]+\)$/, "0.09)");
      const areaGrad = ctx.createLinearGradient(0, top, 0, chartBottom);
      areaGrad.addColorStop(0, areaColor);
      areaGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = areaGrad;
      ctx.fill();
    }

    // === Smooth bezier line stroke ===
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = cc.shadowColor;
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    ctx.beginPath();
    for (let index = 0; index <= maxIndex; index++) {
      const point = points[index];
      if (!point || point.x == null || point[yKey] == null) break;
      if (index === 0) {
        ctx.moveTo(point.x, point[yKey]);
      } else if (index <= fullSegs) {
        const prev = points[index - 1];
        const cpx = (prev.x + point.x) / 2;
        ctx.bezierCurveTo(cpx, prev[yKey], cpx, point[yKey], point.x, point[yKey]);
      } else if (partialFrac > 0 && index === fullSegs + 1) {
        const prev = points[index - 1];
        if (!prev || prev.x == null || prev[yKey] == null) break;
        const x = prev.x + (point.x - prev.x) * partialFrac;
        const y = prev[yKey] + (point[yKey] - prev[yKey]) * partialFrac;
        const cpx = (prev.x + x) / 2;
        ctx.bezierCurveTo(cpx, prev[yKey], cpx, y, x, y);
      }
    }
    ctx.stroke();

    // === Dots (solid colored outer, hollow dotFill inner) ===
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    for (let index = 0; index <= maxIndex; index++) {
      const point = points[index];
      if (!point || point.x == null || point[yKey] == null) break;
      if (index === fullSegs + 1 && partialFrac > 0 && partialFrac < 1) continue;
      ctx.beginPath();
      ctx.arc(point.x, point[yKey], 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(point.x, point[yKey], 2.8, 0, Math.PI * 2);
      ctx.fillStyle = cc.dotFill;
      ctx.fill();
    }
    ctx.restore();
  }

  // Retained from app.js (drawTrendLine 6485-6540) for a faithful port even
  // though renderTrendChartFrame uses drawTrendLineAnimated.
  function drawTrendLine(
    ctx: CanvasRenderingContext2D,
    points: any[],
    yKey: string,
    color: string,
    top: number,
    chartHeight: number,
  ): void {
    const cc = chartColors();
    ctx.save();

    // === Area fill ===
    if (top !== undefined && chartHeight !== undefined && points.length > 0) {
      const chartBottom = top + chartHeight;
      ctx.beginPath();
      ctx.moveTo(points[0].x, chartBottom);
      ctx.lineTo(points[0].x, points[0][yKey]);
      points.forEach((pt, i) => {
        if (i === 0) return;
        const prev = points[i - 1];
        const cpx = (prev.x + pt.x) / 2;
        ctx.bezierCurveTo(cpx, prev[yKey], cpx, pt[yKey], pt.x, pt[yKey]);
      });
      ctx.lineTo(points[points.length - 1].x, chartBottom);
      ctx.closePath();
      const areaColor = color.replace(/[\d.]+\)$/, "0.09)");
      const areaGrad = ctx.createLinearGradient(0, top, 0, chartBottom);
      areaGrad.addColorStop(0, areaColor);
      areaGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = areaGrad;
      ctx.fill();
    }

    // === Bezier line stroke ===
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point[yKey]);
      } else {
        const prev = points[index - 1];
        const cpx = (prev.x + point.x) / 2;
        ctx.bezierCurveTo(cpx, prev[yKey], cpx, point[yKey], point.x, point[yKey]);
      }
    });
    ctx.stroke();

    // === Dots ===
    points.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point[yKey], 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(point.x, point[yKey], 2.8, 0, Math.PI * 2);
      ctx.fillStyle = cc.dotFill;
      ctx.fill();
    });
    ctx.restore();
  }

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

  function drawTrendLegend(ctx: CanvasRenderingContext2D, width: number, colors: typeof CATEGORY_CHART_COLORS): void {
    const t = deps.t;
    const items: [string, string][] = [
      [t("nonGrocery"), colors.nonGrocery],
      [t("grocery"), colors.grocery],
      [t("incidentals"), colors.incidentals],
    ];
    let x = Math.max(8, width - 290);
    const cc = chartColors();
    ctx.save();
    ctx.font = "700 11.5px Inter, Microsoft JhengHei, sans-serif";
    items.forEach(([label, color]) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, 9, 12, 12, 3);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.fillRect(x, 9, 12, 1);
      ctx.fillStyle = cc.axisLabel;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + 18, 16);
      x += 92;
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

  function handleClick(event: MouseEvent): void {
    if (!trendPoints.length) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    // Find nearest point within half-spacing distance
    const spacing =
      trendPoints.length > 1
        ? (trendPoints[trendPoints.length - 1].x - trendPoints[0].x) / (trendPoints.length - 1)
        : 0;
    const maxDist = spacing > 0 ? spacing / 2 : 36;
    var nearest: any = null;
    var nearestDist = Infinity;
    trendPoints.forEach(function (item) {
      var d = Math.abs(item.x - clickX);
      if (d < nearestDist) {
        nearest = item;
        nearestDist = d;
      }
    });
    if (!nearest || nearestDist > maxDist) return;
    var monthId = nearest.row.id;
    if (deps.tooltipEl) {
      const t = deps.t;
      deps.tooltipEl.innerHTML = `
    <div class="chart-detail-primary">
      <strong>${escapeHtml(nearest.row.name)}</strong>
      <span>${escapeHtml(t("monthlyTotal"))} · ${formatMoney(nearest.row.total)}</span>
    </div>
    <div class="chart-detail-metric"><span>${escapeHtml(t("nonGrocery"))}</span><strong>${formatMoney(nearest.row.nonGrocery)}</strong></div>
    <div class="chart-detail-metric"><span>${escapeHtml(t("grocery"))}</span><strong>${formatMoney(nearest.row.grocery)}</strong></div>
    <div class="chart-detail-metric"><span>${escapeHtml(t("incidentals"))}</span><strong>${formatMoney(nearest.row.incidentals)}</strong></div>
  `;
      deps.tooltipEl.classList.remove("hidden");
    }
    if (monthId && monthId !== deps.getCurrentMonthId()) {
      deps.onSelectMonth(monthId);
    }
  }

  function handlePointerMove(event: MouseEvent): void {
    const t = deps.t;
    const tooltip = deps.tooltipEl;
    if ((event as PointerEvent).pointerType === "touch") return;
    if (!trendPoints.length) {
      if (tooltip) tooltip.classList.add("hidden");
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const nearest = trendPoints.reduce<{ item: any; distance: number } | null>((best, item) => {
      const distance = Math.abs(item.x - point.x);
      return !best || distance < best.distance ? { item, distance } : best;
    }, null);
    if (!nearest || nearest.distance > 36) {
      if (tooltip) tooltip.classList.add("hidden");
      return;
    }

    const row = nearest.item.row;
    if (tooltip) {
      tooltip.innerHTML = `
    <div class="chart-detail-primary">
      <strong>${escapeHtml(row.name)}</strong>
      <span>${escapeHtml(t("monthlyTotal"))} · ${formatMoney(row.total)}</span>
    </div>
    <div class="chart-detail-metric"><span>${escapeHtml(t("nonGrocery"))}</span><strong>${formatMoney(row.nonGrocery)}</strong></div>
    <div class="chart-detail-metric"><span>${escapeHtml(t("grocery"))}</span><strong>${formatMoney(row.grocery)}</strong></div>
    <div class="chart-detail-metric"><span>${escapeHtml(t("incidentals"))}</span><strong>${formatMoney(row.incidentals)}</strong></div>
  `;
      tooltip.classList.remove("hidden");
    }
  }

  function handlePointerLeave(event?: MouseEvent): void {
    if (event && (event as PointerEvent).pointerType === "touch") return;
    if (deps.tooltipEl) deps.tooltipEl.classList.add("hidden");
  }

  function getPoints(): any[] {
    return trendPoints;
  }

  function destroy(): void {
    if (trendChartAnim.frame) {
      cancelAnimationFrame(trendChartAnim.frame);
      trendChartAnim.frame = 0;
    }
  }

  // Reference retained helpers so the faithful port keeps them without TS
  // "unused" errors; drawTrendLine/animateTrendChart mirror the original file.
  void drawTrendLine;
  void animateTrendChart;

  return {
    draw,
    handlePointerMove,
    handlePointerLeave,
    handleClick,
    getPoints,
    destroy,
  };
}
