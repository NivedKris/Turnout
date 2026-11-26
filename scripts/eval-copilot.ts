/**
 * Copilot eval. Asks the running app (/api/chat) unfamiliar questions and checks the
 * answers against values computed by the analytics engine from the current DB state.
 *
 *   BASE=http://localhost:3000 npm run eval
 *
 * Writes docs/eval-results.md. Run after a reset (the data-change case resets at the end).
 */
import { writeFile } from "node:fs/promises";
import {
  bottleneck,
  buildSnapshot,
  campaignKpis,
  evaluateRules,
  flows,
  projection,
  reallocation,
  scenario,
  statusCounts,
  registeredVisitors,
  targetVsActual,
  trend,
  type Dataset,
} from "../lib/analytics";
import { loadDatasetUncached } from "../lib/analytics/load";
import { extractClaims } from "../lib/copilot/claims";
import { getClient } from "../lib/db";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ADMIN = process.env.ADMIN_TOKEN ?? "";
const PAUSE_MS = Number(process.env.EVAL_PAUSE_MS ?? 9000);
/** When APP_PASSCODE is set the API needs the gate cookie. */
async function gateCookie(): Promise<Record<string, string>> {
  const pass = process.env.APP_PASSCODE;
  if (!pass) return {};
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`turnout:${pass}`));
  return { cookie: `tn_pass=${[...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("")}` };
}

type Turn = { text: string; tools: string[]; unsupported: number; claims: number; providers: string[]; ms: number; error?: string; raw: unknown[] };
type Check = (t: Turn) => { pass: boolean; why: string };
type Case = { id: string; category: string; asOf: string; turns: string[]; check: Check; before?: () => Promise<void>; after?: () => Promise<void> };

/* ───────────── transport ───────────── */

