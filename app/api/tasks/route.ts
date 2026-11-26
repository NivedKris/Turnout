import { asOfOf, body, handle } from "@/lib/server/http";
import { createTask } from "@/lib/server/mutations";
import { tasksView } from "@/lib/server/views";

export async function GET(req: Request) {
  return handle(async () => {
    const p = new URL(req.url).searchParams;
    const v = await tasksView(asOfOf(req));
    return v.tasks.filter(
      (t) =>
        (!p.get("status") || t.status === p.get("status")) &&
        (!p.get("owner") || t.owner_name === p.get("owner")) &&
        (!p.get("campaignId") || t.campaign_id === p.get("campaignId")) &&
        (p.get("overdue") !== "true" || t.overdue),
    );
  });
}
export async function POST(req: Request) {
  return handle(async () => createTask(await body(req)), 201);
}
