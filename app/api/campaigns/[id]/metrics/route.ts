import { body, handle } from "@/lib/server/http";
import { importDailyCsv, logDailyMetrics } from "@/lib/server/mutations";

/** Log daily metrics: JSON body (one row) or text/csv (many rows, all validated first). */
export async function POST(req: Request, ctx: RouteContext<"/api/campaigns/[id]/metrics">) {
  const { id } = await ctx.params;
  if ((req.headers.get("content-type") ?? "").includes("text/csv")) {
    const csv = await req.text();
    return handle(() => importDailyCsv(id, csv), 201);
  }
  return handle(async () => logDailyMetrics({ ...(await body(req) as object), campaign_id: id }), 201);
}
