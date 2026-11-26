import "server-only";
import { tool } from "ai";
import { all, create } from "mathjs";
import { z } from "zod";
import {
  bottleneck,
  buildSnapshot,
  campaignKpis,
  campaignRates,
  dataCoverage,
  evaluateRules,
  flows,
  funnel,
  projection,
  reallocation,
  registeredVisitors,
  scenario,
  series,
  statusCounts,
  targetVsActual,
  trend,
  TREND_METRICS,
  type Dataset,
  type Snapshot,
} from "../analytics";
import { getDb } from "../db";
import { CampaignPatch, TaskCreate } from "../models/inputs";
import { ScenarioChanges } from "../models/scenario";
import { addDays, isDayKey } from "../time";
import type { TraceRecorder } from "./trace";

/* ─────────────────────────── helpers ─────────────────────────── */

const r4 = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n * 10000) / 10000);
const r1 = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);

/** Sandboxed math: no import/createUnit/eval re-definition, expression length capped. */
const math = create(all);
const mathEval = math.evaluate.bind(math);
math.import(
  {
    import: () => {
      throw new Error("import is disabled");
    },
    createUnit: () => {
      throw new Error("createUnit is disabled");
    },
    evaluate: () => {
      throw new Error("evaluate is disabled");
    },
    parse: () => {
      throw new Error("parse is disabled");
    },
  },
  { override: true },
);

type SeriesMetric = "registrations" | "identified" | "spend" | "clicks" | "impressions" | "sessions" | "registration_starts" | "visitors";

export type ToolContext = { ds: Dataset; asOf: string; rec: TraceRecorder };

const asOfArg = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("As-of IST date YYYY-MM-DD. Omit to use the user's selected date.");

function snapFactory(ctx: ToolContext) {
  const cache = new Map<string, Snapshot>();
  return (asOf?: string) => {
    const d = asOf && isDayKey(asOf) ? asOf : ctx.asOf;
    if (!cache.has(d)) cache.set(d, buildSnapshot(ctx.ds, d));
    return cache.get(d)!;
  };
}

