import { addDays, daysBetween, toDayKey } from "../time";
import { BENCHMARKS, RULES, asAssumption } from "./benchmarks";
import { flows, ratio, registeredVisitors, statusCounts } from "./metrics";
import type { Snapshot } from "./snapshot";
import type { Assumption, Result } from "./types";

/* ─────────────────────── Per-campaign forward model ─────────────────────── */

export type CampaignRate = {
  campaign_id: string;
  campaign_name: string;
  registrations: number;
  /** Registrations/day over the trailing 7 days. */
  reg_rate_7d: number;
  /** Best 7-day registrations/day seen up to as-of. */
  best_reg_rate_7d: number;
  /** Net spend/day over the trailing 7 days. */
  spend_rate_7d: number;
  /** Trailing 14-day spend / registrations, used as the marginal cost estimate. */
  marginal_cpr: number | null;
};

const TRAIL = 7;

export function campaignRates(s: Snapshot): CampaignRate[] {
  const end = s.asOf < s.regCloseDay ? s.asOf : s.regCloseDay;
  const last7 = { from: addDays(end, -(TRAIL - 1)), to: end };
  const last14 = { from: addDays(end, -13), to: end };

  // Daily registration series per campaign, for the best 7-day window.
  const start = s.event.history_start;
  const nDays = Math.max(0, daysBetween(start, end) + 1);
  const series = new Map<string, number[]>(s.campaignIds.map((id) => [id, new Array<number>(nDays).fill(0)]));
  for (const r of s.registrations) {
    const i = daysBetween(start, toDayKey(r.registered_at));
    const arr = series.get(r.campaign_id);
    if (arr && i >= 0 && i < nDays) arr[i]! += 1;
  }

  return s.campaigns.map((c) => {
    const f7 = flows(s, { ...last7, campaignId: c.campaign_id });
    const f14 = flows(s, { ...last14, campaignId: c.campaign_id });
    const arr = series.get(c.campaign_id) ?? [];
    let best = 0;
    let win = 0;
    for (let i = 0; i < arr.length; i++) {
      win += arr[i]!;
      if (i >= TRAIL) win -= arr[i - TRAIL]!;
      if (i >= TRAIL - 1) best = Math.max(best, win);
    }
    const inactive = c.status === "stopped" || c.status === "paused" || c.status === "completed";
    return {
      campaign_id: c.campaign_id,
      campaign_name: c.campaign_name,
      registrations: flows(s, { campaignId: c.campaign_id }).registrations,
      reg_rate_7d: inactive ? 0 : f7.registrations / TRAIL,
      best_reg_rate_7d: inactive ? 0 : best / TRAIL,
      spend_rate_7d: inactive ? 0 : f7.spend / TRAIL,
      marginal_cpr: ratio(f14.spend, f14.registrations),
    };
  });
}

/* ─────────────────────────────── Projection ─────────────────────────────── */

export type ScenarioChange =
  | { kind: "shift_budget"; from: string; to: string; amount: number }
  | { kind: "add_budget"; to: string; amount: number }
  | { kind: "scale_campaign"; campaign_id: string; factor: number }
  | { kind: "stop_campaign"; campaign_id: string }
  | { kind: "set_show_up_rate"; value: number }
  | { kind: "set_walk_in_share"; value: number }
  | { kind: "set_capacity"; value: number };

export type ProjectionParams = {
  showUpRate?: number;
  walkInShare?: number;
  capacity?: number;
  changes?: ScenarioChange[];
  /** "base" uses trailing 7-day rates; "stretch" uses each campaign's best 7-day rate and the large-event show-up. */
  mode?: "base" | "stretch";
};

export type CampaignProjection = {
  campaign_id: string;
  campaign_name: string;
  current_registrations: number;
  projected_registrations: number;
  daily_rate_used: number;
  future_spend: number;
};

export type ProjectionValue = {
  method: "model" | "actual";
  mode: "base" | "stretch";
  registrations: number;
  confirmed: number;
  registered_visitors: number;
  walk_ins: number;
  visitors: number;
  visitors_uncapped: number;
  capped_by_capacity: boolean;
  spend: number;
  budget: number | null;
  by_campaign: CampaignProjection[];
  notes: string[];
};

