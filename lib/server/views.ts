import "server-only";
import { connection } from "next/server";
import {
  bottleneck,
  buildSnapshot,
  campaignKpis,
  campaignRates,
  evaluateRules,
  flows,
  funnel,
  projection,
  ratio,
  reallocation,
  registeredVisitors,
  series,
  statusCounts,
  targetVsActual,
  trend,
  type Assumption,
  type Dataset,
  type GoalStatus,
  type Snapshot,
  type SourceRef,
  BENCHMARKS,
} from "@/lib/analytics";
import { loadDataset, servedVersion } from "@/lib/analytics/load";
import { getDb } from "@/lib/db";
import { addDays, daysBetween, toDayKey } from "@/lib/time";
import { KPIS, KPI_ORDER, type KpiDef, type KpiKey } from "@/lib/ui/kpis";
import { asOfPresets } from "@/components/shell/nav";

/**
 * View models for pages: plain JSON built only from engine outputs.
 * No figure is computed in a component.
 */

export type Meta = {
  asOf: string;
  phase: Snapshot["phase"];
  historyStart: string;
  historyEnd: string;
  eventStartDay: string;
  eventEndDay: string;
  regCloseDay: string;
  daysToEvent: number;
  regDaysLeft: number;
  targetVersion: string | null;
  festival: string;
  city: string;
  capacity: number;
  presets: { day: string; label: string }[];
};

function metaOf(s: Snapshot, ds: Dataset): Meta {
  return {
    presets: asOfPresets({
      historyStart: ds.event.history_start,
      historyEnd: ds.event.history_end,
      eventStartDay: s.eventStartDay,
      regCloseDay: s.regCloseDay,
      targetRevisions: ds.targets.map((t) => toDayKey(t.effective_at)).filter((d) => d > ds.event.history_start),
    }),
    asOf: s.asOf,
    phase: s.phase,
    historyStart: ds.event.history_start,
    historyEnd: ds.event.history_end,
    eventStartDay: s.eventStartDay,
    eventEndDay: s.eventEndDay,
    regCloseDay: s.regCloseDay,
    daysToEvent: s.daysToEvent,
    regDaysLeft: s.regDaysLeft,
    targetVersion: s.target?.target_version ?? null,
    festival: ds.settings.festival_name,
    city: ds.settings.city,
    capacity: s.capacity,
  };
}

/* ───────────────────────── view cache ───────────────────────── */

/**
 * Memoises a view model by data version + arguments. Any write bumps the version,
 * so cached views can never be stale; repeat visits and parallel cards are instant.
 */
const g = globalThis as typeof globalThis & { __turnoutViews?: Map<string, Promise<unknown>> };
const VIEWS = (g.__turnoutViews ??= new Map());
const MAX_VIEWS = 120;

function cachedView<A extends unknown[], R>(name: string, raw: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A) => {
    await connection();
    await loadDataset();
    const key = `${servedVersion()}|${name}|${JSON.stringify(args)}`;
    const hit = VIEWS.get(key) as Promise<R> | undefined;
    if (hit) return hit;
    const p = raw(...args);
    VIEWS.set(key, p);
    p.catch(() => VIEWS.delete(key));
    if (VIEWS.size > MAX_VIEWS) VIEWS.delete(VIEWS.keys().next().value!);
    return p;
  };
}

/* ───────────────────────── KPI values ───────────────────────── */

function kpiValue(s: Snapshot, key: KpiKey, campaignId?: string | null): number | null {
  const f = flows(s, { campaignId });
  switch (key) {
    case "reg":
      return f.registrations;
    case "vis":
      return f.visitors;
    case "idn":
      return campaignId ? f.identified : s.people.length;
    case "spd":
      return f.spend;
    case "cpr":
      return ratio(f.spend, f.registrations);
    case "ctr":
      return ratio(f.clicks, f.impressions);
    case "cnf":
      return ratio(statusCounts(s, campaignId)?.confirmed ?? 0, f.registrations);
    case "shw": {
      const atStart = statusCounts(s, campaignId, true);
      return atStart ? ratio(registeredVisitors(s, campaignId), atStart.confirmed) : null;
    }
  }
}

