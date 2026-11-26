"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { withAsOf } from "./nav";

/** Always-visible header entry to the copilot terminal. */
export function TerminalLink() {
  const asOf = useSearchParams().get("asOf");
  const active = usePathname().startsWith("/terminal");
  return (
    <Link
      data-tour="terminal"
      href={withAsOf("/terminal", asOf)}
      aria-current={active ? "page" : undefined}
      title="Copilot terminal: answers with their execution trace"
      className={`group flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
        active ? "border-fg bg-fg text-bg" : "border-fg/60 text-fg hover:bg-fg hover:text-bg"
      }`}
    >
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className="absolute inset-0 animate-ping rounded-full bg-[#22c55e] opacity-60" />
        <span className="relative h-2 w-2 rounded-full bg-[#22c55e]" />
      </span>
      <span className="hidden sm:inline">Copilot terminal</span>
      <span className="sm:hidden">TERM</span>
      <kbd className="hidden rounded-[3px] border border-current px-1 text-[9px] opacity-70 lg:inline">⌘I chat</kbd>
    </Link>
  );
}
