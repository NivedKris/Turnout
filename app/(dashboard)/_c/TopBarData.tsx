import { connection } from "next/server";
import { loadDataset } from "@/lib/analytics/load";
import { toDayKey, addDays } from "@/lib/time";
import { asOfPresets } from "@/components/shell/nav";
import { AsOfFromUrl } from "./AsOfFromUrl";

/** Loads only the date bounds for the time machine; the selected date comes from the URL. */
export async function TopBarData() {
  await connection(); // live data: always request-time
  const ds = await loadDataset();
  const eventStartDay = toDayKey(ds.event.event_starts_at);
  const presets = asOfPresets({
    historyStart: ds.event.history_start,
    historyEnd: ds.event.history_end,
    eventStartDay,
    regCloseDay: addDays(eventStartDay, -1),
    targetRevisions: ds.targets.map((t) => toDayKey(t.effective_at)).filter((d) => d > ds.event.history_start),
  });
  return <AsOfFromUrl min={ds.event.history_start} max={ds.event.history_end} fallback={ds.settings.default_as_of} presets={presets} />;
}