const GOAL_KEY: Partial<Record<KpiKey, GoalStatus["key"]>> = { reg: "registrations", vis: "visitors", idn: "identified", spd: "spend" };
const TREND_KEY: Partial<Record<KpiKey, Parameters<typeof trend>[1]>> = {
  reg: "registrations",
  vis: "visitors",
  idn: "identified",
  spd: "spend",
  cpr: "cost_per_registration",
  ctr: "ctr",
};
const SERIES_KEY = { reg: "registrations", vis: "visitors", idn: "identified", spd: "spend" } as const;

/** Daily series from history start to as-of. Additive = daily values; ratios = rolling 7-day. */
function kpiSeries(ds: Dataset, s: Snapshot, key: KpiKey, campaignId?: string | null, from?: string): { day: string; value: number }[] {
  const start = from && from > s.event.history_start ? from : s.event.history_start;
  if (key in SERIES_KEY) return series(s, SERIES_KEY[key as keyof typeof SERIES_KEY], { campaignId, from: start });
  const n = Math.max(0, daysBetween(start, s.asOf) + 1);
  const out: { day: string; value: number }[] = [];
  const timeline = key === "cnf" || key === "shw" ? statusTimeline(s, key, start, n, campaignId) : [];
  for (let i = 0; i < n; i++) {
    const day = addDays(start, i);
    let v: number | null = null;
    if (key === "cpr" || key === "ctr") {
      const f = flows(s, { from: addDays(day, -6), to: day, campaignId });
      v = key === "cpr" ? ratio(f.spend, f.registrations) : ratio(f.clicks, f.impressions);
    } else {
      v = timeline[i] ?? null;
    }
    out.push({ day, value: v ?? 0 });
  }
  return out;
}

/**
 * Confirm-rate (or show-up) per day in one pass over the status history, instead of
 * rebuilding a snapshot for every day. Same rules: external registrations, latest status ≤ end of day.
 */
function statusTimeline(s: Snapshot, key: "cnf" | "shw", start: string, n: number, campaignId?: string | null): (number | null)[] {
  const regs = s.registrations.filter((r) => !campaignId || r.campaign_id === campaignId);
  const regDay = new Map(regs.map((r) => [r.registration_id, toDayKey(r.registered_at)]));
  if (key === "shw") {
    const atStart = statusCounts(s, campaignId, true);
    const conf = atStart?.confirmed ?? 0;
    const byDay = new Map<string, number>();
    for (const v of s.visitors.values()) if (!v.walk_in && (!campaignId || v.campaign_id === campaignId)) byDay.set(toDayKey(v.first_admitted_at), (byDay.get(toDayKey(v.first_admitted_at)) ?? 0) + 1);
    let acc = 0;
    return Array.from({ length: n }, (_, i) => {
      const d = addDays(start, i);
      acc += byDay.get(d) ?? 0;
      return d < s.eventStartDay || !conf ? null : acc / conf;
    });
  }
  // cnf: replay status versions in time order.
  const events = [...s.historyByReg.entries()]
    .filter(([rid]) => regDay.has(rid))
    .flatMap(([rid, hs]) => hs.map((h) => ({ rid, day: toDayKey(h.effective_at), t: h.effective_at.getTime(), id: h.history_id, status: h.status })))
    .sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
  const status = new Map<string, string>();
  const regsByDay = new Map<string, number>();
  for (const d of regDay.values()) regsByDay.set(d, (regsByDay.get(d) ?? 0) + 1);
  let ei = 0;
  let regCount = 0;
  let confirmed = 0;
  const out: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(start, i);
    regCount += regsByDay.get(d) ?? 0;
    while (ei < events.length && events[ei]!.day <= d) {
      const e = events[ei++]!;
      const prev = status.get(e.rid);
      if (prev === "confirmed") confirmed--;
      if (e.status === "confirmed") confirmed++;
      status.set(e.rid, e.status);
    }
    out.push(regCount ? confirmed / regCount : null);
  }
  return out;
}

