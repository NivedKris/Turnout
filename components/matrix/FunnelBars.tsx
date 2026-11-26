/**
 * Readable funnel: one row per stage, a proportional bar, the count, and between rows
 * the conversion with a plain-language comparison to its benchmark. The weakest step is called out.
 */
export type FunnelBarRow = { key: string; label: string; value: number | null; conversion: number | null; benchmark?: number | null; note?: string };

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);

export function FunnelBars({ rows, highlight, highlightNote }: { rows: FunnelBarRow[]; highlight?: string | null; highlightNote?: string | null }) {
  const top = Math.max(...rows.map((r) => r.value ?? 0), 1);
  return (
    <ol className="flex flex-col">
      {rows.map((r, i) => {
        const below = r.conversion !== null && r.benchmark ? r.conversion < r.benchmark : false;
        const hot = highlight === r.key;
        return (
          <li key={r.key} className="flex flex-col">
            {i > 0 && (
              <div className={`ml-[34%] flex items-center gap-2 py-1.5 text-[12px] md:ml-[180px] ${hot ? "text-fg" : "text-fg-3"}`}>
                <span aria-hidden>↓</span>
                {!(hot && highlightNote) && <span className="font-mono tabular text-fg-2">{pct(r.conversion)}</span>}
                {hot && highlightNote ? <span className="font-medium text-fg">{highlightNote}</span> : r.benchmark ? (
                  <span className={below ? "font-medium text-fg" : ""}>
                    {below ? `below the ${pct(r.benchmark)} benchmark` : `at or above ${pct(r.benchmark)} benchmark`}
                  </span>
                ) : null}
                {hot && <span className="whitespace-nowrap rounded-full bg-fg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-bg">Biggest leak</span>}
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="w-[34%] shrink-0 truncate text-[14px] text-fg-2 md:w-[168px]">{r.label}</span>
              <div className="relative h-7 flex-1 rounded-md bg-fg/[0.06]">
                <div
                  className={`absolute inset-y-0 left-0 rounded-md ${hot ? "bg-fg" : "bg-fg/70"}`}
                  style={{ width: `${r.value === null ? 0 : Math.max(1.5, (r.value / top) * 100)}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right font-mono text-[15px] tabular">{r.value === null ? "—" : r.value.toLocaleString("en-IN")}</span>
            </div>
            {r.note && <p className="ml-[34%] mt-1 text-[12px] text-fg-3 md:ml-[180px]">{r.note}</p>}
          </li>
        );
      })}
    </ol>
  );
}

/** Where a value sits between the scale and stop lines (lower is better for cost). */
export function DecisionGauge({ value, scaleIf, stopIf, format = (n: number) => `₹${Math.round(n)}` }: { value: number | null; scaleIf: number; stopIf: number; format?: (n: number) => string }) {
  const max = Math.max(stopIf * 1.6, value ?? 0, 1);
  const at = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
  return (
    <div className="flex flex-col gap-2" aria-label={`Value ${value === null ? "n/a" : format(value)}; scale at or below ${format(scaleIf)}, stop at or above ${format(stopIf)}`}>
      <div className="relative h-3 w-full rounded-full bg-fg/10">
        <div className="absolute inset-y-0 left-0 rounded-l-full bg-fg/25" style={{ width: at(scaleIf) }} />
        <div className="absolute inset-y-0 right-0 rounded-r-full bg-fg/10 [background-image:repeating-linear-gradient(45deg,transparent,transparent_4px,color-mix(in_srgb,var(--text)_18%,transparent)_4px,color-mix(in_srgb,var(--text)_18%,transparent)_6px)]" style={{ left: at(stopIf) }} />
        {value !== null && <div className="absolute -top-1.5 h-6 w-1 -translate-x-1/2 rounded bg-fg" style={{ left: at(value) }} />}
      </div>
      <div className="relative h-4 text-[11px] text-fg-3">
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: at(scaleIf) }}>
          scale ≤ {format(scaleIf)}
        </span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: at(stopIf) }}>
          stop ≥ {format(stopIf)}
        </span>
      </div>
    </div>
  );
}
