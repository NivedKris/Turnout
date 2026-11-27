import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  bottleneck,
  buildSnapshot,
  campaignKpis,
  campaignRates,
  dataCoverage,
  evaluateRules,
  flows,
  funnel,
  projection,
  reallocation,
  statusCounts,
  targetVsActual,
  type Dataset,
} from "@/lib/analytics";
import { datasetFromParsed } from "@/lib/seed/to-dataset";
import { parseWorkbook } from "@/lib/seed/workbook";
import golden from "./fixtures/golden.pandas.json";

/**
 * Golden tests: the TypeScript engine on the real RISA workbook must reproduce
 * figures computed independently in pandas (tests/fixtures/golden.py).
 */
let ds: Dataset;

beforeAll(async () => {
  const bytes = await readFile(path.join(process.cwd(), "data/original/Attendee Dataset.xlsx"));
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  ds = datasetFromParsed(await parseWorkbook(ab));
});

type G = (typeof golden)["2025-03-31"];

describe.each(["2025-02-14", "2025-03-31", "2025-04-20"] as const)("as of %s matches pandas", (asOf) => {
  const g = golden[asOf] as G;

  it("headline counts", () => {
    const s = buildSnapshot(ds, asOf);
    const f = flows(s);
    expect(s.people.length).toBe(g.identified);
    expect(f.registrations).toBe(g.registrations);
    expect(f.impressions).toBe(g.impressions);
    expect(f.clicks).toBe(g.clicks);
    expect(f.sessions).toBe(g.sessions);
    expect(f.registration_starts).toBe(g.starts);
    expect(f.spend).toBe(g.spend);
    expect(s.visitors.size).toBe(g.visitors);
  });

  it("statuses, engagement and funnel", () => {
    const s = buildSnapshot(ds, asOf);
    const st = statusCounts(s)!;
    for (const [k, v] of Object.entries(g.status)) expect(st[k as keyof typeof st]).toBe(v);
    const fu = funnel(s).value;
    expect(fu.identified[0]!.value).toBe(g.identified_campaign);
    expect(fu.identified[1]!.value).toBe(g.engaged);
  });

  it("per-campaign registrations and spend", () => {
    const k = campaignKpis(buildSnapshot(ds, asOf)).value;
    for (const [id, v] of Object.entries(g.by_campaign)) {
      const row = k.find((x) => x.campaign_id === id)!;
      expect(row.registrations).toBe(v.regs);
      expect(row.spend).toBe(v.spend);
    }
  });

  it("trailing windows used by projection and rules", () => {
    const s = buildSnapshot(ds, asOf);
    const rates = campaignRates(s);
    const last7 = rates.reduce((a, r) => a + r.reg_rate_7d * 7, 0);
    expect(Math.round(last7)).toBe(g.regs_last7);
    for (const [id, n] of Object.entries(g.regs_last7_by)) {
      expect(Math.round(rates.find((r) => r.campaign_id === id)!.reg_rate_7d * 7)).toBe(n);
    }
    for (const [id, v] of Object.entries(g.last14_by)) {
      const r = rates.find((x) => x.campaign_id === id)!;
      if (v.regs === 0) expect(r.marginal_cpr).toBeNull();
      else expect(r.marginal_cpr).toBeCloseTo(v.spend / v.regs, 6);
    }
  });
});

describe("final outcome (20 Apr 2025)", () => {
  it("target vs actual against the revised plan", () => {
    const t = targetVsActual(buildSnapshot(ds, "2025-04-20")).value;
    expect(t.target_version).toBe("Attendee revised plan");
    const by = Object.fromEntries(t.goals.map((x) => [x.key, x]));
    expect(by.identified!.actual).toBe(3625);
    expect(by.identified!.status).toBe("achieved");
    expect(by.registrations!.pct).toBeCloseTo(2800 / 3200);
    expect(by.visitors!.actual).toBe(2050);
    expect(by.visitors!.pct).toBeCloseTo(2050 / 2200);
    expect(by.spend!.actual).toBe(274000);
    expect(by.spend!.status).toBe("under_budget");
  });

  it("show-up rate = 1925 / 2500", () => {
    const s = buildSnapshot(ds, "2025-04-20");
    expect(statusCounts(s, null, true)!.confirmed).toBe(golden.confirmed_at_start);
    const fu = funnel(s).value;
    expect(fu.identified.at(-1)!.value).toBe(1925);
    expect(fu.walk_ins).toBe(125);
    expect(fu.total_visitors).toBe(2050);
    expect(fu.identified.at(-1)!.conversion).toBeCloseTo(1925 / 2500);
  });

  it("projection reports the observed outcome", () => {
    const p = projection(buildSnapshot(ds, "2025-04-20")).value;
    expect(p.method).toBe("actual");
    expect(p.visitors).toBe(2050);
  });

  it("coverage reports duplicates and exclusions", () => {
    const s = buildSnapshot(ds, "2025-04-20");
    const c = dataCoverage(ds, s).value;
    expect(s.quality.duplicates).toMatchObject({ campaign_daily: 2, registration_history: 4, checkins: 20 });
    expect(s.quality.excludedPeople).toEqual({ internal: 40, staff: 10, test: 10 });
    expect(s.quality.excludedCheckins.denied).toBe(50);
    expect(s.quality.excludedCheckins.pending_or_unverified).toBe(30);
    expect(s.quality.excludedCheckins.non_external).toBe(40);
    expect(c.not_in_data.length).toBeGreaterThan(5);
  });
});