export type KpiTile = {
  key: KpiKey;
  code: string;
  label: string;
  format: KpiDef["format"];
  value: number | null;
  goal: number | null;
  projected: number | null;
  stretch: number | null;
  status: string;
  delta: string | null;
  spark: number[];
  caption: string | null;
};

function deltaText(s: Snapshot, key: KpiKey, def: KpiDef): string | null {
  const tk = TREND_KEY[key];
  if (!tk) return null;
  const t = trend(s, tk, 7).value;
  if (t.change === null) return null;
  if (!t.current.value && !t.previous.value) return null;
  const arrow = t.change > 0 ? "▲" : t.change < 0 ? "▼" : "■";
  if (def.format === "pct") return `${arrow} ${(Math.abs(t.change) * 100).toFixed(1)}pp WoW`;
  if (t.change_pct === null) return `${arrow} ${Math.abs(Math.round(t.change)).toLocaleString("en-IN")} WoW`;
  return `${arrow} ${(Math.abs(t.change_pct) * 100).toFixed(1)}% WoW`;
}

function tiles(ds: Dataset, s: Snapshot): KpiTile[] {
  const goals = targetVsActual(s).value.goals;
  const stretch = projection(s, { mode: "stretch" }).value;
  const rules = evaluateRules(s).value;
  return KPI_ORDER.map((key) => {
    const def = KPIS[key];
    const gk = GOAL_KEY[key];
    const g = gk ? goals.find((x) => x.key === gk) : undefined;
    const value = kpiValue(s, key);
    let status: string = g?.status ?? "no_target";
    let caption: string | null = null;
    if (key === "cpr") {
      const p = rules.portfolio_cpr;
      status = p === null || value === null ? "insufficient_data" : "keep";
      caption = p === null ? null : `14d portfolio ₹${Math.round(p)}`;
    }
    const bench = key === "ctr" ? BENCHMARKS.ctr.value : key === "cnf" ? BENCHMARKS.registered_to_confirmed.value : key === "shw" ? BENCHMARKS.show_up_free.value : null;
    if (bench !== null) {
      status = value === null ? "insufficient_data" : value >= bench ? "on_track" : value >= bench * 0.9 ? "at_risk" : "off_track";
      caption = `vs ${(bench * 100).toFixed(0)}% benchmark`;
    }
    if (key === "shw" && value === null) caption = "measurable from event day";
    if (key === "vis" && (s.phase === "pre_event" || s.phase === "before_history")) caption = "event not started";
    const stretchVal = key === "reg" ? stretch.registrations : key === "vis" ? stretch.visitors : null;
    return {
      key,
      code: def.code,
      label: def.label,
      format: def.format,
      value,
      goal: g?.goal ?? null,
      projected: g?.projected ?? null,
      stretch: stretchVal,
      status,
      delta: deltaText(s, key, def),
      spark: kpiSeries(ds, s, key, null, addDays(s.asOf, -20)).map((p) => p.value),
      caption,
    };
  });
}

/* ───────────────────────── Overview ───────────────────────── */

