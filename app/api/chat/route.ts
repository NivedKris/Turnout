import { z } from "zod";
import { describeSitemap } from "@/lib/assistant/sitemap";
import { entitiesOf } from "@/lib/assistant/catalogue";
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, isStepCount, streamText, tool, toUIMessageStream, type UIMessage } from "ai";
import { buildSnapshot } from "@/lib/analytics";
import { loadDataset } from "@/lib/analytics/load";
import { groundClaims } from "@/lib/copilot/claims";
import { routeTools } from "@/lib/copilot/router";
import { chainModel, providerChain } from "@/lib/copilot/provider";
import { systemPrompt } from "@/lib/copilot/system-prompt";
import { buildTools } from "@/lib/copilot/tools";
import { TraceRecorder } from "@/lib/copilot/trace";
import type { Trace } from "@/lib/copilot/trace-types";
import { getDb } from "@/lib/db";
import { isDayKey } from "@/lib/time";

export const maxDuration = 60;

/* Per-instance rate limit: 20 turns / 5 minutes / IP. */
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 300_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 20;
}

type Body = { id?: string; messages: UIMessage[]; asOf?: string };

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return Response.json({ error: "Too many questions in a short time. Please wait a minute." }, { status: 429 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-24) : [];
  // What the model sees: last 8 messages, earlier assistant turns as text only (tool payloads dropped).
  const modelView: UIMessage[] = messages.slice(-8).map((m, i, arr) =>
    m.role === "assistant" && i < arr.length - 1
      ? { ...m, parts: m.parts.filter((p) => p.type === "text").map((p) => ({ ...p, text: (p as { text: string }).text.slice(0, 700) })) }
      : m,
  );
  const userTexts = messages.filter((m) => m.role === "user").map((m) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join(" "));
  const last = [...messages].reverse().find((m) => m.role === "user");
  const question = last?.parts?.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim() ?? "";
  if (!question) return Response.json({ error: "Empty question" }, { status: 400 });

  const ds = await loadDataset();
  const asOf = body.asOf && isDayKey(body.asOf) ? body.asOf : ds.settings.default_as_of;
  const s = buildSnapshot(ds, asOf);
  const sessionId = (body.id ?? "anon").slice(0, 64);

  let finalTrace: Trace | null = null;
  let savedMessages: UIMessage[] | null = null;
  let resolveSaved: () => void = () => {};
  const savedReady = new Promise<void>((r) => (resolveSaved = r));

  const stream = createUIMessageStream({
    onError: (err) => {
      console.error("[copilot]", err);
      return "The copilot couldn't reach any language model just now (all providers failed or were rate-limited). Your dashboard numbers are unaffected. Please try again in a moment.";
    },
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      const rec = new TraceRecorder(asOf, question, (t) => {
        finalTrace = t;
        writer.write({ type: "data-trace", id: t.id, data: t });
      });
      rec.flush();

      // navigate / offer_navigation have no execute: the browser runs them and posts the result back.
      const dest = {
        screen: z.string().describe("Screen key: overview, funnel, campaigns, campaign, metric, plan, bets, bet, planner, decisions, tasks, team, terminal, activity, settings"),
        campaign: z.string().optional().describe("Campaign id or name as written, for screen=campaign"),
        bet: z.string().optional().describe("Bet id or title, for screen=bet"),
        metric: z.string().optional().describe("Metric key for screen=metric: reg, vis, idn, spd, cpr, shw, ctr, cnf"),
        filter_campaign: z.string().optional().describe("Campaign to filter the funnel screen"),
        as_of: z.string().optional().describe("Optional data date YYYY-MM-DD"),
      };
      const tools = {
        ...buildTools({ ds, asOf, rec }),
        navigate: tool({ description: "Open a screen in the app NOW. Use for commands: take me, open, show me, go to.", inputSchema: z.object(dest) }),
        offer_navigation: tool({ description: "For 'where can I find…' questions: show a 'Take me there?' button instead of navigating.", inputSchema: z.object({ ...dest, question: z.string().optional() }) }),
      };
      const active = routeTools(userTexts);
      rec.update("q", { sub: `tools offered: ${active.join(", ")}` });
      const result = streamText({
        model: chainModel(providerChain(), rec),
        system: systemPrompt({
          asOf,
          phase: s.phase,
          festival: ds.settings.festival_name,
          city: ds.settings.city,
          eventStart: s.eventStartDay,
          eventEnd: s.eventEndDay,
          historyStart: ds.event.history_start,
          historyEnd: ds.event.history_end,
          targetVersion: s.target?.target_version ?? null,
          daysToEvent: s.daysToEvent,
          campaigns: s.campaigns.map((c) => ({ id: c.campaign_id, name: c.campaign_name, owner: c.owner_name })),
          today: new Date().toISOString().slice(0, 10),
        }) + (active.includes("navigate") ? `\n\n${describeSitemap(entitiesOf(ds))}\nCommands (take me to, open, show me) → call navigate. "Where is…" → answer in one sentence and call offer_navigation. After navigating, say in one sentence what is on that screen.` : ""),
        messages: await convertToModelMessages(modelView),
        tools,
        activeTools: active,
        stopWhen: isStepCount(8),
        temperature: 0.1,
        // Re-run a failed step; the provider middleware moves it to the next live model.
        streamRetries: 3,
      });

      writer.merge(
        toUIMessageStream({
          stream: result.stream,
          sendStart: false,
          originalMessages: messages,
          onEnd: ({ messages: all }) => {
            savedMessages = all as UIMessage[];
            resolveSaved();
          },
        }),
      );

      // Ground every number in the final answer against what tools returned.
      const text = await result.text;
      const outputs = rec.trace.nodes.filter((n) => n.kind === "tool" && n.detail?.output).map((n) => ({ nodeId: n.id, output: n.detail!.output }));
      // Numbers may also come from tool results earlier in this conversation (follow-ups like "create a task for that").
      const prior: { nodeId: string; output: unknown; name: string }[] = [];
      for (const m of messages.slice(0, -1)) {
        if (m.role !== "assistant") continue;
        for (const p of m.parts as { type: string; toolCallId?: string; state?: string; output?: unknown }[]) {
          if (p.type.startsWith("tool-") && p.state === "output-available" && p.toolCallId) prior.push({ nodeId: `prior:${p.toolCallId}`, output: p.output, name: p.type.slice(5) });
        }
      }
      const qNums = [...question.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, "")));
      const claims = groundClaims(text, [...outputs, ...prior], qNums);
      for (const pr of prior) {
        if (!claims.some((c) => c.supportedBy.includes(pr.nodeId))) continue;
        rec.add({ id: pr.nodeId, kind: "tool", label: `${pr.name} (earlier turn)`, sub: "result reused from conversation", status: "ok", detail: { output: pr.output as Record<string, unknown> } });
        rec.link("q", pr.nodeId, "reads");
      }
      const answerId = rec.add({ id: "answer", kind: "answer", label: "Answer", sub: `${claims.length} numeric claims`, status: "ok", detail: { text: text.slice(0, 1500) } });
      if (rec.currentLlm) rec.link(rec.currentLlm, answerId, "answers");
      claims.forEach((c, i) => {
        const cid = rec.add({ id: `claim_${i}`, kind: "claim", label: c.text, sub: c.supportedBy.length ? `grounded in ${c.supportedBy.length} source${c.supportedBy.length > 1 ? "s" : ""}` : "UNSUPPORTED: no tool returned this number", status: c.supportedBy.length ? "ok" : "unsupported", detail: { value: c.value, is_percent: c.isPct, supported_by: c.supportedBy } });
        for (const sid of c.supportedBy) rec.link(sid, cid, "supports");
        rec.link(cid, answerId, "answers");
      });
      try {
        const u = await result.totalUsage;
        rec.update("answer", { detail: { text: text.slice(0, 1500), input_tokens: u.inputTokens, output_tokens: u.outputTokens } });
      } catch {}
      rec.trace.stats.claims = claims.length;
      rec.trace.stats.unsupported_claims = claims.filter((c) => !c.supportedBy.length).length;
      rec.trace.done = true;
      rec.flush();
    },
  });

  // Persist the session (messages + final trace) once the turn completes. Best effort.
  void (async () => {
    try {
      await Promise.race([savedReady, new Promise((r) => setTimeout(r, 70_000))]);
      if (!savedMessages) return;
      const t = finalTrace as Trace | null;
      const msgs = (savedMessages as UIMessage[]).map((m) => ({
        ...m,
        parts: m.parts.map((p) => (t && p.type === "data-trace" && (p as { id?: string }).id === t.id ? { ...p, data: t } : p)),
      }));
      const db = await getDb();
      await db.collection("chat_sessions").updateOne(
        { _id: sessionId as never },
        { $set: { messages: msgs, as_of: asOf, updated_at: new Date() }, $setOnInsert: { created_at: new Date() } },
        { upsert: true },
      );
    } catch (err) {
      console.error("[copilot] save failed", err);
    }
  })();

  return createUIMessageStreamResponse({ stream });
}
