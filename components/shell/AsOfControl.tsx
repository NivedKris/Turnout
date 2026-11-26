"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { addDays, daysBetween } from "@/lib/time";

const label = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase();

/**
 * Global time machine. Every view and the copilot compute "as of the end of this IST day".
 * The date lives in the URL (?asOf=), so any view is shareable and reproducible.
 */
export function AsOfControl({
  asOf,
  min,
  max,
  presets,
}: {
  asOf: string;
  min: string;
  max: string;
  presets: { day: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const total = daysBetween(min, max);
  const [i, setI] = useState(daysBetween(min, asOf));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follow URL changes
    setI(daysBetween(min, asOf));
  }, [asOf, min]);

  const go = (day: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("asOf", day);
    start(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
  };
  const day = addDays(min, Math.max(0, Math.min(total, i)));

  return (
    <div className="flex min-w-0 items-center gap-3 font-mono text-[11px]">
      <span className="hidden text-fg-3 sm:inline">AS OF</span>
      <span className="whitespace-nowrap bg-fg px-1.5 py-px font-bold tracking-wider text-bg tabular" aria-live="polite">
        {label(day)} · 23:59 IST
      </span>
      <input
        type="range"
        min={0}
        max={total}
        value={i}
        onChange={(e) => setI(Number(e.target.value))}
        onMouseUp={() => go(day)}
        onTouchEnd={() => go(day)}
        onKeyUp={(e) => ["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(e.key) && go(day)}
        aria-label="As-of date"
        aria-valuetext={label(day)}
        className="tn-range hidden w-40 md:block lg:w-56"
      />
      <select
        aria-label="Jump to a key date"
        value={presets.some((p) => p.day === asOf) ? asOf : ""}
        onChange={(e) => e.target.value && go(e.target.value)}
        className="border border-line bg-bg px-1.5 py-1 text-fg-2"
      >
        <option value="">Jump…</option>
        {presets.map((p) => (
          <option key={p.day} value={p.day}>
            {p.label} · {label(p.day)}
          </option>
        ))}
      </select>
      {pending && <span className="animate-pulse text-fg-2">RECALC…</span>}
    </div>
  );
}
