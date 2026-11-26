import { addDays, daysBetween, toDayKey } from "../time";
import { BENCHMARKS, RULES, asAssumption } from "./benchmarks";
import { flows, ratio, registeredVisitors, statusCounts, type Flows } from "./metrics";
import type { DayRange, Snapshot } from "./snapshot";
import type { Assumption, Result } from "./types";

/* ─────────────────────────────── Bottleneck ─────────────────────────────── */

export type StageCheck = {
  key: string;
  label: string;
  actual: number | null;
  benchmark: number;
  benchmark_source: Assumption;
  /** actual / benchmark; < 1 means underperforming. */
  index: number | null;
  numerator: number;
  denominator: number;
  sufficient_sample: boolean;
  worst_campaigns: { campaign_id: string; campaign_name: string; rate: number | null; denominator: number }[];
};

const MIN_SAMPLE = 50;

type StageDef = {
  key: string;
  label: string;
  num: (f: Flows, s: Snapshot, c?: string) => number;
  den: (f: Flows, s: Snapshot, c?: string) => number;
  bench: (s: Snapshot) => { value: number; source: Assumption } | null;
  available: (s: Snapshot) => boolean;
};

const campaignIdentified = (s: Snapshot, c?: string) =>
  s.people.filter((p) => p.first_touch_source === "campaign" && (!c || p.first_campaign_id === c)).length;

const STAGES: StageDef[] = [
  {
    key: "ctr",
    label: "Impression → click (CTR)",
    num: (f) => f.clicks,
    den: (f) => f.impressions,
    bench: () => ({ value: BENCHMARKS.ctr.value, source: asAssumption(BENCHMARKS.ctr) }),
    available: () => true,
  },
  {
    key: "click_to_session",
    label: "Click → landing session",
    num: (f) => f.sessions,
    den: (f) => f.clicks,
    bench: () => ({ value: BENCHMARKS.click_to_session.value, source: asAssumption(BENCHMARKS.click_to_session) }),
    available: () => true,
  },
  {
    key: "session_to_start",
    label: "Session → form start",
    num: (f) => f.registration_starts,
    den: (f) => f.sessions,
    bench: () => ({ value: BENCHMARKS.session_to_start.value, source: asAssumption(BENCHMARKS.session_to_start) }),
    available: () => true,
  },
  {
    key: "identified_to_registered",
    label: "Identified → registered",
    num: (f) => f.registrations,
    den: (_f, s, c) => campaignIdentified(s, c),
    bench: (s) =>
      s.target
        ? {
            value: s.target.registration_goal / s.target.identified_external_people_goal,
            source: {
              text: `Plan-implied: registration goal ÷ identified goal (${s.target.target_version})`,
              label: "Derived",
            },
          }
        : null,
    available: () => true,
  },
  {
    key: "registered_to_confirmed",
    label: "Registered → confirmed",
    num: (_f, s, c) => statusCounts(s, c)?.confirmed ?? 0,
    den: (f) => f.registrations,
    bench: () => ({
      value: BENCHMARKS.registered_to_confirmed.value,
      source: asAssumption(BENCHMARKS.registered_to_confirmed),
    }),
    available: () => true,
  },
  {
    key: "show_up",
    label: "Confirmed → attended",
    num: (_f, s, c) => registeredVisitors(s, c),
    den: (_f, s, c) => statusCounts(s, c, true)?.confirmed ?? 0,
    bench: () => ({ value: BENCHMARKS.show_up_free.value, source: asAssumption(BENCHMARKS.show_up_free) }),
    available: (s) => s.statusAtEventStart !== null,
  },
];

export function bottleneck(s: Snapshot, scope: DayRange = {}): Result<{ bottleneck: StageCheck | null; stages: StageCheck[] }> {
  const total = flows(s, scope);
  const stages: StageCheck[] = [];
  for (const d of STAGES) {
    if (!d.available(s)) continue;
    const b = d.bench(s);
    if (!b) continue;
    const num = d.num(total, s);
    const den = d.den(total, s);
    const actual = ratio(num, den);
    const worst = s.campaigns
      .map((c) => {
        const f = flows(s, { ...scope, campaignId: c.campaign_id });
        const dd = d.den(f, s, c.campaign_id);
        return { campaign_id: c.campaign_id, campaign_name: c.campaign_name, rate: ratio(d.num(f, s, c.campaign_id), dd), denominator: dd };
      })
      .filter((w) => w.denominator >= MIN_SAMPLE / 2 && w.rate !== null)
      .sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0))
      .slice(0, 3);
    stages.push({
      key: d.key,
      label: d.label,
      actual,
      benchmark: b.value,
      benchmark_source: b.source,
      index: actual === null ? null : actual / b.value,
      numerator: num,
      denominator: den,
      sufficient_sample: den >= MIN_SAMPLE,
      worst_campaigns: worst,
    });
  }
  const candidates = stages.filter((x) => x.sufficient_sample && x.index !== null && x.index < 1);
  const worst = candidates.sort((a, b) => (a.index ?? 1) - (b.index ?? 1))[0] ?? null;

  return {
    value: { bottleneck: worst, stages },
    formula:
      "For each stage: index = actual conversion ÷ benchmark. The bottleneck is the stage with the lowest index below 1 " +
      `with at least ${MIN_SAMPLE} records in its denominator. Worst campaigns = lowest rate at that stage (≥ ${MIN_SAMPLE / 2} records).`,
    inputs: { as_of: s.asOf, stages_checked: stages.length, min_sample: MIN_SAMPLE },
    assumptions: [RULES.dedup, RULES.external_only, RULES.reach_not_unique, ...stages.map((x) => x.benchmark_source)],
    sources: [
      { collection: "campaign_daily", records: s.daily.length, filter: `≤ ${s.asOf}` },
      { collection: "registrations", records: s.registrations.length, filter: "external" },
      { collection: "registration_history", records: s.statusByReg.size, filter: "latest status" },
      { collection: "checkins", records: s.visitors.size, filter: "verified visitors" },
    ],
  };
}

