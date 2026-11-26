import { body, handle } from "@/lib/server/http";
import { deleteTask, updateTask } from "@/lib/server/mutations";

export async function PATCH(req: Request, ctx: RouteContext<"/api/tasks/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => updateTask(id, await body(req)));
}
export async function DELETE(_req: Request, ctx: RouteContext<"/api/tasks/[id]">) {
  const { id } = await ctx.params;
  return handle(() => deleteTask(id));
}
