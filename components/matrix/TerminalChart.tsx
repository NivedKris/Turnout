"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { addDays } from "@/lib/time";

export type ValueFormat = "int" | "inr" | "pct" | "dec";
export type ChartPoint = { day: string; value: number };
export type ChartAnnotation = { day: string; label: string };
export type CompareSeries = { label: string; points: ChartPoint[] };

const fmtNum = (v: number, f: ValueFormat) => {
  if (!Number.isFinite(v)) return "—";
  if (f === "inr") return `₹${Math.round(v).toLocaleString("en-IN")}`;
  if (f === "pct") return `${(v * 100).toFixed(1)}%`;
  if (f === "dec") return v.toLocaleString("en-IN", { maximumFractionDigits: 1 });
  return Math.round(v).toLocaleString("en-IN");
};
const fmtAxis = (v: number, f: ValueFormat) => {
  if (f === "pct") return `${(v * 100).toFixed(0)}%`;
  const a = Math.abs(v);
  const s = a >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : a >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : a >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`;
  return f === "inr" ? `₹${s}` : s;
};
const dayShort = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" }).toUpperCase();

/** Round tick values (1, 2, 2.5, 5 × 10^n steps) so the axis reads cleanly. */
function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

const RANGES = [
  { key: "1W", days: 7 },
  { key: "2W", days: 14 },
  { key: "1M", days: 30 },
  { key: "ALL", days: Infinity },
] as const;

const DASHES = ["", "2 3", "6 3", "1 2", "8 2 2 2", "4 4", "1 4"];

/**
 * Dot-matrix terminal chart. Each day is a column of dots up to its value, with the
 * top dot lit and a hairline joining the tops. Monochrome; comparison series use dash patterns.
 */
export function TerminalChart({
  series,
  format = "int",
  additive = true,
  goal,
  goalLabel = "GOAL",
  annotations = [],
  compare = [],
  forecast = [],
  initialRange = "ALL",
  initialMode = "daily",
  height = 320,
  title,
}: {
  series: ChartPoint[];
  format?: ValueFormat;
  /** Additive metrics can be shown cumulatively. */
  additive?: boolean;
  goal?: number | null;
  goalLabel?: string;
  annotations?: ChartAnnotation[];
  compare?: CompareSeries[];
  /** Cumulative-mode projections drawn dashed beyond the last observed day (e.g. base / stretch). */
  forecast?: CompareSeries[];
  initialRange?: (typeof RANGES)[number]["key"];
  initialMode?: "daily" | "cumulative";
  height?: number;
  title?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>(initialRange);
  const [mode, setMode] = useState<"daily" | "cumulative">(additive ? initialMode : "daily");
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const transform = (pts: ChartPoint[]) => {
    if (mode !== "cumulative") return pts;
    let acc = 0;
    return pts.map((p) => ({ day: p.day, value: (acc += p.value) }));
  };

  const { pts, cmp } = useMemo(() => {
    const full = transform(series);
    const days = RANGES.find((r) => r.key === range)!.days;
    const start = Number.isFinite(days) ? Math.max(0, full.length - days) : 0;
    const sliceDays = new Set(full.slice(start).map((p) => p.day));
    return {
      pts: full.slice(start),
      cmp: compare.map((c) => ({ label: c.label, points: transform(c.points).filter((p) => sliceDays.has(p.day)) })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, compare, range, mode]);

  const lastDay = pts.at(-1)?.day;
  const fc = mode === "cumulative" && lastDay ? forecast.map((f) => ({ label: f.label, points: f.points.filter((p) => p.day >= lastDay) })) : [];
  const maxFc = fc.flatMap((f) => f.points.map((p) => p.day)).sort().at(-1);
  const extDays: string[] = [];
  if (lastDay && maxFc && maxFc > lastDay) for (let d = addDays(lastDay, 1); d <= maxFc; d = addDays(d, 1)) extDays.push(d);
  const axisDays = [...pts.map((p) => p.day), ...extDays];
  const dayIndex = new Map(axisDays.map((d, i) => [d, i]));

  // Annotation labels live in a band above the plot; overlapping labels stack onto new rows.
  const annRows: { a: ChartAnnotation; i: number; row: number }[] = [];
  {
    const ends: number[] = [];
    const approx = (t: string) => t.length * 6 + 10;
    const xs = annotations
      .map((a) => ({ a, i: axisDays.indexOf(a.day) }))
      .filter((x) => x.i >= 0)
      .sort((p, q) => p.i - q.i);
    const colGuess = (width - 72) / Math.max(1, axisDays.length);
    for (const x of xs) {
      const px = 8 + colGuess * x.i;
      let row = ends.findIndex((e) => e < px);
      if (row < 0) row = ends.length;
      ends[row] = px + approx(x.a.label);
      annRows.push({ ...x, row });
    }
  }
  const bandH = annRows.length ? (Math.max(...annRows.map((r) => r.row)) + 1) * 13 + 4 : 0;
  const padL = 8;
  const padR = 64;
  const padT = 12 + bandH;
  const padB = 28;
  const w = width;
  const h = height;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const n = pts.length;
  const nAxis = Math.max(1, axisDays.length);
  const showGoal = mode === "cumulative" && goal ? goal : null;
  const values = [
    ...pts.map((p) => p.value),
    ...cmp.flatMap((c) => c.points.map((p) => p.value)),
    ...fc.flatMap((f) => f.points.map((p) => p.value)),
    showGoal ?? 0,
  ];
  const vMax = Math.max(...values, 0) * 1.08 || 1;
  const vMin = Math.min(0, ...values);
  const colW = innerW / nAxis;
  const x = (i: number) => padL + colW * i + colW / 2;
  const y = (v: number) => padT + innerH - ((v - vMin) / (vMax - vMin)) * innerH;

  const dotStep = Math.max(5, Math.min(9, colW));
  const dotR = Math.max(1, Math.min(2.2, colW / 3.2));
  const rows = Math.floor(innerH / dotStep);
  const tickVals = niceTicks(vMin, vMax, 5);
  const xEvery = Math.max(1, Math.ceil(nAxis / Math.max(2, Math.floor(innerW / 70))));

  const hi = hover ?? n - 1;
  const cur = pts[hi];
  const prev = hi > 0 ? pts[hi - 1] : undefined;
  const stats = useMemo(() => {
    if (!pts.length) return null;
    const vs = pts.map((p) => p.value);
    const total = mode === "cumulative" ? vs.at(-1)! - (vs[0] ?? 0) : vs.reduce((a, b) => a + b, 0);
    return { last: vs.at(-1)!, high: Math.max(...vs), low: Math.min(...vs), avg: vs.reduce((a, b) => a + b, 0) / vs.length, total };
  }, [pts, mode]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") setHover((v) => Math.max(0, (v ?? n - 1) - 1));
    else if (e.key === "ArrowRight") setHover((v) => Math.min(n - 1, (v ?? n - 1) + 1));
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  };

  return (
    <div className="flex flex-col gap-2">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px]">
        {title && <span className="uppercase tracking-[0.18em] text-fg-2">{title}</span>}
        <div className="flex overflow-hidden rounded-full border border-line" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={`px-2.5 py-1 tracking-wider ${range === r.key ? "bg-fg text-bg" : "text-fg-2 hover:text-fg"}`}
            >
              {r.key}
            </button>
          ))}
        </div>
        {additive && (
          <div className="flex overflow-hidden rounded-full border border-line" role="group" aria-label="Mode">
            {(["daily", "cumulative"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`px-2.5 py-1 uppercase tracking-wider ${mode === m ? "bg-fg text-bg" : "text-fg-2 hover:text-fg"}`}
              >
                {m === "daily" ? "Daily" : "Running total"}
              </button>
            ))}
          </div>
        )}
        {cur && (
          <div className="ml-auto flex items-baseline gap-3 tabular" aria-live="polite">
            <span className="text-fg-3">{dayShort(cur.day)}</span>
            <span className="text-base text-fg">{fmtNum(cur.value, format)}</span>
            {prev && (
              <span className="text-fg-2">
                {cur.value - prev.value >= 0 ? "▲" : "▼"} {fmtNum(Math.abs(cur.value - prev.value), format)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* chart */}
      <div
        ref={wrap}
        className="relative w-full select-none outline-none focus-visible:ring-1 focus-visible:ring-fg"
        tabIndex={0}
        onKeyDown={onKey}
        role="img"
        aria-label={`${title ?? "Chart"}: ${n} days, latest ${cur ? fmtNum(cur.value, format) : "none"}. Use arrow keys to inspect.`}
      >
        <svg width={w} height={h} className="block" onMouseLeave={() => setHover(null)}>
          {/* grid */}
          {tickVals.map((t, i) => (
            <g key={i}>
              <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="1 3" />
              <text x={w - padR + 8} y={y(t) + 3} className="fill-[var(--text-3)] font-mono text-[10px] tabular">
                {fmtAxis(t, format)}
              </text>
            </g>
          ))}

          {/* dot columns */}
          {pts.map((p, i) => {
            const top = Math.round(((p.value - vMin) / (vMax - vMin)) * rows);
            const active = i === hi;
            return (
              <g key={p.day} opacity={hover === null || active ? 1 : 0.55}>
                {Array.from({ length: Math.max(0, top) }, (_, r) => (
                  <circle
                    key={r}
                    cx={x(i)}
                    cy={padT + innerH - r * dotStep - dotStep / 2}
                    r={dotR}
                    fill="var(--text)"
                    opacity={r === top - 1 ? 1 : active ? 0.5 : 0.2}
                  />
                ))}
              </g>
            );
          })}

          {/* top line */}
          {n > 1 && (
            <polyline
              points={pts.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
              fill="none"
              stroke="var(--text)"
              strokeWidth={1}
              opacity={0.7}
            />
          )}

          {/* comparison series */}
          {cmp.map((c, ci) => (
            <polyline
              key={c.label}
              points={c.points.map((p) => `${x(dayIndex.get(p.day) ?? 0)},${y(p.value)}`).join(" ")}
              fill="none"
              stroke="var(--text-2)"
              strokeWidth={1}
              strokeDasharray={DASHES[(ci + 1) % DASHES.length]}
            />
          ))}

          {/* forecast */}
          {extDays.length > 0 && (
            <rect x={x(n - 1)} y={padT} width={padL + innerW - x(n - 1)} height={innerH} fill="var(--text)" opacity={0.035} />
          )}
          {fc.map((f, fi) => {
            return (
              <g key={f.label}>
                <polyline
                  points={f.points.map((p) => `${x(dayIndex.get(p.day) ?? 0)},${y(p.value)}`).join(" ")}
                  fill="none"
                  stroke="var(--text)"
                  strokeWidth={1.2}
                  strokeDasharray={fi === 0 ? "4 3" : "1 3"}
                />
              </g>
            );
          })}

          {/* goal */}
          {showGoal && (
            <g>
              <line x1={padL} x2={w - padR} y1={y(showGoal)} y2={y(showGoal)} stroke="var(--text)" strokeWidth={1} strokeDasharray="6 3" />
              <rect x={w - padR + 2} y={y(showGoal) - 8} width={padR - 4} height={16} fill="var(--text)" />
              <text x={w - padR + 6} y={y(showGoal) + 4} className="fill-[var(--bg)] font-mono text-[10px] font-bold">
                {goalLabel}
              </text>
            </g>
          )}

          {/* annotations: line in the plot, label in the band above */}
          {annRows.map(({ a, i, row }) => (
            <g key={a.day + a.label}>
              <line x1={x(i)} x2={x(i)} y1={8 + row * 13 + 6} y2={padT + innerH} stroke="var(--text-3)" strokeDasharray="2 3" />
              <circle cx={x(i)} cy={8 + row * 13 + 5} r={2} fill="var(--text-2)" />
              <text x={x(i) + 5} y={8 + row * 13 + 8} className="fill-[var(--text-2)] text-[10px]">
                {a.label}
              </text>
            </g>
          ))}

          {/* x axis */}
          {axisDays.map((d, i) =>
            i % xEvery === 0 ? (
              <text key={d} x={i === 0 ? padL : x(i)} y={h - 8} textAnchor={i === 0 ? "start" : "middle"} className="fill-[var(--text-3)] font-mono text-[10px]">
                {dayShort(d)}
              </text>
            ) : null,
          )}

          {/* crosshair */}
          {hover !== null && cur && (
            <g pointerEvents="none">
              <line x1={x(hi)} x2={x(hi)} y1={padT} y2={padT + innerH} stroke="var(--text)" strokeWidth={1} />
              <line x1={padL} x2={w - padR} y1={y(cur.value)} y2={y(cur.value)} stroke="var(--text)" strokeWidth={1} opacity={0.5} />
              <rect x={w - padR + 2} y={y(cur.value) - 8} width={padR - 4} height={16} fill="var(--text)" />
              <text x={w - padR + 6} y={y(cur.value) + 4} className="fill-[var(--bg)] font-mono text-[10px] font-bold tabular">
                {fmtAxis(cur.value, format)}
              </text>
            </g>
          )}

          {/* hit areas */}
          {pts.map((p, i) => (
            <rect
              key={`hit-${p.day}`}
              x={padL + colW * i}
              y={padT}
              width={colW}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>
        {n === 0 && (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-xs uppercase tracking-widest text-fg-3">
            No data in range
          </div>
        )}
      </div>

      {/* stats strip */}
      {stats && (
        <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line font-mono text-[11px] ${additive ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
          {(
            [
              ["LAST", stats.last],
              ["HIGH", stats.high],
              ["LOW", stats.low],
              ["AVG", stats.avg],
              [mode === "cumulative" ? "Δ RANGE" : "TOTAL", stats.total],
            ] as const
          )
            .filter(([k]) => additive || (k !== "TOTAL" && k !== "Δ RANGE"))
            .map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-2 bg-surface px-2.5 py-1.5">
              <span className="text-fg-3">{k}</span>
              <span className="tabular text-fg">{fmtNum(v, format === "int" && k === "AVG" ? "dec" : format)}</span>
            </div>
          ))}
        </div>
      )}
      {fc.length > 0 && (
        <div className="flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-wider text-fg-3">
          {fc.map((f, fi) => (
            <span key={f.label} className="flex items-center gap-1.5">
              <svg width="18" height="4">
                <line x1="0" x2="18" y1="2" y2="2" stroke="var(--text)" strokeDasharray={fi === 0 ? "4 3" : "1 3"} />
              </svg>
              {f.label} projection · {fmtNum(f.points.at(-1)?.value ?? NaN, format)}
            </span>
          ))}
        </div>
      )}
      {compare.length > 0 && (
        <div className="flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-wider text-fg-3">
          <span className="flex items-center gap-1.5">
            <svg width="18" height="4">
              <line x1="0" x2="18" y1="2" y2="2" stroke="var(--text)" />
            </svg>
            Selected
          </span>
          {compare.map((c, ci) => (
            <span key={c.label} className="flex items-center gap-1.5">
              <svg width="18" height="4">
                <line x1="0" x2="18" y1="2" y2="2" stroke="var(--text-2)" strokeDasharray={DASHES[(ci + 1) % DASHES.length]} />
              </svg>
              {c.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
