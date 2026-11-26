import { toDayKey } from "../time";
import { BENCHMARKS, RULES, asAssumption } from "./benchmarks";
import { inRange, type DayRange, type Snapshot } from "./snapshot";
import type { Assumption, Result } from "./types";

/** Safe ratio: null when the denominator is zero or missing. */
export function ratio(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

export type Scope = DayRange & { campaignId?: string | null };

/** Additive quantities over a day range (inclusive), optionally for one campaign. */
export type Flows = {
  impressions: number;
  clicks: number;
  reported_reach: number;
  sessions: number;
  registration_starts: number;
  spend: number;
  identified: number;
  registrations: number;
  visitors: number;
  walk_ins: number;
};

export const FLOW_KEYS = [
  "impressions",
  "clicks",
  "reported_reach",
  "sessions",
  "registration_starts",
  "spend",
  "identified",
  "registrations",
  "visitors",
  "walk_ins",
] as const satisfies readonly (keyof Flows)[];

export function flows(s: Snapshot, scope: Scope = {}): Flows {
  const c = scope.campaignId ?? null;
  const f: Flows = {
    impressions: 0,
    clicks: 0,
    reported_reach: 0,
    sessions: 0,
    registration_starts: 0,
    spend: 0,
    identified: 0,
    registrations: 0,
    visitors: 0,
    walk_ins: 0,
  };
  for (const d of s.daily) {
    if (c && d.campaign_id !== c) continue;
    if (!inRange(d.activity_date, scope)) continue;
    f.impressions += d.impressions;
    f.clicks += d.clicks;
    f.reported_reach += d.reported_reach;
    f.sessions += d.landing_page_sessions;
    f.registration_starts += d.registration_starts;
    f.spend += d.marketing_spend_inr;
  }
  for (const p of s.people) {
    if (c && p.first_campaign_id !== c) continue;
    if (inRange(toDayKey(p.first_seen_at), scope)) f.identified++;
  }
  const seenPerson = new Set<string>();
  for (const r of s.registrations) {
    if (c && r.campaign_id !== c) continue;
    if (seenPerson.has(r.person_id)) continue; // a person counts once
    if (inRange(toDayKey(r.registered_at), scope)) {
      seenPerson.add(r.person_id);
      f.registrations++;
    }
  }
  for (const v of s.visitors.values()) {
    if (c && v.campaign_id !== c) continue;
    if (!inRange(toDayKey(v.first_admitted_at), scope)) continue;
    f.visitors++;
    if (v.walk_in) f.walk_ins++;
  }
  return f;
}

/** Registration statuses as of the cutoff, for a campaign or all. */
export function statusCounts(s: Snapshot, campaignId?: string | null, atEventStart = false) {
  const map = atEventStart ? s.statusAtEventStart : s.statusByReg;
  const counts = { interested: 0, confirmed: 0, cancelled: 0, waitlisted: 0 };
  if (!map) return null;
  for (const r of s.registrations) {
    if (campaignId && r.campaign_id !== campaignId) continue;
    const st = map.get(r.registration_id);
    if (st) counts[st]++;
  }
  return counts;
}

/** Registered visitors (excludes walk-ins), for a campaign or all. */
export function registeredVisitors(s: Snapshot, campaignId?: string | null): number {
  let n = 0;
  for (const v of s.visitors.values()) {
    if (v.walk_in) continue;
    if (campaignId && v.campaign_id !== campaignId) continue;
    n++;
  }
  return n;
}

export type CampaignKpis = {
  campaign_id: string;
  campaign_name: string;
  channel: string;
  owner_name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  sessions: number;
  registration_starts: number;
  identified: number;
  registrations: number;
  confirmed: number;
  cancelled: number;
  visitors: number;
  ctr: number | null;
  click_to_session: number | null;
  session_to_start: number | null;
  confirm_rate: number | null;
  cancel_rate: number | null;
  show_up_rate: number | null;
  cost_per_identified: number | null;
  cost_per_registration: number | null;
  cost_per_visitor: number | null;
  share_of_registrations: number | null;
  share_of_spend: number | null;
};

export function campaignKpis(s: Snapshot, scope: DayRange = {}): Result<CampaignKpis[]> {
  const total = flows(s, scope);
  const rows: CampaignKpis[] = s.campaigns.map((c) => {
    const f = flows(s, { ...scope, campaignId: c.campaign_id });
    const st = statusCounts(s, c.campaign_id) ?? { confirmed: 0, cancelled: 0, interested: 0, waitlisted: 0 };
    const atStart = statusCounts(s, c.campaign_id, true);
    const regVisitors = registeredVisitors(s, c.campaign_id);
    return {
      campaign_id: c.campaign_id,
      campaign_name: c.campaign_name,
      channel: c.channel,
      owner_name: c.owner_name,
      status: c.status,
      spend: f.spend,
      impressions: f.impressions,
      clicks: f.clicks,
      sessions: f.sessions,
      registration_starts: f.registration_starts,
      identified: f.identified,
      registrations: f.registrations,
      confirmed: st.confirmed,
      cancelled: st.cancelled,
      visitors: f.visitors,
      ctr: ratio(f.clicks, f.impressions),
      click_to_session: ratio(f.sessions, f.clicks),
      session_to_start: ratio(f.registration_starts, f.sessions),
      confirm_rate: ratio(st.confirmed, f.registrations),
      cancel_rate: ratio(st.cancelled, f.registrations),
      show_up_rate: atStart ? ratio(regVisitors, atStart.confirmed) : null,
      cost_per_identified: ratio(f.spend, f.identified),
      cost_per_registration: ratio(f.spend, f.registrations),
      cost_per_visitor: ratio(f.spend, f.visitors),
      share_of_registrations: ratio(f.registrations, total.registrations),
      share_of_spend: ratio(f.spend, total.spend),
    };
  });

  const assumptions: Assumption[] = [RULES.dedup, RULES.external_only, RULES.registration_attribution, RULES.net_spend];
  if (s.phase === "pre_event") {
    assumptions.push({ text: "Show-up rate is unavailable before the event starts", label: "Derived" });
  }
  return {
    value: rows,
    formula:
      "CTR = clicks / impressions; CPR = net spend / registrations; cost per visitor = net spend / verified visitors; " +
      "show-up = registered verified visitors / registrations confirmed at event start",
    inputs: { as_of: s.asOf, from: scope.from ?? s.event.history_start, to: scope.to ?? s.asOf, campaigns: rows.length },
    assumptions,
    sources: [
      { collection: "campaign_daily", records: s.daily.length, filter: `activity_date ≤ ${s.asOf}` },
      { collection: "registrations", records: s.registrations.length, filter: "external, registered ≤ cutoff" },
      { collection: "registration_history", records: s.statusByReg.size, filter: "latest status ≤ cutoff" },
      { collection: "checkins", records: s.visitors.size, filter: "admitted + verified, external, distinct person" },
    ],
  };
}

/* ───────────────────────────── Funnel ───────────────────────────── */

export type FunnelStage = {
  key: string;
  label: string;
  value: number | null;
  /** Conversion from the previous stage in the same layer. */
  conversion: number | null;
  benchmark: number | null;
  note?: string;
};

export type Funnel = {
  campaign_id: string | null;
  anonymous: FunnelStage[];
  identified: FunnelStage[];
  walk_ins: number;
  total_visitors: number;
  reported_reach_sum: number;
  overall: { identified_to_visitor: number | null; registered_to_visitor: number | null };
};

function chain(stages: Omit<FunnelStage, "conversion">[]): FunnelStage[] {
  return stages.map((st, i) => {
    const prev = i > 0 ? stages[i - 1]!.value : null;
    return { ...st, conversion: i > 0 && st.value !== null && prev !== null ? ratio(st.value, prev) : null };
  });
}

export function funnel(s: Snapshot, scope: Scope = {}): Result<Funnel> {
  const c = scope.campaignId ?? null;
  const f = flows(s, scope);
  const st = statusCounts(s, c);
  const regVisitors = (() => {
    let n = 0;
    for (const v of s.visitors.values()) {
      if (v.walk_in || (c && v.campaign_id !== c)) continue;
      if (inRange(toDayKey(v.first_admitted_at), scope)) n++;
    }
    return n;
  })();

  // Engaged: identified people with at least one high-intent action at or before cutoff.
  const highIntent = new Set(["brochure_download", "event_question_submitted", "nurture_email_clicked", "registration_start"]);
  const engaged = new Set<string>();
  for (const i of s.interactions) {
    if (c && i.campaign_id !== c) continue;
    if (highIntent.has(i.event_type) && inRange(toDayKey(i.occurred_at), scope)) engaged.add(i.person_id);
  }
  // Campaign-acquired identified people (walk-ins are reported separately).
  let identifiedCampaign = 0;
  for (const p of s.people) {
    if (p.first_touch_source !== "campaign") continue;
    if (c && p.first_campaign_id !== c) continue;
    if (inRange(toDayKey(p.first_seen_at), scope)) identifiedCampaign++;
  }

  const started = s.phase === "during_event" || s.phase === "post_event";
  const anonymous = chain([
    { key: "impressions", label: "Impressions", value: f.impressions, benchmark: null },
    { key: "clicks", label: "Clicks", value: f.clicks, benchmark: BENCHMARKS.ctr.value },
    { key: "sessions", label: "Landing sessions", value: f.sessions, benchmark: BENCHMARKS.click_to_session.value },
    {
      key: "registration_starts",
      label: "Form starts",
      value: f.registration_starts,
      benchmark: BENCHMARKS.session_to_start.value,
    },
  ]);
  const identified = chain([
    { key: "identified", label: "Identified people", value: identifiedCampaign, benchmark: null },
    { key: "engaged", label: "High-intent engaged", value: engaged.size, benchmark: null },
    { key: "registered", label: "Registered", value: f.registrations, benchmark: null },
    {
      key: "confirmed",
      label: "Confirmed",
      value: st?.confirmed ?? 0,
      benchmark: BENCHMARKS.registered_to_confirmed.value,
    },
    {
      key: "attended",
      label: "Attended (registered)",
      value: started ? regVisitors : null,
      benchmark: BENCHMARKS.show_up_free.value,
      note: started ? undefined : "Event has not started at this date",
    },
  ]);

  const walkIns = c ? 0 : f.walk_ins;
  const total = started ? regVisitors + walkIns : 0;
  return {
    value: {
      campaign_id: c,
      anonymous,
      identified,
      walk_ins: walkIns,
      total_visitors: total,
      reported_reach_sum: f.reported_reach,
      overall: {
        identified_to_visitor: started ? ratio(regVisitors, identifiedCampaign) : null,
        registered_to_visitor: started ? ratio(regVisitors, f.registrations) : null,
      },
    },
    formula:
      "Two layers that are never divided across: anonymous events (impressions → clicks → sessions → form starts) " +
      "and identified people (identified → engaged → registered → confirmed → attended). Each conversion = stage / previous stage.",
    inputs: {
      as_of: s.asOf,
      campaign: c ?? "all",
      from: scope.from ?? null,
      to: scope.to ?? null,
      walk_ins: walkIns,
      total_visitors: total,
    },
    assumptions: [
      RULES.dedup,
      RULES.external_only,
      RULES.verified_admission,
      RULES.latest_status,
      RULES.reach_not_unique,
      asAssumption(BENCHMARKS.ctr),
      asAssumption(BENCHMARKS.click_to_session),
      asAssumption(BENCHMARKS.session_to_start),
      asAssumption(BENCHMARKS.registered_to_confirmed),
      asAssumption(BENCHMARKS.show_up_free),
      {
        text: "Engaged = brochure download, question, email click or form start",
        label: "Assumption",
      },
    ],
    sources: [
      { collection: "campaign_daily", records: s.daily.length, filter: `activity_date ≤ ${s.asOf}` },
      { collection: "people", records: s.people.length, filter: "external, first seen ≤ cutoff" },
      { collection: "interactions", records: s.interactions.length, filter: "occurred ≤ cutoff" },
      { collection: "registrations", records: s.registrations.length, filter: "external" },
      { collection: "checkins", records: s.visitors.size, filter: "verified visitors" },
    ],
  };
}
