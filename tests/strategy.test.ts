import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildSnapshot, decisionOutcome, evaluateBet, goalModel, ownerWorkload, signalValue, weeklyDrivers, type Dataset } from "@/lib/analytics";
import { datasetFromParsed } from "@/lib/seed/to-dataset";
import { parseWorkbook } from "@/lib/seed/workbook";

let ds: Dataset;
beforeAll(async () => {
  const b = await readFile(path.join(process.cwd(), "data/original/Attendee Dataset.xlsx"));
  ds = datasetFromParsed(await parseWorkbook(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
});

describe("goal model", () => {
  it("computes base by hand and caps stretch at capacity", () => {
    const s = buildSnapshot(ds, "2025-03-31");
    const g = goalModel(ds.goalModel!, s).value;
    // 240k×5%×12%×80% + 420k×3%×8%×75% + 90k×6%×10%×78% + 60k×10%×9%×85% + 20k×25%×8%×80%
    const regs = 1152 + 756 + 421.2 + 459 + 320;
    expect(g.base.registrations).toBeCloseTo(regs, 6);
    expect(g.base.visitors).toBeCloseTo((regs * 0.89 * 0.72) / 0.95, 6);
    expect(g.stretch.visitors).toBe(s.capacity);
    expect(g.stretch.capped).toBe(true);
    const row = g.plan_vs_data.find((r) => r.key === "registrations")!;
    expect(row.data_label).toBe("projected");
  });
});

describe("bets and signals", () => {
  it("paid social retargeting (B5) is a stop on cost per registration at 31 Mar", () => {
    const s = buildSnapshot(ds, "2025-03-31");
    const e = evaluateBet(ds.bets!.find((b) => b.bet_id === "B5")!, s);
    const cpr = e.signals.find((x) => x.metric === "cost_per_registration")!;
    expect(cpr.value).toBeCloseTo(19200 / 75);
    expect(cpr.state).toBe("stop");
    expect(e.verdict).toBe("stop");
    expect(e.signals.find((x) => x.metric === "show_up_rate")!.state).toBe("not_yet");
  });
  it("club sign-ups (B2) scale on CPR but watch on confirm rate", () => {
    const s = buildSnapshot(ds, "2025-03-31");
    const e = evaluateBet(ds.bets!.find((b) => b.bet_id === "B2")!, s);
    expect(e.signals.find((x) => x.metric === "cost_per_registration")!.state).toBe("scale");
    expect(e.signals.find((x) => x.metric === "confirm_rate")!.state).toBe("watch");
    expect(e.verdict).toBe("watch");
    expect(e.visitors_basis).toBe("projected");
  });
  it("after the event, bets report actual visitors", () => {
    const e = evaluateBet(ds.bets!.find((b) => b.bet_id === "B1")!, buildSnapshot(ds, "2025-04-20"));
    expect(e.visitors_basis).toBe("actual");
    expect(e.visitors_actual_or_projected).toBe(390);
  });
});

describe("decision outcomes", () => {
  it("compares the 14 days before with the 14 after (weekly spend ledgers)", () => {
    const s = buildSnapshot(ds, "2025-04-20");
    const d = ds.decisions!.find((x) => x.decision_id === "D-0002")!;
    const o = decisionOutcome(d, s, ds);
    expect(o.status).toBe("measured");
    expect(o.improved).toBe(false); // ₹195 → ₹246: the cut did not lower cost per registration
    expect(o.before).toBeCloseTo(signalValue(s, ["C02"], "cost_per_registration", 14, "2025-03-18").value!);
    expect(o.after).toBeCloseTo(signalValue(s, ["C02"], "cost_per_registration", 14, "2025-04-01").value!);
  });
  it("is 'future' when the selected date is before the decision", () => {
    const o = decisionOutcome(ds.decisions![0]!, buildSnapshot(ds, "2025-03-01"), ds);
    expect(o.status).toBe("future");
  });
});

describe("weekly drivers and owners", () => {
  it("names the week-on-week change in registrations", () => {
    const d = weeklyDrivers(buildSnapshot(ds, "2025-03-31")).find((x) => x.metric === "registrations")!;
    expect(d.change).toBe(350 - 336);
    expect(d.sentence).toMatch(/^Registrations up 14/);
  });
  it("groups campaigns, bets and tasks by owner", () => {
    const o = ownerWorkload(ds, buildSnapshot(ds, "2025-03-31")).find((x) => x.owner_name === "Meera Iyer")!;
    expect(o.campaigns.map((c) => c.campaign_id).sort()).toEqual(["C01", "C04"]);
    expect(o.bets.map((b) => b.bet_id).sort()).toEqual(["B1", "B2"]);
  });
});
