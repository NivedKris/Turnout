import { z } from "zod";
import { CampaignStatus, DayKey } from "./source";
import { TaskPriority, TaskStatus } from "./app";

/**
 * Input schemas shared by forms, Server Actions, REST routes and copilot proposals.
 * Coercion keeps FormData strings working.
 */

const money = z.coerce.number().int();
const count = z.coerce.number().int().nonnegative();
const optText = (max: number) => z.string().trim().max(max).optional().default("");

export const Thresholds = z
  .object({
    metric: z.enum(["cost_per_registration", "ctr", "session_to_start", "confirm_rate"]).optional(),
    scale_if: z.coerce.number().nonnegative().optional(),
    stop_if: z.coerce.number().nonnegative().optional(),
    min_sample: z.coerce.number().int().positive().optional(),
    window_days: z.coerce.number().int().min(3).max(42).optional(),
  })
  .refine((t) => (t.scale_if === undefined) === (t.stop_if === undefined), { message: "Set both scale and stop thresholds, or neither" });

export const Rice = z.object({
  reach: z.coerce.number().nonnegative(),
  impact: z.coerce.number().positive().max(3),
  confidence: z.coerce.number().min(0).max(1),
  effort: z.coerce.number().positive(),
});

export const CampaignCreate = z
  .object({
    campaign_name: z.string().trim().min(2).max(80),
    channel: z.string().trim().min(2).max(40),
    target_audience: optText(300),
    objective: optText(300),
    owner_name: z.string().trim().min(2).max(60),
    status: CampaignStatus.default("planned"),
    planned_start: DayKey,
    planned_end: DayKey,
    budget_planned_inr: z.coerce.number().int().nonnegative().nullable().optional(),
    hypothesis: optText(600),
    thresholds: Thresholds.nullable().optional(),
    rice: Rice.nullable().optional(),
  })
  .refine((c) => c.planned_end >= c.planned_start, { message: "End date must be on or after start date", path: ["planned_end"] });
export type CampaignCreate = z.infer<typeof CampaignCreate>;

export const CampaignPatch = z
  .object({
    campaign_name: z.string().trim().min(2).max(80),
    channel: z.string().trim().min(2).max(40),
    target_audience: z.string().trim().max(300),
    objective: z.string().trim().max(300),
    owner_name: z.string().trim().min(2).max(60),
    status: CampaignStatus,
    planned_start: DayKey,
    planned_end: DayKey,
    budget_planned_inr: z.coerce.number().int().nonnegative().nullable(),
    hypothesis: z.string().trim().max(600),
    thresholds: Thresholds.nullable(),
    rice: Rice.nullable(),
  })
  .partial();
export type CampaignPatch = z.infer<typeof CampaignPatch>;

export const DailyMetricsInput = z.object({
  campaign_id: z.string().min(1),
  activity_date: DayKey,
  impressions: count.default(0),
  clicks: count.default(0),
  reported_reach: count.default(0),
  landing_page_sessions: count.default(0),
  registration_starts: count.default(0),
  marketing_spend_inr: money.default(0),
  platform: z.string().trim().max(60).default("manual entry"),
});
export type DailyMetricsInput = z.infer<typeof DailyMetricsInput>;

export const DailyPatch = DailyMetricsInput.omit({ campaign_id: true, activity_date: true }).partial();

export const TaskCreate = z.object({
  title: z.string().trim().min(3).max(140),
  description: optText(2000),
  campaign_id: z
    .string()
    .trim()
    .transform((v) => v || null)
    .nullable()
    .optional(),
  owner_name: z.string().trim().min(2).max(60),
  due_date: DayKey,
  status: TaskStatus.default("todo"),
  priority: TaskPriority.default("P1"),
  source_insight: z.string().trim().max(1000).nullable().optional(),
});
export type TaskCreate = z.infer<typeof TaskCreate>;

export const TaskPatch = z
  .object({
    title: z.string().trim().min(3).max(140),
    description: z.string().trim().max(2000),
    campaign_id: z.string().trim().nullable(),
    owner_name: z.string().trim().min(2).max(60),
    due_date: DayKey,
    status: TaskStatus,
    priority: TaskPriority,
  })
  .partial();
export type TaskPatch = z.infer<typeof TaskPatch>;

export const TargetCreate = z.object({
  effective_day: DayKey,
  identified_external_people_goal: count,
  registration_goal: count,
  unique_external_visitors_goal: count,
  marketing_budget_inr: count,
  target_version: z.string().trim().min(2).max(60),
});
export type TargetCreate = z.infer<typeof TargetCreate>;

export const SettingsPatch = z
  .object({
    venue_capacity: z.coerce.number().int().positive().max(1_000_000),
    default_as_of: DayKey,
  })
  .partial();
export type SettingsPatch = z.infer<typeof SettingsPatch>;

export type Actor = "user" | "copilot";
