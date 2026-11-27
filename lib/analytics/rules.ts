import { addDays } from "../time";
import { BENCHMARKS, RULES, asAssumption } from "./benchmarks";
import { flows, ratio, registeredVisitors, statusCounts } from "./metrics";
import { STOP_RULE, STOP_RULE_TEXT, stopStatus, type StopCheck } from "./confirm";
import { campaignRates, scenario, type ScenarioChange } from "./projection";
import type { Snapshot } from "./snapshot";
import type { Assumption, Result } from "./types";

export type Verdict = "scale" | "keep" | "change" | "stop" | "insufficient_data";

export type RuleMetric = "cost_per_registration" | "ctr" | "session_to_start" | "confirm_rate";

export type Thresholds = {
  metric: RuleMetric;
  direction: "lower_is_better" | "higher_is_better";
  scale_if: number;
  stop_if: number;
  /** Minimum registrations in the window before judging. */
  min_sample: number;
  window_days: number;
  /** "relative" = derived from the portfolio average; "custom" = set on the campaign. */
  basis: "relative" | "custom";
};

export type RuleEvaluation = {
  campaign_id: string;
  campaign_name: string;
  owner_name: string;
  status: string;
  verdict: Verdict;
  reason: string;
  metric: RuleMetric;
  value: number | null;
  thresholds: Thresholds;
  sample: number;
  window: { from: string; to: string };
  signals: { key: string; value: number | null; benchmark: number; weak: boolean }[];
  /** Present when the window is past the stop line: whether the stop is confirmed by consecutive readings. */
  stop_check?: StopCheck;
  /** Day the stop rule first confirmed a stop (sticky), if it has. */
  stopped_on?: string | null;
};

const DEFAULTS = { window_days: 14, min_sample: 15, scale_ratio: 0.8, stop_ratio: 1.5 };

