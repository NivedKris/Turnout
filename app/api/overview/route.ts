import { asOfOf, handle } from "@/lib/server/http";
import { overviewView } from "@/lib/server/views";

export async function GET(req: Request) {
  return handle(async () => {
    const v = await overviewView(asOfOf(req));
    return { meta: v.meta, goals: v.goals, projection: v.projection, tiles: v.tiles, attention: v.attention };
  });
}
