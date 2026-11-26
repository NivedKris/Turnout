import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BootScreen } from "@/components/brand/BootScreen";
import { DotFunnel } from "@/components/matrix/charts";
import { GlyphIcon, OriginBadge, Panel, Readout, StatusPill } from "@/components/matrix/primitives";
import { TerminalChart } from "@/components/matrix/TerminalChart";
import { withAsOf } from "@/components/shell/nav";
import { dayLabel, inr, num, pct } from "@/lib/format";
import { campaignView } from "@/lib/server/views";
import { toDayKey } from "@/lib/time";

export default function CampaignPage(props: PageProps<"/campaigns/[id]">) {
  return (
    <Suspense fallback={<BootScreen label="LOADING CAMPAIGN" />}>
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
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-line bg-surface px-3 py-2 font-mono text-[12px]">
        <span className="bg-fg px-2 py-0.5 font-bold tracking-widest text-bg">CMP {c.campaign_id}</span>
        <span className="uppercase tracking-[0.18em]">{c.campaign_name}</span>
        {c.origin !== "dataset" && <OriginBadge origin={c.origin === "simulated" ? "simulated" : c.origin === "copilot" ? "copilot" : "user"} />}
        <span className="text-fg-3">
          {c.channel} · owner {c.owner_name} · status {c.status.toUpperCase()} · planned {dayLabel(toDayKey(new Date(c.planned_start_at)))} – {dayLabel(toDayKey(new Date(c.planned_end_at)))}
        </span>
        <Link href={withAsOf(`/campaigns/${c.campaign_id}/edit`, v.meta.asOf)} className="ml-auto border border-line px-2 py-0.5 text-[11px] tracking-wider text-fg-2 hover:border-fg hover:text-fg">
          EDIT
        </Link>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel code="RULE" title="Decision rule" className="xl:col-span-5">
          <div className="flex items-center gap-3">
            <StatusPill status={r.verdict} />
            <span className="font-mono text-[11px] text-fg-3">
              {r.window.from} … {r.window.to} · n = {r.sample} registrations
            </span>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed">{r.reason}</p>
          <div className="mt-4 font-mono">
            <Readout k={`${r.metric.replaceAll("_", " ")} (${t.window_days}d)`} v={f(r.value)} />
            <Readout k={`Scale if ${t.direction === "lower_is_better" ? "≤" : "≥"}`} v={f(t.scale_if)} sub={t.basis} />
            <Readout k={`Stop if ${t.direction === "lower_is_better" ? "≥" : "≤"}`} v={f(t.stop_if)} sub={t.basis} />
            <Readout k="Min sample" v={num(t.min_sample)} />
          </div>
          <h4 className="mt-4 font-mono text-[10px] uppercase tracking-wider text-fg-3">Secondary signals (change if weak)</h4>
          <ul className="mt-1 font-mono text-[12px]">
            {r.signals.map((sg) => (
              <li key={sg.key} className="flex items-center justify-between border-b border-dashed border-line py-1 last:border-0">
                <span className="flex items-center gap-2">
                  <GlyphIcon glyph={sg.weak ? "hollow" : "solid"} size={10} /> {sg.key.replaceAll("_", " ")}
                </span>
                <span className="tabular">
                  {pct(sg.value)} <span className="text-fg-3">vs {pct(sg.benchmark)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel code="KPI" title="Campaign KPIs (to date)" className="xl:col-span-3">
          <Readout k="Spend" v={inr(k.spend)} sub={pct(k.share_of_spend, 0)} />
          <Readout k="Registrations" v={num(k.registrations)} sub={pct(k.share_of_registrations, 0)} />
          <Readout k="CPR" v={inr(k.cost_per_registration)} />
          <Readout k="CTR" v={pct(k.ctr)} />
          <Readout k="Click → session" v={pct(k.click_to_session)} />
          <Readout k="Session → start" v={pct(k.session_to_start)} />
          <Readout k="Confirm rate" v={pct(k.confirm_rate)} />
          <Readout k="Cancel rate" v={pct(k.cancel_rate)} />
          <Readout k="Visitors" v={num(k.visitors)} />
          <Readout k="Show-up" v={pct(k.show_up_rate)} />
          <Readout k="Cost / visitor" v={inr(k.cost_per_visitor)} />
          {v.rates && (
            <>
              <Readout k="Regs / day (7d)" v={num(v.rates.reg_rate_7d, 1)} />
              <Readout k="Spend / day (7d)" v={inr(v.rates.spend_rate_7d)} />
            </>
          )}
        </Panel>
        <Panel code="BRIEF" title="Brief" className="xl:col-span-4">
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
        <Panel code="REG" title="Registrations">
          <TerminalChart series={v.regSeries} format="int" initialMode="cumulative" height={240} />
        </Panel>
        <Panel code="SPD" title="Net spend">
          <TerminalChart series={v.spendSeries} format="inr" initialMode="daily" height={240} />
        </Panel>
      </div>
      <Panel code="FUNL" title="Campaign funnel">
        <div className="grid gap-6 xl:grid-cols-2">
          <DotFunnel rows={v.funnel.anonymous} />
          <DotFunnel rows={v.funnel.identified} />
        </div>
      </Panel>
    </div>
  );
}
