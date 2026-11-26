import type { ReactNode } from "react";
import { GLYPH_CHAR, statusGlyph, type Glyph } from "@/lib/ui/status";

/* ───────────────────────── Status glyph ───────────────────────── */

export function GlyphIcon({ glyph, size = 12, className = "" }: { glyph: Glyph; size?: number; className?: string }) {
  const r = 5;
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} aria-hidden className={`shrink-0 ${className}`}>
      {glyph === "solid" && <circle cx="6" cy="6" r={r} fill="currentColor" />}
      {glyph === "hollow" && <circle cx="6" cy="6" r={r - 0.6} fill="none" stroke="currentColor" strokeWidth="1.2" />}
      {glyph === "half" && (
        <>
          <circle cx="6" cy="6" r={r - 0.6} fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d={`M6 ${6 - r + 0.6} A ${r - 0.6} ${r - 0.6} 0 0 0 6 ${6 + r - 0.6} Z`} fill="currentColor" />
        </>
      )}
      {glyph === "dotted" && (
        <circle cx="6" cy="6" r={r - 0.6} fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1.4 1.6" />
      )}
    </svg>
  );
}

export function StatusPill({ status, className = "" }: { status: string; className?: string }) {
  const { glyph, label } = statusGlyph(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-fg-2 ${className}`}
      title={`${GLYPH_CHAR[glyph]} ${label}`}
    >
      <GlyphIcon glyph={glyph} size={10} className="text-fg" />
      {label}
    </span>
  );
}

/* ───────────────────────── LED progress strip ───────────────────────── */

/**
 * Target vs actual as a strip of LEDs. Lit = achieved, dim-lit = projected,
 * unlit = remaining. Markers for base goal and stretch goal.
 */
export function LedProgress({
  value,
  projected,
  goal,
  stretch,
  max,
  dots = 48,
  label,
}: {
  value: number;
  projected?: number | null;
  goal?: number | null;
  stretch?: number | null;
  max?: number;
  dots?: number;
  label?: string;
}) {
  const top = Math.max(max ?? 0, goal ?? 0, stretch ?? 0, projected ?? 0, value, 1) * (max ? 1 : 1.08);
  const at = (n: number) => Math.round((n / top) * dots);
  const lit = at(value);
  const proj = projected ? at(projected) : lit;
  const mark = (n: number | null | undefined) => (n ? Math.min(dots - 1, Math.max(0, at(n) - 1)) : -1);
  const goalAt = mark(goal);
  const stretchAt = mark(stretch);
  return (
    <div className="w-full" role="img" aria-label={label ?? `Progress ${Math.round((value / (goal || top)) * 100)}% of goal`}>
      <div className="flex w-full items-center justify-between gap-[3px]">
        {Array.from({ length: dots }, (_, i) => {
          const state = i < lit ? "on" : i < proj ? "proj" : "off";
          const isGoal = i === goalAt;
          const isStretch = i === stretchAt;
          return (
            <span key={i} className="relative flex h-3 flex-1 items-center justify-center">
              <span
                className={`block aspect-square w-full max-w-[6px] rounded-full ${
                  state === "on" ? "bg-fg" : state === "proj" ? "bg-fg/45" : "bg-fg/12"
                }`}
              />
              {(isGoal || isStretch) && (
                <span
                  className={`absolute -top-2 -bottom-2 left-1/2 w-px -translate-x-1/2 ${isGoal ? "bg-fg" : "bg-fg/50"}`}
                  aria-hidden
                />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── Line sparkline ───────────────────────── */

/** Minimal line + end dot; reads cleanly at small sizes in tables. */
export function LineSpark({ points, width = 112, height = 24, className = "" }: { points: number[]; width?: number; height?: number; className?: string }) {
  if (points.length < 2) return <svg width={width} height={height} className={className} aria-hidden />;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const x = (i: number) => (i / (points.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const d = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
      <circle cx={x(points.length - 1)} cy={y(points.at(-1)!)} r={2.2} fill="currentColor" />
    </svg>
  );
}

/* ───────────────────────── Dot sparkline ───────────────────────── */

/** A ghost sparkline drawn as dots: one column per point, the top dot lit. */
export function DotSparkline({ points, height = 28, className = "" }: { points: number[]; height?: number; className?: string }) {
  const n = points.length;
  if (n === 0) return <div style={{ height }} className={className} />;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const rows = 7;
  const w = n * 5;
  const h = rows * 4;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" height={height} className={`w-full ${className}`} aria-hidden>
      {points.map((v, i) => {
        const level = Math.round(((v - min) / (max - min || 1)) * (rows - 1));
        return Array.from({ length: rows }, (_, r) => {
          const row = rows - 1 - r;
          const on = r <= level;
          return (
            <circle
              key={`${i}-${r}`}
              cx={i * 5 + 2.5}
              cy={row * 4 + 2}
              r={1}
              fill="currentColor"
              opacity={r === level ? 0.95 : on ? 0.28 : 0.07}
            />
          );
        });
      })}
    </svg>
  );
}

/* ───────────────────────── Terminal panel ───────────────────────── */

/** Card with a clear title; the optional code is a quiet secondary label. */
export function Panel({
  code,
  title,
  meta,
  children,
  className = "",
  bodyClassName = "",
}: {
  code?: string;
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`flex min-w-0 flex-col rounded-2xl border border-line bg-surface ${className}`}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pt-4">
        <h3 className="truncate text-[16px] font-semibold tracking-tight text-fg">{title}</h3>
        {code && <span className="font-mono text-[10px] tracking-widest text-fg-3">{code}</span>}
        {meta && <div className="ml-auto flex items-center gap-2 text-[12px] text-fg-3">{meta}</div>}
      </header>
      <div className={`min-w-0 flex-1 p-5 pt-3 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** Small key/value readout row used in stats panels. */
export function Readout({ k, v, sub }: { k: string; v: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-0">
      <span className="text-[13px] text-fg-2">{k}</span>
      <span className="text-right font-mono text-sm tabular text-fg">
        {v}
        {sub && <span className="ml-2 text-[11px] text-fg-3">{sub}</span>}
      </span>
    </div>
  );
}

/** Label for anything simulated, assumed or user-entered. Shown everywhere it applies. */
export function OriginBadge({ origin }: { origin: "simulated" | "user" | "copilot" | "assumption" }) {
  const text = { simulated: "SIMULATED", user: "USER", copilot: "COPILOT", assumption: "ASSUMPTION" }[origin];
  return (
    <span className="inline-flex items-center border border-dashed border-fg-3 px-1.5 font-mono text-[9px] tracking-[0.2em] text-fg-2">
      {text}
    </span>
  );
}
