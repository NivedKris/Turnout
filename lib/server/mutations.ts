import "server-only";
import type { Db, Document } from "mongodb";
import { getDb } from "../db";
import { bumpDataVersion } from "../analytics/load";
import {
  CampaignCreate,
  CampaignPatch,
  DailyMetricsInput,
  DailyPatch,
  SettingsPatch,
  TargetCreate,
  TaskCreate,
  TaskPatch,
  type Actor,
} from "../models/inputs";
import { endOfDayIst, startOfDayIst } from "../time";

/**
 * The only write path. Every mutation: validate (Zod) → write → append to the
 * activity log → bump the data version (so analytics are fresh on the next read).
 * Used by Server Actions, REST routes and confirmed copilot proposals.
 */

export class MutationError extends Error {
  constructor(
    message: string,
    public status = 400,
    public issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

function parse<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } }, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
    throw new MutationError(`Invalid input: ${issues.map((i) => `${i.path || "input"} ${i.message}`).join("; ")}`, 422, issues);
  }
  return r.data;
}

const strip = <T extends Document | null>(d: T) => {
  if (!d) return d;
  const { _id, ...rest } = d as Document;
  void _id;
  return rest;
};

async function log(db: Db, entry: { entity: string; entity_id: string; action: "create" | "update" | "delete"; before: unknown; after: unknown; actor: Actor; summary: string }) {
  await db.collection("activity").insertOne({ ...entry, at: new Date() });
  await bumpDataVersion(db);
}

async function window(db: Db) {
  const ev = await db.collection("event").findOne({}, { projection: { history_start: 1, history_end: 1 } });
  return { start: (ev?.history_start as string) ?? "2025-01-15", end: (ev?.history_end as string) ?? "2025-04-20" };
}

async function ownerFor(db: Db, ownerName: string): Promise<{ owner_id: string; owner_name: string }> {
  const name = ownerName.trim();
  const existing = await db.collection("campaigns").findOne({ owner_name: name }, { projection: { owner_id: 1, owner_name: 1 } });
  if (existing) return { owner_id: existing.owner_id as string, owner_name: name };
  const t = await db.collection("tasks").findOne({ owner_name: name }, { projection: { owner_id: 1 } });
  if (t) return { owner_id: t.owner_id as string, owner_name: name };
  return { owner_id: `U-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`, owner_name: name };
}

