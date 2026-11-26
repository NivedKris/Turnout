import type {
  CampaignDailyDoc,
  CampaignDoc,
  CheckinDoc,
  EventDoc,
  InteractionDoc,
  PersonDoc,
  RegistrationDoc,
  RegistrationHistoryDoc,
  TargetDoc,
} from "../models/source";
import type { SettingsDoc, TaskDoc } from "../models/app";

/** Everything the engine needs, loaded once per request. No DB handles inside. */
export type Dataset = {
  event: EventDoc;
  settings: Pick<SettingsDoc, "city" | "festival_name" | "venue_capacity" | "default_as_of">;
  targets: TargetDoc[];
  campaigns: CampaignDoc[];
  daily: CampaignDailyDoc[];
  people: PersonDoc[];
  interactions: InteractionDoc[];
  registrations: RegistrationDoc[];
  history: RegistrationHistoryDoc[];
  checkins: CheckinDoc[];
  tasks?: TaskDoc[];
};

export type AssumptionLabel = "Sourced" | "Assumption" | "Dataset rule" | "Derived";
export type Assumption = { text: string; label: AssumptionLabel; url?: string };

/** What a calculation read, so the trace graph can draw it. */
export type SourceRef = { collection: string; records: number; filter: string };

export type Scalar = number | string | boolean | null;

/**
 * Every engine function returns its working, so the UI and the copilot can show
 * how a number was produced and what it depends on.
 */
export type Result<T> = {
  value: T;
  formula: string;
  inputs: Record<string, Scalar>;
  assumptions: Assumption[];
  sources: SourceRef[];
};

export type Phase = "before_history" | "pre_event" | "during_event" | "post_event";
