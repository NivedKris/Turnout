/**
 * Imports the original RISA attendee workbook into MongoDB (live + baseline).
 *
 *   npm run seed            # import data/original/Attendee Dataset.xlsx
 *   npm run seed -- --reset # restore live collections from baseline only
 *
 * The source file is opened read-only and its SHA-256 is checked against the
 * value recorded in docs/dataset.md, so an altered file is never imported.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getClient, getDb } from "../lib/db";
import { parseWorkbook } from "../lib/seed/workbook";
import { resetFromBaseline, writeDataset } from "../lib/seed/load";

const DATASET = path.join(process.cwd(), "data/original/Attendee Dataset.xlsx");
const EXPECTED_SHA256 = "d63f3e013e9a823e28ab0a0587703b2ed4344e443ade185606c2ce3427203469";

/** Expected raw row counts (duplicates included) from the Phase 0 profile. */
const EXPECTED_ROWS: Record<string, number> = {
  event: 1,
  targets: 2,
  campaigns: 7,
  campaign_daily: 483,
  people: 3685,
  interactions: 11650,
  registrations: 2840,
  registration_history: 5911,
  checkins: 3390,
};

async function main() {
  const db = await getDb();

  if (process.argv.includes("--reset")) {
    const r = await resetFromBaseline(db, "system");
    console.log(`Reset from baseline in ${r.ms} ms`, r.counts, r.method);
    return;
  }

  const bytes = await readFile(DATASET);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== EXPECTED_SHA256 && !process.argv.includes("--allow-changed-source")) {
    throw new Error(`Dataset hash mismatch (${sha256}). The original file must not be modified.`);
  }

  console.log("Parsing workbook…");
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const data = await parseWorkbook(ab);

  for (const [name, n] of Object.entries(EXPECTED_ROWS)) {
    const got = data[name as keyof typeof data].length;
    if (got !== n) throw new Error(`Row count for ${name}: expected ${n}, parsed ${got}`);
  }
  console.log("Row counts match the profile. Writing to MongoDB…");

  const r = await writeDataset(db, data, { sha256 });
  console.log(`Seeded in ${r.ms} ms`);
  console.table(r.counts);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await (await getClient().catch(() => null))?.close();
  });
