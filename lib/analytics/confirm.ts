import { addDays } from "../time";
import type { Snapshot } from "./snapshot";

/**
 * A stop is confirmed only by three stop readings in a row at the weekly (Monday)
 * reviews, each on at least 30 registrations. Replaying 2025: a two-in-a-row rule would
 * have stopped Referrals on 3 Mar, weeks before it became the cheapest bet; this rule
 * keeps it, and stops Retargeting (17 Feb), Creator Partners (3 Mar) and Reels (24 Mar).
 * Stops are sticky: once confirmed, the money has moved.
 */
export const STOP_RULE = { readings: 3, min_sample: 30 } as const;
export const STOP_RULE_TEXT = "a stop needs 3 stop readings in a row at the Monday reviews, each on at least 30 registrations";

export type Reading = { stop: boolean; cost: number | null; sample: number };
export type StopCheck = {
  /** Consecutive counted stop readings ending at the as-of date (0–3). */
  count: number;
  readings: { as_of: string; stop: boolean; cost: number | null; sample: number; counted: boolean }[];
};
export type StopStatus = { current: StopCheck; confirmed_on: string | null };

const isMonday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() === 1;
function mondaysBetween(from: string, to: string): string[] {
  let d = from;
  while (!isMonday(d)) d = addDays(d, 1);
  const out: string[] = [];
  for (; d <= to; d = addDays(d, 7)) out.push(d);
  return out;
}

/** Monday readings per dataset and entity, computed once. */
const ledger = new WeakMap<object, Map<string, Map<string, Reading>>>();

export function stopStatus(s: Snapshot, key: string, read: (snap: Snapshot) => Reading, from: string): StopStatus {
  let byKey = ledger.get(s.source);
  if (!byKey) ledger.set(s.source, (byKey = new Map()));
  let rs = byKey.get(key);
  if (!rs) byKey.set(key, (rs = new Map()));
  const at = (day: string) => {
    let r = rs!.get(day);
    if (!r) rs!.set(day, (r = read(s.at(day))));
    return r;
  };
  const counted = (r: Reading) => r.stop && r.sample >= STOP_RULE.min_sample;

  // Sticky: the first Monday on which three counted readings in a row are reached.
  const mondays = mondaysBetween(from, s.asOf < s.regCloseDay ? s.asOf : s.regCloseDay);
  let run = 0;
  let confirmed_on: string | null = null;
  for (const m of mondays) {
    run = counted(at(m)) ? run + 1 : 0;
    if (run >= STOP_RULE.readings) {
      confirmed_on = m;
      break;
    }
  }

  // Current run: the as-of reading plus the Mondays before it.
  const seq = [...mondays.filter((m) => m < s.asOf).slice(-(STOP_RULE.readings - 1)).map((m) => ({ as_of: m, ...at(m) })), { as_of: s.asOf, ...read(s) }].reverse();
  const readings = seq.map((r) => ({ ...r, counted: counted(r) }));
  let count = 0;
  for (const r of readings) {
    if (!r.counted) break;
    count++;
  }
  return { current: { count, readings }, confirmed_on };
}
