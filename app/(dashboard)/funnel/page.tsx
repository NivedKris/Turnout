import { Suspense } from "react";
import { BootScreen } from "@/components/brand/BootScreen";
import { DotFunnel } from "@/components/matrix/charts";
import { GlyphIcon, Panel } from "@/components/matrix/primitives";
import { num, pct } from "@/lib/format";
import { funnelView } from "@/lib/server/views";
import { UrlSelect } from "../_c/UrlSelect";

export const metadata = { title: "FUNL · Funnel" };

export default function FunnelPage(props: PageProps<"/funnel">) {
  return (
    <Suspense fallback={<BootScreen label="TRACING FUNNEL" />}>
      <FunnelTerminal {...props} />
    </Suspense>
  );
}

async function FunnelTerminal({ searchParams }: PageProps<"/funnel">) {
  const sp = await searchParams;
  const v = await funnelView(typeof sp.asOf === "string" ? sp.asOf : undefined, typeof sp.campaign === "string" ? sp.campaign : null);
  const b = v.bottleneck.bottleneck;
  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-4 border border-line bg-surface px-3 py-2 font-mono text-[12px]">
        <span className="bg-fg px-2 py-0.5 font-bold tracking-widest text-bg">FUNL</span>
        <span className="uppercase tracking-[0.18em]">Funnel · {v.campaignId ? v.campaigns.find((c) => c.id === v.campaignId)?.name : "All campaigns"}</span>
        <span className="ml-auto">
          <UrlSelect
            param="campaign"
            label="Campaign"
            value={v.campaignId ?? ""}
            options={[{ value: "", label: "All campaigns" }, ...v.campaigns.map((c) => ({ value: c.id, label: `${c.id} ${c.name}` }))]}
          />
        </span>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel code="ANON" title="Anonymous layer · platform events (not people)">
          <DotFunnel rows={v.funnel.anonymous} />
          <p className="mt-3 font-mono text-[11px] text-fg-3">
            Summed daily reach {num(v.funnel.reported_reach_sum)} is not unique people (cross-day overlap unknown).
          </p>
        </Panel>
        <Panel code="IDNT" title="Identified layer · distinct external people">
          <DotFunnel rows={v.funnel.identified} highlightKey={b?.key === "identified_to_registered" ? "registered" : b?.key === "show_up" ? "attended" : null} />
          {!v.campaignId && (
            <p className="mt-3 font-mono text-[11px] text-fg-3">
              + {num(v.funnel.walk_ins)} walk-ins (no registration, unattributed) = {num(v.funnel.total_visitors)} unique verified visitors.
            </p>
          )}
        </Panel>
      </div>

      <Panel code="BTNK" title="Bottleneck scan · stage conversion ÷ benchmark" meta={<span>lowest index &lt; 1 with n ≥ 50</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] font-mono text-[12px] tabular">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-fg-3">
                <th className="py-2 pr-3 font-normal">Stage</th>
                <th className="py-2 pr-3 text-right font-normal">Actual</th>
                <th className="py-2 pr-3 text-right font-normal">Benchmark</th>
                <th className="py-2 pr-3 text-right font-normal">Index</th>
                <th className="py-2 pr-3 text-right font-normal">n</th>
                <th className="py-2 pr-3 font-normal">Benchmark source</th>
                <th className="py-2 font-normal">Weakest campaigns</th>
              </tr>
            </thead>
            <tbody>
              {v.bottleneck.stages.map((st) => (
                <tr key={st.key} className={`border-b border-dashed border-line last:border-0 ${b?.key === st.key ? "bg-surface-2" : ""}`}>
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-2">
                      <GlyphIcon glyph={st.index === null ? "dotted" : st.index >= 1 ? "solid" : st.index >= 0.9 ? "half" : "hollow"} size={10} />
                      {st.label}
                      {b?.key === st.key && <span className="bg-fg px-1 text-[9px] font-bold text-bg">BOTTLENECK</span>}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right">{pct(st.actual)}</td>
                  <td className="py-2 pr-3 text-right text-fg-2">{pct(st.benchmark)}</td>
                  <td className="py-2 pr-3 text-right font-bold">{st.index === null ? "—" : st.index.toFixed(2)}</td>
                  <td className="py-2 pr-3 text-right text-fg-3">{num(st.denominator)}</td>
                  <td className="py-2 pr-3 text-[11px] text-fg-3">
                    {st.benchmark_source.label} · {st.benchmark_source.text}
                  </td>
                  <td className="py-2 text-[11px] text-fg-2">{st.worst_campaigns.map((w) => `${w.campaign_id} ${pct(w.rate)}`).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel code="MTRX" title="Conversion matrix · campaign × stage" meta={<span>■ below benchmark</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] font-mono text-[12px] tabular">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-fg-3">
                <th className="py-2 pr-3 font-normal">Campaign</th>
                {v.stageLabels.map((s) => (
                  <th key={s.key} className="py-2 pr-3 text-right font-normal">
                    →{s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {v.matrix.map((row) => (
                <tr key={row.campaign_id} className="border-b border-dashed border-line last:border-0">
                  <td className="py-2 pr-3">
                    <span className="text-fg-3">{row.campaign_id}</span> {row.campaign_name}
                  </td>
                  {row.stages.map((st) => {
                    const below = st.conversion !== null && st.benchmark !== null && st.conversion < st.benchmark;
                    return (
                      <td key={st.key} className="py-2 pr-3 text-right">
                        <span className={below ? "bg-fg px-1 text-bg" : ""}>{pct(st.conversion)}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="font-mono text-[11px] text-fg-3">{v.formula}</p>
    </div>
  );
}
