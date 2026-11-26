import { bottleneck, buildSnapshot, evaluateRules, reallocation } from "@/lib/analytics";
import { loadDataset } from "@/lib/analytics/load";
import { asOfOf, handle } from "@/lib/server/http";

export async function GET(req: Request) {
  return handle(async () => {
    const s = buildSnapshot(await loadDataset(), asOfOf(req));
    return { as_of: s.asOf, rules: evaluateRules(s), bottleneck: bottleneck(s), reallocation: reallocation(s) };
  });
}
