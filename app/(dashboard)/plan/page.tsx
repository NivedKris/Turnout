import { ReportScreen } from "@/components/assistant/screen";
import { Suspense } from "react";
import { FunnelBars } from "@/components/matrix/FunnelBars";
import { GlyphIcon } from "@/components/matrix/primitives";
import { FilterBar } from "@/components/shell/FilterBar";
import { Page, PageHeader, PageSkeleton, Section } from "@/components/ui/page";
import { num, pct } from "@/lib/format";
import { planView } from "@/lib/server/views";
import { PlanEditor } from "./PlanEditor";

export const metadata = { title: "Goal plan" };

export default function PlanPage(props: PageProps<"/plan">) {
  return (
    <Suspense fallback={<PageSkeleton rows={[["h-16"], ["h-40", "h-40", "h-40"], ["h-80", "h-80"], ["h-96"]]} />}>
      <Plan {...props} />
    </Suspense>
  );
}

async function Plan({ searchParams }: PageProps<"/plan">) {
  const sp = await searchParams;
  const v = await planView(typeof sp.asOf === "string" ? sp.asOf : undefined);
  if (!v.model || !v.result) return <Page><PageHeader title="Goal plan" subtitle="No plan yet. Run npm run seed:strategy." /></Page>;
  const r = v.result;
  const data = r.plan_vs_data.find((x) => x.key === "visitors")!;
  const isRate = (k: string) => ["id_to_reg", "confirm", "show_up"].includes(k);
  const computed = Object.fromEntries(r.segments.map((sg) => [sg.key, { registrations: sg.registrations, share: sg.share }]));
  return (
    <Page>
      <ReportScreen title="Goal plan" items={r.segments.map((sg) => ({ id: sg.key, label: sg.name, kind: "segment" }))} />
      <PageHeader title="How high can we aim?" subtitle="The plan built bottom-up: who we can reach in Bengaluru, how many convert at each step, and what the venue can hold." />
      <FilterBar asOf={v.meta.asOf} min={v.meta.historyStart} max={v.meta.historyEnd} presets={v.meta.presets} />

      <div className="grid gap-4 md:grid-cols-3">
        {(
          [
            ["Base case", r.base.visitors, `${num(r.base.registrations)} registrations`, r.base.capped],
            ["Stretch case", r.stretch.visitors, `${num(r.stretch.registrations)} registrations`, r.stretch.capped],
            [`What the data says (${data.data_label})`, data.data, data.plan !== null && data.data !== null ? `${data.data >= data.plan ? "+" : "−"}${num(Math.abs(data.data - data.plan))} vs base plan` : "", false],
          ] as const
        ).map(([label, value, sub, capped]) => (
          <div key={label} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5 md:p-6">
            <span className="text-[14px] font-medium text-fg-2">{label}</span>
            <span className="font-dot text-[52px] font-bold leading-none">{num(value)}</span>
            <span className="text-[13px] text-fg-3">
              visitors · {sub}
              {capped ? ` · capped at venue capacity ${num(v.meta.capacity)}` : ""}
            </span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Plan vs data" description="Where reality is ahead of or behind the assumptions.">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-[12px] text-fg-3">
                <th className="pb-2 font-normal">Step</th>
                <th className="pb-2 text-right font-normal">Plan</th>
                <th className="pb-2 text-right font-normal">Data</th>
                <th className="pb-2 pl-4 font-normal" />
              </tr>
            </thead>
            <tbody>
              {r.plan_vs_data.map((row) => {
                const f = (x: number | null) => (isRate(row.key) ? pct(x) : num(x));
                const ok = row.plan !== null && row.data !== null ? row.data >= row.plan : null;
                return (
                  <tr key={row.key} className="border-t border-line">
                    <td className="py-2.5">{row.label}</td>
                    <td className="py-2.5 text-right font-mono tabular text-fg-2">{f(row.plan)}</td>
                    <td className="py-2.5 text-right font-mono font-semibold tabular">{f(row.data)}</td>
                    <td className="py-2.5 pl-4 text-[12px] text-fg-3">
                      {ok === null ? (
                        row.data_label
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <GlyphIcon glyph={ok ? "solid" : "hollow"} size={10} className="text-fg" />
                          {ok ? "ahead" : "behind"} {row.data_label === "projected" ? "(projected)" : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
        <Section title="The planned funnel" description="Base case, all segments together.">
          <FunnelBars
            rows={[
              { key: "reached", label: "Reached", value: Math.round(r.segments.reduce((a, s) => a + s.reached, 0)), conversion: null },
              { key: "identified", label: "Identified", value: Math.round(r.base.identified), conversion: r.base.identified / Math.max(1, r.segments.reduce((a, s) => a + s.reached, 0)) },
              { key: "registered", label: "Registered", value: Math.round(r.base.registrations), conversion: r.base.registrations / Math.max(1, r.base.identified) },
              { key: "confirmed", label: "Confirmed", value: Math.round(r.base.confirmed), conversion: v.model.confirm_rate },
              { key: "attended", label: "Attended", value: Math.round(r.base.registered_visitors), conversion: v.model.show_up_rate },
            ]}
          />
          <p className="text-[13px] text-fg-3">Plus {num(r.base.walk_ins)} expected walk-ins.</p>
        </Section>
      </div>

      <Section title="Audiences and assumptions" description="Edit any number; the plan, the bets and the copilot use it straight away.">
        <PlanEditor
          segments={v.model.segments}
          computed={computed}
          rates={{
            confirm_rate: v.model.confirm_rate,
            show_up_rate: v.model.show_up_rate,
            walk_in_share: v.model.walk_in_share,
            stretch_reach_multiplier: v.model.stretch_reach_multiplier,
            stretch_register_multiplier: v.model.stretch_register_multiplier,
            stretch_show_up_rate: v.model.stretch_show_up_rate,
          }}
        />
      </Section>
    </Page>
  );
}
