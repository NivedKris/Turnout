import { ReportScreen } from "@/components/assistant/screen";
import Link from "next/link";
import { Suspense } from "react";
import { StatusBadge } from "@/components/matrix/Metric";
import { FilterBar } from "@/components/shell/FilterBar";
import { withAsOf } from "@/components/shell/nav";
import { Page, PageHeader, PageSkeleton } from "@/components/ui/page";
import { inr, num } from "@/lib/format";
import { ownersView } from "@/lib/server/views";

export const metadata = { title: "Team" };

export default function TeamPage(props: PageProps<"/team">) {
  return (
    <Suspense fallback={<PageSkeleton rows={[["h-16"], ["h-72", "h-72"], ["h-72", "h-72"]]} />}>
      <Team {...props} />
    </Suspense>
  );
}

async function Team({ searchParams }: PageProps<"/team">) {
  const sp = await searchParams;
  const v = await ownersView(typeof sp.asOf === "string" ? sp.asOf : undefined);
  return (
    <Page>
      <ReportScreen title="Team" items={v.owners.map((o) => ({ id: o.owner_name, label: o.owner_name, kind: "owner" }))} />
      <PageHeader title="Team" subtitle="Who owns what: campaigns and their verdicts, bets, and open work." />
      <FilterBar asOf={v.meta.asOf} min={v.meta.historyStart} max={v.meta.historyEnd} presets={v.meta.presets} />
      <div className="grid gap-4 lg:grid-cols-2">
        {v.owners.map((o) => (
          <section key={o.owner_name} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 md:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-fg text-[14px] font-semibold text-bg">
                {o.owner_name
                  .split(" ")
                  .map((x) => x[0])
                  .join("")
                  .slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-semibold">{o.owner_name}</p>
                <p className="text-[13px] text-fg-3">
                  {o.campaigns.length} campaigns · {o.bets.length} bets · {o.tasks_open} open tasks
                </p>
              </div>
              {o.tasks_overdue > 0 && <span className="rounded-full bg-fg px-2.5 py-0.5 text-[12px] font-medium text-bg">{o.tasks_overdue} overdue</span>}
            </div>
            {o.campaigns.length > 0 && (
              <ul className="flex flex-col">
                {o.campaigns.map((c) => (
                  <li key={c.campaign_id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
                    <Link href={withAsOf(`/campaigns/${c.campaign_id}`, v.meta.asOf)} className="min-w-0 flex-1 truncate text-[14px] font-medium hover:underline">
                      {c.campaign_name}
                    </Link>
                    <span className="font-mono text-[12px] text-fg-3">
                      {num(c.registrations)} regs · {inr(c.spend)}
                    </span>
                    <StatusBadge status={c.verdict} />
                  </li>
                ))}
              </ul>
            )}
            {o.bets.length > 0 && (
              <p className="text-[13px] text-fg-2">
                Bets:{" "}
                {o.bets.map((b, i) => (
                  <span key={b.bet_id}>
                    {i > 0 && ", "}
                    <Link href={withAsOf(`/bets/${b.bet_id}`, v.meta.asOf)} className="underline-offset-2 hover:underline">
                      {b.title}
                    </Link>{" "}
                    <span className="text-fg-3">({b.status})</span>
                  </span>
                ))}
              </p>
            )}
            {o.next_due && (
              <p className="rounded-lg bg-bg px-3 py-2 text-[13px] text-fg-2">
                Next due <span className="font-mono">{o.next_due.due_date}</span>: {o.next_due.title}
              </p>
            )}
          </section>
        ))}
      </div>
    </Page>
  );
}
