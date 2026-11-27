import type {
  CampaignDailyDoc,
  CampaignDoc,
  InteractionDoc,
  PersonDoc,
  RegistrationDoc,
  RegistrationHistoryDoc,
  TargetDoc,
} from "../models/source";
import { addDays, daysBetween, endOfDayIst, isDayKey, toDayKey } from "../time";
import type { Dataset, Phase } from "./types";

/**
 * An as-of snapshot: the state of the world at the end of `asOf` (IST), with all
 * dataset rules applied (dedup, external-only, latest status, no look-ahead).
 * Every other engine function works on a snapshot, never on raw rows.
 */

export type Visitor = {
  person_id: string;
  first_admitted_at: Date;
  registration_id: string | null;
  campaign_id: string | null;
  walk_in: boolean;
};

export type Snapshot = {
  asOf: string;
  cutoff: Date;
  phase: Phase;
  event: Dataset["event"];
  eventStartDay: string;
  eventEndDay: string;
  /** Last day registrations count toward the event (assumption: day before the event). */
  regCloseDay: string;
  /** Whole days after asOf still open for registrations (0 when closed). */
  regDaysLeft: number;
  daysToEvent: number;
  capacity: number;
  target: TargetDoc | null;
  campaigns: CampaignDoc[];
  campaignIds: string[];
  /** External people first seen at or before the cutoff. */
  people: PersonDoc[];
  personById: Map<string, PersonDoc>;
  daily: CampaignDailyDoc[];
  interactions: InteractionDoc[];
  registrations: RegistrationDoc[];
  /** registration_id → latest status at cutoff. */
  statusByReg: Map<string, RegistrationHistoryDoc["status"]>;
  /** registration_id → status at event start (for show-up; null before the event). */
  statusAtEventStart: Map<string, RegistrationHistoryDoc["status"]> | null;
  /** Deduplicated status versions ≤ cutoff, grouped by registration (for timelines). */
  historyByReg: Map<string, RegistrationHistoryDoc[]>;
  visitors: Map<string, Visitor>;
  /** The snapshot as of another day, from the same dataset (memoised). Used for weekly stop reviews. */
  at: (day: string) => Snapshot;
  /** Opaque identity of the dataset this snapshot came from (cache key). */
  source: object;
  quality: {
    duplicates: Record<string, number>;
    excludedPeople: Record<string, number>;
    excludedCheckins: { denied: number; pending_or_unverified: number; non_external: number; repeat_attempts: number };
    excludedRegistrationsNonExternal: number;
  };
};

