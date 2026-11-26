import { asOfOf, body, handle } from "@/lib/server/http";
import { createDecision } from "@/lib/server/mutations";
import { decisionsView } from "@/lib/server/views";

export async function GET(req: Request) {
  return handle(async () => (await decisionsView(asOfOf(req))).rows);
}
export async function POST(req: Request) {
  return handle(async () => createDecision(await body(req)), 201);
}
