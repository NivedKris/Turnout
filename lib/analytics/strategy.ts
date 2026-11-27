import { STOP_RULE, STOP_RULE_TEXT, stopStatus, type StopCheck } from "./confirm";
import type { BetDoc, DecisionDoc, GoalModelDoc, Signal, SignalMetric } from "../models/strategy";
import { addDays, daysBetween } from "../time";
import { BENCHMARKS, RULES, asAssumption } from "./benchmarks";
import { evaluateRules } from "./rules";
import { flows, ratio, registeredVisitors, statusCounts, type Flows } from "./metrics";
import { projection } from "./projection";
import { trend, type TrendMetric } from "./diagnose";
import type { DayRange, Snapshot } from "./snapshot";
import type { Assumption, Dataset, Result } from "./types";

/* ─────────────────────────────── Goal model ─────────────────────────────── */

export type GoalCase = { identified: number; registrations: number; confirmed: number; registered_visitors: number; walk_ins: number; visitors_uncapped: number; visitors: number; capped: boolean };

function runCase(m: GoalModelDoc, capacity: number, stretch: boolean): { rows: { key: string; name: string; population: number; reached: number; identified: number; registrations: number }[]; total: GoalCase } {
  const rows = m.segments.map((sg) => {
    const reach = Math.min(1, sg.reach_rate * (stretch ? m.stretch_reach_multiplier : 1));
    const reg = Math.min(1, sg.register_rate * (stretch ? m.stretch_register_multiplier : 1));
    const reached = sg.population * reach;
    const identified = reached * sg.identify_rate;
    return { key: sg.key, name: sg.name, population: sg.population, reached, identified, registrations: identified * reg };
  });
  const identified = rows.reduce((a, r) => a + r.identified, 0);
  const registrations = rows.reduce((a, r) => a + r.registrations, 0);
  const confirmed = registrations * m.confirm_rate;
  const regV = confirmed * (stretch ? m.stretch_show_up_rate : m.show_up_rate);
  const walkIns = m.walk_in_share < 1 ? (regV * m.walk_in_share) / (1 - m.walk_in_share) : 0;
  const unc = regV + walkIns;
  return { rows, total: { identified, registrations, confirmed, registered_visitors: regV, walk_ins: walkIns, visitors_uncapped: unc, visitors: Math.min(capacity, unc), capped: unc > capacity } };
}

