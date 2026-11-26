import { ReportScreen } from "@/components/assistant/screen";
import Link from "next/link";
import { Suspense } from "react";
import { FunnelBars } from "@/components/matrix/FunnelBars";
import { HeroMetric, MiniMetric, StatusBadge } from "@/components/matrix/Metric";
import { LineSpark } from "@/components/matrix/primitives";
import { FilterBar } from "@/components/shell/FilterBar";
import { withAsOf } from "@/components/shell/nav";
import { Page, PageHeader, PageSkeleton, Section } from "@/components/ui/page";
import { dayLabel, fmtMetric, inr, num } from "@/lib/format";
import { overviewView, type OverviewView } from "@/lib/server/views";
import { statusGlyph } from "@/lib/ui/status";
import { Countdown } from "./_c/Countdown";
import { InsightTask } from "./_c/InsightTask";

export default function OverviewPage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<PageSkeleton rows={[["h-24"], ["h-56", "h-56", "h-56"], ["h-28", "h-28", "h-28", "h-28", "h-28"], ["h-80", "h-80"]]} />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const sp = await searchParams;
  const v = await overviewView(typeof sp.asOf === "string" ? sp.asOf : undefined);
  const m = v.meta;
  const href = (h: string) => withAsOf(h, m.asOf);
  const tile = Object.fromEntries(v.tiles.map((t) => [t.key, t]));
  const ctx = { owners: v.owners, campaigns: v.campaigns, meta: v.meta };

  return (
    <Page>
      <ReportScreen title="Overview" details={`As of ${m.asOf}. Tiles: ${v.tiles.map((t) => `${t.label} ${t.value ?? "—"} (${t.status})`).join("; ")}`} items={v.actions.map((a) => ({ id: a.id, label: a.title, kind: "action" }))} />
      <PageHeader
        eyebrow={`${m.festival} · ${m.city} · ${dayLabel(m.eventStartDay)} – ${dayLabel(m.eventEndDay)}`}
        title={headline(v)}
        subtitle={subline(v)}
        actions={<Countdown phase={m.phase} daysToEvent={m.daysToEvent} />}
      />
      <FilterBar asOf={m.asOf} min={m.historyStart} max={m.historyEnd} presets={m.presets} />

      {/* 1 · The three numbers that decide the festival */}
      <div className="grid gap-4 md:grid-cols-3">
        {(["vis", "reg", "spd"] as const).map((k) => {
          const t = tile[k]!;
          return (
            <HeroMetric
              key={k}
              href={href(`/kpi/${k}`)}
              label={k === "vis" ? "Unique visitors" : k === "reg" ? "Registrations" : "Marketing spend"}
              value={t.value}
              format={t.format}
              goal={t.goal}
              projected={k === "spd" ? t.projected : m.phase === "post_event" ? null : t.projected}
              status={t.status}
              showProjectedAsValue={k === "vis" && (m.phase === "pre_event" || m.phase === "before_history")}
              note={k === "vis" && (m.phase === "pre_event" || m.phase === "before_history") ? `No check-ins yet: the gates open on ${dayLabel(m.eventStartDay)}.` : k === "spd" ? "The approved budget is the goal line." : null}
            />
          );
        })}
      </div>

      {/* 2 · Supporting signals */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {(["idn", "cpr", "cnf", "ctr", "shw"] as const).map((k) => {
          const t = tile[k]!;
          return <MiniMetric key={k} href={href(`/kpi/${k}`)} label={t.label} value={t.value} format={t.format} delta={t.delta ?? t.caption} spark={t.spark} status={t.status} />;
        })}
      </div>

      {/* 2b · What moved this week, and who drove it */}
      <Section title="This week" description="Last 7 days vs the 7 before. Shows what moved together, not proof of cause.">
        <ul className="grid gap-3 md:grid-cols-2">
          {v.drivers.map((d) => (
            <li key={d.metric} className="flex items-start gap-3 rounded-xl bg-bg p-3">
              <span className="mt-0.5 font-mono text-[14px] text-fg" aria-hidden>
                {d.change === null || Math.abs(d.change) < 0.0001 ? "■" : d.change > 0 ? "▲" : "▼"}
              </span>
              <span className="text-[14px] leading-relaxed text-fg-2">{d.sentence}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* 3 · Decide and diagnose */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="What to do next" description="Ranked by impact on the visitor goal. Each one can become a task.">
          {v.actions.length === 0 ? (
            <p className="text-[14px] text-fg-3">Nothing needs action at this date.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {v.actions.map((a, i) => (
                <li key={a.id} className="flex flex-wrap items-start gap-4 rounded-xl border border-line bg-bg p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fg font-mono text-[12px] font-bold text-bg">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold leading-snug">{a.title}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-fg-2">{a.why}</p>
                    {a.impact && <p className="mt-1 text-[13px] font-medium text-fg">{a.impact}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {a.href && (
                      <Link href={href(a.href)} className="text-[12px] text-fg-2 underline-offset-4 hover:text-fg hover:underline">
                        Details
                      </Link>
                    )}
                    <InsightTask title={a.title} insight={`${a.title}. ${a.why}${a.impact ? ` (${a.impact})` : ""}. As of ${m.asOf}.`} campaignId={a.campaignId} owner={a.owner} ctx={ctx} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section
          title="Funnel"
          description="Distinct people at each step, and how many make it to the next."
          action={
            <Link href={href("/funnel")} className="text-[12px] text-fg-2 underline-offset-4 hover:text-fg hover:underline">
              Full funnel →
            </Link>
          }
        >
          <FunnelBars
            rows={v.funnel.identified.map((r) => ({ ...r, label: r.key === "attended" ? "Attended" : r.label }))}
            highlight={v.bottleneck?.key === "identified_to_registered" ? "registered" : v.bottleneck?.key === "show_up" ? "attended" : v.bottleneck?.key === "registered_to_confirmed" ? "confirmed" : null}
            highlightNote={v.bottleneck ? `${v.bottleneck.label}: ${((v.bottleneck.actual ?? 0) * 100).toFixed(1)}% vs ${(v.bottleneck.benchmark * 100).toFixed(1)}% needed` : null}
          />
          {m.phase === "post_event" || m.phase === "during_event" ? (
            <p className="text-[13px] text-fg-3">
              Plus {num(v.funnel.walk_ins)} walk-ins without a registration: {num(v.funnel.total_visitors)} unique visitors in total.
            </p>
          ) : null}
        </Section>
      </div>

      {/* 4 · Campaigns */}
      <Section
        title="Campaigns"
        description="Judged on cost per registration over the last 14 days."
        action={
          <Link href={href("/campaigns")} className="text-[12px] text-fg-2 underline-offset-4 hover:text-fg hover:underline">
            All campaigns →
          </Link>
        }
      >
        <CampaignTable v={v} />
      </Section>
    </Page>
  );
}

function headline(v: OverviewView): string {
  const g = Object.fromEntries(v.goals.goals.map((x) => [x.key, x]));
  const m = v.meta;
  if (m.phase === "before_history") return "The campaign hasn't started yet";
  if (m.phase === "post_event" && g.visitors) {
    return g.visitors.status === "achieved" ? `We hit the visitor goal: ${num(g.visitors.actual)} people came` : `${num(g.visitors.actual)} people came, ${num(g.visitors.goal! - g.visitors.actual)} short of the goal`;
  }
  const vis = g.visitors;
  if (vis?.projected != null && vis.goal) {
    const gap = vis.goal - vis.projected;
    return gap > 0 ? `On pace for ${num(vis.projected)} visitors, ${num(gap)} short of ${num(vis.goal)}` : `On pace to beat the visitor goal of ${num(vis.goal)}`;
  }
  return "Campaign overview";
}

function subline(v: OverviewView): string {
  const g = Object.fromEntries(v.goals.goals.map((x) => [x.key, x]));
  const m = v.meta;
  const parts: string[] = [];
  if (g.registrations) parts.push(`Registrations are ${statusGlyph(g.registrations.status).label.toLowerCase()} (${num(g.registrations.actual)} of ${num(g.registrations.goal)}).`);
  if (m.phase === "pre_event") parts.push(`${m.regDaysLeft} registration days left.`);
  if (g.spend?.goal) parts.push(`${inr(g.spend.actual)} of ${inr(g.spend.goal)} budget spent.`);
  return parts.join(" ");
}

function CampaignTable({ v }: { v: OverviewView }) {
  const rows = [...v.leaderboard].sort((a, b) => (a.cpr_14d ?? Infinity) - (b.cpr_14d ?? Infinity));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[14px]">
        <thead>
          <tr className="text-left text-[12px] text-fg-3">
            <th className="pb-2 font-normal">Campaign</th>
            <th className="pb-2 font-normal">Decision</th>
            <th className="pb-2 text-right font-normal">Registrations</th>
            <th className="pb-2 text-right font-normal">Cost / reg. (14d)</th>
            <th className="pb-2 pl-6 font-normal">Last 3 weeks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.campaign_id} className="border-t border-line">
              <td className="py-3 pr-4">
                <Link href={withAsOf(`/campaigns/${c.campaign_id}`, v.meta.asOf)} className="font-medium hover:underline">
                  {c.campaign_name}
                </Link>
                <div className="text-[12px] text-fg-3">{c.owner_name}</div>
              </td>
              <td className="py-3 pr-4" title={c.reason}>
                <StatusBadge status={c.verdict} />
              </td>
              <td className="py-3 pr-4 text-right font-mono tabular">{num(c.registrations)}</td>
              <td className="py-3 pr-4 text-right font-mono tabular">{fmtMetric(c.cpr_14d, "inr")}</td>
              <td className="py-3 pl-6">
                <LineSpark points={v.campaignTrends[c.campaign_id] ?? []} className="text-fg" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
