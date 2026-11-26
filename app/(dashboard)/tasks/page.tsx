import { Suspense } from "react";
import { BootScreen } from "@/components/brand/BootScreen";
import { tasksView } from "@/lib/server/views";
import { TaskBoard } from "./TaskBoard";

export const metadata = { title: "TASK · Tasks" };

export default function TasksPage(props: PageProps<"/tasks">) {
  return (
    <Suspense fallback={<BootScreen label="LOADING TASKS" />}>
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
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-4 border border-line bg-surface px-3 py-2 font-mono text-[12px]">
        <span className="bg-fg px-2 py-0.5 font-bold tracking-widest text-bg">TASK</span>
        <span className="uppercase tracking-[0.18em]">Execution</span>
        <span className="text-fg-3">
          {v.tasks.length} tasks · {open} open · {overdue} overdue at as-of
        </span>
      </div>
      <TaskBoard v={v} />
    </div>
  );
}
