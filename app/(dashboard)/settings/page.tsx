import { Suspense } from "react";
import { BootScreen } from "@/components/brand/BootScreen";
import { OriginBadge, Panel } from "@/components/matrix/primitives";
import { inr, num } from "@/lib/format";
import { settingsView } from "@/lib/server/views";
import { formatIst } from "@/lib/time";
import { ConstraintsForms } from "./ConstraintsForms";

export const metadata = { title: "CFG · Constraints" };

export default function SettingsPage(props: PageProps<"/settings">) {
  return (
    <Suspense fallback={<BootScreen label="LOADING" />}>
      <Settings {...props} />
    </Suspense>
  );
}

async function Settings({ searchParams }: PageProps<"/settings">) {
  const sp = await searchParams;
  const v = await settingsView(typeof sp.asOf === "string" ? sp.asOf : undefined);
  const last = v.targets.at(-1);
  const q = v.quality;
  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-4 border border-line bg-surface px-3 py-2 font-mono text-[12px]">
        <span className="bg-fg px-2 py-0.5 font-bold tracking-widest text-bg">CFG</span>
        <span className="uppercase tracking-[0.18em]">Targets & constraints</span>
      </div>
      <Panel code="TGT" title="Target versions">
        <table className="w-full font-mono text-[12px] tabular">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-fg-3">
              {["Version", "Effective (IST)", "Identified", "Registrations", "Visitors", "Budget", ""].map((h) => (
                <th key={h} className="py-2 pr-3 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.targets.map((t) => (
              <tr key={t.target_version + t.effective_at} className={`border-b border-dashed border-line last:border-0 ${v.meta.targetVersion === t.target_version ? "bg-surface-2" : ""}`}>
                <td className="py-2 pr-3">
                  {t.target_version} {v.meta.targetVersion === t.target_version && <span className="bg-fg px-1 text-[9px] font-bold text-bg">IN FORCE</span>}
                </td>
                <td className="py-2 pr-3 text-fg-2">{formatIst(new Date(t.effective_at))}</td>
                <td className="py-2 pr-3">{num(t.identified_external_people_goal)}</td>
                <td className="py-2 pr-3">{num(t.registration_goal)}</td>
                <td className="py-2 pr-3">{num(t.unique_external_visitors_goal)}</td>
                <td className="py-2 pr-3">{inr(t.marketing_budget_inr)}</td>
                <td className="py-2">{t.origin !== "dataset" && <OriginBadge origin="user" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <ConstraintsForms
        capacity={v.capacity}
        asOf={v.meta.asOf}
        latest={{
          identified: last?.identified_external_people_goal ?? 0,
          registrations: last?.registration_goal ?? 0,
          visitors: last?.unique_external_visitors_goal ?? 0,
          budget: last?.marketing_budget_inr ?? 0,
        }}
      />
      <Panel code="DQ" title="Data quality rules applied at this as-of">
        <div className="grid gap-2 font-mono text-[12px] sm:grid-cols-2 lg:grid-cols-4">
          <p>Import copies removed: {Object.entries(q.duplicates).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(" · ") || "none"}</p>
          <p>Non-external people excluded: {Object.entries(q.excludedPeople).map(([k, n]) => `${k} ${n}`).join(" · ") || "none"}</p>
          <p>
            Check-ins not counted: denied {q.excludedCheckins.denied} · pending {q.excludedCheckins.pending_or_unverified} · non-external {q.excludedCheckins.non_external} · repeat {q.excludedCheckins.repeat_attempts}
          </p>
          <p>Non-external registrations excluded: {q.excludedRegistrationsNonExternal}</p>
        </div>
      </Panel>
    </div>
  );
}
