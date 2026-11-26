import { Suspense } from "react";
import { Page, PageHeader, PageSkeleton } from "@/components/ui/page";
import { OriginBadge, Panel } from "@/components/matrix/primitives";
import { activityView } from "@/lib/server/views";
import { formatIst } from "@/lib/time";

export const metadata = { title: "ACT · Activity" };

export default function ActivityPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Activity />
    </Suspense>
  );
}

async function Activity() {
  const rows = await activityView(300);
  return (
    <Page>
      <PageHeader title="Activity" subtitle="Every change made by people or confirmed from the copilot, newest first. Times in IST." />
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
    </Page>
  );
}
