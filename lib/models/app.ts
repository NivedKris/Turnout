import { z } from "zod";
import { DayKey, Origin } from "./source";

/** App-owned records: settings, tasks and the append-only activity log. */

export const SettingsDoc = z.object({
  _id: z.literal("settings"),
  city: z.string(),
  festival_name: z.string(),
  /** Venue capacity for unique verified visitors across the event. Assumption, editable. */
  venue_capacity: z.number().int().positive(),
  /** Default as-of day when the UI has no explicit selection. */
  default_as_of: DayKey,
  assumptions: z.array(
    z.object({ key: z.string(), text: z.string(), label: z.enum(["Sourced", "Assumption"]), url: z.string().optional() }),
  ),
});
export type SettingsDoc = z.infer<typeof SettingsDoc>;

export const TaskStatus = z.enum(["todo", "doing", "done", "blocked"]);
export const TaskPriority = z.enum(["P0", "P1", "P2"]);

export const TaskDoc = z.object({
  task_id: z.string().min(1),
  title: z.string().min(3).max(140),
  description: z.string().max(2000).default(""),
  campaign_id: z.string().nullable().default(null),
  owner_id: z.string().min(1),
  owner_name: z.string().min(1),
  due_date: DayKey,
  status: TaskStatus.default("todo"),
  priority: TaskPriority.default("P1"),
  created_by: z.enum(["user", "copilot", "seed"]),
  /** The insight that produced this task (e.g. a rule verdict or copilot answer). */
  source_insight: z.string().max(1000).nullable().default(null),
  origin: Origin,
  created_at: z.date(),
  updated_at: z.date(),
});
export type TaskDoc = z.infer<typeof TaskDoc>;

export const ActivityDoc = z.object({
  entity: z.string(),
  entity_id: z.string(),
  action: z.enum(["create", "update", "delete", "reset", "seed"]),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  actor: z.enum(["user", "copilot", "system"]),
  summary: z.string(),
  at: z.date(),
});
export type ActivityDoc = z.infer<typeof ActivityDoc>;
