"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCampaignAction, deleteCampaignAction, updateCampaignAction } from "@/app/actions";
import { Button, Field, Input, Select, Textarea, issuesToErrors, DateField } from "@/components/ui/form";
import { withAsOf } from "@/components/shell/nav";

export type CampaignFormInit = {
  campaign_id?: string;
  campaign_name?: string;
  channel?: string;
  target_audience?: string;
  objective?: string;
  owner_name?: string;
  status?: string;
  planned_start?: string;
  planned_end?: string;
  budget_planned_inr?: number | null;
  hypothesis?: string;
  thresholds?: { metric?: string; scale_if?: number; stop_if?: number; min_sample?: number; window_days?: number } | null;
  rice?: { reach: number; impact: number; confidence: number; effort: number } | null;
  origin?: string;
};

const opt = (v: string) => (v.trim() === "" ? undefined : Number(v));

export function CampaignForm({ init, owners, asOf }: { init: CampaignFormInit; owners: string[]; asOf: string }) {
  const router = useRouter();
  const editing = Boolean(init.campaign_id);
  const [f, setF] = useState({
    campaign_name: init.campaign_name ?? "",
    channel: init.channel ?? "",
    target_audience: init.target_audience ?? "",
    objective: init.objective ?? "",
    owner_name: init.owner_name ?? owners[0] ?? "",
    status: init.status ?? "planned",
    planned_start: init.planned_start ?? asOf,
    planned_end: init.planned_end ?? asOf,
    budget_planned_inr: init.budget_planned_inr?.toString() ?? "",
    hypothesis: init.hypothesis ?? "",
    t_metric: init.thresholds?.metric ?? "cost_per_registration",
    t_scale: init.thresholds?.scale_if?.toString() ?? "",
    t_stop: init.thresholds?.stop_if?.toString() ?? "",
    t_min: init.thresholds?.min_sample?.toString() ?? "",
    t_window: init.thresholds?.window_days?.toString() ?? "",
    r_reach: init.rice?.reach?.toString() ?? "",
    r_impact: init.rice?.impact?.toString() ?? "",
    r_conf: init.rice?.confidence?.toString() ?? "",
    r_effort: init.rice?.effort?.toString() ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const thresholdsSet = [f.t_scale, f.t_stop, f.t_min, f.t_window].some((x) => x.trim());
  const riceSet = [f.r_reach, f.r_impact, f.r_conf, f.r_effort].every((x) => x.trim());
  const rice = riceSet ? { reach: Number(f.r_reach), impact: Number(f.r_impact), confidence: Number(f.r_conf), effort: Number(f.r_effort) } : null;
  const riceScore = rice ? (rice.reach * rice.impact * rice.confidence) / rice.effort : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      campaign_name: f.campaign_name,
      channel: f.channel,
      target_audience: f.target_audience,
      objective: f.objective,
      owner_name: f.owner_name,
      status: f.status,
      planned_start: f.planned_start,
      planned_end: f.planned_end,
      budget_planned_inr: f.budget_planned_inr.trim() ? Number(f.budget_planned_inr) : null,
      hypothesis: f.hypothesis,
      thresholds: thresholdsSet
        ? { metric: f.t_metric, scale_if: opt(f.t_scale), stop_if: opt(f.t_stop), min_sample: opt(f.t_min), window_days: opt(f.t_window) }
        : null,
      rice,
    };
    start(async () => {
      const r = editing ? await updateCampaignAction(init.campaign_id!, payload) : await createCampaignAction(payload);
      if (!r.ok) {
        setErrors(issuesToErrors(r.issues));
        setError(r.error);
        return;
      }
      const id = editing ? init.campaign_id! : (r.data as { campaign_id: string }).campaign_id;
      router.push(withAsOf(`/campaigns/${id}`, asOf));
    });
  };

  const remove = () => {
    if (!confirm(`Delete campaign ${init.campaign_id} and its logged metrics? This cannot be undone (except by resetting the dataset).`)) return;
    start(async () => {
      const r = await deleteCampaignAction(init.campaign_id!);
      if (r.ok) router.push(withAsOf("/campaigns", asOf));
      else setError(r.error);
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-3" aria-label={editing ? "Edit campaign" : "New campaign"}>
      <fieldset className="grid gap-3 rounded-md border border-line bg-surface p-4 lg:col-span-2 sm:grid-cols-2">
        <legend className="px-1 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-3">Campaign</legend>
        <Field label="Name" htmlFor="c-name" error={errors.campaign_name}>
          <Input id="c-name" value={f.campaign_name} onChange={set("campaign_name")} required />
        </Field>
        <Field label="Channel" htmlFor="c-channel" error={errors.channel} hint="e.g. paid_social, ambassadors, whatsapp">
          <Input id="c-channel" value={f.channel} onChange={set("channel")} required />
        </Field>
        <Field label="Owner" htmlFor="c-owner" error={errors.owner_name}>
          <Input id="c-owner" list="c-owners" value={f.owner_name} onChange={set("owner_name")} required />
          <datalist id="c-owners">
            {owners.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </Field>
        <Field label="Status" htmlFor="c-status">
          <Select id="c-status" value={f.status} onChange={set("status")}>
            {["planned", "active", "paused", "stopped", "completed"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Planned start" htmlFor="c-start" error={errors.planned_start}>
          <DateField id="c-start" value={f.planned_start} onChange={(v) => set("planned_start")({ target: { value: v } })} required />
        </Field>
        <Field label="Planned end" htmlFor="c-end" error={errors.planned_end}>
          <DateField id="c-end" value={f.planned_end} onChange={(v) => set("planned_end")({ target: { value: v } })} required />
        </Field>
        <Field label="Planned budget (₹)" htmlFor="c-budget" error={errors.budget_planned_inr} hint="Optional. The source has no per-campaign budgets">
          <Input id="c-budget" inputMode="numeric" value={f.budget_planned_inr} onChange={set("budget_planned_inr")} />
        </Field>
        <Field label="Target audience" htmlFor="c-aud">
          <Input id="c-aud" value={f.target_audience} onChange={set("target_audience")} />
        </Field>
        <Field label="Objective" htmlFor="c-obj" className="sm:col-span-2">
          <Input id="c-obj" value={f.objective} onChange={set("objective")} />
        </Field>
        <Field label="Hypothesis (why it should work)" htmlFor="c-hyp" className="sm:col-span-2">
          <Textarea id="c-hyp" value={f.hypothesis} onChange={set("hypothesis")} />
        </Field>
      </fieldset>

      <div className="flex flex-col gap-4">
        <fieldset className="grid gap-3 rounded-md border border-line bg-surface p-4">
          <legend className="px-1 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-3">Decision thresholds</legend>
          <p className="font-mono text-[10px] text-fg-3">Leave blank to judge against the portfolio (scale ≤ 0.8×, stop ≥ 1.5× portfolio CPR).</p>
          <Field label="Metric" htmlFor="t-metric">
            <Select id="t-metric" value={f.t_metric} onChange={set("t_metric")}>
              <option value="cost_per_registration">Cost per registration (₹, lower better)</option>
              <option value="ctr">CTR (higher better)</option>
              <option value="session_to_start">Session → start (higher better)</option>
              <option value="confirm_rate">Confirm rate (higher better)</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Scale if" htmlFor="t-scale" error={errors["thresholds"]}>
              <Input id="t-scale" inputMode="decimal" value={f.t_scale} onChange={set("t_scale")} placeholder={f.t_metric === "cost_per_registration" ? "₹" : "0.05"} />
            </Field>
            <Field label="Stop if" htmlFor="t-stop">
              <Input id="t-stop" inputMode="decimal" value={f.t_stop} onChange={set("t_stop")} />
            </Field>
            <Field label="Min sample" htmlFor="t-min">
              <Input id="t-min" inputMode="numeric" value={f.t_min} onChange={set("t_min")} placeholder="15" />
            </Field>
            <Field label="Window (days)" htmlFor="t-win">
              <Input id="t-win" inputMode="numeric" value={f.t_window} onChange={set("t_window")} placeholder="14" />
            </Field>
          </div>
        </fieldset>
        <fieldset className="grid grid-cols-2 gap-3 rounded-md border border-line bg-surface p-4">
          <legend className="px-1 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-3">RICE priority</legend>
          <Field label="Reach (people)" htmlFor="r-reach">
            <Input id="r-reach" inputMode="numeric" value={f.r_reach} onChange={set("r_reach")} />
          </Field>
          <Field label="Impact 0.25–3" htmlFor="r-impact">
            <Input id="r-impact" inputMode="decimal" value={f.r_impact} onChange={set("r_impact")} />
          </Field>
          <Field label="Confidence 0–1" htmlFor="r-conf">
            <Input id="r-conf" inputMode="decimal" value={f.r_conf} onChange={set("r_conf")} />
          </Field>
          <Field label="Effort (person-wk)" htmlFor="r-effort">
            <Input id="r-effort" inputMode="decimal" value={f.r_effort} onChange={set("r_effort")} />
          </Field>
          <p className="col-span-2 font-mono text-[11px] text-fg-2">RICE = R × I × C ÷ E = {riceScore === null ? "—" : riceScore.toFixed(1)}</p>
        </fieldset>
        {error && (
          <p role="alert" className="border border-fg px-2 py-1 font-mono text-[11px]">
            ✕ {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : editing ? "Save campaign" : "Create campaign"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          {editing && init.origin !== "dataset" && (
            <Button type="button" variant="danger" onClick={remove} className="ml-auto">
              Delete
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
