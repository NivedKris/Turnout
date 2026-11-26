"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { NAV, withAsOf } from "./nav";

export function Rail() {
  const pathname = usePathname();
  const asOf = useSearchParams().get("asOf");
  return (
    <nav aria-label="Primary" className="flex flex-row gap-1 overflow-x-auto p-2 md:flex-col md:gap-0.5 md:overflow-visible md:px-0 md:py-4">
      {NAV.map((n) => {
        const active = n.href === "/" ? pathname === "/" || pathname.startsWith("/kpi") : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={withAsOf(n.href, asOf)}
            aria-current={active ? "page" : undefined}
            className={`group flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-[14px] md:mx-2 ${
              active ? "bg-surface-2 font-medium text-fg" : "text-fg-2 hover:bg-surface hover:text-fg"
            }`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-fg" : "bg-fg/20 group-hover:bg-fg/50"}`} aria-hidden />
            <span>{n.label}</span>
            <span className="ml-auto hidden font-mono text-[10px] text-fg-3 lg:inline">{n.code}</span>
          </Link>
        );
      })}
    </nav>
  );
}
