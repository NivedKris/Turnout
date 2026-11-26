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
import { loadDataset } from "@/lib/analytics/load";
import { addDays, daysBetween, toDayKey } from "@/lib/time";
import { KPIS, KPI_ORDER, type KpiDef, type KpiKey } from "@/lib/ui/kpis";

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
};

function metaOf(s: Snapshot, ds: Dataset): Meta {
  return {
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
  for (let i = 0; i < n; i++) {
    const day = addDays(start, i);
    let v: number | null = null;
    if (key === "cpr" || key === "ctr") {
      const f = flows(s, { from: addDays(day, -6), to: day, campaignId });
      v = key === "cpr" ? ratio(f.spend, f.registrations) : ratio(f.clicks, f.impressions);
    } else {
      // Status-based ratios need the state as of that day.
      const si = buildSnapshot(ds, day);
      v = kpiValue(si, key, campaignId);
    }
    out.push({ day, value: v ?? 0 });
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

export async function overviewView(asOfInput?: string) {
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

  return {
    meta: metaOf(s, ds),
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
  };
}
export type OverviewView = Awaited<ReturnType<typeof overviewView>>;

/* ───────────────────────── KPI drill-down ───────────────────────── */

export async function kpiView(key: KpiKey, asOfInput?: string) {
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

  const seriesAll = kpiSeries(ds, s, key);
  const compare = s.campaigns.map((c) => ({ id: c.campaign_id, label: c.campaign_name, points: kpiSeries(ds, s, key, c.campaign_id) }));

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

export async function funnelView(asOfInput?: string, campaignId?: string | null) {
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

export async function campaignView(id: string, asOfInput?: string) {
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
  };
}
export type CampaignView = NonNullable<Awaited<ReturnType<typeof campaignView>>>;
