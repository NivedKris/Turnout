import { ObjectId, type Db, type Document } from "mongodb";
import { APP_COLLECTIONS, RESETTABLE, SOURCE_COLLECTIONS, baselineName } from "../data/collections";
import type { SettingsDoc, TaskDoc } from "../models/app";
import type { ParsedDataset } from "./workbook";

/**
 * Writes a parsed dataset to MongoDB as both the live collections and their
 * untouched `baseline_*` twins, then builds indexes. Reset copies baseline → live.
 */

const CHUNK = 2_000;

const INDEXES: Record<string, Document[]> = {
  campaigns: [{ campaign_id: 1 }],
  campaign_daily: [{ activity_id: 1 }, { campaign_id: 1, activity_date: 1 }],
  people: [{ person_id: 1 }, { person_type: 1 }],
  interactions: [{ interaction_id: 1 }, { person_id: 1, occurred_at: 1 }, { campaign_id: 1 }],
  registrations: [{ registration_id: 1 }, { person_id: 1 }, { campaign_id: 1 }],
  registration_history: [{ history_id: 1 }, { registration_id: 1, effective_at: 1 }],
  checkins: [{ event_id: 1 }, { person_id: 1 }, { occurred_at: 1 }],
  targets: [{ effective_at: 1 }],
  tasks: [{ task_id: 1 }, { status: 1, due_date: 1 }, { campaign_id: 1 }],
  activity: [{ at: -1 }, { entity: 1, entity_id: 1 }],
};

export const DEFAULT_SETTINGS: SettingsDoc = {
  _id: "settings",
  city: "Bengaluru",
  festival_name: "CampusFest 2025",
  venue_capacity: 2_500,
  default_as_of: "2025-04-20",
  assumptions: [
    {
      key: "venue_capacity",
      text: "Venue capacity of 2,500 unique verified visitors across both days. The dataset has no capacity field.",
      label: "Assumption",
    },
    {
      key: "city",
      text: "CampusFest is framed as a Bengaluru fest. The dataset is fictional and names no city.",
      label: "Assumption",
    },
    {
      key: "free_show_up_benchmark",
      text: "Free events: ~28% median no-show (≈72% show-up); large free events ~24% no-show.",
      label: "Sourced",
      url: "https://pheedloop.com/blog/event-data-lab-report-5",
    },
    {
      key: "meta_ctr_benchmark",
      text: "Meta ads CTR in India typically 1.0–1.5%.",
      label: "Sourced",
      url: "https://owlclaw.com/benchmarks/meta-ads-benchmarks-india",
    },
  ],
};

/** A few starter tasks so the management view isn't empty. Clearly marked simulated. */
export function seedTasks(): TaskDoc[] {
  const at = (s: string) => new Date(s);
  const base = { origin: "simulated" as const, created_by: "seed" as const, source_insight: null };
  return [
    {
      ...base,
      task_id: "TK-0001",
      title: "Brief college club leads on group registration flow",
      description: "Walk partner club organisers through the group sign-up form before the March push.",
      campaign_id: "C04",
      owner_id: "T03",
      owner_name: "Meera Iyer",
      due_date: "2025-03-05",
      status: "done",
      priority: "P1",
      created_at: at("2025-02-20T04:30:00Z"),
      updated_at: at("2025-03-04T09:00:00Z"),
    },
    {
      ...base,
      task_id: "TK-0002",
      title: "Refresh paid social creatives (fatigue check)",
      description: "Swap the two oldest ad sets and compare click-to-session rate week over week.",
      campaign_id: "C02",
      owner_id: "T04",
      owner_name: "Arjun Verma",
      due_date: "2025-03-20",
      status: "doing",
      priority: "P1",
      created_at: at("2025-03-10T04:30:00Z"),
      updated_at: at("2025-03-12T04:30:00Z"),
    },
    {
      ...base,
      task_id: "TK-0003",
      title: "Send confirmation reminder to interested-but-unconfirmed registrants",
      description: "Target registrations whose latest status is still 'interested'.",
      campaign_id: null,
      owner_id: "T06",
      owner_name: "Dev Malhotra",
      due_date: "2025-04-05",
      status: "todo",
      priority: "P0",
      created_at: at("2025-03-25T04:30:00Z"),
      updated_at: at("2025-03-25T04:30:00Z"),
    },
    {
      ...base,
      task_id: "TK-0004",
      title: "Gate staffing plan for day-1 peak (10:00–13:00)",
      description: "Two scanner lanes plus one manual desk; reconcile manual entries nightly.",
      campaign_id: null,
      owner_id: "T05",
      owner_name: "Nisha Rao",
      due_date: "2025-04-10",
      status: "todo",
      priority: "P1",
      created_at: at("2025-03-28T04:30:00Z"),
      updated_at: at("2025-03-28T04:30:00Z"),
    },
  ];
}

