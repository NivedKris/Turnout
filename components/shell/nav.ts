export const NAV = [
  { href: "/", label: "Overview", code: "OVR", group: "Measure" },
  { href: "/funnel", label: "Funnel", code: "FUNL", group: "Measure" },
  { href: "/campaigns", label: "Campaigns", code: "CMP", group: "Measure" },
  { href: "/plan", label: "Goal plan", code: "PLAN", group: "Strategy" },
  { href: "/bets", label: "Bets", code: "BETS", group: "Strategy" },
  { href: "/planner", label: "What-if planner", code: "RALC", group: "Strategy" },
  { href: "/decisions", label: "Decisions", code: "DEC", group: "Execute" },
  { href: "/tasks", label: "Tasks", code: "TASK", group: "Execute" },
  { href: "/team", label: "Team", code: "TEAM", group: "Execute" },
  { href: "/terminal", label: "Copilot terminal", code: "TERM", group: "System" },
  { href: "/activity", label: "Activity log", code: "ACT", group: "System" },
  { href: "/settings", label: "Targets & constraints", code: "CFG", group: "System" },
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