/* ───────────────────────────────── Trends ───────────────────────────────── */

export const TREND_METRICS = [
  "registrations",
  "identified",
  "spend",
  "clicks",
  "impressions",
  "sessions",
  "registration_starts",
  "visitors",
  "cost_per_registration",
  "ctr",
  "session_to_start",
] as const;
export type TrendMetric = (typeof TREND_METRICS)[number];

const ADDITIVE = new Set<TrendMetric>(["registrations", "identified", "spend", "clicks", "impressions", "sessions", "registration_starts", "visitors"]);

function metricValue(f: Flows, m: TrendMetric): number | null {
  switch (m) {
    case "cost_per_registration":
      return ratio(f.spend, f.registrations);
    case "ctr":
      return ratio(f.clicks, f.impressions);
    case "session_to_start":
      return ratio(f.registration_starts, f.sessions);
    default:
      return f[m];
  }
}

export type TrendValue = {
  metric: TrendMetric;
  window_days: number;
  current: { from: string; to: string; value: number | null };
  previous: { from: string; to: string; value: number | null };
  change: number | null;
  change_pct: number | null;
  by_campaign: {
    campaign_id: string;
    campaign_name: string;
    current: number | null;
    previous: number | null;
    change: number | null;
    /** Share of the total change (additive metrics only). */
    contribution: number | null;
  }[];
};

export function trend(s: Snapshot, metric: TrendMetric, windowDays = 7): Result<TrendValue> {
  const w = Math.max(1, Math.min(42, Math.round(windowDays)));
  const cur = { from: addDays(s.asOf, -(w - 1)), to: s.asOf };
  const prev = { from: addDays(s.asOf, -(2 * w - 1)), to: addDays(s.asOf, -w) };
  const vc = metricValue(flows(s, cur), metric);
  const vp = metricValue(flows(s, prev), metric);
  const change = vc !== null && vp !== null ? vc - vp : null;

  const rows = s.campaigns.map((c) => {
    const a = metricValue(flows(s, { ...cur, campaignId: c.campaign_id }), metric);
    const b = metricValue(flows(s, { ...prev, campaignId: c.campaign_id }), metric);
    const d = a !== null && b !== null ? a - b : null;
    return {
      campaign_id: c.campaign_id,
      campaign_name: c.campaign_name,
      current: a,
      previous: b,
      change: d,
      contribution: ADDITIVE.has(metric) && change && d !== null ? d / change : null,
    };
  });
  rows.sort((x, y) => Math.abs(y.change ?? 0) - Math.abs(x.change ?? 0));

  const notes: Assumption[] = [RULES.dedup, RULES.end_of_day];
  if (prev.from < s.event.history_start) notes.push({ text: "The previous window starts before the data begins", label: "Derived" });
  notes.push({ text: "Changes show association over time, not proof of what caused them", label: "Derived" });

  return {
    value: {
      metric,
      window_days: w,
      current: { ...cur, value: vc },
      previous: { ...prev, value: vp },
      change,
      change_pct: change !== null && vp ? change / vp : null,
      by_campaign: rows,
    },
    formula: `change = ${metric}[${cur.from}…${cur.to}] − ${metric}[${prev.from}…${prev.to}]; contribution_c = change_c ÷ total change`,
    inputs: { as_of: s.asOf, metric, window_days: w },
    assumptions: notes,
    sources: [
      { collection: "campaign_daily", records: s.daily.length, filter: `${prev.from}…${cur.to}` },
      { collection: "registrations", records: s.registrations.length, filter: `${prev.from}…${cur.to}` },
    ],
  };
}

/** Daily values of an additive metric (for charts), optionally cumulative. */
export function series(
  s: Snapshot,
  metric: Extract<TrendMetric, "registrations" | "identified" | "spend" | "clicks" | "impressions" | "sessions" | "registration_starts" | "visitors">,
  opts: { campaignId?: string | null; cumulative?: boolean; from?: string } = {},
): { day: string; value: number }[] {
  const from = opts.from ?? s.event.history_start;
  const n = Math.max(0, daysBetween(from, s.asOf) + 1);
  const out = Array.from({ length: n }, (_, i) => ({ day: addDays(from, i), value: 0 }));
  const idx = (day: string) => daysBetween(from, day);
  const c = opts.campaignId ?? null;
  const bump = (day: string, v: number) => {
    const i = idx(day);
    if (i >= 0 && i < n) out[i]!.value += v;
  };
  if (["spend", "clicks", "impressions", "sessions", "registration_starts"].includes(metric)) {
    const key = { spend: "marketing_spend_inr", clicks: "clicks", impressions: "impressions", sessions: "landing_page_sessions", registration_starts: "registration_starts" }[
      metric as "spend"
    ] as "marketing_spend_inr";
    for (const d of s.daily) if (!c || d.campaign_id === c) bump(d.activity_date, d[key]);
  } else if (metric === "registrations") {
    for (const r of s.registrations) if (!c || r.campaign_id === c) bump(toDayKey(r.registered_at), 1);
  } else if (metric === "identified") {
    for (const p of s.people) if (!c || p.first_campaign_id === c) bump(toDayKey(p.first_seen_at), 1);
  } else if (metric === "visitors") {
    for (const v of s.visitors.values()) if (!c || v.campaign_id === c) bump(toDayKey(v.first_admitted_at), 1);
  }
  if (opts.cumulative) {
    let acc = 0;
    for (const p of out) p.value = acc += p.value;
  }
  return out;
}
