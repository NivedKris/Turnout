"use client";

import { DateField } from "@/components/ui/form";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, type ReactNode } from "react";

const label = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * The one place to change what you're looking at. Always visible under the page title:
 * a labelled "Viewing as of" control with key-date presets, plus optional extra filters.
 */
export function FilterBar({
  asOf,
  min,
  max,
  presets,
  children,
}: {
  asOf: string;
  min: string;
  max: string;
  presets: { day: string; label: string }[];
  children?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    start(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
  };
  const isDefault = !params.get("asOf") && [...params.keys()].length === 0;

  return (
    <div data-tour="asof" className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 md:flex-row md:flex-wrap md:items-center md:gap-3" role="region" aria-label="Filters">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-fg-2">Viewing as of</span>
        <div className="order-last -mx-4 flex w-[calc(100%+2rem)] gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:order-none md:mx-0 md:w-auto md:flex-wrap md:overflow-visible md:px-0" role="group" aria-label="Key dates">
          {presets.map((p) => {
            const on = p.day === asOf;
            return (
              <button
                key={p.day}
                onClick={() => set("asOf", p.day)}
                aria-pressed={on}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[12px] transition-colors ${on ? "border-fg bg-fg text-bg" : "border-line text-fg-2 hover:border-fg-2 hover:text-fg"}`}
                title={label(p.day)}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <label className="ml-auto flex items-center gap-2 text-[12px] text-fg-3 md:ml-0">
          <span className="sr-only">Custom date</span>
          <DateField
            aria-label="Viewing as of"
            min={min}
            max={max}
            value={asOf}
            onChange={(v) => v && set("asOf", v)}
            className="!w-auto rounded-full px-3 py-1 text-[12px]"
          />
        </label>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 md:border-l md:border-line md:pl-4">{children}</div>}
      <div className="flex items-center gap-3 md:ml-auto">
        {pending && <span className="text-[12px] text-fg-3">Updating…</span>}
        {!isDefault && (
          <button onClick={() => start(() => router.push(pathname, { scroll: false }))} className="text-[12px] text-fg-3 underline underline-offset-4 hover:text-fg">
            Reset filters
          </button>
        )}
      </div>
    </div>
  );
}

/** Labelled pill group bound to a URL param (e.g. campaign). */
export function PillFilter({ param, label: title, value, options }: { param: string; label: string; value: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] font-medium text-fg-2">{title}</span>
      <div className="flex flex-wrap gap-1" role="group" aria-label={title}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value || "all"}
              aria-pressed={on}
              onClick={() => {
                const p = new URLSearchParams(params.toString());
                if (o.value) p.set(param, o.value);
                else p.delete(param);
                start(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
              }}
              className={`rounded-full border px-3 py-1 text-[12px] ${on ? "border-fg bg-fg text-bg" : "border-line text-fg-2 hover:border-fg-2 hover:text-fg"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