async function insertChunked(db: Db, name: string, docs: Document[]) {
  for (let i = 0; i < docs.length; i += CHUNK) {
    await db.collection(name).insertMany(docs.slice(i, i + CHUNK), { ordered: false });
  }
}

async function dropIfExists(db: Db, name: string) {
  const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();
  if (exists) await db.collection(name).drop();
}

async function ensureIndexes(db: Db) {
  for (const [name, specs] of Object.entries(INDEXES)) {
    for (const key of specs) await db.collection(name).createIndex(key);
  }
}

export type SeedResult = { counts: Record<string, number>; ms: number };

export async function writeDataset(db: Db, data: ParsedDataset, meta: { sha256: string }): Promise<SeedResult> {
  const t0 = performance.now();
  const counts: Record<string, number> = {};

  const appSeed: Record<string, Document[]> = {
    [APP_COLLECTIONS.settings]: [DEFAULT_SETTINGS],
    [APP_COLLECTIONS.tasks]: seedTasks(),
  };

  const all: Record<string, Document[]> = { ...appSeed };
  for (const name of Object.values(SOURCE_COLLECTIONS)) {
    // Same _id in live and baseline so references survive a reset.
    all[name] = data[name as keyof ParsedDataset].map((d) => ({ _id: new ObjectId(), ...d }));
  }

  for (const [name, docs] of Object.entries(all)) {
    await dropIfExists(db, name);
    await dropIfExists(db, baselineName(name));
    if (docs.length) {
      await insertChunked(db, name, docs);
      await insertChunked(db, baselineName(name), docs);
    }
    counts[name] = docs.length;
  }

  await ensureIndexes(db);
  await db.collection(APP_COLLECTIONS.meta).replaceOne(
    { _id: "dataset" as never },
    { sha256: meta.sha256, imported_at: new Date(), counts },
    { upsert: true },
  );
  await db.collection(APP_COLLECTIONS.activity).insertOne({
    entity: "dataset",
    entity_id: "all",
    action: "seed",
    before: null,
    after: { counts },
    actor: "system",
    summary: `Imported original dataset (${Object.values(counts).reduce((a, b) => a + b, 0)} records)`,
    at: new Date(),
  });

  return { counts, ms: Math.round(performance.now() - t0) };
}

/**
 * Restores every resettable collection from its baseline twin. Uses a server-side
 * `$out` (atomic per collection, no data transfer), falling back to a chunked copy.
 * The activity log is append-only and is NOT cleared. A reset entry is added.
 */
export async function resetFromBaseline(db: Db, actor: "user" | "system" = "user"): Promise<SeedResult & { method: Record<string, "out" | "copy"> }> {
  const t0 = performance.now();
  const counts: Record<string, number> = {};
  const method: Record<string, "out" | "copy"> = {};

  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );
  const missing = RESETTABLE.filter((n) => !existing.has(baselineName(n)));
  if (missing.length) throw new Error(`Baseline missing for: ${missing.join(", ")}. Run the seed first.`);

  // $out replaces each target atomically and keeps its existing indexes, so collections run in parallel.
  await Promise.all(
    RESETTABLE.map(async (name) => {
      const base = db.collection(baselineName(name));
      try {
        await base.aggregate([{ $out: name }]).toArray();
        method[name] = "out";
      } catch {
        await db.collection(name).deleteMany({});
        const docs = await base.find({}).toArray();
        if (docs.length) await insertChunked(db, name, docs);
        method[name] = "copy";
      }
      counts[name] = await db.collection(name).estimatedDocumentCount();
    }),
  );

  if (Object.values(method).includes("copy")) await ensureIndexes(db);
  await db.collection(APP_COLLECTIONS.activity).insertOne({
    entity: "dataset",
    entity_id: "all",
    action: "reset",
    before: null,
    after: { counts },
    actor,
    summary: "Restored all data to the original dataset baseline",
    at: new Date(),
  });
  return { counts, method, ms: Math.round(performance.now() - t0) };
}
