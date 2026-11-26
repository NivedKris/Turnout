"use client";

import { useMemo, useState, useTransition } from "react";
import { createTaskAction, deleteTaskAction, updateTaskAction } from "@/app/actions";
import { OriginBadge } from "@/components/matrix/primitives";
import { Button, Field, FormMessage, Input, Select, Textarea, issuesToErrors } from "@/components/ui/form";
import type { TasksView } from "@/lib/server/views";

type Task = TasksView["tasks"][number];
const STATUSES = ["todo", "doing", "blocked", "done"] as const;
const LABEL: Record<(typeof STATUSES)[number], string> = { todo: "To do", doing: "Doing", blocked: "Blocked", done: "Done" };

export function TaskBoard({ v }: { v: TasksView }) {
  const [view, setView] = useState<"table" | "kanban">("kanban");
  const [fStatus, setFStatus] = useState("");
  const [fOwner, setFOwner] = useState("");
  const [fCampaign, setFCampaign] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();

  const tasks = useMemo(
    () =>
      v.tasks.filter(
        (t) =>
          (!fStatus || t.status === fStatus) &&
          (!fOwner || t.owner_name === fOwner) &&
          (!fCampaign || (fCampaign === "none" ? !t.campaign_id : t.campaign_id === fCampaign)) &&
          (!onlyOverdue || t.overdue),
      ),
    [v.tasks, fStatus, fOwner, fCampaign, onlyOverdue],
  );

  const setStatus = (t: Task, status: string) =>
    start(async () => {
      const r = await updateTaskAction(t.task_id, { status });
      setMsg(r.ok ? { ok: `${t.task_id} → ${status}` } : { error: r.error });
    });
  const remove = (t: Task) => {
    if (!confirm(`Delete task ${t.task_id} "${t.title}"?`)) return;
    start(async () => {
      const r = await deleteTaskAction(t.task_id);
      setMsg(r.ok ? { ok: `Deleted ${t.task_id}` } : { error: r.error });
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3 border border-line bg-surface p-3">
        <div className="flex border border-line font-mono text-[11px]" role="group" aria-label="View">
          {(["kanban", "table"] as const).map((x) => (
            <button key={x} onClick={() => setView(x)} aria-pressed={view === x} className={`px-3 py-1.5 uppercase tracking-wider ${view === x ? "bg-fg text-bg" : "text-fg-2"}`}>
              {x}
            </button>
          ))}
        </div>
        <Field label="Status" htmlFor="f-status" className="w-32">
          <Select id="f-status" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Owner" htmlFor="f-owner" className="w-40">
          <Select id="f-owner" value={fOwner} onChange={(e) => setFOwner(e.target.value)}>
            <option value="">All</option>
            {v.owners.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        </Field>
        <Field label="Campaign" htmlFor="f-camp" className="w-48">
          <Select id="f-camp" value={fCampaign} onChange={(e) => setFCampaign(e.target.value)}>
            <option value="">All</option>
            <option value="none">No campaign</option>
            {v.campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 pb-2 font-mono text-[11px] text-fg-2">
          <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} /> Overdue at as-of
        </label>
        <span className="ml-auto flex items-center gap-2">
          {pending && <span className="font-mono text-[11px] text-fg-3">SAVING…</span>}
          <Button onClick={() => setCreating((c) => !c)}>{creating ? "Close" : "+ New task"}</Button>
        </span>
      </div>
      <FormMessage ok={msg.ok} error={msg.error} />
      {creating && <TaskForm v={v} onDone={(ok) => (setMsg({ ok }), setCreating(false))} />}

      {view === "kanban" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STATUSES.map((st) => {
            const col = tasks.filter((t) => t.status === st);
            return (
              <section key={st} className="flex min-h-40 flex-col gap-2 rounded-md border border-line bg-surface p-2" aria-label={`${LABEL[st]} column`}>
                <header className="flex items-center justify-between px-1 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-2">
                  {LABEL[st]} <span className="text-fg-3">{col.length}</span>
                </header>
                {col.map((t) =>
                  editing === t.task_id ? (
                    <TaskForm key={t.task_id} v={v} task={t} onDone={(ok) => (setMsg({ ok }), setEditing(null))} />
                  ) : (
                    <TaskCard key={t.task_id} t={t} onStatus={setStatus} onEdit={() => setEditing(t.task_id)} onDelete={() => remove(t)} />
                  ),
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <table className="w-full min-w-[900px] font-mono text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-fg-3">
                {["ID", "P", "Title", "Campaign", "Owner", "Due", "Status", ""].map((h) => (
                  <th key={h} className="px-3 py-2 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.task_id} className="border-b border-dashed border-line last:border-0">
                  <td className="px-3 py-2 text-fg-3">{t.task_id}</td>
                  <td className="px-3 py-2 font-bold">{t.priority}</td>
                  <td className="px-3 py-2">
                    <span className="mr-2 font-sans text-[13px]">{t.title}</span>
                    {t.origin !== "dataset" && t.origin !== "user" && <OriginBadge origin={t.origin === "copilot" ? "copilot" : "simulated"} />}
                  </td>
                  <td className="px-3 py-2 text-fg-2">{t.campaign_id ? `${t.campaign_id} ${t.campaign_name ?? ""}` : "—"}</td>
                  <td className="px-3 py-2 text-fg-2">{t.owner_name}</td>
                  <td className="px-3 py-2">
                    {t.due_date} {t.overdue && <span className="bg-fg px-1 text-[9px] font-bold text-bg">OVERDUE</span>}
                  </td>
                  <td className="px-3 py-2">
                    <select aria-label={`Status of ${t.task_id}`} value={t.status} onChange={(e) => setStatus(t, e.target.value)} className="border border-line bg-bg px-1 py-0.5">
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => (setView("kanban"), setEditing(t.task_id))} className="mr-2 text-fg-2 hover:text-fg">
                      Edit
                    </button>
                    <button onClick={() => remove(t)} className="text-fg-2 hover:text-fg">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tasks.length === 0 && <p className="p-4 font-mono text-[11px] text-fg-3">No tasks match these filters.</p>}
        </div>
      )}
    </div>
  );
}

function TaskCard({ t, onStatus, onEdit, onDelete }: { t: Task; onStatus: (t: Task, s: string) => void; onEdit: () => void; onDelete: () => void }) {
  const i = STATUSES.indexOf(t.status);
  return (
    <article className="flex flex-col gap-2 border border-line bg-bg p-2.5">
      <div className="flex items-center gap-2 font-mono text-[10px] text-fg-3">
        <span className="font-bold text-fg">{t.priority}</span>
        <span>{t.task_id}</span>
        {t.origin === "copilot" && <OriginBadge origin="copilot" />}
        {t.origin === "simulated" && <OriginBadge origin="simulated" />}
        {t.overdue && <span className="ml-auto bg-fg px-1 text-[9px] font-bold text-bg">OVERDUE</span>}
      </div>
      <p className={`text-[14px] leading-snug ${t.status === "done" ? "text-fg-3 line-through" : ""}`}>{t.title}</p>
      {t.source_insight && <p className="border-l border-fg-3 pl-2 font-mono text-[10px] text-fg-3">from insight: {t.source_insight}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-fg-2">
        <span>{t.owner_name}</span>
        <span>due {t.due_date}</span>
        {t.campaign_id && <span>{t.campaign_id}</span>}
      </div>
      <div className="flex items-center gap-1 font-mono text-[10px]">
        <button disabled={i <= 0} onClick={() => onStatus(t, STATUSES[i - 1]!)} className="border border-line px-1.5 disabled:opacity-30" aria-label="Move left">
          ←
        </button>
        <button disabled={i >= STATUSES.length - 1} onClick={() => onStatus(t, STATUSES[i + 1]!)} className="border border-line px-1.5 disabled:opacity-30" aria-label="Move right">
          →
        </button>
        <button onClick={onEdit} className="ml-auto text-fg-2 hover:text-fg">
          Edit
        </button>
        <button onClick={onDelete} className="text-fg-2 hover:text-fg">
          Delete
        </button>
      </div>
    </article>
  );
}

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
