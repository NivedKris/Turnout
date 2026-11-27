"use client";

import { useState, useTransition } from "react";
import { Button, Field, Input, Select } from "@/components/ui/form";
import { inr, num } from "@/lib/format";

type Change =
  | { kind: "shift_budget"; from: string; to: string; amount: number }
  | { kind: "add_budget"; to: string; amount: number }
  | { kind: "scale_campaign"; campaign_id: string; factor: number }
  | { kind: "stop_campaign"; campaign_id: string }
  | { kind: "set_show_up_rate"; value: number }
  | { kind: "set_walk_in_share"; value: number }
  | { kind: "set_capacity"; value: number };

type Result = {
  value: {
    base: { registrations: number; visitors: number; spend: number; notes: string[] };
    scenario: { registrations: number; visitors: number; spend: number; capped_by_capacity: boolean; notes: string[]; by_campaign: { campaign_id: string; campaign_name: string; projected_registrations: number; future_spend: number }[] };
    delta: { registrations: number; visitors: number; spend: number };
  };
  assumptions: { text: string; label: string }[];
  formula: string;
};

const KINDS: { kind: Change["kind"]; label: string }[] = [
  { kind: "shift_budget", label: "Shift budget A → B" },
  { kind: "add_budget", label: "Add budget to campaign" },
  { kind: "scale_campaign", label: "Scale campaign ×" },
  { kind: "stop_campaign", label: "Stop campaign" },
  { kind: "set_show_up_rate", label: "Set show-up rate" },
  { kind: "set_walk_in_share", label: "Set walk-in share" },
  { kind: "set_capacity", label: "Set venue capacity" },
];

