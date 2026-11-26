/**
 * The analytics engine. Pure functions over a Dataset/Snapshot with no I/O.
 * The dashboard and the copilot both call these, so the numbers always match.
 */
export * from "./types";
export * from "./benchmarks";
export { buildSnapshot, dedupeBy, type Snapshot, type Visitor, type DayRange } from "./snapshot";
export { flows, funnel, campaignKpis, ratio, statusCounts, registeredVisitors, type Flows, type Funnel, type CampaignKpis, type Scope } from "./metrics";
export { projection, scenario, targetVsActual, campaignRates, type ScenarioChange, type ProjectionValue, type GoalStatus } from "./projection";
export { bottleneck, trend, series, TREND_METRICS, type TrendMetric, type StageCheck } from "./diagnose";
export { evaluateRules, reallocation, type Verdict, type Thresholds, type RuleEvaluation, type Move } from "./rules";
export { dataCoverage, NOT_IN_DATA } from "./coverage";
