import Link from "next/link";
import { Suspense } from "react";
import { StatusBadge } from "@/components/matrix/Metric";
import { FilterBar } from "@/components/shell/FilterBar";
import { withAsOf } from "@/components/shell/nav";
import { SignalRow } from "@/components/strategy/SignalRow";
import { Page, PageHeader, PageSkeleton } from "@/components/ui/page";
import { inr, num, pct } from "@/lib/format";
import { betsView } from "@/lib/server/views";

export const metadata = { title: "Bets" };

export default function BetsPage(props: PageProps<"/bets">) {
  return (
    <Suspense fallback={<PageSkeleton rows={[["h-16"], ["h-64", "h-64"], ["h-64", "h-64"]]} />}>
      <Bets {...props} />
    </Suspense>
  );
}

const STATUS_LABEL: Record<string, string> = { proposed: "Proposed", testing: "Testing", scaling: "Scaling", paused: "Paused", killed: "Killed", done: "Done" };

async function Bets({ searchParams }: PageProps<"/bets">) {
  const sp = await searchParams;
  const v = await betsView(typeof sp.asOf === "string" ? sp.asOf : undefined);
  const byId = new Map(v.bets.map((b) => [b.bet_id, b]));
  const camp = new Map(v.campaigns.map((c) => [c.id, c.name]));
  return (
    <Page>
      <PageHeader
        title="Bets"
        subtitle={`${v.evaluations.length} ranked strategies. Each one is judged live by its early signals. Planned: ${inr(v.totals.budget)} for +${num(v.totals.expected_visitors)} visitors.`}
        actions={
          <Link href={withAsOf("/bets/new", v.meta.asOf)} className="rounded-full bg-fg px-4 py-1.5 text-[13px] font-medium text-bg">
            + New bet
          </Link>
        }
      />
      <FilterBar asOf={v.meta.asOf} min={v.meta.historyStart} max={v.meta.historyEnd} presets={v.meta.presets} />

      <div className="grid gap-4 lg:grid-cols-2">
        {v.evaluations.map((e) => {
          const b = byId.get(e.bet_id)!;
          const verdictStatus = e.verdict === "insufficient" ? "insufficient_data" : e.verdict;
          const contrib = Math.min(1.5, e.contribution_vs_plan ?? 0);
          return (
            <Link
              key={e.bet_id}
              href={withAsOf(`/bets/${e.bet_id}`, v.meta.asOf)}
              className="group flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-fg-2 md:p-6"
            >
              <div className="flex items-start gap-4">
                <span className="font-dot text-[40px] font-bold leading-none">{e.rank}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] font-semibold leading-snug">{e.title}</p>
                  <p className="mt-1 line-clamp-2 text-[13px] text-fg-2">{b.hypothesis}</p>
                </div>
                <StatusBadge status={verdictStatus} />
              </div>

              <div className="grid grid-cols-3 gap-3 text-[12px]">
                <div>
                  <p className="text-fg-3">Status</p>
                  <p className="mt-0.5 text-[14px] font-medium">{STATUS_LABEL[e.status]}</p>
                </div>
                <div>
                  <p className="text-fg-3">RICE score</p>
                  <p className="mt-0.5 font-mono text-[14px] font-semibold tabular">{num(e.rice_score)}</p>
                </div>
                <div>
                  <p className="text-fg-3">Owner</p>
                  <p className="mt-0.5 truncate text-[14px]">{e.owner_name}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-[12px] text-fg-2">
                  <span>
                    Visitors from its campaigns: <span className="font-mono text-fg">{num(e.visitors_actual_or_projected)}</span> {e.visitors_basis} vs <span className="font-mono text-fg">{num(e.expected_visitors)}</span> planned
                  </span>
                  <span className="font-mono">{pct(e.contribution_vs_plan, 0)}</span>
                </div>
                <div className="relative h-2 rounded-full bg-fg/10">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-fg" style={{ width: `${(contrib / 1.5) * 100}%` }} />
                  <div className="absolute -inset-y-1 w-0.5 bg-fg-2" style={{ left: `${(1 / 1.5) * 100}%` }} title="Plan" />
                </div>
                <div className="flex justify-between text-[12px] text-fg-2">
                  <span>
                    Spend: <span className="font-mono text-fg">{inr(e.spend_to_date)}</span> of {inr(e.budget_inr)}
                  </span>
                  <span className="font-mono">{pct(e.budget_used, 0)}</span>
                </div>
              </div>

              <div>
                <p className="mb-1 text-[12px] font-medium text-fg-2">Early signals</p>
                {e.signals.map((sg) => (
                  <SignalRow key={sg.key} sg={sg} compact />
                ))}
              </div>
              <p className="text-[12px] text-fg-3">
                {e.verdict_reason} · Runs on {e.campaign_ids.map((id) => camp.get(id) ?? id).join(", ")}
              </p>
            </Link>
          );
        })}
      </div>
    </Page>
  );
}
