import { handle } from "@/lib/server/http";
import { activityView } from "@/lib/server/views";

export async function GET(req: Request) {
  return handle(() => activityView(Math.min(500, Number(new URL(req.url).searchParams.get("limit") ?? 100) || 100)));
}