export function goalModel(m: GoalModelDoc, s: Snapshot): Result<{
  segments: { key: string; name: string; population: number; reached: number; identified: number; registrations: number; share: number }[];
  base: GoalCase;
  stretch: GoalCase;
  plan_vs_data: { key: string; label: string; plan: number | null; data: number | null; data_label: string; gap: number | null }[];
}> {
  const base = runCase(m, s.capacity, false);
  const stretch = runCase(m, s.capacity, true);
  const f = flows(s);
  const proj = projection(s).value;
  const st = statusCounts(s);
  const atStart = statusCounts(s, null, true);
  const campaignIdentified = s.people.filter((p) => p.first_touch_source === "campaign").length;
  const planIdToReg = ratio(base.total.registrations, base.total.identified);
  const rows = [
    { key: "identified", label: "Identified people", plan: base.total.identified, data: s.people.length, data_label: "actual" },
    { key: "registrations", label: "Registrations", plan: base.total.registrations, data: s.phase === "post_event" ? f.registrations : proj.registrations, data_label: s.phase === "post_event" ? "actual" : "projected" },
    { key: "id_to_reg", label: "Identified → registered", plan: planIdToReg, data: ratio(f.registrations, campaignIdentified), data_label: "actual" },
    { key: "confirm", label: "Confirm rate", plan: m.confirm_rate, data: ratio(st?.confirmed ?? 0, f.registrations), data_label: "actual" },
    { key: "show_up", label: "Show-up rate", plan: m.show_up_rate, data: atStart ? ratio(registeredVisitors(s), atStart.confirmed) : null, data_label: atStart ? "actual" : "not yet measurable" },
    { key: "visitors", label: "Unique visitors", plan: base.total.visitors, data: s.phase === "post_event" ? s.visitors.size : proj.visitors, data_label: s.phase === "post_event" ? "actual" : "projected" },
  ].map((r) => ({ ...r, gap: r.plan !== null && r.data !== null ? r.data - r.plan : null }));

  const assumptions: Assumption[] = [
    ...m.segments.map((sg) => ({ text: `${sg.name}: ${sg.population.toLocaleString("en-IN")} people, ${(sg.reach_rate * 100).toFixed(1)}% reach, ${(sg.identify_rate * 100).toFixed(0)}% identify, ${(sg.register_rate * 100).toFixed(0)}% register`, label: sg.provenance.label === "Sourced" ? ("Sourced" as const) : sg.provenance.label === "Derived" ? ("Derived" as const) : ("Assumption" as const), url: sg.provenance.url })),
    ...Object.entries(m.rates_provenance).map(([k, p]) => ({ text: `${k.replaceAll("_", " ")}: ${p.source ?? ""}`.trim(), label: p.label === "Sourced" ? ("Sourced" as const) : p.label === "Derived" ? ("Derived" as const) : ("Assumption" as const), url: p.url })),
    { text: `Venue capacity ${s.capacity.toLocaleString("en-IN")} caps visitors`, label: "Assumption" },
  ];
  return {
    value: {
      segments: base.rows.map((r) => ({ ...r, share: ratio(r.registrations, base.total.registrations) ?? 0 })),
      base: base.total,
      stretch: stretch.total,
      plan_vs_data: rows,
    },
    formula:
      "Per segment: population × reach × identify × register = registrations. Visitors = registrations × confirm × show-up ÷ (1 − walk-in share), capped at capacity. Stretch multiplies reach and register rates and uses the large-event show-up.",
    inputs: { segments: m.segments.length, confirm_rate: m.confirm_rate, show_up_rate: m.show_up_rate, walk_in_share: m.walk_in_share, capacity: s.capacity, as_of: s.asOf },
    assumptions,
    sources: [
      { collection: "goal_model", records: 1, filter: "plan" },
      { collection: "registrations", records: s.registrations.length, filter: "for plan vs data" },
    ],
  };
}

/* ──────────────────────────── Signals and bets ──────────────────────────── */

export type SignalState = "scale" | "watch" | "stop" | "insufficient" | "not_yet";
export type SignalResult = Signal & { value: number | null; sample: number; state: SignalState; window: DayRange; note: string };

function sumFlows(s: Snapshot, ids: string[], range: DayRange): Flows {
  const parts = ids.map((id) => flows(s, { ...range, campaignId: id }));
  const z: Flows = { impressions: 0, clicks: 0, reported_reach: 0, sessions: 0, registration_starts: 0, spend: 0, identified: 0, registrations: 0, visitors: 0, walk_ins: 0 };
  for (const p of parts) for (const k of Object.keys(z) as (keyof Flows)[]) z[k] += p[k];
  return z;
}

