"use client";

import { useState } from "react";
import { TaskForm } from "../tasks/TaskForm";
import type { TasksView } from "@/lib/server/views";

/** "+ TASK" on any insight: opens a prefilled task form; the insight text is stored as source_insight. */
export function InsightTask({
  title,
  insight,
  campaignId,
  owner,
  ctx,
}: {
  title: string;
  insight: string;
  campaignId?: string | null;
  owner?: string;
  ctx: Pick<TasksView, "owners" | "campaigns" | "meta">;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  if (done) return <span className="font-mono text-[10px] text-fg-2">✓ {done}</span>;
  return open ? (
    <div className="mt-2 w-full basis-full">
      <TaskForm
        v={ctx}
        preset={{ title, campaign_id: campaignId ?? null, owner_name: owner ?? ctx.owners[0], source_insight: insight, priority: "P0", due_date: ctx.meta.asOf }}
        onDone={(ok) => (ok ? setDone(ok) : setOpen(false))}
      />
    </div>
  ) : (
    <button onClick={() => setOpen(true)} className="shrink-0 border border-line px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-fg-2 hover:border-fg hover:text-fg">
      + TASK
    </button>
  );
}
