"use client";

import { useState, useTransition } from "react";
import { addTargetVersionAction, resetDatasetAction, updateSettingsAction } from "@/app/actions";
import { Button, Field, FormMessage, Input, issuesToErrors, DateField } from "@/components/ui/form";

export function ConstraintsForms({ capacity, asOf, latest }: { capacity: number; asOf: string; latest: { identified: number; registrations: number; visitors: number; budget: number } }) {
  const [cap, setCap] = useState(String(capacity));
  const [t, setT] = useState({
    effective_day: asOf,
    target_version: "",
    identified_external_people_goal: String(latest.identified),
    registration_goal: String(latest.registrations),
    unique_external_visitors_goal: String(latest.visitors),
    marketing_budget_inr: String(latest.budget),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const set = (k: keyof typeof t) => (e: { target: { value: string } }) => setT((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4 lg:col-span-2">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-2">New target version</h3>
        <p className="text-sm text-fg-2">Targets are versioned. The engine uses the latest version effective at or before the as-of date, so earlier snapshots keep their original targets.</p>
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await addTargetVersionAction(t);
              setErrors(r.ok ? {} : issuesToErrors(r.issues));
              setMsg(r.ok ? { ok: `Target "${t.target_version}" added from ${t.effective_day}` } : { error: r.error });
            });
          }}
        >
          <Field label="Version label" htmlFor="tv-label" error={errors.target_version}>
            <Input id="tv-label" value={t.target_version} onChange={set("target_version")} placeholder="Stretch push" required />
          </Field>
          <Field label="Effective from" htmlFor="tv-day" error={errors.effective_day}>
            <DateField id="tv-day" value={t.effective_day} onChange={(v) => set("effective_day")({ target: { value: v } })} required />
          </Field>
          <Field label="Budget ₹" htmlFor="tv-budget" error={errors.marketing_budget_inr}>
            <Input id="tv-budget" inputMode="numeric" value={t.marketing_budget_inr} onChange={set("marketing_budget_inr")} />
          </Field>
          <Field label="Identified goal" htmlFor="tv-idn" error={errors.identified_external_people_goal}>
            <Input id="tv-idn" inputMode="numeric" value={t.identified_external_people_goal} onChange={set("identified_external_people_goal")} />
          </Field>
          <Field label="Registration goal" htmlFor="tv-reg" error={errors.registration_goal}>
            <Input id="tv-reg" inputMode="numeric" value={t.registration_goal} onChange={set("registration_goal")} />
          </Field>
          <Field label="Visitor goal" htmlFor="tv-vis" error={errors.unique_external_visitors_goal}>
            <Input id="tv-vis" inputMode="numeric" value={t.unique_external_visitors_goal} onChange={set("unique_external_visitors_goal")} />
          </Field>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={pending}>
              Add target version
            </Button>
          </div>
        </form>
      </div>
      <div className="flex flex-col gap-3">
        <form
          className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await updateSettingsAction({ venue_capacity: Number(cap) });
              setMsg(r.ok ? { ok: `Venue capacity set to ${cap}` } : { error: r.error });
            });
          }}
        >
          <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-2">Venue capacity</h3>
          <p className="text-sm text-fg-2">Not in the source data (assumption). Caps every visitor projection.</p>
          <Field label="Unique visitors" htmlFor="cap">
            <Input id="cap" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} />
          </Field>
          <Button type="submit" disabled={pending}>
            Save capacity
          </Button>
        </form>
        <div className="flex flex-col gap-3 rounded-md border border-fg bg-surface p-4">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.18em]">Reset to original dataset</h3>
          <p className="text-sm text-fg-2">Restores every campaign, metric, registration, target, setting and task to the untouched import. The activity log is kept.</p>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              confirm("Reset all data to the original dataset? Changes made in the app will be discarded.") &&
              start(async () => {
                const r = await resetDatasetAction();
                setMsg(r.ok ? { ok: "Dataset restored to baseline" } : { error: r.error });
              })
            }
          >
            Reset dataset
          </Button>
        </div>
      </div>
      <div className="lg:col-span-3">
        <FormMessage ok={msg.ok} error={msg.error} />
      </div>
    </div>
  );
}