export function signalValue(s: Snapshot, ids: string[], metric: SignalMetric, windowDays: number, endDay?: string): { value: number | null; sample: number; window: DayRange; state?: "not_yet" } {
  const end = endDay ?? (s.asOf < s.regCloseDay ? s.asOf : s.regCloseDay);
  const window = { from: addDays(end, -(windowDays - 1)), to: end };
  const f = sumFlows(s, ids, window);
  switch (metric) {
    case "cost_per_registration":
      return { value: ratio(f.spend, f.registrations), sample: f.registrations, window };
    case "registrations_per_day":
      return { value: f.registrations / windowDays, sample: f.registrations, window };
    case "ctr":
      return { value: ratio(f.clicks, f.impressions), sample: f.clicks, window };
    case "session_to_start":
      return { value: ratio(f.registration_starts, f.sessions), sample: f.sessions, window };
    case "confirm_rate":
    case "cancel_rate": {
      const regs = ids.reduce((a, id) => a + flows(s, { campaignId: id }).registrations, 0);
      const st = ids.map((id) => statusCounts(s, id)!);
      const n = st.reduce((a, x) => a + (metric === "confirm_rate" ? x.confirmed : x.cancelled), 0);
      return { value: ratio(n, regs), sample: regs, window: { from: s.event.history_start, to: s.asOf } };
    }
    case "show_up_rate": {
      if (!s.statusAtEventStart) return { value: null, sample: 0, window: { from: s.eventStartDay, to: s.eventEndDay }, state: "not_yet" };
      const conf = ids.reduce((a, id) => a + (statusCounts(s, id, true)?.confirmed ?? 0), 0);
      const vis = ids.reduce((a, id) => a + registeredVisitors(s, id), 0);
      return { value: ratio(vis, conf), sample: conf, window: { from: s.eventStartDay, to: s.asOf } };
    }
    case "cost_per_visitor": {
      if (!s.statusAtEventStart) return { value: null, sample: 0, window: {}, state: "not_yet" };
      const all = sumFlows(s, ids, {});
      return { value: ratio(all.spend, all.visitors), sample: all.visitors, window: { from: s.event.history_start, to: s.asOf } };
    }
  }
}

export function evaluateSignal(s: Snapshot, ids: string[], sig: Signal): SignalResult {
  const v = signalValue(s, ids, sig.metric, sig.window_days);
  const lower = sig.direction === "lower_is_better";
  let state: SignalState;
  let note: string;
  if (v.state === "not_yet") {
    state = "not_yet";
    note = "Measurable from event day";
  } else if (v.value === null || v.sample < sig.min_sample) {
    state = "insufficient";
    note = `Needs ${sig.min_sample} observations (has ${v.sample})`;
  } else if (lower ? v.value <= sig.scale_if : v.value >= sig.scale_if) {
    state = "scale";
    note = "Beats the scale line";
  } else if (lower ? v.value >= sig.stop_if : v.value <= sig.stop_if) {
    state = "stop";
    note = "Past the stop line";
  } else {
    state = "watch";
    note = "Between the lines";
  }
  return { ...sig, value: v.value, sample: v.sample, state, window: v.window, note };
}

export type BetEvaluation = {
  bet_id: string;
  rank: number;
  title: string;
  status: BetDoc["status"];
  owner_name: string;
  campaign_ids: string[];
  verdict: "scale" | "watch" | "stop" | "insufficient";
  verdict_reason: string;
  rice_score: number;
  signals: SignalResult[];
  budget_inr: number;
  spend_to_date: number;
  budget_used: number | null;
  registrations_to_date: number;
  expected_visitors: number;
  visitors_actual_or_projected: number;
  visitors_basis: "actual" | "projected";
  contribution_vs_plan: number | null;
  campaign_verdicts: { campaign_id: string; verdict: string }[];
  /** Present when a signal is past its stop line: whether consecutive readings confirm the stop. */
  stop_check?: StopCheck;
  /** Day the stop rule first confirmed a stop (sticky), if it has. */
  stopped_on?: string | null;
};