async function overviewViewRaw(asOfInput?: string) {
  await connection();
  const ds = await loadDataset();
  const s = buildSnapshot(ds, asOfInput);
  const goals = targetVsActual(s);
  const base = projection(s);
  const stretch = projection(s, { mode: "stretch" });
  const fun = funnel(s);
  const bn = bottleneck(s);
  const rules = evaluateRules(s);
  const kpis = campaignKpis(s);
  const verdicts = new Map(rules.value.evaluations.map((e) => [e.campaign_id, e]));

  const leaderboard = kpis.value
    .map((k) => ({
      ...k,
      verdict: verdicts.get(k.campaign_id)?.verdict ?? "insufficient_data",
      reason: verdicts.get(k.campaign_id)?.reason ?? "",
      cpr_14d: verdicts.get(k.campaign_id)?.metric === "cost_per_registration" ? (verdicts.get(k.campaign_id)?.value ?? null) : null,
    }))
    .sort((a, b) => b.registrations - a.registrations);

  const attention: { id: string; kind: "goal" | "bottleneck" | "rule"; title: string; detail: string; status: string; campaignId?: string }[] = [];
  for (const g of goals.value.goals) {
    if (["off_track", "at_risk", "missed", "over_budget"].includes(g.status)) {
      attention.push({
        id: `goal-${g.key}`,
        kind: "goal",
        status: g.status,
        title: `${g.label}: ${g.status.replace("_", " ")}`,
        detail:
          g.projected !== null && g.goal !== null
            ? `Projected ${Math.round(g.projected).toLocaleString("en-IN")} vs goal ${g.goal.toLocaleString("en-IN")}` +
              (g.required_per_day ? ` · needs ${g.required_per_day.toFixed(1)}/day, running ${g.current_per_day?.toFixed(1) ?? "—"}/day` : "")
            : "",
      });
    }
  }
  if (bn.value.bottleneck) {
    const b = bn.value.bottleneck;
    attention.push({
      id: `btnk-${b.key}`,
      kind: "bottleneck",
      status: "change",
      title: `Bottleneck: ${b.label}`,
      detail: `${((b.actual ?? 0) * 100).toFixed(1)}% vs ${(b.benchmark * 100).toFixed(1)}% · weakest: ${b.worst_campaigns.map((w) => w.campaign_name).join(", ")}`,
    });
  }
  for (const e of rules.value.evaluations) {
    if (e.verdict === "stop" || e.verdict === "change") {
      attention.push({ id: `rule-${e.campaign_id}`, kind: "rule", status: e.verdict, title: `${e.verdict.toUpperCase()}: ${e.campaign_name}`, detail: e.reason, campaignId: e.campaign_id });
    }
  }

  // "What to do next": the few actions that matter, in priority order, in plain language.
  const actions: { id: string; title: string; why: string; impact?: string; campaignId?: string; owner?: string; href?: string }[] = [];
  const regGoal = goals.value.goals.find((g) => g.key === "registrations");
  if (regGoal && (regGoal.status === "at_risk" || regGoal.status === "off_track") && regGoal.required_per_day && regGoal.current_per_day !== null) {
    actions.push({
      id: "gap",
      title: `Lift registrations to ${Math.ceil(regGoal.required_per_day)} a day`,
      why: `Running at ${regGoal.current_per_day.toFixed(0)} a day. At this pace we reach ${Math.round(regGoal.projected ?? 0).toLocaleString("en-IN")} of ${regGoal.goal?.toLocaleString("en-IN")}.`,
      href: "/kpi/reg",
    });
  }
  const ra = reallocation(s).value;
  if (ra.moves.length && ra.effect) {
    const total = ra.moves.reduce((a, m) => a + m.amount, 0);
    actions.push({
      id: "realloc",
      title: `Move ₹${total.toLocaleString("en-IN")} to the cheapest channels`,
      why: `From ${[...new Set(ra.moves.map((m) => m.from_name))].join(" and ")} to ${[...new Set(ra.moves.map((m) => m.to_name))].slice(0, 3).join(", ")}.`,
      impact: `≈ +${Math.round(ra.effect.delta.registrations)} registrations, +${Math.round(ra.effect.delta.visitors)} visitors`,
      href: "/planner",
    });
  }
  for (const e of rules.value.evaluations.filter((x) => x.verdict === "stop" && x.status !== "stopped").slice(0, 2)) {
    actions.push({ id: `stop-${e.campaign_id}`, title: `Stop or rework ${e.campaign_name}`, why: e.reason, campaignId: e.campaign_id, owner: e.owner_name, href: `/campaigns/${e.campaign_id}` });
  }
  if (bn.value.bottleneck) {
    const b = bn.value.bottleneck;
    actions.push({
      id: "leak",
      title: `Fix the leak at ${b.label.toLowerCase()}`,
      why: `${((b.actual ?? 0) * 100).toFixed(1)}% convert vs ${(b.benchmark * 100).toFixed(1)}% needed. Weakest: ${b.worst_campaigns.map((w) => w.campaign_name).join(", ")}.`,
      href: "/funnel",
    });
  }

  const sparkFrom = addDays(s.asOf, -20);
  const campaignTrends = Object.fromEntries(s.campaigns.map((c) => [c.campaign_id, series(s, "registrations", { campaignId: c.campaign_id, from: sparkFrom }).map((p) => p.value)]));

  return {
    meta: metaOf(s, ds),
    actions: actions.slice(0, 4),
    campaignTrends,
    tiles: tiles(ds, s),
    goals: goals.value,
    projection: { base: base.value, stretch: stretch.value, formula: base.formula, assumptions: base.assumptions },
    funnel: fun.value,
    funnelBenchmarksNote: fun.assumptions,
    bottleneck: bn.value.bottleneck,
    leaderboard,
    portfolioCpr: rules.value.portfolio_cpr,
    attention,
    quality: s.quality,
    owners: [...new Set([...ds.campaigns.map((c) => c.owner_name), ...(ds.tasks ?? []).map((t) => t.owner_name)])].sort(),
    campaigns: ds.campaigns.map((c) => ({ id: c.campaign_id, name: c.campaign_name, owner: c.owner_name })),
  };
}
export type OverviewView = Awaited<ReturnType<typeof overviewView>>;