describe("31 Mar 2025: live decision point", () => {
  const asOf = "2025-03-31";

  it("base projection by hand: 2,337 + 50/day × 11 days", () => {
    const s = buildSnapshot(ds, asOf);
    expect(s.regDaysLeft).toBe(11);
    const p = projection(s).value;
    expect(p.registrations).toBeCloseTo(2337 + (350 / 7) * 11);
    const share = 1962 / 2337;
    expect(p.visitors).toBeCloseTo(((2337 + 550) * share * 0.72) / 0.95, 6);
    expect(p.spend).toBeCloseTo(248150 + (26500 / 7) * 11, 6);
    const stretch = projection(s, { mode: "stretch" }).value;
    expect(stretch.registrations).toBeGreaterThan(p.registrations);
  });

  it("rules: portfolio CPR = 50,475 / 686 and verdicts follow thresholds", () => {
    const r = evaluateRules(buildSnapshot(ds, asOf)).value;
    expect(r.portfolio_cpr).toBeCloseTo(50475 / 686);
    const v = Object.fromEntries(r.evaluations.map((e) => [e.campaign_id, e]));
    // C02: 19,200 / 75 = ₹256 ≥ 1.5 × 73.6, but only its 2nd stop reading in a row at the Monday
    // reviews (24 Mar ₹135, 31 Mar ₹256), so it is "change: hold new spend", not yet a stop.
    expect(v.C02!.value).toBeCloseTo(256);
    expect(v.C02!.verdict).toBe("change");
    expect(v.C02!.stop_check!.count).toBe(2);
    // C03 reached 3 stop readings in a row on Monday 3 Mar (17 Feb, 24 Feb, 3 Mar); stops are sticky.
    expect(v.C03!.verdict).toBe("stop");
    expect(v.C03!.stopped_on).toBe("2025-03-03");
    expect(v.C07!.verdict).toBe("scale");
    for (const e of r.evaluations) {
      if (e.verdict === "scale") expect(e.value!).toBeLessThanOrEqual(e.thresholds.scale_if);
      if (e.verdict === "stop") expect(e.stopped_on).toBeTruthy();
    }
    // Without confirmation the single-window verdict is still a stop.
    const raw = Object.fromEntries(evaluateRules(buildSnapshot(ds, asOf), {}, { confirm: false }).value.evaluations.map((e) => [e.campaign_id, e.verdict]));
    expect(raw.C02).toBe("stop");
  });

  it("stop rule replay: 3 Monday stop readings in a row on >= 30 registrations", () => {
    // Paid Social's stop is confirmed on the next Monday after the decision point.
    const late = Object.fromEntries(evaluateRules(buildSnapshot(ds, "2025-04-20")).value.evaluations.map((e) => [e.campaign_id, e]));
    expect(late.C02!.stopped_on).toBe("2025-04-07");
    // Nothing is a confirmed stop before enough Mondays have passed.
    expect(evaluateRules(buildSnapshot(ds, "2025-02-16")).value.evaluations.some((e) => e.verdict === "stop")).toBe(false);
  });

  it("reallocation on 31 Mar: ₹16,800 from the confirmed stop and the held campaign", () => {
    const r = reallocation(buildSnapshot(ds, asOf)).value;
    expect(r.moves.reduce((a, m) => a + m.amount, 0)).toBe(16800);
    expect(r.effect!.delta.registrations).toBeCloseTo(130.6, 0);
    expect(r.effect!.delta.visitors).toBeCloseTo(83.1, 0);
  });

  it("reallocation moves money from stop to scale and improves the projection", () => {
    const s = buildSnapshot(ds, asOf);
    const r = reallocation(s).value;
    const verdicts = Object.fromEntries(evaluateRules(s).value.evaluations.map((e) => [e.campaign_id, e.verdict]));
    expect(r.moves.length).toBeGreaterThan(0);
    for (const m of r.moves) {
      expect(verdicts[m.to]).toBe("scale");
      if (m.from) expect(["stop", "change"]).toContain(verdicts[m.from]);
      expect(m.amount).toBeGreaterThan(0);
    }
    expect(r.effect!.delta.registrations).toBeGreaterThan(0);
    expect(r.budget_left).toBe(300000 - 248150);
  });

  it("bottleneck is a stage below its benchmark with enough sample", () => {
    const b = bottleneck(buildSnapshot(ds, asOf)).value;
    if (b.bottleneck) {
      expect(b.bottleneck.index!).toBeLessThan(1);
      expect(b.bottleneck.sufficient_sample).toBe(true);
      expect(b.stages.every((x) => x.index === null || !x.sufficient_sample || x.index >= b.bottleneck!.index!)).toBe(true);
    }
  });
});
