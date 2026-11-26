import { asOfOf, body, handle } from "@/lib/server/http";
import { updateGoalModel } from "@/lib/server/mutations";
import { planView } from "@/lib/server/views";

export async function GET(req: Request) {
  return handle(async () => {
    const v = await planView(asOfOf(req));
    return { model: v.model, result: v.result };
  });
}
export async function PATCH(req: Request) {
  return handle(async () => updateGoalModel(await body(req)));
}