export function evaluateBet(b: BetDoc, s: Snapshot): BetEvaluation {
  const ids = b.campaign_ids.filter((id) => s.campaignIds.includes(id));
  const signals = b.signals.map((sig) => evaluateSignal(s, ids, sig));
  const measurable = signals.filter((x) => x.state === "scale" || x.state === "watch" || x.state === "stop");
  const stops = measurable.filter((x) => x.state === "stop");
  let verdict: BetEvaluation["verdict"];
  let reason: string;
  const stopped = stopStatus(
    s,
    `bet:${b.bet_id}:${JSON.stringify(b.signals)}:${ids.join(",")}`,
    (x) => {
      const sig = x === s ? signals : b.signals.map((g) => evaluateSignal(x, ids, g));
      const cpr = sig.find((g) => g.metric === "cost_per_registration") ?? sig[0];
      return { stop: sig.some((g) => g.state === "stop"), cost: cpr?.value ?? null, sample: cpr?.sample ?? 0 };
    },
    b.start_day > s.event.history_start ? b.start_day : s.event.history_start,
  );
  if (!measurable.length) {
    verdict = "insufficient";
    reason = "No signal has enough data yet.";
  } else if (stopped.confirmed_on) {
    verdict = "stop";
    reason = `Stop confirmed ${stopped.confirmed_on === s.asOf ? "now" : `on ${stopped.confirmed_on}`}: the ${STOP_RULE.readings}rd stop reading in a row at the Monday reviews. Its money moves to the bets that are scaling.`;
  } else if (stops.length) {
    verdict = "watch";
    reason = `${stops.map((x) => x.label).join(", ")} past the stop line, but that is stop reading ${stopped.current.count} of ${STOP_RULE.readings} (${STOP_RULE_TEXT}). Hold: release no more money until it recovers, and stop only if the next readings confirm.`;
  } else if (measurable.every((x) => x.state === "scale")) {
    verdict = "scale";
    reason = "Every measurable signal beats its scale line.";
  } else {
    verdict = "watch";
    reason = `${measurable.filter((x) => x.state === "watch").map((x) => x.label).join(", ")} between the lines.`;
  }
  const since = { from: b.start_day > s.event.history_start ? b.start_day : s.event.history_start };
  const f = sumFlows(s, ids, since);
  let visitors: number;
  let basis: "actual" | "projected";
  if (s.phase === "post_event" || s.phase === "during_event") {
    visitors = ids.reduce((a, id) => a + flows(s, { campaignId: id }).visitors, 0);
    basis = "actual";
  } else {
    const p = projection(s).value;
    const share = ratio(p.registered_visitors, p.registrations) ?? 0;
    visitors = p.by_campaign.filter((c) => ids.includes(c.campaign_id)).reduce((a, c) => a + c.projected_registrations, 0) * share;
    basis = "projected";
  }
  const rules = new Map(evaluateRules(s).value.evaluations.map((e) => [e.campaign_id, e.verdict]));
  return {
    bet_id: b.bet_id,
    rank: b.rank,
    title: b.title,
    status: b.status,
    owner_name: b.owner_name,
    campaign_ids: ids,
    verdict,
    verdict_reason: reason,
    rice_score: (b.rice.reach * b.rice.impact * b.rice.confidence) / b.rice.effort,
    signals,
    budget_inr: b.budget_inr,
    spend_to_date: f.spend,
    budget_used: ratio(f.spend, b.budget_inr),
    registrations_to_date: f.registrations,
    expected_visitors: b.expected_visitors,
    visitors_actual_or_projected: visitors,
    visitors_basis: basis,
    contribution_vs_plan: ratio(visitors, b.expected_visitors),
    campaign_verdicts: ids.map((id) => ({ campaign_id: id, verdict: rules.get(id) ?? "insufficient_data" })),
    stop_check: stops.length || stopped.confirmed_on ? stopped.current : undefined,
    stopped_on: stopped.confirmed_on,
  };
}

export function evaluateBets(bets: BetDoc[], s: Snapshot): Result<BetEvaluation[]> {
  const value = [...bets].sort((a, b) => a.rank - b.rank).map((b) => evaluateBet(b, s));
  return {
    value,
    formula:
      "Each signal: metric over its window (ending at min(as-of, registration close)) on the bet's linked campaigns. Scale if it beats the scale line, stop if past the stop line, watch between, insufficient below the minimum sample. Bet verdict: any stop → stop, but only when " + STOP_RULE_TEXT + " (otherwise watch: release no more money); all measurable scale → scale; else watch. RICE = reach × impact × confidence ÷ effort.",
    inputs: { as_of: s.asOf, bets: bets.length },
    assumptions: [RULES.dedup, RULES.registration_attribution, { text: "Bet thresholds and expected visitors are planning assumptions, editable per bet", label: "Assumption" }, asAssumption(BENCHMARKS.show_up_free)],
    sources: [
      { collection: "bets", records: bets.length, filter: "all" },
      { collection: "campaign_daily", records: s.daily.length, filter: "linked campaigns, signal windows" },
    ],
  };
}

