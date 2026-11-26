import "server-only";
import { z } from "zod";
import type { Dataset } from "../analytics";
import { buildTools } from "../copilot/tools";
import { TraceRecorder } from "../copilot/trace";
import { describeSitemap, type Entities } from "./sitemap";

/**
 * One tool catalogue, three kinds:
 *  READ   – run on the server, return facts, never change data (the copilot's engine tools).
 *  WRITE  – return a draft only; the browser turns it into a proposal card and the
 *           change happens only after confirm_change on a clear yes.
 *  SCREEN – run in the browser at once (navigation, reading the screen, confirming).
 */
export const WRITE_TOOLS = new Set(["propose_task", "propose_campaign_update", "propose_decision"]);
export const SCREEN_TOOLS = new Set(["navigate", "offer_navigation", "get_screen", "go_back", "confirm_change", "reject_change", "show_details"]);

type Decl = { name: string; description: string; parametersJsonSchema: unknown };

const dest = {
  screen: { type: "string", description: "Screen key from the sitemap (overview, funnel, campaigns, campaign, metric, plan, bets, bet, planner, decisions, tasks, team, terminal, activity, settings)" },
  campaign: { type: "string", description: "Campaign id (C01…) or name as heard, for screen=campaign" },
  bet: { type: "string", description: "Bet id (B1…) or title as heard, for screen=bet" },
  metric: { type: "string", description: "Metric key for screen=metric: reg, vis, idn, spd, cpr, shw, ctr, cnf" },
  filter_campaign: { type: "string", description: "Campaign id or name to filter the funnel screen" },
  as_of: { type: "string", description: "Optional data date YYYY-MM-DD" },
};

export const SCREEN_DECLS: Decl[] = [
  { name: "navigate", description: "Open a screen NOW. Use for commands: take me, open, show me, go to, pull up, let me see.", parametersJsonSchema: { type: "object", properties: dest, required: ["screen"] } },
  { name: "offer_navigation", description: "For questions like 'where can I find…': show a 'Take me there?' card. Navigate only if the person then says yes.", parametersJsonSchema: { type: "object", properties: { ...dest, question: { type: "string", description: "Short offer, e.g. 'Open the Bets page?'" } }, required: ["screen"] } },
  { name: "get_screen", description: "What the person is looking at now: screen title, as-of date, listed items with their numbers (1, 2, 3…) and visible panels. Call it for 'this one', 'the second one', 'what am I looking at'.", parametersJsonSchema: { type: "object", properties: {} } },
  { name: "go_back", description: "Go back to the previous screen.", parametersJsonSchema: { type: "object", properties: {} } },
  { name: "confirm_change", description: "Carry out a waiting proposal. ONLY after the person clearly said yes.", parametersJsonSchema: { type: "object", properties: { proposal_id: { type: "string" } }, required: ["proposal_id"] } },
  { name: "reject_change", description: "Discard a waiting proposal when the person says no.", parametersJsonSchema: { type: "object", properties: { proposal_id: { type: "string" } }, required: ["proposal_id"] } },
  { name: "show_details", description: "Voice only: put the full written answer (numbers, lists) on screen as a card, then speak only a two-sentence summary.", parametersJsonSchema: { type: "object", properties: { title: { type: "string" }, markdown: { type: "string" } }, required: ["title", "markdown"] } },
];

/** Gemini declarations for every READ and WRITE tool, generated from the same Zod schemas the chat uses. */
export function engineDecls(ds: Dataset, asOf: string): Decl[] {
  const tools = buildTools({ ds, asOf, rec: new TraceRecorder(asOf, "", () => {}) }) as unknown as Record<string, { description?: string; inputSchema: z.ZodType }>;
  return Object.entries(tools).map(([name, t]) => {
    const schema = z.toJSONSchema(t.inputSchema, { target: "draft-7", io: "input" }) as Record<string, unknown>;
    delete schema.$schema;
    return { name, description: t.description ?? name, parametersJsonSchema: schema };
  });
}

export function entitiesOf(ds: Dataset): Entities {
  return {
    campaigns: ds.campaigns.map((c) => ({ id: c.campaign_id, name: c.campaign_name, channel: c.channel })),
    bets: (ds.bets ?? []).map((b) => ({ id: b.bet_id, title: b.title })),
  };
}

export type AssistantContext = {
  path: string;
  asOf: string;
  title?: string;
  items?: { n: number; id: string; label: string; kind: string }[];
  details?: string;
  pending?: { id: string; kind: string; summary: string }[];
};

/** Rules for the in-app assistant (voice and chat share them). */
export function assistantInstruction(base: string, ents: Entities, ctx: AssistantContext, voice: boolean): string {
  const ctxLine = `CURRENT SCREEN: ${ctx.title ?? ctx.path} (${ctx.path}), viewing as of ${ctx.asOf}, ${ctx.items?.length ?? 0} items listed. Waiting proposals: ${ctx.pending?.length ? ctx.pending.map((p) => `${p.id} = ${p.summary}`).join("; ") : "none"}.`;
  return `${base}

YOU ARE ALSO THE IN-APP ASSISTANT. People ${voice ? "talk to you by voice" : "type to you"} from any screen. You can answer, move them around the app, read their screen and carry out changes after a clear yes.

${voice ? `VOICE STYLE: short, warm, plain English. Never read out long lists or tables: call show_details with the full written answer first, then speak two or three sentences. Speak numbers naturally (two thousand three hundred and thirty-seven, rupees twenty-five thousand). This overrides the formatting rules above: no markdown, no bullet points, and never say tool names or citations like (get_overview) out loud; the evidence is shown on screen.` : "CHAT STYLE: concise, structured as in the rules above."}

${describeSitemap(ents)}

COMMANDS vs QUESTIONS:
- Commands (take me to, open, show me, go to, pull up, let me see) → call navigate NOW. Look things up first if needed. "Show me X" always puts X on screen; do not list it in words instead.
- Questions about where something is (where can I find, how do I get to) → answer in one sentence and call offer_navigation; navigate only after a yes.
- Data questions (which campaign…, how many…, are we on track) → answer with tools and do NOT navigate.
- "This one", "the second one", "what am I looking at", "here" → call get_screen first, then act on that item.
- Names may be misheard: pass them as heard (navigate resolves them). Never say you can't find something before trying the tools.
- Examples: "take me to paid social" → navigate(screen=campaign, campaign="paid social"). "show me the bets" → navigate(screen=bets). "where are the decisions?" → offer_navigation(screen=decisions). "show registrations as of 31 March" → navigate(screen=metric, metric=reg, as_of=2025-03-31). "show me the funnel for creators" → navigate(screen=funnel, filter_campaign="creator partners").

CHANGES (tasks, campaign status/budget, decisions):
1. Call the propose_* tool. It changes NOTHING; it returns a proposal_id.
2. Ask "Shall I …?" in one sentence.
3. On a clear yes call confirm_change(proposal_id). On no call reject_change(proposal_id).
4. Never say it is done until confirm_change says it succeeded.

LANGUAGE: always answer in English, even if the input looks like another language, unless the person clearly speaks Hindi or Kannada to you.

${ctxLine}
For anything about the screen, call get_screen rather than trusting this line (it was written when the session opened).`;
}
