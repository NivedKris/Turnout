import { z } from "zod";
import { buildSnapshot, scenario } from "@/lib/analytics";
import { loadDataset } from "@/lib/analytics/load";
import { ScenarioChanges } from "@/lib/models/scenario";
import { body, handle } from "@/lib/server/http";
import { MutationError } from "@/lib/server/mutations";

const Input = z.object({ asOf: z.string().optional(), mode: z.enum(["base", "stretch"]).default("base"), changes: ScenarioChanges });

export async function POST(req: Request) {
  return handle(async () => {
    const r = Input.safeParse(await body(req));
    if (!r.success) throw new MutationError(r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; "), 422);
    const s = buildSnapshot(await loadDataset(), r.data.asOf);
    return scenario(s, r.data.changes, r.data.mode);
  });
}
