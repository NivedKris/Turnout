import { asOfOf, body, handle } from "@/lib/server/http";
import { MutationError, deleteBet, updateBet } from "@/lib/server/mutations";
import { betView } from "@/lib/server/views";

export async function GET(req: Request, ctx: RouteContext<"/api/bets/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const v = await betView(id, asOfOf(req));
    if (!v) throw new MutationError(`Bet ${id} not found`, 404);
    return { bet: v.bet, evaluation: v.evaluation, decisions: v.decisions };
  });
}
export async function PATCH(req: Request, ctx: RouteContext<"/api/bets/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => updateBet(id, await body(req)));
}
export async function DELETE(_req: Request, ctx: RouteContext<"/api/bets/[id]">) {
  const { id } = await ctx.params;
  return handle(() => deleteBet(id));
}
