import "server-only";
import { cache } from "react";
import type { Db, Document } from "mongodb";
import { getDb } from "../db";
import type { Dataset } from "./types";

/**
 * Loader: reads the live collections and returns a plain Dataset for the engine.
 *
 * Freshness without reloading everything on every request:
 *  - `meta.data_version` is a counter that every write path bumps (bumpDataVersion).
 *  - Each request reads only that tiny document. If the version matches the instance's
 *    in-memory copy, that copy is reused; otherwise the full dataset is reloaded.
 *  So an edit is visible on the very next request, and Atlas M0 data transfer stays low.
 *
 * React `cache` makes one request (page render or copilot tool loop) resolve this once.
 */

const VERSION_ID = "data_version";

type Mem = { version: number; dataset: Dataset; loadedAt: number };
const g = globalThis as typeof globalThis & {
  __turnoutDataset?: Mem;
  __turnoutLoading?: { version: number; promise: Promise<Mem> };
};

async function all<T>(db: Db, name: string, projection: Document): Promise<T[]> {
  return (await db.collection(name).find({}, { projection, batchSize: 5000 }).toArray()) as unknown as T[];
}

// Display-only fields the engine never reads are skipped to cut transfer.
const P = {
  base: { _id: 0 },
  people: { _id: 0, person_name: 0, owner_name: 0, first_campaign_name: 0, row_no: 0 },
  interactions: { _id: 0, detail: 0, person_name: 0, campaign_name: 0, owner_name: 0, owner_id: 0, row_no: 0 },
  registrations: { _id: 0, person_name: 0, campaign_name: 0, owner_name: 0, row_no: 0 },
  history: { _id: 0, person_name: 0, campaign_name: 0, owner_name: 0, owner_id: 0, row_no: 0 },
  checkins: { _id: 0, person_name: 0, campaign_name: 0, owner_name: 0, row_no: 0 },
  daily: { _id: 0, campaign_name: 0, owner_name: 0, row_no: 0 },
};

export async function readDataVersion(db: Db): Promise<number> {
  const doc = await db.collection("meta").findOne({ _id: VERSION_ID as never }, { projection: { v: 1 } });
  return (doc?.v as number | undefined) ?? 0;
}

/** Call after every write that can change analytics. Returns the new version. */
export async function bumpDataVersion(db: Db): Promise<number> {
  const r = await db
    .collection("meta")
    .findOneAndUpdate({ _id: VERSION_ID as never }, { $inc: { v: 1 }, $set: { at: new Date() } }, { upsert: true, returnDocument: "after" });
  return (r?.v as number | undefined) ?? 0;
}

export async function loadDatasetUncached(db?: Db): Promise<Dataset> {
  db ??= await getDb();
  const [event, settings, targets, campaigns, daily, people, interactions, registrations, history, checkins, tasks] =
    await Promise.all([
      db.collection("event").findOne({}, { projection: P.base }),
      db.collection("settings").findOne({ _id: "settings" as never }),
      all<Dataset["targets"][number]>(db, "targets", P.base),
      all<Dataset["campaigns"][number]>(db, "campaigns", P.base),
      all<Dataset["daily"][number]>(db, "campaign_daily", P.daily),
      all<Dataset["people"][number]>(db, "people", P.people),
      all<Dataset["interactions"][number]>(db, "interactions", P.interactions),
      all<Dataset["registrations"][number]>(db, "registrations", P.registrations),
      all<Dataset["history"][number]>(db, "registration_history", P.history),
      all<Dataset["checkins"][number]>(db, "checkins", P.checkins),
      all<NonNullable<Dataset["tasks"]>[number]>(db, "tasks", P.base),
    ]);
  if (!event) throw new Error("No event document. Seed the database first (npm run seed).");
  return {
    event: event as unknown as Dataset["event"],
    settings: {
      city: settings?.city ?? "Bengaluru",
      festival_name: settings?.festival_name ?? (event.event_name as string),
      venue_capacity: settings?.venue_capacity ?? 2500,
      default_as_of: settings?.default_as_of ?? (event.history_end as string),
    },
    targets,
    campaigns,
    daily,
    people,
    interactions,
    registrations,
    history,
    checkins,
    tasks,
  };
}

async function loadFresh(): Promise<Dataset> {
  const db = await getDb();
  const version = await readDataVersion(db);
  const mem = g.__turnoutDataset;
  if (mem && mem.version === version) return mem.dataset;
  // Coalesce concurrent reloads of the same version within one instance.
  if (!g.__turnoutLoading || g.__turnoutLoading.version !== version) {
    const promise = loadDatasetUncached(db).then((dataset) => {
      const m = { version, dataset, loadedAt: Date.now() };
      if (!g.__turnoutDataset || g.__turnoutDataset.version <= version) g.__turnoutDataset = m;
      return m;
    });
    g.__turnoutLoading = { version, promise };
    promise.finally(() => {
      if (g.__turnoutLoading?.promise === promise) g.__turnoutLoading = undefined;
    }).catch(() => {});
  }
  return (await g.__turnoutLoading.promise).dataset;
}

/** Per-request memoised, version-checked dataset. */
export const loadDataset = cache(loadFresh);
