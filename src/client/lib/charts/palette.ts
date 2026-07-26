// Canvas chart palette, ported verbatim from app.js (957-996, 1046-1065). Canvas can't
// read CSS variables, so chartColors() returns an explicit palette per theme. The
// category color literals below are asserted by an e2e test — keep them exact.
import { isDarkMode } from "$lib/stores/theme";

export const CATEGORY_CHART_COLORS = Object.freeze({
  nonGrocery: "rgba(109, 92, 255, 0.78)", // violet
  grocery: "rgba(22, 163, 148, 0.78)", // teal
  incidentals: "rgba(224, 103, 156, 0.78)", // pink
});

export const CATEGORY_CHART_LABEL_COLORS = Object.freeze({
  nonGrocery: "#6d5cff",
  grocery: "#16a394",
  incidentals: "#e0679c",
});

export const CATEGORY_CHART_GRADIENTS = Object.freeze({
  nonGroceryTop: "rgba(109, 92, 255, 0.92)",
  nonGroceryBot: "rgba(109, 92, 255, 0.55)",
  groceryTop: "rgba(22, 163, 148, 0.92)",
  groceryBot: "rgba(22, 163, 148, 0.55)",
  incidentalsTop: "rgba(224, 103, 156, 0.92)",
  incidentalsBot: "rgba(224, 103, 156, 0.55)",
});

export interface ChartColors {
  bgTop: string;
  bgBot: string;
  gridLine: string;
  axisLabel: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  badgeSelectedBg: string;
  dotFill: string;
  valueBubbleBg: string;
  valueBubbleBorder: string;
  shadowColor: string;
  highlightBand: string;
  highlightEdge: string;
  cumulativeLine: string;
  cumulativeArea: string;
}

export const REDUCED_MOTION =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function chartColors(): ChartColors {
  if (isDarkMode()) {
    return {
      bgTop: "#1a221d",
      bgBot: "#161e19",
      gridLine: "rgba(42, 53, 48, 0.6)",
      axisLabel: "#9aa8a0",
      badgeBg: "#1f2a24",
      badgeBorder: "rgba(255, 255, 255, 0.08)",
      badgeText: "#e8efe8",
      badgeSelectedBg: "rgba(45, 212, 168, 0.18)",
      dotFill: "#1a221d",
      valueBubbleBg: "rgba(26, 34, 29, 0.96)",
      valueBubbleBorder: "rgba(255, 255, 255, 0.10)",
      shadowColor: "rgba(0, 0, 0, 0.30)",
      highlightBand: "rgba(45, 212, 168, 0.08)",
      highlightEdge: "rgba(45, 212, 168, 0.30)",
      cumulativeLine: "rgba(251, 191, 36, 0.92)",
      cumulativeArea: "rgba(251, 191, 36, 0.12)",
    };
  }
  return {
    bgTop: "#ffffff",
    bgBot: "#fbfdfb",
    gridLine: "rgba(216, 224, 216, 0.7)",
    axisLabel: "#5f6b63",
    badgeBg: "#ffffff",
    badgeBorder: "rgba(20, 38, 31, 0.14)",
    badgeText: "#15201b",
    badgeSelectedBg: "#f5f1ff",
    dotFill: "#ffffff",
    valueBubbleBg: "rgba(255, 255, 255, 0.92)",
    valueBubbleBorder: "rgba(20, 38, 31, 0.10)",
    shadowColor: "rgba(20, 38, 31, 0.10)",
    highlightBand: "rgba(124, 92, 255, 0.10)",
    highlightEdge: "rgba(124, 92, 255, 0.35)",
    cumulativeLine: "rgba(245, 124, 32, 0.90)",
    cumulativeArea: "rgba(245, 124, 32, 0.10)",
  };
}
