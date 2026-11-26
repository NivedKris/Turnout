"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBetAction, createDecisionAction, deleteBetAction, updateBetAction } from "@/app/actions";
import { withAsOf } from "@/components/shell/nav";
import { Button, Field, FormMessage, Input, Select, Textarea, issuesToErrors } from "@/components/ui/form";

type SignalDraft = { key: string; label: string; metric: string; window_days: number; direction: "lower_is_better" | "higher_is_better"; scale_if: number; stop_if: number; min_sample: number };
export type BetDraft = {
  bet_id?: string;
  rank: number;
  title: string;
  hypothesis: string;
  rationale: string;
  campaign_ids: string[];
  owner_name: string;
  budget_inr: number;
  start_day: string;
  end_day: string;
  expected_visitors: number;
  rice: { reach: number; impact: number; confidence: number; effort: number };
  status: string;
  signals: SignalDraft[];
  risks: string;
};

const METRICS: { value: string; label: string; direction: SignalDraft["direction"]; scale: number; stop: number; window: number; pct: boolean }[] = [
  { value: "cost_per_registration", label: "Cost per registration (₹)", direction: "lower_is_better", scale: 50, stop: 120, window: 14, pct: false },
  { value: "registrations_per_day", label: "Registrations per day", direction: "higher_is_better", scale: 8, stop: 3, window: 7, pct: false },
  { value: "ctr", label: "Click-through rate", direction: "higher_is_better", scale: 0.03, stop: 0.01, window: 14, pct: true },
  { value: "session_to_start", label: "Visit → form start", direction: "higher_is_better", scale: 0.2, stop: 0.1, window: 14, pct: true },
  { value: "confirm_rate", label: "Confirm rate", direction: "higher_is_better", scale: 0.88, stop: 0.78, window: 42, pct: true },
  { value: "cancel_rate", label: "Cancellation rate", direction: "lower_is_better", scale: 0.06, stop: 0.15, window: 42, pct: true },
  { value: "show_up_rate", label: "Show-up rate", direction: "higher_is_better", scale: 0.8, stop: 0.65, window: 42, pct: true },
];

