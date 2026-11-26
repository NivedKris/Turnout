"use client";

import { useState } from "react";
import { TerminalChart, type ChartAnnotation, type ChartPoint } from "@/components/matrix/TerminalChart";

/** Chart with campaign overlay toggles (max 3 at once to stay legible in monochrome). */
export function KpiChart({
  series,
  compare,
  forecast = [],
  annotations,
  format,
  additive,
  goal,
  title,
}: {
  series: ChartPoint[];
  compare: { id: string; label: string; points: ChartPoint[] }[];
  forecast?: { label: string; points: ChartPoint[] }[];
  annotations: ChartAnnotation[];
  format: "int" | "inr" | "pct";
  additive: boolean;
  goal: number | null;
  title: string;
}) {
  const [on, setOn] = useState<string[]>([]);
  const toggle = (id: string) => setOn((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id].slice(-3)));
  return (
    <div className="flex flex-col gap-3">
      <TerminalChart
        series={series}
        compare={compare.filter((c) => on.includes(c.id))}
        forecast={forecast}
        annotations={annotations}
        format={format === "pct" ? "pct" : format}
        additive={additive}
        goal={goal}
        initialMode={additive && goal ? "cumulative" : "daily"}
        title={title}
        height={340}
      />
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
        <span className="mr-1 uppercase tracking-wider text-fg-3">Overlay</span>
        {compare.map((c) => (
          <button
            key={c.id}
            onClick={() => toggle(c.id)}
            aria-pressed={on.includes(c.id)}
            className={`border px-2 py-0.5 tracking-wider ${on.includes(c.id) ? "border-fg bg-fg text-bg" : "border-line text-fg-2 hover:text-fg"}`}
          >
            {c.id} {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
