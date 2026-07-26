// Ported from app.js formatting + numeric/date utilities (7001-7170, 4716, 4785).
// Language-dependent formatters read the active language from the i18n store.
import { get } from "svelte/store";
import { language } from "$lib/stores/i18n";

const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const money = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
});

// === numeric ===
export function numberOrZero(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function numberOrNull(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function roundCurrency(value: unknown): number {
  return Math.round((numberOrZero(value) + Number.EPSILON) * 100) / 100;
}

// === money ===
export function formatMoney(value: unknown): string {
  return money.format(roundCurrency(value));
}

export function formatSignedMoney(value: unknown): string {
  const rounded = roundCurrency(value);
  if (rounded === 0) return formatMoney(0);
  return `${rounded > 0 ? "+" : "-"}${formatMoney(Math.abs(rounded))}`;
}

export function formatPercent(value: unknown): string {
  const percent = Math.max(0, numberOrZero(value)) * 100;
  return `${Math.round(percent)}%`;
}

export function formatCompactMoney(value: number): string {
  if (value >= 1000) return `$${Math.round(value / 100) / 10}k`;
  return `$${Math.round(value)}`;
}

export function valueForInput(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

// === dates / periods ===
export function shortPeriod(period: string): string {
  if (!period) return "";
  return period.replace(/\s+/g, " ").replace(" - ", "-");
}

export interface IsoDateParts {
  year: number;
  month: number;
  day: number;
}

export function parseIsoDateParts(value: unknown): IsoDateParts | null {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function toIsoDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeYear(value: unknown, fallback: number): number {
  if (!value) return fallback;
  const year = Number(value);
  return year < 100 ? 2000 + year : year;
}

function monthShortName(monthNumber: number): string {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][monthNumber - 1] || "";
}

export function monthLongName(monthNumber: number): string {
  return MONTH_NAMES_EN[monthNumber - 1] || "";
}

export function formatIsoDateDisplay(value: unknown): string {
  const date = parseIsoDateParts(value);
  if (!date) return (value as string) || "";
  if (get(language) === "zh") {
    return `${date.year}/${String(date.month).padStart(2, "0")}/${String(date.day).padStart(2, "0")}`;
  }
  return `${date.day} ${monthShortName(date.month)} ${date.year}`;
}

export function formatDateRangeDisplay(startValue: string, endValue: string): string {
  const start = parseIsoDateParts(startValue);
  const end = parseIsoDateParts(endValue);
  if (!start && !end) return "";
  if (!end) return formatIsoDateDisplay(startValue);
  if (!start) return formatIsoDateDisplay(endValue);
  if (start.year === end.year && start.month === end.month && start.day === end.day) {
    return formatIsoDateDisplay(startValue);
  }
  if (get(language) === "zh") {
    if (start.year === end.year && start.month === end.month) {
      return `${start.year}/${String(start.month).padStart(2, "0")}/${String(start.day).padStart(2, "0")}-${String(end.day).padStart(2, "0")}`;
    }
    if (start.year === end.year) {
      return `${start.year}/${String(start.month).padStart(2, "0")}/${String(start.day).padStart(2, "0")}-${String(end.month).padStart(2, "0")}/${String(end.day).padStart(2, "0")}`;
    }
    return `${formatIsoDateDisplay(startValue)}-${formatIsoDateDisplay(endValue)}`;
  }
  if (start.year === end.year && start.month === end.month) {
    return `${start.day}-${end.day} ${monthShortName(start.month)} ${start.year}`;
  }
  if (start.year === end.year) {
    return `${start.day} ${monthShortName(start.month)} - ${end.day} ${monthShortName(end.month)} ${start.year}`;
  }
  return `${formatIsoDateDisplay(startValue)} - ${formatIsoDateDisplay(endValue)}`;
}

export interface PeriodRange {
  start: string;
  end: string;
}

export function parsePeriodRange(period: string): PeriodRange {
  const match = String(period || "").match(
    /^\s*(\d{4}-\d{2}-\d{2})(?:\s*(?:-|to|至)\s*(\d{4}-\d{2}-\d{2}))?\s*$/i,
  );
  return { start: match?.[1] || "", end: match?.[2] || "" };
}

export function formatPeriodDisplay(period: string): string {
  const range = parsePeriodRange(period);
  if (range.start || range.end) return formatDateRangeDisplay(range.start, range.end);
  return shortPeriod(period);
}

export function shortMonthName(name: string): string {
  if (!name) return "";
  const cleaned = name.replace(/\s+/g, " ").trim();
  return cleaned.length > 14 ? `${cleaned.slice(0, 13)}…` : cleaned;
}

// === strings ===
export function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "month"}-${Date.now().toString(36)}`;
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function normalizeMerchant(value: unknown): string {
  return String(value || "")
    .toUpperCase()
    .replace(/^PAYPAL \*+/, "")
    .replace(/##.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// === build meta ===
export function formatBuildTime(value: unknown): string {
  if (!value) return "-";
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return value as string;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function formatBuildVersion(value: unknown): string {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  const digestSource = trimmed.includes("@sha256:")
    ? trimmed.slice(trimmed.indexOf("@sha256:") + 1)
    : trimmed;
  if (!digestSource.startsWith("sha256:")) return trimmed;
  const digest = digestSource.slice("sha256:".length);
  return `sha256:${digest.slice(0, 12)}`;
}

export function createId(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
