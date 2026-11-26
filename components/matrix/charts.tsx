"use client";

import { useState } from "react";

const fmtInt = (v: number | null) => (v === null ? "—" : Math.round(v).toLocaleString("en-IN"));
const fmtPct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

/* ───────────────────────── Dot funnel ───────────────────────── */

export type FunnelRow = { key: string; label: string; value: number | null; conversion: number | null; benchmark?: number | null; note?: string };

/**
 * Each stage is a row of dots; lit count ∝ volume relative to the first stage of
 * the layer. Conversion from the previous stage sits between rows, against benchmark.
 */
export function DotFunnel({ rows, dots = 60, highlightKey }: { rows: FunnelRow[]; dots?: number; highlightKey?: string | null }) {
  const top = Math.max(...rows.map((r) => r.value ?? 0), 1);
  return (
    <ol className="flex flex-col gap-1">
      {rows.map((r, i) => {
        const lit = r.value === null ? 0 : Math.max(r.value > 0 ? 1 : 0, Math.round((r.value / top) * dots));
        const hot = highlightKey === r.key;
        const below = r.conversion !== null && r.benchmark ? r.conversion < r.benchmark : false;
        return (
          <li key={r.key}>
            {i > 0 && (
              <div className="flex items-center gap-2 py-1 pl-[9.5rem] font-mono text-[10px] text-fg-3">
                <span aria-hidden>↓</span>
                <span className={`tabular ${below ? "text-fg underline decoration-dotted underline-offset-2" : ""}`}>{fmtPct(r.conversion)}</span>
                {r.benchmark ? <span>vs {fmtPct(r.benchmark)}</span> : null}
                {below && <span className="uppercase tracking-wider text-fg">below benchmark</span>}
              </div>
            )}
            <div className={`flex items-center gap-3 ${hot ? "rounded-sm outline outline-1 outline-fg" : ""}`}>
              <span className="w-36 shrink-0 truncate font-mono text-[11px] uppercase tracking-wider text-fg-2">{r.label}</span>
              <span className="flex flex-1 items-center gap-[3px]" aria-hidden>
                {Array.from({ length: dots }, (_, d) => (
                  <span key={d} className={`block aspect-square flex-1 max-w-[7px] rounded-full ${d < lit ? "bg-fg" : "bg-fg/10"}`} />
                ))}
              </span>
              <span className="w-20 shrink-0 text-right font-mono text-sm tabular">{r.value === null ? "—" : fmtInt(r.value)}</span>
            </div>
            {r.note && <div className="pl-[9.5rem] font-mono text-[10px] text-fg-3">{r.note}</div>}
          </li>
        );
      })}
    </ol>
  );
}

/* ───────────────────────── Dot bars ───────────────────────── */

export type BarDatum = { key: string; label: string; value: number | null; sub?: string; glyph?: React.ReactNode };

/** Horizontal bars made of dots; hover lights the row and shows its readout. */
export function DotBars({
  data,
  format = "int",
  dots = 40,
  onSelect,
  selected,
}: {
  data: BarDatum[];
  format?: "int" | "inr" | "pct";
  dots?: number;
  onSelect?: (key: string) => void;
  selected?: string | null;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(...data.map((d) => Math.abs(d.value ?? 0)), 1e-9);
  const f = (v: number | null) =>
    v === null ? "—" : format === "inr" ? `₹${Math.round(v).toLocaleString("en-IN")}` : format === "pct" ? fmtPct(v) : fmtInt(v);
  return (
    <ul className="flex flex-col gap-1.5" onMouseLeave={() => setHover(null)}>
      {data.map((d) => {
        const lit = d.value === null ? 0 : Math.round((Math.abs(d.value) / max) * dots);
        const active = hover === d.key || selected === d.key;
        const Tag = onSelect ? "button" : "div";
        return (
          <li key={d.key}>
            <Tag
              {...(onSelect ? { onClick: () => onSelect(d.key), type: "button" as const } : {})}
              onMouseEnter={() => setHover(d.key)}
              className={`flex w-full items-center gap-3 text-left ${hover && !active ? "opacity-50" : ""} transition-opacity`}
            >
              <span className="flex w-52 shrink-0 items-center gap-1.5 truncate font-mono text-[11px] uppercase tracking-wider text-fg-2">
                {d.glyph}
                {d.label}
              </span>
              <span className="flex flex-1 items-center gap-[3px]" aria-hidden>
                {Array.from({ length: dots }, (_, i) => (
                  <span key={i} className={`block aspect-square flex-1 max-w-[7px] rounded-full ${i < lit ? (active ? "bg-fg" : "bg-fg/80") : "bg-fg/10"}`} />
                ))}
              </span>
              <span className="w-24 shrink-0 text-right font-mono text-sm tabular">{f(d.value)}</span>
              {d.sub && <span className="hidden w-24 shrink-0 text-right font-mono text-[11px] text-fg-3 md:inline">{d.sub}</span>}
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}

/* ───────────────────────── Ticker tape ───────────────────────── */

export type TickerItem = { code: string; value: string; delta?: string };

/** Bloomberg-style scrolling tape. Pauses on hover; static under reduced motion. */
export function TickerTape({ items }: { items: TickerItem[] }) {
  const row = (aria: boolean) => (
    <div className="flex shrink-0 items-center gap-8 pr-8" aria-hidden={aria}>
      {items.map((t, i) => (
        <span key={`${t.code}-${i}`} className="flex items-baseline gap-2 whitespace-nowrap font-mono text-[11px]">
          <span className="font-bold tracking-widest text-fg">{t.code}</span>
          <span className="tabular text-fg-2">{t.value}</span>
          {t.delta && <span className="tabular text-fg-3">{t.delta}</span>}
        </span>
      ))}
    </div>
  );
  return (
    <div className="tn-ticker group flex overflow-hidden border-y border-line bg-bg py-1.5" role="marquee" aria-label="Live KPI tape">
      <div className="tn-ticker-track flex group-hover:[animation-play-state:paused]">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