/* ───────────────────────── KPI drill-down ───────────────────────── */

async function kpiViewRaw(key: KpiKey, asOfInput?: string) {
  await connection();
  const ds = await loadDataset();
  const s = buildSnapshot(ds, asOfInput);
  const def = KPIS[key];
  const tile = tiles(ds, s).find((t) => t.key === key)!;
  const goals = targetVsActual(s);
  const g = GOAL_KEY[key] ? goals.value.goals.find((x) => x.key === GOAL_KEY[key]) ?? null : null;
  const rules = evaluateRules(s).value;
  const verdicts = new Map(rules.evaluations.map((e) => [e.campaign_id, e]));
  const tk = TREND_KEY[key];
  const tr = tk ? trend(s, tk, 7) : null;
  const trById = new Map(tr?.value.by_campaign.map((c) => [c.campaign_id, c]) ?? []);
  const total = kpiValue(s, key);

  const byCampaign = s.campaigns.map((c) => {
    const v = kpiValue(s, key, c.campaign_id);
    const t = trById.get(c.campaign_id);
    return {
      campaign_id: c.campaign_id,
      campaign_name: c.campaign_name,
      owner_name: c.owner_name,
      channel: c.channel,
      value: v,
      share: def.kind === "additive" && v !== null && total ? v / total : null,
      wow_change: t?.change ?? null,
      contribution: t?.contribution ?? null,
      verdict: verdicts.get(c.campaign_id)?.verdict ?? "insufficient_data",
    };
  });

  // Show-up only exists from event day; don't draw months of zeros before it.
  const seriesFrom = key === "shw" ? addDays(s.eventStartDay, -2) : undefined;
  const seriesAll = kpiSeries(ds, s, key, null, seriesFrom);
  const compare = s.campaigns.map((c) => ({ id: c.campaign_id, label: c.campaign_name, points: kpiSeries(ds, s, key, c.campaign_id, seriesFrom) }));

  // Forecast lines (cumulative): base and stretch run-rates from the as-of to the relevant close.
  const forecast: { label: string; points: { day: string; value: number }[] }[] = [];
  if (s.phase === "pre_event" && (key === "reg" || key === "idn" || key === "spd" || key === "vis")) {
    const base = projection(s).value;
    const str = projection(s, { mode: "stretch" }).value;
    const cur = total ?? 0;
    const line = (label: string, perDay: number) => ({
      label,
      points: Array.from({ length: s.regDaysLeft + 1 }, (_, i) => ({ day: addDays(s.asOf, i), value: cur + perDay * i })),
    });
    const rate = (p: typeof base) => p.by_campaign.reduce((a, c) => a + c.daily_rate_used, 0);
    if (key === "reg") forecast.push(line("Base", rate(base)), line("Stretch", rate(str)));
    if (key === "spd") forecast.push(line("Base", base.by_campaign.reduce((a, c) => a + c.future_spend, 0) / Math.max(1, s.regDaysLeft)));
    if (key === "idn") forecast.push(line("Run-rate", (g?.current_per_day ?? 0)));
    if (key === "vis") {
      const v = (label: string, value: number) => ({
        label,
        points: [
          { day: s.asOf, value: cur },
          { day: addDays(s.eventStartDay, -1), value: cur },
          { day: s.eventEndDay, value },
        ],
      });
      forecast.push(v("Base", base.visitors), v("Stretch", str.visitors));
    }
  }

  const annotations = [
    ...ds.targets
      .map((t) => toDayKey(t.effective_at))
      .filter((d) => d > ds.event.history_start && d <= s.asOf)
      .map((d) => ({ day: d, label: "Target revised" })),
    ...(s.regCloseDay <= s.asOf ? [{ day: s.regCloseDay, label: "Reg close" }] : []),
    ...(s.eventStartDay <= s.asOf ? [{ day: s.eventStartDay, label: "Event" }] : []),
  ];

  const stats: { k: string; v: string | number | null; fmt: "int" | "inr" | "pct" | "dec" | "text" }[] = [];
  if (g) {
    stats.push(
      { k: "Actual", v: g.actual, fmt: def.format },
      { k: "Goal", v: g.goal, fmt: def.format },
      { k: "% of goal", v: g.pct, fmt: "pct" },
      { k: "Gap", v: g.gap, fmt: def.format },
      { k: "Needed / day", v: g.required_per_day, fmt: def.format === "inr" ? "inr" : "dec" },
      { k: "Running / day (7d)", v: g.current_per_day, fmt: def.format === "inr" ? "inr" : "dec" },
      { k: "Projected (base)", v: g.projected, fmt: def.format },
    );
    if (tile.stretch !== null) stats.push({ k: "Projected (stretch)", v: tile.stretch, fmt: def.format });
  } else {
    stats.push({ k: "Current", v: total, fmt: def.format });
    if (key === "cpr") stats.push({ k: "Portfolio CPR (14d)", v: rules.portfolio_cpr, fmt: "inr" });
    const bench = key === "ctr" ? BENCHMARKS.ctr.value : key === "cnf" ? BENCHMARKS.registered_to_confirmed.value : key === "shw" ? BENCHMARKS.show_up_free.value : null;
    if (bench !== null) {
      stats.push({ k: "Benchmark", v: bench, fmt: "pct" });
      if (total !== null) stats.push({ k: "vs benchmark", v: `${total >= bench ? "+" : "−"}${(Math.abs(total - bench) * 100).toFixed(1)} pts`, fmt: "text" });
    }
    if (key === "shw" && s.statusAtEventStart) {
      const atStart = statusCounts(s, null, true)!;
      stats.push({ k: "Confirmed at event start", v: atStart.confirmed, fmt: "int" }, { k: "Of them, attended", v: registeredVisitors(s), fmt: "int" }, { k: "Walk-ins (not in rate)", v: flows(s).walk_ins, fmt: "int" });
    }
  }
  if (tr) {
    stats.push(
      { k: "This week", v: tr.value.current.value, fmt: def.format },
      { k: "Last week", v: tr.value.previous.value, fmt: def.format },
      { k: "WoW change", v: tr.value.change_pct, fmt: "pct" },
    );
  }

  // Working shown on the page: from the engine result behind this KPI.
  const work = (() => {
    if (key === "reg" || key === "vis" || key === "idn" || key === "spd") return goals;
    if (key === "cpr" || key === "ctr" || key === "cnf" || key === "shw") return campaignKpis(s);
    return goals;
  })();
  const assumptions: Assumption[] = [...work.assumptions, ...(tr?.assumptions ?? [])].filter(
    (a, i, arr) => arr.findIndex((b) => b.text === a.text) === i,
  );
  const sources: SourceRef[] = work.sources;

  return {
    meta: metaOf(s, ds),
    def,
    tile,
    stats,
    series: seriesAll,
    compare,
    forecast,
    annotations,
    byCampaign,
    trend: tr?.value ?? null,
    formula: def.description + " " + work.formula,
    inputs: work.inputs,
    assumptions,
    sources,
    otherKpis: KPI_ORDER.filter((k) => k !== key).map((k) => ({ key: k, mnemonic: KPIS[k].mnemonic, label: KPIS[k].label })),
  };
}
export type KpiView = Awaited<ReturnType<typeof kpiView>>;