/** Keep the first record for each stable ID; count the rest as duplicates. */
export function dedupeBy<T>(rows: T[], key: (r: T) => string): { rows: T[]; duplicates: number } {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const k = key(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return { rows: out, duplicates: rows.length - out.length };
}

function latestStatus(
  history: RegistrationHistoryDoc[],
  cutoff: Date,
): Map<string, RegistrationHistoryDoc["status"]> {
  const best = new Map<string, RegistrationHistoryDoc>();
  for (const h of history) {
    if (h.effective_at > cutoff) continue;
    const cur = best.get(h.registration_id);
    // Ties on timestamp: the later history_id wins (stable, deterministic).
    if (
      !cur ||
      h.effective_at > cur.effective_at ||
      (h.effective_at.getTime() === cur.effective_at.getTime() && h.history_id > cur.history_id)
    ) {
      best.set(h.registration_id, h);
    }
  }
  return new Map([...best].map(([k, v]) => [k, v.status]));
}

export function phaseOf(asOf: string, cutoff: Date, ds: Dataset): Phase {
  if (asOf < ds.event.history_start) return "before_history";
  if (cutoff < ds.event.event_starts_at) return "pre_event";
  if (cutoff < ds.event.event_ends_at) return "during_event";
  return "post_event";
}

export function clampAsOf(asOf: string | undefined, ds: Dataset): string {
  const fallback = ds.settings.default_as_of ?? ds.event.history_end;
  if (!asOf || !isDayKey(asOf)) return fallback;
  return asOf;
}

/** Earlier snapshots per dataset object, so confirming a stop costs a few ms at most. */
const priorCache = new WeakMap<Dataset, Map<string, Snapshot>>();

export function buildSnapshot(ds: Dataset, asOfInput?: string): Snapshot {
  const asOf = clampAsOf(asOfInput, ds);
  const cutoff = endOfDayIst(asOf);
  const eventStartDay = toDayKey(ds.event.event_starts_at);
  const eventEndDay = toDayKey(ds.event.event_ends_at);
  const regCloseDay = addDays(eventStartDay, -1);

  // Dedup by stable source ID.
  const dDaily = dedupeBy(ds.daily, (r) => r.activity_id);
  const dHist = dedupeBy(ds.history, (r) => r.history_id);
  const dChk = dedupeBy(ds.checkins, (r) => r.event_id);
  const dInt = dedupeBy(ds.interactions, (r) => r.interaction_id);
  const dReg = dedupeBy(ds.registrations, (r) => r.registration_id);
  const dPeople = dedupeBy(ds.people, (r) => r.person_id);
  const dCamp = dedupeBy(ds.campaigns, (r) => r.campaign_id);

  const allById = new Map(dPeople.rows.map((p) => [p.person_id, p]));
  const isExternal = (id: string) => allById.get(id)?.person_type === "external";

  const excludedPeople: Record<string, number> = {};
  for (const p of dPeople.rows) {
    if (p.person_type !== "external") excludedPeople[p.person_type] = (excludedPeople[p.person_type] ?? 0) + 1;
  }

  const people = dPeople.rows.filter((p) => p.person_type === "external" && p.first_seen_at <= cutoff);
  const personById = new Map(people.map((p) => [p.person_id, p]));

  const daily = dDaily.rows.filter((r) => r.activity_date <= asOf);
  const interactions = dInt.rows.filter((r) => r.occurred_at <= cutoff && isExternal(r.person_id));
  const regsInTime = dReg.rows.filter((r) => r.registered_at <= cutoff);
  const registrations = regsInTime.filter((r) => isExternal(r.person_id));

  const regIds = new Set(registrations.map((r) => r.registration_id));
  const statusAll = latestStatus(dHist.rows, cutoff);
  const historyByReg = new Map<string, RegistrationHistoryDoc[]>();
  for (const h of dHist.rows) {
    if (h.effective_at > cutoff) continue;
    const arr = historyByReg.get(h.registration_id);
    if (arr) arr.push(h);
    else historyByReg.set(h.registration_id, [h]);
  }
  const statusByReg = new Map([...statusAll].filter(([k]) => regIds.has(k)));

  const started = cutoff >= ds.event.event_starts_at;
  const statusAtEventStart = started
    ? new Map([...latestStatus(dHist.rows, ds.event.event_starts_at)].filter(([k]) => regIds.has(k)))
    : null;

  // Verified visitors: admitted + verified, external, distinct person, at or before cutoff.
  const excludedCheckins = { denied: 0, pending_or_unverified: 0, non_external: 0, repeat_attempts: 0 };
  const visitors = new Map<string, Visitor>();
  const chk = dChk.rows
    .filter((c) => c.occurred_at <= cutoff)
    .sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime());
  for (const c of chk) {
    if (c.result === "denied") {
      excludedCheckins.denied++;
      continue;
    }
    if (c.result !== "admitted" || c.verification !== "verified") {
      excludedCheckins.pending_or_unverified++;
      continue;
    }
    if (!isExternal(c.person_id)) {
      excludedCheckins.non_external++;
      continue;
    }
    if (visitors.has(c.person_id)) {
      excludedCheckins.repeat_attempts++;
      continue;
    }
    visitors.set(c.person_id, {
      person_id: c.person_id,
      first_admitted_at: c.occurred_at,
      registration_id: c.registration_id,
      campaign_id: c.campaign_id,
      walk_in: !c.registration_id,
    });
  }

  const target =
    [...ds.targets].filter((t) => t.effective_at <= cutoff).sort((a, b) => +b.effective_at - +a.effective_at)[0] ??
    null;

  const at = (day: string): Snapshot => {
    let m = priorCache.get(ds);
    if (!m) priorCache.set(ds, (m = new Map()));
    let hit = m.get(day);
    if (!hit) m.set(day, (hit = buildSnapshot(ds, day)));
    return hit;
  };
  return {
    asOf,
    cutoff,
    phase: phaseOf(asOf, cutoff, ds),
    event: ds.event,
    eventStartDay,
    eventEndDay,
    regCloseDay,
    regDaysLeft: Math.max(0, daysBetween(asOf, regCloseDay)),
    daysToEvent: Math.max(0, daysBetween(asOf, eventStartDay)),
    capacity: ds.settings.venue_capacity,
    target,
    campaigns: dCamp.rows,
    campaignIds: dCamp.rows.map((c) => c.campaign_id),
    people,
    personById,
    daily,
    interactions,
    registrations,
    statusByReg,
    statusAtEventStart,
    historyByReg,
    at,
    source: ds,
    visitors,
    quality: {
      duplicates: {
        campaign_daily: dDaily.duplicates,
        registration_history: dHist.duplicates,
        checkins: dChk.duplicates,
        interactions: dInt.duplicates,
        registrations: dReg.duplicates,
        people: dPeople.duplicates,
        campaigns: dCamp.duplicates,
      },
      excludedPeople,
      excludedCheckins,
      excludedRegistrationsNonExternal: regsInTime.length - registrations.length,
    },
  };
}

/** Inclusive IST day range filter helper for flows. */
export type DayRange = { from?: string; to?: string };
export const inRange = (day: string, r: DayRange) => (!r.from || day >= r.from) && (!r.to || day <= r.to);
