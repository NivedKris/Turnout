"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { NAV, withAsOf } from "./nav";

export function Rail() {
  const pathname = usePathname();
  const asOf = useSearchParams().get("asOf");
  return (
    <nav aria-label="Primary" className="flex flex-row gap-px overflow-x-auto border-line md:flex-col md:gap-0 md:overflow-visible">
      {NAV.map((n) => {
        const active = n.href === "/" ? pathname === "/" || pathname.startsWith("/kpi") : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={withAsOf(n.href, asOf)}
            aria-current={active ? "page" : undefined}
            className={`group flex shrink-0 items-center gap-2 border-l-2 px-3 py-2 font-mono text-[11px] tracking-wider md:py-2.5 ${
              active ? "border-fg bg-surface-2 text-fg" : "border-transparent text-fg-3 hover:text-fg"
            }`}
          >
            <span className="hidden w-5 text-[9px] text-fg-3 md:inline">{n.key}</span>
            <span className="font-bold">{n.code}</span>
            <span className="hidden text-fg-2 lg:inline">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
