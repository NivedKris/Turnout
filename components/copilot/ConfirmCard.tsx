"use client";

import { useState, useTransition } from "react";
import { createDecisionAction, createTaskAction, updateCampaignAction } from "@/app/actions";
import { Button, DateField, Input, Select } from "@/components/ui/form";

type TaskProposal = {
  proposal_id: string;
  kind: "task";
  draft: { title: string; owner_name: string; due_date: string; priority: "P0" | "P1" | "P2"; campaign_id: string | null; description: string; source_insight: string; status: "todo" };
  valid: boolean;
  issues: string[];
};
type CampaignProposal = {
  proposal_id: string;
  kind: "campaign_update";
  campaign_id: string;
  campaign_name: string;
  before: Record<string, unknown>;
  patch: Record<string, unknown>;
  rationale: string;
  valid: boolean;
  issues: string[];
};
type DecisionProposal = {
  proposal_id: string;
  kind: "decision";
  draft: { decision: string; title: string; rationale: string; bet_id: string | null; campaign_id: string | null; outcome_metric: string; as_of: string; evidence: Record<string, never> };
  valid: boolean;
  issues: string[];
};
export type Proposal = TaskProposal | CampaignProposal | DecisionProposal;

/**
 * Insight → action: the copilot only drafts. The user confirms, edits or discards here;
 * confirming calls the same mutation path as the UI with actor "copilot", so it shows in ACT.
 */
export function ConfirmCard({ p }: { p: Proposal }) {
  const [state, setState] = useState<"pending" | "confirmed" | "discarded">("pending");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState(p.kind === "task" ? p.draft : null);

  const confirm = () =>
    start(async () => {
      setError(null);
      const r =
        p.kind === "task" ? await createTaskAction(draft, "copilot") : p.kind === "decision" ? await createDecisionAction(p.draft, "copilot") : await updateCampaignAction(p.campaign_id, p.patch, "copilot");
      if (r.ok) {
        setState("confirmed");
        setResult(
          p.kind === "task"
            ? `Created ${(r.data as { task_id: string }).task_id}. It's now in Tasks and the activity log.`
            : p.kind === "decision"
              ? `Logged ${(r.data as { decision_id: string }).decision_id} with evidence frozen. Its outcome is measured over the next 14 days.`
              : `Updated ${p.campaign_id}. Logged in the activity log; analytics recalculated.`,
        );
      } else setError(r.error);
    });

  return (
    <div className={`mt-2 border ${state === "pending" ? "border-fg" : "border-line"} bg-bg`} role="group" aria-label="Copilot proposal">
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em]">
        <span className="bg-fg px-1 font-bold text-bg">{p.kind === "task" ? "PROPOSED TASK" : p.kind === "decision" ? "PROPOSED DECISION" : "PROPOSED CHANGE"}</span>
        <span className="text-fg-3">{state === "pending" ? "awaiting your confirmation" : state}</span>
      </div>
      <div className="flex flex-col gap-2 p-3">
        {p.kind === "task" && draft ? (
          <>
            <Input aria-label="Task title" value={draft.title} disabled={state !== "pending"} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <Input aria-label="Owner" value={draft.owner_name} disabled={state !== "pending"} onChange={(e) => setDraft({ ...draft, owner_name: e.target.value })} />
              <DateField aria-label="Due date" value={draft.due_date} disabled={state !== "pending"} onChange={(v) => setDraft({ ...draft, due_date: v })} />
              <Select aria-label="Priority" value={draft.priority} disabled={state !== "pending"} onChange={(e) => setDraft({ ...draft, priority: e.target.value as "P0" })}>
                {["P0", "P1", "P2"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
            </div>
            {draft.campaign_id && <p className="font-mono text-[11px] text-fg-3">Campaign {draft.campaign_id}</p>}
            <p className="border-l border-fg-3 pl-2 text-[12px] text-fg-2">Why: {draft.source_insight}</p>
          </>
        ) : p.kind === "decision" ? (
          <>
            <p className="text-[14px] font-semibold">
              <span className="mr-2 rounded-full bg-fg px-2 py-0.5 text-[11px] uppercase text-bg">{p.draft.decision}</span>
              {p.draft.title}
            </p>
            <p className="font-mono text-[11px] text-fg-3">
              {p.draft.bet_id ?? ""} {p.draft.campaign_id ?? ""} · data date {p.draft.as_of} · judged by {p.draft.outcome_metric.replaceAll("_", " ")}
            </p>
            <p className="border-l border-fg-3 pl-2 text-[12px] text-fg-2">Why: {p.draft.rationale}</p>
          </>
        ) : p.kind === "campaign_update" ? (
          <>
            <p className="font-mono text-[12px]">
              {p.campaign_id} {p.campaign_name}
            </p>
            <table className="font-mono text-[11px]">
              <tbody>
                {Object.keys(p.patch).map((k) => (
                  <tr key={k}>
                    <td className="pr-3 text-fg-3">{k}</td>
                    <td className="pr-3 text-fg-3 line-through">{JSON.stringify(p.before[k] ?? null)}</td>
                    <td className="text-fg">{JSON.stringify(p.patch[k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-l border-fg-3 pl-2 text-[12px] text-fg-2">Why: {p.rationale}</p>
          </>
        ) : null}
        {!p.valid && <p className="font-mono text-[11px]">⚠ Draft needs fixing: {p.issues.join("; ")}</p>}
        {error && <p role="alert" className="font-mono text-[11px]">✕ {error}</p>}
        {result && <p role="status" className="font-mono text-[11px] text-fg">✓ {result}</p>}
        {state === "pending" && (
          <div className="flex gap-2">
            <Button onClick={confirm} disabled={pending}>
              {pending ? "Saving…" : "Confirm"}
            </Button>
            <Button variant="ghost" onClick={() => setState("discarded")} disabled={pending}>
              Discard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
