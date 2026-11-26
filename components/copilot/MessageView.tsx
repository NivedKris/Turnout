"use client";

import { ConfirmCard, type Proposal } from "./ConfirmCard";
import { traceOf, type CopilotMessage } from "./CopilotProvider";
import { Markdown } from "./Markdown";
import { TraceStats } from "./TraceGraph";

type ToolPart = { type: string; toolCallId: string; state: string; input?: unknown; output?: unknown; errorText?: string };

/** One message: text, "Checked:" tool chips (the grounding), confirmation cards and the trace summary. */
export function MessageView({ m, onTrace, compact = false }: { m: CopilotMessage; onTrace?: (traceId: string) => void; compact?: boolean }) {
  if (m.role === "user") {
    const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ");
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] border border-line bg-surface-2 px-3 py-2 text-[14px]">
          <span className="mr-2 font-mono text-[10px] text-fg-3">YOU ›</span>
          {text}
        </p>
      </div>
    );
  }
  const tools = m.parts.filter((p) => p.type.startsWith("tool-")) as unknown as ToolPart[];
  const trace = traceOf(m);
  const proposals = tools
    .filter((t) => (t.type === "tool-propose_task" || t.type === "tool-propose_campaign_update") && t.state === "output-available")
    .map((t) => t.output as Proposal)
    .filter((p) => p && !("error" in (p as object)));
  return (
    <div className="flex flex-col gap-2">
      {tools.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 font-mono text-[10px]">
          <span className="uppercase tracking-widest text-fg-3">Checked</span>
          {tools.map((t) => (
            <span
              key={t.toolCallId}
              title={JSON.stringify(t.input ?? {})}
              className={`border px-1.5 py-0.5 tracking-wider ${t.state === "output-available" ? "border-line text-fg-2" : t.state === "output-error" ? "border-dashed border-fg text-fg" : "animate-pulse border-fg text-fg"}`}
            >
              {t.state === "output-available" ? "✓" : t.state === "output-error" ? "✕" : "…"} {t.type.slice(5)}
            </span>
          ))}
        </div>
      )}
      {m.parts.map((p, i) => (p.type === "text" && p.text.trim() ? <Markdown key={i} text={p.text} /> : null))}
      {proposals.map((p) => (
        <ConfirmCard key={p.proposal_id} p={p} />
      ))}
      {trace && !compact && (
        <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-line pt-2">
          <TraceStats trace={trace} />
          {onTrace && (
            <button onClick={() => onTrace(trace.id)} className="ml-auto border border-line px-2 py-0.5 font-mono text-[10px] tracking-wider text-fg-2 hover:border-fg hover:text-fg">
              VIEW TRACE →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
