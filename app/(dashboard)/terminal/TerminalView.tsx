"use client";

import { useMemo, useState } from "react";
import { ChatPane } from "@/components/copilot/ChatPane";
import { traceOf, useCopilot } from "@/components/copilot/CopilotProvider";
import { TraceColumns } from "@/components/copilot/TraceColumns";
import { Inspector, SUMMARY_ASM, SUMMARY_CLM, TraceStats } from "@/components/copilot/TraceGraph";
import type { Trace } from "@/lib/copilot/trace-types";

/** Bloomberg-style copilot terminal: chat | live execution graph | inspector + exec log. */
export function TerminalView() {
  const { messages, selectedTrace, setSelectedTrace, status } = useCopilot();
  const [node, setNode] = useState<string | null>(null);
  const [asm, setAsm] = useState(false);
  const [claims, setClaims] = useState(false);
  const traces = useMemo(
    () =>
      messages
        .map((m, i) => ({ t: m.role === "assistant" ? traceOf(m) : null, q: messages[i - 1]?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ") ?? "" }))
        .filter((x): x is { t: Trace; q: string } => Boolean(x.t)),
    [messages],
  );
  const trace = traces.find((x) => x.t.id === selectedTrace)?.t ?? traces.at(-1)?.t ?? null;

  return (
    <div className="grid h-[calc(100vh-49px)] min-h-[640px] grid-rows-[auto_1fr] gap-2 p-2">
      <div className="flex flex-wrap items-center gap-3 border border-line bg-surface px-3 py-1.5 font-mono text-[11px]">
        <span className="bg-fg px-1.5 py-px font-bold tracking-widest text-bg">TERM</span>
        <span className="uppercase tracking-[0.18em]">Copilot terminal · agent execution</span>
        {trace && <TraceStats trace={trace} />}
        <span className="ml-auto flex items-center gap-2">
          {trace && (
            <>
              <LayerToggle on={asm} onClick={() => setAsm((x) => !x)} label="Assumptions & rules" count={`${trace.nodes.filter((n) => n.kind === "assumption").length}`} />
              <LayerToggle
                on={claims}
                onClick={() => setClaims((x) => !x)}
                label="Answer numbers"
                count={`${trace.stats.claims - trace.stats.unsupported_claims}/${trace.stats.claims} grounded`}
              />
            </>
          )}
          {traces.length > 1 && (
            <select
              aria-label="Select turn"
              value={trace?.id ?? ""}
              onChange={(e) => (setSelectedTrace(e.target.value), setNode(null))}
              className="max-w-56 border border-line bg-bg px-1 py-0.5"
            >
              {traces.map((x, i) => (
                <option key={x.t.id} value={x.t.id}>
                  #{i + 1} {x.q.slice(0, 40)}
                </option>
              ))}
            </select>
          )}
        </span>
      </div>

      <div className="grid min-h-0 gap-2 lg:grid-cols-[290px_minmax(0,1fr)_300px]">
        <section className="flex min-h-0 flex-col border border-line bg-surface" aria-label="Chat">
          <header className="border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-3">01 · Conversation</header>
          <div className="min-h-0 flex-1">
            <ChatPane onTrace={(id) => (setSelectedTrace(id), setNode(null))} />
          </div>
        </section>

        <section className="flex min-h-0 flex-col border border-line bg-surface" aria-label="Execution graph">
          <header className="flex items-center gap-2 border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-3">
            <span className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full bg-fg ${status === "streaming" ? "animate-pulse" : ""}`} /> Turnout trace</span>
            {trace && <span className="min-w-0 truncate normal-case tracking-normal text-fg-2">“{(trace.nodes.find((n) => n.id === "q")?.detail?.text as string | undefined) ?? ""}”</span>}
            <span className="ml-auto shrink-0 normal-case tracking-normal">tap any step to see why</span>
          </header>
          <div className="min-h-0 flex-1 p-1">
            {trace ? (
              <TraceColumns
                trace={trace}
                selected={node}
                onSelect={(id) => {
                  // Clicking a collapsed summary expands that layer.
                  if (id === SUMMARY_ASM) setAsm(true);
                  else if (id === SUMMARY_CLM) setClaims(true);
                  setNode(id);
                }}
                showAssumptions={asm}
                showClaims={claims}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center font-mono text-[11px] text-fg-3">
                Ask something. The agent&apos;s execution appears here live: every model call (and fallback), tool, engine function, data source, rule and assumption, and whether each number in the answer is grounded.
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col gap-2" aria-label="Inspector">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto border border-line bg-surface p-4">
            {trace ? <Verdict trace={trace} /> : <p className="font-mono text-[11px] text-fg-3">No turn yet.</p>}
            {trace && node && (
              <div className="mt-4 border-t border-line pt-3">
                <Inspector trace={trace} id={node} opts={{ assumptions: asm, claims }} />
              </div>
            )}
          </div>
          <div className="flex max-h-[38%] min-h-0 flex-col border border-line bg-bg">
            <header className="border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-3">Audit tape</header>
            <ol className="min-h-0 flex-1 overflow-y-auto p-2 font-mono text-[10px] leading-relaxed">
              {trace?.nodes
                .filter((n) => n.kind === "llm" || n.kind === "tool" || n.kind === "proposal" || n.kind === "answer")
                .sort((a, b) => a.t - b.t)
                .map((n) => (
                  <li key={n.id}>
                    <button onClick={() => setNode(n.id)} className="w-full truncate text-left hover:text-fg">
                      <span className="text-fg-3">{clock(trace.started_at, n.t)}</span>{" "}
                      <span className={n.status === "fallback" || n.status === "error" ? "text-fg underline decoration-dotted" : "text-fg-2"}>
                        {n.kind.toUpperCase().padEnd(6, " ")} {n.label}
                      </span>{" "}
                      <span className="text-fg-3">{n.sub}</span>
                    </button>
                  </li>
                ))}
              {trace?.providers.filter((p) => !p.ok).map((p, i) => (
                <li key={`err${i}`} className="truncate text-fg-3">
                  ↯ {p.provider} {p.model}: {p.error}
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Large, obvious layer switch with a count, so people know the layer exists and how big it is. */
function LayerToggle({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-[13px] font-medium transition-colors ${on ? "border-fg bg-fg text-bg" : "border-line text-fg-2 hover:border-fg-2 hover:text-fg"}`}
    >
      <span className={`flex h-4 w-7 items-center rounded-full p-0.5 ${on ? "bg-bg/30" : "bg-fg/15"}`} aria-hidden>
        <span className={`h-3 w-3 rounded-full transition-transform ${on ? "translate-x-3 bg-bg" : "bg-fg-2"}`} />
      </span>
      {on ? "Hide" : "Show"} {label}
      <span className={`font-mono text-[11px] ${on ? "opacity-70" : "text-fg-3"}`}>{count}</span>
    </button>
  );
}

const clock = (start: string, t: number) => new Date(Date.parse(start) + t).toLocaleTimeString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" });

/** Big verdict word, two stat cards and the "because" list, like a decision receipt. */
function Verdict({ trace }: { trace: Trace }) {
  const bad = trace.stats.unsupported_claims;
  const word = !trace.done ? "THINKING" : bad ? "CHECK" : trace.stats.claims ? "GROUNDED" : "ANSWERED";
  const tools = trace.nodes.filter((n) => n.kind === "tool");
  const because = tools.map((t) => {
    const engines = trace.edges.filter((e) => e.from === t.id).map((e) => trace.nodes.find((x) => x.id === e.to)).filter((x) => x?.kind === "engine" || x?.kind === "proposal");
    const sources = new Set(
      engines.flatMap((en) => trace.edges.filter((e) => e.from === en!.id).map((e) => trace.nodes.find((x) => x.id === e.to)).filter((x) => x?.kind === "source").map((x) => x!.label)),
    );
    return `${t.label.replace(/_/g, " ")}${engines.length ? `: ${engines.map((x) => x!.label).join(", ")}` : ""}${sources.size ? `, reading ${[...sources].join(", ")}` : ""}`;
  });
  const fellBack = trace.providers.filter((p) => !p.ok).length;
  return (
    <div className="flex flex-col gap-3">
      <p className="font-dot text-[52px] font-bold leading-none tracking-wide">{word}</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-line bg-bg p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-3">Numbers grounded</p>
          <p className="mt-1 font-dot text-[26px] font-bold leading-none">
            {trace.stats.claims - bad}/{trace.stats.claims}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-bg p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-3">Answered in</p>
          <p className="mt-1 font-dot text-[26px] font-bold leading-none">{(trace.stats.ms / 1000).toFixed(1)}s</p>
        </div>
      </div>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-3">Because</p>
      <ul className="flex flex-col gap-1.5 text-[13px] leading-snug text-fg-2">
        {because.map((b, i) => (
          <li key={i}>→ {b}</li>
        ))}
        {fellBack > 0 && <li>→ {fellBack} model call{fellBack > 1 ? "s" : ""} fell back to the next provider</li>}
        {bad > 0 && <li className="text-fg">→ {bad} number{bad > 1 ? "s" : ""} not found in any tool result: check them</li>}
      </ul>
    </div>
  );
}
