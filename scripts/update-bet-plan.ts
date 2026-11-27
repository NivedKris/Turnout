/** Applies the reallocated bet plan (budgets + expected visitors) to the five seeded bets, live and baseline, without touching anything else.  npx tsx --conditions=react-server --env-file=.env scripts/update-bet-plan.ts */
import { getClient, getDb } from "../lib/db";
import { baselineName } from "../lib/data/collections";
import { bumpVersion } from "../lib/seed/load";
import { seedBets } from "../lib/seed/strategy";

async function main() {
  const db = await getDb();
  for (const b of seedBets()) {
    for (const coll of ["bets", baselineName("bets")]) {
      const r = await db.collection(coll).updateOne({ bet_id: b.bet_id, origin: "simulated" }, { $set: { budget_inr: b.budget_inr, expected_visitors: b.expected_visitors, provenance: b.provenance } });
      console.log(coll, b.bet_id, "matched", r.matchedCount, "modified", r.modifiedCount);
    }
  }
  await bumpVersion(db);
  console.log("done");
}
main().finally(async () => (await getClient()).close());
