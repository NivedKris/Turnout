"use client";

import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import { Background, BackgroundVariant, Controls, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { memo, useEffect, useMemo } from "react";
import type { Trace, TraceNode, TraceNodeKind } from "@/lib/copilot/trace-types";

const TAG: Record<TraceNodeKind, string> = {
  question: "Q",
  llm: "LLM",
  tool: "TOOL",
  engine: "ENGINE",
  source: "SOURCE",
  rule: "RULE",
  assumption: "ASSUME",
  proposal: "PROPOSE",
  claim: "CLAIM",
  answer: "ANSWER",
};

type NData = { n: TraceNode; selected: boolean };
const W = { question: 240, llm: 210, tool: 200, engine: 220, source: 170, rule: 170, assumption: 220, proposal: 220, claim: 150, answer: 180 } as const;

const TraceNodeView = memo(function TraceNodeView({ data }: NodeProps<Node<NData>>) {
  const { n, selected } = data;
  const s = n.status;
  const border =
    s === "unsupported" ? "border-dashed border-fg" : s === "fallback" || s === "error" ? "border-dashed border-fg-2" : s === "running" || s === "pending" ? "border-fg" : n.kind === "answer" || n.kind === "question" ? "border-fg" : "border-line";
  const invert = n.kind === "answer" || n.kind === "question";
  return (
    <div
      className={`relative border ${border} ${invert ? "bg-fg text-bg" : "bg-surface text-fg"} ${selected ? "outline outline-2 outline-offset-2 outline-fg" : ""} px-2 py-1.5 font-mono`}
      style={{ width: W[n.kind] }}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-fg-3" />
      <div className="flex items-center gap-1.5 text-[8px] tracking-[0.2em]">
        <span className={`px-1 font-bold ${invert ? "bg-bg text-fg" : "bg-fg text-bg"}`}>{TAG[n.kind]}</span>
        {s === "running" && <span className="animate-pulse">● RUN</span>}
        {s === "fallback" && <span>↯ FALLBACK</span>}
        {s === "error" && <span>✕ ERROR</span>}
        {s === "unsupported" && <span className="font-bold">✕ UNSUPPORTED</span>}
        {s === "pending" && <span>◌ AWAITING USER</span>}
        <span className={`ml-auto ${invert ? "text-bg/60" : "text-fg-3"}`}>+{n.t}ms</span>
      </div>
      <div className="mt-0.5 truncate text-[11px] leading-tight" title={n.label}>
        {n.label}
      </div>
      {n.sub && (
        <div className={`truncate text-[9px] leading-tight ${invert ? "text-bg/70" : "text-fg-3"}`} title={n.sub}>
          {n.sub}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-fg-3" />
    </div>
  );
});

const nodeTypes = { trace: TraceNodeView };

/**
 * Collapsing: when a group is hidden, its nodes are replaced by ONE summary node
 * hanging off the answer, so the graph stays readable and the group stays discoverable.
 */
export const SUMMARY_ASM = "sum:assumptions";
export const SUMMARY_CLM = "sum:claims";

function collapse(trace: Trace, opts: { assumptions: boolean; claims: boolean }) {
  const asm = trace.nodes.filter((n) => n.kind === "assumption");
  const clm = trace.nodes.filter((n) => n.kind === "claim");
  const nodes = trace.nodes.filter((n) => (opts.assumptions || n.kind !== "assumption") && (opts.claims || n.kind !== "claim"));
  const edges = [...trace.edges];
  const anchor = trace.nodes.find((n) => n.id === "answer")?.id ?? trace.nodes.find((n) => n.kind === "engine")?.id ?? "q";
  if (!opts.assumptions && asm.length) {
    const by = (l: string) => asm.filter((a) => a.sub === l).length;
    nodes.push({
      id: SUMMARY_ASM,
      kind: "assumption",
      label: `${asm.length} assumptions & rules`,
      sub: `${by("Sourced")} sourced · ${by("Assumption")} assumed · ${by("Dataset rule")} dataset rules · click to expand`,
      status: "ok",
      t: Math.max(...asm.map((a) => a.t)),
      detail: { items: asm.map((a) => `${a.sub}: ${(a.detail?.text as string) ?? a.label}`) },
    });
    edges.push({ id: `${anchor}>${SUMMARY_ASM}`, from: anchor, to: SUMMARY_ASM, rel: "assumes" });
  }
  if (!opts.claims && clm.length) {
    const bad = clm.filter((c) => c.status === "unsupported").length;
    nodes.push({
      id: SUMMARY_CLM,
      kind: "claim",
      label: `${clm.length} numbers in the answer`,
      sub: `${clm.length - bad} grounded${bad ? ` · ${bad} UNSUPPORTED` : ""} · click to expand`,
      status: bad ? "unsupported" : "ok",
      t: Math.max(...clm.map((c) => c.t)),
      detail: { items: clm.map((c) => `${c.status === "unsupported" ? "✕" : "✓"} ${c.label}: ${c.sub}`) },
    });
    edges.push({ id: `${anchor}>${SUMMARY_CLM}`, from: anchor, to: SUMMARY_CLM, rel: "supports" });
  }
  return { nodes, edges };
}

function layout(trace: Trace, opts: { assumptions: boolean; claims: boolean }) {
  const { nodes, edges: all } = collapse(trace, opts);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = all.filter((e) => ids.has(e.from) && ids.has(e.to));
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 14, ranksep: 56, marginx: 12, marginy: 12 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: W[n.kind], height: n.sub ? 50 : 38 });
  for (const e of edges) g.setEdge(e.from, e.to);
  dagre.layout(g);
  return { nodes, edges, g };
}

/** Re-fits the viewport whenever the graph grows (live traces). */
function AutoFit({ count }: { count: number }) {
  const rf = useReactFlow();
  useEffect(() => {
    const id = requestAnimationFrame(() => void rf.fitView({ padding: 0.12, duration: 250 }));
    return () => cancelAnimationFrame(id);
  }, [count, rf]);
  return null;
}

export function TraceGraph(props: Parameters<typeof TraceGraphInner>[0]) {
  return (
    <ReactFlowProvider>
      <TraceGraphInner {...props} />
    </ReactFlowProvider>
  );
}

function TraceGraphInner({
  trace,
  selected,
  onSelect,
  showAssumptions = false,
  showClaims = false,
  height = 420,
}: {
  trace: Trace;
  selected?: string | null;
  onSelect?: (id: string) => void;
  showAssumptions?: boolean;
  showClaims?: boolean;
  height?: number | string;
}) {
  const { rfNodes, rfEdges } = useMemo(() => {
    const { nodes, edges, g } = layout(trace, { assumptions: showAssumptions, claims: showClaims });
    const rfNodes: Node<NData>[] = nodes.map((n) => {
      const p = g.node(n.id);
      return { id: n.id, type: "trace", position: { x: (p?.x ?? 0) - W[n.kind] / 2, y: (p?.y ?? 0) - 22 }, data: { n, selected: selected === n.id }, draggable: false };
    });
    const running = !trace.done;
    const rfEdges: Edge[] = edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      type: "smoothstep",
      animated: running && (e.rel === "calls" || e.rel === "asks" || e.rel === "next"),
      style: {
        stroke: e.rel === "supports" || e.rel === "answers" || e.rel === "calls" ? "var(--text)" : "var(--text-3)",
        strokeWidth: e.rel === "supports" ? 1.4 : 1,
        strokeDasharray: e.rel === "reads" || e.rel === "assumes" ? "2 3" : e.rel === "falls_back_to" ? "6 3" : undefined,
      },
      label: e.rel === "falls_back_to" ? "fallback" : undefined,
      labelStyle: { fill: "var(--text-2)", fontFamily: "var(--font-geist-mono)", fontSize: 9 },
      labelBgStyle: { fill: "var(--bg)" },
    }));
    return { rfNodes, rfEdges };
  }, [trace, selected, showAssumptions, showClaims]);

  return (
    <div style={{ height }} className="tn-flow w-full border border-line bg-bg">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.2}
        maxZoom={1.6}
        nodesConnectable={false}
        nodesDraggable={false}
        onNodeClick={(_, n) => onSelect?.(n.id)}
        proOptions={{ hideAttribution: true }}
      >
        <AutoFit count={rfNodes.length} />
        <Background variant={BackgroundVariant.Dots} gap={14} size={1} color="var(--line)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}

