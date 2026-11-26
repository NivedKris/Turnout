import { ReportScreen } from "@/components/assistant/screen";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/page";
import { DecisionGauge, FunnelBars } from "@/components/matrix/FunnelBars";
import { StatusBadge } from "@/components/matrix/Metric";
import { FilterBar } from "@/components/shell/FilterBar";
import { Page, PageHeader } from "@/components/ui/page";
import { GlyphIcon, OriginBadge, Panel, Readout } from "@/components/matrix/primitives";
import { TerminalChart } from "@/components/matrix/TerminalChart";
import { withAsOf } from "@/components/shell/nav";
import { inr, num, pct } from "@/lib/format";
import { campaignView } from "@/lib/server/views";
import { DailyEditor } from "./DailyEditor";

export default function CampaignPage(props: PageProps<"/campaigns/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CampaignTerminal {...props} />
    </Suspense>
  );
}

async function CampaignTerminal({ params, searchParams }: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const v = await campaignView(id, typeof sp.asOf === "string" ? sp.asOf : undefined);
  if (!v) notFound();
  const { campaign: c, kpis: k, rule: r } = v;
  const t = r.thresholds;
  const isCpr = r.metric === "cost_per_registration";
  const f = (n: number | null) => (isCpr ? inr(n) : pct(n));
  return (
    <Page>
      <ReportScreen title={`Campaign ${c.campaign_id} ${c.campaign_name}`} details={`Owner ${c.owner_name}, status ${c.status}, rule verdict ${r.verdict}: ${r.reason}`} items={v.tasks.map((tk) => ({ id: tk.task_id, label: `${tk.title} · ${tk.status}`, kind: "task" }))} />
      <PageHeader
        eyebrow={`${c.channel.replaceAll("_", " ")} · owner ${c.owner_name} · ${c.status}`}
        title={c.campaign_name}
        subtitle={c.objective || undefined}
        actions={
          <div className="flex items-center gap-2">
            {c.origin !== "dataset" && <OriginBadge origin={c.origin === "simulated" ? "simulated" : c.origin === "copilot" ? "copilot" : "user"} />}
            <StatusBadge status={r.verdict} />
            <Link href={withAsOf(`/campaigns/${c.campaign_id}/edit`, v.meta.asOf)} className="rounded-full border border-line px-3 py-1.5 text-[12px] text-fg-2 hover:border-fg hover:text-fg">
              Edit campaign
            </Link>
          </div>
        }
      />
      <FilterBar asOf={v.meta.asOf} min={v.meta.historyStart} max={v.meta.historyEnd} presets={v.meta.presets} />

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel title="Decision" className="xl:col-span-5" meta={<span>last {t.window_days} days · {r.sample} registrations</span>}>
          <p className="text-[18px] font-semibold leading-snug">{r.verdict === "scale" ? "Scale it" : r.verdict === "stop" ? "Stop or rework it" : r.verdict === "change" ? "Change something" : r.verdict === "keep" ? "Keep going" : "Not enough data yet"}</p>
          <p className="mt-1 text-[14px] leading-relaxed text-fg-2">{r.reason}</p>
          {isCpr && t.scale_if > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-[13px] text-fg-2">
                Cost per registration <span className="font-mono font-semibold text-fg">{f(r.value)}</span>
              </p>
              <DecisionGauge value={r.value} scaleIf={t.scale_if} stopIf={t.stop_if} format={(n) => inr(n)} />
            </div>
          )}
          <h4 className="mt-6 text-[13px] font-medium text-fg-2">Health checks</h4>
          <ul className="mt-1 text-[13px]">
            {r.signals.map((sg) => (
              <li key={sg.key} className="flex items-center justify-between border-b border-dashed border-line py-1 last:border-0">
                <span className="flex items-center gap-2">
                  <GlyphIcon glyph={sg.weak ? "hollow" : "solid"} size={10} /> {({ ctr: "Click-through rate", session_to_start: "Visit → form start", click_to_session: "Click → visit", cancel_rate: "Cancellation rate", show_up: "Show-up rate" } as Record<string, string>)[sg.key] ?? sg.key}
                </span>
                <span className="font-mono tabular">
                  {pct(sg.value)} <span className="text-fg-3">vs {pct(sg.benchmark)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="To date" className="xl:col-span-3">
          <Readout k="Spend" v={inr(k.spend)} sub={pct(k.share_of_spend, 0)} />
          <Readout k="Registrations" v={num(k.registrations)} sub={pct(k.share_of_registrations, 0)} />
          <Readout k="Cost per registration" v={inr(k.cost_per_registration)} />
          <Readout k="Click-through rate" v={pct(k.ctr)} />
          <Readout k="Click → visit" v={pct(k.click_to_session)} />
          <Readout k="Visit → form start" v={pct(k.session_to_start)} />
          <Readout k="Confirm rate" v={pct(k.confirm_rate)} />
          <Readout k="Cancellation rate" v={pct(k.cancel_rate)} />
          <Readout k="Visitors" v={num(k.visitors)} />
          <Readout k="Show-up rate" v={pct(k.show_up_rate)} />
          <Readout k="Cost per visitor" v={inr(k.cost_per_visitor)} />
          {v.rates && (
            <>
              <Readout k="Registrations per day (7d)" v={num(v.rates.reg_rate_7d, 1)} />
              <Readout k="Spend per day (7d)" v={inr(v.rates.spend_rate_7d)} />
            </>
          )}
        </Panel>
        <Panel title="Brief" className="xl:col-span-4">
          <dl className="flex flex-col gap-3 text-sm">
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-3">Audience</dt>
              <dd className="text-fg-2">{c.target_audience || "—"}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-3">Objective (plan, not outcome)</dt>
              <dd className="text-fg-2">{c.objective || "—"}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-3">Hypothesis</dt>
              <dd className="text-fg-2">{c.hypothesis || "—"}</dd>
            </div>
          </dl>
          <h4 className="mt-4 font-mono text-[10px] uppercase tracking-wider text-fg-3">Tasks ({v.tasks.length})</h4>
          <ul className="mt-1 flex flex-col gap-1 text-[13px]">
            {v.tasks.map((tk) => (
              <li key={tk.task_id} className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-fg-3">{tk.priority}</span>
                <span className={tk.status === "done" ? "text-fg-3 line-through" : ""}>{tk.title}</span>
                <span className="ml-auto font-mono text-[10px] uppercase text-fg-3">{tk.status}</span>
              </li>
            ))}
            {v.tasks.length === 0 && <li className="font-mono text-[11px] text-fg-3">No tasks linked.</li>}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Registrations">
          <TerminalChart series={v.regSeries} format="int" initialMode="cumulative" height={240} />
        </Panel>
        <Panel title="Net spend">
          <TerminalChart series={v.spendSeries} format="inr" initialMode="daily" height={240} />
        </Panel>
      </div>
      <details className="group rounded-2xl border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
          <span className="text-[16px] font-semibold">Manage daily data</span>
          <span className="text-[12px] text-fg-3">{v.daily.length} days · log, edit or import CSV <span className="ml-2 inline-block transition-transform group-open:rotate-90">›</span></span>
        </summary>
        <div className="px-5 pb-5">
          <DailyEditor campaignId={c.campaign_id} rows={v.daily} asOf={v.meta.asOf} minDay={v.meta.historyStart} />
        </div>
      </details>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="People">
          <FunnelBars rows={v.funnel.identified.map((r) => ({ ...r, label: r.key === "attended" ? "Attended" : r.label }))} />
        </Panel>
        <Panel title="Ad and site activity">
          <FunnelBars rows={v.funnel.anonymous} />
        </Panel>
      </div>
    </Page>
  );
}
