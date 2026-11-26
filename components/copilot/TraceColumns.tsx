"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Trace, TraceNode, TraceNodeKind } from "@/lib/copilot/trace-types";
import { collapse } from "./TraceGraph";

/**
 * Column trace: every step of the agent sits in a fixed stage column, cards are
 * stacked and centred, and thin curved connectors show what fed what. Selecting a
 * card lights up its path. Reads left to right like a pipeline.
 */
const STAGES: { key: string; label: string; kinds: TraceNodeKind[] }[] = [
  { key: "model", label: "Model", kinds: ["llm"] },
  { key: "tools", label: "Tools", kinds: ["tool"] },
  { key: "engine", label: "Engine", kinds: ["engine", "proposal"] },
  { key: "data", label: "Data & rules", kinds: ["source", "rule", "assumption"] },
  { key: "answer", label: "Answer", kinds: ["answer", "claim"] },
];

const CARD_H = 46;
const MIN_COL = 122;
const GAP = 12;
const HEAD = 34;
const PAD = 18;

function shortLabel(n: TraceNode): string {
  if (n.kind === "llm") return (n.detail?.model as string | undefined)?.split("/").pop() ?? n.label;
  if (n.kind === "tool") return n.label.replace(/_/g, " ");
  if (n.kind === "engine") return n.label.replace(/\(.*\)/, "");
  return n.label;
}
function subLabel(n: TraceNode): string {
  if (n.kind === "llm") return `${n.detail?.provider ?? ""} · step ${n.detail?.step ?? ""}${n.status === "fallback" ? " · fell back" : ""}`;
  if (n.kind === "tool") return n.sub?.replace(/ · \d[\d,]* bytes/, "") ?? "";
  return n.sub ?? "";
}

