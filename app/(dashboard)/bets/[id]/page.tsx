import { ReportScreen } from "@/components/assistant/screen";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DecisionGauge } from "@/components/matrix/FunnelBars";
import { StatusBadge } from "@/components/matrix/Metric";
import { TerminalChart } from "@/components/matrix/TerminalChart";
import { FilterBar } from "@/components/shell/FilterBar";
import { withAsOf } from "@/components/shell/nav";
import { BetForm, DecisionForm } from "@/components/strategy/Forms";
import { SignalState, fmtSignal } from "@/components/strategy/SignalRow";
import { Page, PageHeader, PageSkeleton, Section } from "@/components/ui/page";
import { inr, num, pct } from "@/lib/format";
import { betView } from "@/lib/server/views";

export default function BetPage(props: PageProps<"/bets/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={[["h-16"], ["h-72", "h-72"], ["h-64"]]} />}>
      <BetDetail {...props} />
    </Suspense>
  );
}

async function BetDetail({ params, searchParams }: PageProps<"/bets/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const v = await betView(id, typeof sp.asOf === "string" ? sp.asOf : undefined);
  if (!v) notFound();
  const { bet: b, evaluation: e } = v;
  const verdictStatus = e.verdict === "insufficient" ? "insufficient_data" : e.verdict;
  const campName = new Map(v.campaigns.map((c) => [c.id, c.name]));
  return (
    <Page>
      <ReportScreen title={`Bet ${b.bet_id} ${b.title}`} details={`Status ${b.status}, verdict ${e.verdict}: ${e.verdict_reason}`} items={e.signals.map((sg) => ({ id: sg.key, label: `${sg.label} · ${sg.state}`, kind: "signal" }))} />
      <PageHeader
        eyebrow={`Bet #${b.rank} · ${b.status} · owner ${b.owner_name}`}
        title={b.title}
        subtitle={b.hypothesis}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={verdictStatus} />
            <Link href={withAsOf("/bets", v.meta.asOf)} className="text-[13px] text-fg-2 hover:text-fg">
              ← All bets
            </Link>
          </div>
        }
      />
      <FilterBar asOf={v.meta.asOf} min={v.meta.historyStart} max={v.meta.historyEnd} presets={v.meta.presets} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Section title="Early signals" description={e.verdict_reason} className="xl:col-span-2">
          <div className="flex flex-col gap-5">
            {e.signals.map((sg) => (
              <div key={sg.key} className="flex flex-col gap-2 border-t border-line pt-4 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[14px] font-medium">{sg.label}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-[18px] font-semibold tabular">{fmtSignal(sg.metric, sg.value)}</span>
                    <SignalState state={sg.state} />
                  </span>
                </div>
                {sg.direction === "lower_is_better" && sg.value !== null ? (
                  <DecisionGauge value={sg.value} scaleIf={sg.scale_if} stopIf={sg.stop_if} format={(n) => fmtSignal(sg.metric, n)} />
                ) : (
                  <p className="text-[12px] text-fg-3">
                    Healthy ≥ {fmtSignal(sg.metric, sg.scale_if)} · failing ≤ {fmtSignal(sg.metric, sg.stop_if)} · {sg.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
        <Section title="Contribution">
          <dl className="flex flex-col">
            {(
              [
                ["Visitors from its campaigns (" + e.visitors_basis + ")", num(e.visitors_actual_or_projected)],
                ["Planned extra visitors", num(e.expected_visitors)],
                ["Against plan", pct(e.contribution_vs_plan, 0)],
                ["Registrations since start", num(e.registrations_to_date)],
                ["Spend", `${inr(e.spend_to_date)} of ${inr(e.budget_inr)}`],
                ["RICE score", num(e.rice_score)],
              ] as const
            ).map(([k, val]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0">
                <dt className="text-[13px] text-fg-2">{k}</dt>
                <dd className="font-mono text-[15px] font-semibold tabular">{val}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[12px] text-fg-3">Runs on {e.campaign_ids.map((cid) => campName.get(cid) ?? cid).join(", ") || "no campaigns"}.</p>
        </Section>
      </div>

      {v.regSeries.length > 0 && (
        <Section title="Registrations from this bet">
          <TerminalChart series={v.regSeries} format="int" initialMode="cumulative" height={240} />
        </Section>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Decisions" description="What we decided, and what happened in the 14 days after.">
          {v.decisions.length === 0 ? (
            <p className="text-[14px] text-fg-3">No decisions logged yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {v.decisions.map((d) => (
                <li key={d.decision_id} className="rounded-xl border border-line bg-bg p-4">
                  <p className="text-[14px] font-semibold">
                    <span className="mr-2 rounded-full bg-fg px-2 py-0.5 text-[11px] uppercase text-bg">{d.decision}</span>
                    {d.title}
                  </p>
                  <p className="mt-1 text-[13px] text-fg-2">{d.rationale}</p>
                  <p className="mt-2 text-[12px] text-fg-3">
                    {d.as_of} · {d.outcome.status === "future" ? "after the selected date" : d.outcome.before === null ? d.outcome.note : `${fmtSignal(d.outcome.metric, d.outcome.before)} → ${fmtSignal(d.outcome.metric, d.outcome.after)} ${d.outcome.improved === null ? "" : d.outcome.improved ? "· improved" : "· worse"} (${d.outcome.status})`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Log a decision" description="Evidence (the signal values on that date) is saved with it.">
          <DecisionForm asOf={v.meta.asOf} bets={[{ id: b.bet_id, title: b.title }]} campaigns={v.campaigns} preset={{ bet_id: b.bet_id, decision: e.verdict === "stop" ? "stop" : e.verdict === "scale" ? "scale" : "change" }} />
        </Section>
      </div>

      <details className="group rounded-2xl border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
          <span className="text-[16px] font-semibold">Edit bet</span>
          <span className="text-[12px] text-fg-3">hypothesis, budget, RICE, signals <span className="ml-2 inline-block transition-transform group-open:rotate-90">›</span></span>
        </summary>
        <div className="px-5 pb-5">
          <BetForm init={b} campaigns={v.campaigns} owners={v.owners} asOf={v.meta.asOf} />
        </div>
      </details>
    </Page>
  );
}