async function nextId(db: Db, coll: string, field: string, prefix: string, width: number): Promise<string> {
  const ids = (await db.collection(coll).distinct(field)) as string[];
  const max = ids.reduce((m, id) => {
    const n = id.startsWith(prefix) ? Number(id.slice(prefix.length)) : NaN;
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

/* ───────────────────────────── Campaigns ───────────────────────────── */

export async function createCampaign(input: unknown, actor: Actor = "user") {
  const c = parse(CampaignCreate, input);
  const db = await getDb();
  if (await db.collection("campaigns").findOne({ campaign_name: c.campaign_name })) {
    throw new MutationError(`A campaign named "${c.campaign_name}" already exists`, 409);
  }
  const campaign_id = await nextId(db, "campaigns", "campaign_id", "C", 2);
  const owner = await ownerFor(db, c.owner_name);
  const doc = {
    campaign_id,
    campaign_name: c.campaign_name,
    channel: c.channel,
    target_audience: c.target_audience,
    objective: c.objective,
    ...owner,
    created_at: new Date(),
    planned_start_at: startOfDayIst(c.planned_start),
    planned_end_at: endOfDayIst(c.planned_end),
    status: c.status,
    budget_planned_inr: c.budget_planned_inr ?? null,
    hypothesis: c.hypothesis,
    thresholds: c.thresholds ?? null,
    rice: c.rice ?? null,
    origin: actor === "copilot" ? "copilot" : "user",
    row_no: null,
  };
  await db.collection("campaigns").insertOne(doc);
  await log(db, { entity: "campaign", entity_id: campaign_id, action: "create", before: null, after: doc, actor, summary: `Created campaign ${campaign_id} ${c.campaign_name}` });
  return { campaign_id };
}

export async function updateCampaign(campaignId: string, input: unknown, actor: Actor = "user") {
  const p = parse(CampaignPatch, input);
  const db = await getDb();
  const before = await db.collection("campaigns").findOne({ campaign_id: campaignId });
  if (!before) throw new MutationError(`Campaign ${campaignId} not found`, 404);
  const set: Document = {};
  for (const k of ["campaign_name", "channel", "target_audience", "objective", "status", "budget_planned_inr", "hypothesis", "thresholds", "rice"] as const) {
    if (p[k] !== undefined) set[k] = p[k];
  }
  if (p.owner_name) Object.assign(set, await ownerFor(db, p.owner_name));
  if (p.planned_start) set.planned_start_at = startOfDayIst(p.planned_start);
  if (p.planned_end) set.planned_end_at = endOfDayIst(p.planned_end);
  if (!Object.keys(set).length) throw new MutationError("Nothing to update");
  await db.collection("campaigns").updateMany({ campaign_id: campaignId }, { $set: set });
  const changed = Object.keys(set).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(set[k]));
  await log(db, {
    entity: "campaign",
    entity_id: campaignId,
    action: "update",
    before: Object.fromEntries(changed.map((k) => [k, before[k] ?? null])),
    after: Object.fromEntries(changed.map((k) => [k, set[k]])),
    actor,
    summary: `Updated ${campaignId} ${before.campaign_name}: ${changed.join(", ") || "no change"}`,
  });
  return { campaign_id: campaignId, changed };
}

export async function deleteCampaign(campaignId: string, actor: Actor = "user") {
  const db = await getDb();
  const before = await db.collection("campaigns").findOne({ campaign_id: campaignId });
  if (!before) throw new MutationError(`Campaign ${campaignId} not found`, 404);
  if (before.origin === "dataset") {
    throw new MutationError("Campaigns from the original dataset can be paused or stopped, not deleted. Reset restores everything.", 409);
  }
  const daily = await db.collection("campaign_daily").deleteMany({ campaign_id: campaignId });
  await db.collection("campaigns").deleteOne({ campaign_id: campaignId });
  await db.collection("tasks").updateMany({ campaign_id: campaignId }, { $set: { campaign_id: null, updated_at: new Date() } });
  await log(db, { entity: "campaign", entity_id: campaignId, action: "delete", before: strip(before), after: null, actor, summary: `Deleted campaign ${campaignId} ${before.campaign_name} and ${daily.deletedCount} daily rows` });
  return { campaign_id: campaignId };
}

/* ─────────────────────────── Daily metrics ─────────────────────────── */

export async function logDailyMetrics(input: unknown, actor: Actor = "user") {
  const m = parse(DailyMetricsInput, input);
  const db = await getDb();
  const camp = await db.collection("campaigns").findOne({ campaign_id: m.campaign_id });
  if (!camp) throw new MutationError(`Campaign ${m.campaign_id} not found`, 404);
  const w = await window(db);
  if (m.activity_date < w.start || m.activity_date > w.end) {
    throw new MutationError(`Date ${m.activity_date} is outside the campaign window ${w.start} … ${w.end}`, 422);
  }
  if (m.clicks > m.impressions && m.impressions > 0) throw new MutationError("Clicks cannot exceed impressions", 422);
  const activity_id = `U-${m.campaign_id}-${m.activity_date.replaceAll("-", "")}-${Date.now().toString(36)}`;
  const doc = {
    ...m,
    activity_id,
    campaign_name: camp.campaign_name,
    owner_id: camp.owner_id,
    owner_name: camp.owner_name,
    origin: actor === "copilot" ? "copilot" : "user",
    row_no: null,
  };
  await db.collection("campaign_daily").insertOne(doc);
  await log(db, { entity: "campaign_daily", entity_id: activity_id, action: "create", before: null, after: doc, actor, summary: `Logged ${m.activity_date} metrics for ${m.campaign_id}: spend ₹${m.marketing_spend_inr}, ${m.clicks} clicks` });
  return { activity_id };
}

/** Edits a daily row (dataset rows included; reset restores originals). All import copies of the ID change together. */
export async function updateDailyRow(activityId: string, input: unknown, actor: Actor = "user") {
  const p = parse(DailyPatch, input);
  const db = await getDb();
  const before = await db.collection("campaign_daily").findOne({ activity_id: activityId });
  if (!before) throw new MutationError(`Daily row ${activityId} not found`, 404);
  const set: Document = { ...p };
  if (before.origin === "dataset") set.edited = true;
  await db.collection("campaign_daily").updateMany({ activity_id: activityId }, { $set: set });
  const changed = Object.keys(p).filter((k) => before[k] !== (p as Document)[k]);
  await log(db, {
    entity: "campaign_daily",
    entity_id: activityId,
    action: "update",
    before: Object.fromEntries(changed.map((k) => [k, before[k]])),
    after: Object.fromEntries(changed.map((k) => [k, (p as Document)[k]])),
    actor,
    summary: `Edited ${before.campaign_id} ${before.activity_date}: ${changed.join(", ")}`,
  });
  return { activity_id: activityId, changed };
}

export async function deleteDailyRow(activityId: string, actor: Actor = "user") {
  const db = await getDb();
  const before = await db.collection("campaign_daily").findOne({ activity_id: activityId });
  if (!before) throw new MutationError(`Daily row ${activityId} not found`, 404);
  const r = await db.collection("campaign_daily").deleteMany({ activity_id: activityId });
  await log(db, { entity: "campaign_daily", entity_id: activityId, action: "delete", before: strip(before), after: null, actor, summary: `Deleted ${before.campaign_id} ${before.activity_date} metrics (${r.deletedCount} row${r.deletedCount === 1 ? "" : "s"})` });
  return { activity_id: activityId };
}

/** CSV import: header row with DailyMetricsInput columns. Validates every row before writing any. */
export async function importDailyCsv(campaignId: string, csv: string, actor: Actor = "user") {
  const lines = csv.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) throw new MutationError("CSV needs a header row and at least one data row");
  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  if (!header.includes("activity_date")) throw new MutationError("CSV must include an activity_date column");
  const rows = lines.slice(1).map((line, i) => {
    const cells = line.split(",").map((c) => c.trim());
    const obj: Record<string, string> = { campaign_id: campaignId };
    header.forEach((h, j) => (obj[h] = cells[j] ?? ""));
    const r = DailyMetricsInput.safeParse(obj);
    if (!r.success) throw new MutationError(`CSV row ${i + 2}: ${r.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`, 422);
    return r.data;
  });
  const ids: string[] = [];
  for (const r of rows) ids.push((await logDailyMetrics(r, actor)).activity_id);
  return { imported: ids.length, activity_ids: ids };
}

/* ─────────────────────────────── Tasks ─────────────────────────────── */

export async function createTask(input: unknown, actor: Actor = "user") {
  const t = parse(TaskCreate, input);
  const db = await getDb();
  if (t.campaign_id && !(await db.collection("campaigns").findOne({ campaign_id: t.campaign_id }))) {
    throw new MutationError(`Campaign ${t.campaign_id} not found`, 404);
  }
  const task_id = await nextId(db, "tasks", "task_id", "TK-", 4);
  const owner = await ownerFor(db, t.owner_name);
  const now = new Date();
  const doc = {
    task_id,
    title: t.title,
    description: t.description,
    campaign_id: t.campaign_id ?? null,
    ...owner,
    due_date: t.due_date,
    status: t.status,
    priority: t.priority,
    created_by: actor,
    source_insight: t.source_insight ?? null,
    origin: actor === "copilot" ? "copilot" : "user",
    created_at: now,
    updated_at: now,
  };
  await db.collection("tasks").insertOne(doc);
  await log(db, { entity: "task", entity_id: task_id, action: "create", before: null, after: doc, actor, summary: `${actor === "copilot" ? "Copilot-proposed task confirmed" : "Created task"} ${task_id}: ${t.title}` });
  return { task_id };
}

export async function updateTask(taskId: string, input: unknown, actor: Actor = "user") {
  const p = parse(TaskPatch, input);
  const db = await getDb();
  const before = await db.collection("tasks").findOne({ task_id: taskId });
  if (!before) throw new MutationError(`Task ${taskId} not found`, 404);
  const set: Document = { ...p, updated_at: new Date() };
  delete set.owner_name;
  if (p.owner_name) Object.assign(set, await ownerFor(db, p.owner_name));
  await db.collection("tasks").updateOne({ task_id: taskId }, { $set: set });
  const changed = Object.keys(set).filter((k) => k !== "updated_at" && JSON.stringify(before[k]) !== JSON.stringify(set[k]));
  await log(db, {
    entity: "task",
    entity_id: taskId,
    action: "update",
    before: Object.fromEntries(changed.map((k) => [k, before[k] ?? null])),
    after: Object.fromEntries(changed.map((k) => [k, set[k]])),
    actor,
    summary: `Updated task ${taskId}: ${changed.map((k) => (k === "status" ? `status → ${set.status}` : k)).join(", ")}`,
  });
  return { task_id: taskId, changed };
}

export async function deleteTask(taskId: string, actor: Actor = "user") {
  const db = await getDb();
  const before = await db.collection("tasks").findOne({ task_id: taskId });
  if (!before) throw new MutationError(`Task ${taskId} not found`, 404);
  await db.collection("tasks").deleteOne({ task_id: taskId });
  await log(db, { entity: "task", entity_id: taskId, action: "delete", before: strip(before), after: null, actor, summary: `Deleted task ${taskId}: ${before.title}` });
  return { task_id: taskId };
}

/* ───────────────────────── Targets & settings ───────────────────────── */

export async function addTargetVersion(input: unknown, actor: Actor = "user") {
  const t = parse(TargetCreate, input);
  const db = await getDb();
  const doc = {
    effective_at: startOfDayIst(t.effective_day),
    identified_external_people_goal: t.identified_external_people_goal,
    registration_goal: t.registration_goal,
    unique_external_visitors_goal: t.unique_external_visitors_goal,
    marketing_budget_inr: t.marketing_budget_inr,
    target_version: t.target_version,
    origin: actor === "copilot" ? "copilot" : "user",
    row_no: null,
  };
  await db.collection("targets").insertOne(doc);
  await log(db, { entity: "target", entity_id: t.target_version, action: "create", before: null, after: doc, actor, summary: `New target version "${t.target_version}" from ${t.effective_day}: ${t.registration_goal} registrations, ${t.unique_external_visitors_goal} visitors, ₹${t.marketing_budget_inr} budget` });
  return { target_version: t.target_version };
}

export async function updateSettings(input: unknown, actor: Actor = "user") {
  const p = parse(SettingsPatch, input);
  const db = await getDb();
  const before = await db.collection("settings").findOne({ _id: "settings" as never });
  await db.collection("settings").updateOne({ _id: "settings" as never }, { $set: p }, { upsert: true });
  await log(db, {
    entity: "settings",
    entity_id: "settings",
    action: "update",
    before: Object.fromEntries(Object.keys(p).map((k) => [k, before?.[k] ?? null])),
    after: p,
    actor,
    summary: `Settings: ${Object.entries(p).map(([k, v]) => `${k} → ${v}`).join(", ")}`,
  });
  return { ok: true };
}