/* ─────────────────────────────── Decisions ─────────────────────────────── */

export type DecisionOutcome = {
  decision_id: string;
  metric: SignalMetric;
  before: number | null;
  after: number | null;
  change: number | null;
  change_pct: number | null;
  improved: boolean | null;
  status: "measured" | "partial" | "pending" | "future";
  note: string;
};

const LOWER_BETTER = new Set<SignalMetric>(["cost_per_registration", "cancel_rate", "cost_per_visitor"]);

/**
 * Compares the 14 days before the decision with up to 14 days after it (as far as the
 * selected date and registration close allow). 14 days smooths ledgers that post spend weekly.
 */
const OUTCOME_DAYS = 14;
export function decisionOutcome(d: DecisionDoc, s: Snapshot, ds: Dataset & { bets?: BetDoc[] }): DecisionOutcome {
  const ids = d.campaign_id ? [d.campaign_id] : (ds.bets?.find((b) => b.bet_id === d.bet_id)?.campaign_ids ?? []);
  const metric: SignalMetric = ["cost_per_registration", "registrations_per_day", "ctr", "session_to_start"].includes(d.outcome_metric) ? d.outcome_metric : "registrations_per_day";
  if (s.asOf < d.as_of) return { decision_id: d.decision_id, metric, before: null, after: null, change: null, change_pct: null, improved: null, status: "future", note: "Taken after the selected date" };
  const beforeV = signalValue(s, ids, metric, OUTCOME_DAYS, d.as_of);
  const before = metric === "cost_per_registration" && beforeV.value === 0 ? null : beforeV.value;
  const daysAfter = Math.min(OUTCOME_DAYS, daysBetween(d.as_of, s.asOf < s.regCloseDay ? s.asOf : s.regCloseDay));
  if (daysAfter <= 0) return { decision_id: d.decision_id, metric, before, after: null, change: null, change_pct: null, improved: null, status: "pending", note: "Outcome measurable from the next day" };
  const afterV = signalValue(s, ids, metric, daysAfter, addDays(d.as_of, daysAfter)).value;
  const after = metric === "cost_per_registration" && afterV === 0 ? null : afterV;
  const change = before !== null && after !== null ? after - before : null;
  const improved = change === null ? null : LOWER_BETTER.has(metric) ? change < 0 : change > 0;
  return {
    decision_id: d.decision_id,
    metric,
    before,
    after,
    change,
    change_pct: change !== null && before ? change / before : null,
    improved,
    status: daysAfter < OUTCOME_DAYS ? "partial" : "measured",
    note: `${daysAfter < OUTCOME_DAYS ? `${daysAfter} of ${OUTCOME_DAYS}` : OUTCOME_DAYS} days after vs ${OUTCOME_DAYS} days before${before === null || after === null ? "; a window with no posted spend can't give a cost" : ""}. Association, not proof of cause.`,
  };
}

/* ───────────────────────────── Weekly drivers ───────────────────────────── */

export type Driver = { metric: TrendMetric; label: string; current: number | null; previous: number | null; change: number | null; change_pct: number | null; up: { name: string; change: number }[]; down: { name: string; change: number }[]; sentence: string };

