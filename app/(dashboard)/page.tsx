import Link from "next/link";
import { Suspense } from "react";
import { BootScreen } from "@/components/brand/BootScreen";
import { DotFunnel, TickerTape } from "@/components/matrix/charts";
import { KpiSystem } from "@/components/matrix/KpiSystem";
import { GlyphIcon, LedProgress, Panel, StatusPill } from "@/components/matrix/primitives";
import { withAsOf } from "@/components/shell/nav";
import { dayLabel, inr, num, pct } from "@/lib/format";
import { overviewView, type OverviewView } from "@/lib/server/views";
import { statusGlyph } from "@/lib/ui/status";
import { Countdown } from "./_c/Countdown";
import { InsightTask } from "./_c/InsightTask";

export default function OverviewPage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<BootScreen label="COMPUTING" />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const sp = await searchParams;
  const asOf = typeof sp.asOf === "string" ? sp.asOf : undefined;
  const v = await overviewView(asOf);
  const href = (h: string) => withAsOf(h, v.meta.asOf);
  return (
    <div className="flex flex-col">
      <Ticker v={v} />
      <div className="flex flex-col gap-4 p-3 md:p-4">
        <Hero v={v} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {v.tiles.map(({ key, ...t }) => (
            <KpiSystem key={key} {...t} href={href(`/kpi/${key}`)} />
          ))}
        </div>
        <div className="grid gap-3 xl:grid-cols-5">
          <Panel
            code="FUNL"
            title="Identified funnel"
            className="xl:col-span-3"
            meta={
              <Link href={href("/funnel")} className="hover:text-fg">
                FUNL &lt;GO&gt; →
              </Link>
            }
          >
            <DotFunnel
              highlightKey={v.bottleneck?.key === "identified_to_registered" ? "registered" : v.bottleneck?.key === "show_up" ? "attended" : null}
              rows={v.funnel.identified}
            />
            <p className="mt-3 font-mono text-[11px] text-fg-3">
              + {num(v.funnel.walk_ins)} walk-ins = {num(v.funnel.total_visitors)} unique verified visitors. Anonymous layer: {num(v.funnel.anonymous[0]?.value)} impressions →{" "}
              {num(v.funnel.anonymous[3]?.value)} form starts (events, not people).
            </p>
          </Panel>
          <Panel code="ALRT" title="Needs attention" className="xl:col-span-2" meta={<span>{v.attention.length} items</span>}>
            {v.attention.length === 0 ? (
              <p className="font-mono text-xs text-fg-3">Nothing below threshold at this date.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {v.attention.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-start gap-3 py-2">
                    <GlyphIcon glyph={statusGlyph(a.status).glyph} size={12} className="mt-0.5 text-fg" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="font-mono text-[11px] text-fg-3">{a.detail}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      {a.campaignId && (
                        <Link href={href(`/campaigns/${a.campaignId}`)} className="font-mono text-[10px] tracking-wider text-fg-2 hover:text-fg">
                          CMP →
                        </Link>
                      )}
                      <InsightTask
                        title={a.kind === "rule" ? `Act on ${a.title.toLowerCase()}` : `Fix: ${a.title}`}
                        insight={`${a.title}. ${a.detail} (as of ${v.meta.asOf})`}
                        campaignId={a.campaignId}
                        owner={v.campaigns.find((c) => c.id === a.campaignId)?.owner}
                        ctx={{ owners: v.owners, campaigns: v.campaigns, meta: v.meta }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <Leaderboard v={v} />
      </div>
    </div>
  );
}

function Ticker({ v }: { v: OverviewView }) {
  const items = v.tiles.map((t) => ({
    code: t.code.split(".")[0]!,
    value: t.value === null ? "—" : t.format === "inr" ? inr(t.value) : t.format === "pct" ? pct(t.value) : num(t.value),
    delta: t.delta ?? undefined,
  }));
  if (v.bottleneck) items.push({ code: "BTNK", value: `${v.bottleneck.label.toUpperCase()} ${pct(v.bottleneck.actual)}`, delta: `vs ${pct(v.bottleneck.benchmark)}` });
  for (const c of v.leaderboard) items.push({ code: c.campaign_id, value: c.campaign_name.toUpperCase(), delta: c.verdict.toUpperCase() });
  return <TickerTape items={items} />;
}

function Hero({ v }: { v: OverviewView }) {
  const m = v.meta;
  const visitors = v.goals.goals.find((g) => g.key === "visitors");
  const regs = v.goals.goals.find((g) => g.key === "registrations");
  const post = m.phase === "post_event";
  const headline = (() => {
    if (m.phase === "before_history") return "Campaign has not started at this date.";
    if (post && visitors) return `Final: ${num(visitors.actual)} unique verified visitors, ${pct(visitors.pct)} of the ${num(visitors.goal)} goal.`;
    if (regs && regs.goal)
      return `Registrations ${statusGlyph(regs.status).label.toLowerCase()}: ${num(regs.projected)} projected vs ${num(regs.goal)} goal.`;
    return "";
  })();
  return (
    <section className="relative overflow-hidden rounded-md border border-line bg-surface">
      <div aria-hidden className="tn-dotfield pointer-events-none absolute inset-0" />
      <div className="relative grid gap-6 p-4 md:grid-cols-[1.2fr_1fr] md:p-6">
        <div className="flex flex-col gap-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-3">
            {m.festival} · {m.city} · {dayLabel(m.eventStartDay)} – {dayLabel(m.eventEndDay)} · {m.targetVersion ?? "no target yet"}
          </p>
          <h1 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">{headline}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <Countdown phase={m.phase} daysToEvent={m.daysToEvent} />
            {regs && <StatusPill status={regs.status} />}
            <span className="font-mono text-[11px] text-fg-3">
              {m.regDaysLeft > 0 ? `${m.regDaysLeft} registration days left` : "registrations closed"} · as of {dayLabel(m.asOf)}
            </span>
          </div>
        </div>
        <div className="flex flex-col justify-center gap-3">
          {visitors && (
            <>
              <div className="flex items-baseline justify-between font-mono text-[11px] text-fg-3">
                <span className="uppercase tracking-wider">Visitors vs goal</span>
                <span className="tabular">
                  base {num(v.projection.base.visitors)} · stretch {num(v.projection.stretch.visitors)} · goal {num(visitors.goal)}
                </span>
              </div>
              <LedProgress value={visitors.actual} projected={visitors.projected} goal={visitors.goal} stretch={v.projection.stretch.visitors} max={m.capacity} dots={56} />
              <div className="flex justify-between font-mono text-[10px] text-fg-3">
                <span>0</span>
                <span>capacity {num(m.capacity)} (assumption)</span>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Leaderboard({ v }: { v: OverviewView }) {
  return (
    <Panel code="CMP" title="Campaign leaderboard" meta={<span>portfolio CPR (14d) {inr(v.portfolioCpr)}</span>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] font-mono text-[12px] tabular">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-fg-3">
              <th className="py-2 pr-3 font-normal">Rule</th>
              <th className="py-2 pr-3 font-normal">Campaign</th>
              <th className="py-2 pr-3 font-normal">Owner</th>
              <th className="py-2 pr-3 text-right font-normal">Spend</th>
              <th className="py-2 pr-3 text-right font-normal">Regs</th>
              <th className="py-2 pr-3 text-right font-normal" title="Lifetime cost per registration">CPR</th>
              <th className="py-2 pr-3 text-right font-normal" title="Last 14 days. This is what the rule judges">CPR 14D</th>
              <th className="py-2 pr-3 text-right font-normal">CTR</th>
              <th className="py-2 pr-3 text-right font-normal">Confirm</th>
              <th className="py-2 pr-3 text-right font-normal">Visitors</th>
              <th className="py-2 text-right font-normal">Show-up</th>
            </tr>
          </thead>
          <tbody>
            {v.leaderboard.map((c) => (
              <tr key={c.campaign_id} className="border-b border-dashed border-line last:border-0 hover:bg-surface-2">
                <td className="py-2 pr-3" title={c.reason}>
                  <StatusPill status={c.verdict} />
                </td>
                <td className="py-2 pr-3">
                  <Link href={withAsOf(`/campaigns/${c.campaign_id}`, v.meta.asOf)} className="text-fg hover:underline">
                    <span className="text-fg-3">{c.campaign_id}</span> {c.campaign_name}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-fg-2">{c.owner_name}</td>
                <td className="py-2 pr-3 text-right">{inr(c.spend)}</td>
                <td className="py-2 pr-3 text-right">{num(c.registrations)}</td>
                <td className="py-2 pr-3 text-right text-fg-2">{inr(c.cost_per_registration)}</td>
                <td className="py-2 pr-3 text-right font-bold">{inr(c.cpr_14d)}</td>
                <td className="py-2 pr-3 text-right">{pct(c.ctr)}</td>
                <td className="py-2 pr-3 text-right">{pct(c.confirm_rate)}</td>
                <td className="py-2 pr-3 text-right">{num(c.visitors)}</td>
                <td className="py-2 text-right">{pct(c.show_up_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
