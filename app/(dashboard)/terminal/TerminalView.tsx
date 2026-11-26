"use client";

import { useMemo, useState } from "react";
import { ChatPane } from "@/components/copilot/ChatPane";
import { traceOf, useCopilot } from "@/components/copilot/CopilotProvider";
import { Inspector, SUMMARY_ASM, SUMMARY_CLM, TraceGraph, TraceStats } from "@/components/copilot/TraceGraph";
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

      <div className="grid min-h-0 gap-2 lg:grid-cols-[minmax(320px,1fr)_minmax(0,2fr)_minmax(260px,0.9fr)]">
        <section className="flex min-h-0 flex-col border border-line bg-surface" aria-label="Chat">
          <header className="border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-3">01 · Conversation</header>
          <div className="min-h-0 flex-1">
            <ChatPane onTrace={(id) => (setSelectedTrace(id), setNode(null))} />
          </div>
        </section>

        <section className="flex min-h-0 flex-col border border-line bg-surface" aria-label="Execution graph">
          <header className="flex items-center gap-2 border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-3">
            02 · Execution graph {status === "streaming" && <span className="animate-pulse text-fg">● LIVE</span>}
            <span className="ml-auto normal-case tracking-normal">question → model steps → tools → engine → sources/rules/assumptions → claims → answer</span>
          </header>
          <div className="min-h-0 flex-1 p-1">
            {trace ? (
              <TraceGraph
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
                height="100%"
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center font-mono text-[11px] text-fg-3">
                Ask something. The agent&apos;s execution appears here live: every model call (and fallback), tool, engine function, data source, rule and assumption, and whether each number in the answer is grounded.
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col gap-2" aria-label="Inspector">
          <div className="flex min-h-0 flex-1 flex-col border border-line bg-surface">
            <header className="border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-3">03 · Inspector</header>
            <div className="min-h-0 flex-1 p-3">{trace ? <Inspector trace={trace} id={node} opts={{ assumptions: asm, claims }} /> : null}</div>
          </div>
          <div className="flex max-h-[38%] min-h-0 flex-col border border-line bg-bg">
            <header className="border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-3">04 · Exec log</header>
            <ol className="min-h-0 flex-1 overflow-y-auto p-2 font-mono text-[10px] leading-relaxed">
              {trace?.nodes
                .filter((n) => n.kind === "llm" || n.kind === "tool" || n.kind === "proposal" || n.kind === "answer")
                .sort((a, b) => a.t - b.t)
                .map((n) => (
                  <li key={n.id}>
                    <button onClick={() => setNode(n.id)} className="w-full truncate text-left hover:text-fg">
                      <span className="text-fg-3">+{String(n.t).padStart(5, " ")}ms</span>{" "}
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
