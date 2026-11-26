"use client";

import Link from "next/link";
import Counter from "@/components/reactbits/Counter";
import { fmtMetric } from "@/lib/format";
import { statusGlyph } from "@/lib/ui/status";
import { GlyphIcon, LineSpark } from "./primitives";

export type MetricFormat = "int" | "inr" | "pct";


export function StatusBadge({ status }: { status: string }) {
  const s = statusGlyph(status);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-[12px] text-fg-2">
      <GlyphIcon glyph={s.glyph} size={10} className="text-fg" />
      {s.label}
    </span>
  );
}

/** Goal progress: solid = achieved, light = projected, track = remaining, tick = goal. */
function GoalBar({ value, projected, goal }: { value: number; projected?: number | null; goal: number }) {
  const top = Math.max(goal, projected ?? 0, value) * 1.06 || 1;
  const w = (n: number) => `${Math.min(100, (n / top) * 100)}%`;
  return (
    <div className="relative h-2 w-full rounded-full bg-fg/10" aria-hidden>
      {projected != null && projected > value && <div className="absolute inset-y-0 left-0 rounded-full bg-fg/30" style={{ width: w(projected) }} />}
      <div className="absolute inset-y-0 left-0 rounded-full bg-fg" style={{ width: w(value) }} />
      <div className="absolute -inset-y-1 w-0.5 bg-fg" style={{ left: w(goal) }} />
    </div>
  );
}

/** Big headline metric. The whole card opens its drill-down. */
export function HeroMetric({
  href,
  label,
  value,
  format,
  goal,
  projected,
  status,
  note,
  showProjectedAsValue = false,
}: {
  href: string;
  label: string;
  showProjectedAsValue?: boolean;
  value: number | null;
  format: MetricFormat;
  goal?: number | null;
  projected?: number | null;
  status: string;
  note?: string | null;
}) {
  const shown = showProjectedAsValue && projected != null ? projected : value;
  const n = shown === null ? null : format === "pct" ? Math.round(shown * 1000) / 10 : Math.round(shown);
  return (
    <Link
      href={href}
      className="group flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface p-5 outline-none transition-colors hover:border-fg-2 focus-visible:border-fg md:p-6"
      aria-label={`${label}: ${fmtMetric(value, format)}. Open details.`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-medium text-fg-2">
          {label}
          {showProjectedAsValue && projected != null && <span className="ml-1.5 text-fg-3">· projected</span>}
        </span>
        <StatusBadge status={status} />
      </div>
      <div className="font-dot text-[48px] font-bold leading-none tracking-tight md:text-[56px]">
        {n === null ? (
          <span className="text-fg-3">—</span>
        ) : (
          <Counter value={n} locale="en-IN" decimals={format === "pct" ? 1 : 0} prefix={format === "inr" ? "₹" : ""} suffix={format === "pct" ? "%" : ""} fontSize="1em" fontWeight={700} tabular duration={0.8} />
        )}
      </div>
      {goal ? (
        <div className="flex flex-col gap-2">
          <GoalBar value={value ?? 0} projected={projected} goal={goal} />
          {showProjectedAsValue && <span className="sr-only">Actual so far {fmtMetric(value, format)}</span>}
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[13px]">
            <span className="text-fg-2">
              Goal <span className="font-mono text-fg tabular">{fmtMetric(goal, format)}</span>
            </span>
            {projected != null && !showProjectedAsValue && (
              <span className="text-fg-2">
                Projected <span className="font-mono text-fg tabular">{fmtMetric(projected, format)}</span>
              </span>
            )}
          </div>
        </div>
      ) : null}
      {note && <p className="text-[13px] text-fg-3">{note}</p>}
      <span className="mt-auto text-[12px] text-fg-3 transition-colors group-hover:text-fg">View details →</span>
    </Link>
  );
}

/** Compact supporting metric with a small trend line. */
export function MiniMetric({ href, label, value, format, delta, spark, status }: { href: string; label: string; value: number | null; format: MetricFormat; delta?: string | null; spark?: number[]; status?: string }) {
  return (
    <Link href={href} className="group flex min-w-0 flex-col gap-2 rounded-2xl border border-line bg-surface p-4 outline-none transition-colors hover:border-fg-2 focus-visible:border-fg">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] text-fg-2">{label}</span>
        {status && (
          <span title={statusGlyph(status).label} className="shrink-0">
            <GlyphIcon glyph={statusGlyph(status).glyph} size={10} className="text-fg" />
          </span>
        )}
      </div>
      <span className="font-mono text-[24px] font-semibold leading-none tabular">{fmtMetric(value, format)}</span>
      <div className="flex items-end justify-between gap-2">
        <span className="text-[12px] text-fg-3">{delta ?? " "}</span>
        {spark && spark.length > 1 && <LineSpark points={spark} width={80} height={22} className="text-fg" />}
      </div>
    </Link>
  );
}