/** What-if planner. Runs the same projection model as the dashboard and copilot via POST /api/scenario. */
export function ScenarioBuilder({ asOf, campaigns, presets }: { asOf: string; campaigns: { id: string; name: string }[]; presets: { label: string; changes: Change[] }[] }) {
  const [changes, setChanges] = useState<Change[]>(presets[0]?.changes ?? []);
  const [mode, setMode] = useState<"base" | "stretch">("base");
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const c0 = campaigns[0]?.id ?? "";

  const run = (cs = changes) =>
    start(async () => {
      setErr(null);
      const r = await fetch("/api/scenario", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ asOf, mode, changes: cs }) });
      const j = await r.json();
      if (j.ok) setRes(j.data);
      else setErr(j.error);
    });

  const blank = (kind: Change["kind"]): Change =>
    kind === "shift_budget"
      ? { kind, from: c0, to: campaigns[1]?.id ?? c0, amount: 5000 }
      : kind === "add_budget"
        ? { kind, to: c0, amount: 5000 }
        : kind === "scale_campaign"
          ? { kind, campaign_id: c0, factor: 1.5 }
          : kind === "stop_campaign"
            ? { kind, campaign_id: c0 }
            : kind === "set_show_up_rate"
              ? { kind, value: 0.6 }
              : kind === "set_walk_in_share"
                ? { kind, value: 0.05 }
                : { kind, value: 2500 };

  const upd = (i: number, patch: Partial<Change>) => setChanges((cs) => cs.map((c, j) => (j === i ? ({ ...c, ...patch } as Change) : c)));
  const campSel = (i: number, key: string, value: string) => (
    <Select aria-label={key} value={value} onChange={(e) => upd(i, { [key]: e.target.value } as Partial<Change>)}>
      {campaigns.map((c) => (
        <option key={c.id} value={c.id}>
          {c.id} {c.name}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="grid gap-3 xl:grid-cols-5">
      <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-3 xl:col-span-2">
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => (setChanges(p.changes), run(p.changes))}
              className="border border-line px-2 py-1 font-mono text-[10px] tracking-wider text-fg-2 hover:border-fg hover:text-fg"
            >
              {p.label}
            </button>
          ))}
        </div>
        {changes.map((c, i) => (
          <div key={i} className="grid gap-2 border border-line p-2">
            <div className="flex items-center gap-2">
              <Select aria-label="Change type" value={c.kind} onChange={(e) => upd(i, blank(e.target.value as Change["kind"]))}>
                {KINDS.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {k.label}
                  </option>
                ))}
              </Select>
              <button onClick={() => setChanges((cs) => cs.filter((_, j) => j !== i))} aria-label="Remove change" className="px-2 text-fg-3 hover:text-fg">
                ✕
              </button>
            </div>
            {c.kind === "shift_budget" && (
              <div className="grid grid-cols-3 gap-2">
                {campSel(i, "from", c.from)}
                {campSel(i, "to", c.to)}
                <Input aria-label="Amount ₹" inputMode="numeric" value={c.amount} onChange={(e) => upd(i, { amount: Number(e.target.value) || 0 })} />
              </div>
            )}
            {c.kind === "add_budget" && (
              <div className="grid grid-cols-2 gap-2">
                {campSel(i, "to", c.to)}
                <Input aria-label="Amount ₹" inputMode="numeric" value={c.amount} onChange={(e) => upd(i, { amount: Number(e.target.value) || 0 })} />
              </div>
            )}
            {c.kind === "scale_campaign" && (
              <div className="grid grid-cols-2 gap-2">
                {campSel(i, "campaign_id", c.campaign_id)}
                <Input aria-label="Factor" inputMode="decimal" value={c.factor} onChange={(e) => upd(i, { factor: Number(e.target.value) || 0 })} />
              </div>
            )}
            {c.kind === "stop_campaign" && campSel(i, "campaign_id", c.campaign_id)}
            {(c.kind === "set_show_up_rate" || c.kind === "set_walk_in_share") && (
              <Field label="Value (0–1)" htmlFor={`v-${i}`}>
                <Input id={`v-${i}`} inputMode="decimal" value={c.value} onChange={(e) => upd(i, { value: Number(e.target.value) || 0 })} />
              </Field>
            )}
            {c.kind === "set_capacity" && <Input aria-label="Capacity" inputMode="numeric" value={c.value} onChange={(e) => upd(i, { value: Number(e.target.value) || 0 })} />}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => setChanges((cs) => [...cs, blank("shift_budget")])}>
            + Change
          </Button>
          <Select aria-label="Mode" value={mode} onChange={(e) => setMode(e.target.value as "base" | "stretch")} className="w-28">
            <option value="base">Base</option>
            <option value="stretch">Stretch</option>
          </Select>
          <Button onClick={() => run()} disabled={pending} className="ml-auto">
            {pending ? "Running…" : "Run scenario"}
          </Button>
        </div>
        {err && <p role="alert" className="font-mono text-[11px]">✕ {err}</p>}
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-3 xl:col-span-3" aria-live="polite">
        {!res ? (
          <p className="font-mono text-[11px] text-fg-3">Pick a preset or build changes, then run. The result uses the same engine as the dashboard.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-px border border-line bg-line">
              {(
                [
                  ["Registrations", res.value.base.registrations, res.value.scenario.registrations, res.value.delta.registrations, "int"],
                  ["Visitors", res.value.base.visitors, res.value.scenario.visitors, res.value.delta.visitors, "int"],
                  ["Spend", res.value.base.spend, res.value.scenario.spend, res.value.delta.spend, "inr"],
                ] as const
              ).map(([k, b, sc, d, f]) => (
                <div key={k} className="flex flex-col gap-1 bg-surface p-3">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-fg-3">{k}</span>
                  <span className="font-dot text-[32px] font-bold leading-none">{f === "inr" ? inr(sc) : num(sc)}</span>
                  <span className="font-mono text-[11px] text-fg-2">
                    base {f === "inr" ? inr(b) : num(b)} · Δ {d >= 0 ? "+" : "−"}
                    {f === "inr" ? inr(Math.abs(d)) : num(Math.abs(d), 1)}
                  </span>
                </div>
              ))}
            </div>
            {[...new Set([...res.value.scenario.notes])].map((n) => (
              <p key={n} className="border-l border-fg pl-2 font-mono text-[11px] text-fg-2">
                {n}
              </p>
            ))}
            <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full font-mono text-[12px] tabular min-w-[560px]">
              <thead>
                <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-fg-3">
                  <th className="py-1.5 font-normal">Campaign</th>
                  <th className="py-1.5 text-right font-normal">Projected regs</th>
                  <th className="py-1.5 text-right font-normal">Future spend</th>
                </tr>
              </thead>
              <tbody>
                {res.value.scenario.by_campaign.map((c) => (
                  <tr key={c.campaign_id} className="border-b border-dashed border-line last:border-0">
                    <td className="py-1.5">
                      <span className="text-fg-3">{c.campaign_id}</span> {c.campaign_name}
                    </td>
                    <td className="py-1.5 text-right">{num(c.projected_registrations)}</td>
                    <td className="py-1.5 text-right">{inr(c.future_spend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
</div>
            <details>
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-fg-3">Assumptions ({res.assumptions.length})</summary>
              <ul className="mt-2 flex flex-col gap-1 text-[12px] text-fg-2">
                {res.assumptions.map((a) => (
                  <li key={a.text}>
                    <span className="mr-1 font-mono text-[9px] text-fg-3">{a.label.toUpperCase()}</span>
                    {a.text}
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-mono text-[10px] text-fg-3">{res.formula}</p>
            </details>
            <p className="font-mono text-[10px] text-fg-3">A scenario is a what-if: it changes nothing in the database.</p>
          </>
        )}
      </div>
    </div>
  );
}
