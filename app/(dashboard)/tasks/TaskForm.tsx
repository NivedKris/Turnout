"use client";

import { useState, useTransition } from "react";
import { createTaskAction, updateTaskAction } from "@/app/actions";
import { Button, Field, Input, Select, Textarea, issuesToErrors } from "@/components/ui/form";
import type { TasksView } from "@/lib/server/views";

type Task = TasksView["tasks"][number];
const STATUSES = ["todo", "doing", "blocked", "done"] as const;
const LABEL: Record<(typeof STATUSES)[number], string> = { todo: "To do", doing: "Doing", blocked: "Blocked", done: "Done" };

export function TaskForm({ v, task, onDone, preset }: { v: Pick<TasksView, "owners" | "campaigns" | "meta">; task?: Task; onDone: (ok: string) => void; preset?: Partial<Task> }) {
  const init = task ?? preset ?? {};
  const [form, setForm] = useState({
    title: init.title ?? "",
    description: init.description ?? "",
    campaign_id: init.campaign_id ?? "",
    owner_name: init.owner_name ?? v.owners[0] ?? "",
    due_date: init.due_date ?? v.meta.asOf,
    priority: init.priority ?? "P1",
    status: init.status ?? "todo",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = task ? await updateTaskAction(task.task_id, { ...form, campaign_id: form.campaign_id || null }) : await createTaskAction({ ...form, source_insight: preset?.source_insight ?? null });
      if (r.ok) onDone(task ? `Saved ${task.task_id}` : `Created ${(r.data as { task_id: string }).task_id}`);
      else {
        setErrors(issuesToErrors(r.issues));
        setError(r.error);
      }
    });
  };
  const id = task?.task_id ?? "new";
  return (
    <form onSubmit={submit} className="grid gap-3 border border-fg bg-bg p-3 sm:grid-cols-2" aria-label={task ? `Edit ${task.task_id}` : "New task"}>
      <Field label="Title" htmlFor={`${id}-title`} error={errors.title} className="sm:col-span-2">
        <Input id={`${id}-title`} value={form.title} onChange={set("title")} required minLength={3} maxLength={140} />
      </Field>
      <Field label="Owner" htmlFor={`${id}-owner`} error={errors.owner_name} hint="Pick or type a new owner">
        <Input id={`${id}-owner`} list={`${id}-owners`} value={form.owner_name} onChange={set("owner_name")} required />
        <datalist id={`${id}-owners`}>
          {v.owners.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </Field>
      <Field label="Due date" htmlFor={`${id}-due`} error={errors.due_date}>
        <Input id={`${id}-due`} type="date" value={form.due_date} onChange={set("due_date")} required />
      </Field>
      <Field label="Campaign" htmlFor={`${id}-camp`} error={errors.campaign_id}>
        <Select id={`${id}-camp`} value={form.campaign_id ?? ""} onChange={set("campaign_id")}>
          <option value="">None</option>
          {v.campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority" htmlFor={`${id}-p`}>
          <Select id={`${id}-p`} value={form.priority} onChange={set("priority")}>
            {["P0", "P1", "P2"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor={`${id}-s`}>
          <Select id={`${id}-s`} value={form.status} onChange={set("status")}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Description" htmlFor={`${id}-d`} className="sm:col-span-2">
        <Textarea id={`${id}-d`} value={form.description} onChange={set("description")} maxLength={2000} />
      </Field>
      {error && <p role="alert" className="font-mono text-[11px] sm:col-span-2">✕ {error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : task ? "Save" : "Create task"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => onDone("")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
