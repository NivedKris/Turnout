import { describe, expect, it } from "vitest";
import {
  bottleneck,
  buildSnapshot,
  campaignKpis,
  evaluateRules,
  flows,
  funnel,
  projection,
  ratio,
  scenario,
  series,
  statusCounts,
  targetVsActual,
  trend,
} from "@/lib/analytics";
import { endOfDayIst, toDayKey } from "@/lib/time";
import { miniDataset } from "./fixtures/mini";

const ds = miniDataset();

describe("time model", () => {
  it("as-of means end of day IST", () => {
    expect(endOfDayIst("2025-03-07").toISOString()).toBe("2025-03-07T18:29:59.999Z");
    expect(toDayKey(new Date("2025-03-07T18:30:00.000Z"))).toBe("2025-03-08");
  });
});

describe("snapshot rules", () => {
  it("deduplicates by source ID, excludes non-external, applies look-ahead", () => {
    const s = buildSnapshot(ds, "2025-03-07");
    expect(s.quality.duplicates.campaign_daily).toBe(1);
    expect(s.quality.duplicates.registration_history).toBe(1);
    expect(s.quality.duplicates.checkins).toBe(1);
    expect(s.quality.excludedPeople).toEqual({ internal: 1 });
    // P1..P6 seen by 7 Mar (W1 first seen 10 Mar)
    expect(s.people.length).toBe(6);
    // R1, R2, R3, R5 (R4 is 8 Mar = future, RN is internal)
    expect(s.registrations.map((r) => r.registration_id).sort()).toEqual(["R1", "R2", "R3", "R5"]);
    expect(s.quality.excludedRegistrationsNonExternal).toBe(1);
  });

  it("uses the latest status at or before the cutoff (cancel → reconfirm)", () => {
    expect(buildSnapshot(ds, "2025-03-04").statusByReg.get("R2")).toBe("confirmed");
    expect(buildSnapshot(ds, "2025-03-07").statusByReg.get("R2")).toBe("cancelled");
    expect(buildSnapshot(ds, "2025-03-09").statusByReg.get("R2")).toBe("confirmed");
  });

  it("counts verified external visitors once each, including walk-ins", () => {
    const s = buildSnapshot(ds, "2025-03-12");
    // P1 (twice → once), P2, W1. P3 denied, P5 pending, N1 internal.
    expect([...s.visitors.keys()].sort()).toEqual(["P1", "P2", "W1"]);
    expect(s.quality.excludedCheckins).toEqual({ denied: 1, pending_or_unverified: 1, non_external: 1, repeat_attempts: 1 });
    expect(s.visitors.get("W1")?.walk_in).toBe(true);
    // Day 1 only
    expect(buildSnapshot(ds, "2025-03-10").visitors.size).toBe(2);
  });

  it("phases and target versions follow the as-of date", () => {
    expect(buildSnapshot(ds, "2025-02-20").phase).toBe("before_history");
    expect(buildSnapshot(ds, "2025-02-20").target).toBeNull();
    expect(buildSnapshot(ds, "2025-03-05").target?.target_version).toBe("v1");
    expect(buildSnapshot(ds, "2025-03-06").target?.target_version).toBe("v2");
    expect(buildSnapshot(ds, "2025-03-09").phase).toBe("pre_event");
    expect(buildSnapshot(ds, "2025-03-10").phase).toBe("during_event");
    expect(buildSnapshot(ds, "2025-03-11").phase).toBe("post_event");
  });

  it("falls back to the default as-of for invalid input", () => {
    expect(buildSnapshot(ds, "not-a-date").asOf).toBe("2025-03-12");
    expect(buildSnapshot(ds).asOf).toBe("2025-03-12");
  });
});