export function BetForm({ init, campaigns, owners, asOf }: { init: BetDraft; campaigns: { id: string; name: string }[]; owners: string[]; asOf: string }) {
  const router = useRouter();
  const editing = Boolean(init.bet_id);
  const [b, setB] = useState<BetDraft>(init);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof BetDraft>(k: K, v: BetDraft[K]) => setB((x) => ({ ...x, [k]: v }));
  const rice = (b.rice.reach * b.rice.impact * b.rice.confidence) / (b.rice.effort || 1);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...b };
    delete payload.bet_id;
    start(async () => {
      const r = editing ? await updateBetAction(init.bet_id!, payload) : await createBetAction(payload);
      if (!r.ok) {
        setErrors(issuesToErrors(r.issues));
        setError(r.error);
        return;
      }
      const id = editing ? init.bet_id! : (r.data as { bet_id: string }).bet_id;
      router.push(withAsOf(`/bets/${id}`, asOf));
    });
  };

  return (
    <form onSubmit={save} className="grid gap-4 lg:grid-cols-3" aria-label={editing ? "Edit bet" : "New bet"}>
      <div className="grid gap-3 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-2 lg:col-span-2">
        <Field label="Title" htmlFor="b-title" error={errors.title} className="sm:col-span-2">
          <Input id="b-title" value={b.title} onChange={(e) => set("title", e.target.value)} required />
        </Field>
        <Field label="Hypothesis" htmlFor="b-hyp" error={errors.hypothesis} className="sm:col-span-2">
          <Textarea id="b-hyp" value={b.hypothesis} onChange={(e) => set("hypothesis", e.target.value)} />
        </Field>
        <Field label="Why it could work" htmlFor="b-rat" className="sm:col-span-2">
          <Textarea id="b-rat" value={b.rationale} onChange={(e) => set("rationale", e.target.value)} />
        </Field>
        <Field label="Owner" htmlFor="b-owner" error={errors.owner_name}>
          <Input id="b-owner" list="b-owners" value={b.owner_name} onChange={(e) => set("owner_name", e.target.value)} required />
          <datalist id="b-owners">
            {owners.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </Field>
        <Field label="Status" htmlFor="b-status">
          <Select id="b-status" value={b.status} onChange={(e) => set("status", e.target.value)}>
            {["proposed", "testing", "scaling", "paused", "killed", "done"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Start" htmlFor="b-start" error={errors.start_day}>
          <Input id="b-start" type="date" value={b.start_day} onChange={(e) => set("start_day", e.target.value)} />
        </Field>
        <Field label="End" htmlFor="b-end" error={errors.end_day}>
          <Input id="b-end" type="date" value={b.end_day} onChange={(e) => set("end_day", e.target.value)} />
        </Field>
        <Field label="Budget (₹)" htmlFor="b-budget" error={errors.budget_inr}>
          <Input id="b-budget" inputMode="numeric" value={b.budget_inr} onChange={(e) => set("budget_inr", Number(e.target.value) || 0)} />
        </Field>
        <Field label="Expected extra visitors" htmlFor="b-exp" error={errors.expected_visitors}>
          <Input id="b-exp" inputMode="numeric" value={b.expected_visitors} onChange={(e) => set("expected_visitors", Number(e.target.value) || 0)} />
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-fg-3">Runs on campaigns</legend>
          <div className="flex flex-wrap gap-1.5">
            {campaigns.map((c) => {
              const on = b.campaign_ids.includes(c.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  aria-pressed={on}
                  onClick={() => set("campaign_ids", on ? b.campaign_ids.filter((x) => x !== c.id) : [...b.campaign_ids, c.id])}
                  className={`rounded-full border px-3 py-1 text-[12px] ${on ? "border-fg bg-fg text-bg" : "border-line text-fg-2"}`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </fieldset>
        <Field label="Risks" htmlFor="b-risk" className="sm:col-span-2">
          <Input id="b-risk" value={b.risks} onChange={(e) => set("risks", e.target.value)} />
        </Field>
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-surface p-5">
          <p className="col-span-2 text-[14px] font-semibold">Priority (RICE)</p>
          {(["reach", "impact", "confidence", "effort"] as const).map((k) => (
            <Field key={k} label={k === "impact" ? "Impact 0.25–3" : k === "confidence" ? "Confidence 0–1" : k === "effort" ? "Effort (person-weeks)" : "Reach (people)"} htmlFor={`r-${k}`}>
              <Input id={`r-${k}`} inputMode="decimal" value={b.rice[k]} onChange={(e) => set("rice", { ...b.rice, [k]: Number(e.target.value) || 0 })} />
            </Field>
          ))}
          <p className="col-span-2 text-[13px] text-fg-2">
            Score <span className="font-mono font-semibold text-fg">{Math.round(rice).toLocaleString("en-IN")}</span>
          </p>
          <Field label="Rank" htmlFor="b-rank" className="col-span-2">
            <Input id="b-rank" inputMode="numeric" value={b.rank} onChange={(e) => set("rank", Number(e.target.value) || 1)} />
          </Field>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
          <p className="text-[14px] font-semibold">Early signals</p>
          {b.signals.map((sg, i) => {
            const m = METRICS.find((x) => x.value === sg.metric)!;
            const upd = (p: Partial<SignalDraft>) => set("signals", b.signals.map((x, j) => (j === i ? { ...x, ...p } : x)));
            return (
              <div key={i} className="grid grid-cols-2 gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
                <Select
                  aria-label="Metric"
                  className="col-span-2"
                  value={sg.metric}
                  onChange={(e) => {
                    const n = METRICS.find((x) => x.value === e.target.value)!;
                    upd({ metric: n.value, label: n.label.replace(" (₹)", ""), direction: n.direction, scale_if: n.scale, stop_if: n.stop, window_days: n.window, key: n.value.slice(0, 12) });
                  }}
                >
                  {METRICS.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </Select>
                <Input aria-label="Scale line" inputMode="decimal" value={sg.scale_if} onChange={(e) => upd({ scale_if: Number(e.target.value) })} title={m.pct ? "as a fraction, e.g. 0.88" : ""} />
                <Input aria-label="Stop line" inputMode="decimal" value={sg.stop_if} onChange={(e) => upd({ stop_if: Number(e.target.value) })} />
                <p className="col-span-2 text-[11px] text-fg-3">
                  Scale {m.direction === "lower_is_better" ? "≤" : "≥"} first value, stop {m.direction === "lower_is_better" ? "≥" : "≤"} second{m.pct ? " (fractions)" : ""}.
                  <button type="button" className="ml-2 underline" onClick={() => set("signals", b.signals.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </p>
              </div>
            );
          })}
          {b.signals.length < 6 && (
            <Button type="button" variant="ghost" onClick={() => set("signals", [...b.signals, { key: `s${b.signals.length + 1}`, label: "Cost per registration", metric: "cost_per_registration", window_days: 14, direction: "lower_is_better", scale_if: 50, stop_if: 120, min_sample: 15 }])}>
              + Signal
            </Button>
          )}
        </div>
        {error && <FormMessage error={error} />}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : editing ? "Save bet" : "Create bet"}
          </Button>
          {editing && (
            <Button
              type="button"
              variant="danger"
              onClick={() =>
                confirm("Delete this bet?") &&
                start(async () => {
                  const r = await deleteBetAction(init.bet_id!);
                  if (r.ok) router.push(withAsOf("/bets", asOf));
                  else setError(r.error);
                })
              }
            >
              Delete
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

export function DecisionForm({
  asOf,
  bets,
  campaigns,
  preset,
}: {
  asOf: string;
  bets: { id: string; title: string }[];
  campaigns: { id: string; name: string }[];
  preset?: { bet_id?: string | null; campaign_id?: string | null; decision?: string; title?: string; rationale?: string; outcome_metric?: string };
}) {
  const [d, setD] = useState({
    bet_id: preset?.bet_id ?? "",
    campaign_id: preset?.campaign_id ?? "",
    decision: preset?.decision ?? "scale",
    title: preset?.title ?? "",
    rationale: preset?.rationale ?? "",
    outcome_metric: preset?.outcome_metric ?? "cost_per_registration",
    as_of: asOf,
  });
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const set = (k: keyof typeof d) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createDecisionAction({ ...d, bet_id: d.bet_id || null, campaign_id: d.campaign_id || null });
          setMsg(r.ok ? { ok: `Logged ${(r.data as { decision_id: string }).decision_id}. Evidence frozen as of ${d.as_of}.` } : { error: r.error });
          if (r.ok) setD((x) => ({ ...x, title: "", rationale: "" }));
        });
      }}
    >
      <Field label="Decision" htmlFor="d-kind">
        <Select id="d-kind" value={d.decision} onChange={set("decision")}>
          {["scale", "keep", "change", "stop", "pause", "launch"].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </Select>
      </Field>
      <Field label="Data date" htmlFor="d-asof">
        <Input id="d-asof" type="date" value={d.as_of} onChange={set("as_of")} />
      </Field>
      <Field label="Bet" htmlFor="d-bet">
        <Select id="d-bet" value={d.bet_id} onChange={set("bet_id")}>
          <option value="">None</option>
          {bets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Campaign" htmlFor="d-camp">
        <Select id="d-camp" value={d.campaign_id} onChange={set("campaign_id")}>
          <option value="">From bet / none</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Title" htmlFor="d-title" className="sm:col-span-2">
        <Input id="d-title" value={d.title} onChange={set("title")} required minLength={3} />
      </Field>
      <Field label="Why (evidence)" htmlFor="d-why" className="sm:col-span-2">
        <Textarea id="d-why" value={d.rationale} onChange={set("rationale")} />
      </Field>
      <Field label="Judge the outcome by" htmlFor="d-metric">
        <Select id="d-metric" value={d.outcome_metric} onChange={set("outcome_metric")}>
          <option value="cost_per_registration">Cost per registration</option>
          <option value="registrations_per_day">Registrations per day</option>
          <option value="ctr">Click-through rate</option>
          <option value="session_to_start">Visit → form start</option>
        </Select>
      </Field>
      <div className="flex items-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Logging…" : "Log decision"}
        </Button>
      </div>
      <div className="sm:col-span-2">
        <FormMessage ok={msg.ok} error={msg.error} />
      </div>
    </form>
  );
}