export function weeklyDrivers(s: Snapshot): Driver[] {
  const fmt = (m: TrendMetric, v: number) => (m === "spend" || m === "cost_per_registration" ? `₹${Math.round(Math.abs(v)).toLocaleString("en-IN")}` : Math.round(Math.abs(v)).toLocaleString("en-IN"));
  const defs: { metric: TrendMetric; label: string }[] = [
    { metric: "registrations", label: "Registrations" },
    { metric: "identified", label: "New identified people" },
    { metric: "spend", label: "Spend" },
    { metric: "cost_per_registration", label: "Cost per registration" },
  ];
  return defs.map(({ metric, label }) => {
    const t = trend(s, metric, 7).value;
    const rows = t.by_campaign.filter((c) => c.change !== null && Math.abs(c.change) > 0.0001);
    const up = rows.filter((c) => c.change! > 0).sort((a, b) => b.change! - a.change!).slice(0, 2).map((c) => ({ name: c.campaign_name, change: c.change! }));
    const down = rows.filter((c) => c.change! < 0).sort((a, b) => a.change! - b.change!).slice(0, 2).map((c) => ({ name: c.campaign_name, change: c.change! }));
    let sentence: string;
    if (t.change === null) sentence = `${label}: not enough data for a week-on-week comparison.`;
    else if (Math.abs(t.change) < 0.0001) sentence = `${label} flat week on week.`;
    else {
      const dir = t.change > 0 ? "up" : "down";
      const pctTxt = t.change_pct !== null ? ` (${t.change_pct > 0 ? "+" : ""}${(t.change_pct * 100).toFixed(1)}%)` : "";
      const drivers = metric === "cost_per_registration" ? "" : [up.length ? `led by ${up.map((u) => `${u.name} +${fmt(metric, u.change)}`).join(", ")}` : "", down.length ? `offset by ${down.map((u) => `${u.name} −${fmt(metric, u.change)}`).join(", ")}` : ""].filter(Boolean).join("; ");
      sentence = `${label} ${dir} ${fmt(metric, t.change)}${pctTxt}${drivers ? `, ${drivers}` : ""}.`;
    }
    return { metric, label, current: t.current.value, previous: t.previous.value, change: t.change, change_pct: t.change_pct, up, down, sentence };
  });
}

/* ───────────────────────────── Owner workload ───────────────────────────── */

export type OwnerLoad = {
  owner_name: string;
  campaigns: { campaign_id: string; campaign_name: string; verdict: string; registrations: number; spend: number }[];
  bets: { bet_id: string; title: string; status: string }[];
  tasks_open: number;
  tasks_overdue: number;
  tasks_done: number;
  next_due: { task_id: string; title: string; due_date: string } | null;
};

export function ownerWorkload(ds: Dataset & { bets?: BetDoc[] }, s: Snapshot): OwnerLoad[] {
  const verdicts = new Map(evaluateRules(s).value.evaluations.map((e) => [e.campaign_id, e.verdict]));
  const owners = new Set<string>([...s.campaigns.map((c) => c.owner_name), ...(ds.tasks ?? []).map((t) => t.owner_name), ...(ds.bets ?? []).map((b) => b.owner_name)]);
  return [...owners].sort().map((o) => {
    const tasks = (ds.tasks ?? []).filter((t) => t.owner_name === o);
    const open = tasks.filter((t) => t.status !== "done");
    const next = [...open].sort((a, b) => (a.due_date < b.due_date ? -1 : 1))[0];
    return {
      owner_name: o,
      campaigns: s.campaigns
        .filter((c) => c.owner_name === o)
        .map((c) => {
          const f = flows(s, { campaignId: c.campaign_id });
          return { campaign_id: c.campaign_id, campaign_name: c.campaign_name, verdict: verdicts.get(c.campaign_id) ?? "insufficient_data", registrations: f.registrations, spend: f.spend };
        }),
      bets: (ds.bets ?? []).filter((b) => b.owner_name === o).map((b) => ({ bet_id: b.bet_id, title: b.title, status: b.status })),
      tasks_open: open.length,
      tasks_overdue: open.filter((t) => t.due_date < s.asOf).length,
      tasks_done: tasks.length - open.length,
      next_due: next ? { task_id: next.task_id, title: next.title, due_date: next.due_date } : null,
    };
  });
}