describe("flows and KPIs", () => {
  const s = buildSnapshot(ds, "2025-03-07");

  it("sums deduplicated anonymous counts and net spend (credits subtract)", () => {
    const a = flows(s, { campaignId: "CA" });
    expect(a.impressions).toBe(7000); // duplicate row not counted
    expect(a.clicks).toBe(140);
    expect(a.spend).toBe(6 * 700 - 200); // 4000
    expect(a.registrations).toBe(3);
  });

  it("computes KPIs with hand-checked values and null for zero denominators", () => {
    const k = campaignKpis(s).value;
    const A = k.find((x) => x.campaign_id === "CA")!;
    const B = k.find((x) => x.campaign_id === "CB")!;
    const Z = k.find((x) => x.campaign_id === "CZ")!;
    expect(A.ctr).toBeCloseTo(140 / 7000);
    expect(A.cost_per_registration).toBeCloseTo(4000 / 3);
    expect(A.confirmed).toBe(1); // R1 confirmed, R2 cancelled, R3 interested
    expect(A.cancel_rate).toBeCloseTo(1 / 3);
    expect(B.cost_per_registration).toBe(0); // zero spend, one registration
    expect(Z.ctr).toBeNull();
    expect(Z.cost_per_registration).toBeNull();
    expect(Z.registrations).toBe(0);
    expect(A.show_up_rate).toBeNull(); // before the event
  });

  it("ratio guards zero denominators", () => {
    expect(ratio(5, 0)).toBeNull();
    expect(ratio(0, 5)).toBe(0);
  });

  it("show-up = registered visitors / confirmed at event start", () => {
    const post = buildSnapshot(ds, "2025-03-12");
    // Confirmed at event start: R1, R2 (reconfirmed 8 Mar), R4, R5 → 4. Registered visitors: P1, P2 → 2.
    expect(statusCounts(post, null, true)?.confirmed).toBe(4);
    expect(campaignKpis(post).value.find((x) => x.campaign_id === "CA")!.show_up_rate).toBeCloseTo(2 / 3);
  });
});

describe("funnel", () => {
  it("keeps anonymous and identified layers separate", () => {
    const f = funnel(buildSnapshot(ds, "2025-03-12")).value;
    expect(f.anonymous.map((x) => x.value)).toEqual([10500, 154, 119, 28]);
    expect(f.anonymous[1]!.conversion).toBeCloseTo(154 / 10500);
    // identified (campaign-acquired) P1–P6 = 6; engaged P1, P6 = 2; registered 5; confirmed R1, R2, R4, R5 = 4; attended 2
    expect(f.identified.map((x) => x.value)).toEqual([6, 2, 5, 4, 2]);
    expect(f.walk_ins).toBe(1);
    expect(f.total_visitors).toBe(3);
  });

  it("marks attendance as unavailable before the event", () => {
    const f = funnel(buildSnapshot(ds, "2025-03-07")).value;
    expect(f.identified.at(-1)!.value).toBeNull();
    expect(f.total_visitors).toBe(0);
  });
});