export function TraceStats({ trace }: { trace: Trace }) {
  const served = trace.providers.filter((p) => p.ok).map((p) => `${p.model.split("/").pop()}@${p.provider}`);
  const fallbacks = trace.providers.filter((p) => !p.ok).length;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-fg-3">
      <span>{trace.done ? "■ done" : "● live"}</span>
      <span>{trace.stats.ms}ms</span>
      <span>{trace.stats.steps} steps</span>
      <span>{trace.stats.tool_calls} tools</span>
      <span>
        {trace.stats.claims - trace.stats.unsupported_claims}/{trace.stats.claims} claims grounded
      </span>
      {fallbacks > 0 && <span className="text-fg">↯ {fallbacks} fallback{fallbacks > 1 ? "s" : ""}</span>}
      {served.length > 0 && <span className="normal-case">{[...new Set(served)].join(" → ")}</span>}
    </div>
  );
}

export function Inspector({ trace, id, opts = { assumptions: false, claims: false } }: { trace: Trace; id: string | null; opts?: { assumptions: boolean; claims: boolean } }) {
  const view = collapse(trace, opts);
  const n = view.nodes.find((x) => x.id === id) ?? trace.nodes.find((x) => x.id === "answer") ?? trace.nodes[0];
  if (!n) return null;
  const inc = trace.edges.filter((e) => e.to === n.id).map((e) => `${e.rel} ← ${trace.nodes.find((x) => x.id === e.from)?.label ?? e.from}`);
  const out = trace.edges.filter((e) => e.from === n.id).map((e) => `${e.rel} → ${trace.nodes.find((x) => x.id === e.to)?.label ?? e.to}`);
  return (
    <div className="flex h-full flex-col gap-2 overflow-auto font-mono text-[11px]">
      <div className="flex items-center gap-2">
        <span className="bg-fg px-1 text-[9px] font-bold tracking-widest text-bg">{TAG[n.kind]}</span>
        <span className="truncate text-fg">{n.label}</span>
      </div>
      {n.sub && <p className="text-fg-2">{n.sub}</p>}
      <p className="text-fg-3">
        t+{n.t}ms · status {n.status ?? "—"} · id {n.id}
      </p>
      {inc.length > 0 && (
        <div>
          <p className="text-[9px] uppercase tracking-widest text-fg-3">Inputs</p>
          {inc.slice(0, 12).map((x) => (
            <p key={x} className="truncate text-fg-2">
              {x}
            </p>
          ))}
        </div>
      )}
      {out.length > 0 && (
        <div>
          <p className="text-[9px] uppercase tracking-widest text-fg-3">Outputs</p>
          {out.slice(0, 16).map((x) => (
            <p key={x} className="truncate text-fg-2">
              {x}
            </p>
          ))}
        </div>
      )}
      {Array.isArray(n.detail?.items) && (
        <ul className="flex flex-col gap-1 border border-line bg-surface p-2 text-[11px] leading-snug text-fg-2">
          {(n.detail!.items as string[]).map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )}
      {n.detail && !Array.isArray(n.detail.items) && (
        <pre className="whitespace-pre-wrap break-all border border-line bg-surface p-2 text-[10px] leading-snug text-fg-2">{JSON.stringify(n.detail, null, 1).slice(0, 6000)}</pre>
      )}
    </div>
  );
}
