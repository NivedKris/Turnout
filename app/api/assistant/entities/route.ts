import { connection } from "next/server";
import { entitiesOf } from "@/lib/assistant/catalogue";
import { loadDataset } from "@/lib/analytics/load";

/** Campaign and bet names for resolving spoken/typed destinations in the browser. */
export async function GET() {
  await connection();
  const ds = await loadDataset();
  return Response.json(entitiesOf(ds));
}
