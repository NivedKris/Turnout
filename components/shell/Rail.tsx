"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { NAV, withAsOf } from "./nav";

export function Rail() {
  const pathname = usePathname();
  const asOf = useSearchParams().get("asOf");
  return (
    <nav aria-label="Primary" className="flex flex-row gap-1 overflow-x-auto p-2 md:flex-col md:gap-0.5 md:overflow-visible md:px-0 md:py-4">
      {NAV.map((n, i) => {
        const header = i === 0 || NAV[i - 1]!.group !== n.group;
        const active = n.href === "/" ? pathname === "/" || pathname.startsWith("/kpi") : pathname.startsWith(n.href);
        return (
          <div key={n.href} className="contents">
          {header && <p className="hidden px-5 pb-1 pt-4 text-[11px] font-medium uppercase tracking-[0.16em] text-fg-3 first:pt-0 md:block">{n.group}</p>}
          <Link
            href={withAsOf(n.href, asOf)}
            aria-current={active ? "page" : undefined}
            className={`group flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-[14px] md:mx-2 ${
              active ? "bg-surface-2 font-medium text-fg" : "text-fg-2 hover:bg-surface hover:text-fg"
            }`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-fg" : "bg-fg/20 group-hover:bg-fg/50"}`} aria-hidden />
            <span>{n.label}</span>
            {n.href === "/terminal" ? (
              <span className="ml-auto rounded-[3px] bg-fg px-1 py-px font-mono text-[9px] font-bold tracking-wider text-bg">AI</span>
            ) : (
              <span className="ml-auto hidden font-mono text-[10px] text-fg-3 lg:inline">{n.code}</span>
            )}
          </Link>
          </div>
        );
      })}
    </nav>
  );
}
