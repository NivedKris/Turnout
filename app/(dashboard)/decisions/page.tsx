import { ReportScreen } from "@/components/assistant/screen";
import Link from "next/link";
import { Suspense } from "react";
import { GlyphIcon, OriginBadge } from "@/components/matrix/primitives";
import { FilterBar } from "@/components/shell/FilterBar";
import { withAsOf } from "@/components/shell/nav";
import { DecisionForm } from "@/components/strategy/Forms";
import { fmtSignal } from "@/components/strategy/SignalRow";
import { Page, PageHeader, PageSkeleton, Section } from "@/components/ui/page";
import { decisionsView } from "@/lib/server/views";

export const metadata = { title: "Decisions" };

export default function DecisionsPage(props: PageProps<"/decisions">) {
  return (
    <Suspense fallback={<PageSkeleton rows={[["h-16"], ["h-96", "h-96"]]} />}>
      <Decisions {...props} />
    </Suspense>
  );
}

const METRIC_LABEL: Record<string, string> = { cost_per_registration: "Cost per registration", registrations_per_day: "Registrations / day", ctr: "Click-through rate", session_to_start: "Visit → form start" };

async function Decisions({ searchParams }: PageProps<"/decisions">) {
  const sp = await searchParams;
  const v = await decisionsView(typeof sp.asOf === "string" ? sp.asOf : undefined);
  const measured = v.rows.filter((r) => r.outcome.improved !== null);
  const improved = measured.filter((r) => r.outcome.improved).length;
  return (
    <Page>
      <ReportScreen title="Decisions" items={v.rows.map((d) => ({ id: d.decision_id, label: `${d.decision.toUpperCase()} ${d.title} (${d.as_of})`, kind: "decision" }))} />
      <PageHeader
        title="Decisions"
        subtitle={measured.length ? `${improved} of ${measured.length} measured decisions improved their metric in the following week.` : "Every scale, change or stop call, with the evidence at the time and what happened next."}
      />
      <FilterBar asOf={v.meta.asOf} min={v.meta.historyStart} max={v.meta.historyEnd} presets={v.meta.presets} />
      <div className="grid gap-4 xl:grid-cols-5">
        <Section title="Decision log" description="Outcome = the 14 days after vs the 14 days before. Association, not proof of cause." className="xl:col-span-3">
          {v.rows.length === 0 ? (
            <p className="text-[14px] text-fg-3">No decisions yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {v.rows.map((d) => {
                const o = d.outcome;
                return (
                  <li key={d.decision_id} className="rounded-xl border border-line bg-bg p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-fg px-2 py-0.5 text-[11px] font-semibold uppercase text-bg">{d.decision}</span>
                      <span className="text-[15px] font-semibold">{d.title}</span>
                      {d.origin !== "user" && <OriginBadge origin={d.origin === "copilot" ? "copilot" : "simulated"} />}
                      <span className="ml-auto font-mono text-[12px] text-fg-3">{d.as_of}</span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">{d.rationale}</p>
                    <p className="mt-1 text-[12px] text-fg-3">
                      {d.bet_id && (
                        <Link href={withAsOf(`/bets/${d.bet_id}`, v.meta.asOf)} className="underline-offset-2 hover:underline">
                          {d.bet_title}
                        </Link>
                      )}
                      {d.bet_id && d.campaign_name ? " · " : ""}
                      {d.campaign_name}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-surface px-3 py-2 text-[13px]">
                      <span className="text-fg-3">{METRIC_LABEL[o.metric] ?? o.metric}</span>
                      {o.status === "future" || o.status === "pending" ? (
                        <span className="text-fg-3">{o.note}</span>
                      ) : (
                        <>
                          <span className="font-mono tabular">{fmtSignal(o.metric, o.before)}</span>
                          <span className="text-fg-3">→</span>
                          <span className="font-mono font-semibold tabular">{fmtSignal(o.metric, o.after)}</span>
                          {o.improved !== null && (
                            <span className="flex items-center gap-1.5">
                              <GlyphIcon glyph={o.improved ? "solid" : "hollow"} size={10} />
                              {o.improved ? "Improved" : "Worse"}
                              {o.change_pct !== null && <span className="font-mono text-fg-3">({o.change_pct > 0 ? "+" : ""}{(o.change_pct * 100).toFixed(0)}%)</span>}
                            </span>
                          )}
                          {o.status === "partial" && <span className="text-fg-3">· partial week</span>}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
        <Section title="Log a decision" description="The signal values on that date are frozen with it." className="xl:col-span-2">
          <DecisionForm asOf={v.meta.asOf} bets={v.bets} campaigns={v.campaigns} />
        </Section>
      </div>
    </Page>
  );
}
