import { Suspense } from "react";
import { Page, PageHeader, PageSkeleton } from "@/components/ui/page";
import { FilterBar } from "@/components/shell/FilterBar";
import { tasksView } from "@/lib/server/views";
import { TaskBoard } from "./TaskBoard";

export const metadata = { title: "TASK · Tasks" };

export default function TasksPage(props: PageProps<"/tasks">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Tasks {...props} />
    </Suspense>
  );
}

async function Tasks({ searchParams }: PageProps<"/tasks">) {
  const sp = await searchParams;
  const v = await tasksView(typeof sp.asOf === "string" ? sp.asOf : undefined);
  const open = v.tasks.filter((t) => t.status !== "done").length;
  const overdue = v.tasks.filter((t) => t.overdue).length;
  return (
    <Page>
      <PageHeader title="Tasks" subtitle={`${v.tasks.length} tasks · ${open} open · ${overdue} overdue at the selected date`} />
      <FilterBar asOf={v.meta.asOf} min={v.meta.historyStart} max={v.meta.historyEnd} presets={v.meta.presets} />
      <TaskBoard v={v} />
    </Page>
  );
}
