import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { loadDataset } from "@/lib/analytics/load";
import { SCREEN_DECLS, engineDecls, entitiesOf } from "@/lib/assistant/catalogue";
import { LIVE_MODELS, instructionFor, liveKeys } from "@/lib/assistant/server";

export const maxDuration = 30;

const Ctx = z.object({
  path: z.string().max(300).default("/"),
  asOf: z.string().max(20).optional(),
  title: z.string().max(200).optional(),
  items: z.array(z.object({ n: z.number(), id: z.string(), label: z.string(), kind: z.string() })).max(40).optional(),
  details: z.string().max(3000).optional(),
  pending: z.array(z.object({ id: z.string(), kind: z.string(), summary: z.string() })).max(10).optional(),
});

/**
 * Mints a single-use, short-lived Gemini Live token for the browser. The API key
 * never leaves the server. Also returns the instructions and tool declarations.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = Ctx.safeParse((body as { context?: unknown })?.context ?? {});
  if (!parsed.success) return Response.json({ error: "Bad context" }, { status: 400 });
  const attempt = Math.max(0, Number((body as { attempt?: number })?.attempt ?? 0));
  const keys = liveKeys();
  if (!keys.length) return Response.json({ error: "Voice is not configured (no Gemini key)." }, { status: 503 });

  const ds = await loadDataset();
  const { text, asOf } = instructionFor(ds, { ...parsed.data, asOf: parsed.data.asOf ?? ds.settings.default_as_of }, true);
  const key = keys[attempt % keys.length]!;
  try {
    const ai = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: "v1alpha" } });
    const t = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60_000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 2 * 60_000).toISOString(),
        httpOptions: { apiVersion: "v1alpha" },
      },
    });
    return Response.json({
      token: t.name,
      models: LIVE_MODELS,
      voice: "Puck",
      asOf,
      systemInstruction: text,
      tools: [...engineDecls(ds, asOf), ...SCREEN_DECLS],
      entities: entitiesOf(ds),
    });
  } catch (err) {
    console.error("[assistant/token]", err);
    return Response.json({ error: "Couldn't start voice right now. Try again, or use chat." }, { status: 502 });
  }
}
