import "server-only";
import { buildSnapshot, type Dataset } from "../analytics";
import { systemPrompt } from "../copilot/system-prompt";
import { env } from "../env";
import { assistantInstruction, entitiesOf, type AssistantContext } from "./catalogue";

export const LIVE_MODELS = ["gemini-3.8-live", "gemini-2.5-flash-native-audio-preview-09-2025"];

/** Live keys in order of preference (the original GEMINI key is blocked for this API). */
export function liveKeys(): string[] {
  const e = env();
  return [e.ASSISTANT_GEMINI_API_KEY, e.GOOGLE_API_KEY_2, e.GOOGLE_GENERATIVE_AI_API_KEY].filter((k, i, a): k is string => !!k && a.indexOf(k) === i);
}

export function instructionFor(ds: Dataset, ctx: AssistantContext, voice: boolean) {
  const s = buildSnapshot(ds, ctx.asOf);
  const base = systemPrompt({
    asOf: s.asOf,
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
  });
  return { text: assistantInstruction(base, entitiesOf(ds), { ...ctx, asOf: s.asOf }, voice), asOf: s.asOf };
}
