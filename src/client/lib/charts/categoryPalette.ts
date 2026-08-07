// Per-category colors for the History monthly category stack chart. This palette is
// intentionally separate from CATEGORY_CHART_COLORS (weekly chart, asserted by e2e)
// so adding detailed category colors cannot disturb the existing palette contract.
// System categories get fixed colors; custom categories are hashed into a fallback
// cycle so colors stay stable across renders and users.

export const CATEGORY_OTHERS_COLOR = "rgba(148, 163, 184, 0.78)"; // slate - merged "others" segment

export const SYSTEM_CATEGORY_STACK_COLORS: Readonly<Record<string, string>> = Object.freeze({
  grocery: "rgba(22, 163, 148, 0.78)", // teal, matches the weekly chart
  incidentals: "rgba(224, 103, 156, 0.78)", // pink, matches the weekly chart
  medical: "rgba(239, 68, 68, 0.78)",
  privateInsurance: "rgba(59, 130, 246, 0.78)",
  electricity: "rgba(250, 204, 21, 0.78)",
  gas: "rgba(249, 115, 22, 0.78)",
  internetMobile: "rgba(6, 182, 212, 0.78)",
  water: "rgba(14, 165, 233, 0.78)",
  school: "rgba(99, 102, 241, 0.78)",
  homeInsurance: "rgba(34, 197, 94, 0.78)",
  carInsurance: "rgba(139, 92, 246, 0.78)",
  transport: "rgba(217, 70, 239, 0.78)",
  government: "rgba(236, 72, 153, 0.78)",
  shoppingDining: "rgba(168, 85, 247, 0.78)",
});

const CUSTOM_CATEGORY_STACK_COLORS = [
  "rgba(20, 184, 166, 0.78)",
  "rgba(251, 146, 60, 0.78)",
  "rgba(96, 165, 250, 0.78)",
  "rgba(232, 121, 249, 0.78)",
  "rgba(52, 211, 153, 0.78)",
  "rgba(248, 113, 113, 0.78)",
  "rgba(129, 140, 248, 0.78)",
  "rgba(251, 191, 36, 0.78)",
];

export function categoryStackColor(key: string): string {
  const known = SYSTEM_CATEGORY_STACK_COLORS[key];
  if (known) return known;
  let hash = 0;
  for (const ch of String(key || "")) hash = (hash + ch.charCodeAt(0)) % 100000;
  return CUSTOM_CATEGORY_STACK_COLORS[hash % CUSTOM_CATEGORY_STACK_COLORS.length];
}
