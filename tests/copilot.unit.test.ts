import { describe, expect, it } from "vitest";
import { extractClaims, groundClaims } from "@/lib/copilot/claims";
import { routeTools } from "@/lib/copilot/router";

describe("claim extraction", () => {
  it("finds money, counts and percentages; skips dates, years, IDs and list markers", () => {
    const c = extractClaims("1. Registrations 2,337 vs 3,200 (73.0%) as of 31 Mar 2025-03-31, C02 spent ₹19,200 in 2025.");
    expect(c.map((x) => x.text)).toEqual(["2,337", "3,200", "73.0%", "₹19,200"]);
    expect(c.find((x) => x.text === "73.0%")!.isPct).toBe(true);
  });
  it("understands lakh and k suffixes", () => {
    expect(extractClaims("about ₹2.5 lakh and 3.1k clicks").map((x) => x.value)).toEqual([250000, 3100]);
  });
});

describe("claim grounding", () => {
  const outputs = [{ nodeId: "tool:a", output: { registrations: 2337, pct_of_goal: 0.7303, cpr: 73.5765 } }];
  it("supports numbers present in tool output, including % as fractions and rounding", () => {
    const g = groundClaims("2,337 registrations, 73.0% of goal, CPR ₹73.58", outputs);
    expect(g.every((x) => x.supportedBy.includes("tool:a"))).toBe(true);
  });
  it("flags numbers no tool returned", () => {
    const g = groundClaims("we moved ₹16,800", outputs);
    expect(g[0]!.supportedBy).toEqual([]);
  });
});

describe("tool router", () => {
  it("routes by intent and always includes calculate + coverage", () => {
    expect(routeTools(["Are we on track?"])).toEqual(expect.arrayContaining(["get_overview", "calculate", "get_data_coverage"]));
    expect(routeTools(["Which campaign should we cut?"])).toEqual(expect.arrayContaining(["get_rule_evaluations", "suggest_reallocation"]));
  });
  it("carries intent into short follow-ups", () => {
    expect(routeTools(["Where's our biggest bottleneck?", "and for Paid Social?"])).toEqual(expect.arrayContaining(["get_bottleneck", "get_campaign"]));
  });
  it("never offers more than 8 tools", () => {
    expect(routeTools(["why should we cut paid social campaign budget what if trend task create compare"]).length).toBeLessThanOrEqual(8);
  });
});
