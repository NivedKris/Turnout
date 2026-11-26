import { MutationError, deleteCampaign, updateCampaign } from "@/lib/server/mutations";
import { asOfOf, body, handle } from "@/lib/server/http";
import { campaignView } from "@/lib/server/views";

export async function GET(req: Request, ctx: RouteContext<"/api/campaigns/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const v = await campaignView(id, asOfOf(req));
    if (!v) throw new MutationError(`Campaign ${id} not found`, 404);
    return { campaign: v.campaign, kpis: v.kpis, rule: v.rule, funnel: v.funnel };
  });
}
export async function PATCH(req: Request, ctx: RouteContext<"/api/campaigns/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => updateCampaign(id, await body(req)));
}
export async function DELETE(_req: Request, ctx: RouteContext<"/api/campaigns/[id]">) {
  const { id } = await ctx.params;
  return handle(() => deleteCampaign(id));
}
