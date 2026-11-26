import { Suspense } from "react";
import { BootScreen } from "@/components/brand/BootScreen";
import { OriginBadge, Panel } from "@/components/matrix/primitives";
import { activityView } from "@/lib/server/views";
import { formatIst } from "@/lib/time";

export const metadata = { title: "ACT · Activity" };

export default function ActivityPage() {
  return (
    <Suspense fallback={<BootScreen label="LOADING LOG" />}>
      <Activity />
    </Suspense>
  );
}

async function Activity() {
  const rows = await activityView(300);
  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-4 border border-line bg-surface px-3 py-2 font-mono text-[12px]">
        <span className="bg-fg px-2 py-0.5 font-bold tracking-widest text-bg">ACT</span>
        <span className="uppercase tracking-[0.18em]">Activity log</span>
        <span className="text-fg-3">Append-only. Every change by a user or a confirmed copilot proposal. Times in IST.</span>
      </div>
      <Panel code="LOG" title={`${rows.length} most recent changes`}>
        <ol className="flex flex-col divide-y divide-line">
          {rows.map((r, i) => (
            <li key={i} className="grid gap-1 py-2 md:grid-cols-[170px_90px_1fr]">
              <span className="font-mono text-[11px] text-fg-3">{formatIst(new Date(r.at))}</span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider">
                <span className="border border-line px-1">{r.action}</span>
                {r.actor === "copilot" ? <OriginBadge origin="copilot" /> : <span className="text-fg-3">{r.actor}</span>}
              </span>
              <div className="min-w-0">
                <p className="text-[14px]">{r.summary}</p>
                {(r.before || r.after) && r.action === "update" && (
                  <details className="mt-1">
                    <summary className="cursor-pointer font-mono text-[10px] text-fg-3">diff</summary>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] text-fg-2">
                      − {r.before}
                      {"\n"}+ {r.after}
                    </pre>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ol>
        {rows.length === 0 && <p className="font-mono text-[11px] text-fg-3">No activity yet.</p>}
      </Panel>
    </div>
  );
}
