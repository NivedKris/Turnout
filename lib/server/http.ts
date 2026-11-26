import "server-only";
import { connection } from "next/server";
import { MutationError } from "./mutations";

/** JSON route helper: maps MutationError to its status, hides internals otherwise. */
export async function handle<T>(fn: () => Promise<T>, status = 200): Promise<Response> {
  await connection(); // API data is always live: opt out of prerendering before touching the request
  try {
    return Response.json({ ok: true, data: await fn() }, { status });
  } catch (err) {
    if (err instanceof MutationError) return Response.json({ ok: false, error: err.message, issues: err.issues }, { status: err.status });
    console.error(err);
    return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

export async function body(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new MutationError("Request body must be JSON", 400);
  }
}

export const asOfOf = (req: Request) => new URL(req.url).searchParams.get("asOf") ?? undefined;
