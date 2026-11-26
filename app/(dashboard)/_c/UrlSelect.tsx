"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/** A <select> bound to one URL search param (keeps the others, e.g. asOf). */
export function UrlSelect({ param, value, options, label }: { param: string; value: string; options: { value: string; label: string }[]; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 font-mono text-[11px] text-fg-3">
      <span className="uppercase tracking-wider">{label}</span>
      <select
        value={value}
        onChange={(e) => {
          const p = new URLSearchParams(params.toString());
          if (e.target.value) p.set(param, e.target.value);
          else p.delete(param);
          start(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
        }}
        className="border border-line bg-bg px-1.5 py-1 text-fg"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {pending && <span className="animate-pulse">…</span>}
    </label>
  );
}
