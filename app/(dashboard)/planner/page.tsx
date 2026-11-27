import { Suspense } from "react";
import { Page, PageHeader, PageSkeleton } from "@/components/ui/page";
import { FilterBar } from "@/components/shell/FilterBar";
import { Panel, StatusPill } from "@/components/matrix/primitives";
import { inr, num } from "@/lib/format";
import { plannerView } from "@/lib/server/views";
import { InsightTask } from "../_c/InsightTask";
import { ScenarioBuilder } from "./ScenarioBuilder";

export const metadata = { title: "RALC · Planner" };

export default function PlannerPage(props: PageProps<"/planner">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Planner {...props} />
    </Suspense>
  );
}

async function Planner({ searchParams }: PageProps<"/planner">) {
  const sp = await searchParams;
  const v = await plannerView(typeof sp.asOf === "string" ? sp.asOf : undefined);
  const r = v.reallocation;
  const ctx = { owners: v.owners, campaigns: v.campaigns, meta: v.meta };
  const stops = v.rules.filter((e) => e.verdict === "stop");
  const scales = v.rules.filter((e) => e.verdict === "scale").sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
  const presets = [
    ...(r.moves.length ? [{ label: "Apply suggested reallocation", changes: r.moves.map((m) => (m.from ? { kind: "shift_budget" as const, from: m.from, to: m.to, amount: m.amount } : { kind: "add_budget" as const, to: m.to, amount: m.amount })) }] : []),
    { label: "Show-up drops to 60%", changes: [{ kind: "set_show_up_rate" as const, value: 0.6 }] },
    ...(stops[0] ? [{ label: `Stop ${stops[0].campaign_name}`, changes: [{ kind: "stop_campaign" as const, campaign_id: stops[0].campaign_id }] }] : []),
    ...(scales[0] ? [{ label: `Scale ${scales[0].campaign_name} ×2`, changes: [{ kind: "scale_campaign" as const, campaign_id: scales[0].campaign_id, factor: 2 }] }] : []),
    { label: "Capacity 2,000", changes: [{ kind: "set_capacity" as const, value: 2000 }] },
  ];
  return (
    <Page>
      <PageHeader title="Planner" subtitle={`Move budget where it works and test what-ifs. Today's path: ${num(v.base.registrations)} registrations, ${num(v.base.visitors)} visitors, ${inr(v.base.spend)} spend.`} />
      <FilterBar asOf={v.meta.asOf} min={v.meta.historyStart} max={v.meta.historyEnd} presets={v.meta.presets} />

      <Panel code="RALC" title="Suggested reallocation" meta={<span>budget left {inr(r.budget_left)} · planned {inr(r.planned_future_spend)} · unallocated {inr(r.headroom)}</span>}>
        <p className="text-[15px]">{r.reason}</p>
        {r.moves.length > 0 && (
          <>
            <div className="-mx-1 overflow-x-auto px-1">
            <table className="mt-3 w-full font-mono text-[12px] tabular min-w-[560px]">
              <thead>
                <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-fg-3">
                  <th className="py-1.5 font-normal">From</th>
                  <th className="py-1.5 font-normal">To</th>
                  <th className="py-1.5 text-right font-normal">Amount</th>
                  <th className="py-1.5 pl-4 font-normal">Why</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {r.moves.map((m, i) => (
                  <tr key={i} className="border-b border-dashed border-line last:border-0">
                    <td className="py-2">{m.from_name}</td>
                    <td className="py-2">{m.to_name}</td>
                    <td className="py-2 text-right font-bold">{inr(m.amount)}</td>
                    <td className="py-2 pl-4 text-[11px] text-fg-2">{m.rationale}</td>
                    <td className="py-2 text-right">
                      <InsightTask
                        title={`Move ${inr(m.amount)} from ${m.from_name} to ${m.to_name}`}
                        insight={`Reallocation as of ${v.meta.asOf}: ${m.rationale}`}
                        campaignId={m.to}
                        owner={v.campaigns.find((c) => c.id === m.to)?.owner}
                        ctx={ctx}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
</div>
            {r.effect && (
              <p className="mt-3 font-mono text-[12px]">
                Effect: <b>+{num(r.effect.delta.registrations, 1)}</b> registrations, <b>+{num(r.effect.delta.visitors, 1)}</b> projected visitors, spend Δ {inr(r.effect.delta.spend)}
              </p>
            )}
          </>
        )}
        <p className="mt-3 font-mono text-[10px] text-fg-3">{v.reallocationFormula}</p>
      </Panel>

      <Panel code="WHAT" title="Scenario planner">
        <ScenarioBuilder asOf={v.meta.asOf} campaigns={v.campaigns} presets={presets} />
      </Panel>

      <Panel code="RULE" title="Scale / keep / change / stop" meta={<span>portfolio CPR (14d) {inr(v.portfolioCpr)}</span>}>
        <ul className="flex flex-col divide-y divide-line">
          {v.rules.map((e) => (
            <li key={e.campaign_id} className="flex flex-wrap items-center gap-3 py-2">
              <StatusPill status={e.verdict} />
              <span className="w-56 font-mono text-[12px]">
                <span className="text-fg-3">{e.campaign_id}</span> {e.campaign_name}
              </span>
              <span className="min-w-0 flex-1 text-[13px] text-fg-2">{e.reason}</span>
              {(e.verdict === "stop" || e.verdict === "change" || e.verdict === "scale") && (
                <InsightTask
                  title={`${e.verdict === "scale" ? "Scale" : e.verdict === "stop" ? "Stop or rework" : "Fix"} ${e.campaign_name}`}
                  insight={`Rule ${e.verdict} as of ${v.meta.asOf}: ${e.reason}`}
                  campaignId={e.campaign_id}
                  owner={e.owner_name}
                  ctx={ctx}
                />
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </Page>
  );
}
