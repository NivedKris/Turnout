import { RULES } from "./benchmarks";
import type { Snapshot } from "./snapshot";
import type { Dataset, Result } from "./types";

/**
 * What the data can and cannot answer. The copilot calls this before saying
 * "the data doesn't contain that", so refusals are grounded, not guessed.
 */
export const NOT_IN_DATA = [
  "Demographics (age, gender, year of study, college or course of a person)",
  "Ticket prices, revenue or any paid-ticket data (the event is treated as free)",
  "Sponsorship deals or sponsor cash (Challenge B data)",
  "Ad creatives, ad sets, keywords, placements or audiences inside a platform",
  "Unique reach across days (daily reach cannot be summed into unique people)",
  "Any data before 15 Jan 2025 or after 20 Apr 2025, including previous editions",
  "Venue capacity (the app uses an editable assumption)",
  "City or venue location (the fictional event names none)",
  "Per-campaign budgets or cost targets (only total approved budget)",
  "Satisfaction, NPS, feedback or post-event surveys",
  "Email content, subject lines or A/B test variants",
  "Competitor events, weather or external factors",
];

export function dataCoverage(ds: Dataset, s: Snapshot): Result<{
  window: { history_start: string; history_end: string; as_of: string };
  collections: { name: string; records: number; deduplicated: number; by_origin: Record<string, number> }[];
  excluded: Snapshot["quality"];
  fields: Record<string, string[]>;
  not_in_data: string[];
  attribution_note: string;
}> {
  const originOf = (rows: readonly { origin?: string }[]) => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.origin ?? "dataset"] = (m[r.origin ?? "dataset"] ?? 0) + 1;
    return m;
  };
  const dup = s.quality.duplicates;
  const groups: { name: string; rows: readonly { origin?: string }[]; d: number }[] = [
    { name: "campaigns", rows: ds.campaigns, d: dup.campaigns ?? 0 },
    { name: "campaign_daily", rows: ds.daily, d: dup.campaign_daily ?? 0 },
    { name: "people", rows: ds.people, d: dup.people ?? 0 },
    { name: "interactions", rows: ds.interactions, d: dup.interactions ?? 0 },
    { name: "registrations", rows: ds.registrations, d: dup.registrations ?? 0 },
    { name: "registration_history", rows: ds.history, d: dup.registration_history ?? 0 },
    { name: "checkins", rows: ds.checkins, d: dup.checkins ?? 0 },
    { name: "targets", rows: ds.targets, d: 0 },
  ];
  const collections = groups.map((c) => ({ name: c.name, records: c.rows.length, deduplicated: c.d, by_origin: originOf(c.rows) }));

  const fields: Record<string, string[]> = {
    campaign_daily: ["activity_date", "impressions", "clicks", "reported_reach", "landing_page_sessions", "registration_starts", "marketing_spend_inr", "platform"],
    people: ["person_type", "first_seen_at", "first_touch_source", "first_campaign_id"],
    interactions: ["occurred_at", "event_type (page_visit, brochure_download, registration_start, event_question_submitted, nurture_email_sent/opened/clicked, opted_out)"],
    registrations: ["registered_at", "campaign_id"],
    registration_history: ["effective_at", "status (interested, confirmed, cancelled, waitlisted)"],
    checkins: ["occurred_at", "result", "verification", "source (scanner/manual)", "registration_id"],
    targets: ["identified_external_people_goal", "registration_goal", "unique_external_visitors_goal", "marketing_budget_inr", "effective_at"],
    campaigns: ["campaign_name", "channel", "target_audience", "objective", "owner", "planned_start/end", "status"],
    tasks: ["title", "owner", "due_date", "status", "priority", "campaign_id"],
  };

  return {
    value: {
      window: { history_start: ds.event.history_start, history_end: ds.event.history_end, as_of: s.asOf },
      collections,
      excluded: s.quality,
      fields,
      not_in_data: NOT_IN_DATA,
      attribution_note:
        "Registration campaign, first-touch campaign and check-in campaign agree for every record in the original dataset, so alternative attribution models give the same answer here.",
    },
    formula: "Inventory of loaded records, duplicates removed, exclusions applied and fields available",
    inputs: { as_of: s.asOf },
    assumptions: [RULES.dedup, RULES.external_only, RULES.verified_admission],
    sources: collections.map((c) => ({ collection: c.name, records: c.records, filter: "all" })),
  };
}
