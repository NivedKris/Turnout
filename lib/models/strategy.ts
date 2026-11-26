import { z } from "zod";
import { DayKey, Origin } from "./source";

/**
 * Strategy layer: the plan (goal model), the bets that execute it, the early
 * signals that judge them, and the decisions taken. Ties the brief's three slides
 * (ambition, bets, adaptation) to live data.
 */

export const Provenance = z.object({ label: z.enum(["Sourced", "Assumption", "Derived"]), source: z.string().max(300).optional(), url: z.string().url().optional() });

export const Segment = z.object({
  key: z.string().min(1).max(40),
  name: z.string().min(2).max(80),
  /** People in the segment. */
  population: z.number().int().nonnegative(),
  /** Share of the segment our channels can reach. */
  reach_rate: z.number().min(0).max(1),
  /** Reached → identified (gave a name/contact). */
  identify_rate: z.number().min(0).max(1),
  /** Identified → registered. */
  register_rate: z.number().min(0).max(1),
  provenance: Provenance,
  note: z.string().max(300).optional(),
});
export type Segment = z.infer<typeof Segment>;

export const GoalModelDoc = z.object({
  _id: z.literal("goal_model"),
  name: z.string(),
  segments: z.array(Segment).min(1).max(12),
  /** Registered → confirmed. */
  confirm_rate: z.number().min(0).max(1),
  show_up_rate: z.number().min(0).max(1),
  walk_in_share: z.number().min(0).max(0.5),
  /** Stretch multipliers applied to reach and register rates. */
  stretch_reach_multiplier: z.number().min(1).max(3),
  stretch_register_multiplier: z.number().min(1).max(2),
  stretch_show_up_rate: z.number().min(0).max(1),
  rates_provenance: z.record(z.string(), Provenance),
  updated_at: z.date(),
  origin: Origin,
});
export type GoalModelDoc = z.infer<typeof GoalModelDoc>;

export const SignalMetric = z.enum(["cost_per_registration", "registrations_per_day", "ctr", "session_to_start", "confirm_rate", "cancel_rate", "show_up_rate", "cost_per_visitor"]);
export type SignalMetric = z.infer<typeof SignalMetric>;

export const Signal = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(2).max(80),
  metric: SignalMetric,
  window_days: z.number().int().min(3).max(42).default(14),
  direction: z.enum(["lower_is_better", "higher_is_better"]),
  /** Scale (or "healthy") threshold. */
  scale_if: z.number(),
  /** Stop (or "failing") threshold. */
  stop_if: z.number(),
  min_sample: z.number().int().min(0).default(15),
});
export type Signal = z.infer<typeof Signal>;

export const BetStatus = z.enum(["proposed", "testing", "scaling", "paused", "killed", "done"]);

export const BetDoc = z.object({
  bet_id: z.string().min(1),
  rank: z.number().int().min(1).max(50),
  title: z.string().min(3).max(100),
  hypothesis: z.string().max(800),
  /** Why it could work, short. */
  rationale: z.string().max(800).default(""),
  campaign_ids: z.array(z.string()).max(10),
  owner_name: z.string().min(2).max(60),
  budget_inr: z.number().int().nonnegative(),
  start_day: DayKey,
  end_day: DayKey,
  /** Expected incremental unique visitors if the bet works (plan). */
  expected_visitors: z.number().int().nonnegative(),
  rice: z.object({ reach: z.number().nonnegative(), impact: z.number().positive().max(3), confidence: z.number().min(0).max(1), effort: z.number().positive() }),
  status: BetStatus,
  signals: z.array(Signal).max(6),
  risks: z.string().max(600).default(""),
  provenance: Provenance,
  origin: Origin,
  created_at: z.date(),
  updated_at: z.date(),
});
export type BetDoc = z.infer<typeof BetDoc>;

export const DecisionKind = z.enum(["scale", "keep", "change", "stop", "pause", "launch"]);

export const DecisionDoc = z.object({
  decision_id: z.string().min(1),
  bet_id: z.string().nullable(),
  campaign_id: z.string().nullable(),
  decision: DecisionKind,
  title: z.string().min(3).max(140),
  rationale: z.string().max(1000),
  /** The data date the decision was taken on. Outcomes compare before vs after this day. */
  as_of: DayKey,
  /** Metric used to judge the outcome. */
  outcome_metric: SignalMetric,
  /** Evidence frozen at decision time (signal values etc.). */
  evidence: z.record(z.string(), z.union([z.number(), z.string(), z.null()])),
  actor: z.enum(["user", "copilot", "seed"]),
  origin: Origin,
  decided_at: z.date(),
});
export type DecisionDoc = z.infer<typeof DecisionDoc>;

/* Inputs */
export const BetInput = BetDoc.omit({ bet_id: true, created_at: true, updated_at: true, origin: true, provenance: true }).extend({
  provenance: Provenance.default({ label: "Assumption" }),
});
export const BetPatch = BetInput.partial();
export const DecisionInput = DecisionDoc.omit({ decision_id: true, decided_at: true, actor: true, origin: true, evidence: true }).extend({
  evidence: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).default({}),
});
export const GoalModelPatch = GoalModelDoc.omit({ _id: true, updated_at: true, origin: true }).partial();
