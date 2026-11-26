/**
 * The app map the assistant navigates by. Shared by server and browser (no server
 * imports). The model never invents URLs: it names a screen (+ ids) and pathFor()
 * returns a validated path or a readable error.
 */
export type ScreenKey =
  | "overview"
  | "funnel"
  | "campaigns"
  | "campaign"
  | "metric"
  | "plan"
  | "bets"
  | "bet"
  | "planner"
  | "decisions"
  | "tasks"
  | "team"
  | "terminal"
  | "activity"
  | "settings";

export const SCREENS: Record<ScreenKey, { path: string; title: string; shows: string; words: string[] }> = {
  overview: { path: "/", title: "Overview", shows: "headline, visitors/registrations/spend vs goal, what to do next, this week's drivers, funnel, campaigns", words: ["home", "dashboard", "summary", "how are we doing"] },
  funnel: { path: "/funnel", title: "Funnel", shows: "people funnel, ad funnel, biggest leak, conversion by campaign (optionally one campaign)", words: ["conversion", "drop-off", "leak", "bottleneck"] },
  campaigns: { path: "/campaigns", title: "Campaigns", shows: "all campaigns with decision (scale/stop), spend, registrations, cost per registration", words: ["channels", "campaign list"] },
  campaign: { path: "/campaigns/{campaign}", title: "Campaign", shows: "one campaign: decision and gauge, health checks, KPIs, charts, daily data", words: ["campaign page", "campaign details"] },
  metric: { path: "/kpi/{metric}", title: "Metric", shows: "one KPI over time, key numbers, by campaign", words: ["chart", "trend", "kpi"] },
  plan: { path: "/plan", title: "Goal plan", shows: "how high we can aim: audiences, base/stretch, plan vs data", words: ["goal model", "target model", "audiences", "segments", "ambition"] },
  bets: { path: "/bets", title: "Bets", shows: "five ranked strategies with early signals", words: ["strategies", "initiatives", "experiments", "ideas"] },
  bet: { path: "/bets/{bet}", title: "Bet", shows: "one bet: signals, contribution, decisions", words: ["strategy details"] },
  planner: { path: "/planner", title: "What-if planner", shows: "suggested budget moves and scenario builder", words: ["reallocation", "what if", "scenario", "budget moves"] },
  decisions: { path: "/decisions", title: "Decisions", shows: "decision log with outcomes", words: ["decision log", "what we decided"] },
  tasks: { path: "/tasks", title: "Tasks", shows: "task board (to do, doing, blocked, done)", words: ["to-dos", "action items", "kanban"] },
  team: { path: "/team", title: "Team", shows: "owners with their campaigns, bets and overdue tasks", words: ["owners", "people", "workload"] },
  terminal: { path: "/terminal", title: "Copilot terminal", shows: "chat with the execution trace", words: ["trace", "terminal"] },
  activity: { path: "/activity", title: "Activity log", shows: "every change, newest first", words: ["history", "audit log", "changes"] },
  settings: { path: "/settings", title: "Targets & constraints", shows: "target versions, venue capacity, reset", words: ["targets", "constraints", "capacity", "budget limit", "config"] },
};

export const METRICS: Record<string, string[]> = {
  reg: ["registrations", "sign-ups", "signups"],
  vis: ["visitors", "attendance", "footfall", "attendees", "turnout"],
  idn: ["identified people", "leads", "identified"],
  spd: ["spend", "marketing spend", "money spent"],
  cpr: ["cost per registration", "cpr", "cost per signup"],
  shw: ["show-up", "show up rate", "no-show"],
  ctr: ["click-through", "ctr", "clicks rate"],
  cnf: ["confirm rate", "confirmation rate", "confirmed"],
};

export type Entities = { campaigns: { id: string; name: string; channel: string }[]; bets: { id: string; title: string }[] };

export type Destination = { screen: string; campaign?: string; bet?: string; metric?: string; as_of?: string; filter_campaign?: string };

/** Returns a validated path for a destination, or an error the model can read. */
export function pathFor(d: Destination, ents: Entities, currentAsOf?: string | null): { path: string; label: string } | { error: string } {
  const key = d.screen as ScreenKey;
  const sc = SCREENS[key];
  if (!sc) return { error: `Unknown screen "${d.screen}". Valid screens: ${Object.keys(SCREENS).join(", ")}.` };
  let path = sc.path;
  let label = sc.title;
  if (key === "campaign") {
    const c = ents.campaigns.find((x) => x.id.toLowerCase() === (d.campaign ?? "").toLowerCase());
    if (!c) return { error: `Unknown campaign id "${d.campaign}". Valid: ${ents.campaigns.map((x) => `${x.id} ${x.name}`).join("; ")}.` };
    path = `/campaigns/${c.id}`;
    label = c.name;
  }
  if (key === "bet") {
    const b = ents.bets.find((x) => x.id.toLowerCase() === (d.bet ?? "").toLowerCase());
    if (!b) return { error: `Unknown bet id "${d.bet}". Valid: ${ents.bets.map((x) => `${x.id} ${x.title}`).join("; ")}.` };
    path = `/bets/${b.id}`;
    label = b.title;
  }
  if (key === "metric") {
    if (!d.metric || !(d.metric in METRICS)) return { error: `Unknown metric "${d.metric}". Valid: ${Object.entries(METRICS).map(([k, v]) => `${k} (${v[0]})`).join(", ")}.` };
    path = `/kpi/${d.metric}`;
    label = METRICS[d.metric]![0]!.replace(/^./, (c) => c.toUpperCase());
  }
  const q = new URLSearchParams();
  const asOf = d.as_of && /^\d{4}-\d{2}-\d{2}$/.test(d.as_of) ? d.as_of : currentAsOf;
  if (asOf) q.set("asOf", asOf);
  if (key === "funnel" && d.filter_campaign) {
    const c = ents.campaigns.find((x) => x.id.toLowerCase() === d.filter_campaign!.toLowerCase());
    if (c) {
      q.set("campaign", c.id);
      label = `Funnel · ${c.name}`;
    }
  }
  const qs = q.toString();
  return { path: qs ? `${path}?${qs}` : path, label };
}

/** Plain-text sitemap for the system instruction. */
export function describeSitemap(ents: Entities): string {
  const lines = Object.entries(SCREENS).map(([k, s]) => `- ${k}: ${s.shows}. People say: ${s.words.join(", ")}.`);
  return [
    "SCREENS (use these keys with navigate / offer_navigation):",
    ...lines,
    `METRIC keys for screen "metric": ${Object.entries(METRICS).map(([k, v]) => `${k} = ${v.join(" / ")}`).join("; ")}.`,
    `CAMPAIGNS: ${ents.campaigns.map((c) => `${c.id} ${c.name} (${c.channel})`).join("; ")}.`,
    `BETS: ${ents.bets.map((b) => `${b.id} ${b.title}`).join("; ")}.`,
    "Every screen accepts as_of (YYYY-MM-DD) to view the data on a past date. funnel accepts filter_campaign (campaign id).",
  ].join("\n");
}
