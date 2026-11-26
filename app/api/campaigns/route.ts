import { body, asOfOf, handle } from "@/lib/server/http";
import { createCampaign } from "@/lib/server/mutations";
import { campaignsView } from "@/lib/server/views";

export async function GET(req: Request) {
  return handle(async () => (await campaignsView(asOfOf(req))).rows);
}
export async function POST(req: Request) {
  return handle(async () => createCampaign(await body(req)), 201);
}