/* ───────────────────────── Funnel ───────────────────────── */

async function funnelViewRaw(asOfInput?: string, campaignId?: string | null) {
  await connection();
  const ds = await loadDataset();
  const s = buildSnapshot(ds, asOfInput);
  const valid = campaignId && s.campaignIds.includes(campaignId) ? campaignId : null;
  const f = funnel(s, { campaignId: valid });
  const bn = bottleneck(s);
  // Conversion matrix: each campaign's stage conversions side by side.
  const matrix = s.campaigns.map((c) => {
    const fc = funnel(s, { campaignId: c.campaign_id }).value;
    return {
      campaign_id: c.campaign_id,
      campaign_name: c.campaign_name,
      stages: [...fc.anonymous.slice(1), ...fc.identified.slice(1)].map((st) => ({ key: st.key, conversion: st.conversion, benchmark: st.benchmark })),
    };
  });
  const stageLabels = [...f.value.anonymous.slice(1), ...f.value.identified.slice(1)].map((st) => ({ key: st.key, label: st.label, benchmark: st.benchmark }));
  return {
    meta: metaOf(s, ds),
    campaignId: valid,
    campaigns: s.campaigns.map((c) => ({ id: c.campaign_id, name: c.campaign_name })),
    funnel: f.value,
    formula: f.formula,
    assumptions: f.assumptions,
    sources: f.sources,
    bottleneck: bn.value,
    bottleneckFormula: bn.formula,
    matrix,
    stageLabels,
  };
}
export type FunnelView = Awaited<ReturnType<typeof funnelView>>;

