"use client";

import { useState, useTransition } from "react";
import { deleteDailyRowAction, importDailyCsvAction, logDailyMetricsAction, updateDailyRowAction } from "@/app/actions";
import { OriginBadge } from "@/components/matrix/primitives";
import { Button, FormMessage, Input } from "@/components/ui/form";
import type { CampaignView } from "@/lib/server/views";

type Row = CampaignView["daily"][number];
const COLS = [
  ["impressions", "Impr."],
  ["clicks", "Clicks"],
  ["reported_reach", "Reach"],
  ["landing_page_sessions", "Sessions"],
  ["registration_starts", "Starts"],
  ["marketing_spend_inr", "Spend ₹"],
] as const;
type Col = (typeof COLS)[number][0];

/**
 * Log, edit and delete daily marketing metrics (manual entry or CSV). Every save
 * flows through the mutation layer, so funnel, KPIs, rules and the copilot change on the next read.
 */
export function DailyEditor({ campaignId, rows, asOf, minDay }: { campaignId: string; rows: Row[]; asOf: string; minDay: string }) {
  const empty = { activity_date: asOf, impressions: "", clicks: "", reported_reach: "", landing_page_sessions: "", registration_starts: "", marketing_spend_inr: "" };
  const [draft, setDraft] = useState<Record<string, string>>(empty);
  const [edit, setEdit] = useState<{ id: string; values: Record<Col, string> } | null>(null);
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();
  const num = (v: string) => (v.trim() === "" ? 0 : Number(v));

  const add = () =>
    start(async () => {
      const r = await logDailyMetricsAction({ campaign_id: campaignId, ...draft, ...Object.fromEntries(COLS.map(([k]) => [k, num(draft[k] ?? "")])) });
      setMsg(r.ok ? { ok: `Logged ${draft.activity_date}. Analytics updated.` } : { error: r.error });
      if (r.ok) setDraft(empty);
    });
  const save = () =>
    edit &&
    start(async () => {
      const r = await updateDailyRowAction(edit.id, Object.fromEntries(COLS.map(([k]) => [k, num(edit.values[k])])));
      setMsg(r.ok ? { ok: `Saved ${edit.id}. Analytics updated.` } : { error: r.error });
      if (r.ok) setEdit(null);
    });
  const remove = (row: Row) =>
    confirm(`Delete metrics for ${row.activity_date}?`) &&
    start(async () => {
      const r = await deleteDailyRowAction(row.activity_id);
      setMsg(r.ok ? { ok: `Deleted ${row.activity_date}` } : { error: r.error });
    });
  const importCsv = () =>
    start(async () => {
      const r = await importDailyCsvAction(campaignId, csv);
      setMsg(r.ok ? { ok: `Imported ${(r.data as { imported: number }).imported} rows` } : { error: r.error });
      if (r.ok) setCsv("");
    });

  const visible = showAll ? rows : rows.slice(0, 14);
  return (
    <div className="flex flex-col gap-3">
      <FormMessage ok={msg.ok} error={msg.error} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] font-mono text-[12px] tabular">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-fg-3">
              <th className="py-1.5 pr-2 font-normal">Date</th>
              {COLS.map(([k, l]) => (
                <th key={k} className="py-1.5 pr-2 text-right font-normal">
                  {l}
                </th>
              ))}
              <th className="py-1.5 pr-2 font-normal">Source</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line bg-surface-2">
              <td className="py-1 pr-2">
                <Input aria-label="Date" type="date" min={minDay} value={draft.activity_date} onChange={(e) => setDraft({ ...draft, activity_date: e.target.value })} className="py-0.5" />
              </td>
              {COLS.map(([k, l]) => (
                <td key={k} className="py-1 pr-2">
                  <Input aria-label={l} inputMode="numeric" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className="py-0.5 text-right" placeholder="0" />
                </td>
              ))}
              <td className="py-1 pr-2 text-fg-3">new</td>
              <td className="py-1 text-right">
                <Button onClick={add} disabled={pending} className="py-1">
                  + Log
                </Button>
              </td>
            </tr>
            {visible.map((r) => (
              <tr key={r.activity_id} className="border-b border-dashed border-line last:border-0">
                <td className="py-1.5 pr-2">{r.activity_date}</td>
                {COLS.map(([k]) => (
                  <td key={k} className="py-1 pr-2 text-right">
                    {edit?.id === r.activity_id ? (
                      <Input
                        aria-label={`${k} ${r.activity_date}`}
                        inputMode="numeric"
                        value={edit.values[k]}
                        onChange={(e) => setEdit({ id: edit.id, values: { ...edit.values, [k]: e.target.value } })}
                        className="py-0.5 text-right"
                      />
                    ) : (
                      (r[k] as number).toLocaleString("en-IN")
                    )}
                  </td>
                ))}
                <td className="py-1.5 pr-2 text-[10px] text-fg-3">
                  {r.origin === "dataset" ? (r.edited ? <OriginBadge origin="user" /> : "dataset") : <OriginBadge origin={r.origin === "copilot" ? "copilot" : "user"} />}
                  {r.edited && <span className="ml-1">edited</span>}
                </td>
                <td className="whitespace-nowrap py-1.5 text-right text-[11px]">
                  {edit?.id === r.activity_id ? (
                    <>
                      <button onClick={save} disabled={pending} className="mr-2 font-bold">
                        Save
                      </button>
                      <button onClick={() => setEdit(null)} className="text-fg-3">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setEdit({ id: r.activity_id, values: Object.fromEntries(COLS.map(([k]) => [k, String(r[k])])) as Record<Col, string> })}
                        className="mr-2 text-fg-2 hover:text-fg"
                      >
                        Edit
                      </button>
                      <button onClick={() => remove(r)} className="text-fg-2 hover:text-fg">
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 14 && (
        <button onClick={() => setShowAll((x) => !x)} className="self-start font-mono text-[11px] text-fg-2 underline">
          {showAll ? "Show last 14 days" : `Show all ${rows.length} days`}
        </button>
      )}
      <details className="border border-line p-3">
        <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-wider text-fg-2">CSV import</summary>
        <p className="mt-2 font-mono text-[10px] text-fg-3">
          Header: activity_date,impressions,clicks,reported_reach,landing_page_sessions,registration_starts,marketing_spend_inr. Every row is validated before anything is written.
        </p>
        <textarea
          aria-label="CSV"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          className="mt-2 h-28 w-full border border-line bg-bg p-2 font-mono text-[12px]"
          placeholder={"activity_date,impressions,clicks,landing_page_sessions,registration_starts,marketing_spend_inr\n2025-03-20,1200,40,30,8,1500"}
        />
        <Button onClick={importCsv} disabled={pending || !csv.trim()} className="mt-2">
          Import CSV
        </Button>
      </details>
    </div>
  );
}
