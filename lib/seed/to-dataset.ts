import type { Dataset } from "../analytics/types";
import { DEFAULT_SETTINGS, seedTasks } from "./load";
import { defaultGoalModel, seedBets, seedDecisions } from "./strategy";
import type { ParsedDataset } from "./workbook";

/** Turns a parsed workbook straight into an engine Dataset (tests and offline scripts, no DB). */
export function datasetFromParsed(p: ParsedDataset): Dataset {
  return {
    event: p.event[0] as Dataset["event"],
    settings: {
      city: DEFAULT_SETTINGS.city,
      festival_name: DEFAULT_SETTINGS.festival_name,
      venue_capacity: DEFAULT_SETTINGS.venue_capacity,
      default_as_of: DEFAULT_SETTINGS.default_as_of,
    },
    targets: p.targets as Dataset["targets"],
    campaigns: p.campaigns as Dataset["campaigns"],
    daily: p.campaign_daily as Dataset["daily"],
    people: p.people as Dataset["people"],
    interactions: p.interactions as Dataset["interactions"],
    registrations: p.registrations as Dataset["registrations"],
    history: p.registration_history as Dataset["history"],
    checkins: p.checkins as Dataset["checkins"],
    tasks: seedTasks(),
    goalModel: defaultGoalModel(),
    bets: seedBets(),
    decisions: seedDecisions(),
  };
}
