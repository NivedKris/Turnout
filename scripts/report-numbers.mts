/** Numbers quoted in the README, from the original workbook (no DB). npx tsx scripts/report-numbers.mts */
import { readFile } from "node:fs/promises";
import { buildSnapshot, projection, scenario } from "../lib/analytics";
import { goalModel } from "../lib/analytics/strategy";
import { defaultGoalModel, seedBets } from "../lib/seed/strategy";
import { datasetFromParsed } from "../lib/seed/to-dataset";
import { parseWorkbook } from "../lib/seed/workbook";

const b = await readFile("data/original/Attendee Dataset.xlsx");
const ds = datasetFromParsed(await parseWorkbook(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
const s = buildSnapshot(ds, "2025-03-31");
const gm = goalModel(defaultGoalModel(), s).value;
console.log("SEGMENTS"); for (const g of gm.segments) console.log(JSON.stringify(g));
console.log("BASE", JSON.stringify(gm.base)); console.log("STRETCH", JSON.stringify(gm.stretch));
console.log("PLAN_VS_DATA", JSON.stringify(gm.plan_vs_data));
console.log("RICE"); for (const x of seedBets()) console.log(x.bet_id, x.title, x.rice.reach * x.rice.impact * x.rice.confidence / x.rice.effort, x.budget_inr, x.expected_visitors, JSON.stringify(x.rice));
const base = projection(s).value;
console.log("BASE31", base.registrations, base.visitors);
for (const v of [0.8, 0.76, 0.72, 0.6, 0.5, 0.4]) console.log("SHOWUP", v, scenario(s, [{ kind: "set_show_up_rate", value: v }]).value.scenario.visitors.toFixed(1));
for (const v of [0, 0.05, 0.1]) console.log("WALKIN", v, scenario(s, [{ kind: "set_walk_in_share", value: v }]).value.scenario.visitors.toFixed(1));
for (const v of [1800, 2000, 2500]) console.log("CAP", v, scenario(s, [{ kind: "set_capacity", value: v }]).value.scenario.visitors.toFixed(1));
console.log("STRETCH31", JSON.stringify(projection(s, { mode: "stretch" }).value.visitors));