async function ask(asOf: string, history: unknown[], q: string): Promise<{ turn: Turn; msgs: unknown[] }> {
  const user = { id: `u${history.length}`, role: "user", parts: [{ type: "text", text: q }] };
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/chat`, { method: "POST", headers: { "content-type": "application/json", ...(await gateCookie()) }, body: JSON.stringify({ id: "eval", asOf, messages: [...history, user] }) });
  const turn: Turn = { text: "", tools: [], unsupported: 0, claims: 0, providers: [], ms: 0, raw: [] };
  if (!res.ok || !res.body) {
    turn.error = `HTTP ${res.status}`;
    return { turn, msgs: [...history, user] };
  }
  const parts: Record<string, unknown>[] = [];
  const toolParts = new Map<string, Record<string, unknown>>();
  const dec = new TextDecoder();
  let buf = "";
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const p = line.slice(5).trim();
      if (p === "[DONE]") continue;
      let ev: Record<string, unknown>;
      try {
        ev = JSON.parse(p);
      } catch {
        continue;
      }
      if (ev.type === "text-delta") turn.text += String(ev.delta ?? "");
      if (ev.type === "tool-input-available") {
        turn.tools.push(String(ev.toolName));
        toolParts.set(String(ev.toolCallId), { type: `tool-${ev.toolName}`, toolCallId: ev.toolCallId, state: "input-available", input: ev.input });
      }
      if (ev.type === "tool-output-available") {
        const tp = toolParts.get(String(ev.toolCallId));
        if (tp) Object.assign(tp, { state: "output-available", output: ev.output });
      }
      if (ev.type === "error") turn.error = String(ev.errorText);
      if (ev.type === "data-trace") {
        const d = ev.data as { stats: { claims: number; unsupported_claims: number }; providers: { model: string; provider: string; ok: boolean }[] };
        turn.claims = d.stats.claims;
        turn.unsupported = d.stats.unsupported_claims;
        turn.providers = d.providers.filter((x) => x.ok).map((x) => `${x.model}@${x.provider}`);
      }
    }
  }
  turn.ms = Date.now() - t0;
  parts.push(...toolParts.values(), { type: "text", text: turn.text });
  return { turn, msgs: [...history, user, { id: `a${history.length}`, role: "assistant", parts }] };
}

/* ───────────── checks ───────────── */

const nums = (t: string) => extractClaims(t);
function hasNumber(expected: number, opts: { pct?: boolean; tol?: number } = {}): Check {
  return (t) => {
    const target = opts.pct ? expected * 100 : expected;
    const tol = opts.tol ?? Math.max(Math.abs(target) * 0.01, opts.pct ? 0.15 : 0.6);
    const found = nums(t.text).find((n) => Math.abs(n.value - target) <= tol);
    return { pass: Boolean(found), why: found ? `found ${found.text} ≈ ${round(target)}` : `expected ≈ ${round(target)}${opts.pct ? "%" : ""}; saw ${nums(t.text).slice(0, 8).map((n) => n.text).join(", ") || "no numbers"}` };
  };
}
const mentions = (...words: (string | RegExp)[]): Check => (t) => {
  const miss = words.filter((w) => !(typeof w === "string" ? t.text.toLowerCase().includes(w.toLowerCase()) : w.test(t.text)));
  return { pass: miss.length === 0, why: miss.length ? `missing: ${miss.map(String).join(", ")}` : `mentions ${words.map(String).join(", ")}` };
};
const usedTool = (name: string): Check => (t) => ({ pass: t.tools.includes(name), why: t.tools.includes(name) ? `called ${name}` : `did not call ${name} (called ${t.tools.join(", ") || "none"})` });
const refuses: Check = (t) => {
  const r = /(doesn'?t|does not|do not|don'?t|cannot|can'?t|isn'?t|is not|no) (contain|have|include|cover|available|data|record|answer)|not (in|part of) (the|our) data|outside the (data|dataset|window|range)|not available|no .* data/i.test(t.text);
  return { pass: r, why: r ? "states the data cannot answer" : "did not clearly say the data can't answer" };
};
const all = (...cs: Check[]): Check => (t) => {
  const rs = cs.map((c) => c(t));
  return { pass: rs.every((r) => r.pass), why: rs.map((r) => r.why).join(" · ") };
};
const round = (n: number) => Math.round(n * 100) / 100;

/* ───────────── cases (expected values computed by the engine now) ───────────── */

function buildCases(ds: Dataset, taskCount: () => Promise<number>, campaignStatus: (id: string) => Promise<string>): Case[] {
  const s31 = buildSnapshot(ds, "2025-03-31");
  const s20 = buildSnapshot(ds, "2025-04-20");
  const g31 = Object.fromEntries(targetVsActual(s31).value.goals.map((g) => [g.key, g]));
  const k31 = campaignKpis(s31).value;
  const r31 = Object.fromEntries(evaluateRules(s31).value.evaluations.map((e) => [e.campaign_id, e]));
  const f31 = flows(s31);
  const bn = bottleneck(s31).value.bottleneck!;
  const tr = trend(s31, "registrations", 7).value;
  const str = projection(s31, { mode: "stretch" }).value;
  const sc = scenario(s31, [{ kind: "set_show_up_rate", value: 0.6 }]).value;
  const ra = reallocation(s31).value;
  const mostRegs = [...k31].sort((a, b) => b.registrations - a.registrations)[0]!;
  const lowestCtr = [...k31].filter((k) => k.ctr !== null).sort((a, b) => a.ctr! - b.ctr!)[0]!;
  const bestCpr = Object.values(r31).filter((e) => e.value !== null).sort((a, b) => a.value! - b.value!)[0]!;
  const stops = Object.values(r31).filter((e) => e.verdict === "stop");
  const atStart = statusCounts(s20, null, true)!;
  let tasksBefore = 0;

  return [
    { id: "L1", category: "lookup", asOf: "2025-03-31", turns: ["How many registrations do we have so far?"], check: hasNumber(f31.registrations) },
    { id: "L2", category: "lookup", asOf: "2025-03-31", turns: ["What's our net marketing spend to date?"], check: hasNumber(f31.spend) },
    { id: "L3", category: "lookup", asOf: "2025-04-20", turns: ["How many unique verified visitors attended the festival?"], check: hasNumber(s20.visitors.size) },
    { id: "L4", category: "lookup", asOf: "2025-04-20", turns: ["How many walk-ins did we get?"], check: hasNumber(flows(s20).walk_ins) },
    { id: "L5", category: "lookup", asOf: "2025-03-31", turns: ["Which target version is in force right now and what's the visitor goal?"], check: all(mentions(/revised/i), hasNumber(s31.target!.unique_external_visitors_goal)) },
    { id: "C1", category: "calculation", asOf: "2025-03-31", turns: ["What percentage of the registration goal have we reached?"], check: hasNumber(g31.registrations!.pct!, { pct: true }) },
    { id: "C2", category: "calculation", asOf: "2025-03-31", turns: ["How many registrations per day do we need from now to hit the goal?"], check: hasNumber(g31.registrations!.required_per_day!, { tol: 0.6 }) },
    { id: "C3", category: "calculation", asOf: "2025-03-31", turns: ["What's our overall cost per registration to date?"], check: hasNumber(f31.spend / f31.registrations, { tol: 1 }) },
    { id: "C4", category: "calculation", asOf: "2025-04-20", turns: ["What was the show-up rate of confirmed registrants?"], check: hasNumber(registeredVisitors(s20) / atStart.confirmed, { pct: true }) },
    { id: "P1", category: "comparison", asOf: "2025-03-31", turns: ["Compare Paid Social and College Partnerships on cost per registration over the last 14 days."], check: all(hasNumber(r31.C02!.value!, { tol: 1.5 }), hasNumber(r31.C04!.value!, { tol: 1.5 })) },
    { id: "P2", category: "comparison", asOf: "2025-03-31", turns: ["Which campaign has brought the most registrations?"], check: all(mentions(mostRegs.campaign_name), hasNumber(mostRegs.registrations)) },
    { id: "P3", category: "comparison", asOf: "2025-03-31", turns: ["Which campaign has the lowest click-through rate?"], check: mentions(lowestCtr.campaign_name) },
    { id: "D1", category: "diagnosis", asOf: "2025-03-31", turns: ["Where's our biggest funnel bottleneck?"], check: all(mentions(/identified.*regist/i), hasNumber(bn.actual!, { pct: true })) },
    { id: "D2", category: "diagnosis", asOf: "2025-03-31", turns: ["How did registrations change week over week?"], check: all(hasNumber(tr.current.value!), hasNumber(tr.previous.value!)) },
    { id: "D3", category: "diagnosis", asOf: "2025-03-31", turns: ["Are we on track for the stretch target?"], check: (t) => {
        const a = hasNumber(str.visitors, { tol: 6 })(t);
        const b = hasNumber(str.registrations, { tol: 6 })(t);
        return { pass: a.pass || b.pass, why: `${a.why} | ${b.why}` };
      } },
    { id: "R1", category: "recommendation", asOf: "2025-03-31", turns: ["Which campaign should we cut?"], check: all(mentions(stops[0]!.campaign_name), usedTool("get_rule_evaluations")) },
    { id: "R2", category: "recommendation", asOf: "2025-03-31", turns: ["Where should we move budget, and how much?"], check: all(usedTool("suggest_reallocation"), hasNumber(ra.moves.reduce((a, m) => a + m.amount, 0))) },
    { id: "R3", category: "recommendation", asOf: "2025-03-31", turns: ["What if show-up drops to 60%? How many visitors would we get?"], check: all(usedTool("run_scenario"), hasNumber(sc.scenario.visitors, { tol: 6 })) },
    { id: "F1", category: "follow-up", asOf: "2025-03-31", turns: ["What's Paid Social's cost per registration over the last 14 days?", "And Creator Partners?"], check: hasNumber(r31.C03!.value!, { tol: 1.5 }) },
    { id: "F2", category: "follow-up", asOf: "2025-03-31", turns: ["Which campaign has the lowest cost per registration in the last 14 days?", "Who owns it?"], check: mentions(bestCpr.owner_name) },
    {
      id: "A1",
      category: "action",
      asOf: "2025-03-31",
      turns: ["Create a task for Arjun Verma to pause Paid Social, due 3 April 2025."],
      before: async () => void (tasksBefore = await taskCount()),
      check: (t) => ({ pass: t.tools.includes("propose_task"), why: t.tools.includes("propose_task") ? "proposed (not created)" : `no proposal (tools: ${t.tools.join(", ")})` }),
      after: async () => {
        const n = await taskCount();
        if (n !== tasksBefore) throw new Error(`Task count changed ${tasksBefore} → ${n} without confirmation`);
      },
    },
    {
      id: "A2",
      category: "action",
      asOf: "2025-03-31",
      turns: ["Pause the Paid Social campaign."],
      check: usedTool("propose_campaign_update"),
      after: async () => {
        const st = await campaignStatus("C02");
        if (st !== "active") throw new Error(`C02 status changed to ${st} without confirmation`);
      },
    },
    { id: "U1", category: "unanswerable", asOf: "2025-03-31", turns: ["What was our Instagram CTR in 2023?"], check: refuses },
    { id: "U2", category: "unanswerable", asOf: "2025-04-20", turns: ["What was the average age of our attendees?"], check: refuses },
    { id: "U3", category: "unanswerable", asOf: "2025-04-20", turns: ["How much ticket revenue did the festival make?"], check: refuses },
    { id: "U4", category: "unanswerable", asOf: "2025-04-20", turns: ["Why exactly did people cancel their registrations?"], check: refuses },
    { id: "M1", category: "ambiguous", asOf: "2025-03-31", turns: ["How is the partners campaign doing?"], check: (t) => {
        const both = /creator partners/i.test(t.text) && /college partnerships/i.test(t.text);
        return { pass: both, why: both ? "surfaced both partner campaigns" : "did not disambiguate Creator Partners vs College Partnerships" };
      } },
    { id: "Q1", category: "data quality", asOf: "2025-04-20", turns: ["How many duplicate check-in records were removed, and how many denied check-ins were excluded?"], check: all(hasNumber(s20.quality.duplicates.checkins ?? 0), hasNumber(s20.quality.excludedCheckins.denied)) },
    { id: "Q2", category: "data quality", asOf: "2025-04-20", turns: ["How many internal, staff or test people were excluded from the counts?"], check: hasNumber(Object.values(s20.quality.excludedPeople).reduce((a, b) => a + b, 0)) },
  ];
}

/* ───────────── run ───────────── */

async function main() {
  const db = (await getClient()).db(process.env.MONGODB_DB ?? "turnout");
  const ds = await loadDatasetUncached(db);
  const cases = buildCases(
    ds,
    () => db.collection("tasks").countDocuments(),
    async (id) => ((await db.collection("campaigns").findOne({ campaign_id: id }))?.status as string) ?? "?",
  );

  // Data-change case: log a row, recompute expected from the engine, ask, then reset.
  const changeCase: Case = {
    id: "X1",
    category: "after data change",
    asOf: "2025-03-31",
    turns: ["What's Community Groups' cost per registration over the last 14 days?"],
    check: () => ({ pass: false, why: "not run" }),
    before: async () => {
      const r = await fetch(`${BASE}/api/campaigns/C07/metrics`, { method: "POST", headers: { "content-type": "application/json", ...(await gateCookie()) }, body: JSON.stringify({ activity_date: "2025-03-31", impressions: 2000, clicks: 60, marketing_spend_inr: 5000 }) });
      if (!r.ok) throw new Error(`metrics POST failed ${r.status}`);
      const after = buildSnapshot(await loadDatasetUncached(db), "2025-03-31");
      const e = evaluateRules(after).value.evaluations.find((x) => x.campaign_id === "C07")!;
      changeCase.check = hasNumber(e.value!, { tol: 1 });
    },
    after: async () => {
      if (!ADMIN) throw new Error("ADMIN_TOKEN not set; database NOT reset after the data-change case");
      const r = await fetch(`${BASE}/api/admin/reset`, { method: "POST", headers: { authorization: `Bearer ${ADMIN}` } });
      if (!r.ok) throw new Error(`reset failed ${r.status}`);
    },
  };
  cases.push(changeCase);

  const results: { c: Case; turn: Turn; pass: boolean; why: string }[] = [];
  for (const c of cases) {
    let history: unknown[] = [];
    let turn: Turn | null = null;
    let why = "";
    let pass = false;
    try {
      await c.before?.();
      for (const q of c.turns) {
        const r = await ask(c.asOf, history, q);
        history = r.msgs;
        turn = r.turn;
        if (c.turns.length > 1) await new Promise((r) => setTimeout(r, PAUSE_MS));
      }
      const res = turn!.error && !turn!.text ? { pass: false, why: `error: ${turn!.error}` } : c.check(turn!);
      pass = res.pass;
      why = res.why;
      await c.after?.();
    } catch (err) {
      pass = false;
      why = `harness: ${(err as Error).message}`;
    }
    turn ??= { text: "", tools: [], unsupported: 0, claims: 0, providers: [], ms: 0, raw: [] };
    results.push({ c, turn, pass, why });
    console.log(`${pass ? "PASS" : "FAIL"} ${c.id.padEnd(3)} ${c.category.padEnd(18)} ${String(turn.ms).padStart(6)}ms  grounded ${turn.claims - turn.unsupported}/${turn.claims}  ${why.slice(0, 120)}`);
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  const passed = results.filter((r) => r.pass).length;
  const claims = results.reduce((a, r) => a + r.turn.claims, 0);
  const unsupported = results.reduce((a, r) => a + r.turn.unsupported, 0);
  const byCat = new Map<string, { n: number; p: number }>();
  for (const r of results) {
    const x = byCat.get(r.c.category) ?? { n: 0, p: 0 };
    x.n++;
    if (r.pass) x.p++;
    byCat.set(r.c.category, x);
  }
  const md = `# Copilot eval results

Run: ${new Date().toISOString()} against \`${BASE}\`. Expected values are computed by the analytics engine from the live database at run time (not hard-coded).

**Pass rate: ${passed}/${results.length} (${((passed / results.length) * 100).toFixed(1)}%)** · numeric claims grounded: ${claims - unsupported}/${claims} (${claims ? (((claims - unsupported) / claims) * 100).toFixed(1) : "—"}%)

| Category | Passed |
|---|---|
${[...byCat].map(([k, v]) => `| ${k} | ${v.p}/${v.n} |`).join("\n")}

| ID | Category | Question(s) | Result | Check | Tools | Grounded | Model(s) | ms |
|---|---|---|---|---|---|---|---|---|
${results
  .map(
    (r) =>
      `| ${r.c.id} | ${r.c.category} | ${r.c.turns.map((t) => t.replace(/\|/g, "/")).join(" → ")} | ${r.pass ? "PASS" : "FAIL"} | ${r.why.replace(/\|/g, "/").slice(0, 160)} | ${r.turn.tools.join(", ")} | ${r.turn.claims - r.turn.unsupported}/${r.turn.claims} | ${[...new Set(r.turn.providers)].join(", ")} | ${r.turn.ms} |`,
  )
  .join("\n")}
`;
  await writeFile("docs/eval-results.md", md);
  console.log(`\nPass rate ${passed}/${results.length}. Grounded claims ${claims - unsupported}/${claims}. Wrote docs/eval-results.md`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => (await getClient()).close());
