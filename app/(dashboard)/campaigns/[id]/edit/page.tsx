import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BootScreen } from "@/components/brand/BootScreen";
import { campaignView, tasksView } from "@/lib/server/views";
import { toDayKey } from "@/lib/time";
import { CampaignForm } from "../../CampaignForm";

export const metadata = { title: "Edit campaign" };

export default function EditCampaignPage(props: PageProps<"/campaigns/[id]/edit">) {
  return (
    <Suspense fallback={<BootScreen label="LOADING" />}>
      <EditCampaign {...props} />
    </Suspense>
  );
}

async function EditCampaign({ params, searchParams }: PageProps<"/campaigns/[id]/edit">) {
  const { id } = await params;
  const sp = await searchParams;
  const asOf = typeof sp.asOf === "string" ? sp.asOf : undefined;
  const [v, t] = await Promise.all([campaignView(id, asOf), tasksView(asOf)]);
  if (!v) notFound();
  const c = v.campaign;
  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex items-center gap-4 border border-line bg-surface px-3 py-2 font-mono text-[12px]">
        <span className="bg-fg px-2 py-0.5 font-bold tracking-widest text-bg">CMP {c.campaign_id}</span>
        <span className="uppercase tracking-[0.18em]">Edit · {c.campaign_name}</span>
        <span className="text-fg-3">Every change is logged in ACT and recalculates analytics.</span>
      </div>
      <CampaignForm
        owners={t.owners}
        asOf={v.meta.asOf}
        init={{
          campaign_id: c.campaign_id,
          campaign_name: c.campaign_name,
          channel: c.channel,
          target_audience: c.target_audience,
          objective: c.objective,
          owner_name: c.owner_name,
          status: c.status,
          planned_start: toDayKey(new Date(c.planned_start_at)),
          planned_end: toDayKey(new Date(c.planned_end_at)),
          budget_planned_inr: c.budget_planned_inr,
          hypothesis: c.hypothesis,
          thresholds: c.thresholds,
          rice: c.rice,
          origin: c.origin,
        }}
      />
    </div>
  );
}
