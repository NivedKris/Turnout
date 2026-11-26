import { z } from "zod";
import { loadDataset } from "@/lib/analytics/load";
import { SCREEN_TOOLS } from "@/lib/assistant/catalogue";
import { buildTools } from "@/lib/copilot/tools";
import { TraceRecorder } from "@/lib/copilot/trace";
import { isDayKey } from "@/lib/time";

export const maxDuration = 30;

const Body = z.object({ name: z.string().max(60), args: z.record(z.string(), z.unknown()).default({}), asOf: z.string().optional() });

/**
 * Runs a READ or WRITE tool for the voice session. WRITE tools only return a draft
 * (the browser shows it as a proposal); SCREEN tools are refused here (browser-only).
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const { name, args } = parsed.data;
  if (SCREEN_TOOLS.has(name)) return Response.json({ error: `${name} runs in the browser` }, { status: 400 });
  const ds = await loadDataset();
  const asOf = parsed.data.asOf && isDayKey(parsed.data.asOf) ? parsed.data.asOf : ds.settings.default_as_of;
  const tools = buildTools({ ds, asOf, rec: new TraceRecorder(asOf, name, () => {}) }) as unknown as Record<string, { inputSchema: z.ZodType; execute: (a: unknown, o: { toolCallId: string; messages: unknown[] }) => Promise<unknown> }>;
  const t = tools[name];
  if (!t) return Response.json({ error: `Unknown tool ${name}` }, { status: 404 });
  const input = t.inputSchema.safeParse(args);
  if (!input.success) return Response.json({ result: { error: `Invalid arguments: ${input.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` } });
  try {
    const out = await t.execute(input.data, { toolCallId: `voice_${Date.now().toString(36)}`, messages: [] });
    let json = JSON.stringify(out);
    if (json.length > 6000) json = JSON.stringify({ truncated: true, result: json.slice(0, 5800) });
    return new Response(`{"result":${json}}`, { headers: { "content-type": "application/json" } });
  } catch (err) {
    console.error("[assistant/tool]", name, err);
    return Response.json({ result: { error: "That lookup failed." } });
  }
}