/** Fuzzy campaign lookup by id, name or channel. Returns a match or candidates. */
export function resolveCampaign(ds: Dataset, q: string): { match: Dataset["campaigns"][number] | null; candidates: { id: string; name: string }[] } {
  const s = q.trim().toLowerCase();
  const all = ds.campaigns;
  const byId = all.find((c) => c.campaign_id.toLowerCase() === s);
  if (byId) return { match: byId, candidates: [] };
  const exact = all.filter((c) => c.campaign_name.toLowerCase() === s || c.channel.toLowerCase() === s);
  if (exact.length === 1) return { match: exact[0]!, candidates: [] };
  const tokens = s.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const scored = all
    .map((c) => {
      const hay = `${c.campaign_name} ${c.channel} ${c.campaign_id}`.toLowerCase();
      return { c, score: tokens.filter((t) => hay.includes(t) || hay.includes(t.replace(/s$/, ""))).length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 1 || (scored.length > 1 && scored[0]!.score > scored[1]!.score)) return { match: scored[0]!.c, candidates: [] };
  return { match: null, candidates: (scored.length ? scored.map((x) => x.c) : all).map((c) => ({ id: c.campaign_id, name: c.campaign_name })) };
}

/* ─────────────────────────── tools ─────────────────────────── */

export function buildTools(ctx: ToolContext) {
  const snap = snapFactory(ctx);
  const { rec } = ctx;

  /** Wraps a tool: records the tool node, timing, errors; links it to the model call that requested it. */
  function traced<A extends Record<string, unknown>, R>(name: string, fn: (args: A, toolId: string) => Promise<R> | R) {
    return async (args: A, opts: { toolCallId: string }) => {
      const id = `tool:${opts.toolCallId}`;
      rec.add({ id, kind: "tool", label: name, sub: "running…", status: "running", detail: { args } });
      rec.link(rec.currentLlm ?? "q", id, "calls");
      rec.trace.stats.tool_calls++;
      const t = performance.now();
      try {
        const out = await fn(args, id);
        const json = JSON.stringify(out);
        rec.update(id, { status: "ok", sub: `${Math.round(performance.now() - t)}ms · ${json.length.toLocaleString("en-IN")} bytes`, detail: { args, output: out as unknown as Record<string, unknown> } });
        return out;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        rec.update(id, { status: "error", sub: message.slice(0, 80), detail: { args, error: message } });
        return { error: message };
      }
    };
  }

  return {
    get_overview: tool({
      description:
        "Headline status at an as-of date: phase, days left, target version, each goal (identified people, registrations, unique verified visitors, spend vs budget) with actual, goal, % of goal, required vs current daily rate, base projection and status; base and stretch projections; bottleneck; rule verdict counts. Call this first for 'are we on track' questions.",
      inputSchema: z.object({ as_of: asOfArg }),
      execute: traced("get_overview", ({ as_of }: { as_of?: string }, id) => {
        const s = snap(as_of);
        const t = targetVsActual(s);
        const base = projection(s);
        const stretch = projection(s, { mode: "stretch" });
        const bn = bottleneck(s);
        const rules = evaluateRules(s);
        rec.engine(id, "targetVsActual", t);
        rec.engine(id, "projection(base)", base);
        rec.engine(id, "projection(stretch)", stretch);
        const counts: Record<string, number> = {};
        for (const e of rules.value.evaluations) counts[e.verdict] = (counts[e.verdict] ?? 0) + 1;
        return {
          as_of: s.asOf,
          phase: s.phase,
          event_days: `${s.eventStartDay} to ${s.eventEndDay}`,
          days_to_event: s.daysToEvent,
          registration_days_left: s.regDaysLeft,
          target_version: t.value.target_version,
          goals: t.value.goals.map((g) => ({
            goal: g.key,
            actual: r4(g.actual),
            target: g.goal,
            pct_of_goal: r4(g.pct),
            gap: r4(g.gap),
            required_per_day: r1(g.required_per_day),
            current_per_day_7d: r1(g.current_per_day),
            projected: r1(g.projected),
            status: g.status,
          })),
          projection_base: { method: base.value.method, registrations: r1(base.value.registrations), visitors: r1(base.value.visitors), spend: Math.round(base.value.spend), capped_by_capacity: base.value.capped_by_capacity, notes: base.value.notes },
          projection_stretch: { registrations: r1(stretch.value.registrations), visitors: r1(stretch.value.visitors) },
          venue_capacity: s.capacity,
          attendance: (() => {
            const f = flows(s);
            const atStart = statusCounts(s, null, true);
            const regV = registeredVisitors(s);
            return {
              unique_verified_visitors: s.visitors.size,
              registered_visitors: regV,
              walk_ins: f.walk_ins,
              confirmed_at_event_start: atStart?.confirmed ?? null,
              show_up_rate: atStart ? r4(regV / Math.max(1, atStart.confirmed)) : null,
              show_up_definition: "registered verified visitors ÷ registrations confirmed at event start (null before the event)",
            };
          })(),
          bottleneck: bn.value.bottleneck ? { stage: bn.value.bottleneck.label, actual: r4(bn.value.bottleneck.actual), benchmark: r4(bn.value.bottleneck.benchmark), index: r4(bn.value.bottleneck.index) } : null,
          rule_verdicts: counts,
          projection_formula: base.formula,
          key_assumptions: base.assumptions.filter((a) => a.label !== "Dataset rule").map((a) => `${a.label}: ${a.text}`),
        };
      }),
    }),

    get_funnel: tool({
      description:
        "Funnel at an as-of date, overall or for one campaign. Anonymous layer (impressions → clicks → landing sessions → form starts; platform events, not people) and identified layer (identified → engaged → registered → confirmed → attended). Includes stage conversions and benchmarks, walk-ins and total unique verified visitors.",
      inputSchema: z.object({ as_of: asOfArg, campaign: z.string().optional().describe("Campaign id or name") }),
      execute: traced("get_funnel", ({ as_of, campaign }: { as_of?: string; campaign?: string }, id) => {
        const s = snap(as_of);
        let cid: string | null = null;
        if (campaign) {
          const m = resolveCampaign(ctx.ds, campaign);
          if (!m.match) return { error: `Ambiguous or unknown campaign "${campaign}"`, candidates: m.candidates };
          cid = m.match.campaign_id;
        }
        const f = funnel(s, { campaignId: cid });
        rec.engine(id, "funnel", f);
        const stage = (x: (typeof f.value.anonymous)[number]) => ({ stage: x.key, value: x.value, conversion_from_previous: r4(x.conversion), benchmark: x.benchmark, note: x.note });
        return {
          as_of: s.asOf,
          campaign: cid ?? "all",
          anonymous_layer: f.value.anonymous.map(stage),
          identified_layer: f.value.identified.map(stage),
          walk_ins: f.value.walk_ins,
          total_unique_verified_visitors: f.value.total_visitors,
          show_up_rate: (() => {
            const atStart = statusCounts(s, cid, true);
            return atStart ? r4(registeredVisitors(s, cid) / Math.max(1, atStart.confirmed)) : null;
          })(),
          show_up_definition: "registered verified visitors ÷ registrations confirmed AT EVENT START (not the final confirmed count)",
          summed_daily_reach_not_unique: f.value.reported_reach_sum,
        };
      }),
    }),

    list_campaigns: tool({
      description:
        "All campaigns with KPIs to the as-of date (spend, registrations, lifetime CPR, last-14-day CPR used by rules, CTR, confirm and cancel rates, visitors, show-up) and the rule verdict. Sort and filter optional.",
      inputSchema: z.object({
        as_of: asOfArg,
        status: z.enum(["planned", "active", "paused", "stopped", "completed"]).optional(),
        sort_by: z.enum(["registrations", "spend", "cpr_lifetime", "cpr_last_14_days", "visitors", "show_up_rate", "ctr"]).optional(),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: traced("list_campaigns", ({ as_of, status, sort_by, limit }: { as_of?: string; status?: string; sort_by?: string; limit?: number }, id) => {
        const s = snap(as_of);
        const k = campaignKpis(s);
        const rules = evaluateRules(s);
        rec.engine(id, "campaignKpis", k);
        rec.engine(id, "evaluateRules", rules);
        const v = new Map(rules.value.evaluations.map((e) => [e.campaign_id, e]));
        let rows = k.value
          .filter((c) => !status || c.status === status)
          .map((c) => ({
            id: c.campaign_id,
            name: c.campaign_name,
            channel: c.channel,
            owner: c.owner_name,
            status: c.status,
            spend: c.spend,
            registrations: c.registrations,
            cpr_lifetime: r4(c.cost_per_registration),
            cpr_last_14_days: r4(v.get(c.campaign_id)?.value ?? null),
            ctr: r4(c.ctr),
            confirm_rate: r4(c.confirm_rate),
            cancel_rate: r4(c.cancel_rate),
            visitors: c.visitors,
            show_up_rate: r4(c.show_up_rate),
            verdict: v.get(c.campaign_id)?.verdict ?? "insufficient_data",
          }));
        if (sort_by) rows = rows.sort((a, b) => ((b[sort_by as keyof typeof b] as number) ?? -Infinity) - ((a[sort_by as keyof typeof a] as number) ?? -Infinity));
        return { as_of: s.asOf, portfolio_cpr_last_14_days: r4(rules.value.portfolio_cpr), campaigns: rows.slice(0, limit ?? 20) };
      }),
    }),

    get_campaign: tool({
      description: "One campaign in depth (fuzzy match by id, name or channel): brief, KPIs, decision rule with thresholds and signals, forward rates. Returns candidates if the name is ambiguous.",
      inputSchema: z.object({ campaign: z.string(), as_of: asOfArg }),
      execute: traced("get_campaign", ({ campaign, as_of }: { campaign: string; as_of?: string }, id) => {
        const m = resolveCampaign(ctx.ds, campaign);
        if (!m.match) return { error: `Ambiguous or unknown campaign "${campaign}". Ask the user which one.`, candidates: m.candidates };
        const s = snap(as_of);
        const c = m.match;
        const k = campaignKpis(s);
        const rules = evaluateRules(s);
        rec.engine(id, "campaignKpis", k);
        rec.engine(id, "evaluateRules", rules);
        const e = rules.value.evaluations.find((x) => x.campaign_id === c.campaign_id)!;
        rec.rule(id, e);
        const kk = k.value.find((x) => x.campaign_id === c.campaign_id)!;
        const rate = campaignRates(s).find((x) => x.campaign_id === c.campaign_id);
        return {
          as_of: s.asOf,
          id: c.campaign_id,
          name: c.campaign_name,
          channel: c.channel,
          owner: c.owner_name,
          status: c.status,
          origin: c.origin,
          audience: c.target_audience,
          objective_plan_not_outcome: c.objective,
          kpis_lifetime_to_as_of: Object.fromEntries(Object.entries(kk).filter(([key]) => !["campaign_id", "campaign_name", "channel", "owner_name", "status"].includes(key)).map(([key, val]) => [key === "cost_per_registration" ? "cpr_lifetime" : key, typeof val === "number" ? r4(val) : val])),
          rule: { verdict: e.verdict, reason: e.reason, metric: e.metric, [e.metric === "cost_per_registration" ? "cpr_last_14_days" : `${e.metric}_window`]: r4(e.value), scale_if: r4(e.thresholds.scale_if), stop_if: r4(e.thresholds.stop_if), basis: e.thresholds.basis, window: e.window, sample: e.sample, signals: e.signals.map((x) => ({ ...x, value: r4(x.value) })) },
          forward: rate ? { registrations_per_day_7d: r4(rate.reg_rate_7d), spend_per_day_7d: r4(rate.spend_rate_7d), best_7d_registrations_per_day: r4(rate.best_reg_rate_7d), marginal_cpr_14d: r4(rate.marginal_cpr) } : null,
        };
      }),
    }),

    compare_campaigns: tool({
      description: "Side-by-side KPIs for two or more campaigns (ids or names).",
      inputSchema: z.object({ campaigns: z.array(z.string()).min(2).max(7), as_of: asOfArg }),
      execute: traced("compare_campaigns", ({ campaigns, as_of }: { campaigns: string[]; as_of?: string }, id) => {
        const s = snap(as_of);
        const k = campaignKpis(s);
        const rules = evaluateRules(s);
        rec.engine(id, "campaignKpis", k);
        const v = new Map(rules.value.evaluations.map((e) => [e.campaign_id, e]));
        const out = [];
        const unresolved = [];
        for (const q of campaigns) {
          const m = resolveCampaign(ctx.ds, q);
          if (!m.match) {
            unresolved.push({ query: q, candidates: m.candidates });
            continue;
          }
          const c = k.value.find((x) => x.campaign_id === m.match!.campaign_id)!;
          out.push({ id: c.campaign_id, name: c.campaign_name, spend: c.spend, registrations: c.registrations, cpr_lifetime: r4(c.cost_per_registration), cpr_last_14_days: r4(v.get(c.campaign_id)?.value ?? null), ctr: r4(c.ctr), session_to_start: r4(c.session_to_start), confirm_rate: r4(c.confirm_rate), cancel_rate: r4(c.cancel_rate), visitors: c.visitors, show_up_rate: r4(c.show_up_rate), cost_per_visitor: r4(c.cost_per_visitor), verdict: v.get(c.campaign_id)?.verdict });
        }
        return { as_of: s.asOf, campaigns: out, unresolved };
      }),
    }),

    get_bottleneck: tool({
      description: "Stage-by-stage conversion vs labelled benchmarks (index = actual ÷ benchmark) and the bottleneck stage with its weakest campaigns.",
      inputSchema: z.object({ as_of: asOfArg }),
      execute: traced("get_bottleneck", ({ as_of }: { as_of?: string }, id) => {
        const s = snap(as_of);
        const b = bottleneck(s);
        rec.engine(id, "bottleneck", b);
        return {
          as_of: s.asOf,
          bottleneck: b.value.bottleneck?.label ?? null,
          stages: b.value.stages.map((x) => ({ stage: x.label, actual: r4(x.actual), benchmark: r4(x.benchmark), benchmark_source: `${x.benchmark_source.label}: ${x.benchmark_source.text}`, index: r4(x.index), n: x.denominator, enough_sample: x.sufficient_sample, weakest_campaigns: x.worst_campaigns.map((w) => ({ id: w.campaign_id, name: w.campaign_name, rate: r4(w.rate) })) })),
          method: b.formula,
        };
      }),
    }),

    get_trends: tool({
      description: "Window-over-window change of a metric (default 7 days vs the previous 7) with each campaign's change and contribution share. Shows association, not causation.",
      inputSchema: z.object({ metric: z.enum(TREND_METRICS), window_days: z.number().int().min(1).max(42).optional(), as_of: asOfArg }),
      execute: traced("get_trends", ({ metric, window_days, as_of }: { metric: (typeof TREND_METRICS)[number]; window_days?: number; as_of?: string }, id) => {
        const s = snap(as_of);
        const t = trend(s, metric, window_days ?? 7);
        rec.engine(id, `trend(${metric})`, t);
        return {
          as_of: s.asOf,
          metric,
          current: { ...t.value.current, value: r4(t.value.current.value) },
          previous: { ...t.value.previous, value: r4(t.value.previous.value) },
          change: r4(t.value.change),
          change_pct: r4(t.value.change_pct),
          by_campaign: t.value.by_campaign.map((c) => ({ id: c.campaign_id, name: c.campaign_name, current: r4(c.current), previous: r4(c.previous), change: r4(c.change), contribution: r4(c.contribution) })),
        };
      }),
    }),

    get_daily_series: tool({
      description: "Daily values of an additive metric (registrations, identified, spend, clicks, impressions, sessions, registration_starts, visitors) for a date range, overall or one campaign. Use for questions about specific days or weeks.",
      inputSchema: z.object({
        metric: z.enum(["registrations", "identified", "spend", "clicks", "impressions", "sessions", "registration_starts", "visitors"]),
        campaign: z.string().optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
      execute: traced("get_daily_series", ({ metric, campaign, from, to }: { metric: SeriesMetric; campaign?: string; from?: string; to?: string }) => {
        const s = snap(to && to < ctx.asOf ? to : undefined);
        let cid: string | null = null;
        if (campaign) {
          const m = resolveCampaign(ctx.ds, campaign);
          if (!m.match) return { error: `Unknown campaign "${campaign}"`, candidates: m.candidates };
          cid = m.match.campaign_id;
        }
        const pts = series(s, metric, { campaignId: cid, from: from ?? addDays(s.asOf, -27) });
        const total = pts.reduce((a, p) => a + p.value, 0);
        return { metric, campaign: cid ?? "all", from: pts[0]?.day ?? null, to: pts.at(-1)?.day ?? null, total, days: pts.length > 70 ? `${pts.length} days (showing last 70)` : pts.length, points: pts.slice(-70) };
      }),
    }),

    get_rule_evaluations: tool({
      description: "Scale / keep / change / stop / insufficient_data verdict for every campaign with the metric value, thresholds (relative to portfolio or custom), sample size and reason.",
      inputSchema: z.object({ as_of: asOfArg }),
      execute: traced("get_rule_evaluations", ({ as_of }: { as_of?: string }, id) => {
        const s = snap(as_of);
        const r = evaluateRules(s);
        const eid = rec.engine(id, "evaluateRules", r);
        for (const e of r.value.evaluations) rec.rule(eid, e);
        return {
          as_of: s.asOf,
          portfolio_cpr_last_14_days: r4(r.value.portfolio_cpr),
          method: r.formula,
          evaluations: r.value.evaluations.map((e) => ({ id: e.campaign_id, name: e.campaign_name, owner: e.owner_name, verdict: e.verdict, reason: e.reason, metric_value_last_window: r4(e.value), scale_if: r4(e.thresholds.scale_if), stop_if: r4(e.thresholds.stop_if), basis: e.thresholds.basis, sample: e.sample, weak_signals: e.signals.filter((x) => x.weak).map((x) => x.key) })),
        };
      }),
    }),

    suggest_reallocation: tool({
      description: "Budget moves from stop/change campaigns (and unallocated budget) to scale campaigns, with the projected effect on registrations and visitors. Only meaningful before the event.",
      inputSchema: z.object({ as_of: asOfArg, budget_to_move: z.number().positive().optional() }),
      execute: traced("suggest_reallocation", ({ as_of, budget_to_move }: { as_of?: string; budget_to_move?: number }, id) => {
        const s = snap(as_of);
        const r = reallocation(s, { budgetToMove: budget_to_move });
        rec.engine(id, "reallocation", r);
        return {
          as_of: s.asOf,
          reason: r.value.reason,
          budget_left: r.value.budget_left,
          planned_future_spend: Math.round(r.value.planned_future_spend),
          unallocated: Math.round(r.value.headroom),
          total_moved: r.value.moves.reduce((a, m) => a + m.amount, 0),
          moves: r.value.moves.map((m) => ({ from: m.from_name, from_id: m.from, to: m.to_name, to_id: m.to, amount: m.amount })),
          effect: r.value.effect ? { registrations: r1(r.value.effect.delta.registrations), visitors: r1(r.value.effect.delta.visitors), spend: Math.round(r.value.effect.delta.spend) } : null,
          method: r.formula,
        };
      }),
    }),

    run_scenario: tool({
      description:
        "What-if projection. Changes: shift_budget{from,to,amount}, add_budget{to,amount}, scale_campaign{campaign_id,factor}, stop_campaign{campaign_id}, set_show_up_rate{value 0-1}, set_walk_in_share{value}, set_capacity{value}. Use campaign ids (C01…). Returns base, scenario and delta.",
      inputSchema: z.object({ changes: ScenarioChanges, mode: z.enum(["base", "stretch"]).optional(), as_of: asOfArg }),
      execute: traced("run_scenario", ({ changes, mode, as_of }: { changes: z.infer<typeof ScenarioChanges>; mode?: "base" | "stretch"; as_of?: string }, id) => {
        const s = snap(as_of);
        const r = scenario(s, changes, mode ?? "base");
        rec.engine(id, "scenario", r);
        const v = r.value;
        return {
          as_of: s.asOf,
          base: { registrations: r1(v.base.registrations), visitors: r1(v.base.visitors), spend: Math.round(v.base.spend) },
          scenario: { registrations: r1(v.scenario.registrations), visitors: r1(v.scenario.visitors), spend: Math.round(v.scenario.spend), capped_by_capacity: v.scenario.capped_by_capacity },
          delta: { registrations: r1(v.delta.registrations), visitors: r1(v.delta.visitors), spend: Math.round(v.delta.spend) },
          notes: v.scenario.notes,
          assumptions: r.assumptions.filter((a) => a.label !== "Dataset rule").map((a) => `${a.label}: ${a.text}`),
        };
      }),
    }),

    list_tasks: tool({
      description: "Tasks with owner, due date, status, priority and campaign. 'Overdue' is relative to the as-of date.",
      inputSchema: z.object({ status: z.enum(["todo", "doing", "done", "blocked"]).optional(), owner: z.string().optional(), overdue: z.boolean().optional(), campaign: z.string().optional() }),
      execute: traced("list_tasks", ({ status, owner, overdue, campaign }: { status?: string; owner?: string; overdue?: boolean; campaign?: string }, id) => {
        const tasks = ctx.ds.tasks ?? [];
        rec.source(id, { collection: "tasks", records: tasks.length, filter: "all" });
        const cid = campaign ? resolveCampaign(ctx.ds, campaign).match?.campaign_id ?? "__none__" : null;
        const rows = tasks
          .filter((t) => (!status || t.status === status) && (!owner || t.owner_name.toLowerCase().includes(owner.toLowerCase())) && (!cid || t.campaign_id === cid))
          .map((t) => ({ id: t.task_id, title: t.title, owner: t.owner_name, due: t.due_date, status: t.status, priority: t.priority, campaign: t.campaign_id, created_by: t.created_by, overdue: t.status !== "done" && t.due_date < ctx.asOf }))
          .filter((t) => overdue === undefined || t.overdue === overdue);
        return { as_of: ctx.asOf, count: rows.length, tasks: rows.slice(0, 40) };
      }),
    }),

    get_activity: tool({
      description: "Recent changes from the append-only activity log (who changed what, when). 'since' is a real timestamp/date (ISO), not the as-of date.",
      inputSchema: z.object({ since: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }),
      execute: traced("get_activity", async ({ since, limit }: { since?: string; limit?: number }, id) => {
        const db = await getDb();
        const q = since && !Number.isNaN(Date.parse(since)) ? { at: { $gte: new Date(since) } } : {};
        const rows = await db.collection("activity").find(q, { projection: { _id: 0, before: 0, after: 0 } }).sort({ at: -1 }).limit(limit ?? 20).toArray();
        rec.source(id, { collection: "activity", records: rows.length, filter: since ? `at ≥ ${since}` : "latest" });
        return { now: new Date().toISOString(), count: rows.length, changes: rows.map((r) => ({ at: (r.at as Date).toISOString(), actor: r.actor, action: r.action, entity: r.entity, id: r.entity_id, summary: r.summary })) };
      }),
    }),

    get_data_coverage: tool({
      description: "What the data contains and does NOT contain: date range, collections and record counts, duplicates removed, exclusions, available fields and a list of things not in the data. Call before saying the data cannot answer.",
      inputSchema: z.object({}),
      execute: traced("get_data_coverage", (_a: Record<string, never>, id) => {
        const s = snap();
        const c = dataCoverage(ctx.ds, s);
        rec.engine(id, "dataCoverage", c);
        return c.value;
      }),
    }),

    calculate: tool({
      description: "Exact arithmetic (mathjs). Use for every calculation not already returned by another tool. Pass numbers from tool results as variables.",
      inputSchema: z.object({ expression: z.string().max(300), variables: z.record(z.string(), z.number()).optional() }),
      execute: traced("calculate", ({ expression, variables }: { expression: string; variables?: Record<string, number> }, id) => {
        const value = mathEval(expression, { ...(variables ?? {}) });
        const num = typeof value === "number" ? value : Number(value?.toString?.());
        if (!Number.isFinite(num)) throw new Error(`Expression did not produce a finite number: ${String(value)}`);
        rec.add({ id: `${id}:calc`, kind: "engine", label: "mathjs.evaluate", sub: `${expression} = ${r4(num)}`, status: "ok", detail: { expression, variables, value: num } });
        rec.link(id, `${id}:calc`, "computed_by");
        return { expression, variables: variables ?? {}, value: r4(num) };
      }),
    }),

    propose_task: tool({
      description:
        "Propose a task for the user to confirm. This does NOT create anything. The UI shows a confirmation card, and only the user's click saves it. Use an owner from the data (campaign owners) when possible and a due date in YYYY-MM-DD.",
      inputSchema: z.object({
        title: z.string().min(3).max(140),
        owner_name: z.string().min(2),
        due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        priority: z.enum(["P0", "P1", "P2"]).default("P1"),
        campaign: z.string().optional().describe("Campaign id or name"),
        description: z.string().max(1000).optional(),
        rationale: z.string().max(600).describe("The data-backed reason, quoted on the card and stored as source_insight"),
      }),
      execute: traced("propose_task", (a: { title: string; owner_name: string; due_date: string; priority: "P0" | "P1" | "P2"; campaign?: string; description?: string; rationale: string }, id) => {
        const cid = a.campaign ? resolveCampaign(ctx.ds, a.campaign).match?.campaign_id ?? null : null;
        const draft = { title: a.title, owner_name: a.owner_name, due_date: a.due_date, priority: a.priority, campaign_id: cid, description: a.description ?? "", source_insight: a.rationale, status: "todo" as const };
        const v = TaskCreate.safeParse(draft);
        const pid = rec.add({ id: `prop:${id}`, kind: "proposal", label: `Task: ${a.title}`, sub: "awaiting confirmation", status: "pending", detail: draft });
        rec.link(id, pid, "proposes");
        return { proposal_id: pid, kind: "task", status: "awaiting_user_confirmation", draft, valid: v.success, issues: v.success ? [] : v.error.issues.map((i) => `${i.path.join(".")} ${i.message}`) };
      }),
    }),

    propose_campaign_update: tool({
      description: "Propose a campaign change (e.g. pause/stop, budget, thresholds) for the user to confirm. Does NOT change anything until the user confirms.",
      inputSchema: z.object({
        campaign: z.string(),
        patch: z.object({
          status: z.enum(["planned", "active", "paused", "stopped", "completed"]).optional(),
          budget_planned_inr: z.number().int().nonnegative().optional(),
          hypothesis: z.string().max(600).optional(),
          thresholds: z.object({ scale_if: z.number(), stop_if: z.number(), min_sample: z.number().int().optional(), window_days: z.number().int().optional() }).optional(),
        }),
        rationale: z.string().max(600),
      }),
      execute: traced("propose_campaign_update", (a: { campaign: string; patch: Record<string, unknown>; rationale: string }, id) => {
        const m = resolveCampaign(ctx.ds, a.campaign);
        if (!m.match) return { error: `Unknown or ambiguous campaign "${a.campaign}"`, candidates: m.candidates };
        const v = CampaignPatch.safeParse(a.patch);
        const before = Object.fromEntries(Object.keys(a.patch).map((k) => [k, (m.match as unknown as Record<string, unknown>)[k] ?? null]));
        const pid = rec.add({ id: `prop:${id}`, kind: "proposal", label: `Update ${m.match.campaign_id}: ${Object.keys(a.patch).join(", ")}`, sub: "awaiting confirmation", status: "pending", detail: { patch: a.patch, before } });
        rec.link(id, pid, "proposes");
        return { proposal_id: pid, kind: "campaign_update", status: "awaiting_user_confirmation", campaign_id: m.match.campaign_id, campaign_name: m.match.campaign_name, before, patch: a.patch, rationale: a.rationale, valid: v.success, issues: v.success ? [] : v.error.issues.map((i) => `${i.path.join(".")} ${i.message}`) };
      }),
    }),
  };
}

export type CopilotTools = ReturnType<typeof buildTools>;