/* ───────────────────────── Campaigns ───────────────────────── */

export async function campaignsView(asOfInput?: string) {
  const o = await overviewView(asOfInput);
  return { meta: o.meta, rows: o.leaderboard, portfolioCpr: o.portfolioCpr };
}

async function campaignViewRaw(id: string, asOfInput?: string) {
  await connection();
  const ds = await loadDataset();
  const s = buildSnapshot(ds, asOfInput);
  const c = s.campaigns.find((x) => x.campaign_id === id);
  if (!c) return null;
  const k = campaignKpis(s).value.find((x) => x.campaign_id === id)!;
  const rule = evaluateRules(s).value.evaluations.find((e) => e.campaign_id === id)!;
  const f = funnel(s, { campaignId: id }).value;
  const regSeries = series(s, "registrations", { campaignId: id });
  const spendSeries = series(s, "spend", { campaignId: id });
  const regTrend = trend(s, "registrations", 7).value.by_campaign.find((x) => x.campaign_id === id) ?? null;
  const tasks = (ds.tasks ?? []).filter((t) => t.campaign_id === id).map((t) => ({ ...t, created_at: t.created_at.toISOString(), updated_at: t.updated_at.toISOString() }));
  const rates = campaignRates(s).find((r) => r.campaign_id === id) ?? null;
  // Daily rows for the editor: deduplicated by activity_id, newest first, up to the as-of date.
  const seen = new Set<string>();
  const daily = ds.daily
    .filter((d) => d.campaign_id === id && d.activity_date <= s.asOf)
    .filter((d) => (seen.has(d.activity_id) ? false : (seen.add(d.activity_id), true)))
    .sort((a, b) => (a.activity_date < b.activity_date ? 1 : -1))
    .map((d) => ({
      activity_id: d.activity_id,
      activity_date: d.activity_date,
      impressions: d.impressions,
      clicks: d.clicks,
      reported_reach: d.reported_reach,
      landing_page_sessions: d.landing_page_sessions,
      registration_starts: d.registration_starts,
      marketing_spend_inr: d.marketing_spend_inr,
      platform: d.platform,
      origin: d.origin,
      edited: d.edited ?? false,
    }));
  return {
    meta: metaOf(s, ds),
    campaign: {
      ...c,
      created_at: c.created_at.toISOString(),
      planned_start_at: c.planned_start_at.toISOString(),
      planned_end_at: c.planned_end_at.toISOString(),
    },
    kpis: k,
    rule,
    funnel: f,
    regSeries,
    spendSeries,
    regTrend,
    rates,
    tasks,
    daily,
  };
}
export type CampaignView = NonNullable<Awaited<ReturnType<typeof campaignView>>>;

