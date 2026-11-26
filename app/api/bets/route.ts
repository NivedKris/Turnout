import { asOfOf, body, handle } from "@/lib/server/http";
import { createBet } from "@/lib/server/mutations";
import { betsView } from "@/lib/server/views";

export async function GET(req: Request) {
  return handle(async () => (await betsView(asOfOf(req))).evaluations);
}
export async function POST(req: Request) {
  return handle(async () => createBet(await body(req)), 201);
}
