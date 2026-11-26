import type { Assumption, Result, SourceRef } from "../analytics";
import type { Trace, TraceEdgeRel, TraceNode } from "./trace-types";

/** Collects trace nodes/edges during a turn and emits throttled snapshots. */
export class TraceRecorder {
  readonly trace: Trace;
  private t0 = performance.now();
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The model call that produced the tool calls currently executing. */
  currentLlm: string | null = null;

  constructor(
    asOf: string,
    question: string,
    private onChange: (t: Trace) => void,
  ) {
    this.trace = {
      id: `tr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      as_of: asOf,
      started_at: new Date().toISOString(),
      nodes: [],
      edges: [],
      providers: [],
      stats: { steps: 0, tool_calls: 0, claims: 0, unsupported_claims: 0, ms: 0 },
      done: false,
    };
    this.add({ id: "q", kind: "question", label: question.length > 90 ? `${question.slice(0, 87)}…` : question, detail: { text: question, as_of: asOf } });
  }

  private now() {
    return Math.round(performance.now() - this.t0);
  }

  add(n: Omit<TraceNode, "t"> & { t?: number }): string {
    const existing = this.trace.nodes.find((x) => x.id === n.id);
    if (existing) {
      Object.assign(existing, n);
    } else {
      this.trace.nodes.push({ ...n, t: n.t ?? this.now() });
    }
    this.schedule();
    return n.id;
  }

  update(id: string, patch: Partial<TraceNode>) {
    const n = this.trace.nodes.find((x) => x.id === id);
    if (n) Object.assign(n, patch);
    this.schedule();
  }

  link(from: string, to: string, rel: TraceEdgeRel) {
    const id = `${from}>${to}`;
    if (!this.trace.edges.some((e) => e.id === id)) this.trace.edges.push({ id, from, to, rel });
    this.schedule();
  }

  uid(prefix: string) {
    return `${prefix}_${++this.seq}`;
  }

  /** Records an engine Result under a tool node: engine fn, sources read, assumptions applied. */
  engine(toolId: string, fn: string, r: Pick<Result<unknown>, "formula" | "inputs" | "assumptions" | "sources">) {
    const id = this.add({ id: this.uid("eng"), kind: "engine", label: fn, sub: r.formula.length > 70 ? `${r.formula.slice(0, 67)}…` : r.formula, status: "ok", detail: { formula: r.formula, inputs: r.inputs } });
    this.link(toolId, id, "computed_by");
    for (const s of r.sources) this.source(id, s);
    for (const a of r.assumptions.slice(0, 8)) this.assumption(id, a);
    return id;
  }

  source(from: string, s: SourceRef) {
    const id = `src:${s.collection}`;
    const prev = this.trace.nodes.find((n) => n.id === id);
    const filters = new Set<string>([...(((prev?.detail?.filters as string[]) ?? []) as string[]), s.filter]);
    this.add({ id, kind: "source", label: s.collection, sub: `${s.records.toLocaleString("en-IN")} records`, detail: { records: s.records, filters: [...filters] } });
    this.link(from, id, "reads");
  }

  assumption(from: string, a: Assumption) {
    const id = `asm:${hash(a.text)}`;
    this.add({ id, kind: "assumption", label: a.text.length > 64 ? `${a.text.slice(0, 61)}…` : a.text, sub: a.label, detail: { ...a } });
    this.link(from, id, "assumes");
  }

  rule(from: string, e: { campaign_id: string; campaign_name: string; verdict: string; reason: string; value: number | null }) {
    const id = `rule:${e.campaign_id}`;
    this.add({ id, kind: "rule", label: `${e.campaign_id} ${e.verdict.toUpperCase()}`, sub: e.campaign_name, detail: { ...e } });
    this.link(from, id, "evaluates");
  }

  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 120);
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.trace.stats.ms = this.now();
    this.onChange(structuredClone(this.trace));
  }
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
