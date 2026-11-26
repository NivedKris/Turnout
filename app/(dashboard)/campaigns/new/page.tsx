import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/page";
import { tasksView } from "@/lib/server/views";
import { CampaignForm } from "../CampaignForm";

export const metadata = { title: "New campaign" };

export default function NewCampaignPage(props: PageProps<"/campaigns/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewCampaign {...props} />
    </Suspense>
  );
}

async function NewCampaign({ searchParams }: PageProps<"/campaigns/new">) {
  const sp = await searchParams;
  const v = await tasksView(typeof sp.asOf === "string" ? sp.asOf : undefined);
  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex items-center gap-4 border border-line bg-surface px-3 py-2 font-mono text-[12px]">
        <span className="bg-fg px-2 py-0.5 font-bold tracking-widest text-bg">CMP NEW</span>
        <span className="uppercase tracking-[0.18em]">New campaign</span>
        <span className="text-fg-3">Shows up in every view and in the copilot right after you save, labelled USER.</span>
      </div>
      <CampaignForm init={{}} owners={v.owners} asOf={v.meta.asOf} />
    </div>
  );
}
