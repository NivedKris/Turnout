import { z } from "zod";

/**
 * Schemas for the source tables of the RISA attendee dataset, plus records the
 * app adds later. Field names stay exactly as in the dataset (snake_case) so
 * the field guide, the engine and the copilot all use one vocabulary.
 *
 * Time model:
 *  - Timestamps are real UTC instants (`Date`). The source gives IST wall-clock
 *    values, converted once at import.
 *  - Day fields (`activity_date`, `history_start`, …) are IST calendar days as
 *    "YYYY-MM-DD" strings, never Dates, so they can't drift by timezone.
 *
 * Duplicates are kept on purpose: the live collections hold the source rows as
 * delivered (including import-retry copies). The analytics engine deduplicates
 * by stable source ID, so the rules stay visible and testable.
 */

export const Origin = z.enum(["dataset", "user", "simulated", "copilot"]);
export type Origin = z.infer<typeof Origin>;

export const DayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const meta = {
  origin: Origin,
  /** 1-based row number in the source sheet (dataset rows only). */
  row_no: z.number().int().positive().nullable().default(null),
};

const id = z.string().min(1);
const optId = id.nullable();

export const EventDoc = z.object({
  event_name: z.string(),
  history_start: DayKey,
  history_end: DayKey,
  event_starts_at: z.date(),
  event_ends_at: z.date(),
  timezone: z.literal("Asia/Kolkata"),
  currency: z.literal("INR"),
  fictional: z.boolean(),
  ...meta,
});

export const TargetDoc = z.object({
  effective_at: z.date(),
  identified_external_people_goal: z.number().int().nonnegative(),
  registration_goal: z.number().int().nonnegative(),
  unique_external_visitors_goal: z.number().int().nonnegative(),
  marketing_budget_inr: z.number().int().nonnegative(),
  target_version: z.string(),
  ...meta,
});

export const CampaignStatus = z.enum(["planned", "active", "paused", "stopped", "completed"]);

export const CampaignDoc = z.object({
  campaign_id: id,
  campaign_name: z.string().min(1),
  channel: z.string().min(1),
  target_audience: z.string(),
  objective: z.string(),
  owner_id: id,
  owner_name: z.string(),
  created_at: z.date(),
  planned_start_at: z.date(),
  planned_end_at: z.date(),
  // App-managed fields (not in the source). Defaults are set at import.
  status: CampaignStatus.default("active"),
  /** Planned budget for the campaign. null = not set (the source has no per-campaign budget). */
  budget_planned_inr: z.number().int().nonnegative().nullable().default(null),
  hypothesis: z.string().default(""),
  ...meta,
});

export const CampaignDailyDoc = z.object({
  activity_id: id,
  campaign_id: id,
  campaign_name: z.string(),
  owner_id: id,
  owner_name: z.string(),
  activity_date: DayKey,
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  reported_reach: z.number().int().nonnegative(),
  landing_page_sessions: z.number().int().nonnegative(),
  registration_starts: z.number().int().nonnegative(),
  /** Net posted ledger amount; negative = vendor credit. */
  marketing_spend_inr: z.number().int(),
  platform: z.string(),
  ...meta,
});

export const PersonType = z.enum(["external", "internal", "staff", "test"]);
export const FirstTouch = z.enum(["campaign", "internal_registration", "walk_in", "event_access"]);

export const PersonDoc = z.object({
  person_id: id,
  person_name: z.string(),
  person_type: PersonType,
  first_seen_at: z.date(),
  first_touch_source: FirstTouch,
  first_campaign_id: optId,
  first_campaign_name: z.string().nullable(),
  owner_id: id,
  owner_name: z.string(),
  ...meta,
});

export const InteractionType = z.enum([
  "page_visit",
  "brochure_download",
  "registration_start",
  "event_question_submitted",
  "nurture_email_sent",
  "nurture_email_opened",
  "nurture_email_clicked",
  "opted_out",
]);

export const InteractionDoc = z.object({
  interaction_id: id,
  person_id: id,
  person_name: z.string(),
  campaign_id: id,
  campaign_name: z.string(),
  owner_id: id,
  owner_name: z.string(),
  occurred_at: z.date(),
  event_type: InteractionType,
  detail: z.string(),
  ...meta,
});

export const RegistrationDoc = z.object({
  registration_id: id,
  person_id: id,
  person_name: z.string(),
  campaign_id: id,
  campaign_name: z.string(),
  owner_id: id,
  owner_name: z.string(),
  registered_at: z.date(),
  ...meta,
});

export const RegistrationStatus = z.enum(["interested", "confirmed", "cancelled", "waitlisted"]);

export const RegistrationHistoryDoc = z.object({
  history_id: id,
  registration_id: id,
  person_id: id,
  person_name: z.string(),
  campaign_id: id,
  campaign_name: z.string(),
  owner_id: id,
  owner_name: z.string(),
  effective_at: z.date(),
  status: RegistrationStatus,
  ...meta,
});

export const CheckinDoc = z.object({
  event_id: id,
  person_id: id,
  person_name: z.string(),
  registration_id: optId,
  campaign_id: optId,
  campaign_name: z.string().nullable(),
  owner_id: id,
  owner_name: z.string(),
  occurred_at: z.date(),
  result: z.enum(["admitted", "denied", "pending"]),
  verification: z.enum(["verified", "unverified"]),
  source: z.enum(["scanner", "manual"]),
  ...meta,
});

export const FieldGuideDoc = z.object({
  source_table: z.string(),
  field: z.string(),
  data_type: z.string(),
  meaning: z.string(),
});

export const ReadmeDoc = z.object({ topic: z.string(), description: z.string() });

export type EventDoc = z.infer<typeof EventDoc>;
export type TargetDoc = z.infer<typeof TargetDoc>;
export type CampaignDoc = z.infer<typeof CampaignDoc>;
export type CampaignDailyDoc = z.infer<typeof CampaignDailyDoc>;
export type PersonDoc = z.infer<typeof PersonDoc>;
export type InteractionDoc = z.infer<typeof InteractionDoc>;
export type RegistrationDoc = z.infer<typeof RegistrationDoc>;
export type RegistrationHistoryDoc = z.infer<typeof RegistrationHistoryDoc>;
export type CheckinDoc = z.infer<typeof CheckinDoc>;
export type FieldGuideDoc = z.infer<typeof FieldGuideDoc>;
export type ReadmeDoc = z.infer<typeof ReadmeDoc>;
