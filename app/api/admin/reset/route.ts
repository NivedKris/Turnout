import { getDb } from "@/lib/db";
import { isAdmin, unauthorized } from "@/lib/server/admin";
import { resetFromBaseline } from "@/lib/seed/load";

export const maxDuration = 120;

/** Restore every live collection from the untouched baseline import. */
export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  try {
    const result = await resetFromBaseline(await getDb(), "user");
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Reset failed" }, { status: 500 });
  }
}
