import { connection } from "next/server";
import { getDb } from "@/lib/db";

/** Liveness + DB reachability. Never returns secrets. */
export async function GET() {
  await connection();
  const started = performance.now();
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return Response.json({ ok: true, db: "up", ms: Math.round(performance.now() - started) });
  } catch (err) {
    const message = err instanceof Error ? err.name : "UnknownError";
    return Response.json({ ok: false, db: "down", error: message }, { status: 503 });
  }
}
