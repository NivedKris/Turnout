"use client";

import { createDecisionAction, createTaskAction, updateCampaignAction } from "@/app/actions";
import { assistant, type Proposal } from "./store";

/**
 * Executes an accepted proposal through the same Server Actions the screens use
 * (actor "copilot", so it shows in the activity log), then refreshes the page.
 */
export async function applyProposal(id: string, refresh: () => void): Promise<{ ok: boolean; message: string }> {
  const p = assistant.get().proposals[id];
  if (!p) return { ok: false, message: `No waiting proposal ${id}.` };
  if (p.state !== "pending") return { ok: false, message: `Proposal ${id} is already ${p.state}.` };
  const r = await run(p);
  if (r.ok) {
    assistant.settle(id, "confirmed", r.message);
    refresh();
  } else assistant.settle(id, "failed", r.message);
  return r;
}

async function run(p: Proposal): Promise<{ ok: boolean; message: string }> {
  try {
    if (p.kind === "task") {
      const r = await createTaskAction(p.payload, "copilot");
      return r.ok ? { ok: true, message: `Created task ${(r.data as { task_id: string }).task_id}.` } : { ok: false, message: r.error };
    }
    if (p.kind === "decision") {
      const r = await createDecisionAction(p.payload, "copilot");
      return r.ok ? { ok: true, message: `Logged decision ${(r.data as { decision_id: string }).decision_id}.` } : { ok: false, message: r.error };
    }
    const { campaign_id, patch } = p.payload as { campaign_id: string; patch: Record<string, unknown> };
    const r = await updateCampaignAction(campaign_id, patch, "copilot");
    return r.ok ? { ok: true, message: `Updated ${campaign_id}.` } : { ok: false, message: r.error };
  } catch {
    return { ok: false, message: "Saving failed." };
  }
}

export function rejectProposal(id: string): { ok: boolean; message: string } {
  const p = assistant.get().proposals[id];
  if (!p || p.state !== "pending") return { ok: false, message: `No waiting proposal ${id}.` };
  assistant.settle(id, "rejected");
  return { ok: true, message: "Discarded. Nothing was changed." };
}

/** Turns a WRITE tool's draft into a proposal record. */
export function proposalFromDraft(tool: string, out: Record<string, unknown>): Omit<Proposal, "state"> | null {
  const id = String(out.proposal_id ?? `p_${Date.now().toString(36)}`).replace(/^prop:tool:/, "p_");
  if (tool === "propose_task" && out.draft) {
    const d = out.draft as Record<string, unknown>;
    return { id, kind: "task", summary: `Create task "${d.title}" for ${d.owner_name}, due ${d.due_date}`, payload: d };
  }
  if (tool === "propose_decision" && out.draft) {
    const d = out.draft as Record<string, unknown>;
    return { id, kind: "decision", summary: `Log decision ${String(d.decision).toUpperCase()}: ${d.title}`, payload: d };
  }
  if (tool === "propose_campaign_update" && out.campaign_id) {
    return { id, kind: "campaign_update", summary: `Update ${out.campaign_id} ${out.campaign_name}: ${Object.entries(out.patch as object).map(([k, v]) => `${k} → ${JSON.stringify(v)}`).join(", ")}`, payload: { campaign_id: out.campaign_id, patch: out.patch } };
  }
  return null;
}