/* ───────────────────────── Tasks / activity / settings ───────────────────────── */

async function tasksViewRaw(asOfInput?: string) {
  await connection();
  const ds = await loadDataset();
  const s = buildSnapshot(ds, asOfInput);
  const owners = [...new Map([...ds.campaigns.map((c) => [c.owner_name, c.owner_id] as const), ...(ds.tasks ?? []).map((t) => [t.owner_name, t.owner_id] as const)]).keys()].sort();
  const tasks = (ds.tasks ?? [])
    .map((t) => ({
      ...t,
      created_at: t.created_at.toISOString(),
      updated_at: t.updated_at.toISOString(),
      overdue: t.status !== "done" && t.due_date < s.asOf,
      campaign_name: ds.campaigns.find((c) => c.campaign_id === t.campaign_id)?.campaign_name ?? null,
    }))
    .sort((a, b) => (a.priority === b.priority ? (a.due_date < b.due_date ? -1 : 1) : a.priority < b.priority ? -1 : 1));
  return { meta: metaOf(s, ds), tasks, owners, campaigns: ds.campaigns.map((c) => ({ id: c.campaign_id, name: c.campaign_name })) };
}
export type TasksView = Awaited<ReturnType<typeof tasksView>>;

export async function activityView(limit = 200) {
  await connection();
  const db = await getDb();
  const rows = await db.collection("activity").find({}, { projection: { _id: 0 } }).sort({ at: -1 }).limit(limit).toArray();
  return rows.map((r) => ({
    entity: r.entity as string,
    entity_id: r.entity_id as string,
    action: r.action as string,
    actor: r.actor as string,
    summary: r.summary as string,
    at: (r.at as Date).toISOString(),
    before: r.before === null || r.before === undefined ? null : JSON.stringify(r.before, null, 0).slice(0, 600),
    after: r.after === null || r.after === undefined ? null : JSON.stringify(r.after, null, 0).slice(0, 600),
  }));
}

async function settingsViewRaw(asOfInput?: string) {
  await connection();
  const ds = await loadDataset();
  const s = buildSnapshot(ds, asOfInput);
  return {
    meta: metaOf(s, ds),
    targets: ds.targets
      .map((t) => ({ ...t, effective_at: t.effective_at.toISOString(), effective_day: toDayKey(t.effective_at) }))
      .sort((a, b) => (a.effective_at < b.effective_at ? -1 : 1)),
    capacity: ds.settings.venue_capacity,
    defaultAsOf: ds.settings.default_as_of,
    quality: s.quality,
  };
}

/* ───────────────────────── Planner ───────────────────────── */

async function plannerViewRaw(asOfInput?: string) {
  await connection();
  const ds = await loadDataset();
  const s = buildSnapshot(ds, asOfInput);
  const realloc = reallocation(s);
  const rules = evaluateRules(s);
  const base = projection(s);
  const rates = campaignRates(s);
  return {
    meta: metaOf(s, ds),
    reallocation: realloc.value,
    reallocationFormula: realloc.formula,
    reallocationAssumptions: realloc.assumptions,
    rules: rules.value.evaluations,
    portfolioCpr: rules.value.portfolio_cpr,
    base: base.value,
    rates,
    campaigns: ds.campaigns.map((c) => ({ id: c.campaign_id, name: c.campaign_name, owner: c.owner_name })),
    owners: [...new Set([...ds.campaigns.map((c) => c.owner_name), ...(ds.tasks ?? []).map((t) => t.owner_name)])].sort(),
  };
}
export type PlannerView = Awaited<ReturnType<typeof plannerView>>;

/* Cached exports */
export const overviewView = cachedView("overviewView", overviewViewRaw);
export const kpiView = cachedView("kpiView", kpiViewRaw);
export const funnelView = cachedView("funnelView", funnelViewRaw);
export const campaignView = cachedView("campaignView", campaignViewRaw);
export const tasksView = cachedView("tasksView", tasksViewRaw);
export const settingsView = cachedView("settingsView", settingsViewRaw);
export const plannerView = cachedView("plannerView", plannerViewRaw);
