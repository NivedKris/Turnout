/**
 * Claim grounding: finds every number stated in the answer and checks it against
 * numbers that tools actually returned this turn. Pure and unit-tested.
 */
export type Claim = { text: string; value: number; isPct: boolean; supportedBy: string[] };

const NUM = /(₹\s?)?(-?\d[\d,]*(?:\.\d+)?)(\s?%|\s?(?:lakh|L|k|K|Cr)\b)?/g;
const MONTHS = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i;

/** Numbers in text that look like claims (skips dates, years, IDs like C02/TK-0005, list markers, tiny integers). */
export function extractClaims(text: string): { text: string; value: number; isPct: boolean }[] {
  const out: { text: string; value: number; isPct: boolean }[] = [];
  const clean = text
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b(?:C\d{2}|TK-\d+|T\d{2}|R\d{4}|E\d{4})\b/g, " ")
    .replace(/^\s*\d+[.)]\s/gm, " ");
  for (const m of clean.matchAll(NUM)) {
    const raw = m[0];
    const n = Number(m[2]!.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const after = clean.slice((m.index ?? 0) + raw.length, (m.index ?? 0) + raw.length + 5);
    const before = clean.slice(Math.max(0, (m.index ?? 0) - 5), m.index ?? 0);
    if (MONTHS.test(after.trim().slice(0, 3)) || MONTHS.test(before)) continue; // "31 Mar", "Mar 31"
    if (Number.isInteger(n) && n >= 2020 && n <= 2030 && !m[1]) continue; // years
    const unit = (m[3] ?? "").trim();
    let value = n;
    if (unit === "lakh" || unit === "L") value = n * 1e5;
    if (unit === "k" || unit === "K") value = n * 1e3;
    if (unit === "Cr") value = n * 1e7;
    const isPct = unit === "%";
    if (!isPct && !m[1] && Math.abs(value) < 10 && Number.isInteger(value)) continue; // small counts ("7 campaigns", "step 2")
    out.push({ text: raw.trim(), value, isPct });
  }
  return out;
}

/** Collect numeric leaves from tool outputs, tagged with the producing node id. */
export function numericLeaves(outputs: { nodeId: string; output: unknown }[]): { nodeId: string; value: number }[] {
  const leaves: { nodeId: string; value: number }[] = [];
  const walk = (nodeId: string, v: unknown, depth: number) => {
    if (depth > 8) return;
    if (typeof v === "number" && Number.isFinite(v)) leaves.push({ nodeId, value: v });
    else if (Array.isArray(v)) v.forEach((x) => walk(nodeId, x, depth + 1));
    else if (v && typeof v === "object") Object.values(v).forEach((x) => walk(nodeId, x, depth + 1));
  };
  for (const o of outputs) walk(o.nodeId, o.output, 0);
  return leaves;
}

function close(a: number, b: number): boolean {
  if (a === b) return true;
  const tol = Math.max(Math.abs(b) * 0.006, 0.051); // rounding to 1 decimal / 0.6%
  return Math.abs(a - b) <= tol;
}

/** A claim is supported if some tool output contains the same number (or the fraction for a %, or a rounding of it). */
export function groundClaims(text: string, outputs: { nodeId: string; output: unknown }[], questionNumbers: number[] = []): Claim[] {
  const leaves = numericLeaves(outputs);
  return extractClaims(text).map((c) => {
    const targets = c.isPct ? [c.value / 100, c.value] : [c.value];
    const ids = new Set<string>();
    for (const l of leaves) if (targets.some((t) => close(t, l.value) || (c.isPct && close(t * 100, l.value * 100)))) ids.add(l.nodeId);
    if (!ids.size && questionNumbers.some((q) => close(c.value, q))) ids.add("q");
    return { ...c, supportedBy: [...ids] };
  });
}
