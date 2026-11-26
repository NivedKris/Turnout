import type { Dataset } from "@/lib/analytics";
import { startOfDayIst } from "@/lib/time";

/**
 * A tiny hand-built dataset where every number can be checked by hand.
 * Event 10–11 Mar 2025. Registrations close 9 Mar. Two campaigns + one empty campaign.
 *
 * Campaign A (CA): daily 1–7 Mar, spend ₹700/day except 3 Mar (credit −₹200),
 *   1000 impressions, 20 clicks, 15 sessions, 3 starts per day; 1 Mar row duplicated.
 * Campaign B (CB): daily 1–7 Mar, spend ₹0, 500 impressions, 2 clicks, 2 sessions, 1 start.
 * Campaign Z (CZ): no data at all.
 */
const at = (day: string, hh = 10) => new Date(startOfDayIst(day).getTime() + hh * 3_600_000);
const meta = { origin: "dataset" as const, row_no: null };

const days = ["2025-03-01", "2025-03-02", "2025-03-03", "2025-03-04", "2025-03-05", "2025-03-06", "2025-03-07"];

export function miniDataset(): Dataset {
  const daily: Dataset["daily"] = [];
  for (const d of days) {
    const k = d.slice(5).replace("-", "");
    daily.push({
      ...meta,
      activity_id: `A-${k}`,
      campaign_id: "CA",
      campaign_name: "Alpha",
      owner_id: "T1",
      owner_name: "Owner One",
      activity_date: d,
      impressions: 1000,
      clicks: 20,
      reported_reach: 800,
      landing_page_sessions: 15,
      registration_starts: 3,
      marketing_spend_inr: d === "2025-03-03" ? -200 : 700,
      platform: "paid platform",
    });
    daily.push({
      ...meta,
      activity_id: `B-${k}`,
      campaign_id: "CB",
      campaign_name: "Beta",
      owner_id: "T2",
      owner_name: "Owner Two",
      activity_date: d,
      impressions: 500,
      clicks: 2,
      reported_reach: 400,
      landing_page_sessions: 2,
      registration_starts: 1,
      marketing_spend_inr: 0,
      platform: "campaign link analytics",
    });
  }
  daily.push({ ...daily[0]! }); // import-retry duplicate of A-0301

  const person = (id: string, type: "external" | "internal" | "staff" | "test", day: string, camp: string | null, touch: Dataset["people"][number]["first_touch_source"] = "campaign") => ({
    ...meta,
    person_id: id,
    person_name: `Person ${id}`,
    person_type: type,
    first_seen_at: at(day, 9),
    first_touch_source: touch,
    first_campaign_id: camp,
    first_campaign_name: camp,
    owner_id: "T1",
    owner_name: "Owner One",
  });

  // Externals P1..P6 (A: P1–P4, B: P5–P6), internal N1 registers too, walk-in W1 at the event.
  const people: Dataset["people"] = [
    person("P1", "external", "2025-03-01", "CA"),
    person("P2", "external", "2025-03-02", "CA"),
    person("P3", "external", "2025-03-03", "CA"),
    person("P4", "external", "2025-03-06", "CA"),
    person("P5", "external", "2025-03-02", "CB"),
    person("P6", "external", "2025-03-04", "CB"),
    person("N1", "internal", "2025-03-01", null, "internal_registration"),
    person("W1", "external", "2025-03-10", null, "walk_in"),
  ];

  const reg = (rid: string, pid: string, camp: string, day: string) => ({
    ...meta,
    registration_id: rid,
    person_id: pid,
    person_name: `Person ${pid}`,
    campaign_id: camp,
    campaign_name: camp,
    owner_id: "T1",
    owner_name: "Owner One",
    registered_at: at(day),
  });
  // P4 registers on 8 Mar (after a 7 Mar as-of, so look-ahead must exclude it).
  const registrations: Dataset["registrations"] = [
    reg("R1", "P1", "CA", "2025-03-01"),
    reg("R2", "P2", "CA", "2025-03-02"),
    reg("R3", "P3", "CA", "2025-03-04"),
    reg("R4", "P4", "CA", "2025-03-08"),
    reg("R5", "P5", "CB", "2025-03-05"),
    reg("RN", "N1", "CA", "2025-03-02"),
  ];

  const h = (hid: string, rid: string, pid: string, camp: string, day: string, status: Dataset["history"][number]["status"], hh = 11) => ({
    ...meta,
    history_id: hid,
    registration_id: rid,
    person_id: pid,
    person_name: pid,
    campaign_id: camp,
    campaign_name: camp,
    owner_id: "T1",
    owner_name: "Owner One",
    effective_at: at(day, hh),
    status,
  });
  const history: Dataset["history"] = [
    h("H1", "R1", "P1", "CA", "2025-03-01", "confirmed"),
    h("H2", "R2", "P2", "CA", "2025-03-02", "confirmed"),
    h("H3", "R2", "P2", "CA", "2025-03-05", "cancelled"), // cancelled on 5 Mar…
    h("H4", "R2", "P2", "CA", "2025-03-08", "confirmed"), // …reconfirmed on 8 Mar
    h("H5", "R3", "P3", "CA", "2025-03-04", "interested"),
    h("H6", "R4", "P4", "CA", "2025-03-08", "confirmed"),
    h("H7", "R5", "P5", "CB", "2025-03-05", "confirmed"),
    h("HN", "RN", "N1", "CA", "2025-03-02", "confirmed"),
  ];
  history.push({ ...history[0]! }); // duplicate history_id

  const ck = (eid: string, pid: string, rid: string | null, camp: string | null, day: string, hh: number, result: "admitted" | "denied" | "pending", verification: "verified" | "unverified" = "verified") => ({
    ...meta,
    event_id: eid,
    person_id: pid,
    person_name: pid,
    registration_id: rid,
    campaign_id: camp,
    campaign_name: camp,
    owner_id: "T1",
    owner_name: "Owner One",
    occurred_at: at(day, hh),
    result,
    verification,
    source: "scanner" as const,
  });
  const checkins: Dataset["checkins"] = [
    ck("K1", "P1", "R1", "CA", "2025-03-10", 11, "admitted"),
    ck("K2", "P1", "R1", "CA", "2025-03-10", 15, "admitted"), // repeat attempt, same person
    ck("K3", "P2", "R2", "CA", "2025-03-11", 12, "admitted"),
    ck("K4", "P3", "R3", "CA", "2025-03-10", 12, "denied"),
    ck("K5", "P5", "R5", "CB", "2025-03-10", 13, "pending", "unverified"),
    ck("K6", "N1", "RN", "CA", "2025-03-10", 10, "admitted"), // internal: excluded
    ck("K7", "W1", null, null, "2025-03-10", 14, "admitted"), // walk-in
  ];
  checkins.push({ ...checkins[0]! }); // duplicate event_id

  const interactions: Dataset["interactions"] = [
    { ...meta, interaction_id: "I1", person_id: "P1", person_name: "P1", campaign_id: "CA", campaign_name: "Alpha", owner_id: "T1", owner_name: "Owner One", occurred_at: at("2025-03-01", 9), event_type: "registration_start", detail: "" },
    { ...meta, interaction_id: "I2", person_id: "P6", person_name: "P6", campaign_id: "CB", campaign_name: "Beta", owner_id: "T2", owner_name: "Owner Two", occurred_at: at("2025-03-04", 9), event_type: "brochure_download", detail: "" },
    { ...meta, interaction_id: "I3", person_id: "P5", person_name: "P5", campaign_id: "CB", campaign_name: "Beta", owner_id: "T2", owner_name: "Owner Two", occurred_at: at("2025-03-02", 9), event_type: "page_visit", detail: "" },
  ];

  const camp = (id: string, name: string) => ({
    ...meta,
    campaign_id: id,
    campaign_name: name,
    channel: name.toLowerCase(),
    target_audience: "",
    objective: "",
    owner_id: "T1",
    owner_name: "Owner One",
    created_at: at("2025-02-28"),
    planned_start_at: at("2025-03-01"),
    planned_end_at: at("2025-03-11"),
    status: "active" as const,
    budget_planned_inr: null,
    hypothesis: "",
  });

  return {
    event: {
      ...meta,
      event_name: "MiniFest",
      history_start: "2025-03-01",
      history_end: "2025-03-12",
      event_starts_at: at("2025-03-10", 10),
      event_ends_at: at("2025-03-11", 20),
      timezone: "Asia/Kolkata",
      currency: "INR",
      fictional: true,
    },
    settings: { city: "Bengaluru", festival_name: "MiniFest", venue_capacity: 100, default_as_of: "2025-03-12" },
    targets: [
      { ...meta, effective_at: at("2025-03-01", 9), identified_external_people_goal: 10, registration_goal: 8, unique_external_visitors_goal: 6, marketing_budget_inr: 5000, target_version: "v1" },
      { ...meta, effective_at: at("2025-03-06", 9), identified_external_people_goal: 12, registration_goal: 9, unique_external_visitors_goal: 7, marketing_budget_inr: 6000, target_version: "v2" },
    ],
    campaigns: [camp("CA", "Alpha"), camp("CB", "Beta"), camp("CZ", "Zeta")],
    daily,
    people,
    interactions,
    registrations,
    history,
    checkins,
  };
}
