import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BootScreen } from "@/components/brand/BootScreen";
import { DotBars } from "@/components/matrix/charts";
import { GlyphIcon, OriginBadge, Panel, Readout, StatusPill } from "@/components/matrix/primitives";
import { withAsOf } from "@/components/shell/nav";
import { dayLabel, inr, num, pct } from "@/lib/format";
import { kpiView } from "@/lib/server/views";
import { KPIS, type KpiKey } from "@/lib/ui/kpis";
import { statusGlyph } from "@/lib/ui/status";
import { KpiChart } from "./KpiChart";

export async function generateMetadata({ params }: PageProps<"/kpi/[key]">) {
  const { key } = await params;
  const def = KPIS[key as KpiKey];
  return { title: def ? `${def.mnemonic} · ${def.label}` : "KPI" };
}

export default function KpiPage(props: PageProps<"/kpi/[key]">) {
  return (
    <Suspense fallback={<BootScreen label="LOADING SYSTEM" />}>
      <KpiTerminal {...props} />
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

async function KpiTerminal({ params, searchParams }: PageProps<"/kpi/[key]">) {
  const { key } = await params;
  if (!(key in KPIS)) notFound();
  const sp = await searchParams;
  const v = await kpiView(key as KpiKey, typeof sp.asOf === "string" ? sp.asOf : undefined);
  const { def, tile, meta } = v;
  const s = statusGlyph(tile.status);

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      {/* Command header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-line bg-surface px-3 py-2 font-mono text-[12px]">
        <span className="bg-fg px-2 py-0.5 font-bold tracking-widest text-bg">{def.mnemonic}</span>
        <span className="text-fg-3">&lt;GO&gt;</span>
        <span className="uppercase tracking-[0.18em] text-fg">{def.label}</span>
        <span className="text-fg-3">
          AS OF {dayLabel(meta.asOf).toUpperCase()} · {meta.targetVersion ?? "NO TARGET"} · {meta.phase.replace("_", " ").toUpperCase()}
        </span>
        <nav className="ml-auto flex flex-wrap gap-1" aria-label="Other systems">
          {v.otherKpis.map((k) => (
            <Link key={k.key} href={withAsOf(`/kpi/${k.key}`, meta.asOf)} className="border border-line px-1.5 py-0.5 text-[10px] tracking-wider text-fg-2 hover:border-fg hover:text-fg" title={k.label}>
              {k.mnemonic}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        {/* Main chart */}
        <Panel code={def.code} title="Time series" className="xl:col-span-8" meta={<span>← → inspect</span>}>
          <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-2">
            <span className="font-dot text-6xl font-bold leading-none md:text-7xl">{fmt(tile.value, def.format)}</span>
            <div className="flex flex-col gap-1 pb-1 font-mono text-[11px]">
              <span className="flex items-center gap-2 uppercase tracking-wider">
                <GlyphIcon glyph={s.glyph} size={12} /> {s.label}
              </span>
              {tile.goal !== null && (
                <span className="text-fg-2">
                  {pct(tile.value !== null && tile.goal ? tile.value / tile.goal : null)} of {fmt(tile.goal, def.format)} goal
                </span>
              )}
              {tile.delta && <span className="text-fg-3">{tile.delta}</span>}
            </div>
          </div>
          <KpiChart
            series={v.series}
            compare={v.compare}
            forecast={v.forecast}
            annotations={v.annotations}
            format={def.format}
            additive={def.kind === "additive"}
            goal={tile.goal}
            title={def.kind === "ratio" ? (def.key === "shw" || def.key === "cnf" ? "As-of each day" : "Rolling 7-day") : "Series"}
          />
        </Panel>

        {/* Right column */}
        <div className="flex flex-col gap-3 xl:col-span-4">
          <Panel code="STAT" title="Readout">
            {v.stats.map((r) => (
              <Readout key={r.k} k={r.k} v={fmt(r.v, r.fmt)} />
            ))}
          </Panel>
          <Panel code="CALC" title="How this is calculated">
            <p className="text-sm leading-relaxed text-fg-2">{v.formula}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
              {Object.entries(v.inputs).map(([k, val]) => (
                <div key={k} className="contents">
                  <dt className="truncate text-fg-3">{k}</dt>
                  <dd className="truncate text-right tabular text-fg">{String(val ?? "—")}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel code="SRC" title="Sources read">
            <ul className="flex flex-col gap-1 font-mono text-[11px]">
              {v.sources.map((src) => (
                <li key={src.collection + src.filter} className="flex justify-between gap-2">
                  <span className="text-fg">{src.collection}</span>
                  <span className="truncate text-fg-3">{src.filter}</span>
                  <span className="tabular text-fg-2">{num(src.records)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel code="BY" title="By campaign" className="xl:col-span-7" meta={<span>{def.kind === "additive" ? "share · WoW · contribution" : "value · WoW"}</span>}>
          <DotBars
            format={def.format}
            data={[...v.byCampaign]
              .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
              .map((c) => ({
                key: c.campaign_id,
                label: `${c.campaign_id} ${c.campaign_name}`,
                value: c.value,
                sub:
                  def.kind === "additive"
                    ? `${pct(c.share, 0)} · ${c.wow_change === null ? "—" : `${c.wow_change >= 0 ? "+" : ""}${fmt(c.wow_change, def.format)}`}`
                    : c.wow_change === null
                      ? "—"
                      : `${c.wow_change >= 0 ? "+" : ""}${fmt(c.wow_change, def.format)}`,
                glyph: <GlyphIcon glyph={statusGlyph(c.verdict).glyph} size={10} className="text-fg" />,
              }))}
          />
          {def.key === "vis" && <p className="mt-3 font-mono text-[11px] text-fg-3">Walk-ins have no campaign and are not shown in this breakdown.</p>}
        </Panel>
        <Panel code="ASMP" title="Assumptions & rules applied" className="xl:col-span-5">
          <ul className="flex flex-col gap-2">
            {v.assumptions.map((a) => (
              <li key={a.text} className="flex items-start gap-2 text-[13px] leading-snug">
                <span
                  className={`mt-0.5 shrink-0 border px-1 font-mono text-[9px] tracking-wider ${
                    a.label === "Assumption" ? "border-dashed border-fg-3 text-fg-2" : "border-line text-fg-3"
                  }`}
                >
                  {a.label.toUpperCase()}
                </span>
                <span className="text-fg-2">
                  {a.text}
                  {a.url && (
                    <a href={a.url} target="_blank" rel="noreferrer" className="ml-1 font-mono text-[10px] text-fg-3 underline">
                      source
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {v.assumptions.some((a) => a.label === "Assumption") && (
            <p className="mt-3 flex items-center gap-2 font-mono text-[10px] text-fg-3">
              <OriginBadge origin="assumption" /> marks modelling choices not in the source data.
            </p>
          )}
        </Panel>
      </div>
      <div className="flex justify-between font-mono text-[10px] text-fg-3">
        <Link href={withAsOf("/", meta.asOf)} className="hover:text-fg">
          ← OVR &lt;GO&gt;
        </Link>
        <span>
          <StatusPill status={tile.status} className="mr-2" />
          {def.description}
        </span>
      </div>
    </div>
  );
}
