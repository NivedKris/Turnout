/**
 * Collection registry. `source` collections mirror the dataset and have a
 * `baseline_*` twin holding the untouched import, used by reset.
 */
export const SOURCE_COLLECTIONS = {
  event: "event",
  targets: "targets",
  campaigns: "campaigns",
  campaign_daily: "campaign_daily",
  people: "people",
  interactions: "interactions",
  registrations: "registrations",
  registration_history: "registration_history",
  checkins: "checkins",
  field_guide: "field_guide",
  readme: "readme",
} as const;

export const APP_COLLECTIONS = {
  settings: "settings",
  tasks: "tasks",
  activity: "activity",
  chat_sessions: "chat_sessions",
  meta: "meta",
  goal_model: "goal_model",
  bets: "bets",
  decisions: "decisions",
} as const;

export type SourceCollection = keyof typeof SOURCE_COLLECTIONS;

/** Collections restored by reset (source data + seeded app state). */
export const RESETTABLE = [
  ...Object.values(SOURCE_COLLECTIONS),
  APP_COLLECTIONS.settings,
  APP_COLLECTIONS.tasks,
  APP_COLLECTIONS.goal_model,
  APP_COLLECTIONS.bets,
  APP_COLLECTIONS.decisions,
] as const;

export const baselineName = (name: string) => `baseline_${name}`;

/** Stable source key per collection, used for dedup and lookups. */
export const SOURCE_KEY: Partial<Record<string, string>> = {
  campaigns: "campaign_id",
  campaign_daily: "activity_id",
  people: "person_id",
  interactions: "interaction_id",
  registrations: "registration_id",
  registration_history: "history_id",
  checkins: "event_id",
  tasks: "task_id",
  bets: "bet_id",
  decisions: "decision_id",
};
