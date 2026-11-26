import "server-only";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { wrapLanguageModel } from "ai";
import type { LanguageModelV4, LanguageModelV4Middleware } from "@ai-sdk/provider";
import { env } from "../env";
import type { TraceRecorder } from "./trace";

/**
 * Provider chain: Groq first (fast), Gemini as fallback. Each model call (step) tries the chain in order;
 * on a provider error (rate limit, 5xx, timeout, auth) the same step is retried on the next model.
 * Every attempt is recorded in the trace, so the UI shows exactly which model answered.
 */
export type ChainEntry = { provider: "groq" | "google"; model: string; key: number; lm: LanguageModelV4 };

const DEFAULTS: Record<string, string[]> = {
  // Each Groq model has its own free-tier token budget, so the chain stays on Groq as long as possible.
  groq: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
  google: ["gemini-3.8-flash", "gemini-3.5-flash"],
};

export function providerChain(): ChainEntry[] {
  const e = env();
  const order = e.LLM_PROVIDERS.split(",").map((s) => s.trim()).filter(Boolean);
  // Several keys per provider: each key (organisation) has its own rate-limit budget.
  const keys = {
    groq: [e.GROQ_API_KEY, e.GROQ_API_KEY2, process.env.GROQ_API_KEY_2].filter((k, i, a): k is string => !!k && a.indexOf(k) === i),
    google: [e.GOOGLE_GENERATIVE_AI_API_KEY, e.GOOGLE_API_KEY_2, process.env.GEMINI_API_KEY_2].filter((k, i, a): k is string => !!k && a.indexOf(k) === i),
  };
  const chain: ChainEntry[] = [];
  for (const p of order) {
    if (p === "groq") {
      keys.groq.forEach((apiKey, ki) => {
        const groq = createGroq({ apiKey });
        const models = e.LLM_MODEL ? [e.LLM_MODEL, ...DEFAULTS.groq!.filter((m) => m !== e.LLM_MODEL)] : DEFAULTS.groq!;
        for (const m of models) chain.push({ provider: "groq", model: m, key: ki + 1, lm: groq(m) as unknown as LanguageModelV4 });
      });
    }
    if (p === "google") {
      keys.google.forEach((apiKey, ki) => {
        const google = createGoogleGenerativeAI({ apiKey });
        for (const m of DEFAULTS.google!) chain.push({ provider: "google", model: m, key: ki + 1, lm: google(m) as unknown as LanguageModelV4 });
      });
    }
  }
  return chain;
}

function retryAfterSeconds(err: unknown): number | null {
  const e = err as { statusCode?: number; message?: string; responseHeaders?: Record<string, string> };
  if (e?.statusCode !== 429) return null;
  const h = e.responseHeaders?.["retry-after"];
  if (h && Number.isFinite(Number(h))) return Number(h);
  const m = /try again in ([\d.]+)(ms|s)/i.exec(e.message ?? "");
  if (!m) return null;
  return m[2] === "ms" ? Number(m[1]) / 1000 : Number(m[1]);
}

function describe(err: unknown): string {
  const e = err as { statusCode?: number; message?: string; name?: string };
  const code = e?.statusCode ? `HTTP ${e.statusCode}` : (e?.name ?? "Error");
  return `${code}: ${(e?.message ?? String(err)).slice(0, 160)}`;
}

/** A model that runs the chain with per-step fallback, recording every attempt in the trace. */
export function chainModel(chain: ChainEntry[], rec: TraceRecorder): LanguageModelV4 {
  if (!chain.length) throw new Error("No LLM provider configured. Set GROQ_API_KEY and/or GOOGLE_GENERATIVE_AI_API_KEY.");
  let step = 0;
  // Remember a model that failed during this turn and skip it for later steps.
  const dead = new Set<number>();
  let lastFailed: string | null = null;

  const middleware: LanguageModelV4Middleware = {
    specificationVersion: "v4",
    wrapStream: async ({ params }) => {
      step++;
      let lastErr: unknown = null;
      let prevNode: string | null = lastFailed;
      lastFailed = null;
      for (let i = 0; i < chain.length; i++) {
        if (dead.has(i)) continue;
        const c = chain[i]!;
        const id = rec.add({ id: rec.uid("llm"), kind: "llm", label: `Step ${step} · ${c.model}`, sub: `${c.provider.toUpperCase()} key ${c.key}`, status: "running", detail: { provider: c.provider, model: c.model, key: c.key, step } });
        if (prevNode) rec.link(prevNode, id, "falls_back_to");
        else rec.link(rec.currentLlm ?? "q", id, rec.currentLlm ? "next" : "asks");
        const t = performance.now();
        try {
          let res;
          try {
            res = await c.lm.doStream(params);
          } catch (first) {
            // Short rate-limit windows: honour "try again in Ns" once (≤ 6 s) before falling back.
            const wait = retryAfterSeconds(first);
            if (wait === null || wait > 6) throw first;
            rec.update(id, { sub: `rate-limited · waiting ${wait.toFixed(1)}s` });
            await new Promise((r) => setTimeout(r, wait * 1000 + 150));
            res = await c.lm.doStream(params);
          }
          rec.update(id, { status: "ok", sub: `${c.provider.toUpperCase()} key ${c.key} · ${Math.round(performance.now() - t)}ms to first byte` });
          rec.trace.providers.push({ provider: `${c.provider}#${c.key}`, model: c.model, ok: true, ms: Math.round(performance.now() - t) });
          rec.trace.stats.steps = step;
          rec.currentLlm = id;
          // In-stream provider errors (malformed tool JSON, tool-validation 400s, mid-stream 429s):
          // mark this model dead for the turn; streamText's streamRetries then re-runs the step on the next model.
          const idx = i;
          const stream = res.stream.pipeThrough(
            new TransformStream({
              transform(chunk, ctl) {
                if ((chunk as { type?: string }).type === "error") {
                  const err = (chunk as { error?: unknown }).error;
                  dead.add(idx);
                  rec.update(id, { status: "fallback", sub: `in-stream: ${describe(err)}` });
                  rec.trace.providers.push({ provider: `${c.provider}#${c.key}`, model: c.model, ok: false, ms: Math.round(performance.now() - t), error: `in-stream: ${describe(err)}` });
                  lastFailed = id;
                }
                ctl.enqueue(chunk);
              },
            }),
          );
          return { ...res, stream };
        } catch (err) {
          lastErr = err;
          dead.add(i);
          rec.update(id, { status: "fallback", sub: describe(err) });
          rec.trace.providers.push({ provider: `${c.provider}#${c.key}`, model: c.model, ok: false, ms: Math.round(performance.now() - t), error: describe(err) });
          prevNode = id;
        }
      }
      throw lastErr ?? new Error("All providers failed");
    },
  };
  // The wrapped base model is the first entry; the middleware decides who actually serves each call.
  return wrapLanguageModel({ model: chain[0]!.lm, middleware }) as unknown as LanguageModelV4;
}
