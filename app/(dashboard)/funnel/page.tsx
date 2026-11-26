import { Suspense } from "react";
import { FunnelBars } from "@/components/matrix/FunnelBars";
import { FilterBar, PillFilter } from "@/components/shell/FilterBar";
import { Page, PageHeader, PageSkeleton, Section } from "@/components/ui/page";
import { num, pct } from "@/lib/format";
import { funnelView } from "@/lib/server/views";

export const metadata = { title: "Funnel" };

export default function FunnelPage(props: PageProps<"/funnel">) {
  return (
    <Suspense fallback={<PageSkeleton rows={[["h-16"], ["h-80", "h-80"], ["h-40"], ["h-72"]]} />}>
      <FunnelDetail {...props} />
    </Suspense>
  );
}

const LABELS: Record<string, string> = {
  clicks: "Clicks",
  sessions: "Landing visits",
  registration_starts: "Form starts",
  engaged: "Engaged",
  registered: "Registered",
  confirmed: "Confirmed",
  attended: "Attended",
};

async function FunnelDetail({ searchParams }: PageProps<"/funnel">) {
  const sp = await searchParams;
  const v = await funnelView(typeof sp.asOf === "string" ? sp.asOf : undefined, typeof sp.campaign === "string" ? sp.campaign : null);
  const b = v.bottleneck.bottleneck;
  const campaignName = v.campaignId ? v.campaigns.find((c) => c.id === v.campaignId)?.name : null;
  const people = v.funnel.identified.map((r) => ({ ...r, label: r.key === "identified" ? "Identified" : (LABELS[r.key] ?? r.label) }));
  const ads = v.funnel.anonymous.map((r) => ({ ...r, label: r.key === "impressions" ? "Ad impressions" : (LABELS[r.key] ?? r.label) }));
  const highlight = b?.key === "identified_to_registered" ? "registered" : b?.key === "show_up" ? "attended" : b?.key === "registered_to_confirmed" ? "confirmed" : b?.key === "ctr" ? "clicks" : b?.key === "session_to_start" ? "registration_starts" : null;

  return (
    <Page>
      <PageHeader title="Funnel" subtitle={campaignName ? `How people move from first contact to the gate, for ${campaignName}.` : "How people move from first contact to the gate, across all campaigns."} />
      <FilterBar asOf={v.meta.asOf} min={v.meta.historyStart} max={v.meta.historyEnd} presets={v.meta.presets}>
        <PillFilter param="campaign" label="Campaign" value={v.campaignId ?? ""} options={[{ value: "", label: "All" }, ...v.campaigns.map((c) => ({ value: c.id, label: c.name }))]} />
      </FilterBar>

      {b && !v.campaignId && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-fg p-5 text-bg md:p-6">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] uppercase tracking-[0.18em] opacity-70">Where we lose people</p>
            <p className="mt-1 text-[20px] font-semibold leading-snug">
              {b.label}: {pct(b.actual)} convert, against {pct(b.benchmark)} needed
            </p>
            <p className="mt-1 text-[14px] opacity-80">Weakest here: {b.worst_campaigns.map((w) => `${w.campaign_name} (${pct(w.rate)})`).join(", ")}.</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="People" description="Distinct external people at each step.">
          <FunnelBars rows={people} highlight={v.campaignId ? null : highlight} highlightNote={b ? `${b.label}: ${pct(b.actual)} vs ${pct(b.benchmark)} needed` : null} />
          {!v.campaignId && v.funnel.walk_ins > 0 && (
            <p className="text-[13px] text-fg-3">
              Plus {num(v.funnel.walk_ins)} walk-ins without a registration: {num(v.funnel.total_visitors)} unique visitors in total.
            </p>
          )}
        </Section>
        <Section title="Ad and site activity" description="Platform events, not people. A person can click many times.">
          <FunnelBars rows={ads} highlight={v.campaignId ? null : highlight} />
        </Section>
      </div>

      <Section title="Conversion by campaign" description="Each step's conversion. ▼ marks steps below their benchmark.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[14px]">
            <thead>
              <tr className="text-left text-[12px] text-fg-3">
                <th className="pb-2 font-normal">Campaign</th>
                {v.stageLabels.map((s) => (
                  <th key={s.key} className="pb-2 text-right font-normal">
                    {LABELS[s.key] ?? s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {v.matrix.map((row) => (
                <tr key={row.campaign_id} className="border-t border-line">
                  <td className="py-3 pr-4 font-medium">{row.campaign_name}</td>
                  {row.stages.map((st) => {
                    const below = st.conversion !== null && st.benchmark !== null && st.conversion < st.benchmark;
                    return (
                      <td key={st.key} className={`py-3 pr-2 text-right font-mono tabular ${below ? "font-semibold text-fg" : "text-fg-2"}`}>
                        {below && <span aria-label="below benchmark">▼ </span>}
                        {pct(st.conversion)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </Page>
  );
}