export function projection(s: Snapshot, params: ProjectionParams = {}): Result<ProjectionValue> {
  const mode = params.mode ?? "base";
  const changes = params.changes ?? [];
  const notes: string[] = [];
  const assumptions: Assumption[] = [RULES.dedup, RULES.external_only, RULES.reg_window];

  let capacity = params.capacity ?? s.capacity;
  let showUp = params.showUpRate ?? (mode === "stretch" ? BENCHMARKS.show_up_free_large.value : BENCHMARKS.show_up_free.value);
  let walkInShare = params.walkInShare ?? BENCHMARKS.walk_in_share.value;
  for (const ch of changes) {
    if (ch.kind === "set_show_up_rate") showUp = ch.value;
    if (ch.kind === "set_walk_in_share") walkInShare = ch.value;
    if (ch.kind === "set_capacity") capacity = ch.value;
  }

  const now = flows(s);
  const budget = s.target?.marketing_budget_inr ?? null;

  // After the event, the outcome is the observed result.
  if (s.phase === "post_event") {
    const regV = registeredVisitors(s);
    const visitors = s.visitors.size;
    return {
      value: {
        method: "actual",
        mode,
        registrations: now.registrations,
        confirmed: statusCounts(s)?.confirmed ?? 0,
        registered_visitors: regV,
        walk_ins: visitors - regV,
        visitors,
        visitors_uncapped: visitors,
        capped_by_capacity: false,
        spend: now.spend,
        budget,
        by_campaign: [],
        notes: ["The event is over, so this is the observed outcome, not a projection."],
      },
      formula: "Final outcome = unique verified external visitors observed",
      inputs: { as_of: s.asOf, phase: s.phase },
      assumptions: [RULES.verified_admission, RULES.external_only],
      sources: [{ collection: "checkins", records: s.visitors.size, filter: "verified visitors" }],
    };
  }

  const days = s.regDaysLeft;
  const rates = campaignRates(s);
  const factor = new Map<string, number>(rates.map((r) => [r.campaign_id, 1]));
  for (const ch of changes) {
    if (ch.kind === "scale_campaign") factor.set(ch.campaign_id, Math.max(0, ch.factor));
    if (ch.kind === "stop_campaign") factor.set(ch.campaign_id, 0);
  }

  const byCampaign: CampaignProjection[] = rates.map((r) => {
    const f = factor.get(r.campaign_id) ?? 1;
    const rate = (mode === "stretch" ? Math.max(r.best_reg_rate_7d, r.reg_rate_7d) : r.reg_rate_7d) * f;
    return {
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      current_registrations: r.registrations,
      projected_registrations: r.registrations + rate * days,
      daily_rate_used: rate,
      future_spend: r.spend_rate_7d * f * days,
    };
  });
  const byId = new Map(byCampaign.map((c) => [c.campaign_id, c]));
  const rateById = new Map(rates.map((r) => [r.campaign_id, r]));

  // Budget moves. Removing spend loses registrations at the campaign's recent average CPR;
  // adding spend gains them at a worse marginal CPR (average × multiplier, diminishing returns).
  const moved = (id: string, deltaSpend: number) => {
    const c = byId.get(id);
    const avg = rateById.get(id)?.marginal_cpr ?? null;
    const cpr = avg === null ? null : deltaSpend > 0 ? avg * BENCHMARKS.marginal_cost_multiplier.value : avg;
    if (!c) {
      notes.push(`Unknown campaign ${id}; change ignored.`);
      return;
    }
    if (cpr === null || cpr <= 0) {
      notes.push(`${c.campaign_name} has no recent cost per registration, so the effect of the budget change can't be estimated.`);
      c.future_spend += deltaSpend;
      return;
    }
    const removable = deltaSpend < 0 ? Math.max(deltaSpend, -c.future_spend) : deltaSpend;
    if (removable !== deltaSpend) notes.push(`${c.campaign_name}: only ₹${Math.round(c.future_spend)} of planned future spend can be moved.`);
    c.future_spend += removable;
    c.projected_registrations = Math.max(c.current_registrations, c.projected_registrations + removable / cpr);
  };
  for (const ch of changes) {
    if (ch.kind === "shift_budget") {
      moved(ch.from, -Math.abs(ch.amount));
      moved(ch.to, Math.abs(ch.amount));
    }
    if (ch.kind === "add_budget") moved(ch.to, Math.abs(ch.amount));
  }

  const projRegs = byCampaign.reduce((a, c) => a + c.projected_registrations, 0);
  const st = statusCounts(s) ?? { confirmed: 0, interested: 0, cancelled: 0, waitlisted: 0 };
  const confirmShare = ratio(st.confirmed, now.registrations) ?? BENCHMARKS.registered_to_confirmed.value;
  const confirmed = projRegs * confirmShare;
  const regVisitors = confirmed * showUp;
  const walkIns = walkInShare < 1 ? (regVisitors * walkInShare) / (1 - walkInShare) : 0;
  const uncapped = regVisitors + walkIns;
  const visitors = Math.min(capacity, uncapped);
  if (uncapped > capacity) notes.push(`Projected demand (${Math.round(uncapped)}) exceeds venue capacity (${capacity}).`);
  if (days === 0) notes.push("Registrations are closed, so only show-up and walk-ins remain uncertain.");

  const spend = now.spend + byCampaign.reduce((a, c) => a + c.future_spend, 0);
  if (budget !== null && spend > budget) notes.push(`Projected spend ₹${Math.round(spend)} exceeds the approved budget ₹${budget}.`);

  assumptions.push(
    {
      text:
        mode === "stretch"
          ? "Stretch: each campaign returns to its best 7-day registration rate for the remaining days"
          : "Base: each campaign keeps its trailing 7-day registration rate for the remaining days",
      label: "Assumption",
    },
    {
      text: `Confirmed share stays at the current ${(confirmShare * 100).toFixed(1)}% of registrations`,
      label: "Derived",
    },
    params.showUpRate !== undefined || changes.some((c) => c.kind === "set_show_up_rate")
      ? { text: `Show-up rate set to ${(showUp * 100).toFixed(1)}% by the user`, label: "Assumption" }
      : asAssumption(mode === "stretch" ? BENCHMARKS.show_up_free_large : BENCHMARKS.show_up_free),
    asAssumption(BENCHMARKS.walk_in_share),
    { text: `Venue capacity ${capacity} unique visitors (no capacity in source data)`, label: "Assumption" },
  );
  if (changes.some((c) => c.kind === "shift_budget" || c.kind === "add_budget")) {
    assumptions.push(
      {
        text: "Removed spend loses registrations at the campaign's trailing 14-day cost per registration",
        label: "Assumption",
      },
      asAssumption(BENCHMARKS.marginal_cost_multiplier),
    );
  }

  return {
    value: {
      method: "model",
      mode,
      registrations: projRegs,
      confirmed,
      registered_visitors: regVisitors,
      walk_ins: walkIns,
      visitors,
      visitors_uncapped: uncapped,
      capped_by_capacity: uncapped > capacity,
      spend,
      budget,
      by_campaign: byCampaign,
      notes,
    },
    formula:
      "projected registrations = Σ_c (current_c + daily_rate_c × days_left); " +
      "visitors = min(capacity, registrations × confirmed_share × show_up ÷ (1 − walk_in_share))",
    inputs: {
      as_of: s.asOf,
      mode,
      days_left: days,
      current_registrations: now.registrations,
      confirmed_share: Number(confirmShare.toFixed(4)),
      show_up_rate: showUp,
      walk_in_share: walkInShare,
      capacity,
      spend_to_date: now.spend,
    },
    assumptions,
    sources: [
      { collection: "registrations", records: s.registrations.length, filter: "external, ≤ cutoff (trailing 7/14 days for rates)" },
      { collection: "campaign_daily", records: s.daily.length, filter: "trailing 7/14 days spend" },
      { collection: "registration_history", records: s.statusByReg.size, filter: "latest status" },
    ],
  };
}

