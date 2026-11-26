/**
 * Adds the strategy layer (goal model, bets, decisions) to an existing database
 * (live + baseline) without re-importing the dataset.   npm run seed:strategy
 */
import { ObjectId } from "mongodb";
import { getClient, getDb } from "../lib/db";
import { baselineName } from "../lib/data/collections";
import { bumpVersion, insertChunked } from "../lib/seed/load";
import { defaultGoalModel, seedBets, seedDecisions } from "../lib/seed/strategy";

async function main() {
  const db = await getDb();
  const sets: [string, Record<string, unknown>[]][] = [
    ["goal_model", [defaultGoalModel() as unknown as Record<string, unknown>]],
    ["bets", seedBets().map((d) => ({ _id: new ObjectId(), ...d }))],
    ["decisions", seedDecisions().map((d) => ({ _id: new ObjectId(), ...d }))],
  ];
  for (const [name, docs] of sets) {
    for (const coll of [name, baselineName(name)]) {
      await db.collection(coll).deleteMany({});
      await insertChunked(db, coll, docs);
    }
    console.log(`${name}: ${docs.length}`);
  }
  await db.collection("bets").createIndex({ bet_id: 1 });
  await db.collection("decisions").createIndex({ decision_id: 1 });
  await bumpVersion(db);
  console.log("done");
}
main().finally(async () => (await getClient()).close());