export function TraceColumns({
  trace,
  selected,
  onSelect,
  showAssumptions,
  showClaims,
  renderDetail,
  onClose,
}: {
  trace: Trace;
  selected: string | null;
  onSelect: (id: string) => void;
  showAssumptions: boolean;
  showClaims: boolean;
  /** Detail card rendered next to the selected step. */
  renderDetail?: (id: string) => ReactNode;
  onClose?: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  const [hover, setHover] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  // Bring the detail card into view when a step is selected.
  useEffect(() => {
    if (selected) detailRef.current?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [selected]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { cards, edges, height, colX, colW, innerW } = useMemo(() => {
    const view = collapse(trace, { assumptions: showAssumptions, claims: showClaims });
    const cols = STAGES.map((st) => view.nodes.filter((n) => st.kinds.includes(n.kind)).sort((a, b) => a.t - b.t));
    const maxN = Math.max(1, ...cols.map((c) => c.length));
    const height = HEAD + PAD * 2 + maxN * CARD_H + (maxN - 1) * GAP;
    const colGap = 16;
    const colW = Math.max(MIN_COL, Math.floor((w - PAD * 2 - colGap * (STAGES.length - 1)) / STAGES.length));
    const innerW = PAD * 2 + STAGES.length * colW + colGap * (STAGES.length - 1);
    const colX = STAGES.map((_, i) => PAD + i * (colW + colGap));
    const pos = new Map<string, { x: number; y: number; n: TraceNode }>();
    cols.forEach((col, ci) => {
      const total = col.length * CARD_H + Math.max(0, col.length - 1) * GAP;
      const top = HEAD + PAD + (height - HEAD - PAD * 2 - total) / 2;
      col.forEach((n, i) => pos.set(n.id, { x: colX[ci]!, y: top + i * (CARD_H + GAP), n }));
    });
    // Always draw left → right: a backward edge (e.g. answer → claim summary) is drawn reversed.
    const edges = view.edges
      .filter((e) => pos.has(e.from) && pos.has(e.to))
      .map((e) => {
        const a = pos.get(e.from)!;
        const b = pos.get(e.to)!;
        return b.x < a.x ? { ...e, a: b, b: a } : { ...e, a, b };
      });
    return { cards: [...pos.values()], edges, height, colX, colW, innerW };
  }, [trace, showAssumptions, showClaims, w]);

  const focus = hover ?? selected;
  const lit = useMemo(() => {
    if (!focus) return null;
    // Light the whole upstream + downstream path of the focused card.
    const set = new Set<string>([focus]);
    const walk = (id: string, dir: "up" | "down") => {
      for (const e of edges) {
        const next = dir === "up" ? (e.to === id ? e.from : null) : e.from === id ? e.to : null;
        if (next && !set.has(next)) {
          set.add(next);
          walk(next, dir);
        }
      }
    };
    walk(focus, "up");
    walk(focus, "down");
    return set;
  }, [focus, edges]);

  return (
    <div ref={wrap} className="tn-trace relative w-full overflow-auto" style={{ height: "100%" }}>
      <div className="relative" style={{ height, width: innerW }}>
        {/* stage headers */}
        {STAGES.map((st, i) => (
          <div key={st.key} className="absolute top-3 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-fg-3" style={{ left: colX[i], width: colW }}>
            {st.label}
          </div>
        ))}

        {/* connectors */}
        <svg className="pointer-events-none absolute inset-0" width={innerW} height={height} aria-hidden>
          {edges.map((e) => {
            const x1 = e.a.x + colW;
            const y1 = e.a.y + CARD_H / 2;
            const x2 = e.b.x;
            const y2 = e.b.y + CARD_H / 2;
            const same = x2 <= x1; // same column (e.g. claim → answer): loop below
            const d = same ? `M${e.a.x + colW / 2},${e.a.y + CARD_H} C${e.a.x + colW / 2},${y2 + 30} ${e.b.x + colW / 2},${y2 + 30} ${e.b.x + colW / 2},${e.b.y + CARD_H}` : `M${x1},${y1} C${x1 + (x2 - x1) * 0.5},${y1} ${x1 + (x2 - x1) * 0.5},${y2} ${x2},${y2}`;
            const on = lit ? lit.has(e.from) && lit.has(e.to) : false;
            const dashed = e.rel === "falls_back_to" || e.rel === "reads" || e.rel === "assumes";
            return <path key={e.id} d={d} fill="none" stroke="var(--text)" strokeOpacity={lit ? (on ? 0.85 : 0.08) : 0.22} strokeWidth={on ? 1.4 : 1} strokeDasharray={dashed ? "3 4" : undefined} />;
          })}
        </svg>

        {/* cards */}
        {cards.map(({ x, y, n }) => {
          const dim = lit && !lit.has(n.id);
          const bad = n.status === "unsupported" || n.status === "error";
          const warn = n.status === "fallback" || n.status === "pending";
          const strong = n.kind === "answer" || n.kind === "question";
          return (
            <button
              key={n.id}
              onClick={() => onSelect(n.id)}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              className={`absolute flex flex-col justify-center rounded-lg px-3 text-left transition-[opacity,border-color] ${
                strong ? "border-2 border-fg bg-surface" : bad ? "border-2 border-fg bg-surface" : warn ? "border border-dashed border-fg-2 bg-surface" : "border border-line bg-surface hover:border-fg-2"
              } ${selected === n.id ? "ring-2 ring-fg ring-offset-2 ring-offset-bg" : ""} ${dim ? "opacity-30" : ""}`}
              style={{ left: x, top: y, width: colW, height: CARD_H }}
              aria-label={`${n.kind} ${n.label}`}
            >
              <span className="truncate font-dot text-[13px] font-bold uppercase leading-tight tracking-wide" title={n.label}>
                {bad && "✕ "}
                {warn && n.status === "fallback" && "↯ "}
                {shortLabel(n)}
              </span>
              <span className="truncate font-mono text-[10px] leading-tight text-fg-3">{subLabel(n)}</span>
              {n.status === "running" && <span className="absolute right-2 top-2 h-1.5 w-1.5 animate-pulse rounded-full bg-fg" />}
            </button>
          );
        })}
        {/* detail card anchored to the selected step */}
        {selected && renderDetail && (() => {
          const c = cards.find((x) => x.n.id === selected);
          if (!c) return null;
          const CW = 340;
          const right = c.x + colW + 14 + CW <= Math.max(innerW, w);
          const left = right ? c.x + colW + 14 : Math.max(8, c.x - CW - 14);
          const top = Math.max(HEAD, Math.min(c.y - 12, height - 60));
          return (
            <div
              ref={detailRef}
              role="dialog"
              aria-label={`Details for ${c.n.label}`}
              className="absolute z-20 flex max-h-[360px] flex-col rounded-xl border-2 border-fg bg-surface shadow-[0_10px_40px_rgba(0,0,0,0.35)]"
              style={{ left, top, width: CW }}
            >
              <span
                aria-hidden
                className="absolute top-5 h-3 w-3 rotate-45 border-fg bg-surface"
                style={right ? { left: -7, borderLeftWidth: 2, borderBottomWidth: 2 } : { right: -7, borderRightWidth: 2, borderTopWidth: 2 }}
              />
              <button onClick={onClose} aria-label="Close details" className="absolute right-2 top-2 rounded-full px-2 text-[14px] text-fg-3 hover:text-fg">
                ✕
              </button>
              <div className="min-h-0 overflow-y-auto p-4 pr-8">{renderDetail(selected)}</div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
