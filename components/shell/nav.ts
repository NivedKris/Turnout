export const NAV = [
  { href: "/", label: "Overview", code: "OVR", key: "F1" },
  { href: "/funnel", label: "Funnel", code: "FUNL", key: "F2" },
  { href: "/campaigns", label: "Campaigns", code: "CMP", key: "F3" },
  { href: "/tasks", label: "Tasks", code: "TASK", key: "F4" },
  { href: "/planner", label: "Planner", code: "RALC", key: "F5" },
  { href: "/activity", label: "Activity", code: "ACT", key: "F6" },
  { href: "/settings", label: "Constraints", code: "CFG", key: "F7" },
] as const;

/** Keep the as-of date when navigating. */
export function withAsOf(href: string, asOf?: string | null): string {
  if (!asOf) return href;
  const [path, q = ""] = href.split("?");
  const p = new URLSearchParams(q);
  p.set("asOf", asOf);
  return `${path}?${p.toString()}`;
}

/** As-of presets that matter for this campaign (dataset-driven labels). */
export function asOfPresets(m: { historyStart: string; historyEnd: string; eventStartDay: string; regCloseDay: string; targetRevisions: string[] }) {
  return [
    { day: m.historyStart, label: "Launch" },
    ...m.targetRevisions.map((d) => ({ day: d, label: "Target revised" })),
    { day: "2025-03-31", label: "Decision point" },
    { day: m.regCloseDay, label: "Reg close" },
    { day: m.eventStartDay, label: "Event day 1" },
    { day: m.historyEnd, label: "Final" },
  ].filter((p, i, a) => p.day >= m.historyStart && p.day <= m.historyEnd && a.findIndex((q) => q.day === p.day) === i);
}