describe("targets and projection", () => {
  it("compares to the target in force with a run-rate", () => {
    const s = buildSnapshot(ds, "2025-03-07");
    const g = targetVsActual(s).value;
    expect(g.target_version).toBe("v2");
    expect(g.days_left).toBe(2); // 8 and 9 Mar
    const regs = g.goals.find((x) => x.key === "registrations")!;
    expect(regs.actual).toBe(4);
    expect(regs.goal).toBe(9);
    expect(regs.required_per_day).toBeCloseTo(5 / 2);
    expect(regs.current_per_day).toBeCloseTo(4 / 7);
  });

  it("projects with hand-checkable arithmetic", () => {
    const s = buildSnapshot(ds, "2025-03-07");
    const p = projection(s).value;
    // A: 3 regs in last 7 days → 3/7/day × 2 days; B: 1/7/day × 2
    expect(p.registrations).toBeCloseTo(4 + (3 / 7) * 2 + (1 / 7) * 2);
    const confirmShare = 2 / 4; // R1, R5 confirmed out of 4
    const regVisitors = p.registrations * confirmShare * 0.72;
    expect(p.registered_visitors).toBeCloseTo(regVisitors);
    expect(p.visitors).toBeCloseTo(regVisitors / 0.95);
    expect(p.spend).toBeCloseTo(4000 + (4000 / 7) * 2);
  });

  it("caps at venue capacity and reports it", () => {
    const s = buildSnapshot(ds, "2025-03-07");
    const p = projection(s, { capacity: 1 }).value;
    expect(p.visitors).toBe(1);
    expect(p.capped_by_capacity).toBe(true);
  });

  it("returns the observed outcome after the event", () => {
    const p = projection(buildSnapshot(ds, "2025-03-12")).value;
    expect(p.method).toBe("actual");
    expect(p.visitors).toBe(3);
  });

  it("scenario: show-up change is proportional; budget shift uses marginal CPR", () => {
    const s = buildSnapshot(ds, "2025-03-07");
    const base = projection(s).value;
    const sc = scenario(s, [{ kind: "set_show_up_rate", value: 0.36 }]).value;
    expect(sc.scenario.registered_visitors).toBeCloseTo(base.registered_visitors / 2);

    // CA trailing-14 CPR = 4000 / 3; added spend converts at 2× that = ₹2,666.67. Adding ₹4000 → +1.5.
    const add = scenario(s, [{ kind: "add_budget", to: "CA", amount: 4000 }]).value;
    expect(add.delta.registrations).toBeCloseTo(1.5);
    expect(add.delta.spend).toBeCloseTo(4000);

    // Removing spend loses at the average CPR: −₹2000 from CA → −1.5 (floored at current registrations).
    const cut = scenario(s, [{ kind: "shift_budget", from: "CA", to: "CB", amount: 2000 }]).value;
    // Base CA = 3 + (3/7)×2 = 3.857; 3.857 − 1.5 = 2.357 < 3 already banked → floored at 3.
    expect(cut.base.by_campaign.find((c) => c.campaign_id === "CA")!.projected_registrations).toBeCloseTo(3 + 6 / 7);
    expect(cut.scenario.by_campaign.find((c) => c.campaign_id === "CA")!.projected_registrations).toBe(3);
  });

  it("scenario: budget moved to a zero-registration campaign is flagged, not invented", () => {
    const s = buildSnapshot(ds, "2025-03-07");
    const r = scenario(s, [{ kind: "add_budget", to: "CZ", amount: 1000 }]);
    expect(r.value.delta.registrations).toBe(0);
    expect(r.value.scenario.notes.join(" ")).toMatch(/can't be estimated/);
  });
});

describe("rules", () => {
  it("returns insufficient_data below the sample size and respects custom thresholds", () => {
    const s = buildSnapshot(ds, "2025-03-07");
    const ev = evaluateRules(s).value.evaluations;
    expect(ev.every((e) => e.verdict === "insufficient_data")).toBe(true); // < 15 regs everywhere
    const custom = evaluateRules(s, { CA: { min_sample: 1, scale_if: 2000, stop_if: 5000 } }).value.evaluations;
    expect(custom.find((e) => e.campaign_id === "CA")!.verdict).toBe("scale"); // 1333 ≤ 2000
    const stop = evaluateRules(s, { CA: { min_sample: 1, scale_if: 500, stop_if: 1000 } }).value.evaluations;
    expect(stop.find((e) => e.campaign_id === "CA")!.verdict).toBe("stop"); // 1333 ≥ 1000
  });
});

describe("trend and series", () => {
  it("contributions of additive metrics sum to 1", () => {
    const s = buildSnapshot(ds, "2025-03-07");
    const t = trend(s, "registrations", 3).value; // 5–7 Mar vs 2–4 Mar
    expect(t.current.value).toBe(1); // R5 on 5 Mar
    expect(t.previous.value).toBe(2); // R2 (2 Mar), R3 (4 Mar)
    expect(t.change).toBe(-1);
    const sum = t.by_campaign.reduce((a, c) => a + (c.contribution ?? 0), 0);
    expect(sum).toBeCloseTo(1);
  });

  it("cumulative series ends at the total", () => {
    const s = buildSnapshot(ds, "2025-03-07");
    const sr = series(s, "spend", { cumulative: true });
    expect(sr.at(-1)!.value).toBe(4000);
    expect(sr.length).toBe(7);
  });
});

describe("bottleneck", () => {
  it("ignores stages below the minimum sample", () => {
    const b = bottleneck(buildSnapshot(ds, "2025-03-07")).value;
    for (const st of b.stages) if (!st.sufficient_sample) expect(b.bottleneck?.key).not.toBe(st.key);
  });
});
