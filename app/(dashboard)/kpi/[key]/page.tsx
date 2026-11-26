import { ReportScreen } from "@/components/assistant/screen";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatusBadge } from "@/components/matrix/Metric";
import { FilterBar } from "@/components/shell/FilterBar";
import { withAsOf } from "@/components/shell/nav";
import { Page, PageHeader, PageSkeleton, Section } from "@/components/ui/page";
import { inr, num, pct } from "@/lib/format";
import { kpiView } from "@/lib/server/views";
import { KPIS, type KpiKey } from "@/lib/ui/kpis";
import { KpiChart } from "./KpiChart";

export async function generateMetadata({ params }: PageProps<"/kpi/[key]">) {
  const { key } = await params;
  const def = KPIS[key as KpiKey];
  return { title: def ? def.label : "Metric" };
}

export default function KpiPage(props: PageProps<"/kpi/[key]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={[["h-16"], ["h-[420px]", "h-[420px]"], ["h-72"]]} />}>
      <KpiDetail {...props} />
    </Suspense>
  );
}

const fmt = (v: number | string | null, f: string) => {
  if (v === null) return "—";
  if (typeof v === "string") return v;
  if (f === "inr") return inr(v);
  if (f === "pct") return pct(v);
  if (f === "dec") return num(v, 1);
  return num(v);
};

/** Readouts a decision-maker needs, in plain language. */
const KEEP = new Set(["Goal", "% of goal", "Projected (base)", "Projected (stretch)", "Needed / day", "Running / day (7d)", "WoW change", "Current", "Portfolio CPR (14d)", "Benchmark", "vs benchmark", "Confirmed at event start", "Of them, attended", "Walk-ins (not in rate)"]);
const RENAME: Record<string, string> = {
  "Projected (base)": "Projected",
  "Projected (stretch)": "Stretch case",
  "Needed / day": "Needed per day",
  "Running / day (7d)": "Current pace per day",
  "WoW change": "Change vs last week",
  "Portfolio CPR (14d)": "All campaigns (14 days)",
};

async function KpiDetail({ params, searchParams }: PageProps<"/kpi/[key]">) {
  const { key } = await params;
  if (!(key in KPIS)) notFound();
  const sp = await searchParams;
  const v = await kpiView(key as KpiKey, typeof sp.asOf === "string" ? sp.asOf : undefined);
  const { def, tile, meta } = v;
  const stats = v.stats.filter((r) => KEEP.has(r.k));
  const rows = [...v.byCampaign].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const maxVal = Math.max(...rows.map((r) => Math.abs(r.value ?? 0)), 1e-9);
  const hasWow = rows.some((r) => r.wow_change !== null);

  return (
    <Page>
      <ReportScreen title={`Metric: ${def.label}`} items={rows.map((c) => ({ id: c.campaign_id, label: `${c.campaign_name} · ${c.value ?? "—"}`, kind: "campaign" }))} />
      <PageHeader
        eyebrow="Metric"
        title={def.label}
        subtitle={def.description}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={tile.status} />
            <Link href={withAsOf("/", meta.asOf)} className="text-[13px] text-fg-2 hover:text-fg">
              ← Overview
            </Link>
          </div>
        }
      />
      <FilterBar asOf={meta.asOf} min={meta.historyStart} max={meta.historyEnd} presets={meta.presets} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Section title="Over time" description={def.key === "cnf" ? "Each point is the confirm rate at the end of that day." : def.key === "shw" ? "Share of confirmed registrants who had checked in by each day." : def.kind === "ratio" ? "Each point is the value over the trailing 7 days." : "Switch between daily values and the running total."} className="xl:col-span-2">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="font-dot text-[56px] font-bold leading-none">{fmt(tile.value, def.format)}</span>
            {tile.goal !== null && tile.value !== null && <span className="text-[15px] text-fg-2">{pct(tile.value / tile.goal)} of the {fmt(tile.goal, def.format)} goal</span>}
            {tile.delta && <span className="text-[13px] text-fg-3">{tile.delta}</span>}
          </div>
          <KpiChart
            series={v.series}
            compare={v.compare}
            forecast={v.forecast}
            annotations={v.annotations}
            format={def.format}
            additive={def.kind === "additive"}
            goal={tile.goal}
            title=""
          />
        </Section>

        <Section title="Key numbers">
          <dl className="flex flex-col">
            {stats.map((r) => (
              <div key={r.k} className="flex items-baseline justify-between gap-4 border-t border-line py-3 first:border-t-0 first:pt-0">
                <dt className="text-[14px] text-fg-2">{RENAME[r.k] ?? r.k}</dt>
                <dd className="font-mono text-[18px] font-semibold tabular">{fmt(r.v, r.fmt)}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>

      <Section title="By campaign" description={def.key === "vis" ? "Walk-ins have no campaign and are not shown here." : undefined}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[14px]">
            <thead>
              <tr className="text-left text-[12px] text-fg-3">
                <th className="pb-2 font-normal">Campaign</th>
                <th className="pb-2 text-right font-normal">{def.label}</th>
                <th className="w-[34%] pb-2 pl-6 font-normal">{def.kind === "additive" ? "Share" : "Relative"}</th>
                {hasWow && <th className="pb-2 text-right font-normal">vs last week</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.campaign_id} className="border-t border-line">
                  <td className="py-3 pr-4">
                    <Link href={withAsOf(`/campaigns/${c.campaign_id}`, meta.asOf)} className="font-medium hover:underline">
                      {c.campaign_name}
                    </Link>
                    <div className="text-[12px] text-fg-3">{c.owner_name}</div>
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular">{fmt(c.value, def.format)}</td>
                  <td className="py-3 pl-6">
                    <div className="flex items-center gap-3">
                      <div className="h-2 flex-1 rounded-full bg-fg/10">
                        <div className="h-2 rounded-full bg-fg/70" style={{ width: `${c.value === null ? 0 : (Math.abs(c.value) / maxVal) * 100}%` }} />
                      </div>
                      {c.share !== null && <span className="w-10 text-right font-mono text-[12px] text-fg-3">{pct(c.share, 0)}</span>}
                    </div>
                  </td>
                  {hasWow && (
                    <td className="py-3 text-right font-mono text-[13px] tabular text-fg-2">
                      {c.wow_change === null ? "—" : `${c.wow_change >= 0 ? "+" : "−"}${fmt(Math.abs(c.wow_change), def.format)}`}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <nav className="flex flex-wrap items-center gap-2" aria-label="Other metrics">
        <span className="text-[13px] text-fg-3">Other metrics</span>
        {v.otherKpis.map((k) => (
          <Link key={k.key} href={withAsOf(`/kpi/${k.key}`, meta.asOf)} className="rounded-full border border-line px-3 py-1 text-[12px] text-fg-2 hover:border-fg-2 hover:text-fg">
            {k.label}
          </Link>
        ))}
      </nav>
    </Page>
  );
}
