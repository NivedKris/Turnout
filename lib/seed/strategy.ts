import type { BetDoc, DecisionDoc, GoalModelDoc, Signal } from "../models/strategy";

/**
 * Drafted strategy content (editable in the app). Populations are derived from
 * AISHE 2023-24 (Bengaluru Urban has 1,148 colleges); rates are planning
 * assumptions unless labelled Sourced. Bets map to the dataset's campaigns.
 */
const AISHE = "https://www.dohe-education.gov.in/static/uploads/2026/07/8616f33dfee644ab6b87a2bd0658b18d.pdf";
const PHEEDLOOP = "https://pheedloop.com/blog/event-data-lab-report-5";

export function defaultGoalModel(): GoalModelDoc {
  return {
    _id: "goal_model",
    name: "CampusFest Bengaluru plan",
    segments: [
      { key: "eng", name: "Engineering & tech colleges", population: 240_000, reach_rate: 0.05, identify_rate: 0.12, register_rate: 0.8, provenance: { label: "Assumption", source: "Share of ~9 lakh Bengaluru students (AISHE college count)", url: AISHE }, note: "Dense campuses, strong fest culture" },
      { key: "asc", name: "Arts, science & commerce", population: 420_000, reach_rate: 0.03, identify_rate: 0.08, register_rate: 0.75, provenance: { label: "Assumption", source: "Largest share of Bengaluru Urban colleges", url: AISHE } },
      { key: "mgmt", name: "Management & design schools", population: 90_000, reach_rate: 0.06, identify_rate: 0.1, register_rate: 0.78, provenance: { label: "Assumption", url: AISHE } },
      { key: "clubs", name: "College clubs & societies", population: 60_000, reach_rate: 0.1, identify_rate: 0.09, register_rate: 0.85, provenance: { label: "Assumption", source: "Members reachable through club leads; overlaps other segments" }, note: "Group sign-ups convert better" },
      { key: "friends", name: "Friends of registrants", population: 20_000, reach_rate: 0.25, identify_rate: 0.08, register_rate: 0.8, provenance: { label: "Assumption", source: "≈7 friends per early registrant" } },
    ],
    confirm_rate: 0.89,
    show_up_rate: 0.72,
    walk_in_share: 0.05,
    stretch_reach_multiplier: 1.25,
    stretch_register_multiplier: 1.08,
    stretch_show_up_rate: 0.76,
    rates_provenance: {
      confirm_rate: { label: "Derived", source: "Final confirmed share of registrations in the dataset (89.3%)" },
      show_up_rate: { label: "Sourced", source: "Free events ~28% median no-show", url: PHEEDLOOP },
      stretch_show_up_rate: { label: "Sourced", source: "Large free events ~24% median no-show", url: PHEEDLOOP },
      walk_in_share: { label: "Assumption" },
      stretch_reach_multiplier: { label: "Assumption", source: "+25% reach from doubling down on top bets" },
      stretch_register_multiplier: { label: "Assumption", source: "+8% from a shorter registration form" },
    },
    updated_at: new Date("2025-01-15T03:30:00Z"),
    origin: "simulated",
  };
}

const cpr = (scale: number, stop: number): Signal => ({ key: "cpr", label: "Cost per registration (14d)", metric: "cost_per_registration", window_days: 14, direction: "lower_is_better", scale_if: scale, stop_if: stop, min_sample: 15 });
const confirm: Signal = { key: "confirm", label: "Confirm rate", metric: "confirm_rate", window_days: 42, direction: "higher_is_better", scale_if: 0.88, stop_if: 0.78, min_sample: 30 };
const showUp: Signal = { key: "showup", label: "Show-up rate", metric: "show_up_rate", window_days: 42, direction: "higher_is_better", scale_if: 0.8, stop_if: 0.65, min_sample: 30 };
const pace = (scale: number, stop: number): Signal => ({ key: "pace", label: "Registrations per day (7d)", metric: "registrations_per_day", window_days: 7, direction: "higher_is_better", scale_if: scale, stop_if: stop, min_sample: 0 });

