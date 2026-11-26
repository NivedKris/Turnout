"use server";

import { refresh } from "next/cache";
import { getDb } from "@/lib/db";
import { resetFromBaseline } from "@/lib/seed/load";
import * as m from "@/lib/server/mutations";

/**
 * Server Actions used by forms and confirmation cards. Thin wrappers over
 * lib/server/mutations. They never throw to the client and always return a result.
 * `refresh()` re-renders the current route so analytics update immediately.
 */
export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; issues?: { path: string; message: string }[] };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    refresh();
    return { ok: true, data };
  } catch (err) {
    if (err instanceof m.MutationError) return { ok: false, error: err.message, issues: err.issues };
    console.error(err);
    return { ok: false, error: "Something went wrong saving that change. Please try again." };
  }
}

type Actor = "user" | "copilot";

export async function createCampaignAction(input: unknown, actor: Actor = "user") {
  return run(() => m.createCampaign(input, actor));
}
export async function updateCampaignAction(id: string, input: unknown, actor: Actor = "user") {
  return run(() => m.updateCampaign(id, input, actor));
}
export async function deleteCampaignAction(id: string) {
  return run(() => m.deleteCampaign(id));
}
export async function logDailyMetricsAction(input: unknown) {
  return run(() => m.logDailyMetrics(input));
}
export async function updateDailyRowAction(id: string, input: unknown) {
  return run(() => m.updateDailyRow(id, input));
}
export async function deleteDailyRowAction(id: string) {
  return run(() => m.deleteDailyRow(id));
}
export async function importDailyCsvAction(campaignId: string, csv: string) {
  return run(() => m.importDailyCsv(campaignId, csv));
}
export async function createTaskAction(input: unknown, actor: Actor = "user") {
  return run(() => m.createTask(input, actor));
}
export async function updateTaskAction(id: string, input: unknown) {
  return run(() => m.updateTask(id, input));
}
export async function deleteTaskAction(id: string) {
  return run(() => m.deleteTask(id));
}
export async function addTargetVersionAction(input: unknown) {
  return run(() => m.addTargetVersion(input));
}
export async function updateSettingsAction(input: unknown) {
  return run(() => m.updateSettings(input));
}
/** Restores the original dataset (reviewer convenience, also available as POST /api/admin/reset). */
export async function resetDatasetAction() {
  return run(async () => (await resetFromBaseline(await getDb(), "user")).counts);
}
