"use client";

import Link from "next/link";
import Counter from "@/components/reactbits/Counter";
import DecryptedText from "@/components/reactbits/DecryptedText";
import { statusGlyph } from "@/lib/ui/status";
import { DotSparkline, GlyphIcon, LedProgress } from "./primitives";

export type KpiFormat = "int" | "inr" | "pct";

export type KpiSystemProps = {
  /** Module code shown as a tag, e.g. "REG.01". Also the drill-down mnemonic. */
  code: string;
  label: string;
  value: number | null;
  format: KpiFormat;
  goal?: number | null;
  stretch?: number | null;
  projected?: number | null;
  status: string;
  /** e.g. "▲ 4.2% WoW" */
  delta?: string | null;
  spark?: number[];
  caption?: string | null;
  href: string;
};

function display(value: number, format: KpiFormat) {
  if (format === "pct") return { n: Math.round(value * 1000) / 10, prefix: "", suffix: "%", decimals: 1 };
  if (format === "inr") return { n: Math.round(value), prefix: "₹", suffix: "", decimals: 0 };
  return { n: Math.round(value), prefix: "", suffix: "", decimals: 0 };
}

const fmt = (v: number | null | undefined, f: KpiFormat) =>
  v === null || v === undefined
    ? "—"
    : f === "pct"
      ? `${(v * 100).toFixed(1)}%`
      : `${f === "inr" ? "₹" : ""}${Math.round(v).toLocaleString("en-IN")}`;

/**
 * A KPI as a "system module": code tag, live odometer number, LED progress to goal,
 * a dot sparkline and a status glyph. The whole tile is a link into the terminal drill-down.
 */
export function KpiSystem(p: KpiSystemProps) {
  const s = statusGlyph(p.status);
  const d = p.value === null ? null : display(p.value, p.format);
  return (
    <Link
      href={p.href}
      className="group relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-md border border-line bg-surface p-4 outline-none transition-colors hover:border-fg-2 focus-visible:border-fg"
      aria-label={`${p.label}: ${fmt(p.value, p.format)}${p.goal ? ` of ${fmt(p.goal, p.format)} goal` : ""}, ${s.label}. Open ${p.code} drill-down.`}
    >
      {/* scanline sweep on hover */}
      <span aria-hidden className="tn-scan pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100" />

      <header className="flex items-center gap-2">
        <span className="bg-fg px-1.5 py-px font-mono text-[10px] font-bold tracking-widest text-bg">{p.code}</span>
        <span className="truncate font-mono text-[11px] uppercase tracking-[0.16em] text-fg-2">
          <DecryptedText text={p.label} animateOn="view" speed={28} maxIterations={8} sequential revealDirection="start" />
        </span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-2">
          <GlyphIcon glyph={s.glyph} size={10} className="text-fg" />
          {s.label}
        </span>
      </header>

      <div className="flex items-end justify-between gap-3">
        <div className="font-dot text-[44px] font-bold leading-none tracking-tight sm:text-[52px]">
          {d ? (
            <Counter
              value={d.n}
              locale="en-IN"
              decimals={d.decimals}
              prefix={d.prefix}
              suffix={d.suffix}
              fontSize="1em"
              fontWeight={700}
              tabular
              duration={0.9}
            />
          ) : (
            <span className="text-fg-3">—</span>
          )}
        </div>
        {p.goal ? (
          <div className="pb-1 text-right font-mono text-[11px] leading-tight text-fg-3">
            <div>GOAL {fmt(p.goal, p.format)}</div>
            {p.projected !== undefined && p.projected !== null && <div className="text-fg-2">PROJ {fmt(p.projected, p.format)}</div>}
          </div>
        ) : null}
      </div>

      {p.goal ? (
        <LedProgress value={p.value ?? 0} projected={p.projected} goal={p.goal} stretch={p.stretch} label={`${p.label} progress`} />
      ) : (
        <DotSparkline points={p.spark ?? []} className="text-fg" />
      )}

      <footer className="flex items-center gap-3 font-mono text-[11px] text-fg-3">
        {p.delta && <span className="tabular text-fg-2">{p.delta}</span>}
        {p.caption && <span className="truncate">{p.caption}</span>}
        <span className="ml-auto whitespace-nowrap tracking-wider text-fg-2 transition-transform group-hover:translate-x-0.5">
          {p.code.split(".")[0]} &lt;GO&gt; →
        </span>
      </footer>
    </Link>
  );
}