/** Base vs scenario, with the deltas the planner and copilot report. */
export function scenario(s: Snapshot, changes: ScenarioChange[], mode: "base" | "stretch" = "base") {
  const base = projection(s, { mode });
  const next = projection(s, { mode, changes });
  return {
    ...next,
    value: {
      base: base.value,
      scenario: next.value,
      delta: {
        registrations: next.value.registrations - base.value.registrations,
        visitors: next.value.visitors - base.value.visitors,
        spend: next.value.spend - base.value.spend,
      },
      changes,
    },
    formula: `Scenario = projection with changes applied; delta = scenario − base. ${next.formula}`,
  };
}

/* ─────────────────────────── Target vs actual ─────────────────────────── */

export type GoalStatus = {
  key: "identified" | "registrations" | "visitors" | "spend";
  label: string;
  actual: number;
  goal: number | null;
  pct: number | null;
  gap: number | null;
  /** Needed per day for the remaining days to hit the goal. */
  required_per_day: number | null;
  /** Trailing 7-day average per day. */
  current_per_day: number | null;
  projected: number | null;
  status: "on_track" | "at_risk" | "off_track" | "achieved" | "missed" | "no_target" | "under_budget" | "over_budget";
};

export function targetVsActual(s: Snapshot): Result<{ goals: GoalStatus[]; target_version: string | null; days_left: number }> {
  const t = s.target;
  const end = s.asOf < s.regCloseDay ? s.asOf : s.regCloseDay;
  const f7 = flows(s, { from: addDays(end, -6), to: end });
  const all = flows(s);
  const base = projection(s).value;
  const days = s.regDaysLeft;

  const goal = (
    key: GoalStatus["key"],
    label: string,
    actual: number,
    target: number | null,
    perDay: number | null,
    projected: number | null,
  ): GoalStatus => {
    if (target === null) {
      return { key, label, actual, goal: null, pct: null, gap: null, required_per_day: null, current_per_day: perDay, projected, status: "no_target" };
    }
    const gap = target - actual;
    // Visitors arrive only on event days, so a per-day requirement is meaningless for them.
    const required = key !== "visitors" && days > 0 && gap > 0 ? gap / days : null;
    const closed = s.phase === "post_event" || (key === "registrations" && days === 0 && s.asOf >= s.regCloseDay);
    let status: GoalStatus["status"];
    if (key === "spend") status = (projected ?? actual) > target ? "over_budget" : "under_budget";
    else if (actual >= target) status = "achieved";
    else if (closed) status = "missed";
    else if (projected !== null && projected >= target) status = "on_track";
    else if (projected !== null && projected >= target * 0.9) status = "at_risk";
    else status = "off_track";
    return { key, label, actual, goal: target, pct: ratio(actual, target), gap, required_per_day: required, current_per_day: perDay, projected, status };
  };

  const goals: GoalStatus[] = [
    goal("identified", "Identified external people", s.people.length, t?.identified_external_people_goal ?? null, f7.identified / 7, null),
    goal("registrations", "Registered external people", all.registrations, t?.registration_goal ?? null, f7.registrations / 7, s.phase === "post_event" ? all.registrations : base.registrations),
    goal("visitors", "Unique verified visitors", s.visitors.size, t?.unique_external_visitors_goal ?? null, null, base.visitors),
    goal("spend", "Net marketing spend", all.spend, t?.marketing_budget_inr ?? null, f7.spend / 7, base.spend),
  ];
  // Identified people: projected = actual + trailing rate × days (simple run-rate).
  const ig = goals[0]!;
  ig.projected = ig.actual + (ig.current_per_day ?? 0) * days;
  if (ig.goal !== null && ig.status !== "achieved" && ig.status !== "missed") {
    ig.status = ig.projected >= ig.goal ? "on_track" : ig.projected >= ig.goal * 0.9 ? "at_risk" : "off_track";
  }

  return {
    value: { goals, target_version: t?.target_version ?? null, days_left: days },
    formula:
      "pct = actual / goal; required/day = (goal − actual) / days left; current/day = trailing 7-day average; " +
      "status from the base projection: ≥ goal on track, ≥ 90% at risk, else off track",
    inputs: { as_of: s.asOf, target_version: t?.target_version ?? null, days_left: days, phase: s.phase },
    assumptions: [
      { text: "The target in force is the latest version effective at or before the as-of cutoff", label: "Dataset rule" },
      RULES.external_only,
      RULES.verified_admission,
      RULES.reg_window,
    ],
    sources: [
      { collection: "targets", records: t ? 1 : 0, filter: "latest effective ≤ cutoff" },
      { collection: "people", records: s.people.length, filter: "external ≤ cutoff" },
      { collection: "registrations", records: s.registrations.length, filter: "external ≤ cutoff" },
      { collection: "checkins", records: s.visitors.size, filter: "verified visitors" },
    ],
  };
}
