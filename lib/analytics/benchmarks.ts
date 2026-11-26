import type { Assumption } from "./types";

/**
 * External benchmarks and modelling assumptions. Each one is labelled. See docs/research.md.
 * These are defaults; scenario inputs can override them.
 */
export type Benchmark = { value: number; text: string; label: Assumption["label"]; url?: string };

export const BENCHMARKS = {
  ctr: {
    value: 0.01,
    text: "Meta ads CTR in India ≈ 1.0–1.5%; the low end (1.0%) is used as the floor",
    label: "Sourced",
    url: "https://owlclaw.com/benchmarks/meta-ads-benchmarks-india",
  },
  click_to_session: {
    value: 0.7,
    text: "≈70% of clicks should land as sessions (redirect and bounce loss)",
    label: "Assumption",
  },
  session_to_start: {
    value: 0.15,
    text: "≈15% of landing sessions should start the registration form",
    label: "Assumption",
  },
  registered_to_confirmed: {
    value: 0.9,
    text: "≈90% of registrations should be in confirmed status",
    label: "Assumption",
  },
  show_up_free: {
    value: 0.72,
    text: "Free events: ~28% median no-show, so ≈72% show-up",
    label: "Sourced",
    url: "https://pheedloop.com/blog/event-data-lab-report-5",
  },
  show_up_free_large: {
    value: 0.76,
    text: "Large free events (500+): ~24% median no-show, so ≈76% show-up",
    label: "Sourced",
    url: "https://pheedloop.com/blog/event-data-lab-report-5",
  },
  walk_in_share: {
    value: 0.05,
    text: "Walk-ins (no registration) ≈5% of verified visitors",
    label: "Assumption",
  },
  marginal_cost_multiplier: {
    value: 2,
    text: "Extra spend converts at 2× a campaign's recent average cost per registration (diminishing returns)",
    label: "Assumption",
  },
  max_scale_factor: {
    value: 2,
    text: "A campaign can absorb at most 2× its current daily spend before returns diminish sharply",
    label: "Assumption",
  },
} as const satisfies Record<string, Benchmark>;

export const asAssumption = (b: Benchmark): Assumption => ({ text: b.text, label: b.label, url: b.url });

/** Dataset rules quoted from the source field guide; attached wherever they are applied. */
export const RULES = {
  dedup: { text: "Exact repeated source IDs are import copies and count once", label: "Dataset rule" },
  external_only: {
    text: "Targets apply to external people only; internal, staff and test identities are excluded",
    label: "Dataset rule",
  },
  verified_admission: {
    text: "Only admitted + verified check-ins establish attendance; one visitor counts once",
    label: "Dataset rule",
  },
  latest_status: {
    text: "Registration status = latest history version effective at or before the as-of cutoff",
    label: "Dataset rule",
  },
  end_of_day: { text: "An as-of date means the end of that day in IST; later records are ignored", label: "Dataset rule" },
  reach_not_unique: {
    text: "Summed daily reach and impressions are events, not unique people",
    label: "Dataset rule",
  },
  net_spend: { text: "Spend is net posted ledger amount; negative rows are vendor credits", label: "Dataset rule" },
  registration_attribution: {
    text: "Attribution = registration's recorded acquisition campaign (identical to first-touch campaign in this dataset)",
    label: "Dataset rule",
  },
  reg_window: {
    text: "Registrations are assumed to close at the end of the day before the event (last observed: 10 Apr)",
    label: "Assumption",
  },
} as const satisfies Record<string, Assumption>;