export function seedBets(): BetDoc[] {
  const at = new Date("2025-01-15T03:30:00Z");
  const base = { origin: "simulated" as const, created_at: at, updated_at: at, provenance: { label: "Assumption" as const, source: "Drafted plan; edit in Bets. Visitors = budget at the channel's 2025 cost per verified visitor, extra spend at 2x that cost. B4/B5 are capped tests; a ₹25,000 reserve goes to whichever bet crosses its scale line." } };
  return [
    {
      ...base,
      bet_id: "B1",
      rank: 1,
      title: "Campus ambassador network",
      hypothesis: "Peer ambassadors in the top 40 colleges convert interest into registrations more cheaply than ads.",
      rationale: "Trust travels peer to peer; ambassadors also drive confirmations and show-up.",
      campaign_ids: ["C01"],
      owner_name: "Meera Iyer",
      budget_inr: 100_000,
      start_day: "2025-01-25",
      end_day: "2025-04-11",
      expected_visitors: 659,
      rice: { reach: 40_000, impact: 2, confidence: 0.8, effort: 6 },
      status: "scaling",
      signals: [cpr(50, 120), pace(8, 3), showUp],
      risks: "Ambassador fatigue; quality varies by college.",
    },
    {
      ...base,
      bet_id: "B2",
      rank: 2,
      title: "College club group sign-ups",
      hypothesis: "Club leads registering their members as a group lifts registrations and confirmations.",
      rationale: "One conversation brings 10–30 people; groups show up together.",
      campaign_ids: ["C04"],
      owner_name: "Meera Iyer",
      budget_inr: 80_000,
      start_day: "2025-01-28",
      end_day: "2025-04-11",
      expected_visitors: 689,
      rice: { reach: 25_000, impact: 2, confidence: 0.8, effort: 4 },
      status: "scaling",
      signals: [cpr(50, 120), confirm, showUp],
      risks: "Depends on a few large clubs; form-start rate is low.",
    },
    {
      ...base,
      bet_id: "B3",
      rank: 3,
      title: "Bring-3-friends referrals",
      hypothesis: "A reward for registrants who bring three friends compounds registrations at near-zero media cost.",
      rationale: "Friends of registrants are pre-qualified; cost is the reward only.",
      campaign_ids: ["C05"],
      owner_name: "Dev Malhotra",
      budget_inr: 30_000,
      start_day: "2025-02-12",
      end_day: "2025-04-11",
      expected_visitors: 355,
      rice: { reach: 15_000, impact: 2, confidence: 0.7, effort: 3 },
      status: "testing",
      signals: [cpr(45, 110), pace(6, 2), confirm],
      risks: "Reward abuse; needs dedup of referred identities.",
    },
    {
      ...base,
      bet_id: "B4",
      rank: 4,
      title: "Creator-led reels",
      hypothesis: "Bengaluru student creators drive awareness that converts to registrations.",
      rationale: "Large reach at low production cost; good for the arts/commerce segment.",
      campaign_ids: ["C03"],
      owner_name: "Nisha Rao",
      budget_inr: 20_000,
      start_day: "2025-02-10",
      end_day: "2025-04-11",
      expected_visitors: 59,
      rice: { reach: 80_000, impact: 1, confidence: 0.4, effort: 5 },
      status: "testing",
      signals: [cpr(70, 130), confirm, showUp],
      risks: "Views may not convert; attribution is weak.",
    },
    {
      ...base,
      bet_id: "B5",
      rank: 5,
      title: "Paid social retargeting",
      hypothesis: "Retargeting landing-page visitors on Instagram recovers registrations from people who did not finish.",
      rationale: "Captures intent already paid for; easy to scale up or down.",
      campaign_ids: ["C02"],
      owner_name: "Arjun Verma",
      budget_inr: 15_000,
      start_day: "2025-02-01",
      end_day: "2025-04-11",
      expected_visitors: 55,
      rice: { reach: 120_000, impact: 0.5, confidence: 0.4, effort: 4 },
      status: "testing",
      signals: [cpr(80, 150), confirm, showUp],
      risks: "Highest cost per registration; weaker show-up from paid traffic.",
    },
  ];
}

export function seedDecisions(): DecisionDoc[] {
  const base = { actor: "seed" as const, origin: "simulated" as const };
  return [
    {
      ...base,
      decision_id: "D-0001",
      bet_id: "B2",
      campaign_id: "C04",
      decision: "scale",
      title: "Scale college club sign-ups",
      rationale: "Lowest cost per registration in the portfolio and rising weekly registrations.",
      as_of: "2025-03-10",
      outcome_metric: "registrations_per_day",
      evidence: { cpr_14d: null },
      decided_at: new Date("2025-03-10T12:30:00Z"),
    },
    {
      ...base,
      decision_id: "D-0002",
      bet_id: "B5",
      campaign_id: "C02",
      decision: "change",
      title: "Cut paid social spend, refresh creatives",
      rationale: "Cost per registration far above the stop line on a meaningful sample.",
      as_of: "2025-03-18",
      outcome_metric: "cost_per_registration",
      evidence: { cpr_14d: null },
      decided_at: new Date("2025-03-18T12:30:00Z"),
    },
  ];
}
