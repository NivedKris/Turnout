import { asOfOf, handle } from "@/lib/server/http";
import { funnelView } from "@/lib/server/views";

export async function GET(req: Request) {
  return handle(async () => {
    const campaign = new URL(req.url).searchParams.get("campaign");
    const v = await funnelView(asOfOf(req), campaign);
    return { meta: v.meta, funnel: v.funnel, formula: v.formula, assumptions: v.assumptions, bottleneck: v.bottleneck.bottleneck };
  });
}
