/** Prints the engine's view of a date from the original workbook (no DB). npx tsx scripts/engine-report.mts 2025-03-31 */
import { readFile } from "node:fs/promises";
import { bottleneck, buildSnapshot, evaluateRules, projection, reallocation, targetVsActual, trend } from "../lib/analytics";
import { datasetFromParsed } from "../lib/seed/to-dataset";
import { parseWorkbook } from "../lib/seed/workbook";
import { inr, pct, num } from "../lib/format";

const asOf = process.argv[2] ?? "2025-03-31";
const b = await readFile("data/original/Attendee Dataset.xlsx");
const ds = datasetFromParsed(await parseWorkbook(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
const s = buildSnapshot(ds, asOf);
console.log(`\n== ${asOf}  phase=${s.phase}  days left=${s.regDaysLeft}  target=${s.target?.target_version}`);
for (const g of targetVsActual(s).value.goals)
  console.log(`  ${g.label.padEnd(28)} actual ${num(g.actual).padStart(8)}  goal ${num(g.goal).padStart(8)}  ${pct(g.pct)}  proj ${num(g.projected)}  need/day ${num(g.required_per_day, 1)}  now/day ${num(g.current_per_day, 1)}  ${g.status}`);
const p = projection(s).value, st = projection(s, { mode: "stretch" }).value;
console.log(`  projection base: regs ${num(p.registrations)} visitors ${num(p.visitors)} spend ${inr(p.spend)} | stretch: regs ${num(st.registrations)} visitors ${num(st.visitors)}`, p.notes);
const bn = bottleneck(s).value;
console.log("  stages:"); for (const x of bn.stages) console.log(`    ${x.key.padEnd(26)} ${pct(x.actual)} vs ${pct(x.benchmark)} idx ${x.index?.toFixed(2)} n=${x.denominator} worst=${x.worst_campaigns.map(w => `${w.campaign_id}:${pct(w.rate)}`).join(",")}`);
console.log(`  BOTTLENECK: ${bn.bottleneck?.key ?? "none"}`);
const r = evaluateRules(s).value; console.log(`  rules (portfolio CPR ${inr(r.portfolio_cpr)}):`);
for (const e of r.evaluations) console.log(`    ${e.campaign_id} ${e.campaign_name.padEnd(22)} ${e.verdict.padEnd(17)} ${e.reason}`);
const ra = reallocation(s).value; console.log(`  reallocation: ${ra.reason} budget left ${inr(ra.budget_left)} planned ${inr(ra.planned_future_spend)} headroom ${inr(ra.headroom)}`);
for (const m of ra.moves) console.log(`    ${inr(m.amount)} ${m.from_name} → ${m.to_name}`);
if (ra.effect) console.log(`    effect: +${num(ra.effect.delta.registrations, 1)} regs, +${num(ra.effect.delta.visitors, 1)} visitors`);
const t = trend(s, "registrations", 7).value; console.log(`  WoW registrations: ${t.current.value} vs ${t.previous.value} (${pct(t.change_pct)}) top: ${t.by_campaign.slice(0, 3).map(c => `${c.campaign_id} ${c.change}`).join(", ")}`);