function metricOf(m: RuleMetric, f: ReturnType<typeof flows>, confirmed: number): number | null {
  switch (m) {
    case "cost_per_registration":
      return ratio(f.spend, f.registrations);
    case "ctr":
      return ratio(f.clicks, f.impressions);
    case "session_to_start":
      return ratio(f.registration_starts, f.sessions);
    case "confirm_rate":
      return ratio(confirmed, f.registrations);
  }
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Single-window verdicts for earlier snapshots (no confirmation), memoised per snapshot. */
const rawCache = new WeakMap<Snapshot, Map<string, RuleEvaluation>>();
function rawEvaluations(s: Snapshot, overrides: Record<string, Partial<Thresholds>>): Map<string, RuleEvaluation> {
  const keyed = Object.keys(overrides).length === 0;
  const hit = keyed ? rawCache.get(s) : undefined;
  if (hit) return hit;
  const m = new Map(evaluateRules(s, overrides, { confirm: false }).value.evaluations.map((e) => [e.campaign_id, e]));
  if (keyed) rawCache.set(s, m);
  return m;
}

type RulesResult = Result<{ evaluations: RuleEvaluation[]; portfolio_cpr: number | null }>;
const fullCache = new WeakMap<Snapshot, RulesResult>();

export function evaluateRules(s: Snapshot, overrides: Record<string, Partial<Thresholds>> = {}, opts: { confirm?: boolean } = {}): RulesResult {
  const confirm = opts.confirm ?? true;
  const plain = confirm && Object.keys(overrides).length === 0;
  if (plain) {
    const hit = fullCache.get(s);
    if (hit) return hit;
  }
  const out = evaluateRulesUncached(s, overrides, confirm);
  if (plain) fullCache.set(s, out);
  return out;
}

function evaluateRulesUncached(s: Snapshot, overrides: Record<string, Partial<Thresholds>>, confirm: boolean): RulesResult {
  const end = s.asOf < s.regCloseDay ? s.asOf : s.regCloseDay;
  const window = { from: addDays(end, -(DEFAULTS.window_days - 1)), to: end };
  const portfolio = flows(s, window);
  const portfolioCpr = ratio(portfolio.spend, portfolio.registrations);

  const evaluations: RuleEvaluation[] = s.campaigns.map((c) => {
    // Explicit overrides (e.g. scenario) win over thresholds stored on the campaign.
    const stored = (c.thresholds ?? {}) as Partial<Thresholds>;
    const o: Partial<Thresholds> = { ...stored, ...(overrides[c.campaign_id] ?? {}) };
    const windowDays = o.window_days ?? DEFAULTS.window_days;
    const w = windowDays === DEFAULTS.window_days ? window : { from: addDays(end, -(windowDays - 1)), to: end };
    const f = flows(s, { ...w, campaignId: c.campaign_id });
    const st = statusCounts(s, c.campaign_id);
    const metric = o.metric ?? "cost_per_registration";
    const direction = o.direction ?? (metric === "cost_per_registration" ? "lower_is_better" : "higher_is_better");
    const custom = o.scale_if !== undefined && o.stop_if !== undefined;
    const t: Thresholds = {
      metric,
      direction,
      scale_if: o.scale_if ?? (portfolioCpr ?? 0) * DEFAULTS.scale_ratio,
      stop_if: o.stop_if ?? (portfolioCpr ?? 0) * DEFAULTS.stop_ratio,
      min_sample: o.min_sample ?? DEFAULTS.min_sample,
      window_days: windowDays,
      basis: custom ? "custom" : "relative",
    };
    const value = metricOf(metric, f, st?.confirmed ?? 0);

    const signals: RuleEvaluation["signals"] = [
      { key: "ctr", value: ratio(f.clicks, f.impressions), benchmark: BENCHMARKS.ctr.value },
      { key: "session_to_start", value: ratio(f.registration_starts, f.sessions), benchmark: BENCHMARKS.session_to_start.value },
      { key: "click_to_session", value: ratio(f.sessions, f.clicks), benchmark: BENCHMARKS.click_to_session.value },
    ].map((x) => ({ ...x, benchmark: x.benchmark as number, weak: x.value !== null && x.value < x.benchmark * 0.8 }));
    const cancelRate = ratio(st?.cancelled ?? 0, flows(s, { campaignId: c.campaign_id }).registrations);
    signals.push({ key: "cancel_rate", value: cancelRate, benchmark: 0.15, weak: cancelRate !== null && cancelRate > 0.15 });
    const atStart = statusCounts(s, c.campaign_id, true);
    if (atStart) {
      const showUp = ratio(registeredVisitors(s, c.campaign_id), atStart.confirmed);
      signals.push({ key: "show_up", value: showUp, benchmark: BENCHMARKS.show_up_free.value, weak: showUp !== null && showUp < BENCHMARKS.show_up_free.value * 0.8 });
    }

    const base = {
      campaign_id: c.campaign_id,
      campaign_name: c.campaign_name,
      owner_name: c.owner_name,
      status: c.status,
      metric,
      value,
      thresholds: t,
      sample: f.registrations,
      window: w,
      signals,
    };
    const fmt = metric === "cost_per_registration" ? inr : pct;

    if (c.status === "stopped" || c.status === "completed") {
      return { ...base, verdict: "stop" as const, reason: `Campaign is already ${c.status}.` };
    }
    if (f.registrations < t.min_sample || value === null || (metric === "cost_per_registration" && portfolioCpr === null && !custom)) {
      return {
        ...base,
        verdict: "insufficient_data" as const,
        reason: `Only ${f.registrations} registrations in ${w.from}…${w.to}; at least ${t.min_sample} are needed to judge.`,
      };
    }
    const better = (a: number, b: number) => (direction === "lower_is_better" ? a <= b : a >= b);
    const worse = (a: number, b: number) => (direction === "lower_is_better" ? a >= b : a <= b);
    const weak = signals.filter((x) => x.weak);

    if (better(value, t.scale_if)) {
      return {
        ...base,
        verdict: "scale" as const,
        reason: `${metric.replaceAll("_", " ")} ${fmt(value)} beats the scale threshold ${fmt(t.scale_if)} on ${f.registrations} registrations.`,
      };
    }
    const isStop = worse(value, t.stop_if);
    const past = `${metric.replaceAll("_", " ")} ${fmt(value)} is past the stop threshold ${fmt(t.stop_if)} on ${f.registrations} registrations`;
    if (!confirm) {
      if (isStop) return { ...base, verdict: "stop" as const, reason: `${past}.` };
    } else {
      const st = stopStatus(
        s,
        `campaign:${c.campaign_id}:${JSON.stringify(o)}`,
        (x) => {
          if (x === s) return { stop: isStop, cost: value, sample: f.registrations };
          const e = rawEvaluations(x, overrides).get(c.campaign_id);
          return { stop: e?.verdict === "stop", cost: e?.value ?? null, sample: e?.sample ?? 0 };
        },
        s.event.history_start,
      );
      if (st.confirmed_on) {
        const when = st.confirmed_on === s.asOf ? "now" : `on ${st.confirmed_on}`;
        return { ...base, verdict: "stop" as const, stop_check: st.current, stopped_on: st.confirmed_on, reason: `Stop confirmed ${when}: the ${STOP_RULE.readings}rd stop reading in a row at the Monday reviews. Latest: ${metric.replaceAll("_", " ")} ${fmt(value)} on ${f.registrations} registrations (stop line ${fmt(t.stop_if)}).` };
      }
      if (isStop) {
        return {
          ...base,
          verdict: "change" as const,
          stop_check: st.current,
          stopped_on: null,
          reason: `${past}, but that is stop reading ${st.current.count} of ${STOP_RULE.readings} (${STOP_RULE_TEXT}). Hold new spend and fix it; stop only if the next readings confirm.`,
        };
      }
    }
    if (weak.length) {
      return {
        ...base,
        verdict: "change" as const,
        reason:
          `${metric.replaceAll("_", " ")} ${fmt(value)} is within thresholds, but ` +
          weak.map((x) => `${x.key.replaceAll("_", " ")} is ${x.value === null ? "n/a" : pct(x.value)} vs ${pct(x.benchmark)}`).join("; ") +
          ".",
      };
    }
    return {
      ...base,
      verdict: "keep" as const,
      reason: `${metric.replaceAll("_", " ")} ${fmt(value)} is between the scale (${fmt(t.scale_if)}) and stop (${fmt(t.stop_if)}) thresholds.`,
    };
  });

  return {
    value: { evaluations, portfolio_cpr: portfolioCpr },
    formula:
      `Window = last ${DEFAULTS.window_days} days up to min(as-of, registration close). Default metric = cost per registration. ` +
      `Scale if ≤ ${DEFAULTS.scale_ratio}× portfolio CPR; stop if ≥ ${DEFAULTS.stop_ratio}× portfolio CPR, confirmed only when ${STOP_RULE_TEXT} (otherwise change: hold new spend); ` +
      `insufficient data if < ${DEFAULTS.min_sample} registrations; change if within thresholds but a funnel signal is weak ` +
      "(below 80% of benchmark, or cancellations above 15%).",
    inputs: {
      as_of: s.asOf,
      window_from: window.from,
      window_to: window.to,
      portfolio_cpr: portfolioCpr === null ? null : Math.round(portfolioCpr),
    },
    assumptions: [
      RULES.dedup,
      RULES.registration_attribution,
      {
        text: "Default thresholds are relative to the portfolio's own recent CPR, because the source data has no per-campaign cost targets",
        label: "Assumption",
      },
      asAssumption(BENCHMARKS.ctr),
      asAssumption(BENCHMARKS.session_to_start),
      asAssumption(BENCHMARKS.click_to_session),
    ],
    sources: [
      { collection: "campaign_daily", records: s.daily.length, filter: `${window.from}…${window.to}` },
      { collection: "registrations", records: s.registrations.length, filter: `${window.from}…${window.to}` },
    ],
  };
}

/* ────────────────────────────── Reallocation ────────────────────────────── */

export type Move = { from: string | null; from_name: string; to: string; to_name: string; amount: number; rationale: string };

export function reallocation(s: Snapshot, opts: { budgetToMove?: number } = {}) {
  const rules = evaluateRules(s);
  const assumptions: Assumption[] = [
    ...rules.assumptions,
    asAssumption(BENCHMARKS.max_scale_factor),
    { text: "Future spend per campaign = trailing 7-day daily spend × days left", label: "Assumption" },
  ];
  const empty = (reason: string) => ({
    value: { moves: [] as Move[], budget_left: null as number | null, planned_future_spend: 0, headroom: 0, effect: null as ReturnType<typeof scenario>["value"] | null, reason },
    formula: "n/a",
    inputs: { as_of: s.asOf, phase: s.phase },
    assumptions,
    sources: rules.sources,
  });
  if (s.phase !== "pre_event") return empty("The event has started or finished, so there is no future spend to reallocate.");
  if (s.regDaysLeft === 0) return empty("Registrations are closed, so moving budget can't add registrations.");

  const rates = new Map(campaignRates(s).map((r) => [r.campaign_id, r]));
  const verdict = new Map(rules.value.evaluations.map((e) => [e.campaign_id, e]));
  const days = s.regDaysLeft;
  const spendToDate = flows(s).spend;
  const budget = s.target?.marketing_budget_inr ?? null;
  const futureOf = (id: string) => (rates.get(id)?.spend_rate_7d ?? 0) * days;
  const planned = s.campaignIds.reduce((a, id) => a + futureOf(id), 0);
  const budgetLeft = budget === null ? null : budget - spendToDate;
  const headroom = budgetLeft === null ? 0 : Math.max(0, budgetLeft - planned);

  const donors = s.campaignIds
    .map((id) => {
      const v = verdict.get(id)!;
      const share = v.verdict === "stop" ? 1 : v.verdict === "change" ? 0.5 : 0;
      return { id, name: v.campaign_name, amount: futureOf(id) * share, reason: v.reason, verdict: v.verdict };
    })
    .filter((d) => d.amount > 0);

  const recipients = s.campaignIds
    .filter((id) => verdict.get(id)?.verdict === "scale" && (rates.get(id)?.marginal_cpr ?? null) !== null)
    .map((id) => ({
      id,
      name: verdict.get(id)!.campaign_name,
      cpr: rates.get(id)!.marginal_cpr!,
      cap: futureOf(id) * (BENCHMARKS.max_scale_factor.value - 1),
    }))
    .filter((r) => r.cap > 0)
    .sort((a, b) => a.cpr - b.cpr);

  let pool = donors.reduce((a, d) => a + d.amount, 0) + headroom;
  if (opts.budgetToMove !== undefined) pool = Math.min(pool, Math.max(0, opts.budgetToMove));

  const moves: Move[] = [];
  const sources = [...donors.map((d) => ({ ...d })), ...(headroom > 0 ? [{ id: null as string | null, name: "Unallocated budget", amount: headroom, reason: "Approved budget not yet planned", verdict: "keep" as const }] : [])];
  for (const r of recipients) {
    let room = Math.min(r.cap, pool);
    for (const src of sources) {
      if (room <= 0) break;
      if (src.amount <= 0) continue;
      const amt = Math.floor(Math.min(room, src.amount) / 100) * 100;
      if (amt <= 0) continue;
      moves.push({
        from: src.id,
        from_name: src.name,
        to: r.id,
        to_name: r.name,
        amount: amt,
        rationale: `${src.name} (${src.verdict}) → ${r.name} (scale, marginal CPR ${inr(r.cpr)}).`,
      });
      src.amount -= amt;
      room -= amt;
      pool -= amt;
    }
  }

  const changes: ScenarioChange[] = moves.map((m) =>
    m.from ? { kind: "shift_budget", from: m.from, to: m.to, amount: m.amount } : { kind: "add_budget", to: m.to, amount: m.amount },
  );
  const effect = moves.length ? scenario(s, changes).value : null;
  const fromDonors = moves.filter((m) => m.from).reduce((a, m) => a + m.amount, 0);
  const fromHeadroom = moves.filter((m) => !m.from).reduce((a, m) => a + m.amount, 0);
  const reason = moves.length
    ? `Move ${[fromDonors ? `${inr(fromDonors)} from stop/change campaigns` : "", fromHeadroom ? `${inr(fromHeadroom)} of unallocated budget` : ""].filter(Boolean).join(" and ")} to the cheapest scaling campaigns.`
    : recipients.length === 0
      ? "No campaign currently qualifies to scale, so there is nowhere better to move budget."
      : "No stop/change campaigns or unallocated budget to move.";

  return {
    value: { moves, budget_left: budgetLeft, planned_future_spend: planned, headroom, effect, reason },
    formula:
      "Donors give future spend: stop = 100%, change = 50%. Unallocated budget = budget − spend to date − planned future spend. " +
      `Recipients = scale campaigns ranked by marginal CPR, each capped at ${BENCHMARKS.max_scale_factor.value - 1}× its planned future spend. ` +
      `Effect = scenario(moves) − base; added spend converts at ${BENCHMARKS.marginal_cost_multiplier.value}× the recipient's recent CPR.`,
    inputs: {
      as_of: s.asOf,
      days_left: days,
      budget,
      spend_to_date: spendToDate,
      budget_left: budgetLeft,
      planned_future_spend: Math.round(planned),
      headroom: Math.round(headroom),
    },
    assumptions,
    sources: rules.sources,
  };
}
