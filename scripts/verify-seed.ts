/**
 * Cross-checks the imported data against the independent pandas profile
 * (docs/dataset.md). Pure Mongo aggregations, without the app's analytics engine,
 * so it validates the import on its own.   npm run verify-seed
 */
import { getClient, getDb } from "../lib/db";

const EXPECT = {
  r0001_registered_at: "2025-03-02T04:30:00.000Z", // 10:00 IST
  identified_external_people: 3625,
  external_registered_people: 2800,
  unique_verified_external_visitors: 2050,
  net_spend_inr: 274000,
  daily_unique_activity_ids: 481,
  history_unique_ids: 5907,
  checkin_unique_ids: 3370,
};

async function main() {
  const db = await getDb();
  const got: Record<string, unknown> = {};

  const r1 = await db.collection("registrations").findOne({ registration_id: "R0001" });
  got.r0001_registered_at = (r1?.registered_at as Date | undefined)?.toISOString();

  got.identified_external_people = await db.collection("people").countDocuments({ person_type: "external" });

  const ext = await db
    .collection("people")
    .find({ person_type: "external" }, { projection: { person_id: 1 } })
    .map((d) => d.person_id as string)
    .toArray();
  got.external_registered_people = (
    await db.collection("registrations").distinct("person_id", { person_id: { $in: ext } })
  ).length;
  got.unique_verified_external_visitors = (
    await db
      .collection("checkins")
      .distinct("person_id", { result: "admitted", verification: "verified", person_id: { $in: ext } })
  ).length;

  const spend = await db
    .collection("campaign_daily")
    .aggregate([
      { $group: { _id: "$activity_id", s: { $first: "$marketing_spend_inr" } } },
      { $group: { _id: null, total: { $sum: "$s" }, n: { $sum: 1 } } },
    ])
    .next();
  got.net_spend_inr = spend?.total;
  got.daily_unique_activity_ids = spend?.n;
  got.history_unique_ids = (await db.collection("registration_history").distinct("history_id")).length;
  got.checkin_unique_ids = (await db.collection("checkins").distinct("event_id")).length;

  let fail = 0;
  for (const [k, v] of Object.entries(EXPECT)) {
    const ok = got[k] === v;
    if (!ok) fail++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${k.padEnd(36)} expected ${v}  got ${got[k]}`);
  }
  if (fail) process.exitCode = 1;
}

main().finally(async () => (await getClient()).close());
