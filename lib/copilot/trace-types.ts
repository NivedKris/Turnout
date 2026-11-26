/**
 * Execution trace for one copilot turn. Built server-side from real executions
 * (model calls, tool calls, engine results), never from model self-report.
 * Streamed to the UI as a `data-trace` part and stored with the message.
 */
export type TraceNodeKind =
  | "question"
  | "llm" // one model call (step), with provider/model and outcome
  | "tool" // a tool call with args and duration
  | "engine" // analytics function that produced numbers
  | "source" // collection read
  | "rule" // a decision rule evaluation
  | "assumption" // labelled assumption or dataset rule
  | "proposal" // action proposed for user confirmation
  | "claim" // a number in the final answer
  | "answer";

export type TraceNode = {
  id: string;
  kind: TraceNodeKind;
  label: string;
  /** Short secondary line, e.g. provider, duration, value. */
  sub?: string;
  status?: "running" | "ok" | "error" | "fallback" | "unsupported" | "pending";
  /** Arbitrary JSON shown in the inspector. Kept small. */
  detail?: Record<string, unknown>;
  t: number; // ms since turn start
};

export type TraceEdgeRel = "asks" | "calls" | "computed_by" | "reads" | "evaluates" | "assumes" | "supports" | "proposes" | "falls_back_to" | "answers" | "next";

export type TraceEdge = { id: string; from: string; to: string; rel: TraceEdgeRel };

export type Trace = {
  id: string;
  as_of: string;
  started_at: string;
  nodes: TraceNode[];
  edges: TraceEdge[];
  providers: { provider: string; model: string; ok: boolean; ms: number; error?: string }[];
  stats: { steps: number; tool_calls: number; claims: number; unsupported_claims: number; ms: number };
  done: boolean;
};
