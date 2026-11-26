import Link from "next/link";
import { Suspense } from "react";
import { BootScreen } from "@/components/brand/BootScreen";
import { OriginBadge, Panel, StatusPill } from "@/components/matrix/primitives";
import { withAsOf } from "@/components/shell/nav";
import { inr, num, pct } from "@/lib/format";
import { campaignsView } from "@/lib/server/views";

export const metadata = { title: "CMP · Campaigns" };

export default function CampaignsPage(props: PageProps<"/campaigns">) {
  return (
    <Suspense fallback={<BootScreen label="LOADING CAMPAIGNS" />}>
      <Campaigns {...props} />
    </Suspense>
  );
}

async function Campaigns({ searchParams }: PageProps<"/campaigns">) {
  const sp = await searchParams;
  const v = await campaignsView(typeof sp.asOf === "string" ? sp.asOf : undefined);
  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-4 border border-line bg-surface px-3 py-2 font-mono text-[12px]">
        <span className="bg-fg px-2 py-0.5 font-bold tracking-widest text-bg">CMP</span>
        <span className="uppercase tracking-[0.18em]">Campaigns · {v.rows.length}</span>
        <span className="text-fg-3">portfolio CPR (14d) {inr(v.portfolioCpr)}</span>
        <Link href={withAsOf("/campaigns/new", v.meta.asOf)} className="ml-auto bg-fg px-2 py-1 text-[11px] font-bold tracking-widest text-bg">
          + NEW CAMPAIGN
        </Link>
      </div>
      <Panel code="LIST" title="All campaigns · rule verdicts from the last 14 days">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] font-mono text-[12px] tabular">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-fg-3">
                {["Rule", "Campaign", "Channel", "Owner", "Status", "Spend", "Regs", "CPR", "CPR 14D", "Confirm", "Cancel", "Visitors", "Show-up"].map((h, i) => (
                  <th key={h} className={`py-2 pr-3 font-normal ${i >= 5 ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {v.rows.map((c) => (
                <tr key={c.campaign_id} className="border-b border-dashed border-line last:border-0 hover:bg-surface-2">
                  <td className="py-2 pr-3" title={c.reason}>
                    <StatusPill status={c.verdict} />
                  </td>
                  <td className="py-2 pr-3">
                    <Link href={withAsOf(`/campaigns/${c.campaign_id}`, v.meta.asOf)} className="hover:underline">
                      <span className="text-fg-3">{c.campaign_id}</span> {c.campaign_name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-fg-2">{c.channel}</td>
                  <td className="py-2 pr-3 text-fg-2">{c.owner_name}</td>
                  <td className="py-2 pr-3 uppercase text-fg-2">{c.status}</td>
                  <td className="py-2 pr-3 text-right">{inr(c.spend)}</td>
                  <td className="py-2 pr-3 text-right">{num(c.registrations)}</td>
                  <td className="py-2 pr-3 text-right text-fg-2">{inr(c.cost_per_registration)}</td>
                  <td className="py-2 pr-3 text-right font-bold">{inr(c.cpr_14d)}</td>
                  <td className="py-2 pr-3 text-right">{pct(c.confirm_rate)}</td>
                  <td className="py-2 pr-3 text-right">{pct(c.cancel_rate)}</td>
                  <td className="py-2 pr-3 text-right">{num(c.visitors)}</td>
                  <td className="py-2 pr-3 text-right">{pct(c.show_up_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex items-center gap-2 font-mono text-[10px] text-fg-3">
          <OriginBadge origin="user" /> campaigns created in the app are labelled wherever they appear.
        </p>
      </Panel>
    </div>
  );
}
