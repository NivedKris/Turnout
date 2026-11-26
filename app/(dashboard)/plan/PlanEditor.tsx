"use client";

import { useState, useTransition } from "react";
import { updateGoalModelAction } from "@/app/actions";
import { Button, FormMessage, Input } from "@/components/ui/form";
import type { Segment } from "@/lib/models/strategy";

type Rates = { confirm_rate: number; show_up_rate: number; walk_in_share: number; stretch_reach_multiplier: number; stretch_register_multiplier: number; stretch_show_up_rate: number };

/** Edit the plan's inputs. Saving recalculates base, stretch and plan-vs-data everywhere. */
export function PlanEditor({ segments, rates, computed }: { segments: Segment[]; rates: Rates; computed: Record<string, { registrations: number; share: number }> }) {
  const [segs, setSegs] = useState(segments);
  const [r, setR] = useState(rates);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const pctIn = (v: number) => (Math.round(v * 1000) / 10).toString();
  const upd = (i: number, k: keyof Segment, v: number) => setSegs((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const dirty = JSON.stringify(segs) !== JSON.stringify(segments) || JSON.stringify(r) !== JSON.stringify(rates);
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-[14px]">
          <thead>
            <tr className="text-left text-[12px] text-fg-3">
              <th className="pb-2 font-normal">Audience segment</th>
              <th className="pb-2 text-right font-normal">People</th>
              <th className="pb-2 text-right font-normal">Reach %</th>
              <th className="pb-2 text-right font-normal">Identify %</th>
              <th className="pb-2 text-right font-normal">Register %</th>
              <th className="w-4" />
              <th className="pb-2 text-right font-normal">Registrations</th>
              <th className="pb-2 pl-4 font-normal">Basis</th>
            </tr>
          </thead>
          <tbody>
            {segs.map((sg, i) => (
              <tr key={sg.key} className="border-t border-line">
                <td className="py-2 pr-3">
                  <p className="font-medium">{sg.name}</p>
                  {sg.note && <p className="text-[12px] text-fg-3">{sg.note}</p>}
                </td>
                <td className="py-2 pl-2">
                  <Input aria-label={`${sg.name} people`} inputMode="numeric" value={sg.population} onChange={(e) => upd(i, "population", Number(e.target.value) || 0)} className="ml-auto max-w-[7rem] text-right" />
                </td>
                {(["reach_rate", "identify_rate", "register_rate"] as const).map((k) => (
                  <td key={k} className="py-2 pl-2">
                    <Input aria-label={`${sg.name} ${k}`} inputMode="decimal" defaultValue={pctIn(sg[k])} onBlur={(e) => upd(i, k, Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)} className="ml-auto max-w-[5rem] text-right" />
                  </td>
                ))}
                <td />
                <td className="py-2 pl-2 text-right font-mono tabular">{Math.round(computed[sg.key]?.registrations ?? 0).toLocaleString("en-IN")}</td>
                <td className="py-2 pl-4">
                  <span title={sg.provenance.source} className={`rounded-full border px-2 py-0.5 text-[11px] ${sg.provenance.label === "Assumption" ? "border-dashed border-fg-3 text-fg-2" : "border-line text-fg-3"}`}>
                    {sg.provenance.label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {(
          [
            ["confirm_rate", "Confirm %"],
            ["show_up_rate", "Show-up %"],
            ["walk_in_share", "Walk-ins %"],
            ["stretch_show_up_rate", "Stretch show-up %"],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="flex flex-col gap-1 text-[12px] text-fg-3">
            {l}
            <Input inputMode="decimal" defaultValue={pctIn(r[k])} onBlur={(e) => setR((x) => ({ ...x, [k]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100 }))} />
          </label>
        ))}
        {(
          [
            ["stretch_reach_multiplier", "Stretch reach ×"],
            ["stretch_register_multiplier", "Stretch register ×"],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="flex flex-col gap-1 text-[12px] text-fg-3">
            {l}
            <Input inputMode="decimal" defaultValue={r[k]} onBlur={(e) => setR((x) => ({ ...x, [k]: Math.max(1, Number(e.target.value) || 1) }))} />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const res = await updateGoalModelAction({ segments: segs, ...r });
              setMsg(res.ok ? { ok: "Plan saved. Base and stretch recalculated." } : { error: res.error });
            })
          }
        >
          {pending ? "Saving…" : "Save plan"}
        </Button>
        {dirty && <span className="text-[12px] text-fg-3">Unsaved changes</span>}
        <FormMessage ok={msg.ok} error={msg.error} />
      </div>
    </div>
  );
}
