import { z } from "zod";

/** What-if changes accepted by the planner, the REST API and the copilot. */
export const ScenarioChange = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("shift_budget"), from: z.string(), to: z.string(), amount: z.number().positive() }),
  z.object({ kind: z.literal("add_budget"), to: z.string(), amount: z.number().positive() }),
  z.object({ kind: z.literal("scale_campaign"), campaign_id: z.string(), factor: z.number().min(0).max(5) }),
  z.object({ kind: z.literal("stop_campaign"), campaign_id: z.string() }),
  z.object({ kind: z.literal("set_show_up_rate"), value: z.number().min(0).max(1) }),
  z.object({ kind: z.literal("set_walk_in_share"), value: z.number().min(0).max(0.9) }),
  z.object({ kind: z.literal("set_capacity"), value: z.number().int().positive() }),
]);
export const ScenarioChanges = z.array(ScenarioChange).max(20);
