import "server-only";
import { MongoClient, type Db } from "mongodb";
import { attachDatabasePool } from "@vercel/functions";
import { env } from "./env";

/**
 * One MongoClient per function instance, reused across invocations.
 * - Cached on globalThis so dev hot-reloads don't open a new pool each time.
 * - attachDatabasePool lets Vercel Fluid compute drain idle connections before
 *   an instance is suspended, avoiding connection storms on Atlas M0.
 */
type Cache = { client?: MongoClient; promise?: Promise<MongoClient> };
const g = globalThis as typeof globalThis & { __turnoutMongo?: Cache };
const cache: Cache = (g.__turnoutMongo ??= {});

function createClient(): Promise<MongoClient> {
  const client = new MongoClient(env().MONGODB_URI, {
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 5_000,
    serverSelectionTimeoutMS: 8_000,
    appName: "turnout",
  });
  attachDatabasePool(client);
  cache.client = client;
  return client.connect();
}

export async function getClient(): Promise<MongoClient> {
  if (!cache.promise) {
    cache.promise = createClient().catch((err) => {
      cache.promise = undefined; // allow a retry on the next request
      throw err;
    });
  }
  return cache.promise;
}

export async function getDb(): Promise<Db> {
  return (await getClient()).db(env().MONGODB_DB);
}
